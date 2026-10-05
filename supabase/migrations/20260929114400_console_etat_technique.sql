-- =====================================================================
-- LA CONSOLE, LOT E — l'état technique
--
-- Une page dit ce qui fait tourner la plateforme : la base (sa taille,
-- ses connexions), les e-mails (ce qui part, ce qui casse, la file des
-- e-mails de commande), SkanFact (les connexions des commerçants, les
-- envois qui attendent ou sont refusés, les clés à couper), les domaines
-- et leurs certificats. La configuration (secrets posés ou non) est lue
-- par l'application ; ici, seulement ce que la base sait.
--
-- Les certificats : rien ne les vérifiait (statut_certificat restait « en
-- attente »). La console les vérifie désormais pour de vrai — une requête
-- HTTPS vers chaque domaine — et note le résultat ici, avec l'heure et la
-- phrase de l'erreur.
-- =====================================================================

alter table plateforme.domaines
  add column certificat_verifie_le timestamptz,
  add column certificat_erreur     text check (char_length(certificat_erreur) <= 300);

create function public.console_etat_technique(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_migration text;
begin
  perform private.console_exige_admin(p_acteur);
  -- La dernière migration appliquée (Supabase la note ; la base locale, non).
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into v_migration;
  end if;

  return jsonb_build_object(
    'base', jsonb_build_object(
      'taille', pg_database_size(current_database()),
      'version', split_part(current_setting('server_version'), ' ', 1),
      'migration', v_migration,
      'connexions', (select count(*) from pg_stat_activity where datname = current_database()),
      'connexions_max', current_setting('max_connections')::integer),
    'envois', jsonb_build_object(
      'partis', (select count(*) from plateforme.envois e where e.ok and e.le >= now() - interval '7 days'),
      'refuses', (select count(*) from plateforme.envois e where not e.ok and e.le >= now() - interval '7 days'),
      'dernier_parti', (select max(e.le) from plateforme.envois e where e.ok),
      'dernier_refus', (select jsonb_build_object('le', e.le, 'sujet', e.sujet, 'fournisseur', e.fournisseur, 'raison', e.raison)
                          from plateforme.envois e where not e.ok order by e.id desc limit 1)),
    'courriels_commandes', jsonb_build_object(
      'a_envoyer', (select count(*) from public.courriels_commandes c where c.etat = 'a_envoyer'),
      'en_retard', (select count(*) from public.courriels_commandes c where c.etat = 'a_envoyer' and c.essais > 0),
      'refuses', (select count(*) from public.courriels_commandes c where c.etat = 'refuse' and c.fait_le >= now() - interval '7 days'),
      'sans_adresse', (select count(*) from public.courriels_commandes c where c.etat = 'sans_adresse' and c.fait_le >= now() - interval '7 days'),
      'plus_ancien', (select min(c.cree_le) from public.courriels_commandes c where c.etat = 'a_envoyer'),
      'derniere_erreur', (select c.erreur from public.courriels_commandes c where c.erreur is not null order by c.id desc limit 1)),
    'skanfact', jsonb_build_object(
      'connectees', (select count(*) from plateforme.skanfact_connexions s where s.etat = 'connectee'),
      'coupees', (select count(*) from plateforme.skanfact_connexions s where s.etat = 'coupee'),
      'a_envoyer', (select count(*) from public.skanfact_envois s where s.etat = 'a_envoyer'),
      'en_retard', (select count(*) from public.skanfact_envois s where s.etat = 'a_envoyer' and s.essais > 0),
      'refuses', (select count(*) from public.skanfact_envois s where s.etat = 'refuse'),
      'plus_ancien', (select min(s.cree_le) from public.skanfact_envois s where s.etat = 'a_envoyer'),
      'coupures', (select count(*) from plateforme.skanfact_coupures k),
      'coupures_en_retard', (select count(*) from plateforme.skanfact_coupures k where k.essais > 0),
      -- Les boutiques dont un envoi est refusé (à corriger par le commerçant).
      'boutiques_refus', coalesce((
        select jsonb_agg(jsonb_build_object('slug', b.slug, 'nom', b.nom, 'n', x.n) order by x.n desc, b.nom)
          from (select s.boutique_id, count(*) as n from public.skanfact_envois s where s.etat = 'refuse' group by s.boutique_id) x
          join plateforme.boutiques b on b.id = x.boutique_id), '[]'::jsonb)),
    'domaines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hote', d.hote, 'type', d.type, 'principal', d.principal, 'statut', d.statut_certificat,
               'verifie_le', d.certificat_verifie_le, 'erreur', d.certificat_erreur,
               'boutique', jsonb_build_object('slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'demonstration', b.demonstration))
             order by case d.statut_certificat when 'erreur' then 0 when 'en_attente' then 1 else 2 end, b.nom, d.principal desc, d.hote)
        from plateforme.domaines d join plateforme.boutiques b on b.id = d.boutique_id
       where b.statut <> 'fermee'), '[]'::jsonb),
    'le', now()
  );
end;
$$;

-- Le résultat de la vérification des certificats, faite par l'application :
-- [{ "hote": …, "statut": "actif" | "erreur", "erreur": … }]. Un hôte inconnu est ignoré.
create function public.console_noter_certificats(p_acteur uuid, p_resultats jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n      integer := 0;
  v_actifs integer := 0;
  v_r      jsonb;
  v_statut text;
begin
  perform private.console_exige_admin(p_acteur);
  if jsonb_typeof(p_resultats) is distinct from 'array' then
    raise exception 'Résultats attendus en liste' using errcode = '22023', hint = 'resultats';
  end if;
  for v_r in select * from jsonb_array_elements(p_resultats) loop
    v_statut := v_r ->> 'statut';
    if v_statut not in ('actif', 'erreur') then
      continue;
    end if;
    update plateforme.domaines d
       set statut_certificat = v_statut,
           certificat_verifie_le = now(),
           certificat_erreur = case when v_statut = 'erreur' then left(nullif(btrim(coalesce(v_r ->> 'erreur', '')), ''), 300) end
     where d.hote = lower(btrim(coalesce(v_r ->> 'hote', '')));
    if found then
      v_n := v_n + 1;
      if v_statut = 'actif' then
        v_actifs := v_actifs + 1;
      end if;
    end if;
  end loop;
  if v_n > 0 then
    perform private.console_trace(p_acteur, null, 'domaine.certificats_verifies', null, null,
      jsonb_build_object('verifies', v_n, 'actifs', v_actifs, 'en_erreur', v_n - v_actifs));
  end if;
  return v_n;
end;
$$;

revoke execute on function public.console_etat_technique(uuid) from public, anon, authenticated;
revoke execute on function public.console_noter_certificats(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.console_etat_technique(uuid) to service_role;
grant  execute on function public.console_noter_certificats(uuid, jsonb) to service_role;
