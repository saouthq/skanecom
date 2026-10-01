-- =====================================================================
-- 72 · La structure Monoproduit
-- =====================================================================
begin;
\ir outils.psql

select plan(9);

select lives_ok(format($$ update public.themes set code = 'monoproduit' where boutique_id = %L $$, tests.id('A')),
  'le thème accepte la structure Monoproduit');
select is(public.boutique_publique('essai-a') #>> '{theme,code}', 'monoproduit', 'la vitrine lit la structure');
select throws_ok(format($$ update public.themes set code = 'landing' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une structure inconnue : refusée');

-- L'éditeur : un brouillon, puis la publication, en Monoproduit (la page de vente d'une valise).
select tests.connecte('proprio_a');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  '{"code": "monoproduit", "couleurs": {}, "polices": {}, "style": {}, "sections": [{"type": "piece", "produit": "valise-cabine"}, {"type": "avis"}, {"type": "questions"}]}'::jsonb, null) ->> 'version',
  '1', 'un brouillon en Monoproduit, la page de vente d''un produit');
select is((public.gestion_publier_apparence(tests.id('A'),
  '{"code": "monoproduit", "couleurs": {}, "polices": {}, "style": {}}'::jsonb,
  (public.gestion_apparence(tests.id('A')) ->> 'version')::integer) ->> 'version') is not null, true,
  'publier la structure Monoproduit');

-- L'entonnoir de la page de vente : le produit regardé, puis la commande commencée, sur l'accueil.
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'vitrine.statistiques', 'true')
on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
create function tests.etape_de(p_entree text) returns smallint
language sql security definer set search_path = '' as $$
  select v.etape from public.vitrine_visites v where v.boutique_id = tests.id('A') and v.entree = p_entree
$$;
grant execute on function tests.etape_de(text) to anon;
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0072', '/', null, 'telephone', null);
select public.compter_etape(tests.id('A'), 'cle-de-la-cliente-0072', 1::smallint);
select is(tests.etape_de('/'), 1::smallint, 'la page de vente regardée : l''étape « fiche »');
select public.compter_etape(tests.id('A'), 'cle-de-la-cliente-0072', 3::smallint);
select public.compter_etape(tests.id('A'), 'cle-de-la-cliente-0072', 1::smallint);
select is(tests.etape_de('/'), 3::smallint, 'le formulaire commencé : l''étape « commande », sans retour en arrière');
select public.compter_etape(tests.id('A'), 'cle-de-la-cliente-0072', 4::smallint);
select is(tests.etape_de('/'), 3::smallint, 'une commande passée ne se déclare pas (la page de fin la dit)');
select public.compter_etape(tests.id('A'), 'cle-d-une-visite-inconnue', 3::smallint);
reset role;
select is((select count(*)::integer from public.vitrine_visites where boutique_id = tests.id('A')), 1, 'sans visite comptée ce jour : rien');

select * from finish();
rollback;
