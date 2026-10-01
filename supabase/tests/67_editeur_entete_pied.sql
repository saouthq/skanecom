-- =====================================================================
-- 67 · L'éditeur de la vitrine : l'en-tête et le pied de page
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

-- Une apparence, avec des réglages de la vitrine.
create function tests.avec(p_reglages jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('code', 'editorial', 'couleurs', '{}'::jsonb, 'polices', '{}'::jsonb, 'style', '{}'::jsonb, 'reglages', p_reglages)
$$;
create function tests.version() returns integer
language sql as $$ select (public.gestion_apparence(tests.id('A')) ->> 'version')::integer $$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.connecte('lecture_a');
select is(public.gestion_apparence(tests.id('A')) #>> '{reglages,vitrine.annonce}', '', 'l''écran lit les réglages de la vitrine en vigueur (le défaut du catalogue)');

-- ---------------------------------------------------------------------
-- Le brouillon
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('{"livraison.frais_millimes": 0}'), null) $$, tests.id('A'))),
  'forme', 'un réglage qui ne se règle pas dans l''éditeur : refusé');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec(jsonb_build_object('vitrine.annonce', repeat('x', 141))), null) $$, tests.id('A'))),
  'limite', 'une annonce de plus de 140 caractères : refusée par la règle des réglages');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('{"contact.instagram": "pas un compte !"}'), null) $$, tests.id('A'))),
  'reseau', 'un compte Instagram illisible : refusé');
select is(tests.indice(format($$ select public.gestion_brouillon_apparence(%L, tests.avec('{"vitrine.whatsapp_flottant": "oui"}'), null) $$, tests.id('A'))),
  'forme', 'un oui écrit en texte : refusé (le type du catalogue)');
select is(public.gestion_brouillon_apparence(tests.id('A'),
  tests.avec('{"vitrine.annonce": "La collection d''été est arrivée", "contact.instagram": "@essai.a", "vitrine.whatsapp_flottant": true}'), null) -> 'version',
  '1'::jsonb, 'un brouillon avec l''annonce, Instagram et le bouton WhatsApp');
select is((select count(*)::integer from public.reglages where boutique_id = tests.id('A') and cle in ('vitrine.annonce', 'contact.instagram')), 0,
  'les réglages publiés n''ont pas bougé (l''essai d''écriture est défait)');
reset role;
select is(public.apercu_apparence('essai-a', (select jeton from public.themes_brouillons where boutique_id = tests.id('A'))) #>> '{reglages,vitrine.annonce}',
  'La collection d''été est arrivée', 'l''aperçu rend les réglages du brouillon');
select tests.anonyme();
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.annonce}', '', 'la vitrine, elle, n''a pas d''annonce');

-- ---------------------------------------------------------------------
-- Publier
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_publier_apparence(%L, tests.avec('{"vitrine.annonce": "La collection d''été est arrivée", "contact.instagram": "@essai.a"}'), %s) $$,
  tests.id('A'), tests.version()), 'publier l''annonce et Instagram');
reset role;
select results_eq($$ select cle, valeur #>> '{}' from public.reglages where boutique_id = tests.id('A') and cle in ('vitrine.annonce', 'contact.instagram') order by cle $$,
  $$ values ('contact.instagram'::text, '@essai.a'::text), ('vitrine.annonce', 'La collection d''été est arrivée') $$,
  'les réglages de la boutique les prennent');
select tests.anonyme();
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.annonce}', 'La collection d''été est arrivée', 'la vitrine montre l''annonce');
reset role;
select is((select avant -> 'reglages' from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'apparence.publier' order by id desc limit 1),
  '{"vitrine.annonce": null, "contact.instagram": null}'::jsonb, 'le journal garde les valeurs d''avant (aucune)');

select * from finish();
rollback;
