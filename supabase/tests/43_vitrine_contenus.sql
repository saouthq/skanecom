-- =====================================================================
-- 43 · La vitrine complète : les réglages des réseaux et du contact, les
--      pages de la boutique, le suivi d'une commande sans compte
-- =====================================================================
begin;
\ir outils.psql

select plan(44);

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
grant execute on function tests.indice(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Les réglages : réseaux, horaires, bouton WhatsApp, annonce
-- ---------------------------------------------------------------------
select is((select count(*)::int from plateforme.reglages_catalogue
            where cle in ('contact.instagram', 'contact.facebook', 'contact.tiktok', 'contact.horaires',
                          'vitrine.whatsapp_flottant', 'vitrine.annonce')
              and public and groupe = 'vitrine'), 6,
  'six réglages publics du groupe « vitrine » : Instagram, Facebook, TikTok, horaires, bouton WhatsApp, annonce');

reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_enregistrer_reglages(%L, '{"contact.instagram": "@maison.a"}') $$, tests.id('A')),
  '42501', null, 'la préparation ne touche pas aux réseaux');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_reglages(tests.id('A'),
  '{"contact.instagram": "@maison.a", "contact.facebook": "https://www.facebook.com/maison.a", "contact.tiktok": "https://www.tiktok.com/@maison.a",
    "contact.horaires": "Du lundi au samedi, de 9 h à 19 h", "vitrine.whatsapp_flottant": true, "vitrine.annonce": "La collection d''été est arrivée"}'), 6,
  'le propriétaire pose ses réseaux, ses horaires, le bouton WhatsApp et une annonce');
select is(tests.indice(format($$ select public.gestion_enregistrer_reglages(%L, '{"contact.instagram": "https://evil.example/maison"}') $$, tests.id('A'))),
  'reseau', 'un « compte » Instagram qui mène ailleurs est refusé');
select is(tests.indice(format($$ select public.gestion_enregistrer_reglages(%L, '{"contact.tiktok": "maison a"}') $$, tests.id('A'))),
  'reseau', 'un compte TikTok à espaces aussi');
select is(tests.indice(format($$ select public.gestion_enregistrer_reglages(%L, %L) $$, tests.id('A'),
  jsonb_build_object('vitrine.annonce', repeat('a', 141)))), 'limite', 'une annonce de plus de 140 caractères aussi');
select is(public.gestion_enregistrer_reglages(tests.id('A'), '{"contact.facebook": "maison.a"}'), 1,
  'une page Facebook se donne aussi par son seul nom');
select is(public.boutique_publique('essai-a') #>> '{configuration,reglages,vitrine.annonce}', 'La collection d''été est arrivée',
  'la vitrine lit l''annonce');
select is(public.boutique_publique('essai-a') #> '{configuration,reglages,vitrine.whatsapp_flottant}', 'true'::jsonb,
  'et le bouton WhatsApp');
select is(public.boutique_publique('essai-b') #>> '{configuration,reglages,vitrine.annonce}', '',
  'une autre boutique garde ses réglages (vides)');

-- ---------------------------------------------------------------------
-- Les pages
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_enregistrer_page(%L, '{"slug": "a-propos", "titre_fr": "À propos"}') $$, tests.id('A')),
  '42501', null, 'la préparation n''écrit pas de page');

reset role; select tests.connecte('proprio_a');
create temp table page_a on commit drop as
  select public.gestion_enregistrer_page(tests.id('A'),
    '{"slug": "a-propos", "titre_fr": "À propos", "corps_fr": "Une maison de Tunis.\n\n## Nos matières\nLin et coton."}') as r;
grant select on page_a to authenticated, anon;
select is((select r ->> 'slug' from page_a), 'a-propos', 'le propriétaire écrit « À propos » (en brouillon par défaut)');
select is(tests.indice(format($$ select public.gestion_enregistrer_page(%L, '{"slug": "catalogue", "titre_fr": "Le catalogue"}') $$, tests.id('A'))),
  'slug', 'une adresse que la vitrine sert déjà (catalogue) est refusée');
select is(tests.indice(format($$ select public.gestion_enregistrer_page(%L, '{"slug": "À propos", "titre_fr": "Encore"}') $$, tests.id('A'))),
  'slug', 'une adresse illisible aussi (accents, espaces)');
select is(tests.indice(format($$ select public.gestion_enregistrer_page(%L, '{"slug": "a-propos", "titre_fr": "Doublon"}') $$, tests.id('A'))),
  'slug', 'deux pages n''ont pas la même adresse');
select is(tests.indice(format($$ select public.gestion_enregistrer_page(%L, '{"slug": "vide", "titre_fr": "A"}') $$, tests.id('A'))),
  'titre', 'un titre d''une lettre est refusé');

reset role; select tests.anonyme();
select is(public.page_publique(tests.id('A'), 'a-propos'), null, 'un brouillon ne se lit pas dans la vitrine');

reset role; select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_page(tests.id('A'), jsonb_build_object(
    'id', (select r ->> 'id' from page_a), 'version', (select r ->> 'version' from page_a),
    'slug', 'a-propos', 'titre_fr', 'À propos', 'corps_fr', 'Une maison de Tunis.', 'publie', true)) ->> 'slug', 'a-propos',
  'publiée, avec la version lue');
select is(tests.indice(format($$ select public.gestion_enregistrer_page(%L, %L) $$, tests.id('A'), jsonb_build_object(
    'id', (select r ->> 'id' from page_a), 'version', (select r ->> 'version' from page_a),
    'slug', 'a-propos', 'titre_fr', 'Écrasée'))),
  'version', 'une version périmée est refusée : la page d''un collègue n''est pas écrasée');
select is(public.gestion_enregistrer_page(tests.id('A'),
    '{"slug": "questions", "genre": "questions", "titre_fr": "Questions fréquentes", "corps_fr": "### Comment payer ?\nÀ la livraison.", "publie": true}') ->> 'slug',
  'questions', 'une page de questions fréquentes, publiée d''emblée');

reset role; select tests.anonyme();
select is(public.page_publique(tests.id('A'), 'a-propos') ->> 'titre_fr', 'À propos', 'publiée : la vitrine la lit');
select is(public.page_publique(tests.id('A'), 'questions') ->> 'genre', 'questions', 'avec son genre (l''accordéon)');
select is(jsonb_array_length(public.boutique_publique('essai-a') -> 'pages'), 2, 'le cadre de la vitrine porte ses deux pages publiées');
select is(public.page_publique(tests.id('B'), 'a-propos'), null, 'la page d''une boutique ne se lit pas chez une autre');
select is((select count(*)::int from public.pages_boutique), 0, 'un visiteur ne lit pas la table des pages');

reset role; select tests.connecte('lecture_a');
select is(jsonb_array_length(public.gestion_pages(tests.id('A'))), 2, 'la lecture voit les pages au backoffice');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_pages(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne les voit pas');

-- L'ordre des pages
reset role;
create temp table ordre_a on commit drop as
  select array_agg(p.id order by p.position desc) as inverse, (array_agg(p.id order by p.position))[1:1] as tronque
    from public.pages_boutique p where p.boutique_id = tests.id('A');
grant select on ordre_a to authenticated;
reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_ordonner_pages(%L, %L) $$, tests.id('A'), (select inverse from ordre_a)),
  '42501', null, 'la préparation ne range pas les pages');
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_ordonner_pages(%L, %L) $$, tests.id('A'), (select tronque from ordre_a))),
  'ordre', 'une liste qui n''est plus celle de la base (une page en moins) est refusée');
select lives_ok(format($$ select public.gestion_ordonner_pages(%L, %L) $$, tests.id('A'), (select inverse from ordre_a)),
  'le propriétaire met les questions fréquentes en premier');
select is(public.boutique_publique('essai-a') #>> '{pages,0,slug}', 'questions', 'le pied de page suit le nouvel ordre');
select is((select version from public.pages_boutique where id = (select (r ->> 'id')::uuid from page_a)), 2,
  'ranger ne change pas la version : un collègue qui écrit la page n''est pas dérangé');

reset role; select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_retirer_page(%L, %L) $$, tests.id('A'), (select r ->> 'id' from page_a)),
  'le propriétaire retire « À propos »');
reset role;
select is(public.page_publique(tests.id('A'), 'a-propos'), null, 'retirée : la vitrine ne la sert plus');
select ok(exists (select 1 from plateforme.journal_audit j where j.boutique_id = tests.id('A') and j.action = 'page.retirer'),
  'le retrait est au journal');

-- Le cadre de la boutique, pour son équipe, même fermée au public
reset role;
update plateforme.boutiques set statut = 'en_preparation' where id = tests.id('A');
reset role; select tests.anonyme();
select is(public.boutique_publique('essai-a'), null, 'en préparation : la vitrine ne sert pas la boutique');
reset role; select tests.connecte('prepa_a');
select is(public.gestion_cadre(tests.id('A')) #>> '{boutique,slug}', 'essai-a',
  'son équipe lit pourtant son cadre (les modèles de pages en sont composés)');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_cadre(%L) $$, tests.id('A')), '42501', null, 'l''équipe d''une autre boutique, non');
reset role;
update plateforme.boutiques set statut = 'active' where id = tests.id('A');

-- ---------------------------------------------------------------------
-- Suivre une commande sans compte
-- ---------------------------------------------------------------------
create temp table la_commande on commit drop as
  select c.numero, c.statut::text as statut from public.commandes c where c.id = tests.id('commande_a');
grant select on la_commande to anon;

reset role; select tests.anonyme();
select is(public.suivre_commande(tests.id('A'), (select numero from la_commande), '20 000 001') ->> 'numero', (select numero from la_commande),
  'un visiteur suit sa commande : son numéro et le téléphone qui l''a passée');
select is(public.suivre_commande(tests.id('A'), lower(replace((select numero from la_commande), '-', '')), '+216 20 000 001') ->> 'statut',
  (select statut from la_commande), 'le numéro se tape sans tirets ni majuscules');
select ok(not (public.suivre_commande(tests.id('A'), (select numero from la_commande), '20000001') ?| array['contact', 'adresse', 'livraison_adresse']),
  'la réponse ne dit ni le nom ni l''adresse');
select is(public.suivre_commande(tests.id('A'), (select numero from la_commande), '20 999 999'), null,
  'un autre téléphone : rien (sans dire lequel des deux est faux)');
select is(public.suivre_commande(tests.id('B'), (select numero from la_commande), '20 000 001'), null,
  'le numéro d''une boutique ne se suit pas chez une autre');
select suivre_commande(tests.id('A'), (select numero from la_commande), t)
  from unnest(array['20 999 998', '20 999 997', '20 999 996', '20 999 995']) t;
select is(tests.indice(format($$ select public.suivre_commande(%L, %L, '20 000 001') $$, tests.id('A'), (select numero from la_commande))),
  'essais', 'cinq essais manqués sur un numéro dans l''heure : le suivi attend, même avec le bon téléphone');

select * from finish();
rollback;
