-- =====================================================================
-- SkanEcom — 46 · LES PRIX BARRÉS D'UN RAYON (module « promotions », suite)
-- =====================================================================
--
-- « −30 % sur les robes » : la boutique baisse d'un coup les prix d'un rayon
-- (ses sous-rayons compris) ou de tout le catalogue ; chaque déclinaison en
-- vente prend son prix remisé, l'ancien prix devient le prix barré. Les prix
-- sont écrits dans les déclinaisons, comme si l'équipe les avait saisis :
-- la vitrine, le panier, le tunnel, le devis et la commande n'ont rien de
-- neuf à calculer — tout ce qui lit un prix lit le prix remisé.
--
-- On appelle l'opération comme on veut (« Soldes d'hiver », « Promo de la
-- rentrée ») ; l'écran rappelle qu'en Tunisie les soldes ont leurs périodes.
--
-- Les règles :
--   · le prix barré est le prix pratiqué juste avant (pas un ancien prix
--     barré plus haut : la remise annoncée est la vraie) ;
--   · une déclinaison n'est remisée que par une opération à la fois ; celles
--     déjà dans une opération en cours sont laissées (l'aperçu le dit) ;
--   · arrondi à l'avantage de l'acheteur : au dinar en dessous (au dixième
--     de dinar sous les 10 TND) ; jamais moins que 100 millimes ;
--   · terminer rend à chaque déclinaison son prix et son prix barré
--     d'avant — sauf à celle dont l'équipe a changé le prix entre-temps :
--     sa saisie est gardée, et c'est dit ;
--   · terminer reste possible module coupé (il faut pouvoir rendre les prix) ;
--   · tout passe au journal d'audit (lancer, terminer, avec les nombres).
--
-- Le réglage catalogue.afficher_prix_barres décide toujours si la vitrine
-- montre le prix barré ; l'écran le dit quand il est coupé, et le lancement
-- peut l'allumer du même geste (public.gestion_enregistrer_reglages).
-- =====================================================================

update plateforme.modules
   set libelle_fr = 'Promotions',
       description_fr = 'Des codes à taper au tunnel (pourcentage, montant ou livraison offerte, avec minimum, dates et nombre d''utilisations) et les prix barrés d''un rayon, rendus d''un geste à la fin.'
 where code = 'promotions';

create table public.soldes (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  nom           text not null check (char_length(nom) between 2 and 60),
  -- Le rayon (ses sous-rayons compris) ; rien : tout le catalogue.
  categorie_id  uuid,
  pourcentage   smallint not null check (pourcentage between 5 and 90),
  statut        text not null default 'en_cours' check (statut in ('en_cours', 'terminees')),
  lancees_le    timestamptz not null default clock_timestamp(),
  lancees_par   uuid references auth.users (id) on delete set null,
  terminees_le  timestamptz,
  terminees_par uuid references auth.users (id) on delete set null,
  unique (boutique_id, id),
  foreign key (boutique_id, categorie_id) references public.categories (boutique_id, id) on delete set null (categorie_id),
  constraint soldes_fin check ((statut = 'terminees') = (terminees_le is not null))
);

comment on table public.soldes is
  'Les prix barrés d''un rayon (ou de tout le catalogue) : un pourcentage appliqué aux prix des déclinaisons, l''ancien prix barré ; terminées, les prix d''avant reviennent.';

-- Chaque déclinaison remisée : ses prix d'avant (pour les lui rendre) et
-- son prix remisé (pour savoir si l'équipe l'a changé depuis).
create table public.soldes_lignes (
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  solde_id         uuid not null,
  variante_id      uuid not null,
  prix_avant       bigint not null check (prix_avant > 0),
  prix_barre_avant bigint,
  prix_solde       bigint not null check (prix_solde > 0),
  -- À la fin : rendue (ses prix d'avant), ou gardée (changée entre-temps).
  issue            text check (issue in ('rendue', 'gardee')),
  primary key (boutique_id, solde_id, variante_id),
  foreign key (boutique_id, solde_id) references public.soldes (boutique_id, id) on delete cascade,
  foreign key (boutique_id, variante_id) references public.variantes (boutique_id, id) on delete cascade
);

create index soldes_lignes_variante_idx on public.soldes_lignes (boutique_id, variante_id) where issue is null;
create index soldes_statut_idx on public.soldes (boutique_id, statut, lancees_le desc);

create trigger soldes_boutique_immuable before update of boutique_id on public.soldes
  for each row execute function private.boutique_immuable();
create trigger soldes_lignes_boutique_immuable before update of boutique_id on public.soldes_lignes
  for each row execute function private.boutique_immuable();

alter table public.soldes enable row level security;
alter table public.soldes_lignes enable row level security;
create policy "soldes: l'équipe lit ceux de sa boutique"
  on public.soldes for select using (boutique_id in (select private.mes_boutiques()));
create policy "soldes_lignes: l'équipe lit celles de sa boutique"
  on public.soldes_lignes for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.soldes, public.soldes_lignes from anon, authenticated;


-- Le prix remisé : au dinar en dessous (au dixième sous les 10 TND).
create function private.prix_solde(p_prix bigint, p_pourcentage integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select greatest(100, case
    when p_prix * (100 - p_pourcentage) / 100 >= 10000 then (p_prix * (100 - p_pourcentage) / 100) / 1000 * 1000
    else (p_prix * (100 - p_pourcentage) / 100) / 100 * 100
  end)::bigint
$$;

-- Les déclinaisons en vente (actives, d'un produit en vitrine) d'un rayon
-- et de ses sous-rayons (rien : tout le catalogue).
create function private.variantes_du_rayon(p_boutique_id uuid, p_categorie_id uuid)
returns table (variante_id uuid, produit_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive rayons as (
    select c.id from public.categories c where c.boutique_id = p_boutique_id and c.id = p_categorie_id
    union
    select c.id from public.categories c join rayons r on c.parent_id = r.id where c.boutique_id = p_boutique_id
  )
  select v.id, v.produit_id
    from public.variantes v
    join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
   where v.boutique_id = p_boutique_id and v.actif and p.publie
     and (p_categorie_id is null or p.categorie_id in (select r.id from rayons r))
$$;

-- Une déclinaison est-elle déjà remisée par une opération en cours ?
create function private.variante_en_soldes(p_boutique_id uuid, p_variante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.soldes_lignes l
                   join public.soldes s on s.boutique_id = l.boutique_id and s.id = l.solde_id
                  where l.boutique_id = p_boutique_id and l.variante_id = p_variante_id and s.statut = 'en_cours')
$$;

revoke execute on function private.prix_solde(bigint, integer) from public, anon, authenticated;
revoke execute on function private.variantes_du_rayon(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.variante_en_soldes(uuid, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- L'équipe : ce qu'une opération toucherait, la lancer, la terminer
-- ---------------------------------------------------------------------
-- Avant de lancer : combien de déclinaisons et de produits, combien déjà
-- remisés ailleurs, et trois exemples de prix (du plus cher au moins cher).
create function public.gestion_apercu_soldes(p_boutique_id uuid, p_categorie_id uuid, p_pourcentage integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_pourcentage is null or p_pourcentage not between 5 and 90 then
    raise exception 'Une remise de 5 à 90 %%' using errcode = 'check_violation', hint = 'pourcentage';
  end if;
  if p_categorie_id is not null and not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_categorie_id) then
    raise exception 'Ce rayon n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'rayon';
  end if;
  return (
    with touchees as (
      select r.variante_id, r.produit_id, v.prix_millimes, private.variante_en_soldes(p_boutique_id, r.variante_id) as deja
        from private.variantes_du_rayon(p_boutique_id, p_categorie_id) r
        join public.variantes v on v.boutique_id = p_boutique_id and v.id = r.variante_id
    )
    select jsonb_build_object(
      'declinaisons', count(*) filter (where not t.deja and private.prix_solde(t.prix_millimes, p_pourcentage) < t.prix_millimes),
      'deja_soldees', count(*) filter (where t.deja),
      'produits', count(distinct t.produit_id) filter (where not t.deja),
      'exemples', coalesce((
        select jsonb_agg(jsonb_build_object('avant', x.prix_millimes, 'apres', private.prix_solde(x.prix_millimes, p_pourcentage)) order by x.prix_millimes desc)
          from (select distinct t2.prix_millimes from touchees t2 where not t2.deja order by t2.prix_millimes desc limit 3) x), '[]'::jsonb))
    from touchees t
  );
end;
$$;

create function public.gestion_lancer_soldes(p_boutique_id uuid, p_nom text, p_categorie_id uuid, p_pourcentage integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom   text := nullif(btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g')), '');
  v_solde public.soldes;
  v_n     integer;
  v_deja  integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not private.promotions_actif(p_boutique_id) then
    raise exception 'Les promotions ne sont pas ouvertes pour cette boutique' using errcode = 'check_violation', hint = 'module';
  end if;
  if v_nom is null or char_length(v_nom) not between 2 and 60 then
    raise exception 'Donnez un nom à l''opération (« Soldes d''hiver »), 60 caractères au plus' using errcode = 'check_violation', hint = 'nom';
  end if;
  if p_pourcentage is null or p_pourcentage not between 5 and 90 then
    raise exception 'Une remise de 5 à 90 %%' using errcode = 'check_violation', hint = 'pourcentage';
  end if;
  if p_categorie_id is not null and not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = p_categorie_id) then
    raise exception 'Ce rayon n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'rayon';
  end if;

  -- Deux lancements simultanés de la même boutique passent l'un après
  -- l'autre (le second voit les déclinaisons prises par le premier).
  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;
  -- Les déclinaisons, verrouillées dans l'ordre du tunnel (public.passer_commande) :
  -- une commande en cours passe avant ou après, jamais entre les deux.
  perform 1 from public.variantes v
   where v.boutique_id = p_boutique_id and v.id in (select r.variante_id from private.variantes_du_rayon(p_boutique_id, p_categorie_id) r)
   order by v.id for update;

  insert into public.soldes (boutique_id, nom, categorie_id, pourcentage, lancees_par)
  values (p_boutique_id, v_nom, p_categorie_id, p_pourcentage, auth.uid())
  returning * into v_solde;

  -- Celles qui ne sont pas déjà remisées par une opération en cours.
  insert into public.soldes_lignes (boutique_id, solde_id, variante_id, prix_avant, prix_barre_avant, prix_solde)
  select p_boutique_id, v_solde.id, v.id, v.prix_millimes, v.prix_barre_millimes, private.prix_solde(v.prix_millimes, p_pourcentage)
    from public.variantes v
   where v.boutique_id = p_boutique_id
     and v.id in (select r.variante_id from private.variantes_du_rayon(p_boutique_id, p_categorie_id) r)
     and not private.variante_en_soldes(p_boutique_id, v.id)
     and private.prix_solde(v.prix_millimes, p_pourcentage) < v.prix_millimes;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Rien à remiser dans ce rayon : il est vide, ou déjà en promotion' using errcode = 'check_violation', hint = 'vide';
  end if;
  v_deja := (select count(*) from private.variantes_du_rayon(p_boutique_id, p_categorie_id)) - v_n;

  update public.variantes v set prix_barre_millimes = l.prix_avant, prix_millimes = l.prix_solde
    from public.soldes_lignes l
   where l.boutique_id = p_boutique_id and l.solde_id = v_solde.id and v.boutique_id = p_boutique_id and v.id = l.variante_id;
  perform private.rafraichit_prix_min(p_boutique_id, x.produit_id)
     from (select distinct v.produit_id from public.soldes_lignes l
             join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
            where l.boutique_id = p_boutique_id and l.solde_id = v_solde.id) x;

  perform private.console_trace(auth.uid(), p_boutique_id, 'soldes.lancer', v_solde.id::text, null,
    jsonb_build_object('nom', v_nom, 'pourcentage', p_pourcentage, 'rayon', p_categorie_id, 'declinaisons', v_n, 'laissees', v_deja));
  return jsonb_build_object('id', v_solde.id, 'nom', v_nom, 'declinaisons', v_n, 'laissees', v_deja);
end;
$$;

create function public.gestion_terminer_soldes(p_boutique_id uuid, p_solde_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_solde   public.soldes;
  v_rendues integer;
  v_gardees integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select s.* into v_solde from public.soldes s where s.boutique_id = p_boutique_id and s.id = p_solde_id for update;
  if not found then
    raise exception 'Cette opération n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  if v_solde.statut <> 'en_cours' then
    raise exception 'Cette opération est déjà terminée' using errcode = 'check_violation', hint = 'etat';
  end if;
  perform 1 from public.variantes v
   where v.boutique_id = p_boutique_id and v.id in (select l.variante_id from public.soldes_lignes l where l.boutique_id = p_boutique_id and l.solde_id = p_solde_id)
   order by v.id for update;

  -- Rendues : celles dont le prix est encore le prix remisé.
  update public.soldes_lignes l set issue = case when v.prix_millimes = l.prix_solde then 'rendue' else 'gardee' end
    from public.variantes v
   where l.boutique_id = p_boutique_id and l.solde_id = p_solde_id and v.boutique_id = p_boutique_id and v.id = l.variante_id;
  update public.variantes v set prix_millimes = l.prix_avant, prix_barre_millimes = l.prix_barre_avant
    from public.soldes_lignes l
   where l.boutique_id = p_boutique_id and l.solde_id = p_solde_id and l.issue = 'rendue'
     and v.boutique_id = p_boutique_id and v.id = l.variante_id;
  select count(*) filter (where l.issue = 'rendue'), count(*) filter (where l.issue = 'gardee') into v_rendues, v_gardees
    from public.soldes_lignes l where l.boutique_id = p_boutique_id and l.solde_id = p_solde_id;
  perform private.rafraichit_prix_min(p_boutique_id, x.produit_id)
     from (select distinct v.produit_id from public.soldes_lignes l
             join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
            where l.boutique_id = p_boutique_id and l.solde_id = p_solde_id) x;

  update public.soldes set statut = 'terminees', terminees_le = clock_timestamp(), terminees_par = auth.uid()
   where boutique_id = p_boutique_id and id = p_solde_id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'soldes.terminer', p_solde_id::text,
    jsonb_build_object('statut', 'en_cours'), jsonb_build_object('statut', 'terminees', 'rendues', v_rendues, 'gardees', v_gardees));
  return jsonb_build_object('nom', v_solde.nom, 'rendues', v_rendues, 'gardees', v_gardees);
end;
$$;

-- L'écran : le module, le réglage des prix barrés, les rayons (pour choisir)
-- et les opérations, en cours d'abord ; ce qu'elles ont vendu (commandes non
-- annulées passées pendant l'opération, sur ses déclinaisons). Toute l'équipe lit.
create function public.gestion_soldes(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.promotions_actif(p_boutique_id),
    'prix_barres', coalesce((private.reglage(p_boutique_id, 'catalogue.afficher_prix_barres'))::boolean, false),
    'rayons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'nom', case when par.id is null then coalesce(c.nom_fr, c.nom_ar)
                           else coalesce(par.nom_fr, par.nom_ar) || ' › ' || coalesce(c.nom_fr, c.nom_ar) end,
               'declinaisons', (select count(*) from private.variantes_du_rayon(p_boutique_id, c.id)))
             order by coalesce(par.position, c.position), coalesce(par.nom_fr, c.nom_fr), par.id nulls first, c.position, c.nom_fr)
        from public.categories c
        left join public.categories par on par.boutique_id = c.boutique_id and par.id = c.parent_id
       where c.boutique_id = p_boutique_id and c.actif), '[]'::jsonb),
    'declinaisons', (select count(*) from private.variantes_du_rayon(p_boutique_id, null)),
    'soldes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'nom', s.nom, 'pourcentage', s.pourcentage, 'statut', s.statut,
               'rayon', (select jsonb_build_object('id', c.id, 'nom', coalesce(c.nom_fr, c.nom_ar), 'slug', c.slug,
                                                   'sous_rayons', (select count(*) from public.categories e where e.boutique_id = c.boutique_id and e.parent_id = c.id))
                           from public.categories c where c.boutique_id = s.boutique_id and c.id = s.categorie_id),
               'lancees_le', s.lancees_le, 'terminees_le', s.terminees_le,
               'lancees_par', (select u.email from auth.users u where u.id = s.lancees_par),
               'terminees_par', (select u.email from auth.users u where u.id = s.terminees_par),
               'declinaisons', (select count(*) from public.soldes_lignes l where l.boutique_id = s.boutique_id and l.solde_id = s.id),
               'produits', (select count(distinct v.produit_id) from public.soldes_lignes l
                              join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
                             where l.boutique_id = s.boutique_id and l.solde_id = s.id),
               'gardees', (select count(*) from public.soldes_lignes l where l.boutique_id = s.boutique_id and l.solde_id = s.id and l.issue = 'gardee'),
               'vendues', ventes.pieces, 'ventes_millimes', ventes.montant)
             order by (s.statut = 'en_cours') desc, s.lancees_le desc)
        from public.soldes s
        cross join lateral (
          select coalesce(sum(cl.quantite), 0) as pieces, coalesce(sum(cl.total_ligne_millimes), 0) as montant
            from public.commande_lignes cl
            join public.commandes o on o.boutique_id = cl.boutique_id and o.id = cl.commande_id
           where cl.boutique_id = s.boutique_id and o.statut <> 'annulee'
             and o.created_at >= s.lancees_le and (s.terminees_le is null or o.created_at < s.terminees_le)
             and cl.variante_id in (select l.variante_id from public.soldes_lignes l where l.boutique_id = s.boutique_id and l.solde_id = s.id)
        ) ventes
       where s.boutique_id = p_boutique_id), '[]'::jsonb));
end;
$$;

-- La fiche produit du backoffice : les opérations en cours sur ce produit,
-- avec leurs déclinaisons (qu'un prix changé ici reste tel quel à la fin).
create function public.gestion_soldes_du_produit(p_boutique_id uuid, p_produit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'nom', x.nom, 'pourcentage', x.pourcentage, 'variantes', x.variantes)
                     order by x.lancees_le)
      from (select s.id, s.nom, s.pourcentage, s.lancees_le, jsonb_agg(l.variante_id order by l.variante_id) as variantes
              from public.soldes s
              join public.soldes_lignes l on l.boutique_id = s.boutique_id and l.solde_id = s.id
              join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
             where s.boutique_id = p_boutique_id and s.statut = 'en_cours' and v.produit_id = p_produit_id
             group by s.id, s.nom, s.pourcentage, s.lancees_le) x), '[]'::jsonb);
end;
$$;

-- La navigation du backoffice : le module, ses codes, ses opérations en cours.
create or replace function public.gestion_promotions_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.promotions_actif(p_boutique_id),
    'codes', (select count(*) from public.codes_promo c where c.boutique_id = p_boutique_id),
    'soldes', (select count(*) from public.soldes s where s.boutique_id = p_boutique_id),
    'soldes_en_cours', (select count(*) from public.soldes s where s.boutique_id = p_boutique_id and s.statut = 'en_cours'));
end;
$$;

revoke execute on function public.gestion_apercu_soldes(uuid, uuid, integer) from public, anon;
revoke execute on function public.gestion_lancer_soldes(uuid, text, uuid, integer) from public, anon;
revoke execute on function public.gestion_terminer_soldes(uuid, uuid) from public, anon;
revoke execute on function public.gestion_soldes(uuid) from public, anon;
revoke execute on function public.gestion_soldes_du_produit(uuid, uuid) from public, anon;
grant  execute on function public.gestion_apercu_soldes(uuid, uuid, integer) to authenticated;
grant  execute on function public.gestion_lancer_soldes(uuid, text, uuid, integer) to authenticated;
grant  execute on function public.gestion_terminer_soldes(uuid, uuid) to authenticated;
grant  execute on function public.gestion_soldes(uuid) to authenticated;
grant  execute on function public.gestion_soldes_du_produit(uuid, uuid) to authenticated;
