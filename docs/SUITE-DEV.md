# Passation : démarrer le développement de SkanEcom

> Écrit le 29/09/2026 à la fin de la session de cadrage, pour que la session suivante démarre sans rien reperdre.
> Branche de travail : `claude/gallant-hawking-gi9xv0` (seule branche du dépôt, donc branche par défaut).

## Où on en est

- **Modèle** : boutique en ligne clé en main, en marque blanche, pour 10 à 50 entreprises (décision D15). Voir [`cadrage/01-prd.md`](cadrage/01-prd.md).
- **Hébergement** : Cloudflare (domaines, application Next.js sur Workers via vinext, cache, R2, files) et Supabase (Postgres + Auth, Paris). Voir [`cadrage/02-infrastructure.md`](cadrage/02-infrastructure.md).
- **Clients, dans l'ordre** : Maymar, puis le représentant DeWalt, puis la quincaillerie. Modules décidés dans [`cadrage/05-etude-outillage-quincaillerie.md`](cadrage/05-etude-outillage-quincaillerie.md).
- **Prototype : réussi** en local le 28/09 et chez Cloudflare le 29/09. Les pages déjà vues restent servies pendant une panne de la base, et deux domaines ne reçoivent jamais la page de l'autre. Voir [`../prototype/vitrine-workers/RAPPORT.md`](../prototype/vitrine-workers/RAPPORT.md). Les Workers de test sont supprimés ; le workflow les redéploie en 2 minutes.

## État des accès

| Accès | État au 29/09 | Ce qu'il débloque |
|---|---|---|
| Secrets GitHub `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` | **Ajoutés le 29/09.** Jeton valable un mois ; il peut modifier tous les Workers du compte, le workflow ne touche qu'aux quatre Workers du prototype | Workflow `prototype-vitrine.yml` : déploiements de test sur Cloudflare |
| Organisation Supabase « SkanEcom » visible par le connecteur | Manquante (le connecteur ne voyait que « Lemonbeach »). **Pas bloquant pour l'étape 1** : on développe sur un Postgres local | Base dans le cloud, nécessaire avant la mise en ligne de Maymar (étape 2) |
| Bucket R2 `skanecom-prototype-vitrine-response-store-cache-bodies` | Gardé (quelques pages factices, gratuit) | Cache de la vitrine du prototype, si on relance la phase 2 |
| Réseau de l'environnement vers `*.supabase.co`, `api.cloudflare.com` et `*.workers.dev` | Bloqué (facultatif) : on passe par GitHub Actions | Tests directs depuis le conteneur |

## Premières tâches de l'étape 1 (socle), dans l'ordre

1. ~~Phase 2 du prototype~~ : **faite le 29/09**. Il reste la mesure depuis la Tunisie, à faire quand Skander le souhaite (`deployer`, ouvrir la vitrine sur un téléphone, puis `supprimer`).
2. ~~Base locale et migrations multi-boutique~~ : **faites le 29/09**. Le détail et les choix faits en route sont dans [`cadrage/03-reprise-maymar.md`](cadrage/03-reprise-maymar.md) §7. Le passage au projet Supabase SkanEcom dans le cloud (région `eu-west-3`) se fera avant l'étape 2.
3. ~~Tests d'isolation pgTAP, bloquants en CI~~ : **faits le 29/09**. 219 tests (dont la vitrine, la console et l'import), dans le workflow `.github/workflows/base.yml`, qui les lance sur l'image Supabase et sur la base simulée.
4. **Application — la vitrine multi-boutique : faite le 29/09** (`application/`), à partir de `prototype/vitrine-workers` :
   - fait : boutique trouvée par le domaine puis adresse réécrite en `/_b/<boutique>/…` (`src/proxy.ts`), avec un annuaire embarqué au déploiement (`outils/annuaire.mjs`) pour rester joignable pendant une panne ;
   - fait : thème par boutique (13 jetons de couleur, polices, logo, monogramme, sections d'accueil), validé par la base et par l'application ;
   - fait (refonte du 29/09) : **deux gabarits** qui ne se ressemblent pas, parce qu'un site de mode ne se construit pas comme un site d'outillage. **Éditorial** (mode, bagages ; références COS, Arket, Sézane, Rimowa) : en-tête posé sur une photo d'ouverture plein écran, collections en grandes vignettes, deuxième photo au survol, filtres en tiroir, fiche à galerie verticale et bloc d'achat collant, grand logotype en pied. **Technique** (outillage, quincaillerie ; Festool, Hilti, Würth) : en-tête sombre et grande recherche par nom, marque ou référence, barre des rayons, cartes denses (référence, stock chiffré, prix TTC, ajout direct), colonne de filtres, fiche à vignettes et tableau de caractéristiques. Le moteur (catalogue, filtres, panier) est commun ; `data-gabarit` sur `<html>` choisit la feuille (`editorial.css`, `technique.css`) et les pages leurs composants. Polices servies par l'application (`app/polices.css`), chargées à l'usage ;
   - fait : catalogue filtré, trié et paginé en base, filtres sur n'importe quel axe de variante, **filtres dans le chemin** pour que les listes filtrées soient en cache (découverte n°8) ;
   - fait : client Supabase qui abandonne vite (`retry: false`, 2 s) : pendant une panne, une page jamais vue échoue en 60 ms au lieu de 7 s ;
   - fait : robots, plan du site et favicon par boutique, panier par boutique, prix barrés en réglage, seuil de livraison offerte ;
   - reste : **déploiement en deux temps avec cache prérempli** (`--warm-cache`) et nettoyage des anciennes versions du cache (découverte n°6) ; **page de secours WhatsApp** pour les pages jamais vues pendant une panne (étape 2) ; libellés d'interface en arabe (le jour d'une boutique arabophone).
5. **Console minimale** (PRD §6.1), sur son propre domaine (`app.skanecom.tn` ; en local `console.localhost:4200`) :
   - fait le 29/09 : connexion par mot de passe et **double authentification obligatoire** (TOTP, GoTrue), réservée aux administrateurs de la plateforme — un membre de boutique est refusé avant même la double authentification ;
   - fait : **C1** créer une boutique et son domaine, l'ouvrir ou la suspendre, ajouter des domaines ; **C2** régler sa marque (thème, police des titres, 13 couleurs, textes) avec un aperçu qui suit chaque changement ;
   - fait : chaque écriture passe par une fonction `public.console_*` réservée à `service_role`, qui revérifie l'administrateur et trace l'action (avec l'IP) dans `plateforme.journal_audit` ; formulaires refusés s'ils viennent d'une autre origine ; la clé `service_role` est un secret du Worker, absente du paquet compilé ;
   - fait : **C5 import Excel ou CSV** — une ligne par variante, en-têtes reconnus sous leurs noms usuels, toute autre colonne devient un axe (couleur, taille, tension…), rayons « Parent > Enfant » créés au besoin. D'abord un **rapport** (nouveautés, mises à jour, stocks ajustés, erreurs avec la ligne du tableur) sans rien écrire, puis l'import **en une transaction** ; rien n'est supprimé, une cellule vide ne remplace rien, un écart de stock passe au journal du stock. Lecture du .xlsx sans bibliothèque de tableur (fflate + lecteur maison, `src/lib/console/tableur.ts`) ;
   - reste : logo et images (téléversement vers R2) ; photos des produits à l'import ; C3 modules ; C4 comptes de l'équipe du client.
6. **Maymar migrée** comme première boutique ; domaine `maymar.tn` à l'étape 2.

## Base de données en local

Il faut un Postgres 16 avec pgTAP et `pg_prove` (Ubuntu : `postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl`). Docker n'est pas nécessaire.

```bash
outils/base-locale.sh reinit    # recrée la base : simulation Supabase, migrations, jeu de démo
outils/base-locale.sh tester    # les 219 tests pgTAP
outils/base-locale.sh psql      # console SQL
```

Le schéma `auth` est construit par **GoTrue**, le vrai serveur d'authentification de Supabase (`outils/gotrue.sh`, binaire téléchargé et vérifié à la première utilisation) : mêmes tables, mêmes fonctions `auth.uid()` / `auth.jwt()`, mêmes droits que chez Supabase. `outils/api-locale.sh demarrer` le lance aussi sous `/auth/v1` : connexion par mot de passe et double authentification réelles, aucun faux login de développement.

La base écoute sur `127.0.0.1:54322`, comme celle de la CLI Supabase. Comme chez Supabase, `postgres` n'y est **pas** superutilisateur (c'est `supabase_admin`) : une migration qui demanderait un droit de superutilisateur échoue en local comme en production. Le jeu de démo (`supabase/seed.sql`) contient trois boutiques : `maymar` (éditorial, ses produits attendent leurs vraies photos), `quincaillerie-demo` (technique, 14 références photographiées) et `maison-selma` (éditorial, prêt-à-porter de démonstration, 19 modèles photographiés), avec les domaines `maymar.localhost`, `quincaillerie.localhost` et `mode.localhost`. Les photos de démonstration sont libres de droits (CC0, Openverse) : `outils/photos-demo/` les choisit, le workflow « Photos de démonstration » les télécharge et les recadre en WebP dans `supabase/fichiers-demo/`, avec leurs crédits (`CREDITS.md`). Avec Docker, `supabase db start` donne la vraie base Supabase ; c'est ce que fait la CI.

**Ajouter une table de boutique** : `boutique_id` NOT NULL vers `plateforme.boutiques`, `unique (boutique_id, id)`, clés étrangères composites, trigger `private.boutique_immuable`, RLS. Le fichier `supabase/tests/01_structure.sql` le vérifie sur toutes les tables, et `02_isolation.sql` compare automatiquement ce que chaque rôle voit de chaque boutique : une nouvelle table est couverte sans écrire de test.

## Vitrine en local

Base locale et API locale d'abord (voir ci-dessus), puis :

```bash
outils/api-locale.sh demarrer                  # PostgREST sous /rest/v1 et fichiers de démo, sur :54321
cd application && bun install
set -a; . ../.outils/api-locale.env; set +a    # adresses et clés de développement
bun run build && bun run start --port 4200 --host 127.0.0.1   # la vitrine compilée, dans workerd
```

Ouvrir http://mode.localhost:4200, http://maymar.localhost:4200 et http://quincaillerie.localhost:4200 : la même application sert les trois boutiques, chacune avec son gabarit et son thème. `outils/essai-vitrine.sh` vérifie en 20 essais qu'elles ne se mélangent jamais ; la CI le lance à chaque modification (`.github/workflows/vitrine.yml`). `bun run apercu` prend les captures des pages clés des trois boutiques, sur grand écran et sur téléphone.

`bun run parcours` (dans `application/`) joue un **testeur humain** dans Chromium : souris, clavier seul, téléphone tactile, sur les trois boutiques et les deux gabarits — en-tête sur la photo d'ouverture, collections, survol des cartes, tiroir de filtres, tri, fiche, panier, menu du téléphone, galerie au doigt, recherche par référence, ajout direct. Il vérifie ce qu'une personne vit (le focus au clavier, le tiroir de filtres qui se rouvre après chaque case, le panier qui s'ouvre après un ajout et garde le focus) et laisse une capture par étape dans `.outils/captures/`. La CI le lance aussi et joint les captures à chaque passage (« captures-vitrine »). Le premier passage, le 29/09, a trouvé et fait corriger : pas de rayons sur téléphone, page introuvable sans en-tête, page décalée quand une liste est vide, focus perdu et feuille refermée après chaque filtre, focus qui sortait du tiroir du panier.

**Console en local** : http://console.localhost:4200, compte `admin@skanecom.test`, mot de passe `console-locale-skanecom` (créés par `outils/api-locale.sh demarrer`, base locale seulement). À la première connexion, la console affiche le QR code de la double authentification. `bun run parcours:console` rejoue la mise en place d'une boutique de bout en bout, avec captures (la CI aussi).

Avant un déploiement : `bun run annuaire` fige l'annuaire des domaines dans `src/annuaire.genere.json` (clé de service requise ; le fichier du dépôt reste vide, il ne doit pas contenir la liste des clients).

## Règles à tenir

- Un seul code et une seule base ; **jamais de copie ni de code spécifique à un client** (PRD §4.3).
- Tout choix défendable devient un réglage.
- Aucune donnée personnelle dans KV ni dans les journaux ; sauvegardes et tampons dans l'UE.
