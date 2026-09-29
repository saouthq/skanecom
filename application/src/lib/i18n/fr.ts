/* ============================================================================
   LIBELLÉS — français. SOURCE UNIQUE de tout texte d'interface, COMMUN À
   TOUTES LES BOUTIQUES : aucun nom de boutique, de ville ou de produit ici.
   Ce qui est propre à une boutique (son nom, son accroche, sa ville, sa
   politique de retour) vient de la base — réglages et thème — et arrive ici
   en paramètre.

   Ton de voix (charte §4) : vouvoiement, phrases courtes, aucun point
   d'exclamation, aucun superlatif, aucune promotion. On dit le prix, le délai
   et le stock tout de suite.

   ⚠️ Rien ici ne doit contenir un CHIFFRE DE SERVICE en dur (frais, délai,
   stock, nombre de références) : ces valeurs viennent de la base — des
   réglages, des zones de livraison ou du catalogue. Les fonctions ci-dessous
   les reçoivent en paramètre.
   ========================================================================== */

export const fr = {
  marque: {
    accueilAria: (nom: string) => `${nom} — accueil`,
  },

  commun: {
    sauterAuContenu: "Aller au contenu",
    accueil: "Accueil",
    filAriane: "Fil d'Ariane",
    navigationPrincipale: "Principale",
    rechercher: "Rechercher",
    monCompte: "Mon compte",
    panier: "Panier",
    panierVide: "Panier, vide",
    voirLeCatalogue: "Voir le catalogue",
    toutLeCatalogue: "Tout le catalogue",
    voirLeRayon: "Voir tout le rayon",
    chargement: "Chargement",
    bientot: "Bientôt disponible",
    /** Décision Luna du 11/08 : une maison qui attend ses photos le dit avec
     *  de la tenue, plutôt que d'exhiber un pictogramme. */
    photoAVenir: "Photo à venir",
    menu: "Menu",
    ouvrirMenu: "Ouvrir le menu",
    fermerMenu: "Fermer le menu",
    tousLesRayons: "Tous les rayons",
    toutVoir: "Tout voir",
    decouvrir: "Découvrir",
  },

  /** Le bandeau d'annonce, au-dessus de l'en-tête : des FAITS de réglage. */
  annonce: {
    cod: "Paiement à la livraison, partout en Tunisie",
    livraisonOfferte: (seuil: string) => `Livraison offerte dès ${seuil} d'achat`,
    retrait: "Retrait en magasin",
    conseil: "Conseil sur WhatsApp",
  },

  accueil: {
    /** Chapô par défaut, quand la boutique n'a pas écrit le sien. */
    chapoHero: "Vous voyez le stock réel, vous payez au livreur.",
    parcourirParRayon: "Parcourir par rayon",
    faitPaiementLivraison: "Paiement à la livraison",
    faitToutePartout: "Toute la Tunisie",
    faitRappel: "On vous rappelle avant d'expédier",
    /** La promesse en UNE ligne. Le détail vit dans la section « comment ça se
     *  passe » — l'annoncer trois fois sur la même page ne la rend pas plus
     *  vraie (juge visuel, 11/08). */
    promesse: "Paiement à la livraison, partout en Tunisie.",
    /** Les frais étaient enfouis dans l'étape 03 : ils remontent près des prix
     *  (juge visuel, 11/08). Le montant vient du réglage, jamais du code. */
    promesseAvecFrais: (frais: string, seuil?: string) =>
      `Paiement à la livraison, partout en Tunisie — livraison ${frais}${seuil ? `, offerte dès ${seuil}` : ""}.`,
    registreEtiquette: "Le registre",
    registreTitre: "Le catalogue, rayon par rayon.",

    selectionEtiquette: "En boutique",
    selectionTitre: "Ce qui est en boutique aujourd'hui.",
    selectionMisEnAvant: "Mis en avant par la maison.",
    selectionVideTitre: "Le catalogue arrive.",
    selectionVide:
      "Aucune pièce n'est encore publiée. Les premières références sont en cours de préparation.",

    marcheEtiquette: "Le paiement à la livraison",
    marcheTitre: "Vous ne payez rien avant d'avoir le colis en main.",
    marche: [
      {
        titre: "Vous commandez",
        texte: "Adresse et téléphone, rien d'autre. Aucune carte bancaire n'est demandée.",
      },
      {
        titre: "On vous rappelle",
        texte: "Un appel pour confirmer l'adresse et la disponibilité, avant l'expédition.",
      },
      {
        titre: "Vous payez au livreur",
        texte: "En espèces, à la remise. Si l'article ne vous convient pas, vous le refusez sur place.",
      },
    ],
    marcheAutomatique: {
      titre: "On prépare",
      texte: "La commande part en préparation dès qu'elle est enregistrée.",
    },
    konnectEteint: "Le paiement par carte arrivera plus tard. Aujourd'hui, tout se règle à la livraison.",

    /* Gabarit éditorial */
    collectionsTitre: "Les collections",
    selectionTitreEditorial: "La sélection",
    recitLien: "Découvrir",
    /* Gabarit technique */
    rayonsTitreTechnique: "Nos rayons",
    selectionTitreTechnique: "Les références du moment",
    heroCta: "Voir le catalogue",
    engagementsTitre: "Commander, simplement",
  },

  catalogue: {
    titre: "Tout le catalogue",
    etiquette: "Toutes les pièces en boutique",
    chapo: "Le nombre indiqué sous chaque pièce est le stock réel, pas une estimation.",
    filtres: "Filtres",
    affiner: "Affiner",
    filtrer: "Filtrer",
    fermer: "Fermer",
    toutEffacer: "Tout effacer",
    retirerLesFiltres: "Retirer les filtres",
    appliquer: "Voir les résultats",
    voirResultats: (n: number) => (n > 1 ? `Voir les ${n} résultats` : n === 1 ? "Voir le résultat" : "Aucun résultat"),
    rayon: "Rayon",
    /** Libellé d'un axe de variante quand la fiche n'en donne pas. */
    axes: { couleur: "Couleur", taille: "Taille", version: "Version", conditionnement: "Conditionnement" } as Record<string, string>,
    prixEntre: (min: number | null, max: number | null) =>
      min !== null && max !== null ? `${min} à ${max} TND` : min !== null ? `≥ ${min} TND` : `≤ ${max} TND`,
    precedente: "Page précédente",
    suivante: "Page suivante",
    pageSur: (page: number, pages: number) => `Page ${page} sur ${pages}`,
    disponibilite: "Disponibilité",
    enStockSeulement: "En stock seulement",
    prixTnd: "Prix (TND)",
    aPartirDe: "dès",
    prixMin: "Prix minimum en dinars",
    prixMax: "Prix maximum en dinars",
    trier: "Trier",
    tris: {
      nouveautes: "Nouveautés d'abord",
      prixCroissant: "Prix croissant",
      prixDecroissant: "Prix décroissant",
      nom: "Nom (A → Z)",
    },
    aucuneValeur: "Aucune sélection — tout est affiché",
    videTitre: "Aucune pièce ne correspond.",
    videTexte: "Vos filtres ne laissent passer aucun modèle. Retirez-en un pour élargir la recherche.",
    /** n = nombre affiché, total = nombre publié */
    compte: (n: number, total: number) =>
      n === total
        ? `${n} ${n > 1 ? "modèles" : "modèle"}`
        : `${n} ${n > 1 ? "modèles" : "modèle"} sur ${total}`,
    filtresActifs: (n: number) => (n > 1 ? `${n} filtres actifs` : `${n} filtre actif`),
    tousAffiches: (n: number) =>
      n > 1 ? `Les ${n} modèles correspondant à vos filtres sont affichés.` : "Un seul modèle correspond à vos filtres.",
    retirerEtVoirTout: (n: number) => `Retirer les filtres et voir les ${n}`,
    retirerLeFiltre: (valeur: string) => `Retirer le filtre ${valeur}`,
    /** Compte de modèles d'un rayon, sur la page d'accueil */
    modeles: (n: number) => (n > 1 ? `${n} modèles` : `${n} modèle`),
    /** Même compte, dit comme un catalogue technique. */
    references: (n: number) => (n > 1 ? `${n} références` : `${n} référence`),
    resultats: (n: number) => (n > 1 ? `${n} résultats` : `${n} résultat`),
    colorisN: (n: number) => `${n} coloris`,
  },

  produit: {
    marque: "Marque",
    reference: "Référence",
    caracteristiques: "Caractéristiques",
    description: "Description",
    ajouterAuPanier: "Ajouter au panier",
    quantite: "Quantité",
    retirerUnArticle: "Retirer un article",
    ajouterUnArticle: "Ajouter un article",
    galerieAria: "Photos du produit",
    stockReel:
      "Le nombre affiché est le stock réel, pas une estimation. Prix toutes taxes comprises, livraison en sus.",
    indisponibleTitre: "Cette déclinaison n'est pas disponible",
    indisponibleTexte: "Choisissez une autre combinaison pour commander.",
    ruptureExpliquee: (valeurs: string) =>
      `${valeurs} : en rupture. Cette déclinaison revient en stock après le prochain arrivage.`,
    poids: "Poids",
    poidsSelonTaille: (min: string, max: string) => `${min} à ${max}`,
    declinaisons: "Déclinaisons",
    aussiEnBoutique: "Aussi en boutique",
    aussiEnBoutiqueTitre: "D'autres pièces, en stock aujourd'hui.",
    livraisonEtDelais: "Comment se passe l'expédition",
    /** Le délai et les frais sont dits UNE fois, dans le bloc de réassurance.
     *  Ce pli ne les répète pas : il dit ce qui n'est écrit nulle part
     *  ailleurs (juge visuel, 11/08 — la même information vivait à trois
     *  endroits sans qu'on sache laquelle fait foi). */
    expeditionTexte: (origine?: string) =>
      `La commande part${origine ? ` de ${origine}` : ""} après confirmation. Le livreur vous appelle avant de se présenter.`,
    expeditionAvecRappel: (origine?: string) =>
      `On vous appelle d'abord pour confirmer l'adresse et la disponibilité, puis la commande part${origine ? ` de ${origine}` : ""}. Le livreur vous appelle avant de se présenter.`,
    retourEtRefus: "Retour et refus",
    /** La politique d'échange après acceptation est celle de la boutique
     *  (texte « politique_retour » de son thème). */
    retourEtRefusTexte: "Vous pouvez refuser le colis au moment de la remise, sans motif et sans frais.",
    payezALaLivraison: "Vous payez à la livraison",
    payezALaLivraisonTexte: "En espèces, à la main du livreur. Aucune carte n'est demandée.",
    refusPossible: "Refus possible à la remise",
    refusPossibleTexte: "Si l'article ne convient pas, refusez-le au livreur. Rien n'est dû.",
    confirmationTelephonique: "On vous rappelle avant d'expédier",
    confirmationTelephoniqueTexte:
      "Un appel confirme l'adresse et la disponibilité avant la préparation du colis.",
    vousAimerez: "Vous aimerez aussi",
    memeRayon: "Dans le même rayon",
    ttc: "TTC",
    refCourte: "Réf.",
    voir: "Voir le produit",
    ajouter: "Ajouter",
    choisir: "Choisir",
    photoN: (i: number, n: number) => `Photo ${i} sur ${n}`,
    retraitMagasin: "Retrait en magasin",
    retraitMagasinTexte: (ville: string, pret: string) => `Gratuit, au magasin de ${ville}. ${pret} après confirmation.`,
    conseil: "Besoin d'un conseil ?",
    conseilTexte: "Posez votre question sur WhatsApp, on vous répond.",
    conseilLien: "Écrire sur WhatsApp",
    livraisonTitre: "Livraison",
  },

  stock: {
    enStock: "En stock",
    /** La fiche PROMET « le nombre affiché est le stock réel » : il faut donc
     *  qu'un nombre s'affiche (juge visuel, 11/08 — la promesse était écrite
     *  au-dessus d'un badge sans chiffre). */
    enStockN: (n: number) => (n > 1 ? `En stock — ${n} pièces` : "En stock — dernière pièce"),
    rupture: "Rupture",
    /** n <= seuil d'alerte de la variante */
    faible: (n: number) => (n > 1 ? `Plus que ${n}` : "Dernière pièce"),
    faibleSur: (n: number, valeur: string) =>
      n > 1 ? `Plus que ${n} en ${valeur.toLowerCase()}` : `Dernière pièce en ${valeur.toLowerCase()}`,
    epuise: "Épuisé pour le moment",
    /** Récapitulatif d'une carte : quantité totale toutes déclinaisons */
    disponibles: (n: number) => (n > 1 ? `${n} pièces disponibles` : "1 pièce disponible"),
  },

  livraison: {
    titre: "Livraison",
    /** frais formaté (déjà en TND) */
    fraisFixes: (frais: string, seuil?: string) =>
      `Toute la Tunisie — frais fixes de ${frais}${seuil ? `, offerts dès ${seuil} d'achat` : ""}.`,
    fraisParZone: (seuil?: string) =>
      `Les frais dépendent de votre région, calculés au moment de la commande${seuil ? ` ; livraison offerte dès ${seuil} d'achat` : ""}.`,
    delai: (min: number, max: number) =>
      min === max
        ? `Livré en ${min} ${min > 1 ? "jours ouvrés" : "jour ouvré"}`
        : `Livré en ${min} à ${max} jours ouvrés`,
    delaiSelonRegion: "selon la région",
  },

  recherche: {
    titre: "Recherche",
    champAria: "Rechercher un produit",
    placeholder: "Un produit, une marque, une référence…",
    lancer: "Rechercher",
    invite: "Tapez ce que vous cherchez : un type de produit, une marque, une référence.",
    resultats: (n: number, q: string) =>
      n > 1
        ? `${n} pièces trouvées pour « ${q} »`
        : n === 1
          ? `Une pièce trouvée pour « ${q} »`
          : `Aucune pièce trouvée pour « ${q} »`,
    videTexte:
      "Essayez un mot plus court, ou parcourez le catalogue rayon par rayon.",
  },

  introuvable: {
    etiquette: "Page introuvable",
    titre: "Cette page n'existe pas.",
    texte:
      "Le lien est peut-être ancien, ou la pièce n'est plus au catalogue. Le catalogue complet et la recherche sont là.",
  },

  panier: {
    titre: "Votre panier",
    ouvrir: (n: number) => (n > 0 ? `Panier, ${n} ${n > 1 ? "articles" : "article"}` : "Panier, vide"),
    vide: "Votre panier est vide.",
    videTexte: "Les pièces que vous ajoutez se retrouvent ici.",
    retirer: (libelle: string) => `Retirer ${libelle}`,
    retirerCourt: "Retirer",
    total: "Total des articles",
    horsLivraison: "Livraison en sus, réglée à la remise.",
    continuer: "Continuer mes achats",
    fermer: "Fermer le panier",
    ajoute: "Ajouté au panier",
    titreCompte: (n: number) => `Panier (${n})`,
    resteAvantGratuite: (montant: string) => `Plus que ${montant} pour la livraison offerte.`,
    gratuiteAtteinte: "La livraison vous est offerte.",
    commander: "Commander",
  },

  /** Le tunnel de commande (paiement à la livraison) et sa page de fin. Les
   *  frais, délais, zones et montants arrivent en paramètre : ils viennent
   *  de la base (devis_commande, commande_suivie). */
  commande: {
    titre: "Commande",
    rassurance: "Vous ne payez rien en ligne : vous réglez au livreur, à la remise du colis.",
    rassuranceRetrait: "Vous ne payez rien en ligne : vous réglez au livreur, ou au comptoir du magasin.",
    retourPanier: "Modifier le panier",
    panierVide: "Votre panier est vide.",
    panierVideTexte: "Ajoutez des articles avant de commander.",
    fermee: "La commande en ligne n'est pas ouverte dans cette boutique pour le moment.",

    etapeCoordonnees: "Vos coordonnées",
    etapeLivraison: "Livraison",
    etapePaiement: "Paiement",
    facultatif: "facultatif",

    telephone: "Téléphone",
    indicatif: "+216",
    telephoneAide: "Le livreur vous appelle sur ce numéro.",
    telephoneAideCompte: "Un code vous est envoyé par SMS pour confirmer ce numéro. Il vous sert ensuite de compte dans cette boutique.",
    recevoirCode: "Recevoir le code",
    envoiCode: "Envoi du code",
    codeEnvoye: (telephone: string) => `Code envoyé au ${telephone}.`,
    code: "Code reçu par SMS",
    valider: "Valider",
    verification: "Vérification",
    renvoyer: "Renvoyer le code",
    renvoyerDans: (secondes: number) => `Nouveau code possible dans ${secondes} s`,
    modifierNumero: "Modifier le numéro",
    connecte: (telephone: string) => `Numéro confirmé : ${telephone}`,
    changerNumero: "Changer de numéro",
    codeIncorrect: "Code incorrect ou expiré. Vérifiez le SMS, ou demandez un nouveau code.",
    codeAttendu: "Saisissez les 6 chiffres du code.",
    numeroAConfirmer: "Confirmez votre numéro avec le code reçu par SMS.",
    telephoneInvalide: "Numéro tunisien à 8 chiffres attendu, par exemple 20 123 456.",
    smsTropTot: "Un code vient de partir. Patientez un peu avant d'en demander un autre.",
    smsEchec: "Le SMS n'a pas pu partir. Réessayez dans un instant.",

    nom: "Nom et prénom",
    nomInvalide: "Indiquez le nom de la personne qui reçoit le colis.",
    adresse: "Adresse",
    adresseAide: "Rue et numéro, immeuble, étage.",
    adresseInvalide: "Indiquez l'adresse de livraison.",
    complement: "Complément d'adresse",
    ville: "Ville ou délégation",
    villeInvalide: "Indiquez la ville ou la délégation.",
    gouvernorat: "Gouvernorat",
    choisirGouvernorat: "Choisir le gouvernorat",
    gouvernoratInvalide: "Choisissez le gouvernorat : il décide des frais de livraison.",
    codePostal: "Code postal",
    codePostalInvalide: "Le code postal compte 4 chiffres.",
    livraisonVers: (zone: string) => `Livraison ${zone}`,
    modeLivraison: "Mode de livraison",
    modeDomicile: "Livraison à domicile",
    modeDomicileTexte: "Partout en Tunisie. Les frais dépendent du gouvernorat.",
    modeRetrait: "Retrait en magasin",
    modeRetraitTexte: (ville: string, pret: string) => `Au magasin de ${ville}. ${pret}.`,
    gratuit: "Gratuit",
    pretSous: (heures: number) =>
      heures >= 48 && heures % 24 === 0 ? `Prête sous ${heures / 24} jours` : `Prête sous ${heures} heure${heures > 1 ? "s" : ""}`,
    retraitOu: "Où retirer votre commande",
    retraitSuite: "La boutique vous appelle pour confirmer, puis prépare la commande : elle vous attend au comptoir, à votre nom.",
    nomRetraitInvalide: "Indiquez le nom de la personne qui vient retirer la commande.",
    retraitIndisponible: "Le retrait en magasin n'est plus proposé. Choisissez la livraison à domicile.",
    delai: (min: number, max: number) =>
      min === max ? `${min} ${min > 1 ? "jours ouvrés" : "jour ouvré"}` : `${min} à ${max} jours ouvrés`,

    cod: "Paiement à la livraison",
    codTexte: "En espèces, à la remise du colis. Aucune carte n'est demandée.",
    codRetrait: "Paiement au retrait",
    codTexteRetrait: "En espèces, au comptoir, quand vous retirez la commande. Aucune carte n'est demandée.",
    appelConfirmation: "Avant l'expédition, la boutique vous appelle pour confirmer la commande.",
    appelConfirmationRetrait: "Avant de préparer la commande, la boutique vous appelle pour la confirmer.",
    note: "Une précision pour la livraison",
    noteAide: "Horaires, point de repère, code de l'immeuble.",
    noteRetrait: "Une précision pour la boutique",
    noteRetraitAide: "Qui vient la retirer, et quand.",
    donnees: "Vos coordonnées servent uniquement à préparer et livrer vos commandes.",
    conditionsAvant: "J'ai lu et j'accepte les",
    conditionsLien: "conditions de vente",
    conditionsEt: "et la",
    confidentialiteLien: "politique de confidentialité",
    conditionsManquantes: "Cochez cette case pour confirmer la commande.",
    conditionsRequises: "Dernière étape : acceptez les conditions de vente, en bas du formulaire.",
    retractation: (jours: number) => `Vous pouvez vous rétracter dans les ${jours} jours ouvrables qui suivent la réception.`,

    recapitulatif: "Récapitulatif",
    afficherRecap: "Afficher le récapitulatif",
    masquerRecap: "Masquer le récapitulatif",
    sousTotal: "Sous-total",
    livraison: "Livraison",
    livraisonOfferte: "Offerte",
    selonGouvernorat: "Selon le gouvernorat",
    total: "Total",
    ttc: "TTC",
    quantite: (n: number) => `Quantité : ${n}`,
    indisponible: "N'est plus disponible.",
    reste: (n: number) => `Il n'en reste que ${n}.`,
    ajuster: (n: number) => `Passer à ${n}`,
    retirer: "Retirer",
    calcul: "Calcul du total",

    confirmer: "Confirmer la commande",
    envoi: "Envoi de la commande",
    aCorriger: "Quelques informations manquent : elles sont signalées ci-dessous.",
    horsLigne: "La connexion a été coupée. Réessayez : votre commande ne sera pas passée deux fois.",
    totalChange: "Un prix ou un frais a changé. Vérifiez le nouveau total, puis confirmez.",
    stockChange: "Un article n'est plus disponible dans la quantité demandée. Ajustez le récapitulatif.",
    reconnexion: "Votre session a expiré. Confirmez de nouveau votre numéro.",
    enAttente: "Ce numéro a déjà des commandes en attente de confirmation. La boutique vous appelle ; vous pourrez commander de nouveau ensuite.",
    bloque: "Ce numéro ne peut pas commander en ligne. Contactez la boutique.",
    erreur: "La commande n'a pas pu être passée. Réessayez dans un instant.",

    merciMeta: "Commande reçue",
    merciEtiquette: "Commande reçue",
    merciEtiquetteConfirmee: "Commande confirmée",
    merciTitre: (prenom: string) => `Merci, ${prenom}.`,
    merciNumero: (numero: string) => `Votre commande ${numero} est enregistrée.`,
    laSuite: "La suite",
    suiteRecue: "Reçue",
    suiteRecueTexte: "La boutique a votre commande et votre adresse.",
    suiteRecueTexteRetrait: "La boutique a votre commande.",
    suiteAppel: "Appel de confirmation",
    suiteAppelTexte: (telephone: string) => `La boutique vous appelle au ${telephone} avant de préparer le colis.`,
    suiteAppelTexteRetrait: (telephone: string) => `La boutique vous appelle au ${telephone} avant de préparer la commande.`,
    suiteExpedition: "Expédition",
    suiteExpeditionTexte: (delai?: string) =>
      delai ? `Le colis part après confirmation : comptez ${delai}.` : "Le colis part après confirmation.",
    suiteLivraison: "Livraison et paiement",
    suiteLivraisonTexte: (montant: string) => `Vous réglez ${montant} en espèces au livreur. Vous pouvez refuser le colis à la remise.`,
    livreeA: "Livraison à",
    aRetirerA: "À retirer au magasin",
    suitePreparation: "Préparation",
    suitePreparationTexte: (pret: string) => `La boutique prépare la commande après confirmation. ${pret}.`,
    suiteRetrait: "Retrait et paiement",
    suiteRetraitTexte: (montant: string) => `Au comptoir, à votre nom : vous réglez ${montant} en espèces en la retirant.`,
    articles: "Articles",
    continuer: "Continuer mes achats",
    aucune: "Aucune commande récente sur ce navigateur.",
    aucuneTexte: "Si vous venez de commander, la boutique vous appelle pour la confirmer.",
    statut: {
      a_arbitrer: "À vérifier par la boutique",
      recue: "Reçue, en attente d'appel",
      confirmee: "Confirmée",
      expediee: "Expédiée",
      livree: "Livrée",
      refusee: "Refusée à la livraison",
      annulee: "Annulée",
    } as Record<string, string>,
    /** Les étapes qui changent de nom pour une commande à retirer. */
    statutRetrait: {
      expediee: "Prête au retrait",
      livree: "Retirée",
      refusee: "Non retirée",
    } as Record<string, string>,
  },

  compte: {
    titre: "Mes commandes",
    lien: "Mes commandes",
    meta: "Mes commandes",
    chapo: "Toutes les commandes passées avec votre numéro, et où elles en sont.",
    connexionTitre: "Retrouvez vos commandes",
    connexionTexte: "Saisissez le numéro avec lequel vous avez commandé : un code vous est envoyé par SMS.",
    connecte: (telephone: string) => `Connecté avec le ${telephone}`,
    deconnexion: "Se déconnecter",
    chargement: "Chargement de vos commandes",
    erreur: "Vos commandes n'ont pas pu être chargées. Réessayez dans un instant.",
    aucune: "Aucune commande pour le moment.",
    aucuneTexte: "Les commandes passées avec ce numéro s'afficheront ici.",
    passeeLe: (date: string) => `Passée le ${date}`,
    articles: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    livraisonA: (lieu: string) => `Livraison à ${lieu}`,
    retraitA: (lieu: string) => `À retirer : ${lieu}`,
    suivi: (transporteur: string | null, numero: string | null) =>
      [transporteur ? `Avec ${transporteur}` : null, numero ? `suivi ${numero}` : null].filter(Boolean).join(" · "),
    etat: {
      a_arbitrer: "La boutique la vérifie, puis vous appelle.",
      recue: "La boutique vous appelle pour la confirmer.",
      confirmee: "Confirmée : elle est en préparation.",
      expediee: "En route : le livreur vous appelle avant de passer.",
      livree: "Livrée. Merci !",
      refusee: "Refusée à la livraison.",
      annulee: "Annulée.",
    } as Record<string, string>,
    etatRetrait: {
      confirmee: "Confirmée : la boutique la prépare.",
      expediee: "Prête : elle vous attend au magasin.",
      livree: "Retirée. Merci !",
      refusee: "Non retirée.",
    } as Record<string, string>,
    commander: "Voir le catalogue",
    suivre: "Suivre mes commandes",
  },

  pied: {
    catalogue: "Catalogue",
    commander: "Commander",
    laMaison: "La maison",
    paiementLivraison: "Paiement à la livraison",
    livraisonDelais: "Livraison et délais",
    retoursRefus: "Retours et refus",
    quiNousSommes: "Qui nous sommes",
    conditions: "Conditions de vente",
    mentions: "Mentions légales",
    legal: "Informations légales",
    droits: (annee: number, nom: string, origine?: string) => `© ${annee} ${nom}${origine ? ` — ${origine}` : ""}`,
    devise: "Prix en dinars tunisiens (TND), toutes taxes comprises.",
    services: "Services",
    contact: "Contact",
  },

  seo: {
    gabaritTitre: (nom: string) => `%s | ${nom}`,
    descriptionSite: (nom: string) => `${nom} : stock réel, prix en dinars, paiement à la livraison partout en Tunisie.`,
    catalogueDescription: (nom: string) =>
      `Le catalogue ${nom} : stock réel, prix en dinars, paiement à la livraison partout en Tunisie.`,
    produitDescription: (nom: string, prix: string) =>
      `${nom} — ${prix}. Paiement à la livraison partout en Tunisie.`,
    rechercheTitre: "Recherche",
  },

  secours: {
    titre: "La boutique revient dans quelques minutes.",
    texte: "En attendant, vous pouvez commander par WhatsApp : le message est déjà prêt avec votre panier.",
    whatsapp: "Commander par WhatsApp",
  },
} as const;
