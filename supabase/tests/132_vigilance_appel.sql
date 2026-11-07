-- =====================================================================
-- 132 · Ce qu'il faut savoir avant d'appeler : la note et la vigilance du client
-- =====================================================================
begin;
\ir outils.psql

select plan(8);

create function pg_temp.numero() returns text language sql as $$
  select numero from public.commandes where id = tests.id('commande_a')
$$;
create function pg_temp.client() returns jsonb language sql as $$
  select public.gestion_commande(tests.id('A'), pg_temp.numero()) -> 'client'
$$;

select tests.connecte('confirm_a');
select is(pg_temp.client() -> 'note', 'null'::jsonb, 'sans note sur sa fiche : rien');
select is(pg_temp.client() -> 'vigilance', 'null'::jsonb, 'client normal : pas de vigilance');

select public.gestion_note_client(tests.id('A'), tests.id('fiche_client_a'), 'Appeler après 18 h');
select public.gestion_confiance_client(tests.id('A'), tests.id('fiche_client_a'), 'surveille', 'Un premier motif');
select public.gestion_confiance_client(tests.id('A'), tests.id('fiche_client_a'), 'normal');
select public.gestion_confiance_client(tests.id('A'), tests.id('fiche_client_a'), 'surveille', 'Adresse floue, un refus ailleurs');

select is(pg_temp.client() ->> 'note', 'Appeler après 18 h', 'la note de sa fiche est sur la commande');
select is(pg_temp.client() -> 'vigilance' ->> 'motif', 'Adresse floue, un refus ailleurs', 'surveillé : le dernier motif de ce niveau');
select ok((pg_temp.client() -> 'vigilance' ->> 'auteur') is not null and (pg_temp.client() -> 'vigilance' ->> 'le') is not null,
  'qui l''a posé, et quand');

-- Le préparateur lit la commande : la note et la vigilance aussi (repère pour le livreur).
select tests.connecte('prepa_a');
select is(pg_temp.client() ->> 'note', 'Appeler après 18 h', 'le préparateur lit la note');

select tests.connecte('confirm_a');
select public.gestion_confiance_client(tests.id('A'), tests.id('fiche_client_a'), 'bloque', 'Trois colis refusés');
select is(pg_temp.client() -> 'vigilance' ->> 'motif', 'Trois colis refusés', 'bloqué : le motif du blocage, pas celui de la surveillance');
select public.gestion_confiance_client(tests.id('A'), tests.id('fiche_client_a'), 'normal');
select is(pg_temp.client() -> 'vigilance', 'null'::jsonb, 'revenu à la normale : plus de vigilance affichée');

select * from finish();
rollback;
