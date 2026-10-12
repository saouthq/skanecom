-- =====================================================================
-- 127 · Les fournisseurs : le dernier essai de chacun, gardé, lu
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

reset role;
delete from plateforme.fournisseurs_essais;
insert into plateforme.administrateurs (user_id, role) values (tests.cree_utilisateur('support_fourn'), 'support');

select tests.service();
select is(public.fournisseurs_noter('[{"cle":"courriels","mode":"reel","ok":true,"duree_ms":180,"detail":null},
                                      {"cle":"sms","mode":"aucun","ok":null,"duree_ms":null,"detail":"Non branché"}]'::jsonb), 2, 'un tour note ses essais');
select is((public.console_fournisseurs(tests.id('support_fourn')) #>> '{courriels,ok}'), 'true', 'le support lit : les e-mails répondent');
select ok((public.console_fournisseurs(tests.id('support_fourn')) #>> '{courriels,dernier_ok_le}') is not null, 'avec l''heure du dernier essai réussi');
select is((public.console_fournisseurs(tests.id('admin_plateforme')) #>> '{sms,detail}'), 'Non branché', 'un fournisseur non branché le dit');
-- Puis la clé est refusée : l'essai le dit, l'heure du dernier succès reste.
select public.fournisseurs_noter('[{"cle":"courriels","mode":"reel","ok":false,"duree_ms":90,"detail":"Clé refusée (401)"}]'::jsonb);
select is((public.console_fournisseurs(tests.id('admin_plateforme')) #>> '{courriels,detail}'), 'Clé refusée (401)', 'la clé refusée : en clair');
select ok((public.console_fournisseurs(tests.id('admin_plateforme')) #>> '{courriels,dernier_ok_le}') is not null, 'le dernier succès reste connu (depuis quand ça ne répond plus)');
select throws_ok($$ select public.fournisseurs_noter('[{"cle":"autre","mode":"reel","ok":true}]'::jsonb) $$, '23514', null, 'un fournisseur inconnu : refusé');
select throws_ok($$ select public.console_fournisseurs('00000000-0000-0000-0000-000000000000') $$, '42501', null, 'un inconnu ne lit rien');
select tests.anonyme();
select throws_ok($$ select public.fournisseurs_noter('[]'::jsonb) $$, '42501', null, 'un visiteur ne note rien');

select * from finish();
rollback;
