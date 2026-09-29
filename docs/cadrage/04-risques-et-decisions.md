# SkanEcom — Décisions et risques (v0.2)

> Statut : **à trancher par Skander**. Mis à jour le 29/09/2026 après le recentrage sur la marque blanche.
> Chaque décision porte une recommandation. Une fois tranchée, on la note ici avec sa date. On ne la re-débat plus sans fait nouveau.

---

## 1. Décisions prises

| Date | Décision | Par |
|---|---|---|
| 28/09/2026 | Marché **tunisien** d'abord | Skander |
| 28/09/2026 | Nom : **SkanEcom** | Skander |
| 28/09/2026 | **Maymar est le client n°1** | Skander |
| 28/09/2026 | **D1 — Hébergement : Cloudflare** (domaines, application Next.js sur Workers, cache, R2, files) **+ Supabase** (données). Vercel seulement en plan B si le prototype échoue | Skander |
| 28/09/2026 | **D14 — Paiement en ligne pendant une panne de notre base** : masqué, le paiement à la livraison est proposé à la place. Aucune confirmation Konnect n'est perdue | Skander |
| **29/09/2026** | **D15 — Recentrage : boutique en ligne clé en main, en marque blanche**, vendue et mise en place par Skander et son père à **10 à 50 entreprises établies**. Un seul code et une seule base ; chaque client s'habille par des réglages. Remplace la plateforme en autonomie du 28/09 (archivée dans `annexes/`) | Skander |
| 29/09/2026 | **Premier cercle de prospects** : Maymar, un distributeur DeWalt, une quincaillerie | Skander |

**Décisions du 28/09 devenues sans objet avec D15** (gardées pour l'historique) :
- **D2**, domaine des vitrines gratuites sur la Public Suffix List : plus de sous-domaines gratuits, chaque client a son domaine.
- **D3**, commission sur les ventes : le modèle devient mise en place plus abonnement.
- **D4**, ordre d'acquisition : remplacé par le premier cercle de prospects.
- **D6**, installation assistée en option : elle devient le cœur de l'offre.
- **D7**, essai gratuit : sans objet.
- Les cibles « petits vendeurs » et « autonomie » : remplacées par les entreprises établies.

## 2. Décisions à trancher

| # | Question | Options | Recommandation | Pourquoi |
|---|---|---|---|---|
| D5 | **Prix** | Mise en place 1 500 à 4 000 TND ; abonnement 150 à 500 TND par mois (PRD §4.1) | **Valider avec les 3 prospects** avant de fixer | Aucun prix n'est validé par le marché |
| D16 | **Durée d'engagement** | Mensuel · annuel · 12 mois puis mensuel | **12 mois, puis mensuel** | La mise en place est un investissement pour nous ; ça rassure le client après la première année |
| D17 | **Modules pro** (prix pro, devis, retrait en magasin, fiches techniques) | Dans la v1 · après | **Ceux que le distributeur DeWalt et la quincaillerie jugent indispensables pour signer** | Construire ce qui fait signer, pas ce qui est possible |
| D18 | **Domaines des clients** | On gère leur DNS dans notre compte Cloudflare · ils le gardent et pointent vers nous | **On gère leur DNS** (c'est « clé en main »), l'autre option en repli | Moins de pannes, rien à faire pour le client |
| D19 | **2e thème « catalogue technique »** | Dès le 2e client · plus tard | **Dès le distributeur DeWalt ou la quincaillerie** | Le thème Maymar est pensé pour la bagagerie premium, pas pour 10 000 références d'outillage |
| D8 | **Label Startup Act** | Maintenant · avant 40 clients | **Avant d'atteindre 40 clients** | Le plafond de paiement à l'étranger devient serré vers 50 clients (`02-infrastructure.md`, §6) |
| D9 | **Démarche INPDP** (données dans l’UE) | Maintenant · avant le 2e client | **Préparer maintenant, déposer au plus tard avant le 2e client** (l’obligation vaut dès Maymar) | Risque pénal ; silence au-delà d’un mois = refus |
| D10 | **Avocat et comptable** | Maintenant · plus tard | **Maintenant, sur des questions ciblées** : contrat de service, sous-traitance des données, INPDP, TEIF | Nécessaire avant de facturer le 2e client |
| D11 | **Identité visuelle de SkanEcom** | Noah et Lina · autre | **Noah et Lina, en version légère** : logo, site commercial, plaquette | SkanEcom se vend à des entreprises : il faut une image, mais ce sont les boutiques des clients qui portent leur marque |
| D12 | **Livreurs à brancher** | Intigo, First Delivery, Navex, Aramex… | **Ceux qu'utilisent déjà Maymar et les 2 prospects** | Intégrer ce qui sert tout de suite |
| D13 | **Projet Supabase** | Réactiver celui de Maymar · en créer un pour SkanEcom | **Un nouveau projet SkanEcom, offre payante** ; Maymar y est migré | Schéma mono-boutique incompatible ; l'offre gratuite met les projets en pause |

## 3. Registre des risques

| # | Risque | Probabilité | Impact | Parade |
|---|---|---|---|---|
| R1 | **Dérive vers l'agence** : chaque client demande « son » développement et on finit avec N sites à maintenir | Élevée | Critique | Discipline du PRD §4.3 : tout devient un réglage pour tous, ou se facture cher. Jamais de copie |
| R2 | **Capacité** : Skander et son père sont deux pour vendre, mettre en place et assurer le support | Élevée | Élevé | Console et liste de mise en place, import Excel, durée mesurée et réduite à chaque client, support de premier niveau par les agents |
| R3 | **Grands catalogues** (quincaillerie, outillage) : lenteur, import pénible | Élevée | Élevé | Filtres et recherche en base, import par lots avec rapport d'erreurs (`02-infrastructure.md`, §3) |
| R4 | **Fuite de données entre clients** | Moyenne sans garde-fous | Critique | FK composites, RLS par boutique, tests d'isolation bloquants, cache séparé par boutique |
| R5 | **Photos et contenu** : un client n'a pas de bonnes photos, la boutique paraît pauvre | Élevée (Maymar l'a déjà) | Élevé | Option photo payante, protocole photo simple, thème qui supporte « photo à venir » |
| R6 | **Cycle de vente long** chez les entreprises établies | Moyenne | Moyen | Maymar en vitrine de démonstration, premiers prix d'appel pour les clients 2 et 3 en échange d'un témoignage |
| R7 | **Carte refusée** chez un fournisseur étranger | Moyenne | Critique | Deux cartes, crédits prépayés, alertes sur les échéances |
| R8 | **Panne de la base ou de notre code** | Moyenne | Moyen | Cache, page de secours WhatsApp, retour arrière en quelques minutes |
| R9 | **Usage de la marque DeWalt** non conforme à l'accord du distributeur | Moyenne | Moyen | Vérifier l'accord de distribution avant d'utiliser logo et photos du fabricant |
| R10 | **Conformité** : INPDP, TEIF, contrat de service | Certaine si rien n'est fait | Élevé | Avocat et comptable avant le 2e client (D9, D10) |

## 4. Actions immédiates

| Action | Qui |
|---|---|
| Présenter l'offre au distributeur DeWalt et à la quincaillerie ; recueillir la taille des catalogues, les besoins pro et un avis sur les prix (D5, D17) | Skander et son père |
| Réserver `skanecom.tn` et `skanecom.com` ; déposer la marque à l'INNORPI | Skander |
| Ajouter les secrets Cloudflare sur le dépôt pour la phase 2 du prototype | Skander |
| Vérifier que le bureau d'enregistrement de `maymar.tn` accepte de déléguer le DNS à Cloudflare | Skander |
| Créer le projet Supabase SkanEcom, offre payante (D13) | Skander, avec mon aide |
| Questions pour l'avocat et le comptable (contrat, INPDP, TEIF) | Agent, puis Skander |
| Mettre à jour le `CLAUDE.md` du projet et le PRD officiel dans `claude-team` | Luna |
