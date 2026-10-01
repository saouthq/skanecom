-- =====================================================================
-- 66 · L'éditeur de la vitrine : l'accueil dans le brouillon
-- =====================================================================
begin;
\ir outils.psql

select plan(18);

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
grant execute on all functions in schema tests to anon, authenticated;

-- Une apparence, avec ou sans accueil.
create function tests.avec(p_sections jsonb default null, p_sans boolean default false) returns jsonb
language sql as $$
  select jsonb_build_object('code', 'editorial', 'couleurs', '{}'::jsonb, 'polices', '{}'::jsonb, 'style', '{}'::jsonb)
         || case when p_sans then '{}'::jsonb else jsonb_build_object('sections', p_sections) end
$$;
create function tests.version() returns integer
language sql as $$ select (public.gestion_apparence(tests.id('A')) ->> 'version')::integer $$;
grant execute on all functions in schema tests to anon, authenticated;

-- L'accueil publié de départ : une ouverture avec sa photo.
reset role;
update public.themes set sections = '[{"type": "hero", "image": {"chemin": "essai-a/accueil/photo-aaaaaaaaaaaa.webp"}}, {"type": "engagements"}]'
 where boutique_id = tests.id('A');

-- ---------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------
select tests.connecte('lecture_a');
select is(public.gestion_apparence(tests.id('A')) #>> '{publie,sections,0,type}', 'hero', 'l''écran lit l''accueil publié avec l''apparence');

-- ---------------------------------------------------------------------
-- Le brouillon porte l'accueil
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('[]'), null) $$, tests.id('A'))),
  'vide', 'un accueil sans section : refusé');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('[{"type": "carrousel"}]'), null) $$, tests.id('A'))),
  'forme', 'une section inconnue : refusée');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('[{"type": "hero", "image": {"chemin": "essai-b/accueil/photo-eeeeeeeeeeee.webp"}}]'), null) $$, tests.id('A'))),
  'forme', 'une photo hors du dossier de la boutique : refusée');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('[{"type": "hero", "lien": "https://ailleurs.example"}]'), null) $$, tests.id('A'))),
  'forme', 'un lien vers un autre site : refusé');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  tests.avec('[{"type": "hero", "image": {"chemin": "essai-a/accueil/photo-bbbbbbbbbbbb.webp"}, "textes": {"titre_fr": "Saison d''été"}}, {"type": "engagements"}]'), null) -> 'version',
  '1'::jsonb, 'un brouillon avec son accueil');
select is((select sections #>> '{0,image,chemin}' from public.themes where boutique_id = tests.id('A')), 'essai-a/accueil/photo-aaaaaaaaaaaa.webp',
  'l''accueil publié n''a pas bougé');
reset role;
select is(public.apercu_apparence('essai-a', (select jeton from public.themes_brouillons where boutique_id = tests.id('A'))) #>> '{sections,0,textes,titre_fr}',
  'Saison d''été', 'l''aperçu rend l''accueil du brouillon');
select tests.anonyme();
select is(public.boutique_publique('essai-a') #>> '{theme,sections,0,image,chemin}', 'essai-a/accueil/photo-aaaaaaaaaaaa.webp',
  'la vitrine, elle, montre l''accueil publié');

-- ---------------------------------------------------------------------
-- Abandonner : les photos que seul le brouillon employait
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(public.gestion_brouillon_apparence(tests.id('A'), null, 1),
  '{"version": null, "jeton": null, "orphelins": ["essai-a/accueil/photo-bbbbbbbbbbbb.webp"]}'::jsonb,
  'abandonné : la photo du brouillon est rendue, celle de l''accueil publié ne l''est pas');

-- ---------------------------------------------------------------------
-- Publier : l'apparence et l'accueil d'un coup
-- ---------------------------------------------------------------------
select is(public.gestion_brouillon_apparence(tests.id('A'),
  tests.avec('[{"type": "hero", "image": {"chemin": "essai-a/accueil/photo-cccccccccccc.webp"}}, {"type": "engagements"}]'), null) -> 'version',
  '1'::jsonb, 'un autre essai, une autre photo');
select is(public.gestion_publier_apparence(tests.id('A'),
  tests.avec('[{"type": "hero", "image": {"chemin": "essai-a/accueil/photo-dddddddddddd.webp"}}, {"type": "texte", "textes": {"titre_fr": "Bienvenue"}}]'), tests.version()) -> 'orphelins',
  '["essai-a/accueil/photo-aaaaaaaaaaaa.webp", "essai-a/accueil/photo-cccccccccccc.webp"]'::jsonb,
  'publié : les photos de l''accueil d''avant et du brouillon que le nouvel accueil n''a pas gardées sont rendues');
select is((select jsonb_path_query_array(sections, '$[*].type') from public.themes where boutique_id = tests.id('A')), '["hero", "texte"]'::jsonb,
  'le thème prend l''accueil publié');
reset role;
select is((select apres -> 'sections' from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'apparence.publier' order by id desc limit 1),
  '["hero", "texte"]'::jsonb, 'le journal garde la suite des sections');
select tests.connecte('proprio_a');
select is(public.gestion_publier_apparence(tests.id('A'), tests.avec(null, true), tests.version()) -> 'orphelins', '[]'::jsonb,
  'publier sans accueil (l''écran sans script) : rien n''est rendu…');
select is((select jsonb_path_query_array(sections, '$[*].type') from public.themes where boutique_id = tests.id('A')), '["hero", "texte"]'::jsonb,
  '… et l''accueil publié reste');
select is(public.gestion_publier_apparence(tests.id('A'), tests.avec(null), tests.version()) -> 'orphelins',
  '["essai-a/accueil/photo-dddddddddddd.webp"]'::jsonb, 'l''accueil de la structure (NULL) : la photo d''ouverture est rendue');
select is((select sections from public.themes where boutique_id = tests.id('A')), null, 'le thème reprend les sections de sa structure');

select * from finish();
rollback;
