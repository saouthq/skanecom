-- =====================================================================
-- 99 · La console, lot E : les prospects (qui appeler, où l'on en est,
--      la prochaine chose à faire ; gagné, il devient une boutique)
-- =====================================================================
begin;
\ir outils.psql

select plan(17);

-- (une base locale peut en avoir déjà : on part d'une liste vide ; tout est défait à la fin)
delete from plateforme.prospects;
select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

select tests.service();
select throws_ok(format($$ select public.console_prospects(%L) $$, tests.id('proprio_a')),
  '42501', null, 'un propriétaire de boutique ne voit pas les prospects');
select is(public.console_prospects(tests.id('admin_plateforme')), '[]'::jsonb, 'au départ, aucun prospect');

create temp table p as
select public.console_enregistrer_prospect(tests.id('support_plateforme'), null,
  '{"nom": "  Parfumerie Yasmine ", "contact_nom": "Yasmine", "telephone": "20 555 111", "email": "Contact@Yasmine.TN",
    "ville": "Sfax", "metier": "beaute", "source": "salon", "prochaine_action": "Montrer la démonstration", "prochaine_le": "2026-10-07"}') as id;
grant select on p to service_role;

select is((public.console_prospects(tests.id('admin_plateforme')) -> 0 ->> 'nom'), 'Parfumerie Yasmine', 'le support en crée un ; le nom sans ses espaces');
select is((public.console_prospects(tests.id('admin_plateforme')) -> 0 ->> 'telephone'), '+21620555111', 'le téléphone au format international');
select is((public.console_prospects(tests.id('admin_plateforme')) -> 0 ->> 'email'), 'contact@yasmine.tn', 'l''e-mail en minuscules');
select is((public.console_prospects(tests.id('admin_plateforme')) -> 0 ->> 'etape'), 'a_contacter', 'il commence « à contacter »');
select is((public.console_prospects(tests.id('admin_plateforme')) -> 0 ->> 'metier_nom'), (select nom from plateforme.metiers where code = 'beaute'), 'son métier, par son nom');

select throws_ok(format($$ select public.console_enregistrer_prospect(%L, null, '{"nom": "  "}') $$, tests.id('admin_plateforme')),
  '23514', null, 'sans nom, refusé');
select throws_ok(format($$ select public.console_enregistrer_prospect(%L, null, '{"nom": "X", "telephone": "12"}') $$, tests.id('admin_plateforme')),
  '23514', null, 'un téléphone illisible, refusé');

-- Les étapes
select throws_ok(format($$ select public.console_etape_prospect(%L, %L, 'perdu', '') $$, tests.id('admin_plateforme'), (select id from p)),
  '23514', null, 'perdu sans motif : refusé');
select lives_ok(format($$ select public.console_etape_prospect(%L, %L, 'demo') $$, tests.id('support_plateforme'), (select id from p)),
  'la démonstration montrée');
select is((select etape from plateforme.prospects where id = (select id from p)), 'demo', 'son étape suit');
select lives_ok(format($$ select public.console_etape_prospect(%L, %L, 'perdu', 'Trop cher pour l''instant') $$, tests.id('admin_plateforme'), (select id from p)),
  'perdu, avec un motif');
select lives_ok(format($$ select public.console_lier_prospect(%L, %L, %L) $$, tests.id('admin_plateforme'), (select id from p), tests.id('A')),
  'finalement gagné : sa boutique s''y rattache');
select is((select etape || ' ' || coalesce(motif_perte, '—') from plateforme.prospects where id = (select id from p)), 'gagne —', 'gagné, le motif de perte effacé');

reset role;
select is((select count(*)::int from plateforme.journal_audit where action like 'prospect.%' and cible = 'Parfumerie Yasmine'), 4,
  'le journal garde la création et les trois étapes');

select tests.service();
select throws_ok(format($$ select public.console_retirer_prospect(%L, %L) $$, tests.id('support_plateforme'), (select id from p)),
  '42501', null, 'le support ne retire pas un prospect');

select * from finish();
rollback;
