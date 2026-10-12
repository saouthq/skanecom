-- =====================================================================
-- LE DÉPANNAGE — les gestes du poste de contrôle quand quelque chose casse.
--
-- 1. Le MODE MAINTENANCE : toute la plateforme, ou une seule boutique. La
--    vitrine répond alors une page d'attente propre (HTTP 503, « nous
--    revenons très vite »), servie par le proxy avant toute page — elle tient
--    même si l'application elle-même est en cause. L'aperçu de l'équipe passe
--    toujours ; le backoffice reste ouvert, avec un bandeau ; la surveillance
--    ne compte pas une vitrine en maintenance comme une panne.
-- 2. RELANCER une file coincée : les e-mails de commande d'une boutique, ses
--    envois à SkanFact (ce qui attend, et ce qui a été abandonné ces sept
--    derniers jours), tout de suite.
-- Chaque geste passe au journal ; un super-administrateur seul les fait.
-- =====================================================================

create table plateforme.maintenances (
  boutique_id uuid primary key references plateforme.boutiques (id) on delete cascade,
  message     text check (char_length(message) <= 300),
  depuis      timestamptz not null default now(),
  par         uuid references auth.users (id) on delete set null
);
alter table plateforme.maintenances enable row level security;
-- Aucune politique : seules les fonctions ci-dessous y touchent.

comment on table plateforme.maintenances is
  'Les boutiques dont la vitrine est en maintenance (page d''attente) : depuis quand, par qui, avec quel mot. Celle de toute la plateforme est un réglage (maintenance).';

-- La maintenance de la plateforme : le réglage « maintenance » ({ message, depuis, par }), absent sinon.
create function private.maintenance_plateforme()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select r.valeur from plateforme.reglages_plateforme r where r.cle = 'maintenance' and r.valeur ? 'depuis'
$$;
revoke execute on function private.maintenance_plateforme() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 1. Ce que lit le proxy (public : c'est ce que la vitrine montre)
-- ---------------------------------------------------------------------
create function public.maintenance_etat()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plateforme', (select case when m is null then null else jsonb_build_object('message', m ->> 'message', 'depuis', m ->> 'depuis') end
                     from private.maintenance_plateforme() m),
    'boutiques', coalesce((select jsonb_object_agg(b.slug, jsonb_build_object('nom', b.nom, 'message', x.message, 'depuis', x.depuis))
                             from plateforme.maintenances x join plateforme.boutiques b on b.id = x.boutique_id), '{}'::jsonb))
  -- Toute la plateforme en pause : le nom de chaque boutique ouverte, pour sa page d'attente.
  || case when private.maintenance_plateforme() is null then '{}'::jsonb
          else jsonb_build_object('noms', coalesce((select jsonb_object_agg(b.slug, b.nom) from plateforme.boutiques b where b.statut = 'active'), '{}'::jsonb)) end
$$;
revoke execute on function public.maintenance_etat() from public;
grant execute on function public.maintenance_etat() to anon, authenticated, service_role;

-- Pendant une maintenance, l'aperçu de l'équipe passe — avec le vrai jeton du
-- brouillon de la boutique seulement : un jeton inventé ne contourne pas la
-- page d'attente (le proxy ne le demande qu'en maintenance).
create function public.maintenance_apercu(p_slug text, p_jeton uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.themes_brouillons t join plateforme.boutiques b on b.id = t.boutique_id
                  where b.slug = p_slug and t.jeton = p_jeton)
$$;
revoke execute on function public.maintenance_apercu(text, uuid) from public;
grant execute on function public.maintenance_apercu(text, uuid) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. La console : lire, régler
-- ---------------------------------------------------------------------
create function public.console_maintenance(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p jsonb := private.maintenance_plateforme();
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'plateforme', case when v_p is null then null else jsonb_build_object('message', v_p ->> 'message', 'depuis', v_p ->> 'depuis',
                    'par', (select u.email from auth.users u where u.id = (v_p ->> 'par')::uuid)) end,
    'boutiques', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom, 'message', x.message, 'depuis', x.depuis,
                                                               'par', (select u.email from auth.users u where u.id = x.par)) order by x.depuis)
                             from plateforme.maintenances x join plateforme.boutiques b on b.id = x.boutique_id), '[]'::jsonb));
end;
$$;

-- Mettre en maintenance (p_actif), ou rouvrir : la plateforme (p_boutique_id null) ou une boutique.
create function public.console_regler_maintenance(p_acteur uuid, p_boutique_id uuid, p_actif boolean, p_message text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message text := left(nullif(btrim(coalesce(p_message, '')), ''), 300);
  v_etait boolean;
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_boutique_id is null then
    v_etait := private.maintenance_plateforme() is not null;
    if coalesce(p_actif, false) then
      insert into plateforme.reglages_plateforme (cle, valeur, modifie_par)
      values ('maintenance', jsonb_build_object('message', v_message, 'depuis', now(), 'par', p_acteur), p_acteur)
      on conflict (cle) do update set valeur = excluded.valeur, modifie_le = now(), modifie_par = p_acteur;
    else
      delete from plateforme.reglages_plateforme where cle = 'maintenance';
    end if;
    perform private.console_trace(p_acteur, null, 'plateforme.maintenance', null,
      jsonb_build_object('actif', v_etait), jsonb_build_object('actif', coalesce(p_actif, false), 'message', v_message));
  else
    if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
      raise exception 'Boutique introuvable' using errcode = 'no_data_found';
    end if;
    v_etait := exists (select 1 from plateforme.maintenances x where x.boutique_id = p_boutique_id);
    if coalesce(p_actif, false) then
      insert into plateforme.maintenances (boutique_id, message, par) values (p_boutique_id, v_message, p_acteur)
      on conflict (boutique_id) do update set message = excluded.message, par = p_acteur;
    else
      delete from plateforme.maintenances where boutique_id = p_boutique_id;
    end if;
    perform private.console_trace(p_acteur, p_boutique_id, 'boutique.maintenance', null,
      jsonb_build_object('actif', v_etait), jsonb_build_object('actif', coalesce(p_actif, false), 'message', v_message));
  end if;
  return coalesce(p_actif, false);
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Relancer une file coincée (puis la console l'envoie tout de suite)
-- ---------------------------------------------------------------------
-- Ce qui attend repart maintenant ; ce qui a été abandonné ces sept derniers
-- jours (cinq essais sans partir) repart aussi, ses essais remis à zéro. Rend
-- le nombre et les identifiants relancés (la console dit ensuite ce qu'il en est).
create function public.console_relancer_file(p_acteur uuid, p_boutique_id uuid, p_file text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_file = 'courriels' then
    with r as (
      update public.courriels_commandes e
         set etat = 'a_envoyer', prochain_essai = now(),
             essais = case when e.etat = 'refuse' then 0 else e.essais end, fait_le = null
       where e.boutique_id = p_boutique_id
         and (e.etat = 'a_envoyer' or (e.etat = 'refuse' and e.fait_le > now() - interval '7 days'))
      returning e.id)
    select coalesce(array_agg(r.id), '{}') into v_ids from r;
  elsif p_file = 'skanfact' then
    with r as (
      update public.skanfact_envois e
         set etat = 'a_envoyer', prochain_essai = now(),
             essais = case when e.etat = 'refuse' then 0 else e.essais end, fait_le = null
       where e.boutique_id = p_boutique_id
         and (e.etat = 'a_envoyer' or (e.etat = 'refuse' and e.cree_le > now() - interval '7 days'))
      returning e.id)
    select coalesce(array_agg(r.id), '{}') into v_ids from r;
  else
    raise exception 'File inconnue : %', p_file using errcode = 'check_violation', hint = 'file';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.file_relancee', p_file, null, jsonb_build_object('envois', cardinality(v_ids)));
  return jsonb_build_object('n', cardinality(v_ids), 'ids', to_jsonb(v_ids));
end;
$$;

-- Le cache d'une vitrine, vidé (le geste lui-même est dans l'application) : au
-- journal ; rend l'adresse de la boutique, dont l'application vide le cache.
create function public.console_tracer_cache(p_acteur uuid, p_boutique_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  perform private.console_exige_admin(p_acteur);
  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  if v_slug is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.cache_vide', null, null, null);
  return v_slug;
end;
$$;

revoke execute on function public.console_maintenance(uuid) from public, anon, authenticated;
revoke execute on function public.console_regler_maintenance(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.console_relancer_file(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.console_tracer_cache(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_maintenance(uuid) to service_role;
grant  execute on function public.console_regler_maintenance(uuid, uuid, boolean, text) to service_role;
grant  execute on function public.console_relancer_file(uuid, uuid, text) to service_role;
grant  execute on function public.console_tracer_cache(uuid, uuid) to service_role;
