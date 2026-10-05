-- =====================================================================
-- 101 · La console, lot E : l'état technique (la base, les envois, les
--       files, les domaines) et la vérification des certificats
-- =====================================================================
begin;
\ir outils.psql

select plan(14);

select tests.cree_utilisateur('support_plateforme');
insert into plateforme.administrateurs (user_id, role) values (tests.id('support_plateforme'), 'support');

select tests.service();
select throws_ok(format($$ select public.console_etat_technique(%L) $$, tests.id('proprio_a')),
  '42501', null, 'un propriétaire de boutique ne lit pas l''état technique');
reset role;

-- Un refus d'envoi, un e-mail de commande retenté, un envoi SkanFact refusé.
insert into plateforme.envois (canal, destinataire, expediteur, sujet, fournisseur, ok, raison)
values ('email', 'c•••@exemple.tn', 'Essai A', 'Votre code', 'resend', false, 'Resend : HTTP 422');
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'commande.courriels_client', 'true');
update public.commandes set statut = 'confirmee' where id = tests.id('commande_a');
update public.courriels_commandes set essais = 1, erreur = 'fournisseur indisponible' where commande_id = tests.id('commande_a');

select tests.service();
create temp table e as select public.console_etat_technique(tests.id('support_plateforme')) as j;
grant select on e to service_role;

select ok((select (j -> 'base' ->> 'taille')::bigint > 0 and (j -> 'base' ->> 'connexions_max')::int > 0 from e),
  'le support lit la base : sa taille, ses connexions');
select ok((select (j -> 'envois' ->> 'refuses')::int >= 1 from e), 'les refus d''envoi de la semaine');
select is((select j -> 'envois' -> 'dernier_refus' ->> 'raison' from e), 'Resend : HTTP 422', 'et la phrase du dernier');
select ok((select (j -> 'courriels_commandes' ->> 'en_retard')::int >= 1 from e), 'un e-mail de commande retenté compte « en retard »');
select is((select j -> 'courriels_commandes' ->> 'derniere_erreur' from e), 'fournisseur indisponible', 'avec sa dernière erreur');
select is((select jsonb_array_length(jsonb_path_query_array(j -> 'domaines', '$[*] ? (@.hote like_regex "^(www\\.)?essai-[ab]\\.test$")')) from e),
  3, 'les domaines des boutiques');
select is((select d ->> 'statut' from e, jsonb_array_elements(j -> 'domaines') d where d ->> 'hote' = 'essai-a.test'),
  'en_attente', 'jamais vérifié : en attente');

-- La vérification des certificats, notée par la console
select is(public.console_noter_certificats(tests.id('support_plateforme'),
  '[{"hote": "essai-a.test", "statut": "actif"},
    {"hote": "ESSAI-B.TEST ", "statut": "erreur", "erreur": "Nom de domaine introuvable (DNS)"},
    {"hote": "inconnu.test", "statut": "actif"},
    {"hote": "www.essai-a.test", "statut": "en_attente"}]'), 2,
  'deux domaines notés : un hôte inconnu, un statut inattendu ignorés');
reset role;
select is((select statut_certificat || ' ' || (certificat_verifie_le is not null)::text from plateforme.domaines where hote = 'essai-a.test'),
  'actif true', 'valable : actif, avec l''heure');
select is((select statut_certificat || ' ' || certificat_erreur from plateforme.domaines where hote = 'essai-b.test'),
  'erreur Nom de domaine introuvable (DNS)', 'en erreur : avec sa raison');
select is((select statut_certificat from plateforme.domaines where hote = 'www.essai-a.test'), 'en_attente', 'l''autre reste en attente');
select is((select apres from plateforme.journal_audit where action = 'domaine.certificats_verifies' and acteur = tests.id('support_plateforme') order by at desc limit 1),
  '{"actifs": 1, "verifies": 2, "en_erreur": 1}'::jsonb, 'tracé une fois au journal, avec le compte');

select tests.service();
select throws_ok(format($$ select public.console_noter_certificats(%L, '{"hote": "essai-a.test"}') $$, tests.id('support_plateforme')),
  '22023', null, 'des résultats qui ne sont pas une liste : refusés');

select * from finish();
rollback;
