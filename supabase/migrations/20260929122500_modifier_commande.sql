-- =====================================================================
-- MODIFIER UNE COMMANDE PAS ENCORE PARTIE (09/11, parcours en vrai)
-- =====================================================================
-- À l'appel de confirmation, la cliente dit « finalement en 70 cm », « mettez-
-- en deux », « enlevez le sac ». La vitrine lui disait d'appeler la boutique,
-- mais le backoffice n'avait que annuler et ressaisir. Désormais, tant que la
-- commande n'est pas partie (à arbitrer, reçue, confirmée), l'équipe qui
-- confirme change ses lignes : une autre déclinaison, une autre quantité,
-- une ligne en moins.
--
--   * le stock des lignes d'avant revient (mouvement « annulation », dit
--     « modifiée »), celui des nouvelles se réserve (le trigger habituel) ;
--   * le prix se refait par le même calcul que la vitrine
--     (private.chiffre_commande : offres, lots, seuil de livraison offerte,
--     prix pro du client) ; une livraison qui était offerte le reste ; une
--     remise accordée à la saisie reste, plafonnée au prix des articles ;
--   * p_simuler : tout se calcule puis s'annule — l'écran montre le nouveau
--     total avant d'enregistrer ; p_total_attendu : rien ne s'enregistre si
--     le total a changé entre-temps ;
--   * refusé, et dit : payée en ligne (le montant reçu ne bouge pas), un
--     code promo (ses conditions se rejugent mal), une précommande en
--     attente d'arrivage — pour celles-là, annuler et ressaisir.
--   Le journal de la commande garde la trace (avant → après).
-- =====================================================================

create function public.gestion_modifier_commande(
  p_boutique_id uuid, p_numero text, p_lignes jsonb, p_simuler boolean default true, p_total_attendu bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c        public.commandes;
  v_l        record;
  v_stock    integer;
  v_devis    jsonb;
  v_frais    bigint;
  v_remise   bigint;
  v_total    bigint;
  v_avant    text;
  v_apres    text;
  v_ecriture text := current_setting('skanecom.ecriture_stock', true);
  v_res      jsonb;
  v_msg      text;
  v_detail   text;
begin
  if not private.est_membre(p_boutique_id, '{proprietaire,admin,confirmateur}') then
    raise exception 'Modifier une commande revient à qui la confirme' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero for update;
  if not found then
    raise exception 'Commande introuvable' using errcode = 'no_data_found';
  end if;
  if v_c.statut not in ('a_arbitrer', 'recue', 'confirmee') then
    return jsonb_build_object('ok', false, 'raison', 'partie');
  end if;
  if v_c.mode_paiement <> 'cod' or v_c.statut_paiement = 'paye' then
    return jsonb_build_object('ok', false, 'raison', 'payee');
  end if;
  if v_c.code_promo_id is not null then
    return jsonb_build_object('ok', false, 'raison', 'code_promo');
  end if;
  if exists (select 1 from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id and l.precommande) then
    return jsonb_build_object('ok', false, 'raison', 'precommande');
  end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    return jsonb_build_object('ok', false, 'raison', 'vide');
  end if;

  select string_agg(l.quantite || ' × ' || l.produit_nom || coalesce(' (' || nullif(l.variante_libelle, '') || ')', ''), ', ' order by l.created_at)
    into v_avant from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id;

  begin
    -- Le stock des lignes d'avant revient, puis elles s'effacent.
    for v_l in
      select l.variante_id, l.quantite from public.commande_lignes l
       where l.boutique_id = p_boutique_id and l.commande_id = v_c.id and l.variante_id is not null
       order by l.variante_id
    loop
      perform set_config('skanecom.ecriture_stock', 'on', true);
      update public.variantes set stock = stock + v_l.quantite
       where boutique_id = p_boutique_id and id = v_l.variante_id
      returning stock into v_stock;
      perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);
      insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
      values (p_boutique_id, v_l.variante_id, v_l.quantite, v_stock, 'annulation', v_c.id, 'Commande ' || v_c.numero || ' — modifiée', private.auteur());
    end loop;
    delete from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id;

    -- Le nouveau chiffrage : le même que la vitrine (aux prix pro du client s'il en a).
    perform 1 from public.variantes v
     where v.boutique_id = p_boutique_id and v.id in (select d.variante_id from private.lignes_panier(p_lignes) d)
     order by v.id for update;
    perform set_config('skanecom.saisie_client', coalesce(v_c.client_id::text, ''), true);
    v_devis := private.chiffre_commande(p_boutique_id, p_lignes,
                 case when v_c.mode_livraison = 'domicile' then v_c.livraison_gouvernorat end, v_c.mode_livraison = 'retrait');
    perform set_config('skanecom.saisie_client', '', true);
    if not coalesce((v_devis ->> 'complet')::boolean, false) then
      raise exception 'stock' using errcode = 'P0001', detail = (v_devis -> 'lignes')::text;
    end if;

    -- Une livraison offerte le reste ; au comptoir, aucuns frais ; la remise de la saisie, plafonnée.
    v_frais := case when v_c.sur_place or v_c.frais_livraison_millimes = 0 then 0 else (v_devis ->> 'frais_livraison_millimes')::bigint end;
    v_remise := least(v_c.remise_millimes, (v_devis ->> 'sous_total_millimes')::bigint);
    v_total := (v_devis ->> 'sous_total_millimes')::bigint + v_frais - v_remise;

    insert into public.commande_lignes
      (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
       prix_unitaire_millimes, quantite, total_ligne_millimes, lot_id, lot_nom, remise_lot_millimes, precommande, precommande_arrivage_id)
    select p_boutique_id, v_c.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
           l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
           (l ->> 'total_ligne_millimes')::bigint, (l ->> 'lot_id')::uuid, l ->> 'lot',
           coalesce((l ->> 'remise_lot_millimes')::bigint, 0),
           coalesce(jsonb_typeof(l -> 'precommande') = 'object', false), (l #>> '{precommande,arrivage_id}')::uuid
      from jsonb_array_elements(v_devis -> 'lignes') l;

    select string_agg(l.quantite || ' × ' || l.produit_nom || coalesce(' (' || nullif(l.variante_libelle, '') || ')', ''), ', ' order by l.created_at)
      into v_apres from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id;

    v_res := jsonb_build_object('ok', true,
      'lignes', (select jsonb_agg(jsonb_build_object('produit', l.produit_nom, 'libelle', l.variante_libelle, 'quantite', l.quantite,
                   'prix_unitaire_millimes', l.prix_unitaire_millimes, 'total_ligne_millimes', l.total_ligne_millimes) order by l.created_at)
                   from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id),
      'sous_total_millimes', (v_devis ->> 'sous_total_millimes')::bigint,
      'frais_livraison_millimes', v_frais, 'remise_millimes', v_remise, 'total_millimes', v_total,
      'total_avant_millimes', v_c.total_millimes, 'avant', v_avant, 'apres', v_apres);

    if p_simuler or p_total_attendu is distinct from v_total then
      -- Tout s'annule (le bloc retombe) : l'écran montre, rien n'est écrit.
      raise exception 'simulation' using errcode = 'P0001', detail = v_res::text;
    end if;

    update public.commandes
       set sous_total_millimes = (v_devis ->> 'sous_total_millimes')::bigint, frais_livraison_millimes = v_frais,
           remise_millimes = v_remise, total_millimes = v_total
     where boutique_id = p_boutique_id and id = v_c.id;
    insert into public.commande_evenements (boutique_id, commande_id, statut_avant, statut_apres, commentaire, auteur_id)
    values (p_boutique_id, v_c.id, v_c.statut, v_c.statut, 'Modifiée : ' || coalesce(v_avant, '—') || ' → ' || coalesce(v_apres, '—'), private.auteur());
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
    if v_msg = 'simulation' then
      -- Rien n'est écrit : le nouveau chiffrage, et si le total attendu avait changé.
      return v_detail::jsonb || jsonb_build_object('enregistree', false, 'total_change', not p_simuler);
    elsif v_msg = 'stock' then
      return jsonb_build_object('ok', false, 'raison', 'stock', 'lignes', v_detail::jsonb);
    end if;
    raise;
  end;
  return v_res || jsonb_build_object('enregistree', true);
end;
$$;
comment on function public.gestion_modifier_commande(uuid, text, jsonb, boolean, bigint) is
  'Change les lignes d''une commande pas encore partie (à arbitrer, reçue, confirmée) : stock rendu puis réservé, prix refait par private.chiffre_commande, livraison offerte gardée. p_simuler : chiffre sans rien écrire. Refusé (ok=false, raison) si payée en ligne, avec code promo, précommande, stock insuffisant ou partie.';
revoke execute on function public.gestion_modifier_commande(uuid, text, jsonb, boolean, bigint) from public, anon;
grant  execute on function public.gestion_modifier_commande(uuid, text, jsonb, boolean, bigint) to authenticated;

-- Ce que l'écran propose : chaque ligne, sa déclinaison et les autres de son
-- produit (leur stock disponible, celui de la ligne compté), ou la raison
-- pour laquelle la commande ne se modifie pas.
create function public.gestion_commande_modifiable(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c public.commandes;
begin
  if not private.est_membre(p_boutique_id, '{proprietaire,admin,confirmateur}') then
    return jsonb_build_object('ok', false, 'raison', 'role');
  end if;
  select * into v_c from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero;
  if not found then return jsonb_build_object('ok', false, 'raison', 'introuvable'); end if;
  if v_c.statut not in ('a_arbitrer', 'recue', 'confirmee') then return jsonb_build_object('ok', false, 'raison', 'partie'); end if;
  if v_c.mode_paiement <> 'cod' or v_c.statut_paiement = 'paye' then return jsonb_build_object('ok', false, 'raison', 'payee'); end if;
  if v_c.code_promo_id is not null then return jsonb_build_object('ok', false, 'raison', 'code_promo'); end if;
  if exists (select 1 from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id and l.precommande) then
    return jsonb_build_object('ok', false, 'raison', 'precommande');
  end if;
  return jsonb_build_object('ok', true, 'lignes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'variante_id', l.variante_id, 'produit', l.produit_nom, 'quantite', l.quantite,
      'choix', (select coalesce(jsonb_agg(jsonb_build_object(
                  'variante_id', v.id,
                  'libelle', coalesce(nullif(private.libelle_variante(p_boutique_id, v.produit_id, v.options), ''), 'Modèle unique'),
                  'disponible', v.stock + coalesce((select sum(l2.quantite) from public.commande_lignes l2
                                                     where l2.boutique_id = p_boutique_id and l2.commande_id = v_c.id and l2.variante_id = v.id), 0),
                  'prix_millimes', v.prix_millimes) order by v.position, v.created_at), '[]'::jsonb)
                  from public.variantes v
                  join public.variantes vl on vl.boutique_id = p_boutique_id and vl.id = l.variante_id
                 where v.boutique_id = p_boutique_id and v.produit_id = vl.produit_id and (v.actif or v.id = l.variante_id)))
      order by l.created_at)
      from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id and l.variante_id is not null), '[]'::jsonb));
end;
$$;
revoke execute on function public.gestion_commande_modifiable(uuid, text) from public, anon;
grant  execute on function public.gestion_commande_modifiable(uuid, text) to authenticated;
