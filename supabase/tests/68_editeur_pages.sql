-- =====================================================================
-- 68 · L'éditeur de la vitrine : les pages de contenu
-- =====================================================================
begin;
\ir outils.psql

select plan(19);

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

create function tests.page(p_titre text, p_corps text default 'Notre histoire commence à Sfax.', p_publie boolean default true) returns jsonb
language sql as $$
  select jsonb_build_object('titre_fr', p_titre, 'corps_fr', p_corps, 'genre', 'texte', 'publie', p_publie, 'dans_pied', true)
$$;
create function tests.apparence() returns jsonb
language sql as $$ select jsonb_build_object('code', 'editorial', 'couleurs', '{}'::jsonb, 'polices', '{}'::jsonb, 'style', '{}'::jsonb) $$;
create function tests.version() returns integer
language sql as $$ select (public.gestion_apparence(tests.id('A')) ->> 'version')::integer $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Une page en ligne au départ.
reset role;
insert into public.pages_boutique (boutique_id, slug, titre_fr, corps_fr, publie) values (tests.id('A'), 'a-propos', 'À propos', 'Qui nous sommes.', true);
create temp table la_page as select id, version from public.pages_boutique where boutique_id = tests.id('A') and slug = 'a-propos';
grant select on la_page to authenticated;

-- ---------------------------------------------------------------------
-- Le brouillon d'une page
-- ---------------------------------------------------------------------
select tests.connecte('lecture_a');
select is(tests.indice(format($$ select public.gestion_brouillon_page(%L, jsonb_build_object('id', (select id from la_page), 'version', 1, 'contenu', tests.page('Notre histoire'))) $$, tests.id('A'))),
  'role', 'la lecture n''écrit pas de page');
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_brouillon_page(%L, jsonb_build_object('id', (select id from la_page), 'version', 9, 'contenu', tests.page('Notre histoire'))) $$, tests.id('A'))),
  'version', 'une page changée entre-temps : refusé');
select is(tests.indice(format($$ select public.gestion_brouillon_page(%L, jsonb_build_object('id', (select id from la_page), 'version', 1, 'contenu', tests.page('N'))) $$, tests.id('A'))),
  'titre', 'un titre d''une lettre : refusé');
select is(tests.indice(format($$ select public.gestion_brouillon_page(%L, jsonb_build_object('id', (select id from la_page), 'version', 1, 'contenu', tests.page('Notre histoire') - 'genre')) $$, tests.id('A'))),
  'forme', 'un brouillon incomplet : refusé');
select ok(public.gestion_brouillon_page(tests.id('A'), jsonb_build_object('id', (select id from la_page), 'version', 1, 'contenu', tests.page('Notre histoire'))) ? 'jeton',
  'le brouillon d''une page : écrit, et l''aperçu a son jeton');
select is((select titre_fr from public.pages_boutique where id = (select id from la_page)), 'À propos', 'la page en ligne n''a pas bougé');
select is((public.gestion_apparence(tests.id('A')) #>> '{brouillon,version}')::integer, 2, 'un brouillon de la vitrine s''est ouvert (pour l''aperçu), et a avancé d''une version');

-- Créer une page, hors ligne, son brouillon dedans.
select is(tests.indice(format($$ select public.gestion_brouillon_page(%L, jsonb_build_object('slug', 'contact', 'contenu', tests.page('Contact'))) $$, tests.id('A'))),
  'slug', 'une adresse que la vitrine sert déjà : refusée');
select is(public.gestion_brouillon_page(tests.id('A'), jsonb_build_object('slug', 'livraison', 'contenu', tests.page('Livraison', 'Partout en Tunisie.'))) ->> 'slug',
  'livraison', 'une page neuve, créée');
select is((select publie from public.pages_boutique where boutique_id = tests.id('A') and slug = 'livraison'), false, 'hors ligne tant que ce n''est pas publié');

-- ---------------------------------------------------------------------
-- L'aperçu
-- ---------------------------------------------------------------------
reset role;
create temp table le_jeton as select jeton from public.themes_brouillons where boutique_id = tests.id('A');
select is(public.apercu_page('essai-a', (select jeton from le_jeton), 'a-propos') ->> 'titre_fr', 'Notre histoire', 'l''aperçu d''une page : son brouillon');
select is(public.apercu_page('essai-a', (select jeton from le_jeton), 'livraison') ->> 'corps_fr', 'Partout en Tunisie.', 'même une page encore hors ligne');
select is(public.apercu_page('essai-a', gen_random_uuid(), 'a-propos'), null, 'un jeton faux : rien');
select is((select jsonb_path_query_array(public.apercu_apparence('essai-a', (select jeton from le_jeton)) -> 'pages', '$[*].titre_fr')),
  '["Notre histoire", "Livraison"]'::jsonb, 'le pied de page de l''aperçu : les pages telles que le brouillon les montre');
select tests.anonyme();
select is(public.page_publique(tests.id('A'), 'a-propos') ->> 'titre_fr', 'À propos', 'la vitrine, elle, lit la page en ligne');
select is(public.page_publique(tests.id('A'), 'livraison'), null, 'et pas celle encore hors ligne');

-- ---------------------------------------------------------------------
-- Publier, abandonner
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(public.gestion_publier_apparence(tests.id('A'), tests.apparence(), tests.version()) -> 'pages',
  '[{"slug": "a-propos", "publie": true}, {"slug": "livraison", "publie": true}]'::jsonb, '« Publier » : les pages passent en ligne avec le reste');
select tests.anonyme();
select is(public.page_publique(tests.id('A'), 'livraison') ->> 'corps_fr', 'Partout en Tunisie.', 'la page neuve est en ligne');

reset role; select tests.connecte('proprio_a');
select public.gestion_brouillon_page(tests.id('A'), jsonb_build_object('id', (select id from la_page), 'version', 2, 'contenu', tests.page('Encore un essai')));
select public.gestion_brouillon_apparence(tests.id('A'), null, (public.gestion_apparence(tests.id('A')) #>> '{brouillon,version}')::integer);
select is((select brouillon from public.pages_boutique where id = (select id from la_page)), null, 'abandonner le brouillon de la vitrine abandonne celui des pages');

select * from finish();
rollback;
