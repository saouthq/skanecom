-- =====================================================================
-- 90 · Les formules : ce que la console vend, contrôlé à la source
-- =====================================================================
begin;
\ir outils.psql

select plan(20);

-- ---------------------------------------------------------------------
-- Les portes
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_formules(%L) $$, tests.id('proprio_a')),
  '42501', null, 'un commerçant ne lit pas les formules de la plateforme');
select throws_ok(format($$ select public.console_changer_formule(%L, %L, 'essentiel') $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'ni ne change la sienne');

reset role; select tests.service();
select ok(jsonb_array_length(public.console_formules(tests.id('admin_plateforme')) -> 'formules') >= 3,
  'trois formules de départ : Essentiel, Pro, Complète');
select is((select (f -> 'droits') ? 'module.devis' from jsonb_array_elements(public.console_formules(tests.id('admin_plateforme')) -> 'formules') f
            where f ->> 'code' = 'complete'), true, 'la formule Complète ouvre tout, les devis compris');

-- ---------------------------------------------------------------------
-- Sans formule : rien ne change (les boutiques d'avant)
-- ---------------------------------------------------------------------
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.favoris', 'true');
update plateforme.boutiques set statut = 'active' where id = tests.id('A');
select is(private.reglage(tests.id('A'), 'catalogue.favoris'), 'true'::jsonb, 'sans formule, tout est ouvert : les favoris sont allumés');

-- ---------------------------------------------------------------------
-- Une formule qui ne les ouvre pas : éteints à la lecture, valeur gardée
-- ---------------------------------------------------------------------
select tests.service();
select lives_ok(format($$ select public.console_enregistrer_formule(%L, 'mini', 'Mini', null, null, array['vitrine.partage']) $$, tests.id('admin_plateforme')),
  'le super-administrateur crée une formule');
select is((public.console_changer_formule(tests.id('admin_plateforme'), tests.id('A'), 'mini') -> 'fonctions_eteintes'), '["Les favoris"]'::jsonb,
  'changer de formule dit ce qui s''éteint');
reset role;
select is(private.reglage(tests.id('A'), 'catalogue.favoris'), 'false'::jsonb, 'hors formule, le réglage rend son défaut');
select is(public.configuration_publique(tests.id('A')) #> '{reglages,catalogue.favoris}', 'false'::jsonb, 'la vitrine ne les voit plus');
select is((select valeur from public.reglages where boutique_id = tests.id('A') and cle = 'catalogue.favoris'), 'true'::jsonb,
  'la valeur du commerçant est gardée');

-- Le back-office ne peut pas les rallumer.
select tests.connecte('proprio_a');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"catalogue.prevenir_retour": true}') $$, tests.id('A')),
  '%n''est pas dans la formule%', 'le commerçant n''allume pas une fonction hors formule');
select lives_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"vitrine.partage": true}') $$, tests.id('A')),
  'il allume celles de sa formule');
select is((public.gestion_formule(tests.id('A')) -> 'formule' ->> 'nom'), 'Mini', 'le back-office connaît sa formule');
select is((public.gestion_formule(tests.id('A')) #>> '{fermes,catalogue.favoris,nom}'), 'Essentiel',
  'et pour chaque fonction fermée, la formule qui l''ouvre');

-- ---------------------------------------------------------------------
-- Les modules
-- ---------------------------------------------------------------------
reset role; select tests.service();
select throws_like(format($$ select public.console_changer_module(%L, %L, 'devis', true) $$, tests.id('admin_plateforme'), tests.id('A')),
  '%pas dans la formule%', 'la console n''active pas un module hors formule');
select lives_ok(format($$ select public.console_changer_formule(%L, %L, 'complete') $$, tests.id('admin_plateforme'), tests.id('A')),
  'la formule Complète');
select public.console_changer_module(tests.id('admin_plateforme'), tests.id('A'), 'devis', true);
select is((public.console_changer_formule(tests.id('admin_plateforme'), tests.id('A'), 'essentiel') -> 'modules_coupes'), '["devis"]'::jsonb,
  'redescendre en Essentiel coupe les devis');
reset role;
select is(private.reglage(tests.id('A'), 'catalogue.favoris'), 'true'::jsonb, 'les favoris, dans Essentiel, reviennent tels que le commerçant les avait laissés');

-- Une formule vendue ne se supprime pas.
select tests.service();
select throws_like(format($$ select public.console_supprimer_formule(%L, 'essentiel') $$, tests.id('admin_plateforme')),
  '%encore vendue%', 'une formule vendue ne se supprime pas');
select is((select count(*)::int from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'boutique.formule'), 3,
  'chaque changement de formule est au journal');

select * from finish();
rollback;
