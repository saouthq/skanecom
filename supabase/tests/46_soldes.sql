-- =====================================================================
-- 46 · Les prix barrés d'un rayon (module « promotions »)
-- =====================================================================
begin;
\ir outils.psql

select plan(30);

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

-- Un sous-rayon « Cabine » sous « Valises » (cat_a), avec une valise à 95 TND ;
-- et une trousse à 8,500 TND hors des valises.
insert into public.categories (id, boutique_id, parent_id, slug, nom_fr, actif) values
  (tests.nouvel_id('cat_cabine'), tests.id('A'), tests.id('cat_a'), 'cabine', 'Cabine', true),
  (tests.nouvel_id('cat_trousses'), tests.id('A'), null, 'trousses', 'Trousses', true);
insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, publie) values
  (tests.nouvel_id('produit_cabine'), tests.id('A'), tests.id('cat_cabine'), 'petite-cabine', 'Petite cabine', true),
  (tests.nouvel_id('produit_trousse'), tests.id('A'), tests.id('cat_trousses'), 'trousse', 'Trousse', true);
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, prix_barre_millimes, stock, actif) values
  (tests.nouvel_id('v_cabine'), tests.id('A'), tests.id('produit_cabine'), 'CAB-1', '{}', 95000, 120000, 4, true),
  (tests.nouvel_id('v_trousse'), tests.id('A'), tests.id('produit_trousse'), 'TRO-1', '{}', 8500, null, 9, true);

create function pg_temp.prix(p text) returns text language sql as $$
  select prix_millimes || '/' || coalesce(prix_barre_millimes::text, '-') from public.variantes where id = tests.id(p)
$$;
create function pg_temp.lance(p_nom text, p_rayon text, p_pct integer) returns jsonb language sql as $$
  select public.gestion_lancer_soldes(tests.id('A'), p_nom, case when p_rayon is null then null else tests.id(p_rayon) end, p_pct)
$$;
create function pg_temp.id_solde(p_nom text) returns uuid language sql as $$
  select id from public.soldes where boutique_id = tests.id('A') and nom = p_nom
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- L'arrondi
-- ---------------------------------------------------------------------
reset role;
select results_eq($$ select private.prix_solde(189000, 30), private.prix_solde(95000, 25), private.prix_solde(8500, 30), private.prix_solde(200, 90) $$,
  $$ values (132000::bigint, 71000::bigint, 5900::bigint, 100::bigint) $$,
  'au dinar en dessous (132,300 → 132 ; 71,250 → 71), au dixième sous 10 TND (5,950 → 5,9), jamais sous 100 millimes');

-- ---------------------------------------------------------------------
-- Module et rôles
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.lance('Soldes', 'cat_a', 30) $$), 'module', 'module coupé : pas de prix barrés');
reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'promotions');
select tests.connecte('prepa_a');
select throws_ok($$ select pg_temp.lance('Soldes', 'cat_a', 30) $$, '42501', null, 'la préparation ne lance pas d''opération (ce sont des prix)');
reset role; select tests.connecte('proprio_a');
select is(tests.indice($$ select pg_temp.lance('S', 'cat_a', 30) $$), 'nom', 'il lui faut un nom');
select is(tests.indice($$ select pg_temp.lance('Soldes', 'cat_a', 95) $$), 'pourcentage', 'de 5 à 90 %');
select is(tests.indice($$ select pg_temp.lance('Soldes', 'cat_b', 30) $$), 'rayon', 'le rayon d''une autre boutique n''existe pas ici');

-- ---------------------------------------------------------------------
-- L'écran, l'aperçu, puis le lancement
-- ---------------------------------------------------------------------
select results_eq($$ select e ->> 'prix_barres', (select r ->> 'nom' from jsonb_array_elements(e -> 'rayons') r where r ->> 'id' = tests.id('cat_cabine')::text)
                       from (select public.gestion_soldes(tests.id('A')) e) x $$,
  $$ values ('false', 'Valises › Cabine') $$, 'l''écran sait que la vitrine cache les prix barrés, et nomme les sous-rayons');
select results_eq($$ select (a ->> 'declinaisons')::integer, (a ->> 'produits')::integer, a #>> '{exemples,0,apres}'
                       from (select public.gestion_apercu_soldes(tests.id('A'), tests.id('cat_a'), 30) a) x $$,
  $$ values (2, 2, '132000') $$, 'l''aperçu : la valise et la petite cabine du sous-rayon, et leur prix remisé');
select is((pg_temp.lance('Soldes d''automne', 'cat_a', 30) ->> 'declinaisons')::integer, 2, 'lancée : deux déclinaisons remisées');
select results_eq($$ select pg_temp.prix('variante_a'), pg_temp.prix('v_cabine'), pg_temp.prix('v_trousse') $$,
  $$ values ('132000/189000', '66000/95000', '8500/-') $$,
  'le prix remisé, l''ancien barré (95 TND, pas l''ancien barré de 120 TND) ; la trousse, hors rayon, ne bouge pas');
select is((select prix_min_millimes from public.produits where id = tests.id('produit_a')), 132000::bigint, 'le « dès » du produit suit');
select results_eq($$ select (a ->> 'declinaisons')::integer, (a ->> 'deja_soldees')::integer
                       from (select public.gestion_apercu_soldes(tests.id('A'), tests.id('cat_a'), 50) a) x $$,
  $$ values (0, 2) $$, 'un second aperçu du même rayon : tout y est déjà remisé');
select is(tests.indice($$ select pg_temp.lance('Encore', 'cat_cabine', 50) $$), 'vide', 'déjà remisée : on ne remise pas deux fois');
select is((pg_temp.lance('Tout', null, 10) ->> 'declinaisons')::integer, 1, 'tout le catalogue : seule la trousse, les autres sont déjà remisées');
select is(public.gestion_promotions_etat(tests.id('A')) ->> 'soldes_en_cours', '2', 'la navigation sait qu''il y a deux opérations en cours');
select results_eq($$ select o ->> 'nom', o ->> 'pourcentage', o -> 'variantes' ->> 0
                       from jsonb_array_elements(public.gestion_soldes_du_produit(tests.id('A'), tests.id('produit_a'))) o $$,
  $$ values ('Soldes d''automne', '30', tests.id('variante_a')::text) $$, 'la fiche produit sait quelle opération remise quelle déclinaison');

-- Le tunnel lit le prix remisé ; une commande pendant l'opération compte
-- (en invitée, avec du stock : le jeu d'essai en réserve déjà deux).
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false');
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 50 where id = tests.id('variante_a');
select set_config('skanecom.ecriture_stock', '', true);
select tests.anonyme();
select is((public.devis_commande(tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)), 'tunis') ->> 'sous_total_millimes')::bigint,
  132000::bigint, 'le panier paie le prix remisé');
select public.passer_commande(tests.id('A'), 'essai-soldes-1-000000',
  jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)),
  jsonb_build_object('nom', 'Acheteuse soldes', 'telephone', '20 200 001', 'accepte_conditions', true),
  jsonb_build_object('ligne1', '5 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', 'tunis'),
  138000, null, null);
-- Le test tient en une transaction : la commande y serait datée de son
-- début (now()), avant les lancements (clock_timestamp()). Elle est passée après.
reset role;
update public.commandes set created_at = clock_timestamp() where boutique_id = tests.id('A') and contact_nom = 'Acheteuse soldes';
select tests.connecte('proprio_a');
select results_eq($$ select (s ->> 'vendues')::integer, (s ->> 'ventes_millimes')::bigint
                       from jsonb_array_elements(public.gestion_soldes(tests.id('A')) -> 'soldes') s where s ->> 'nom' = 'Soldes d''automne' $$,
  $$ values (1, 132000::bigint) $$, 'ce que l''opération a vendu : une valise à 132 TND');

-- ---------------------------------------------------------------------
-- Pendant : l'équipe change un prix ; puis la fin
-- ---------------------------------------------------------------------
select public.gestion_enregistrer_variante(tests.id('A'), tests.id('v_cabine'), 60000, 95000, 2, true);
select results_eq($$ select (r ->> 'rendues')::integer, (r ->> 'gardees')::integer
                       from (select public.gestion_terminer_soldes(tests.id('A'), pg_temp.id_solde('Soldes d''automne')) r) x $$,
  $$ values (1, 1) $$, 'terminée : une déclinaison rendue, une gardée (son prix changé pendant l''opération)');
select results_eq($$ select pg_temp.prix('variante_a'), pg_temp.prix('v_cabine') $$,
  $$ values ('189000/-', '60000/95000') $$, 'la valise retrouve son prix, sans prix barré ; la petite cabine garde la saisie de l''équipe');
select is((select prix_min_millimes from public.produits where id = tests.id('produit_a')), 189000::bigint, 'le « dès » revient');
select is(tests.indice($$ select public.gestion_terminer_soldes(tests.id('A'), pg_temp.id_solde('Soldes d''automne')) $$), 'etat',
  'terminer deux fois : refusé');
select is((pg_temp.lance('Relance', 'cat_a', 20) ->> 'declinaisons')::integer, 2, 'rendues, les déclinaisons peuvent être remisées de nouveau');

-- Module coupé : rien ne se lance, mais une opération en cours se termine.
reset role;
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'promotions';
select tests.connecte('proprio_a');
select results_eq($$ select (public.gestion_terminer_soldes(tests.id('A'), pg_temp.id_solde('Tout')) ->> 'rendues')::integer, pg_temp.prix('v_trousse') $$,
  $$ values (1, '8500/-') $$, 'module coupé : les prix se rendent quand même');

-- ---------------------------------------------------------------------
-- La liste, le journal, les droits
-- ---------------------------------------------------------------------
select results_eq($$ select s ->> 'nom', s ->> 'statut' from jsonb_array_elements(public.gestion_soldes(tests.id('A')) -> 'soldes') s $$,
  $$ values ('Relance', 'en_cours'), ('Tout', 'terminees'), ('Soldes d''automne', 'terminees') $$, 'en cours d''abord, puis les terminées, les plus récentes en tête');
reset role;
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action like 'soldes.%'), 5,
  'trois lancements et deux fins, au journal');
select tests.connecte('lecture_a');
select is(jsonb_array_length(public.gestion_soldes(tests.id('A')) -> 'soldes'), 3, 'la lecture voit les opérations');
select throws_ok($$ select public.gestion_terminer_soldes(tests.id('A'), pg_temp.id_solde('Relance')) $$, '42501', null,
  'la lecture ne les termine pas');
reset role; select tests.connecte('proprio_b');
select is((select count(*)::integer from public.soldes where boutique_id = tests.id('A')), 0, 'une autre boutique ne voit pas les opérations de A');
select ok(not has_function_privilege('anon', 'public.gestion_lancer_soldes(uuid, text, uuid, integer)', 'execute')
          and not has_function_privilege('authenticated', 'private.prix_solde(bigint, integer)', 'execute'),
  'rien pour un visiteur ; l''arrondi reste interne');

select * from finish();
rollback;
