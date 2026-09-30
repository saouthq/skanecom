-- =====================================================================
-- 36 · Les comptes professionnels et leurs prix
-- =====================================================================
begin;
\ir outils.psql

select plan(46);

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

-- Une perceuse chez A : 200 TND au public, 170 TND aux pros ; et la valise
-- (189 TND), sans prix pro.
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('perceuse'), tests.id('A'), tests.id('produit_a'), 'PERC-18', '{"couleur": "Jaune"}', 200000, 20, true);
-- « inconnu » n'a encore aucune fiche client chez A ; il a un numéro.
update auth.users set phone = '21620000009' where id = tests.id('inconnu');

create function pg_temp.demande(p_raison text default 'Plomberie Ben Salem', p_matricule text default '1234567A/M/000') returns jsonb
language sql as $$
  select public.demander_compte_pro(tests.id('A'), p_raison, p_matricule, 'Plombier', 'Chantiers à Sfax')
$$;
create function pg_temp.decide(p_client text, p_decision text, p_motif text default null, p_vu text default null, p_raison text default null)
returns void language sql as $$
  select public.gestion_decider_compte_pro(tests.id('A'), tests.id(p_client), p_decision, p_motif, p_vu, p_raison)
$$;
create function pg_temp.devis(p_variante text, p_quantite integer default 1) returns jsonb language sql as $$
  select public.devis_commande(tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id(p_variante), 'quantite', p_quantite)), 'tunis')
$$;
create function pg_temp.statut(p_client text) returns text language sql as $$
  select statut from public.comptes_pro where client_id = tests.id(p_client)
$$;

-- ---------------------------------------------------------------------
-- Module coupé : rien
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select pg_temp.demande() $$), 'module', 'module coupé : pas de demande');
select is(public.mon_compte_pro(tests.id('A')), null, '… ni de compte à lire');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'comptes_pro');
select is((select disponible from plateforme.modules where code = 'comptes_pro'), true, 'le module est disponible à la console');

-- ---------------------------------------------------------------------
-- La demande
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok($$ select pg_temp.demande() $$, '42501', null, 'un visiteur sans compte ne demande rien');

reset role; select tests.connecte('client_a');
select is(tests.indice($$ select pg_temp.demande('X') $$), 'raison_sociale', 'une raison sociale d''une lettre : non');
select is(tests.indice($$ select pg_temp.demande('Plomberie Ben Salem', '12') $$), 'matricule', 'un matricule fiscal illisible : non');
select is(pg_temp.demande() ->> 'statut', 'demande', 'le client connecté demande un compte professionnel');
select is(pg_temp.demande('Plomberie Ben Salem SARL') ->> 'raison_sociale', 'Plomberie Ben Salem SARL', 'une demande en attente se complète');
select is((select count(*)::int from public.comptes_pro), 0, 'le client ne lit pas la table des comptes (seulement sa fonction)');
select throws_ok($$ insert into public.comptes_pro (boutique_id, client_id, raison_sociale, statut) values (tests.id('A'), tests.id('fiche_client_a'), 'Moi', 'valide') $$,
  '42501', null, 'ni ne s''y valide lui-même');

reset role; select tests.connecte('inconnu');
select is(pg_temp.demande('Électricité Trabelsi') ->> 'statut', 'demande', 'un compte sans commande demande aussi…');
reset role;
select is((select telephone from public.clients where boutique_id = tests.id('A') and user_id = tests.id('inconnu')), '+21620000009',
  '… sa fiche client naît avec son numéro');
-- (la plomberie a demandé une heure plus tôt : dans une transaction, now() ne bouge pas)
update public.comptes_pro set demande_le = demande_le - interval '1 hour' where client_id = tests.id('fiche_client_a');
update public.clients set niveau_risque = 'bloque' where id = tests.id('fiche_client_ab_a');
reset role; select tests.connecte('client_ab');
select is(tests.indice($$ select pg_temp.demande('Bâtiment AB') $$), 'bloque', 'un client bloqué ne demande pas de compte');
reset role;
update public.clients set niveau_risque = 'normal' where id = tests.id('fiche_client_ab_a');

-- ---------------------------------------------------------------------
-- Le backoffice : qui voit, qui décide
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is((public.gestion_pro_etat(tests.id('A')) ->> 'demandes')::int, 2, 'l''équipe voit deux demandes en attente');
select results_eq($$ select c ->> 'raison_sociale' from jsonb_array_elements(public.gestion_comptes_pro(tests.id('A')) -> 'comptes') c $$,
  $$ values ('Plomberie Ben Salem SARL'), ('Électricité Trabelsi') $$, 'la plus ancienne demande d''abord');
select is(tests.indice($$ select pg_temp.decide('fiche_client_a', 'valide') $$), 'role', 'la lecture ne valide pas');
reset role; select tests.connecte('confirm_a');
select is(tests.indice($$ select pg_temp.decide('fiche_client_a', 'valide') $$), 'role', 'la confirmation non plus (c''est un prix)');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_comptes_pro(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne voit rien');

reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.decide('fiche_client_a', 'refuse') $$), 'motif', 'un refus dit pourquoi');
select is(tests.indice($$ select pg_temp.decide('fiche_client_a', 'retire', 'x') $$), 'etat', 'on ne retire pas un compte qui n''est pas ouvert');
select is(tests.indice($$ select pg_temp.decide('fiche_client_a', 'valide', null, 'valide') $$), 'change', 'l''étape vue à l''écran est revérifiée');
select lives_ok($$ select pg_temp.decide('fiche_client_a', 'valide', null, 'demande') $$, 'la propriétaire valide la plomberie');
select lives_ok($$ select pg_temp.decide('fiche_invite_a', 'valide', null, 'aucun', 'Menuiserie du Lac') $$,
  'elle ouvre d''emblée le compte d''un client qu''elle connaît');
select is(tests.indice($$ select pg_temp.decide('fiche_client_ab_a', 'valide') $$), 'raison_sociale', '… en donnant sa raison sociale');
select is(pg_temp.statut('fiche_invite_a'), 'valide', 'le compte ouvert d''emblée est validé');
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select pg_temp.demande() $$), 'deja', 'un pro validé ne redemande pas');
reset role;
select results_eq(format($$ select ja.apres ->> 'statut', ja.avant ->> 'statut' from plateforme.journal_audit ja
                              where ja.action = 'clients.compte_pro' and ja.cible = %L $$, tests.id('fiche_client_a')),
  $$ values ('valide', 'demande') $$, 'la décision passe au journal, avec l''avant');

-- ---------------------------------------------------------------------
-- Les prix pro
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select is(tests.indice(format($$ select public.gestion_enregistrer_prix_pro(%L, %L, 170000) $$, tests.id('A'), tests.id('perceuse'))), 'role',
  'la préparation ne fixe pas de prix');
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_enregistrer_prix_pro(%L, %L, 200000) $$, tests.id('A'), tests.id('perceuse'))), 'prix_pro',
  'un prix pro égal au prix public : non');
select lives_ok(format($$ select public.gestion_enregistrer_prix_pro(%L, %L, 170000) $$, tests.id('A'), tests.id('perceuse')),
  'la perceuse à 170 TND pour les pros');
select is((select (v ->> 'prix_pro')::bigint from jsonb_array_elements(public.gestion_produit(tests.id('A'), tests.id('produit_a')) -> 'variantes') v
            where v ->> 'sku' = 'PERC-18'), 170000::bigint, 'la fiche du backoffice le relit');

reset role; select tests.anonyme();
select is((select count(*)::int from public.prix_pro), 0, 'un visiteur ne lit aucun prix pro…');
select is(public.mes_prix_pro(tests.id('A'), array[tests.id('produit_a')]), '{}'::jsonb, '… ni par la fonction');
select is((pg_temp.devis('perceuse') -> 'lignes' -> 0 ->> 'prix_unitaire_millimes')::bigint, 200000::bigint, 'son devis : le prix public');

reset role; select tests.connecte('inconnu');
select is(public.mes_prix_pro(tests.id('A'), array[tests.id('produit_a')]), '{}'::jsonb, 'une demande en attente ne voit pas les prix pro');

reset role; select tests.connecte('client_a');
select is(public.mes_prix_pro(tests.id('A'), array[tests.id('produit_a')]), jsonb_build_object(tests.id('perceuse'), 170000),
  'le pro validé lit le prix pro de la perceuse (et rien pour la valise, sans prix pro)');
select results_eq($$ select d ->> 'tarif', (d -> 'lignes' -> 0 ->> 'prix_unitaire_millimes')::bigint,
                            (d -> 'lignes' -> 0 ->> 'prix_public_millimes')::bigint, (d ->> 'economie_pro_millimes')::bigint,
                            (d ->> 'sous_total_millimes')::bigint
                       from (select pg_temp.devis('perceuse', 2) d) x $$,
  $$ values ('pro', 170000::bigint, 200000::bigint, 60000::bigint, 340000::bigint) $$,
  'son devis : le tarif pro, le prix public à côté, l''économie (2 × 30 TND)');
select is((select r ->> 'total_millimes' from (select public.passer_commande(tests.id('A'), 'essai-pro-client-a-0000001',
             jsonb_build_array(jsonb_build_object('variante_id', tests.id('perceuse'), 'quantite', 2)),
             jsonb_build_object('nom', 'Client A', 'telephone', '20 000 001', 'accepte_conditions', true),
             jsonb_build_object('ligne1', '1 rue de Rome', 'ville', 'Tunis', 'gouvernorat', 'tunis'), 346000) r) x),
  '346000', 'il commande au prix pro (340 TND + 6 TND de livraison)');
reset role;
select is((select prix_unitaire_millimes from public.commande_lignes l join public.commandes c on c.id = l.commande_id
            where c.cle_idempotence = 'essai-pro-client-a-0000001'), 170000::bigint, 'la commande garde le prix appliqué');

-- Le prix public baisse sous le prix pro : le pro paie le moins cher des deux.
update public.variantes set prix_millimes = 160000 where id = tests.id('perceuse');
reset role; select tests.connecte('client_a');
select is((pg_temp.devis('perceuse') -> 'lignes' -> 0 ->> 'prix_unitaire_millimes')::bigint, 160000::bigint,
  'jamais plus cher que le prix public');
reset role;
update public.variantes set prix_millimes = 200000 where id = tests.id('perceuse');

-- Le module coupé un temps : le pro validé repaie le prix public.
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'comptes_pro';
reset role; select tests.connecte('client_a');
select results_eq($$ select d ->> 'tarif', (d -> 'lignes' -> 0 ->> 'prix_unitaire_millimes')::bigint from (select pg_temp.devis('perceuse') d) x $$,
  $$ values ('public', 200000::bigint) $$, 'module coupé : le prix public, même pour un pro validé');
reset role;
update plateforme.modules_actifs set actif = true where boutique_id = tests.id('A') and module = 'comptes_pro';

-- ---------------------------------------------------------------------
-- Retirer, couper le module
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select lives_ok($$ select pg_temp.decide('fiche_client_a', 'retire', 'Plus d''activité depuis un an', 'valide') $$, 'un compte se retire, avec un motif');
reset role; select tests.connecte('client_a');
select results_eq($$ select c ->> 'statut', c ->> 'motif' from (select public.mon_compte_pro(tests.id('A')) c) x $$,
  $$ values ('retire', 'Plus d''activité depuis un an') $$, 'le client lit le retrait et son motif');
select is(pg_temp.devis('perceuse') ->> 'tarif', 'public', 'retiré : le prix public');

reset role;
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'comptes_pro';
reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.decide('fiche_client_a', 'valide', null, 'retire') $$), 'module', 'module coupé : plus de décision');
reset role;
select is((select count(*)::int from public.comptes_pro where boutique_id = tests.id('A')), 3, '… et rien ne s''efface');

select * from finish();
rollback;
