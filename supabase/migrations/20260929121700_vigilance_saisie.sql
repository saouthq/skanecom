-- =====================================================================
-- CE QU'IL FAUT SAVOIR EN SAISISSANT SA COMMANDE (07/11, parcours en vrai)
-- =====================================================================
-- Un client surveillé appelle la boutique ; la gérante saisit sa commande
-- au téléphone. Le formulaire le reconnaissait à son numéro et disait
-- « surveillé » — sans le pourquoi, ni la note de l'équipe (« toujours
-- demander un second numéro »), qu'elle aurait dû avoir sous les yeux
-- pendant l'appel. La recherche du client rend désormais l'une et l'autre,
-- comme la fiche de la commande (migration …_vigilance_appel).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Le client reconnu à son numéro : la note et la vigilance (migration 112200, reprise)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestion_saisie_client(p_boutique_id uuid, p_telephone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tel    text;
  v_client public.clients;
begin
  perform private.catalogue_exige(p_boutique_id, private.saisie_roles());
  v_tel := private.telephone_tunisien(p_telephone);
  if v_tel is null then
    return null;
  end if;
  select * into v_client from public.clients c
   where c.boutique_id = p_boutique_id and c.telephone = v_tel
   order by (c.user_id is not null) desc, c.created_at
   limit 1;
  if not found then
    return jsonb_build_object('telephone', v_tel, 'connu', false);
  end if;
  return jsonb_build_object(
    'connu', true, 'id', v_client.id, 'nom', v_client.nom, 'telephone', v_tel, 'email', v_client.email,
    'compte', v_client.user_id is not null, 'nb_commandes', v_client.nb_commandes, 'nb_refus', v_client.nb_refus,
    'niveau_risque', v_client.niveau_risque, 'depuis', v_client.created_at,
    'note', nullif(btrim(coalesce(v_client.note_interne, '')), ''),
    'vigilance', case when v_client.niveau_risque <> 'normal' then (
      select jsonb_build_object('motif', ja.apres ->> 'motif', 'le', ja.at,
                                'auteur', (select u.email from auth.users u where u.id = ja.acteur))
        from plateforme.journal_audit ja
       where ja.boutique_id = p_boutique_id and ja.action = 'clients.confiance' and ja.cible = v_client.id::text
         and ja.apres ->> 'niveau' = v_client.niveau_risque
       order by ja.at desc, ja.id desc limit 1) end,
    'pro', (select cp.raison_sociale from public.comptes_pro cp
             where cp.boutique_id = p_boutique_id and cp.client_id = v_client.id and cp.statut = 'valide'
               and private.comptes_pro_actif(p_boutique_id) and v_client.niveau_risque <> 'bloque'),
    'adresse', (select jsonb_build_object('ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
                                          'gouvernorat', c.livraison_gouvernorat, 'code_postal', c.livraison_code_postal)
                  from public.commandes c
                 where c.boutique_id = p_boutique_id and c.mode_livraison = 'domicile'
                   and (c.client_id = v_client.id or c.contact_telephone = v_tel)
                 order by c.created_at desc limit 1));
end;
$function$;
