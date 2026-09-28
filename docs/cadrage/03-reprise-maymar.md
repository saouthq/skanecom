# SkanEcom — Reprise du code Maymar et modèle de données multi-boutique (v0)

> Statut : **proposition à valider**. Rédigé le 28/09/2026 à partir de la lecture directe du dépôt `saouthq/maymar`, branche `dev` au 13/08/2026, version v1.9.9.1.
> Principe : **on ne jette pas le moteur de Maymar, on le rend multi-boutique.** La marque Maymar (logo, palette, ton) reste à Maymar. Sa charte « premium sobre » devient le **premier thème** de SkanEcom.

---

## 1. Ce qui existe dans Maymar

### 1.1 Base de données (`supabase/migrations/`, 8 migrations du 10/08/2026)

| Élément | Contenu | Qualité |
|---|---|---|
| `profils` + enum `role_utilisateur` (client, staff, admin) | Profil adossé à `auth.users`, rôle en base (pas dans le JWT), trigger anti-auto-promotion | Bonne, mais rôles **globaux** |
| `reglages` | Clé/valeur jsonb, typés, groupés, `public` lisible par la vitrine, extensible sans migration | **Excellente** : c'est déjà le moteur de modules de SkanEcom |
| `zones_livraison` + `gouvernorats` | 24 gouvernorats (FR/AR) rattachés chacun à une zone tarifaire par une FK sur le gouvernorat | Bonne, mais le rattachement est **global** |
| `categories`, `produits`, `produit_options`, `variantes`, `produit_images` | Catalogue à variantes, prix en **millimes** (entier), stock par variante, SKU, poids, recherche plein texte française | Très bonne |
| `stock_mouvements` + enum `motif_mouvement_stock` | Journal des mouvements (réception, vente, retour de refus, annulation, correction, casse) | Très bonne |
| `adresses`, `commandes`, `commande_lignes`, `commande_evenements` | Cycle COD complet (`recue` → `confirmee` → `expediee` → `livree` / `refusee` / `annulee`), origine du refus obligatoire, historique immuable, lignes figées (nom, prix, SKU copiés) | **Excellente** : c'est le cœur de la valeur |
| `reserve_stock_ligne()` | Réserve le stock à la pose de la ligne, dans la transaction, avec verrou de ligne ; refuse si stock insuffisant, sauf réglage | Très bonne |
| `reintegre_stock_commande()` | Remet en stock au refus ou à l'annulation, sans doublon (`stock_reintegre`) | Très bonne |
| `trace_statut_commande()` | Journalise chaque changement de statut, horodate les étapes | Très bonne |
| `frais_livraison_millimes()` | Calcule les frais selon le réglage fixe ou par zone, avec repli sur le tarif fixe | Bonne |
| Durcissement | `search_path` figé, helpers d'autorisation déplacés dans le schéma `private`, `SECURITY INVOKER` quand c'est possible, RLS sur toutes les tables | Très bonne |

### 1.2 Application (`src/`)

- **Next.js 16, React 19, Tailwind 4.** Pages : accueil, catalogue à filtres de variantes, rayon, fiche produit, recherche, 404, sitemap, robots.
- **Composants** : carte produit, filtres, sélection de variante, bloc d'achat, prix, état du stock, en-tête, pied de page, tri, icônes.
- **`lib/`** :
  - `catalogue.ts` : lectures ;
  - `filtres.ts` ;
  - `panier.ts` et `panier-contrat.ts` : panier local ;
  - `prix.ts` : format des millimes ;
  - `boutique.ts` : le « cadre » (réglages, zones, rayons) lu une fois par requête ;
  - `i18n/` : FR actif, AR prêt, `dir` automatique.
- **Thème par jetons** : `docs/brand/tokens.css` (primitives `--maymar-*`) et `src/app/marque.css`. Aucune couleur n'est écrite en dur dans les composants.
- **Client Supabase de la vitrine** en clé `anon` seulement : la RLS borne ce qui peut fuiter.

---

## 2. Garder, adapter ou jeter

| Élément | Décision | Ce qu'on change |
|---|---|---|
| Principe des réglages clé/valeur | **Garder** | Clé primaire `(boutique_id, cle)` ; un **catalogue des réglages** au niveau plateforme (définition, type, valeur par défaut, offre minimale requise) |
| Prix en millimes (entiers) | **Garder** | Ajouter une `devise` par boutique (TND seul en v1) pour ne pas se fermer la porte |
| Colonnes `_fr` / `_ar` | **Garder, assouplir** | Une boutique peut être **uniquement en arabe** : `nom_fr NOT NULL` devient la contrainte « au moins une langue, et la langue par défaut de la boutique est remplie » ; index de recherche par langue |
| Catalogue, variantes, stock, journal | **Garder** | `boutique_id` partout ; unicités **par boutique** (voir §3) |
| Cycle de commande, refus tracé, historique | **Garder** | `boutique_id`, numéro par boutique, clé d'idempotence, statut `a_arbitrer` pour les commandes rejouées après une panne |
| Triggers de stock et de statut | **Garder, sécuriser** | Vérifier que la commande et la variante appartiennent à la même boutique (FK composites, §4.1) ; lire les réglages **de la boutique** |
| `frais_livraison_millimes(gouvernorat)` | **Adapter** | Signature `(boutique_id, gouvernorat)` ; zones par boutique |
| `gouvernorats` | **Garder comme référentiel partagé** | Le rattachement à une zone passe dans une table par boutique (`zones_gouvernorats`) |
| `profils.role` global, `est_staff()`, `est_admin()` | **Remplacer** | `membres(boutique_id, user_id, role)` + `private.est_membre(boutique_id, roles[])` ; rôle super-admin plateforme séparé |
| `adresses` rattachées à l'utilisateur global | **Adapter** | Rattachées au **client de la boutique** (`clients`) : chaque commerçant ne voit que ses clients |
| `mode_paiement` enum `('cod','konnect')` | **Généraliser** | Table `psp_comptes` par boutique (Konnect, Flouci, puis ClicToPay), le COD toujours disponible |
| Séquence `commandes_numero_seq` + préfixe `MAY-` | **Remplacer** | Compteur par boutique + préfixe réglable |
| Seed de démarrage | **Jeter** | Devient le jeu de données de la boutique Maymar |
| Vitrine (pages, composants, panier, filtres, i18n) | **Garder, paramétrer** | Voir §5 |
| Jetons `--maymar-*`, `marque.css` | **Transformer en 1er thème** | Primitives renommées `--theme-*`, valeurs lues depuis la configuration de thème de la boutique |
| Logo, planche, charte, maquettes, les 28 directions | **Laisser à Maymar** | Référence du thème n°1 et exemple de ce qu'on sait faire |

---

## 3. Les pièges repérés (à corriger en priorité)

1. **Unicités globales.**
   - `categories.slug`, `produits.slug`, `variantes.sku` et `commandes.numero` sont uniques **dans toute la base**. Deux boutiques ne pourraient pas avoir chacune un produit `valise-cabine`.
   - Correction : `unique (boutique_id, slug)`, et ainsi de suite.
2. **Le rôle « staff » vaut pour toute la base.**
   - Aujourd'hui, `private.est_staff()` renvoie vrai pour un employé, et **toutes** les policies « le staff lit tout » s'appliquent. En multi-boutique, l'employé d'une boutique lirait les commandes de toutes les autres.
   - C'est la correction n°1.
3. **Les triggers `SECURITY DEFINER` contournent la RLS.**
   - `reserve_stock_ligne()` décrémente la variante désignée par la ligne sans vérifier sa boutique.
   - Sans FK composite, une ligne de commande de la boutique A pourrait viser une variante de la boutique B.
   - Correction : la rendre **impossible au niveau du schéma** (§4.1).
4. **Réglages globaux lus par les fonctions.**
   - `frais_livraison_millimes()` et `reserve_stock_ligne()` lisent `reglages` par `cle` seule (`stock.autoriser_rupture`, `livraison.mode_frais`).
   - Correction : ajouter `boutique_id` à toutes ces lectures.
5. **Zones de livraison globales.**
   - `gouvernorats.zone_id` est une FK unique pour toute la base : une seule grille tarifaire pour toutes les boutiques.
6. **Numérotation globale.**
   - La séquence unique et le préfixe `MAY-` sont écrits en dur (`commandes.sql`).
7. **Lecture publique de toutes les boutiques.**
   - Les policies « lecture publique des produits publiés » laissent un visiteur anonyme lire les produits publiés de **toutes** les boutiques par l'API.
   - Ce sont des données publiques, ce n'est donc pas une fuite, mais c'est une porte au *scraping* en masse.
   - Correction : la façade applique des limites, les requêtes filtrent toujours par `boutique_id`, avec des index composites `(boutique_id, …)`.
   - Les brouillons restent protégés par la RLS.
8. **Cache non partitionné.**
   - `revalidate = 300` sur les pages : en multi-boutique, la clé de cache doit inclure la boutique.
   - L'invalidation se fait par étiquette `boutique:<id>` (voir `02-infrastructure.md`, §3.1).
9. **Valeurs Maymar en dur dans le front.**
   - 185 mentions de « maymar » dans `src/` (grep du 28/09/2026).
   - `https://maymar.tn` par défaut dans `layout.tsx`, `robots.ts` et `sitemap.ts`.
   - Clé du panier `maymar.panier.v1`, en-tête `x-application-name: maymar-vitrine`.
   - Tout cela vient désormais de la boutique résolue.
10. **Images dans Supabase Storage.**
    - Si Supabase tombe, les vitrines perdent leurs photos.
    - Les images passent sur R2, servies par la façade (voir `02-infrastructure.md`, §2).

---

## 4. Modèle de données cible (première version)

### 4.1 Règles de conception

- **Chaque table de boutique porte `boutique_id NOT NULL`.** Aucune requête ne croise deux boutiques. C'est la condition pour déménager une boutique d'une cellule à l'autre (`02-infrastructure.md`, §3.4).
- **Clés étrangères composites.**
  - Chaque table de boutique a `unique (boutique_id, id)`.
  - Les références sont `foreign key (boutique_id, variante_id) references variantes (boutique_id, id)`.
  - Une référence entre boutiques devient impossible, même pour une fonction qui contourne la RLS.
- **Index composites en tête `(boutique_id, …)`** sur toutes les listes (commandes par statut, produits publiés, etc.).
- **RLS par boutique.**
  - Lecture publique : seulement les objets publiés.
  - Membres : lecture et écriture selon leur rôle, via `private.est_membre(boutique_id, roles)`.
  - Fonction `STABLE SECURITY DEFINER`, appelée sous la forme `(select private.est_membre(...))` pour être évaluée une seule fois par requête.
- **Écritures sensibles uniquement par fonctions SQL** : création de commande, changement de statut, mouvements de stock. Elles recalculent tout côté serveur, comme le fait déjà Maymar.

### 4.2 Plan de contrôle (schéma `plateforme`)

| Table | Colonnes clés | Rôle |
|---|---|---|
| `boutiques` | `id`, `slug`, `nom`, `statut` (essai, active, grace, restreinte, suspendue, fermee), `cellule_id`, `offre_code`, `langue_defaut`, `langues_actives`, `devise`, `profil_juridique`, `matricule_fiscal`, `created_at` | La boutique elle-même |
| `domaines` | `hote` (unique), `boutique_id`, `type` (sous_domaine, personnalise), `principal`, `statut_certificat` | Alimente l'annuaire de la façade |
| `membres` | `boutique_id`, `user_id`, `role` (proprietaire, admin, confirmateur, preparateur, lecture), `invite_par` | Équipe de chaque boutique |
| `administrateurs` | `user_id`, `role` (support, exploitation, super_admin) | Équipe SkanEcom, tout accès tracé |
| `offres` | `code`, `nom`, `prix_millimes` par période, `limites` jsonb, `reglages_autorises` jsonb | Une offre = un paquet de réglages et de limites |
| `reglages_catalogue` | `cle`, `type_valeur`, `defaut`, `offre_minimale`, `public`, `libelle_fr/ar` | Définition des réglages (la table `reglages` de Maymar, promue) |
| `abonnements` | `boutique_id`, `offre_code`, `periode`, `debut`, `fin`, `statut`, `grace_jusqu_a` | Abonnement prépayé |
| `factures`, `paiements_abonnement` | Numéro, montants HT/TVA/timbre, retenue, statut TEIF, référence TTN | Facturation conforme |
| `cellules` | `id`, `projet_ref`, `region`, `statut`, `capacite` | Carte des cellules |
| `journal_audit` | `acteur`, `boutique_id`, `action`, `cible`, `avant`, `apres`, `ip`, `at` | Traçabilité |
| `signalements` | `boutique_id`, `motif`, `statut`, `decision` | Abus, retraits |

### 4.3 Données de chaque boutique

| Table | Origine | Notes |
|---|---|---|
| `reglages` | Maymar | `(boutique_id, cle)` → valeur |
| `zones_livraison`, `zones_gouvernorats` | Maymar, rattachement déplacé | Grille tarifaire propre à chaque boutique |
| `categories`, `produits`, `produit_options`, `variantes`, `produit_images`, `stock_mouvements` | Maymar | `boutique_id` + unicités par boutique ; images sur R2 |
| `clients` | Nouveau | `boutique_id`, `user_id` (nullable, achat en invité), `telephone`, `nom`, compteurs de commandes et de refus, `niveau_risque` |
| `adresses` | Maymar, adaptée | Rattachées à `clients` |
| `commandes`, `commande_lignes`, `commande_evenements` | Maymar | + `numero` par boutique, `cle_idempotence` unique par boutique, `origine` (vitrine, differee, manuelle, import), statut `a_arbitrer` |
| `confirmations` | Nouveau | Tentatives par commande : canal (appel, WhatsApp, SMS), résultat, auteur |
| `expeditions` | Nouveau | Transporteur, numéro de colis, statut, frais aller et retour, cash attendu et reversé, retenue de 3 %, date de reversement |
| `transporteurs_comptes`, `psp_comptes` | Nouveau | Identifiants chiffrés (Vault), `actif` |
| `theme` | Nouveau | Code du thème, jetons (couleurs, polices, logo), sections d'accueil (jsonb versionné) |
| `outbox` | Nouveau | Messages à envoyer (SMS, WhatsApp, livreur, e-mail, instantané), statut, tentatives |

**Référentiels partagés** (lecture seule pour les boutiques) : `gouvernorats`, plus tard `delegations`, et la liste des transporteurs et PSP pris en charge.

**Ouverture pour plus tard : le catalogue partagé fournisseur → revendeurs.** On garde `produits.boutique_id` = propriétaire. Une future table `catalogue_partage(boutique_source, boutique_revendeur, produit_id, marge)` pourra s'ajouter sans casser le modèle. Point de vigilance : cette table sera la seule exception à la règle « aucune requête ne croise deux boutiques ». Elle devra rester dans une même cellule, ou passer par des copies.

---

## 5. Le front : de la vitrine Maymar au moteur de thèmes

| Aujourd'hui (Maymar) | Demain (SkanEcom) |
|---|---|
| Une boutique, des variables d'environnement | La boutique est **résolue à partir du domaine** par la façade ; l'application reçoit un en-tête signé (identifiant de boutique, cellule) |
| `revalidate = 300` | Pages en cache à durée longue, **purge par étiquettes** `boutique:<id>`, `produit:<id>` |
| Jetons `--maymar-*` écrits dans `tokens.css` | Jetons `--theme-*` générés depuis la configuration de thème de la boutique ; thème n°1 = charte Maymar |
| Accueil écrit en dur (sections Maymar) | Accueil composé de **sections configurables** : bandeau, rayons, produits mis en avant, réassurance, texte, galerie |
| `LANGUE_ACTIVE = "fr"` | Langue par défaut et langues actives lues dans les réglages de la boutique (le code est déjà prêt : `lib/i18n/index.ts`) |
| Libellés d'interface dans `fr.ts` | Idem, + `ar.ts` complet ; les textes éditables par le commerçant vivent en base |
| Panier `maymar.panier.v1` | Clé par boutique ; le contrat du panier (`panier-contrat.ts`) est repris |
| URL du site par défaut `https://maymar.tn` | Domaine principal de la boutique résolue |

**Ordre de reprise proposé à l'étape 1 :**
1. Schéma multi-boutique et tests d'isolation.
2. Résolution de la boutique par le domaine.
3. Lectures du catalogue filtrées par boutique.
4. Thème par jetons et sections.
5. Tunnel de commande COD par fonction SQL.
6. Backoffice : commandes d'abord, catalogue ensuite.

---

## 6. Ce que ça implique pour Maymar

- Maymar devient **une boutique sur SkanEcom** (cellule interne, domaine `maymar.tn`), plus un site à part.
- Son dépôt `saouthq/maymar` devient une **archive de référence** : charte, maquettes, directions, photos.
- Son contenu (catalogue, réglages, zones) est migré par un script d'import, qui sert aussi de premier test de l'import CSV/Excel.
- Les décisions du PRD Maymar deviennent les **réglages par défaut** de SkanEcom :
  - COD par défaut ;
  - Konnect intégré mais désactivé ;
  - compte client obligatoire par défaut ;
  - confirmation téléphonique.

  Chaque boutique peut ensuite changer ces réglages.
