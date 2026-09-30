# SkanEcom

Boutique en ligne clé en main, en marque blanche, pour les entreprises tunisiennes. Un seul produit, installé et maintenu par nous, que chaque client habille à sa marque par des réglages : belle comme une grande marque, pensée pour le paiement à la livraison, et qui reste ouverte même quand nos serveurs tombent.

**État au 29/09/2026 : cadrage v0.2 (marque blanche), étape 1 en cours : prototype réussi, base multi-boutique et vitrine multi-boutique construites et testées.** Premiers clients visés : Maymar (client n°1), un distributeur DeWalt, une quincaillerie.

- Cadrage : [`docs/cadrage/`](docs/cadrage/README.md) — PRD, infrastructure, reprise de Maymar, décisions et risques.
- Prototype : [`prototype/vitrine-workers/RAPPORT.md`](prototype/vitrine-workers/RAPPORT.md) — la vitrine Maymar sur Cloudflare Workers, réussi en local puis chez Cloudflare.
- Vitrine et console : [`application/`](application/) — une application pour toutes les boutiques (domaine → boutique, deux gabarits — éditorial pour la mode et les bagages, technique pour l'outillage —, thème par boutique, catalogue en base) et la console de mise en place (double authentification, actions tracées).
- **Essayer sur son poste** : `outils/essayer.sh`, pas-à-pas dans [`docs/TESTER.md`](docs/TESTER.md) — trois boutiques de démonstration et la console.
- Base de données : [`supabase/`](supabase/) — schéma multi-boutique et 944 tests (isolation, commandes, tunnel, backoffice, équipes, catalogue, photos, réglages, clients, pages légales, images de la marque, modules, retrait en magasin, mes commandes, mise en place, accès support, photos à l'import, fiches techniques, supplément au poids, service après-vente, tableau de bord, encaissements, réception, quantité minimale, comptes professionnels, devis) ; base et API locales (PostgREST et GoTrue) avec `outils/base-locale.sh` et `outils/api-locale.sh`.
- Pour reprendre le développement : [`docs/SUITE-DEV.md`](docs/SUITE-DEV.md).
