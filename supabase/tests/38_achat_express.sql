-- =====================================================================
-- 38 · L'achat express depuis la fiche : un réglage de la boutique
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

reset role;
select results_eq($$ select type_valeur, defaut, public, modifiable_boutique, groupe, module
                       from plateforme.reglages_catalogue where cle = 'commande.achat_express' $$,
  $$ values ('booleen'::text, 'false'::jsonb, true, true, 'commande'::text, null::text) $$,
  'le réglage existe : un booléen du groupe commande, coupé par défaut, lu par la vitrine, changé par la boutique');
select is(public.boutique_publique('essai-a') #> '{configuration,reglages,commande.achat_express}', 'false'::jsonb,
  'la vitrine le lit, coupé tant que la boutique n''y a pas touché');

reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"commande.achat_express": true}') $$, tests.id('A')),
  '42501', null, 'la préparation ne l''active pas');

reset role; select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_reglages(tests.id('A'), '{"commande.achat_express": true}'), 1, 'le propriétaire l''active');
select is((select (r ->> 'valeur')::boolean from jsonb_array_elements(public.gestion_reglages(tests.id('A')) -> 'reglages') r
            where r ->> 'cle' = 'commande.achat_express'), true, 'le backoffice le relit activé');
select is(public.boutique_publique('essai-a') #> '{configuration,reglages,commande.achat_express}', 'true'::jsonb,
  'la vitrine aussi, aussitôt');
select is(public.boutique_publique('essai-b') #> '{configuration,reglages,commande.achat_express}', 'false'::jsonb,
  'une autre boutique n''en voit rien : elle garde le défaut');

select * from finish();
rollback;
