-- =====================================================================
-- LES FRAIS DU DEVIS, DITS AU TUNNEL (07/11, parcours joué en vrai)
-- =====================================================================
-- Au tunnel d'un devis, la carte « Livraison à domicile » disait « Les
-- frais dépendent du gouvernorat » alors que la boutique avait offert la
-- livraison (le récapitulatif, lui, disait « Offerte »). Le tunnel apprend
-- ce que le devis a fixé : null = les frais habituels de la boutique (selon
-- la zone), 0 = offerte, sinon le montant convenu.
-- =====================================================================

create or replace function public.chiffre_devis(p_boutique_id uuid, p_numero text, p_gouvernorat text default null, p_mode text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_devis  public.devis := private.mon_devis_ouvert(p_boutique_id, p_numero);
  v_lignes jsonb;
  v_res    jsonb;
begin
  if coalesce(p_mode, 'domicile') not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  select jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'quantite', l.quantite) order by l.position)
    into v_lignes from public.devis_lignes l where l.boutique_id = p_boutique_id and l.devis_id = v_devis.id;
  perform set_config('skanecom.devis_id', v_devis.id::text, true);
  v_res := private.chiffre_commande(p_boutique_id, v_lignes, nullif(btrim(p_gouvernorat), ''), coalesce(p_mode = 'retrait', false));
  perform set_config('skanecom.devis_id', '', true);
  return v_res || jsonb_build_object('devis', jsonb_build_object(
    'numero', v_devis.numero, 'valide_jusqu_au', v_devis.valide_jusqu_au, 'note', v_devis.note_boutique,
    'frais_livraison_millimes', v_devis.frais_livraison_millimes));
end;
$$;
