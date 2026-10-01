-- =====================================================================
-- 56 · Les visites : l'entonnoir vers la commande et les campagnes
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
create function tests.visite(p_boutique text, p_entree text) returns table (etape smallint, campagne text, source text)
language sql security definer set search_path = '' as $$
  select v.etape, v.campagne, v.source from public.vitrine_visites v where v.boutique_id = tests.id(p_boutique) and v.entree = p_entree
$$;
grant execute on all functions in schema tests to anon, authenticated;

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'vitrine.statistiques', 'true');

-- ---------------------------------------------------------------------
-- Une visite qui va jusqu'à la commande, venue d'une campagne
-- ---------------------------------------------------------------------
select tests.anonyme();
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0001', '/', 'instagram', 'telephone', 'Soldes d''Été 2026 !');
select results_eq($$ select etape, campagne, source from tests.visite('A', '/') $$,
  $$ values (0::smallint, 'soldes-d-ete-2026'::text, 'instagram'::text) $$,
  'l''arrivée : la campagne du lien, mise en mots de lien (minuscules, sans accent), et sa source');
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0001', '/categorie/valises', null, 'telephone', 'autre-campagne');
select results_eq($$ select etape, campagne from tests.visite('A', '/') $$, $$ values (0::smallint, 'soldes-d-ete-2026'::text) $$,
  'un rayon ne fait pas avancer ; la campagne reste celle de l''arrivée');
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0001', '/produit/valise-cabine', null, 'telephone');
select is((select etape from tests.visite('A', '/')), 1::smallint, 'une fiche vue : étape 1');
select public.compter_ajout_panier(tests.id('A'), 'cle-de-la-cliente-0001');
select is((select etape from tests.visite('A', '/')), 2::smallint, 'un ajout au panier : étape 2');
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0001', '/produit/valise-soute', null, 'telephone');
select is((select etape from tests.visite('A', '/')), 2::smallint, 'une autre fiche ensuite : on ne recule pas');
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0001', '/commande', null, 'telephone');
select is((select etape from tests.visite('A', '/')), 3::smallint, 'la commande ouverte : étape 3');
select public.compter_vue(tests.id('A'), 'cle-de-la-cliente-0001', '/commande/merci', null, 'telephone');
select is((select etape from tests.visite('A', '/')), 4::smallint, 'la page de fin : étape 4, commandée');

-- Une visite qui regarde et s'en va ; un ajout sans visite comptée ne crée rien.
select public.compter_vue(tests.id('A'), 'cle-d-un-curieux-0002', '/produit/valise-cabine', 'google.com', 'ordinateur', '<script>');
select results_eq($$ select etape, campagne from tests.visite('A', '/produit/valise-cabine') $$, $$ values (1::smallint, 'script'::text) $$,
  'arrivé sur une fiche : étape 1 d''emblée ; une campagne illisible est réduite à ses lettres');
select public.compter_ajout_panier(tests.id('A'), 'cle-jamais-vue-0000003');
reset role;
select is((select count(*)::integer from public.vitrine_visites where boutique_id = tests.id('A')), 2, 'un ajout sans visite du jour : rien de créé');

-- ---------------------------------------------------------------------
-- L'écran : l'entonnoir et les campagnes
-- ---------------------------------------------------------------------
select tests.connecte('confirm_a');
select is(tests.indice(format($$ select public.gestion_visites_parcours(%L) $$, tests.id('A'))), 'role', 'la confirmation n''a pas l''audience');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_visites_parcours(tests.id('A'), 7) -> 'entonnoir',
  '{"visiteurs": 2, "fiche": 2, "panier": 1, "commande": 1, "commandee": 1}'::jsonb,
  'l''entonnoir : deux visiteurs, deux fiches vues, un panier, une commande ouverte et passée');
select results_eq($$ select x ->> 'campagne', x ->> 'source', (x ->> 'visiteurs')::int, (x ->> 'commandes')::int
                     from jsonb_array_elements(public.gestion_visites_parcours(tests.id('A'), 7) -> 'campagnes') x order by 1 $$,
  $$ values ('script'::text, 'google.com'::text, 1, 0), ('soldes-d-ete-2026', 'instagram', 1, 1) $$,
  'les campagnes : leurs visiteurs, leur source, ce qu''elles ont vendu');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_visites_parcours(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');

select * from finish();
rollback;
