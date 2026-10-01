-- =====================================================================
-- 53 · Les visites de la vitrine : comptées sans rien de personnel
-- =====================================================================
begin;
\ir outils.psql

select plan(23);

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
create function tests.visites(p_boutique text) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.vitrine_visites where boutique_id = tests.id(p_boutique)
$$;
create function tests.vues(p_boutique text, p_chemin text) returns integer language sql security definer set search_path = '' as $$
  select coalesce(sum(vues), 0)::integer from public.vitrine_pages where boutique_id = tests.id(p_boutique) and chemin = p_chemin
$$;
create function tests.chemins(p_boutique text) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.vitrine_pages where boutique_id = tests.id(p_boutique)
$$;
grant execute on all functions in schema tests to anon, authenticated;

reset role;
select results_eq($$ select type_valeur, defaut, public from plateforme.reglages_catalogue where cle = 'vitrine.statistiques' $$,
  $$ values ('booleen'::text, 'false'::jsonb, true) $$, 'le réglage : coupé par défaut, lu par la vitrine');

-- ---------------------------------------------------------------------
-- Compter
-- ---------------------------------------------------------------------
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-du-navigateur-0001', '/', null, 'telephone');
select is(tests.visites('A'), 0, 'réglage coupé : rien n''est compté');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'vitrine.statistiques', 'true'), (tests.id('C'), 'vitrine.statistiques', 'true');
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-du-navigateur-0001', '/produit/valise-cabine?couleur=noir#avis', 'instagram.com', 'telephone');
select is(tests.visites('A'), 1, 'un visiteur : une visite');
select is(tests.vues('A', '/produit/valise-cabine'), 1, 'la page est comptée sans ses paramètres ni son ancre');
select public.compter_vue(tests.id('A'), 'cle-du-navigateur-0001', '/', 'instagram.com', 'telephone');
select is(tests.visites('A'), 1, 'le même visiteur, une autre page : toujours une visite');
reset role;
select results_eq($$ select entree, source, appareil, pages from public.vitrine_visites where boutique_id = tests.id('A') $$,
  $$ values ('/produit/valise-cabine'::text, 'instagram.com'::text, 'telephone'::text, 2) $$,
  'la visite garde sa page d''entrée, sa source, son appareil, et compte ses pages');
select is((select count(*)::integer from public.vitrine_visites
            where empreinte = sha256(convert_to('cle-du-navigateur-0001', 'UTF8'))
               or empreinte = sha256(convert_to(tests.id('A')::text || 'cle-du-navigateur-0001', 'UTF8'))), 0,
  'l''empreinte n''est pas la clé du navigateur, ni son simple hachage : il y faut le sel du jour');
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-d-un-autre-0002', '/panier/2f1c7d4e-8a9b-4c3d-9e8f-0a1b2c3d4e5f', 'www.google.com', 'ordinateur');
select is(tests.visites('A'), 2, 'un autre navigateur : une deuxième visite');
select is(tests.vues('A', '/panier/:id'), 1, 'un identifiant dans l''adresse (le lien d''un panier) n''est pas gardé');
reset role;
select is((select source from public.vitrine_visites where boutique_id = tests.id('A') and entree = '/panier/:id'), 'google.com',
  'la source, sans « www. » : un site, un nom');
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-d-un-autre-0002', 'javascript:alert(1)', null, 'ordinateur');
select public.compter_vue(tests.id('A'), 'cle-d-un-autre-0002', '/<script>', null, 'ordinateur');
select is(tests.chemins('A'), 3, 'une adresse qui n''est pas un chemin de la vitrine : ignorée');
select public.compter_vue(tests.id('A'), 'cle-encore-une-0003', '/catalogue', '<b>pub</b>', 'grille-pain');
reset role;
select results_eq($$ select source, appareil from public.vitrine_visites where boutique_id = tests.id('A') and entree = '/catalogue' $$,
  $$ values (null::text, 'ordinateur'::text) $$, 'une source qui n''est pas un nom de domaine s''efface ; un appareil inconnu compte comme ordinateur');
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'courte', '/', null, 'telephone');
select is(tests.visites('A'), 3, 'une clé trop courte : ignorée');
select public.compter_vue(tests.id('C'), 'cle-du-navigateur-0001', '/', null, 'telephone');
select is(tests.visites('C'), 0, 'une boutique suspendue ne compte rien');
select throws_ok($$ insert into public.vitrine_visites (boutique_id, jour, empreinte, entree, appareil) values (tests.id('A'), current_date, '\x00', '/', 'telephone') $$,
  '42501', null, 'personne n''écrit dans les visites sans la fonction');
select is((select count(*)::integer from public.vitrine_visites), 0, 'un visiteur ne lit pas les visites');

-- ---------------------------------------------------------------------
-- L'équipe de direction
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_visites(%L) $$, tests.id('A')), '42501', null, 'l''équipe d''une autre boutique ne lit rien');
reset role; select tests.connecte('confirm_a');
select is(tests.indice(format($$ select public.gestion_visites(%L) $$, tests.id('A'))), 'role', 'la confirmation n''a pas l''audience');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_visites_etat(tests.id('A')), '{"actif": true, "compte": true}'::jsonb, 'la navigation sait que la boutique mesure, et qu''il y a des visites');
select results_eq($$ select (x #>> '{courante,visiteurs}')::int, (x #>> '{courante,vues}')::int, (x #>> '{appareils,telephone}')::int, (x #>> '{appareils,ordinateur}')::int
                     from (select public.gestion_visites(tests.id('A'), 7) as x) t $$,
  $$ values (3, 4, 1, 2) $$, 'sur sept jours : trois visiteurs, quatre pages vues, un sur téléphone, deux sur ordinateur');
select is((public.gestion_visites(tests.id('A'), 7) #>> '{courante,commandes}')::int,
  (select count(*)::int from public.commandes where boutique_id = tests.id('A') and origine = 'vitrine'),
  'les commandes passées sur la vitrine pendant la période, pour la conversion');
select results_eq($$ select x ->> 'slug', (x ->> 'vues')::int from jsonb_array_elements(public.gestion_visites(tests.id('A'), 7) -> 'produits') x $$,
  $$ values ('valise-cabine'::text, 1) $$, 'les produits les plus vus, par leur nom');

-- ---------------------------------------------------------------------
-- Le sel : changé chaque jour, l'ancien effacé
-- ---------------------------------------------------------------------
reset role;
delete from private.sels_visites;
insert into private.sels_visites (jour, sel) values (current_date - 3, '\x0102');
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-du-navigateur-0001', '/', null, 'telephone');
reset role;
select results_eq($$ select jour from private.sels_visites $$, $$ values ((now() at time zone 'Africa/Tunis')::date) $$,
  'au premier passage du jour, un sel neuf ; celui d''il y a trois jours est effacé');

select * from finish();
rollback;
