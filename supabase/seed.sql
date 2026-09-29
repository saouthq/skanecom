-- =====================================================================
-- SkanEcom · jeu de démonstration pour le DÉVELOPPEMENT
-- =====================================================================
-- Appliqué après les migrations par `outils/base-locale.sh reinit` et par
-- `supabase db reset`. Jamais en production : la vraie boutique Maymar sera
-- importée par le script d'import (étape 1, tâche 6).
--
-- Trois boutiques, pour voir tout de suite que rien ne se mélange — et que
-- les deux gabarits ne se ressemblent pas :
--   maymar              gabarit ÉDITORIAL : catalogue de démarrage de Maymar
--                       (4 valises, 20 variantes). Ses produits attendent
--                       leurs vraies photos (état « photo à venir ») ;
--                       l'accueil s'ouvre sur des photos de démonstration.
--   quincaillerie-demo  gabarit TECHNIQUE : outillage, visserie, protection,
--                       rayons sur deux niveaux, livraison offerte dès
--                       500 TND, prix barrés affichés, retrait en magasin et
--                       conseil WhatsApp activés
--   maison-selma        gabarit ÉDITORIAL : prêt-à-porter de démonstration
--                       (19 modèles photographiés), livraison offerte dès
--                       250 TND
-- Domaines de développement : maymar.localhost, quincaillerie.localhost,
-- mode.localhost.
--
-- Les photos de démonstration (supabase/fichiers-demo/, CC0, voir
-- CREDITS.md) habillent les boutiques jusqu'à la fin du développement ;
-- aucune n'est présentée comme la photo d'un produit de Maymar.
-- =====================================================================

insert into plateforme.boutiques (id, slug, nom, statut, langues_actives) values
  ('00000000-0000-4000-8000-000000000001', 'maymar',             'Maymar',               'active', '{fr,ar}'),
  ('00000000-0000-4000-8000-000000000002', 'quincaillerie-demo', 'Quincaillerie du Sud', 'active', '{fr}'),
  ('00000000-0000-4000-8000-000000000003', 'maison-selma',       'Maison Selma',         'active', '{fr}');

insert into plateforme.domaines (hote, boutique_id, type, principal) values
  ('maymar.localhost',        '00000000-0000-4000-8000-000000000001', 'sous_domaine', true),
  ('quincaillerie.localhost', '00000000-0000-4000-8000-000000000002', 'sous_domaine', true),
  ('mode.localhost',          '00000000-0000-4000-8000-000000000003', 'sous_domaine', true);

insert into plateforme.modules_actifs (boutique_id, module) values
  ('00000000-0000-4000-8000-000000000002', 'retrait_magasin'),
  ('00000000-0000-4000-8000-000000000002', 'conseil_whatsapp');

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000001', 'commande.prefixe_numero',          '"MAY"'),
  ('00000000-0000-4000-8000-000000000002', 'commande.prefixe_numero',          '"QDS"'),
  ('00000000-0000-4000-8000-000000000002', 'livraison.seuil_gratuite_millimes', '500000'),
  ('00000000-0000-4000-8000-000000000002', 'catalogue.afficher_prix_barres',   'true'),
  ('00000000-0000-4000-8000-000000000002', 'contact.whatsapp',                 '"21670000000"'),
  -- Le magasin de la quincaillerie : on y retire ses commandes (module retrait_magasin).
  ('00000000-0000-4000-8000-000000000002', 'retrait.adresse',                  '"Route de Tunis, km 3"'),
  ('00000000-0000-4000-8000-000000000002', 'retrait.ville',                    '"Sfax"'),
  ('00000000-0000-4000-8000-000000000002', 'retrait.horaires',                 '"Du lundi au samedi, de 8 h à 18 h"'),
  ('00000000-0000-4000-8000-000000000002', 'retrait.delai_heures',             '2'),
  ('00000000-0000-4000-8000-000000000003', 'commande.prefixe_numero',          '"SEL"'),
  ('00000000-0000-4000-8000-000000000003', 'livraison.frais_fixes_millimes',   '7000'),
  ('00000000-0000-4000-8000-000000000003', 'livraison.seuil_gratuite_millimes', '250000');


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
  ('00000000-0000-4000-8002-000000000011', '00000000-0000-4000-8000-000000000002', null, 'outillage',     'Outillage électroportatif', 1),
  ('00000000-0000-4000-8002-000000000012', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000011', 'perceuses', 'Perceuses et visseuses', 1),
  ('00000000-0000-4000-8002-000000000013', '00000000-0000-4000-8000-000000000002', null, 'quincaillerie', 'Quincaillerie',       2),
  ('00000000-0000-4000-8002-000000000014', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000013', 'visserie',  'Visserie',               1);

update public.categories set image_chemin = 'quincaillerie-demo/rayons/perceuses-1000.webp',
       description_fr = 'Sans fil ou filaires, et tout ce qui se monte au mandrin : forets, embouts.'
 where id = '00000000-0000-4000-8002-000000000012';
update public.categories set image_chemin = 'quincaillerie-demo/rayons/visserie-1000.webp',
       description_fr = 'Vis à bois, plaque de plâtre, assortiments : à l''unité ou par boîte.'
 where id = '00000000-0000-4000-8002-000000000014';

insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, position) values
  ('00000000-0000-4000-8003-000000000011', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000012',
   'perceuse-visseuse-14v', 'Perceuse-visseuse sans fil 14,4 V',
   'Mandrin 10 mm, couple 32 Nm, deux vitesses, lampe de travail. Vendue seule ou en kit avec deux batteries 1,5 Ah et chargeur.',
   'Atelier Pro', 149000, true, 1),
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
  ('00000000-0000-4000-8003-000000000011', 'PV14-SEULE', '{"version":"Machine seule"}',                         149000::bigint, null::bigint,   7, 1400, 1::smallint),
  ('00000000-0000-4000-8003-000000000011', 'PV14-KIT2',  '{"version":"Kit 2 batteries + chargeur"}',            229000::bigint, 259000::bigint, 4, 2600, 2::smallint),
  ('00000000-0000-4000-8003-000000000012', 'VBF-4X40-U', '{"dimension":"4 × 40 mm","conditionnement":"Unité"}', 150::bigint,    null::bigint, 800,    5, 1::smallint),
  ('00000000-0000-4000-8003-000000000012', 'VBF-4X40-B', '{"dimension":"4 × 40 mm","conditionnement":"Boîte de 200"}', 22000::bigint, null::bigint, 25, 1000, 2::smallint),
  ('00000000-0000-4000-8003-000000000012', 'VBF-5X60-U', '{"dimension":"5 × 60 mm","conditionnement":"Unité"}', 250::bigint,    null::bigint, 500,    9, 3::smallint)
) as v(produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position);

insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000011', 'quincaillerie-demo/produits/perceuse-visseuse-1000.webp', 'Perceuse-visseuse sans fil sur fond blanc', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000012', 'quincaillerie-demo/produits/vis-bois-1000.webp', 'Vis à bois en gros plan', 1);

-- Le reste du catalogue de démonstration : scies, outillage à main,
-- protection, et d'autres références dans les rayons existants.
insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, description_fr, image_chemin, position) values
  ('00000000-0000-4000-8002-000000000015', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000011', 'scies', 'Scies', 'Scies circulaires, sauteuses et leurs lames.', 'quincaillerie-demo/rayons/scies-1000.webp', 2),
  ('00000000-0000-4000-8002-000000000016', '00000000-0000-4000-8000-000000000002', null, 'outillage-a-main', 'Outillage à main', 'Clés, douilles, tournevis : l''outillage de l''établi.', 'quincaillerie-demo/rayons/outillage-a-main-1000.webp', 3),
  ('00000000-0000-4000-8002-000000000017', '00000000-0000-4000-8000-000000000002', null, 'protection', 'Protection', 'Gants, casques et équipements de chantier aux normes.', 'quincaillerie-demo/rayons/protection-1000.webp', 4);

insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, mis_en_avant, position) values
  ('00000000-0000-4000-8003-000000000013', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000012', 'perceuse-percussion-710w', 'Perceuse à percussion 710 W', 'Mandrin autoserrant 13 mm, 0 à 3 000 tr/min, variateur à la gâchette, butée de profondeur et poignée latérale. Perce le béton, le bois et le métal.', 'Atelier Pro', 169000, true, false, 1),
  ('00000000-0000-4000-8003-000000000014', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000012', 'coffret-forets-19', 'Coffret de forets HSS 19 pièces', 'Forets acier rapide rectifiés, de 1 à 10 mm par demi-millimètre, pour le métal et le bois. Coffret métallique à charnière.', 'Forgex', 59000, true, false, 2),
  ('00000000-0000-4000-8003-000000000015', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000012', 'forets-metal-cobalt', 'Forets métal au cobalt', 'Acier HSS-Co 5 %, affûtage 135° auto-centrant : pour l''inox et les aciers durs. Vendus à l''unité.', 'Forgex', 4500, true, false, 3),
  ('00000000-0000-4000-8003-000000000016', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000012', 'coffret-embouts-32', 'Coffret d''embouts de vissage 32 pièces', 'Embouts cruciformes, Pozidriv, Torx et six-pans, porte-embout magnétique. Acier S2 trempé.', 'Forgex', 39000, true, false, 4),
  ('00000000-0000-4000-8003-000000000017', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000015', 'scie-circulaire-1400w', 'Scie circulaire 1 400 W', 'Lame 190 mm, profondeur de coupe 65 mm, inclinaison jusqu''à 45°, raccord d''aspiration. Livrée avec une lame 24 dents.', 'Atelier Pro', 329000, true, true, 5),
  ('00000000-0000-4000-8003-000000000018', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000015', 'lame-scie-carbure', 'Lame de scie circulaire carbure', 'Dents au carbure de tungstène, corps anti-vibration. 24 dents pour débiter, 48 pour les coupes de finition.', 'Forgex', 34000, true, false, 6),
  ('00000000-0000-4000-8003-000000000019', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000016', 'coffret-douilles-24', 'Coffret de douilles 1/2" 24 pièces', 'Douilles six-pans de 10 à 32 mm, cliquet 72 dents réversible, rallonge et cardan. Acier chrome-vanadium.', 'Forgex', 119000, true, true, 7),
  ('00000000-0000-4000-8003-000000000020', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000016', 'jeu-cles-mixtes', 'Jeu de clés mixtes 12 pièces', 'Clés plates et à œil de 8 à 19 mm, tête à œil déportée à 15°. Trousse en toile fournie.', 'Forgex', 89000, true, false, 8),
  ('00000000-0000-4000-8003-000000000021', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000014', 'vis-plaque-platre', 'Vis plaque de plâtre phosphatées', 'Tête trompette, pointe aiguille, pas fin pour rails métalliques. Boîte de 1 000.', 'Forgex', 18500, true, false, 9),
  ('00000000-0000-4000-8003-000000000022', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000014', 'assortiment-visserie-1000', 'Assortiment de visserie 1 000 pièces', 'Vis, écrous, rondelles et chevilles des tailles courantes, rangés dans une mallette à compartiments.', 'Forgex', 45000, true, false, 10),
  ('00000000-0000-4000-8003-000000000023', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000017', 'gants-nitrile', 'Gants de protection enduits nitrile', 'Support tricoté sans couture, paume enduite nitrile : bonne prise sur les surfaces grasses. Vendus par paire.', 'Protek', 6500, true, false, 11),
  ('00000000-0000-4000-8003-000000000024', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8002-000000000017', 'casque-chantier', 'Casque de chantier EN 397', 'Coque en polyéthylène haute densité, harnais à six points, serrage par molette. Conforme EN 397.', 'Protek', 24000, true, false, 12);

insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000015', 'diametre', 'Diamètre', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000017', 'version', 'Version', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000018', 'dimension', 'Dimension', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000021', 'dimension', 'Dimension', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000023', 'taille', 'Taille', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000024', 'couleur', 'Couleur', 1);

-- Le stock initial entre au journal tout seul (trigger de la migration 03).
insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position)
select '00000000-0000-4000-8000-000000000002', v.produit_id::uuid, v.sku, v.options::jsonb, v.prix_millimes, v.prix_barre_millimes, v.stock, v.poids_grammes, v.position
from (values
  ('00000000-0000-4000-8003-000000000013', 'PP710', '{}', 169000::bigint, null::bigint, 9, 2100, 1::smallint),
  ('00000000-0000-4000-8003-000000000014', 'FHSS-19', '{}', 59000::bigint, 69000::bigint, 22, 650, 1::smallint),
  ('00000000-0000-4000-8003-000000000015', 'FC-4', '{"diametre": "4 mm"}', 4500::bigint, null::bigint, 60, 12, 1::smallint),
  ('00000000-0000-4000-8003-000000000015', 'FC-6', '{"diametre": "6 mm"}', 6900::bigint, null::bigint, 44, 20, 2::smallint),
  ('00000000-0000-4000-8003-000000000015', 'FC-8', '{"diametre": "8 mm"}', 9800::bigint, null::bigint, 18, 34, 3::smallint),
  ('00000000-0000-4000-8003-000000000015', 'FC-10', '{"diametre": "10 mm"}', 14500::bigint, null::bigint, 0, 52, 4::smallint),
  ('00000000-0000-4000-8003-000000000016', 'EMB-32', '{}', 39000::bigint, null::bigint, 2, 300, 1::smallint),
  ('00000000-0000-4000-8003-000000000017', 'SC1400', '{"version": "Machine seule"}', 329000::bigint, null::bigint, 5, 4200, 1::smallint),
  ('00000000-0000-4000-8003-000000000017', 'SC1400-RAIL', '{"version": "Avec rail de guidage 1,4 m"}', 419000::bigint, 459000::bigint, 2, 6100, 2::smallint),
  ('00000000-0000-4000-8003-000000000018', 'LSC-190-24', '{"dimension": "190 mm · 24 dents"}', 34000::bigint, null::bigint, 16, 480, 1::smallint),
  ('00000000-0000-4000-8003-000000000018', 'LSC-190-48', '{"dimension": "190 mm · 48 dents"}', 42000::bigint, null::bigint, 9, 500, 2::smallint),
  ('00000000-0000-4000-8003-000000000018', 'LSC-235-40', '{"dimension": "235 mm · 40 dents"}', 49000::bigint, null::bigint, 4, 720, 3::smallint),
  ('00000000-0000-4000-8003-000000000019', 'DOU-24', '{}', 119000::bigint, null::bigint, 8, 3900, 1::smallint),
  ('00000000-0000-4000-8003-000000000020', 'CM-12', '{}', 89000::bigint, null::bigint, 11, 2300, 1::smallint),
  ('00000000-0000-4000-8003-000000000021', 'VPP-25', '{"dimension": "3,5 × 25 mm"}', 18500::bigint, null::bigint, 30, 1100, 1::smallint),
  ('00000000-0000-4000-8003-000000000021', 'VPP-35', '{"dimension": "3,5 × 35 mm"}', 21000::bigint, null::bigint, 24, 1400, 2::smallint),
  ('00000000-0000-4000-8003-000000000021', 'VPP-45', '{"dimension": "3,5 × 45 mm"}', 24500::bigint, null::bigint, 12, 1700, 3::smallint),
  ('00000000-0000-4000-8003-000000000022', 'ASV-1000', '{}', 45000::bigint, 52000::bigint, 14, 2600, 1::smallint),
  ('00000000-0000-4000-8003-000000000023', 'GNT-8', '{"taille": "8 (M)"}', 6500::bigint, null::bigint, 40, 60, 1::smallint),
  ('00000000-0000-4000-8003-000000000023', 'GNT-9', '{"taille": "9 (L)"}', 6500::bigint, null::bigint, 55, 62, 2::smallint),
  ('00000000-0000-4000-8003-000000000023', 'GNT-10', '{"taille": "10 (XL)"}', 6500::bigint, null::bigint, 25, 64, 3::smallint),
  ('00000000-0000-4000-8003-000000000024', 'CAS-BLE', '{"couleur": "Bleu"}', 24000::bigint, null::bigint, 12, 380, 1::smallint),
  ('00000000-0000-4000-8003-000000000024', 'CAS-BLA', '{"couleur": "Blanc"}', 24000::bigint, null::bigint, 9, 380, 2::smallint),
  ('00000000-0000-4000-8003-000000000024', 'CAS-JAU', '{"couleur": "Jaune"}', 24000::bigint, null::bigint, 1, 380, 3::smallint)
) as v(produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position);

insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000013', 'quincaillerie-demo/produits/perceuse-percussion-1000.webp', 'Perceuse à percussion en cours de perçage sur un établi', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000014', 'quincaillerie-demo/produits/coffret-forets-1000.webp', 'Coffret de forets HSS rangés par diamètre', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000015', 'quincaillerie-demo/produits/forets-metal-1000.webp', 'Deux forets métal sur fond jaune', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000016', 'quincaillerie-demo/produits/embouts-vissage-1000.webp', 'Embouts de vissage alignés dans leur coffret', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000017', 'quincaillerie-demo/produits/scie-circulaire-1000.webp', 'Scie circulaire posée contre un pied de table', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000018', 'quincaillerie-demo/produits/lame-scie-circulaire-1000.webp', 'Lame de scie circulaire posée sur une planche', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000019', 'quincaillerie-demo/produits/coffret-douilles-1000.webp', 'Clé à cliquet et douilles alignées', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000020', 'quincaillerie-demo/produits/jeu-cles-mixtes-1000.webp', 'Clés mixtes et visserie sur un établi', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000021', 'quincaillerie-demo/produits/vis-placo-1000.webp', 'Vis noires phosphatées sur fond blanc', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000022', 'quincaillerie-demo/produits/assortiment-visserie-1000.webp', 'Mallette à compartiments pleine de vis', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000023', 'quincaillerie-demo/produits/gants-protection-1000.webp', 'Mains gantées traçant une coupe sur une poutre', 1),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8003-000000000024', 'quincaillerie-demo/produits/casque-chantier-1000.webp', 'Casque de chantier bleu sur fond blanc', 1);


-- ---------------------------------------------------------------------
-- Maison Selma : prêt-à-porter de démonstration (gabarit éditorial)
-- ---------------------------------------------------------------------
insert into public.zones_livraison (id, boutique_id, nom_fr, frais_millimes, delai_jours_min, delai_jours_max, position) values
  ('00000000-0000-4000-8001-000000000031', '00000000-0000-4000-8000-000000000003', 'Grand Tunis',       7000, 1, 2, 1),
  ('00000000-0000-4000-8001-000000000032', '00000000-0000-4000-8000-000000000003', 'Reste de la Tunisie', 7000, 2, 4, 2);

insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
select '00000000-0000-4000-8000-000000000003', g.code,
       case when g.code in ('tunis', 'ariana', 'ben-arous', 'manouba') then '00000000-0000-4000-8001-000000000031'::uuid
            else '00000000-0000-4000-8001-000000000032'::uuid end
from public.gouvernorats g;

insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, description_fr, image_chemin, position) values
  ('00000000-0000-4000-8002-000000000101', '00000000-0000-4000-8000-000000000003', null, 'robes', 'Robes', 'Lin, voile de coton, satin : les robes de la saison.', 'maison-selma/produits/robe-longue-boheme-1200.webp', 1),
  ('00000000-0000-4000-8002-000000000102', '00000000-0000-4000-8000-000000000003', null, 'maille', 'Maille', 'Mérinos, coton, grosse maille : pour les soirées fraîches.', 'maison-selma/produits/pull-laine-olive-1-1200.webp', 2),
  ('00000000-0000-4000-8002-000000000103', '00000000-0000-4000-8000-000000000003', null, 'chemises', 'Chemises', 'Popeline et lin, coupes droites ou amples.', 'maison-selma/produits/chemise-lin-ample-1200.webp', 3),
  ('00000000-0000-4000-8002-000000000104', '00000000-0000-4000-8000-000000000003', null, 'homme', 'Homme', 'Les essentiels du vestiaire masculin.', 'maison-selma/produits/blazer-laine-1200.webp', 4),
  ('00000000-0000-4000-8002-000000000105', '00000000-0000-4000-8000-000000000003', null, 'chaussures-et-sacs', 'Chaussures et sacs', 'Cuir pleine fleur, tanné en Tunisie.', 'maison-selma/produits/sac-cuir-cognac-1200.webp', 5);

insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, description_fr, marque, prix_min_millimes, publie, mis_en_avant, position) values
  ('00000000-0000-4000-8003-000000000101', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-bretelles-terracotta', 'Robe à bretelles en lin', 'Lin lavé, bretelles fines réglables, longueur genou. Doublée jusqu''à la taille, elle reste fraîche par grosse chaleur.', null, 229000, true, true, 1),
  ('00000000-0000-4000-8003-000000000102', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-longue-boheme', 'Robe longue en voile de coton', 'Voile de coton brodé, volants superposés, manches courtes. Se porte ceinturée ou libre.', null, 289000, true, true, 2),
  ('00000000-0000-4000-8003-000000000103', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-midi-jersey', 'Robe midi en jersey', 'Jersey de viscose fluide, encolure montante, fente sur le côté. Ne se froisse pas en voyage.', null, 199000, true, false, 3),
  ('00000000-0000-4000-8003-000000000104', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-chemise-vichy', 'Robe chemise vichy', 'Coton vichy, patte boutonnée, manches trois-quarts. Coupe droite, un peu ample.', null, 219000, true, false, 4),
  ('00000000-0000-4000-8003-000000000105', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-longue-satin', 'Robe longue en satin', 'Satin souple, épaules dénudées, longueur cheville. La robe des mariages d''été.', null, 329000, true, true, 5),
  ('00000000-0000-4000-8003-000000000106', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-a-pois', 'Robe à pois', 'Crêpe léger imprimé pois, décolleté cache-cœur, jupe évasée.', null, 209000, true, false, 6),
  ('00000000-0000-4000-8003-000000000107', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'combishort-fleurs', 'Combishort imprimé fleurs', 'Viscose imprimée, manches longues bouffantes, ceinture en cuir fournie.', null, 239000, true, false, 7),
  ('00000000-0000-4000-8003-000000000108', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000101', 'robe-pull-maille-fine', 'Robe pull en maille fine', 'Maille fine de coton et cachemire, col roulé souple, longueur mi-cuisse.', null, 249000, true, false, 8),
  ('00000000-0000-4000-8003-000000000109', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000102', 'pull-merinos', 'Pull col rond en laine mérinos', 'Mérinos extra-fin, bords côtes, coupe légèrement ample. Lavable en machine à froid.', null, 189000, true, true, 9),
  ('00000000-0000-4000-8003-000000000110', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000102', 'pull-maille-chinee', 'Pull en maille chinée', 'Coton et laine, maille chinée, poignets longs à retourner.', null, 169000, true, false, 10),
  ('00000000-0000-4000-8003-000000000111', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000102', 'gilet-grosse-maille', 'Gilet enveloppant en grosse maille', 'Grosse maille anglaise, se porte ouvert ou croisé. Le vêtement des soirées au bord de la mer.', null, 199000, true, false, 11),
  ('00000000-0000-4000-8003-000000000112', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000103', 'chemise-popeline', 'Chemise en popeline de coton', 'Popeline de coton peigné, deux poches plaquées, boutons nacre.', null, 139000, true, false, 12),
  ('00000000-0000-4000-8003-000000000113', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000103', 'chemise-lin-ample', 'Chemise ample en lin', 'Lin européen lavé, col classique, coupe ample à porter ouverte sur un débardeur.', null, 159000, true, false, 13),
  ('00000000-0000-4000-8003-000000000114', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000104', 'polo-coton-pique', 'Polo en coton piqué', 'Coton piqué 220 g, col côtelé, patte deux boutons. Tient sa forme lavage après lavage.', null, 99000, true, true, 14),
  ('00000000-0000-4000-8003-000000000115', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000104', 'blazer-laine-froide', 'Blazer en laine froide', 'Laine froide 250 g, entoilage souple, deux boutons, doublure bemberg. Coupe ajustée.', null, 459000, true, false, 15),
  ('00000000-0000-4000-8003-000000000116', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000104', 'pull-col-rond-coton', 'Pull col rond en coton', 'Coton biologique tricoté serré, col rond côtelé, coupe droite.', null, 149000, true, false, 16),
  ('00000000-0000-4000-8003-000000000117', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000105', 'derbies-cuir', 'Derbies en cuir', 'Cuir de veau pleine fleur, bout fleuri, semelle cuir et gomme. Montées à Sfax.', null, 269000, true, true, 17),
  ('00000000-0000-4000-8003-000000000118', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000105', 'mocassins-cuir', 'Mocassins en cuir', 'Cuir box noir, mors métallique, semelle cuir. Se portent sans chaussettes.', null, 249000, true, false, 18),
  ('00000000-0000-4000-8003-000000000119', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8002-000000000105', 'sac-voyage-cuir', 'Sac de voyage en cuir', 'Cuir de buffle tanné végétal, deux poches plaquées, bandoulière amovible. Format cabine.', null, 349000, true, true, 19);

insert into public.produit_options (boutique_id, produit_id, cle, label_fr, position) values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000101', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000101', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000102', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000102', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000103', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000103', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000104', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000104', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000105', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000105', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000106', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000106', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000107', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000107', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000108', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000108', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000109', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000109', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000110', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000110', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000111', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000111', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000112', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000112', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000113', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000113', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000114', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000114', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000115', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000115', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000116', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000116', 'taille', 'Taille', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000117', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000117', 'pointure', 'Pointure', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000118', 'couleur', 'Couleur', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000118', 'pointure', 'Pointure', 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000119', 'couleur', 'Couleur', 1);

-- Le stock initial entre au journal tout seul (trigger de la migration 03).
insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position)
select '00000000-0000-4000-8000-000000000003', v.produit_id::uuid, v.sku, v.options::jsonb, v.prix_millimes, v.prix_barre_millimes, v.stock, v.poids_grammes, v.position
from (values
  ('00000000-0000-4000-8003-000000000101', 'SEL01-TER-XS', '{"couleur": "Terracotta", "taille": "XS"}', 229000::bigint, null::bigint, 3, 350, 1::smallint),
  ('00000000-0000-4000-8003-000000000101', 'SEL01-TER-S', '{"couleur": "Terracotta", "taille": "S"}', 229000::bigint, null::bigint, 6, 350, 2::smallint),
  ('00000000-0000-4000-8003-000000000101', 'SEL01-TER-M', '{"couleur": "Terracotta", "taille": "M"}', 229000::bigint, null::bigint, 4, 350, 3::smallint),
  ('00000000-0000-4000-8003-000000000101', 'SEL01-TER-L', '{"couleur": "Terracotta", "taille": "L"}', 229000::bigint, null::bigint, 1, 350, 4::smallint),
  ('00000000-0000-4000-8003-000000000102', 'SEL02-ECR-S', '{"couleur": "Écru", "taille": "S"}', 289000::bigint, null::bigint, 4, 420, 1::smallint),
  ('00000000-0000-4000-8003-000000000102', 'SEL02-ECR-M', '{"couleur": "Écru", "taille": "M"}', 289000::bigint, null::bigint, 5, 420, 2::smallint),
  ('00000000-0000-4000-8003-000000000102', 'SEL02-ECR-L', '{"couleur": "Écru", "taille": "L"}', 289000::bigint, null::bigint, 2, 420, 3::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-GRI-XS', '{"couleur": "Gris perle", "taille": "XS"}', 199000::bigint, null::bigint, 2, 380, 1::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-GRI-S', '{"couleur": "Gris perle", "taille": "S"}', 199000::bigint, null::bigint, 5, 380, 2::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-GRI-M', '{"couleur": "Gris perle", "taille": "M"}', 199000::bigint, null::bigint, 6, 380, 3::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-GRI-L', '{"couleur": "Gris perle", "taille": "L"}', 199000::bigint, null::bigint, 4, 380, 4::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-GRI-XL', '{"couleur": "Gris perle", "taille": "XL"}', 199000::bigint, null::bigint, 0, 380, 5::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-NOI-XS', '{"couleur": "Noir", "taille": "XS"}', 199000::bigint, null::bigint, 3, 380, 6::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-NOI-S', '{"couleur": "Noir", "taille": "S"}', 199000::bigint, null::bigint, 4, 380, 7::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-NOI-M', '{"couleur": "Noir", "taille": "M"}', 199000::bigint, null::bigint, 4, 380, 8::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-NOI-L', '{"couleur": "Noir", "taille": "L"}', 199000::bigint, null::bigint, 2, 380, 9::smallint),
  ('00000000-0000-4000-8003-000000000103', 'SEL03-NOI-XL', '{"couleur": "Noir", "taille": "XL"}', 199000::bigint, null::bigint, 1, 380, 10::smallint),
  ('00000000-0000-4000-8003-000000000104', 'SEL04-VIC-S', '{"couleur": "Vichy noir", "taille": "S"}', 219000::bigint, null::bigint, 5, 330, 1::smallint),
  ('00000000-0000-4000-8003-000000000104', 'SEL04-VIC-M', '{"couleur": "Vichy noir", "taille": "M"}', 219000::bigint, null::bigint, 7, 330, 2::smallint),
  ('00000000-0000-4000-8003-000000000104', 'SEL04-VIC-L', '{"couleur": "Vichy noir", "taille": "L"}', 219000::bigint, null::bigint, 3, 330, 3::smallint),
  ('00000000-0000-4000-8003-000000000105', 'SEL05-ROS-S', '{"couleur": "Rose poudré", "taille": "S"}', 329000::bigint, null::bigint, 2, 410, 1::smallint),
  ('00000000-0000-4000-8003-000000000105', 'SEL05-ROS-M', '{"couleur": "Rose poudré", "taille": "M"}', 329000::bigint, null::bigint, 3, 410, 2::smallint),
  ('00000000-0000-4000-8003-000000000105', 'SEL05-ROS-L', '{"couleur": "Rose poudré", "taille": "L"}', 329000::bigint, null::bigint, 1, 410, 3::smallint),
  ('00000000-0000-4000-8003-000000000106', 'SEL06-BLE-XS', '{"couleur": "Bleu marine", "taille": "XS"}', 209000::bigint, null::bigint, 1, 300, 1::smallint),
  ('00000000-0000-4000-8003-000000000106', 'SEL06-BLE-S', '{"couleur": "Bleu marine", "taille": "S"}', 209000::bigint, null::bigint, 4, 300, 2::smallint),
  ('00000000-0000-4000-8003-000000000106', 'SEL06-BLE-M', '{"couleur": "Bleu marine", "taille": "M"}', 209000::bigint, null::bigint, 5, 300, 3::smallint),
  ('00000000-0000-4000-8003-000000000106', 'SEL06-BLE-L', '{"couleur": "Bleu marine", "taille": "L"}', 209000::bigint, null::bigint, 2, 300, 4::smallint),
  ('00000000-0000-4000-8003-000000000107', 'SEL07-NOI-S', '{"couleur": "Noir fleuri", "taille": "S"}', 239000::bigint, null::bigint, 3, 280, 1::smallint),
  ('00000000-0000-4000-8003-000000000107', 'SEL07-NOI-M', '{"couleur": "Noir fleuri", "taille": "M"}', 239000::bigint, null::bigint, 0, 280, 2::smallint),
  ('00000000-0000-4000-8003-000000000107', 'SEL07-NOI-L', '{"couleur": "Noir fleuri", "taille": "L"}', 239000::bigint, null::bigint, 2, 280, 3::smallint),
  ('00000000-0000-4000-8003-000000000108', 'SEL08-SAB-S', '{"couleur": "Sable", "taille": "S"}', 249000::bigint, null::bigint, 4, 450, 1::smallint),
  ('00000000-0000-4000-8003-000000000108', 'SEL08-SAB-M', '{"couleur": "Sable", "taille": "M"}', 249000::bigint, null::bigint, 4, 450, 2::smallint),
  ('00000000-0000-4000-8003-000000000108', 'SEL08-SAB-L', '{"couleur": "Sable", "taille": "L"}', 249000::bigint, null::bigint, 3, 450, 3::smallint),
  ('00000000-0000-4000-8003-000000000109', 'SEL09-VER-S', '{"couleur": "Vert olive", "taille": "S"}', 189000::bigint, null::bigint, 6, 320, 1::smallint),
  ('00000000-0000-4000-8003-000000000109', 'SEL09-VER-M', '{"couleur": "Vert olive", "taille": "M"}', 189000::bigint, null::bigint, 8, 320, 2::smallint),
  ('00000000-0000-4000-8003-000000000109', 'SEL09-VER-L', '{"couleur": "Vert olive", "taille": "L"}', 189000::bigint, null::bigint, 5, 320, 3::smallint),
  ('00000000-0000-4000-8003-000000000110', 'SEL10-GRI-S', '{"couleur": "Gris chiné", "taille": "S"}', 169000::bigint, null::bigint, 5, 380, 1::smallint),
  ('00000000-0000-4000-8003-000000000110', 'SEL10-GRI-M', '{"couleur": "Gris chiné", "taille": "M"}', 169000::bigint, null::bigint, 6, 380, 2::smallint),
  ('00000000-0000-4000-8003-000000000110', 'SEL10-GRI-L', '{"couleur": "Gris chiné", "taille": "L"}', 169000::bigint, null::bigint, 4, 380, 3::smallint),
  ('00000000-0000-4000-8003-000000000111', 'SEL11-GRI-SM', '{"couleur": "Gris perle", "taille": "S/M"}', 199000::bigint, null::bigint, 4, 650, 1::smallint),
  ('00000000-0000-4000-8003-000000000111', 'SEL11-GRI-LXL', '{"couleur": "Gris perle", "taille": "L/XL"}', 199000::bigint, null::bigint, 2, 650, 2::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLA-XS', '{"couleur": "Blanc", "taille": "XS"}', 139000::bigint, null::bigint, 3, 220, 1::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLA-S', '{"couleur": "Blanc", "taille": "S"}', 139000::bigint, null::bigint, 6, 220, 2::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLA-M', '{"couleur": "Blanc", "taille": "M"}', 139000::bigint, null::bigint, 6, 220, 3::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLA-L', '{"couleur": "Blanc", "taille": "L"}', 139000::bigint, null::bigint, 4, 220, 4::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLE-XS', '{"couleur": "Bleu ciel", "taille": "XS"}', 139000::bigint, null::bigint, 2, 220, 5::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLE-S', '{"couleur": "Bleu ciel", "taille": "S"}', 139000::bigint, null::bigint, 3, 220, 6::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLE-M', '{"couleur": "Bleu ciel", "taille": "M"}', 139000::bigint, null::bigint, 3, 220, 7::smallint),
  ('00000000-0000-4000-8003-000000000112', 'SEL12-BLE-L', '{"couleur": "Bleu ciel", "taille": "L"}', 139000::bigint, null::bigint, 0, 220, 8::smallint),
  ('00000000-0000-4000-8003-000000000113', 'SEL13-BLA-S', '{"couleur": "Blanc", "taille": "S"}', 159000::bigint, null::bigint, 5, 230, 1::smallint),
  ('00000000-0000-4000-8003-000000000113', 'SEL13-BLA-M', '{"couleur": "Blanc", "taille": "M"}', 159000::bigint, null::bigint, 7, 230, 2::smallint),
  ('00000000-0000-4000-8003-000000000113', 'SEL13-BLA-L', '{"couleur": "Blanc", "taille": "L"}', 159000::bigint, null::bigint, 4, 230, 3::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLE-S', '{"couleur": "Bleu marine", "taille": "S"}', 99000::bigint, null::bigint, 6, 240, 1::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLE-M', '{"couleur": "Bleu marine", "taille": "M"}', 99000::bigint, null::bigint, 9, 240, 2::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLE-L', '{"couleur": "Bleu marine", "taille": "L"}', 99000::bigint, null::bigint, 8, 240, 3::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLE-XL', '{"couleur": "Bleu marine", "taille": "XL"}', 99000::bigint, null::bigint, 4, 240, 4::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLA-S', '{"couleur": "Blanc", "taille": "S"}', 99000::bigint, null::bigint, 5, 240, 5::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLA-M', '{"couleur": "Blanc", "taille": "M"}', 99000::bigint, null::bigint, 6, 240, 6::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLA-L', '{"couleur": "Blanc", "taille": "L"}', 99000::bigint, null::bigint, 6, 240, 7::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-BLA-XL', '{"couleur": "Blanc", "taille": "XL"}', 99000::bigint, null::bigint, 3, 240, 8::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-VER-S', '{"couleur": "Vert olive", "taille": "S"}', 99000::bigint, null::bigint, 3, 240, 9::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-VER-M', '{"couleur": "Vert olive", "taille": "M"}', 99000::bigint, null::bigint, 4, 240, 10::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-VER-L', '{"couleur": "Vert olive", "taille": "L"}', 99000::bigint, null::bigint, 2, 240, 11::smallint),
  ('00000000-0000-4000-8003-000000000114', 'SEL14-VER-XL', '{"couleur": "Vert olive", "taille": "XL"}', 99000::bigint, null::bigint, 0, 240, 12::smallint),
  ('00000000-0000-4000-8003-000000000115', 'SEL15-GRI-46', '{"couleur": "Gris anthracite", "taille": "46"}', 459000::bigint, null::bigint, 1, 900, 1::smallint),
  ('00000000-0000-4000-8003-000000000115', 'SEL15-GRI-48', '{"couleur": "Gris anthracite", "taille": "48"}', 459000::bigint, null::bigint, 3, 900, 2::smallint),
  ('00000000-0000-4000-8003-000000000115', 'SEL15-GRI-50', '{"couleur": "Gris anthracite", "taille": "50"}', 459000::bigint, null::bigint, 3, 900, 3::smallint),
  ('00000000-0000-4000-8003-000000000115', 'SEL15-GRI-52', '{"couleur": "Gris anthracite", "taille": "52"}', 459000::bigint, null::bigint, 2, 900, 4::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-BLE-S', '{"couleur": "Bleu marine", "taille": "S"}', 149000::bigint, null::bigint, 4, 420, 1::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-BLE-M', '{"couleur": "Bleu marine", "taille": "M"}', 149000::bigint, null::bigint, 6, 420, 2::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-BLE-L', '{"couleur": "Bleu marine", "taille": "L"}', 149000::bigint, null::bigint, 6, 420, 3::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-BLE-XL', '{"couleur": "Bleu marine", "taille": "XL"}', 149000::bigint, null::bigint, 3, 420, 4::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-GRI-S', '{"couleur": "Gris chiné", "taille": "S"}', 149000::bigint, null::bigint, 3, 420, 5::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-GRI-M', '{"couleur": "Gris chiné", "taille": "M"}', 149000::bigint, null::bigint, 4, 420, 6::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-GRI-L', '{"couleur": "Gris chiné", "taille": "L"}', 149000::bigint, null::bigint, 4, 420, 7::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-GRI-XL', '{"couleur": "Gris chiné", "taille": "XL"}', 149000::bigint, null::bigint, 2, 420, 8::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-ECR-S', '{"couleur": "Écru", "taille": "S"}', 149000::bigint, null::bigint, 2, 420, 9::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-ECR-M', '{"couleur": "Écru", "taille": "M"}', 149000::bigint, null::bigint, 3, 420, 10::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-ECR-L', '{"couleur": "Écru", "taille": "L"}', 149000::bigint, null::bigint, 3, 420, 11::smallint),
  ('00000000-0000-4000-8003-000000000116', 'SEL16-ECR-XL', '{"couleur": "Écru", "taille": "XL"}', 149000::bigint, null::bigint, 1, 420, 12::smallint),
  ('00000000-0000-4000-8003-000000000117', 'SEL17-FAU-40', '{"couleur": "Fauve", "pointure": "40"}', 269000::bigint, null::bigint, 2, 1100, 1::smallint),
  ('00000000-0000-4000-8003-000000000117', 'SEL17-FAU-41', '{"couleur": "Fauve", "pointure": "41"}', 269000::bigint, null::bigint, 4, 1100, 2::smallint),
  ('00000000-0000-4000-8003-000000000117', 'SEL17-FAU-42', '{"couleur": "Fauve", "pointure": "42"}', 269000::bigint, null::bigint, 5, 1100, 3::smallint),
  ('00000000-0000-4000-8003-000000000117', 'SEL17-FAU-43', '{"couleur": "Fauve", "pointure": "43"}', 269000::bigint, null::bigint, 3, 1100, 4::smallint),
  ('00000000-0000-4000-8003-000000000117', 'SEL17-FAU-44', '{"couleur": "Fauve", "pointure": "44"}', 269000::bigint, null::bigint, 1, 1100, 5::smallint),
  ('00000000-0000-4000-8003-000000000118', 'SEL18-NOI-40', '{"couleur": "Noir", "pointure": "40"}', 249000::bigint, null::bigint, 1, 900, 1::smallint),
  ('00000000-0000-4000-8003-000000000118', 'SEL18-NOI-41', '{"couleur": "Noir", "pointure": "41"}', 249000::bigint, null::bigint, 3, 900, 2::smallint),
  ('00000000-0000-4000-8003-000000000118', 'SEL18-NOI-42', '{"couleur": "Noir", "pointure": "42"}', 249000::bigint, null::bigint, 4, 900, 3::smallint),
  ('00000000-0000-4000-8003-000000000118', 'SEL18-NOI-43', '{"couleur": "Noir", "pointure": "43"}', 249000::bigint, null::bigint, 2, 900, 4::smallint),
  ('00000000-0000-4000-8003-000000000118', 'SEL18-NOI-44', '{"couleur": "Noir", "pointure": "44"}', 249000::bigint, null::bigint, 0, 900, 5::smallint),
  ('00000000-0000-4000-8003-000000000119', 'SEL19-COG', '{"couleur": "Cognac"}', 349000::bigint, null::bigint, 3, 2100, 1::smallint)
) as v(produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, poids_grammes, position);

insert into public.produit_images (boutique_id, produit_id, chemin, alt_fr, position) values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000101', 'maison-selma/produits/robe-bretelles-terracotta-1-1200.webp', 'Robe à bretelles en lin terracotta, portée', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000101', 'maison-selma/produits/robe-bretelles-terracotta-2-1200.webp', null, 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000101', 'maison-selma/produits/robe-bretelles-terracotta-3-1200.webp', null, 3),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000102', 'maison-selma/produits/robe-longue-boheme-1200.webp', 'Robe longue écrue à volants', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000103', 'maison-selma/produits/robe-midi-grise-1200.webp', 'Robe midi gris perle portée avec un gilet', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000104', 'maison-selma/produits/robe-chemise-vichy-1200.webp', 'Robe chemise à carreaux vichy noir et blanc', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000105', 'maison-selma/produits/robe-longue-satin-rose-1200.webp', 'Robe longue en satin rose poudré', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000106', 'maison-selma/produits/robe-pois-marine-1200.webp', 'Robe bleu marine à pois blancs', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000107', 'maison-selma/produits/combinaison-fleurie-1200.webp', 'Combishort noir à fleurs, ceinture camel', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000108', 'maison-selma/produits/robe-pull-sable-1200.webp', 'Robe pull couleur sable', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000109', 'maison-selma/produits/pull-laine-olive-1-1200.webp', 'Pull en laine mérinos vert olive, porté', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000109', 'maison-selma/produits/pull-laine-olive-2-1200.webp', null, 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000110', 'maison-selma/produits/gilet-maille-chine-1200.webp', 'Pull gris chiné porté avec un jean', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000111', 'maison-selma/produits/pull-cotes-ecru-1200.webp', 'Gilet gris en grosse maille', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000112', 'maison-selma/produits/chemise-popeline-blanche-1200.webp', 'Chemise blanche en popeline à deux poches', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000113', 'maison-selma/produits/chemise-lin-ample-1200.webp', 'Chemise ample en lin blanc', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000114', 'maison-selma/produits/polo-pique-marine-1-1200.webp', 'Polo en coton piqué bleu marine, porté', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000114', 'maison-selma/produits/polo-pique-marine-2-1200.webp', null, 2),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000115', 'maison-selma/produits/blazer-laine-1200.webp', 'Blazer en laine porté sur une chemise', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000116', 'maison-selma/produits/pull-col-rond-marine-1200.webp', 'Pull en coton bleu marine, porté', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000117', 'maison-selma/produits/derbies-cuir-fauve-1200.webp', 'Paire de derbies en cuir fauve', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000118', 'maison-selma/produits/chaussures-cuir-noir-1200.webp', 'Mocassins en cuir noir', 1),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8003-000000000119', 'maison-selma/produits/sac-cuir-cognac-1200.webp', 'Sac de voyage en cuir cognac', 1);


-- ---------------------------------------------------------------------
-- Thèmes. Les fichiers sont dans supabase/fichiers-demo/, rangés comme sur
-- R2 (`<slug>/…`), et servis en local par outils/api-locale.sh.
-- ---------------------------------------------------------------------
-- Maymar : gabarit éditorial, sa propre charte (couleurs par défaut du
-- gabarit). Ouverture et récit sur des photos de démonstration (CC0) : ses
-- produits, eux, attendent leurs vraies photos (état « photo à venir »).
insert into public.themes (boutique_id, code, logo_chemin, logo_ratio, monogramme_chemin, favicon_chemin, textes, sections) values
  ('00000000-0000-4000-8000-000000000001', 'editorial',
   'maymar/marque/logo.svg', 7.497, 'maymar/marque/monogramme.svg', 'maymar/marque/favicon.svg',
   '{"resume_fr": "Bagages et accessoires choisis pour durer. Stock réel, livraison dans toute la Tunisie.",
     "seo_titre_fr": "Maymar — bagages et accessoires, paiement à la livraison",
     "seo_description_fr": "Bagages et accessoires en stock à Tunis. Paiement à la livraison, partout en Tunisie.",
     "origine_fr": "Tunis",
     "politique_retour_fr": "Après acceptation, un échange reste possible sous 7 jours, article non utilisé."}',
   '[{"type": "hero", "lien": "/categorie/valises", "alignement": "fin",
      "textes": {"etiquette_fr": "Bagages et accessoires",
                 "titre_fr": "Des pièces\nqui tiennent.",
                 "chapo_fr": "Une sélection courte, choisie pour durer. Vous voyez le stock réel, vous payez au livreur.",
                 "cta_fr": "Voir les valises",
                 "image_alt_fr": "Valise à roulettes rouge dans une salle d''embarquement"},
      "image": {"chemin": "maymar/accueil/aeroport-large-2000.webp", "chemin_portrait": "maymar/accueil/aeroport-1200.webp"}},
     {"type": "selection", "nombre": 4,
      "textes": {"titre_fr": "En boutique aujourd''hui"}},
     {"type": "editorial", "lien": "/categorie/valises",
      "textes": {"etiquette_fr": "Voyager",
                 "titre_fr": "Partir\nléger.",
                 "texte_fr": "Cabine, moyenne ou grande : chaque fiche donne le poids de la taille choisie. Tout est en stock à Tunis : ce que vous voyez est ce qui part.",
                 "cta_fr": "Voir les valises",
                 "image_alt_fr": "Sac de voyage en toile posé sur un parquet"},
      "image": {"chemin": "maymar/accueil/depart-portrait-1200.webp"}},
     {"type": "engagements"}]');

-- Quincaillerie : gabarit technique, jaune et noir par défaut, sans logo (le
-- nom s'affiche).
insert into public.themes (boutique_id, code, textes, sections) values
  ('00000000-0000-4000-8000-000000000002', 'technique',
   '{"resume_fr": "Outillage, visserie et protection pour les particuliers et les pros. Retrait au comptoir ou livraison dans toute la Tunisie.",
     "origine_fr": "Sfax"}',
   '[{"type": "hero",
      "textes": {"etiquette_fr": "Au comptoir et en ligne",
                 "titre_fr": "L''outillage\ndes pros,\nen stock à Sfax.",
                 "chapo_fr": "Électroportatif, outillage à main, visserie et protection. Le stock affiché est celui du magasin : retrait au comptoir ou livraison partout en Tunisie.",
                 "image_alt_fr": "Gerbe d''étincelles sur un chantier"},
      "image": {"chemin": "quincaillerie-demo/accueil/chantier-2000.webp"}},
     {"type": "rayons"},
     {"type": "selection", "nombre": 10},
     {"type": "selection", "nombre": 5, "rayon": "visserie",
      "textes": {"titre_fr": "Visserie et fixation"}},
     {"type": "engagements"}]');

-- Maison Selma : gabarit éditorial, sans logo (le nom en capitale de
-- titrage), ouverture pleine page en deux cadrages.
insert into public.themes (boutique_id, code, textes, sections) values
  ('00000000-0000-4000-8000-000000000003', 'editorial',
   '{"resume_fr": "Prêt-à-porter et accessoires choisis à Tunis. Des matières naturelles, des coupes qui durent.",
     "seo_titre_fr": "Maison Selma — prêt-à-porter, paiement à la livraison",
     "origine_fr": "Tunis",
     "politique_retour_fr": "Échange possible sous 14 jours, article non porté et étiqueté."}',
   '[{"type": "hero", "lien": "/categorie/robes",
      "textes": {"etiquette_fr": "Collection d''été",
                 "titre_fr": "La saison\nlégère.",
                 "chapo_fr": "Lin, voile de coton, maille fine : des pièces pensées pour la chaleur de Tunis.",
                 "cta_fr": "Découvrir les robes",
                 "image_alt_fr": "Femme en robe noire sous une arcade blanche"},
      "image": {"chemin": "maison-selma/accueil/hero-2000.webp", "chemin_portrait": "maison-selma/accueil/hero-portrait-1200.webp"}},
     {"type": "rayons"},
     {"type": "selection", "nombre": 8,
      "textes": {"titre_fr": "Nouveautés"}},
     {"type": "editorial", "lien": "/catalogue",
      "textes": {"etiquette_fr": "La maison",
                 "titre_fr": "Moins de pièces,\nmieux faites.",
                 "texte_fr": "Chaque modèle est choisi pour sa matière et sa tenue au lavage. Une collection courte, réassortie, plutôt qu''une vitrine qui change toutes les semaines.",
                 "cta_fr": "Tout le catalogue",
                 "image_alt_fr": "Silhouette en robe rouge devant un mur de pierre et des palmiers"},
      "image": {"chemin": "maison-selma/accueil/palmiers-1200.webp"}},
     {"type": "selection", "nombre": 4, "rayon": "homme",
      "textes": {"titre_fr": "Homme"}},
     {"type": "engagements"}]');


-- ---------------------------------------------------------------------
-- Maymar : commandes de démonstration, pour le backoffice
-- ---------------------------------------------------------------------
-- Onze commandes « passées sur la vitrine » ces trois dernières semaines, à
-- toutes les étapes du cycle : trois à confirmer (dont un client qui a déjà
-- refusé un colis, et un appel resté sans réponse), deux à préparer, une
-- chez le livreur, des livrées, une refusée, une annulée. Le chiffrage est
-- celui de la base (private.chiffre_commande) ; les triggers réservent et
-- rendent le stock, numérotent, tracent. Les dates de l'historique sont
-- ensuite recalées sur le récit (le jeu de démo tourne sous postgres).
do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000001';
  c record;
  v_client   uuid;
  v_commande uuid;
  v_devis    jsonb;
  t0         timestamptz;
begin
  for c in select * from (values
    ( 1, 'Mohamed Ali Trabelsi', '+21698321456', '14 rue de Palestine',                         'Sfax',      'sfax',      'VAL-ABS-55-BLE', 1, 28800, 'livree'),
    ( 2, 'Mohamed Ali Trabelsi', '+21698321456', '14 rue de Palestine',                         'Sfax',      'sfax',      'VAL-SPL-55-NOI', 1, 17280, 'refusee'),
    ( 3, 'Nadia Belhaj',         '+21623119065', '5 rue du Lac Léman',                          'Ben Arous', 'ben-arous', 'VAL-ABS-55-NOI', 1,  4300, 'annulee'),
    ( 4, 'Walid Ferchichi',      '+21658440921', 'Cité El Khadra, bloc 12',                     'Tunis',     'tunis',     'VAL-SPL-65-NOI', 1,  3900, 'refusee'),
    ( 5, 'Amira Chaabane',       '+21621778804', '3 rue de Marseille',                          'Tunis',     'tunis',     'VAL-ABS-55-BLE', 1,  3000, 'livree'),
    ( 6, 'Youssef Hamdi',        '+21697552018', 'Route de Tunis km 3',                         'Monastir',  'monastir',  'VAL-SPL-55-NOI', 1,  1700, 'expediee'),
    ( 7, 'Ines Gharbi',          '+21629904512', '22 rue Ibn Khaldoun',                         'Tunis',     'tunis',     'VAL-SET3-NOI',   1,  1500, 'confirmee'),
    ( 8, 'Karim Jlassi',         '+21650113377', '7 avenue de la République',                   'Nabeul',    'nabeul',    'VAL-ABS-65-NOI', 1,  1260, 'confirmee'),
    ( 9, 'Sarra Ben Youssef',    '+21622487190', 'Cité Ennasr 2, immeuble Yasmine, 3e étage',   'Ariana',    'ariana',    'VAL-BUS-55-NOI', 1,   310, 'recue'),
    (10, 'Mohamed Ali Trabelsi', '+21698321456', '14 rue de Palestine',                         'Sfax',      'sfax',      'VAL-SPL-65-NOI', 2,   130, 'recue'),
    (11, 'Hela Mansour',         '+21655666777', 'Avenue Habib Bourguiba, résidence Le Lac, bloc B', 'Sousse', 'sousse', 'VAL-ABS-55-NOI', 1,    25, 'recue')
  ) as t(n, nom, tel, ligne1, ville, gouv, sku, qte, minutes, statut)
  order by n
  loop
    t0 := now() - make_interval(mins => c.minutes);

    select id into v_client from public.clients where boutique_id = b and telephone = c.tel and user_id is null;
    if v_client is null then
      insert into public.clients (boutique_id, nom, telephone, created_at) values (b, c.nom, c.tel, t0) returning id into v_client;
    end if;

    v_devis := private.chiffre_commande(b,
      jsonb_build_array(jsonb_build_object('variante_id', (select v.id from public.variantes v where v.boutique_id = b and v.sku = c.sku), 'quantite', c.qte)),
      c.gouv, false);

    insert into public.commandes (boutique_id, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
    values (b, 'vitrine', v_client, c.nom, c.tel, c.ligne1, c.ville, c.gouv, v_devis -> 'zone' ->> 'nom_fr',
            (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
            (v_devis ->> 'total_millimes')::bigint, t0)
    returning id into v_commande;

    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
                                        prix_unitaire_millimes, quantite, total_ligne_millimes)
    select b, v_commande, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle', l ->> 'sku',
           (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer, (l ->> 'total_ligne_millimes')::bigint
    from jsonb_array_elements(v_devis -> 'lignes') l;

    -- Le chemin jusqu'à l'étape du récit.
    if c.statut in ('confirmee', 'expediee', 'livree', 'refusee') then
      insert into public.confirmations (boutique_id, commande_id, canal, resultat, created_at)
      values (b, v_commande, 'appel', 'confirmee', t0 + interval '45 minutes');
      update public.commandes set statut = 'confirmee' where id = v_commande;
    end if;
    if c.statut in ('expediee', 'livree', 'refusee') then
      update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (48210000 + c.n * 137)
       where id = v_commande;
    end if;
    if c.statut = 'livree' then
      update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = v_commande;
    elsif c.statut = 'refusee' then
      update public.commandes set statut = 'refusee', refus_origine = 'client', refus_commentaire = 'Absent au deuxième passage'
       where id = v_commande;
    elsif c.statut = 'annulee' then
      update public.commandes set statut = 'annulee', motif_annulation = 'Commande passée deux fois' where id = v_commande;
    end if;
    if c.n = 9 then
      insert into public.confirmations (boutique_id, commande_id, canal, resultat, note, created_at)
      values (b, v_commande, 'appel', 'injoignable', 'Messagerie, rappeler en fin de journée', t0 + interval '50 minutes');
    end if;

    -- L'historique recalé : confirmée 45 min après, expédiée 20 h après,
    -- livrée ou refusée 44 h après, annulée 2 h après.
    update public.commande_evenements e
       set created_at = t0 + case e.statut_apres
             when 'recue' then interval '0' when 'confirmee' then interval '45 minutes'
             when 'expediee' then interval '20 hours' when 'annulee' then interval '2 hours'
             else interval '44 hours' end
     where e.commande_id = v_commande;
    update public.commandes
       set confirmee_at = case when confirmee_at is not null then t0 + interval '45 minutes' end,
           expediee_at  = case when expediee_at  is not null then t0 + interval '20 hours' end,
           livree_at    = case when livree_at    is not null then t0 + interval '44 hours' end,
           cloturee_at  = case when cloturee_at  is not null then t0 + case statut when 'annulee' then interval '2 hours' else interval '44 hours' end end
     where id = v_commande;
  end loop;
end
$$;
