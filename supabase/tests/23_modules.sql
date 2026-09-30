-- =====================================================================
-- 23 · Les modules d'une boutique, depuis la console (C3)
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.console_modules(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne lit pas les modules');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_changer_module(%L, %L, 'conseil_whatsapp', true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'le propriétaire n''active pas lui-même un module : il fait partie de l''offre vendue');

reset role; select tests.service();
select throws_ok(format($$ select public.console_changer_module(%L, %L, 'conseil_whatsapp', true) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'la base refuse un acteur qui n''est pas administrateur de la plateforme');

-- ---------------------------------------------------------------------
-- La liste
-- ---------------------------------------------------------------------
select is((select count(*)::int from jsonb_array_elements(public.console_modules(tests.id('A'))) m where (m ->> 'actif')::boolean),
  0, 'une boutique neuve n''a aucun module');
select is((select m ->> 'disponible' from jsonb_array_elements(public.console_modules(tests.id('A'))) m where m ->> 'code' = 'conseil_whatsapp'),
  'true', 'le conseil par WhatsApp est disponible');
select is((select m ->> 'disponible' from jsonb_array_elements(public.console_modules(tests.id('A'))) m where m ->> 'code' = 'paiement_en_ligne'),
  'false', 'le paiement en ligne est à venir');

-- ---------------------------------------------------------------------
-- Activer, couper
-- ---------------------------------------------------------------------
select lives_ok(format($$ select public.console_changer_module(%L, %L, 'conseil_whatsapp', true) $$, tests.id('admin_plateforme'), tests.id('A')),
  'l''administrateur active un module');
select is(public.configuration_publique(tests.id('A')) -> 'modules', '["conseil_whatsapp"]'::jsonb, 'la vitrine le voit');
select is((select m ->> 'change_par' from jsonb_array_elements(public.console_modules(tests.id('A'))) m where m ->> 'code' = 'conseil_whatsapp'),
  'admin_plateforme@tests.skanecom.local', 'la console dit qui l''a activé');
select throws_like(format($$ select public.console_changer_module(%L, %L, 'paiement_en_ligne', true) $$, tests.id('admin_plateforme'), tests.id('A')),
  '%à venir%', 'un module à venir ne s''active pas : la vitrine annoncerait un service qu''elle ne sait pas rendre');
select throws_ok(format($$ select public.console_changer_module(%L, %L, 'fidelite', true) $$, tests.id('admin_plateforme'), tests.id('A')),
  'P0002', null, 'un module inconnu');

-- Un module à venir déjà actif (activé avant qu'il ne soit construit) se coupe.
reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'paiement_en_ligne');
select tests.service();
select lives_ok(format($$ select public.console_changer_module(%L, %L, 'paiement_en_ligne', false) $$, tests.id('admin_plateforme'), tests.id('A')),
  'couper reste toujours possible');
select lives_ok(format($$ select public.console_changer_module(%L, %L, 'conseil_whatsapp', false) $$, tests.id('admin_plateforme'), tests.id('A')),
  'l''administrateur coupe un module');
-- Couper un module déjà coupé ne trace rien de plus.
select public.console_changer_module(tests.id('admin_plateforme'), tests.id('A'), 'conseil_whatsapp', false);
select results_eq($$ select action, cible from plateforme.journal_audit
                      where boutique_id = tests.id('A') and action like 'module.%' order by id $$,
  $$ values ('module.activer'::text, 'conseil_whatsapp'::text), ('module.couper', 'paiement_en_ligne'), ('module.couper', 'conseil_whatsapp') $$,
  'chaque changement est au journal d''audit, une fois');

select * from finish();
rollback;
