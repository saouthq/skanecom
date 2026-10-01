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

import type { Verification } from "@/lib/connexion";

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
    garantie: (mois: number) => `Garantie ${mois} mois`,
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
    /* La bibliothèque de sections (migration 59) */
    avisEtiquette: "Avis vérifiés",
    avisTitre: "Ce qu'en disent nos clients",
    questionsTitre: "Vos questions",
    toutesLesQuestions: (n: number) => `Les ${n} questions`,
    marquesTitre: "Les marques",
    selectionNouveautes: "Les nouveautés",
    /* Structure Bento */
    bentoUne: "À la une",
    bentoCodTexte: "partout en Tunisie",
    bentoAvisTotal: (n: number) => (n > 1 ? `${n} avis vérifiés` : "1 avis vérifié"),
    bentoRayonsTitre: "Les rayons",
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
    /** L'essentiel de la fiche technique, sous le titre (gabarit technique). */
    essentiel: "L'essentiel",
    toutesCaracteristiques: "Toutes les caractéristiques",
    marque: "Marque",
    reference: "Référence",
    caracteristiques: "Caractéristiques",
    description: "Description",
    ajouterAuPanier: "Ajouter au panier",
    commanderMaintenant: "Commander maintenant",
    commanderMaintenantAide: "Payé à la livraison · votre panier reste tel quel",
    quantite: "Quantité",
    retirerUnArticle: "Retirer un article",
    ajouterUnArticle: "Ajouter un article",
    galerieAria: "Photos du produit",
    stockReel:
      "Le nombre affiché est le stock réel, pas une estimation. Prix toutes taxes comprises, livraison en sus.",
    indisponibleTitre: "Cette déclinaison n'est pas disponible",
    indisponibleTexte: "Choisissez une autre combinaison pour commander.",
    minimum: (n: number) => `Se commande par ${n} pièces au moins`,
    ajouterLot: (n: number) => `Ajouter ${n} pièces au panier`,
    sousMinimumTitre: "Pas assez de pièces en stock pour une commande",
    sousMinimumTexte: (reste: number, minimum: number) =>
      `Il en reste ${reste}, pour un minimum de ${minimum} par commande. Elle revient après le prochain arrivage.`,
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
    agrandir: (i: number, n: number) => `Agrandir la photo ${i} sur ${n}`,
    fermerPhotos: "Fermer les photos",
    photoPrecedente: "Photo précédente",
    photoSuivante: "Photo suivante",
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
    /** La fenêtre de livraison de la fiche produit (lib/livraison.ts). */
    estimee: (fenetre: string) => `Commandé aujourd'hui, livré ${fenetre}`,
    estimeeAide: "Selon votre région : la date exacte vous est donnée à l'appel de confirmation.",
    supplementPoids: "Un supplément s'ajoute pour les colis lourds, selon leur poids.",
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
    /** Les suggestions pendant la frappe (components/ChampRecherche.tsx). */
    suggestionsAria: "Suggestions",
    voirTout: (n: number, q: string) => (n > 1 ? `Voir les ${n} résultats pour « ${q} »` : `Voir le résultat pour « ${q} »`),
    rienPour: (q: string) => `Rien pour « ${q} » : essayez un mot plus court.`,
    annonceSuggestions: (n: number) => (n > 1 ? `${n} suggestions` : n === 1 ? "Une suggestion" : "Aucune suggestion"),
  },

  introuvable: {
    etiquette: "Page introuvable",
    titre: "Cette page n'existe pas.",
    texte:
      "Le lien est peut-être ancien, ou la pièce n'est plus au catalogue. Le catalogue complet et la recherche sont là.",
  },

  avis: {
    titre: "Avis clients",
    surCinq: (note: string) => `${note} sur 5`,
    total: (n: number) => `${n} avis`,
    totalVerifies: (n: number) => `${n} avis vérifié${n > 1 ? "s" : ""}`,
    repartition: "Répartition des notes",
    etoilesCourt: (n: number) => `${n} étoile${n > 1 ? "s" : ""}`,
    explication: "Seul un client qui a reçu l'article peut le noter, une fois. La boutique peut répondre ; elle ne modifie jamais un avis.",
    achatVerifie: "Achat vérifié",
    reponseBoutique: "Réponse de la boutique",
    vosArticles: "Vos articles : votre avis aide le prochain acheteur",
    noter: "Donner mon avis",
    statut: { en_attente: "En relecture", publie: "Publié", ecarte: "Non publié" } as Record<string, string>,
    merciPublie: "Merci ! Votre avis paraît sur la fiche d'ici quelques minutes.",
    merciRelu: "Merci ! Votre avis paraîtra après relecture par la boutique.",
    noteRequise: "Choisissez une note, de 1 à 5 étoiles.",
    erreur: "L'avis n'a pas pu être envoyé. Réessayez dans un instant.",
    formulaireTitre: (nom: string) => `Votre avis sur ${nom}`,
    votreNote: "Votre note",
    etoiles: (n: number) => `${n} étoile${n > 1 ? "s" : ""}`,
    qualificatif: ["Décevant", "Moyen", "Correct", "Très bien", "Excellent"],
    choisirNote: "Touchez une étoile",
    texte: "Votre avis",
    texteExemple: "La qualité, la taille, la livraison : ce qui aidera le prochain acheteur.",
    envoi: "Envoi…",
    publier: "Publier mon avis",
    annuler: "Annuler",
    // Les photos des avis (réglage avis.photos).
    photosClients: (n: number) => `Les photos des clients (${n})`,
    photoDe: (auteur: string) => (auteur ? `Photo envoyée par ${auteur}` : "Photo d'un client"),
    agrandirPhoto: (auteur: string, i: number, n: number) => `Agrandir la photo ${i} sur ${n}${auteur ? `, envoyée par ${auteur}` : ""}`,
    visionneuse: "Les photos des clients",
    photosTitre: "Vos photos",
    photosAide: (n: number) => `facultatif, ${n} au plus : l'article reçu, porté ou utilisé`,
    ajouterPhoto: "Ajouter une photo",
    photoChoisie: (i: number) => `Photo ${i}, choisie`,
    retirerPhoto: (i: number) => `Retirer la photo ${i}`,
    merciPhotos: (n: number) => `Avec ${n} photo${n > 1 ? "s" : ""}.`,
    photoRatee: (raison: string) => `Une photo n'a pas suivi : ${raison}`,
    photosErreur: "l'envoi a échoué.",
    // La liste de la fiche : ses filtres, sa suite (migration 62).
    photosClientsCourt: (n: number) => `${n} photo${n > 1 ? "s" : ""} de clients`,
    filtres: "Filtrer les avis",
    filtreTous: "Tous",
    filtrePhotos: "Avec photos",
    filtreNote: (n: number) => `${n} étoile${n > 1 ? "s" : ""}`,
    filtrerNote: (n: number, c: number) => `Afficher ${c > 1 ? `les ${c} avis` : "l'avis"} à ${n} étoile${n > 1 ? "s" : ""}`,
    resultat: (filtre: string, n: number) =>
      filtre === "tous" ? `${n} avis` : filtre === "photos" ? `${n} avis avec photos` : `${n} avis à ${filtre} étoile${Number(filtre) > 1 ? "s" : ""}`,
    lus: (n: number, total: number) => `${n} sur ${total}`,
    voirPlus: (k: number) => `Voir ${k} avis de plus`,
    ajoutes: (k: number) => `${k} avis de plus.`,
    chargement: "Chargement des avis…",
    erreurListe: "Les avis n'ont pas pu être chargés.",
    reessayer: "Réessayer",
  },

  /** Les pixels publicitaires et leur consentement (migration 63). */
  pixels: {
    titre: "Vos visites et nos publicités",
    plateformes: (meta: boolean, tiktok: boolean) =>
      meta && tiktok ? "Facebook, Instagram et TikTok" : meta ? "Facebook et Instagram" : "TikTok",
    texte: (nom: string, plateformes: string) =>
      `${nom} aimerait mesurer ses publicités sur ${plateformes}. Avec votre accord, ces plateformes reçoivent vos visites et commandes ici, et déposent leurs cookies. Sans lui, rien ne leur est envoyé.`,
    enSavoirPlus: "En savoir plus",
    refuser: "Refuser",
    accepter: "Accepter",
    actuelAccepte: "Aujourd'hui : accepté.",
    actuelRefuse: "Aujourd'hui : refusé.",
    lienPied: "Cookies publicitaires",
  },

  /** « Partager » sur la fiche (réglage vitrine.partage). */
  partage: {
    bouton: "Partager",
    boutonAria: (nom: string) => `Partager : ${nom}`,
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    copier: "Copier le lien",
    copie: "Lien copié",
    message: (nom: string, boutique: string) => `${nom}, chez ${boutique} :`,
  },

  /** La lettre d'information, au pied de page (réglage vitrine.lettre). */
  lettre: {
    titre: "La lettre",
    accroche: "Les nouveautés et les arrivages, dans votre boîte.",
    champ: "Votre adresse e-mail",
    /** Le nom du champ pour un lecteur d'écran (distinct de celui de la connexion). */
    champNom: "Votre e-mail, pour recevoir la lettre",
    bouton: "S'inscrire",
    envoi: "Envoi…",
    /** La phrase cochée : la base la garde telle quelle, preuve de l'accord. */
    consentement: (boutique: string) =>
      `J'accepte de recevoir la lettre de ${boutique} par e-mail. Je peux me désinscrire à tout moment, d'un clic.`,
    donnees: "Vos données",
    illisible: "Cette adresse e-mail est illisible : vérifiez-la.",
    cochez: "Cochez la case pour accepter de recevoir la lettre.",
    attente: (email: string) => `Presque fini : ouvrez l'e-mail envoyé à ${email} et confirmez. Rien ne vous sera envoyé avant.`,
    erreur: "L'inscription n'a pas pu partir. Réessayez dans un instant.",
    indisponible: "L'inscription est momentanément indisponible. Réessayez plus tard.",
    page: {
      confirmerTitre: "Confirmez votre inscription",
      confirmerTexte: (boutique: string) => `Un geste encore : confirmez, et la lettre de ${boutique} vous arrivera.`,
      confirmer: "Confirmer mon inscription",
      desinscrireTitre: "Vous désinscrire",
      desinscrireTexte: (boutique: string) => `Vous ne recevrez plus la lettre de ${boutique}, et votre adresse sera effacée.`,
      desinscrire: "Me désinscrire",
      inscritTitre: "C'est confirmé",
      inscritTexte: (boutique: string) => `Bienvenue : la prochaine lettre de ${boutique} sera pour vous. Chaque lettre porte le lien pour vous désinscrire.`,
      dejaTitre: "Vous êtes déjà inscrit",
      dejaTexte: "Rien à faire : votre inscription est confirmée.",
      desinscritTitre: "Vous êtes désinscrit",
      desinscritTexte: "Votre adresse est effacée : vous ne recevrez plus rien.",
      expireTitre: "Ce lien a expiré",
      expireTexte: "Il valait sept jours. Inscrivez-vous de nouveau, au pied de n'importe quelle page.",
      inconnuTitre: "Ce lien ne sert plus",
      inconnuTexte: "Vous êtes peut-être déjà désinscrit, ou un lien plus récent l'a remplacé.",
      retour: "Retour à la boutique",
      sortie: "Je ne veux plus la recevoir",
    },
  },

  /** « Souvent achetés ensemble » (réglage catalogue.achetes_ensemble). */
  ensemble: {
    titre: "Souvent achetés ensemble",
    chapo: "D'après les commandes de la boutique : ce que les clients prennent avec cette pièce.",
    panierTitre: "Souvent achetés avec votre panier",
    ajouter: "Ajouter",
    ajouterNom: (nom: string, n: number) => (n > 1 ? `Ajouter ${nom} au panier, par ${n}` : `Ajouter ${nom} au panier`),
    ajoute: "Ajouté",
    ajouteAnnonce: (nom: string) => `${nom} : ajouté au panier.`,
    choisir: (nom: string) => `Choisir la taille ou la couleur de ${nom}`,
  },

  vus: {
    titre: "Vus récemment",
    effacer: "Effacer",
    effacerAria: "Effacer les produits vus récemment",
  },

  panier: {
    titre: "Votre panier",
    ouvrir: (n: number) => (n > 0 ? `Panier, ${n} ${n > 1 ? "articles" : "article"}` : "Panier, vide"),
    vide: "Votre panier est vide.",
    videTexte: "Les pièces que vous ajoutez se retrouvent ici.",
    retirer: (libelle: string) => `Retirer ${libelle}`,
    retirerCourt: "Retirer",
    parMinimum: (n: number) => `Par ${n} au moins`,
    total: "Total des articles",
    horsLivraison: "Livraison en sus, réglée à la remise.",
    /** Le seuil de la livraison offerte atteint : le pied le dit comme la jauge. */
    livraisonComprise: "Livraison offerte.",
    continuer: "Continuer mes achats",
    fermer: "Fermer le panier",
    ajoute: "Ajouté au panier",
    /** La confirmation légère qui suit un ajout (au lieu du tiroir). */
    voir: (n: number) => `Voir le panier (${n})`,
    fermerConfirmation: "Fermer la confirmation",
    quantiteFois: (n: number) => `× ${n}`,
    titreCompte: (n: number) => `Panier (${n})`,
    resteAvantGratuite: (montant: string) => `Plus que ${montant} pour la livraison offerte.`,
    gratuiteAtteinte: "La livraison vous est offerte.",
    commander: "Commander",
  },

  /** Le tunnel de commande (paiement à la livraison) et sa page de fin. Les
   *  frais, délais, zones et montants arrivent en paramètre : ils viennent
   *  de la base (devis_commande, commande_suivie). */
  connexion: {
    canaux: "Recevoir le code par",
    parSms: "SMS",
    parEmail: "E-mail",
    email: "Adresse e-mail",
    emailExemple: "vous@exemple.tn",
    emailInvalide: "Adresse e-mail illisible, par exemple leila@exemple.tn.",
    aideEmail: "Un code vous est envoyé à cette adresse. Elle vous sert ensuite de compte dans cette boutique, sans mot de passe.",
    codeEnvoyeEmail: (email: string) => `Code envoyé à ${email}. Il n'arrive pas ? Regardez dans les courriers indésirables.`,
    codeEmail: "Code reçu par e-mail",
    modifierEmail: "Modifier l'adresse",
    codeIncorrectEmail: "Code incorrect ou expiré. Vérifiez l'e-mail, ou demandez un nouveau code.",
    emailEchec: "L'e-mail n'a pas pu partir. Réessayez dans un instant.",
    connecteEmail: (email: string) => `Adresse confirmée : ${email}`,
    changerEmail: "Changer d'adresse",
    aConfirmer: (v: Verification) =>
      v === "sms"
        ? "Confirmez votre numéro avec le code reçu par SMS."
        : v === "email"
          ? "Confirmez votre adresse e-mail avec le code reçu."
          : "Confirmez votre numéro ou votre adresse e-mail avec le code reçu.",
    telephoneAideEmail: "Le livreur vous appelle sur ce numéro. La boutique le confirme d'un appel avant l'envoi.",
    telephoneDemande: "Votre numéro de téléphone",
    telephoneDemandeAide: "La boutique vous rappelle sur ce numéro. Il ne sert qu'à cela.",
    reconnexion: (v: Verification) =>
      v === "sms" ? "Votre session a expiré. Confirmez de nouveau votre numéro." : "Votre session a expiré. Reconnectez-vous avec un nouveau code.",
  },

  commande: {
    titre: "Commande",
    rassurance: "Vous ne payez rien en ligne : vous réglez au livreur, à la remise du colis.",
    rassuranceRetrait: "Vous ne payez rien en ligne : vous réglez au livreur, ou au comptoir du magasin.",
    retourPanier: "Modifier le panier",
    panierVide: "Votre panier est vide.",
    panierVideTexte: "Ajoutez des articles avant de commander.",
    expressChapo: "Cet article seul, payé à la livraison : votre panier n'est pas touché.",
    expressIndisponible: "Cet article ne peut pas être commandé pour l'instant.",
    expressRetour: "Revenir au catalogue",
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
    supplementPoids: (poids: string) => `dont supplément poids (${poids})`,
    total: "Total",
    ttc: "TTC",
    quantite: (n: number) => `Quantité : ${n}`,
    indisponible: "N'est plus disponible.",
    reste: (n: number) => `Il n'en reste que ${n}.`,
    sousMinimum: (n: number) => `Se commande par ${n} au moins.`,
    ajuster: (n: number) => `Passer à ${n}`,
    retirer: "Retirer",
    calcul: "Calcul du total",

    confirmer: "Confirmer la commande",
    envoi: "Envoi de la commande",
    aCorriger: "Quelques informations manquent : elles sont signalées ci-dessous.",
    horsLigne: "La connexion a été coupée. Réessayez : votre commande ne sera pas passée deux fois.",
    totalChange: "Un prix ou un frais a changé. Vérifiez le nouveau total, puis confirmez.",
    relancePaniers: "Si vous ne finissez pas votre commande, la boutique pourra vous écrire une fois pour vous la rappeler.",
    stockChange: "Un article n'est plus disponible dans la quantité demandée. Ajustez le récapitulatif.",
    minimumNonAtteint: "Un article se commande par lot : sa quantité est sous le minimum. Ajustez le récapitulatif.",
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

  /** Les codes promo (module promotions), au tunnel et sur la page de fin. */
  promo: {
    ouvrir: "Vous avez un code promo ?",
    libelle: "Code promo",
    appliquer: "Appliquer",
    verification: "Vérification du code",
    retirer: "Retirer le code",
    retirerCourt: "Retirer",
    ligne: (code: string) => `Code ${code}`,
    offre: (type: string | null, valeur: number | null, montant: (m: number) => string) =>
      type === "pourcentage" ? `−${valeur} %` : type === "montant" ? `−${montant(valeur ?? 0)}` : "Livraison offerte",
    economie: (montant: string) => `Vous économisez ${montant}.`,
    /** Un montant fixe : il se lit déjà sur la pastille. */
    deduit: "Déduits de vos articles.",
    livraisonOfferte: "La livraison vous est offerte.",
    livraisonAttente: "La livraison vous sera offerte : il reste à choisir votre gouvernorat.",
    raisons: {
      inconnu: "Ce code n'existe pas dans cette boutique : vérifiez qu'il est bien écrit.",
      coupe: "Ce code n'est plus valable.",
      pas_encore: (jour: string) => `Ce code sera valable à partir du ${jour}.`,
      expire: "Ce code a expiré.",
      devis: "Un code promo ne s'applique pas à un devis : son prix est déjà négocié.",
      epuise: "Ce code a déjà servi autant de fois que prévu.",
      deja: "Vous avez déjà utilisé ce code : il vaut une fois par client.",
      minimum: (minimum: string, manque: string) => `Ce code vaut dès ${minimum} d'achat : il vous manque ${manque}.`,
      retrait: "Le retrait en magasin est déjà gratuit : ce code n'a rien à offrir ici.",
      offerte: "La livraison vous est déjà offerte : gardez ce code pour une autre fois.",
    },
    /** Refusé à la commande (sa limite atteinte entre-temps, déjà servi pour ce numéro). */
    refuseCommande: (raison: string) => `${raison.replace(/[.\s]*$/, "")}. Le total est recalculé sans lui : vérifiez-le, puis confirmez.`,
  },

  pro: {
    badge: "Pro",
    invitationTitre: "Vous êtes un professionnel ?",
    invitationTexte: "Plombier, électricien, artisan : demandez un compte pro. Une fois validé par la boutique, vos prix professionnels s'affichent sur les fiches, au panier et à la commande.",
    demander: "Demander un compte pro",
    formulaireTitre: "Votre entreprise",
    modifierTitre: "Compléter ma demande",
    raisonSociale: "Raison sociale",
    raisonExemple: "Ex. Plomberie Ben Salem",
    raisonRequise: "Indiquez le nom de votre entreprise.",
    matricule: "Matricule fiscal",
    metier: "Métier",
    metierExemple: "Ex. Plombier",
    message: "Un mot pour la boutique",
    messageExemple: "Ex. Je travaille sur des chantiers à Sfax, surtout du sanitaire.",
    envoyer: "Envoyer la demande",
    envoi: "Envoi…",
    annuler: "Annuler",
    erreur: "La demande n'a pas pu être envoyée. Réessayez dans un instant.",
    envoyee: "Demande envoyée : la boutique l'examine et vous répond ici.",
    demandeTitre: "Demande de compte pro envoyée",
    demandeTexte: (le: string) => `Envoyée le ${le} : la boutique l'examine et vous répond ici.`,
    modifier: "Compléter",
    valideTitre: "Compte professionnel",
    valideTexte: (raison: string) => `${raison} : vos prix pro s'affichent sur les fiches, au panier et à la commande.`,
    refuseTitre: "Compte pro non ouvert",
    refuseTexte: (motif: string | null) => `La boutique n'a pas ouvert de compte pro${motif ? ` : ${motif}` : "."}`,
    retireTexte: (motif: string | null) => `Votre compte pro a été fermé${motif ? ` : ${motif}` : "."}`,
    redemander: "Refaire une demande",
    prixPro: "Votre prix pro",
    prixPublic: "Prix public",
    economie: (montant: string) => `Vous économisez ${montant}`,
    tarifApplique: "Tarif professionnel appliqué",
  },

  devis: {
    demander: "Demander un devis",
    demanderAide: "Chantier, grosse quantité : la boutique vous fait un prix.",
    titre: "Demande de devis",
    meta: "Demande de devis",
    chapo: "Envoyez votre panier à la boutique : elle chiffre chaque article, les frais de livraison, et vous répond dans « Mes commandes ».",
    panierVide: "Votre panier est vide.",
    panierVideTexte: "Ajoutez les articles de votre chantier, puis revenez demander votre devis.",
    articles: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    prixIndicatif: "Prix catalogue, à titre indicatif",
    connexionTitre: (v: Verification) => (v === "sms" ? "Votre numéro, pour recevoir la réponse" : "Connectez-vous, pour recevoir la réponse"),
    connexionTexte: (v: Verification) =>
      v === "sms"
        ? "Un code vous est envoyé par SMS : le devis arrive dans « Mes commandes », à ce numéro."
        : v === "email"
          ? "Un code vous est envoyé par e-mail : le devis arrive dans « Mes commandes »."
          : "Un code vous est envoyé par SMS ou par e-mail, au choix : le devis arrive dans « Mes commandes ».",
    message: "Votre chantier, vos délais",
    messageAide: "Facultatif : la ville du chantier, la date souhaitée, une précision sur un article.",
    messageExemple: "Ex. Rénovation de deux salles de bains à Sfax, livraison la semaine prochaine.",
    envoyer: "Envoyer la demande de devis",
    envoi: "Envoi…",
    envoyee: (numero: string) => `Demande ${numero} envoyée`,
    envoyeeTexte: "La boutique chiffre votre devis et vous répond dans « Mes commandes » (souvent par un appel ou un message WhatsApp).",
    voirMesDevis: "Voir mes devis",
    erreur: "La demande n'a pas pu être envoyée. Réessayez dans un instant.",
    mesDevis: "Mes devis",
    statut: {
      demande: "En cours de chiffrage",
      envoye: "Prêt",
      accepte: "Accepté",
      refuse: "Retiré",
      annule: "Annulé par la boutique",
      expire: "Expiré",
    } as Record<string, string>,
    demandeLe: (date: string) => `Demandé le ${date}`,
    valableJusquau: (date: string) => `Valable jusqu'au ${date}`,
    expireLe: (date: string) => `N'est plus valable depuis le ${date}`,
    livraisonOfferte: "Livraison offerte",
    livraisonSelon: "Livraison selon le gouvernorat",
    livraison: "Livraison",
    total: "Total du devis",
    noteBoutique: "Le mot de la boutique",
    accepter: "Accepter et commander",
    refuser: "Refuser",
    retirer: "Retirer ma demande",
    motifRefus: "Pourquoi ? (facultatif)",
    confirmerRefus: "Confirmer",
    annuler: "Annuler",
    commande: (numero: string) => `Commande ${numero}`,
    tunnelTitre: (numero: string) => `Accepter le devis ${numero}`,
    tunnelChapo: "Les prix et les frais sont ceux du devis ; vous réglez à la livraison, ou au comptoir.",
    tarif: (numero: string) => `Prix du devis ${numero}`,
    indisponible: "Ce devis ne peut plus être accepté ici.",
    connexionAccepterTitre: "Votre devis vous attend",
    connexionAccepterTexte: (v: Verification) =>
      v === "sms"
        ? "Il est rattaché au numéro qui l'a demandé : un code par SMS, et il s'ouvre ici, prêt à accepter."
        : "Il est rattaché au compte qui l'a demandé : connectez-vous de la même façon, et il s'ouvre ici, prêt à accepter.",
  },
  compte: {
    titre: "Mes commandes",
    lien: "Mes commandes",
    meta: "Mes commandes",
    chapo: (v: Verification) =>
      v === "sms" ? "Toutes les commandes passées avec votre numéro, et où elles en sont." : "Toutes les commandes passées avec votre compte, et où elles en sont.",
    connexionTitre: "Retrouvez vos commandes",
    connexionTexte: (v: Verification) =>
      v === "sms"
        ? "Saisissez le numéro avec lequel vous avez commandé : un code vous est envoyé par SMS."
        : v === "email"
          ? "Saisissez l'adresse e-mail avec laquelle vous avez commandé : un code vous y est envoyé."
          : "Connectez-vous comme à votre commande, par SMS ou par e-mail : un code vous est envoyé.",
    connecte: (telephone: string) => `Connecté avec le ${telephone}`,
    connecteEmail: (email: string) => `Connecté avec ${email}`,
    deconnexion: "Se déconnecter",
    chargement: "Chargement de vos commandes",
    erreur: "Vos commandes n'ont pas pu être chargées. Réessayez dans un instant.",
    aucune: "Aucune commande pour le moment.",
    aucuneTexte: "Les commandes passées avec ce numéro s'afficheront ici.",
    passeeLe: (date: string) => `Passée le ${date}`,
    articles: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    livraisonA: (lieu: string) => `Livraison à ${lieu}`,
    retraitA: (lieu: string) => `À retirer : ${lieu}`,
    retireeA: (lieu: string) => `Retirée au magasin : ${lieu}`,
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
    /** La frise de suivi d'une commande en cours ou livrée. */
    friseAria: "Où en est la commande",
    frise: ["Reçue", "Confirmée", "Expédiée", "Livrée"],
    friseRetrait: ["Reçue", "Confirmée", "Prête", "Retirée"],
  },

  sav: {
    lienPied: "Garantie et SAV",
    titre: "Garantie et service après-vente",
    meta: "Garantie et service après-vente",
    chapo: "Un article livré qui ne fonctionne pas comme il devrait : dites-le à la boutique, elle vous rappelle.",
    garantieDuree: (mois: number) =>
      `Les articles vendus par la boutique sont garantis ${mois} mois à compter de la livraison, en plus de la garantie légale.`,
    garantieLegale: "Les articles bénéficient de la garantie légale et, le cas échéant, de la garantie du fabricant.",
    commentTitre: "Faire une demande",
    etapes: [
      "Ouvrez « Mes commandes », connecté comme lors de votre commande (numéro ou adresse e-mail) : un code vous est envoyé.",
      "Sur la commande livrée, choisissez l'article et dites ce qui ne va pas — avec son numéro de série si vous l'avez.",
      "La boutique vous rappelle pour convenir de la suite : dépôt, réparation, échange ou remboursement.",
    ],
    preparerTitre: "À garder sous la main",
    preparer: [
      "le numéro de la commande (il figure sur « Mes commandes ») ;",
      "le numéro de série, s'il y en a un : sur l'étiquette de l'article (sous une machine, dans une valise) ;",
      "une photo du problème, si la boutique vous la demande.",
    ],
    faireDemande: "Faire une demande",
    ailleurs: "Vous pouvez aussi joindre la boutique :",
    // Mes commandes
    signaler: "Un problème avec un article ?",
    formulaireTitre: "Signaler un problème",
    quelArticle: "Quel article ?",
    serie: "Numéro de série",
    serieAide: "S'il y en a un, sur l'étiquette de l'article.",
    probleme: "Ce qui ne va pas",
    problemeAide: "Depuis quand, dans quelles circonstances. 10 caractères au moins.",
    problemeInvalide: "Décrivez le problème en quelques mots (10 caractères au moins).",
    envoyer: "Envoyer la demande",
    envoi: "Envoi…",
    annuler: "Annuler",
    envoyee: (numero: string) => `Demande ${numero} envoyée : la boutique vous rappelle pour convenir de la suite.`,
    erreur: "La demande n'a pas pu partir. Réessayez dans un instant.",
    mesDemandes: "Mes demandes de service après-vente",
    surCommande: (commande: string) => `Commande ${commande}`,
    statut: {
      nouvelle: "Reçue : la boutique vous rappelle",
      en_cours: "En cours de traitement",
      resolue: "Résolue",
      refusee: "Non prise en charge",
    } as Record<string, string>,
    issue: {
      reparation: "réparé", echange: "échangé", remboursement: "remboursé", conseil: "conseil donné", autre: "",
      hors_garantie: "hors garantie", mauvaise_utilisation: "usage non couvert", non_constate: "défaut non constaté",
    } as Record<string, string>,
    enCoursSurArticle: (numero: string) => `demande ${numero} en cours`,
    garantieTexte: "Un souci ? Signalez-le depuis « Mes commandes » : la boutique vous rappelle.",
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
    laBoutique: "La boutique",
    reseaux: "Nos réseaux",
    suivreCommande: "Suivre ma commande",
    reseauAria: (reseau: string, compte: string) => `${reseau} — ${compte} (nouvel onglet)`,
    paiement: "Paiement",
    livraison: "Livraison",
    especes: "Espèces à la livraison",
    carte: "Carte bancaire",
    edinar: "e-Dinar",
    enLigne: "Paiement en ligne avec Konnect",
    livrePar: (transporteur: string) => `Livré par ${transporteur}`,
    retraitA: (ville: string) => `Retrait au magasin, à ${ville}`,
  },

  contact: {
    titre: "Contact",
    etiquette: "Nous écrire, nous appeler",
    chapo: (nom: string) => `Une question sur une pièce, une commande ou une livraison ? ${nom} vous répond.`,
    telephone: "Téléphone",
    appeler: "Appeler",
    whatsapp: "WhatsApp",
    ecrireWhatsapp: "Écrire sur WhatsApp",
    reponseWhatsapp: "Le plus rapide : une réponse dans la journée.",
    messageWhatsapp: (nom: string) => `Bonjour ${nom}, j'ai une question : `,
    email: "E-mail",
    ecrire: "Écrire un e-mail",
    horaires: "Horaires",
    adresse: "Adresse",
    magasin: "Le magasin",
    itineraire: "Voir l'itinéraire",
    reseaux: "Sur les réseaux",
    suivi: "Où en est ma commande ?",
    suiviTexte: "Son numéro et votre téléphone suffisent : aucun compte n'est demandé.",
  },

  /** Le lien d'une relance de panier (app/_b/[boutique]/panier/[id]). */
  reprise: {
    etiquette: "Votre panier",
    titre: "Votre panier vous attend",
    chapo: (boutique: string) => `Les pièces que vous aviez choisies chez ${boutique}, à leur prix d'aujourd'hui.`,
    reprendre: "Reprendre ma commande",
    plusDisponible: "Plus disponible",
    epuiseTitre: "Ces pièces ne sont plus disponibles",
    epuiseChapo: "Depuis votre visite, elles sont parties. D'autres vous attendent au catalogue.",
    prixDuJour: "Les prix et la livraison sont relus au moment de commander.",
    perdu: "Ce panier n'est plus gardé",
    perduTexte: "Il a peut-être été commandé, ou il date de plus de 60 jours. La boutique vous attend.",
    catalogue: "Voir le catalogue",
  },

  /** Les favoris (lib/favoris.ts, app/_b/[boutique]/favoris). */
  favoris: {
    titre: "Mes favoris",
    chapo: "Les pièces que vous avez aimées, à leur prix et leur stock d'aujourd'hui.",
    lien: "Favoris",
    lienAria: (n: number) => (n ? `Mes favoris, ${n} pièce${n > 1 ? "s" : ""}` : "Mes favoris"),
    ajouter: (nom: string) => `Ajouter aux favoris : ${nom}`,
    retirer: (nom: string) => `Retirer des favoris : ${nom}`,
    videTitre: "Aucun favori pour l'instant",
    videTexte: "Touchez le cœur d'une pièce : elle vous attendra ici, et dans votre compte si vous êtes connecté.",
    catalogue: "Voir le catalogue",
  },

  /** « Prévenez-moi de son retour » (components/AlerteRetour.tsx). */
  alerte: {
    ouvrir: "Prévenez-moi de son retour",
    titre: "Nous vous écrivons dès son retour.",
    telephone: "Votre téléphone",
    email: "Votre adresse e-mail",
    parEmail: "Par e-mail plutôt",
    parTelephone: "Par téléphone plutôt",
    discret: "Il ne sert qu'à ce message, puis il est effacé.",
    envoyer: "Me prévenir",
    envoi: "Un instant…",
    notee: (contact: string, telephone: boolean) => `C'est noté : nous vous prévenons ${telephone ? "au" : "à"} ${contact} dès son retour.`,
    deja: (contact: string) => `C'est déjà noté pour ${contact} : nous vous prévenons dès son retour.`,
    erreur: "La demande n'a pas pu être notée. Réessayez dans un instant.",
    saisieTelephone: "Il manque des chiffres : un numéro tunisien en a huit, par exemple 20 123 456.",
    saisieEmail: "Cette adresse e-mail est incomplète : vous@exemple.tn, par exemple.",
    indisponibleTexte: "Choisissez une autre combinaison, ou laissez-nous un moyen de vous prévenir de son retour.",
    ruptureExpliquee: (valeurs: string) =>
      `${valeurs} : en rupture. Choisissez-la pour qu'on vous prévienne de son retour.`,
  },
  suivi: {
    titre: "Suivre ma commande",
    etiquette: "Sans compte",
    chapo: "Le numéro de la commande — dans le message de confirmation — et le téléphone qui l'a passée suffisent.",
    numero: "Numéro de commande",
    numeroAide: (exemple: string) => `Par exemple ${exemple}`,
    telephone: "Téléphone",
    chercher: "Voir où elle en est",
    recherche: "Recherche…",
    introuvable: "Aucune commande ne correspond à ce numéro et à ce téléphone. Vérifiez l'un et l'autre, ou appelez la boutique.",
    erreur: "Le suivi ne répond pas pour l'instant. Réessayez dans un moment.",
    compte: "Vous avez un compte ? Toutes vos commandes sont dans « Mes commandes ».",
    autre: "Suivre une autre commande",
  },

  pages: {
    miseAJour: (date: string) => `Mise à jour le ${date}`,
    questionsAide: "Vous ne trouvez pas votre réponse ?",
    ecrireNous: "Écrivez-nous",
  },

  /* L'aperçu d'un brouillon d'apparence, ouvert hors du backoffice. */
  apercu: {
    bandeau: "Aperçu du brouillon : les visiteurs voient encore la version publiée.",
    quitter: "Quitter l'aperçu",
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

  /* Les e-mails : ceux que reçoivent l'acheteur (au nom de la boutique) et
     l'équipe (au nom de la plateforme). Sujets courts, un seul geste par
     e-mail, jamais de publicité. */
  courriels: {
    plateforme: "SkanEcom",
    code: {
      sujet: (marque: string) => `Votre code de connexion — ${marque}`,
      apercu: (code: string) => `${code} : votre code pour vous connecter.`,
      titre: "Votre code de connexion",
      texte: (marque: string) => `Voici le code pour vous connecter à ${marque} et suivre vos commandes.`,
      consigne: "Tapez ces six chiffres sur la page où vous l'avez demandé.",
      legende: "À usage unique · ne le communiquez à personne",
    },
    invitation: {
      sujet: (marque: string) => `Votre accès à ${marque}`,
      apercu: "Choisissez votre mot de passe pour entrer.",
      titre: (marque: string) => `Votre accès à ${marque}`,
      texte: "Choisissez votre mot de passe : vous entrez ensuite, et réglez la double authentification si votre rôle la demande.",
      bouton: "Choisir mon mot de passe",
    },
    motDePasse: {
      sujet: (marque: string) => `Nouveau mot de passe — ${marque}`,
      apercu: "Le lien pour choisir un nouveau mot de passe.",
      titre: "Choisir un nouveau mot de passe",
      texte: "Vous avez demandé à changer de mot de passe. Le lien ci-dessous vous y mène.",
      bouton: "Choisir un nouveau mot de passe",
    },
    changementEmail: {
      sujet: (marque: string) => `Confirmez votre nouvelle adresse — ${marque}`,
      apercu: (code: string) => `${code} : le code pour confirmer votre nouvelle adresse.`,
      titre: "Confirmez votre nouvelle adresse",
      texte: "Tapez ce code sur la page où vous avez changé d'adresse e-mail.",
      legende: "À usage unique · ne le communiquez à personne",
    },
    lettre: {
      sujet: (marque: string) => `Confirmez votre inscription à la lettre — ${marque}`,
      apercu: "Un clic pour confirmer : rien ne vous sera envoyé avant.",
      titre: "Confirmez votre inscription",
      texte: (marque: string) => `Vous avez demandé à recevoir la lettre de ${marque}. Confirmez d'un clic, et elle vous arrivera.`,
      bouton: "Confirmer mon inscription",
      validite: "Ce lien vaut sept jours. Sans confirmation, votre adresse est effacée.",
      desinscrire: "Vous changerez d'avis ? Ce même lien vous désinscrit, à tout moment.",
      ignorer: "Vous n'avez rien demandé ? Ignorez ce message : sans votre clic, vous ne recevrez rien.",
      dejaSujet: (marque: string) => `Vous êtes déjà inscrit à la lettre — ${marque}`,
      dejaApercu: "Rien à faire : votre inscription est confirmée.",
      dejaTitre: "Vous êtes déjà inscrit",
      dejaTexte: (marque: string) => `Votre adresse reçoit déjà la lettre de ${marque} : il n'y a rien à faire. Chaque lettre porte le lien pour vous désinscrire.`,
      raison: (marque: string) => `Vous recevez cet e-mail parce que votre adresse a été inscrite à la lettre de ${marque}.`,
    },
    lienSecours: "Le bouton ne s'ouvre pas ? Copiez cette adresse dans votre navigateur :",
    lienUnique: "Ce lien ne sert qu'une fois.",
    ignorer: "Vous n'avez rien demandé ? Ignorez ce message : sans lui, personne ne peut entrer à votre place.",
    raisonAcheteur: (marque: string) => `Vous recevez cet e-mail parce que votre adresse a été saisie sur ${marque}.`,
    raisonEquipe: (marque: string) => `Vous recevez cet e-mail parce qu'un accès à ${marque} a été ouvert à votre adresse.`,
    propulse: "Boutique propulsée par SkanEcom",
  },

  secours: {
    titre: "La boutique revient dans quelques minutes.",
    texte: "En attendant, vous pouvez commander par WhatsApp : le message est déjà prêt avec votre panier.",
    whatsapp: "Commander par WhatsApp",
  },
} as const;
