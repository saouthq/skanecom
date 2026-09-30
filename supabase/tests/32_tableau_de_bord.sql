-- =====================================================================
-- 32 · Le tableau de bord : ce qu'une période a donné
-- =====================================================================
begin;
\ir outils.psql

select plan(18);

-- Jeu d'essai (outils.psql) : A a déjà deux commandes reçues à l'instant,
-- sans montant. On y ajoute, sur les 30 derniers jours : deux livrées (dont
-- une de deux valises), une refusée par le client à Sfax, une annulée sans
-- confirmation, une à confirmer ; une livrée il y a 40 jours (période
-- précédente) ; une il y a 70 jours (hors des deux) ; une à arbitrer.
-- Assez de valises pour toutes ces commandes (le stock ne change que par un mouvement).
select tests.connecte('proprio_a');
select public.mouvement_stock(tests.id('A'), tests.id('variante_a'), 1000, 'reception', 'Pour le jeu d''essai');
reset role;

create function pg_temp.commande(p_nom text, p_statut public.statut_commande, p_jours_avant numeric, p_total bigint,
                                 p_gouv text default 'tunis', p_confirmee_minutes integer default null, p_quantite integer default 1)
returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into public.commandes (id, boutique_id, client_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville,
                                livraison_gouvernorat, statut, total_millimes, created_at, confirmee_at, refus_origine)
  values (tests.nouvel_id(p_nom), tests.id('A'), tests.id('fiche_client_a'), 'Client A', '+21620000001', '1 rue de Rome', 'Tunis',
          p_gouv, p_statut, p_total, now() - make_interval(secs => p_jours_avant * 86400),
          case when p_confirmee_minutes is not null then now() - make_interval(secs => p_jours_avant * 86400) + make_interval(mins => p_confirmee_minutes) end,
          case when p_statut = 'refusee' then 'client'::public.origine_refus end)
  returning id into v_id;
  insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
  values (tests.id('A'), v_id, tests.id('variante_a'), 'Valise cabine', p_total / p_quantite, p_quantite, p_total);
end $$;

select pg_temp.commande('livree_1',  'livree',  2,   100000, 'tunis', 30);
select pg_temp.commande('livree_2',  'livree',  5,   200000, 'tunis', 90, 2);
select pg_temp.commande('refusee_1', 'refusee', 10,  150000, 'sfax',  60);
select pg_temp.commande('annulee_1', 'annulee', 3,   80000);
select pg_temp.commande('recue_1',   'recue',   0.1, 50000);
select pg_temp.commande('ancienne',  'livree',  40,  80000,  'tunis', 20);
select pg_temp.commande('tres_vieille', 'livree', 70, 999000, 'tunis', 20);
select pg_temp.commande('arbitrer',  'a_arbitrer', 1, 70000);

create function pg_temp.t(p_jours integer default 30) returns jsonb language sql as $$
  select public.gestion_tableau_de_bord(tests.id('A'), p_jours)
$$;

-- ---------------------------------------------------------------------
-- Qui lit
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok($$ select pg_temp.t() $$, '42501', null, 'un visiteur ne lit rien');
reset role; select tests.connecte('confirm_a');
select throws_ok($$ select pg_temp.t() $$, '42501', null, 'la confirmation n''a pas besoin du chiffre d''affaires');
reset role; select tests.connecte('proprio_b');
select throws_ok($$ select pg_temp.t() $$, '42501', null, 'une autre boutique non plus');

-- ---------------------------------------------------------------------
-- Les chiffres (30 jours)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select results_eq($$ select (c ->> 'recues')::int, (c ->> 'a_confirmer')::int, (c ->> 'confirmees')::int, (c ->> 'livrees')::int,
                            (c ->> 'refusees')::int, (c ->> 'annulees')::int
                       from (select pg_temp.t() -> 'courante' as c) x $$,
  $$ values (7, 3, 3, 2, 1, 1) $$, 'les commandes de la période, par ce qu''elles sont devenues (à arbitrer : à part)');
select is((pg_temp.t() -> 'courante' ->> 'taux_confirmation')::numeric, 0.750, 'confirmées parmi les commandes tranchées : 3 sur 4');
select is((pg_temp.t() -> 'courante' ->> 'taux_refus')::numeric, 0.333, 'refusées parmi les colis arrivés au bout : 1 sur 3');
select is((pg_temp.t() -> 'courante' ->> 'encaisse_millimes')::bigint, 300000::bigint, 'l''encaissé : les commandes livrées');
select is((pg_temp.t() -> 'courante' ->> 'perdu_millimes')::bigint, 150000::bigint, 'le perdu : les colis revenus');
select is((pg_temp.t() -> 'courante' ->> 'panier_moyen_millimes')::bigint, 83333::bigint, 'le panier moyen, sans les annulées');
select is((pg_temp.t() -> 'courante' ->> 'confirmation_minutes')::int, 60, 'le délai de confirmation, en médiane');
select results_eq($$ select (p ->> 'recues')::int, (p ->> 'encaisse_millimes')::bigint from (select pg_temp.t() -> 'precedente' as p) x $$,
  $$ values (1, 80000::bigint) $$, 'la période précédente, pour comparer ; plus ancien : hors compte');
select is(jsonb_array_length(pg_temp.t() -> 'par_jour'), 30, 'un point par jour');
select is((select sum((j ->> 'recues')::int)::int from jsonb_array_elements(pg_temp.t() -> 'par_jour') j), 7, 'les jours comptent toutes les commandes');
select is(pg_temp.t() -> 'refus_origines', '[{"refus": 1, "origine": "client"}]'::jsonb, 'les refus par origine');
select is(pg_temp.t() -> 'gouvernorats' -> 0 ->> 'code', 'sfax', 'le gouvernorat où les colis reviennent vient en tête');
select is((pg_temp.t() -> 'produits' -> 0 ->> 'quantite')::int, 3, 'ce qui se vend : les quantités livrées');

select is((pg_temp.t(7) -> 'courante' ->> 'recues')::int, 6, 'sur 7 jours : la semaine seulement');
select is((pg_temp.t(12) ->> 'jours')::int, 30, 'une période inconnue : 30 jours');

select * from finish();
rollback;
