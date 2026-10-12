-- =====================================================================
-- SkanEcom · jeu de démonstration : ATELIER OCRE (site vitrine, Studio)
-- =====================================================================
-- La boutique de démonstration du site vitrine premium : un studio
-- d'architecture d'intérieur, à Tunis, qui ne vend rien en ligne — il
-- montre ses réalisations et se fait contacter. Structure Studio
-- (migration …_structure_studio), animations expressives, site vitrine
-- (vitrine.site_vitrine) aux prix masqués, formulaire de contact
-- (migration …_demandes_contact) et ses objets.
--
-- Le studio, ses réalisations, ses textes et ses demandes sont FICTIFS :
-- les lieux (La Marsa, Gammarth…) situent des projets qui n'existent pas.
-- Photos : Openverse, CC0 (supabase/fichiers-demo/CREDITS.md), aucune
-- marque reconnaissable, aucune personne, aucun vrai projet.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000006';
  r_res constant uuid := '00000000-0000-4000-8002-000000000601';
  r_caf constant uuid := '00000000-0000-4000-8002-000000000602';
  r_bur constant uuid := '00000000-0000-4000-8002-000000000603';
  r_hot constant uuid := '00000000-0000-4000-8002-000000000604';
begin
  if exists (select 1 from plateforme.boutiques where id = b) then
    return;
  end if;

  insert into plateforme.boutiques (id, slug, nom, statut, langues_actives, demonstration) values
    (b, 'atelier-ocre', 'Atelier Ocre', 'active', '{fr}', true);
  insert into plateforme.domaines (hote, boutique_id, type, principal) values
    ('studio.localhost', b, 'sous_domaine', true);

  insert into public.reglages (boutique_id, cle, valeur) values
    (b, 'commande.prefixe_numero',     '"OCR"'),
    -- Le site vitrine : ni panier ni commande, ni prix ni stock.
    (b, 'vitrine.site_vitrine',        'true'),
    (b, 'vitrine.prix_masques',        'true'),
    (b, 'paiement.cod_actif',          'false'),
    -- Le formulaire de contact et les objets qu'il propose.
    (b, 'vitrine.formulaire_contact',  'true'),
    (b, 'vitrine.contact_sujets',      '"Appartement ou villa\nCuisine ou salle de bains\nCafé, restaurant ou hôtel\nBureaux ou commerce\nAutre projet"'),
    (b, 'contact.telephone',           '"+216 70 000 006"'),
    (b, 'contact.whatsapp',            '"21670000006"'),
    (b, 'contact.instagram',           '"@atelier.ocre"'),
    (b, 'contact.horaires',            '"Du lundi au vendredi, de 9 h à 18 h ; le samedi sur rendez-vous"'),
    (b, 'legal.email',                 '"studio@atelier-ocre.exemple.tn"'),
    (b, 'legal.adresse',               '"La Marsa, Tunis"');

  -- Les domaines (les rayons).
  insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, description_fr, image_chemin, position) values
    (r_res, b, null, 'residentiel',       'Résidentiel',          'Appartements, villas, cuisines et salles de bains : des lieux à vivre.', 'atelier-ocre/rayons/residentiel-1200.webp', 1),
    (r_caf, b, null, 'cafes-restaurants', 'Cafés et restaurants', 'Des salles qui donnent envie de rester, pensées pour ceux qui y travaillent.', 'atelier-ocre/rayons/cafes-restaurants-1200.webp', 2),
    (r_bur, b, null, 'bureaux-commerces', 'Bureaux et commerces', 'Des espaces de travail clairs, où l''on se concentre et où l''on se retrouve.', 'atelier-ocre/rayons/bureaux-commerces-1200.webp', 3),
    (r_hot, b, null, 'hotellerie',        'Hôtellerie',           'Maisons d''hôtes et hôtels : l''accueil d''abord, le calme partout.', 'atelier-ocre/rayons/hotellerie-1200.webp', 4);

  -- Ce qui situe un projet : le lieu et l'année sur la carte, le reste sur sa page.
  insert into public.attributs (id, boutique_id, cle, label_fr, unite, type, filtrable, en_carte, position) values
    ('00000000-0000-4000-8006-000000000601', b, 'lieu',    'Lieu',              null, 'texte',  false, true,  0),
    ('00000000-0000-4000-8006-000000000602', b, 'annee',   'Année',             null, 'texte',  false, true,  1),
    ('00000000-0000-4000-8006-000000000603', b, 'surface', 'Surface',           'm²', 'nombre', false, false, 2),
    ('00000000-0000-4000-8006-000000000604', b, 'mission', 'Mission',           null, 'texte',  false, false, 3),
    ('00000000-0000-4000-8006-000000000605', b, 'duree',   'Durée du chantier', null, 'texte',  false, false, 4);
  insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
  select b, c.id, a.id
    from public.categories c cross join public.attributs a
   where c.boutique_id = b and a.boutique_id = b;

  insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, mis_en_avant, position) values
    ('00000000-0000-4000-8003-000000000601', b, r_res, 'appartement-la-marsa', 'Un appartement face à la mer, à La Marsa',
     $t$Un appartement des années 1980, cloisonné et sombre, rendu à la lumière de la mer. Nous avons ouvert la cuisine sur le séjour, déplacé la salle de bains pour libérer la façade, et choisi des matières qui supportent le sel : chaux, chêne huilé, pierre claire.

Les rangements disparaissent dans les murs, dessinés sur mesure et fabriqués par un menuisier de Ben Arous : le séjour garde toute sa largeur, et la vue toute la place.$t$, null, null, true, true, 1),
    ('00000000-0000-4000-8003-000000000602', b, r_res, 'villa-gammarth', 'Une villa contemporaine à Gammarth',
     $t$Une maison neuve, de grands volumes, une famille de cinq : il fallait que chacun y trouve sa place sans que la maison perde son calme. Une longue table réunit tout le monde, les chambres s'ouvrent sur le jardin, la salle de bains regarde le ciel.

Nous avons dessiné l'intérieur, l'éclairage et le mobilier fixe, et suivi le chantier jusqu'aux dernières finitions.$t$, null, null, true, true, 2),
    ('00000000-0000-4000-8003-000000000603', b, r_res, 'duplex-carthage', 'Un duplex lumineux à Carthage',
     $t$Deux niveaux qui ne se parlaient pas : un escalier sombre, une cuisine fermée, des pièces trop petites. Nous avons ouvert le séjour, dessiné un îlot en bois de frêne et réchauffé la chambre d'un mur en lames de chêne.

Un projet mené pendant que la famille habitait les lieux, par étapes, sans jamais couper l'eau plus d'une journée.$t$, null, null, true, true, 3),
    ('00000000-0000-4000-8003-000000000604', b, r_caf, 'cafe-mutuelleville', 'Un café de quartier à Mutuelleville',
     $t$Un ancien local commercial devenu le café du quartier : du blanc, du bois, des banquettes où l'on reste. Le comptoir est placé pour que le service voie toute la salle ; les tables se déplacent pour les soirées.

Nous avons conçu la salle, le comptoir et l'éclairage, et coordonné les travaux pour une ouverture en trois mois.$t$, null, null, true, true, 4),
    ('00000000-0000-4000-8003-000000000605', b, r_hot, 'maison-hotes-sidi-bou-said', 'Une maison d''hôtes à Sidi Bou Saïd',
     $t$Une maison ancienne, ses arcs blanchis à la chaux et son patio, transformée en huit chambres d'hôtes. Nous avons gardé ce qui faisait son âme — les voûtes, les carreaux, la lumière filtrée — et caché le confort d'aujourd'hui.

Chaque chambre a sa couleur et son mobilier, dessiné avec des artisans de la médina.$t$, null, null, true, true, 5),
    ('00000000-0000-4000-8003-000000000606', b, r_bur, 'bureaux-montplaisir', 'Les bureaux d''une agence à Montplaisir',
     $t$Quatre cents mètres carrés pour une agence de conseil qui grandit : des postes au calme près des fenêtres, des salles de réunion vitrées, et un grand salon où l'équipe se retrouve.

Acoustique, éclairage, mobilier : tout a été choisi pour des journées longues, et des bureaux qu'on a envie de rejoindre le matin.$t$, null, null, true, true, 6),
    ('00000000-0000-4000-8003-000000000607', b, r_caf, 'brasserie-berges-du-lac', 'Une brasserie aux Berges du Lac',
     $t$Une grande salle sous de hautes fenêtres en arc, une banquette de cuir qui court le long du mur, un bar en bois sombre. La brasserie se veut chaleureuse le soir et lumineuse le midi.

Nous avons dessiné la salle, le bar et l'éclairage, avec des luminaires fabriqués à Nabeul.$t$, null, null, true, false, 7),
    ('00000000-0000-4000-8003-000000000608', b, r_res, 'cuisine-ennasr', 'Une cuisine sur mesure à Ennasr',
     $t$Une cuisine blanche et bois, pensée pour une famille qui cuisine beaucoup : un plan de travail en continu, des rangements jusqu'au plafond, et une fenêtre enfin dégagée.

Dessinée au millimètre, fabriquée et posée en six semaines par un atelier de la région.$t$, null, null, true, false, 8);

  -- Une déclinaison par projet : le site ne vend rien, ses prix sont masqués.
  insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, position)
  select b, v.produit_id::uuid, v.sku, '{}'::jsonb, 1000, 1, 1
    from (values
      ('00000000-0000-4000-8003-000000000601', 'OCR-01'),
      ('00000000-0000-4000-8003-000000000602', 'OCR-02'),
      ('00000000-0000-4000-8003-000000000603', 'OCR-03'),
      ('00000000-0000-4000-8003-000000000604', 'OCR-04'),
      ('00000000-0000-4000-8003-000000000605', 'OCR-05'),
      ('00000000-0000-4000-8003-000000000606', 'OCR-06'),
      ('00000000-0000-4000-8003-000000000607', 'OCR-07'),
      ('00000000-0000-4000-8003-000000000608', 'OCR-08')
    ) as v(produit_id, sku);

  insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position) values
    (b, '00000000-0000-4000-8003-000000000601', 'atelier-ocre/produits/appartement-la-marsa-1-1600.webp', 'Séjour blanc et lumineux, un canapé bas et de grandes fenêtres', 1),
    (b, '00000000-0000-4000-8003-000000000601', 'atelier-ocre/produits/appartement-la-marsa-2-1600.webp', 'Cuisine blanche ouverte, un îlot et des suspensions', 2),
    (b, '00000000-0000-4000-8003-000000000601', 'atelier-ocre/produits/appartement-la-marsa-3-1600.webp', 'Salle de bains, une baignoire îlot blanche et un sol en grands carreaux', 3),
    (b, '00000000-0000-4000-8003-000000000601', 'atelier-ocre/produits/appartement-la-marsa-4-1600.webp', 'Chambre encadrée de bois, un lit blanc devant un voilage', 4),
    (b, '00000000-0000-4000-8003-000000000602', 'atelier-ocre/produits/villa-gammarth-1-1600.webp', 'Longue table blanche dans une pièce claire et dépouillée', 1),
    (b, '00000000-0000-4000-8003-000000000602', 'atelier-ocre/produits/villa-gammarth-2-1600.webp', 'Salon blanc, canapés en cuir clair et table basse laquée', 2),
    (b, '00000000-0000-4000-8003-000000000602', 'atelier-ocre/produits/villa-gammarth-3-1600.webp', 'Baignoire devant une grande fenêtre ouverte sur la verdure', 3),
    (b, '00000000-0000-4000-8003-000000000602', 'atelier-ocre/produits/villa-gammarth-4-1600.webp', 'Escalier en métal et verre dans un volume blanc', 4),
    (b, '00000000-0000-4000-8003-000000000603', 'atelier-ocre/produits/duplex-carthage-1-1600.webp', 'Séjour au sol blanc, fauteuils gris et grande baie', 1),
    (b, '00000000-0000-4000-8003-000000000603', 'atelier-ocre/produits/duplex-carthage-2-1600.webp', 'Îlot de cuisine en bois et tabourets en fil de métal', 2),
    (b, '00000000-0000-4000-8003-000000000603', 'atelier-ocre/produits/duplex-carthage-3-1600.webp', 'Chambre au mur de lames de bois, éclairée par une niche', 3),
    (b, '00000000-0000-4000-8003-000000000604', 'atelier-ocre/produits/cafe-mutuelleville-1-1600.webp', 'Salle de café blanche, tables rondes et chaises claires', 1),
    (b, '00000000-0000-4000-8003-000000000604', 'atelier-ocre/produits/cafe-mutuelleville-2-1600.webp', 'Une table en bois sous une ampoule nue, un mur en lambris', 2),
    (b, '00000000-0000-4000-8003-000000000604', 'atelier-ocre/produits/cafe-mutuelleville-3-1600.webp', 'Banquette garnie de coussins et petites tables rondes', 3),
    (b, '00000000-0000-4000-8003-000000000605', 'atelier-ocre/produits/maison-hotes-sidi-bou-said-1-1600.webp', 'Galerie d''arcs blanchis à la chaux, des plantes au pied des piliers', 1),
    (b, '00000000-0000-4000-8003-000000000605', 'atelier-ocre/produits/maison-hotes-sidi-bou-said-2-1600.webp', 'Salon de réception lumineux ouvert sur un jardin', 2),
    (b, '00000000-0000-4000-8003-000000000605', 'atelier-ocre/produits/maison-hotes-sidi-bou-said-3-1600.webp', 'Salle de bains aux carreaux vert sombre, un miroir rond éclairé', 3),
    (b, '00000000-0000-4000-8003-000000000605', 'atelier-ocre/produits/maison-hotes-sidi-bou-said-4-1600.webp', 'Canapé bleu pâle près d''une fenêtre, un feuillage au premier plan', 4),
    (b, '00000000-0000-4000-8003-000000000606', 'atelier-ocre/produits/bureaux-montplaisir-1-1600.webp', 'Plateau de bureaux clair, un salon et une longue table de réunion', 1),
    (b, '00000000-0000-4000-8003-000000000606', 'atelier-ocre/produits/bureaux-montplaisir-2-1600.webp', 'Salle de réunion blanche, chaises sombres et parquet en chevrons', 2),
    (b, '00000000-0000-4000-8003-000000000606', 'atelier-ocre/produits/bureaux-montplaisir-3-1600.webp', 'Coin de réunion, une table ronde et un tapis', 3),
    (b, '00000000-0000-4000-8003-000000000606', 'atelier-ocre/produits/bureaux-montplaisir-4-1600.webp', 'Bureau blanc devant une fenêtre ouverte sur les arbres', 4),
    (b, '00000000-0000-4000-8003-000000000607', 'atelier-ocre/produits/brasserie-berges-du-lac-1-1600.webp', 'Salle sous de hautes fenêtres en arc, une banquette sombre', 1),
    (b, '00000000-0000-4000-8003-000000000607', 'atelier-ocre/produits/brasserie-berges-du-lac-2-1600.webp', 'Banquette capitonnée et tables en bois sous une suspension cuivrée', 2),
    (b, '00000000-0000-4000-8003-000000000607', 'atelier-ocre/produits/brasserie-berges-du-lac-3-1600.webp', 'Bar en bois, tables dressées et étagères de bouteilles', 3),
    (b, '00000000-0000-4000-8003-000000000608', 'atelier-ocre/produits/cuisine-ennasr-1-1600.webp', 'Cuisine blanche, un îlot et un sol sombre', 1),
    (b, '00000000-0000-4000-8003-000000000608', 'atelier-ocre/produits/cuisine-ennasr-2-1600.webp', 'Plan de travail clair sous une large fenêtre, des façades en bois', 2),
    (b, '00000000-0000-4000-8003-000000000608', 'atelier-ocre/produits/cuisine-ennasr-3-1600.webp', 'Kitchenette blanche près d''une baie, deux fauteuils sombres', 3);

  update public.produits p set caracteristiques = c.valeurs::jsonb
    from (values
      ('00000000-0000-4000-8003-000000000601', '{"lieu": "La Marsa", "annee": "2025", "surface": "140", "mission": "Rénovation complète", "duree": "5 mois"}'),
      ('00000000-0000-4000-8003-000000000602', '{"lieu": "Gammarth", "annee": "2024", "surface": "320", "mission": "Architecture intérieure et mobilier", "duree": "9 mois"}'),
      ('00000000-0000-4000-8003-000000000603', '{"lieu": "Carthage", "annee": "2024", "surface": "180", "mission": "Aménagement et décoration", "duree": "4 mois"}'),
      ('00000000-0000-4000-8003-000000000604', '{"lieu": "Mutuelleville", "annee": "2025", "surface": "90", "mission": "Conception et suivi de chantier", "duree": "3 mois"}'),
      ('00000000-0000-4000-8003-000000000605', '{"lieu": "Sidi Bou Saïd", "annee": "2023", "surface": "600", "mission": "Rénovation de huit chambres", "duree": "11 mois"}'),
      ('00000000-0000-4000-8003-000000000606', '{"lieu": "Montplaisir", "annee": "2024", "surface": "420", "mission": "Aménagement des espaces de travail", "duree": "5 mois"}'),
      ('00000000-0000-4000-8003-000000000607', '{"lieu": "Les Berges du Lac", "annee": "2023", "surface": "260", "mission": "Salle, bar et éclairage", "duree": "7 mois"}'),
      ('00000000-0000-4000-8003-000000000608', '{"lieu": "Ennasr", "annee": "2025", "surface": "28", "mission": "Cuisine sur mesure", "duree": "6 semaines"}')
    ) as c(produit_id, valeurs)
   where p.boutique_id = b and p.id = c.produit_id::uuid;

  insert into public.themes (boutique_id, code, couleurs, polices, style, textes, sections) values
    (b, 'studio',
     '{"fond": "#F4F0EA", "surface": "#FBF9F6", "surface_2": "#ECE6DC", "filet": "#E2DBD0", "filet_fort": "#CBC1B3", "contour_champ": "#8C8275",
       "encre": "#1C1915", "encre_doux": "#5F574E", "accent": "#9C4E28", "accent_clair": "#E3A274"}',
     '{"titres": "instrument-sans", "texte": "instrument-sans"}',
     '{"coins": "droits", "boutons": "pilule", "cartes": "nues", "photos": "4-5", "titres": "immense", "densite": "aeree", "animations": "expressives"}',
     '{"resume_fr": "Studio d''architecture d''intérieur à Tunis : appartements, villas, cafés, hôtels et bureaux, du premier croquis à la remise des clés.",
       "seo_titre_fr": "Atelier Ocre — architecture d''intérieur à Tunis",
       "catalogue_titre_fr": "Réalisations",
       "catalogue_chapo_fr": "Appartements, villas, cafés, hôtels, bureaux : des lieux pensés pour ceux qui les habitent."}',
     $j$[
       {"type": "hero", "lien": "/catalogue",
        "textes": {"etiquette_fr": "Architecture d'intérieur · Tunis",
                   "titre_fr": "Des lieux\nqui vous\nressemblent.",
                   "chapo_fr": "Appartements, villas, cafés, hôtels : nous dessinons des intérieurs lumineux et durables, faits pour la vie d'ici.",
                   "cta_fr": "Voir les réalisations",
                   "image_alt_fr": "Un salon en contrebas, une longue baie vitrée et des plantes"},
        "image": {"chemin": "atelier-ocre/accueil/ouverture-2400.webp", "chemin_portrait": "atelier-ocre/accueil/ouverture-portrait-1200.webp"}},
       {"type": "texte",
        "textes": {"etiquette_fr": "Le studio",
                   "texte_fr": "Nous partons de la lumière, des matières et de vos habitudes. Chaque projet se dessine à la main, se construit avec des artisans tunisiens, et se livre prêt à vivre."}},
       {"type": "selection", "nombre": 6, "textes": {"etiquette_fr": "Sélection", "titre_fr": "Réalisations\nchoisies"}},
       {"type": "rayons", "textes": {"titre_fr": "Nos domaines"}},
       {"type": "services", "lien": "/contact",
        "textes": {"etiquette_fr": "Ce que nous faisons",
                   "titre_fr": "Du premier croquis\nà la remise des clés.",
                   "chapo_fr": "Un seul interlocuteur, de l'idée au chantier : vous savez toujours où en est votre projet.",
                   "s1_titre_fr": "Architecture d'intérieur", "s1_texte_fr": "Plans, volumes, lumière, matières : un projet complet, dessiné pour votre lieu et votre budget.",
                   "s2_titre_fr": "Rénovation complète", "s2_texte_fr": "Nous coordonnons les corps de métier et suivons le chantier chaque semaine, jusqu'aux finitions.",
                   "s3_titre_fr": "Mobilier sur mesure", "s3_texte_fr": "Cuisines, bibliothèques, dressings : dessinés au millimètre, fabriqués par des ateliers d'ici.",
                   "s4_titre_fr": "Conseil et décoration", "s4_texte_fr": "Une visite, des choix de couleurs, de luminaires et de meubles, pour transformer sans tout refaire.",
                   "cta_fr": "Parlons de votre projet",
                   "image_alt_fr": "Une table ronde en bois sous des suspensions blanches"},
        "image": {"chemin": "atelier-ocre/accueil/services-1200.webp"}},
       {"type": "etapes",
        "textes": {"etiquette_fr": "Comment nous travaillons", "titre_fr": "Notre méthode",
                   "e1_titre_fr": "La rencontre", "e1_texte_fr": "Une première visite, sans engagement : vos envies, vos contraintes, votre budget.",
                   "e2_titre_fr": "L'esquisse", "e2_texte_fr": "Plans, planches d'ambiance et premières matières, à valider ensemble.",
                   "e3_titre_fr": "Le projet", "e3_texte_fr": "Plans détaillés, choix définitifs, devis des artisans : tout est chiffré avant de commencer.",
                   "e4_titre_fr": "Le chantier", "e4_texte_fr": "Nous suivons les travaux chaque semaine, jusqu'à la remise des clés."}},
       {"type": "editorial", "lien": "/le-studio",
        "textes": {"etiquette_fr": "L'atelier",
                   "titre_fr": "Dessiné à Tunis,\nfait par des mains d'ici.",
                   "texte_fr": "Menuisiers, ferronniers, céramistes : nous travaillons avec des artisans tunisiens que nous connaissons depuis des années. Chaque pièce sur mesure est suivie de l'atelier jusqu'à chez vous.",
                   "cta_fr": "Découvrir le studio",
                   "image_alt_fr": "Une salle voûtée blanche, une fenêtre ouverte sur la lumière"},
        "image": {"chemin": "atelier-ocre/accueil/recit-1200.webp"}},
       {"type": "contact",
        "textes": {"etiquette_fr": "Un projet ?", "titre_fr": "Parlons de\nvotre projet.",
                   "chapo_fr": "Racontez-nous votre lieu et vos envies : nous vous rappelons pour fixer une première visite."}}
     ]$j$);

  insert into public.pages_boutique (boutique_id, slug, genre, titre_fr, corps_fr, publie, dans_pied, position) values
    (b, 'le-studio', 'texte', 'Le studio',
$t$Atelier Ocre est un studio d'architecture d'intérieur installé à La Marsa. Nous dessinons des appartements, des villas, des cafés, des hôtels et des bureaux, en Tunisie et pour les Tunisiens de l'étranger qui reviennent s'installer.

## Notre façon de faire
- **Écouter d'abord** : comment vous vivez, ce que vous aimez, ce que vous ne voulez plus.
- **Dessiner à la main**, puis en plans précis : rien ne se décide sans que vous l'ayez vu.
- **Construire avec des artisans d'ici** : menuisiers, ferronniers, céramistes, que nous connaissons et dont nous suivons le travail.
- **Tenir le budget** : chaque devis est relu avec vous avant le premier coup de marteau.

## Travailler avec nous
Une première visite, sans engagement, pour comprendre votre lieu. Puis une esquisse, un projet chiffré, et le suivi du chantier jusqu'à la remise des clés. [Écrivez-nous](/contact) : nous vous rappelons.$t$,
     true, true, 1);
end
$$;

-- ---------------------------------------------------------------------
-- Quelques demandes reçues par le formulaire (fictives), pour que l'écran
-- Demandes du backoffice ne s'ouvre pas vide. Rejouable : rien si la
-- boutique en a déjà.
-- ---------------------------------------------------------------------
do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000006';
begin
  if exists (select 1 from public.demandes_contact where boutique_id = b) then
    return;
  end if;
  insert into public.demandes_contact (boutique_id, rang, numero, nom, telephone, email, sujet, message, produit_slug, produit_nom, page, statut, note, traitee_at, created_at) values
    (b, 1, 'DEM-00001', 'Leïla K.', '+21698000101', null, 'Appartement ou villa',
     'Bonjour, nous venons d''acheter un appartement de 120 m² à La Soukra et voudrions le rénover entièrement avant l''été. Pouvez-vous passer le voir ?',
     null, null, '/', 'traitee', 'Visite faite le 3, esquisse envoyée.', now() - interval '6 days', now() - interval '12 days'),
    (b, 2, 'DEM-00002', 'Karim B.', '+33612000202', 'karim.b@exemple.fr', 'Cuisine ou salle de bains',
     'Nous vivons à Lyon et revenons à Tunis l''an prochain. Votre cuisine à Ennasr nous plaît beaucoup : est-il possible de travailler à distance au début ?',
     'cuisine-ennasr', 'Une cuisine sur mesure à Ennasr', '/produit/cuisine-ennasr', 'en_cours', 'Appel en visio prévu jeudi.', null, now() - interval '2 days'),
    (b, 3, 'DEM-00003', 'Sonia M.', '+21655000303', null, 'Café, restaurant ou hôtel',
     'Je reprends un local de 70 m² à El Menzah pour ouvrir un salon de thé. J''aimerais un rendez-vous pour en parler.',
     null, null, '/contact', 'nouvelle', null, null, now() - interval '3 hours');
end
$$;
