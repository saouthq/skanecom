-- =====================================================================
-- 09 · Import de catalogue : vérifier sans écrire, puis tout ou rien
-- =====================================================================
begin;
\ir outils.psql

select plan(23);

reset role; select tests.service();
select set_config('tests.boutique', public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-import', 'Essai import', 'essai-import.test')::text, true);

create function pg_temp.b() returns uuid language sql as $$ select current_setting('tests.boutique')::uuid $$;
create function pg_temp.l(p_ligne integer, p_produit text, p_ref text, p_prix bigint, p_stock integer default null,
                          p_options jsonb default '{}', p_rayon jsonb default '[]', p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('ligne', p_ligne, 'produit', p_produit,
           'produit_slug', lower(regexp_replace(p_produit, '[^A-Za-z0-9]+', '-', 'g')),
           'reference', p_ref, 'prix_millimes', p_prix, 'prix_barre_millimes', null, 'stock', p_stock, 'rayon', p_rayon,
           'marque', null, 'description', null, 'poids_grammes', null, 'publie', null, 'options', p_options, 'erreurs', '[]'::jsonb)
         || p_extra
$$;
create function pg_temp.axes() returns jsonb language sql as $$
  select '[{"cle": "couleur", "label": "Couleur", "position": 0}, {"cle": "taille", "label": "Taille", "position": 1}]'::jsonb
$$;
create function pg_temp.rapport(p_id uuid) returns jsonb language sql as $$
  select public.console_import(p_id) -> 'rapport'
$$;
create function pg_temp.a_erreur(p_id uuid, p_ligne integer, p_motif text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(pg_temp.rapport(p_id) -> 'erreurs') e
                 where (e ->> 'ligne')::integer = p_ligne and e ->> 'message' like p_motif)
$$;

-- ---------------------------------------------------------------------
-- Un fichier avec des erreurs : rapport précis, rien d'écrit
-- ---------------------------------------------------------------------
select set_config('tests.import_ko', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'erreurs.xlsx', pg_temp.axes(),
  jsonb_build_array(
    pg_temp.l(2, 'Valise rigide', 'VR-1', 189000, 5, '{"couleur": "Noir", "taille": "Cabine"}'),
    pg_temp.l(3, 'Valise rigide', 'VR-1', 199000, 5, '{"couleur": "Noir", "taille": "Moyenne"}'),
    pg_temp.l(4, 'Valise rigide', 'VR-2', 189000, 5, '{"couleur": "Noir", "taille": "Cabine"}'),
    pg_temp.l(5, 'Valise rigide', 'VR-3', 189000, 5, '{"couleur": "Rouge"}'),
    pg_temp.l(6, 'Sac', 'SAC-1', 50000, 1, '{}', '[]', '{"prix_barre_millimes": 40000}'),
    pg_temp.l(7, 'Sac', 'SAC-2', 0, 1, '{}', '[]', '{"erreurs": ["Prix illisible : « abc »"]}'),
    pg_temp.l(8, 'Ceinture', 'CE-1', 30000, 1, '{}', '[{"slug": "homme", "nom": "Homme"}, {"slug": "accessoires", "nom": "Accessoires"}]'),
    pg_temp.l(9, 'Porte-cartes', 'PC-1', 30000, 1, '{}', '[{"slug": "femme", "nom": "Femme"}, {"slug": "accessoires", "nom": "Accessoires"}]')
  ))::text, true);

select ok(pg_temp.a_erreur(current_setting('tests.import_ko')::uuid, 3, 'Référence « VR-1 » en double (déjà ligne 2)'),
  'une référence en double est signalée à sa deuxième ligne');
select ok(pg_temp.a_erreur(current_setting('tests.import_ko')::uuid, 4, 'Même combinaison (couleur, taille) que la ligne 2%'),
  'deux variantes d''un produit avec la même couleur et la même taille sont signalées');
select ok(pg_temp.a_erreur(current_setting('tests.import_ko')::uuid, 5, 'Les variantes d''un même produit renseignent les mêmes colonnes%'),
  'une variante sans taille, quand les autres en ont une, est signalée');
select ok(pg_temp.a_erreur(current_setting('tests.import_ko')::uuid, 6, 'Le prix barré doit être supérieur au prix')
          and pg_temp.a_erreur(current_setting('tests.import_ko')::uuid, 7, 'Prix illisible%'),
  'prix barré trop bas et prix illisible sont signalés, avec leur ligne');
select ok(pg_temp.a_erreur(current_setting('tests.import_ko')::uuid, 8, 'Le rayon « Accessoires » apparaît sous deux rayons différents%'),
  'un même nom de rayon sous deux rayons différents est signalé');
select is((select count(*)::integer from public.produits where boutique_id = pg_temp.b()), 0,
  'préparer n''écrit rien au catalogue');
select throws_ok(format('select public.console_appliquer_import(%L, %L)', tests.id('admin_plateforme'), current_setting('tests.import_ko')),
  '23514', null, 'un import avec des erreurs ne s''applique pas');

-- ---------------------------------------------------------------------
-- Un fichier propre : créé en une fois
-- ---------------------------------------------------------------------
select set_config('tests.import', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'catalogue.xlsx', pg_temp.axes(),
  jsonb_build_array(
    pg_temp.l(2, 'Valise rigide', 'VR-55-N', 189000, 12, '{"couleur": "Noir", "taille": "Cabine 55 cm"}',
              '[{"slug": "bagages", "nom": "Bagages"}, {"slug": "valises", "nom": "Valises"}]', '{"description": "Coque ABS", "marque": "Maymar"}'),
    pg_temp.l(3, 'Valise rigide', 'VR-65-N', 259000, 4, '{"couleur": "Noir", "taille": "Moyenne 65 cm"}',
              '[{"slug": "bagages", "nom": "Bagages"}, {"slug": "valises", "nom": "Valises"}]', '{"prix_barre_millimes": 289000}'),
    pg_temp.l(4, 'Sac de voyage', 'SV-1', 99000, 0, '{}', '[{"slug": "bagages", "nom": "Bagages"}, {"slug": "sacs", "nom": "Sacs"}]',
              '{"publie": false}')
  ))::text, true);

select results_eq($$ select (r ->> 'produits_nouveaux')::int, (r ->> 'variantes_nouvelles')::int, (r ->> 'erreurs_total')::int,
                            jsonb_array_length(r -> 'rayons_nouveaux')
                     from pg_temp.rapport(current_setting('tests.import')::uuid) r $$,
  $$ values (2, 3, 0, 3) $$, 'rapport : 2 produits, 3 variantes, 3 rayons nouveaux, aucune erreur');
select ok(public.console_appliquer_import(tests.id('admin_plateforme'), current_setting('tests.import')::uuid) ? 'lignes',
  'l''administrateur applique l''import');

select results_eq($$ select c.slug, p.slug from public.categories c left join public.categories p on p.id = c.parent_id
                     where c.boutique_id = pg_temp.b() order by c.slug $$,
  $$ values ('bagages'::text, null::text), ('sacs', 'bagages'), ('valises', 'bagages') $$,
  'les rayons sont créés avec leur parent (« Bagages > Valises »)');
select results_eq($$ select p.slug, p.publie, c.slug, p.description_fr, p.prix_min_millimes from public.produits p
                     join public.categories c on c.id = p.categorie_id where p.boutique_id = pg_temp.b() order by p.slug $$,
  $$ values ('sac-de-voyage'::text, false, 'sacs'::text, null::text, 99000::bigint),
            ('valise-rigide', true, 'valises', 'Coque ABS', 189000) $$,
  'produits : publiés sauf « Publié : non », dans leur rayon, prix « à partir de » calculé');
select results_eq($$ select v.sku, v.options ->> 'taille', v.prix_millimes, v.prix_barre_millimes, v.stock from public.variantes v
                     where v.boutique_id = pg_temp.b() order by v.sku $$,
  $$ values ('SV-1'::text, null::text, 99000::bigint, null::bigint, 0),
            ('VR-55-N', 'Cabine 55 cm', 189000, null, 12),
            ('VR-65-N', 'Moyenne 65 cm', 259000, 289000, 4) $$,
  'variantes : références, axes, prix, prix barrés, stocks');
select results_eq($$ select o.cle, o.label_fr from public.produit_options o join public.produits p on p.id = o.produit_id
                     where p.slug = 'valise-rigide' and o.boutique_id = pg_temp.b() order by o.position $$,
  $$ values ('couleur'::text, 'Couleur'::text), ('taille', 'Taille') $$, 'les axes de la valise portent le nom des colonnes');
select is_empty($$ select v.sku from public.variantes v
                   where v.boutique_id = pg_temp.b()
                     and v.stock <> coalesce((select sum(m.delta) from public.stock_mouvements m where m.variante_id = v.id), 0) $$,
  'le journal du stock explique chaque stock importé');
select is((select statut from plateforme.imports where id = current_setting('tests.import')::uuid), 'applique',
  'l''import est marqué appliqué');
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = pg_temp.b() and action = 'catalogue.importer'), 1,
  'l''import est tracé au journal');
select throws_ok(format('select public.console_appliquer_import(%L, %L)', tests.id('admin_plateforme'), current_setting('tests.import')),
  '23514', null, 'un import ne s''applique qu''une fois');

-- ---------------------------------------------------------------------
-- Réimport partiel : prix et stock seulement
-- ---------------------------------------------------------------------
select set_config('tests.reimport', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'prix-septembre.csv', pg_temp.axes(),
  jsonb_build_array(pg_temp.l(2, 'Valise rigide', 'VR-55-N', 179000, 9, '{"couleur": "Noir", "taille": "Cabine 55 cm"}')))::text, true);
select results_eq($$ select (r ->> 'produits_nouveaux')::int, (r ->> 'variantes_modifiees')::int, (r ->> 'stocks_ajustes')::int
                     from pg_temp.rapport(current_setting('tests.reimport')::uuid) r $$,
  $$ values (0, 1, 1) $$, 'réimport : rien de nouveau, une variante modifiée, un stock ajusté');
select public.console_appliquer_import(tests.id('admin_plateforme'), current_setting('tests.reimport')::uuid);
select results_eq($$ select v.prix_millimes, v.stock, p.description_fr, p.marque from public.variantes v
                     join public.produits p on p.id = v.produit_id where v.sku = 'VR-55-N' and v.boutique_id = pg_temp.b() $$,
  $$ values (179000::bigint, 9, 'Coque ABS'::text, 'Maymar'::text) $$,
  'le prix et le stock changent ; les cellules vides n''effacent ni la description ni la marque');
select results_eq($$ select m.delta, m.motif::text, m.commentaire from public.stock_mouvements m
                     join public.variantes v on v.id = m.variante_id where v.sku = 'VR-55-N' and v.boutique_id = pg_temp.b()
                     order by m.created_at $$,
  $$ values (12, 'reception'::text, 'Stock initial'::text), (-3, 'correction', 'Import prix-septembre.csv') $$,
  'le stock passe par un mouvement journalisé, au nom du fichier');

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
select set_config('tests.vol', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'vol.csv', pg_temp.axes(),
  jsonb_build_array(pg_temp.l(2, 'Autre produit', 'VR-65-N', 100000, 1, '{"couleur": "Noir", "taille": "Moyenne 65 cm"}')))::text, true);
select ok(pg_temp.a_erreur(current_setting('tests.vol')::uuid, 2, 'La référence appartient déjà au produit « Valise rigide »%'),
  'une référence ne passe pas d''un produit à un autre par un simple changement de nom');
select throws_ok(format($$ select public.console_preparer_import(%L, %L, 'x.csv', '[]', '[{"ligne": 2}]') $$, tests.id('proprio_a'), pg_temp.b()),
  '42501', null, 'seul un administrateur prépare un import');
reset role; select tests.connecte('proprio_a');
select throws_ok(format('select public.console_appliquer_import(%L, %L)', tests.id('proprio_a'), current_setting('tests.vol')),
  '42501', null, 'un membre de boutique n''appelle pas l''import');

select * from finish();
rollback;
