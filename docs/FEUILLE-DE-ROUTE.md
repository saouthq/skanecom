# Feuille de route — de la plateforme à l'agence e-commerce

> Écrite le 30/09/2026, tenue à jour à chaque livraison. Skander a confié la direction du projet à Claude le 30/09 (« c'est toi le chef de projet… il faut que tout soit premium et moderne ») ; ce document dit ce qui vient, dans quel ordre, et pourquoi. Le PRD ([`cadrage/01-prd.md`](cadrage/01-prd.md)) reste la référence du périmètre v1 ; ceci en est la suite.

## Le cap

**La meilleure agence de boutiques en ligne pour la Tunisie, qui s'adapte à tous les métiers** : un commerçant — mode, beauté, high-tech, maison, alimentation, outillage — a en quelques jours une boutique premium à son nom, qu'il gère depuis son téléphone, et qui vend vraiment (paiement à la livraison, confirmation, livraison, refus maîtrisés).

## Les règles de la maison (en plus du PRD §5)

1. **Premium par défaut.** Aucune page, aucun e-mail, aucun état vide ne montre le réglage par défaut d'un outil (une page 404 anglaise, un e-mail de Supabase). Un défaut de finition est un défaut.
2. **Le téléphone d'abord**, pour l'acheteur comme pour l'équipe.
3. **Ce qui peut se régler se règle** (« fais les deux et mets-le en réglage »), boutique par boutique, jamais par du code propre à un client.
4. **Tout se vérifie en ligne** : après chaque déploiement, un navigateur ouvre les pages clés de l'aperçu et note polices, images et erreurs (workflow « Aperçu en ligne », étape « Contrôle visuel »).
5. **Tout se mesure** : ce qu'on ne voit pas dans la console n'est pas sous contrôle.

## Où on en est (30/09)

Le périmètre v1 du PRD est construit : console C1 à C7, backoffice B1 à B12, vitrine V1 à V4, V7 et V8, deux gabarits (éditorial, technique), l'aperçu en ligne sur Supabase et Cloudflare. Il manque de la v1 : l'interface en arabe (V5) et Konnect (V6, derrière son module).

## Les étapes, dans l'ordre

### A. Fiabilité et finition — en cours

- [x] Vérification par e-mail en plus du SMS (réglage de la boutique).
- [x] **E-mails aux couleurs de la boutique** : Supabase ne rédige plus rien ; le crochet « Send Email » confie l'événement à l'application, qui écrit au nom de la boutique (logo, couleurs, gabarit) ; galerie dans la console.
- [x] **Contrôle visuel de l'aperçu en ligne** après chaque déploiement (captures en artefact).
- [x] Audit de toutes les pages des trois vitrines, sur ordinateur et téléphone : page introuvable du framework sur une adresse inconnue, pastille du panier invisible (gabarit éditorial), sections d'accueil incomplètes, photos qui se peignent sur l'aplat — corrigés le 30/09.
- [x] La galerie des e-mails de la console ne se chargeait jamais entière en CI (cadres en chargement différé hors de l'écran) : chargée d'emblée.
- [x] **Cartes du gabarit technique alignées d'une carte à l'autre** (01/10) : chaque carte occupe quatre rangées de la grille (la fiche, le stock, le prix, le bouton) que la sous-grille CSS partage ; un prix barré ou un stock sur deux lignes ne décale plus ses voisines (19 à 20 px avant, 0 après ; vérifié par le parcours).
- [ ] Déploiement en deux temps avec cache prérempli, nettoyage des anciennes versions du cache.

### B. Une vitrine complète : contenus et confiance — en cours

- [x] **Les pages de la boutique**, écrites au backoffice (écran « Pages ») : un texte ou des questions-réponses (un accordéon dans la vitrine), servies à leur adresse (`/a-propos`), un lien au pied de page, dans l'ordre choisi. L'éditeur montre la page à mesure qu'on l'écrit ; la mise en forme tient en quelques signes (intertitres, gras, listes, liens), posée par une barre d'outils ou au clavier ; un refus s'affiche sous le champ, le texte ne se perd jamais (brouillon gardé sur l'appareil, version relue à l'enregistrement : un collègue n'est jamais écrasé). Trois modèles composés des réglages de la boutique (questions fréquentes, livraison et retours, à propos), et la liste des pages qu'elle a d'office (conditions de vente, contact…) avec les réglages qui les nourrissent.
- [x] **Contact** (téléphone, WhatsApp, e-mail, magasin et son itinéraire, horaires, réseaux) — la page n'existe que si la boutique a un moyen d'être jointe.
- [x] **Réseaux sociaux** (Instagram, Facebook, TikTok) au pied de page, **bouton WhatsApp flottant** (réglage ; jamais pendant la commande), **bandeau d'annonce** réglable.
- [x] **« Suivre ma commande » sans compte** : le numéro et le téléphone qui l'a passée ; une réponse qui ne dit pas lequel des deux est faux ; cinq essais manqués par numéro et par heure.
- [x] **Partager une fiche** (01/10, réglage) : au téléphone, la feuille de partage du système (WhatsApp, Messenger…) ; sur ordinateur, WhatsApp, Facebook ou le lien copié ; le lien de la fiche sans paramètre, son aperçu tiré des balises de la page.
- [ ] Pied de page enrichi (moyens de paiement, transporteurs, lettre d'information avec consentement).

### C. Vendre plus

- [x] **Codes promo** (30/09, module, coupé chez Maymar dont la charte refuse la promotion) : pourcentage, montant, livraison offerte, minimum d'achat, dates, nombre d'utilisations, une fois par client ; ce que chaque code rapporte ; partage sur WhatsApp.
- [x] **Prix barrés d'un rayon** (30/09, le même module) : une remise sur un rayon ou tout le catalogue, l'aperçu avant de lancer, l'ancien prix barré ; terminer rend les prix d'avant (sauf ceux changés à la main). Reste : une fin programmée (à une date).
- [x] **« Prévenez-moi de son retour »** (30/09, réglage) sur une déclinaison épuisée : le téléphone ou l'e-mail laissé sur la fiche ; au réassort, l'équipe voit qui prévenir, message WhatsApp prêt, et le contact s'efface. Reste : l'envoi automatique par SMS ou e-mail, quand les fournisseurs seront branchés.
- [x] **Favoris** (30/09, réglage) : un cœur sur les cartes et la fiche, « Mes favoris » relus en base ; gardés dans le navigateur et, pour un client connecté, dans son compte (d'un appareil à l'autre) ; l'équipe voit combien aiment chaque pièce, jamais qui. Reste : prévenir d'une baisse de prix ou d'un retour en stock d'une pièce aimée.
- [x] **Paniers abandonnés** (30/09, réglage, avec le compte obligatoire) : le panier d'un client connecté, au backoffice une heure plus tard, message WhatsApp prêt avec le lien qui remet le panier dans le navigateur, une relance ; la commande qui a suivi. Reste : la relance automatique (SMS, e-mail), quand les fournisseurs seront branchés.
- [x] **Souvent achetés ensemble** (30/09, réglage) : sous la fiche et dans le tiroir du panier, les pièces que les commandes de la boutique réunissent avec celle-ci (180 jours, ni annulées ni refusées), en vente et en stock ; « Vous aimerez aussi » ne les répète pas. Reste : les lots (un prix pour l'ensemble), l'ajout en un geste depuis le tiroir.
- [x] **Avis avec photos** (30/09, réglage du module avis) : avec son avis, le client livré joint jusqu'à trois photos de l'article reçu, réduites dans son navigateur ; elles suivent l'avis (relues avec lui, publiées avec lui), s'ouvrent en grand sur la fiche ; l'équipe en retire une sans écarter l'avis. Reste : « Les photos des clients » en tête de la fiche quand il y en a beaucoup (déjà dans la base : le rang, dès deux avis illustrés), un filtre « avec photos ».

### D. Tous les métiers

- **Troisième gabarit « commerce »** (high-tech, électroménager, téléphonie, grande distribution) : grand menu des rayons, bannières, comparaison, prix mis en avant, fiches techniques.
- **Bibliothèque de sections d'accueil**, communes aux gabarits : bannières défilantes, marques, témoignages, questions fréquentes, vidéo, Instagram, « acheter la silhouette ».
- **Préréglages par métier** dans la console (mode, beauté, bijoux, high-tech, maison, alimentation, outillage) : gabarit, polices, couleurs, sections, caractéristiques et réglages de livraison posés d'un geste — une boutique prête à habiller en dix minutes.
- **Boutiques de démonstration par métier** (beauté, high-tech, maison), pour la prospection.

### E. Arabe et paiement en ligne

- L'interface entière en arabe (de droite à gauche), la bascule FR/AR par boutique, les contenus bilingues saisis au backoffice.
- Konnect (V6), derrière son module, qui s'efface si le prestataire tombe.

### F. Console et backoffice : le mouvement

- Une couche de mouvement avec **Motion** (ex-Framer Motion), chargée à la demande (`LazyMotion`) : onglets, listes qui se réordonnent, tiroirs, notifications, compteurs du tableau de bord, gestes au doigt (glisser pour confirmer une commande) ; « réduire les animations » respecté partout.
- Graphiques du tableau de bord, objectifs du mois.

### G. Tout contrôler

- Surveillance automatique, chaque heure, des boutiques en ligne (pages clés, temps de réponse, polices, images) ; alerte à Skander au premier défaut.
- Les erreurs de l'application, boutique par boutique, lisibles dans la console.
- [x] **Les visites de chaque vitrine** (01/10, réglage « Mesure d'audience ») : visiteurs, pages vues, commandes et conversion sur 7, 30 ou 90 jours comparés à la période d'avant, le jour par jour, d'où l'on vient (Instagram, Google, Facebook, direct…), sur quel appareil, les fiches et les pages les plus vues — sans cookie ni donnée personnelle (une empreinte salée du jour, illisible le surlendemain ; l'adresse IP jamais gardée ; robots et « ne pas me suivre » écartés). Reste : les paniers commencés (entonnoir fiche → panier → commande), les campagnes (paramètres utm).
- [x] **Le poste de pilotage de la console** (30/09) : chaque boutique en tuile à sa marque — sa semaine jour par jour, l'encaissé, ce qui attend et depuis quand, la mise en place et la prochaine étape, un accès support ouvert —, la synthèse de la plateforme et « À surveiller » (le plus pressant d'abord). Reste la santé de chaque vitrine (temps de réponse, erreurs), avec la surveillance ci-dessus.

### H. La mise en production (avec Skander)

Ce qui ne se décide pas sans lui, rappelé à chaque point d'étape :

| Sujet | Ce qu'il faut |
|---|---|
| SMS | Le fournisseur (prix par SMS, envoi vers les numéros tunisiens) |
| E-mails | Resend ou Brevo, et un domaine d'envoi vérifié (`COURRIELS_ENVOI`) |
| Transporteurs | Lesquels brancher en premier (API) |
| Konnect | Le compte marchand de chaque client qui le veut |
| Anti-robots | Les clés Turnstile |
| Maymar | Le domaine `maymar.tn`, les photos selon le protocole (celles reçues ne sont pas montrables), les informations légales |
| Production | Le projet Supabase `skanecom-prod` |
