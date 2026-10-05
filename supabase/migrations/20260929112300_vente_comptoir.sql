-- =====================================================================
-- SkanEcom — 84 · LA VENTE AU COMPTOIR, ET LES CANAUX AU TABLEAU DE BORD
-- =====================================================================
--
-- Suite de la saisie des commandes (migration 83).
--
--   · La vente au comptoir : le client est au magasin, il paie et repart
--     avec ses articles. L'équipe la saisit (canal « magasin », « Remis sur
--     place ») : sans adresse ni frais de livraison, confirmée, prête,
--     remise et payée d'un geste — chaque étape au journal, le stock
--     réservé, la facture SkanFact et son encaissement comme d'habitude.
--     Elle est rangée avec les retraits (une commande remise au magasin,
--     marquée « sur place ») ; l'argent, réglé au comptoir, n'attend aucun
--     versement de livreur. Il n'y faut pas le module de retrait.
--   · Le tableau de bord dit d'où viennent les commandes : la vitrine, ou le
--     canal de celles que l'équipe saisit (WhatsApp, téléphone, Instagram…),
--     avec ce qu'elles ont encaissé.
--   · Ses taux restent justes : une commande confirmée à l'instant où elle
--     naît (confirmation automatique, saisie confirmée avec le client) ne
--     compte plus dans la vitesse ni le taux de confirmation de l'équipe ;
--     une vente au comptoir ne fait pas baisser le taux de refus des colis.
-- =====================================================================

alter table public.commandes
  add column sur_place boolean not null default false,
  add constraint commandes_sur_place check (not sur_place or (origine = 'manuelle' and mode_livraison = 'retrait'));

comment on column public.commandes.sur_place is
  'Une vente au comptoir : saisie par l''équipe au magasin, remise et payée sur place (mode de livraison retrait).';


-- ---------------------------------------------------------------------
-- Le chiffrage d'une saisie : au comptoir, ni livraison ni frais (migration 83, reprise)
-- ---------------------------------------------------------------------
create or replace function private.chiffre_saisie(p_boutique_id uuid, p_client_id uuid, p_lignes jsonb, p_livraison jsonb, p_ajustements jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_livraison jsonb := case when jsonb_typeof(p_livraison) = 'object' then p_livraison else '{}'::jsonb end;
  v_ajust     jsonb := case when jsonb_typeof(p_ajustements) = 'object' then p_ajustements else '{}'::jsonb end;
  v_mode      text := coalesce(nullif(btrim(v_livraison ->> 'mode'), ''), 'domicile');
  v_gouv      text := nullif(btrim(v_livraison ->> 'gouvernorat'), '');
  v_remise_tx text := nullif(btrim(coalesce(v_ajust ->> 'remise_millimes', '')), '');
  v_remise    bigint;
  v_offerte   boolean := coalesce(v_ajust -> 'livraison_offerte' = 'true'::jsonb, false);
  v_devis     jsonb;
  v_frais     bigint;
begin
  if v_mode not in ('domicile', 'retrait', 'comptoir') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  if v_remise_tx is not null and v_remise_tx !~ '^[0-9]{1,12}$' then
    raise exception 'La remise est illisible' using errcode = 'check_violation', hint = 'remise';
  end if;
  v_remise := coalesce(v_remise_tx::bigint, 0);
  if (v_remise > 0 or v_offerte) and not private.est_membre(p_boutique_id, '{proprietaire,admin}') then
    raise exception 'Seule la direction accorde une remise ou offre la livraison'
      using errcode = 'insufficient_privilege', hint = 'ajustement';
  end if;

  perform set_config('skanecom.saisie_client', coalesce(p_client_id::text, ''), true);
  v_devis := private.chiffre_commande(p_boutique_id, p_lignes, case when v_mode = 'domicile' then v_gouv end, v_mode = 'retrait');
  perform set_config('skanecom.saisie_client', '', true);

  if v_remise > (v_devis ->> 'sous_total_millimes')::bigint then
    raise exception 'La remise dépasse le prix des articles' using errcode = 'check_violation', hint = 'remise';
  end if;
  -- Au comptoir, le client repart avec ses articles : ni livraison, ni frais.
  if v_mode = 'comptoir' then
    v_offerte := false;
    v_devis := v_devis || jsonb_build_object('frais_livraison_millimes', 0, 'mode', 'comptoir', 'zone', null, 'supplement_poids_millimes', 0);
  end if;
  v_frais := case when v_offerte then 0 else (v_devis ->> 'frais_livraison_millimes')::bigint end;

  return v_devis || jsonb_build_object(
    'frais_boutique_millimes',  (v_devis ->> 'frais_livraison_millimes')::bigint,
    'frais_livraison_millimes', v_frais,
    'livraison_offerte',        v_offerte and (v_devis ->> 'frais_livraison_millimes')::bigint > 0,
    'remise_millimes',          v_remise,
    'total_millimes',           (v_devis ->> 'sous_total_millimes')::bigint + v_frais - v_remise);
end;
$$;



-- ---------------------------------------------------------------------
-- Saisir la commande : la vente au comptoir (migration 83, reprise)
-- ---------------------------------------------------------------------
create or replace function public.gestion_saisir_commande(
  p_boutique_id            uuid,
  p_cle_idempotence        text,
  p_canal                  text,
  p_client                 jsonb,
  p_lignes                 jsonb,
  p_livraison              jsonb,
  p_ajustements            jsonb,
  p_confirmee              boolean,
  p_note                   text,
  p_total_attendu_millimes bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contact   jsonb := case when jsonb_typeof(p_client) = 'object' then p_client else '{}'::jsonb end;
  v_adresse   jsonb := case when jsonb_typeof(p_livraison) = 'object' then p_livraison else '{}'::jsonb end;
  v_tel       text;
  v_nom       text := nullif(btrim(v_contact ->> 'nom'), '');
  v_email     text := nullif(lower(btrim(v_contact ->> 'email')), '');
  v_mode      text := coalesce(nullif(btrim(v_adresse ->> 'mode'), ''), 'domicile');
  v_ligne1    text := nullif(btrim(v_adresse ->> 'ligne1'), '');
  v_ligne2    text := nullif(btrim(v_adresse ->> 'ligne2'), '');
  v_ville     text := nullif(btrim(v_adresse ->> 'ville'), '');
  v_gouv      text := nullif(btrim(v_adresse ->> 'gouvernorat'), '');
  v_cp        text := nullif(btrim(v_adresse ->> 'code_postal'), '');
  v_note      text := nullif(btrim(p_note), '');
  v_existante public.commandes;
  v_client    public.clients;
  v_devis     jsonb;
  v_commande  public.commandes;
begin
  perform private.catalogue_exige(p_boutique_id, private.saisie_roles());
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  if p_cle_idempotence is null or p_cle_idempotence !~ '^[A-Za-z0-9-]{16,100}$' then
    raise exception 'Clé d''idempotence invalide' using errcode = 'check_violation', hint = 'cle';
  end if;

  -- Deux envois de la même saisie (double clic, réseau coupé) : une commande.
  perform pg_advisory_xact_lock(hashtextextended('saisie:' || p_boutique_id::text || ':' || p_cle_idempotence, 0));
  select * into v_existante from public.commandes c
   where c.boutique_id = p_boutique_id and c.cle_idempotence = p_cle_idempotence;
  if found then
    if v_existante.origine <> 'manuelle' or v_existante.saisie_par is distinct from auth.uid() then
      raise exception 'Cette clé appartient à une autre commande' using errcode = 'unique_violation', hint = 'cle';
    end if;
    return jsonb_build_object('numero', v_existante.numero, 'statut', v_existante.statut, 'sur_place', v_existante.sur_place,
                              'total_millimes', v_existante.total_millimes, 'rejouee', true);
  end if;

  if p_canal is null or p_canal not in ('telephone', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'magasin', 'autre') then
    raise exception 'Dites d''où vient la commande' using errcode = 'check_violation', hint = 'canal';
  end if;
  v_tel := private.telephone_tunisien(v_contact ->> 'telephone');
  if v_tel is null then
    raise exception 'Numéro de téléphone tunisien attendu (8 chiffres)' using errcode = 'check_violation', hint = 'telephone';
  end if;
  if v_nom is null or char_length(v_nom) not between 2 and 80 then
    raise exception 'Indiquez le nom du client' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Adresse e-mail illisible' using errcode = 'check_violation', hint = 'email';
  end if;
  if v_mode not in ('domicile', 'retrait', 'comptoir') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  if v_mode = 'comptoir' and p_canal <> 'magasin' then
    raise exception 'Une vente au comptoir se fait au magasin' using errcode = 'check_violation', hint = 'comptoir';
  end if;
  if v_mode in ('retrait', 'comptoir') then
    v_ligne1 := null; v_ligne2 := null; v_ville := null; v_gouv := null; v_cp := null;
  else
    if v_ligne1 is null or char_length(v_ligne1) not between 3 and 200 or char_length(coalesce(v_ligne2, '')) > 200 then
      raise exception 'Indiquez l''adresse de livraison' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_ville is null or char_length(v_ville) not between 2 and 80 then
      raise exception 'Indiquez la ville ou la délégation' using errcode = 'check_violation', hint = 'ville';
    end if;
    if v_gouv is null then
      raise exception 'Choisissez le gouvernorat' using errcode = 'check_violation', hint = 'gouvernorat';
    end if;
    if v_cp is not null and v_cp !~ '^[0-9]{4}$' then
      raise exception 'Le code postal compte 4 chiffres' using errcode = 'check_violation', hint = 'code_postal';
    end if;
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'La note compte 500 caractères au plus' using errcode = 'check_violation', hint = 'note';
  end if;

  -- Le client du numéro (son compte d'abord), sinon une fiche neuve.
  perform pg_advisory_xact_lock(hashtextextended('commande:' || p_boutique_id::text || ':' || v_tel, 0));
  select * into v_client from public.clients c
   where c.boutique_id = p_boutique_id and c.telephone = v_tel
   order by (c.user_id is not null) desc, c.created_at
   limit 1;
  if not found then
    insert into public.clients (boutique_id, nom, telephone, email)
    values (p_boutique_id, v_nom, v_tel, v_email)
    returning * into v_client;
  elsif v_client.email is null and v_email is not null then
    update public.clients set email = v_email where boutique_id = p_boutique_id and id = v_client.id
    returning * into v_client;
  end if;

  -- Les variantes, verrouillées dans un ordre stable, puis le chiffrage.
  perform 1 from public.variantes v
   where v.boutique_id = p_boutique_id
     and v.id in (select d.variante_id from private.lignes_panier(p_lignes) d)
   order by v.id
   for update;
  v_devis := private.chiffre_saisie(p_boutique_id, v_client.id, p_lignes,
                                    jsonb_build_object('mode', v_mode, 'gouvernorat', v_gouv), p_ajustements);
  if not (v_devis ->> 'complet')::boolean then
    raise exception 'Un article n''est plus disponible dans la quantité demandée'
      using errcode = 'check_violation', hint = 'stock', detail = (v_devis -> 'lignes')::text;
  end if;
  if p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception 'Le total a changé : % millimes', v_devis ->> 'total_millimes'
      using errcode = 'check_violation', hint = 'total', detail = v_devis::text;
  end if;

  insert into public.commandes (
    boutique_id, cle_idempotence, origine, canal, saisie_par, client_id, statut, mode_paiement, statut_paiement, mode_livraison, sur_place,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes, transporteur, note_interne)
  values (
    p_boutique_id, p_cle_idempotence, 'manuelle', p_canal, auth.uid(), v_client.id, 'recue', 'cod', 'en_attente',
    case when v_mode = 'comptoir' then 'retrait' else v_mode end, v_mode = 'comptoir',
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
    (v_devis ->> 'remise_millimes')::bigint, (v_devis ->> 'total_millimes')::bigint,
    case when v_mode = 'domicile' then nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), '') end,
    v_note)
  returning * into v_commande;

  -- Les lignes figent nom, libellé, référence et prix ; le trigger réserve le stock.
  insert into public.commande_lignes
    (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
     prix_unitaire_millimes, quantite, total_ligne_millimes)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint
  from jsonb_array_elements(v_devis -> 'lignes') l;

  -- Confirmée avec le client pendant l'échange : elle part en préparation.
  -- Au comptoir : confirmée, prête, remise et payée, d'un geste (chaque étape
  -- au journal, la facture SkanFact et son encaissement comme d'habitude).
  if coalesce(p_confirmee, false) or v_mode = 'comptoir' then
    update public.commandes set statut = 'confirmee'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;
  if v_mode = 'comptoir' then
    update public.commandes set statut = 'expediee'
     where boutique_id = p_boutique_id and id = v_commande.id;
    update public.commandes set statut = 'livree', statut_paiement = 'paye'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;

  return jsonb_build_object('numero', v_commande.numero, 'statut', v_commande.statut, 'sur_place', v_commande.sur_place,
                            'total_millimes', v_commande.total_millimes, 'rejouee', false);
end;
$$;



-- ---------------------------------------------------------------------
-- La fiche de la commande : vendue au comptoir (migration 83, reprise)
-- ---------------------------------------------------------------------
create or replace function public.gestion_commande(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
  v_resultat jsonb;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  select * into v_commande from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'numero', c.numero, 'statut', c.statut, 'origine', c.origine, 'cree_le', c.created_at,
    'canal', c.canal, 'saisie_par', (select u.email from auth.users u where u.id = c.saisie_par), 'sur_place', c.sur_place,
    'mode_paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
    'mode_livraison', c.mode_livraison,
    'retrait', case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'contact', jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'livraison', jsonb_build_object(
      'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
      'code_postal', c.livraison_code_postal, 'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
      'zone', c.livraison_zone_nom),
    'sous_total_millimes', c.sous_total_millimes, 'frais_livraison_millimes', c.frais_livraison_millimes,
    'remise_millimes', c.remise_millimes, 'code_promo', c.code_promo, 'total_millimes', c.total_millimes,
    'transporteur', c.transporteur, 'numero_suivi', c.numero_suivi,
    'refus_origine', c.refus_origine, 'refus_commentaire', c.refus_commentaire, 'motif_annulation', c.motif_annulation,
    'note_client', c.note_client, 'note_interne', c.note_interne,
    'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at, 'cloturee_le', c.cloturee_at,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes, 'stock_restant', v.stock,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at limit 1)))
             order by l.created_at, l.produit_nom)
      from public.commande_lignes l
      left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
      where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object(
               'le', e.created_at, 'avant', e.statut_avant, 'apres', e.statut_apres,
               'origine_refus', e.origine_refus, 'commentaire', e.commentaire, 'auteur', u.email)
             order by e.created_at)
      from public.commande_evenements e
      left join auth.users u on u.id = e.auteur_id
      where e.boutique_id = c.boutique_id and e.commande_id = c.id), '[]'::jsonb),
    'appels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'le', k.created_at, 'canal', k.canal, 'resultat', k.resultat, 'note', k.note, 'auteur', u.email)
             order by k.created_at)
      from public.confirmations k
      left join auth.users u on u.id = k.auteur_id
      where k.boutique_id = c.boutique_id and k.commande_id = c.id), '[]'::jsonb),
    'client', (
      select jsonb_build_object(
               'nom', cl.nom, 'telephone', cl.telephone, 'compte', cl.user_id is not null,
               'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus, 'niveau_risque', cl.niveau_risque,
               'depuis', cl.created_at)
      from public.clients cl where cl.boutique_id = c.boutique_id and cl.id = c.client_id),
    'autres', coalesce((
      select jsonb_agg(jsonb_build_object('numero', o.numero, 'statut', o.statut, 'cree_le', o.created_at,
                                          'total_millimes', o.total_millimes) order by o.created_at desc)
      from (select * from public.commandes o
            where o.boutique_id = c.boutique_id and o.id <> c.id
              and (o.contact_telephone = c.contact_telephone or (c.client_id is not null and o.client_id = c.client_id))
            order by o.created_at desc limit 5) o), '[]'::jsonb)
  )
  into v_resultat
  from public.commandes c
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id and c.id = v_commande.id;

  return v_resultat;
end;
$$;



-- ---------------------------------------------------------------------
-- Le tableau de bord : les canaux, des taux qui restent justes (migration 31, reprise)
-- ---------------------------------------------------------------------
create or replace function public.gestion_tableau_de_bord(p_boutique_id uuid, p_jours integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours   integer := case when p_jours in (7, 30, 90) then p_jours else 30 end;
  v_aujourd date := (now() at time zone 'Africa/Tunis')::date;
  v_debut   timestamptz := ((v_aujourd - (v_jours - 1)) :: timestamp) at time zone 'Africa/Tunis';
  v_avant   timestamptz := ((v_aujourd - (2 * v_jours - 1)) :: timestamp) at time zone 'Africa/Tunis';
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');

  return (
    with periode as (
      select c.*, case when c.created_at >= v_debut then 'courante' else 'precedente' end as tranche
        from public.commandes c
       where c.boutique_id = p_boutique_id and c.created_at >= v_avant and c.statut <> 'a_arbitrer'
    ), chiffres as (
      select p.tranche,
             count(*)                                                        as recues,
             count(*) filter (where p.confirmee_at is not null)              as confirmees,
             -- Confirmées à l'instant même où elles sont nées (confirmation automatique, saisie
             -- confirmée avec le client) : elles ne disent rien de la vitesse de l'équipe.
             count(*) filter (where p.confirmee_at = p.created_at)           as d_emblee,
             count(*) filter (where p.statut = 'livree')                     as livrees,
             -- Un colis livré : pas une vente remise au comptoir (rien n'a pu y être refusé).
             count(*) filter (where p.statut = 'livree' and not p.sur_place) as livres_colis,
             count(*) filter (where p.statut = 'refusee')                    as refusees,
             count(*) filter (where p.statut = 'annulee')                    as annulees,
             count(*) filter (where p.statut in ('recue', 'confirmee', 'expediee')) as en_cours,
             count(*) filter (where p.statut = 'recue')                      as a_confirmer,
             coalesce(sum(p.total_millimes) filter (where p.statut = 'livree'), 0)  as encaisse,
             coalesce(sum(p.total_millimes) filter (where p.statut = 'refusee'), 0) as perdu,
             coalesce(round(avg(p.total_millimes) filter (where p.statut <> 'annulee')), 0) as panier_moyen,
             percentile_cont(0.5) within group (order by extract(epoch from p.confirmee_at - p.created_at) / 60)
               filter (where p.confirmee_at is not null and p.confirmee_at <> p.created_at) as confirmation_minutes
        from periode p group by p.tranche
    ), synthese as (
      select c.tranche, jsonb_build_object(
               'recues', c.recues, 'confirmees', c.confirmees, 'livrees', c.livrees, 'refusees', c.refusees,
               'annulees', c.annulees, 'en_cours', c.en_cours, 'a_confirmer', c.a_confirmer,
               'encaisse_millimes', c.encaisse, 'perdu_millimes', c.perdu, 'panier_moyen_millimes', c.panier_moyen,
               -- Confirmées parmi les commandes tranchées (confirmées, ou annulées sans l'être).
               'taux_confirmation', case when c.recues - c.a_confirmer - c.d_emblee > 0
                                         then round((c.confirmees - c.d_emblee)::numeric / (c.recues - c.a_confirmer - c.d_emblee), 3) end,
               -- Refusées parmi les colis arrivés au bout (livrés ou refusés).
               'taux_refus', case when c.livres_colis + c.refusees > 0 then round(c.refusees::numeric / (c.livres_colis + c.refusees), 3) end,
               'confirmation_minutes', round(c.confirmation_minutes::numeric)) as j
        from chiffres c
    )
    select jsonb_build_object(
      'jours', v_jours,
      'du', v_aujourd - (v_jours - 1),
      'au', v_aujourd,
      'courante', coalesce((select s.j from synthese s where s.tranche = 'courante'), '{}'::jsonb),
      'precedente', coalesce((select s.j from synthese s where s.tranche = 'precedente'), '{}'::jsonb),
      'par_jour', (
        select jsonb_agg(jsonb_build_object(
                 'jour', d.jour,
                 'recues', (select count(*) from periode p where p.tranche = 'courante' and (p.created_at at time zone 'Africa/Tunis')::date = d.jour),
                 'livrees', (select count(*) from periode p where p.tranche = 'courante' and p.statut = 'livree'
                                and (p.created_at at time zone 'Africa/Tunis')::date = d.jour))
               order by d.jour)
          from (select gs::date as jour
                  from generate_series((v_aujourd - (v_jours - 1))::timestamp, v_aujourd::timestamp, interval '1 day') gs) d),
      'refus_origines', coalesce((
        select jsonb_agg(jsonb_build_object('origine', x.origine, 'refus', x.n) order by x.n desc, x.origine)
          from (select p.refus_origine::text as origine, count(*) as n from periode p
                 where p.tranche = 'courante' and p.statut = 'refusee' group by 1) x), '[]'::jsonb),
      'gouvernorats', coalesce((
        select jsonb_agg(jsonb_build_object('code', x.code, 'nom', x.nom, 'arrivees', x.arrivees, 'refusees', x.refusees,
                                            'taux_refus', round(x.refusees::numeric / x.arrivees, 3))
                         order by x.refusees desc, x.arrivees desc, x.nom)
          from (select p.livraison_gouvernorat as code, coalesce(g.nom_fr, p.livraison_gouvernorat) as nom,
                       count(*) as arrivees, count(*) filter (where p.statut = 'refusee') as refusees
                  from periode p left join public.gouvernorats g on g.code = p.livraison_gouvernorat
                 where p.tranche = 'courante' and p.statut in ('livree', 'refusee') and p.mode_livraison = 'domicile'
                 group by 1, 2 order by 4 desc, 3 desc limit 6) x), '[]'::jsonb),
      -- D'où viennent les commandes : la vitrine, ou le canal de celles que l'équipe saisit.
      'canaux', coalesce((
        select jsonb_agg(jsonb_build_object('canal', x.canal, 'commandes', x.n, 'livrees', x.l, 'encaisse_millimes', x.e)
                         order by x.n desc, x.e desc, x.canal)
          from (select case when p.origine = 'manuelle' then p.canal else p.origine::text end as canal,
                       count(*) as n, count(*) filter (where p.statut = 'livree') as l,
                       coalesce(sum(p.total_millimes) filter (where p.statut = 'livree'), 0) as e
                  from periode p where p.tranche = 'courante' group by 1) x), '[]'::jsonb),
      'produits', coalesce((
        select jsonb_agg(jsonb_build_object('produit', x.produit, 'quantite', x.q, 'montant_millimes', x.m) order by x.q desc, x.produit)
          from (select l.produit_nom as produit, sum(l.quantite) as q, sum(l.total_ligne_millimes) as m
                  from periode p join public.commande_lignes l on l.boutique_id = p.boutique_id and l.commande_id = p.id
                 where p.tranche = 'courante' and p.statut = 'livree'
                 group by 1 order by 2 desc, 1 limit 5) x), '[]'::jsonb)
    )
  );
end;
$$;

