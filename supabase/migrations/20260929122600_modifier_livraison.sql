-- =====================================================================
-- CHANGER L'ADRESSE D'UNE COMMANDE PAS ENCORE PARTIE (09/11, parcours en vrai)
-- =====================================================================
-- À l'appel de confirmation : « finalement, livrez chez ma sœur, à Sfax ».
-- Le backoffice n'avait que annuler et ressaisir. Désormais, tant que la
-- commande n'est pas partie (à arbitrer, reçue, confirmée) et qu'elle se
-- paie à la livraison, l'équipe qui confirme change l'adresse :
--
--   * les frais se refont pour le nouveau gouvernorat, par le même calcul
--     que la vitrine (private.chiffre_commande : la zone, le poids, le seuil
--     de livraison offerte) ; une livraison qui était offerte le reste ;
--   * p_simuler : le nouveau total se montre sans rien écrire ;
--     p_total_attendu : rien ne s'enregistre si le total a changé ;
--   * le journal de la commande garde l'ancienne adresse et la nouvelle.
-- Le nom et le numéro du client ne changent pas ici : le numéro est celui
-- que le code SMS a vérifié.
-- =====================================================================

create function public.gestion_modifier_livraison(
  p_boutique_id uuid, p_numero text, p_adresse jsonb, p_simuler boolean default true, p_total_attendu bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c       public.commandes;
  v_ligne1  text := nullif(btrim(coalesce(p_adresse ->> 'ligne1', '')), '');
  v_ligne2  text := nullif(btrim(coalesce(p_adresse ->> 'ligne2', '')), '');
  v_ville   text := nullif(btrim(coalesce(p_adresse ->> 'ville', '')), '');
  v_gouv    text := nullif(btrim(coalesce(p_adresse ->> 'gouvernorat', '')), '');
  v_cp      text := nullif(btrim(coalesce(p_adresse ->> 'code_postal', '')), '');
  v_lignes  jsonb;
  v_devis   jsonb;
  v_frais   bigint;
  v_total   bigint;
  v_avant   text;
  v_apres   text;
  v_zone    text;
begin
  if not private.est_membre(p_boutique_id, '{proprietaire,admin,confirmateur}') then
    raise exception 'Changer l''adresse revient à qui confirme la commande' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero for update;
  if not found then raise exception 'Commande introuvable' using errcode = 'no_data_found'; end if;
  if v_c.statut not in ('a_arbitrer', 'recue', 'confirmee') then return jsonb_build_object('ok', false, 'raison', 'partie'); end if;
  if v_c.mode_livraison <> 'domicile' or v_c.sur_place then return jsonb_build_object('ok', false, 'raison', 'retrait'); end if;
  if v_c.mode_paiement <> 'cod' or v_c.statut_paiement = 'paye' then return jsonb_build_object('ok', false, 'raison', 'payee'); end if;
  if v_ligne1 is null or v_ville is null or v_gouv is null then return jsonb_build_object('ok', false, 'raison', 'incomplete'); end if;
  if char_length(v_ligne1) > 200 or char_length(coalesce(v_ligne2, '')) > 200 or char_length(v_ville) > 100 then
    return jsonb_build_object('ok', false, 'raison', 'trop_long');
  end if;
  if v_cp is not null and v_cp !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'raison', 'code_postal'); end if;
  if not exists (select 1 from public.gouvernorats g where g.code = v_gouv and g.actif) then
    return jsonb_build_object('ok', false, 'raison', 'gouvernorat');
  end if;

  -- Les frais du nouveau gouvernorat, par le calcul de la vitrine, sur les articles de la commande.
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'quantite', l.quantite)), '[]'::jsonb) into v_lignes
    from public.commande_lignes l where l.boutique_id = p_boutique_id and l.commande_id = v_c.id and l.variante_id is not null;
  perform set_config('skanecom.saisie_client', coalesce(v_c.client_id::text, ''), true);
  v_devis := private.chiffre_commande(p_boutique_id, v_lignes, v_gouv, false);
  perform set_config('skanecom.saisie_client', '', true);
  if v_devis ? 'frais_livraison_millimes' is false or (v_devis ->> 'frais_livraison_millimes') is null then
    return jsonb_build_object('ok', false, 'raison', 'hors_zone');
  end if;
  v_frais := case when v_c.frais_livraison_millimes = 0 then 0 else (v_devis ->> 'frais_livraison_millimes')::bigint end;
  v_total := v_c.sous_total_millimes + v_frais - v_c.remise_millimes;
  v_zone := coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar');

  v_avant := concat_ws(', ', v_c.livraison_ligne1, v_c.livraison_ligne2, concat_ws(' ', v_c.livraison_code_postal, v_c.livraison_ville),
                       (select g.nom_fr from public.gouvernorats g where g.code = v_c.livraison_gouvernorat));
  v_apres := concat_ws(', ', v_ligne1, v_ligne2, concat_ws(' ', v_cp, v_ville), (select g.nom_fr from public.gouvernorats g where g.code = v_gouv));

  if p_simuler or p_total_attendu is distinct from v_total then
    return jsonb_build_object('ok', true, 'enregistree', false, 'total_change', not p_simuler,
      'frais_avant_millimes', v_c.frais_livraison_millimes, 'frais_livraison_millimes', v_frais, 'zone', v_zone,
      'total_avant_millimes', v_c.total_millimes, 'total_millimes', v_total, 'avant', v_avant, 'apres', v_apres);
  end if;

  update public.commandes
     set livraison_ligne1 = v_ligne1, livraison_ligne2 = v_ligne2, livraison_ville = v_ville, livraison_gouvernorat = v_gouv,
         livraison_code_postal = v_cp, livraison_zone_nom = coalesce(v_zone, livraison_zone_nom),
         frais_livraison_millimes = v_frais, total_millimes = v_total
   where boutique_id = p_boutique_id and id = v_c.id;
  insert into public.commande_evenements (boutique_id, commande_id, statut_avant, statut_apres, commentaire, auteur_id)
  values (p_boutique_id, v_c.id, v_c.statut, v_c.statut, 'Adresse changée : ' || coalesce(v_avant, '—') || ' → ' || v_apres, private.auteur());
  return jsonb_build_object('ok', true, 'enregistree', true, 'total_millimes', v_total, 'frais_livraison_millimes', v_frais);
end;
$$;
comment on function public.gestion_modifier_livraison(uuid, text, jsonb, boolean, bigint) is
  'Change l''adresse de livraison d''une commande pas encore partie, payée à la livraison : frais refaits pour le nouveau gouvernorat (livraison offerte gardée), journal tenu. p_simuler : chiffre sans écrire.';
revoke execute on function public.gestion_modifier_livraison(uuid, text, jsonb, boolean, bigint) from public, anon;
grant  execute on function public.gestion_modifier_livraison(uuid, text, jsonb, boolean, bigint) to authenticated;
