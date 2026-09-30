-- =====================================================================
-- 51 · Souvent achetés ensemble
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

-- Dans A : un deuxième produit publié, et deux commandes qui le réunissent
-- avec la valise ; une troisième, annulée, avec un troisième produit.
reset role;
insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, publie) values
  (tests.nouvel_id('housse'), tests.id('A'), tests.id('cat_a'), 'housse-valise', 'Housse de valise', true),
  (tests.nouvel_id('cadenas'), tests.id('A'), tests.id('cat_a'), 'cadenas', 'Cadenas', true);
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('v_housse'), tests.id('A'), tests.id('housse'), 'HOUSSE-1', '{}', 39000, 8, true),
  (tests.nouvel_id('v_cadenas'), tests.id('A'), tests.id('cadenas'), 'CADENAS-1', '{}', 15000, 5, true);

create function pg_temp.commande(p_nom text, p_variantes uuid[], p_statut public.statut_commande default 'recue') returns void language plpgsql as $$
declare v uuid; c uuid;
begin
  insert into public.commandes (boutique_id, numero, origine, contact_nom, contact_telephone, livraison_ligne1, livraison_ville, livraison_gouvernorat, statut)
  values (tests.id('A'), 'MAY-2026-' || p_nom, 'vitrine', 'Essai', '+21620000009', '1 rue', 'Tunis', 'tunis', p_statut)
  returning id into c;
  foreach v in array p_variantes loop
    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
    values (tests.id('A'), c, v, 'x', 1000, 1, 1000);
  end loop;
end $$;
select pg_temp.commande('00901', array[tests.id('variante_a'), tests.id('v_housse')]);
select pg_temp.commande('00902', array[tests.id('variante_a'), tests.id('v_housse')]);
select pg_temp.commande('00903', array[tests.id('variante_a'), tests.id('v_cadenas')], 'annulee');
-- Chaque ligne a pris sa pièce au stock : la valise revient à cinq.
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 5 where id = tests.id('variante_a');
select set_config('skanecom.ecriture_stock', '', true);
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

select tests.anonyme();
select is((select count(*)::integer from public.achetes_ensemble(tests.id('A'), '{valise-cabine}')), 0, 'réglage coupé : rien');
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'catalogue.achetes_ensemble', 'true');

select tests.anonyme();
select results_eq($$ select slug, commandes from public.achetes_ensemble(tests.id('A'), '{valise-cabine}') $$,
  $$ values ('housse-valise', 2) $$, 'un visiteur voit la housse, achetée deux fois avec la valise ; la commande annulée ne compte pas');
select results_eq($$ select slug from public.achetes_ensemble(tests.id('A'), '{housse-valise}') $$,
  $$ values ('valise-cabine') $$, 'et l''inverse : la valise, depuis la housse');
select is((select count(*)::integer from public.achetes_ensemble(tests.id('A'), '{valise-cabine,housse-valise}')), 0,
  'un panier qui les a déjà toutes les deux : rien de plus à proposer');

-- Plus en stock : elle ne se propose plus.
reset role;
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 0 where id = tests.id('v_housse');
select set_config('skanecom.ecriture_stock', '', true);
select tests.anonyme();
select is((select count(*)::integer from public.achetes_ensemble(tests.id('A'), '{valise-cabine}')), 0, 'épuisée : elle ne se propose plus');
reset role;
select set_config('skanecom.ecriture_stock', 'on', true);
update public.variantes set stock = 8 where id = tests.id('v_housse');
select set_config('skanecom.ecriture_stock', '', true);

-- Dépubliée : non plus.
update public.produits set publie = false where id = tests.id('housse');
select tests.anonyme();
select is((select count(*)::integer from public.achetes_ensemble(tests.id('A'), '{valise-cabine}')), 0, 'retirée de la vente : non plus');
reset role; update public.produits set publie = true where id = tests.id('housse');

-- Les commandes d'une autre boutique ne comptent pas, ses produits non plus.
select tests.anonyme();
select is((select count(*)::integer from public.achetes_ensemble(tests.id('B'), '{valise-cabine}')), 0, 'la boutique B ne voit rien des commandes de A');
select is((select count(*)::integer from public.achetes_ensemble(tests.id('A'), '{valise-cabine}', 1)), 1, 'la limite demandée est tenue');
reset role;
select ok(has_function_privilege('anon', 'public.achetes_ensemble(uuid, text[], integer)', 'execute'), 'la vitrine la lit sans compte');

select * from finish();
rollback;
