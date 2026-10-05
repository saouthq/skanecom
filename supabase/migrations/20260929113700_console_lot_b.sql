-- =====================================================================
-- LA CONSOLE, LOT B — les accès
--
-- · « Mot de passe oublié » : la demande d'un lien se fait sans être
--   connecté ; la base en limite le rythme par adresse (une toutes les deux
--   minutes, cinq par heure), sans jamais dire si l'adresse a un compte.
-- · Les codes de secours de la double authentification : dix codes à
--   usage unique, donnés une seule fois ; la base n'en garde que
--   l'empreinte. Un code accepté retire le facteur perdu : la personne
--   enregistre aussitôt sa nouvelle application. Cinq essais manqués en un
--   quart d'heure, et la porte se ferme un moment.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mot de passe oublié : le rythme des demandes
-- ---------------------------------------------------------------------
create table plateforme.demandes_mot_de_passe (
  id    bigint generated always as identity primary key,
  email text not null,
  le    timestamptz not null default now()
);
create index demandes_mot_de_passe_email on plateforme.demandes_mot_de_passe (email, le desc);
alter table plateforme.demandes_mot_de_passe enable row level security;

-- Vrai si un lien peut partir pour cette adresse maintenant (et la demande
-- est notée) ; faux si c'est trop tôt. Rien n'y dit si le compte existe.
create function public.compte_demande_mot_de_passe(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  -- (trois mois suffisent)
  delete from plateforme.demandes_mot_de_passe d where d.le < now() - interval '90 days';
  if exists (select 1 from plateforme.demandes_mot_de_passe d where d.email = v_email and d.le > now() - interval '2 minutes')
     or (select count(*) from plateforme.demandes_mot_de_passe d where d.email = v_email and d.le > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into plateforme.demandes_mot_de_passe (email) values (v_email);
  return true;
end;
$$;
revoke execute on function public.compte_demande_mot_de_passe(text) from public, anon, authenticated;
grant  execute on function public.compte_demande_mot_de_passe(text) to service_role;


-- ---------------------------------------------------------------------
-- Les codes de secours
-- ---------------------------------------------------------------------
create table plateforme.codes_secours (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  empreinte  text not null,
  cree_le    timestamptz not null default now(),
  utilise_le timestamptz,
  unique (user_id, empreinte)
);
alter table plateforme.codes_secours enable row level security;

create table plateforme.essais_codes_secours (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  le      timestamptz not null default now()
);
create index essais_codes_secours_user on plateforme.essais_codes_secours (user_id, le desc);
alter table plateforme.essais_codes_secours enable row level security;

-- L'empreinte d'un code : sans tirets ni espaces, en majuscules, salée par
-- le compte (deux comptes au même code n'ont pas la même empreinte).
create function private.empreinte_code_secours(p_user uuid, p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_user::text || ':' || upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$$;
revoke execute on function private.empreinte_code_secours(uuid, text) from public, anon, authenticated;

-- Remplacer ses codes (les anciens ne valent plus) : connecté en double
-- authentification seulement. Les codes viennent de l'application (tirés au
-- hasard côté serveur) ; la base n'en garde que l'empreinte.
create function public.compte_remplacer_codes_secours(p_codes text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_n    integer;
begin
  if v_user is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Connectez-vous avec votre double authentification pour créer vos codes de secours'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(p_codes, 1), 0) not between 8 and 12
     or exists (select 1 from unnest(p_codes) c where length(regexp_replace(c, '[^A-Za-z0-9]', '', 'g')) < 8) then
    raise exception 'Des codes de secours mal formés' using errcode = 'check_violation';
  end if;
  delete from plateforme.codes_secours where user_id = v_user;
  insert into plateforme.codes_secours (user_id, empreinte)
  select distinct v_user, private.empreinte_code_secours(v_user, c) from unnest(p_codes) c;
  get diagnostics v_n = row_count;
  perform private.console_trace(v_user, null, 'compte.codes_secours', null, null, jsonb_build_object('codes', v_n));
  return v_n;
end;
$$;
revoke execute on function public.compte_remplacer_codes_secours(text[]) from public, anon;
grant  execute on function public.compte_remplacer_codes_secours(text[]) to authenticated;

-- Combien de codes encore valables, et quand ils ont été créés.
create function public.compte_codes_secours()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restants', (select count(*) from plateforme.codes_secours c where c.user_id = auth.uid() and c.utilise_le is null),
    'crees_le', (select max(c.cree_le) from plateforme.codes_secours c where c.user_id = auth.uid()))
$$;
revoke execute on function public.compte_codes_secours() from public, anon;
grant  execute on function public.compte_codes_secours() to authenticated;

-- Utiliser un code (connecté par mot de passe, sans le second facteur) : s'il
-- est bon, il ne servira plus, et le facteur perdu est retiré ; la personne
-- enregistre sa nouvelle application. Faux s'il ne l'est pas.
create function public.compte_utiliser_code_secours(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id   bigint;
begin
  if v_user is null then
    raise exception 'Connectez-vous d''abord avec votre mot de passe' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from plateforme.essais_codes_secours e where e.user_id = v_user and e.le > now() - interval '15 minutes') >= 5 then
    raise exception 'Trop d''essais : réessayez dans un quart d''heure' using errcode = 'check_violation', hint = 'essais';
  end if;
  select c.id into v_id from plateforme.codes_secours c
   where c.user_id = v_user and c.utilise_le is null and c.empreinte = private.empreinte_code_secours(v_user, p_code)
   for update;
  if v_id is null then
    insert into plateforme.essais_codes_secours (user_id) values (v_user);
    return false;
  end if;
  update plateforme.codes_secours set utilise_le = now() where id = v_id;
  delete from plateforme.essais_codes_secours where user_id = v_user;
  delete from auth.mfa_factors f where f.user_id = v_user;
  perform private.console_trace(v_user, null, 'compte.code_secours', null, null,
    jsonb_build_object('restants', (select count(*) from plateforme.codes_secours c where c.user_id = v_user and c.utilise_le is null)));
  return true;
end;
$$;
revoke execute on function public.compte_utiliser_code_secours(text) from public, anon;
grant  execute on function public.compte_utiliser_code_secours(text) to authenticated;

-- Ce qu'une personne fait de son compte (mot de passe changé, déconnectée
-- partout) se trace aussi : le journal dit qui, quand, d'où.
create function public.compte_tracer(p_geste text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
  end if;
  if p_geste not in ('mot_de_passe', 'deconnexion_partout') then
    raise exception 'Geste inconnu « % »', p_geste using errcode = 'check_violation';
  end if;
  perform private.console_trace(auth.uid(), null, 'compte.' || p_geste, null, null, null);
end;
$$;
revoke execute on function public.compte_tracer(text) from public, anon;
grant  execute on function public.compte_tracer(text) to authenticated;
