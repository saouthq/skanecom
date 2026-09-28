/* ============================================================================
   LIBELLÉS — français. SOURCE UNIQUE de tout texte d'interface.

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
    nom: "Maymar",
    accueilAria: "Maymar — accueil",
    resume: "Bagages et accessoires choisis pour durer. Stock réel, livraison dans toute la Tunisie.",
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
  },

  accueil: {
    titreHero: ["Des pièces", "qui tiennent."],
    etiquetteHero: "Bagages et accessoires",
    chapoHero:
      "Une sélection courte, choisie pour durer. Vous voyez le stock réel, vous payez au livreur.",
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
    promesseAvecFrais: (frais: string) =>
      `Paiement à la livraison, partout en Tunisie — livraison ${frais}.`,
    cartouche: "Maison Maymar — Tunis",
    cartel: "Valise rigide quatre roues — une pièce de notre stock, à Tunis.",

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
  },

  catalogue: {
    titre: "Tout le catalogue",
    etiquette: "Toutes les pièces en boutique",
    chapo:
      "Les pièces affichées sont en stock à Tunis : le nombre indiqué est le nombre réel, pas une estimation.",
    filtres: "Filtres",
    affiner: "Affiner",
    filtrer: "Filtrer",
    fermer: "Fermer",
    toutEffacer: "Tout effacer",
    retirerLesFiltres: "Retirer les filtres",
    appliquer: "Voir les résultats",
    rayon: "Rayon",
    couleur: "Couleur",
    taille: "Taille",
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
    aucuneCouleur: "Aucune couleur sélectionnée — toutes affichées",
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
    expeditionTexte:
      "La commande part de Tunis après confirmation. Le livreur vous appelle avant de se présenter.",
    expeditionAvecRappel:
      "On vous appelle d'abord pour confirmer l'adresse et la disponibilité, puis la commande part de Tunis. Le livreur vous appelle avant de se présenter.",
    retourEtRefus: "Retour et refus",
    retourEtRefusTexte:
      "Vous pouvez refuser le colis au moment de la remise, sans motif et sans frais. Après acceptation, un échange reste possible sous 7 jours, article non utilisé.",
    payezALaLivraison: "Vous payez à la livraison",
    payezALaLivraisonTexte: "En espèces, à la main du livreur. Aucune carte n'est demandée.",
    refusPossible: "Refus possible à la remise",
    refusPossibleTexte: "Si l'article ne convient pas, refusez-le au livreur. Rien n'est dû.",
    confirmationTelephonique: "On vous rappelle avant d'expédier",
    confirmationTelephoniqueTexte:
      "Un appel confirme l'adresse et la disponibilité avant la préparation du colis.",
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
    fraisFixes: (frais: string) => `Toute la Tunisie — frais fixes de ${frais}.`,
    fraisParZone: "Les frais dépendent de votre région, calculés au moment de la commande.",
    delai: (min: number, max: number) =>
      min === max
        ? `Livré en ${min} ${min > 1 ? "jours ouvrés" : "jour ouvré"}`
        : `Livré en ${min} à ${max} jours ouvrés`,
    delaiSelonRegion: "selon la région",
  },

  recherche: {
    titre: "Recherche",
    champAria: "Rechercher un produit",
    placeholder: "Une valise, une marque, une matière…",
    lancer: "Rechercher",
    invite: "Tapez ce que vous cherchez : un type de produit, une marque, une matière.",
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
    droits: (annee: number) => `© ${annee} Maymar — Tunis`,
    devise: "Prix en dinars tunisiens (TND), toutes taxes comprises.",
  },

  seo: {
    titreSite: "Maymar",
    gabaritTitre: "%s | Maymar",
    descriptionSite:
      "Bagages et accessoires en stock à Tunis. Paiement à la livraison, partout en Tunisie.",
    accueilTitre: "Maymar — bagages et accessoires, paiement à la livraison",
    catalogueDescription:
      "Le catalogue Maymar : stock réel, prix en dinars, paiement à la livraison partout en Tunisie.",
    produitDescription: (nom: string, prix: string) =>
      `${nom} — ${prix}. En stock à Tunis, paiement à la livraison partout en Tunisie.`,
    rechercheTitre: "Recherche",
  },
} as const;
