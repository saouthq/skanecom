-- =====================================================================
-- LA DOUBLE AUTHENTIFICATION, FACULTATIVE PAR DÉFAUT (demande de Skander)
--
-- Elle était obligatoire pour l'équipe SkanEcom et pour les propriétaires
-- et administrateurs d'une boutique. Elle devient un RÉGLAGE, coupé par
-- défaut (« un doute → un réglage ») :
--   · pour l'équipe SkanEcom, un réglage de la plateforme
--     (plateforme.reglages_plateforme, « double_auth.obligatoire ») ;
--   · pour une boutique, le sien (plateforme.boutiques.double_auth_obligatoire),
--     que son propriétaire règle.
-- Coupé, elle est proposée à la connexion (« Plus tard » la reporte), et
-- s'active quand on veut depuis « Mon compte ». Ce qui ne change pas : qui
-- a enregistré une application doit toujours en donner le code (sinon un
-- mot de passe volé suffirait) — c'est le serveur qui le vérifie
-- (lib/console/session.ts), et la base pour l'accès support.
-- =====================================================================

create table plateforme.reglages_plateforme (
  cle         text primary key check (cle ~ '^[a-z_]+(\.[a-z_]+)*$'),
  valeur      jsonb not null,
  modifie_le  timestamptz not null default now(),
  modifie_par uuid references auth.users (id) on delete set null
);
alter table plateforme.reglages_plateforme enable row level security;

-- La plateforme exige-t-elle la double authentification de son équipe ? (absent : non)
create function private.double_auth_exigee_plateforme()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.valeur = 'true'::jsonb from plateforme.reglages_plateforme r where r.cle = 'double_auth.obligatoire'), false)
$$;
revoke execute on function private.double_auth_exigee_plateforme() from public, anon, authenticated;

alter table plateforme.boutiques add column double_auth_obligatoire boolean not null default false;

-- Le compte a-t-il une application enregistrée (un facteur validé) ?
create function private.a_double_auth(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
$$;
revoke execute on function private.a_double_auth(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- La console : lire et régler celle de l'équipe SkanEcom
-- ---------------------------------------------------------------------
create function public.console_double_auth_exigee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.double_auth_exigee_plateforme() $$;
revoke execute on function public.console_double_auth_exigee() from public, anon, authenticated;
grant  execute on function public.console_double_auth_exigee() to service_role;

create function public.console_exiger_double_auth(p_acteur uuid, p_obligatoire boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant boolean := private.double_auth_exigee_plateforme();
begin
  perform private.console_exige_super_admin(p_acteur);
  if v_avant = coalesce(p_obligatoire, false) then
    return;
  end if;
  insert into plateforme.reglages_plateforme (cle, valeur, modifie_par)
  values ('double_auth.obligatoire', to_jsonb(coalesce(p_obligatoire, false)), p_acteur)
  on conflict (cle) do update set valeur = excluded.valeur, modifie_le = now(), modifie_par = p_acteur;
  perform private.console_trace(p_acteur, null, 'administrateur.double_auth_exigee', null,
    jsonb_build_object('obligatoire', v_avant), jsonb_build_object('obligatoire', coalesce(p_obligatoire, false)));
end;
$$;
revoke execute on function public.console_exiger_double_auth(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.console_exiger_double_auth(uuid, boolean) to service_role;


-- ---------------------------------------------------------------------
-- Une boutique : son propriétaire la règle pour les propriétaires et
-- administrateurs de son équipe
-- ---------------------------------------------------------------------
create function public.gestion_double_auth(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('obligatoire', b.double_auth_obligatoire)
    from plateforme.boutiques b
   where b.id = p_boutique_id and private.est_membre(b.id, array['proprietaire', 'admin'])
$$;
revoke execute on function public.gestion_double_auth(uuid) from public, anon;
grant  execute on function public.gestion_double_auth(uuid) to authenticated;

create function public.gestion_exiger_double_auth(p_boutique_id uuid, p_obligatoire boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant boolean;
begin
  if not private.est_membre(p_boutique_id, array['proprietaire']) then
    raise exception 'Seul le propriétaire règle la double authentification de son équipe' using errcode = 'insufficient_privilege';
  end if;
  select b.double_auth_obligatoire into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if v_avant = coalesce(p_obligatoire, false) then
    return;
  end if;
  -- L'exiger, c'est d'abord l'avoir : un propriétaire sans application
  -- s'enfermerait dehors (il l'enregistre d'abord, depuis « Mon compte »).
  if coalesce(p_obligatoire, false) and not private.a_double_auth(auth.uid()) then
    raise exception 'Activez d''abord la vôtre, depuis « Mon compte »' using errcode = 'check_violation', hint = 'la_votre';
  end if;
  update plateforme.boutiques set double_auth_obligatoire = coalesce(p_obligatoire, false) where id = p_boutique_id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'boutique.double_auth_exigee', null,
    jsonb_build_object('obligatoire', v_avant), jsonb_build_object('obligatoire', coalesce(p_obligatoire, false)));
end;
$$;
revoke execute on function public.gestion_exiger_double_auth(uuid, boolean) from public, anon;
grant  execute on function public.gestion_exiger_double_auth(uuid, boolean) to authenticated;

-- Pour la porte du backoffice : la personne connectée est-elle tenue de
-- l'avoir ? (propriétaire ou administrateur d'une boutique qui l'exige ;
-- ou administrateur de la plateforme, si la plateforme l'exige).
create function public.double_auth_exigee_pour_moi()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from plateforme.membres m join plateforme.boutiques b on b.id = m.boutique_id
            where m.user_id = auth.uid() and m.actif and m.role in ('proprietaire', 'admin') and b.double_auth_obligatoire)
      or (private.double_auth_exigee_plateforme()
          and exists (select 1 from plateforme.administrateurs a where a.user_id = auth.uid()))
$$;
revoke execute on function public.double_auth_exigee_pour_moi() from public, anon;
grant  execute on function public.double_auth_exigee_pour_moi() to authenticated;


-- ---------------------------------------------------------------------
-- L'accès support : en double authentification, ou — quand la plateforme
-- ne l'exige pas — sans, pour qui n'a pas enregistré d'application. Qui en
-- a une entre toujours avec son code (une session aal1 ne suffit pas).
-- ---------------------------------------------------------------------
create or replace function private.supports_ouverts()
returns table (boutique_id uuid, role text, expire_le timestamptz, motif text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.boutique_id, s.role::text, s.expire_le, s.motif
    from plateforme.acces_support s
   where s.user_id = auth.uid()
     and s.ferme_le is null
     and s.expire_le > now()
     and (coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          or (not private.double_auth_exigee_plateforme() and not private.a_double_auth(auth.uid())))
     and exists (select 1 from plateforme.administrateurs a where a.user_id = s.user_id);
$$;
