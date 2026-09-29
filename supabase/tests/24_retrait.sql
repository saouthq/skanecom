-- =====================================================================
-- 24 · Le retrait en magasin : proposé, commandé, suivi, préparé, retiré
-- =====================================================================
begin;
\ir outils.psql

select plan(25);

-- ---------------------------------------------------------------------
-- Outils du fichier
-- ---------------------------------------------------------------------
create table tests.resultats (nom text primary key, r jsonb not null);
grant insert, select on tests.resultats to anon, authenticated, service_role;

create function tests.panier(p_quantite integer default 2) returns jsonb
language sql as $$ select jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_retrait'), 'quantite', p_quantite)) $$;

create function tests.contact(p_telephone text) returns jsonb
language sql as $$ select jsonb_build_object('nom', 'Sami Trabelsi', 'telephone', p_telephone, 'accepte_conditions', true) $$;

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

create function tests.retrait(p_nom text, p_telephone text, p_total bigint, p_quantite integer default 2) returns void
language sql as $$
  insert into tests.resultats (nom, r)
  select p_nom, public.passer_commande(tests.id('A'), 'retrait-' || p_nom || '-0000000000', tests.panier(p_quantite),
                                       tests.contact(p_telephone), '{"mode": "retrait"}', p_total)
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Une variante bien approvisionnée ; A accepte les commandes en invité et
-- les confirme d'office (le cycle se joue sans appel).
insert into public.variantes (id, boutique_id, produit_id, sku, options, prix_millimes, stock)
values (tests.nouvel_id('variante_retrait'), tests.id('A'), tests.id('produit_a'), 'VAL-RETRAIT', '{"couleur": "Vert"}', 150000, 20);
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'compte.obligatoire', 'false'),
  (tests.id('A'), 'commande.mode_confirmation', '"automatique"');


-- ---------------------------------------------------------------------
-- Proposé seulement si la boutique l'offre, magasin renseigné
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select is(tests.indice($$ select public.devis_commande(tests.id('A'), tests.panier(), null, 'retrait') $$), 'retrait',
  'sans le module, le retrait n''est pas proposé');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'retrait_magasin');
select tests.anonyme();
select is(tests.indice($$ select public.devis_commande(tests.id('A'), tests.panier(), null, 'retrait') $$), 'retrait',
  'module actif, mais le magasin sans adresse : pas encore');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values
  (tests.id('A'), 'retrait.adresse', '"12, avenue Habib-Bourguiba"'),
  (tests.id('A'), 'retrait.ville', '"Tunis"'),
  (tests.id('A'), 'retrait.horaires', '"Du lundi au samedi, de 9 h à 19 h"'),
  (tests.id('A'), 'retrait.delai_heures', '2');
select throws_like($$ update public.reglages set valeur = '0' where boutique_id = tests.id('A') and cle = 'retrait.delai_heures' $$,
  '%720 heures%', 'le temps de préparation compte une heure au moins');
select throws_like(format($$ update public.reglages set valeur = %L where boutique_id = tests.id('A') and cle = 'retrait.ville' $$, to_jsonb(repeat('x', 81))),
  '%80 caractères%', 'la ville tient en 80 caractères');

select tests.anonyme();
select results_eq(
  $$ select d ->> 'mode', (d ->> 'frais_livraison_millimes')::bigint, (d ->> 'total_millimes')::bigint, d -> 'retrait' ->> 'ville', (d -> 'retrait' ->> 'delai_heures')::int
       from public.devis_commande(tests.id('A'), tests.panier(), null, 'retrait') d $$,
  $$ values ('retrait'::text, 0::bigint, 300000::bigint, 'Tunis'::text, 2) $$,
  'le devis en retrait : gratuit, avec le magasin et son temps de préparation');
select is((public.devis_commande(tests.id('A'), tests.panier(), 'tunis') ->> 'mode'), 'domicile',
  'sans mode, le devis reste celui d''une livraison à domicile');
select is(tests.indice($$ select public.devis_commande(tests.id('A'), tests.panier(), null, 'drone') $$), 'adresse',
  'un mode de livraison inconnu est refusé');
select is((public.configuration_publique(tests.id('A')) -> 'reglages' ->> 'retrait.ville'), 'Tunis',
  'la vitrine lit le magasin dans ses réglages publics');


-- ---------------------------------------------------------------------
-- Commander en retrait
-- ---------------------------------------------------------------------
select is(tests.indice($$ select public.passer_commande(tests.id('A'), 'retrait-total-00000000', tests.panier(), tests.contact('20 555 111'),
                                                      '{"mode": "retrait"}', 306000) $$), 'total',
  'le total d''une livraison (frais compris) n''est pas celui d''un retrait : refusé');
select lives_ok($$ select tests.retrait('premiere', '20 555 111', 300000) $$, 'l''acheteur commande en retrait, sans adresse');
reset role;
select results_eq(
  $$ select c.mode_livraison, c.livraison_ligne1, c.livraison_ville, c.frais_livraison_millimes, c.transporteur, c.statut::text
       from public.commandes c where c.boutique_id = tests.id('A') and c.numero = (select r ->> 'numero' from tests.resultats where nom = 'premiere') $$,
  $$ values ('retrait'::text, null::text, null::text, 0::bigint, null::text, 'confirmee'::text) $$,
  'la commande : à retirer, sans adresse, sans frais ni transporteur');
select throws_like(
  $$ update public.commandes set mode_livraison = 'domicile'
      where boutique_id = tests.id('A') and numero = (select r ->> 'numero' from tests.resultats where nom = 'premiere') $$,
  '%commandes_adresse_a_domicile%', 'une livraison à domicile sans adresse est impossible');
select tests.anonyme();
select is(tests.indice($$ select public.passer_commande(tests.id('A'), 'domicile-sans-adresse-0', tests.panier(), tests.contact('20 555 222'),
                                                      '{"mode": "domicile"}', 306000) $$), 'adresse',
  'à domicile, l''adresse reste exigée');

select results_eq(
  $$ select s ->> 'mode_livraison', s -> 'retrait' ->> 'adresse', s -> 'retrait' ->> 'horaires'
       from tests.resultats r, public.commande_suivie(tests.id('A'), r.r ->> 'numero', r.r ->> 'jeton') s where r.nom = 'premiere' $$,
  $$ values ('retrait'::text, '12, avenue Habib-Bourguiba'::text, 'Du lundi au samedi, de 9 h à 19 h'::text) $$,
  'le suivi de l''acheteur dit où et quand venir');


-- ---------------------------------------------------------------------
-- Au backoffice
-- ---------------------------------------------------------------------
select lives_ok($$ select tests.retrait('seconde', '20 555 333', 150000, 1) $$, 'une seconde commande en retrait');
reset role; select tests.connecte('proprio_a');
select is((select e ->> 'mode_livraison' from jsonb_array_elements(public.gestion_liste_commandes(tests.id('A'), 'a_preparer') -> 'commandes') e
            where e ->> 'numero' = (select r ->> 'numero' from tests.resultats where nom = 'premiere')),
  'retrait', 'la liste de l''équipe dit « à retirer »');
select results_eq(
  $$ select f ->> 'mode_livraison', f -> 'retrait' ->> 'ville'
       from public.gestion_commande(tests.id('A'), (select r ->> 'numero' from tests.resultats where nom = 'premiere')) f $$,
  $$ values ('retrait'::text, 'Tunis'::text) $$, 'la fiche aussi, avec le magasin');
select results_eq(
  $$ select jsonb_array_length(b -> 'commandes') = (select count(*)::int from public.commandes
                                                     where boutique_id = tests.id('A') and statut = 'confirmee' and mode_livraison = 'domicile'),
            (b ->> 'retraits')::int
       from public.gestion_bordereaux(tests.id('A'), null, 'a_preparer') b $$,
  $$ values (true, 2) $$, 'pas de bordereau pour un retrait : les commandes à retirer sont comptées à part');
select is((select e ->> 'mode_livraison' from jsonb_array_elements(public.gestion_export(tests.id('A'), 'commandes')) e
            where e ->> 'numero' = (select r ->> 'numero' from tests.resultats where nom = 'premiere')),
  'retrait', 'l''export garde le mode de livraison');

-- Prête au retrait (le cycle d'une expédition, sans transporteur), puis retirée.
select lives_ok($$ select public.gestion_expedier(tests.id('A'), (select r ->> 'numero' from tests.resultats where nom = 'premiere'), 'confirmee') $$,
  'la préparation la dit prête au retrait');
select lives_ok($$ select public.gestion_livrer(tests.id('A'), (select r ->> 'numero' from tests.resultats where nom = 'premiere'), 'expediee') $$,
  'l''acheteur l''a retirée et payée au comptoir');
reset role;
select results_eq(
  $$ select c.statut::text, c.statut_paiement::text, c.transporteur from public.commandes c
      where c.boutique_id = tests.id('A') and c.numero = (select r ->> 'numero' from tests.resultats where nom = 'premiere') $$,
  $$ values ('livree'::text, 'paye'::text, null::text) $$, 'retirée : payée, sans transporteur');

-- Le module coupé : plus proposé, mais une commande en cours garde son magasin.
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'retrait_magasin';
select tests.anonyme();
select is(tests.indice($$ select public.devis_commande(tests.id('A'), tests.panier(), null, 'retrait') $$), 'retrait',
  'le module coupé, le retrait n''est plus proposé');
select is((select s -> 'retrait' ->> 'adresse'
             from tests.resultats r, public.commande_suivie(tests.id('A'), r.r ->> 'numero', r.r ->> 'jeton') s where r.nom = 'seconde'),
  '12, avenue Habib-Bourguiba', 'une commande déjà passée garde l''adresse du magasin');
select is((public.configuration_publique(tests.id('A')) -> 'reglages' -> 'retrait.ville'), null,
  'et la vitrine ne voit plus les réglages du module');

select * from finish();
rollback;
