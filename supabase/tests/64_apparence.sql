-- =====================================================================
-- 64 · L'apparence de la vitrine : le style en listes fermées, le
--      brouillon à part du thème, la publication
-- =====================================================================
begin;
\ir outils.psql

select plan(29);

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

create function tests.contenu(p_style jsonb default '{}', p_polices jsonb default '{"titres": "bodoni-moda", "texte": "manrope"}') returns jsonb
language sql as $$
  select jsonb_build_object('code', 'editorial', 'couleurs', '{"accent": "#5E6B4E", "fond": "#F6F4EE"}'::jsonb,
                            'polices', p_polices, 'style', p_style)
$$;
grant execute on function tests.contenu(jsonb, jsonb) to authenticated;

reset role;
select ok(not has_function_privilege('anon', 'public.gestion_apparence(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.gestion_brouillon_apparence(uuid, jsonb, integer)', 'execute')
          and not has_function_privilege('anon', 'public.gestion_publier_apparence(uuid, jsonb, integer)', 'execute'),
  'le visiteur ne lit ni ne règle l''apparence');

-- ---------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------
select tests.connecte('lecture_a');
select is(public.gestion_apparence(tests.id('A')) -> 'brouillon', 'null'::jsonb, 'sans brouillon');
select is(public.gestion_apparence(tests.id('A')) #>> '{publie,code}', 'editorial', 'ce qui est publié');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_apparence(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');

-- ---------------------------------------------------------------------
-- Le brouillon
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.contenu(), null) $$, tests.id('A'))),
  'role', 'la lecture n''essaie pas');
reset role; select tests.connecte('prepa_a');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.contenu(), null) $$, tests.id('A'))),
  'role', 'le préparateur non plus');

reset role; select tests.connecte('proprio_a');
select is(public.gestion_brouillon_apparence(tests.id('A'), tests.contenu('{"coins": "ronds", "boutons": "pilule"}'), null) -> 'version',
  '1'::jsonb, 'le propriétaire enregistre un brouillon');
select is((public.gestion_apparence(tests.id('A')) ->> 'version')::integer, 1, 'le thème publié n''a pas bougé (sa version non plus)');
select is(public.gestion_brouillon_apparence(tests.id('A'), tests.contenu('{"coins": "ronds", "boutons": "contour"}'), 1) -> 'version',
  '2'::jsonb, 'puis le retouche');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.contenu(), 1) $$, tests.id('A'))),
  'version', 'une version du brouillon dépassée : refusé, l''essai du collègue n''est pas écrasé');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.contenu('{"coins": "biseautes"}'), 2) $$, tests.id('A'))),
  'forme', 'un style hors liste : refusé');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.contenu() || '{"textes": {}}', 2) $$, tests.id('A'))),
  'forme', 'un champ de plus que l''apparence : refusé');
reset role;
select tests.anonyme();
select is(public.boutique_publique('essai-a') #> '{theme,style}', '{}'::jsonb, 'la vitrine ne voit jamais le brouillon');
reset role;
select ok(has_function_privilege('anon', 'public.apercu_apparence(text, uuid)', 'execute'), 'la vitrine demande l''aperçu');
create temp table jeton_avant as select jeton from public.themes_brouillons where boutique_id = tests.id('A');
select is(public.apercu_apparence('essai-a', (select jeton from jeton_avant)) #>> '{style,boutons}', 'contour',
  'à qui présente le jeton de son aperçu, la vitrine rend le brouillon');
select is(public.apercu_apparence('essai-b', (select jeton from jeton_avant)), null, 'le jeton d''une autre boutique : rien');
select is(public.apercu_apparence('essai-a', gen_random_uuid()), null, 'un jeton faux : rien');

-- ---------------------------------------------------------------------
-- Publier
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_publier_apparence(%L, tests.contenu(), 0) $$, tests.id('A'))),
  'version', 'publier sur une apparence changée entre-temps : refusé');
select is(public.gestion_publier_apparence(tests.id('A'), tests.contenu('{"coins": "ronds", "boutons": "contour", "mode": "sombre"}'), 1) -> 'version',
  '2'::jsonb, 'publier : le thème prend la nouvelle version');
select results_eq($$ select r #>> '{publie,style,boutons}', r #>> '{publie,polices,titres}', r -> 'brouillon' from (select public.gestion_apparence(tests.id('A')) r) x $$,
  $$ values ('contour'::text, 'bodoni-moda'::text, 'null'::jsonb) $$,
  'l''apparence publiée ; le brouillon s''est effacé');

reset role;
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'apparence.publier'), 1,
  'la publication est tracée');
select tests.anonyme();
select is(public.boutique_publique('essai-a') #>> '{theme,style,mode}', 'sombre', 'la vitrine lit le style publié');
reset role;
select is(public.apercu_apparence('essai-a', (select jeton from jeton_avant)), null, 'le brouillon publié, son jeton ne rend plus rien');


-- ---------------------------------------------------------------------
-- Le style, vérifié par la base
-- ---------------------------------------------------------------------
reset role;
update public.themes set style = '{"coins": "arrondis", "boutons": "pilule", "mode": "sombre", "photos": "1-1"}' where boutique_id = tests.id('A');
select is((select style ->> 'boutons' from public.themes where boutique_id = tests.id('A')), 'pilule', 'des valeurs de la liste : gardées');
select throws_ok(format($$ update public.themes set style = '{"coins": "biseautes"}' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une valeur hors liste : refusée');
select throws_ok(format($$ update public.themes set style = '{"css": "body{display:none}"}' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'un réglage inconnu : refusé (aucune valeur libre n''atteint la feuille)');
select throws_ok(format($$ update public.themes set style = '{"mode": true}' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une valeur qui n''est pas un texte : refusée');
select lives_ok(format($$ update public.themes set polices = '{"titres": "fraunces", "texte": "dm-sans"}' where boutique_id = %L $$, tests.id('A')),
  'les nouvelles familles sont disponibles');
select throws_ok(format($$ update public.themes set polices = '{"texte": "bodoni-moda"}' where boutique_id = %L $$, tests.id('A')),
  '23514', null, 'une police de titres en texte courant : refusée');

select * from finish();
rollback;
