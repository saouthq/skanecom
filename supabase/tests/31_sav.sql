-- =====================================================================
-- 31 · Le service après-vente : la demande du client, le travail de l'équipe
-- =====================================================================
begin;
\ir outils.psql

select plan(34);

-- Jeu d'essai (outils.psql) : client_a a une commande dans A (une ligne,
-- la valise cabine) ; client_ab en a une dans A et une dans B.
-- (Le client ne lit plus ses commandes directement, migration 23 : ces deux
-- aides lisent pour le test, avec les droits de son auteur.)
create function tests.ligne(p_commande text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.commande_lignes where commande_id = tests.id(p_commande)
$$;
create function tests.numero(p_commande text) returns text language sql security definer set search_path = '' as $$
  select numero from public.commandes where id = tests.id(p_commande)
$$;
create function tests.demande(p_commande text, p_description text default 'La roue avant est cassée depuis hier', p_boutique text default 'A')
returns jsonb language sql as $$
  select public.sav_demander(tests.id(p_boutique), tests.numero(p_commande), tests.ligne(p_commande), 'SN-1234', p_description)
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------
-- La demande du client
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select throws_like($$ select tests.demande('commande_a') $$, '%ne prend pas de demande de service après-vente%',
  'module coupé : pas de demande en ligne');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'sav');
select tests.anonyme();
select throws_ok($$ select tests.demande('commande_a') $$, '42501', null, 'un visiteur ne demande rien : la fonction lui est fermée');
reset role; select tests.connecte('client_a');
select throws_like($$ select tests.demande('commande_a') $$, '%commande livrée%', 'une commande pas encore livrée : non');

reset role;
update public.commandes set statut = 'livree', livree_at = now() - interval '2 months' where id in (tests.id('commande_a'), tests.id('commande_ab_a'));
select tests.connecte('client_a');
select throws_like($$ select tests.demande('commande_a', 'cassée') $$, '%quelques mots%', 'une description trop courte : non');
select throws_like($$ select tests.demande('commande_ab_a') $$, '%Commande introuvable%', 'la commande d''un autre client : introuvable');
select throws_like(format($$ select public.sav_demander(%L, %L, %L, null, 'La roue avant est cassée') $$,
    tests.id('A'), tests.numero('commande_a'), tests.ligne('commande_ab_a')),
  '%pas dans la commande%', 'un article d''une autre commande : non');
select is(tests.demande('commande_a') ->> 'numero', 'SAV-00001', 'la demande reçoit son numéro');
select throws_like($$ select tests.demande('commande_a') $$, '%déjà en cours pour cet article : SAV-00001%',
  'une seule demande ouverte par article');
select results_eq($$ select x ->> 'numero', x ->> 'statut', x ->> 'produit_nom', x ->> 'commande' from jsonb_array_elements(public.mes_sav(tests.id('A'))) x $$,
  $$ values ('SAV-00001', 'nouvelle', 'Valise cabine', tests.numero('commande_a')) $$, 'le client suit sa demande');
select is(public.mes_sav(tests.id('B')), '[]'::jsonb, 'dans une autre boutique, rien');
select is((select count(*)::int from public.sav_demandes), 0, 'le client ne lit pas la table (RLS)');

reset role; select tests.connecte('client_ab');
select is(jsonb_array_length(public.mes_sav(tests.id('A'))), 0, 'un autre client ne voit pas la demande');
select is(tests.demande('commande_ab_a') ->> 'numero', 'SAV-00002', 'la suivante prend le rang suivant');

-- ---------------------------------------------------------------------
-- L'équipe
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_liste_sav(%L, 'nouvelles') $$, tests.id('A')), '42501', null,
  'l''équipe d''une autre boutique ne lit rien');
select is(count(*)::int, 0, 'ni directement') from public.sav_demandes where boutique_id = tests.id('A');

reset role; select tests.connecte('lecture_a');
select is((public.gestion_sav_etat(tests.id('A')) ->> 'nouvelles')::int, 2, 'la navigation compte les nouvelles demandes');
select is((public.gestion_liste_sav(tests.id('A'), 'nouvelles') -> 'demandes' -> 0 ->> 'numero'), 'SAV-00001', 'la plus ancienne d''abord');
select is(public.gestion_sav(tests.id('A'), 'SAV-00001') ->> 'numero_serie', 'SN-1234', 'la fiche dit le numéro de série');
select is(public.gestion_sav(tests.id('A'), 'SAV-00001') -> 'garantie' ->> 'sous_garantie', null, 'sans garantie annoncée : rien à dire');
select throws_ok(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'nouvelle', 'en_cours') $$, tests.id('A')), '42501', null,
  'la lecture seule n''agit pas');

reset role; select tests.connecte('proprio_a');
select public.gestion_enregistrer_reglages(tests.id('A'), '{"sav.garantie_mois": 12}');
select is(public.gestion_sav(tests.id('A'), 'SAV-00001') -> 'garantie' ->> 'sous_garantie', 'true', 'livrée il y a deux mois, garantie un an : sous garantie');
select throws_like($$ select public.gestion_enregistrer_reglages(tests.id('A'), '{"sav.garantie_mois": 200}') $$, '%0 à 120 mois%',
  'une garantie de plus de dix ans : non');

reset role; select tests.connecte('confirm_a');
select lives_ok(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'nouvelle', 'en_cours', null, 'Le client dépose la valise demain') $$, tests.id('A')),
  'le confirmateur prend la demande en charge');
select throws_like(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'nouvelle', 'refusee', 'hors_garantie') $$, tests.id('A')),
  '%changé entre-temps%', 'un second écran resté sur « nouvelle » : refusé, pas rejoué');
select throws_like(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'en_cours', 'resolue') $$, tests.id('A')),
  '%comment la demande a été résolue%', 'résolue : il faut dire comment');
select throws_like(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'en_cours', 'refusee', 'autre') $$, tests.id('A')),
  '%Précisez%', 'refusée pour « autre » : une note');
select lives_ok(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'en_cours', 'en_cours', null, 'Roue commandée chez le fournisseur') $$, tests.id('A')),
  'une note, sans changer d''étape');
select lives_ok(format($$ select public.gestion_avancer_sav(%L, 'SAV-00001', 'en_cours', 'resolue', 'reparation', 'Roue changée') $$, tests.id('A')),
  'résolue : réparée');
select results_eq(format($$ select statut::text, issue, cloturee_at is not null from public.sav_demandes where boutique_id = %L and numero = 'SAV-00001' $$, tests.id('A')),
  $$ values ('resolue', 'reparation', true) $$, 'la demande est close, avec son issue');
select is(jsonb_array_length(public.gestion_sav(tests.id('A'), 'SAV-00001') -> 'historique'), 4, 'chaque geste reste à l''historique, la demande du client comprise');

reset role; select tests.connecte('client_a');
select is(public.mes_sav(tests.id('A')) -> 0 ->> 'issue', 'reparation', 'le client lit l''issue');
select ok(public.mes_sav(tests.id('A'))::text not like '%fournisseur%', 'jamais les notes de l''équipe');
select is(tests.demande('commande_a', 'La roue a de nouveau lâché') ->> 'numero', 'SAV-00003',
  'close, la demande ne bloque plus : le client peut en refaire une');

reset role; select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_export(tests.id('A'), 'sav')), 3, 'les demandes partent aussi à l''export des données');

select * from finish();
rollback;
