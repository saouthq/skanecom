-- =====================================================================
-- 86 · Les lots : un prix pour un ensemble (module promotions)
-- =====================================================================
begin;
\ir outils.psql

select plan(36);

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

-- La valise de A (189,000) ; une trousse en deux tailles (S 39,000, L 49,000) ;
-- une étiquette (15,000). Livrées à Tunis : 6,000 de frais.
insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, publie) values
  (tests.nouvel_id('trousse'),   tests.id('A'), tests.id('cat_a'), 'trousse',   'Trousse de toilette', true),
  (tests.nouvel_id('etiquette'), tests.id('A'), tests.id('cat_a'), 'etiquette', 'Étiquette de bagage', true);
insert into public.produit_options (boutique_id, produit_id, cle, label_fr) values
  (tests.id('A'), tests.id('trousse'), 'taille', 'Taille');
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('trousse_s'), tests.id('A'), tests.id('trousse'),   'TRO-S', '{"taille": "S"}', 39000, 5, true),
  (tests.nouvel_id('trousse_l'), tests.id('A'), tests.id('trousse'),   'TRO-L', '{"taille": "L"}', 49000, 5, true),
  (tests.nouvel_id('etiq'),      tests.id('A'), tests.id('etiquette'), 'ETI-1', '{}',              15000, 9, true);
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 9 where id = tests.id('variante_a');
select set_config('skanecom.ecriture_stock', '', true);

-- Un panier : des (variante, quantité).
create function pg_temp.panier(variadic p text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('variante_id', tests.id(p[i]), 'quantite', p[i + 1]::integer))
    from generate_series(1, cardinality(p), 2) i
$$;
create function pg_temp.devis(p_lignes jsonb, p_code text default null) returns jsonb language sql as $$
  select public.devis_commande(tests.id('A'), p_lignes, 'tunis', null, p_code)
$$;
create function pg_temp.ligne(p_devis jsonb, p_sku text) returns jsonb language sql as $$
  select l from jsonb_array_elements(p_devis -> 'lignes') l where l ->> 'sku' = p_sku
$$;
create function pg_temp.lot(p_nom text, p_produits uuid[], p_prix bigint, p_id uuid default null) returns jsonb language sql as $$
  select public.gestion_enregistrer_lot(tests.id('A'), p_id, p_nom, null, p_produits, p_prix)
$$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Composer : le module, les rôles, la forme
-- ---------------------------------------------------------------------
select tests.connecte('proprio_a');
select is(tests.indice(format($$ select pg_temp.lot('Le départ', %L, 199000) $$, array[tests.id('produit_a'), tests.id('trousse')])),
  'module', 'module promotions coupé : pas de lot');
reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'promotions'), (tests.id('B'), 'promotions');

select tests.connecte('lecture_a');
select throws_ok(format($$ select pg_temp.lot('Le départ', %L, 199000) $$, array[tests.id('produit_a'), tests.id('trousse')]),
  '42501', null, 'la lecture seule ne compose pas de lot');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select pg_temp.lot('Le départ', %L, 199000) $$, array[tests.id('produit_a'), tests.id('trousse')]),
  '42501', null, 'une autre boutique non plus');

reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select pg_temp.lot('Le départ', %L, 199000) $$, array[tests.id('produit_a'), tests.id('produit_a')])),
  'produits', 'un seul produit, deux fois : refusé (deux à quatre produits différents)');
select is(tests.indice(format($$ select pg_temp.lot('Le départ', %L, 100000) $$, array[tests.id('produit_a'), tests.id('produit_a_brouillon')])),
  'produits', 'un produit qui n''est pas en vente : refusé');
select is(tests.indice(format($$ select pg_temp.lot('Le départ', %L, 100000) $$, array[tests.id('produit_a'), tests.id('produit_b')])),
  'produits', 'un produit d''une autre boutique : refusé');
select is(tests.indice(format($$ select pg_temp.lot('Le départ', %L, 228000) $$, array[tests.id('produit_a'), tests.id('trousse')])),
  'prix_lot', 'au prix de ses produits achetés un à un (189 + 39) : refusé');
select is(tests.indice(format($$ select pg_temp.lot('L', %L, 199000) $$, array[tests.id('produit_a'), tests.id('trousse')])),
  'nom', 'un nom d''une lettre : refusé');
select is((pg_temp.lot('Le départ', array[tests.id('produit_a'), tests.id('trousse')], 199000) ->> 'valeur_millimes')::bigint,
  228000::bigint, 'la valise et la trousse, 199,000 au lieu de 228,000 : composé');
reset role;
select ok((select count(*) = 1 from plateforme.journal_audit j where j.action = 'lot.creer' and j.acteur = tests.id('proprio_a')),
  'au journal, par qui l''a composé');

-- ---------------------------------------------------------------------
-- La vitrine le lit
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select ok((with v as (select public.vitrine_lots(tests.id('A'), array['trousse']) -> 0 as l)
           select l ->> 'nom' = 'Le départ' and (l ->> 'valeur_millimes')::bigint = 228000 and jsonb_array_length(l -> 'produits') = 2
              and jsonb_array_length(l #> '{produits,1,variantes}') = 2 and l #> '{produits,1,variantes}' @> '[{"libelle": "S"}]' from v),
  'la fiche de la trousse lit le lot : sa valeur, ses produits, les tailles');
select is(jsonb_array_length(public.vitrine_lots(tests.id('A'), array['etiquette'])), 0, 'la fiche de l''étiquette : aucun lot');
select is((select count(*)::integer from public.lots), 0, 'la table des lots ne se lit pas directement');

-- ---------------------------------------------------------------------
-- Le chiffrage l'applique
-- ---------------------------------------------------------------------
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1')) as d)
                     select (d ->> 'sous_total_millimes')::bigint, (d ->> 'economie_lots_millimes')::bigint, (d ->> 'total_millimes')::bigint,
                            (d #>> '{lots,0,fois}')::integer from d $$,
  $$ values (199000::bigint, 39000::bigint, 205000::bigint, 1) $$,
  'la valise et la trousse L (238,000) : le lot, 199,000, plus la livraison');
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1')) as d)
                     select (pg_temp.ligne(d, 'VAL-55-NOIR') ->> 'remise_lot_millimes')::bigint,
                            (pg_temp.ligne(d, 'VAL-55-NOIR') ->> 'total_ligne_millimes')::bigint,
                            (pg_temp.ligne(d, 'TRO-L') ->> 'remise_lot_millimes')::bigint,
                            pg_temp.ligne(d, 'TRO-L') ->> 'lot',
                            (pg_temp.ligne(d, 'TRO-L') ->> 'total_sans_lot_millimes')::bigint from d $$,
  $$ values (30971::bigint, 158029::bigint, 8029::bigint, 'Le départ', 49000::bigint) $$,
  'l''économie au prorata du prix ; l''arrondi à la plus chère ; chaque ligne dit son lot');
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_s', '1', 'trousse_l', '1')) as d)
                     select pg_temp.ligne(d, 'TRO-S') ->> 'lot', pg_temp.ligne(d, 'TRO-L') ->> 'lot',
                            (d ->> 'economie_lots_millimes')::bigint from d $$,
  $$ values ('Le départ', null::text, 29000::bigint) $$,
  'les deux tailles au panier : le lot prend la moins chère, l''autre reste à son prix');
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '2', 'trousse_s', '3')) as d)
                     select (d #>> '{lots,0,fois}')::integer, (d ->> 'economie_lots_millimes')::bigint,
                            (d ->> 'sous_total_millimes')::bigint from d $$,
  $$ values (2, 58000::bigint, 437000::bigint) $$,
  'deux valises, trois trousses : deux lots, la troisième trousse à son prix');
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '1', 'etiq', '1')) as d)
                     select d -> 'lots', d -> 'economie_lots_millimes', (d ->> 'sous_total_millimes')::bigint from d $$,
  $$ values ('[]'::jsonb, 'null'::jsonb, 204000::bigint) $$,
  'le lot incomplet : rien ne change');

-- Un code promo vaut ensuite, sur ce qui reste.
reset role; select tests.connecte('proprio_a');
select ok((public.gestion_enregistrer_code(tests.id('A'), null, 'DIX', 'pourcentage', 10, 0, null, null, null, true, null)) ->> 'code' = 'DIX',
  'un code de 10 %');
reset role; select tests.anonyme();
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1'), 'DIX') as d)
                     select (d ->> 'remise_millimes')::bigint, (d ->> 'total_millimes')::bigint from d $$,
  $$ values (19900::bigint, 185100::bigint) $$,
  'le code, après le lot : 10 % de 199,000');

-- La livraison offerte se compte sur ce que le client paie.
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'livraison.seuil_gratuite_millimes', '220000');
select tests.anonyme();
select results_eq($$ select (pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1')) ->> 'frais_livraison_millimes')::bigint,
                            (pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1', 'etiq', '2')) ->> 'frais_livraison_millimes')::bigint $$,
  $$ values (6000::bigint, 0::bigint) $$,
  'offerte dès 220,000 : 199,000 la paie ; 229,000 (avec deux étiquettes) ne la paie plus');
reset role;
delete from public.reglages where boutique_id = tests.id('A') and cle = 'livraison.seuil_gratuite_millimes';

-- Une pièce au prix par quantité n'entre pas dans un lot.
insert into public.prix_quantite (boutique_id, produit_id, quantite, prix_millimes) values (tests.id('A'), tests.id('trousse'), 2, 70000);
select tests.anonyme();
select results_eq($$ with d as (select pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_s', '2')) as d)
                     select (pg_temp.ligne(d, 'TRO-S') ->> 'palier')::integer, d -> 'lots', (d ->> 'sous_total_millimes')::bigint from d $$,
  $$ values (2, '[]'::jsonb, 259000::bigint) $$,
  'deux trousses à 70,000 (le palier) : pas de lot en plus, les remises ne se cumulent pas');
reset role;
delete from public.prix_quantite where boutique_id = tests.id('A') and produit_id = tests.id('trousse');

-- Coupé : plus appliqué, plus proposé ; rallumé : de nouveau.
select tests.connecte('proprio_a');
select is(public.gestion_geste_lot(tests.id('A'), (select id from public.lots where nom = 'Le départ'), 'couper') ->> 'geste', 'couper', 'le lot coupé');
reset role; select tests.anonyme();
select results_eq($$ select pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1')) -> 'lots',
                            jsonb_array_length(public.vitrine_lots(tests.id('A'), array['trousse'])) $$,
  $$ values ('[]'::jsonb, 0) $$,
  'coupé : le panier ne l''applique plus, la fiche ne le propose plus');
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_geste_lot(%L, %L, 'couper') $$, tests.id('A'), (select id from public.lots where nom = 'Le départ'))),
  'etat', 'le couper deux fois : refusé');
select ok(public.gestion_geste_lot(tests.id('A'), (select id from public.lots where nom = 'Le départ'), 'rallumer') is not null, 'rallumé');

-- Le module coupé : aucun lot ne vaut, rien ne s'efface.
reset role;
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'promotions';
select tests.anonyme();
select is(pg_temp.devis(pg_temp.panier('variante_a', '1', 'trousse_l', '1')) -> 'lots', '[]'::jsonb, 'module coupé : le lot ne vaut plus');
reset role;
update plateforme.modules_actifs set actif = true where boutique_id = tests.id('A') and module = 'promotions';
select ok(exists (select 1 from public.lots where nom = 'Le départ' and actif), 'et il est toujours là');

-- ---------------------------------------------------------------------
-- La commande le garde
-- ---------------------------------------------------------------------
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false');
select tests.anonyme();
select is((public.passer_commande(tests.id('A'), 'essai-lot-1-0000000000',
            pg_temp.panier('variante_a', '1', 'trousse_l', '1'),
            jsonb_build_object('nom', 'Amel Lot', 'telephone', '+21655100200', 'accepte_conditions', true),
            jsonb_build_object('ligne1', '5 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', 'tunis'),
            205000, null, null) ->> 'total_millimes')::bigint,
  205000::bigint, 'la commande passée au prix du lot');
reset role;
select results_eq($$ select l.sku, l.lot_nom, l.remise_lot_millimes, l.total_ligne_millimes
                       from public.commande_lignes l join public.commandes c on c.id = l.commande_id
                      where c.cle_idempotence = 'essai-lot-1-0000000000' order by l.sku $$,
  $$ values ('TRO-L', 'Le départ', 8029::bigint, 40971::bigint), ('VAL-55-NOIR', 'Le départ', 30971::bigint, 158029::bigint) $$,
  'ses lignes gardent le lot et ce qu''il leur retire');
select tests.connecte('proprio_a');
select is((select l -> 'lot' from jsonb_array_elements(public.gestion_commande(tests.id('A'),
             (select numero from public.commandes where cle_idempotence = 'essai-lot-1-0000000000')) -> 'lignes') l
            where l ->> 'sku' = 'TRO-L'), '"Le départ"'::jsonb,
  'la fiche de la commande dit le lot de la ligne');
select results_eq($$ select (l ->> 'commandes')::integer, (l ->> 'remises_millimes')::bigint
                       from jsonb_array_elements(public.gestion_lots(tests.id('A')) -> 'lots') l where l ->> 'nom' = 'Le départ' $$,
  $$ values (1, 39000::bigint) $$,
  'l''écran des lots compte sa commande et ce qu''il a offert');
select is((public.gestion_promotions_etat(tests.id('A')) ->> 'lots')::integer, 1, 'la navigation compte les lots');

-- Une commande saisie par l'équipe : le lot aussi.
select is((public.gestion_chiffrer_saisie(tests.id('A'), '+21655100300', pg_temp.panier('variante_a', '1', 'trousse_s', '1'),
             '{"mode": "domicile", "gouvernorat": "tunis"}', '{}') ->> 'economie_lots_millimes')::bigint,
  29000::bigint, 'la saisie de l''équipe chiffre le lot');

-- Retiré : les commandes passées gardent son nom.
select is(public.gestion_geste_lot(tests.id('A'), (select id from public.lots where nom = 'Le départ'), 'retirer') ->> 'geste', 'retirer', 'le lot retiré');
reset role;
select results_eq($$ select count(*)::integer, bool_and(l.lot_id is null and l.lot_nom = 'Le départ')
                       from public.commande_lignes l join public.commandes c on c.id = l.commande_id
                      where c.cle_idempotence = 'essai-lot-1-0000000000' $$,
  $$ values (2, true) $$,
  'les lignes de la commande gardent son nom');

select * from finish();
rollback;
