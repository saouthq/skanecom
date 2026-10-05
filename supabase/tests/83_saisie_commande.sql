-- =====================================================================
-- 83 · L'équipe saisit une commande reçue hors de la vitrine
-- =====================================================================
begin;
\ir outils.psql

select plan(37);

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

-- Une saisie : la valise noire de A (189,000), livrée à Tunis (6,000 de frais).
create function tests.saisir(p_cle text, p_telephone text, p_quantite integer default 1, p_total bigint default 195000,
                             p_canal text default 'whatsapp', p_confirmee boolean default true,
                             p_ajust jsonb default '{}', p_livraison jsonb default null, p_nom text default 'Nadia Ben Salah')
returns jsonb language sql as $$
  select public.gestion_saisir_commande(tests.id('A'), p_cle, p_canal,
           jsonb_build_object('nom', p_nom, 'telephone', p_telephone),
           jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', p_quantite)),
           coalesce(p_livraison, '{"mode": "domicile", "ligne1": "12 rue de Marseille", "ville": "Tunis", "gouvernorat": "tunis"}'),
           p_ajust, p_confirmee, 'Client fidèle', p_total)
$$;
create function tests.chiffrer(p_telephone text, p_ajust jsonb default '{}') returns jsonb language sql as $$
  select public.gestion_chiffrer_saisie(tests.id('A'), p_telephone,
           jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)),
           '{"mode": "domicile", "gouvernorat": "tunis"}', p_ajust)
$$;
grant execute on function tests.saisir(text, text, integer, bigint, text, boolean, jsonb, jsonb, text) to authenticated;
grant execute on function tests.chiffrer(text, jsonb) to authenticated;
create function pg_temp.stock() returns integer language sql as $$ select stock from public.variantes where id = tests.id('variante_a') $$;

-- Ce que l'écran lit : le catalogue en vente, le client d'un numéro.
select tests.connecte('confirm_a');
select ok((select bool_and(p ->> 'nom' = 'Valise cabine') and count(*) = 1
             and (select count(*) from jsonb_array_elements(p -> 'variantes')) = 1
             and p -> 'variantes' -> 0 ->> 'sku' = 'VAL-55-NOIR' and (p -> 'variantes' -> 0 ->> 'prix_millimes')::bigint = 189000
           from jsonb_array_elements(public.gestion_saisie(tests.id('A')) -> 'produits') p
          group by p),
  'l''employé des appels lit le catalogue en vente (ni brouillon, ni déclinaison retirée)');
select ok((select c ->> 'nom' = 'Client A' and (c ->> 'connu')::boolean and c -> 'adresse' ->> 'ligne1' = '1 rue de Rome'
             from (select public.gestion_saisie_client(tests.id('A'), '20 000 001') c) x),
  'un numéro connu : le client, l''adresse de sa dernière livraison');
select is(public.gestion_saisie_client(tests.id('A'), '98123456') ->> 'connu', 'false', 'un numéro inconnu : un client nouveau');
select is(public.gestion_saisie_client(tests.id('A'), '12'), null, 'un numéro illisible : rien');
select is((tests.chiffrer('98123456') ->> 'total_millimes')::bigint, 195000::bigint, 'le chiffrage de la vitrine : 189,000 + 6,000 de livraison');
select ok((select not (s ->> 'direction')::boolean and s -> 'retrait' = 'null'::jsonb from (select public.gestion_saisie(tests.id('A')) s) x),
  'l''écran sait que l''employé n''ajuste pas le prix, et que A ne propose pas le retrait');
select is(tests.indice($$ select tests.chiffrer('98123456', '{"remise_millimes": "9000"}') $$), 'ajustement',
  'l''employé des appels ne fait pas de remise');
select is(tests.indice($$ select tests.chiffrer('98123456', '{"livraison_offerte": true}') $$), 'ajustement',
  '… ni n''offre la livraison');

reset role; select tests.connecte('prepa_a');
select throws_ok(format($$ select public.gestion_saisie(%L) $$, tests.id('A')), '42501', null, 'la préparation ne saisit pas');
reset role; select tests.connecte('lecture_a');
select is(tests.indice($$ select tests.saisir('saisie-lecture-0000001', '98123456') $$), 'role', 'la lecture seule non plus');
reset role; select tests.connecte('proprio_b');
select is(tests.indice($$ select tests.saisir('saisie-autre-00000001', '98123456') $$), 'role', 'une autre boutique non plus');

-- La saisie de l'employé des appels : un client nouveau, sur WhatsApp, confirmée avec lui.
reset role; select tests.connecte('confirm_a');
select is(tests.saisir('saisie-whatsapp-000001', '98 123 456') ->> 'statut', 'confirmee', 'confirmée avec le client : elle part en préparation');
reset role;
select ok((select origine = 'manuelle' and canal = 'whatsapp' and saisie_par = tests.id('confirm_a')
             and contact_nom = 'Nadia Ben Salah' and contact_telephone = '+21698123456' and total_millimes = 195000
             and frais_livraison_millimes = 6000 and note_interne = 'Client fidèle' and livraison_zone_nom = 'Grand Tunis'
             and confirmee_at is not null and jeton_suivi_hash is null
           from public.commandes where cle_idempotence = 'saisie-whatsapp-000001'),
  'la commande garde son canal, qui l''a saisie, le chiffrage et la note');
select ok(exists (select 1 from public.clients where boutique_id = tests.id('A') and telephone = '+21698123456' and nom = 'Nadia Ben Salah' and user_id is null),
  'le client nouveau a sa fiche');
select is(pg_temp.stock(), 2, 'la valise est réservée (3 → 2)');
select results_eq($$ select e.statut_avant::text, e.statut_apres::text, e.auteur_id from public.commande_evenements e
                      join public.commandes c on c.id = e.commande_id where c.cle_idempotence = 'saisie-whatsapp-000001' order by e.created_at, e.statut_avant nulls first $$,
  format($$ values (null::text, 'recue'::text, %L::uuid), ('recue', 'confirmee', %L::uuid) $$, tests.id('confirm_a'), tests.id('confirm_a')),
  'l''historique dit qui l''a saisie et confirmée');

select tests.connecte('confirm_a');
select is(tests.saisir('saisie-whatsapp-000001', '98123456') ->> 'rejouee', 'true', 'envoyée deux fois : la même commande');
reset role;
select is((select count(*)::int from public.commandes where contact_telephone = '+21698123456'), 1, '… une seule');
select tests.connecte('confirm_a');
select is(tests.indice($$ select tests.saisir('saisie-total-00000001', '98123456', 1, 190000) $$), 'total', 'un prix qui a bougé depuis l''écran : refusée');
select is(tests.indice($$ select tests.saisir('saisie-stock-00000001', '98123456', 3, 573000) $$), 'stock', 'plus de pièces qu''en stock : refusée');
select is(tests.indice($$ select tests.saisir('saisie-canal-00000001', '98123456', 1, 195000, 'pigeon') $$), 'canal', 'un canal inconnu : refusée');
select is(tests.indice($$ select tests.saisir('saisie-nom-0000000001', '98123456', 1, 195000, 'telephone', true, '{}', null, 'X') $$), 'nom',
  'sans le nom du client : refusée');
select is(tests.indice($$ select tests.saisir('saisie-retrait-000001', '98123456', 1, 189000, 'magasin', true, '{}', '{"mode": "retrait"}') $$), 'retrait',
  'un retrait au magasin que la boutique ne propose pas : refusé');

-- À confirmer : elle attend avec les autres ; la veille ne sonne pas pour elle.
select is(tests.saisir('saisie-instagram-00001', '20000001', 1, 195000, 'instagram', false) ->> 'statut', 'recue', 'à confirmer : elle attend sa confirmation');
reset role;
select ok((select client_id = tests.id('fiche_client_a') from public.commandes where cle_idempotence = 'saisie-instagram-00001'),
  'un numéro connu : la commande va sur la fiche du client');
select tests.connecte('confirm_a');
select ok(coalesce(public.gestion_veille(tests.id('A')) -> 'derniere' ->> 'numero', '') not in
            (select numero from public.commandes where origine = 'manuelle'),
  'la veille ne sonne pas pour une commande saisie par l''équipe');
select ok((select c ->> 'canal' = 'instagram' and c ->> 'saisie_par' = 'confirm_a@tests.skanecom.local' and c ->> 'origine' = 'manuelle'
             from (select public.gestion_commande(tests.id('A'), (select numero from public.commandes where cle_idempotence = 'saisie-instagram-00001')) c) x),
  'la fiche dit le canal et qui l''a saisie');

-- La direction accorde une remise et offre la livraison.
reset role; select tests.connecte('proprio_a');
select is((tests.chiffrer('98123456', '{"remise_millimes": "9000", "livraison_offerte": true}') ->> 'total_millimes')::bigint, 180000::bigint,
  'la direction : 9,000 de remise, la livraison offerte → 180,000');
select is(tests.indice($$ select tests.chiffrer('98123456', '{"remise_millimes": "200000"}') $$), 'remise', 'une remise plus grande que les articles : refusée');
select is(tests.saisir('saisie-telephone-0001', '98123456', 1, 180000, 'telephone', true, '{"remise_millimes": "9000", "livraison_offerte": true}') ->> 'statut',
  'confirmee', 'la commande au téléphone, avec la remise');
reset role;
select ok((select remise_millimes = 9000 and frais_livraison_millimes = 0 and sous_total_millimes = 189000 and total_millimes = 180000
             from public.commandes where cle_idempotence = 'saisie-telephone-0001'), 'la remise et la livraison offerte sont gardées');
select tests.connecte('proprio_a');
select ok((select bool_or(l ->> 'canal' = 'telephone' and l ->> 'saisie_par' = 'proprio_a@tests.skanecom.local' and l ->> 'origine' = 'manuelle')
                  and bool_or(l ->> 'origine' = 'vitrine' and l -> 'canal' = 'null'::jsonb)
             from jsonb_array_elements(public.gestion_export(tests.id('A'), 'commandes')) l),
  'l''export des commandes dit le canal et qui l''a saisie');
reset role;

-- Le prix pro : celui du client choisi, pas celui de l'employé.
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'comptes_pro');
insert into public.comptes_pro (boutique_id, client_id, raison_sociale, statut) values (tests.id('A'), tests.id('fiche_client_a'), 'Plomberie du Lac', 'valide');
insert into public.prix_pro (boutique_id, variante_id, prix_millimes) values (tests.id('A'), tests.id('variante_a'), 170000);
select tests.connecte('confirm_a');
select ok((select c ->> 'tarif' = 'pro' and (c ->> 'sous_total_millimes')::bigint = 170000 from (select tests.chiffrer('20000001') c) x),
  'le client pro au téléphone : son prix pro (170,000)');
select is((tests.chiffrer('98123456') ->> 'sous_total_millimes')::bigint, 189000::bigint, 'un autre client : le prix public');
select is(public.gestion_saisie_client(tests.id('A'), '20000001') ->> 'pro', 'Plomberie du Lac', 'l''écran dit que le client est pro');

-- Un numéro bloqué pour la vitrine commande par l'équipe ; un site vitrine garde la saisie.
reset role;
update public.clients set niveau_risque = 'bloque' where id = tests.id('fiche_invite_a');
select set_config('skanecom.ecriture_stock', 'on', true);  -- les trois saisies ont vidé le stock
update public.variantes set stock = 4 where id = tests.id('variante_a');
select set_config('skanecom.ecriture_stock', '', true);
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'vitrine.site_vitrine', 'true');
select tests.connecte('confirm_a');
select is(tests.saisir('saisie-bloque-0000001', '20000003', 1, 195000, 'telephone', false, '{}', null, 'Invité') ->> 'statut', 'recue',
  'un numéro bloqué pour la vitrine, en site vitrine : l''équipe saisit quand même');

reset role;
select throws_ok($$ update public.commandes set canal = null where cle_idempotence = 'saisie-bloque-0000001' $$, '23514', null,
  'une commande saisie a toujours son canal');

select * from finish();
rollback;
