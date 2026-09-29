-- =====================================================================
-- 08 · La console de la plateforme : portes fermées, actions tracées
-- =====================================================================
begin;
\ir outils.psql

select plan(31);

-- admin_plateforme (super_admin) vient du jeu d'essai commun (outils.psql).

-- ---------------------------------------------------------------------
-- Portes fermées : la console n'est ouverte qu'à service_role
-- ---------------------------------------------------------------------
select is_empty($$
  select p.oid::regprocedure from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname like 'console\_%'
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
$$, 'aucune fonction console_* n''est exécutable par un visiteur ou un membre');
select is((select count(*)::integer from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname like 'console\_%'
              and has_function_privilege('service_role', p.oid, 'execute')),
  7, 'les 7 fonctions de la console sont ouvertes à service_role');
select is_empty($$
  select p.oid::regprocedure from pg_proc p
  where p.pronamespace = 'private'::regnamespace and p.proname like 'console\_%'
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
$$, 'les outils internes de la console sont fermés aux visiteurs et aux membres');

reset role; select tests.anonyme();
select throws_ok('select * from public.console_boutiques()', '42501', null,
  'un visiteur ne liste pas les boutiques de la plateforme');
reset role; select tests.connecte('proprio_a');
select throws_ok(format($$ select public.console_creer_boutique(%L, 'pirate', 'Pirate', 'pirate.test') $$, tests.id('proprio_a')),
  '42501', null, 'un propriétaire de boutique ne crée pas de boutique, même en se déclarant acteur');

-- ---------------------------------------------------------------------
-- Côté serveur de la console (service_role)
-- ---------------------------------------------------------------------
reset role; select tests.service();

select is(public.console_administrateur(tests.id('admin_plateforme')), 'super_admin',
  'un administrateur est reconnu avec son rôle');
select is(public.console_administrateur(tests.id('proprio_a')), null,
  'un propriétaire de boutique n''est pas administrateur de la plateforme');

select throws_ok(format($$ select public.console_creer_boutique(%L, 'essai-console', 'Essai console', 'essai-console.test') $$,
                        tests.id('proprio_a')),
  '42501', null, 'la base refuse une création dont l''acteur n''est pas administrateur');

-- C1 · création
select set_config('request.headers', '{"x-console-ip": "198.51.100.7"}', true);
select isnt(public.console_creer_boutique(tests.id('admin_plateforme'), ' Essai-Console ', ' Essai console ',
                                          ' Essai-Console.TEST ', 'catalogue_technique'),
  null, 'l''administrateur crée une boutique');
select is((select statut::text from plateforme.boutiques where slug = 'essai-console'), 'en_preparation',
  'elle naît en préparation (la vitrine ne la sert pas encore)');
select results_eq($$ select hote, principal from plateforme.domaines d
                     join plateforme.boutiques b on b.id = d.boutique_id where b.slug = 'essai-console' $$,
  $$ values ('essai-console.test'::text, true) $$, 'son domaine est enregistré, en minuscules, comme principal');
select is((select t.code from public.themes t join plateforme.boutiques b on b.id = t.boutique_id where b.slug = 'essai-console'),
  'catalogue_technique', 'elle reçoit le thème de départ choisi');
select results_eq($$ select j.action, j.acteur, host(j.ip) from plateforme.journal_audit j
                     join plateforme.boutiques b on b.id = j.boutique_id where b.slug = 'essai-console' $$,
  format($$ values ('boutique.creer'::text, %L::uuid, '198.51.100.7'::text) $$, tests.id('admin_plateforme')),
  'la création est tracée, avec l''administrateur et son adresse IP');

select throws_ok(format($$ select public.console_creer_boutique(%L, 'essai-console', 'Doublon', 'autre.test') $$, tests.id('admin_plateforme')),
  '23505', null, 'deux boutiques n''ont jamais le même identifiant');
select throws_ok(format($$ select public.console_creer_boutique(%L, 'autre-boutique', 'Autre', 'essai-console.test') $$, tests.id('admin_plateforme')),
  '23505', null, 'un domaine ne mène jamais à deux boutiques');
select throws_ok(format($$ select public.console_creer_boutique(%L, 'Mauvais identifiant!', 'Mauvaise', 'mauvaise.test') $$, tests.id('admin_plateforme')),
  '23514', null, 'un identifiant hors lettres, chiffres et tirets est refusé');

select results_eq($$ select slug, statut from public.resoudre_domaine('essai-console.test') $$,
  $$ values ('essai-console'::text, 'en_preparation'::text) $$,
  'la vitrine trouve la nouvelle boutique par son domaine, avec son statut');

-- Ouverture
select lives_ok(format($$ select public.console_changer_statut(%L, (select id from plateforme.boutiques where slug = 'essai-console'), 'active') $$,
                       tests.id('admin_plateforme')), 'l''administrateur ouvre la boutique');
select results_eq($$ select j.avant ->> 'statut', j.apres ->> 'statut' from plateforme.journal_audit j
                     where j.action = 'boutique.statut' $$,
  $$ values ('en_preparation'::text, 'active'::text) $$, 'l''ouverture est tracée avec l''état d''avant et d''après');
select throws_ok(format($$ select public.console_changer_statut(%L, (select id from plateforme.boutiques where slug = 'essai-console'), 'ouverte') $$,
                        tests.id('admin_plateforme')),
  '22P02', null, 'un statut inconnu est refusé');

-- Second domaine, qui devient principal
select public.console_ajouter_domaine(tests.id('admin_plateforme'),
  (select id from plateforme.boutiques where slug = 'essai-console'), 'www.essai-console.test', true);
select results_eq($$ select hote from plateforme.domaines d join plateforme.boutiques b on b.id = d.boutique_id
                     where b.slug = 'essai-console' and d.principal $$,
  $$ values ('www.essai-console.test'::text) $$, 'un domaine ajouté comme principal remplace l''ancien principal');

-- C2 · marque
select is(public.console_modifier_theme(tests.id('admin_plateforme'),
            (select id from plateforme.boutiques where slug = 'essai-console'), 1,
            '{"couleurs": {"accent": "#0B6E4F"}, "polices": {"titres": "plex-sans"}, "textes": {"resume_fr": "Tout pour le chantier."}}'),
  2, 'l''administrateur règle la marque : le thème passe en version 2');
select results_eq($$ select t.couleurs ->> 'accent', t.polices ->> 'titres', t.textes ->> 'resume_fr' from public.themes t
                     join plateforme.boutiques b on b.id = t.boutique_id where b.slug = 'essai-console' $$,
  $$ values ('#0B6E4F'::text, 'plex-sans'::text, 'Tout pour le chantier.'::text) $$, 'couleurs, polices et textes sont enregistrés');
select throws_ok(format($$ select public.console_modifier_theme(%L, (select id from plateforme.boutiques where slug = 'essai-console'), 2,
                                   '{"couleurs": {"accent": "red;}</style>"}}') $$, tests.id('admin_plateforme')),
  '23514', null, 'une couleur hors #RRGGBB est refusée par la base, quelle que soit la console');
select throws_ok(format($$ select public.console_modifier_theme(%L, (select id from plateforme.boutiques where slug = 'essai-console'), 1,
                                   '{"textes": {"resume_fr": "Écrase tout"}}') $$, tests.id('admin_plateforme')),
  '40001', null, 'un formulaire périmé (version 1 alors que la base est en 2) n''écrase pas le travail d''un autre');
select throws_ok(format($$ select public.console_modifier_theme(%L, (select id from plateforme.boutiques where slug = 'essai-console'), 2,
                                   '{"logo_chemin": "essai-a/marque/logo.svg"}') $$, tests.id('admin_plateforme')),
  '23514', null, 'les champs hors marque (fichiers, sections) ne passent pas par ce réglage');
select is((select (j.avant ->> 'version')::integer from plateforme.journal_audit j where j.action = 'theme.modifier'),
  1, 'le réglage de marque est tracé avec le thème d''avant');

-- Lecture
select is((select jsonb_array_length(public.console_boutique('essai-console') -> 'domaines')), 2,
  'la fiche de la boutique liste ses deux domaines');
select ok((select jsonb_array_length(public.console_boutique('essai-console') -> 'journal') >= 4),
  'la fiche de la boutique montre son journal');
select ok(exists (select 1 from public.console_boutiques() where slug = 'essai-console' and statut = 'active' and theme = 'catalogue_technique'),
  'le tableau de bord montre la nouvelle boutique, ouverte, avec son thème');

-- Une IP illisible n'empêche jamais la trace
select set_config('request.headers', '{"x-console-ip": "pas-une-ip"}', true);
select public.console_changer_statut(tests.id('admin_plateforme'),
  (select id from plateforme.boutiques where slug = 'essai-console'), 'suspendue');
select is((select count(*)::integer from plateforme.journal_audit j where j.action = 'boutique.statut' and j.ip is null), 1,
  'une adresse IP illisible laisse la trace, sans IP');

select * from finish();
rollback;
