-- =====================================================================
-- 142 · Le client annule lui-même une commande pas encore confirmée,
--       si la boutique l'a permis ; le stock revient
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

reset role;
create temp table t_ref as select (select numero from public.commandes where id = tests.id('commande_a')) as numero,
                                  (select numero from public.commandes where id = tests.id('commande_ab_a')) as autre,
                                  (select stock from public.variantes where id = tests.id('variante_a')) as stock;
grant select on t_ref to authenticated;

select tests.connecte('client_a');
select is((select public.annuler_ma_commande(tests.id('A'), (select numero from t_ref)) ->> 'raison'), 'reglage', 'réglage coupé (par défaut) : il appelle la boutique');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'commande.annulation_client', 'true'), (tests.id('A'), 'commande.courriel_equipe', 'true');
select tests.connecte('client_a');
select is((select public.annuler_ma_commande(tests.id('A'), (select autre from t_ref)) ->> 'raison'), 'introuvable', 'la commande d''un autre client : introuvable');
select is((select public.annuler_ma_commande(tests.id('A'), (select numero from t_ref)) ->> 'ok'), 'true', 'réglage allumé, commande reçue : il l''annule');
reset role;
select is((select statut::text from public.commandes where id = tests.id('commande_a')), 'annulee', 'la commande est annulée');
select is((select stock from public.variantes where id = tests.id('variante_a')), (select stock + 1 from t_ref), 'le stock revient');
select ok(exists (select 1 from public.commande_evenements where commande_id = tests.id('commande_a') and statut_apres = 'annulee' and auteur_id = tests.id('client_a')),
  'le journal la trace, au nom du client');

select is((select count(*)::int from public.courriels_commandes where commande_id = tests.id('commande_a') and evenement = 'equipe_annulee'), 1,
  'l''équipe est prévenue par e-mail (réglage « Prévenir l''équipe »)');
select tests.connecte('proprio_a'); reset role;
update public.commandes set statut = 'annulee', motif_annulation = 'Rupture' where id = tests.id('commande_ab_a');
select is((select count(*)::int from public.courriels_commandes where commande_id = tests.id('commande_ab_a') and evenement = 'equipe_annulee'), 0,
  'annulée par l''équipe : elle le sait, rien ne lui part');
update public.commandes set statut = 'confirmee' where id = tests.id('commande_ab_a');
select tests.connecte('client_ab');
select is((select public.annuler_ma_commande(tests.id('A'), (select autre from t_ref)) ->> 'raison'), 'confirmee', 'confirmée : il faut appeler la boutique');

select * from finish();
rollback;
