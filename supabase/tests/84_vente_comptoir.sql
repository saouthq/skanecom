-- =====================================================================
-- 84 · La vente au comptoir, et les canaux au tableau de bord
-- =====================================================================
begin;
\ir outils.psql

select plan(16);

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

-- La valise noire de A (189,000), vendue au comptoir.
create function tests.vendre(p_cle text, p_canal text default 'magasin', p_total bigint default 189000, p_mode text default 'comptoir')
returns jsonb language sql as $$
  select public.gestion_saisir_commande(tests.id('A'), p_cle, p_canal,
           '{"nom": "Hédi Mansour", "telephone": "97 111 222"}',
           jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)),
           jsonb_build_object('mode', p_mode), '{}', false, null, p_total)
$$;
grant execute on function tests.vendre(text, text, bigint, text) to authenticated;
create function pg_temp.vente(p_cle text) returns public.commandes language sql as $$
  select * from public.commandes where cle_idempotence = p_cle
$$;

select tests.connecte('confirm_a');
select is((public.gestion_chiffrer_saisie(tests.id('A'), '97111222',
             jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)), '{"mode": "comptoir"}') ->> 'total_millimes')::bigint,
  189000::bigint, 'au comptoir : le prix des articles, sans livraison');
select is(tests.indice($$ select tests.vendre('comptoir-whatsapp-0001', 'whatsapp') $$), 'comptoir', 'une vente au comptoir se fait au magasin');
select is(tests.vendre('comptoir-vente-00000001') ->> 'statut', 'livree', 'vendue au comptoir : remise d''un geste');
reset role;
select ok((select v.sur_place and v.mode_livraison = 'retrait' and v.statut_paiement = 'paye' and v.frais_livraison_millimes = 0
             and v.total_millimes = 189000 and v.livraison_ligne1 is null and v.confirmee_at is not null and v.expediee_at is not null
             and v.livree_at is not null and v.transporteur is null
           from pg_temp.vente('comptoir-vente-00000001') v),
  'remise et payée sur place, sans adresse ni frais ni transporteur');
select is((select count(*)::int from public.commande_evenements e where e.commande_id = (pg_temp.vente('comptoir-vente-00000001')).id), 4,
  'chaque étape au journal : reçue, confirmée, prête, remise');
select ok(exists (select 1 from public.stock_mouvements m where m.commande_id = (pg_temp.vente('comptoir-vente-00000001')).id and m.delta = -1),
  'le stock est sorti');
select ok(not exists (select 1 from plateforme.modules_actifs where boutique_id = tests.id('A') and module = 'retrait_magasin' and actif),
  'sans le module de retrait (le comptoir n''en a pas besoin)');
select tests.connecte('proprio_a');
select ok(not exists (select 1 from jsonb_array_elements(public.gestion_encaissements(tests.id('A')) -> 'a_recevoir') g,
                                    jsonb_array_elements(g -> 'commandes') c
                       where c ->> 'numero' = (pg_temp.vente('comptoir-vente-00000001')).numero),
  'réglée au comptoir : aucun livreur ne la doit');
select is(public.gestion_commande(tests.id('A'), (pg_temp.vente('comptoir-vente-00000001')).numero) ->> 'sur_place', 'true',
  'la fiche dit « vendue au comptoir »');
reset role;
select throws_ok($$ update public.commandes set sur_place = true where id = tests.id('commande_a') $$, '23514', null,
  'une commande de la vitrine n''est jamais « vendue au comptoir »');

-- Le tableau de bord : les canaux ; des taux qui restent justes.
select tests.connecte('confirm_a');
select is(public.gestion_saisir_commande(tests.id('A'), 'comptoir-whatsapp-0003', 'whatsapp', '{"nom": "Sonia Abid", "telephone": "97 333 444"}',
            jsonb_build_array(jsonb_build_object('variante_id', tests.id('variante_a'), 'quantite', 1)),
            '{"mode": "domicile", "ligne1": "2 rue de Rome", "ville": "Tunis", "gouvernorat": "tunis"}', '{}', true, null, 195000) ->> 'statut',
  'confirmee', 'une commande WhatsApp, confirmée à la saisie');
reset role; select tests.connecte('proprio_a');
create function pg_temp.t() returns jsonb language sql as $$ select public.gestion_tableau_de_bord(tests.id('A'), 30) $$;
select ok((select bool_or(c ->> 'canal' = 'magasin' and (c ->> 'commandes')::int = 1 and (c ->> 'encaisse_millimes')::bigint = 189000)
              and bool_or(c ->> 'canal' = 'whatsapp' and (c ->> 'commandes')::int = 1 and (c ->> 'livrees')::int = 0)
              and bool_or(c ->> 'canal' = 'vitrine')
             from jsonb_array_elements(pg_temp.t() -> 'canaux') c),
  'les canaux : le comptoir et ce qu''il a encaissé, WhatsApp, la vitrine');
select is(pg_temp.t() -> 'courante' -> 'confirmation_minutes', 'null'::jsonb,
  'confirmées à l''instant de la saisie : elles ne comptent pas dans la vitesse de l''équipe');
select is(pg_temp.t() -> 'courante' -> 'taux_confirmation', 'null'::jsonb, '… ni dans son taux de confirmation');
select is(pg_temp.t() -> 'courante' -> 'taux_refus', 'null'::jsonb, 'une vente au comptoir n''est pas un colis livré : pas de taux de refus');
select is((pg_temp.t() -> 'courante' ->> 'encaisse_millimes')::bigint, 189000::bigint, 'mais son argent est encaissé');

select * from finish();
rollback;
