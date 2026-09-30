-- =====================================================================
-- SkanEcom — 50 · LES FAVORIS
-- =====================================================================
--
-- Un cœur sur les cartes et sur la fiche : la pièce rejoint « Mes
-- favoris ». La liste vit dans le navigateur ; connectée, la cliente la
-- retrouve sur ses autres appareils (public.favoris, rattachée à son
-- compte, fusionnée à la connexion). Réglage de la boutique
-- (catalogue.favoris), coupé par défaut.
--
-- L'équipe ne voit jamais qui aime quoi : seulement combien de clients
-- connectés ont chaque pièce en favori (le catalogue, « Les plus aimées »).
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.favoris', 'booleen', null, 'false', 'catalogue', null, true,
     'Les favoris',
     'Oui = un cœur sur les cartes et les fiches ; « Mes favoris » garde les pièces aimées, dans le navigateur et, pour un client connecté, dans son compte. L''équipe voit combien de clients aiment chaque pièce, jamais lesquels. Non = ni cœur, ni page.', 32);

create table public.favoris (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  produit_id  uuid not null,
  created_at  timestamptz not null default now(),
  primary key (boutique_id, user_id, produit_id),
  foreign key (boutique_id, produit_id) references public.produits (boutique_id, id) on delete cascade
);

comment on table public.favoris is
  'Les pièces qu''un client connecté a marquées d''un cœur (réglage catalogue.favoris) ; 100 au plus par boutique. L''équipe n''en lit que des comptes.';

create index favoris_produit_idx on public.favoris (boutique_id, produit_id);

create trigger favoris_boutique_immuable before update of boutique_id on public.favoris
  for each row execute function private.boutique_immuable();

alter table public.favoris enable row level security;
create policy "favoris: chacun lit les siens"
  on public.favoris for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.favoris from anon, authenticated;

-- ---------------------------------------------------------------------
-- La vitrine : la liste du compte, fusionnée avec celle du navigateur
-- ---------------------------------------------------------------------
-- p_ajouts : les slugs à garder (la liste du navigateur à la connexion, ou
-- un cœur touché) ; p_retraits : ceux à oublier. Rend la liste entière du
-- compte, la plus récente d'abord — le navigateur la reprend telle quelle.
create function public.garder_favoris(p_boutique_id uuid, p_ajouts text[], p_retraits text[])
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not coalesce((private.reglage(p_boutique_id, 'catalogue.favoris'))::boolean, false) then
    return null;
  end if;
  if coalesce(cardinality(p_ajouts), 0) > 100 or coalesce(cardinality(p_retraits), 0) > 100 then
    raise exception 'Cent favoris au plus' using errcode = 'check_violation', hint = 'favoris';
  end if;

  delete from public.favoris f
   using public.produits p
   where f.boutique_id = p_boutique_id and f.user_id = v_uid
     and p.boutique_id = f.boutique_id and p.id = f.produit_id and p.slug = any(coalesce(p_retraits, '{}'));

  insert into public.favoris (boutique_id, user_id, produit_id, created_at)
  select p_boutique_id, v_uid, p.id, clock_timestamp() - make_interval(secs => a.n)
    from unnest(coalesce(p_ajouts, '{}')) with ordinality as a(slug, n)
    join public.produits p on p.boutique_id = p_boutique_id and p.slug = a.slug and p.publie
  on conflict do nothing;

  -- Cent au plus : les plus anciens s'effacent.
  delete from public.favoris f
   where f.boutique_id = p_boutique_id and f.user_id = v_uid
     and f.produit_id not in (select g.produit_id from public.favoris g
                               where g.boutique_id = p_boutique_id and g.user_id = v_uid
                               order by g.created_at desc limit 100);

  return array(select p.slug
                 from public.favoris f
                 join public.produits p on p.boutique_id = f.boutique_id and p.id = f.produit_id and p.publie
                where f.boutique_id = p_boutique_id and f.user_id = v_uid
                order by f.created_at desc);
end;
$$;

revoke execute on function public.garder_favoris(uuid, text[], text[]) from public, anon;
grant  execute on function public.garder_favoris(uuid, text[], text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Le backoffice : combien, jamais qui
-- ---------------------------------------------------------------------
create function public.gestion_favoris(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'catalogue.favoris'))::boolean, false),
    'produits', coalesce((select jsonb_object_agg(x.produit_id, x.n)
                            from (select f.produit_id, count(*) as n from public.favoris f
                                   where f.boutique_id = p_boutique_id group by f.produit_id) x), '{}'::jsonb));
end;
$$;

revoke execute on function public.gestion_favoris(uuid) from public, anon;
grant  execute on function public.gestion_favoris(uuid) to authenticated;
