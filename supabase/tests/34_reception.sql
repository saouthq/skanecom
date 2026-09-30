-- =====================================================================
-- 34 · La réception d'un arrivage, en une fois
-- =====================================================================
begin;
\ir outils.psql

select plan(16);

create function tests.indice(p_sql text) returns text
language plpgsql as $$
declare
  v_indice text;
begin
  execute p_sql;
  raise exception 'passée' using hint = '__passee__';
exception when others then
  get stacked diagnostics v_indice = pg_exception_hint;
  return case when v_indice = '__passee__' then null else coalesce(nullif(v_indice, ''), 'sans indice') end;
end;
$$;
grant execute on function tests.indice(text) to anon, authenticated, service_role;

-- Une deuxième déclinaison en vente pour la valise de A (bleue, 2 en stock) ;
-- la noire en a 3 (5, moins les deux réservées par les commandes du jeu).
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('variante_a_bleue'), tests.id('A'), tests.id('produit_a'), 'VAL-55-BLEU', '{"couleur": "Bleu"}', 189000, 2, true);

create function pg_temp.recoit(p_lignes jsonb, p_note text default 'BL 2026-114') returns jsonb language sql as $$
  select public.gestion_reception(tests.id('A'), p_lignes, p_note)
$$;
create function pg_temp.stock(p_nom text) returns integer language sql as $$
  select stock from public.variantes where id = tests.id(p_nom)
$$;

-- ---------------------------------------------------------------------
-- Qui voit, qui reçoit
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_reception_catalogue(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne voit rien');
reset role; select tests.connecte('confirm_a');
select is(tests.indice(format($$ select public.gestion_reception_catalogue(%L) $$, tests.id('A'))), 'role', 'la confirmation ne voit pas la réception…');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 5}]') $$, tests.id('variante_a'))), 'role',
  '… et n''enregistre pas de marchandise');
reset role; select tests.connecte('proprio_b');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 5}]') $$, tests.id('variante_a'))), 'role',
  'une autre boutique ne reçoit pas chez A');

reset role; select tests.connecte('prepa_a');
select results_eq(format($$ select p ->> 'nom', jsonb_array_length(p -> 'variantes')
                              from jsonb_array_elements(public.gestion_reception_catalogue(%L)) p $$, tests.id('A')),
  $$ values ('Brouillon', 1), ('Valise cabine', 2) $$,
  'la préparation voit chaque produit et ses déclinaisons en vente (brouillon compris, déclinaison retirée non)');
select is(public.gestion_reception_catalogue(tests.id('A')) -> 1 -> 'variantes' -> 0 ->> 'libelle', 'Bleu', 'chaque déclinaison avec son libellé, dans l''ordre de la fiche');

-- ---------------------------------------------------------------------
-- Une réception de deux déclinaisons
-- ---------------------------------------------------------------------
select results_eq(format($$ select (r ->> 'declinaisons')::int, (r ->> 'pieces')::int
                              from (select pg_temp.recoit('[{"variante_id": "%s", "quantite": 12}, {"variante_id": "%s", "quantite": 8}]') r) x $$,
                         tests.id('variante_a'), tests.id('variante_a_bleue')),
  $$ values (2, 20) $$, 'deux déclinaisons, vingt pièces, en un geste');
select results_eq($$ select pg_temp.stock('variante_a'), pg_temp.stock('variante_a_bleue') $$, $$ values (15, 10) $$, 'les stocks montent (3 + 12, 2 + 8)');
reset role;
select results_eq(format($$ select count(*)::int, min(motif::text), min(commentaire), count(distinct auteur_id)::int
                              from public.stock_mouvements
                             where boutique_id = %L and variante_id in (%L, %L) and commentaire = 'BL 2026-114' $$,
                         tests.id('A'), tests.id('variante_a'), tests.id('variante_a_bleue')),
  $$ values (2, 'reception', 'BL 2026-114', 1) $$, 'deux mouvements au journal : réception, la note du bon, le même auteur');

-- ---------------------------------------------------------------------
-- Tout ou rien
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 3}, {"variante_id": "%s", "quantite": 3}]') $$,
                              tests.id('variante_a'), tests.id('variante_a_inactive'))), 'variante',
  'une déclinaison retirée de la vente : refusée…');
select is(pg_temp.stock('variante_a'), 15, '… et rien n''est passé, même pour l''autre');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 3}]') $$, tests.id('variante_b'))), 'variante',
  'une déclinaison d''une autre boutique : introuvable');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 0}]') $$, tests.id('variante_a'))), 'quantite',
  'une quantité nulle : non');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 2}, {"variante_id": "%s", "quantite": 1}]') $$,
                              tests.id('variante_a'), tests.id('variante_a'))), 'double', 'la même déclinaison deux fois : non');
select is(tests.indice($$ select pg_temp.recoit('[]') $$), 'lignes', 'une réception vide : non');
select is(tests.indice(format($$ select pg_temp.recoit('[{"variante_id": "%s", "quantite": 1}]', repeat('x', 301)) $$, tests.id('variante_a'))),
  'commentaire', 'une note de plus de 300 caractères : non');

select * from finish();
rollback;
