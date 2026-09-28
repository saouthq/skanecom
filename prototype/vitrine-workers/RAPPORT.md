# Prototype — la vitrine Maymar sur Cloudflare Workers (vinext)

> 28/09/2026 · porte de décision de l'étape 1 (`docs/cadrage/02-infrastructure.md`, §8).
> Question posée : **le code Next.js de Maymar tourne-t-il correctement sur Cloudflare Workers ?** Si non, plan B : Vercel derrière la façade Cloudflare.

## Verdict provisoire

**Phase 1 (locale) : réussie.** La vitrine Maymar, sans réécriture, se compile pour Workers, tourne dans le vrai moteur Workers (workerd, en local) et affiche des pages justes. **Une fiche déjà en cache reste servie quand la base est coupée.**

**Phase 2 (sur Cloudflare) : pas encore faite.** Depuis le conteneur de travail, l'API de Cloudflare est injoignable et aucun jeton de déploiement n'est disponible. Le projet Supabase de Maymar est par ailleurs **en pause** (offre gratuite, inactif depuis août). Il faut ces accès pour mesurer ce qui ne se mesure qu'en vrai (voir plus bas).

**On peut rester sur l'option C (tout Cloudflare + Supabase).** Rien n'impose le plan B à ce stade.

## Méthode

1. **Code** : copie de la vitrine Maymar (v1.9.9.1) dans `prototype/vitrine-workers/`. Seuls changements :
   - le nom du paquet ;
   - la configuration générée par vinext ;
   - la fiche produit (voir la découverte n°1).
2. **Données** : les 8 migrations Maymar ont été rejouées dans un Postgres 16 local, sans modification, avec les données de démarrage (4 produits, 20 variantes, 1 rayon, 3 zones). Elles ont ensuite été exportées dans `mock/donnees.json` et servies par un faux Supabase (`mock/postgrest.mjs`), qui imite l'API REST sur les seules lectures de la vitrine.
3. **Outils** : `vinext check`, puis `vinext init --platform=cloudflare --cdn-cache=response-store --image-optimization=cloudflare-images`, puis `vite build`, puis `vite preview`. Ce dernier exécute le Worker compilé dans workerd, le moteur de Cloudflare.

## Résultats mesurés

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

## Découvertes

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
4. **L'en-tête `Cache-Control` renvoyé est `private`.** Le cache vit donc dans le Worker (Response Store), pas dans les caches intermédiaires. C'est cohérent avec le cadrage (§3.1 et §4.1), à confirmer en vrai.

## Ce qui reste à mesurer sur Cloudflare (phase 2)

| À mesurer | Pourquoi ce n'est pas faisable en local |
|---|---|
| Temps de réponse réel depuis la Tunisie (point de présence de Tunis) | Il faut un vrai déploiement |
| Cache de réponses (Response Store sur R2) : `HIT`, `STALE`, purge par étiquette, **clé de cache par boutique** (`ctx.props`) | En local, le cache est émulé ; le comportement de production doit être vérifié |
| Déploiement cassé : le cache partagé entre versions sert-il encore les pages ? | Il faut les versions de Workers |
| Connexion à Supabase via Hyperdrive (ou REST) depuis Workers | Base injoignable et en pause depuis le conteneur |
| Coût réel par million de requêtes (Workers + Response Store + R2) | Il faut la facturation réelle |
| Images (Cloudflare Images) | Il faut un compte |

**Phase 2 prête à lancer (28/09/2026).**
- Le bucket R2 du cache (`skanecom-prototype-vitrine-response-store-cache-bodies`) a été créé sur le compte Cloudflare.
- Un faux Supabase déployable en Worker, avec un interrupteur de panne, est dans `prototype/faux-supabase/`. Il permet de refaire le test de coupure chez Cloudflare sans base réelle.
- Le workflow `.github/workflows/prototype-vitrine.yml` enchaîne tout : déploiement, mesures, panne simulée, rétablissement et suppression.
- L'accès Cloudflare de l'assistant sait créer du stockage, mais **pas déployer du code** : c'est pour ça que le déploiement passe par GitHub Actions.

Il ne manque que deux secrets GitHub : `CLOUDFLARE_API_TOKEN` (modèle « Edit Cloudflare Workers ») et `CLOUDFLARE_ACCOUNT_ID`.

**Ce qu'il fallait pour la phase 2 (analyse initiale) :**
- **Un jeton d'API Cloudflare**, modèle « Edit Cloudflare Workers », et l'autorisation d'accéder à `api.cloudflare.com` depuis l'environnement. L'alternative : lancer le déploiement depuis ton ordinateur (`bun run build:vinext`, puis `bun run deploy:response-store`, puis `bun run deploy:vinext`).
- **Une base joignable.** Soit on réactive le projet Supabase de Maymar, soit on crée le projet de la **cellule 1 de SkanEcom** (décision D13) et on y rejoue les migrations.

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
