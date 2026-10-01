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

### B. Une vitrine complète : contenus et confiance — faite (01/10)

- [x] **Les pages de la boutique**, écrites au backoffice (écran « Pages ») : un texte ou des questions-réponses (un accordéon dans la vitrine), servies à leur adresse (`/a-propos`), un lien au pied de page, dans l'ordre choisi. L'éditeur montre la page à mesure qu'on l'écrit ; la mise en forme tient en quelques signes (intertitres, gras, listes, liens), posée par une barre d'outils ou au clavier ; un refus s'affiche sous le champ, le texte ne se perd jamais (brouillon gardé sur l'appareil, version relue à l'enregistrement : un collègue n'est jamais écrasé). Trois modèles composés des réglages de la boutique (questions fréquentes, livraison et retours, à propos), et la liste des pages qu'elle a d'office (conditions de vente, contact…) avec les réglages qui les nourrissent.
- [x] **Contact** (téléphone, WhatsApp, e-mail, magasin et son itinéraire, horaires, réseaux) — la page n'existe que si la boutique a un moyen d'être jointe.
- [x] **Réseaux sociaux** (Instagram, Facebook, TikTok) au pied de page, **bouton WhatsApp flottant** (réglage ; jamais pendant la commande), **bandeau d'annonce** réglable.
- [x] **« Suivre ma commande » sans compte** : le numéro et le téléphone qui l'a passée ; une réponse qui ne dit pas lequel des deux est faux ; cinq essais manqués par numéro et par heure.
- [x] **Partager une fiche** (01/10, réglage) : au téléphone, la feuille de partage du système (WhatsApp, Messenger…) ; sur ordinateur, WhatsApp, Facebook ou le lien copié ; le lien de la fiche sans paramètre, son aperçu tiré des balises de la page.
- [x] **Pied de page enrichi** (01/10) : comment on paie et qui livre, en pastilles tirées des réglages ; **la lettre d'information** (réglage) — une case d'accord jamais cochée d'avance, gardée telle qu'écrite, puis la confirmation par le lien reçu (double opt-in) ; le même lien désinscrit, et l'adresse est effacée ; l'écran Lettre du backoffice (inscrits, semaines, recherche, retirer, export). Reste : écrire et envoyer la lettre, quand un expéditeur sera branché.

### C. Vendre plus

- [x] **Codes promo** (30/09, module, coupé chez Maymar dont la charte refuse la promotion) : pourcentage, montant, livraison offerte, minimum d'achat, dates, nombre d'utilisations, une fois par client ; ce que chaque code rapporte ; partage sur WhatsApp.
- [x] **Prix barrés d'un rayon** (30/09, le même module) : une remise sur un rayon ou tout le catalogue, l'aperçu avant de lancer, l'ancien prix barré ; terminer rend les prix d'avant (sauf ceux changés à la main). Reste : une fin programmée (à une date).
- [x] **« Prévenez-moi de son retour »** (30/09, réglage) sur une déclinaison épuisée : le téléphone ou l'e-mail laissé sur la fiche ; au réassort, l'équipe voit qui prévenir, message WhatsApp prêt, et le contact s'efface. Reste : l'envoi automatique par SMS ou e-mail, quand les fournisseurs seront branchés.
- [x] **Favoris** (30/09, réglage) : un cœur sur les cartes et la fiche, « Mes favoris » relus en base ; gardés dans le navigateur et, pour un client connecté, dans son compte (d'un appareil à l'autre) ; l'équipe voit combien aiment chaque pièce, jamais qui. Reste : prévenir d'une baisse de prix ou d'un retour en stock d'une pièce aimée.
- [x] **Paniers abandonnés** (30/09, réglage, avec le compte obligatoire) : le panier d'un client connecté, au backoffice une heure plus tard, message WhatsApp prêt avec le lien qui remet le panier dans le navigateur, une relance ; la commande qui a suivi. Reste : la relance automatique (SMS, e-mail), quand les fournisseurs seront branchés.
- [x] **Souvent achetés ensemble** (30/09, réglage) : sous la fiche et dans le tiroir du panier, les pièces que les commandes de la boutique réunissent avec celle-ci (180 jours, ni annulées ni refusées), en vente et en stock ; « Vous aimerez aussi » ne les répète pas. **L'ajout en un geste depuis le tiroir** (01/10) : une suggestion qui n'a qu'une déclinaison en stock s'ajoute sans ouvrir sa fiche (son minimum, son prix pro), les autres mènent à leur fiche ; la liste ne bouge pas sous le doigt tant que le tiroir est ouvert. Reste : les lots (un prix pour l'ensemble).
- [x] **Avis avec photos** (30/09, réglage du module avis) : avec son avis, le client livré joint jusqu'à trois photos de l'article reçu, réduites dans son navigateur ; elles suivent l'avis (relues avec lui, publiées avec lui), s'ouvrent en grand sur la fiche ; l'équipe en retire une sans écarter l'avis. **Les avis se filtrent et se parcourent** (01/10) : dix d'abord, « Voir plus » pour la suite ; dès quatre avis, « Avec photos » ou une note, par les pastilles ou la répartition ; sous le titre, les vignettes et « 6 photos de clients » mènent au rang des photos.

- [x] **Pixels Meta et TikTok** (01/10, réglages, vides par défaut) : l'identifiant de chaque pixel saisi au backoffice (écran Réglages → Publicité, vérifié par la base) ; la vitrine demande l'accord du visiteur — « Refuser » aussi visible qu'« Accepter », premier au clavier, jamais pendant la commande, révocable au pied de page — et rien n'est chargé sans lui ; avec lui, les pages vues, les fiches regardées, les ajouts au panier, la commande ouverte et la commande passée (le numéro pour identifiant, jamais le nom, le téléphone ni l'adresse). La politique de confidentialité le dit. Reste : l'API Conversions (côté serveur), quand un jeton d'accès sera confié par la boutique.

### D. Tous les métiers

- **Troisième gabarit « commerce »** (high-tech, électroménager, téléphonie, grande distribution) : grand menu des rayons, bannières, comparaison, prix mis en avant, fiches techniques — c'est la structure « Commerce » de l'étape E.
- [x] **Composer l'accueil et sa bibliothèque de sections** (01/10) : l'écran « Page d'accueil » du backoffice — les sections de haut en bas, chacune avec sa miniature, ce qu'elle dit et si la vitrine la montrera (ou pourquoi pas encore) ; monter, descendre, régler, retirer (et rétablir), au clavier comme à la souris ; ajouter depuis la bibliothèque ; enregistrer en arrière-plan (⌘S), la version protège un collègue ; revenir à l'accueil du gabarit. Trois sections de plus, communes aux gabarits et tirées de ce que la boutique a déjà : **les avis** (citations de 4 et 5 étoiles, la pièce reçue, la note de tous les avis publiés, en rangées pleines), **les questions** (les premières d'une page de questions, en accordéon), **les marques** (chacune vers ses pièces) ; et la sélection choisit son ordre (la vôtre, ou les nouveautés). **Ses photos aussi** (01/10) : l'ouverture, son cadrage pour téléphone et le récit se choisissent depuis l'écran — réduites dans le navigateur, revérifiées par le serveur, décrites pour qui ne les voit pas ; une photo remplacée quitte le dépôt (celles de la console et du jeu de démo jamais). Reste : bannières défilantes, vidéo, Instagram, « acheter la silhouette ».
- [x] **Préréglages par métier** (01/10) dans la console — mode, beauté, bijoux, high-tech, maison, épicerie fine, outillage, bagages : le gabarit, la palette, les polices, les rayons et sous-rayons, les caractéristiques de chaque rayon, quelques réglages et la politique de retour, posés d'un geste à la création ou sur une boutique vide ; tout se change ensuite. **Et son accueil** (01/10), pris dans la bibliothèque : la beauté ouvre sur ses nouveautés et ce qu'en disent ses clientes, le high-tech sur ses rayons et ses marques, l'épicerie sur sa sélection — sans un mot écrit d'avance ; chaque section paraît d'elle-même quand la boutique a de quoi la remplir (une seule « Le catalogue arrive » sur une boutique neuve, ni vignette de rayon vide).
- **Boutiques de démonstration par métier**, pour la prospection. [x] **La beauté** (01/10) : *Yasmine Beauté* (`supabase/seed-beaute.sql`, `beaute.localhost`, et dans l'aperçu en ligne), le préréglage beauté posé à la main — gabarit éditorial, six rayons (soins du visage, corps et bain, cheveux, maquillage, parfums, coffrets), la contenance et le type de peau ; 17 produits d'une marque fictive, 28 déclinaisons (contenances qui font le prix, parfums de savon dont un épuisé, teintes de vernis en pastilles), photos CC0 sans marque lisible ; dix avis vérifiés de commandes livrées en 2025 (deux réponses de la boutique, aucune photo de cliente) ; l'accueil : nouveautés, rayons sur une seule rangée, parfums, le récit du hammam et ses produits, ce qu'en disent ses clientes. [x] **La maison** (01/10) : *Dar Alia* (`supabase/seed-maison.sql`, `maison.localhost`, et dans l'aperçu en ligne), le préréglage maison posé à la main — cinq rayons (cuisine et table, décoration, linge de maison, luminaires, rangement), la matière sur les cartes, les dimensions, l'entretien, le fait main filtrable ; 18 produits d'une marque fictive, 27 déclinaisons (des formats qui font le prix, le grand kilim épuisé, des couleurs en pastilles), photos CC0 sans marque ni pièce de musée ; huit avis vérifiés ; l'accueil : rayons, essentiels, le récit de l'atelier, « Lumière et laine », les avis. Reste le high-tech (avec le gabarit « commerce »).

### E. Des vitrines au choix, qui font dire « waouh »

Demandé par Skander le 01/10 : d'autres structures que les deux gabarits, modernes et premium, le choix laissé au commerçant, une personnalisation plus poussée, et des sites vitrine. Les maquettes (01/10) attendent son choix : quatre structures, chacune sur ordinateur et téléphone avec les photos d'une boutique de démonstration, et l'éditeur de style cliquable.

- [x] **Bento** (01/10, migration 65 ; *Dar Alia* en Bento) : l'accueil en mosaïque — l'ouverture partage la première rangée avec la pièce à la une, le paiement à la livraison et la vraie note des clients (une tuile qui n'a rien de vrai à dire ne s'affiche pas) ; les rayons en grille, le premier sur deux rangées ; le récit en deux tuiles ; l'en-tête flottant en pilule, coins ronds et boutons pilule conseillés. Les mêmes sections que les autres structures, sur les composants éditoriaux (fiches, catalogue, tunnel). Reste : l'ajout au panier depuis la photo, les filtres en pastilles.
- **Immersif** (mode, luxe, maison haut de gamme) : la photo (ou la vidéo) plein écran, l'en-tête posé dessus, les collections qui glissent, le lookbook à points cliquables ; fond sombre ou clair.
- **Commerce** (high-tech, électroménager, outillage, grande distribution) : la recherche d'abord, le grand menu des rayons, bannières, prix barrés et prix pro, stock sur la carte, comparaison ; au téléphone, une barre d'onglets.
- **Monoproduit** (vente par les publicités Facebook et TikTok) : une page de vente — la promesse, les offres (1, 2 ou 3), le formulaire de commande sur la page, l'utilisation, les avis, les questions ; au téléphone, « Commander » reste en bas.
- [x] **L'éditeur de style** (01/10, écran « Apparence » du backoffice, migration 64) : à côté des réglages, la vraie vitrine, sur ordinateur ou téléphone, suit chaque geste — la structure (éditoriale, Bento, technique ; changer de structure apporte ses coins et ses boutons conseillés, Ctrl+Z pour garder les siens), neuf ambiances (dont trois sombres), le fond, l'accent et les treize couleurs (la lisibilité mesurée, chaque couleur dérivée poussée au contraste qu'exige son usage), onze polices de titres et cinq de texte, la taille et l'écriture des titres, les coins, la forme et la teinte des boutons, les cartes, le format des photos, l'espace entre les sections, les animations. Chaque geste s'enregistre dans un brouillon que les visiteurs ne voient pas (et qui ne dérange pas un collègue qui compose l'accueil), ouvert sur un téléphone par son lien d'aperçu ; défaire et refaire au clavier ; « Publier », ou revenir à la version publiée. En mode sombre, les e-mails restent clairs. Toutes les boutiques gardent leur allure tant qu'on n'y touche pas.
- **Le site vitrine** (réglage du type de site) : présenter une activité, ses produits ou ses services, sans commande en ligne — le contact, WhatsApp, la demande de devis, l'adresse et les horaires.
- Chaque structure a sa boutique de démonstration, dans la galerie des modèles de la console.

### F. Console et backoffice : le mouvement

- Une couche de mouvement avec **Motion** (ex-Framer Motion), chargée à la demande (`LazyMotion`) : onglets, listes qui se réordonnent, tiroirs, notifications, compteurs du tableau de bord, gestes au doigt (glisser pour confirmer une commande) ; « réduire les animations » respecté partout.
- Graphiques du tableau de bord.
- [x] **L'objectif du mois** (01/10) : la direction vise un chiffre — le livré, donc l'encaissé, du mois —, le tableau de bord en suit la jauge (le livré, ce qui est en route), le rythme (la fin du mois au train actuel, dès le 5), ce qu'il faut livrer par jour, et les six mois d'avant ; le mois suivant se prépare d'avance ; « Aujourd'hui » le rappelle.

### G. Tout contrôler

- Surveillance automatique, chaque heure, des boutiques en ligne (pages clés, temps de réponse, polices, images) ; alerte à Skander au premier défaut.
- Les erreurs de l'application, boutique par boutique, lisibles dans la console.
- [x] **Les visites de chaque vitrine** (01/10, réglage « Mesure d'audience ») : visiteurs, pages vues, commandes et conversion sur 7, 30 ou 90 jours comparés à la période d'avant, le jour par jour, d'où l'on vient (Instagram, Google, Facebook, direct…), sur quel appareil, les fiches et les pages les plus vues — sans cookie ni donnée personnelle (une empreinte salée du jour, illisible le surlendemain ; l'adresse IP jamais gardée ; robots et « ne pas me suivre » écartés). **Le chemin vers la commande et les campagnes** (01/10) : de chaque visite, l'étape la plus loin atteinte (une fiche, le panier, la commande ouverte, la commande passée) et où l'on perd le plus de monde ; les visites venues d'un lien de campagne (utm), ce qu'elles ont vendu, et le lien composé au backoffice pour chaque publication.
- [x] **Le poste de pilotage de la console** (30/09) : chaque boutique en tuile à sa marque — sa semaine jour par jour, l'encaissé, ce qui attend et depuis quand, la mise en place et la prochaine étape, un accès support ouvert —, la synthèse de la plateforme et « À surveiller » (le plus pressant d'abord). Reste la santé de chaque vitrine (temps de réponse, erreurs), avec la surveillance ci-dessus.

### H. Arabe et paiement en ligne — à la fin

Skander, le 01/10 : on prépare l'infrastructure, l'arabe s'intègre à la fin. La structure i18n et le sens de lecture sont prêts depuis le premier écran (PRD) ; chaque écran nouveau les respecte.

- L'interface entière en arabe (de droite à gauche), la bascule FR/AR par boutique, les contenus bilingues saisis au backoffice.
- Konnect (V6), derrière son module, qui s'efface si le prestataire tombe.

### I. La mise en production (avec Skander)

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
