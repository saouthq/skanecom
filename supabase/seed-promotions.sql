-- =====================================================================
-- SkanEcom · jeu de démonstration : LES CODES PROMO (migration 45)
-- =====================================================================
-- Maison Selma a le module « promotions » ; Maymar ne l'a pas (sa charte
-- refuse la promotion), la quincaillerie non plus.
--
-- Ses codes, datés depuis aujourd'hui (le jeu se rejoue n'importe quel
-- jour) : BIENVENUE10 pour la première commande, LIVRAISON le temps des
-- week-ends de la rentrée, SELMA20 sur la carte glissée dans les colis, une
-- vente privée programmée ; et les soldes de l'été 2025, finis, avec les
-- trois commandes livrées qu'ils ont portées (numérotées SEL-2025-…, comme
-- l'hiver de seed.sql ; le stock du jour ne bouge pas).
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into plateforme.modules_actifs (boutique_id, module) values
  ('00000000-0000-4000-8000-000000000003', 'promotions')
on conflict do nothing;

insert into public.codes_promo (boutique_id, code, type, valeur, minimum_millimes, debut, fin,
                                limite_utilisations, une_fois_par_client, note, created_at)
select '00000000-0000-4000-8000-000000000003', c.code, c.type, c.valeur, c.minimum,
       (c.debut::timestamp at time zone 'Africa/Tunis'), ((c.fin + 1)::timestamp at time zone 'Africa/Tunis'),
       c.limite, c.une_fois, c.note, (coalesce(c.debut, current_date - 30)::timestamp at time zone 'Africa/Tunis') - interval '2 days'
from (values
  ('BIENVENUE10',  'pourcentage', 10::bigint,  100000::bigint, current_date - 30, null::date,        null::integer, true,
   'La première commande : en story Instagram et dans la bio'),
  ('LIVRAISON',    'livraison',   null::bigint, 150000::bigint, current_date - 5,  current_date + 12, 200,           false,
   'Les week-ends de la rentrée'),
  ('SELMA20',      'montant',     20000::bigint, 200000::bigint, current_date - 30, null::date,       50,            true,
   'La carte glissée dans les colis'),
  ('VENTE-PRIVEE', 'pourcentage', 15::bigint,  0::bigint,      current_date + 10, current_date + 12, null::integer, true,
   'Trois jours pour les clientes de la lettre'),
  ('ETE25',        'pourcentage', 25::bigint,  0::bigint,      date '2025-07-01', date '2025-08-31', null::integer, false,
   'Les soldes de l''été 2025')
) as c(code, type, valeur, minimum, debut, fin, limite, une_fois, note)
on conflict (boutique_id, code) do nothing;

-- Les soldes de l'été 2025 : trois robes livrées, à −25 %.
do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  a          record;
  t0         timestamptz;
  v_code     public.codes_promo;
  v_client   uuid;
  v_commande uuid;
  v_ligne    public.commande_lignes;
  v_devis    jsonb;
  v_remise   bigint;
  v_stock    integer;
begin
  select * into v_code from public.codes_promo where boutique_id = s and code = 'ETE25';
  if v_code.id is null or exists (select 1 from public.commandes where boutique_id = s and code_promo_id = v_code.id) then
    return;
  end if;
  for a in
    select * from (values
      (1, 'Hiba Jlassi',   '+21620111211', 'SEL04-VIC-M', 'Tunis',  'tunis',  date '2025-07-09'),
      (2, 'Nour Kallel',   '+21620111202', 'SEL02-ECR-S', 'Sousse', 'sousse', date '2025-07-24'),
      (3, 'Asma Belhadj',  '+21620111212', 'SEL01-TER-M', 'Ariana', 'ariana', date '2025-08-17')
    ) as t(n, nom, tel, sku, ville, gouv, le)
    order by n
  loop
    t0 := a.le + time '21:10';
    select id into v_client from public.clients where boutique_id = s and telephone = a.tel and user_id is null;
    if v_client is null then
      insert into public.clients (boutique_id, nom, telephone, created_at) values (s, a.nom, a.tel, t0) returning id into v_client;
    end if;
    v_devis := private.chiffre_commande(s,
      jsonb_build_array(jsonb_build_object('variante_id', (select v.id from public.variantes v where v.boutique_id = s and v.sku = a.sku), 'quantite', 1)),
      a.gouv, false);
    v_remise := (v_devis ->> 'sous_total_millimes')::bigint * v_code.valeur / 100;
    insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes,
                                  code_promo_id, code_promo, created_at)
    values (s, 'SEL-2025-' || lpad((20 + a.n)::text, 5, '0'), 'vitrine', v_client, a.nom, a.tel, 'Adresse de démonstration',
            a.ville, a.gouv, v_devis -> 'zone' ->> 'nom_fr',
            (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint, v_remise,
            (v_devis ->> 'total_millimes')::bigint - v_remise, v_code.id, v_code.code, t0)
    returning id into v_commande;
    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
                                        prix_unitaire_millimes, quantite, total_ligne_millimes)
    select s, v_commande, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle', l ->> 'sku',
           (l ->> 'prix_unitaire_millimes')::bigint, 1, (l ->> 'prix_unitaire_millimes')::bigint
    from jsonb_array_elements(v_devis -> 'lignes') l
    returning * into v_ligne;

    -- Vendue sur un arrivage d'alors : la pièce revient au stock du jour.
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes set stock = stock + 1 where boutique_id = s and id = v_ligne.variante_id returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', '', true);
    insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, created_at)
    values (s, v_ligne.variante_id, 1, v_stock, 'reception', 'Arrivage de l''été 2025 (jeu de démo)', t0);

    insert into public.confirmations (boutique_id, commande_id, canal, resultat, created_at)
    values (s, v_commande, 'appel', 'confirmee', t0 + interval '13 hours');
    update public.commandes set statut = 'confirmee' where id = v_commande;
    update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (46800000 + a.n * 157) where id = v_commande;
    update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = v_commande;
    update public.commande_evenements e
       set created_at = t0 + case e.statut_apres when 'recue' then interval '0' when 'confirmee' then interval '13 hours'
                                                 when 'expediee' then interval '30 hours' else interval '52 hours' end
     where e.commande_id = v_commande;
    update public.commandes
       set confirmee_at = t0 + interval '13 hours', expediee_at = t0 + interval '30 hours',
           livree_at = t0 + interval '52 hours', cloturee_at = t0 + interval '52 hours'
     where id = v_commande;
  end loop;
end
$$;
