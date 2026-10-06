-- =====================================================================
-- 109 · Le domaine d'une boutique : le sien branché, une adresse provisoire, un achat
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

select tests.service();
-- Une adresse provisoire : un sous-domaine de la plateforme, principal.
select isnt(public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-provisoire', 'Essai provisoire', 'essai-provisoire.skanecom.tn',
  'editorial', 'fr', 'sous_domaine'), null, 'créée avec une adresse provisoire');
reset role;
select is((select type::text || ' ' || principal from plateforme.domaines where hote = 'essai-provisoire.skanecom.tn'), 'sous_domaine true',
  'l''adresse provisoire : un sous-domaine, principal');
select is((select apres ->> 'type' from plateforme.journal_audit where action = 'boutique.creer' and cible = 'essai-provisoire'), 'sous_domaine',
  'le journal dit le genre du domaine');
select tests.service();
select throws_ok(format($$ select public.console_creer_boutique(%L, 'autre-essai', 'Autre', 'essai-provisoire.skanecom.tn') $$, tests.id('admin_plateforme')),
  '23505', null, 'un domaine qui mène déjà à une boutique est refusé (rien n''est créé)');
reset role;
select ok(not exists (select 1 from plateforme.boutiques where slug = 'autre-essai'), 'et la boutique n''existe pas');

-- Le sien : ce que Cloudflare a répondu, gardé ; relu actif, son certificat valable.
select tests.service();
select public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-sien', 'Essai sien', 'www.essai-sien.tn');
select public.console_noter_branchement(tests.id('admin_plateforme'), 'www.essai-sien.tn',
  '{"ref": "ch_1", "statut": "a_poser", "erreurs": [], "enregistrements": [{"type": "CNAME", "nom": "www.essai-sien.tn", "valeur": "cible.skanecom.tn", "role": "Mène la vitrine"}]}');
select is((public.console_branchements(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-sien')) #>> '{0,branchement,statut}'),
  'a_poser', 'branché : les enregistrements à poser sont gardés');
select public.console_noter_branchement(tests.id('admin_plateforme'), 'www.essai-sien.tn',
  '{"ref": "ch_1", "statut": "actif", "erreurs": [], "enregistrements": []}');
reset role;
select is((select statut_certificat from plateforme.domaines where hote = 'www.essai-sien.tn'), 'actif', 'relu actif : son certificat est valable');
select is((select count(*)::int from plateforme.journal_audit where action = 'boutique.domaine_branche' and cible = 'www.essai-sien.tn'), 2,
  'chaque changement d''état est tracé (à poser, puis actif)');
select tests.service();
select throws_ok(format($$ select public.console_noter_branchement(%L, 'www.essai-sien.tn', '{"statut": "n_importe"}') $$, tests.id('admin_plateforme')),
  '22023', null, 'un état inconnu est refusé');

-- Un achat : réservé au super-administrateur, tracé avec son prix.
select throws_ok(format($$ select public.console_noter_achat(%L, %L, 'essai.com', '10.44 USD') $$, tests.id('support_plateforme'),
  (select id from plateforme.boutiques where slug = 'essai-sien')), '42501', null, 'le support n''achète pas de domaine');
select public.console_noter_achat(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-sien'), 'essai-sien.com', '10.44 USD');
reset role;
select is((select apres ->> 'prix' from plateforme.journal_audit where action = 'boutique.domaine_achete' and cible = 'essai-sien.com'), '10.44 USD',
  'l''achat est au journal, avec son prix');

select * from finish();
rollback;
