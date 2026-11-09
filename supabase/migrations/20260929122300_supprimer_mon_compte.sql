-- =====================================================================
-- SUPPRIMER MON COMPTE (09/11, parcours en vrai)
-- =====================================================================
-- Une cliente ne pouvait pas supprimer son compte : rien ne le permettait,
-- ni à la vitrine ni au backoffice. Désormais, depuis « Mon compte » :
--
--   * refusé tant qu'une commande n'est pas close (à confirmer, confirmée,
--     expédiée), qu'une demande de SAV est ouverte ou qu'un devis attend :
--     la boutique en a besoin pour la mener à son terme ;
--   * dans CETTE boutique, s'effacent : le lien du compte à sa fiche, ses
--     adresses enregistrées, ses favoris, son panier suivi, son inscription
--     à la lettre, ses alertes « Prévenez-moi » ;
--   * restent : la fiche et l'historique des commandes (des pièces de la
--     boutique, sa comptabilité) — comme le prévoyait clients.user_id
--     (« compte supprimé : la fiche et l'historique restent »). Un compte
--     recréé au même numéro les retrouve (rattacher_mon_client) ;
--   * l'identifiant de connexion lui-même (auth.users) n'est effacé que si
--     plus rien ne le rattache : ni la fiche d'une autre boutique de la
--     plateforme (le même numéro peut y être client), ni une équipe, ni la
--     console. Sinon, seule cette boutique l'oublie.
-- =====================================================================

create function public.supprimer_mon_compte(p_boutique_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client uuid;
  v_tel text;
  v_email text;
  v_ailleurs boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'raison', 'anonyme');
  end if;
  select c.id, c.telephone, c.email into v_client, v_tel, v_email
    from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid
   for update;
  select coalesce(v_email, u.email) into v_email from auth.users u where u.id = v_uid;

  if v_client is not null then
    if exists (select 1 from public.commandes o where o.boutique_id = p_boutique_id and o.client_id = v_client
                and o.statut in ('a_arbitrer', 'recue', 'confirmee', 'expediee')) then
      return jsonb_build_object('ok', false, 'raison', 'commande');
    end if;
    if exists (select 1 from public.sav_demandes s where s.boutique_id = p_boutique_id and s.client_id = v_client
                and s.statut in ('nouvelle', 'en_cours')) then
      return jsonb_build_object('ok', false, 'raison', 'sav');
    end if;
    if exists (select 1 from public.devis d where d.boutique_id = p_boutique_id and d.client_id = v_client
                and d.statut in ('demande', 'envoye')) then
      return jsonb_build_object('ok', false, 'raison', 'devis');
    end if;
    delete from public.adresses a where a.boutique_id = p_boutique_id and a.client_id = v_client;
    update public.clients set user_id = null where boutique_id = p_boutique_id and id = v_client;
  end if;

  delete from public.favoris f where f.boutique_id = p_boutique_id and f.user_id = v_uid;
  delete from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.user_id = v_uid;
  update public.lettre_abonnes l
     set statut = 'desinscrit', desinscrit_le = now(), desinscrit_par = 'abonne', email = null, jeton_hash = null
   where l.boutique_id = p_boutique_id and l.statut <> 'desinscrit' and v_email is not null and l.email = lower(v_email);
  update public.alertes_retour r
     set statut = 'annulee', close_le = now(), telephone = null, email = null
   where r.boutique_id = p_boutique_id and r.statut in ('attend', 'a_prevenir')
     and ((v_tel is not null and r.telephone = v_tel) or (v_email is not null and lower(r.email) = lower(v_email)));

  v_ailleurs := exists (select 1 from public.clients c where c.user_id = v_uid)
             or exists (select 1 from plateforme.membres m where m.user_id = v_uid)
             or exists (select 1 from plateforme.administrateurs a where a.user_id = v_uid);
  if not v_ailleurs then
    -- Ses sessions, ses facteurs, ses identités partent avec lui (on delete cascade).
    delete from auth.users u where u.id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'compte_efface', not v_ailleurs);
end;
$$;
comment on function public.supprimer_mon_compte(uuid) is
  'Depuis « Mon compte » : oublie le compte connecté dans cette boutique (lien à la fiche, adresses, favoris, panier suivi, lettre, alertes), la fiche et l''historique des commandes restant à la boutique ; refusé tant qu''une commande, une demande de SAV ou un devis est en cours. L''identifiant de connexion n''est effacé que si plus rien ne le rattache (autre boutique, équipe, console).';
revoke execute on function public.supprimer_mon_compte(uuid) from public, anon;
grant  execute on function public.supprimer_mon_compte(uuid) to authenticated;
