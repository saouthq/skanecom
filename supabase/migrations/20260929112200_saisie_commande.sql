-- =====================================================================
-- SkanEcom — 83 · L'ÉQUIPE SAISIT UNE COMMANDE REÇUE HORS DE LA VITRINE
-- =====================================================================
--
-- En Tunisie, une bonne part des ventes arrive par téléphone, WhatsApp,
-- Instagram, Facebook, TikTok, ou se fait au magasin. L'équipe la saisit au
-- backoffice (Commandes → « Saisir une commande ») et elle suit le même
-- chemin qu'une commande de la vitrine : le même chiffrage (prix par
-- quantité, prix pro du client choisi, livraison par zone et par poids,
-- retrait en magasin), le stock réservé de même, puis la confirmation, la
-- préparation, la livraison ou le refus, la facture SkanFact.
--
--   · Elle garde son canal et qui l'a saisie (origine « manuelle »).
--   · Confirmée avec le client pendant l'échange : elle passe d'emblée en
--     préparation ; sinon, elle attend sa confirmation avec les autres.
--   · La direction (propriétaire, administrateur) peut accorder une remise
--     ou offrir la livraison ; l'employé des appels saisit au tarif.
--   · Un numéro bloqué pour la vitrine (« contactez la boutique ») peut
--     commander par l'équipe : c'est elle qui décide, la saisie le lui dit.
--   · Un site vitrine (sans commande en ligne) garde celles de l'équipe.
-- =====================================================================

alter table public.commandes
  add column canal      text,
  add column saisie_par uuid references auth.users (id) on delete set null,
  add constraint commandes_canal check (canal in ('telephone', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'magasin', 'autre')),
  add constraint commandes_canal_saisie check ((origine = 'manuelle') = (canal is not null));

comment on column public.commandes.canal is
  'Une commande saisie par l''équipe (origine manuelle) : d''où elle est venue — téléphone, WhatsApp, Instagram, Facebook, TikTok, magasin, autre.';
comment on column public.commandes.saisie_par is
  'Le membre de l''équipe qui a saisi la commande (origine manuelle).';

create index commandes_canal_idx on public.commandes (boutique_id, canal) where canal is not null;

-- Les rôles qui saisissent, ceux qui ajustent le prix.
create function private.saisie_roles()
returns text[]
language sql
immutable
set search_path = ''
as $$ select '{proprietaire,admin,confirmateur}'::text[] $$;


-- ---------------------------------------------------------------------
-- Le prix pro : celui du client que l'équipe saisit
-- ---------------------------------------------------------------------
-- À la vitrine, le tarif pro est celui du compte connecté. À la saisie, la
-- personne connectée est l'employé : le chiffrage lit le client choisi,
-- posé le temps du calcul par les fonctions de saisie (et seulement pour un
-- membre qui saisit dans cette boutique).
create function private.client_saisi(p_boutique_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := nullif(current_setting('skanecom.saisie_client', true), '');
begin
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or auth.uid() is null or not private.est_membre(p_boutique_id, private.saisie_roles()) then
    return null;
  end if;
  return v::uuid;
end;
$$;

create or replace function private.est_pro(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.comptes_pro_actif(p_boutique_id)
     and exists (select 1 from public.comptes_pro cp
                   join public.clients cl on cl.boutique_id = cp.boutique_id and cl.id = cp.client_id
                  where cp.boutique_id = p_boutique_id and cp.statut = 'valide' and cl.niveau_risque <> 'bloque'
                    and case when private.client_saisi(p_boutique_id) is not null
                             then cl.id = private.client_saisi(p_boutique_id)
                             else auth.uid() is not null and cl.user_id = auth.uid() end)
$$;


-- ---------------------------------------------------------------------
-- Le chiffrage d'une saisie : celui de la vitrine, puis les ajustements
-- ---------------------------------------------------------------------
-- p_livraison : { mode: domicile | retrait, gouvernorat } ; p_ajustements :
-- { remise_millimes, livraison_offerte } (la direction seule).
create function private.chiffre_saisie(p_boutique_id uuid, p_client_id uuid, p_lignes jsonb, p_livraison jsonb, p_ajustements jsonb)
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
  if v_mode not in ('domicile', 'retrait') then
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
-- Ce que l'écran de saisie lit
-- ---------------------------------------------------------------------
-- Ce que la page lit d'abord : le catalogue en vente (chaque déclinaison, son
-- prix public, son stock, son minimum), le magasin si la boutique propose le
-- retrait, et si la personne connectée peut ajuster le prix (la direction).
create function public.gestion_saisie(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, private.saisie_roles());
  return jsonb_build_object(
    'direction', private.est_membre(p_boutique_id, '{proprietaire,admin}'),
    'retrait', private.retrait_propose(p_boutique_id),
    'produits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nom', coalesce(p.nom_fr, p.nom_ar), 'marque', p.marque,
               'image', (select i.chemin from public.produit_images i
                          where i.boutique_id = p.boutique_id and i.produit_id = p.id
                          order by i.position, i.created_at limit 1),
               'variantes', (select jsonb_agg(jsonb_build_object(
                                      'id', v.id, 'sku', v.sku, 'stock', v.stock, 'prix_millimes', v.prix_millimes,
                                      'quantite_min', coalesce(v.quantite_min, 1), 'image', v.image_chemin,
                                      'libelle', private.libelle_variante(p.boutique_id, p.id, v.options))
                                    order by v.position, v.sku)
                               from public.variantes v
                              where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif))
             order by coalesce(p.nom_fr, p.nom_ar), p.id)
        from public.produits p
       where p.boutique_id = p_boutique_id and p.publie
         and exists (select 1 from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif)
    ), '[]'::jsonb));
end;
$$;

-- Le client d'un numéro, s'il est connu de la boutique : son nom, son
-- historique, son compte pro, l'adresse de sa dernière livraison.
create function public.gestion_saisie_client(p_boutique_id uuid, p_telephone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

-- Le chiffrage en direct de l'écran (rien n'est réservé).
create function public.gestion_chiffrer_saisie(p_boutique_id uuid, p_telephone text, p_lignes jsonb, p_livraison jsonb, p_ajustements jsonb default '{}')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel       text;
  v_client_id uuid;
begin
  perform private.catalogue_exige(p_boutique_id, private.saisie_roles());
  v_tel := private.telephone_tunisien(p_telephone);
  if v_tel is not null then
    select c.id into v_client_id from public.clients c
     where c.boutique_id = p_boutique_id and c.telephone = v_tel
     order by (c.user_id is not null) desc, c.created_at limit 1;
  end if;
  return private.chiffre_saisie(p_boutique_id, v_client_id, p_lignes, p_livraison, p_ajustements);
end;
$$;


-- ---------------------------------------------------------------------
-- Saisir la commande
-- ---------------------------------------------------------------------
create function public.gestion_saisir_commande(
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
    return jsonb_build_object('numero', v_existante.numero, 'statut', v_existante.statut,
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
  if v_mode not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  if v_mode = 'retrait' then
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
    boutique_id, cle_idempotence, origine, canal, saisie_par, client_id, statut, mode_paiement, statut_paiement, mode_livraison,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes, transporteur, note_interne)
  values (
    p_boutique_id, p_cle_idempotence, 'manuelle', p_canal, auth.uid(), v_client.id, 'recue', 'cod', 'en_attente', v_mode,
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
  if coalesce(p_confirmee, false) then
    update public.commandes set statut = 'confirmee'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;

  return jsonb_build_object('numero', v_commande.numero, 'statut', v_commande.statut,
                            'total_millimes', v_commande.total_millimes, 'rejouee', false);
end;
$$;
comment on function public.gestion_saisir_commande(uuid, text, text, jsonb, jsonb, jsonb, jsonb, boolean, text, bigint) is
  'L''équipe (propriétaire, administrateur, appels) saisit une commande reçue hors de la vitrine : son canal, son client (retrouvé par son numéro, ou créé), le chiffrage de la vitrine (le prix pro du client), la remise et la livraison offerte de la direction ; confirmée ou à confirmer. Rend le numéro.';


-- ---------------------------------------------------------------------
-- Un site vitrine garde les commandes que l'équipe saisit
-- ---------------------------------------------------------------------
create or replace function private.refuse_commande_site_vitrine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origine <> 'manuelle' and coalesce((private.reglage(new.boutique_id, 'vitrine.site_vitrine'))::boolean, false) then
    raise exception 'Cette boutique ne prend pas de commande en ligne : écrivez-lui ou appelez-la'
      using errcode = 'check_violation', hint = 'paiement';
  end if;
  return new;
end;
$$;
comment on function private.refuse_commande_site_vitrine() is
  'En site vitrine (réglage vitrine.site_vitrine), aucune commande en ligne ne s''enregistre ; celles que l''équipe saisit, si ; l''historique reste.';


-- ---------------------------------------------------------------------
-- La veille ne sonne pas pour une commande que l'équipe vient de saisir
-- ---------------------------------------------------------------------
create or replace function public.gestion_veille(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'a_confirmer', (select count(*) from public.commandes c
                     where c.boutique_id = p_boutique_id and c.statut in ('a_arbitrer', 'recue')),
    'derniere', (select jsonb_build_object('numero', c.numero, 'nom', c.contact_nom, 'total', c.total_millimes,
                                           'le', c.created_at, 'statut', c.statut)
                   from public.commandes c
                  where c.boutique_id = p_boutique_id and c.origine <> 'manuelle'
                  order by c.created_at desc, c.numero desc
                  limit 1));
end;
$$;


-- ---------------------------------------------------------------------
-- La fiche de la commande : son canal et qui l'a saisie (migration 49, reprise)
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
    'canal', c.canal, 'saisie_par', (select u.email from auth.users u where u.id = c.saisie_par),
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
-- L'export des commandes dit aussi le canal et qui l'a saisie
-- ---------------------------------------------------------------------
-- (Les jeux restent dans private.gestion_export_jeux, avec leur règle et leur
-- trace ; la lettre d'information, migration 58, reprise telle quelle.)
create or replace function public.gestion_export(p_boutique_id uuid, p_quoi text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lignes jsonb;
begin
  if p_quoi = 'commandes' then
    v_lignes := private.gestion_export_jeux(p_boutique_id, p_quoi);
    return coalesce((
      select jsonb_agg(x.l || jsonb_build_object('canal', c.canal, 'saisie_par', u.email) order by x.n)
        from jsonb_array_elements(v_lignes) with ordinality x(l, n)
        left join public.commandes c on c.boutique_id = p_boutique_id and c.numero = x.l ->> 'numero'
        left join auth.users u on u.id = c.saisie_par), '[]'::jsonb);
  end if;
  if p_quoi is distinct from 'lettre' then
    return private.gestion_export_jeux(p_boutique_id, p_quoi);
  end if;
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', a.email, 'inscrit_le', a.inscrit_le, 'demande_le', a.demande_le,
           'page', a.page, 'consentement', a.consentement)
         order by a.inscrit_le), '[]'::jsonb) into v_lignes
    from public.lettre_abonnes a
   where a.boutique_id = p_boutique_id and a.statut = 'inscrit';
  perform private.console_trace(auth.uid(), p_boutique_id, 'export.lettre', null, null,
                                jsonb_build_object('lignes', jsonb_array_length(v_lignes)));
  return v_lignes;
end;
$$;


revoke execute on function private.saisie_roles() from public, anon, authenticated;
revoke execute on function private.client_saisi(uuid) from public, anon, authenticated;
revoke execute on function private.chiffre_saisie(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.gestion_saisie(uuid) from public, anon;
revoke execute on function public.gestion_saisie_client(uuid, text) from public, anon;
revoke execute on function public.gestion_chiffrer_saisie(uuid, text, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.gestion_saisir_commande(uuid, text, text, jsonb, jsonb, jsonb, jsonb, boolean, text, bigint) from public, anon;
grant  execute on function public.gestion_saisie(uuid) to authenticated;
grant  execute on function public.gestion_saisie_client(uuid, text) to authenticated;
grant  execute on function public.gestion_chiffrer_saisie(uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant  execute on function public.gestion_saisir_commande(uuid, text, text, jsonb, jsonb, jsonb, jsonb, boolean, text, bigint) to authenticated;
