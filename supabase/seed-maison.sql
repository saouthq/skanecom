-- =====================================================================
-- SkanEcom · jeu de démonstration : DAR ALIA (maison et décoration)
-- =====================================================================
-- La boutique de démonstration du métier « Maison et décoration »
-- (feuille de route D, pour la prospection). Elle suit le préréglage de la
-- console (migration 58) — le gabarit éditorial, sa palette et ses polices,
-- ses cinq rayons, la matière sur les cartes, les dimensions, l'entretien et
-- le fait main — sans passer par lui : l'aperçu en ligne installe ses jeux
-- de démo avant qu'un administrateur n'existe.
--
-- Photos : Openverse, CC0 ou domaine public (supabase/fichiers-demo/
-- CREDITS.md), aucune marque reconnaissable, aucune pièce de musée
-- présentée comme un article. La marque « Dar Alia » est fictive.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000005';
begin
  if exists (select 1 from plateforme.boutiques where id = b) then
    return;
  end if;

  insert into plateforme.boutiques (id, slug, nom, statut, langues_actives) values
    (b, 'dar-alia', 'Dar Alia', 'active', '{fr}');
  insert into plateforme.domaines (hote, boutique_id, type, principal) values
    ('maison.localhost', b, 'sous_domaine', true);

  insert into public.reglages (boutique_id, cle, valeur) values
    (b, 'commande.prefixe_numero',           '"DAR"'),
    (b, 'livraison.frais_fixes_millimes',    '8000'),
    (b, 'livraison.seuil_gratuite_millimes', '200000'),
    -- Les réglages du préréglage maison.
    (b, 'catalogue.favoris',                 'true'),
    (b, 'vitrine.partage',                   'true'),
    (b, 'contact.telephone',                 '"+216 70 000 005"'),
    (b, 'contact.whatsapp',                  '"21670000005"'),
    (b, 'contact.instagram',                 '"@dar.alia"'),
    (b, 'contact.horaires',                  '"Du lundi au samedi, de 9 h à 19 h"'),
    (b, 'legal.email',                       '"bonjour@dar-alia.exemple.tn"'),
    (b, 'vitrine.whatsapp_flottant',         'true'),
    (b, 'vitrine.annonce',                   '"Livraison offerte dès 200 dinars, partout en Tunisie"');

  insert into public.zones_livraison (id, boutique_id, nom_fr, frais_millimes, delai_jours_min, delai_jours_max, position) values
    ('00000000-0000-4000-8001-000000000051', b, 'Grand Sfax',          8000, 1, 2, 1),
    ('00000000-0000-4000-8001-000000000052', b, 'Reste de la Tunisie', 8000, 2, 4, 2);
  insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
  select b, g.code,
         case when g.code = 'sfax' then '00000000-0000-4000-8001-000000000051'::uuid
              else '00000000-0000-4000-8001-000000000052'::uuid end
  from public.gouvernorats g;

  -- Les rayons du préréglage maison (ceux des luminaires et du rangement reprennent un produit).
  insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, description_fr, image_chemin, position) values
    ('00000000-0000-4000-8002-000000000501', b, null, 'cuisine-et-table', 'Cuisine et table',  'Bois d''olivier, grès et faïence, lin : la table de tous les jours.', 'dar-alia/rayons/cuisine-et-table-1200.webp', 1),
    ('00000000-0000-4000-8002-000000000502', b, null, 'decoration',       'Décoration',        'Bougies coulées à la main et kilims tissés à Kairouan.', 'dar-alia/rayons/decoration-1200.webp', 2),
    ('00000000-0000-4000-8002-000000000503', b, null, 'linge-de-maison',  'Linge de maison',   'Coton lavé et grosse maille, pour la chambre et le salon.', 'dar-alia/rayons/linge-de-maison-1200.webp', 3),
    ('00000000-0000-4000-8002-000000000504', b, null, 'luminaires',       'Luminaires',        'Lampes et photophores, une lumière douce.', 'dar-alia/produits/lampadaire-trepied-1200.webp', 4),
    ('00000000-0000-4000-8002-000000000505', b, null, 'rangement',        'Rangement',         'Vannerie et bocaux : tout a sa place.', 'dar-alia/produits/panier-jonc-1200.webp', 5);

  -- Les caractéristiques du préréglage : la matière sur les cartes, le fait main filtrable.
  insert into public.attributs (id, boutique_id, cle, label_fr, unite, type, filtrable, en_carte, position) values
    ('00000000-0000-4000-8006-000000000501', b, 'matiere',    'Matière',    null, 'texte', true,  true,  0),
    ('00000000-0000-4000-8006-000000000502', b, 'dimensions', 'Dimensions', null, 'texte', false, false, 1),
    ('00000000-0000-4000-8006-000000000503', b, 'entretien',  'Entretien',  null, 'texte', false, false, 2),
    ('00000000-0000-4000-8006-000000000504', b, 'fait_main',  'Fait main',  null, 'texte', true,  false, 3);
  insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
  select b, c.id, a.id
    from public.categories c cross join public.attributs a
   where c.boutique_id = b and a.boutique_id = b;

  insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, mis_en_avant, position) values
    ('00000000-0000-4000-8003-000000000501', b, '00000000-0000-4000-8002-000000000501', 'cuilleres-bois-olivier', 'Cuillères en bois d''olivier, lot de trois',
     'Taillées à Sfax dans des branches d''olivier tombées : le bois est dense, ne garde ni odeur ni couleur. Chaque veinure est unique.', 'Dar Alia', null, true, true, 1),
    ('00000000-0000-4000-8003-000000000502', b, '00000000-0000-4000-8002-000000000501', 'mug-gres-emaille', 'Mug en grès émaillé',
     'Tourné et émaillé à la main à Nabeul : un gris tendre, jamais tout à fait le même d''un mug à l''autre.', 'Dar Alia', null, true, true, 2),
    ('00000000-0000-4000-8003-000000000503', b, '00000000-0000-4000-8002-000000000501', 'tasses-faience-blanche', 'Tasses en faïence blanche, par deux',
     'Une forme droite, une anse généreuse : pour le café du matin comme pour le thé à la menthe.', 'Dar Alia', null, true, false, 3),
    ('00000000-0000-4000-8003-000000000504', b, '00000000-0000-4000-8002-000000000501', 'service-vaisselle-festonne', 'Service de vaisselle festonné, 18 pièces',
     'Six assiettes plates, six creuses, six à dessert, au bord festonné : un service blanc qui va avec tout.', 'Dar Alia', null, true, false, 4),
    ('00000000-0000-4000-8003-000000000505', b, '00000000-0000-4000-8002-000000000501', 'serviettes-table-lin', 'Serviettes de table en lin, par quatre',
     'Lin lavé, ourlets cousus à la main : plus douces à chaque lavage.', 'Dar Alia', null, true, false, 5),
    ('00000000-0000-4000-8003-000000000506', b, '00000000-0000-4000-8002-000000000502', 'bougie-parfumee-pot', 'Bougie parfumée en pot',
     'Cire de soja coulée à la main, quarante heures de parfum, au choix fleur d''oranger, jasmin ou figuier.', 'Dar Alia', null, true, true, 6),
    ('00000000-0000-4000-8003-000000000507', b, '00000000-0000-4000-8002-000000000502', 'bougie-meche-bois', 'Bougie à mèche en bois',
     'Sa mèche en bois crépite doucement comme un feu de cheminée. Un parfum de linge propre.', 'Dar Alia', null, true, false, 7),
    ('00000000-0000-4000-8003-000000000508', b, '00000000-0000-4000-8002-000000000502', 'bougie-ambree-cedre', 'Bougie ambrée au bois de cèdre',
     'Un verre ambré, une note de cèdre et d''ambre : pour les soirées d''hiver.', 'Dar Alia', null, true, false, 8),
    ('00000000-0000-4000-8003-000000000509', b, '00000000-0000-4000-8002-000000000502', 'kilim-tisse-main', 'Kilim tissé main',
     'Tissé à Kairouan sur un métier vertical, en laine de mouton : trois semaines pour le grand format.', 'Dar Alia', null, true, true, 9),
    ('00000000-0000-4000-8003-000000000510', b, '00000000-0000-4000-8002-000000000503', 'housse-coussin-velours', 'Housse de coussin en velours côtelé',
     'Velours de coton côtelé, fermeture cachée : 45 × 45 cm, le coussin n''est pas compris.', 'Dar Alia', null, true, false, 10),
    ('00000000-0000-4000-8003-000000000511', b, '00000000-0000-4000-8002-000000000503', 'taies-oreiller-rayees', 'Taies d''oreiller rayées, par deux',
     'Coton lavé à rayures tissées, fermeture portefeuille.', 'Dar Alia', null, true, false, 11),
    ('00000000-0000-4000-8003-000000000512', b, '00000000-0000-4000-8002-000000000503', 'jete-de-lit-maille', 'Jeté de lit en grosse maille',
     'Tricoté en gros coton : au pied du lit ou sur le canapé.', 'Dar Alia', null, true, false, 12),
    ('00000000-0000-4000-8003-000000000513', b, '00000000-0000-4000-8002-000000000504', 'lampe-chevet-lin', 'Lampe de chevet, abat-jour en lin',
     'Un pied en céramique et un abat-jour en lin plissé : une lumière douce pour lire.', 'Dar Alia', null, true, true, 13),
    ('00000000-0000-4000-8003-000000000514', b, '00000000-0000-4000-8002-000000000504', 'lampadaire-trepied', 'Lampadaire trépied',
     'Trois pieds en bois, un projecteur orientable : 150 cm de haut.', 'Dar Alia', null, true, false, 14),
    ('00000000-0000-4000-8003-000000000515', b, '00000000-0000-4000-8002-000000000504', 'photophores-verre', 'Photophores en verre, lot de trois',
     'Trois verres mercurisés aux reflets d''argent, pour une bougie chauffe-plat : sur la table ou au jardin.', 'Dar Alia', null, true, false, 15),
    ('00000000-0000-4000-8003-000000000516', b, '00000000-0000-4000-8002-000000000505', 'panier-jonc-de-mer', 'Panier en jonc de mer',
     'Tressé à la main à Nabeul : pour les plantes, le linge ou les jouets.', 'Dar Alia', null, true, true, 16),
    ('00000000-0000-4000-8003-000000000517', b, '00000000-0000-4000-8002-000000000505', 'corbeille-osier-anse', 'Corbeille en osier à anse',
     'Osier tressé serré, une anse solide : le panier du marché.', 'Dar Alia', null, true, false, 17),
    ('00000000-0000-4000-8003-000000000518', b, '00000000-0000-4000-8002-000000000505', 'bocal-verre-couvercle', 'Bocal en verre à couvercle',
     'Verre épais, couvercle hermétique : épices, légumes secs, sucre.', 'Dar Alia', null, true, false, 18);

  insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position)
  select b, o.produit_id::uuid, o.cle, o.label, 1
    from (values
      -- La clé « couleur » : la fiche montre des pastilles (application/src/lib/coloris.ts).
      ('00000000-0000-4000-8003-000000000505', 'couleur',    'Couleur'),
      ('00000000-0000-4000-8003-000000000506', 'parfum',     'Parfum'),
      ('00000000-0000-4000-8003-000000000509', 'dimensions', 'Dimensions'),
      ('00000000-0000-4000-8003-000000000510', 'couleur',    'Couleur'),
      ('00000000-0000-4000-8003-000000000516', 'taille',     'Taille'),
      ('00000000-0000-4000-8003-000000000518', 'contenance', 'Contenance')
    ) as o(produit_id, cle, label);

  insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, poids_grammes, position)
  select b, v.produit_id::uuid, v.sku, v.options::jsonb, v.prix, v.stock, v.poids, v.position
    from (values
      ('00000000-0000-4000-8003-000000000501', 'DAR-CUI-3',    '{}',                                45000::bigint, 14,  250, 1::smallint),
      ('00000000-0000-4000-8003-000000000502', 'DAR-MUG-GR',   '{}',                                32000::bigint, 20,  380, 1::smallint),
      ('00000000-0000-4000-8003-000000000503', 'DAR-TAS-2',    '{}',                                39000::bigint, 16,  600, 1::smallint),
      ('00000000-0000-4000-8003-000000000504', 'DAR-SER-18',   '{}',                               229000::bigint,  4, 9500, 1::smallint),
      ('00000000-0000-4000-8003-000000000505', 'DAR-SRV-SAB',  '{"couleur": "Sable"}',              49000::bigint, 12,  240, 1::smallint),
      ('00000000-0000-4000-8003-000000000505', 'DAR-SRV-ECR',  '{"couleur": "Écru"}',               49000::bigint,  9,  240, 2::smallint),
      ('00000000-0000-4000-8003-000000000506', 'DAR-BOU-FLO',  '{"parfum": "Fleur d''oranger"}',    39000::bigint, 18,  420, 1::smallint),
      ('00000000-0000-4000-8003-000000000506', 'DAR-BOU-JAS',  '{"parfum": "Jasmin"}',              39000::bigint, 11,  420, 2::smallint),
      ('00000000-0000-4000-8003-000000000506', 'DAR-BOU-FIG',  '{"parfum": "Figuier"}',             39000::bigint,  7,  420, 3::smallint),
      ('00000000-0000-4000-8003-000000000507', 'DAR-BOU-BOI',  '{}',                                45000::bigint, 10,  450, 1::smallint),
      ('00000000-0000-4000-8003-000000000508', 'DAR-BOU-AMB',  '{}',                                49000::bigint,  8,  480, 1::smallint),
      ('00000000-0000-4000-8003-000000000509', 'DAR-KIL-S',    '{"dimensions": "60 × 90 cm"}',     129000::bigint,  6, 1400, 1::smallint),
      ('00000000-0000-4000-8003-000000000509', 'DAR-KIL-M',    '{"dimensions": "120 × 180 cm"}',   349000::bigint,  2, 5200, 2::smallint),
      ('00000000-0000-4000-8003-000000000509', 'DAR-KIL-L',    '{"dimensions": "160 × 230 cm"}',   549000::bigint,  0, 8900, 3::smallint),
      ('00000000-0000-4000-8003-000000000510', 'DAR-COU-MAR',  '{"couleur": "Bleu marine"}',        35000::bigint, 15,  300, 1::smallint),
      ('00000000-0000-4000-8003-000000000510', 'DAR-COU-PER',  '{"couleur": "Gris perle"}',         35000::bigint, 12,  300, 2::smallint),
      ('00000000-0000-4000-8003-000000000511', 'DAR-TAI-2',    '{}',                                59000::bigint, 10,  500, 1::smallint),
      ('00000000-0000-4000-8003-000000000512', 'DAR-JET-MA',   '{}',                               159000::bigint,  5, 1800, 1::smallint),
      ('00000000-0000-4000-8003-000000000513', 'DAR-LAM-CH',   '{}',                               139000::bigint,  7, 2100, 1::smallint),
      ('00000000-0000-4000-8003-000000000514', 'DAR-LAM-TR',   '{}',                               329000::bigint,  3, 4800, 1::smallint),
      ('00000000-0000-4000-8003-000000000515', 'DAR-PHO-3',    '{}',                                55000::bigint, 13, 1300, 1::smallint),
      ('00000000-0000-4000-8003-000000000516', 'DAR-PAN-S',    '{"taille": "S — 25 cm"}',          35000::bigint, 12,  400, 1::smallint),
      ('00000000-0000-4000-8003-000000000516', 'DAR-PAN-M',    '{"taille": "M — 32 cm"}',          49000::bigint,  9,  600, 2::smallint),
      ('00000000-0000-4000-8003-000000000516', 'DAR-PAN-L',    '{"taille": "L — 40 cm"}',          65000::bigint,  4,  850, 3::smallint),
      ('00000000-0000-4000-8003-000000000517', 'DAR-COR-OS',   '{}',                                59000::bigint,  8,  700, 1::smallint),
      ('00000000-0000-4000-8003-000000000518', 'DAR-BOC-05',   '{"contenance": "0,5 L"}',           15000::bigint, 30,  450, 1::smallint),
      ('00000000-0000-4000-8003-000000000518', 'DAR-BOC-1',    '{"contenance": "1 L"}',             22000::bigint, 24,  700, 2::smallint)
    ) as v(produit_id, sku, options, prix, stock, poids, position);

  insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position) values
    (b, '00000000-0000-4000-8003-000000000501', 'dar-alia/produits/cuilleres-olivier-1200.webp',    'Cuillères en bois d''olivier aux veines marquées, rangées debout', 1),
    (b, '00000000-0000-4000-8003-000000000502', 'dar-alia/produits/mug-gres-1200.webp',             'Mug en grès gris clair sur une table en bois', 1),
    (b, '00000000-0000-4000-8003-000000000503', 'dar-alia/produits/tasses-blanches-1200.webp',      'Deux tasses blanches sur un fond bleu pâle', 1),
    (b, '00000000-0000-4000-8003-000000000504', 'dar-alia/produits/service-faience-1200.webp',      'Tasses, bols et assiettes blanches festonnées rangés dans un placard', 1),
    (b, '00000000-0000-4000-8003-000000000505', 'dar-alia/produits/serviettes-lin-1200.webp',       'Serviette de lin pliée sur une assiette festonnée, un couvert à manche orange', 1),
    (b, '00000000-0000-4000-8003-000000000506', 'dar-alia/produits/bougie-fleur-oranger-1200.webp', 'Bougie allumée dans un pot en verre, son couvercle doré posé contre', 1),
    (b, '00000000-0000-4000-8003-000000000507', 'dar-alia/produits/bougie-meche-bois-1200.webp',    'Grande bougie blanche à mèche en bois dans un pot en verre', 1),
    (b, '00000000-0000-4000-8003-000000000508', 'dar-alia/produits/bougie-ambree-1200.webp',        'Bougie dans un verre ambré, allumée près d''une fenêtre', 1),
    (b, '00000000-0000-4000-8003-000000000509', 'dar-alia/produits/kilim-1200.webp',                'Kilims tissés aux couleurs vives, étalés au sol', 1),
    (b, '00000000-0000-4000-8003-000000000510', 'dar-alia/produits/housses-coussin-1200.webp',      'Coussins bleu marine et gris sur un lit blanc', 1),
    (b, '00000000-0000-4000-8003-000000000511', 'dar-alia/produits/taies-rayees-1200.webp',         'Oreillers à rayures grises et beiges sur un lit', 1),
    (b, '00000000-0000-4000-8003-000000000512', 'dar-alia/produits/jete-de-lit-1200.webp',          'Lit fait, un jeté en grosse maille à son pied et un plateau de petit-déjeuner', 1),
    (b, '00000000-0000-4000-8003-000000000513', 'dar-alia/produits/lampe-chevet-1200.webp',         'Lampe de chevet à abat-jour blanc, allumée sur une table de nuit', 1),
    (b, '00000000-0000-4000-8003-000000000514', 'dar-alia/produits/lampadaire-trepied-1200.webp',   'Lampadaire trépied en bois dans un salon clair', 1),
    (b, '00000000-0000-4000-8003-000000000515', 'dar-alia/produits/photophores-1200.webp',          'Photophores en verre mercurisé, bougies allumées sur une table', 1),
    (b, '00000000-0000-4000-8003-000000000516', 'dar-alia/produits/panier-jonc-1200.webp',          'Panier tressé en jonc de mer garni de fleurs rouges', 1),
    (b, '00000000-0000-4000-8003-000000000517', 'dar-alia/produits/corbeille-osier-1200.webp',      'Corbeille en osier à anse remplie de fleurs blanches, vue d''en haut', 1),
    (b, '00000000-0000-4000-8003-000000000518', 'dar-alia/produits/bocal-verre-1200.webp',          'Bocal en verre couché, des étoiles de badiane qui s''en échappent', 1);

  update public.produits p set caracteristiques = c.valeurs::jsonb
    from (values
      ('00000000-0000-4000-8003-000000000501', '{"matiere": "Bois d''olivier", "dimensions": "25 à 30 cm", "entretien": "À la main ; huiler de temps en temps", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000502', '{"matiere": "Grès", "dimensions": "35 cl", "entretien": "Lave-vaisselle et micro-ondes", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000503', '{"matiere": "Faïence", "dimensions": "25 cl", "entretien": "Lave-vaisselle", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000504', '{"matiere": "Faïence", "dimensions": "Assiettes de 27, 22 et 20 cm", "entretien": "Lave-vaisselle", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000505', '{"matiere": "Lin", "dimensions": "45 × 45 cm", "entretien": "Machine à 40 °C", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000506', '{"matiere": "Cire de soja, pot en verre", "dimensions": "200 g, 40 heures", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000507', '{"matiere": "Cire de soja, mèche en bois", "dimensions": "300 g, 50 heures", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000508', '{"matiere": "Cire de soja, verre ambré", "dimensions": "250 g, 45 heures", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000509', '{"matiere": "Laine", "entretien": "Aspirer sans brosse rotative ; nettoyage à sec", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000510', '{"matiere": "Velours de coton", "dimensions": "45 × 45 cm", "entretien": "Machine à 30 °C", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000511', '{"matiere": "Coton lavé", "dimensions": "50 × 70 cm", "entretien": "Machine à 40 °C", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000512', '{"matiere": "Coton", "dimensions": "130 × 170 cm", "entretien": "Machine à 30 °C, à plat pour sécher", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000513', '{"matiere": "Céramique et lin", "dimensions": "Hauteur 45 cm", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000514', '{"matiere": "Bois et métal", "dimensions": "Hauteur 150 cm", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000515', '{"matiere": "Verre mercurisé", "dimensions": "Hauteur 8 cm", "fait_main": "Non"}'),
      ('00000000-0000-4000-8003-000000000516', '{"matiere": "Jonc de mer", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000517', '{"matiere": "Osier", "dimensions": "40 × 28 cm", "fait_main": "Oui"}'),
      ('00000000-0000-4000-8003-000000000518', '{"matiere": "Verre", "entretien": "Lave-vaisselle", "fait_main": "Non"}')
    ) as c(produit_id, valeurs)
   where p.boutique_id = b and p.id = c.produit_id::uuid;

  insert into public.themes (boutique_id, code, couleurs, polices, style, textes, sections) values
    (b, 'bento', '{"accent": "#5E6B4E", "fond": "#F6F4EE"}', '{"titres": "instrument-serif", "texte": "instrument-sans"}',
     '{"coins": "ronds", "boutons": "pilule"}',
     '{"resume_fr": "Bois d''olivier, grès, lin et kilims, faits à la main en Tunisie. Paiement à la livraison, partout en Tunisie.",
       "seo_titre_fr": "Dar Alia — maison et décoration faites main, paiement à la livraison",
       "origine_fr": "Sfax",
       "politique_retour_fr": "Retour possible sous 7 jours, article intact dans son emballage d''origine."}',
     '[{"type": "hero", "lien": "/categorie/cuisine-et-table",
        "textes": {"etiquette_fr": "Fait main en Tunisie",
                   "titre_fr": "Des objets\nqui durent.",
                   "chapo_fr": "Bois d''olivier de Sfax, kilims de Kairouan, grès de Nabeul : des pièces faites à la main, pour tous les jours.",
                   "cta_fr": "Découvrir la table",
                   "image_alt_fr": "Salon lumineux, un canapé gris et des coussins bleu-vert"},
        "image": {"chemin": "dar-alia/accueil/hero-2000.webp", "chemin_portrait": "dar-alia/accueil/hero-portrait-1200.webp"}},
       {"type": "rayons"},
       {"type": "selection", "nombre": 8, "textes": {"titre_fr": "Nos essentiels"}},
       {"type": "editorial", "lien": "/categorie/decoration",
        "textes": {"etiquette_fr": "L''atelier",
                   "titre_fr": "Le temps\nde bien faire.",
                   "texte_fr": "Chaque cuillère est taillée dans une branche d''olivier tombée, chaque kilim demande trois semaines de métier. Nous travaillons avec onze artisans, et nous vous disons qui a fait quoi.",
                   "cta_fr": "La décoration",
                   "image_alt_fr": "Table basse en bois, un terrarium et une pomme de pin, un canapé derrière"},
        "image": {"chemin": "dar-alia/accueil/recit-1200.webp"}},
       {"type": "selection", "nombre": 3, "rayon": "decoration", "textes": {"etiquette_fr": "Décoration", "titre_fr": "Lumière et laine"}},
       {"type": "avis", "nombre": 6, "textes": {"titre_fr": "Ce qu''en disent nos clients"}},
       {"type": "engagements"}]');

  -- Les avis clients : le module, et les avis des commandes livrées (plus bas).
  insert into plateforme.modules_actifs (boutique_id, module) values (b, 'avis');
end
$$;

-- ---------------------------------------------------------------------
-- Ce qu'en disent ses clients : huit commandes livrées de l'automne 2025
-- (DAR-2025-001xx : ni la période du tableau de bord ni l'objectif du
-- mois ne bougent), huit avis vérifiés et publiés, deux réponses de la
-- boutique, aucune photo. Chaque pièce vendue revient au stock (un
-- arrivage du même jour) : le stock de démonstration ne bouge pas.
-- ---------------------------------------------------------------------
do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000005';
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
     or exists (select 1 from public.commandes where boutique_id = b and numero like 'DAR-2025-001%') then
    return;
  end if;
  for a in
    select * from (values
      (1, 'Wafa Karray',      '+21620555501', 'Sfax',      'sfax',     date '2025-09-08', 'DAR-CUI-3',   5,
          'Elles sont superbes, chacune avec ses veines. Après trois mois de cuisine tous les jours, rien n''a bougé.', null),
      (2, 'Khaled Ben Amor',  '+21620555502', 'Tunis',     'tunis',    date '2025-09-19', 'DAR-MUG-GR',  5,
          'Il tient bien en main et garde le café chaud. Le gris est encore plus beau qu''en photo.', null),
      (3, 'Amira Fourati',    '+21620555503', 'Sousse',    'sousse',   date '2025-10-01', 'DAR-BOU-FLO', 4,
          'Le parfum de fleur d''oranger est délicat, pas trop fort. J''aurais aimé un pot un peu plus grand.',
          'Merci Amira ! Un grand format (400 g) arrive pour l''hiver.'),
      (4, 'Hichem Turki',     '+21620555504', 'Nabeul',    'nabeul',   date '2025-10-14', 'DAR-KIL-S',   5,
          'Les couleurs sont franches et la laine épaisse. Bien emballé, livré en trois jours.', null),
      (5, 'Lamia Chaabane',   '+21620555505', 'Ariana',    'ariana',   date '2025-10-25', 'DAR-TAI-2',   4,
          'Jolies et douces après le premier lavage. Elles ont un peu rétréci, prenez-les bien ajustées.',
          'Merci Lamia : le coton lavé se resserre au premier passage, c''est noté sur la fiche.'),
      (6, 'Mehdi Gargouri',   '+21620555506', 'Sfax',      'sfax',     date '2025-11-06', 'DAR-LAM-CH',  5,
          'La lumière est douce, parfaite pour lire le soir. Livrée le lendemain à Sfax.', null),
      (7, 'Nadia Jerbi',      '+21620555507', 'Monastir',  'monastir', date '2025-11-18', 'DAR-PAN-M',   5,
          'Il accueille ma plante et tout le monde me demande d''où il vient.', null),
      (8, 'Olfa Mzoughi',     '+21620555508', 'Bizerte',   'bizerte',  date '2025-12-02', 'DAR-SRV-SAB', 5,
          'Le lin est épais et se repasse facilement. Ma table de fête n''a jamais été aussi belle.', null)
    ) as t(n, nom, tel, ville, gouv, le, sku, note, texte, reponse)
    order by n
  loop
    t0 := a.le + time '18:50';
    select * into v_variante from public.variantes where boutique_id = b and sku = a.sku;
    insert into public.clients (boutique_id, nom, telephone, created_at) values (b, a.nom, a.tel, t0) returning id into v_client;
    v_devis := private.chiffre_commande(b, jsonb_build_array(jsonb_build_object('variante_id', v_variante.id, 'quantite', 1)), a.gouv, false);
    insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
    values (b, 'DAR-2025-' || lpad((100 + a.n)::text, 5, '0'), 'vitrine', v_client, a.nom, a.tel, 'Adresse de démonstration',
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
    values (b, v_commande, 'appel', 'confirmee', t0 + interval '15 hours');
    update public.commandes set statut = 'confirmee' where id = v_commande;
    update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (47300000 + a.n * 211) where id = v_commande;
    update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = v_commande;
    update public.commande_evenements e
       set created_at = t0 + case e.statut_apres when 'recue' then interval '0' when 'confirmee' then interval '15 hours'
                                                 when 'expediee' then interval '30 hours' else interval '54 hours' end
     where e.commande_id = v_commande;
    update public.commandes
       set confirmee_at = t0 + interval '15 hours', expediee_at = t0 + interval '30 hours',
           livree_at = t0 + interval '54 hours', cloturee_at = t0 + interval '54 hours'
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
