-- =====================================================================
-- SkanEcom — 03 · CATALOGUE
-- Catégories · produits · axes d'options · variantes · photos · stock
-- 29/09/2026 — reprise de Maymar (catalogue, réservation du stock) avec
-- boutique_id, unicités par boutique (piège 1) et clés composites (piège 3)
-- =====================================================================
-- Changements par rapport à Maymar :
--   · slug et SKU uniques PAR BOUTIQUE ;
--   · noms : au moins une langue remplie (une boutique peut être en arabe
--     seul), au lieu de nom_fr obligatoire ;
--   · recherche par référence tolérante aux fautes (pg_trgm) sur le nom et
--     le SKU, pour l'outillage et la quincaillerie ;
--   · photos sur R2 (colonne `chemin`), plus sur Supabase Storage ;
--   · le stock d'une variante ne change QUE par un mouvement journalisé
--     (commande, refus, annulation, ou public.mouvement_stock) : le compteur
--     et son journal ne peuvent plus diverger.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Catégories (hiérarchie libre par parent_id : rayons profonds)
-- ---------------------------------------------------------------------
create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  boutique_id    uuid not null references plateforme.boutiques (id) on delete cascade,
  parent_id      uuid,
  slug           text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nom_fr         text,
  nom_ar         text,
  description_fr text,
  description_ar text,
  image_chemin   text,
  position       smallint not null default 0,
  actif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, slug),
  foreign key (boutique_id, parent_id)
    references public.categories (boutique_id, id) on delete set null (parent_id),
  constraint categories_nom_present check (coalesce(nom_fr, nom_ar) is not null),
  constraint categories_pas_son_propre_parent check (parent_id is null or parent_id <> id)
);

comment on column public.categories.parent_id is
  'ON DELETE SET NULL : supprimer une catégorie mère fait remonter ses filles à la racine, visibles, au lieu de les emporter.';

create index categories_parent_idx on public.categories (boutique_id, parent_id);
create index categories_actif_idx  on public.categories (boutique_id, position) where actif;


-- ---------------------------------------------------------------------
-- Produits
-- ---------------------------------------------------------------------
create table public.produits (
  id                  uuid primary key default gen_random_uuid(),
  boutique_id         uuid not null references plateforme.boutiques (id) on delete cascade,
  categorie_id        uuid,
  slug                text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nom_fr              text,
  nom_ar              text,
  description_fr      text,
  description_ar      text,
  marque              text,
  -- Prix d'affichage « à partir de ». La vérité du prix payé est sur la variante.
  prix_min_millimes   bigint check (prix_min_millimes >= 0),
  publie              boolean not null default false,
  mis_en_avant        boolean not null default false,
  position            smallint not null default 0,
  meta_titre_fr       text,
  meta_description_fr text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, slug),
  foreign key (boutique_id, categorie_id)
    references public.categories (boutique_id, id) on delete set null (categorie_id),
  constraint produits_nom_present check (coalesce(nom_fr, nom_ar) is not null)
);

comment on column public.produits.publie is
  'false par défaut : rien n''arrive sur la vitrine par accident.';

create index produits_categorie_idx on public.produits (boutique_id, categorie_id);
create index produits_publie_idx    on public.produits (boutique_id, position) where publie;
create index produits_recherche_idx on public.produits
  using gin (to_tsvector('french', coalesce(nom_fr, '') || ' ' || coalesce(marque, '') || ' ' || coalesce(description_fr, '')));
create index produits_nom_trgm_idx on public.produits
  using gin ((coalesce(nom_fr, '') || ' ' || coalesce(nom_ar, '')) extensions.gin_trgm_ops);


-- ---------------------------------------------------------------------
-- Axes d'options déclarés par produit (taille, couleur, contenance, version…)
-- ---------------------------------------------------------------------
create table public.produit_options (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  produit_id  uuid not null,
  cle         text not null,
  label_fr    text,
  label_ar    text,
  position    smallint not null default 0,
  unique (boutique_id, id),
  unique (boutique_id, produit_id, cle),
  foreign key (boutique_id, produit_id)
    references public.produits (boutique_id, id) on delete cascade,
  constraint produit_options_label_present check (coalesce(label_fr, label_ar) is not null)
);


-- ---------------------------------------------------------------------
-- Variantes : l'unité vendue, stockée et facturée
-- ---------------------------------------------------------------------
create table public.variantes (
  id                  uuid primary key default gen_random_uuid(),
  boutique_id         uuid not null references plateforme.boutiques (id) on delete cascade,
  produit_id          uuid not null,
  sku                 text not null,
  options             jsonb not null default '{}'::jsonb,
  prix_millimes       bigint not null check (prix_millimes >= 0),
  prix_barre_millimes bigint check (prix_barre_millimes >= 0),
  stock               integer not null default 0 check (stock >= 0),
  seuil_alerte_stock  integer not null default 2 check (seuil_alerte_stock >= 0),
  poids_grammes       integer check (poids_grammes >= 0),
  image_chemin        text,
  actif               boolean not null default true,
  position            smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, sku),
  foreign key (boutique_id, produit_id)
    references public.produits (boutique_id, id) on delete cascade,
  constraint variantes_prix_barre_superieur check (
    prix_barre_millimes is null or prix_barre_millimes > prix_millimes
  )
);

comment on column public.variantes.stock is
  'SOURCE DE VÉRITÉ DU STOCK, tenue par la base seule. Ne change que par un mouvement journalisé : réservation à la commande, retour au refus ou à l''annulation, ou public.mouvement_stock (réception, inventaire, casse). Une mise à jour directe est refusée.';

create index variantes_produit_idx   on public.variantes (boutique_id, produit_id, position);
create index variantes_stock_bas_idx on public.variantes (boutique_id, stock) where actif and stock <= 5;
create index variantes_sku_trgm_idx  on public.variantes using gin (sku extensions.gin_trgm_ops);

-- Deux variantes aux mêmes options sur un produit rendraient le sélecteur
-- indéterministe ; jsonb normalise l'ordre des clés.
create unique index variantes_combinaison_unique on public.variantes (boutique_id, produit_id, options);


-- ---------------------------------------------------------------------
-- Photos produit (fichiers sur R2)
-- ---------------------------------------------------------------------
create table public.produit_images (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  produit_id  uuid not null,
  variante_id uuid,
  chemin      text not null,
  alt_fr      text,
  alt_ar      text,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  unique (boutique_id, id),
  foreign key (boutique_id, produit_id)
    references public.produits (boutique_id, id) on delete cascade,
  foreign key (boutique_id, variante_id)
    references public.variantes (boutique_id, id) on delete set null (variante_id)
);

comment on column public.produit_images.chemin is
  'Clé de l''objet sur R2. Les photos restent servies par Cloudflare même si la base tombe.';

create index produit_images_produit_idx on public.produit_images (boutique_id, produit_id, position);


-- ---------------------------------------------------------------------
-- Journal des mouvements de stock
-- ---------------------------------------------------------------------
create type public.motif_mouvement_stock as enum (
  'reception',     -- arrivage fournisseur, stock initial
  'vente',         -- ligne de commande posée
  'retour_refus',  -- refus à la livraison → retour en stock
  'annulation',    -- commande annulée
  'correction',    -- inventaire
  'casse'          -- perte, abîmé
);

create table public.stock_mouvements (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  variante_id uuid not null,
  delta       integer not null check (delta <> 0),
  stock_apres integer not null,
  motif       public.motif_mouvement_stock not null,
  commande_id uuid,              -- clé étrangère ajoutée en migration 04
  commentaire text,
  auteur_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default clock_timestamp(),   -- ordre réel, même dans une transaction
  unique (boutique_id, id),
  foreign key (boutique_id, variante_id)
    references public.variantes (boutique_id, id) on delete cascade
);

comment on table public.stock_mouvements is
  'JOURNAL, pas un solde : il explique chaque changement de variantes.stock. Jamais modifié ni supprimé par l''API.';

create index stock_mouvements_variante_idx on public.stock_mouvements (boutique_id, variante_id, created_at desc);


-- ---------------------------------------------------------------------
-- Le stock ne change que par un mouvement
-- ---------------------------------------------------------------------
-- Les fonctions autorisées à écrire le stock portent la clause
-- `set skanecom.ecriture_stock = 'on'` : le réglage ne vaut que pendant leur
-- exécution. Un UPDATE direct de la colonne, lui, est refusé, quel que soit
-- le rôle (y compris la console et l'import Excel, qui passent par
-- public.mouvement_stock).
create function private.garde_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stock is distinct from old.stock
     and coalesce(current_setting('skanecom.ecriture_stock', true), '') <> 'on' then
    raise exception 'Le stock de la variante % ne change que par un mouvement de stock (public.mouvement_stock)', old.sku
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Une variante créée avec du stock : ce stock initial entre au journal.
create function private.journalise_stock_initial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock > 0 then
    insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, auteur_id)
    values (new.boutique_id, new.id, new.stock, new.stock, 'reception', 'Stock initial', auth.uid());
  end if;
  return new;
end;
$$;

create trigger variantes_garde_stock
  before update of stock on public.variantes
  for each row execute function private.garde_stock();
create trigger variantes_stock_initial
  after insert on public.variantes
  for each row execute function private.journalise_stock_initial();

-- Réception, inventaire ou casse, saisis depuis le backoffice ou l'import.
-- Les motifs vente, retour_refus et annulation sont réservés aux commandes.
create function public.mouvement_stock(
  p_boutique_id uuid,
  p_variante_id uuid,
  p_delta       integer,
  p_motif       public.motif_mouvement_stock,
  p_commentaire text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
set skanecom.ecriture_stock = 'on'
as $$
declare
  v_stock integer;
begin
  if not (private.est_membre(p_boutique_id, '{proprietaire,admin,preparateur}')
          or auth.role() = 'service_role') then
    raise exception 'Mouvement de stock refusé : rôle insuffisant dans cette boutique'
      using errcode = 'insufficient_privilege';
  end if;
  if p_motif not in ('reception', 'correction', 'casse') then
    raise exception 'Le motif % est réservé aux commandes', p_motif
      using errcode = 'check_violation';
  end if;

  update public.variantes
     set stock = stock + p_delta
   where boutique_id = p_boutique_id and id = p_variante_id
  returning stock into v_stock;

  if v_stock is null then
    raise exception 'Variante introuvable dans cette boutique' using errcode = 'no_data_found';
  end if;

  insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, auteur_id)
  values (p_boutique_id, p_variante_id, p_delta, v_stock, p_motif, p_commentaire, auth.uid());

  return v_stock;
end;
$$;

comment on function public.mouvement_stock(uuid, uuid, integer, public.motif_mouvement_stock, text) is
  'Seul chemin pour une réception, un inventaire ou une casse. Verrouille la variante (UPDATE), écrit le mouvement dans la même transaction, refuse un stock négatif (contrainte stock >= 0).';

revoke execute on function private.garde_stock()              from public, anon, authenticated;
revoke execute on function private.journalise_stock_initial() from public, anon, authenticated;
revoke execute on function public.mouvement_stock(uuid, uuid, integer, public.motif_mouvement_stock, text) from public, anon;
grant  execute on function public.mouvement_stock(uuid, uuid, integer, public.motif_mouvement_stock, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- boutique_id immuable et updated_at
-- ---------------------------------------------------------------------
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger produits_updated_at before update on public.produits
  for each row execute function private.set_updated_at();
create trigger variantes_updated_at before update on public.variantes
  for each row execute function private.set_updated_at();

create trigger categories_boutique_immuable before update of boutique_id on public.categories
  for each row execute function private.boutique_immuable();
create trigger produits_boutique_immuable before update of boutique_id on public.produits
  for each row execute function private.boutique_immuable();
create trigger produit_options_boutique_immuable before update of boutique_id on public.produit_options
  for each row execute function private.boutique_immuable();
create trigger variantes_boutique_immuable before update of boutique_id on public.variantes
  for each row execute function private.boutique_immuable();
create trigger produit_images_boutique_immuable before update of boutique_id on public.produit_images
  for each row execute function private.boutique_immuable();
create trigger stock_mouvements_boutique_immuable before update of boutique_id on public.stock_mouvements
  for each row execute function private.boutique_immuable();


-- ---------------------------------------------------------------------
-- RLS du catalogue
-- ---------------------------------------------------------------------
-- Vitrine : seulement ce qui est publié, et seulement des boutiques actives.
-- Équipe : tout ce qui est à sa boutique ; écriture réservée à la gestion
-- (propriétaire et admin).
alter table public.categories       enable row level security;
alter table public.produits         enable row level security;
alter table public.produit_options  enable row level security;
alter table public.variantes        enable row level security;
alter table public.produit_images   enable row level security;
alter table public.stock_mouvements enable row level security;

create policy "categories: lecture publique des catégories actives"
  on public.categories for select
  using (actif and boutique_id in (select private.boutiques_visibles()));
create policy "categories: l'équipe lit tout"
  on public.categories for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "categories: la gestion ajoute"
  on public.categories for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "categories: la gestion modifie"
  on public.categories for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "categories: la gestion supprime"
  on public.categories for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

create policy "produits: lecture publique des produits publiés"
  on public.produits for select
  using (publie and boutique_id in (select private.boutiques_visibles()));
create policy "produits: l'équipe lit tout"
  on public.produits for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "produits: la gestion ajoute"
  on public.produits for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "produits: la gestion modifie"
  on public.produits for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "produits: la gestion supprime"
  on public.produits for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

-- Pour les tables filles, « le produit est publié » se lit sous la RLS de
-- `produits` : la condition de boutique active y est donc déjà incluse.
create policy "options: lecture publique si le produit est publié"
  on public.produit_options for select
  using (exists (select 1 from public.produits p
                 where p.boutique_id = produit_options.boutique_id
                   and p.id = produit_options.produit_id and p.publie));
create policy "options: l'équipe lit tout"
  on public.produit_options for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "options: la gestion ajoute"
  on public.produit_options for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "options: la gestion modifie"
  on public.produit_options for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "options: la gestion supprime"
  on public.produit_options for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

create policy "variantes: lecture publique si actives et produit publié"
  on public.variantes for select
  using (actif and exists (select 1 from public.produits p
                           where p.boutique_id = variantes.boutique_id
                             and p.id = variantes.produit_id and p.publie));
create policy "variantes: l'équipe lit tout"
  on public.variantes for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "variantes: la gestion ajoute"
  on public.variantes for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "variantes: la gestion modifie"
  on public.variantes for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "variantes: la gestion supprime"
  on public.variantes for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

create policy "images: lecture publique si le produit est publié"
  on public.produit_images for select
  using (exists (select 1 from public.produits p
                 where p.boutique_id = produit_images.boutique_id
                   and p.id = produit_images.produit_id and p.publie));
create policy "images: l'équipe lit tout"
  on public.produit_images for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "images: la gestion ajoute"
  on public.produit_images for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "images: la gestion modifie"
  on public.produit_images for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "images: la gestion supprime"
  on public.produit_images for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

-- Le journal de stock n'est jamais public, et ne s'écrit que par les
-- fonctions de la base : aucune policy d'écriture.
create policy "stock: l'équipe lit"
  on public.stock_mouvements for select
  using (boutique_id in (select private.mes_boutiques()));
