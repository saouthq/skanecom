-- =====================================================================
-- SkanEcom — 57 · L'OBJECTIF DU MOIS
-- =====================================================================
--
-- « On vise combien ce mois-ci, et on en est où ? » : la direction fixe un
-- chiffre — ce qui doit être livré (et donc encaissé, au paiement à la
-- livraison) dans le mois, à l'heure de Tunis — et le tableau de bord le
-- suit : le livré du mois, ce qui est en route (confirmé ou expédié, pas
-- encore livré), le rythme (au train actuel, la fin du mois), ce qu'il
-- faut par jour d'ici là ; les six mois d'avant, visés et atteints.
--
-- Une ligne par boutique et par mois ; le mois en cours ou le suivant
-- seulement (un mois passé est un fait, pas un objectif). Propriétaire et
-- administrateur fixent, la direction lit ; chaque changement est tracé.
-- =====================================================================

create table public.objectifs_mois (
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  mois             date not null check (extract(day from mois) = 1),
  montant_millimes bigint not null check (montant_millimes between 1000 and 100000000000),
  fixe_par         uuid references auth.users (id) on delete set null,
  fixe_le          timestamptz not null default now(),
  primary key (boutique_id, mois)
);

comment on table public.objectifs_mois is
  'L''objectif de chaque mois : le montant à livrer (paiement à la livraison : à encaisser), fixé par la direction.';

create trigger objectifs_mois_boutique_immuable before update of boutique_id on public.objectifs_mois
  for each row execute function private.boutique_immuable();

alter table public.objectifs_mois enable row level security;
create policy "objectifs_mois: l'équipe lit ceux de sa boutique"
  on public.objectifs_mois for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.objectifs_mois from anon, authenticated;


-- Le livré d'un mois : les commandes livrées ce mois-là (à leur jour de
-- livraison, à Tunis), leur montant.
create function private.livre_du_mois(p_boutique_id uuid, p_mois date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.total_millimes), 0)::bigint
    from public.commandes c
   where c.boutique_id = p_boutique_id and c.statut = 'livree'
     and c.livree_at >= (p_mois::timestamp at time zone 'Africa/Tunis')
     and c.livree_at <  (((p_mois + interval '1 month')::date)::timestamp at time zone 'Africa/Tunis')
$$;
revoke execute on function private.livre_du_mois(uuid, date) from public, anon, authenticated;


create function public.gestion_objectif(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aujourd  date := (now() at time zone 'Africa/Tunis')::date;
  v_mois     date := date_trunc('month', v_aujourd)::date;
  v_fin      date := (v_mois + interval '1 month' - interval '1 day')::date;
  v_ecoules  integer := v_aujourd - v_mois + 1;
  v_jours    integer := v_fin - v_mois + 1;
  v_livre    bigint;
  v_route    bigint;
  v_objectif bigint;
  v_suivant  bigint;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  v_livre := private.livre_du_mois(p_boutique_id, v_mois);
  -- En route : confirmé, préparé ou expédié, pas encore livré (ni refusé).
  select coalesce(sum(c.total_millimes), 0) into v_route
    from public.commandes c
   where c.boutique_id = p_boutique_id and c.statut in ('confirmee', 'expediee');
  select o.montant_millimes into v_objectif from public.objectifs_mois o where o.boutique_id = p_boutique_id and o.mois = v_mois;
  select o.montant_millimes into v_suivant from public.objectifs_mois o
   where o.boutique_id = p_boutique_id and o.mois = (v_mois + interval '1 month')::date;

  return jsonb_build_object(
    'mois', v_mois, 'aujourdhui', v_aujourd, 'jours_ecoules', v_ecoules, 'jours_mois', v_jours,
    'objectif', v_objectif, 'objectif_suivant', v_suivant,
    'livre', v_livre, 'en_route', v_route,
    -- Au train des jours écoulés, la fin du mois (aujourd'hui compté à moitié).
    'projection', round(v_livre::numeric / greatest(v_ecoules - 0.5, 0.5) * v_jours)::bigint,
    -- Ce qu'il faut livrer par jour, aujourd'hui compris, pour l'atteindre.
    'par_jour', case when v_objectif is not null and v_objectif > v_livre
                     then ceil((v_objectif - v_livre)::numeric / (v_fin - v_aujourd + 1))::bigint end,
    -- Le mois dernier, pour proposer un chiffre quand il n'y en a pas.
    'mois_dernier', private.livre_du_mois(p_boutique_id, (v_mois - interval '1 month')::date),
    'historique', (select jsonb_agg(jsonb_build_object(
                     'mois', m.mois,
                     'objectif', (select o.montant_millimes from public.objectifs_mois o where o.boutique_id = p_boutique_id and o.mois = m.mois),
                     'livre', private.livre_du_mois(p_boutique_id, m.mois)) order by m.mois)
                     from (select (v_mois - make_interval(months => n))::date as mois from generate_series(1, 6) n) m)
  );
end;
$$;

create function public.gestion_fixer_objectif(p_boutique_id uuid, p_mois date, p_montant_millimes bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mois   date := date_trunc('month', (now() at time zone 'Africa/Tunis'))::date;
  v_avant  bigint;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_mois is null or p_mois not in (v_mois, (v_mois + interval '1 month')::date) then
    raise exception 'Un objectif se fixe pour ce mois-ci ou le suivant' using errcode = 'check_violation', hint = 'mois';
  end if;
  if p_montant_millimes is not null and p_montant_millimes not between 1000 and 100000000000 then
    raise exception 'Un objectif d''au moins 1 TND' using errcode = 'check_violation', hint = 'montant';
  end if;
  select o.montant_millimes into v_avant from public.objectifs_mois o where o.boutique_id = p_boutique_id and o.mois = p_mois;
  if p_montant_millimes is null then
    delete from public.objectifs_mois o where o.boutique_id = p_boutique_id and o.mois = p_mois;
  else
    insert into public.objectifs_mois (boutique_id, mois, montant_millimes, fixe_par)
    values (p_boutique_id, p_mois, p_montant_millimes, auth.uid())
    on conflict (boutique_id, mois) do update set montant_millimes = excluded.montant_millimes, fixe_par = excluded.fixe_par, fixe_le = now();
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'objectif.fixer', p_mois::text,
                                case when v_avant is null then null else jsonb_build_object('montant', v_avant) end,
                                case when p_montant_millimes is null then null else jsonb_build_object('montant', p_montant_millimes) end);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.gestion_objectif(uuid), public.gestion_fixer_objectif(uuid, date, bigint) from public, anon;
grant  execute on function public.gestion_objectif(uuid), public.gestion_fixer_objectif(uuid, date, bigint) to authenticated;
