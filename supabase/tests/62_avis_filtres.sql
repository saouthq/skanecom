-- =====================================================================
-- 62 · Les avis d'une fiche se filtrent et se parcourent par pages
-- =====================================================================
begin;
\ir outils.psql

select plan(17);

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
-- Les identifiants d'une page, dans l'ordre rendu.
create function tests.page(p_filtre text, p_decalage integer, p_limite integer) returns uuid[] language sql as $$
  select coalesce(array_agg((x ->> 'id')::uuid order by n), '{}')
    from jsonb_array_elements(public.avis_produit_page(tests.id('A'), tests.id('produit_a'), p_filtre, p_decalage, p_limite) -> 'avis')
         with ordinality as e(x, n)
$$;
grant execute on all functions in schema tests to anon, authenticated;

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'avis');
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'avis.photos', 'true');

-- Douze avis sur la valise de A, un jour d'écart chacun : dix publiés (notes
-- 5 5 4 5 3 5 4 5 2 5, du plus récent au plus ancien), un en relecture, un
-- écarté. Trois publiés ont des photos ; celui en relecture aussi.
do $$
declare
  v_notes integer[] := array[5, 5, 4, 5, 3, 5, 4, 5, 2, 5, 5, 1];
  v_ligne uuid;
  v_avis  uuid;
begin
  -- Chaque ligne réserve sa valise : le stock d'abord.
  perform set_config('skanecom.ecriture_stock', 'on', true);
  update public.variantes set stock = 50 where id = tests.id('variante_a');
  perform set_config('skanecom.ecriture_stock', '', true);
  for i in 1 .. 12 loop
    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, prix_unitaire_millimes, quantite, total_ligne_millimes)
    values (tests.id('A'), tests.id('commande_a'), tests.id('variante_a'), 'Valise cabine', 189000, 1, 189000)
    returning id into v_ligne;
    insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, statut, motif, created_at)
    values (tests.id('A'), tests.id('produit_a'), tests.id('commande_a'), v_ligne, tests.id('fiche_client_a'), v_notes[i],
            'Avis ' || i, 'Client A.',
            case i when 11 then 'en_attente' when 12 then 'ecarte' else 'publie' end,
            case i when 12 then 'Hors sujet' end,
            now() - make_interval(days => i))
    returning id into v_avis;
    insert into tests.ids (nom, id) values ('avis_' || i, v_avis);
    if i in (2, 5, 9, 11) then
      insert into public.avis_photos (boutique_id, avis_id, chemin, position)
      values (tests.id('A'), v_avis, 'essai-a/avis/' || v_avis || '/a1b2c3d4e5f6.webp', 0);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- Ce que la fiche lit d'emblée : combien d'avis portent des photos
-- ---------------------------------------------------------------------
select tests.anonyme();
select is((public.avis_produit(tests.id('A'), tests.id('produit_a')) ->> 'avec_photos')::integer, 3,
  'avis_produit : trois avis publiés portent des photos (celui en relecture ne compte pas)');

-- ---------------------------------------------------------------------
-- Les pages : du plus récent au plus ancien, sans répéter ni sauter
-- ---------------------------------------------------------------------
select is((public.avis_produit_page(tests.id('A'), tests.id('produit_a'), 'tous', 0, 4) ->> 'total')::integer, 10,
  'tous : le total compte les dix avis publiés, ni la relecture ni l''écarté');
select is(tests.page('tous', 0, 4), array[tests.id('avis_1'), tests.id('avis_2'), tests.id('avis_3'), tests.id('avis_4')],
  'la première page : les quatre plus récents, dans l''ordre');
select is(tests.page('tous', 0, 4) || tests.page('tous', 4, 4) || tests.page('tous', 8, 4),
  array(select tests.id('avis_' || i) from generate_series(1, 10) i),
  'trois pages de quatre : les dix, une fois chacun, sans trou');
select is(tests.page('tous', 10, 4), '{}'::uuid[], 'au-delà du dernier : une page vide');
select is(cardinality(tests.page('tous', 0, 500)), 10, 'une page de 500 demandée : au plus cinquante (ici les dix)');
select is(tests.page('tous', -3, 2), array[tests.id('avis_1'), tests.id('avis_2')], 'un décalage négatif part du début');

-- ---------------------------------------------------------------------
-- Les filtres
-- ---------------------------------------------------------------------
select is(tests.page('photos', 0, 10), array[tests.id('avis_2'), tests.id('avis_5'), tests.id('avis_9')],
  'avec photos : les trois avis publiés illustrés, du plus récent au plus ancien');
select ok((select bool_and(jsonb_array_length(x -> 'photos') = 1)
             from jsonb_array_elements(public.avis_produit_page(tests.id('A'), tests.id('produit_a'), 'photos') -> 'avis') x),
  'chacun avec sa photo');
select results_eq($$ select (r ->> 'total')::integer, (select bool_and((x ->> 'note') = '5') from jsonb_array_elements(r -> 'avis') x)
                       from (select public.avis_produit_page(tests.id('A'), tests.id('produit_a'), '5', 0, 10) r) p $$,
  $$ values (6, true) $$, 'cinq étoiles : six avis, tous à cinq étoiles');
select is(public.avis_produit_page(tests.id('A'), tests.id('produit_a'), '1', 0, 10) - 'filtre',
  '{"total": 0, "avis": []}'::jsonb, 'une étoile : aucun publié (celui-là est écarté), une liste vide');
select is(tests.indice($$ select public.avis_produit_page(tests.id('A'), tests.id('produit_a'), 'meilleurs') $$), 'filtre',
  'un filtre inconnu : refusé, indice « filtre »');
select is(tests.indice($$ select public.avis_produit_page(tests.id('A'), tests.id('produit_a'), null) $$), 'filtre',
  'un filtre absent aussi');

-- ---------------------------------------------------------------------
-- Les cloisons : une autre boutique, le réglage, le module
-- ---------------------------------------------------------------------
select is((public.avis_produit_page(tests.id('B'), tests.id('produit_a'), 'tous') -> 'avis'), null::jsonb,
  'par la boutique B (sans le module), rien des avis de A');

reset role;
update public.reglages set valeur = 'false' where boutique_id = tests.id('A') and cle = 'avis.photos';
select tests.anonyme();
select is(public.avis_produit_page(tests.id('A'), tests.id('produit_a'), 'photos') ->> 'total', '0',
  'photos coupées : le filtre « avec photos » ne retient rien');
select ok((public.avis_produit(tests.id('A'), tests.id('produit_a')) ->> 'avec_photos') = '0'
          and (select bool_and(x -> 'photos' = '[]'::jsonb)
                 from jsonb_array_elements(public.avis_produit_page(tests.id('A'), tests.id('produit_a'), 'tous', 0, 10) -> 'avis') x),
  'ni compte de photos ni photo sous les avis');

reset role;
delete from plateforme.modules_actifs where boutique_id = tests.id('A') and module = 'avis';
select tests.anonyme();
select is(public.avis_produit_page(tests.id('A'), tests.id('produit_a'), 'tous'), null::jsonb, 'module avis coupé : rien');

select * from finish();
rollback;
