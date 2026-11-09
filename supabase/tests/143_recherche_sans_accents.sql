-- =====================================================================
-- 143 · La recherche sans accents, une déclinaison, une faute de frappe
-- =====================================================================
begin;
\ir outils.psql

select plan(10);

-- produit_a devient « Sérum éclat » ; sa déclinaison noire, terracotta.
update public.produits set nom_fr = 'Sérum éclat à la vitamine C' where id = tests.id('produit_a');
update public.variantes set options = '{"couleur": "Terracotta"}' where id = tests.id('variante_a');

select is(public.sans_accents('Sérum ÉCLAT, crème brûlée, œuf'), 'serum eclat, creme brulee, oeuf', 'sans_accents : minuscules, sans accents, œ → oe');

reset role; select tests.anonyme();
create temp table r (q text, n int);
insert into r select q, (public.liste_produits(tests.id('A'), jsonb_build_object('q', q)) ->> 'total')::int
  from unnest(array['sérum', 'serum', 'SERUM', 'eclat', 'éclat', 'terracotta', 'terracota', 'zzz introuvable']) q;
select is((select n from r where q = 'sérum'), 1, 'la vitrine : « sérum » trouve le sérum');
select is((select n from r where q = 'serum'), 1, '« serum », sans accent, aussi');
select is((select n from r where q = 'SERUM'), 1, '« SERUM », en majuscules, aussi');
select is((select n from r where q = 'eclat'), 1, '« eclat » trouve « éclat »');
select is((select n from r where q = 'terracotta'), 1, 'la couleur d''une déclinaison compte');
select is((select n from r where q = 'terracota'), 1, 'une faute de frappe dans la couleur aussi');
select is((select n from r where q = 'zzz introuvable'), 0, 'et rien ne vient pour rien');

reset role; select tests.connecte('lecture_a');
select is(jsonb_array_length(public.gestion_liste_produits(tests.id('A'), 'tous', 'serum') -> 'produits'), 1,
  'le backoffice : « serum » trouve le sérum');
select is(jsonb_array_length(public.gestion_liste_produits(tests.id('A'), 'tous', 'SÉRUM ÉCLAT') -> 'produits'), 1,
  'le backoffice : en majuscules accentuées aussi');

select * from finish();
rollback;
