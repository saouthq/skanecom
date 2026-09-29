-- =====================================================================
-- SkanEcom — 25 · CONSOLE C7 : L'ACCÈS SUPPORT AU BACKOFFICE D'UN CLIENT
-- 29/09/2026 — étape 1, tâche « console » (PRD §6.1 C7)
-- =====================================================================
--
-- Le client appelle : « je ne trouve pas où régler mes frais », « cette
-- commande est bloquée ». Pour voir ce qu'il voit, l'administrateur de la
-- plateforme entre dans SON backoffice, sans compte à lui prêter ni mot de
-- passe à demander.
--
-- Un accès support n'est pas une place dans l'équipe : il s'ouvre depuis la
-- console, avec un MOTIF et une DURÉE (15 minutes à 4 heures), dans l'un de
-- deux modes — regarder (le rôle « lecture ») ou agir comme un
-- administrateur de la boutique (commandes, catalogue, réglages ; jamais
-- l'équipe, qui reste au propriétaire). Il se ferme seul à l'heure dite, ou
-- plus tôt, d'un clic.
--
-- Tout se voit : l'ouverture et la fermeture au journal d'audit, chaque
-- geste fait pendant l'accès sous le nom de l'administrateur (historique
-- des commandes, journal du stock, journal des réglages), et le
-- propriétaire retrouve dans son backoffice qui est entré, quand et
-- pourquoi (public.gestion_acces_support), et ferme lui-même un accès
-- encore ouvert (public.gestion_fermer_support).
--
-- La porte est la même que celle des équipes : private.est_membre et
-- private.mes_boutiques, sur lesquelles reposent les policies et toutes les
-- fonctions public.gestion_* du backoffice. Elles reconnaissent désormais
-- un accès support ouvert, à trois conditions vérifiées par la base :
-- l'accès n'est ni fermé ni échu, son titulaire est toujours administrateur
-- de la plateforme, et sa session est en double authentification (aal2) —
-- un mot de passe volé n'ouvre aucun backoffice.

create table plateforme.acces_support (
  id          bigint generated always as identity primary key,
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  role        plateforme.role_membre not null check (role in ('lecture', 'admin')),
  motif       text not null check (char_length(btrim(motif)) between 5 and 300),
  ouvert_le   timestamptz not null default now(),
  expire_le   timestamptz not null,
  ferme_le    timestamptz,
  ferme_par   uuid references auth.users (id) on delete set null,
  check (expire_le > ouvert_le),
  check (ferme_le is null or ferme_le >= ouvert_le)
);

-- Au plus un accès non refermé par administrateur et par boutique : un accès
-- échu se referme à son échéance (ferme_le = expire_le, sans ferme_par) dès
-- qu'on en rouvre ou en ferme un.
create unique index acces_support_un_ouvert_idx on plateforme.acces_support (boutique_id, user_id) where ferme_le is null;
create index acces_support_boutique_idx on plateforme.acces_support (boutique_id, ouvert_le desc);

comment on table plateforme.acces_support is
  'Les accès support des administrateurs de la plateforme au backoffice d''une boutique (C7) : motif, mode, durée, fermeture.';

alter table plateforme.acces_support enable row level security;
revoke all on plateforme.acces_support from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- La porte : les accès support ouverts de l'utilisateur connecté
-- ---------------------------------------------------------------------
create function private.supports_ouverts()
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
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from plateforme.administrateurs a where a.user_id = s.user_id);
$$;

revoke execute on function private.supports_ouverts() from public, anon, authenticated;

create or replace function private.mes_boutiques(p_roles text[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.boutique_id
  from plateforme.membres m
  where m.user_id = auth.uid()
    and m.actif
    and (p_roles is null or m.role::text = any (p_roles))
  union
  select s.boutique_id
  from private.supports_ouverts() s
  where p_roles is null or s.role = any (p_roles);
$$;

create or replace function private.est_membre(p_boutique_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from plateforme.membres m
    where m.boutique_id = p_boutique_id
      and m.user_id = auth.uid()
      and m.actif
      and (p_roles is null or m.role::text = any (p_roles))
  ) or exists (
    select 1 from private.supports_ouverts() s
    where s.boutique_id = p_boutique_id
      and (p_roles is null or s.role = any (p_roles))
  );
$$;

-- Les boutiques du backoffice : celles de l'équipe, puis celles d'un accès
-- support ouvert (support_jusqu_a, support_motif), sauf où l'on est déjà de
-- l'équipe. La double authentification n'est pas exigée ici : l'application
-- y renvoie l'administrateur, et la base ne lui ouvre rien sans elle.
drop function public.mes_acces();
create function public.mes_acces()
returns table (boutique_id uuid, slug text, nom text, statut text, role text,
               support_jusqu_a timestamptz, support_motif text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.slug, b.nom, b.statut::text, m.role::text, null::timestamptz, null::text
  from plateforme.membres m
  join plateforme.boutiques b on b.id = m.boutique_id
  where m.user_id = auth.uid() and m.actif
  union all
  select b.id, b.slug, b.nom, b.statut::text, s.role::text, s.expire_le, s.motif
  from plateforme.acces_support s
  join plateforme.boutiques b on b.id = s.boutique_id
  where s.user_id = auth.uid() and s.ferme_le is null and s.expire_le > now()
    and exists (select 1 from plateforme.administrateurs a where a.user_id = s.user_id)
    and not exists (select 1 from plateforme.membres m
                     where m.boutique_id = s.boutique_id and m.user_id = s.user_id and m.actif)
  order by 3;
$$;

comment on function public.mes_acces() is
  'Boutiques du backoffice de l''utilisateur connecté, avec son rôle dans chacune ; un accès support ouvert y figure avec son échéance et son motif.';

revoke execute on function public.mes_acces() from public, anon;
grant  execute on function public.mes_acces() to authenticated, service_role;


-- ---------------------------------------------------------------------
-- La console : ouvrir, fermer, relire
-- ---------------------------------------------------------------------

-- Un accès échu a pris fin seul, à son échéance.
create function private.support_refermer_echus(p_boutique_id uuid, p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update plateforme.acces_support s set ferme_le = s.expire_le
   where s.boutique_id = p_boutique_id and s.user_id = p_user_id and s.ferme_le is null and s.expire_le <= now();
$$;

revoke execute on function private.support_refermer_echus(uuid, uuid) from public, anon, authenticated;

-- Ouvrir un accès support. Un accès encore ouvert par le même
-- administrateur sur la même boutique est fermé d'abord (changer de mode ou
-- prolonger, c'est rouvrir).
create function public.console_ouvrir_support(
  p_acteur uuid, p_boutique_id uuid, p_role text, p_motif text, p_minutes integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motif   text := btrim(coalesce(p_motif, ''));
  v_ancien  plateforme.acces_support;
  v_nouveau plateforme.acces_support;
begin
  perform private.console_exige_admin(p_acteur);
  if p_role is null or p_role not in ('lecture', 'admin') then
    raise exception 'Mode d''accès inconnu : regarder, ou agir comme un administrateur de la boutique'
      using errcode = 'check_violation', hint = 'role';
  end if;
  if char_length(v_motif) < 5 or char_length(v_motif) > 300 then
    raise exception 'Dites en quelques mots pourquoi vous entrez (5 à 300 caractères) : le propriétaire le lira'
      using errcode = 'check_violation', hint = 'motif';
  end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then
    raise exception 'Durée d''un accès support : de 15 minutes à 4 heures'
      using errcode = 'check_violation', hint = 'duree';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;

  perform private.support_refermer_echus(p_boutique_id, p_acteur);
  update plateforme.acces_support s
     set ferme_le = greatest(now(), s.ouvert_le), ferme_par = p_acteur
   where s.boutique_id = p_boutique_id and s.user_id = p_acteur and s.ferme_le is null
  returning * into v_ancien;

  insert into plateforme.acces_support (boutique_id, user_id, role, motif, expire_le)
  values (p_boutique_id, p_acteur, p_role::plateforme.role_membre, v_motif, now() + make_interval(mins => p_minutes))
  returning * into v_nouveau;

  perform private.console_trace(p_acteur, p_boutique_id, 'support.ouvert', p_role,
    case when v_ancien.id is not null then jsonb_build_object('role', v_ancien.role, 'expire_le', v_ancien.expire_le) end,
    jsonb_build_object('role', v_nouveau.role, 'motif', v_nouveau.motif, 'minutes', p_minutes, 'expire_le', v_nouveau.expire_le));

  return jsonb_build_object('id', v_nouveau.id, 'role', v_nouveau.role, 'expire_le', v_nouveau.expire_le);
end;
$$;

-- Fermer son accès support (vrai s'il y en avait un d'ouvert).
create function public.console_fermer_support(p_acteur uuid, p_boutique_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ferme plateforme.acces_support;
begin
  perform private.console_exige_admin(p_acteur);
  perform private.support_refermer_echus(p_boutique_id, p_acteur);
  update plateforme.acces_support s
     set ferme_le = greatest(now(), s.ouvert_le), ferme_par = p_acteur
   where s.boutique_id = p_boutique_id and s.user_id = p_acteur and s.ferme_le is null
  returning * into v_ferme;
  if v_ferme.id is null then
    return false;
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'support.ferme', v_ferme.role::text,
    jsonb_build_object('role', v_ferme.role, 'expire_le', v_ferme.expire_le),
    jsonb_build_object('ferme_le', v_ferme.ferme_le));
  return true;
end;
$$;

-- Les accès support d'une boutique, du plus récent au plus ancien : pour la
-- console (p_acteur marque les siens), et, par gestion_acces_support, pour
-- le propriétaire.
create function private.acces_support_de(p_boutique_id uuid, p_moi uuid, p_limite integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.ligne order by x.ouvert_le desc, x.id desc), '[]'::jsonb)
    from (select s.ouvert_le, s.id, jsonb_build_object(
                   'id', s.id, 'qui', u.email, 'role', s.role, 'motif', s.motif,
                   'ouvert_le', s.ouvert_le, 'expire_le', s.expire_le, 'ferme_le', s.ferme_le,
                   'ferme_par', (select f.email from auth.users f where f.id = s.ferme_par),
                   'ouvert', s.ferme_le is null and s.expire_le > now(),
                   'fin', coalesce(s.ferme_le, s.expire_le),
                   'vous', p_moi is not null and s.user_id = p_moi) as ligne
            from plateforme.acces_support s
            left join auth.users u on u.id = s.user_id
           where s.boutique_id = p_boutique_id
           order by s.ouvert_le desc, s.id desc
           limit greatest(1, least(coalesce(p_limite, 20), 100))) x;
$$;

revoke execute on function private.acces_support_de(uuid, uuid, integer) from public, anon, authenticated;

create function public.console_acces_support(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return private.acces_support_de(p_boutique_id, p_acteur, 20);
end;
$$;

-- Le backoffice : qui, de SkanEcom, est entré, quand et pourquoi. Le
-- propriétaire et l'administrateur de la boutique le lisent.
create function public.gestion_acces_support(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  return private.acces_support_de(p_boutique_id, auth.uid(), 20);
end;
$$;

-- Le propriétaire ferme lui-même un accès support encore ouvert : il garde
-- la main chez lui. Tracé à son nom.
create function public.gestion_fermer_support(p_boutique_id uuid, p_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ferme plateforme.acces_support;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire}');
  update plateforme.acces_support s
     set ferme_le = greatest(now(), s.ouvert_le), ferme_par = auth.uid()
   where s.id = p_id and s.boutique_id = p_boutique_id and s.ferme_le is null and s.expire_le > now()
  returning * into v_ferme;
  if v_ferme.id is null then
    return false;
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'support.ferme', v_ferme.role::text,
    jsonb_build_object('role', v_ferme.role, 'expire_le', v_ferme.expire_le, 'titulaire', v_ferme.user_id),
    jsonb_build_object('ferme_le', v_ferme.ferme_le, 'par', 'proprietaire'));
  return true;
end;
$$;

revoke execute on function public.console_ouvrir_support(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.console_fermer_support(uuid, uuid)                      from public, anon, authenticated;
revoke execute on function public.console_acces_support(uuid, uuid)                       from public, anon, authenticated;
revoke execute on function public.gestion_acces_support(uuid)                             from public, anon;
grant  execute on function public.console_ouvrir_support(uuid, uuid, text, text, integer) to service_role;
grant  execute on function public.console_fermer_support(uuid, uuid)                      to service_role;
grant  execute on function public.console_acces_support(uuid, uuid)                       to service_role;
grant  execute on function public.gestion_acces_support(uuid)                             to authenticated, service_role;
revoke execute on function public.gestion_fermer_support(uuid, bigint)                    from public, anon;
grant  execute on function public.gestion_fermer_support(uuid, bigint)                    to authenticated, service_role;
