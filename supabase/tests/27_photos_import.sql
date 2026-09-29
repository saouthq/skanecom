-- =====================================================================
-- 27 · Les photos des produits à l'import, depuis la console (C5)
-- =====================================================================
begin;
\ir outils.psql

select plan(20);

-- Jeu d'essai (outils.psql) : dans A, produit_a (deux déclinaisons,
-- VAL-55-NOIR et VAL-55-OR, une photo) et produit_a_brouillon (une
-- déclinaison, aucune photo) ; dans B, produit_b.

select tests.nouvel_id('lot_1');
select tests.nouvel_id('lot_2');
create function tests.photos(p_produit text) returns table (chemin text, rang smallint, variante_id uuid, lot_import uuid)
language sql as $$
  select i.chemin, i.position, i.variante_id, i.lot_import from public.produit_images i
   where i.produit_id = tests.id(p_produit) order by i.position
$$;
grant execute on all functions in schema tests to service_role;

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_references(%L) $$, tests.id('A')), '42501', null,
  'un visiteur ne lit pas le catalogue à rapprocher');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, null, 'essai-a/produits/x.webp') $$,
  tests.id('proprio_a'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a')), '42501', null,
  'le propriétaire n''appelle pas la fonction de la console');
reset role; select tests.service();
select throws_ok(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, null, %L) $$,
  tests.id('proprio_a'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a_brouillon'),
  'essai-a/produits/' || tests.id('produit_a_brouillon') || '/p1.webp'), '42501', null,
  'la base refuse un acteur qui n''est pas administrateur de la plateforme');

-- ---------------------------------------------------------------------
-- Le catalogue à rapprocher
-- ---------------------------------------------------------------------
select results_eq($$ select (p ->> 'photos')::int, (select array_agg(v ->> 'sku' order by v ->> 'sku') from jsonb_array_elements(p -> 'variantes') v)
                      from jsonb_array_elements(public.console_references(tests.id('A'))) p where p ->> 'id' = tests.id('produit_a')::text $$,
  $$ values (1, array['VAL-55-NOIR', 'VAL-55-OR']) $$, 'chaque produit, ses photos et les références de ses déclinaisons');
select is(jsonb_array_length(public.console_references(tests.id('A'))), 2, 'les produits de A seulement');

-- ---------------------------------------------------------------------
-- Inscrire
-- ---------------------------------------------------------------------
select throws_like(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, null, %L) $$,
  tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a_brouillon'),
  'essai-a/produits/' || tests.id('produit_a') || '/p1.webp'), '%se range sous%',
  'une photo se range dans le dossier de SON produit');
select throws_like(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, %L, %L) $$,
  tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a_brouillon'), tests.id('variante_a'),
  'essai-a/produits/' || tests.id('produit_a_brouillon') || '/p1.webp'), '%n''est pas celle du produit%',
  'la déclinaison d''un autre produit est refusée');

select public.console_ajouter_photo(tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a_brouillon'), null,
  'essai-a/produits/' || tests.id('produit_a_brouillon') || '/p1.webp', 'Brouillon');
select public.console_ajouter_photo(tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a_brouillon'),
  tests.id('variante_a_brouillon'), 'essai-a/produits/' || tests.id('produit_a_brouillon') || '/p2.webp', 'Brouillon, détail');
select public.console_ajouter_photo(tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a'), tests.id('variante_a'),
  'essai-a/produits/' || tests.id('produit_a') || '/noir.webp', 'Valise cabine noire');
select results_eq($$ select rang, variante_id, lot_import from tests.photos('produit_a_brouillon') $$,
  $$ values (0::smallint, null::uuid, tests.id('lot_1')), (1::smallint, tests.id('variante_a_brouillon'), tests.id('lot_1')) $$,
  'les photos s''inscrivent dans l''ordre, attitrées à leur déclinaison, dans leur lot');
select is((select rang from tests.photos('produit_a') where lot_import is not null), 1::smallint,
  'chez un produit qui a déjà sa photo, elles viennent après');

reset role;
select is((select count(*) from plateforme.journal_audit where action = 'catalogue.photos' and cible = tests.id('lot_1')::text), 1::bigint,
  'un lot, une ligne au journal (pas une par photo)');
select tests.service();
select results_eq($$ select l ->> 'qui', (l ->> 'photos')::int, (l ->> 'produits')::int
                      from jsonb_array_elements(public.console_lots_photos(tests.id('A'))) l $$,
  $$ values ('admin_plateforme@tests.skanecom.local'::text, 3, 2) $$, 'le lot compté : qui, combien de photos, combien de produits');

select throws_like(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, null, %L) $$,
  tests.id('admin_plateforme'), tests.id('B'), tests.id('lot_1'), tests.id('produit_b'),
  'essai-b/produits/' || tests.id('produit_b') || '/p1.webp'), '%lot de photos est clos%',
  'le lot d''une boutique ne sert pas à une autre');

reset role;
insert into public.produit_images (boutique_id, produit_id, chemin, position)
select tests.id('A'), tests.id('produit_a'), 'essai-a/produits/plein-' || g || '.webp', 1 + g from generate_series(1, 10) g;
select tests.service();
select throws_like(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, null, %L) $$,
  tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a'),
  'essai-a/produits/' || tests.id('produit_a') || '/treize.webp'), '%déjà 12 photos%', 'douze photos au plus par produit');

-- ---------------------------------------------------------------------
-- Retirer un lot
-- ---------------------------------------------------------------------
reset role;
insert into public.produit_images (boutique_id, produit_id, chemin, position)
values (tests.id('A'), tests.id('produit_a_brouillon'), 'essai-a/produits/a-la-main.webp', 2);
select tests.service();
select results_eq($$ select (r ->> 'retirees')::int, (r ->> 'produits')::int, jsonb_array_length(r -> 'orphelins')
                      from public.console_retirer_lot_photos(tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1')) r $$,
  $$ values (3, 2, 3) $$, 'retirer le lot : ses trois photos, sur deux produits, et les fichiers à effacer');
select results_eq($$ select chemin, rang, lot_import from tests.photos('produit_a_brouillon') $$,
  $$ values ('essai-a/produits/a-la-main.webp'::text, 0::smallint, null::uuid) $$,
  'la photo ajoutée à la main reste, et reprend la première place');
select is((select count(*) from tests.photos('produit_a')), 11::bigint, 'chez l''autre produit, seules les photos du lot partent');
select throws_like(format($$ select public.console_retirer_lot_photos(%L, %L, %L) $$,
  tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1')), '%déjà retirées%', 'un lot ne se retire qu''une fois');
select throws_like(format($$ select public.console_ajouter_photo(%L, %L, %L, %L, null, %L) $$,
  tests.id('admin_plateforme'), tests.id('A'), tests.id('lot_1'), tests.id('produit_a_brouillon'),
  'essai-a/produits/' || tests.id('produit_a_brouillon') || '/p3.webp'), '%lot de photos est clos%',
  'un lot retiré est clos');
select results_eq($$ select l ->> 'retire_le' is not null, l ->> 'retire_par' from jsonb_array_elements(public.console_lots_photos(tests.id('A'))) l $$,
  $$ values (true, 'admin_plateforme@tests.skanecom.local'::text) $$, 'la console voit le lot retiré, et par qui');
reset role;
select is((select count(*) from plateforme.journal_audit where action = 'catalogue.photos_retirees' and cible = tests.id('lot_1')::text), 1::bigint,
  'le retrait au journal');

select * from finish();
rollback;
