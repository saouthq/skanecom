-- =====================================================================
-- 58 · Les préréglages par métier : une boutique vide, prête à habiller
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

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
grant execute on all functions in schema tests to anon, authenticated, service_role;

reset role;
select ok(not has_function_privilege('authenticated', 'public.console_appliquer_metier(uuid, uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.console_metiers(uuid)', 'execute'),
  'la console seule (service_role) applique un métier');

select tests.service();
select is(jsonb_array_length(public.console_metiers(tests.id('admin_plateforme'))), 8, 'huit métiers');
select results_eq($$ select x ->> 'code', x ->> 'gabarit' from jsonb_array_elements(public.console_metiers(tests.id('admin_plateforme'))) x
                     where x ->> 'code' in ('beaute', 'high_tech') order by 1 $$,
  $$ values ('beaute'::text, 'editorial'::text), ('high_tech', 'commerce') $$, 'chacun avec sa structure (migration 74)');
select throws_ok(format($$ select public.console_metiers(%L) $$, tests.id('proprio_a')), '42501', null, 'un membre d''une boutique n''est pas administrateur');

-- Une boutique neuve, vide.
select public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-beaute', 'Essai Beauté', 'essai-beaute.test');
select is(public.console_metier_possible(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-beaute')), true,
  'une boutique vide peut recevoir un métier');
select is(tests.indice(format($$ select public.console_appliquer_metier(%L, (select id from plateforme.boutiques where slug = 'essai-beaute'), 'cuisine-moleculaire') $$,
  tests.id('admin_plateforme'))), 'metier', 'un métier inconnu : refusé');

reset role;
insert into public.reglages (boutique_id, cle, valeur)
select id, 'vitrine.partage', 'false' from plateforme.boutiques where slug = 'essai-beaute';
select tests.service();
select is(public.console_appliquer_metier(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-beaute'), 'beaute'),
  '{"rayons": 6, "caracteristiques": 4, "reglages": 2, "gabarit": "editorial", "accueil": true}'::jsonb,
  'la beauté : six rayons, quatre caractéristiques, deux réglages (le troisième était déjà réglé)');

reset role;
select results_eq($$ select t.code, t.couleurs ->> 'accent', t.polices ->> 'titres' from public.themes t
                      join plateforme.boutiques b on b.id = t.boutique_id where b.slug = 'essai-beaute' $$,
  $$ values ('editorial'::text, '#A4506F'::text, 'young-serif'::text) $$, 'le gabarit, la couleur et la police du métier');
select is((select count(*)::integer from public.categories c join plateforme.boutiques b on b.id = c.boutique_id where b.slug = 'essai-beaute'), 6,
  'les rayons sont posés');
select results_eq($$ select a.cle, a.unite, a.en_carte from public.attributs a join plateforme.boutiques b on b.id = a.boutique_id
                      where b.slug = 'essai-beaute' and a.cle = 'contenance' $$,
  $$ values ('contenance'::text, 'ml'::text, true) $$, 'la contenance en ml, sur la carte');
select is((select string_agg(c.slug, ',' order by c.slug) from public.rayon_attributs ra
             join public.attributs a on a.boutique_id = ra.boutique_id and a.id = ra.attribut_id
             join public.categories c on c.boutique_id = ra.boutique_id and c.id = ra.categorie_id
             join plateforme.boutiques b on b.id = ra.boutique_id
            where b.slug = 'essai-beaute' and a.cle = 'type_de_peau'), 'corps-et-bain,soins-du-visage',
  'le type de peau, sur ses deux rayons');
select is((select r.valeur from public.reglages r join plateforme.boutiques b on b.id = r.boutique_id
            where b.slug = 'essai-beaute' and r.cle = 'vitrine.partage'), 'false'::jsonb,
  'un réglage déjà réglé par la boutique n''est pas touché');

select tests.service();
select is(tests.indice(format($$ select public.console_appliquer_metier(%L, (select id from plateforme.boutiques where slug = 'essai-beaute'), 'mode') $$,
  tests.id('admin_plateforme'))), 'catalogue', 'une deuxième fois : la boutique a déjà un catalogue, refusé');
reset role;
select is((select count(*)::integer from plateforme.journal_audit j join plateforme.boutiques b on b.id = j.boutique_id
            where b.slug = 'essai-beaute' and j.action = 'boutique.metier' and j.cible = 'beaute'), 1, 'le geste est tracé');

select * from finish();
rollback;
