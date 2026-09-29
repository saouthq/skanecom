# Cadrage SkanEcom — v0.2 (29/09/2026)

**SkanEcom est une boutique en ligne clé en main, en marque blanche**, installée et maintenue par Skander et son père pour 10 à 50 entreprises établies. Un seul produit ; chaque client l'habille à sa marque par des réglages.

À lire dans cet ordre :

1. [`01-prd.md`](01-prd.md) — **Le produit.** L'offre, les clients visés, le périmètre de la v1, la mise en place d'un client, la feuille de route.
2. [`02-infrastructure.md`](02-infrastructure.md) — **L'infrastructure.** Cloudflare + Supabase, les grands catalogues, la boutique qui reste ouverte en cas de panne, les coûts.
3. [`03-reprise-maymar.md`](03-reprise-maymar.md) — **La reprise du code Maymar.** Ce qu'on garde, ce qu'on corrige, le modèle de données multi-boutique.
4. [`04-risques-et-decisions.md`](04-risques-et-decisions.md) — **À trancher.** Décisions prises et ouvertes, registre des risques, actions immédiates.

Prototype technique : [`../../prototype/vitrine-workers/RAPPORT.md`](../../prototype/vitrine-workers/RAPPORT.md). La vitrine Maymar tourne sur Cloudflare Workers ; phase locale réussie le 28/09.

## Annexes : la version « plateforme en autonomie » du 28/09

Le 28/09, le projet visait une plateforme « type Shopify » où des milliers de commerçants s'inscrivent seuls. Le 29/09, Skander l'a recentré sur la marque blanche (décision D15). Les documents de cette première version sont gardés pour le jour où l'on ouvrira l'inscription libre :
- [`annexes/prd-v0-plateforme-autonomie.md`](annexes/prd-v0-plateforme-autonomie.md) : marché, concurrence et positionnement détaillés, toujours utiles pour vendre ;
- [`annexes/infrastructure-grande-echelle.md`](annexes/infrastructure-grande-echelle.md) : l'architecture pour 10 000 boutiques (cellules, tampon de commandes, multi-CDN).

La présentation [SkanEcom — la vision](https://claude.ai/artifact/Mqo7HLf7ws83KBkBEn8ai1) décrit encore la version du 28/09.

## Méthode et limites

- Étude de marché et de l'écosystème tunisien du 28/09/2026, sourcée ; documentation officielle de Cloudflare, Vercel et Supabase ; lecture directe du code Maymar ; prototype.
- Le quota de recherche web de la session a été épuisé le 28/09. Les points non vérifiés sont marqués « à reconfirmer », « hypothèse » ou « à valider ».
