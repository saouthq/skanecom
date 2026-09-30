-- =====================================================================
-- 35 · La quantité minimale d'une déclinaison
-- =====================================================================
begin;
\ir outils.psql

select plan(20);

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

-- Des vis de la boutique A, vendues par boîte : 40 en stock ; et des
-- chevilles dont il reste moins que le minimum.
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.nouvel_id('vis'),       tests.id('A'), tests.id('produit_a'), 'VIS-4X40',  '{"couleur": "Zinc"}',  1500, 40, true),
  (tests.nouvel_id('chevilles'), tests.id('A'), tests.id('produit_a'), 'CHV-6',     '{"couleur": "Gris"}',   800,  5, true);

create function pg_temp.regle(p_nom text, p_minimum integer) returns void language sql as $$
  select public.gestion_enregistrer_variante(tests.id('A'), tests.id(p_nom), 1500, null, 0, true, p_minimum)
$$;
create function pg_temp.minimum(p_nom text) returns integer language sql as $$
  select quantite_min from public.variantes where id = tests.id(p_nom)
$$;
create function pg_temp.panier(p_nom text, p_quantite integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('variante_id', tests.id(p_nom), 'quantite', p_quantite))
$$;
create function pg_temp.devis(p_nom text, p_quantite integer) returns jsonb language sql as $$
  select public.devis_commande(tests.id('A'), pg_temp.panier(p_nom, p_quantite), 'tunis')
$$;
create function pg_temp.commande(p_nom text, p_quantite integer) returns text language sql as $$
  select tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, %s)',
    tests.id('A'), 'essai-minimum-' || p_nom || '-' || p_quantite, pg_temp.panier(p_nom, p_quantite),
    jsonb_build_object('nom', 'Amel Ben Salah', 'telephone', '20 123 456', 'accepte_conditions', true),
    jsonb_build_object('ligne1', '12 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', 'tunis'),
    pg_temp.devis(p_nom, p_quantite) ->> 'total_millimes'))
$$;

-- ---------------------------------------------------------------------
-- Par défaut, à l'unité
-- ---------------------------------------------------------------------
select is(pg_temp.minimum('variante_a'), 1, 'par défaut, une déclinaison se vend à l''unité');
select throws_ok($$ update public.variantes set quantite_min = 0 where id = tests.id('vis') $$, '23514', null,
  'un minimum nul est refusé par la table…');
select throws_ok($$ update public.variantes set quantite_min = 1000 where id = tests.id('vis') $$, '23514', null,
  '… et au-delà de 999 pièces (la plus grande ligne de panier) aussi');

-- ---------------------------------------------------------------------
-- Qui le règle
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok($$ select pg_temp.regle('vis', 10) $$, '42501', null, 'un visiteur ne règle rien');
reset role; select tests.connecte('prepa_a');
select is(tests.indice($$ select pg_temp.regle('vis', 10) $$), 'role', 'la préparation ne règle pas le minimum');
reset role; select tests.connecte('proprio_b');
select is(tests.indice($$ select pg_temp.regle('vis', 10) $$), 'role', 'une autre boutique non plus');

reset role; select tests.connecte('proprio_a');
select lives_ok($$ select pg_temp.regle('vis', 10) $$, 'la propriétaire vend les vis par dix au moins');
select is(pg_temp.minimum('vis'), 10, 'le minimum est enregistré');
select lives_ok(format($$ select public.gestion_enregistrer_variante(%L, %L, 1600, null, 0, true) $$, tests.id('A'), tests.id('vis')),
  'un enregistrement sans minimum (l''ancien appel)…');
select is(pg_temp.minimum('vis'), 10, '… garde le minimum en place');
select is(tests.indice($$ select pg_temp.regle('vis', 0) $$), 'minimum', 'un minimum nul : non');
select is(tests.indice($$ select pg_temp.regle('vis', 1000) $$), 'minimum', 'plus de 999 : non');
select is((select (v ->> 'minimum')::int from jsonb_array_elements(public.gestion_produit(tests.id('A'), tests.id('produit_a')) -> 'variantes') v
            where v ->> 'sku' = 'VIS-4X40'), 10, 'la fiche du backoffice le relit');
select lives_ok($$ select pg_temp.regle('chevilles', 10) $$, 'les chevilles aussi, par dix');

-- ---------------------------------------------------------------------
-- La vitrine et le devis
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select results_eq($$ select v ->> 'sku', (v ->> 'quantite_min')::int
                       from public.vitrine_produits p, jsonb_array_elements(p.variantes) v
                      where p.boutique_id = tests.id('A') and p.id = tests.id('produit_a') and v ->> 'sku' in ('VAL-55-NOIR', 'VIS-4X40')
                      order by 1 $$,
  $$ values ('VAL-55-NOIR', 1), ('VIS-4X40', 10) $$, 'la vitrine lit le minimum de chaque déclinaison');
select results_eq($$ select (d ->> 'complet')::boolean, (d -> 'lignes' -> 0 ->> 'quantite_min')::int,
                            (d -> 'lignes' -> 0 ->> 'quantite_disponible')::int, (d -> 'lignes' -> 0 ->> 'disponible')::boolean
                       from (select pg_temp.devis('vis', 6) d) x $$,
  $$ values (false, 10, 6, true) $$, 'six vis : le devis dit le minimum, et le panier n''est pas complet');
select is((pg_temp.devis('vis', 12) ->> 'complet')::boolean, true, 'douze vis : complet (un minimum n''est pas un pas)');
select results_eq($$ select (d -> 'lignes' -> 0 ->> 'disponible')::boolean, (d -> 'lignes' -> 0 ->> 'quantite_disponible')::int
                       from (select pg_temp.devis('chevilles', 10) d) x $$,
  $$ values (false, 0) $$, 'cinq chevilles en stock pour un minimum de dix : indisponibles');

-- ---------------------------------------------------------------------
-- La commande
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select is(pg_temp.commande('vis', 6), 'stock', 'sous le minimum, la commande est refusée');
select is(pg_temp.commande('vis', 12), null, 'au minimum ou au-delà, elle passe');

select * from finish();
rollback;
