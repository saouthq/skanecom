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
3. ~~Tests d'isolation pgTAP, bloquants en CI~~ : **faits le 29/09**. 163 tests (dont la vitrine), dans le workflow `.github/workflows/base.yml`, qui les lance sur l'image Supabase et sur la base simulée.
4. **Application — la vitrine multi-boutique : faite le 29/09** (`application/`), à partir de `prototype/vitrine-workers` :
   - fait : boutique trouvée par le domaine puis adresse réécrite en `/_b/<boutique>/…` (`src/proxy.ts`), avec un annuaire embarqué au déploiement (`outils/annuaire.mjs`) pour rester joignable pendant une panne ;
   - fait : thème par boutique (13 jetons de couleur, polices, logo, monogramme, sections d'accueil), validé par la base et par l'application ;
   - fait : catalogue filtré, trié et paginé en base, filtres sur n'importe quel axe de variante, **filtres dans le chemin** pour que les listes filtrées soient en cache (découverte n°8) ;
   - fait : client Supabase qui abandonne vite (`retry: false`, 2 s) : pendant une panne, une page jamais vue échoue en 60 ms au lieu de 7 s ;
   - fait : robots, plan du site et favicon par boutique, panier par boutique, prix barrés en réglage, seuil de livraison offerte ;
   - reste : **déploiement en deux temps avec cache prérempli** (`--warm-cache`) et nettoyage des anciennes versions du cache (découverte n°6) ; **page de secours WhatsApp** pour les pages jamais vues pendant une panne (étape 2) ; libellés d'interface en arabe (le jour d'une boutique arabophone).
5. **Console minimale** : créer une boutique, régler sa marque, importer un fichier Excel.
6. **Maymar migrée** comme première boutique ; domaine `maymar.tn` à l'étape 2.

## Base de données en local

Il faut un Postgres 16 avec pgTAP et `pg_prove` (Ubuntu : `postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl`). Docker n'est pas nécessaire.

```bash
outils/base-locale.sh reinit    # recrée la base : simulation Supabase, migrations, jeu de démo
outils/base-locale.sh tester    # les 163 tests pgTAP
outils/base-locale.sh psql      # console SQL
```

La base écoute sur `127.0.0.1:54322`, comme celle de la CLI Supabase. Comme chez Supabase, `postgres` n'y est **pas** superutilisateur (c'est `supabase_admin`) : une migration qui demanderait un droit de superutilisateur échoue en local comme en production. Le jeu de démo (`supabase/seed.sql`) contient deux boutiques, `maymar` et `quincaillerie-demo`, avec les domaines `maymar.localhost` et `quincaillerie.localhost`. Avec Docker, `supabase db start` donne la vraie base Supabase ; c'est ce que fait la CI.

**Ajouter une table de boutique** : `boutique_id` NOT NULL vers `plateforme.boutiques`, `unique (boutique_id, id)`, clés étrangères composites, trigger `private.boutique_immuable`, RLS. Le fichier `supabase/tests/01_structure.sql` le vérifie sur toutes les tables, et `02_isolation.sql` compare automatiquement ce que chaque rôle voit de chaque boutique : une nouvelle table est couverte sans écrire de test.

## Vitrine en local

Base locale et API locale d'abord (voir ci-dessus), puis :

```bash
outils/api-locale.sh demarrer                  # PostgREST sous /rest/v1 et fichiers de démo, sur :54321
cd application && bun install
set -a; . ../.outils/api-locale.env; set +a    # adresses et clés de développement
bun run build && bun run start --port 4200 --host 127.0.0.1   # la vitrine compilée, dans workerd
```

Ouvrir http://maymar.localhost:4200 et http://quincaillerie.localhost:4200 : la même application sert les deux boutiques, chacune avec son thème. `outils/essai-vitrine.sh` vérifie en 16 essais qu'elles ne se mélangent jamais ; la CI le lance à chaque modification (`.github/workflows/vitrine.yml`).

Avant un déploiement : `bun run annuaire` fige l'annuaire des domaines dans `src/annuaire.genere.json` (clé de service requise ; le fichier du dépôt reste vide, il ne doit pas contenir la liste des clients).

## Règles à tenir

- Un seul code et une seule base ; **jamais de copie ni de code spécifique à un client** (PRD §4.3).
- Tout choix défendable devient un réglage.
- Aucune donnée personnelle dans KV ni dans les journaux ; sauvegardes et tampons dans l'UE.
