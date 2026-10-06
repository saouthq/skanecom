-- =====================================================================
-- 112 · « Mes commandes » : la commande telle que l'acheteur la lit
--       (l'arrivage d'une précommande, le paiement en ligne reçu)
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

-- Une commande ordinaire, payée à la livraison.
reset role; select tests.connecte('client_a');
create temp table avant as select c from jsonb_array_elements(public.mes_commandes(tests.id('A'))) c;
select is((select (c ->> 'payee_en_ligne')::boolean from avant), false, 'payée à la livraison : pas « payée en ligne »');
select ok((select c ? 'arrivage_prevu' and c ->> 'arrivage_prevu' is null from avant), 'sans précommande : pas d''arrivage');

-- Elle devient une précommande (un arrivage annoncé pour une ligne), payée par Konnect.
reset role;
insert into public.arrivages (id, boutique_id, nom, date_prevue)
values ('11200000-0000-4000-8000-000000000001', tests.id('A'), 'Conteneur d''essai', date '2026-10-18');
update public.commande_lignes set precommande = true, precommande_arrivage_id = '11200000-0000-4000-8000-000000000001'
 where id = (select id from public.commande_lignes where commande_id = tests.id('commande_a') order by created_at limit 1);
update public.commandes set en_attente_arrivage = true, mode_paiement = 'konnect', statut_paiement = 'paye'
 where id = tests.id('commande_a');

select tests.connecte('client_a');
create temp table apres as select c from jsonb_array_elements(public.mes_commandes(tests.id('A'))) c;
select is((select c ->> 'arrivage_prevu' from apres), '2026-10-18', 'la précommande dit la date de son arrivage');
select is((select (c ->> 'payee_en_ligne')::boolean from apres), true, 'payée par Konnect, montant reçu : « payée en ligne »');
select ok((select bool_or((l ->> 'precommande')::boolean) from apres, jsonb_array_elements(c -> 'lignes') l), 'la ligne précommandée est marquée');

-- Une seule vue de la commande : le suivi sans compte lit la même.
reset role;
select is((select c from apres), private.commande_pour_acheteur(tests.id('A'), tests.id('commande_a')),
  '« Mes commandes » et le suivi lisent la commande de la même façon');
select ok(not exists (select 1 from apres where c ? 'note_interne' or c ? 'reference' or c ? 'paiement'),
  'ni les notes de l''équipe, ni la référence du paiement');

select * from finish();
rollback;
