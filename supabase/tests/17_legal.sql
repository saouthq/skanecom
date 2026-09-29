-- =====================================================================
-- 17 · Pages légales : les réglages « legal.* » et le consentement
-- =====================================================================
begin;
\ir outils.psql

select plan(12);

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
grant execute on function tests.indice(text) to anon, authenticated;

insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock)
values (tests.nouvel_id('variante_a_verte'), tests.id('A'), tests.id('produit_a'), 'VAL-55-VERTE', '{"couleur": "Verte"}', 150000, 20);

-- ---------------------------------------------------------------------
-- Les réglages légaux (propriétaire, par le backoffice)
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_reglages(tests.id('A'),
  '{"legal.raison_sociale": "Maymar SARL", "legal.identifiant_rne": "1234567A", "legal.retractation_jours": 15, "legal.retour_frais": "boutique"}'), 4,
  'le propriétaire renseigne l''identité légale, 15 jours de rétractation, retour offert');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"legal.retractation_jours": 5}') $$, tests.id('A')),
  '%10 au moins%', 'moins de 10 jours ouvrables de rétractation : refusé (loi n° 2000-83)');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"legal.email": "contact@"}') $$, tests.id('A')),
  '%illisible%', 'une adresse électronique illisible est refusée');
select throws_like(format($$ select public.gestion_enregistrer_reglages(%L, '{"legal.retour_frais": "livreur"}') $$, tests.id('A')),
  '%Valeur invalide%', 'les frais de retour : le client ou la boutique');

reset role; select tests.anonyme();
select is(public.configuration_publique(tests.id('A')) -> 'reglages' ->> 'legal.raison_sociale', 'Maymar SARL',
  'la vitrine lit l''identité légale (publique par nature)');
select is((public.configuration_publique(tests.id('A')) -> 'reglages' ->> 'legal.retractation_jours')::int, 15,
  'et le délai de rétractation');
select is((public.configuration_publique(tests.id('B')) -> 'reglages' ->> 'legal.retractation_jours')::int, 10,
  'une boutique qui n''a rien réglé : 10 jours ouvrables');

-- ---------------------------------------------------------------------
-- Le consentement au moment de commander
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select is(tests.indice(format($$ select public.passer_commande(%L, 'essai-sans-accord-00001', %L, '{"nom": "Amel Ben Salah", "telephone": "20123456"}', %L, 156000) $$,
    tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a_verte'), 'quantite', 1)),
    '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}')),
  'conditions', 'sans l''accord explicite de l''acheteur, pas de commande');
select is(tests.indice(format($$ select public.passer_commande(%L, 'essai-accord-texte-001', %L, '{"nom": "Amel Ben Salah", "telephone": "20123456", "accepte_conditions": "oui"}', %L, 156000) $$,
    tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a_verte'), 'quantite', 1)),
    '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}')),
  'conditions', 'un « oui » écrit ne vaut pas une case cochée');
select lives_ok(format($$ select public.passer_commande(%L, 'essai-avec-accord-00001', %L, '{"nom": "Amel Ben Salah", "telephone": "20123456", "accepte_conditions": true}', %L, 156000) $$,
    tests.id('A'), jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a_verte'), 'quantite', 1)),
    '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}'),
  'avec l''accord, la commande passe');

reset role;
select is((select conditions_acceptees - 'le' from public.commandes where cle_idempotence = 'essai-avec-accord-00001'),
  '{"modele": "2026-09-29", "retractation_jours": 15, "retour_frais": "boutique"}'::jsonb,
  'la commande garde ce qui a été accepté : le modèle, le délai de rétractation, les frais de retour');
select ok((select (conditions_acceptees ->> 'le')::timestamptz <= now() from public.commandes where cle_idempotence = 'essai-avec-accord-00001'),
  'et quand');

select * from finish();
rollback;
