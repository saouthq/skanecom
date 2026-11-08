-- =====================================================================
-- 133 · Un colis revenu, vu par l'acheteur : d'où vient le refus
--       (le code seul, jamais le commentaire de l'équipe)
-- =====================================================================
begin;
\ir outils.psql

select plan(4);

select is(private.commande_pour_acheteur(tests.id('A'), tests.id('commande_a')) -> 'refus_origine', 'null'::jsonb,
  'pas refusée : pas d''origine');

update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
update public.commandes set statut = 'refusee', refus_origine = 'injoignable', refus_commentaire = 'Absent deux fois, voisin hostile'
 where id = tests.id('commande_a');

select is(private.commande_pour_acheteur(tests.id('A'), tests.id('commande_a')) ->> 'refus_origine', 'injoignable',
  'refusée : l''acheteur sait d''où vient le refus (il était injoignable)');
select ok(position('voisin' in private.commande_pour_acheteur(tests.id('A'), tests.id('commande_a'))::text) = 0,
  'le commentaire de l''équipe ne sort pas');

select tests.connecte('client_a');
select is((select c ->> 'refus_origine' from jsonb_array_elements(public.mes_commandes(tests.id('A'))) c where c ->> 'statut' = 'refusee'),
  'injoignable', '« Mes commandes » la lit aussi');

select * from finish();
rollback;
