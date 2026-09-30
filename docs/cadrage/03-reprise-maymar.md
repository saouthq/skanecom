# SkanEcom — Reprise du code Maymar et modèle de données multi-boutique (v0)

> Statut : **schéma construit le 29/09** (`supabase/migrations/`, voir §7). Rédigé le 28/09/2026, mis à jour le 29/09 pour la marque blanche (10 à 50 clients installés par nous). Lecture directe du dépôt `saouthq/maymar`, branche `dev` au 13/08/2026, version v1.9.9.1.
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
| Principe des réglages clé/valeur | **Garder** | Clé primaire `(boutique_id, cle)` ; un **catalogue des réglages** au niveau plateforme (définition, type, valeur par défaut, module concerné) |
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
   - `revalidate = 300` sur les pages : en multi-boutique, la clé de cache doit inclure la boutique. Le cache de Workers **n'inclut pas le domaine** : l'application réécrit donc l'adresse en interne avec l'identifiant de la boutique (`/_b/<boutique>/…`, voir `02-infrastructure.md`, §2 et §5.2). Le dossier s'appelle `src/app/%5Fb/[boutique]/` : Next.js ne route pas un dossier qui commence par « _ ». Principe testé chez Cloudflare le 29/09 (`prototype/vitrine-workers/src/proxy.ts`).
   - L'invalidation se fait boutique par boutique, quand le commerçant modifie son catalogue.
9. **Valeurs Maymar en dur dans le front.**
   - 185 mentions de « maymar » dans `src/` (grep du 28/09/2026).
   - `https://maymar.tn` par défaut dans `layout.tsx`, `robots.ts` et `sitemap.ts`.
   - Clé du panier `maymar.panier.v1`, en-tête `x-application-name: maymar-vitrine`.
   - Tout cela vient désormais de la boutique résolue.
10. **Fiches produit et pages rayon jamais mises en cache** (trouvé par le prototype du 28/09).
    - Sur une route à segment dynamique (`/produit/[slug]`), `revalidate = 300` ne suffit pas : Next.js exige aussi `generateStaticParams`, sans quoi chaque visite interroge la base.
    - Correction : `generateStaticParams` qui renvoie une liste vide (génération à la première visite, puis cache).
    - Les pages qui lisent les filtres dans l'adresse (catalogue, rayon, recherche) restent dynamiques : à repenser dans le thème.
11. **Catalogue chargé entièrement en mémoire.**
    - `src/lib/catalogue.ts` charge tout le catalogue publié en une requête, puis filtre et trie en mémoire. Son commentaire le dit : c'est prévu pour « des centaines de références », et au-delà d'environ 1 000 il faut filtrer en SQL.
    - La quincaillerie et le distributeur d'outillage dépasseront ce seuil.
    - Correction : filtres, tri et pagination en base, recherche Postgres avec `pg_trgm` (voir `02-infrastructure.md`, §3).
12. **Images dans Supabase Storage.**
    - Si Supabase tombe, les vitrines perdent leurs photos.
    - Les images passent sur R2, servies par Cloudflare (voir `02-infrastructure.md`, §2).

---

## 4. Modèle de données cible (première version)

### 4.1 Règles de conception

- **Chaque table de boutique porte `boutique_id NOT NULL`.** Aucune requête ne croise deux boutiques. C'est ce qui garantit l'isolation entre clients, permet d'exporter ou de restaurer une seule boutique, et laisse la porte ouverte à plusieurs bases si un jour on grandit beaucoup (voir l'annexe grande échelle).
- **Clés étrangères composites.**
  - Chaque table de boutique a `unique (boutique_id, id)`.
  - Les références sont `foreign key (boutique_id, variante_id) references variantes (boutique_id, id)`.
  - Une référence entre boutiques devient impossible, même pour une fonction qui contourne la RLS.
- **Index composites en tête `(boutique_id, …)`** sur toutes les listes (commandes par statut, produits publiés, etc.).
- **RLS par boutique.**
  - Lecture publique : seulement les objets publiés, des boutiques actives.
  - Membres : lecture et écriture selon leur rôle, via `boutique_id in (select private.mes_boutiques(roles))`.
  - `private.mes_boutiques()` est `STABLE SECURITY DEFINER` et ne dépend d'aucune colonne : Postgres l'évalue une seule fois par requête, puis compare chaque ligne à la liste. Un appel `private.est_membre(boutique_id, roles)` dans la policy serait, lui, exécuté ligne par ligne. `est_membre` sert dans les fonctions.
- **Écritures sensibles uniquement par fonctions SQL** : création de commande, changement de statut, mouvements de stock. Elles recalculent tout côté serveur, comme le fait déjà Maymar.

### 4.2 Plan de contrôle (schéma `plateforme`)

| Table | Colonnes clés | Rôle |
|---|---|---|
| `boutiques` | `id`, `slug`, `nom`, `statut` (en_preparation, active, suspendue, fermee), `langue_defaut`, `langues_actives`, `devise`, `matricule_fiscal`, `created_at` | La boutique d'un client |
| `domaines` | `hote` (unique), `boutique_id`, `type` (sous_domaine, personnalise), `principal`, `statut_certificat` | Alimente l'annuaire de la façade |
| `membres` | `boutique_id`, `user_id`, `role` (proprietaire, admin, confirmateur, preparateur, lecture), `invite_par` | Équipe de chaque boutique |
| `administrateurs` | `user_id`, `role` (support, super_admin) | Skander et son père : accès à la console, tout accès à une boutique est tracé |
| `reglages_catalogue` | `cle`, `type_valeur`, `defaut`, `module`, `public`, `libelle_fr/ar` | Définition des réglages disponibles pour toutes les boutiques (la table `reglages` de Maymar, promue) |
| `contrats` | `boutique_id`, `date_debut`, `engagement_mois`, `prix_mise_en_place_millimes`, `prix_mensuel_millimes`, `statut` | Le contrat de service du client ; la facturation est faite par nous (TEIF), pas en libre-service |
| `factures` | Numéro, montants HT/TVA/timbre, retenue, statut TEIF, référence TTN | Nos factures de mise en place et d'abonnement |
| `mise_en_place` | `boutique_id`, `etape`, `fait_le`, `par` | Suivi de la liste de mise en place (PRD §7) |
| `journal_audit` | `acteur`, `boutique_id`, `action`, `cible`, `avant`, `apres`, `ip`, `at` | Traçabilité |
| `modules_actifs` | `boutique_id`, `module`, `actif`, `reglages` | Modules activés par client (prix pro, retrait en magasin, paiement en ligne…) |

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
| Une boutique, des variables d'environnement | La boutique est **trouvée à partir du domaine**, puis l'adresse est réécrite en interne avec son identifiant (`/_b/<boutique>/…`) |
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

- Maymar devient **une boutique sur SkanEcom** (domaine `maymar.tn`), plus un site à part.
- Son dépôt `saouthq/maymar` devient une **archive de référence** : charte, maquettes, directions, photos.
- Son contenu (catalogue, réglages, zones) est migré par un script d'import, qui sert aussi de premier test de l'import CSV/Excel.
- Les décisions du PRD Maymar deviennent les **réglages par défaut** de SkanEcom :
  - COD par défaut ;
  - Konnect intégré mais désactivé ;
  - compte client obligatoire par défaut ;
  - confirmation téléphonique.

  Chaque boutique peut ensuite changer ces réglages.

---

## 7. État de la reprise (29/09/2026)

**Construit** (`supabase/migrations/`, 7 migrations) et **vérifié** par 217 tests pgTAP (`supabase/tests/`), qui tournent en CI sur l'image Supabase et sur la base locale simulée :

| Partie | Contenu |
|---|---|
| Plan de contrôle (`plateforme`, hors de l'API) | `boutiques`, `domaines`, `membres`, `administrateurs`, `modules`, `modules_actifs`, `reglages_catalogue`, `journal_audit` |
| Autorisations (`private`) | `mes_boutiques(roles)`, `est_membre`, `boutiques_visibles`, `mes_clients`, `est_administrateur` |
| Données des boutiques (`public`) | `reglages`, `zones_livraison`, `zones_gouvernorats`, `categories`, `produits`, `produit_options`, `variantes`, `produit_images`, `stock_mouvements`, `clients`, `adresses`, `compteurs_commandes`, `commandes`, `commande_lignes`, `commande_evenements` ; référentiel partagé `gouvernorats` |
| Vitrine (`public`, migration 05) | `themes` (couleurs, polices, logo, sections, validés par la base), vue `vitrine_produits`, `boutique_publique` (tout le cadre d'une page en un appel), `liste_produits` (filtres, tri, pagination et facettes en base), fichiers rangés sous `<slug>/…` |
| API (`public`) | `resoudre_domaine`, `annuaire_domaines` (clé de service), `configuration_publique`, `frais_livraison_millimes`, `mes_acces`, `reglages_boutique`, `inscrire_client`, `mouvement_stock` |

Les pièges 1 à 6 du §3 sont corrigés dans le schéma. Le piège 7 l'est en partie : index composites, et seules les boutiques actives sont lisibles ; les limites de débit de la façade restent à faire. Dans la vitrine (`application/`), les pièges 8 à 12 sont corrigés :
- piège 8 : réécriture `/_b/<boutique>/…` ;
- piège 9 : plus aucune valeur Maymar dans le code, tout vient de la boutique ;
- piège 10 : `generateStaticParams` partout, et filtres dans le chemin ;
- piège 11 : catalogue en SQL ;
- piège 12 : fichiers sur R2.

**Choix faits en construisant** :
- **Plus de table `profils`.** Un compte (`auth.users`) est une identité globale. Chaque boutique a sa fiche `clients` pour ce compte : le même acheteur a deux fiches chez deux commerçants, et aucun ne voit l'autre. Avec la connexion par code SMS, un acheteur qui s'inscrit sur une deuxième boutique ne reçoit jamais « compte déjà existant ».
- **Langues et devise** sont des colonnes de `boutiques`, plus des réglages.
- **Les modules sont activés par nous** (`plateforme.modules_actifs`), depuis la console : ils font partie de l'offre vendue. Un réglage rattaché à un module n'est visible de la vitrine que si le module est actif.
- **Les administrateurs de la plateforme n'ont aucun droit par la RLS.** Ils passent par la console (clé `service_role`), qui trace chaque accès dans `journal_audit`.
- **Le stock ne change que par un mouvement journalisé.** C'est vrai pour tous les rôles, y compris la console et le rôle `postgres` : une commande réserve le stock, un refus ou une annulation le rend, et le reste passe par `mouvement_stock`. La somme du journal est toujours égale au stock.
- **Journaux horodatés à l'instant réel** (`clock_timestamp()`) : plusieurs changements dans une même transaction gardent leur ordre.
- **Livraison offerte dès un seuil** (`livraison.seuil_gratuite_millimes`), demandée par l'étude de la quincaillerie : prise en compte dès maintenant dans le calcul des frais.

**Construit ensuite, le 29/09** (migration 08, `20260929100700_tunnel_commande.sql`, 52 tests dans `supabase/tests/10_tunnel.sql`) : le tunnel de commande en paiement à la livraison.
- `devis_commande` : le chiffrage d'un panier dans une boutique (prix, stock, libellés, frais du gouvernorat, livraison offerte), partagé avec la commande : l'affiché et le facturé ne peuvent pas diverger. Une variante qui n'est pas en vente dans CETTE boutique revient « indisponible » sans rien dire d'elle ;
- `passer_commande` : compte obligatoire ou invité (réglage), numéro tunisien normalisé, clé d'idempotence (le rejeu rend la même commande), verrou par numéro, au plus N commandes en attente d'appel par numéro (réglage `commande.max_en_attente`, 3), fiche bloquée refusée, variantes verrouillées dans un ordre stable, total vu par l'acheteur exigé, confirmation automatique en réglage, carnet d'adresses du compte ;
- `commande_suivie` : la commande pour qui a son numéro et son jeton (seule l'empreinte SHA-256 du jeton est gardée) ;
- les gestes du système (commande de la vitrine, confirmation automatique) n'ont pas d'auteur dans les journaux : l'identifiant de l'acheteur n'y entre pas.

**Puis le backoffice des commandes** (migration 09, `20260929100800_gestion_commandes.sql`, 39 tests dans `supabase/tests/11_gestion.sql`) : `confirmations` (chaque tentative : canal, résultat, note, auteur) et les gestes de l'équipe par fonctions (`gestion_appel`, `gestion_annuler`, `gestion_expedier`, `gestion_livrer`, `gestion_refuser`, `gestion_note`), avec le rôle de chacun et l'étape attendue ; la liste et la fiche pour l'équipe (`gestion_liste_commandes`, `gestion_commande`). L'UPDATE direct des commandes par l'API est retiré.

**Puis l'équipe des boutiques, depuis la console** (migration 10, `20260929100900_console_equipe.sql`, 32 tests dans `supabase/tests/12_equipe.sql`) : `console_equipe` (membres, rôle, invitation en attente, double authentification), `console_compte`, `console_ajouter_membre` (une personne déjà dans l'équipe n'est pas réinvitée ; un membre désactivé est réactivé), `console_modifier_membre` (rôle, accès ; au moins un propriétaire actif, changements d'une même boutique un par un), `console_tracer_lien` (chaque lien d'accès remis passe au journal). Les comptes eux-mêmes sont créés par l'API d'administration de GoTrue, côté serveur de la console.

**Puis le catalogue et le stock au backoffice** (migration 11, `20260929101000_gestion_catalogue.sql`, 39 tests dans `supabase/tests/13_catalogue.sql`) : `gestion_liste_produits` (filtres, recherche, compteurs), `gestion_produit` (fiche, déclinaisons, axes, rayons, trente derniers mouvements), `gestion_enregistrer_produit` (version attendue : pas d'écrasement à l'aveugle ; pas de publication sans déclinaison en vente), `gestion_enregistrer_variante` (prix, prix barré, seuil, mise en vente ; la dernière déclinaison en vente d'un produit publié reste), `gestion_mouvement_stock` (réception, inventaire, casse, toujours par `mouvement_stock`, donc au journal), `gestion_ajouter_variante`, `gestion_creer_produit` (brouillon, adresse libre). Rôles : propriétaire et administrateur modifient, la préparation tient le stock.

**Puis les photos des produits** (migration 12, `20260929101100_gestion_photos.sql`, 24 tests dans `supabase/tests/14_photos.sql`) : `gestion_ajouter_photo` (sous `<slug>/produits/`, douze au plus), `gestion_modifier_photo` (légende, déclinaison du même produit), `gestion_deplacer_photo` (avant, après, en première ; ordre sans trou), `gestion_retirer_photo` (rend le chemin, et s'il n'est plus utilisé dans la boutique). Les fichiers : liaison R2 `FICHIERS` en production, le relais local en développement (`application/src/lib/gestion/fichiers.ts`).

**Puis les réglages de la boutique** (migration 13, `20260929101200_gestion_reglages.sql`, 30 tests dans `supabase/tests/15_reglages.sql`) : colonne `modifiable_boutique` au catalogue des réglages (le préfixe des numéros reste à la plateforme) ; `gestion_reglages` (valeurs, défauts, modules, zones, gouvernorats, journal), `gestion_enregistrer_reglages` (valeur égale au défaut = ligne effacée ; bornes ; au moins un moyen de paiement ; journal d'audit), `gestion_enregistrer_zone`, `gestion_supprimer_zone`, `gestion_rattacher_gouvernorats`.

**Puis les clients** (migration 14, `20260929101300_gestion_clients.sql`, 22 tests dans `supabase/tests/16_clients.sql`) : la policy d'UPDATE direct des fiches clients est retirée (les compteurs de refus ne se touchent plus) ; `gestion_liste_clients` (filtres, recherche par numéro, compteurs), `gestion_client` (par identifiant ou par numéro : chiffres, commandes, adresses, journal), `gestion_confiance_client` (normal, surveillé, bloqué ; motif exigé, journal d'audit), `gestion_note_client`.

**Puis les pages légales et le consentement** (migration 15, `20260929101400_vitrine_legal.sql`, 12 tests dans `supabase/tests/17_legal.sql`) : réglages publics `legal.*` (identité légale, rétractation bornée à 10 jours ouvrables au moins par un trigger, frais de retour, référence INPDP) ; colonne `commandes.conditions_acceptees` ; `passer_commande` redéfinie (même signature) : elle exige `contact.accepte_conditions = true` (indice « conditions ») et garde le modèle, le délai et la date.

**Puis l'équipe gérée par le propriétaire** (migration 16, `20260929101500_gestion_equipe.sql`, 18 tests dans `supabase/tests/18_equipe_boutique.sql`) : règles communes `private.equipe_ajouter`, `equipe_modifier`, `equipe_tracer_lien` (les `console_*` de la migration 10 les appellent désormais) ; `gestion_equipe`, `gestion_compte`, `gestion_ajouter_membre`, `gestion_modifier_membre`, `gestion_lien_membre` pour le propriétaire ; `private.compte_de_la_seule_boutique` : pas de lien d'accès depuis un backoffice pour un compte qui sert ailleurs.

**Puis l'export des données** (migration 17, `20260929101600_gestion_export.sql`, 11 tests dans `supabase/tests/19_export.sql`) : `gestion_export(boutique, jeu)` — commandes, articles, clients, catalogue, stock — pour le propriétaire et l'administrateur, tracé au journal d'audit.

**Puis les bordereaux de livraison** (migration 18, `20260929101700_gestion_bordereaux.sql`, 7 tests dans `supabase/tests/20_bordereaux.sql`) : `gestion_bordereaux(boutique, numéros | étape)` — expéditeur, destinataire, contenu, montant — pour toute l'équipe.

**Puis la veille des nouvelles commandes** (migration 19, `20260929101800_gestion_veille.sql`, 4 tests dans `supabase/tests/21_veille.sql`) : `gestion_veille(boutique)` — commandes à confirmer, dernière arrivée — pour le compteur et les alertes du backoffice ouvert.

**Puis le logo et les images de la marque** (migration 20, `20260929101900_console_images_marque.sql`, 31 tests dans `supabase/tests/22_images_marque.sql`) : `console_image_marque(acteur, boutique, version, emplacement, image, sections_gabarit)` pose ou retire le logo (avec sa proportion et son mode), le monogramme, l'icône d'onglet, la photo d'ouverture et son cadrage pour téléphone, la photo du récit, et leur description. Fichier neuf pris dans `<boutique>/marque/` seulement ; tant que la boutique garde les sections d'accueil de son gabarit, la console les fournit et la première photo les fixe en base ; la fonction rend les fichiers que le thème n'emploie plus (`private.fichiers_theme`), que la console retire de R2.

**Puis les modules d'une boutique** (migration 21, `20260929102000_console_modules.sql`, 14 tests dans `supabase/tests/23_modules.sql`) : `plateforme.modules.disponible` (un module construit ou à venir), `console_modules(boutique)` et `console_changer_module(acteur, boutique, module, actif)` — refus d'activer un module à venir, journal d'audit.

**Puis le retrait en magasin** (migration 22, `20260929102100_vitrine_retrait.sql`, 25 tests dans `supabase/tests/24_retrait.sql`) : `commandes.mode_livraison` (`domicile` ou `retrait`) ; l'adresse de livraison n'est plus obligatoire qu'à domicile (contrainte `commandes_adresse_a_domicile`) ; réglages `retrait.*` du module `retrait_magasin` (bornés par `private.valide_reglages_retrait`) ; `private.magasin(boutique)` et `private.retrait_propose(boutique)` ; `private.chiffre_commande` prend le mode (retrait : gratuit) ; `devis_commande(boutique, lignes, gouvernorat, mode)` ; `passer_commande`, `commande_suivie`, `gestion_liste_commandes`, `gestion_commande`, `gestion_bordereaux` et `gestion_export` reprises pour le mode. Une commande en retrait suit le cycle d'une livraison : « expédiée » y est « prête au retrait », « livrée » « retirée », « refusée » « non retirée ».

**Puis « mes commandes »** (migration 23, `20260929102200_vitrine_mes_commandes.sql`, tests dans `02_isolation.sql` et `06_api.sql`) : les policies de lecture du client sur `commandes`, `commande_lignes`, `commande_evenements` et `clients` sont retirées (elles exposaient les notes et l'historique de l'équipe) ; `mes_commandes(boutique)` rend au client connecté ses commandes, sans rien de ce que l'équipe en écrit. Le carnet d'adresses (`adresses`) reste lisible par son propriétaire.

**Puis la liste de mise en place** (migration 24, `20260929102300_console_mise_en_place.sql`, 16 tests dans `supabase/tests/25_mise_en_place.sql`) : `plateforme.mise_en_place` (les étapes cochées à la main : recueil, commande test, formation), `console_mise_en_place(boutique)` (les dix étapes, constatées ou cochées, datées), `console_avancements()` et `console_marquer_etape(acteur, boutique, étape, faite)`, tracé au journal.

**Puis l'accès support** (migration 25, `20260929102400_console_support.sql`, 35 tests dans `supabase/tests/26_support.sql`) : `plateforme.acces_support` (titulaire, mode `lecture` ou `admin`, motif, échéance, fermeture ; au plus un accès non refermé par administrateur et par boutique) ; `private.supports_ouverts()` (accès ouverts de l'utilisateur connecté, en aal2, titulaire toujours administrateur), repris par `private.est_membre` et `private.mes_boutiques` ; `mes_acces()` rend aussi les accès support (échéance, motif) ; `console_ouvrir_support`, `console_fermer_support`, `console_acces_support` ; `gestion_acces_support` et `gestion_fermer_support` pour le propriétaire. Tracé au journal (`support.ouvert`, `support.ferme`).

**Puis les photos à l'import** (migration 26, `20260929102500_console_photos_import.sql`, 20 tests dans `supabase/tests/27_photos_import.sql`) : `produit_images.lot_import` et `plateforme.lots_photos` (un lot par envoi de la console, tracé une fois au journal, retirable) ; `console_references(boutique)` (le catalogue à rapprocher : produits, photos, références des déclinaisons), `console_ajouter_photo(acteur, boutique, lot, produit, déclinaison, chemin, texte)`, `console_lots_photos(boutique)` et `console_retirer_lot_photos(acteur, boutique, lot)`, qui rend les fichiers à effacer.

**Puis les fiches techniques** (migration 27, `20260929102600_catalogue_attributs.sql`, 30 tests dans `supabase/tests/28_attributs.sql`) : `public.attributs` (clé, libellé, unité, type `texte` ou `nombre`, filtrable, sur la carte, position) et `public.rayon_attributs` ; `produits.caracteristiques` (jsonb par clé, vérifié par `private.valide_caracteristiques`) ; `gestion_attributs`, `gestion_enregistrer_attribut`, `gestion_deplacer_attribut`, `gestion_retirer_attribut`, `gestion_fiche_technique`, `gestion_enregistrer_caracteristiques` ; `vitrine_produits.caracteristiques` ; `liste_produits` fait hériter les caractéristiques filtrables par chaque déclinaison (filtres, facettes et comptes comme des axes ; les nombres triés comme des nombres ; la recherche les lit).

**Puis l'import des fiches techniques** (migration 28, `20260929102700_import_caracteristiques.sql`, 10 tests dans `supabase/tests/29_import_caracteristiques.sql`) : `console_preparer_import` et `console_appliquer_import` reprises (mêmes signatures) : `caracteristiques` par ligne, concordance entre les lignes d'un produit, caractéristique inconnue signalée, `caracteristiques` et `fiches_techniques` au rapport, fusion dans `produits.caracteristiques` à l'application.

**Puis le supplément au poids** (migration 29, `20260929102800_livraison_poids.sql`, 20 tests dans `supabase/tests/30_livraison_poids.sql`) : réglage `livraison.supplement_poids` (booléen, public, coupé par défaut) ; `public.tranches_poids` (jusqu'à N grammes, `null` = au-delà ; une tranche par borne) ; `private.supplement_poids` ; `frais_livraison_millimes(boutique, gouvernorat, sous_total, poids)` (l'ancienne signature à trois arguments est retirée) ; `private.chiffre_commande` pèse le panier et rend `poids_grammes` et `supplement_poids_millimes` ; `boutique_publique.tranches_poids` (null si coupé) ; `gestion_reglages.tranches`, `gestion_enregistrer_tranche`, `gestion_supprimer_tranche` (propriétaire et administrateur, tracées `reglages.tranche_poids` et `reglages.tranche_poids_supprimee`).

**Puis le service après-vente** (migration 30, `20260929102900_sav.sql`, 34 tests dans `supabase/tests/31_sav.sql`) : réglages `sav.garantie_mois` (module `sav`) et `catalogue.revendeur_officiel` ; `public.sav_demandes` (numéro par boutique, l'article copié de la commande, numéro de série, description, statut `nouvelle` → `en_cours` → `resolue` / `refusee` avec son issue documentée ; une seule demande ouverte par ligne de commande) et `public.sav_evenements` (l'historique) ; `sav_demander` et `mes_sav` pour le client connecté (commande livrée, la sienne), `gestion_sav_etat`, `gestion_liste_sav`, `gestion_sav`, `gestion_avancer_sav` pour l'équipe (étape affichée revérifiée) ; `mes_commandes` rend l'identifiant de chaque ligne ; `gestion_export` rend aussi les demandes.

**Puis le tableau de bord** (migration 31, `20260929103000_tableau_de_bord.sql`, 18 tests dans `supabase/tests/32_tableau_de_bord.sql`) : `gestion_tableau_de_bord(boutique, jours)` (7, 30 ou 90 ; propriétaire, administrateur, lecture) rend, pour les commandes passées sur la période (heure de Tunis, hors `a_arbitrer`) et pour la période précédente, la synthèse (reçues, confirmées, livrées, refusées, annulées, en cours, à confirmer, encaissé, perdu aux refus, panier moyen, taux de confirmation et de refus, délai médian de confirmation), puis `par_jour`, `refus_origines`, `gouvernorats` et `produits`. Rien n'est stocké : tout est calculé à la demande.

**Puis l'argent des livreurs** (migration 32, `20260929103100_encaissements.sql`, 29 tests dans `supabase/tests/33_encaissements.sql`) : `public.versements` (transporteur, reçu le, attendu, reçu, référence, note, les numéros des colis figés, auteur, annulation) et `public.versement_commandes` (un colis n'est rapproché qu'une fois : unicité `(boutique_id, commande_id)`), sans lecture ni écriture directe par l'API ; `gestion_encaissements(boutique)` (à recevoir par transporteur, les 50 derniers versements, les trente jours), `gestion_enregistrer_versement(boutique, transporteur, numéros, reçu, date, référence, note)` et `gestion_annuler_versement(boutique, versement)` (propriétaire et administrateur).

**Puis l'export des versements** (migration 33, `20260929103200_export_versements.sql`) : `gestion_export(boutique, 'versements')` (reçu le, transporteur, reçu, attendu, écart, colis, commandes, référence, note, saisi par et le, annulé le).

**Puis la réception d'un arrivage** (migration 34, `20260929103300_reception_arrivage.sql`, 16 tests dans `supabase/tests/34_reception.sql`) : `gestion_reception_catalogue(boutique)` (les déclinaisons en vente, produit par produit, avec stock et seuil) et `gestion_reception(boutique, lignes, note)` (plusieurs réceptions par `mouvement_stock`, tout ou rien, verrouillées dans l'ordre des identifiants).

**Puis la quantité minimale** (migration 35, `20260929103400_quantite_min.sql`, 20 tests dans `supabase/tests/35_quantite_min.sql`) : `variantes.quantite_min` (1 à 999, 1 par défaut), lue par `vitrine_produits` (donc `liste_produits`) et `gestion_produit` (`minimum`) ; `private.chiffre_commande` rend `quantite_min` par ligne, une déclinaison dont le stock est sous son minimum est indisponible, et `complet` exige que chaque ligne l'atteigne (donc `passer_commande` refuse, indice `stock`) ; `gestion_enregistrer_variante` prend un 7ᵉ argument facultatif `p_quantite_min` (null : inchangé ; indice `minimum` hors bornes).

**Puis les comptes professionnels** (migration 36, `20260929103500_comptes_pro.sql`, 46 tests dans `supabase/tests/36_comptes_pro.sql`, 14 mutants tués) : `public.comptes_pro` (un par client : demande, validé, refusé, retiré ; raison sociale, matricule fiscal, métier, message, motif, décision) et `public.prix_pro` (le prix pro d'une déclinaison), lus par l'équipe seulement, écrits par les fonctions ; `private.est_pro(boutique)` (module actif, compte validé, client non bloqué) ; vitrine : `mon_compte_pro`, `demander_compte_pro` (crée la fiche client d'un compte qui n'a jamais commandé), `mes_prix_pro(boutique, produits)` ; `private.chiffre_commande` applique `least(prix pro, prix public)` à un pro et rend `tarif`, `prix_public_millimes` par ligne et `economie_pro_millimes` ; backoffice : `gestion_pro_etat`, `gestion_comptes_pro`, `gestion_compte_pro`, `gestion_decider_compte_pro` (étape vue revérifiée, ouverture d'emblée avec la raison sociale), `gestion_enregistrer_prix_pro` (null : retiré), `gestion_produit` (`prix_pro`). Le module `comptes_pro` devient disponible à la console.

**Puis les devis** (migration 37, `20260929103600_devis.sql`, 64 tests dans `supabase/tests/37_devis.sql`, 20 mutants tués) : `public.devis` (numéroté par boutique, `DEV-00012` ; demande, envoyé, accepté, refusé, annulé — « expiré » se lit, validité passée ; message du client, mot de la boutique, frais, validité, commande) et `public.devis_lignes` (l'article copié, la quantité, le prix catalogue d'alors, le prix du devis), lus par l'équipe seulement, écrits par les fonctions ; vitrine : `demander_devis`, `mes_devis`, `chiffre_devis` (même forme que `devis_commande`), `accepter_devis` (par `passer_commande`), `refuser_devis` ; backoffice : `gestion_devis_etat`, `gestion_liste_devis`, `gestion_devis`, `gestion_chiffrer_devis` (brouillon ou envoi, version revérifiée), `gestion_annuler_devis`. `private.chiffre_commande` applique les prix et les frais du devis désigné par `skanecom.devis_id` — envoyé, à son client connecté, mêmes lignes et quantités — et rend `tarif = 'devis'`. Les modules `devis` et `sav` deviennent disponibles à la console.

**Puis l'achat express** (migration 38, `20260929103700_achat_express.sql`, 7 tests dans `supabase/tests/38_achat_express.sql`) : un réglage seulement, `commande.achat_express` (coupé par défaut, lu par la vitrine) — « Commander maintenant » sur la fiche mène au tunnel avec cet article seul, sans toucher au panier ; la commande passe par `public.passer_commande` comme une autre.

**Puis les avis clients** (migration 39, `20260929103800_avis.sql`, 48 tests dans `supabase/tests/39_avis.sql`, 21 mutants tués) : `public.avis` (un par article commandé : note 1 à 5, texte facultatif, auteur montré « Amel B. », déclinaison copiée ; en attente, publié, écarté avec un motif gardé pour l'équipe ; réponse publique de la boutique). Seul un client connecté note un article d'une de ses commandes livrées (`public.donner_avis`) ; la vitrine lit les publiés (`public.avis_produit`, moyenne et répartition) ; l'équipe publie, écarte, répond (`public.gestion_moderer_avis`, propriétaire et administrateur, au journal). Réglage du module : `avis.moderation` (relu avant publication par défaut, ou automatique).

**Puis la note sur les cartes** (migration 40, `20260929103900_note_cartes.sql`, 7 tests dans `supabase/tests/40_note_cartes.sql`) : `public.note_produit` (moyenne et nombre des avis publiés, NULL sans avis ou sans le module), portée par `public.vitrine_produits` en dernière colonne — les rayons, la recherche et l'accueil l'affichent dans la page servie, sans autre appel.

**Pas encore construit**, et prévu :
- avec la console : `contrats`, `factures` ;
- avec la suite du backoffice : `expeditions`, `transporteurs_comptes`, `psp_comptes`, `outbox`.
