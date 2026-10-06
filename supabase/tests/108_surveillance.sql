-- =====================================================================
-- 108 · La surveillance, chaque heure
-- =====================================================================
begin;
\ir outils.psql

select plan(13);

reset role;
-- Un domaine de A en ligne, une boutique ouverte.
update plateforme.boutiques set statut = 'active' where id = tests.id('A');
insert into plateforme.domaines (hote, boutique_id, type, principal)
values ('surveillance-a.essai.tn', tests.id('A'), 'personnalise', false)
on conflict (hote) do nothing;
-- Un e-mail de commande coincé depuis une heure.
insert into public.courriels_commandes (boutique_id, commande_id, evenement, etat, prochain_essai, essais)
select tests.id('A'), c.id, 'recue', 'a_envoyer', now() - interval '1 hour', 3
  from public.commandes c where c.boutique_id = tests.id('A') limit 1;

select tests.service();
select ok(exists (select 1 from jsonb_array_elements(public.surveillance_a_verifier() -> 'hotes') h
                  where h ->> 'hote' = 'surveillance-a.essai.tn'), 'à vérifier : les hôtes des boutiques ouvertes');

-- Le passage de l'heure (sans personne) : une vitrine en panne, une qui répond.
select is((public.surveillance_noter(null, 'heure', now(), jsonb_build_array(
    jsonb_build_object('genre', 'page', 'boutique_id', tests.id('A'), 'cible', 'surveillance-a.essai.tn', 'ok', false,
                       'detail', 'Certificat expiré', 'certificat', true),
    jsonb_build_object('genre', 'page', 'boutique_id', tests.id('A'), 'cible', 'autre.essai.tn', 'ok', true, 'duree_ms', 420, 'statut_http', 200)
  )) ->> 'defauts')::int >= 2, true, 'une vitrine en panne et un e-mail coincé : deux défauts au moins');
reset role;
select is((select statut_certificat::text from plateforme.domaines where hote = 'surveillance-a.essai.tn'), 'erreur',
  'une erreur de certificat le dit sur le domaine');
select is((select pannes from plateforme.surveillance_passages order by id desc limit 1), 1,
  'parmi les défauts, une vitrine en panne (le plus grave)');
select ok(exists (select 1 from plateforme.surveillance_releves r join plateforme.surveillance_passages p on p.id = r.passage_id
                  where p.declencheur = 'heure' and r.genre = 'courriels' and r.boutique_id = tests.id('A') and not r.ok),
  'la base compte d''elle-même la file des e-mails coincés');

-- Elle répond de nouveau : le certificat revient.
select tests.service();
select public.surveillance_noter(null, 'heure', now(), jsonb_build_array(
  jsonb_build_object('genre', 'page', 'boutique_id', tests.id('A'), 'cible', 'surveillance-a.essai.tn', 'ok', true, 'duree_ms', 3500, 'lent', true)));
reset role;
select is((select statut_certificat::text from plateforme.domaines where hote = 'surveillance-a.essai.tn'), 'actif',
  'la vitrine s''ouvre de nouveau : son certificat est actif');

-- Un domaine d'envoi qui n'est plus vérifié chez le fournisseur s'éteint.
insert into plateforme.courriels_boutique (boutique_id, domaine, statut, domaine_actif, ref_fournisseur, verifie_le)
values (tests.id('A'), 'envoi-surveillance.tn', 'verifie', true, 'dom_essai', now())
on conflict (boutique_id) do update set domaine = excluded.domaine, statut = 'verifie', domaine_actif = true, ref_fournisseur = 'dom_essai',
  derniere_verif = null, verifie_le = now();
select tests.service();
select ok(exists (select 1 from jsonb_array_elements(public.surveillance_a_verifier() -> 'domaines_envoi') d
                  where d ->> 'domaine' = 'envoi-surveillance.tn'), 'à vérifier : le domaine d''envoi pas vérifié depuis un jour');
select public.surveillance_noter(null, 'heure', now(), jsonb_build_array(
  jsonb_build_object('genre', 'domaine_envoi', 'boutique_id', tests.id('A'), 'cible', 'envoi-surveillance.tn', 'ok', false, 'statut', 'echec')));
reset role;
select is((select statut || ' ' || domaine_actif from plateforme.courriels_boutique where boutique_id = tests.id('A')), 'echec false',
  'vérification perdue : le domaine d''envoi s''éteint (l''e-mail repart de la plateforme)');
select tests.service();
select ok(not exists (select 1 from jsonb_array_elements(public.surveillance_a_verifier() -> 'domaines_envoi') d
                      where d ->> 'domaine' = 'envoi-surveillance.tn'), 'et il n''est plus à vérifier avant un jour');

-- La console : le dernier passage, la disponibilité.
select tests.service();
select is((public.console_surveillance(tests.id('admin_plateforme')) #>> '{dernier,declencheur}'), 'heure', 'la console lit le dernier passage');
select ok(jsonb_array_length(public.console_surveillance(tests.id('admin_plateforme')) -> 'disponibilite') >= 1, 'et la disponibilité des vitrines sur 24 heures');
select throws_ok(format($$ select public.console_surveillance(%L) $$, tests.id('proprio_a')), '42501', null,
  'réservé aux administrateurs de la plateforme');
reset role;
select tests.anonyme();
select throws_ok($$ select public.surveillance_a_verifier() $$, '42501', null, 'personne d''autre n''y touche');

select * from finish();
rollback;
