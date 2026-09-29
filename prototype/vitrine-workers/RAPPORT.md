# Prototype — la vitrine Maymar sur Cloudflare Workers (vinext)

> 28/09/2026 (phase 1, en local) et 29/09/2026 (phase 2, chez Cloudflare) · porte de décision de l'étape 1 (`docs/cadrage/02-infrastructure.md`, §8).
> Question posée : **le code Next.js de Maymar tourne-t-il correctement sur Cloudflare Workers ?** Si non, plan B : Vercel derrière la façade Cloudflare.

## Verdict

**Oui. On garde l'option C (tout Cloudflare + Supabase) ; le plan B Vercel est écarté.**

- **Phase 1 (locale, 28/09) : réussie.** La vitrine Maymar, sans réécriture, se compile pour Workers et affiche des pages justes. Une fiche en cache reste servie quand la base est coupée.
- **Phase 2 (chez Cloudflare, 29/09) : réussie.**
  - La vitrine tourne chez Cloudflare.
  - **Pendant une panne de la base, les pages déjà vues restent servies en 50 à 70 ms**, y compris plus de 10 minutes après la fin de leur durée de fraîcheur.
  - Au retour de la base, elles se remettent à jour seules.
  - **Deux domaines ne reçoivent jamais la page de l'autre**, panne comprise.

Ce qui reste à construire est connu : la page de secours pour les pages jamais vues, le cache des pages à filtres, et un client Supabase qui abandonne vite quand la base ne répond pas (voir « Découvertes de la phase 2 »).

## Phase 1 : méthode (en local, 28/09/2026)

1. **Code** : copie de la vitrine Maymar (v1.9.9.1) dans `prototype/vitrine-workers/`. Seuls changements :
   - le nom du paquet ;
   - la configuration générée par vinext ;
   - la fiche produit (voir la découverte n°1).
2. **Données** : les 8 migrations Maymar ont été rejouées dans un Postgres 16 local, sans modification, avec les données de démarrage (4 produits, 20 variantes, 1 rayon, 3 zones). Elles ont ensuite été exportées dans `mock/donnees.json` et servies par un faux Supabase (`mock/postgrest.mjs`), qui imite l'API REST sur les seules lectures de la vitrine.
3. **Outils** : `vinext check`, puis `vinext init --platform=cloudflare --cdn-cache=response-store --image-optimization=cloudflare-images`, puis `vite build`, puis `vite preview`. Ce dernier exécute le Worker compilé dans workerd, le moteur de Cloudflare.

## Phase 1 : résultats mesurés en local

| Test | Résultat |
|---|---|
| Compatibilité (`vinext check`) | **95 %**, aucun blocage. Seul point partiel : le redimensionnement des images, qui demande Cloudflare Images (prévu) |
| Compilation de production | **Réussie en 18 s** |
| Taille du Worker (code serveur, compressé) | **0,47 Mo** (2,0 Mo brut). Limite : 10 Mo sur l'offre payante, 3 Mo sur l'offre gratuite |
| Les 8 pages (accueil, catalogue, rayon, fiche, recherche, sitemap, robots, 404) | **Toutes correctes** (200, et 404 pour la page inexistante) |
| Contenu de la fiche produit | Juste : nom, prix « 229,000 TND », stock réel « 8 pièces », coloris, bouton panier, délai « Livré en 1 à 5 jours ouvrés » calculé depuis les zones, titre, polices hébergées avec le site, feuille de style |
| Temps du 1er octet (local, indicatif seulement) | 30 à 75 ms |
| **Base coupée, page déjà en cache** | **Servie (200, contenu complet)**, y compris après expiration de sa durée de fraîcheur |
| Base coupée, page jamais visitée | Erreur 500. C'est attendu : c'est le rôle de l'instantané R2 et de la page de secours, pas encore construits |
| Base revenue | Tout repart, les pages manquantes se génèrent et entrent en cache |

## Découvertes de la phase 1

1. **Dans Maymar, les fiches produit et les pages rayon ne sont jamais mises en cache**, même sur un hébergement Next.js classique.
   - Le `revalidate = 300` ne suffit pas sur une route à segment dynamique (`/produit/[slug]`) : Next.js exige aussi `generateStaticParams`, et vinext reproduit cette règle.
   - Conséquence aujourd'hui : chaque visite d'une fiche interroge la base.
   - Correction faite dans le prototype : `generateStaticParams` qui renvoie une liste vide, donc génération à la première visite puis cache. Avant : `MISS` à chaque visite ; après : `MISS` puis `HIT`.
   - **À reporter dans Maymar et dans SkanEcom.**
2. **Les pages qui lisent les filtres dans l'adresse** (catalogue, rayon, recherche) sont dynamiques par nature. Pour les mettre en cache à l'étape 1, deux options :
   - soit on applique les filtres côté navigateur sur la page en cache ;
   - soit on met en cache par combinaison de filtres, avec une durée courte.

   C'est à trancher dans la conception du thème.
3. **Le schéma de Maymar est portable.** Les 8 migrations passent telles quelles sur un Postgres standard, en simulant seulement `auth.users` et `auth.uid()`. C'est une bonne nouvelle pour les sauvegardes hors fournisseur et pour une éventuelle cellule ailleurs.
4. **L'en-tête `Cache-Control` renvoyé est `private`.** Le cache vit donc dans le Worker (Response Store), pas dans les caches intermédiaires. C'est cohérent avec le cadrage (§3.1 et §4.1). **Confirmé chez Cloudflare le 29/09** : `private, max-age=0, must-revalidate`.

## Phase 2 : résultats mesurés chez Cloudflare (29/09/2026)

**Montage.** Quatre Workers déployés par le workflow `.github/workflows/prototype-vitrine.yml` :
- la vitrine (vinext) ;
- son cache de réponses (Response Store : Durable Object + R2) ;
- un faux Supabase avec un interrupteur de panne (`prototype/faux-supabase/`) ;
- un Worker « faux domaines » (`prototype/faux-domaines/`), qui présente la vitrine sous deux domaines de boutique.

Mesures faites depuis les serveurs de GitHub aux États-Unis (points de présence Cloudflare IAD, ORD, PDX), **pas depuis la Tunisie**. Chaque page est appelée 5 fois de suite.

| Test | Résultat |
|---|---|
| Déploiement | Réussi. Worker de 0,48 Mo compressé, démarrage en 3 ms |
| Accueil et fiches produit, en cache | **200, `HIT`, 50 à 70 ms** au 1er octet |
| Catalogue, rayon, recherche (pages à filtres) | 200, jamais en cache (`MISS`), 75 à 400 ms. Voir la découverte n°8 |
| **Base en panne, pages en cache** | **200, `HIT`, 50 à 70 ms** |
| **Base en panne, 5 minutes plus tard** (durée de fraîcheur de 300 s dépassée, pages vieilles de 10 à 11 minutes) | **200, 50 à 70 ms**, état `UPDATING` : l'ancienne page est servie pendant qu'une mise à jour est tentée en arrière-plan |
| Base en panne, pages à filtres | **500 au bout de 7,1 s**. Voir les découvertes n°7 et n°8 |
| Base en panne, fiche jamais visitée | 500. Attendu : c'est le rôle de la page de secours, pas encore construite |
| **Base revenue** | Tout répond 200. Le premier visiteur reçoit encore l'ancienne page et déclenche la mise à jour ; deux minutes plus tard, les pages sont fraîches (`HIT`, âge 134 s) |
| **Séparation du cache entre deux domaines** (7 contrôles × 5 passages, panne comprise) | **Réussie à chaque passage.** `boutique-a.exemple.tn` et `boutique-b.exemple.tn` demandent la même adresse `/test-domaine` : chacune reçoit sa page, depuis son entrée de cache. L'adresse interne `/_b/boutique-b/…` demandée sous le domaine A répond 404 |
| Journaux des deux Workers pendant des lectures en cache | Aucune erreur |

## Découvertes de la phase 2

5. **Un Worker ne peut pas appeler par `fetch` un autre Worker du même sous-domaine `workers.dev`** (erreur 1042) : premier déploiement, toutes les pages en 500. Corrigé par le drapeau `global_fetch_strictly_public`. Propre au prototype : la vraie base est chez Supabase, pas dans un Worker.
6. **Le cache repart de zéro à chaque déploiement.**
   - Le cache de réponses range tout par version du Worker. C'est ce qui rend le retour arrière sûr : l'ancienne version retrouve son cache.
   - Mais juste après un déploiement, aucune page n'est protégée contre une panne.
   - Les anciennes versions restent sur R2 et ne sont jamais effacées automatiquement.
   - Parades pour l'étape 1, reportées dans `02-infrastructure.md` §4.1 : déploiement en deux temps avec cache prérempli (`--warm-cache` de vinext, à tester), pas de déploiement quand la base va mal, nettoyage mensuel des anciennes versions.
7. **Le client Supabase réessaie 3 fois, au bout de 1 s, puis 2 s, puis 4 s**, quand la base répond 503, d'où les 7,1 s avant l'erreur. Pendant une panne, chaque page non mise en cache fait attendre le visiteur 7 secondes, puis affiche une erreur. **À faire à l'étape 1** :
   - côté vitrine, `createClient(…, { db: { retry: false, timeout: 2000 } })` ;
   - un coupe-circuit qui, après quelques échecs, passe directement à la page de secours pendant une minute.
8. **Les pages à filtres ne sont jamais en cache, confirmé chez Cloudflare** : catalogue, rayon et recherche. Ce sont souvent les pages les plus visitées. Pendant une panne, elles tombent. La décision de la découverte n°2 devient prioritaire pour le thème de l'étape 1. Recommandation :
   - mettre en cache la page sans filtres, et appliquer les filtres dans le navigateur quand le catalogue est petit ;
   - mettre en cache par combinaison de filtres courante quand le catalogue est grand (`02-infrastructure.md` §3).
9. **Adresse interne `/_b/…` : le dossier doit s'appeler `%5Fb`.** Dans Next.js, un dossier qui commence par « _ » est privé et n'est pas routé ; vinext suit la même règle. Modèle : `src/proxy.ts` et `src/app/%5Fb/[boutique]/test-domaine/page.tsx`.
10. **Une page qui vient d'être générée reste en `MISS` pendant environ 1 seconde.**
    - L'écriture en cache se fait après la réponse.
    - Le cache de réponses retient chaque absence pendant 1 s (constante du code).
    - Sans conséquence pour les visiteurs, mais il faut en tenir compte dans les mesures.
11. **Une erreur 500 isolée** sur l'accueil, à la 2e requête juste après le premier déploiement réussi. Pas reproduite ensuite, sur plus de 30 appels de l'accueil. À surveiller.
12. **Le cache de réponses construit sa clé à partir du chemin et des paramètres de l'adresse, sans le domaine** (lu dans son code). vinext ajoute l'adresse complète dans sa propre clé. On ne s'appuie pas sur ce détail : **c'est la réécriture `/_b/<boutique>/…` qui garantit la séparation**, et le test la vérifie.

## Ce qui reste à mesurer

| À mesurer | Quand |
|---|---|
| Temps de réponse depuis la Tunisie (point de présence de Tunis) | Quand Skander le souhaite : relancer `deployer` (2 minutes), ouvrir la vitrine sur son téléphone, puis `supprimer` |
| Connexion à la vraie base Supabase depuis Workers (REST ou Hyperdrive), latence Paris ↔ Workers | Étape 2, avec le projet Supabase SkanEcom |
| Déploiement en deux temps avec cache prérempli (`--warm-cache`), purge par étiquette | Étape 1, avec la vraie vitrine multi-boutique |
| Coût réel par million de requêtes (Workers, cache de réponses, R2) | Après un mois de trafic réel |
| Images (Cloudflare Images) | Étape 1 |

## Relancer la phase 2

Onglet **Actions** du dépôt, workflow « Prototype vitrine (Cloudflare Workers) », bouton **Run workflow**. Actions possibles :
- `deployer`, `panne`, `retablir` ;
- `diagnostic`, qui résume les journaux des deux Workers ;
- `supprimer`, qui efface les quatre Workers.

Il faut les secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`. Le jeton ajouté le 29/09 expire au bout d'un mois.

## Relancer le prototype en local

```bash
cd prototype/vitrine-workers
bun install
node mock/postgrest.mjs &                     # faux Supabase sur 127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=cle-factice-prototype
export NEXT_PUBLIC_SITE_URL=http://localhost:4173
bun run build:vinext
bun run start:vinext --port 4173              # le Worker compilé, dans workerd
```

Test de panne : arrêter `mock/postgrest.mjs`, puis recharger une fiche déjà visitée (elle reste servie) et une fiche jamais visitée (erreur 500, en attendant l'instantané R2).

Test des deux domaines en local : `curl -H "Host: boutique-a.exemple.tn" http://localhost:4173/test-domaine`, puis la même chose avec `boutique-b`. Chaque réponse doit nommer sa boutique. `vite.config.ts` autorise les domaines `.exemple.tn` pour ce test.
