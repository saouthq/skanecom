-- =====================================================================
-- 55 · La lettre d'information : l'accord prouvé, confirmé, réversible
-- =====================================================================
begin;
\ir outils.psql

select plan(32);

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
create function tests.lettre(p_boutique text, p_email text) returns text language sql security definer set search_path = '' as $$
  select statut from public.lettre_abonnes where boutique_id = tests.id(p_boutique) and email = p_email
$$;
create function tests.lettre_desinscrits(p_boutique text) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.lettre_abonnes where boutique_id = tests.id(p_boutique) and statut = 'desinscrit' and email is null and jeton_hash is null
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

create table tests.jetons (nom text primary key, jeton text);
grant all on tests.jetons to anon, authenticated, service_role;

reset role;
select results_eq($$ select cle, type_valeur, defaut, public from plateforme.reglages_catalogue where cle like 'vitrine.lettre%' order by cle $$,
  $$ values ('vitrine.lettre'::text, 'booleen'::text, 'false'::jsonb, true), ('vitrine.lettre_accroche', 'texte', '""', true) $$,
  'les réglages : la lettre coupée par défaut, son accroche, lus par la vitrine');
select ok(not has_function_privilege('anon', 'public.lettre_inscrire(uuid, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.lettre_inscrire(uuid, text, text, text)', 'execute'),
  'le navigateur n''inscrit personne lui-même : le jeton ne lui revient jamais');
select ok(has_function_privilege('anon', 'public.lettre_confirmer(uuid, text)', 'execute')
          and has_function_privilege('anon', 'public.lettre_desinscrire(uuid, text)', 'execute'),
  'confirmer et se désinscrire : avec le seul lien, sans compte');
select throws_ok($$ insert into public.pages_boutique (boutique_id, slug, genre, titre_fr, corps_fr) values (tests.id('A'), 'lettre', 'texte', 'La lettre', 'x') $$,
  '23514', null, 'une page de la boutique ne prend pas l''adresse de la lettre');

-- ---------------------------------------------------------------------
-- S'inscrire
-- ---------------------------------------------------------------------
select tests.service();
select is(tests.indice($$ select public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre.', '/') $$),
  'reglage', 'réglage coupé : pas d''inscription');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'vitrine.lettre', 'true'), (tests.id('C'), 'vitrine.lettre', 'true');
select tests.service();
select is(tests.indice($$ select public.lettre_inscrire(tests.id('A'), 'pas-une-adresse', 'J''accepte de recevoir la lettre.', '/') $$),
  'email', 'une adresse illisible : refusée');
select is(tests.indice($$ select public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', '', '/') $$),
  'consentement', 'sans la phrase acceptée : refusée');
select is(tests.indice($$ select public.lettre_inscrire(tests.id('C'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre.', '/') $$),
  'boutique', 'une boutique suspendue n''inscrit personne');

insert into tests.jetons
select 'leila', r ->> 'jeton' from (select public.lettre_inscrire(tests.id('A'), '  Leila@Exemple.TN ', 'J''accepte de recevoir la lettre de A.', '/produit/valise-cabine?couleur=noir') as r) x;
select is((select jeton from tests.jetons where nom = 'leila') ~ '^[0-9a-f]{64}$', true, 'le serveur reçoit le jeton du lien, pour l''e-mail');
reset role;
select is(tests.lettre('A', 'leila@exemple.tn'), 'a_confirmer', 'l''adresse, en minuscules, attend la confirmation');
select results_eq($$ select consentement, page, envois from public.lettre_abonnes where boutique_id = tests.id('A') and email = 'leila@exemple.tn' $$,
  $$ values ('J''accepte de recevoir la lettre de A.'::text, '/produit/valise-cabine?couleur=noir'::text, 1) $$,
  'la phrase acceptée et la page sont gardées, preuve de l''accord');
select is((select count(*)::integer from public.lettre_abonnes where jeton_hash = convert_to((select jeton from tests.jetons where nom = 'leila'), 'UTF8')), 0,
  'la base ne garde que l''empreinte du jeton');

select tests.service();
insert into tests.jetons
select 'leila-2', r ->> 'jeton' from (select public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/') as r) x;
insert into tests.jetons
select 'leila-3', r ->> 'jeton' from (select public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/') as r) x;
select is(tests.indice($$ select public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/') $$),
  'essais', 'trois e-mails de confirmation par jour au plus');

-- ---------------------------------------------------------------------
-- Confirmer
-- ---------------------------------------------------------------------
select tests.anonyme();
select is(public.lettre_confirmer(tests.id('A'), (select jeton from tests.jetons where nom = 'leila')) ->> 'etat', 'inconnu',
  'un nouveau lien remplace l''ancien');
select is(public.lettre_confirmer(tests.id('B'), (select jeton from tests.jetons where nom = 'leila-3')) ->> 'etat', 'inconnu',
  'le lien d''une boutique ne vaut pas pour une autre');
select is(public.lettre_confirmer(tests.id('A'), 'n''importe quoi') ->> 'etat', 'inconnu', 'un jeton illisible : rien');
select is(public.lettre_confirmer(tests.id('A'), (select jeton from tests.jetons where nom = 'leila-3')) ->> 'etat', 'inscrit',
  'le dernier lien confirme l''inscription');
select is(public.lettre_confirmer(tests.id('A'), (select jeton from tests.jetons where nom = 'leila-3')) ->> 'etat', 'deja',
  'confirmer deux fois : déjà inscrite');
reset role;
select is(tests.lettre('A', 'leila@exemple.tn'), 'inscrit', 'inscrite');

select tests.service();
select is(public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/'),
  '{"etat": "deja", "courriel": true}'::jsonb, 'déjà inscrite : ni jeton, ni nouveau lien ; un e-mail le lui dit');
select is(public.lettre_inscrire(tests.id('A'), 'leila@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/'),
  '{"etat": "deja", "courriel": false}'::jsonb, 'une fois par jour : retaper son adresse ne fait pas pleuvoir les e-mails');

-- Une demande jamais confirmée s'efface au bout de sept jours.
insert into tests.jetons
select 'sami', r ->> 'jeton' from (select public.lettre_inscrire(tests.id('A'), 'sami@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/') as r) x;
reset role;
update public.lettre_abonnes set demande_le = now() - interval '8 days' where email = 'sami@exemple.tn';
select tests.anonyme();
select is(public.lettre_confirmer(tests.id('A'), (select jeton from tests.jetons where nom = 'sami')) ->> 'etat', 'expire', 'un lien de plus de sept jours a expiré');
select tests.service();
select public.lettre_inscrire(tests.id('A'), 'nour@exemple.tn', 'J''accepte de recevoir la lettre de A.', '/');
reset role;
select is(tests.lettre('A', 'sami@exemple.tn'), null::text, 'la demande expirée est effacée à l''inscription suivante');

-- ---------------------------------------------------------------------
-- L'équipe
-- ---------------------------------------------------------------------
select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_lettre(%L) $$, tests.id('A')), '42501', null, 'l''équipe d''une autre boutique ne lit rien');
reset role; select tests.connecte('confirm_a');
select is(tests.indice(format($$ select public.gestion_lettre(%L) $$, tests.id('A'))), 'role', 'la confirmation ne lit pas les adresses');
reset role; select tests.connecte('lecture_a');
select results_eq($$ select (x #>> '{compteurs,inscrits}')::int, (x #>> '{compteurs,a_confirmer}')::int, x #>> '{abonnes,0,email}', jsonb_array_length(x -> 'semaines')
                     from (select public.gestion_lettre(tests.id('A')) as x) t $$,
  $$ values (1, 1, 'leila@exemple.tn'::text, 12) $$, 'la direction lit : une inscrite, une à confirmer, douze semaines');
select is(tests.indice(format($$ select public.gestion_lettre_retirer(%L, (select id from public.lettre_abonnes limit 1)) $$, tests.id('A'))), 'role',
  'la lecture ne retire personne');
select is(tests.indice(format($$ select public.gestion_export(%L, 'lettre') $$, tests.id('A'))), 'role', 'ni n''exporte');
reset role; select tests.connecte('proprio_a');
select results_eq(format($$ select x ->> 'email', x ->> 'consentement' from jsonb_array_elements(public.gestion_export(%L, 'lettre')) x $$, tests.id('A')),
  $$ values ('leila@exemple.tn'::text, 'J''accepte de recevoir la lettre de A.'::text) $$,
  'l''export : les inscrites et la phrase qu''elles ont acceptée');
select is(jsonb_typeof(public.gestion_export(tests.id('A'), 'commandes')), 'array', 'les autres exports restent là');

-- ---------------------------------------------------------------------
-- Se désinscrire : l'adresse est effacée
-- ---------------------------------------------------------------------
select tests.anonyme();
select is(public.lettre_desinscrire(tests.id('A'), (select jeton from tests.jetons where nom = 'leila-3')) ->> 'etat', 'desinscrit',
  'le même lien désinscrit, sans compte');
reset role;
select is(tests.lettre_desinscrits('A'), 1, 'désinscrite : l''adresse et le lien sont effacés, la date reste');

select * from finish();
rollback;
