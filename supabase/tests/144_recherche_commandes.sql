-- =====================================================================
-- 144 · La recherche sans accents : commandes, clients (backoffice), console
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

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

-- Les clients aussi.
reset role;
update public.clients set nom = 'Inès Gharbi' where id = tests.id('fiche_client_a');
select tests.connecte('lecture_a');
select is((public.gestion_liste_clients(tests.id('A'), 'tous', 'ines') ->> 'total')::int, 1, 'la page Clients : « ines » trouve Inès');
select is((public.gestion_liste_clients(tests.id('A'), 'tous', 'INÈS') ->> 'total')::int, 1, 'en majuscules accentuées aussi');

-- La console (service_role, l'acteur administrateur) : le nom d'une boutique, sans accents.
reset role;
update plateforme.boutiques set nom = 'Boutique Éclat' where id = tests.id('A');
set local role service_role;
select ok(exists (select 1 from jsonb_array_elements(public.console_recherche(tests.id('admin_plateforme'), 'eclat')) e where e ->> 'genre' = 'boutique' and e ->> 'titre' = 'Boutique Éclat'), 'la console : « eclat » trouve « Boutique Éclat »');
select ok(exists (select 1 from jsonb_array_elements(public.console_recherche(tests.id('admin_plateforme'), 'ÉCLAT')) e where e ->> 'genre' = 'boutique' and e ->> 'titre' = 'Boutique Éclat'), 'en majuscules accentuées aussi');

select * from finish();
rollback;
