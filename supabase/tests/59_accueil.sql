-- =====================================================================
-- 59 · Composer l'accueil : la bibliothèque de sections, l'équipe qui
--      l'ordonne, la vitrine qui montre les avis
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

reset role;
select ok(not has_function_privilege('anon', 'public.gestion_enregistrer_accueil(uuid, jsonb, integer)', 'execute')
          and not has_function_privilege('anon', 'public.gestion_accueil(uuid)', 'execute')
          and has_function_privilege('anon', 'public.avis_accueil(uuid, integer)', 'execute'),
  'l''équipe compose, le visiteur lit seulement les avis');

-- ---------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------
select tests.connecte('lecture_a');
select is(public.gestion_accueil(tests.id('A')) -> 'sections', 'null'::jsonb, 'sans composition : les sections du gabarit (NULL)');
select is((public.gestion_accueil(tests.id('A')) ->> 'version')::integer, 1, 'avec la version du thème');
select is(jsonb_array_length(public.gestion_accueil(tests.id('A')) -> 'rayons'), 1, 'les rayons actifs, pour la sélection');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_accueil(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');

-- ---------------------------------------------------------------------
-- Enregistrer
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "hero"}]', 1) $$, tests.id('A'))),
  'role', 'la lecture ne compose pas');
reset role; select tests.connecte('prepa_a');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "hero"}]', 1) $$, tests.id('A'))),
  'role', 'le préparateur non plus');

reset role; select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_accueil(tests.id('A'),
  '[{"type": "hero", "textes": {"titre_fr": "La rentrée"}}, {"type": "selection", "tri": "nouveautes", "rayon": "valises", "nombre": 4},
    {"type": "avis", "nombre": 3}, {"type": "questions", "page": "questions-frequentes", "nombre": 5}, {"type": "marques"}, {"type": "engagements"}]', 1) -> 'version',
  '2'::jsonb, 'le propriétaire compose : nouveautés, avis, questions, marques');
select is(jsonb_path_query_array(public.gestion_accueil(tests.id('A')) -> 'sections', '$[*].type'),
  '["hero", "selection", "avis", "questions", "marques", "engagements"]'::jsonb, 'dans son ordre');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "hero"}]', 1) $$, tests.id('A'))),
  'version', 'une version dépassée : refusé, le collègue n''est pas écrasé');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[]', 2) $$, tests.id('A'))),
  'vide', 'un accueil sans section : refusé');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "avis", "tri": "nouveautes"}]', 2) $$, tests.id('A'))),
  'section', 'un tri ailleurs que sur une sélection : refusé');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "selection", "lien": "https://ailleurs.example"}]', 2) $$, tests.id('A'))),
  'section', 'un lien vers une autre origine : refusé');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "carrousel"}]', 2) $$, tests.id('A'))),
  'section', 'un type inconnu : refusé');
select is(public.gestion_enregistrer_accueil(tests.id('A'), null, 2) -> 'version', '3'::jsonb, 'NULL : retour à l''accueil du gabarit');

reset role;
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'accueil.modifier'), 2,
  'chaque composition est tracée');

-- ---------------------------------------------------------------------
-- La vitrine : les avis de 4 et 5 étoiles avec un texte
-- ---------------------------------------------------------------------
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'avis');
update public.commandes set statut = 'livree', livree_at = now() - interval '3 days' where id in (tests.id('commande_a'), tests.id('commande_ab_a'));
insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, statut)
select tests.id('A'), tests.id('produit_a'), c.id, l.id, c.client_id, x.note, x.texte, x.auteur, 'publie'
  from (values ('commande_a', 5, 'Solide, roulettes silencieuses.', 'Amel B.'), ('commande_ab_a', 2, 'Déçu par la poignée.', 'Karim T.')) as x(cle, note, texte, auteur)
  join public.commandes c on c.id = tests.id(x.cle)
  join public.commande_lignes l on l.commande_id = c.id;

select tests.anonyme();
select results_eq($$ select (r ->> 'total')::integer, (r ->> 'moyenne')::numeric, jsonb_array_length(r -> 'avis'), r #>> '{avis,0,auteur}', r #>> '{avis,0,produit,image}'
                       from (select public.avis_accueil(tests.id('A'), 6) r) x $$,
  $$ values (2, 3.5::numeric, 1, 'Amel B.'::text, 'essai-a/valise-noire.webp'::text) $$,
  'la citation de 5 étoiles seulement, avec sa pièce ; la note porte sur tous les avis publiés');
reset role;
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'avis';
select tests.anonyme();
select is(public.avis_accueil(tests.id('A'), 6), null, 'module coupé : rien');

select * from finish();
rollback;
