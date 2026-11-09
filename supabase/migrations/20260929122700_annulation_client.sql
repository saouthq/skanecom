-- =====================================================================
-- LE CLIENT ANNULE LUI-MÊME UNE COMMANDE PAS ENCORE CONFIRMÉE (09/11)
-- =====================================================================
-- « Je me suis trompée », « j'ai trouvé ailleurs » : la vitrine disait
-- d'appeler la boutique, qui rappelait pour rien. Un réglage, coupé par
-- défaut (certaines boutiques préfèrent rappeler pour garder la vente) :
-- allumé, « Mes commandes » propose « Annuler ma commande » tant qu'elle
-- n'est pas confirmée (reçue, ou à arbitrer). Confirmée, il faut appeler,
-- comme avant : la préparation a pu commencer.
--
-- L'annulation passe par le chemin habituel : le stock revient
-- (private.reintegre_stock_commande), le journal la trace, au nom du client.
-- Payée en ligne : non, le remboursement passe par la boutique.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('commande.annulation_client', 'booleen', null, 'false', 'commande', null, true,
     'Annulation par le client',
     'Oui = tant qu''elle n''est pas confirmée, le client annule sa commande lui-même depuis « Mes commandes » ; le stock revient. Non = il appelle la boutique.', 13);

create function public.annuler_ma_commande(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.commandes;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'raison', 'anonyme'); end if;
  if not coalesce((private.reglage(p_boutique_id, 'commande.annulation_client') #>> '{}')::boolean, false) then
    return jsonb_build_object('ok', false, 'raison', 'reglage');
  end if;
  select c.* into v_c from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = p_numero
     and c.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid())
   for update;
  if not found then return jsonb_build_object('ok', false, 'raison', 'introuvable'); end if;
  if v_c.statut = 'annulee' then return jsonb_build_object('ok', true, 'deja', true); end if;
  if v_c.statut not in ('recue', 'a_arbitrer') then return jsonb_build_object('ok', false, 'raison', 'confirmee'); end if;
  if v_c.mode_paiement <> 'cod' and v_c.statut_paiement = 'paye' then return jsonb_build_object('ok', false, 'raison', 'payee'); end if;
  update public.commandes set statut = 'annulee', motif_annulation = 'Annulée par le client, depuis son compte'
   where boutique_id = p_boutique_id and id = v_c.id;
  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.annuler_ma_commande(uuid, text) is
  'Le client connecté annule sa commande tant qu''elle n''est pas confirmée, si la boutique l''a permis (réglage commande.annulation_client). Le stock revient par le chemin habituel.';
revoke execute on function public.annuler_ma_commande(uuid, text) from public, anon;
grant  execute on function public.annuler_ma_commande(uuid, text) to authenticated;
