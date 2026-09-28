# SkanEcom — PRD v0

> Statut : **brouillon v0, à valider par Skander**. Rédigé le 28/09/2026.
> Décisions déjà prises par Skander (28/09) : plateforme **en autonomie** (self-service) ; **marché tunisien** d'abord ; cibles : **petits vendeurs ET entreprises établies** ; nom : **SkanEcom** ; **Maymar est le client n°1**.
> Documents liés :
> - [`02-infrastructure.md`](02-infrastructure.md) : tenir la charge, rester ouvert ;
> - [`03-reprise-maymar.md`](03-reprise-maymar.md) : ce qu'on garde du code Maymar ;
> - [`04-risques-et-decisions.md`](04-risques-et-decisions.md) : décisions à trancher, registre des risques.

---

## 1. En une phrase

**SkanEcom est un Shopify pensé pour la Tunisie.** N'importe quelle entreprise, du vendeur Instagram à la marque établie, s'inscrit seule et met en ligne en quelques minutes une boutique **belle comme une grande marque**, **pensée pour le paiement à la livraison**, et **qui reste ouverte même quand nos serveurs tombent**.

Promesse proposée : **« Vos ventes ne s'arrêtent jamais. »**

---

## 2. Le marché, ce qu'on sait vraiment

*Étude du 28/09/2026. Beaucoup de chiffres viennent de blogs d'éditeurs intéressés : on les donne avec leur niveau de confiance.*

| Fait | Valeur | Confiance | Source |
|---|---|---|---|
| Paiements en ligne mesurés par la BCT | 1 375 MDT en 2025 (+31 %), 771 MDT au S1 2026 (+28 %) | Moyenne | [African Manager](https://africanmanager.com/tunisie-193-millions-de-transactions-commerciales-enregistrees-en-2025/), [Challenges](https://www.challenges.tn/economie/paiements-en-tunisie-le-mobile-et-le-commerce-en-forte-hausse-au-s1-2026-bct/) |
| Sites avec paiement en ligne actif | 1 456 (S1 2026) | Moyenne | [Managers](https://managers.tn/2026/08/14/paiements-en-tunisie-les-usages-numeriques-poursuivent-leur-progression-au-premier-semestre-2026/) |
| Part des commandes payées à la livraison (COD) | ≈ 70 à 85 % | Moyenne | [Atelier Cadran](https://ateliercadran.com/guides/vente-en-ligne/livraison-e-commerce-tunisie-guide/), [La Presse](https://www.lapresse.tn/2026/02/09/e-commerce-le-paiement-a-la-livraison-freine-encore-la-transition-digitale/) |
| Taux de refus ou de retour en COD | 12 à 30 % | **Faible** (sources divergentes) | [Tunisie Numérique](https://www.tunisienumerique.com/retours-ecommerce-menace-rentabilite/) |
| Coût d'une livraison | 4 à 9 TND l'aller, ≈ 4 TND le retour | Moyenne | [Intigo](https://intigo.net/services/livraison-express/) |
| Trafic venant des publicités Meta | > 80 % | Moyenne | [Baromètre MDWEB](https://www.tunisienumerique.com/exclusif-le-barometre-du-e-commerce-en-tunisie-vague-04-decryptage-des-tendances/) |
| Boutiques Shopify tunisiennes | 860 (+74 % sur un an) | Moyenne | [StoreLeads](https://storeleads.app/reports/shopify/TN/top-stores) |
| Part de WooCommerce | ≈ 40 % des boutiques | Moyenne | [ShopRank](https://shoprank.com/countries/tunisia) |
| Coût d'un site d'agence | 1 500 à 5 000 TND, + 30 à 200 TND/mois d'hébergement | Moyenne | [web6](https://web6.tn/blog/prix-creation-site-web-tunisie/) |

**Ce que ça veut dire :**
- **Le COD domine et restera dominant.** Tout le produit est pensé COD d'abord.
- **Le refus à la livraison est la première perte des commerçants, et elle se chiffre en dinars.** Exemple illustratif : 1 000 colis par mois, 20 % de refus et 8 TND par trajet font environ 3 200 TND perdus chaque mois en transport seul.
- **Le trafic arrive par pics** (publicités, influenceurs), surtout sur mobile.
- **Aucune taille de marché fiable n'existe.** Les estimations vont de 215 M$ à plus de 2,5 Md TND. On ne cite donc pas de taille de marché comme un fait.
- **Le départ de Jumia (fin 2024)** a laissé les vendeurs sans grande place de marché. L'argument « possédez votre canal de vente » est crédible.

---

## 3. La concurrence

| Acteur | Modèle | Ce qu'il fait bien | Sa limite |
|---|---|---|---|
| **Converty** (Tunis, 2024) | Gratuit jusqu'à 10 000 TND de ventes, puis 0,3 % ; forfaits dès 99 $/mois au-delà de 90 000 TND sur 30 jours ([conditions](https://converty.shop/fr/payment-policy)) | COD natif, livreurs intégrés, FR/AR, anti-fausses commandes, facturation conforme | Culture « tunnel de vente » et sous-domaine ; aucun engagement de disponibilité trouvé |
| **TikTak PRO** (2021) | À la transaction (dès 100 millimes) ou abonnement ; serveur dédié à 2 000 TND/an | Centre d'appel de confirmation (CRM d'agents), 100 % arabe ; 47 000 boutiques créées revendiquées | Prix peu lisibles |
| **Mallatech** | 29, 79 ou 129 DT/mois, 60 jours d'essai | Plus de 15 livreurs, SMS gratuits, profit net par commande | Repère de prix bas |
| **e-Tijara, Shopini** | Gratuit ou freemium | Prix | Le prix plancher du marché est donc zéro |
| **YouCan** (Maroc) | 29 à 187 $/mois, ou 0,5 % par commande COD | Modèle connu | Facturé en USD ; plaintes sur les fermetures et le support |
| **Shopify** | 39, 105 ou 399 $/mois, + 2 %, 1 % ou 0,6 % avec une passerelle tierce | Qualité, écosystème ; Flouci intégré depuis juin 2026 | Dollars et carte internationale (plafond de 1 000 TND/an pour un particulier), COD basique |
| **WooCommerce + agences** | Site payé une fois + hébergement | Liberté | Maintenance, sécurité, pannes à la charge du commerçant |

**Conclusion.** Le prix plancher est zéro, et le « local » (COD, livreurs, arabe) est **le minimum attendu**, pas un avantage. On ne gagnera ni sur le prix ni sur le simple fait d'être tunisien.

---

## 4. Positionnement : où SkanEcom gagne

### 4.1 Trois piliers

| Pilier | Ce que le commerçant ressent | Preuve qu'on peut apporter |
|---|---|---|
| **Beau** | Sa boutique ressemble à une marque, pas à un modèle ; elle inspire confiance, donc vend mieux | Maymar, construit avec la charte « premium sobre » |
| **Fiable** | Sa boutique reste ouverte même quand nos serveurs tombent ; les commandes ne se perdent jamais | Page de statut publique, engagement de disponibilité sur l'offre Business, architecture décrite dans `02-infrastructure.md` |
| **Rentable** | Moins de refus : confirmation par appel, WhatsApp ou SMS, clients à risque signalés, suivi livreur, rapprochement du cash COD | Tableau de bord des refus, mesuré d'abord sur Maymar |

Le **local** reste le socle (dinars, arabe, livreurs, facture électronique), sans être l'argument principal.

### 4.2 Les deux cibles, et dans quel ordre les attaquer

Les deux cibles sont décidées, et le produit les sert toutes les deux avec **un seul produit en trois paliers**. **L'ordre d'acquisition recommandé** est une proposition à valider :

1. **D'abord les entreprises établies et les vendeurs qui ont du volume** : importateurs, enseignes, marques, vendeurs à plus de 300 commandes par mois. Ils paient déjà une agence (1 500 à 5 000 TND) ou perdent de l'argent sur les refus. Ils sont moins nombreux et plus fidèles, ce qui convient à une petite équipe.
2. **En parallèle, le petit vendeur a son offre Starter dès le lancement**, mais **sans guerre du gratuit** contre Converty ou e-Tijara. Une offre gratuite pourra venir plus tard, comme canal d'acquisition, quand le coût réel par boutique sera mesuré.

### 4.3 Proposition d'installation assistée (option)

Beaucoup d'entreprises établies, comme Maymar, n'ont ni le temps ni les compétences. Leur goulot est le **contenu** (photos, fiches produit), pas l'outil. On propose donc des **packs payants de mise en ligne** en plus du self-service :
- protocole photo ;
- import du catalogue ;
- réglage du thème ;
- formation.

Fourchette à tester : 490 à 1 990 TND, une fois. Le pack est réalisé en grande partie par l'équipe d'agents.

---

## 5. Modèle économique

- **Abonnement mensuel en dinars, prépayé** (mensuel, trimestriel ou annuel). **Aucun prélèvement automatique récurrent n'existe en Tunisie**, et Converty fait lui-même renouveler à la main. Le paiement se fait par lien Konnect ou Flouci vers le compte de SkanEcom, ou par virement. Il faut donc un moteur de relances (J-7, J-3, J0) et une période de grâce.
- **Impayé : on dégrade par paliers, sans jamais couper la vitrine d'un coup.**
  1. bandeau d'avertissement ;
  2. backoffice en lecture seule ;
  3. vitrine en mode catalogue.

  Rien n'est supprimé avant un long délai. La promesse « vos ventes ne s'arrêtent jamais » vaut aussi pour les retards de paiement.
- **Grille de départ à valider par 10 à 15 entretiens** (aucun prix n'est validé par le marché) :

| Palier | Pour qui | Fourchette à tester (TND/mois) |
|---|---|---|
| Starter | Petit vendeur qui démarre | 39 à 59 |
| Pro | Boutique qui grandit | 149 à 199 |
| Business | Entreprise établie | 399 à 790 |

  Repères : Mallatech à 29/79/129 DT, Shopify Basic à environ 115 TND + 2 %, agences à 1 500-5 000 TND.
- **Commission sur les ventes : à trancher.** Recommandation : **pas de commission**. Sur du COD, l'argent passe par le livreur, pas par nous : elle serait difficile à encaisser. Et « zéro commission » est un argument face à Converty et YouCan.
- **Essai gratuit** de 14 à 30 jours (durée à trancher).
- **SkanEcom n'encaisse jamais l'argent des ventes des boutiques.** Chaque boutique branche **son propre** compte Konnect ou Flouci. Sinon, il faudrait un agrément BCT, avec un risque pénal : les fonds de Paymee ont été gelés en 2023 ([Webdo](https://www.webdo.tn/fr/actualite/national/tunisie-enquete-gel-de-fonds-la-startup-paymee-en-peril/212483/)).
- **Nos propres factures d'abonnement sont électroniques** (format TEIF via El Fatoora de TTN), obligatoire pour les services depuis le 01/01/2026 ([La Presse](https://www.lapresse.tn/2026/01/07/tout-comprendre-a-la-facture-electronique-qui-simpose-en-tunisie-en-2026/)). TVA 19 %, timbre de 1 TND, retenue à la source éventuelle acceptée.

---

## 6. Principes produit (non négociables)

1. **« Quand t'as un doute, fais les deux et mets-le en réglage. »** Toute alternative défendable devient un réglage de la boutique. Les offres Starter, Pro et Business ne sont que des **paquets de réglages autorisés**.
2. **COD d'abord.** Le paiement en ligne est une option qui s'efface automatiquement si le PSP est en panne. Le COD ne dépend d'aucun tiers au moment de la commande.
3. **Mobile d'abord, backoffice compris.** Le commerçant gère tout depuis son téléphone, aussi bien que depuis un ordinateur.
4. **Beau par défaut.** Un commerçant sans aucun goût graphique obtient quand même une boutique propre. Les thèmes interdisent les choix qui enlaidissent.
5. **Français et arabe, avec un vrai RTL, dès le premier écran.**
6. **Les données du commerçant lui appartiennent** : export complet (produits, clients, commandes) à tout moment, en un clic. C'est l'antidote aux griefs visant YouCan.
7. **Aucune commande perdue**, même pendant une panne (voir `02-infrastructure.md`, §4.2).

---

## 7. Périmètre de la v1

Priorités : **M** = indispensable au lancement public · **S** = souhaité au lancement · **C** = si le temps le permet.

### 7.1 Plateforme (côté SkanEcom)

| # | Fonction | Priorité |
|---|---|---|
| P1 | Inscription du commerçant : téléphone ou e-mail, profil juridique (particulier, auto-entrepreneur, société), vérification | M |
| P2 | **Assistant de création** : nom, logo, couleurs, thème, premiers produits → boutique en ligne sur son sous-domaine gratuit | M |
| P3 | Offres, essai, abonnement prépayé, relances, grâce, dégradation par paliers | M |
| P4 | Factures électroniques TEIF via un intermédiaire TTN | M |
| P5 | **Console SkanEcom** : boutiques, abonnements, support (accès tracé), suspension, signalements | M |
| P6 | Site commercial `skanecom.tn` : présentation, tarifs, inscription, page de statut | M |
| P7 | Vérification légère de l'identité du commerçant (KYC) avant domaine personnalisé ou paiement en ligne | S |
| P8 | Packs d'installation assistée (commande, suivi) | C |

### 7.2 Backoffice du commerçant

| # | Fonction | Priorité |
|---|---|---|
| B1 | Catalogue : produits à variantes (taille, couleur…), prix et stock par variante, catégories libres, photos | M (repris de Maymar) |
| B2 | Stock : journal des mouvements, réservation à la commande, retour en stock au refus ou à l'annulation | M (repris de Maymar) |
| B3 | **Cycle de commande COD complet** : reçue → confirmée → expédiée → livrée / refusée (origine tracée : client, livreur, injoignable) / annulée | M (repris de Maymar) |
| B4 | **Confirmation** : appel en un clic, modèle WhatsApp, SMS ; canal réglable par boutique ; file de confirmation | M |
| B5 | **Livreurs** : 3 à 5 transporteurs par API derrière une file (candidats : Intigo, First Delivery, Navex, Aramex, un acteur fort à l'intérieur du pays) ; bordereau PDF en repli | M |
| B6 | **Rapprochement du cash COD** : attendu / reversé / frais / retenue de 3 % / retards, avec alertes | S |
| B7 | **Tableau de bord des refus** : par origine, gouvernorat, produit, livreur ; clients à risque | S |
| B8 | Clients (par boutique), adresses, historique | M |
| B9 | Équipe : plusieurs employés, rôles (propriétaire, administrateur, confirmateur, préparateur), double authentification pour les administrateurs | M |
| B10 | Réglages de la boutique (frais fixes ou par gouvernorat, confirmation, compte obligatoire ou invité, rupture, langues…) | M (étend Maymar) |
| B11 | Import CSV/Excel ; **import WooCommerce** | S |
| B12 | Export complet des données | M |
| B13 | Profit net par commande (avec coût publicitaire saisi) | C |

### 7.3 Vitrine (ce que voient les acheteurs)

| # | Fonction | Priorité |
|---|---|---|
| V1 | **2 à 3 thèmes** (le 1er est tiré de la charte Maymar), personnalisés par jetons (couleurs, polices, logo) et sections d'accueil configurables | M |
| V2 | Accueil, rayons, fiche produit (choix de variante, prix et stock par variante), recherche, panier, commande COD | M (repris de Maymar) |
| V3 | FR/AR avec RTL, TND | M |
| V4 | Performance mobile : LCP < 2,5 s en 4G sur un Android d'entrée de gamme ; images AVIF/WebP | M |
| V5 | SEO : pages rendues côté serveur, sitemap, données structurées, métadonnées par produit | M (en partie repris de Maymar) |
| V6 | Pixel Meta + API Conversions, pixel TikTok | S |
| V7 | CGV, mentions légales, rétractation (10 jours ouvrables par défaut, réglable) générées par boutique ; consentement explicite des acheteurs | M |
| V8 | Domaine personnalisé (Pro et au-delà) | S |
| V9 | Paiement en ligne Konnect et Flouci (compte du commerçant), désactivé par défaut | S |

### 7.4 Hors v1 (et pourquoi)

| Pas en v1 | Pourquoi |
|---|---|
| Offre gratuite illimitée | Prix plancher zéro, support massif, fausses commandes : incompatible avec l'équipe et l'infrastructure au démarrage |
| Place de marché multi-vendeurs | Autre métier |
| Applications et thèmes tiers, API publique ouverte | Il faut d'abord un socle stable ; API et webhooks pour l'offre Business à l'étape 5 |
| HTML, CSS ou JS libres dans les thèmes | Risques de sécurité (XSS) et de laideur ; sections structurées seulement |
| Caisse en magasin, applications mobiles natives | Le web mobile suffit en v1 |
| Autres pays, autres devises | Tunisie d'abord ; le modèle de données le permettra (devise par boutique) |
| **Catalogue partagé fournisseur → revendeurs** | Idée à explorer avec l'associé importateur de Maymar ; **le modèle de données ne doit pas l'empêcher** (voir `03-reprise-maymar.md`) |

---

## 8. Parcours clés et indicateurs

| Parcours | Indicateur | Objectif v1 (hypothèse) |
|---|---|---|
| Inscription → boutique en ligne | Temps médian | < 10 minutes, sans nous appeler |
| Activation | % d'inscrits avec boutique publiée à J+7 / avec une 1re commande à J+30 | 60 % / 30 % |
| Confirmation COD | % de commandes confirmées sous 24 h | > 80 % |
| Refus | Taux de refus des boutiques, comparé au taux de départ | En baisse, mesurée d'abord sur Maymar |
| Rétention | % de boutiques payantes encore actives à 3 mois | > 70 % |
| Fiabilité | Disponibilité de la vitrine / de la prise de commande | 99,95 % / 99,9 % |
| Charge de support | Tickets par boutique et par mois | < 0,5 |

---

## 9. Exigences légales et administratives (bloquantes)

| Sujet | Obligation | Quand |
|---|---|---|
| **Données personnelles** (loi 2004-63) | Déclaration à l'INPDP + **autorisation préalable de transfert** (serveurs en France), sous peine d'1 an de prison et 5 000 TND ; silence au-delà d'un mois = refus implicite | **Avant la première boutique tierce** (étape 3) |
| Accord de sous-traitance | Le commerçant est responsable de traitement, SkanEcom sous-traitant | Étape 3 |
| **Facture électronique** | Adhésion à TTN, certificat de signature, intermédiaire API | Avant la première facture payante |
| Change | Label Startup Act (plafond CTI de 100 000 TND/an), 2 cartes, crédits prépayés | Dès l'étape 2 (voir `02-infrastructure.md`, §7) |
| Commerce électronique (loi 2000-83) | Rétractation de 10 jours ouvrables, récapitulatif de commande | Dans les CGV générées (V7) |
| Retenue de 3 % par les livreurs (LF 2025) | Pour les vendeurs sans matricule fiscal : à modéliser dans le rapprochement COD | B6 |
| Projets de loi en cours | E-commerce et réseaux sociaux (042/2024, rétractation de 3 jours), données personnelles (095/2025), code des changes (115/2025) | Veille ; délais réglables |
| Marque et domaines | Dépôt de la marque SkanEcom à l'INNORPI ; `skanecom.tn` via un bureau agréé ATI ; `skanecom.com` (libre au 28/09/2026) ; domaine des vitrines | Étape 0 |

Un avocat tunisien doit valider les points INPDP et BCT. Un expert-comptable doit valider la TVA et la retenue à la source sur nos achats cloud à l'étranger.

---

## 10. Feuille de route

On ne donne pas de dates avant la fin du cadrage. Chaque étape a un critère de fin, et **on ne passe à la suivante que lorsqu'il est atteint**.

| Étape | Contenu | Fini quand |
|---|---|---|
| **0. Cadrage** (maintenant) | Ce PRD, l'infrastructure, l'identité visuelle, les démarches administratives lancées | Décisions du doc 04 tranchées par Skander |
| **1. Socle** | Multi-boutique, sécurité et isolation, façade, thèmes, réglages | Deux boutiques de test isolées, tests d'isolation verts, vitrine servie application coupée |
| **2. Maymar** | La 1re vraie boutique sur SkanEcom (domaine `maymar.tn`) | De vraies commandes livrées ; exercice de panne réussi |
| **3. Bêta privée** | 10 à 20 commerçants accompagnés, livreurs et confirmation branchés | Ils vendent sans nous ; SLO tenus 1 mois ; INPDP déposé |
| **4. Lancement public** | Inscription libre, paliers, abonnement en dinars, facturation TEIF | Des inscrits paient ; test de charge et liste de sécurité validés |
| **5. Entreprises** | Domaines, équipes, import, API et webhooks, cellule dédiée | Un premier client établi signe |

---

## 11. Questions ouvertes (pour Skander)

1. Prix des paliers : on lance les 10 à 15 entretiens (dont l'associé importateur de Maymar) ?
2. Commission sur les ventes : on confirme **zéro commission** ?
3. Ordre d'acquisition : on confirme **établis et vendeurs à volume d'abord**, Starter sans gratuit ?
4. Installation assistée payante : oui ou non ?
5. Domaine des vitrines gratuites : `.tn` ou gTLD sur la Public Suffix List (voir le doc 04) ?
6. Qui porte les démarches (INPDP, Startup Act, TTN, INNORPI) ? Faut-il un avocat et un comptable dès maintenant ?
7. Catalogue partagé fournisseur → revendeurs : faut-il en parler à l'associé de Maymar ?
