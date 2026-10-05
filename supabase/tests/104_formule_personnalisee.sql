-- =====================================================================
-- 104 · La formule personnalisée d'une boutique : des droits ajoutés ou
--       retirés à sa formule (ou à « sur mesure »), un prix propre
-- =====================================================================
begin;
\ir outils.psql

select plan(25);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');
delete from plateforme.droits_boutique;
update plateforme.formules set prix_mensuel_millimes = null;
update plateforme.boutiques set formule = 'essentiel', prix_mensuel_millimes = null where id = tests.id('A');
update plateforme.boutiques set formule = null where id = tests.id('B');
-- L'avis est actif chez A (dans Essentiel) : le retirer doit le couper.
insert into plateforme.modules_actifs (boutique_id, module, actif) values (tests.id('A'), 'avis', true)
on conflict (boutique_id, module) do update set actif = true;

select tests.service();
select throws_ok(format($$ select public.console_droits_boutique(%L, %L) $$, tests.id('proprio_a'), tests.id('A')),
  '42501', null, 'un propriétaire ne lit pas les droits de la console');
create temp table d as select public.console_droits_boutique(tests.id('support_plateforme'), tests.id('A')) as j;
grant select on d to service_role;
select is((select x ->> 'dans_formule' || ' ' || (x ->> 'effectif') from d, jsonb_array_elements(j -> 'droits') x where x ->> 'code' = 'module.sav'),
  'false false', 'le support lit : le SAV n''est pas dans Essentiel');
select throws_ok(format($$ select public.console_personnaliser_formule(%L, %L, '{}', null) $$, tests.id('support_plateforme'), tests.id('A')),
  '42501', null, 'le support ne personnalise pas');

-- Essentiel, plus le SAV, moins les avis, à 59 TND.
create temp table r as
select public.console_personnaliser_formule(tests.id('admin_plateforme'), tests.id('A'),
  array(select fd.droit from plateforme.formule_droits fd where fd.formule = 'essentiel' and fd.droit <> 'module.avis') || array['module.sav'], 59000) as j;
grant select on r to service_role;
select is((select j -> 'ajoutes' from r), '["Service après-vente"]'::jsonb, 'ce qui s''ajoute est dit');
select is((select j -> 'retires' from r), '["Avis clients"]'::jsonb, 'ce qui se retire aussi');
select is((select j -> 'modules_coupes' from r), '["avis"]'::jsonb, 'les avis, retirés, sont coupés');
reset role;
select ok(private.droit(tests.id('A'), 'module.sav'), 'le SAV est ouvert à A');
select ok(not private.droit(tests.id('A'), 'module.avis'), 'les avis ne le sont plus');
select ok(private.droit(tests.id('A'), 'catalogue.favoris'), 'le reste de la formule ne bouge pas');
select is((select count(*)::int from plateforme.droits_boutique where boutique_id = tests.id('A')), 2,
  'la base ne garde que les deux écarts à la formule');
select ok(exists (select 1 from plateforme.journal_audit where action = 'boutique.droits' and boutique_id = tests.id('A')), 'tracé au journal');

select tests.service();
select lives_ok(format($$ select public.console_changer_module(%L, %L, 'sav', true) $$, tests.id('admin_plateforme'), tests.id('A')),
  'la console active maintenant le SAV de A');
select is((select b ->> 'prix' || ' ' || (b ->> 'prix_propre') || ' ' || (b ->> 'personnalisee')
             from jsonb_array_elements(public.console_revenus(tests.id('admin_plateforme')) -> 'boutiques') b where b ->> 'slug' = 'essai-a'),
  '59000 true true', 'les revenus comptent son prix propre, même sans prix de formule');
select ok(not (public.console_personnaliser_formule(tests.id('admin_plateforme'), tests.id('A'),
  array(select fd.droit from plateforme.formule_droits fd where fd.formule = 'essentiel' and fd.droit <> 'module.avis') || array['module.sav'], 59000) ->> 'change')::boolean,
  'rien n''a changé : rien d''écrit');
select throws_ok(format($$ select public.console_personnaliser_formule(%L, %L, '{inventé}', null) $$, tests.id('admin_plateforme'), tests.id('A')),
  '22023', null, 'un droit inconnu est refusé');

-- Sur mesure (sans formule : tout ouvert), moins le pixel Meta.
select public.console_personnaliser_formule(tests.id('admin_plateforme'), tests.id('B'),
  array(select d.code from plateforme.droits d where d.code <> 'pub.pixel_meta'), null);
reset role;
select ok(not private.droit(tests.id('B'), 'pub.pixel_meta') and private.droit(tests.id('B'), 'pub.pixel_tiktok'),
  'sur mesure, moins le pixel Meta : le reste reste ouvert');
select tests.connecte('proprio_b');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"pub.pixel_meta": true}') $$, tests.id('B')),
  '%n''est pas dans la formule%', 'le commerçant ne rallume pas ce qui lui a été retiré');
select is((public.gestion_formule(tests.id('B')) -> 'fermes') ? 'pub.pixel_meta', true, 'son back-office le voit fermé');

-- Un seul droit, d'un geste (l'onglet Modules) : ouvrir les devis à A, puis les refermer.
reset role; select tests.service();
select is((public.console_ouvrir_droit(tests.id('admin_plateforme'), tests.id('A'), 'module.devis', true) ->> 'change'), 'true', 'les devis, ouverts à A d''un geste');
select public.console_changer_module(tests.id('admin_plateforme'), tests.id('A'), 'devis', true);
select is((public.console_ouvrir_droit(tests.id('admin_plateforme'), tests.id('A'), 'module.devis', false) -> 'modules_coupes'), '["devis"]'::jsonb,
  'refermés : le module est coupé');
reset role;
select ok(not exists (select 1 from plateforme.droits_boutique where boutique_id = tests.id('A') and droit = 'module.devis'),
  'revenu à la formule pour ce droit : plus d''écart gardé');

-- Un écart devenu égal à la formule s'efface : B (sans le pixel Meta) passe en Essentiel, qui ne l'ouvre pas.
update plateforme.boutiques set formule = 'essentiel' where id = tests.id('B');
select is((select count(*)::int from plateforme.droits_boutique where boutique_id = tests.id('B')), 0,
  'B passe en Essentiel : « sans le pixel Meta » n''est plus un écart, il s''efface');
-- Et quand la formule elle-même change : le SAV ajouté à A, puis Essentiel ouvre le SAV.
select public.console_ouvrir_droit(tests.id('admin_plateforme'), tests.id('A'), 'module.sav', true);
insert into plateforme.formule_droits (formule, droit) values ('essentiel', 'module.sav') on conflict do nothing;
select ok(not exists (select 1 from plateforme.droits_boutique where boutique_id = tests.id('A') and droit = 'module.sav'),
  'Essentiel ouvre le SAV : l''écart de A s''efface');
delete from plateforme.formule_droits where formule = 'essentiel' and droit = 'module.sav';

-- Revenir à la formule : les écarts disparaissent.
reset role; select tests.service();
select public.console_personnaliser_formule(tests.id('admin_plateforme'), tests.id('A'),
  array(select fd.droit from plateforme.formule_droits fd where fd.formule = 'essentiel'), null);
reset role;
select is((select count(*)::int from plateforme.droits_boutique where boutique_id = tests.id('A')), 0, 'revenue à sa formule : plus aucun écart');
select is((select prix_mensuel_millimes from plateforme.boutiques where id = tests.id('A')), null, 'et plus de prix propre');

select * from finish();
rollback;
