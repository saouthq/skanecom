-- =====================================================================
-- SkanEcom · jeu de démonstration : YASMINE BEAUTÉ (boutique de beauté)
-- =====================================================================
-- Une boutique de démonstration pour la prospection (feuille de route D,
-- « Boutiques de démonstration par métier ») : la beauté et la cosmétique,
-- l'un des premiers métiers du commerce en ligne tunisien. Elle suit le
-- préréglage « Beauté et cosmétique » de la console (migration 58) — le
-- gabarit éditorial, sa palette et ses polices, ses rayons, la contenance et
-- le type de peau — sans passer par lui : l'aperçu en ligne installe ses
-- jeux de démo avant qu'un administrateur n'existe.
--
-- Photos : Openverse, CC0 ou domaine public (supabase/fichiers-demo/
-- CREDITS.md), aucune marque reconnaissable ; les mannequins ne servent
-- qu'à l'ouverture, au récit et à deux rayons, jamais comme photos de
-- clientes. La marque « Yasmine » est fictive.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000004';
begin
  if exists (select 1 from plateforme.boutiques where id = b) then
    return;
  end if;

  insert into plateforme.boutiques (id, slug, nom, statut, langues_actives) values
    (b, 'yasmine-beaute', 'Yasmine Beauté', 'active', '{fr}');
  insert into plateforme.domaines (hote, boutique_id, type, principal) values
    ('beaute.localhost', b, 'sous_domaine', true);

  insert into public.reglages (boutique_id, cle, valeur) values
    (b, 'commande.prefixe_numero',           '"YAS"'),
    (b, 'livraison.frais_fixes_millimes',    '7000'),
    (b, 'livraison.seuil_gratuite_millimes', '150000'),
    (b, 'commande.achat_express',            'true'),
    -- Les réglages du préréglage beauté.
    (b, 'catalogue.favoris',                 'true'),
    (b, 'vitrine.partage',                   'true'),
    (b, 'catalogue.prevenir_retour',         'true'),
    (b, 'contact.telephone',                 '"+216 70 000 004"'),
    (b, 'contact.whatsapp',                  '"21670000004"'),
    (b, 'contact.instagram',                 '"@yasmine.beaute"'),
    (b, 'contact.horaires',                  '"Du lundi au samedi, de 9 h à 18 h"'),
    (b, 'legal.email',                       '"bonjour@yasmine-beaute.exemple.tn"'),
    (b, 'vitrine.whatsapp_flottant',         'true'),
    (b, 'vitrine.annonce',                   '"Livraison offerte dès 150 dinars, partout en Tunisie"');

  insert into public.zones_livraison (id, boutique_id, nom_fr, frais_millimes, delai_jours_min, delai_jours_max, position) values
    ('00000000-0000-4000-8001-000000000041', b, 'Grand Tunis',         7000, 1, 2, 1),
    ('00000000-0000-4000-8001-000000000042', b, 'Reste de la Tunisie', 7000, 2, 4, 2);
  insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
  select b, g.code,
         case when g.code in ('tunis', 'ariana', 'ben-arous', 'manouba') then '00000000-0000-4000-8001-000000000041'::uuid
              else '00000000-0000-4000-8001-000000000042'::uuid end
  from public.gouvernorats g;

  -- Les rayons du préréglage beauté.
  insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, description_fr, image_chemin, position) values
    ('00000000-0000-4000-8002-000000000401', b, null, 'soins-du-visage', 'Soins du visage', 'Sérums et huiles pressées à froid, pour chaque peau.', 'yasmine-beaute/rayons/soins-du-visage-1200.webp', 1),
    ('00000000-0000-4000-8002-000000000402', b, null, 'corps-et-bain',   'Corps et bain',   'Savons à l''huile d''olive, huiles de massage, le rituel du hammam.', 'yasmine-beaute/rayons/corps-et-bain-1200.webp', 2),
    ('00000000-0000-4000-8002-000000000403', b, null, 'cheveux',         'Cheveux',         'Huiles et soins pour des cheveux forts.', 'yasmine-beaute/produits/huile-capillaire-romarin-1200.webp', 3),
    ('00000000-0000-4000-8002-000000000404', b, null, 'maquillage',      'Maquillage',      'Fards, vernis et pinceaux.', 'yasmine-beaute/rayons/maquillage-1200.webp', 4),
    ('00000000-0000-4000-8002-000000000405', b, null, 'parfums',         'Parfums',         'Eaux de parfum aux fleurs de Tunisie.', 'yasmine-beaute/produits/eau-parfum-fleur-blanche-1200.webp', 5),
    ('00000000-0000-4000-8002-000000000406', b, null, 'coffrets',        'Coffrets',        'Des coffrets prêts à offrir.', 'yasmine-beaute/produits/coffret-parfums-1200.webp', 6);

  -- Les caractéristiques du préréglage : la contenance sur les cartes, le type de peau pour les soins.
  insert into public.attributs (id, boutique_id, cle, label_fr, unite, type, filtrable, en_carte, position) values
    ('00000000-0000-4000-8006-000000000401', b, 'contenance',   'Contenance',       'ml', 'nombre', true,  true,  0),
    ('00000000-0000-4000-8006-000000000402', b, 'type_de_peau', 'Type de peau',     null, 'texte',  true,  false, 1),
    ('00000000-0000-4000-8006-000000000403', b, 'ingredients',  'Ingrédients clés', null, 'texte',  false, false, 2),
    ('00000000-0000-4000-8006-000000000404', b, 'fabrication',  'Fabriqué en',      null, 'texte',  true,  false, 3);
  insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
  select b, c.id, a.id
    from public.categories c cross join public.attributs a
   where c.boutique_id = b and a.boutique_id = b
     and (a.cle in ('contenance', 'ingredients', 'fabrication')
          or (a.cle = 'type_de_peau' and c.slug in ('soins-du-visage', 'corps-et-bain')));

  insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, mis_en_avant, position) values
    ('00000000-0000-4000-8003-000000000401', b, '00000000-0000-4000-8002-000000000401', 'serum-eclat-vitamine-c', 'Sérum éclat à la vitamine C',
     'Vitamine C stabilisée et acide hyaluronique, dans un flacon ambré qui la protège de la lumière. Quelques gouttes le matin, avant la crème.', 'Yasmine', null, true, true, 1),
    ('00000000-0000-4000-8003-000000000402', b, '00000000-0000-4000-8002-000000000401', 'huile-figue-de-barbarie', 'Huile de figue de Barbarie',
     'Pressée à froid à partir des pépins de figue de Barbarie de Kasserine. Riche en vitamine E, elle nourrit les peaux sèches et matures.', 'Yasmine', null, true, true, 2),
    ('00000000-0000-4000-8003-000000000403', b, '00000000-0000-4000-8002-000000000401', 'huile-calendula', 'Huile de calendula',
     'Macérat de fleurs de calendula dans l''huile d''olive : apaise les peaux sensibles et les rougeurs.', 'Yasmine', null, true, false, 3),
    ('00000000-0000-4000-8003-000000000404', b, '00000000-0000-4000-8002-000000000402', 'savon-huile-olive', 'Savon à l''huile d''olive',
     'Saponifié à froid à partir d''huile d''olive de Sfax, séché six semaines. Un pain de 100 g, au parfum de votre choix.', 'Yasmine', null, true, true, 4),
    ('00000000-0000-4000-8003-000000000405', b, '00000000-0000-4000-8002-000000000402', 'huile-essentielle-lavande', 'Huile essentielle de lavande',
     'Lavande fine distillée, quelques gouttes dans le bain ou sur l''oreiller.', 'Yasmine', null, true, false, 5),
    ('00000000-0000-4000-8003-000000000406', b, '00000000-0000-4000-8002-000000000402', 'huile-massage-neroli', 'Huile de massage au néroli',
     'Huile d''amande douce et fleur d''oranger de Nabeul. Pénètre vite, ne laisse pas la peau grasse.', 'Yasmine', null, true, false, 6),
    ('00000000-0000-4000-8003-000000000407', b, '00000000-0000-4000-8002-000000000403', 'huile-capillaire-romarin', 'Huile capillaire au romarin',
     'Romarin, ricin et nigelle : à masser sur le cuir chevelu une heure avant le shampooing.', 'Yasmine', null, true, true, 7),
    ('00000000-0000-4000-8003-000000000408', b, '00000000-0000-4000-8002-000000000404', 'vernis-a-ongles', 'Vernis à ongles',
     'Une couche couvrante, sèche en deux minutes, tient une semaine. Sans formaldéhyde.', 'Yasmine', null, true, false, 8),
    ('00000000-0000-4000-8003-000000000409', b, '00000000-0000-4000-8002-000000000404', 'vernis-irise', 'Vernis irisé',
     'Des reflets qui changent avec la lumière, du violet au vert.', 'Yasmine', null, true, false, 9),
    ('00000000-0000-4000-8003-000000000410', b, '00000000-0000-4000-8002-000000000404', 'palette-fards-18-teintes', 'Palette de fards, 18 teintes',
     'Mats et irisés, des nudes aux couleurs vives, avec son miroir.', 'Yasmine', null, true, false, 10),
    ('00000000-0000-4000-8003-000000000411', b, '00000000-0000-4000-8002-000000000404', 'trousse-pinceaux', 'Trousse de douze pinceaux',
     'Fibres synthétiques douces, manches en bois : teint, yeux, lèvres.', 'Yasmine', null, true, false, 11),
    ('00000000-0000-4000-8003-000000000412', b, '00000000-0000-4000-8002-000000000405', 'eau-de-parfum-fleur-blanche', 'Eau de parfum Fleur blanche',
     'Jasmin de Sidi Bou Saïd, fleur d''oranger et musc blanc. Une tenue d''une journée.', 'Yasmine', null, true, true, 12),
    ('00000000-0000-4000-8003-000000000413', b, '00000000-0000-4000-8002-000000000406', 'coffret-decouverte-parfums', 'Coffret découverte, trois parfums',
     'Trois eaux de parfum de 15 ml, pour trouver la sienne.', 'Yasmine', null, true, false, 13),
    ('00000000-0000-4000-8003-000000000414', b, '00000000-0000-4000-8002-000000000406', 'coffret-savons-hammam', 'Coffret de six savons du hammam',
     'Six savons à l''huile d''olive emballés à la main, rose, lavande et fleur d''oranger.', 'Yasmine', null, true, false, 14),
    ('00000000-0000-4000-8003-000000000415', b, '00000000-0000-4000-8002-000000000405', 'huile-parfumee-jasmin', 'Huile parfumée au jasmin',
     'Le jasmin de Tunis dans une huile de jojoba, sans alcool : une goutte au creux du poignet, il tient jusqu''au soir.', 'Yasmine', null, true, false, 15),
    ('00000000-0000-4000-8003-000000000416', b, '00000000-0000-4000-8002-000000000405', 'diffuseur-fleur-blanche', 'Diffuseur à bâtonnets Fleur blanche',
     'Le parfum de notre eau Fleur blanche pour la maison : huit bâtonnets de rotin, deux mois de parfum.', 'Yasmine', null, true, false, 16),
    ('00000000-0000-4000-8003-000000000417', b, '00000000-0000-4000-8002-000000000401', 'eau-florale-bleuet', 'Eau florale de bleuet',
     'Distillée à la vapeur, sans conservateur ajouté : sur un coton, elle démaquille les yeux et défroisse le regard.', 'Yasmine', null, true, false, 17);

  insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position)
  select b, o.produit_id::uuid, o.cle, o.label, 1
    from (values
      ('00000000-0000-4000-8003-000000000402', 'contenance', 'Contenance'),
      ('00000000-0000-4000-8003-000000000404', 'parfum',     'Parfum'),
      ('00000000-0000-4000-8003-000000000406', 'contenance', 'Contenance'),
      ('00000000-0000-4000-8003-000000000407', 'contenance', 'Contenance'),
      -- La clé « couleur » : la fiche montre des pastilles (application/src/lib/coloris.ts).
      ('00000000-0000-4000-8003-000000000408', 'couleur',    'Teinte'),
      ('00000000-0000-4000-8003-000000000409', 'teinte',     'Teinte'),
      ('00000000-0000-4000-8003-000000000412', 'contenance', 'Contenance'),
      ('00000000-0000-4000-8003-000000000416', 'contenance', 'Contenance')
    ) as o(produit_id, cle, label);

  insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, poids_grammes, position)
  select b, v.produit_id::uuid, v.sku, v.options::jsonb, v.prix, v.stock, v.poids, v.position
    from (values
      ('00000000-0000-4000-8003-000000000401', 'YAS-SER-30',   '{}',                           59000::bigint, 14, 120, 1::smallint),
      ('00000000-0000-4000-8003-000000000402', 'YAS-FIG-15',   '{"contenance": "15 ml"}',      69000::bigint,  9,  80, 1::smallint),
      ('00000000-0000-4000-8003-000000000402', 'YAS-FIG-30',   '{"contenance": "30 ml"}',     119000::bigint,  5, 120, 2::smallint),
      ('00000000-0000-4000-8003-000000000403', 'YAS-CAL-100',  '{}',                           39000::bigint, 12, 180, 1::smallint),
      ('00000000-0000-4000-8003-000000000404', 'YAS-SAV-ROS',  '{"parfum": "Rose"}',           12000::bigint, 30, 110, 1::smallint),
      ('00000000-0000-4000-8003-000000000404', 'YAS-SAV-LAV',  '{"parfum": "Lavande"}',        12000::bigint, 24, 110, 2::smallint),
      ('00000000-0000-4000-8003-000000000404', 'YAS-SAV-FLO',  '{"parfum": "Fleur d''oranger"}', 12000::bigint, 0, 110, 3::smallint),
      ('00000000-0000-4000-8003-000000000405', 'YAS-LAV-10',   '{}',                           29000::bigint, 20,  60, 1::smallint),
      ('00000000-0000-4000-8003-000000000406', 'YAS-NER-100',  '{"contenance": "100 ml"}',     49000::bigint, 10, 180, 1::smallint),
      ('00000000-0000-4000-8003-000000000406', 'YAS-NER-200',  '{"contenance": "200 ml"}',     85000::bigint,  6, 320, 2::smallint),
      ('00000000-0000-4000-8003-000000000407', 'YAS-ROM-50',   '{"contenance": "50 ml"}',      35000::bigint, 15, 110, 1::smallint),
      ('00000000-0000-4000-8003-000000000407', 'YAS-ROM-100',  '{"contenance": "100 ml"}',     59000::bigint,  8, 180, 2::smallint),
      ('00000000-0000-4000-8003-000000000408', 'YAS-VER-GRE',  '{"couleur": "Grenat"}',         15000::bigint, 18,  40, 1::smallint),
      ('00000000-0000-4000-8003-000000000408', 'YAS-VER-ROS',  '{"couleur": "Rose poudré"}',    15000::bigint, 22,  40, 2::smallint),
      ('00000000-0000-4000-8003-000000000408', 'YAS-VER-NUD',  '{"couleur": "Nude"}',           15000::bigint, 16,  40, 3::smallint),
      ('00000000-0000-4000-8003-000000000408', 'YAS-VER-COR',  '{"couleur": "Corail"}',         15000::bigint,  2,  40, 4::smallint),
      ('00000000-0000-4000-8003-000000000409', 'YAS-IRI-AUR',  '{"teinte": "Aurore"}',         19000::bigint, 10,  40, 1::smallint),
      ('00000000-0000-4000-8003-000000000409', 'YAS-IRI-NEB',  '{"teinte": "Nébuleuse"}',      19000::bigint,  7,  40, 2::smallint),
      ('00000000-0000-4000-8003-000000000410', 'YAS-PAL-18',   '{}',                           79000::bigint,  9, 220, 1::smallint),
      ('00000000-0000-4000-8003-000000000411', 'YAS-PIN-12',   '{}',                           95000::bigint,  6, 300, 1::smallint),
      ('00000000-0000-4000-8003-000000000412', 'YAS-PAR-50',   '{"contenance": "50 ml"}',     129000::bigint,  8, 260, 1::smallint),
      ('00000000-0000-4000-8003-000000000412', 'YAS-PAR-100',  '{"contenance": "100 ml"}',    189000::bigint,  4, 420, 2::smallint),
      ('00000000-0000-4000-8003-000000000413', 'YAS-COF-PAR',  '{}',                           99000::bigint,  7, 350, 1::smallint),
      ('00000000-0000-4000-8003-000000000414', 'YAS-COF-SAV',  '{}',                           59000::bigint,  5, 720, 1::smallint),
      ('00000000-0000-4000-8003-000000000415', 'YAS-HPJ-10',   '{}',                           45000::bigint, 12,  60, 1::smallint),
      ('00000000-0000-4000-8003-000000000416', 'YAS-DIF-100',  '{"contenance": "100 ml"}',     69000::bigint,  9, 380, 1::smallint),
      ('00000000-0000-4000-8003-000000000416', 'YAS-DIF-200',  '{"contenance": "200 ml"}',    109000::bigint,  4, 620, 2::smallint),
      ('00000000-0000-4000-8003-000000000417', 'YAS-BLE-200',  '{}',                           25000::bigint, 18, 260, 1::smallint)
    ) as v(produit_id, sku, options, prix, stock, poids, position);

  insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position) values
    (b, '00000000-0000-4000-8003-000000000401', 'yasmine-beaute/produits/serum-eclat-1200.webp',              'Flacon ambré à pipette, étiquette crème', 1),
    (b, '00000000-0000-4000-8003-000000000402', 'yasmine-beaute/produits/huile-figue-barbarie-1200.webp',     'Petit pot d''huile dorée près de fleurs jaunes', 1),
    (b, '00000000-0000-4000-8003-000000000403', 'yasmine-beaute/produits/huile-calendula-1200.webp',          'Flacons d''huile et fleurs de calendula orange', 1),
    (b, '00000000-0000-4000-8003-000000000404', 'yasmine-beaute/produits/savons-huile-olive-1200.webp',       'Trois savons rose, bleu et ocre empilés près d''un gant de crin', 1),
    (b, '00000000-0000-4000-8003-000000000405', 'yasmine-beaute/produits/huile-lavande-1200.webp',            'Petits flacons bouchés de liège et fleurs séchées', 1),
    (b, '00000000-0000-4000-8003-000000000406', 'yasmine-beaute/produits/huile-massage-neroli-1200.webp',     'Flacons ambrés parmi des fleurs blanches', 1),
    (b, '00000000-0000-4000-8003-000000000407', 'yasmine-beaute/produits/huile-capillaire-romarin-1200.webp', 'Flacons ambrés près de fleurs roses et blanches', 1),
    (b, '00000000-0000-4000-8003-000000000408', 'yasmine-beaute/produits/vernis-ongles-1200.webp',            'Une rangée de vernis à ongles, du brun au rose vif', 1),
    (b, '00000000-0000-4000-8003-000000000409', 'yasmine-beaute/produits/vernis-irise-1200.webp',             'Quatre flacons de vernis aux reflets irisés', 1),
    (b, '00000000-0000-4000-8003-000000000410', 'yasmine-beaute/produits/palette-fards-1200.webp',            'Palette de fards colorés et crayons', 1),
    (b, '00000000-0000-4000-8003-000000000411', 'yasmine-beaute/produits/pinceaux-trousse-1200.webp',         'Pinceaux de maquillage dans leur pot', 1),
    (b, '00000000-0000-4000-8003-000000000412', 'yasmine-beaute/produits/eau-parfum-fleur-blanche-1200.webp', 'Flacon de parfum ambré parmi des fleurs blanches', 1),
    (b, '00000000-0000-4000-8003-000000000413', 'yasmine-beaute/produits/coffret-parfums-1200.webp',          'Trois flacons de parfum et des fleurs blanches', 1),
    (b, '00000000-0000-4000-8003-000000000414', 'yasmine-beaute/produits/coffret-savons-1200.webp',           'Savons emballés de papier et de ficelle sur un plateau', 1),
    (b, '00000000-0000-4000-8003-000000000415', 'yasmine-beaute/produits/huile-parfumee-jasmin-1200.webp',    'Petit flacon bouché de liège près d''une fleur jaune et blanche', 1),
    (b, '00000000-0000-4000-8003-000000000416', 'yasmine-beaute/produits/diffuseur-fleur-blanche-1200.webp',  'Diffuseur en verre et ses bâtonnets, une fleur blanche posée devant', 1),
    (b, '00000000-0000-4000-8003-000000000417', 'yasmine-beaute/produits/eau-florale-bleuet-1200.webp',       'Verre d''eau claire et fleurs de bleuet', 1);

  update public.produits p set caracteristiques = c.valeurs::jsonb
    from (values
      ('00000000-0000-4000-8003-000000000401', '{"contenance": "30", "type_de_peau": "Toutes peaux", "ingredients": "Vitamine C stabilisée, acide hyaluronique", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000402', '{"type_de_peau": "Sèches, matures", "ingredients": "Huile de pépins de figue de Barbarie", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000403', '{"contenance": "100", "type_de_peau": "Sensibles", "ingredients": "Calendula, huile d''olive", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000404', '{"type_de_peau": "Toutes peaux", "ingredients": "Huile d''olive, huiles essentielles", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000405', '{"contenance": "10", "ingredients": "Lavande fine", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000406', '{"type_de_peau": "Toutes peaux", "ingredients": "Amande douce, néroli", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000407', '{"ingredients": "Romarin, ricin, nigelle", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000408', '{"contenance": "10", "fabrication": "France"}'),
      ('00000000-0000-4000-8003-000000000409', '{"contenance": "10", "fabrication": "France"}'),
      ('00000000-0000-4000-8003-000000000410', '{"fabrication": "Italie"}'),
      ('00000000-0000-4000-8003-000000000412', '{"ingredients": "Jasmin, fleur d''oranger, musc blanc", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000413', '{"contenance": "45", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000414', '{"ingredients": "Huile d''olive", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000415', '{"contenance": "10", "ingredients": "Jasmin, huile de jojoba", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000416', '{"ingredients": "Jasmin, fleur d''oranger, musc blanc", "fabrication": "Tunisie"}'),
      ('00000000-0000-4000-8003-000000000417', '{"contenance": "200", "type_de_peau": "Sensibles", "ingredients": "Eau florale de bleuet", "fabrication": "Tunisie"}')
    ) as c(produit_id, valeurs)
   where p.boutique_id = b and p.id = c.produit_id::uuid;

  insert into public.themes (boutique_id, code, couleurs, polices, textes, sections) values
    (b, 'editorial', '{"accent": "#A4506F", "fond": "#FBF7F6"}', '{"titres": "young-serif", "texte": "instrument-sans"}',
     '{"resume_fr": "Soins, huiles et parfums faits en Tunisie, aux formules simples. Paiement à la livraison, partout en Tunisie.",
       "seo_titre_fr": "Yasmine Beauté — soins et parfums, paiement à la livraison",
       "origine_fr": "Tunis",
       "politique_retour_fr": "Pour votre sécurité, un produit ouvert ne peut être ni repris ni échangé."}',
     '[{"type": "hero", "lien": "/categorie/soins-du-visage",
        "textes": {"etiquette_fr": "Soins faits en Tunisie",
                   "titre_fr": "La peau,\nau naturel.",
                   "chapo_fr": "Huiles pressées à froid, savons à l''huile d''olive, parfums de fleurs : peu de produits, des formules simples.",
                   "cta_fr": "Découvrir les soins",
                   "image_alt_fr": "Femme qui dépose une goutte de sérum avec une pipette"},
        "image": {"chemin": "yasmine-beaute/accueil/hero-2000.webp", "chemin_portrait": "yasmine-beaute/accueil/hero-portrait-1200.webp"}},
       {"type": "selection", "nombre": 8, "tri": "nouveautes", "textes": {"titre_fr": "Nouveautés"}},
       {"type": "rayons"},
       {"type": "selection", "nombre": 3, "rayon": "parfums", "textes": {"etiquette_fr": "Parfums", "titre_fr": "Le jasmin, la fleur d''oranger"}},
       {"type": "editorial", "lien": "/categorie/corps-et-bain",
        "textes": {"etiquette_fr": "Le rituel",
                   "titre_fr": "Le hammam,\nà la maison.",
                   "texte_fr": "Un savon à l''huile d''olive, une huile de massage, dix minutes pour soi : nos produits se comptent sur les doigts d''une main, et chacun sert à quelque chose.",
                   "cta_fr": "Corps et bain",
                   "image_alt_fr": "Femme en peignoir devant un miroir, des plantes sur la table"},
        "image": {"chemin": "yasmine-beaute/accueil/rituel-1200.webp"}},
       {"type": "selection", "nombre": 3, "rayon": "corps-et-bain", "textes": {"etiquette_fr": "Corps et bain", "titre_fr": "Pour le rituel"}},
       {"type": "avis", "nombre": 6, "textes": {"titre_fr": "Ce qu''en disent nos clientes"}},
       {"type": "engagements"}]');

  -- Les avis clients : le module, et les avis des commandes livrées (plus bas).
  insert into plateforme.modules_actifs (boutique_id, module) values (b, 'avis');
end
$$;

-- ---------------------------------------------------------------------
-- Ce qu'en disent ses clientes : dix commandes livrées de l'automne 2025
-- (YAS-2025-001xx : ni la période du tableau de bord ni l'objectif du
-- mois ne bougent), dix avis vérifiés et publiés, deux réponses de la
-- boutique. Aucune photo de cliente : un avis de démonstration n'est pas
-- celui d'une vraie cliente, et une photo de mannequin n'est jamais
-- présentée comme la sienne. Chaque pièce vendue revient au stock (un
-- arrivage du même jour) : le stock de démonstration ne bouge pas.
-- ---------------------------------------------------------------------
do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000004';
  a          record;
  t0         timestamptz;
  v_variante public.variantes;
  v_client   uuid;
  v_commande uuid;
  v_devis    jsonb;
  v_ligne    public.commande_lignes;
  v_stock    integer;
begin
  if not exists (select 1 from plateforme.boutiques where id = b)
     or exists (select 1 from public.commandes where boutique_id = b and numero like 'YAS-2025-001%') then
    return;
  end if;
  for a in
    select * from (values
      (1,  'Mariem Jlassi',    '+21620444401', 'Tunis',    'tunis',    date '2025-09-04', 'YAS-SER-30',  5,
           'Je l''utilise chaque matin depuis un mois : le teint est plus lumineux, et il ne colle pas sous la crème.', null),
      (2,  'Asma Trabelsi',    '+21620444402', 'Sfax',     'sfax',     date '2025-09-12', 'YAS-FIG-30',  5,
           'Trois gouttes le soir, et ma peau sèche ne tiraille plus au réveil. Le flacon ambré la protège bien.', null),
      (3,  'Sonia Hammami',    '+21620444403', 'Sousse',   'sousse',   date '2025-09-21', 'YAS-SAV-ROS', 4,
           'Il mousse peu mais laisse la peau douce. Le parfum de rose est léger, comme je l''aime.',
           'Merci Sonia ! Saponifié à froid, il garde sa glycérine : c''est elle qui adoucit.'),
      (4,  'Rim Belhadj',      '+21620444404', 'Ariana',   'ariana',   date '2025-10-02', 'YAS-NER-100', 5,
           'La fleur d''oranger me rappelle Nabeul. Elle pénètre vite, je l''utilise après le hammam.', null),
      (5,  'Hela Gharbi',      '+21620444405', 'Nabeul',   'nabeul',   date '2025-10-11', 'YAS-PAR-50',  5,
           'Le jasmin tient toute la journée sans être entêtant. On me demande ce que je porte.', null),
      (6,  'Nour Ben Ali',     '+21620444406', 'Monastir', 'monastir', date '2025-10-23', 'YAS-VER-ROS', 4,
           'Belle teinte, couvrante en deux couches. Il tient cinq jours chez moi, un peu moins que promis.',
           'Merci Nour : une base sous le vernis l''aide à tenir la semaine.'),
      (7,  'Ons Mabrouk',      '+21620444407', 'Bizerte',  'bizerte',  date '2025-11-03', 'YAS-ROM-50',  5,
           'Mes cheveux tombent beaucoup moins depuis deux mois, et l''odeur du romarin est agréable.', null),
      (8,  'Fatma Chaouch',    '+21620444408', 'La Marsa', 'tunis',    date '2025-11-15', 'YAS-COF-SAV', 5,
           'Offert à ma belle-mère : les savons sont emballés à la main, un très joli cadeau.', null),
      (9,  'Imen Sassi',       '+21620444409', 'Kairouan', 'kairouan', date '2025-11-26', 'YAS-BLE-200', 4,
           'Douce pour les yeux, je m''en sers pour démaquiller. Le flacon de 200 ml dure longtemps.', null),
      (10, 'Sarra Jaziri',     '+21620444410', 'Mahdia',   'mahdia',   date '2025-12-06', 'YAS-FIG-15',  5,
           'J''ai commencé par le petit flacon, je reprendrai le grand. Livrée en deux jours jusqu''à Mahdia.', null)
    ) as t(n, nom, tel, ville, gouv, le, sku, note, texte, reponse)
    order by n
  loop
    t0 := a.le + time '19:40';
    select * into v_variante from public.variantes where boutique_id = b and sku = a.sku;
    insert into public.clients (boutique_id, nom, telephone, created_at) values (b, a.nom, a.tel, t0) returning id into v_client;
    v_devis := private.chiffre_commande(b, jsonb_build_array(jsonb_build_object('variante_id', v_variante.id, 'quantite', 1)), a.gouv, false);
    insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
    values (b, 'YAS-2025-' || lpad((100 + a.n)::text, 5, '0'), 'vitrine', v_client, a.nom, a.tel, 'Adresse de démonstration',
            a.ville, a.gouv, v_devis -> 'zone' ->> 'nom_fr',
            (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
            (v_devis ->> 'total_millimes')::bigint, t0)
    returning id into v_commande;
    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
                                        prix_unitaire_millimes, quantite, total_ligne_millimes, created_at)
    select b, v_commande, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle', l ->> 'sku',
           (l ->> 'prix_unitaire_millimes')::bigint, 1, (l ->> 'prix_unitaire_millimes')::bigint, t0
    from jsonb_array_elements(v_devis -> 'lignes') l
    returning * into v_ligne;

    -- Vendue sur un arrivage d'alors : la pièce revient au stock du jour.
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes set stock = stock + 1 where boutique_id = b and id = v_variante.id returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', '', true);
    insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, created_at)
    values (b, v_variante.id, 1, v_stock, 'reception', 'Arrivage de 2025 (jeu de démo)', t0);

    insert into public.confirmations (boutique_id, commande_id, canal, resultat, created_at)
    values (b, v_commande, 'appel', 'confirmee', t0 + interval '14 hours');
    update public.commandes set statut = 'confirmee' where id = v_commande;
    update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (47100000 + a.n * 191) where id = v_commande;
    update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = v_commande;
    update public.commande_evenements e
       set created_at = t0 + case e.statut_apres when 'recue' then interval '0' when 'confirmee' then interval '14 hours'
                                                 when 'expediee' then interval '30 hours' else interval '50 hours' end
     where e.commande_id = v_commande;
    update public.commandes
       set confirmee_at = t0 + interval '14 hours', expediee_at = t0 + interval '30 hours',
           livree_at = t0 + interval '50 hours', cloturee_at = t0 + interval '50 hours'
     where id = v_commande;

    -- L'avis, deux jours après la livraison ; publié le lendemain.
    insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, variante_libelle,
                             statut, modere_le, reponse, repondu_le, created_at)
    values (b, v_variante.produit_id, v_commande, v_ligne.id, v_client, a.note, a.texte,
            private.nom_public(a.nom), v_ligne.variante_libelle, 'publie', t0 + interval '5 days',
            a.reponse, case when a.reponse is not null then t0 + interval '5 days' end, t0 + interval '4 days');
  end loop;
end
$$;
