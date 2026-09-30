-- =====================================================================
-- SkanEcom · jeu de démonstration : SOUVENT ACHETÉS ENSEMBLE (migration 51)
-- =====================================================================
-- Maison Selma propose les pièces achetées ensemble ; Maymar et la
-- quincaillerie non (le réglage est coupé par défaut). Six commandes
-- livrées ces dernières semaines réunissent des pièces qui se complètent :
-- la robe à bretelles et le sac de voyage, le blazer, la chemise en
-- popeline et les derbies. Chaque pièce vendue revient au stock (un
-- arrivage du même jour) : les stocks de démonstration ne bougent pas.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

insert into public.reglages (boutique_id, cle, valeur) values
  ('00000000-0000-4000-8000-000000000003', 'catalogue.achetes_ensemble', 'true')
on conflict (boutique_id, cle) do nothing;

do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  a          record;
  t0         timestamptz;
  v_client   uuid;
  v_commande uuid;
  v_devis    jsonb;
  v_ligne    jsonb;
  v_stock    integer;
begin
  if exists (select 1 from public.commandes where boutique_id = s and numero like 'SEL-2026-008%') then
    return;
  end if;
  for a in
    select * from (values
      (1, 'Ines Gharbi',     '+21620222301', array['SEL01-TER-M', 'SEL19-COG'],                  'Tunis',    'tunis',    40),
      (2, 'Rym Chaabane',    '+21620222302', array['SEL01-TER-S', 'SEL19-COG'],                  'La Marsa', 'tunis',    26),
      (3, 'Sarra Mejri',     '+21620222303', array['SEL01-TER-M', 'SEL19-COG', 'SEL13-BLA-M'],   'Sousse',   'sousse',   12),
      (4, 'Karim Ben Ali',   '+21620222304', array['SEL15-GRI-48', 'SEL12-BLA-M', 'SEL17-FAU-42'], 'Ariana',  'ariana',   33),
      (5, 'Mehdi Trabelsi',  '+21620222305', array['SEL15-GRI-50', 'SEL12-BLA-L'],               'Sfax',     'sfax',     19),
      (6, 'Walid Hammami',   '+21620222306', array['SEL15-GRI-48', 'SEL17-FAU-41'],              'Nabeul',   'nabeul',    6)
    ) as t(n, nom, tel, skus, ville, gouv, jours)
    order by n
  loop
    t0 := date_trunc('day', now()) - make_interval(days => a.jours) + time '20:40';
    select id into v_client from public.clients where boutique_id = s and telephone = a.tel and user_id is null;
    if v_client is null then
      insert into public.clients (boutique_id, nom, telephone, created_at) values (s, a.nom, a.tel, t0) returning id into v_client;
    end if;
    v_devis := private.chiffre_commande(s,
      (select jsonb_agg(jsonb_build_object('variante_id', v.id, 'quantite', 1))
         from unnest(a.skus) k join public.variantes v on v.boutique_id = s and v.sku = k),
      a.gouv, false);
    insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
    values (s, 'SEL-2026-' || lpad((800 + a.n)::text, 5, '0'), 'vitrine', v_client, a.nom, a.tel, 'Adresse de démonstration',
            a.ville, a.gouv, v_devis -> 'zone' ->> 'nom_fr',
            (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
            (v_devis ->> 'total_millimes')::bigint, t0)
    returning id into v_commande;

    for v_ligne in select * from jsonb_array_elements(v_devis -> 'lignes') loop
      insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
                                          prix_unitaire_millimes, quantite, total_ligne_millimes, created_at)
      values (s, v_commande, (v_ligne ->> 'variante_id')::uuid, v_ligne ->> 'produit_nom', v_ligne ->> 'variante_libelle', v_ligne ->> 'sku',
              (v_ligne ->> 'prix_unitaire_millimes')::bigint, 1, (v_ligne ->> 'prix_unitaire_millimes')::bigint, t0);
      -- Vendue sur un arrivage du jour : la pièce revient au stock.
      perform set_config('skanecom.ecriture_stock', 'on', true);
      update public.variantes set stock = stock + 1 where boutique_id = s and id = (v_ligne ->> 'variante_id')::uuid returning stock into v_stock;
      perform set_config('skanecom.ecriture_stock', '', true);
      insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, created_at)
      values (s, (v_ligne ->> 'variante_id')::uuid, 1, v_stock, 'reception', 'Arrivage du jour (jeu de démo)', t0);
    end loop;

    insert into public.confirmations (boutique_id, commande_id, canal, resultat, created_at)
    values (s, v_commande, 'appel', 'confirmee', t0 + interval '13 hours');
    update public.commandes set statut = 'confirmee' where id = v_commande;
    update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (47100000 + a.n * 211) where id = v_commande;
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
