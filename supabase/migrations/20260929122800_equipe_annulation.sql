-- =====================================================================
-- L'ÉQUIPE PRÉVENUE QUAND LE CLIENT ANNULE (09/11, parcours en vrai)
-- =====================================================================
-- Le client annule lui-même une commande pas encore confirmée (réglage
-- commande.annulation_client, lot 45) : avec « Prévenir l'équipe par
-- e-mail » (commande.courriel_equipe), le propriétaire et les
-- administrateurs le reçoivent, comme une nouvelle commande — sans quoi
-- l'équipe pouvait la préparer pour rien.
-- =====================================================================

alter table public.courriels_commandes drop constraint if exists courriels_commandes_evenement_check;
alter table public.courriels_commandes add constraint courriels_commandes_evenement_check
  check (evenement in ('recue', 'confirmee', 'expediee', 'livree', 'annulee', 'equipe', 'equipe_annulee'));

update plateforme.reglages_catalogue
   set description_fr = 'Oui = chaque commande passée sur la vitrine part par e-mail au propriétaire et aux administrateurs de la boutique, et chaque commande que le client annule lui-même. Non = l''équipe la voit dans le backoffice.'
 where cle = 'commande.courriel_equipe';

create or replace function private.courriels_suivre_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evenement text;
begin
  if tg_op = 'UPDATE' and new.statut = old.statut then
    return new;
  end if;
  -- Une vente au comptoir : le client est là, il repart avec.
  if new.sur_place then
    return new;
  end if;
  if coalesce((private.reglage(new.boutique_id, 'commande.courriels_client'))::boolean, false) then
    v_evenement := case new.statut::text
      when 'recue' then 'recue' when 'a_arbitrer' then 'recue' when 'confirmee' then 'confirmee'
      when 'expediee' then 'expediee' when 'livree' then 'livree' when 'annulee' then 'annulee' end;
    if v_evenement is not null then
      insert into public.courriels_commandes (boutique_id, commande_id, evenement)
      values (new.boutique_id, new.id, v_evenement)
      on conflict (commande_id, evenement) do nothing;
    end if;
  end if;
  if tg_op = 'INSERT' and new.origine = 'vitrine'
     and coalesce((private.reglage(new.boutique_id, 'commande.courriel_equipe'))::boolean, false) then
    insert into public.courriels_commandes (boutique_id, commande_id, evenement)
    values (new.boutique_id, new.id, 'equipe')
    on conflict (commande_id, evenement) do nothing;
  end if;
  -- Le client l'a annulée lui-même (réglage commande.annulation_client) : l'équipe le sait aussi.
  if tg_op = 'UPDATE' and new.statut = 'annulee' and old.statut in ('recue', 'a_arbitrer')
     and new.motif_annulation = 'Annulée par le client, depuis son compte'
     and coalesce((private.reglage(new.boutique_id, 'commande.courriel_equipe'))::boolean, false) then
    insert into public.courriels_commandes (boutique_id, commande_id, evenement)
    values (new.boutique_id, new.id, 'equipe_annulee')
    on conflict (commande_id, evenement) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.courriels_commandes_file(p_boutique_id uuid default null, p_limite integer default 10)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e      public.courriels_commandes;
  v_c      public.commandes;
  v_a      text[];
  v_sortie jsonb := '[]'::jsonb;
begin
  for v_e in
    select * from public.courriels_commandes e
     where e.etat = 'a_envoyer' and e.prochain_essai <= now()
       and (p_boutique_id is null or e.boutique_id = p_boutique_id)
     order by e.id
     limit least(greatest(coalesce(p_limite, 10), 1), 50)
     for update skip locked
  loop
    select * into v_c from public.commandes c where c.id = v_e.commande_id;
    if v_e.evenement in ('equipe', 'equipe_annulee') then
      select array_agg(distinct u.email) into v_a
        from plateforme.membres m join auth.users u on u.id = m.user_id
       where m.boutique_id = v_e.boutique_id and m.actif and m.role in ('proprietaire', 'admin') and u.email is not null;
    else
      -- L'adresse du compte (vérifiée par un code) ; pour une commande saisie
      -- par l'équipe, celle qu'elle a notée.
      select array_remove(array[coalesce(
               (select u.email from public.clients cl join auth.users u on u.id = cl.user_id where cl.id = v_c.client_id),
               case when v_c.origine = 'manuelle' then v_c.contact_email end)], null) into v_a;
    end if;
    if coalesce(cardinality(v_a), 0) = 0 then
      update public.courriels_commandes set etat = 'sans_adresse', fait_le = now() where id = v_e.id;
      continue;
    end if;
    update public.courriels_commandes set essais = essais + 1, prochain_essai = now() + interval '2 minutes' where id = v_e.id;
    v_sortie := v_sortie || jsonb_build_object(
      'id', v_e.id,
      'evenement', v_e.evenement,
      'a', to_jsonb(v_a),
      'boutique', (select jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom) from plateforme.boutiques b where b.id = v_e.boutique_id),
      'commande', jsonb_build_object(
        'numero', v_c.numero, 'statut', v_c.statut, 'origine', v_c.origine, 'mode_paiement', v_c.mode_paiement,
        'mode_livraison', v_c.mode_livraison, 'contact_nom', v_c.contact_nom, 'contact_telephone', v_c.contact_telephone,
        'livraison', jsonb_build_object('ligne1', v_c.livraison_ligne1, 'ligne2', v_c.livraison_ligne2, 'ville', v_c.livraison_ville,
                                        'gouvernorat', coalesce((select g.nom_fr from public.gouvernorats g where g.code = v_c.livraison_gouvernorat), v_c.livraison_gouvernorat),
                                        'code_postal', v_c.livraison_code_postal),
        'sous_total_millimes', v_c.sous_total_millimes, 'frais_livraison_millimes', v_c.frais_livraison_millimes,
        'remise_millimes', v_c.remise_millimes, 'total_millimes', v_c.total_millimes, 'code_promo', v_c.code_promo,
        'transporteur', v_c.transporteur, 'numero_suivi', v_c.numero_suivi, 'motif_annulation', v_c.motif_annulation,
        'cree_le', v_c.created_at),
      'lignes', coalesce((
        select jsonb_agg(jsonb_build_object('nom', l.produit_nom, 'detail', l.variante_libelle, 'quantite', l.quantite,
                                            'total_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'precommande', l.precommande)
                         order by l.created_at, l.id)
          from public.commande_lignes l where l.commande_id = v_c.id), '[]'::jsonb));
  end loop;
  return v_sortie;
end;
$$;
