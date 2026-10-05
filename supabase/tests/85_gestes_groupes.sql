-- =====================================================================
-- 85 · Les gestes groupés : remettre au livreur, livrées d'un coup
-- =====================================================================
begin;
\ir outils.psql

select plan(13);

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

create function tests.num(p_nom text) returns text language sql stable as $$
  select numero from public.commandes where id = tests.id(p_nom)
$$;
grant execute on function tests.num(text) to authenticated;

-- Deux commandes de A confirmées, à livrer à domicile.
update public.commandes set statut = 'confirmee' where id in (tests.id('commande_a'), tests.id('commande_ab_a'));

select tests.connecte('prepa_a');
select is(public.gestion_expedier_lot(tests.id('A'), array[tests.num('commande_a'), tests.num('commande_ab_a'), tests.num('commande_ab_b'), 'MAY-INCONNUE'], ' Aramex ')
            -> 'faites', jsonb_build_array(least(tests.num('commande_a'), tests.num('commande_ab_a')), greatest(tests.num('commande_a'), tests.num('commande_ab_a'))),
  'la préparation remet les deux colis au livreur d''un geste');
reset role;
select ok((select bool_and(statut = 'expediee' and transporteur = 'Aramex' and expediee_at is not null)
             from public.commandes where id in (tests.id('commande_a'), tests.id('commande_ab_a'))),
  'expédiés, avec le nom du transporteur');
select is((select statut::text from public.commandes where id = tests.id('commande_ab_b')), 'recue',
  'la commande d''une autre boutique, glissée dans le lot, n''est pas touchée');
select ok((select count(*) = 2 and bool_and(auteur_id = tests.id('prepa_a')) from public.commande_evenements e
            where e.commande_id in (tests.id('commande_a'), tests.id('commande_ab_a')) and e.statut_apres = 'expediee'),
  'chaque commande a son pas au journal, par qui l''a fait');

select tests.connecte('prepa_a');
select is(jsonb_array_length(public.gestion_expedier_lot(tests.id('A'), array[tests.num('commande_a')]) -> 'ignorees'), 1,
  'déjà expédiée : laissée de côté, et nommée');
select is(tests.indice(format($$ select public.gestion_expedier_lot(%L, '{}') $$, tests.id('A'))), 'lot', 'rien de coché : refusé');
select is(tests.indice(format($$ select public.gestion_expedier_lot(%L, %L, %L) $$, tests.id('A'), array['X'], repeat('x', 81))), 'motif',
  'un nom de transporteur trop long : refusé');

reset role; select tests.connecte('confirm_a');
select throws_ok(format($$ select public.gestion_expedier_lot(%L, %L) $$, tests.id('A'), array[tests.num('commande_a')]), '42501', null,
  'l''employé des appels ne remet pas les colis au livreur');
select is(jsonb_array_length(public.gestion_livrer_lot(tests.id('A'), array[tests.num('commande_a'), tests.num('commande_ab_a')]) -> 'faites'), 2,
  'le point du livreur : les deux colis livrés d''un geste');
reset role;
select ok((select bool_and(statut = 'livree' and statut_paiement = 'paye' and livree_at is not null)
             from public.commandes where id in (tests.id('commande_a'), tests.id('commande_ab_a'))),
  'livrés, paiement encaissé');

select tests.connecte('lecture_a');
select throws_ok(format($$ select public.gestion_livrer_lot(%L, %L) $$, tests.id('A'), array[tests.num('commande_a')]), '42501', null,
  'la lecture seule ne livre rien');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_expedier_lot(%L, %L) $$, tests.id('A'), array[tests.num('commande_a')]), '42501', null,
  'une autre boutique non plus');
reset role; select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_livrer_lot(tests.id('A'), array[tests.num('commande_a')]) -> 'ignorees'), 1,
  'déjà livrée : laissée de côté');

select * from finish();
rollback;
