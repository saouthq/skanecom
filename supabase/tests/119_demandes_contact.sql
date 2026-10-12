-- =====================================================================
-- 119 · Le formulaire de contact de la vitrine : la demande, l'équipe
-- =====================================================================
begin;
\ir outils.psql

select plan(42);

-- La demande part du serveur de la vitrine (clé service_role), jamais du navigateur.
create function tests.ecrit(p_nom text default 'Salma Ben Youssef', p_tel text default '22 334 455', p_email text default null,
                            p_message text default 'Un appartement à repenser avant l''été.', p_sujet text default null,
                            p_produit text default null, p_empreinte text default 'poste-1', p_boutique text default 'A')
returns jsonb language sql as $$
  select public.contact_envoyer(tests.id(p_boutique), p_nom, p_tel, p_email, p_sujet, p_message, p_produit, '/contact', p_empreinte)
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- La demande
-- ---------------------------------------------------------------------
select tests.anonyme();
select throws_ok($$ select tests.ecrit() $$, '42501', null, 'un visiteur n''appelle pas la fonction lui-même');
reset role; select tests.connecte('client_a');
select throws_ok($$ select tests.ecrit() $$, '42501', null, 'un client connecté non plus');

reset role; select tests.service();
select throws_like($$ select tests.ecrit() $$, '%ne prend pas de demande par formulaire%', 'formulaire coupé (par défaut) : refusé');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'vitrine.formulaire_contact', 'true'),
  (tests.id('A'), 'vitrine.contact_sujets', to_jsonb(E'Appartement ou villa\nCuisine\n\nBureaux'::text)),
  (tests.id('B'), 'vitrine.formulaire_contact', 'true');
select throws_like(format($$ update public.reglages set valeur = %L where boutique_id = %L and cle = 'vitrine.contact_sujets' $$,
    to_jsonb(E'a\nb\nc\nd\ne\nf\ng'::text), tests.id('A')),
  '%Six objets au plus%', 'sept objets : refusé');

select tests.service();
select throws_like($$ select tests.ecrit(p_nom => ' ') $$, '%Votre nom%', 'sans nom : refusé');
select throws_like($$ select tests.ecrit(p_nom => repeat('a', 81)) $$, '%80 caractères au plus%', 'un nom trop long : refusé');
select throws_like($$ select tests.ecrit(p_tel => '22 33') $$, '%numéro est illisible%', 'un numéro illisible : refusé');
select throws_like($$ select tests.ecrit(p_tel => null, p_email => 'salma@exemple') $$, '%adresse e-mail est illisible%', 'une adresse illisible : refusée');
select throws_like($$ select tests.ecrit(p_tel => null) $$, '%un numéro ou une adresse e-mail%', 'ni numéro ni adresse : refusé');
select throws_like($$ select tests.ecrit(p_message => 'Bonjour') $$, '%un peu plus%', 'un message trop court : refusé');
select throws_like($$ select tests.ecrit(p_message => repeat('x', 2001)) $$, '%trop long%', 'un message trop long : refusé');
select throws_like($$ select tests.ecrit(p_sujet => 'Yacht') $$, '%dans la liste%', 'un objet hors des choix de la boutique : refusé');

select is((select concat_ws(' · ', r ->> 'numero', r ->> 'produit') from (select tests.ecrit(p_sujet => 'Cuisine', p_produit => 'valise-cabine') r) x),
  'DEM-00001 · Valise cabine', 'la demande reçoit son numéro, et le nom de la fiche d''où l''on écrit (pour l''e-mail)');
select is((select jsonb_agg(e order by e) from jsonb_array_elements_text(tests.ecrit(p_tel => '0033 6 12 00 02 02', p_email => ' Karim@Exemple.fr ',
            p_produit => 'brouillon') -> 'equipe') e),
  jsonb_build_array('multi@tests.skanecom.local', 'proprio_a@tests.skanecom.local'),
  'la réponse nomme le propriétaire et les administrateurs, pour l''e-mail');
select is(tests.ecrit(p_boutique => 'B') ->> 'numero', 'DEM-00001', 'chaque boutique a sa propre suite de numéros');

reset role;
select results_eq($$ select numero, telephone, email, sujet, produit_slug, produit_nom from public.demandes_contact
                     where boutique_id = tests.id('A') order by rang $$,
  $$ values ('DEM-00001', '+21622334455', null::text, 'Cuisine', 'valise-cabine', 'Valise cabine'),
            ('DEM-00002', '+33612000202', 'karim@exemple.fr', null, null, null) $$,
  'le numéro mis au format international, l''adresse en minuscules, la fiche publiée seule retenue');
select ok((select empreinte is not null from public.demandes_contact where boutique_id = tests.id('A') and numero = 'DEM-00001'),
  'l''empreinte du poste est gardée (hachée), pour la limite d''envois');

-- Cinq envois par heure d'un même poste.
select tests.service();
select lives_ok($$ select tests.ecrit(), tests.ecrit(), tests.ecrit() $$, 'trois de plus depuis le même poste');
select throws_like($$ select tests.ecrit() $$, '%Plusieurs demandes sont déjà parties%', 'le sixième depuis le même poste : refusé');
select is(tests.ecrit(p_empreinte => 'poste-2') ->> 'numero', 'DEM-00006', 'un autre poste écrit encore');

-- ---------------------------------------------------------------------
-- Ce que chacun lit
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select is((select count(*)::int from public.demandes_contact), 0, 'un visiteur ne lit rien (RLS)');
reset role; select tests.connecte('client_a');
select is((select count(*)::int from public.demandes_contact), 0, 'un client ne lit rien (RLS)');
reset role; select tests.connecte('proprio_b');
select is((select count(*)::int from public.demandes_contact), 1, 'l''équipe de B ne lit que la sienne');
select throws_like(format($$ select public.gestion_liste_demandes(%L, 'nouvelles', 30, 0) $$, tests.id('A')),
  '%réservée à l''équipe%', 'ni la liste d''une autre boutique');
reset role; select tests.connecte('lecture_a');
select is((select count(*)::int from public.demandes_contact), 6, 'l''équipe de A lit les siennes');
select throws_ok(format($$ insert into public.demandes_contact (boutique_id, rang, numero, nom, telephone, message)
                           values (%L, 99, 'DEM-00099', 'Faux', '+21622000000', 'Écrite par la console') $$, tests.id('A')),
  '42501', null, 'personne n''écrit dans la table directement');

-- ---------------------------------------------------------------------
-- L'équipe
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select is(public.gestion_demandes_etat(tests.id('A')),
  '{"actif": true, "site_vitrine": false, "nouvelles": 6, "total": 6}'::jsonb, 'l''état, pour la navigation');
select is((select (x ->> 'precedentes')::int from jsonb_array_elements(public.gestion_liste_demandes(tests.id('A'), 'nouvelles', 30, 0) -> 'demandes') x
            where x ->> 'numero' = 'DEM-00005'),
  3, 'une personne qui a déjà écrit (DEM-00001, 03, 04 ; pas la 02, d''un autre numéro) : ses demandes se comptent');
select is((public.gestion_liste_demandes(tests.id('A'), 'nouvelles', 30, 0) #>> '{demandes,0,numero}'), 'DEM-00001', 'la plus ancienne en haut');

select is(public.gestion_avancer_demande(tests.id('A'), 'DEM-00001', 'nouvelle', 'en_cours') ->> 'statut', 'en_cours', 'je m''en occupe');
select throws_like(format($$ select public.gestion_avancer_demande(%L, 'DEM-00001', 'nouvelle', 'traitee') $$, tests.id('A')),
  '%a changé entre-temps%', 'un geste sur une demande qui a changé : refusé, pas rejoué');
select lives_ok(format($$ select public.gestion_avancer_demande(%L, 'DEM-00001', 'en_cours', 'en_cours', 'Visite fixée jeudi') $$, tests.id('A')),
  'une note, sans changer d''étape');
select throws_like(format($$ select public.gestion_avancer_demande(%L, 'DEM-00001', 'en_cours', 'nouvelle') $$, tests.id('A')),
  '%reprend « en cours »%', 'une demande ne redevient pas « nouvelle »');
select lives_ok(format($$ select public.gestion_avancer_demande(%L, 'DEM-00001', 'en_cours', 'traitee') $$, tests.id('A')), 'traitée');
reset role;
select results_eq($$ select statut, note, traitee_at is not null from public.demandes_contact where boutique_id = tests.id('A') and numero = 'DEM-00001' $$,
  $$ values ('traitee', 'Visite fixée jeudi', true) $$, 'traitée, la note gardée, l''heure notée');
select tests.connecte('confirm_a');
select lives_ok(format($$ select public.gestion_avancer_demande(%L, 'DEM-00001', 'traitee', 'en_cours') $$, tests.id('A')), 'rouverte');
reset role;
select is((select traitee_at from public.demandes_contact where boutique_id = tests.id('A') and numero = 'DEM-00001'), null, 'rouverte : plus d''heure de fin');

select tests.connecte('lecture_a');
select throws_like(format($$ select public.gestion_avancer_demande(%L, 'DEM-00002', 'nouvelle', 'en_cours') $$, tests.id('A')),
  '%réservée à l''équipe%', 'en lecture seule : aucun geste');
reset role; select tests.connecte('confirm_a');
select throws_like(format($$ select public.gestion_retirer_demande(%L, 'DEM-00002') $$, tests.id('A')),
  '%réservée à l''équipe%', 'effacer : la direction seule');
reset role; select tests.connecte('proprio_a');
select lives_ok(format($$ select public.gestion_retirer_demande(%L, 'DEM-00002') $$, tests.id('A')), 'le propriétaire efface une demande');
select throws_like(format($$ select public.gestion_retirer_demande(%L, 'DEM-00002') $$, tests.id('A')),
  '%introuvable%', 'effacée : elle n''existe plus');

-- Une demande reste à sa boutique.
reset role;
select throws_ok(format($$ update public.demandes_contact set boutique_id = %L where boutique_id = %L and numero = 'DEM-00001' $$, tests.id('B'), tests.id('A')),
  null, null, 'une demande ne change pas de boutique');

select * from finish();
rollback;
