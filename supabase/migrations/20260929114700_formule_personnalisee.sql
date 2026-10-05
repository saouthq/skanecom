-- =====================================================================
-- LA FORMULE PERSONNALISÉE D'UNE BOUTIQUE (demande de Skander, 05/10 :
-- « pour la formule sur mesure, on ne peut pas rectifier après l'avoir
-- créée — personnaliser, ajouter des choses »)
--
--   · une boutique part de sa formule (ou de « sur mesure » : tout ouvert)
--     et SkanEcom lui ajoute ou lui retire des droits, un par un
--     (plateforme.droits_boutique : l'exception l'emporte sur la formule) ;
--   · elle peut avoir son propre prix (vide : celui de sa formule) — les
--     revenus le comptent ;
--   · tout passe par private.droit : la vitrine, le back-office, les
--     modules et les réglages suivent sans rien changer d'autre. Un module
--     retiré se coupe ; une fonction retirée s'éteint sur la vitrine (le
--     réglage du commerçant est gardé).
-- Super-administrateur seulement, tracé au journal.
-- =====================================================================

create table plateforme.droits_boutique (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  droit       text not null references plateforme.droits (code) on delete cascade,
  -- true : ouvert en plus de la formule ; false : retiré de la formule.
  accorde     boolean not null,
  modifie_le  timestamptz not null default now(),
  modifie_par uuid references auth.users (id) on delete set null,
  primary key (boutique_id, droit)
);
alter table plateforme.droits_boutique enable row level security;

comment on table plateforme.droits_boutique is
  'Les exceptions d''une boutique à sa formule : un droit ouvert en plus (accorde) ou retiré (non accorde).';

alter table plateforme.boutiques
  add column prix_mensuel_millimes integer check (prix_mensuel_millimes is null or prix_mensuel_millimes between 0 and 100000000);
comment on column plateforme.boutiques.prix_mensuel_millimes is
  'Le prix de cette boutique, s''il diffère de celui de sa formule (ou pour une boutique sur mesure). NULL : celui de la formule.';

/** Un droit d'une boutique : son exception d'abord, sinon sa formule (sans
 *  formule, tout est ouvert) ; un droit inconnu est ouvert. */
create or replace function private.droit(p_boutique_id uuid, p_droit text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when not exists (select 1 from plateforme.droits d where d.code = p_droit) then true
      else coalesce(
        (select x.accorde from plateforme.droits_boutique x where x.boutique_id = b.id and x.droit = p_droit),
        b.formule is null or exists (select 1 from plateforme.formule_droits fd where fd.formule = b.formule and fd.droit = p_droit))
    end
      from plateforme.boutiques b where b.id = p_boutique_id), true);
$$;


/** Un écart devenu égal à la formule (la boutique change de formule, ou la
 *  formule change ses droits) n'en est plus un : il s'efface. */
create function private.ecarts_apres_formule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'boutiques' then
    delete from plateforme.droits_boutique x
     where x.boutique_id = new.id
       and x.accorde = (new.formule is null or exists (select 1 from plateforme.formule_droits fd where fd.formule = new.formule and fd.droit = x.droit));
    return new;
  end if;
  delete from plateforme.droits_boutique x
   using plateforme.boutiques b
   where b.formule = coalesce(new.formule, old.formule) and x.boutique_id = b.id and x.droit = coalesce(new.droit, old.droit)
     and x.accorde = exists (select 1 from plateforme.formule_droits fd where fd.formule = b.formule and fd.droit = x.droit);
  return null;
end;
$$;
revoke execute on function private.ecarts_apres_formule() from public, anon, authenticated;

create trigger boutiques_ecarts after update of formule on plateforme.boutiques
  for each row when (old.formule is distinct from new.formule) execute function private.ecarts_apres_formule();
create trigger formule_droits_ecarts after insert or delete on plateforme.formule_droits
  for each row execute function private.ecarts_apres_formule();


-- ---------------------------------------------------------------------
-- La console : lire, personnaliser
-- ---------------------------------------------------------------------
create function public.console_droits_boutique(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b plateforme.boutiques;
begin
  perform private.console_exige_admin(p_acteur);
  select * into b from plateforme.boutiques x where x.id = p_boutique_id;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'formule', (select jsonb_build_object('code', f.code, 'nom', f.nom, 'prix', f.prix_mensuel_millimes)
                  from plateforme.formules f where f.code = b.formule),
    'prix_boutique', b.prix_mensuel_millimes,
    'droits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'genre', d.genre, 'groupe', d.groupe, 'libelle', d.libelle_fr, 'description', d.description_fr,
               'disponible', d.module is null or (select m.disponible from plateforme.modules m where m.code = d.module),
               'dans_formule', b.formule is null or exists (select 1 from plateforme.formule_droits fd where fd.formule = b.formule and fd.droit = d.code),
               'exception', (select x.accorde from plateforme.droits_boutique x where x.boutique_id = b.id and x.droit = d.code),
               'effectif', private.droit(b.id, d.code))
             order by d.groupe, d.position, d.code)
        from plateforme.droits d), '[]'::jsonb)
  );
end;
$$;

/** Personnaliser : `p_droits`, l'ensemble voulu des droits ouverts ; la base
 *  garde seulement ce qui diffère de la formule. Rend ce qui a changé. */
create function public.console_personnaliser_formule(p_acteur uuid, p_boutique_id uuid, p_droits text[], p_prix_millimes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b          plateforme.boutiques;
  v_avant    jsonb;
  v_apres    jsonb;
  v_coupes   text[];
  v_eteintes jsonb;
  v_ajoutes  jsonb;
  v_retires  jsonb;
  v_inconnu  text;
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into b from plateforme.boutiques x where x.id = p_boutique_id for update;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'P0002';
  end if;
  select u into v_inconnu from unnest(coalesce(p_droits, '{}')) u where not exists (select 1 from plateforme.droits d where d.code = u) limit 1;
  if v_inconnu is not null then
    raise exception 'Droit inconnu « % »', v_inconnu using errcode = '22023';
  end if;
  if p_prix_millimes is not null and p_prix_millimes not between 0 and 100000000 then
    raise exception 'Un prix va de 0 à 100 000 TND par mois' using errcode = '22023';
  end if;

  v_avant := jsonb_build_object(
    'exceptions', coalesce((select jsonb_object_agg(x.droit, x.accorde) from plateforme.droits_boutique x where x.boutique_id = b.id), '{}'::jsonb),
    'prix', b.prix_mensuel_millimes);

  -- Ce qui change, par rapport à ce qui est ouvert aujourd'hui (pour le dire).
  select coalesce(jsonb_agg(d.libelle_fr order by d.libelle_fr) filter (where d.code = any (coalesce(p_droits, '{}')) and not private.droit(b.id, d.code)), '[]'::jsonb),
         coalesce(jsonb_agg(d.libelle_fr order by d.libelle_fr) filter (where not (d.code = any (coalesce(p_droits, '{}'))) and private.droit(b.id, d.code)), '[]'::jsonb)
    into v_ajoutes, v_retires
    from plateforme.droits d;

  -- Les exceptions : seulement ce qui diffère de la formule.
  delete from plateforme.droits_boutique x where x.boutique_id = b.id;
  insert into plateforme.droits_boutique (boutique_id, droit, accorde, modifie_par)
  select b.id, d.code, d.code = any (coalesce(p_droits, '{}')), p_acteur
    from plateforme.droits d
   where (d.code = any (coalesce(p_droits, '{}')))
         <> (b.formule is null or exists (select 1 from plateforme.formule_droits fd where fd.formule = b.formule and fd.droit = d.code));
  update plateforme.boutiques set prix_mensuel_millimes = p_prix_millimes where id = b.id;

  v_apres := jsonb_build_object(
    'exceptions', coalesce((select jsonb_object_agg(x.droit, x.accorde) from plateforme.droits_boutique x where x.boutique_id = b.id), '{}'::jsonb),
    'prix', p_prix_millimes);
  if v_avant = v_apres then
    return jsonb_build_object('change', false, 'ajoutes', '[]'::jsonb, 'retires', '[]'::jsonb, 'modules_coupes', '[]'::jsonb, 'fonctions_eteintes', '[]'::jsonb);
  end if;

  v_coupes := private.couper_modules_hors_formule(p_acteur, b.id);
  select coalesce(jsonb_agg(c.libelle_fr order by c.libelle_fr), '[]'::jsonb) into v_eteintes
    from public.reglages r join plateforme.reglages_catalogue c on c.cle = r.cle
   where r.boutique_id = b.id and r.valeur <> c.defaut and not private.droit(b.id, r.cle);

  perform private.console_trace(p_acteur, b.id, 'boutique.droits', null, v_avant,
    v_apres || jsonb_build_object('modules_coupes', to_jsonb(v_coupes)));
  return jsonb_build_object('change', true, 'ajoutes', v_ajoutes, 'retires', v_retires,
                            'modules_coupes', to_jsonb(v_coupes), 'fonctions_eteintes', v_eteintes,
                            'prix_change', b.prix_mensuel_millimes is distinct from p_prix_millimes, 'prix', p_prix_millimes);
end;
$$;


/** Ouvrir ou fermer un seul droit à une boutique (un module hors formule
 *  qu'on lui accorde d'un geste, depuis l'onglet Modules). */
create function public.console_ouvrir_droit(p_acteur uuid, p_boutique_id uuid, p_droit text, p_ouvert boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b        plateforme.boutiques;
  v_base   boolean;
  v_avant  boolean;
  v_coupes text[] := '{}';
begin
  perform private.console_exige_super_admin(p_acteur);
  select * into b from plateforme.boutiques x where x.id = p_boutique_id for update;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'P0002';
  end if;
  if p_ouvert is null or not exists (select 1 from plateforme.droits d where d.code = p_droit) then
    raise exception 'Droit inconnu « % »', p_droit using errcode = '22023';
  end if;
  v_avant := private.droit(b.id, p_droit);
  if v_avant = p_ouvert then
    return jsonb_build_object('change', false, 'modules_coupes', '[]'::jsonb);
  end if;
  v_base := b.formule is null or exists (select 1 from plateforme.formule_droits fd where fd.formule = b.formule and fd.droit = p_droit);
  if p_ouvert = v_base then
    delete from plateforme.droits_boutique where boutique_id = b.id and droit = p_droit;
  else
    insert into plateforme.droits_boutique (boutique_id, droit, accorde, modifie_par) values (b.id, p_droit, p_ouvert, p_acteur)
    on conflict (boutique_id, droit) do update set accorde = excluded.accorde, modifie_le = now(), modifie_par = p_acteur;
  end if;
  if not p_ouvert then
    v_coupes := private.couper_modules_hors_formule(p_acteur, b.id);
  end if;
  perform private.console_trace(p_acteur, b.id, 'boutique.droits', p_droit,
    jsonb_build_object(p_droit, v_avant), jsonb_build_object(p_droit, p_ouvert, 'modules_coupes', to_jsonb(v_coupes)));
  return jsonb_build_object('change', true, 'modules_coupes', to_jsonb(v_coupes));
end;
$$;


-- ---------------------------------------------------------------------
-- Les revenus comptent le prix de la boutique quand elle en a un
-- (le reste comme au lot E)
-- ---------------------------------------------------------------------
create or replace function public.console_revenus(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'formules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'nom', f.nom, 'prix', f.prix_mensuel_millimes,
               'actives', (select count(*) from plateforme.boutiques b where b.formule = f.code and not b.demonstration and b.statut = 'active'),
               'en_preparation', (select count(*) from plateforme.boutiques b where b.formule = f.code and not b.demonstration and b.statut = 'en_preparation'),
               'suspendues', (select count(*) from plateforme.boutiques b where b.formule = f.code and not b.demonstration and b.statut = 'suspendue'))
             order by f.position, f.nom)
        from plateforme.formules f), '[]'::jsonb),
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'formule', b.formule,
               'formule_nom', f.nom, 'prix', coalesce(b.prix_mensuel_millimes, f.prix_mensuel_millimes),
               'prix_propre', b.prix_mensuel_millimes is not null,
               'personnalisee', exists (select 1 from plateforme.droits_boutique x where x.boutique_id = b.id),
               'skanfact', case when l.boutique_id is null then null else jsonb_build_object(
                 'raison_sociale', l.raison_sociale, 'contrat', l.contrat is not null, 'lue_le', s.lue_le,
                 'reste', (select so ->> 'reste' from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1),
                 'echu', (select so ->> 'echu' from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1),
                 'retard', s.situation -> 'retard' -> 'jours',
                 'dernier_reglement', s.situation -> 'dernierReglement') end)
             order by case b.statut when 'active' then 0 when 'en_preparation' then 1 else 2 end,
                      coalesce(b.prix_mensuel_millimes, f.prix_mensuel_millimes) desc nulls last, b.nom)
        from plateforme.boutiques b
        left join plateforme.formules f on f.code = b.formule
        left join plateforme.facturation_liens l on l.boutique_id = b.id
        left join plateforme.facturation_situations s on s.boutique_id = b.id
       where not b.demonstration and b.statut <> 'fermee'), '[]'::jsonb),
    -- Ce que SkanFact a dit, additionné (en dinars, trois décimales).
    'skanfact', (
      select jsonb_build_object(
               'reliees', count(*),
               'lues', count(s.boutique_id),
               'reste', to_char(coalesce(sum((select (so ->> 'reste')::numeric from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1)), 0), 'FM999999990.000'),
               'echu', to_char(coalesce(sum((select (so ->> 'echu')::numeric from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1)), 0), 'FM999999990.000'),
               'en_retard', count(*) filter (where s.situation -> 'retard' is not null and jsonb_typeof(s.situation -> 'retard') = 'object'),
               'lue_le', min(s.lue_le))
        from plateforme.facturation_liens l
        join plateforme.boutiques b on b.id = l.boutique_id
        left join plateforme.facturation_situations s on s.boutique_id = l.boutique_id
       where b.statut <> 'fermee')
  );
end;
$$;

revoke execute on function public.console_droits_boutique(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.console_personnaliser_formule(uuid, uuid, text[], integer) from public, anon, authenticated;
revoke execute on function public.console_ouvrir_droit(uuid, uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.console_ouvrir_droit(uuid, uuid, text, boolean) to service_role;
grant  execute on function public.console_droits_boutique(uuid, uuid) to service_role;
grant  execute on function public.console_personnaliser_formule(uuid, uuid, text[], integer) to service_role;
