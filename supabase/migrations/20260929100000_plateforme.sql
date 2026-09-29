-- =====================================================================
-- SkanEcom — 01 · PLAN DE CONTRÔLE ET AUTORISATIONS
-- Boutiques · domaines · membres · administrateurs · modules · catalogue
-- des réglages · journal d'audit · fonctions d'autorisation
-- 29/09/2026 — cadrage : docs/cadrage/03-reprise-maymar.md §4
-- =====================================================================
--
-- RÈGLES DE TOUT LE SCHÉMA (valables pour les migrations 01 à 04) :
--
-- 1) UNE BASE, TOUTES LES BOUTIQUES. Chaque table de boutique porte
--    `boutique_id NOT NULL`, une unicité `(boutique_id, id)`, et ses clés
--    étrangères vers une autre table de boutique sont COMPOSITES :
--    `(boutique_id, x_id) references x (boutique_id, id)`. Une ligne de la
--    boutique A ne peut donc pas viser une ligne de la boutique B, même
--    écrite par une fonction qui contourne la RLS. `boutique_id` ne change
--    jamais après la création (trigger `private.boutique_immuable`).
--    Les tests de structure (supabase/tests) vérifient ces règles sur
--    TOUTES les tables, y compris celles qu'on ajoutera plus tard.
--
-- 2) DEUX SCHÉMAS HORS DE L'API. PostgREST ne publie que `public`.
--    · `plateforme` : ce qui appartient à SkanEcom (boutiques, membres,
--      modules vendus…). Aucun droit pour anon ni authenticated ; la console
--      y accède côté serveur (service_role), la vitrine et le backoffice
--      par les fonctions `public.*` ci-dessous, qui ne renvoient que le
--      nécessaire.
--    · `private` : fonctions d'autorisation et de trigger.
--
-- 3) RLS PAR BOUTIQUE ET PAR RÔLE, sur toute table de `public`, dès sa
--    création. Les policies filtrent par `boutique_id in (select
--    private.mes_boutiques(...))` : la sous-requête ne dépend d'aucune
--    colonne, Postgres l'évalue UNE fois par requête puis la compare à
--    chaque ligne (au lieu d'appeler une fonction par ligne).
--
-- 4) PRIX EN MILLIMES (entier), colonnes suffixées `_millimes` ; textes en
--    colonnes `_fr` / `_ar` (choix de Maymar, repris tel quel).
--
-- RÔLES D'UNE ÉQUIPE DE BOUTIQUE (plateforme.membres.role) :
--   lecture      lit tout le backoffice de sa boutique
--   preparateur  + fait avancer les commandes, saisit les mouvements de stock
--   confirmateur + fait avancer les commandes, gère les fiches clients
--   admin        + catalogue, stock, zones, réglages
--   proprietaire + tout ce que fait l'admin ; gère l'équipe
-- Les administrateurs de la plateforme (Skander et son père) ne reçoivent
-- AUCUN droit par la RLS : ils passent par la console, qui trace chaque accès.
-- =====================================================================


create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
create schema if not exists plateforme;

-- USAGE sur private : une expression de policy s'évalue avec les droits du
-- rôle qui interroge, y compris anon sur la vitrine.
grant usage on schema private to anon, authenticated, service_role;

revoke all on schema plateforme from public;
grant usage on schema plateforme to service_role;
alter default privileges in schema plateforme grant all on tables    to service_role;
alter default privileges in schema plateforme grant all on sequences to service_role;


-- ---------------------------------------------------------------------
-- Utilitaires de trigger
-- ---------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Une ligne ne change jamais de boutique : la déplacer casserait les clés
-- étrangères composites de ses lignes filles, ou pire, la ferait passer d'un
-- client à un autre.
create function private.boutique_immuable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.boutique_id is distinct from old.boutique_id then
    raise exception 'boutique_id ne change jamais (table %)', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function private.set_updated_at()    from public, anon, authenticated;
revoke execute on function private.boutique_immuable() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Boutiques
-- ---------------------------------------------------------------------
create type plateforme.statut_boutique as enum ('en_preparation', 'active', 'suspendue', 'fermee');

create table plateforme.boutiques (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  nom              text not null,
  statut           plateforme.statut_boutique not null default 'en_preparation',
  langue_defaut    text not null default 'fr' check (langue_defaut in ('fr', 'ar')),
  langues_actives  text[] not null default '{fr}',
  devise           text not null default 'TND' check (devise = 'TND'),
  matricule_fiscal text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint boutiques_langues_valides check (
    langues_actives <@ array['fr', 'ar'] and langue_defaut = any (langues_actives)
  )
);

comment on table plateforme.boutiques is
  'La boutique d''un client. Seul le statut « active » est servi par la vitrine.';
comment on column plateforme.boutiques.devise is
  'TND seul en v1. La colonne existe pour ne pas se fermer la porte : les montants restent en millimes.';

create trigger boutiques_updated_at
  before update on plateforme.boutiques
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- Domaines
-- ---------------------------------------------------------------------
create type plateforme.type_domaine as enum ('sous_domaine', 'personnalise');

create table plateforme.domaines (
  hote              text primary key
                    check (hote = lower(hote) and hote ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'),
  boutique_id       uuid not null references plateforme.boutiques (id) on delete cascade,
  type              plateforme.type_domaine not null default 'personnalise',
  principal         boolean not null default false,
  statut_certificat text not null default 'en_attente'
                    check (statut_certificat in ('en_attente', 'actif', 'erreur')),
  created_at        timestamptz not null default now()
);

comment on table plateforme.domaines is
  'Domaine → boutique. La vitrine trouve la boutique à partir du domaine (public.resoudre_domaine), puis réécrit l''adresse en interne vers /_b/<boutique>/….';

create index domaines_boutique_idx on plateforme.domaines (boutique_id);
create unique index domaines_un_seul_principal on plateforme.domaines (boutique_id) where principal;


-- ---------------------------------------------------------------------
-- Administrateurs de la plateforme et équipes des boutiques
-- ---------------------------------------------------------------------
create type plateforme.role_administrateur as enum ('support', 'super_admin');

create table plateforme.administrateurs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       plateforme.role_administrateur not null,
  created_at timestamptz not null default now()
);

comment on table plateforme.administrateurs is
  'Skander et son père. Accès à la console ; aucun droit par la RLS sur les données des boutiques.';

create type plateforme.role_membre as enum ('proprietaire', 'admin', 'confirmateur', 'preparateur', 'lecture');

create table plateforme.membres (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        plateforme.role_membre not null,
  actif       boolean not null default true,
  invite_par  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (boutique_id, user_id)
);

comment on table plateforme.membres is
  'Équipe de chaque boutique. Une même personne peut être membre de plusieurs boutiques, avec un rôle différent dans chacune.';

create index membres_user_idx on plateforme.membres (user_id) where actif;

create trigger membres_updated_at
  before update on plateforme.membres
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- Modules vendus et catalogue des réglages
-- ---------------------------------------------------------------------
-- Règle de Skander, reprise de Maymar : « quand t'as un doute, fais les deux
-- et mets-le en réglage ». Le CATALOGUE définit chaque réglage une fois pour
-- toutes les boutiques (type, valeur par défaut, visibilité) ; chaque
-- boutique ne stocke que ce qu'elle change (public.reglages). Ajouter un
-- réglage = une ligne ici, jamais une colonne.
create table plateforme.modules (
  code           text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  libelle_fr     text not null,
  description_fr text,
  position       smallint not null default 0
);

create table plateforme.modules_actifs (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  module      text not null references plateforme.modules (code) on delete cascade,
  actif       boolean not null default true,
  active_le   timestamptz not null default now(),
  active_par  uuid references auth.users (id) on delete set null,
  primary key (boutique_id, module)
);

comment on table plateforme.modules_actifs is
  'Modules activés pour un client, par nous, depuis la console : ils font partie de l''offre vendue.';

create table plateforme.reglages_catalogue (
  cle             text primary key check (cle ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  type_valeur     text not null
                  check (type_valeur in ('booleen', 'entier', 'texte', 'choix', 'liste', 'objet')),
  choix_possibles jsonb,
  defaut          jsonb not null,
  groupe          text not null,
  module          text references plateforme.modules (code) on delete restrict,
  public          boolean not null default false,
  libelle_fr      text not null,
  libelle_ar      text,
  description_fr  text,
  position        smallint not null default 0,
  constraint reglages_catalogue_choix check (
    (type_valeur = 'choix') = (choix_possibles is not null and jsonb_typeof(choix_possibles) = 'array')
  )
);

comment on column plateforme.reglages_catalogue.public is
  'true = la vitrine peut le lire (public.configuration_publique). false = backoffice seulement.';
comment on column plateforme.reglages_catalogue.module is
  'Renseigné = réglage d''un module ; il n''a d''effet que si le module est actif pour la boutique.';

insert into plateforme.modules (code, libelle_fr, description_fr, position) values
  ('paiement_en_ligne', 'Paiement en ligne',          'Konnect ou Flouci, sur le compte marchand du client.', 1),
  ('retrait_magasin',   'Retrait en magasin',         'Mode de livraison « retrait » : gratuit, avec adresse, horaires et délai de préparation.', 2),
  ('conseil_whatsapp',  'Demander conseil (WhatsApp)', 'Bouton sur la fiche produit, message prérempli avec le produit.', 3),
  ('sav',               'Service après-vente',        'Demande de SAV (produit, numéro de série, problème, photo) reçue au backoffice.', 4),
  ('comptes_pro',       'Comptes professionnels',     'Comptes pro validés par le commerçant, prix pro par variante.', 5),
  ('devis',             'Demande de devis',           'Le panier devient une demande ; le commerçant répond avec un prix.', 6);

-- Valeurs par défaut = les décisions du PRD de Maymar, devenues celles de
-- toutes les boutiques (03-reprise-maymar.md §6).
insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('compte.obligatoire', 'booleen', null, 'true', 'commande', null, true,
     'Compte client obligatoire',
     'Oui = il faut un compte pour commander. Non = commande en invité autorisée (plus de risque de refus en paiement à la livraison).', 1),
  ('commande.mode_confirmation', 'choix', '["telephonique", "automatique"]', '"telephonique"', 'commande', null, true,
     'Confirmation des commandes',
     'Téléphonique = la commande attend un appel avant préparation. Automatique = elle passe seule en confirmée.', 2),
  ('commande.prefixe_numero', 'texte', null, '""', 'commande', null, false,
     'Préfixe des numéros de commande',
     'Exemple : MAY donne MAY-2026-00001. Vide = les trois premières lettres de l''identifiant de la boutique.', 3),
  ('livraison.mode_frais', 'choix', '["fixe", "zone"]', '"fixe"', 'livraison', null, true,
     'Calcul des frais de livraison',
     'Fixe = le même montant partout. Zone = la grille des zones de livraison s''applique.', 10),
  ('livraison.frais_fixes_millimes', 'entier', null, '7000', 'livraison', null, true,
     'Frais de livraison fixes (millimes)',
     'Utilisé en mode fixe, et en mode zone pour un gouvernorat sans zone. 7000 millimes = 7,000 TND.', 11),
  ('livraison.seuil_gratuite_millimes', 'entier', null, '0', 'livraison', null, true,
     'Livraison offerte à partir de (millimes)',
     '0 = jamais offerte. Exemple : 500000 = livraison offerte dès 500 TND d''achat.', 12),
  ('livraison.transporteur', 'texte', null, '""', 'livraison', null, true,
     'Transporteur',
     'Nom du transporteur affiché au client et sur le bordereau.', 13),
  ('paiement.cod_actif', 'booleen', null, 'true', 'paiement', null, true,
     'Paiement à la livraison',
     'Mode de paiement par défaut.', 20),
  ('paiement.konnect_actif', 'booleen', null, 'false', 'paiement', 'paiement_en_ligne', true,
     'Paiement en ligne Konnect',
     'Désactivé tant que le compte marchand du client n''est pas ouvert.', 21),
  ('catalogue.afficher_prix_barres', 'booleen', null, 'false', 'catalogue', null, true,
     'Afficher les prix barrés',
     'Oui = l''ancien prix barré s''affiche à côté du prix. Non = seul le prix payé s''affiche.', 30),
  ('contact.whatsapp', 'texte', null, '""', 'contact', null, true,
     'Numéro WhatsApp',
     'Format international, sans espace (exemple : 21612345678). Sert au bouton de conseil et à la page de secours en cas de panne.', 40),
  ('contact.telephone', 'texte', null, '""', 'contact', null, true,
     'Téléphone de la boutique',
     'Affiché sur la vitrine.', 41);


-- ---------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------
-- Sans clé étrangère, volontairement : un journal survit à la suppression
-- de ce qu'il décrit.
create table plateforme.journal_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  acteur      uuid,
  boutique_id uuid,
  action      text not null,
  cible       text,
  avant       jsonb,
  apres       jsonb,
  ip          inet
);

create index journal_audit_boutique_idx on plateforme.journal_audit (boutique_id, at desc);


-- Défense en profondeur : même si un droit était accordé par erreur sur
-- plateforme, la RLS sans policy ne laisserait rien passer.
alter table plateforme.boutiques          enable row level security;
alter table plateforme.domaines           enable row level security;
alter table plateforme.administrateurs    enable row level security;
alter table plateforme.membres            enable row level security;
alter table plateforme.modules            enable row level security;
alter table plateforme.modules_actifs     enable row level security;
alter table plateforme.reglages_catalogue enable row level security;
alter table plateforme.journal_audit      enable row level security;


-- ---------------------------------------------------------------------
-- Fonctions d'autorisation (utilisées par les policies)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER : elles lisent `plateforme`, que les rôles de l'API ne
-- voient pas. search_path vide : chaque nom est qualifié, rien ne peut être
-- détourné par un schéma temporaire.

-- Boutiques dont l'utilisateur connecté est membre actif, avec l'un des
-- rôles donnés (null = n'importe quel rôle).
create function private.mes_boutiques(p_roles text[] default null)
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
    and (p_roles is null or m.role::text = any (p_roles));
$$;

create function private.est_membre(p_boutique_id uuid, p_roles text[] default null)
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
  );
$$;

-- Boutiques servies par la vitrine.
create function private.boutiques_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from plateforme.boutiques b where b.statut = 'active';
$$;

create function private.est_administrateur(p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from plateforme.administrateurs a
    where a.user_id = auth.uid()
      and (p_roles is null or a.role::text = any (p_roles))
  );
$$;

revoke execute on function private.mes_boutiques(text[])          from public, anon, authenticated;
revoke execute on function private.est_membre(uuid, text[])       from public, anon, authenticated;
revoke execute on function private.boutiques_visibles()           from public, anon, authenticated;
revoke execute on function private.est_administrateur(text[])     from public, anon, authenticated;
grant  execute on function private.mes_boutiques(text[])          to anon, authenticated, service_role;
grant  execute on function private.est_membre(uuid, text[])       to anon, authenticated, service_role;
grant  execute on function private.boutiques_visibles()           to anon, authenticated, service_role;
grant  execute on function private.est_administrateur(text[])     to authenticated, service_role;


-- ---------------------------------------------------------------------
-- API : trouver la boutique d'un domaine, lister mes accès
-- ---------------------------------------------------------------------
create function public.resoudre_domaine(p_hote text)
returns table (
  boutique_id     uuid,
  slug            text,
  nom             text,
  statut          text,
  langue_defaut   text,
  langues_actives text[],
  hote_principal  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.slug, b.nom, b.statut::text, b.langue_defaut, b.langues_actives,
         (select p.hote from plateforme.domaines p where p.boutique_id = b.id and p.principal)
  from plateforme.domaines d
  join plateforme.boutiques b on b.id = d.boutique_id
  where d.hote = lower(btrim(p_hote));
$$;

comment on function public.resoudre_domaine(text) is
  'Appelée par la vitrine à chaque domaine inconnu de son annuaire. Renvoie aussi le statut : c''est la vitrine qui décide quoi afficher pour une boutique en préparation ou suspendue.';

create function public.mes_acces()
returns table (boutique_id uuid, slug text, nom text, statut text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.slug, b.nom, b.statut::text, m.role::text
  from plateforme.membres m
  join plateforme.boutiques b on b.id = m.boutique_id
  where m.user_id = auth.uid() and m.actif
  order by b.nom;
$$;

comment on function public.mes_acces() is
  'Boutiques du backoffice de l''utilisateur connecté, avec son rôle dans chacune.';

revoke execute on function public.mes_acces() from public, anon;
grant  execute on function public.mes_acces() to authenticated, service_role;
