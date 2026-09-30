-- =====================================================================
-- 40 · La note des avis sur les cartes : la vue de la vitrine la porte
-- =====================================================================
begin;
\ir outils.psql

select plan(7);

-- Jeu d'essai (outils.psql) : commande_a (client_a) et commande_ab_a
-- (client_ab), une valise cabine chacune, dans A.
reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'avis');
update public.commandes set statut = 'livree', livree_at = now() - interval '3 days' where id in (tests.id('commande_a'), tests.id('commande_ab_a'));
insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, auteur, statut)
select tests.id('A'), tests.id('produit_a'), c.id, l.id, c.client_id, x.note, 'Client', x.statut
  from (values ('commande_a', 5, 'publie'), ('commande_ab_a', 2, 'en_attente')) as x(cle, note, statut)
  join public.commandes c on c.id = tests.id(x.cle)
  join public.commande_lignes l on l.commande_id = c.id;

select tests.anonyme();
select is((select note from public.vitrine_produits where boutique_id = tests.id('A') and slug = 'valise-cabine'),
  '{"moyenne": 5.0, "total": 1}'::jsonb, 'la vue porte la note : les avis publiés seulement');
select is((select to_jsonb(p) -> 'note' from public.vitrine_produits p where boutique_id = tests.id('A') and slug = 'valise-cabine'),
  '{"moyenne": 5.0, "total": 1}'::jsonb, 'et donc chaque ligne que la vitrine sérialise');
select is((select count(*)::int from public.vitrine_produits where boutique_id = tests.id('A') and note is null and slug <> 'valise-cabine'),
  (select count(*)::int from public.vitrine_produits where boutique_id = tests.id('A') and slug <> 'valise-cabine'),
  'un produit sans avis publié : pas de note (null)');

reset role;
update public.avis set statut = 'publie' where boutique_id = tests.id('A') and statut = 'en_attente';
select tests.anonyme();
select is((select note from public.vitrine_produits where boutique_id = tests.id('A') and slug = 'valise-cabine'),
  '{"moyenne": 3.5, "total": 2}'::jsonb, 'un second avis publié : la moyenne suit');
select is((select count(*)::int from public.avis), 0, 'le visiteur ne lit toujours pas la table des avis');

reset role;
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'avis';
select tests.anonyme();
select is((select note from public.vitrine_produits where boutique_id = tests.id('A') and slug = 'valise-cabine'), null,
  'module coupé : plus de note sur la vitrine');
select ok(not has_function_privilege('anon', 'private.avis_actif(uuid)', 'execute'),
  'la note passe par public.note_produit ; les outils internes restent fermés');

select * from finish();
rollback;
