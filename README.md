# SkanEcom

Boutique en ligne clé en main, en marque blanche, pour les entreprises tunisiennes. Un seul produit, installé et maintenu par nous, que chaque client habille à sa marque par des réglages : belle comme une grande marque, pensée pour le paiement à la livraison, et qui reste ouverte même quand nos serveurs tombent.

**État au 29/09/2026 : cadrage v0.2 (marque blanche), étape 1 en cours : prototype réussi, base multi-boutique et vitrine multi-boutique construites et testées.** Premiers clients visés : Maymar (client n°1), un distributeur DeWalt, une quincaillerie.

- Cadrage : [`docs/cadrage/`](docs/cadrage/README.md) — PRD, infrastructure, reprise de Maymar, décisions et risques.
- Prototype : [`prototype/vitrine-workers/RAPPORT.md`](prototype/vitrine-workers/RAPPORT.md) — la vitrine Maymar sur Cloudflare Workers, réussi en local puis chez Cloudflare.
- Vitrine : [`application/`](application/) — une application pour toutes les boutiques (domaine → boutique, thème par boutique, catalogue en base).
- Base de données : [`supabase/`](supabase/) — schéma multi-boutique et 163 tests d'isolation ; base et API locales avec `outils/base-locale.sh` et `outils/api-locale.sh`.
- Pour reprendre le développement : [`docs/SUITE-DEV.md`](docs/SUITE-DEV.md).
