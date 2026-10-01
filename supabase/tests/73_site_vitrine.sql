-- =====================================================================
-- 73 · Le site vitrine (sans commande en ligne)
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

create function tests.panier(p_variante uuid, p_quantite integer) returns jsonb
language sql as $$ select jsonb_build_array(jsonb_build_object('variante_id', p_variante, 'quantite', p_quantite)) $$;
grant execute on function tests.panier(uuid, integer) to anon, authenticated;
create function tests.commande_de(p_cle text) returns jsonb
language sql as $$
  select public.passer_commande(tests.id('A'), p_cle, tests.panier(tests.id('variante_a'), 1),
    jsonb_build_object('nom', 'Amel Ben Salah', 'telephone', '20 111 222', 'accepte_conditions', true),
    jsonb_build_object('ligne1', '12 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', 'tunis'),
    (public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 1), 'tunis') ->> 'total_millimes')::bigint)
$$;
grant execute on function tests.commande_de(text) to anon, authenticated;

select is((select defaut from plateforme.reglages_catalogue where cle = 'vitrine.site_vitrine'), 'false'::jsonb,
  'coupé par défaut : la vitrine reste une boutique');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false')
on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
select tests.anonyme();
select ok(tests.commande_de('cle-site-vitrine-0001') ? 'numero', 'une boutique en ligne : la commande passe');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'vitrine.site_vitrine', 'true');
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.site_vitrine}', 'true', 'la vitrine lit le réglage');
select tests.anonyme();
select throws_ok($$ select tests.commande_de('cle-site-vitrine-0002') $$, '23514', null,
  'en site vitrine : la base refuse la commande');

reset role;
select is((select count(*)::integer from public.commandes where boutique_id = tests.id('A') and contact_nom = 'Amel Ben Salah'), 1,
  'l''historique reste : la commande d''avant est toujours là');

select * from finish();
rollback;
