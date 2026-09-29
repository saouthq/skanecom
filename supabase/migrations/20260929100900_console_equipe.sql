-- =====================================================================
-- SkanEcom — 10 · CONSOLE : L'ÉQUIPE D'UNE BOUTIQUE (PRD §6.1 C4)
-- =====================================================================
-- Skander donne l'accès au backoffice d'un client depuis la console. Le
-- compte est créé par GoTrue (API d'administration, côté serveur de la
-- console), qui rend un LIEN D'INVITATION à transmettre à la personne (par
-- WhatsApp) : elle y choisit son mot de passe. Personne d'autre ne le
-- connaît jamais.
--
-- Ici, ce qui revient à la base : l'inscription dans plateforme.membres, le
-- rôle, la désactivation — chaque geste tracé dans le journal, comme toute
-- écriture de la console (migration 06), y compris chaque lien d'accès
-- remis. Une boutique garde toujours au moins un propriétaire actif.
--
-- Les changements d'équipe d'une même boutique passent un par un (verrou sur
-- la ligne de la boutique, qui ne gêne pas les commandes) : deux administrateurs qui retirent chacun un des
-- deux propriétaires au même moment ne laissent pas la boutique sans aucun.
-- =====================================================================


-- L'équipe d'une boutique, pour la fiche de la console.
create function public.console_equipe(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', m.user_id,
           'email', u.email,
           'telephone', u.phone,
           'role', m.role,
           'actif', m.actif,
           'depuis', m.created_at,
           'derniere_connexion', u.last_sign_in_at,
           -- invitation en attente : le lien n'a pas encore servi (GoTrue
           -- confirme l'adresse quand la personne l'ouvre et choisit son mot
           -- de passe)
           'en_attente', u.email_confirmed_at is null,
           'double_auth', exists (select 1 from auth.mfa_factors f
                                  where f.user_id = m.user_id and f.status::text = 'verified'))
         order by m.actif desc, m.role, u.email), '[]'::jsonb)
  from plateforme.membres m
  join auth.users u on u.id = m.user_id
  where m.boutique_id = p_boutique_id;
$$;

-- Le compte d'une adresse, s'il existe déjà. Inviter une personne qui a déjà
-- un compte confirmé (membre d'une autre boutique) ne lui envoie pas de
-- lien : elle garde son mot de passe.
create function public.console_compte(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('user_id', u.id, 'confirme', u.email_confirmed_at is not null)
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

-- Ajouter (ou réactiver) un membre, avec son rôle.
create function public.console_ajouter_membre(p_acteur uuid, p_boutique_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant jsonb;
  v_email text;
begin
  perform private.console_exige_admin(p_acteur);
  if p_role is null or p_role not in ('proprietaire', 'admin', 'confirmateur', 'preparateur', 'lecture') then
    raise exception 'Rôle inconnu : %', p_role using errcode = 'check_violation', hint = 'role';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'Compte introuvable' using errcode = 'no_data_found';
  end if;

  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;
  select jsonb_build_object('role', m.role, 'actif', m.actif) into v_avant
  from plateforme.membres m where m.boutique_id = p_boutique_id and m.user_id = p_user_id;

  -- Déjà dans l'équipe : son rôle se change dans la liste (où la règle du
  -- dernier propriétaire s'applique), pas par une nouvelle invitation.
  if (v_avant ->> 'actif')::boolean then
    raise exception '% fait déjà partie de l''équipe', v_email using errcode = 'check_violation', hint = 'membre';
  end if;

  insert into plateforme.membres (boutique_id, user_id, role, invite_par)
  values (p_boutique_id, p_user_id, p_role::plateforme.role_membre, p_acteur)
  on conflict (boutique_id, user_id) do update set role = excluded.role, actif = true, invite_par = excluded.invite_par;

  perform private.console_trace(p_acteur, p_boutique_id, 'equipe.ajouter', v_email, v_avant,
                                jsonb_build_object('role', p_role, 'actif', true));
end;
$$;

-- Changer le rôle d'un membre, le désactiver ou le réactiver.
create function public.console_modifier_membre(
  p_acteur      uuid,
  p_boutique_id uuid,
  p_user_id     uuid,
  p_role        text,
  p_actif       boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membre plateforme.membres;
  v_email  text;
begin
  perform private.console_exige_admin(p_acteur);
  if p_role is null or p_role not in ('proprietaire', 'admin', 'confirmateur', 'preparateur', 'lecture') then
    raise exception 'Rôle inconnu : %', p_role using errcode = 'check_violation', hint = 'role';
  end if;
  if p_actif is null then
    raise exception 'Actif ou non : à préciser' using errcode = 'check_violation';
  end if;

  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;
  select * into v_membre from plateforme.membres m
   where m.boutique_id = p_boutique_id and m.user_id = p_user_id
   for update;
  if not found then
    raise exception 'Ce compte ne fait pas partie de l''équipe' using errcode = 'no_data_found';
  end if;
  if v_membre.role::text = p_role and v_membre.actif = p_actif then
    return;  -- rien ne change, rien à tracer
  end if;

  -- Toujours au moins un propriétaire actif : c'est lui qui répond de la
  -- boutique (et, demain, qui invite son équipe lui-même).
  if v_membre.role = 'proprietaire' and v_membre.actif and (p_role <> 'proprietaire' or not p_actif)
     and not exists (select 1 from plateforme.membres m
                     where m.boutique_id = p_boutique_id and m.user_id <> p_user_id
                       and m.role = 'proprietaire' and m.actif) then
    raise exception 'La boutique garde au moins un propriétaire actif : nommez-en un autre d''abord'
      using errcode = 'check_violation', hint = 'proprietaire';
  end if;

  update plateforme.membres set role = p_role::plateforme.role_membre, actif = p_actif
   where boutique_id = p_boutique_id and user_id = p_user_id;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'equipe.modifier', v_email,
                                jsonb_build_object('role', v_membre.role, 'actif', v_membre.actif),
                                jsonb_build_object('role', p_role, 'actif', p_actif));
end;
$$;

-- Un lien d'accès (invitation, ou mot de passe à choisir) vient d'être remis
-- pour un membre : la trace dit qui l'a demandé, et quand.
create function public.console_tracer_lien(p_acteur uuid, p_boutique_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  perform private.console_exige_admin(p_acteur);
  select u.email into v_email
  from plateforme.membres m join auth.users u on u.id = m.user_id
  where m.boutique_id = p_boutique_id and m.user_id = p_user_id;
  if not found then
    raise exception 'Ce compte ne fait pas partie de l''équipe' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'equipe.lien', v_email, null, null);
end;
$$;


revoke execute on function public.console_equipe(uuid)                                   from public, anon, authenticated;
revoke execute on function public.console_compte(text)                                   from public, anon, authenticated;
revoke execute on function public.console_ajouter_membre(uuid, uuid, uuid, text)          from public, anon, authenticated;
revoke execute on function public.console_modifier_membre(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.console_tracer_lien(uuid, uuid, uuid)                    from public, anon, authenticated;
grant  execute on function public.console_equipe(uuid)                                   to service_role;
grant  execute on function public.console_compte(text)                                   to service_role;
grant  execute on function public.console_ajouter_membre(uuid, uuid, uuid, text)          to service_role;
grant  execute on function public.console_modifier_membre(uuid, uuid, uuid, text, boolean) to service_role;
grant  execute on function public.console_tracer_lien(uuid, uuid, uuid)                    to service_role;
