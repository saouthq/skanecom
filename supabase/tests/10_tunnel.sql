-- =====================================================================
-- 10 · Tunnel de commande : devis, commande en paiement à la livraison,
-- rejeu, compte ou invité, garde-fous, suivi par jeton
-- =====================================================================
begin;
\ir outils.psql

select plan(52);

-- ---------------------------------------------------------------------
-- Outils du fichier
-- ---------------------------------------------------------------------
create table tests.resultats (nom text primary key, r jsonb not null);
grant insert, select on tests.resultats to anon, authenticated, service_role;

create function tests.panier(p_variante uuid, p_quantite integer) returns jsonb
language sql as $$ select jsonb_build_array(jsonb_build_object('variante_id', p_variante, 'quantite', p_quantite)) $$;

-- (l'acheteur a coché « j'accepte les conditions de vente » : migration 15)
create function tests.contact(p_telephone text) returns jsonb
language sql as $$ select jsonb_build_object('nom', 'Amel Ben Salah', 'telephone', p_telephone, 'accepte_conditions', true) $$;

create function tests.adresse(p_gouvernorat text default 'tunis') returns jsonb
language sql as $$ select jsonb_build_object('ligne1', '12 rue de Marseille', 'ville', 'Tunis', 'gouvernorat', p_gouvernorat) $$;

-- L'indice (HINT) d'un refus, ou NULL si la requête passe. Ses effets sont
-- toujours annulés : le bloc d'exception est une sous-transaction, qu'une
-- exception finale défait aussi quand la requête a réussi.
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

create function tests.commande(p_nom text, p_boutique uuid, p_cle text, p_lignes jsonb, p_contact jsonb,
                               p_adresse jsonb, p_total bigint) returns void
language sql as $$
  insert into tests.resultats (nom, r)
  select p_nom, public.passer_commande(p_boutique, p_cle, p_lignes, p_contact, p_adresse, p_total)
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

create temp view annee as
  select extract(year from now() at time zone 'Africa/Tunis')::int::text as a;
grant select on annee to anon, authenticated;

-- Une variante bien approvisionnée pour les commandes en invité.
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock)
values (tests.nouvel_id('variante_a_rouge'), tests.id('A'), tests.id('produit_a'), 'VAL-55-ROUGE', '{"couleur": "Rouge"}', 150000, 50);


-- ---------------------------------------------------------------------
-- Numéros de téléphone
-- ---------------------------------------------------------------------
select results_eq(
  $$ select private.telephone_tunisien(x) from unnest(array['20 123 456', '+216 20 123 456', '00216 20123456', '216-98-765-432']) x $$,
  $$ values ('+21620123456'), ('+21620123456'), ('+21620123456'), ('+21698765432') $$,
  'un numéro tunisien est reconnu sous ses écritures courantes');
select is_empty(
  $$ select x from unnest(array['12345678', '2012345', '201234567', '+33 6 12 34 56 78', '']) x
     where private.telephone_tunisien(x) is not null $$,
  'un numéro incomplet, étranger ou d''un préfixe inconnu est refusé');


-- ---------------------------------------------------------------------
-- Devis (le visiteur de la vitrine)
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();

select is((public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 2), 'tunis') ->> 'total_millimes')::bigint,
  384000::bigint, 'le devis relit le prix en base : 2 × 189,000 + 6,000 de la zone Grand Tunis');
select ok((
  with d as (select public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 2), 'tunis') -> 'lignes' -> 0 as l)
  select l ->> 'produit_nom' = 'Valise cabine' and l ->> 'variante_libelle' = 'Noir' and l ->> 'sku' = 'VAL-55-NOIR'
     and l ->> 'image' = 'essai-a/valise-noire.webp' and (l ->> 'disponible')::boolean
  from d), 'chaque ligne porte le nom, la déclinaison, la référence et la vignette lus en base');
select ok((
  with d as (select public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 2)) as r)
  select r ->> 'total_millimes' is null and r ->> 'frais_livraison_millimes' is null
     and (r ->> 'sous_total_millimes')::bigint = 378000 from d),
  'sans gouvernorat, le devis donne le sous-total et ne devine pas les frais');
select ok((
  with d as (select public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_b'), 1), 'tunis') as r)
  select not (r ->> 'complet')::boolean and not (r -> 'lignes' -> 0 ->> 'disponible')::boolean
     and r -> 'lignes' -> 0 ->> 'produit_nom' is null and r -> 'lignes' -> 0 ->> 'sku' is null from d),
  'une variante d''une autre boutique est indisponible, et le devis n''en dit rien');
select ok((
  with d as (select public.devis_commande(tests.id('A'),
               jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a_brouillon'), 'quantite', 1),
                                 jsonb_build_object('variante_id', tests.id('variante_a_inactive'), 'quantite', 1)), 'tunis') as r)
  select not (r ->> 'complet')::boolean
     and not exists (select 1 from jsonb_array_elements(r -> 'lignes') l
                     where (l ->> 'disponible')::boolean or l ->> 'produit_nom' is not null) from d),
  'un brouillon et une variante désactivée sont indisponibles, sans fuite de leur nom');
select ok((
  with d as (select public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 5), 'tunis') as r)
  select not (r ->> 'complet')::boolean and (r -> 'lignes' -> 0 ->> 'quantite_disponible')::int = 3 from d),
  'au-delà du stock, le devis dit ce qui reste (3) et le panier n''est pas complet');
select is((
  select jsonb_array_length(r -> 'lignes') || '×' || (r -> 'lignes' -> 0 ->> 'quantite')
  from (select public.devis_commande(tests.id('A'),
          jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1),
                            jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1))) as r) d),
  '1×2', 'une variante envoyée deux fois devient une ligne de 2 pièces');

select is(
  (select array_agg(tests.indice(format('select public.devis_commande(%L, %L)', tests.id('A'), x)) order by n)
   from unnest(array[
     '[]',
     '{"variante_id": "x"}',
     '[{"variante_id": "pas-un-uuid", "quantite": 1}]',
     format('[{"variante_id": "%s", "quantite": 0}]', tests.id('variante_a')),
     format('[{"variante_id": "%s", "quantite": 1000}]', tests.id('variante_a')),
     format('[{"variante_id": "%s", "quantite": 2.5}]', tests.id('variante_a')),
     format('[{"variante_id": "%s", "quantite": "2"}]', tests.id('variante_a')),
     format('[{"variante_id": "%1$s", "quantite": 600}, {"variante_id": "%1$s", "quantite": 600}]', tests.id('variante_a'))
   ]) with ordinality as t(x, n)),
  array['panier', 'panier', 'panier', 'panier', 'panier', 'panier', 'panier', 'panier'],
  'un panier vide, illisible, à quantité nulle, fractionnaire, en texte ou au-delà de 999 pièces est refusé');
select is(tests.indice(format('select public.devis_commande(%L, (select jsonb_agg(jsonb_build_object(''variante_id'', gen_random_uuid(), ''quantite'', 1)) from generate_series(1, 51)))', tests.id('A'))),
  'panier', 'un panier de plus de 50 lignes est refusé');
select is(tests.indice(format('select public.devis_commande(%L, %L, %L)', tests.id('A'), tests.panier(tests.id('variante_a'), 1), 'atlantide')),
  'adresse', 'un gouvernorat inconnu est refusé');
select is(tests.indice(format('select public.devis_commande(%L, %L, %L)', tests.id('C'), tests.panier(tests.id('variante_c'), 1), 'tunis')),
  'boutique', 'une boutique suspendue ne chiffre rien');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'livraison.seuil_gratuite_millimes', '300000');
select tests.anonyme();
select ok((
  with d as (select public.devis_commande(tests.id('A'), tests.panier(tests.id('variante_a'), 2), 'tunis') as r)
  select (r ->> 'frais_livraison_millimes')::bigint = 0 and (r ->> 'total_millimes')::bigint = 378000
     and (r ->> 'seuil_gratuite_millimes')::bigint = 300000 from d),
  'au-dessus du seuil de la boutique, la livraison est offerte dans le devis');
reset role;
delete from public.reglages where boutique_id = tests.id('A') and cle = 'livraison.seuil_gratuite_millimes';


-- ---------------------------------------------------------------------
-- Compte obligatoire (réglage par défaut)
-- ---------------------------------------------------------------------
select tests.anonyme();
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 384000)',
    tests.id('A'), 'essai-cle-anonyme-000001', tests.panier(tests.id('variante_a'), 2), tests.contact('20 123 456'), tests.adresse())),
  'compte', 'par défaut, un visiteur sans compte ne commande pas : il se connecte');


-- ---------------------------------------------------------------------
-- Une commande passée par un client connecté
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');

select lives_ok(
  format($$ select tests.commande('c1', %L, 'essai-cle-client-a-000001', %L, %L, %L, 384000) $$,
    tests.id('A'), tests.panier(tests.id('variante_a'), 2), tests.contact('20 123 456'), tests.adresse()),
  'un client connecté passe commande');
select is((select r ->> 'numero' || ' ' || (r ->> 'statut') || ' ' || (r ->> 'rejouee') from tests.resultats where nom = 'c1'),
  (select 'MAY-' || a || '-00003 recue false' from annee),
  'la commande prend le numéro suivant de la boutique et attend l''appel de confirmation');

reset role;
select results_eq(
  $$ select sous_total_millimes, frais_livraison_millimes, total_millimes, contact_telephone, livraison_zone_nom,
            client_id, origine::text, mode_paiement::text
     from public.commandes where cle_idempotence = 'essai-cle-client-a-000001' $$,
  format($$ values (378000::bigint, 6000::bigint, 384000::bigint, '+21620123456'::text, 'Grand Tunis'::text, %L::uuid, 'vitrine'::text, 'cod'::text) $$,
    tests.id('fiche_client_a')),
  'montants recalculés, numéro normalisé, zone et fiche client de la boutique');
select results_eq(
  $$ select produit_nom, variante_libelle, sku, prix_unitaire_millimes, quantite, total_ligne_millimes
     from public.commande_lignes l join public.commandes c on c.id = l.commande_id
     where c.cle_idempotence = 'essai-cle-client-a-000001' $$,
  $$ values ('Valise cabine'::text, 'Noir'::text, 'VAL-55-NOIR'::text, 189000::bigint, 2, 378000::bigint) $$,
  'la ligne fige le nom, la déclinaison, la référence et le prix');
select is((select stock from public.variantes where id = tests.id('variante_a')), 1,
  'la commande réserve ses 2 pièces (3 → 1)');
select ok((
  select count(*) = 1 and bool_and(m.auteur_id is null and m.delta = -2)
  from public.stock_mouvements m join public.commandes c on c.id = m.commande_id
  where c.cle_idempotence = 'essai-cle-client-a-000001' and m.motif = 'vente'),
  'le journal du stock trace la vente, comme un geste du système');
select ok((
  select count(*) = 1 and bool_and(e.auteur_id is null and e.statut_apres = 'recue')
  from public.commande_evenements e join public.commandes c on c.id = e.commande_id
  where c.cle_idempotence = 'essai-cle-client-a-000001'),
  'l''historique de la commande commence sans auteur : l''acheteur n''entre pas dans les journaux de l''équipe');
select is((select nb_commandes from public.clients where id = tests.id('fiche_client_a')), 2,
  'la fiche client compte la nouvelle commande');
select ok((
  select count(*) = 1 and not bool_or(par_defaut) from public.adresses
  where client_id = tests.id('fiche_client_a') and ligne1 = '12 rue de Marseille'),
  'l''adresse entre au carnet du client, sans remplacer son adresse par défaut');

select tests.anonyme();
select ok((
  with s as (select public.commande_suivie(tests.id('A'), r ->> 'numero', r ->> 'jeton') as x from tests.resultats where nom = 'c1')
  select x ->> 'numero' = (select r ->> 'numero' from tests.resultats where nom = 'c1')
     and (x ->> 'total_millimes')::bigint = 384000 and jsonb_array_length(x -> 'lignes') = 1
     and x -> 'livraison' ->> 'gouvernorat' = 'Tunis' and not x ? 'note_interne' from s),
  'avec son jeton, l''acheteur revoit sa commande, sans les notes de l''équipe');
select ok((
  select public.commande_suivie(tests.id('A'), r ->> 'numero', repeat('0', 64)) is null
     and public.commande_suivie(tests.id('B'), r ->> 'numero', r ->> 'jeton') is null
     and public.commande_suivie(tests.id('A'), r ->> 'numero', null) is null
  from tests.resultats where nom = 'c1'),
  'sans le bon jeton, ou dans une autre boutique, la commande reste invisible');


-- ---------------------------------------------------------------------
-- Rejeu : la même clé rend la même commande
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select lives_ok(
  format($$ select tests.commande('c1-rejeu', %L, 'essai-cle-client-a-000001', %L, %L, %L, 384000) $$,
    tests.id('A'), tests.panier(tests.id('variante_a'), 2), tests.contact('+216 20 123 456'), tests.adresse()),
  'la même commande renvoyée (double clic, réseau coupé) ne lève pas d''erreur');
reset role;
select ok((
  select (r ->> 'rejouee')::boolean and r ->> 'numero' = (select r ->> 'numero' from tests.resultats where nom = 'c1')
  from tests.resultats where nom = 'c1-rejeu')
  and (select count(*) from public.commandes where cle_idempotence = 'essai-cle-client-a-000001') = 1
  and (select stock from public.variantes where id = tests.id('variante_a')) = 1,
  'elle rend la même commande : pas de deuxième commande, pas de deuxième réservation');
select ok(
  public.commande_suivie(tests.id('A'), (select r ->> 'numero' from tests.resultats where nom = 'c1'),
                         (select r ->> 'jeton' from tests.resultats where nom = 'c1-rejeu')) is not null
  and public.commande_suivie(tests.id('A'), (select r ->> 'numero' from tests.resultats where nom = 'c1'),
                             (select r ->> 'jeton' from tests.resultats where nom = 'c1')) is null,
  'le rejeu remet un nouveau jeton de suivi, l''ancien ne sert plus');
select tests.connecte('client_a');
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 384000)',
    tests.id('A'), 'essai-cle-client-a-000001', tests.panier(tests.id('variante_a'), 2), tests.contact('98 111 222'), tests.adresse())),
  'cle', 'la clé d''une commande ne sert pas à un autre numéro');


-- ---------------------------------------------------------------------
-- Refus
-- ---------------------------------------------------------------------
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 150000)',
    tests.id('A'), 'essai-cle-total-000000001', tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('20 123 456'), tests.adresse())),
  'total', 'un total différent de celui que la base calcule (156,000) est refusé : l''acheteur revoit le montant');
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 384000)',
    tests.id('A'), 'essai-cle-stock-000000001', tests.panier(tests.id('variante_a'), 2), tests.contact('20 123 456'), tests.adresse())),
  'stock', 'on ne commande pas plus que le stock (1 pièce restante)');
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 106000)',
    tests.id('A'), 'essai-cle-autre-boutique1', tests.panier(tests.id('variante_b'), 1), tests.contact('20 123 456'), tests.adresse())),
  'stock', 'une variante d''une autre boutique ne se commande pas');
select is(
  (select array_agg(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 156000)',
     tests.id('A'), 'essai-cle-validation-00' || n, tests.panier(tests.id('variante_a_rouge'), 1), c::jsonb, a::jsonb)) order by n)
   from (values
     (1, '{"telephone": "20123456"}', '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}'),
     (2, '{"nom": "Amel", "telephone": "123"}', '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}'),
     (3, '{"nom": "Amel", "telephone": "20123456", "email": "amel@"}', '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}'),
     (4, '{"nom": "Amel", "telephone": "20123456"}', '{"ville": "Tunis", "gouvernorat": "tunis"}'),
     (5, '{"nom": "Amel", "telephone": "20123456"}', '{"ligne1": "12 rue de Marseille", "gouvernorat": "tunis"}'),
     (6, '{"nom": "Amel", "telephone": "20123456"}', '{"ligne1": "12 rue de Marseille", "ville": "Tunis"}'),
     (7, '{"nom": "Amel", "telephone": "20123456"}', '{"ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis", "code_postal": "10000"}')
   ) as t(n, c, a)),
  array['contact', 'contact', 'contact', 'adresse', 'adresse', 'adresse', 'adresse'],
  'nom, téléphone, e-mail, adresse, ville, gouvernorat et code postal sont vérifiés par la base');
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 156000)',
    tests.id('A'), 'court', tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('20 123 456'), tests.adresse())),
  'cle', 'une clé d''idempotence trop courte est refusée');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'paiement.cod_actif', 'false');
select tests.connecte('client_a');
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 156000)',
    tests.id('A'), 'essai-cle-paiement-00001', tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('20 123 456'), tests.adresse())),
  'paiement', 'sans paiement à la livraison ni paiement en ligne, rien ne se commande');
reset role;
delete from public.reglages where boutique_id = tests.id('A') and cle = 'paiement.cod_actif';

select is((select count(*) from public.commandes where cle_idempotence like 'essai-cle-%' and cle_idempotence <> 'essai-cle-client-a-000001'),
  0::bigint, 'aucun refus n''a laissé de commande derrière lui');


-- ---------------------------------------------------------------------
-- Commande en invité (compte.obligatoire = non)
-- ---------------------------------------------------------------------
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'compte.obligatoire', 'false');
select tests.anonyme();
select lives_ok(
  format($$ select tests.commande('i1', %L, 'essai-invite-0000000001', %L, %L, %L, 156000) $$,
    tests.id('A'), tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('98 765 432'), tests.adresse()),
  'quand la boutique l''autorise, un visiteur commande en invité');
select lives_ok(
  format($$ select tests.commande('i2', %L, 'essai-invite-0000000002', %L, %L, %L, 156000) $$,
    tests.id('A'), tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('+21698765432'), tests.adresse()),
  'le même invité commande une deuxième fois');
reset role;
select ok((
  select count(*) = 1 and bool_and(user_id is null and nb_commandes = 2)
  from public.clients where boutique_id = tests.id('A') and telephone = '+21698765432'),
  'les commandes d''un invité se rangent sur une seule fiche, celle de son numéro');
select is((select count(*) from public.adresses a join public.clients c on c.id = a.client_id
           where c.boutique_id = tests.id('A') and c.telephone = '+21698765432'),
  0::bigint, 'un invité n''a pas de carnet d''adresses : personne ne pourrait le relire');

select tests.anonyme();
select lives_ok(
  format($$ select tests.commande('i3', %L, 'essai-invite-0000000003', %L, %L, %L, 156000) $$,
    tests.id('A'), tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('98 765 432'), tests.adresse()),
  'troisième commande en attente pour ce numéro : acceptée (limite par défaut : 3)');
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 156000)',
    tests.id('A'), 'essai-invite-0000000004', tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('98 765 432'), tests.adresse())),
  'en_attente', 'la quatrième attend que les trois premières aient été confirmées ou annulées');
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'commande.max_en_attente', '0');
select tests.anonyme();
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 156000)',
    tests.id('A'), 'essai-invite-0000000004', tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('98 765 432'), tests.adresse())),
  null, 'réglée à 0, la limite disparaît');

reset role;
update public.clients set niveau_risque = 'bloque' where id = tests.id('fiche_invite_a');
select tests.anonyme();
select is(tests.indice(format('select public.passer_commande(%L, %L, %L, %L, %L, 156000)',
    tests.id('A'), 'essai-invite-bloque-00001', tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('20 000 003'), tests.adresse())),
  'bloque', 'un numéro bloqué par la boutique ne commande plus en ligne');


-- ---------------------------------------------------------------------
-- Confirmation automatique (réglage)
-- ---------------------------------------------------------------------
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'commande.mode_confirmation', '"automatique"');
select tests.anonyme();
select lives_ok(
  format($$ select tests.commande('auto', %L, 'essai-automatique-000001', %L, %L, %L, 156000) $$,
    tests.id('A'), tests.panier(tests.id('variante_a_rouge'), 1), tests.contact('55 444 333'), tests.adresse()),
  'commande dans une boutique en confirmation automatique');
reset role;
select ok((
  select c.statut = 'confirmee' and c.confirmee_at is not null
     and (select array_agg(e.statut_apres::text order by e.created_at) from public.commande_evenements e where e.commande_id = c.id) = array['recue', 'confirmee']
     and not exists (select 1 from public.commande_evenements e where e.commande_id = c.id and e.auteur_id is not null)
  from public.commandes c where c.cle_idempotence = 'essai-automatique-000001'),
  'elle passe seule en confirmée, horodatée, sans auteur dans l''historique');


-- ---------------------------------------------------------------------
-- Qui voit la commande
-- ---------------------------------------------------------------------
create temp view nouvelle as select r ->> 'numero' as numero from tests.resultats where nom = 'c1';
grant select on nouvelle to anon, authenticated;
select tests.connecte('proprio_a');
select is((select count(*) from public.commandes where numero = (select numero from nouvelle)), 1::bigint,
  'l''équipe de la boutique voit la commande');
reset role; select tests.connecte('client_ab');
select is((select count(*) from public.commandes where numero = (select numero from nouvelle) and boutique_id = tests.id('A')), 0::bigint,
  'un autre client de la même boutique ne la voit pas');
reset role; select tests.connecte('proprio_b');
select is((select count(*) from public.commande_lignes where boutique_id = tests.id('A')), 0::bigint,
  'l''équipe d''une autre boutique n''en voit aucune ligne');

-- Après une commande, les gestes de l'équipe gardent leur auteur.
reset role; select tests.connecte('confirm_a');
select public.gestion_appel(tests.id('A'), (select numero from nouvelle), 'appel', 'confirmee');
reset role;
select is((select e.auteur_id from public.commande_evenements e join public.commandes c on c.id = e.commande_id
           where c.numero = (select numero from nouvelle) and c.boutique_id = tests.id('A') and e.statut_apres = 'confirmee'),
  tests.id('confirm_a'), 'la confirmation par un membre de l''équipe porte son nom');

select ok(
  has_function_privilege('anon', 'public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text)', 'execute')
  and has_function_privilege('anon', 'public.devis_commande(uuid, jsonb, text, text)', 'execute')
  and not has_function_privilege('anon', 'private.chiffre_commande(uuid, jsonb, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.telephone_tunisien(text)', 'execute'),
  'la vitrine appelle le devis et la commande ; le chiffrage interne n''est pas exposé');

select * from finish();
rollback;
