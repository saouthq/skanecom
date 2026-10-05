-- =====================================================================
-- LES NOTES DE SUIVI ET LES ANNONCES AUX COMMERÇANTS
--
-- Notes : ce que SkanEcom retient d'une boutique (« appelé le 12/10, veut
-- le retrait en magasin »), visibles de la seule console. Une note
-- épinglée reste en tête.
--
-- Annonces : un message de SkanEcom aux équipes des boutiques (une
-- nouveauté, une maintenance prévue), en bandeau dans leur back-office,
-- sur une période, pour toutes les boutiques ou quelques-unes. Chacun la
-- ferme pour soi.
-- =====================================================================

create table plateforme.notes_boutique (
  id          bigint generated always as identity primary key,
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  auteur      uuid references auth.users (id) on delete set null,
  texte       text not null check (length(btrim(texte)) between 1 and 2000),
  epinglee    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notes_boutique_par_boutique on plateforme.notes_boutique (boutique_id, epinglee desc, created_at desc);
alter table plateforme.notes_boutique enable row level security;

create table plateforme.annonces (
  id         bigint generated always as identity primary key,
  titre      text not null check (length(btrim(titre)) between 2 and 80),
  texte      text not null check (length(btrim(texte)) between 2 and 400),
  niveau     text not null default 'info' check (niveau in ('info', 'nouveaute', 'maintenance')),
  lien       text check (lien is null or lien ~ '^(https://|/)[^\s]{1,300}$'),
  debut      timestamptz not null default now(),
  fin        timestamptz,
  -- Les boutiques visées ; NULL : toutes.
  cible      uuid[],
  auteur     uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint annonces_periode check (fin is null or fin > debut)
);
alter table plateforme.annonces enable row level security;

create table plateforme.annonces_fermees (
  annonce_id bigint not null references plateforme.annonces (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  fermee_le  timestamptz not null default now(),
  primary key (annonce_id, user_id)
);
alter table plateforme.annonces_fermees enable row level security;


-- ---------------------------------------------------------------------
-- Les notes (console)
-- ---------------------------------------------------------------------
create function public.console_notes(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id, 'texte', n.texte, 'epinglee', n.epinglee, 'le', n.created_at,
             'auteur', (select u.email from auth.users u where u.id = n.auteur), 'vous', n.auteur = p_acteur)
           order by n.epinglee desc, n.created_at desc)
      from plateforme.notes_boutique n where n.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

create function public.console_ajouter_note(p_acteur uuid, p_boutique_id uuid, p_texte text, p_epinglee boolean default false)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if length(btrim(coalesce(p_texte, ''))) = 0 then
    raise exception 'Une note vide ne se garde pas' using errcode = 'check_violation', hint = 'texte';
  end if;
  insert into plateforme.notes_boutique (boutique_id, auteur, texte, epinglee)
  values (p_boutique_id, p_acteur, btrim(p_texte), coalesce(p_epinglee, false))
  returning id into v_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'note.ajouter', v_id::text, null, null);
  return v_id;
end;
$$;

create function public.console_changer_note(p_acteur uuid, p_note_id bigint, p_geste text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role plateforme.role_administrateur;
  n      plateforme.notes_boutique;
begin
  v_role := private.console_exige_admin(p_acteur);
  select * into n from plateforme.notes_boutique x where x.id = p_note_id for update;
  if not found then
    raise exception 'Note introuvable' using errcode = 'no_data_found';
  end if;
  case p_geste
    when 'epingler' then update plateforme.notes_boutique set epinglee = true where id = p_note_id;
    when 'detacher' then update plateforme.notes_boutique set epinglee = false where id = p_note_id;
    when 'supprimer' then
      if n.auteur is distinct from p_acteur and v_role <> 'super_admin' then
        raise exception 'Seul son auteur, ou un super-administrateur, retire une note' using errcode = 'insufficient_privilege';
      end if;
      delete from plateforme.notes_boutique where id = p_note_id;
    else
      raise exception 'Geste inconnu « % »', p_geste using errcode = 'check_violation';
  end case;
  perform private.console_trace(p_acteur, n.boutique_id, 'note.' || p_geste, p_note_id::text, null, null);
end;
$$;


-- ---------------------------------------------------------------------
-- Les annonces (console)
-- ---------------------------------------------------------------------
create function public.console_annonces(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'titre', a.titre, 'texte', a.texte, 'niveau', a.niveau, 'lien', a.lien,
             'debut', a.debut, 'fin', a.fin,
             'etat', case when a.debut > now() then 'prevue' when a.fin is not null and a.fin <= now() then 'finie' else 'en_cours' end,
             'cible', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom) order by b.nom)
                                  from plateforme.boutiques b where b.id = any (a.cible)), 'null'::jsonb),
             'fermee_par', (select count(*) from plateforme.annonces_fermees f where f.annonce_id = a.id),
             'auteur', (select u.email from auth.users u where u.id = a.auteur))
           order by (a.fin is not null and a.fin <= now()), a.debut desc)
      from plateforme.annonces a), '[]'::jsonb);
end;
$$;

create function public.console_publier_annonce(
  p_acteur uuid, p_titre text, p_texte text, p_niveau text, p_lien text, p_debut timestamptz, p_fin timestamptz, p_cible uuid[]
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_cible uuid[] := case when p_cible is null or cardinality(p_cible) = 0 then null else p_cible end;
begin
  perform private.console_exige_admin(p_acteur);
  if v_cible is not null and exists (select 1 from unnest(v_cible) c where not exists (select 1 from plateforme.boutiques b where b.id = c)) then
    raise exception 'Une boutique visée n''existe pas' using errcode = 'no_data_found';
  end if;
  insert into plateforme.annonces (titre, texte, niveau, lien, debut, fin, cible, auteur)
  values (btrim(p_titre), btrim(p_texte), coalesce(nullif(p_niveau, ''), 'info'), nullif(btrim(coalesce(p_lien, '')), ''),
          coalesce(p_debut, now()), p_fin, v_cible, p_acteur)
  returning id into v_id;
  perform private.console_trace(p_acteur, null, 'annonce.publier', v_id::text, null,
    jsonb_build_object('titre', btrim(p_titre), 'boutiques', coalesce(cardinality(v_cible), 0)));
  return v_id;
end;
$$;

create function public.console_arreter_annonce(p_acteur uuid, p_annonce_id bigint, p_supprimer boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if p_supprimer then
    delete from plateforme.annonces where id = p_annonce_id;
  else
    update plateforme.annonces set fin = greatest(now(), debut + interval '1 second') where id = p_annonce_id and (fin is null or fin > now());
  end if;
  if not found and p_supprimer then
    raise exception 'Annonce introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, null, case when p_supprimer then 'annonce.supprimer' else 'annonce.arreter' end, p_annonce_id::text, null, null);
end;
$$;


-- ---------------------------------------------------------------------
-- Les annonces (back-office) : celles du moment, que l'on n'a pas fermées
-- ---------------------------------------------------------------------
create function public.gestion_annonces(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'titre', a.titre, 'texte', a.texte, 'niveau', a.niveau, 'lien', a.lien)
           order by case a.niveau when 'maintenance' then 0 when 'nouveaute' then 1 else 2 end, a.debut desc)
      from plateforme.annonces a
     where a.debut <= now() and (a.fin is null or a.fin > now())
       and (a.cible is null or p_boutique_id = any (a.cible))
       and not exists (select 1 from plateforme.annonces_fermees f where f.annonce_id = a.id and f.user_id = auth.uid())), '[]'::jsonb);
end;
$$;

create function public.gestion_fermer_annonce(p_boutique_id uuid, p_annonce_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  if not exists (select 1 from plateforme.annonces a where a.id = p_annonce_id and (a.cible is null or p_boutique_id = any (a.cible))) then
    raise exception 'Annonce introuvable' using errcode = 'no_data_found';
  end if;
  insert into plateforme.annonces_fermees (annonce_id, user_id) values (p_annonce_id, auth.uid())
  on conflict do nothing;
end;
$$;

revoke execute on function public.console_notes(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.console_ajouter_note(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.console_changer_note(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.console_annonces(uuid) from public, anon, authenticated;
revoke execute on function public.console_publier_annonce(uuid, text, text, text, text, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
revoke execute on function public.console_arreter_annonce(uuid, bigint, boolean) from public, anon, authenticated;
grant  execute on function public.console_notes(uuid, uuid) to service_role;
grant  execute on function public.console_ajouter_note(uuid, uuid, text, boolean) to service_role;
grant  execute on function public.console_changer_note(uuid, bigint, text) to service_role;
grant  execute on function public.console_annonces(uuid) to service_role;
grant  execute on function public.console_publier_annonce(uuid, text, text, text, text, timestamptz, timestamptz, uuid[]) to service_role;
grant  execute on function public.console_arreter_annonce(uuid, bigint, boolean) to service_role;
revoke execute on function public.gestion_annonces(uuid) from public, anon;
revoke execute on function public.gestion_fermer_annonce(uuid, bigint) from public, anon;
grant  execute on function public.gestion_annonces(uuid) to authenticated;
grant  execute on function public.gestion_fermer_annonce(uuid, bigint) to authenticated;
