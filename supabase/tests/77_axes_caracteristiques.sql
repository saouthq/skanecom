-- =====================================================================
-- 77 · Un axe et une caractéristique de même nom : un seul filtre
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

-- Dans A : la contenance, une caractéristique filtrable (un nombre, en ml).
-- produit_a (outils.psql) la porte en caractéristique : 30 ml ; une seconde
-- pièce la porte en axe de variante, écrit comme on le lit.
reset role; select tests.connecte('proprio_a');
select public.gestion_enregistrer_attribut(tests.id('A'), null, 'contenance', 'Contenance', 'ml', 'nombre', true, false, '{}');
select public.gestion_enregistrer_caracteristiques(tests.id('A'), tests.id('produit_a'), null, '{"contenance": "30"}');

reset role;
insert into public.produits (id, boutique_id, categorie_id, slug, nom_fr, publie)
values (tests.nouvel_id('parfum'), tests.id('A'), tests.id('cat_a'), 'eau-de-parfum', 'Eau de parfum', true);
insert into public.variantes (boutique_id, produit_id, sku, options, prix_millimes, stock, actif) values
  (tests.id('A'), tests.id('parfum'), 'PAR-15', '{"contenance": "15,5 ml"}', 69000, 4, true),
  (tests.id('A'), tests.id('parfum'), 'PAR-30', '{"contenance": "30 ML"}', 119000, 2, true),
  (tests.id('A'), tests.id('parfum'), 'PAR-GF', '{"contenance": "Grand format"}', 189000, 1, true);

create function tests.liste(p_filtres jsonb default '{}') returns jsonb language sql as $$
  select public.liste_produits(tests.id('A'), p_filtres)
$$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.anonyme();
select is(tests.liste() -> 'facettes' -> 'options' -> 'contenance',
  '[{"valeur": "15.5", "compte": 1}, {"valeur": "30", "compte": 2}, {"valeur": "Grand format", "compte": 1}]'::jsonb,
  'une seule liste : « 30 ML » de l''axe et « 30 » de la caractéristique ne font qu''une valeur ; « 15,5 ml » se lit 15.5 ; ce qui n''est pas un nombre reste tel quel');
select is((select count(*)::int from jsonb_array_elements(tests.liste() -> 'facettes' -> 'axes') a where a ->> 'cle' = 'contenance'), 1,
  'un seul axe « contenance », celui de la caractéristique (son unité, son type)');
select is((tests.liste('{"options": {"contenance": ["30"]}}') ->> 'total')::int, 2,
  'filtrer sur 30 : la pièce à la caractéristique ET celle dont une déclinaison fait 30 ml');
select is((tests.liste('{"options": {"contenance": ["15.5"]}}') ->> 'total')::int, 1, 'filtrer sur 15,5 : le parfum seul');
select is((tests.liste('{"options": {"contenance": ["Grand format"]}}') ->> 'total')::int, 1, 'une valeur qui n''est pas un nombre se filtre telle quelle');
select is(tests.liste() -> 'facettes' -> 'options' -> 'couleur', '[{"valeur": "Noir", "compte": 1}]'::jsonb,
  'un axe sans caractéristique de même nom n''est pas touché');
select is((select jsonb_agg(v ->> 'options' order by v ->> 'sku') from public.vitrine_produits p, jsonb_array_elements(p.variantes) v
            where p.id = tests.id('parfum')),
  '["{\"contenance\": \"15,5 ml\"}", "{\"contenance\": \"30 ML\"}", "{\"contenance\": \"Grand format\"}"]'::jsonb,
  'la fiche garde la valeur de la déclinaison, telle qu''écrite');

select * from finish();
rollback;
