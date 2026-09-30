-- =====================================================================
-- 42 · La vérification par e-mail, à côté du SMS : le réglage, le numéro
--      d'un compte e-mail, les demandes qui le réclament
-- =====================================================================
begin;
\ir outils.psql

select plan(29);

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
grant execute on function tests.indice(text) to anon, authenticated, service_role;

-- Leïla ouvre son compte par e-mail (pas de numéro) ; Karim par SMS.
select tests.cree_utilisateur('leila');
select tests.cree_utilisateur('karim');
update auth.users set phone = '21655000123', email = null where id = tests.id('karim');
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'devis'), (tests.id('A'), 'comptes_pro');
create function pg_temp.panier() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1))
$$;

-- ---------------------------------------------------------------------
-- Le réglage
-- ---------------------------------------------------------------------
select results_eq($$ select type_valeur, choix_possibles, defaut, public, modifiable_boutique, groupe
                       from plateforme.reglages_catalogue where cle = 'compte.verification' $$,
  $$ values ('choix'::text, '["sms", "email", "les_deux"]'::jsonb, '"les_deux"'::jsonb, true, true, 'commande'::text) $$,
  'le réglage existe : SMS, e-mail ou les deux (par défaut), lu par la vitrine, changé par la boutique');
select is(public.boutique_publique('essai-a') #> '{configuration,reglages,compte.verification}', '"les_deux"'::jsonb,
  'la vitrine le lit : les deux, tant que la boutique n''y a pas touché');

reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"compte.verification": "email"}') $$, tests.id('A')),
  '42501', null, 'la préparation ne le change pas');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"compte.verification": "pigeon"}') $$, tests.id('A')),
  '23514', null, 'une valeur hors des trois choix est refusée');
select is(public.gestion_enregistrer_reglages(tests.id('A'), '{"compte.verification": "email"}'), 1, 'le propriétaire passe à l''e-mail');
select is(public.boutique_publique('essai-a') #> '{configuration,reglages,compte.verification}', '"email"'::jsonb,
  'la vitrine le lit aussitôt');
select is(public.boutique_publique('essai-b') #> '{configuration,reglages,compte.verification}', '"les_deux"'::jsonb,
  'une autre boutique garde le défaut');

-- ---------------------------------------------------------------------
-- Le numéro que la boutique connaît au compte
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.mon_telephone(%L) $$, tests.id('A')), '42501', null, 'un visiteur n''a pas de numéro à lire');
reset role; select tests.connecte('client_a');
select is(public.mon_telephone(tests.id('A')), '+21620000001', 'un client qui a commandé : le numéro de sa fiche');
reset role; select tests.connecte('karim');
select is(public.mon_telephone(tests.id('A')), '+21655000123', 'un compte SMS sans fiche : le numéro du compte');
reset role; select tests.connecte('leila');
select is(public.mon_telephone(tests.id('A')), null, 'un compte e-mail sans fiche : aucun numéro');

-- ---------------------------------------------------------------------
-- Les demandes réclament le numéro d'un compte e-mail
-- ---------------------------------------------------------------------
select is(tests.indice(format($$ select public.demander_devis(%L, pg_temp.panier(), null) $$, tests.id('A'))),
  'telephone', 'Leïla demande un devis : il lui faut d''abord donner son numéro (et non se reconnecter)');
select is(tests.indice(format($$ select public.demander_compte_pro(%L, 'Atelier Leïla') $$, tests.id('A'))),
  'telephone', 'de même pour un compte professionnel');
reset role; select tests.anonyme();
select throws_ok(format($$ select public.demander_devis(%L, pg_temp.panier(), null) $$, tests.id('A')),
  '42501', null, 'un visiteur, lui, ne demande rien sans se connecter');

-- ---------------------------------------------------------------------
-- Renseigner son numéro
-- ---------------------------------------------------------------------
select throws_ok(format($$ select public.renseigner_telephone(%L, '20 123 456') $$, tests.id('A')), '42501', null,
  'un visiteur ne renseigne rien');
reset role; select tests.connecte('leila');
select is(tests.indice(format($$ select public.renseigner_telephone(%L, '12 34') $$, tests.id('A'))), 'telephone',
  'un numéro illisible est refusé');

reset role;
insert into public.clients (boutique_id, nom, telephone, niveau_risque) values (tests.id('A'), 'Numéro bloqué', '+21699000000', 'bloque');
select tests.connecte('leila');
select is(tests.indice(format($$ select public.renseigner_telephone(%L, '99 000 000') $$, tests.id('A'))), 'bloque',
  'un numéro que la boutique a bloqué ne se renseigne pas');

select is(public.renseigner_telephone(tests.id('A'), '+216 50 111 222'), '+21650111222', 'Leïla donne son numéro');
reset role;
select results_eq($$ select telephone, email from public.clients where boutique_id = tests.id('A') and user_id = tests.id('leila') $$,
  $$ values ('+21650111222'::text, 'leila@tests.skanecom.local'::text) $$,
  'sa fiche est créée dans la boutique, avec l''e-mail du compte');
select is((select count(*)::int from public.clients where boutique_id = tests.id('B') and user_id = tests.id('leila')), 0,
  'rien dans une autre boutique');
select tests.connecte('leila');
select is(public.renseigner_telephone(tests.id('A'), '22 999 888'), '+21650111222',
  'la fiche existe : le numéro ne change plus d''ici (l''équipe le corrige au backoffice)');
select is(public.mon_telephone(tests.id('A')), '+21650111222', 'la vitrine ne le lui redemande pas');

select ok((public.demander_devis(tests.id('A'), pg_temp.panier(), 'Pour un mariage') ->> 'numero') is not null,
  'la demande de devis passe, sur sa fiche');
reset role;
select is((select c.telephone from public.devis d join public.clients c on c.boutique_id = d.boutique_id and c.id = d.client_id
            where d.boutique_id = tests.id('A') and c.user_id = tests.id('leila')), '+21650111222',
  'la boutique la rappellera sur ce numéro');
select tests.connecte('leila');
select is(public.demander_compte_pro(tests.id('A'), 'Atelier Leïla') #>> '{statut}', 'demande',
  'la demande de compte professionnel aussi');

-- ---------------------------------------------------------------------
-- L'équipe voit quelles commandes portent un numéro vérifié
-- ---------------------------------------------------------------------
reset role;
update auth.users set phone = '21620000001', phone_confirmed_at = now() where id = tests.id('client_a');
create function pg_temp.verifiees() returns text[] language sql as $$
  select public.gestion_numeros_verifies(tests.id('A'),
           array(select k.numero from public.commandes k where k.boutique_id = tests.id('A')))
$$;
create function pg_temp.numero(p_nom text) returns text language sql as $$
  select numero from public.commandes where id = tests.id(p_nom)
$$;
select tests.connecte('client_a');
select throws_ok($$ select pg_temp.verifiees() $$, '42501', null, 'un client ne lit pas cette liste');
reset role; select tests.connecte('prepa_a');
select is(pg_temp.verifiees(), array[pg_temp.numero('commande_a')],
  'la préparation voit : la commande du compte SMS confirmé, pas celle d''un compte sans numéro vérifié');
reset role; select tests.connecte('proprio_b');
select throws_ok($$ select pg_temp.verifiees() $$, '42501', null, 'l''équipe d''une autre boutique non plus');
reset role;
update public.commandes set contact_telephone = '+21620000099' where id = tests.id('commande_a');
select tests.connecte('prepa_a');
select is(pg_temp.verifiees(), '{}'::text[], 'la commande porte un autre numéro que le compte : il n''est pas « vérifié »');

select * from finish();
rollback;
