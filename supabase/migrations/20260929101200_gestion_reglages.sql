-- =====================================================================
-- SkanEcom — 13 · BACKOFFICE : LES RÉGLAGES DE LA BOUTIQUE (PRD §6.2 B9)
-- =====================================================================
-- « Quand t'as un doute, fais les deux et mets-le en réglage » : compte
-- obligatoire ou invité, confirmation téléphonique ou automatique, frais
-- fixes ou par zone, seuil de livraison offerte, prix barrés… Le moteur est
-- en place depuis la migration 02 (public.reglages, valeurs typées, défauts
-- du catalogue) ; il manquait l'écran de la boutique et ses gestes.
--
-- Le propriétaire et l'administrateur changent les réglages ; toute
-- l'équipe les lit. Chaque changement passe au journal d'audit (qui, quand,
-- avant, après) : « qui a ouvert la boutique aux invités ? » a une réponse.
-- Certains réglages restent à la plateforme (le préfixe des numéros de
-- commande) ; ceux d'un module n'ont d'effet — et ne se changent — que si le
-- module est actif.
-- =====================================================================

alter table plateforme.reglages_catalogue
  add column modifiable_boutique boolean not null default true;

comment on column plateforme.reglages_catalogue.modifiable_boutique is
  'true = la boutique le change depuis son backoffice. false = réglé par la plateforme (console) seulement.';

-- Changer le préfixe en cours de route casserait la suite des numéros que
-- les clients et le livreur ont en main.
update plateforme.reglages_catalogue set modifiable_boutique = false where cle = 'commande.prefixe_numero';


-- ---------------------------------------------------------------------
-- Lire : les réglages, les zones, les gouvernorats (toute l'équipe)
-- ---------------------------------------------------------------------
create function public.gestion_reglages(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'reglages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cle', c.cle, 'valeur', coalesce(r.valeur, c.defaut), 'defaut', c.defaut, 'personnalise', r.cle is not null,
               'type', c.type_valeur, 'choix', c.choix_possibles, 'groupe', c.groupe, 'module', c.module,
               'module_actif', c.module is null or exists (select 1 from plateforme.modules_actifs ma
                                                           where ma.boutique_id = p_boutique_id and ma.module = c.module and ma.actif),
               'modifiable', c.modifiable_boutique,
               'libelle', c.libelle_fr, 'description', c.description_fr,
               'modifie_le', r.updated_at, 'modifie_par', (select u.email from auth.users u where u.id = r.updated_by))
             order by c.groupe, c.position, c.cle)
        from plateforme.reglages_catalogue c
        left join public.reglages r on r.boutique_id = p_boutique_id and r.cle = c.cle), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', z.id, 'nom', coalesce(z.nom_fr, z.nom_ar), 'frais', z.frais_millimes,
               'delai_min', z.delai_jours_min, 'delai_max', z.delai_jours_max, 'actif', z.actif,
               'gouvernorats', (select count(*) from public.zones_gouvernorats zg
                                 where zg.boutique_id = p_boutique_id and zg.zone_id = z.id))
             order by z.position, z.created_at)
        from public.zones_livraison z where z.boutique_id = p_boutique_id), '[]'::jsonb),
    'gouvernorats', coalesce((
      select jsonb_agg(jsonb_build_object('code', g.code, 'nom', g.nom_fr, 'zone_id', zg.zone_id) order by g.position)
        from public.gouvernorats g
        left join public.zones_gouvernorats zg on zg.boutique_id = p_boutique_id and zg.gouvernorat_code = g.code
       where g.actif), '[]'::jsonb),
    'journal', coalesce((
      select jsonb_agg(x order by x ->> 'le' desc) from (
        select jsonb_build_object('le', ja.at, 'action', ja.action, 'cible', ja.cible, 'avant', ja.avant, 'apres', ja.apres,
                                  'auteur', (select u.email from auth.users u where u.id = ja.acteur)) as x
          from plateforme.journal_audit ja
         where ja.boutique_id = p_boutique_id and ja.action like 'reglages.%'
         order by ja.at desc limit 15) j), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Changer des réglages : { "cle": valeur, … } (propriétaire, admin)
-- ---------------------------------------------------------------------
-- Une valeur égale au défaut efface la ligne : la boutique suit alors le
-- défaut de la plateforme, comme si elle n'y avait jamais touché.
create function public.gestion_enregistrer_reglages(p_boutique_id uuid, p_valeurs jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cle   text;
  v_val   jsonb;
  v_def   plateforme.reglages_catalogue;
  v_avant jsonb;
  v_av    jsonb := '{}'::jsonb;
  v_ap    jsonb := '{}'::jsonb;
  v_n     integer := 0;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_valeurs is null or jsonb_typeof(p_valeurs) <> 'object' then
    raise exception 'Réglages illisibles' using errcode = 'check_violation', hint = 'valeurs';
  end if;
  -- Deux enregistrements simultanés de la même boutique passent l'un après l'autre.
  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;

  for v_cle, v_val in select * from jsonb_each(p_valeurs) loop
    select * into v_def from plateforme.reglages_catalogue c where c.cle = v_cle;
    if not found or not v_def.modifiable_boutique then
      raise exception 'Réglage non modifiable depuis la boutique : %', v_cle using errcode = 'check_violation', hint = 'cle';
    end if;
    if v_def.module is not null and not exists (
         select 1 from plateforme.modules_actifs ma
          where ma.boutique_id = p_boutique_id and ma.module = v_def.module and ma.actif) then
      raise exception 'Le réglage % dépend d''un module que la boutique n''a pas', v_cle using errcode = 'check_violation', hint = 'module';
    end if;
    -- Bornes de bon sens (le type, lui, est vérifié par private.valide_reglage).
    if v_def.type_valeur = 'entier' and jsonb_typeof(v_val) = 'number' and (
         (v_val #>> '{}')::numeric < 0
         or (v_cle = 'commande.max_en_attente' and (v_val #>> '{}')::numeric > 50)
         or (v_cle like '%millimes' and (v_val #>> '{}')::numeric > 100000000)) then
      raise exception 'Valeur hors limites pour %', v_def.libelle_fr using errcode = 'check_violation', hint = 'limite';
    end if;
    if v_cle in ('contact.whatsapp', 'contact.telephone') and jsonb_typeof(v_val) = 'string'
       and v_val #>> '{}' <> '' and v_val #>> '{}' !~ '^[0-9]{8,15}$' then
      raise exception 'Numéro invalide pour % : chiffres seulement, indicatif compris (exemple : 21612345678)', v_def.libelle_fr
        using errcode = 'check_violation', hint = 'numero';
    end if;

    v_avant := coalesce((select r.valeur from public.reglages r where r.boutique_id = p_boutique_id and r.cle = v_cle), v_def.defaut);
    if v_avant = v_val then
      continue;
    end if;
    if v_val = v_def.defaut then
      delete from public.reglages where boutique_id = p_boutique_id and cle = v_cle;
    else
      insert into public.reglages (boutique_id, cle, valeur) values (p_boutique_id, v_cle, v_val)
      on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
    end if;
    v_av := v_av || jsonb_build_object(v_cle, v_avant);
    v_ap := v_ap || jsonb_build_object(v_cle, v_val);
    v_n := v_n + 1;
  end loop;

  -- Au moins une façon de payer : sans elle, plus personne ne peut commander.
  if not coalesce((private.reglage(p_boutique_id, 'paiement.cod_actif'))::boolean, true)
     and not (coalesce((private.reglage(p_boutique_id, 'paiement.konnect_actif'))::boolean, false)
              and exists (select 1 from plateforme.modules_actifs ma
                           where ma.boutique_id = p_boutique_id and ma.module = 'paiement_en_ligne' and ma.actif)) then
    raise exception 'Il faut au moins un moyen de paiement : gardez le paiement à la livraison'
      using errcode = 'check_violation', hint = 'paiement';
  end if;

  if v_n > 0 then
    perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.modifier', null, v_av, v_ap);
  end if;
  return v_n;
end;
$$;


-- ---------------------------------------------------------------------
-- Les zones de livraison
-- ---------------------------------------------------------------------
create function public.gestion_enregistrer_zone(
  p_boutique_id uuid,
  p_zone_id     uuid,
  p_nom         text,
  p_frais       bigint,
  p_delai_min   integer default null,
  p_delai_max   integer default null,
  p_actif       boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom   text := nullif(btrim(coalesce(p_nom, '')), '');
  v_id    uuid;
  v_avant jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if v_nom is null or length(v_nom) > 60 then
    raise exception 'Le nom de la zone est obligatoire (60 caractères au plus)' using errcode = 'check_violation', hint = 'nom';
  end if;
  if p_frais is null or p_frais < 0 or p_frais > 100000000 then
    raise exception 'Frais de livraison invalides' using errcode = 'check_violation', hint = 'frais';
  end if;
  if (p_delai_min is not null and (p_delai_min < 0 or p_delai_min > 60))
     or (p_delai_max is not null and (p_delai_max < 0 or p_delai_max > 60))
     or (p_delai_min is not null and p_delai_max is not null and p_delai_max < p_delai_min) then
    raise exception 'Délai invalide : de 0 à 60 jours, le plus long après le plus court' using errcode = 'check_violation', hint = 'delai';
  end if;

  if p_zone_id is null then
    insert into public.zones_livraison (boutique_id, nom_fr, frais_millimes, delai_jours_min, delai_jours_max, actif, position)
    values (p_boutique_id, v_nom, p_frais, p_delai_min, p_delai_max, coalesce(p_actif, true),
            (select coalesce(max(z.position) + 1, 1) from public.zones_livraison z where z.boutique_id = p_boutique_id))
    returning id into v_id;
  else
    select jsonb_build_object('nom', coalesce(z.nom_fr, z.nom_ar), 'frais', z.frais_millimes, 'delai_min', z.delai_jours_min,
                              'delai_max', z.delai_jours_max, 'actif', z.actif)
      into v_avant
      from public.zones_livraison z where z.boutique_id = p_boutique_id and z.id = p_zone_id for update;
    if v_avant is null then
      raise exception 'Zone introuvable' using errcode = 'no_data_found', hint = 'zone';
    end if;
    update public.zones_livraison set
      nom_fr = v_nom, frais_millimes = p_frais, delai_jours_min = p_delai_min, delai_jours_max = p_delai_max,
      actif = coalesce(p_actif, true)
    where boutique_id = p_boutique_id and id = p_zone_id
    returning id into v_id;
  end if;

  perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.zone', v_nom, v_avant,
    jsonb_build_object('nom', v_nom, 'frais', p_frais, 'delai_min', p_delai_min, 'delai_max', p_delai_max, 'actif', coalesce(p_actif, true)));
  return v_id;
end;
$$;

-- Supprimer une zone : ses gouvernorats retombent sur le tarif fixe
-- (migration 02 : jamais sur zéro).
create function public.gestion_supprimer_zone(p_boutique_id uuid, p_zone_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom text;
  v_n   integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select coalesce(z.nom_fr, z.nom_ar) into v_nom from public.zones_livraison z
   where z.boutique_id = p_boutique_id and z.id = p_zone_id for update;
  if v_nom is null then
    raise exception 'Zone introuvable' using errcode = 'no_data_found', hint = 'zone';
  end if;
  select count(*) into v_n from public.zones_gouvernorats zg where zg.boutique_id = p_boutique_id and zg.zone_id = p_zone_id;
  delete from public.zones_livraison where boutique_id = p_boutique_id and id = p_zone_id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.zone_supprimee', v_nom,
    jsonb_build_object('nom', v_nom, 'gouvernorats', v_n), null);
  return v_n;
end;
$$;

-- Rattacher des gouvernorats : { "tunis": "<zone>", "sfax": null, … }
-- (null = aucune zone : le tarif fixe).
create function public.gestion_rattacher_gouvernorats(p_boutique_id uuid, p_affectations jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code  text;
  v_zone  text;
  v_avant uuid;
  v_n     integer := 0;
  v_av    jsonb := '{}'::jsonb;
  v_ap    jsonb := '{}'::jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_affectations is null or jsonb_typeof(p_affectations) <> 'object' then
    raise exception 'Affectations illisibles' using errcode = 'check_violation', hint = 'valeurs';
  end if;
  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;

  for v_code, v_zone in select key, value #>> '{}' from jsonb_each(p_affectations) loop
    if not exists (select 1 from public.gouvernorats g where g.code = v_code and g.actif) then
      raise exception 'Gouvernorat inconnu : %', v_code using errcode = 'check_violation', hint = 'gouvernorat';
    end if;
    v_zone := nullif(v_zone, '');
    if v_zone is not null and not exists (
         select 1 from public.zones_livraison z where z.boutique_id = p_boutique_id and z.id::text = v_zone) then
      raise exception 'Zone introuvable pour %', v_code using errcode = 'no_data_found', hint = 'zone';
    end if;
    select zg.zone_id into v_avant from public.zones_gouvernorats zg
     where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = v_code;
    if v_avant is not distinct from v_zone::uuid then
      continue;
    end if;
    if v_zone is null then
      delete from public.zones_gouvernorats where boutique_id = p_boutique_id and gouvernorat_code = v_code;
    else
      insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id) values (p_boutique_id, v_code, v_zone::uuid)
      on conflict (boutique_id, gouvernorat_code) do update set zone_id = excluded.zone_id;
    end if;
    v_av := v_av || jsonb_build_object(v_code, v_avant);
    v_ap := v_ap || jsonb_build_object(v_code, v_zone);
    v_n := v_n + 1;
  end loop;

  if v_n > 0 then
    perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.gouvernorats', null, v_av, v_ap);
  end if;
  return v_n;
end;
$$;


revoke execute on function public.gestion_reglages(uuid)                                                 from public, anon;
revoke execute on function public.gestion_enregistrer_reglages(uuid, jsonb)                              from public, anon;
revoke execute on function public.gestion_enregistrer_zone(uuid, uuid, text, bigint, integer, integer, boolean) from public, anon;
revoke execute on function public.gestion_supprimer_zone(uuid, uuid)                                     from public, anon;
revoke execute on function public.gestion_rattacher_gouvernorats(uuid, jsonb)                            from public, anon;
grant  execute on function public.gestion_reglages(uuid)                                                 to authenticated;
grant  execute on function public.gestion_enregistrer_reglages(uuid, jsonb)                              to authenticated;
grant  execute on function public.gestion_enregistrer_zone(uuid, uuid, text, bigint, integer, integer, boolean) to authenticated;
grant  execute on function public.gestion_supprimer_zone(uuid, uuid)                                     to authenticated;
grant  execute on function public.gestion_rattacher_gouvernorats(uuid, jsonb)                            to authenticated;
