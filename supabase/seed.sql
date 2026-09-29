-- =====================================================================
-- SkanEcom · jeu de démonstration pour le DÉVELOPPEMENT
-- =====================================================================
-- Appliqué après les migrations par `outils/base-locale.sh reinit` et par
-- `supabase db reset`. Jamais en production : la vraie boutique Maymar sera
-- importée par le script d'import (étape 1, tâche 6).
--
-- Deux boutiques, pour voir tout de suite que rien ne se mélange :
--   maymar              catalogue de démarrage de Maymar (4 valises, 20 variantes)
--   quincaillerie-demo  quelques articles d'outillage et de visserie, rayons
--                       sur deux niveaux, livraison offerte dès 500 TND,
--                       prix barrés affichés, retrait en magasin et conseil
--                       WhatsApp activés
-- Domaines de développement : maymar.localhost, quincaillerie.localhost.
-- =====================================================================

insert into plateforme.boutiques (id, slug, nom, statut, langues_actives) values
  ('00000000-0000-4000-8000-000000000001', 'maymar',             'Maymar',               'active', '{fr,ar}'),
  ('00000000-0000-4000-8000-000000000002', 'quincaillerie-demo', 'Quincaillerie du Sud', 'active', '{fr}');

insert into plateforme.domaines (hote, boutique_id, type, principal) values
  ('maymar.localhost',        '00000000-0000-4000-8000-000000000001', 'sous_domaine', true),
  ('quincaillerie.localhost', '00000000-0000-4000-8000-000000000002', 'sous_domaine', true);

insert into plateforme.modules_actifs (boutique_id, module) values
  ('00000000-0000-4000-8000-000000000002', 'retrait_magasin'),
  ('00000000-0000-4000-8000-000000000002', 'conseil_whatsapp');

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000001', 'commande.prefixe_numero',          '"MAY"'),
  ('00000000-0000-4000-8000-000000000002', 'commande.prefixe_numero',          '"QDS"'),
  ('00000000-0000-4000-8000-000000000002', 'livraison.seuil_gratuite_millimes', '500000'),
  ('00000000-0000-4000-8000-000000000002', 'catalogue.afficher_prix_barres',   'true'),
  ('00000000-0000-4000-8000-000000000002', 'contact.whatsapp',                 '"21670000000"');


-- ---------------------------------------------------------------------
-- Maymar : zones et catalogue de démarrage (repris de Maymar, 10/08/2026)
-- ---------------------------------------------------------------------
insert into public.zones_livraison (id, boutique_id, nom_fr, nom_ar, frais_millimes, delai_jours_min, delai_jours_max, position) values
  ('00000000-0000-4000-8001-000000000001', '00000000-0000-4000-8000-000000000001', 'Grand Tunis',   'تونس الكبرى',    6000,  1, 2, 1),
  ('00000000-0000-4000-8001-000000000002', '00000000-0000-4000-8000-000000000001', 'Nord et Sahel', 'الشمال والساحل', 8000,  2, 3, 2),
  ('00000000-0000-4000-8001-000000000003', '00000000-0000-4000-8000-000000000001', 'Centre et Sud', 'الوسط والجنوب',  10000, 3, 5, 3);

insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
select '00000000-0000-4000-8000-000000000001', g.code,
       case
         when g.code in ('tunis', 'ariana', 'ben-arous', 'manouba') then '00000000-0000-4000-8001-000000000001'::uuid
         when g.code in ('bizerte', 'nabeul', 'zaghouan', 'beja', 'jendouba', 'kef', 'siliana',
                         'sousse', 'monastir', 'mahdia') then '00000000-0000-4000-8001-000000000002'::uuid
         else '00000000-0000-4000-8001-000000000003'::uuid
       end
from public.gouvernorats g;

insert into public.categories (id, boutique_id, slug, nom_fr, nom_ar, description_fr, position) values
  ('00000000-0000-4000-8002-000000000001', '00000000-0000-4000-8000-000000000001', 'valises', 'Valises', 'حقائب السفر',
   'Valises rigides et souples, cabine et soute — bagages testés pour les vols au départ de Tunis.', 1);

insert into public.produits
  (id, boutique_id, categorie_id, slug, nom_fr, nom_ar, description_fr, marque, prix_min_millimes,
   publie, mis_en_avant, position, meta_titre_fr, meta_description_fr) values
  ('00000000-0000-4000-8003-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000001',
   'valise-rigide-abs-4-roues', 'Valise rigide ABS 4 roues', 'حقيبة صلبة ABS بأربع عجلات',
   'Coque ABS résistante aux chocs, quatre roues pivotantes à 360°, serrure TSA intégrée et poignée télescopique à trois positions. Doublure intérieure avec sangles de maintien et poche zippée.',
   'Maymar', 189000, true, true, 1,
   'Valise rigide ABS 4 roues — cabine, moyenne et grande taille | Maymar',
   'Valise rigide ABS avec serrure TSA et 4 roues pivotantes. Trois tailles, trois coloris. Livraison partout en Tunisie, paiement à la livraison.'),
  ('00000000-0000-4000-8003-000000000002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000001',
   'valise-souple-extensible', 'Valise souple extensible', 'حقيبة مرنة قابلة للتوسيع',
   'Toile polyester haute densité, soufflet d''extension +5 cm pour le retour de voyage, quatre roues silencieuses et deux poches frontales pour les documents.',
   'Maymar', 149000, true, false, 2,
   'Valise souple extensible 4 roues — Maymar',
   'Valise souple en polyester avec extension +5 cm, poches frontales et 4 roues silencieuses. Paiement à la livraison en Tunisie.'),
  ('00000000-0000-4000-8003-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000001',
   'set-3-valises-rigides', 'Set de 3 valises rigides', 'طقم 3 حقائب صلبة',
   'L''ensemble cabine 55 cm, moyenne 65 cm et grande 75 cm, emboîtables pour le rangement. Coque rainurée, serrures TSA et roues doubles sur les trois pièces.',
   'Maymar', 649000, true, true, 3,
   'Set de 3 valises rigides cabine + moyenne + grande | Maymar',
   'Lot de 3 valises rigides emboîtables avec serrures TSA. Le set complet livré partout en Tunisie, paiement à la livraison.'),
  ('00000000-0000-4000-8003-000000000004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8002-000000000001',
   'valise-cabine-business', 'Valise cabine business', 'حقيبة كابينة للأعمال',
   'Format cabine 55 cm accepté par les compagnies, compartiment ordinateur 15,6" rembourré accessible sans ouvrir la valise, port USB latéral et poignée renforcée.',
   'Maymar', 229000, true, false, 4,
   'Valise cabine business avec compartiment PC 15,6" | Maymar',
   'Valise cabine 55 cm avec compartiment ordinateur et port USB. Format accepté en bagage à main. Livraison en Tunisie, paiement à la livraison.');

insert into public.produit_options (boutique_id, produit_id, cle, label_fr, label_ar, position)
select '00000000-0000-4000-8000-000000000001', v.produit_id::uuid, v.cle, v.label_fr, v.label_ar, v.position
from (values
  ('00000000-0000-4000-8003-000000000001', 'taille',  'Taille',  'الحجم', 1::smallint),
  ('00000000-0000-4000-8003-000000000001', 'couleur', 'Couleur', 'اللون', 2::smallint),
  ('00000000-0000-4000-8003-000000000002', 'taille',  'Taille',  'الحجم', 1::smallint),
  ('00000000-0000-4000-8003-000000000002', 'couleur', 'Couleur', 'اللون', 2::smallint),
  ('00000000-0000-4000-8003-000000000003', 'couleur', 'Couleur', 'اللون', 1::smallint),
  ('00000000-0000-4000-8003-000000000004', 'couleur', 'Couleur', 'اللون', 1::smallint)
) as v(produit_id, cle, label_fr, label_ar, position);

-- Le stock initial entre au journal tout seul (trigger de la migration 03).
insert into public.variantes
  (boutique_id, produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position)
select '00000000-0000-4000-8000-000000000001', v.produit_id::uuid, v.sku, v.options::jsonb,
       v.prix_millimes, v.prix_barre_millimes, v.stock, v.poids_grammes, v.position
from (values
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-55-NOI', '{"taille":"Cabine 55 cm","couleur":"Noir"}',         189000::bigint, null::bigint,   12, 2600,  1::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-55-BLE', '{"taille":"Cabine 55 cm","couleur":"Bleu marine"}',  189000::bigint, null::bigint,    8, 2600,  2::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-55-BOR', '{"taille":"Cabine 55 cm","couleur":"Bordeaux"}',     189000::bigint, null::bigint,    5, 2600,  3::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-65-NOI', '{"taille":"Moyenne 65 cm","couleur":"Noir"}',        259000::bigint, 289000::bigint, 10, 3400,  4::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-65-BLE', '{"taille":"Moyenne 65 cm","couleur":"Bleu marine"}', 259000::bigint, null::bigint,    6, 3400,  5::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-65-BOR', '{"taille":"Moyenne 65 cm","couleur":"Bordeaux"}',    259000::bigint, null::bigint,    3, 3400,  6::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-75-NOI', '{"taille":"Grande 75 cm","couleur":"Noir"}',         329000::bigint, null::bigint,    7, 4300,  7::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-75-BLE', '{"taille":"Grande 75 cm","couleur":"Bleu marine"}',  329000::bigint, null::bigint,    4, 4300,  8::smallint),
  ('00000000-0000-4000-8003-000000000001', 'VAL-ABS-75-BOR', '{"taille":"Grande 75 cm","couleur":"Bordeaux"}',     329000::bigint, null::bigint,    0, 4300,  9::smallint),
  ('00000000-0000-4000-8003-000000000002', 'VAL-SPL-55-NOI', '{"taille":"Cabine 55 cm","couleur":"Noir"}',         149000::bigint, null::bigint,   15, 2200,  1::smallint),
  ('00000000-0000-4000-8003-000000000002', 'VAL-SPL-55-GRI', '{"taille":"Cabine 55 cm","couleur":"Gris"}',         149000::bigint, null::bigint,    9, 2200,  2::smallint),
  ('00000000-0000-4000-8003-000000000002', 'VAL-SPL-65-NOI', '{"taille":"Moyenne 65 cm","couleur":"Noir"}',        199000::bigint, null::bigint,   11, 2900,  3::smallint),
  ('00000000-0000-4000-8003-000000000002', 'VAL-SPL-65-GRI', '{"taille":"Moyenne 65 cm","couleur":"Gris"}',        199000::bigint, null::bigint,    6, 2900,  4::smallint),
  ('00000000-0000-4000-8003-000000000002', 'VAL-SPL-75-NOI', '{"taille":"Grande 75 cm","couleur":"Noir"}',         249000::bigint, null::bigint,    5, 3700,  5::smallint),
  ('00000000-0000-4000-8003-000000000002', 'VAL-SPL-75-GRI', '{"taille":"Grande 75 cm","couleur":"Gris"}',         249000::bigint, null::bigint,    2, 3700,  6::smallint),
  ('00000000-0000-4000-8003-000000000003', 'VAL-SET3-NOI',   '{"couleur":"Noir"}',                                 649000::bigint, 777000::bigint,  6, 10300, 1::smallint),
  ('00000000-0000-4000-8003-000000000003', 'VAL-SET3-CHA',   '{"couleur":"Champagne"}',                            649000::bigint, 777000::bigint,  4, 10300, 2::smallint),
  ('00000000-0000-4000-8003-000000000003', 'VAL-SET3-VER',   '{"couleur":"Vert olive"}',                           649000::bigint, 777000::bigint,  2, 10300, 3::smallint),
  ('00000000-0000-4000-8003-000000000004', 'VAL-BUS-55-NOI', '{"couleur":"Noir"}',                                 229000::bigint, null::bigint,    8, 2800,  1::smallint),
  ('00000000-0000-4000-8003-000000000004', 'VAL-BUS-55-ANT', '{"couleur":"Gris anthracite"}',                      229000::bigint, null::bigint,    5, 2800,  2::smallint)
) as v(produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position);


-- ---------------------------------------------------------------------
-- Quincaillerie de démonstration : rayons sur deux niveaux, références
-- ---------------------------------------------------------------------
insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, position) values
  ('00000000-0000-4000-8002-000000000011', '00000000-0000-4000-8000-000000000002', null, 'outillage',     'Outillage',           1),
  ('00000000-0000-4000-8002-000000000012', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000011', 'perceuses', 'Perceuses et visseuses', 1),
  ('00000000-0000-4000-8002-000000000013', '00000000-0000-4000-8000-000000000002', null, 'quincaillerie', 'Quincaillerie',       2),
  ('00000000-0000-4000-8002-000000000014', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000013', 'visserie',  'Visserie',               1);

insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, position) values
  ('00000000-0000-4000-8003-000000000011', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000012',
   'perceuse-visseuse-18v', 'Perceuse-visseuse sans fil 18 V',
   'Mandrin 13 mm, couple 60 Nm, deux vitesses. Vendue seule ou en kit avec deux batteries 2 Ah et chargeur.',
   'Atelier Pro', 289000, true, 1),
  ('00000000-0000-4000-8003-000000000012', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000014',
   'vis-bois-tete-fraisee', 'Vis à bois tête fraisée',
   'Acier zingué, empreinte cruciforme. À l''unité ou par boîte de 200.',
   null, 150, true, 1);

insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000011', 'version',        'Version',        1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000012', 'dimension',      'Dimension',      1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000012', 'conditionnement', 'Conditionnement', 2);

insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position)
select '00000000-0000-4000-8000-000000000002', v.produit_id::uuid, v.sku, v.options::jsonb,
       v.prix_millimes, v.prix_barre_millimes, v.stock, v.poids_grammes, v.position
from (values
  ('00000000-0000-4000-8003-000000000011', 'PV18-SEULE', '{"version":"Machine seule"}',                         289000::bigint, null::bigint,   7, 1500, 1::smallint),
  ('00000000-0000-4000-8003-000000000011', 'PV18-KIT2',  '{"version":"Kit 2 batteries + chargeur"}',            489000::bigint, 549000::bigint, 4, 3200, 2::smallint),
  ('00000000-0000-4000-8003-000000000012', 'VBF-4X40-U', '{"dimension":"4 × 40 mm","conditionnement":"Unité"}', 150::bigint,    null::bigint, 800,    5, 1::smallint),
  ('00000000-0000-4000-8003-000000000012', 'VBF-4X40-B', '{"dimension":"4 × 40 mm","conditionnement":"Boîte de 200"}', 22000::bigint, null::bigint, 25, 1000, 2::smallint),
  ('00000000-0000-4000-8003-000000000012', 'VBF-5X60-U', '{"dimension":"5 × 60 mm","conditionnement":"Unité"}', 250::bigint,    null::bigint, 500,    9, 3::smallint)
) as v(produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position);
