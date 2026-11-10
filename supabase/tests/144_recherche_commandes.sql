-- =====================================================================
-- 144 · La recherche des commandes au backoffice : sans accents
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

update public.commandes set contact_nom = 'Inès Gharbi' where id = tests.id('commande_a');

reset role; select tests.connecte('lecture_a');
create temp table r (q text, n int);
insert into r select q, (public.gestion_liste_commandes(tests.id('A'), 'toutes', q) ->> 'total')::int
  from unnest(array['Inès', 'ines', 'INES GHARBI', '20 000 001', 'zzz']) q;
select is((select n from r where q = 'Inès'), 1, '« Inès » trouve Inès');
select is((select n from r where q = 'ines'), 1, '« ines », sans accent, aussi');
select is((select n from r where q = 'INES GHARBI'), 1, 'en majuscules, nom et prénom, aussi');
select is((select n from r where q = '20 000 001'), 1, 'le numéro de téléphone, espaces compris, comme avant');
select is((select n from r where q = 'zzz'), 0, 'rien pour rien');

select * from finish();
rollback;
