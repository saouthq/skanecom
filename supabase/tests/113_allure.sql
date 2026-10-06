-- =====================================================================
-- 113 · L'allure de l'interface : un réglage de plus, en liste fermée
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

reset role;
select lives_ok(format($$ update public.themes set style = '{"allure": "contemporaine", "coins": "arrondis"}' where boutique_id = %L $$, tests.id('A')),
  '« contemporaine » est admise, avec les autres réglages');
select is((select style ->> 'allure' from public.themes where boutique_id = tests.id('A')), 'contemporaine', 'la vitrine la lira telle quelle');
select throws_ok(format($$ update public.themes set style = '{"allure": "futuriste"}' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une allure hors liste : refusée');

-- Coupé par défaut : sans la clé, le gabarit décide (l'application lit « classique »).
update public.themes set style = '{}' where boutique_id = tests.id('A');
select is((select style ? 'allure' from public.themes where boutique_id = tests.id('A')), false, 'sans réglage, aucune allure imposée');

select * from finish();
rollback;
