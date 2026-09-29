# SkanEcom — Étude des clients 2 et 3 : revendeur DeWalt et quincaillerie

> 29/09/2026. Skander a demandé de ne pas interroger les prospects : cette étude fixe elle-même ce dont ils ont besoin, à partir de ce que fait déjà le marché tunisien. Elle tranche les décisions D17 (modules) et D19 (2e thème).

## 1. Qui sont-ils

| Prospect | Ce qu'on sait | Ce que fait déjà le marché |
|---|---|---|
| **Représentant DeWalt, avec un magasin** | DeWalt est distribué en Tunisie par Africa Electrique (AFEL), avec des revendeurs régionaux à Tunis, Ariana, Ben Arous, Bizerte, Nabeul, dans le Sahel, à Sfax et à Gabès-Djerba ([AFEL](https://afel.tn/revendeurs-dewalt/)) | Beaucoup de sites vendent du DeWalt en ligne : [Arkan](https://arkan.tn/dewalt), [Technoquip](https://www.technoquip-tn.com/categorie-produit/equipement-industriel/electroprtatif-tunisie/dewalt-electroportatifs-tunisie/), [Dari Shop](https://dari-shop.tn/manufacturer/dewalt.html), [Mano](https://mano.tn/brand/2382-dewalt), [TechnoTools](https://technotools.tn/marque/dewalt/). Leur argument : « authentique, garantie constructeur » |
| **Une quincaillerie** | Commerce physique, clientèle de particuliers et de professionnels | [EGM](https://egm.tn/produits/quincaillerie) : plus de 10 000 références et retrait en magasin. [SITEQ](https://siteq.com.tn/) : gros et détail, livraison en 24-48 h. [Espace 2F](https://espace2f.com/) : livraison offerte dès 500 DT dans le Grand Tunis. [Bricola](https://bricola.tn/16-quincaillerie-tunisie) : paiement à la livraison |

**Conclusion.** Un site e-commerce ne suffit pas à les distinguer : leurs concurrents en ont déjà. Ce qui les distingue, c'est ce qu'ils ont et que les autres n'ont pas :
- pour le représentant DeWalt, **l'officiel**, c'est-à-dire l'authenticité, la garantie et le service après-vente ;
- pour la quincaillerie, **le magasin de quartier** : retrait sur place, conseil, prix pro pour les artisans.

Le produit doit mettre ça en avant.

## 2. Ce dont ils ont besoin

### 2.1 Communs aux deux (outillage et quincaillerie)

| Besoin | Pourquoi | Ce que ça veut dire dans SkanEcom |
|---|---|---|
| **Recherche par référence** (DCD796, DCF887, code article) | Les professionnels cherchent un modèle précis | Recherche sur le SKU et le modèle, tolérante aux fautes (`pg_trgm`) |
| **Grand catalogue** | De centaines de références (DeWalt) à des milliers (quincaillerie) | Filtres, tri et pagination en base (`02-infrastructure.md`, §3) |
| **Fiches techniques filtrables** | Puissance (W), tension (V), batterie (Ah), couple (Nm), vitesse (tr/min), diamètre, poids | Attributs définis par catégorie, affichés en tableau et filtrables |
| **Import Excel régulier** | Le catalogue et le stock vivent dans leur logiciel de caisse ou dans Excel | Import par lots avec rapport d'erreurs ; mise à jour des prix et du stock par le même fichier |
| **Retrait en magasin** | Les deux ont un magasin ; c'est un avantage sur les sites 100 % en ligne | Mode de livraison « retrait » : gratuit, avec adresse, horaires et délai de préparation |
| **Frais selon le poids ou livraison offerte dès un seuil** | Compresseurs, scies, sacs : lourds ; la concurrence offre la livraison dès 500 DT | Frais par zone et par tranche de poids (le poids par variante existe déjà dans Maymar), seuil de gratuité en réglage |
| **Prix barrés et promotions** | Normal dans ce commerce (kits offerts, promotions DeWalt), contrairement à la charte Maymar | **Réglage par boutique** « afficher les prix barrés » : la colonne `prix_barre_millimes` existe déjà, Maymar la garde masquée |
| **Conseil par WhatsApp** | L'achat d'outillage se décide souvent après une question | Bouton « Demander conseil » sur la fiche, avec le produit déjà mentionné dans le message |
| **Photos manquantes** | La quincaillerie n'a pas de photo pour la plupart de ses articles | État « photo à venir » et images de rayon (déjà dans Maymar) |

### 2.2 Propres au représentant DeWalt

| Besoin | Ce que ça veut dire |
|---|---|
| **Machine seule ou en kit** (batteries, chargeur, coffret) | Une option de variante « version », que le modèle de variantes gère déjà |
| **Plateforme de batterie** (18V XR, 54V FlexVolt) | Attribut filtrable : l'acheteur qui a déjà des batteries cherche des machines compatibles |
| **Revendeur officiel, garantie** | Sections du thème : bandeau « revendeur officiel », garantie constructeur, service après-vente. C'est du contenu, pas du code |
| **Demande de service après-vente** | Formulaire (produit, numéro de série, problème, photo) qui arrive au backoffice. Simple à faire, fort pour la confiance |
| **Charte DeWalt** | Le thème accepte ses couleurs par jetons. Logo et photos officielles selon les règles de son accord de distribution : c'est à lui de le vérifier |

### 2.3 Propres à la quincaillerie

| Besoin | Ce que ça veut dire |
|---|---|
| **Conditionnement** (à l'unité, par boîte de 100, au mètre) | Une option de variante « conditionnement » avec son prix, et une quantité minimale par variante |
| **Rayons profonds** (Plomberie, puis Raccords, puis Laiton) | Catégories à trois niveaux (`parent_id` existe déjà) |
| **Clients professionnels** (plombiers, électriciens) | Comptes pro validés par le commerçant, prix pro par variante |
| **Listes de chantier** | Demande de devis : le panier devient une demande, le commerçant répond avec un prix, la demande devient une commande |

## 3. Décisions (tranchées par délégation de Skander, 29/09)

**D17 : modules de la v1**

| Module | Pour | Priorité | Étape |
|---|---|---|---|
| Grand catalogue : filtres, pagination et recherche en base, recherche par référence | Les deux | **M** | 3 |
| Attributs techniques par catégorie, filtrables | Les deux | **M** | 3 |
| Import Excel (création et mise à jour des prix et du stock) | Les deux | **M** | 1 (console) |
| Retrait en magasin | Les deux | **M** | 3 |
| Frais par poids, seuil de gratuité | Les deux | **M** | 3 |
| Prix barrés en réglage | DeWalt | **M** | 3 |
| Bouton « Demander conseil » par WhatsApp | Les deux | **M** | 2 |
| Sections « revendeur officiel, garantie, SAV » | DeWalt | **M** (contenu) | 3 |
| Demande de service après-vente | DeWalt | **S** | 3 |
| Conditionnement et quantité minimale | Quincaillerie | **S** | 4 |
| Comptes et prix professionnels | Quincaillerie (et DeWalt) | **S** | 4 |
| Demande de devis | Quincaillerie | **C** | 4 |
| Stock par magasin, crédit client, synchronisation avec leur logiciel de caisse | — | Plus tard | — |

**D19 : 2e thème « catalogue technique ».** Oui, dès le représentant DeWalt. Il comprend :
- une grille dense avec la référence visible ;
- des filtres par attribut sur le côté ;
- une fiche technique en tableau ;
- des badges (plateforme de batterie, kit ou machine seule) ;
- une recherche mise en avant.

Le même thème, avec d'autres jetons, sert la quincaillerie.

## 4. Ordre de passage

1. **Maymar** (étape 2) : prouve le socle, le thème n°1 et la mise en place.
2. **Représentant DeWalt** (étape 3) : catalogue de taille moyenne et technique ; il introduit le thème n°2, les attributs, la recherche par référence, le retrait en magasin et les prix barrés.
3. **Quincaillerie** (étape 4) : très grand catalogue, conditionnement, comptes pro, devis.

Chaque client apporte des modules qui deviennent **des réglages disponibles pour tous**. C'est la règle du PRD (§4.3).
