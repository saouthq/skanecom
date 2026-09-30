-- =====================================================================
-- 29 · L'import des fiches techniques (B9 avec C5)
-- =====================================================================
begin;
\ir outils.psql

select plan(10);

reset role; select tests.service();
select set_config('tests.boutique', public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-fiches', 'Essai fiches', 'essai-fiches.test')::text, true);

create function pg_temp.b() returns uuid language sql as $$ select current_setting('tests.boutique')::uuid $$;
create function pg_temp.l(p_ligne integer, p_produit text, p_ref text, p_car jsonb default '{}', p_options jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('ligne', p_ligne, 'produit', p_produit,
           'produit_slug', lower(regexp_replace(p_produit, '[^A-Za-z0-9]+', '-', 'g')),
           'reference', p_ref, 'prix_millimes', 100000, 'prix_barre_millimes', null, 'stock', 3, 'rayon', '[]'::jsonb,
           'marque', null, 'description', null, 'poids_grammes', null, 'publie', null, 'options', p_options,
           'caracteristiques', p_car, 'erreurs', '[]'::jsonb)
$$;
create function pg_temp.rapport(p_id uuid) returns jsonb language sql as $$
  select public.console_import(p_id) -> 'rapport'
$$;
create function pg_temp.car(p_slug text) returns jsonb language sql as $$
  select caracteristiques from public.produits where boutique_id = pg_temp.b() and slug = p_slug
$$;

-- La boutique définit deux caractéristiques (comme au backoffice).
reset role;
insert into public.attributs (boutique_id, cle, label_fr, unite, type, position) values
  (pg_temp.b(), 'puissance', 'Puissance', 'W', 'nombre', 0),
  (pg_temp.b(), 'alimentation', 'Alimentation', null, 'texte', 1);
select tests.service();

-- ---------------------------------------------------------------------
-- Le rapport
-- ---------------------------------------------------------------------
select set_config('tests.ko', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'ko.xlsx',
  '[{"cle": "version", "label": "Version", "position": 0}]',
  jsonb_build_array(
    pg_temp.l(2, 'Perceuse', 'PER-1', '{"puissance": "710"}', '{"version": "Seule"}'),
    pg_temp.l(3, 'Perceuse', 'PER-2', '{"puissance": "800"}', '{"version": "Kit"}'),
    pg_temp.l(4, 'Scie', 'SCI-1', '{"couple": "32"}')
  ))::text, true);
select ok(exists (select 1 from jsonb_array_elements(pg_temp.rapport(current_setting('tests.ko')::uuid) -> 'erreurs') e
                  where (e ->> 'ligne')::int = 3 and e ->> 'message' like 'Les variantes d''un même produit ont la même Puissance : « 800 » ici, « 710 » ligne 2'),
  'deux lignes d''un même produit qui se contredisent sur une caractéristique sont signalées');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.rapport(current_setting('tests.ko')::uuid) -> 'erreurs') e
                  where (e ->> 'ligne')::int = 4 and e ->> 'message' like 'Caractéristique inconnue de la boutique : « couple »'),
  'une caractéristique que la boutique n''a pas (ou plus) est signalée');

select set_config('tests.ok', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'ok.xlsx',
  '[{"cle": "version", "label": "Version", "position": 0}]',
  jsonb_build_array(
    pg_temp.l(2, 'Perceuse', 'PER-1', '{"puissance": "710", "alimentation": "Filaire 230 V"}', '{"version": "Seule"}'),
    pg_temp.l(3, 'Perceuse', 'PER-2', '{"puissance": "710"}', '{"version": "Kit"}'),
    pg_temp.l(4, 'Gants', 'GAN-1')
  ))::text, true);
select is((pg_temp.rapport(current_setting('tests.ok')::uuid) ->> 'erreurs_total')::int, 0, 'des lignes qui concordent : pas d''erreur');
select is((select jsonb_agg(c ->> 'cle') from jsonb_array_elements(pg_temp.rapport(current_setting('tests.ok')::uuid) -> 'caracteristiques') c),
  '["puissance", "alimentation"]'::jsonb, 'le rapport annonce les caractéristiques reconnues, dans l''ordre de la boutique');
select is((pg_temp.rapport(current_setting('tests.ok')::uuid) ->> 'fiches_techniques')::int, 1, 'et le nombre de fiches techniques touchées');

-- ---------------------------------------------------------------------
-- Appliquer
-- ---------------------------------------------------------------------
select public.console_appliquer_import(tests.id('admin_plateforme'), current_setting('tests.ok')::uuid);
select is(pg_temp.car('perceuse'), '{"puissance": "710", "alimentation": "Filaire 230 V"}'::jsonb,
  'la fiche technique du produit reçoit une valeur par caractéristique');
select is(pg_temp.car('gants'), '{}'::jsonb, 'un produit sans valeur n''a pas de fiche technique');
select is((select count(*)::int from public.produit_options o join public.produits p on p.id = o.produit_id
            where p.boutique_id = pg_temp.b() and p.slug = 'perceuse'), 1,
  'la version reste un axe de variante ; les caractéristiques n''en deviennent pas');

-- Un second fichier : une cellule vide ne remplace rien, une valeur change.
select set_config('tests.maj', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'maj.xlsx',
  '[{"cle": "version", "label": "Version", "position": 0}]',
  jsonb_build_array(
    pg_temp.l(2, 'Perceuse', 'PER-1', '{"puissance": "750"}', '{"version": "Seule"}'),
    pg_temp.l(3, 'Perceuse', 'PER-2', '{}', '{"version": "Kit"}')
  ))::text, true);
select public.console_appliquer_import(tests.id('admin_plateforme'), current_setting('tests.maj')::uuid);
select is(pg_temp.car('perceuse'), '{"puissance": "750", "alimentation": "Filaire 230 V"}'::jsonb,
  'réimporter : la puissance change, l''alimentation absente du fichier reste');

-- La base revérifie chaque valeur, même venue d'un fichier.
select set_config('tests.faux', public.console_preparer_import(tests.id('admin_plateforme'), pg_temp.b(), 'faux.xlsx', '[]',
  jsonb_build_array(pg_temp.l(2, 'Scie', 'SCI-1', '{"puissance": "beaucoup"}')))::text, true);
select throws_like(format($$ select public.console_appliquer_import(%L, %L) $$, tests.id('admin_plateforme'), current_setting('tests.faux')),
  '%attend un nombre%', 'un nombre illisible glissé dans les lignes est refusé à l''application : rien n''est importé');

select * from finish();
rollback;
