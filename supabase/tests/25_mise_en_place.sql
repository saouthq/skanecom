-- =====================================================================
-- 25 · La liste de mise en place d'une boutique, dans la console (C6)
-- =====================================================================
begin;
\ir outils.psql

select plan(16);

-- Jeu d'essai (outils.psql) : A est ouverte, avec son domaine essai-a.test,
-- un produit en vitrine, son équipe (propriétaire compris), des commandes ;
-- ni livreur, ni WhatsApp, ni informations légales ; thème d'origine.

create function tests.etape(p_cle text) returns jsonb language sql as $$
  select e from jsonb_array_elements(public.console_mise_en_place(tests.id('A')) -> 'etapes') e where e ->> 'cle' = p_cle
$$;
grant execute on function tests.etape(text) to service_role;

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_mise_en_place(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne lit pas la mise en place');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_marquer_etape(%L, %L, 'formation', true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'le propriétaire ne coche pas sa propre mise en place');

reset role; select tests.service();
select throws_ok(format($$ select public.console_marquer_etape(%L, %L, 'formation', true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'la base refuse un acteur qui n''est pas administrateur de la plateforme');

-- ---------------------------------------------------------------------
-- Ce qui se constate
-- ---------------------------------------------------------------------
select is((select array_agg(e ->> 'cle') from jsonb_array_elements(public.console_mise_en_place(tests.id('A')) -> 'etapes') e),
  array['recueil', 'marque', 'catalogue', 'domaine', 'branchements', 'legal', 'equipe', 'commande_test', 'formation', 'mise_en_ligne'],
  'dix étapes, dans l''ordre de la mise en place (PRD §7)');
select results_eq($$ select (tests.etape('catalogue') ->> 'fait')::boolean, (tests.etape('catalogue') -> 'detail' ->> 'publies')::int > 0 $$,
  $$ values (true, true) $$, 'le catalogue est en vitrine : constaté');
select is(tests.etape('domaine') -> 'detail' ->> 'hote', 'essai-a.test', 'le domaine du client : constaté, avec son adresse');
select is((tests.etape('branchements') ->> 'fait')::boolean, false, 'ni livreur ni WhatsApp : les branchements restent à faire');
select is(jsonb_array_length(tests.etape('legal') -> 'detail' -> 'manquants'), 5, 'les cinq informations légales manquent, et sont nommées');
select is((tests.etape('equipe') ->> 'fait')::boolean, true, 'le propriétaire est dans l''équipe');
select is((tests.etape('mise_en_ligne') ->> 'fait')::boolean, true, 'la boutique est ouverte');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'livraison.transporteur', '"Aramex"'), (tests.id('A'), 'contact.whatsapp', '"21620000001"');
update public.themes set couleurs = '{"accent": "#123456"}' where boutique_id = tests.id('A');
select tests.service();
select results_eq($$ select (tests.etape('branchements') ->> 'fait')::boolean, (tests.etape('marque') ->> 'fait')::boolean $$,
  $$ values (true, true) $$, 'le livreur et le WhatsApp réglés, la marque retouchée : constatés aussitôt');

-- ---------------------------------------------------------------------
-- Ce qui se coche
-- ---------------------------------------------------------------------
select throws_like(format($$ select public.console_marquer_etape(%L, %L, 'catalogue', true) $$, tests.id('admin_plateforme'), tests.id('A')),
  '%se constate%', 'une étape constatée ne se coche pas à la main');
select public.console_marquer_etape(tests.id('admin_plateforme'), tests.id('A'), 'recueil', true);
select public.console_marquer_etape(tests.id('admin_plateforme'), tests.id('A'), 'recueil', true);
select results_eq($$ select (tests.etape('recueil') ->> 'fait')::boolean, tests.etape('recueil') ->> 'par', tests.etape('recueil') ? 'le' $$,
  $$ values (true, 'admin_plateforme@tests.skanecom.local'::text, true) $$, 'le recueil coché : quand, et par qui');
select public.console_marquer_etape(tests.id('admin_plateforme'), tests.id('A'), 'recueil', false);
select is((tests.etape('recueil') ->> 'fait')::boolean, false, 'et décoché');

select is(public.console_avancements() -> tests.id('A')::text, '{"faites": 6, "total": 10}'::jsonb,
  'l''avancement de chaque boutique, pour la liste de la console');
select results_eq($$ select action, cible from plateforme.journal_audit
                      where boutique_id = tests.id('A') and action like 'mise_en_place.%' order by id $$,
  $$ values ('mise_en_place.faite'::text, 'recueil'::text), ('mise_en_place.a_faire', 'recueil') $$,
  'cocher et décocher passent au journal, une fois chacun');

select * from finish();
rollback;
