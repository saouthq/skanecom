-- =====================================================================
-- 16 · Les clients au backoffice
-- =====================================================================
begin;
\ir outils.psql

select plan(22);

-- Jeu d'essai (outils.psql) : dans A, Client A (compte, une commande, une
-- adresse), Client AB (compte, une commande), Invité (sans compte, sans
-- commande) ; Client AB a aussi une fiche dans B.

-- ---------------------------------------------------------------------
-- Portes
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select throws_ok(format($$ select public.gestion_liste_clients(%L) $$, tests.id('A')), '42501', null, 'un visiteur ne lit pas les clients');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_liste_clients(%L) $$, tests.id('A')), '42501', null, 'le propriétaire de B ne lit pas ceux de A');
select is(public.gestion_client(tests.id('B'), tests.id('fiche_client_a')::text), null,
  'la fiche d''un client de A n''existe pas depuis B, même avec son identifiant');

-- ---------------------------------------------------------------------
-- Lire (toute l'équipe)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('lecture_a');
select is((public.gestion_liste_clients(tests.id('A')) ->> 'total')::int, 3, 'la lecture voit les trois clients de A');
select is(public.gestion_liste_clients(tests.id('A')) -> 'compteurs',
  '{"tous": 3, "fideles": 0, "refus": 0, "surveilles": 0, "bloques": 0}'::jsonb, 'avec les compteurs de chaque filtre');
select is((public.gestion_liste_clients(tests.id('A'), 'tous', '20 000 003') -> 'clients' -> 0 ->> 'nom'), 'Invité',
  'la recherche trouve par numéro, espaces compris');
select is((public.gestion_liste_clients(tests.id('A'), 'tous', 'client ab') ->> 'total')::int, 1, 'et par nom');
select is(public.gestion_liste_clients(tests.id('A')) -> 'clients' -> 2 ->> 'nom', 'Invité',
  'les clients sans commande viennent en dernier');
select throws_ok(format($$ select public.gestion_liste_clients(%L, 'vip') $$, tests.id('A')), '23514', null, 'un filtre inconnu est refusé');

select is(public.gestion_client(tests.id('A'), tests.id('fiche_client_a')::text) ->> 'nom', 'Client A', 'la fiche, par son identifiant');
select is(public.gestion_client(tests.id('A'), '20000001') ->> 'id', tests.id('fiche_client_a')::text,
  'ou par son numéro, depuis une commande');
select is(jsonb_array_length(public.gestion_client(tests.id('A'), tests.id('fiche_client_a')::text) -> 'commandes'), 1, 'avec ses commandes');
select is(public.gestion_client(tests.id('A'), tests.id('fiche_client_a')::text) -> 'adresses' -> 0 ->> 'ligne1', '1 rue de Rome',
  'et son carnet d''adresses');
select throws_ok(format($$ select public.gestion_confiance_client(%L, %L, 'bloque', 'Test') $$, tests.id('A'), tests.id('fiche_invite_a')),
  '42501', null, 'la lecture seule ne bloque personne');

-- ---------------------------------------------------------------------
-- La confiance (propriétaire, admin, confirmation)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_confiance_client(%L, %L, 'bloque', 'Test') $$, tests.id('A'), tests.id('fiche_invite_a')),
  '42501', null, 'la préparation non plus');
reset role; select tests.connecte('confirm_a');
select throws_like(format($$ select public.gestion_confiance_client(%L, %L, 'bloque') $$, tests.id('A'), tests.id('fiche_invite_a')),
  '%Dites pourquoi%', 'bloquer sans dire pourquoi est refusé');
select lives_ok(format($$ select public.gestion_confiance_client(%L, %L, 'bloque', ' Trois refus à la porte ') $$, tests.id('A'), tests.id('fiche_invite_a')),
  'la confirmation bloque un client, motif à l''appui');
select is((public.gestion_liste_clients(tests.id('A'), 'bloques') -> 'clients' -> 0 ->> 'nom'), 'Invité', 'il est dans les bloqués');
select is(public.gestion_client(tests.id('A'), tests.id('fiche_invite_a')::text) -> 'journal' -> 0 -> 'apres',
  '{"niveau": "bloque", "motif": "Trois refus à la porte"}'::jsonb, 'le blocage et son motif passent au journal');
update public.clients set nb_refus = 0, niveau_risque = 'normal' where id = tests.id('fiche_invite_a');
reset role;
select is((select niveau_risque from public.clients where id = tests.id('fiche_invite_a')), 'bloque',
  'un UPDATE direct de l''API ne débloque pas (ni ne remet les refus à zéro)');
select tests.connecte('confirm_a');
select lives_ok(format($$ select public.gestion_confiance_client(%L, %L, 'normal') $$, tests.id('A'), tests.id('fiche_invite_a')),
  'le rétablir se fait sans motif');
select lives_ok(format($$ select public.gestion_note_client(%L, %L, 'Préfère être appelé après 18 h') $$, tests.id('A'), tests.id('fiche_client_a')),
  'une note interne');

select * from finish();
rollback;
