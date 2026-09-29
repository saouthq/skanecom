# SkanEcom — PRD v0.2 : la boutique en ligne clé en main, en marque blanche

> Statut : **brouillon v0.2, à valider par Skander**. Rédigé le 29/09/2026.
> Remplace la v0 du 28/09 (plateforme « type Shopify » en autonomie), archivée dans [`annexes/prd-v0-plateforme-autonomie.md`](annexes/prd-v0-plateforme-autonomie.md).
> Modules des clients 2 et 3 tranchés par l'étude du 29/09 : [`05-etude-outillage-quincaillerie.md`](05-etude-outillage-quincaillerie.md).
> Documents liés :
> - [`02-infrastructure.md`](02-infrastructure.md) : l'infrastructure ;
> - [`03-reprise-maymar.md`](03-reprise-maymar.md) : ce qu'on reprend de Maymar ;
> - [`04-risques-et-decisions.md`](04-risques-et-decisions.md) : décisions et risques.

---

## 1. En une phrase

**SkanEcom est une boutique en ligne clé en main pour les entreprises tunisiennes.** Un seul produit, installé et maintenu par nous. Chaque client l'habille à sa marque par des réglages : logo, couleurs, polices, sections, modules. La boutique est belle comme une grande marque, pensée pour le paiement à la livraison, et elle reste ouverte même quand nos serveurs tombent.

---

## 2. Pourquoi ce recentrage (29/09/2026)

La v0 visait une plateforme où des milliers de commerçants s'inscrivent seuls, comme Shopify. Le cadrage a montré que la plus grosse partie de l'effort ne venait pas du site e-commerce, mais de tout ce qu'exige le self-service à grande échelle :
- l'inscription libre et le paiement automatique des abonnements ;
- la vérification des commerçants et la lutte contre les boutiques frauduleuses ;
- le support de centaines de petits vendeurs ;
- une infrastructure pour 10 000 boutiques ;
- une guerre des prix contre des offres gratuites (Converty, e-Tijara).

**Décision de Skander, le 29/09 : on vend le même produit, mis en place par nous, à 10 à 50 entreprises établies.** C'est aussi ce que recommandait l'étude de marché du 28/09 : viser les entreprises qui paient déjà une agence, avec une installation assistée, sans se battre sur le prix.

**Rien n'est perdu.**
- Le moteur (catalogue, commandes COD, stock, réglages, thèmes) reste le même.
- Le choix d'hébergement (Cloudflare + Supabase) reste le même.
- Si la demande est là plus tard, ouvrir l'inscription libre reviendra à ajouter une couche sur la même base.

---

## 3. Pour qui

**Cible : des entreprises établies qui veulent vendre en ligne sans monter un projet technique.** Importateurs et distributeurs, enseignes avec magasin, marques.

| Premier cercle (29/09) | Profil | Ce que ça implique pour le produit |
|---|---|---|
| **Maymar** (client n°1) | Importateur, bagagerie, catalogue de dizaines à centaines de produits | Déjà modélisé : variantes, COD, refus |
| **Distributeur DeWalt** (à confirmer) | Outillage de marque, catalogue technique, clients professionnels | Grand catalogue, fiches techniques, prix pro, devis, respect des règles d'usage de la marque DeWalt (logo, photos) prévues par l'accord de distribution |
| **Une quincaillerie** | Commerce physique, milliers de petites références, clientèle pro et particulière | Très grand catalogue, import Excel, retrait en magasin, prix pro |

Qui met en place : **Skander et son père.** La mise en place doit donc être **rapide, répétable et faisable sans développeur**, depuis une console.

---

## 4. L'offre

### 4.1 Ce que le client achète

| Élément | Contenu | Fourchette (prix de lancement fixés en D5, `04-risques-et-decisions.md`) |
|---|---|---|
| **Mise en place**, une fois | Réglage de la marque (logo, couleurs, polices, sections), import du catalogue, branchement du domaine, du paiement Konnect et du livreur, commande test, formation de l'équipe | 1 500 à 4 000 TND selon la taille du catalogue |
| **Abonnement mensuel** | Hébergement, maintenance, mises à jour, sauvegardes, sécurité, support, boutique qui reste ouverte en cas de panne | 150 à 500 TND par mois |
| **Options** | Photos produit, import de gros catalogues, modules supplémentaires (prix pro, devis, retrait en magasin), formation complémentaire | Au devis |

Repère : une agence WooCommerce ou PrestaShop facture 1 500 à 5 000 TND le site, plus 30 à 200 TND par mois d'hébergement, et la maintenance reste à la charge du client (étude de marché du 28/09).

### 4.2 Pourquoi un client nous choisit plutôt qu'une agence

| Agence (WooCommerce, PrestaShop) | SkanEcom |
|---|---|
| Un site livré puis figé | **Un produit qui s'améliore tous les mois**, pour tous les clients |
| Mises à jour, extensions, piratages à la charge du client | **Tout est maintenu par nous** |
| COD géré « à la main » | **Cycle COD complet** : confirmation par appel ou WhatsApp, refus tracés, retour en stock, livreurs branchés |
| Le site tombe avec l'hébergeur | **La boutique reste ouverte** (prouvé par le prototype du 28/09) |
| Design variable | **Qualité de marque par défaut** (charte Maymar) |

Face à Converty ou Shopify, on ne vend pas un outil à configurer soi-même : **on livre une boutique prête**, à la marque du client, et on la fait vivre.

### 4.3 Une discipline non négociable : pas de copie par client

- **Un seul code et une seule base pour tous les clients.** Chaque client est une boutique, qui diffère des autres par ses réglages et son thème.
- **Une demande spécifique devient un réglage disponible pour tous**, ou elle se facture au prix du développement. On ne fait jamais de copie du code pour un client, et jamais de code « juste pour lui ».
- C'est ce qui sépare un produit d'une agence. Avec 20 copies, on maintient 20 sites. Avec un produit, on en maintient un.

---

## 5. Principes produit

1. **« Quand t'as un doute, fais les deux et mets-le en réglage. »** La marque, les modules et les options de chaque client sont des réglages.
2. **COD d'abord.** Le paiement en ligne (Konnect) est une option qui s'efface d'elle-même si le prestataire de paiement est en panne.
3. **Mobile d'abord, backoffice compris.**
4. **Beau par défaut.** Les thèmes empêchent les choix qui enlaidissent.
5. **Français et arabe, avec un vrai RTL.**
6. **Les données du client lui appartiennent** : export complet à tout moment.
7. **La boutique reste ouverte** quand la base ou notre code tombent.

---

## 6. Périmètre de la v1 (pour Maymar et les 2 prochains clients)

Priorités : **M** = indispensable · **S** = souhaité · **C** = si le temps le permet. Les modules des clients 2 et 3 sont tranchés par l’étude `05-etude-outillage-quincaillerie.md`.

### 6.1 Console SkanEcom (pour Skander et son père)

| # | Fonction | Priorité |
|---|---|---|
| C1 | Créer une boutique ; lui attribuer son domaine | M |
| C2 | Réglages de marque : logo, couleurs, polices, sections d'accueil, avec aperçu | M |
| C3 | Activer ou désactiver les modules (paiement en ligne, livreurs, prix pro, retrait en magasin…) | M |
| C4 | Créer les comptes de l'équipe du client | M |
| C5 | Importer un catalogue depuis Excel/CSV (produits, variantes, prix, stock, photos) | M |
| C6 | Liste de contrôle de mise en place, avec l'état d'avancement de chaque client | S |
| C7 | Accès au backoffice d'un client pour le support, tracé dans le journal | S |

### 6.2 Backoffice du client

| # | Fonction | Priorité |
|---|---|---|
| B1 | Catalogue à variantes, prix et stock par variante, catégories, photos | M (repris de Maymar) |
| B2 | Stock : journal, réservation à la commande, retour au refus | M (repris de Maymar) |
| B3 | Cycle de commande COD complet, refus tracé (client, livreur, injoignable) | M (repris de Maymar) |
| B4 | Confirmation : appel en un clic, message WhatsApp | M |
| B5 | Livreurs : ceux des premiers clients (1 ou 2 au départ), bordereau PDF en repli | M |
| B6 | Clients, adresses, historique | M |
| B7 | Équipe et rôles, double authentification pour les administrateurs | M |
| B8 | Export complet des données | M |
| B9 | Fiches techniques : attributs par catégorie (puissance, tension, dimensions…) | M (décidé, étude 05) |
| B10 | Prix professionnels et comptes pro | S (étape 4, étude 05) |
| B11 | Demande de devis pour les grosses commandes | C (étape 4, étude 05) |
| B12 | Tableau de bord des refus, rapprochement du cash COD | C |

### 6.3 Vitrine

| # | Fonction | Priorité |
|---|---|---|
| V1 | Thème n°1 tiré de la charte Maymar, personnalisé par jetons (couleurs, polices, logo) et sections | M |
| V2 | Thème n°2 « catalogue technique », pour l'outillage et la quincaillerie : filtres par attribut, recherche rapide, fiche technique | M (décidé, étude 05) |
| V3 | Accueil, rayons, fiche produit, recherche, panier, commande COD | M (repris de Maymar) |
| V4 | **Grands catalogues** : filtres et pagination en base, recherche rapide sur des milliers de références | M dès la quincaillerie (voir `03-reprise-maymar.md`) |
| V5 | FR/AR avec RTL, TND, SEO, performance mobile | M |
| V6 | Paiement en ligne Konnect sur le compte du client (désactivé par défaut) | S |
| V7 | Retrait en magasin | M (décidé, étude 05) |
| V8 | CGV, mentions légales et rétractation générées par boutique ; consentement des acheteurs | M |

### 6.4 Hors v1

| Pas en v1 | Pourquoi |
|---|---|
| Inscription libre des commerçants, abonnement payé en ligne | Plus le modèle (voir §2) |
| Sous-domaines gratuits, vérification des commerçants, anti-fraude plateforme | Idem : nos clients, on les connaît |
| Place de marché, applications tierces, applications mobiles | Hors sujet pour 10 à 50 clients |
| Code ou thème développé pour un seul client | Contraire à la discipline du §4.3 |

---

## 7. La mise en place d'un client

La liste suivie par Skander et son père, et suivie dans la console (C6) :

1. **Recueil** : logo, couleurs, polices si la marque en a, photos, fichier catalogue, conditions de livraison, compte Konnect du client (s'il veut le paiement en ligne), transporteur habituel.
2. **Création** de la boutique dans la console ; réglages de marque ; choix du thème.
3. **Import** du catalogue ; contrôle des prix et du stock.
4. **Domaine** : le client nous confie la gestion DNS de son domaine (recommandé), ou il ajoute un enregistrement que nous lui donnons.
5. **Branchements** : livreur, Konnect, WhatsApp de confirmation.
6. **Commande test** de bout en bout : commande, confirmation, bordereau, livraison simulée, refus simulé.
7. **Formation** de l'équipe du client (1 à 2 heures).
8. **Mise en ligne** et suivi rapproché le premier mois.

**Objectif :** mesurer la durée de chaque étape sur Maymar, puis la réduire à chaque nouveau client.

---

## 8. Indicateurs

| Indicateur | Pourquoi |
|---|---|
| Durée de mise en place d'un client | C'est notre capacité : Skander et son père sont deux |
| Commandes par mois et par client | Valeur livrée au client |
| Taux de confirmation et de refus COD | Argent gagné ou perdu par le client |
| Disponibilité des boutiques | Notre promesse |
| Demandes de support par client et par mois | Charge réelle |
| Clients qui renouvellent leur abonnement | Viabilité |

---

## 9. Légal et administratif

| Sujet | Obligation | Quand |
|---|---|---|
| **Données personnelles** (loi 2004-63) | Déclaration à l'INPDP + autorisation de transfert vers l'UE (base à Paris) | Obligatoire dès Maymar (ses acheteurs sont aussi concernés). À déposer au plus tard avant la mise en ligne du 2e client ; à valider avec un avocat |
| **Contrat de service** avec chaque client | Engagements (disponibilité, support, sauvegardes), propriété des données, accord de sous-traitance (le client est responsable de traitement, SkanEcom sous-traitant) | Avant le 2e client |
| **Facture électronique** (TEIF, El Fatoora de TTN) | Nos factures de mise en place et d'abonnement sont des services, donc concernées | Avant la 1re facture |
| Commerce électronique (loi 2000-83) | Rétractation, récapitulatif de commande | Dans les CGV générées (V8) |
| Marque et domaines | SkanEcom à l'INNORPI ; `skanecom.tn` et `skanecom.com` (libre au 28/09) pour notre site et le backoffice | Maintenant |
| Change | À 10-50 clients, l'infrastructure reste sous le plafond de la carte technologique (voir `02-infrastructure.md`, §6). Le label Startup Act devient utile, mais plus urgent | Plus tard |

---

## 10. Feuille de route

Pas de dates avant d'avoir mesuré la première mise en place. On ne passe à une étape qu'une fois la précédente finie.

| Étape | Contenu | Fini quand |
|---|---|---|
| **0. Cadrage** | Ce document, l'infrastructure, le prototype | Validé par Skander |
| **1. Socle** | Multi-boutique (une base, `boutique_id`), thème par réglages, console de mise en place, import Excel | Deux boutiques de test isolées, habillées différemment par la console seule |
| **2. Maymar** | Maymar en ligne sur SkanEcom (`maymar.tn`) | De vraies commandes livrées ; durée de mise en place mesurée |
| **3. Représentant DeWalt** | Thème n°2 « catalogue technique », attributs filtrables, recherche par référence, retrait en magasin, frais au poids, prix barrés en réglage, sections revendeur officiel et SAV (`05-etude-outillage-quincaillerie.md`) | Client payant en ligne |
| **4. Quincaillerie, puis industrialiser** | Très grand catalogue, conditionnement, comptes et prix pro, devis ; réduire la durée de mise en place, 10 à 20 clients | Client payant en ligne ; une mise en place en quelques jours |
| **Plus tard** | Ouverture en autonomie, si la demande le justifie (voir l'annexe) | — |

---

## 11. Questions ouvertes (pour Skander)

1. **Prix** : les fourchettes du §4.1 tiennent-elles face aux trois prospects ?
2. **DeWalt** : de quelle entité s'agit-il exactement (distributeur officiel, revendeur) ? Que permet son accord de distribution pour l'usage de la marque et des photos ?
3. **Taille des catalogues** du distributeur DeWalt et de la quincaillerie : combien de références ?
4. **Besoins pro** (prix pro, devis, retrait en magasin) : lesquels sont indispensables pour signer ?
5. **Photos** : qui les fournit ou les produit ? Pour Maymar, les photos reçues ne sont pas montrables.
6. **Durée d'engagement** du contrat : mensuel ou annuel ?
