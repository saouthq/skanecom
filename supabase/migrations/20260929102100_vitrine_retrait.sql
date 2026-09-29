-- =====================================================================
-- SkanEcom — 22 · VITRINE V7 : LE RETRAIT EN MAGASIN
-- Commander en ligne, récupérer au comptoir : gratuit, avec l'adresse du
-- magasin, ses horaires et le temps de préparation
-- 29/09/2026 — étape 1 (PRD §6.3 V7 ; étude 05 : « mode de livraison
-- retrait : gratuit, avec adresse, horaires et délai de préparation »)
-- =====================================================================
--
-- Le module `retrait_magasin` (activé par la console, migration 21) ouvre
-- ses réglages au backoffice (Réglages → Retrait en magasin). Tant que
-- l'adresse et la ville du magasin manquent, le retrait n'est pas proposé.
--
-- Une commande en retrait n'a pas d'adresse de livraison (l'acheteur vient
-- au magasin), pas de frais, pas de transporteur, pas de bordereau. Son
-- cycle est celui d'une commande livrée, avec d'autres mots au backoffice
-- et pour l'acheteur : « expédiée » y est « prête au retrait », « livrée »
-- « retirée », « refusée » « non retirée » (le stock revient, la fiche du
-- client compte le refus).

update plateforme.modules set disponible = true where code = 'retrait_magasin';


-- ---------------------------------------------------------------------
-- La commande : son mode de livraison
-- ---------------------------------------------------------------------
alter table public.commandes
  add column mode_livraison text not null default 'domicile'
    constraint commandes_mode_livraison check (mode_livraison in ('domicile', 'retrait'));
alter table public.commandes
  alter column livraison_ligne1 drop not null,
  alter column livraison_ville drop not null,
  alter column livraison_gouvernorat drop not null,
  add constraint commandes_adresse_a_domicile check (
    mode_livraison = 'retrait'
    or (livraison_ligne1 is not null and livraison_ville is not null and livraison_gouvernorat is not null));

comment on column public.commandes.mode_livraison is
  'domicile = livrée à l''adresse de la commande ; retrait = à retirer au magasin (aucune adresse, aucun frais).';


-- ---------------------------------------------------------------------
-- Les réglages du module
-- ---------------------------------------------------------------------
insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('retrait.adresse', 'texte', null, '""', 'retrait', 'retrait_magasin', true,
     'Adresse du magasin', 'La rue et le numéro, ou un repère (« Route de Tunis, km 3 »). Sans elle, le retrait n''est pas proposé.', 60),
  ('retrait.ville', 'texte', null, '""', 'retrait', 'retrait_magasin', true,
     'Ville du magasin', 'Exemple : Sfax.', 61),
  ('retrait.horaires', 'texte', null, '""', 'retrait', 'retrait_magasin', true,
     'Horaires d''ouverture', 'Affichés à la commande et sur sa page de suivi. Exemple : du lundi au samedi, de 8 h à 18 h.', 62),
  ('retrait.delai_heures', 'entier', null, '24', 'retrait', 'retrait_magasin', true,
     'Prête en (heures)', 'Le temps de préparer une commande confirmée : l''acheteur lit « prête sous 2 heures ».', 63);

create function private.valide_reglages_retrait()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := case when new.cle = 'retrait.ville' then 80 else 200 end;
begin
  if new.cle = 'retrait.delai_heures'
     and ((new.valeur #>> '{}')::numeric < 1 or (new.valeur #>> '{}')::numeric > 720) then
    raise exception 'Le temps de préparation compte d''une heure à 720 heures (30 jours)'
      using errcode = 'check_violation', hint = 'limite';
  end if;
  if jsonb_typeof(new.valeur) = 'string' and char_length(new.valeur #>> '{}') > v_max then
    raise exception 'Texte trop long (% caractères au plus)', v_max using errcode = 'check_violation', hint = 'limite';
  end if;
  return new;
end;
$$;

-- Après private.valide_reglage (ordre alphabétique des triggers) : le type
-- est déjà vérifié quand les bornes le sont.
create trigger reglages_valide_retrait
  before insert or update on public.reglages
  for each row when (new.cle like 'retrait.%')
  execute function private.valide_reglages_retrait();


-- Le magasin : son adresse, ses horaires, son temps de préparation. NULL
-- tant que l'adresse ou la ville manque. Une commande déjà passée en retrait
-- le montre même si le module a été coupé depuis : l'acheteur doit savoir
-- où venir.
create function private.magasin(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_adresse text := nullif(btrim(private.reglage(p_boutique_id, 'retrait.adresse') #>> '{}'), '');
  v_ville   text := nullif(btrim(private.reglage(p_boutique_id, 'retrait.ville') #>> '{}'), '');
begin
  if v_adresse is null or v_ville is null then
    return null;
  end if;
  return jsonb_build_object(
    'adresse', v_adresse,
    'ville', v_ville,
    'horaires', nullif(btrim(private.reglage(p_boutique_id, 'retrait.horaires') #>> '{}'), ''),
    'delai_heures', (private.reglage(p_boutique_id, 'retrait.delai_heures') #>> '{}')::integer);
end;
$$;

-- Le retrait est proposé à la commande : module actif, magasin renseigné.
create function private.retrait_propose(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from plateforme.modules_actifs ma
                            where ma.boutique_id = p_boutique_id and ma.module = 'retrait_magasin' and ma.actif)
              then private.magasin(p_boutique_id) end
$$;

-- ---------------------------------------------------------------------
-- Le chiffrage : gratuit en retrait (migration 08, reprise)
-- ---------------------------------------------------------------------
create function private.chiffre_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text, p_retrait boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lignes     jsonb;
  v_sous_total bigint;
  v_complet    boolean;
  v_gouv       public.gouvernorats;
  v_frais      bigint;
  v_seuil      bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone       jsonb;
  v_retrait    jsonb;
begin
  with demandees as (
    select d.variante_id, d.quantite from private.lignes_panier(p_lignes) d
  ), lues as (
    select d.variante_id, d.quantite,
           coalesce(v.actif and p.publie, false) as vendable,
           v.stock, v.prix_millimes, v.sku, p.slug,
           coalesce(p.nom_fr, p.nom_ar) as produit_nom,
           (select string_agg(v.options ->> o.cle, ' · ' order by o.position, o.cle)
              from public.produit_options o
             where o.boutique_id = v.boutique_id and o.produit_id = v.produit_id
               and v.options ? o.cle) as libelle,
           coalesce(v.image_chemin,
             (select i.chemin from public.produit_images i
               where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
               order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
               limit 1)) as image
    from demandees d
    left join public.variantes v on v.boutique_id = p_boutique_id and v.id = d.variante_id
    left join public.produits  p on p.boutique_id = v.boutique_id and p.id = v.produit_id
  )
  select
    jsonb_agg(jsonb_build_object(
      'variante_id',            l.variante_id,
      'disponible',             l.vendable and l.stock > 0,
      'quantite',               l.quantite,
      'quantite_disponible',    case when l.vendable then least(l.quantite, l.stock) else 0 end,
      'produit_nom',            case when l.vendable then l.produit_nom end,
      'produit_slug',           case when l.vendable then l.slug end,
      'variante_libelle',       case when l.vendable then l.libelle end,
      'sku',                    case when l.vendable then l.sku end,
      'image',                  case when l.vendable then l.image end,
      'prix_unitaire_millimes', case when l.vendable then l.prix_millimes end,
      'total_ligne_millimes',   case when l.vendable then l.prix_millimes * l.quantite end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.prix_millimes * l.quantite end), 0),
    bool_and(l.vendable and l.stock >= l.quantite)
  into v_lignes, v_sous_total, v_complet
  from lues l;

  if p_retrait then
    -- Retrait en magasin : gratuit, au magasin de la boutique.
    v_retrait := private.retrait_propose(p_boutique_id);
    if v_retrait is null then
      raise exception 'Le retrait en magasin n''est pas proposé par cette boutique'
        using errcode = 'check_violation', hint = 'retrait';
    end if;
    v_frais := 0;
  elsif p_gouvernorat is not null then
    select * into v_gouv from public.gouvernorats g where g.code = p_gouvernorat and g.actif;
    if not found then
      raise exception 'Gouvernorat inconnu' using errcode = 'check_violation', hint = 'adresse';
    end if;
    v_frais := public.frais_livraison_millimes(p_boutique_id, v_gouv.code, v_sous_total);
    select jsonb_build_object('nom_fr', z.nom_fr, 'nom_ar', z.nom_ar,
                              'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
      into v_zone
      from public.zones_gouvernorats zg
      join public.zones_livraison z on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
     where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = v_gouv.code;
  end if;

  return jsonb_build_object(
    'lignes',                   v_lignes,
    'complet',                  v_complet,
    'sous_total_millimes',      v_sous_total,
    'seuil_gratuite_millimes',  case when v_seuil > 0 then v_seuil end,
    'gouvernorat',              case when v_gouv.code is not null then
                                  jsonb_build_object('code', v_gouv.code, 'nom_fr', v_gouv.nom_fr, 'nom_ar', v_gouv.nom_ar) end,
    'zone',                     v_zone,
    'mode',                     case when p_retrait then 'retrait' else 'domicile' end,
    'retrait',                  v_retrait,
    'frais_livraison_millimes', v_frais,
    'total_millimes',           v_sous_total + v_frais
  );
end;
$$;


-- Le devis, pour la page de commande : un mode de livraison de plus.
drop function public.devis_commande(uuid, jsonb, text);
create function public.devis_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text default null, p_mode text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  if coalesce(p_mode, 'domicile') not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  return private.chiffre_commande(p_boutique_id, p_lignes, nullif(btrim(p_gouvernorat), ''), coalesce(p_mode = 'retrait', false));
end;
$$;


-- ---------------------------------------------------------------------
-- Passer commande : la même fonction (migrations 08 et 15), à domicile ou
-- en retrait (livraison.mode = « retrait » : ni adresse, ni frais, ni
-- transporteur, ni carnet d'adresses)
-- ---------------------------------------------------------------------
create or replace function public.passer_commande(
  p_boutique_id            uuid,
  p_cle_idempotence        text,
  p_lignes                 jsonb,
  p_contact                jsonb,
  p_livraison              jsonb,
  p_total_attendu_millimes bigint,
  p_note                   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_contact   jsonb := case when jsonb_typeof(p_contact) = 'object' then p_contact else '{}'::jsonb end;
  v_adresse   jsonb := case when jsonb_typeof(p_livraison) = 'object' then p_livraison else '{}'::jsonb end;
  v_nom       text;
  v_tel       text;
  v_email     text;
  v_ligne1    text;
  v_ligne2    text;
  v_ville     text;
  v_gouv      text;
  v_cp        text;
  v_mode      text;
  v_note      text := nullif(btrim(p_note), '');
  v_systeme   text := current_setting('skanecom.geste_systeme', true);
  v_existante public.commandes;
  v_client    public.clients;
  v_max       integer;
  v_devis     jsonb;
  v_commande  public.commandes;
  v_jeton     text := private.nouveau_jeton();
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  if p_cle_idempotence is null or p_cle_idempotence !~ '^[A-Za-z0-9-]{16,100}$' then
    raise exception 'Clé d''idempotence invalide' using errcode = 'check_violation', hint = 'cle';
  end if;

  v_tel := private.telephone_tunisien(v_contact ->> 'telephone');
  if v_tel is null then
    raise exception 'Numéro de téléphone tunisien attendu (8 chiffres)' using errcode = 'check_violation', hint = 'contact';
  end if;

  -- Une commande à la fois par boutique et par numéro : deux envois
  -- simultanés de la même commande ne se croisent pas, et la limite des
  -- commandes en attente tient sous la concurrence.
  perform pg_advisory_xact_lock(hashtextextended('commande:' || p_boutique_id::text || ':' || v_tel, 0));

  -- Rejeu (double clic, réseau coupé pendant la réponse) : la même clé rend
  -- la même commande, avec un nouveau jeton de suivi.
  select * into v_existante from public.commandes c
   where c.boutique_id = p_boutique_id and c.cle_idempotence = p_cle_idempotence;
  if found then
    if v_existante.contact_telephone is distinct from v_tel then
      raise exception 'Cette clé appartient à une autre commande' using errcode = 'unique_violation', hint = 'cle';
    end if;
    update public.commandes set jeton_suivi_hash = sha256(convert_to(v_jeton, 'UTF8'))
     where boutique_id = p_boutique_id and id = v_existante.id;
    return jsonb_build_object('numero', v_existante.numero, 'jeton', v_jeton, 'statut', v_existante.statut,
                              'total_millimes', v_existante.total_millimes, 'rejouee', true);
  end if;

  -- Contact et adresse
  v_nom    := nullif(btrim(v_contact ->> 'nom'), '');
  v_email  := nullif(lower(btrim(v_contact ->> 'email')), '');
  v_ligne1 := nullif(btrim(v_adresse ->> 'ligne1'), '');
  v_ligne2 := nullif(btrim(v_adresse ->> 'ligne2'), '');
  v_ville  := nullif(btrim(v_adresse ->> 'ville'), '');
  v_gouv   := nullif(btrim(v_adresse ->> 'gouvernorat'), '');
  v_cp     := nullif(btrim(v_adresse ->> 'code_postal'), '');

  if v_nom is null or char_length(v_nom) not between 2 and 80 then
    raise exception 'Indiquez le nom du destinataire' using errcode = 'check_violation', hint = 'contact';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Adresse e-mail illisible' using errcode = 'check_violation', hint = 'contact';
  end if;
  -- Livraison à domicile (une adresse), ou retrait en magasin (aucune :
  -- l'acheteur vient au magasin ; le chiffrage vérifie que la boutique le
  -- propose).
  v_mode := coalesce(nullif(btrim(v_adresse ->> 'mode'), ''), 'domicile');
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
      raise exception 'Indiquez la ville ou la délégation' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_gouv is null then
      raise exception 'Choisissez le gouvernorat' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_cp is not null and v_cp !~ '^[0-9]{4}$' then
      raise exception 'Le code postal compte 4 chiffres' using errcode = 'check_violation', hint = 'adresse';
    end if;
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'La note compte 500 caractères au plus' using errcode = 'check_violation', hint = 'contact';
  end if;

  -- Paiement : à la livraison (Konnect arrivera avec le module paiement_en_ligne).
  if not coalesce((private.reglage(p_boutique_id, 'paiement.cod_actif'))::boolean, true) then
    raise exception 'Aucun mode de paiement n''est ouvert dans cette boutique' using errcode = 'check_violation', hint = 'paiement';
  end if;

  -- Compte obligatoire (réglage, oui par défaut) ou commande en invité.
  if v_uid is null and coalesce((private.reglage(p_boutique_id, 'compte.obligatoire'))::boolean, true) then
    raise exception 'Connectez-vous pour commander' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;

  -- L'accord explicite de l'acheteur (migration 15).
  if (v_contact -> 'accepte_conditions') is distinct from 'true'::jsonb then
    raise exception 'Acceptez les conditions de vente et la politique de confidentialité pour commander'
      using errcode = 'check_violation', hint = 'conditions';
  end if;

  perform set_config('skanecom.geste_systeme', 'on', true);

  -- La fiche client de la boutique : celle du compte, ou celle du numéro
  -- pour un invité (la boutique voit l'historique d'un numéro, pas celui
  -- d'une personne qu'elle ne connaît pas).
  if v_uid is not null then
    insert into public.clients as c (boutique_id, user_id, nom, telephone, email)
    values (p_boutique_id, v_uid, v_nom,
            coalesce(private.telephone_tunisien((select u.phone from auth.users u where u.id = v_uid)), v_tel),
            v_email)
    on conflict (boutique_id, user_id) do update
      set nom = coalesce(c.nom, excluded.nom), email = coalesce(c.email, excluded.email)
    returning c.* into v_client;
  else
    select * into v_client from public.clients c
     where c.boutique_id = p_boutique_id and c.user_id is null and c.telephone = v_tel
     order by c.created_at
     limit 1;
    if not found then
      insert into public.clients (boutique_id, nom, telephone, email)
      values (p_boutique_id, v_nom, v_tel, v_email)
      returning * into v_client;
    end if;
  end if;

  if v_client.niveau_risque = 'bloque' or exists (
    select 1 from public.clients c
    where c.boutique_id = p_boutique_id and c.telephone = v_tel and c.niveau_risque = 'bloque'
  ) then
    raise exception 'Ce numéro ne peut pas commander en ligne : contactez la boutique'
      using errcode = 'insufficient_privilege', hint = 'bloque';
  end if;

  v_max := greatest(0, coalesce((private.reglage(p_boutique_id, 'commande.max_en_attente') #>> '{}')::integer, 3));
  if v_max > 0 and (
    select count(*) from public.commandes c
    where c.boutique_id = p_boutique_id and c.statut in ('a_arbitrer', 'recue')
      and (c.contact_telephone = v_tel or c.client_id = v_client.id)
  ) >= v_max then
    raise exception 'Ce numéro a déjà % commandes en attente de confirmation', v_max
      using errcode = 'check_violation', hint = 'en_attente';
  end if;

  -- Les variantes, verrouillées dans un ordre stable (pas d'interblocage
  -- entre deux paniers), puis le chiffrage sur l'état verrouillé.
  perform 1 from public.variantes v
   where v.boutique_id = p_boutique_id
     and v.id in (select d.variante_id from private.lignes_panier(p_lignes) d)
   order by v.id
   for update;

  v_devis := private.chiffre_commande(p_boutique_id, p_lignes, v_gouv, v_mode = 'retrait');

  if not (v_devis ->> 'complet')::boolean then
    raise exception 'Un article n''est plus disponible dans la quantité demandée'
      using errcode = 'check_violation', hint = 'stock', detail = (v_devis -> 'lignes')::text;
  end if;
  if p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception 'Le total a changé : % millimes', v_devis ->> 'total_millimes'
      using errcode = 'check_violation', hint = 'total', detail = v_devis::text;
  end if;

  insert into public.commandes (
    boutique_id, cle_idempotence, origine, client_id, statut, mode_paiement, statut_paiement, mode_livraison,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes,
    transporteur, note_client, jeton_suivi_hash, conditions_acceptees)
  values (
    p_boutique_id, p_cle_idempotence, 'vitrine', v_client.id, 'recue', 'cod', 'en_attente', v_mode,
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint, 0,
    (v_devis ->> 'total_millimes')::bigint,
    case when v_mode = 'domicile' then nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), '') end, v_note,
    sha256(convert_to(v_jeton, 'UTF8')),
    jsonb_build_object('le', now(), 'modele', private.modele_legal(),
                       'retractation_jours', (private.reglage(p_boutique_id, 'legal.retractation_jours') #>> '{}')::integer,
                       'retour_frais', private.reglage(p_boutique_id, 'legal.retour_frais') #>> '{}'))
  returning * into v_commande;

  -- Les lignes figent nom, libellé, référence et prix ; le trigger réserve
  -- le stock (déjà verrouillé : il ne peut plus manquer).
  insert into public.commande_lignes
    (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
     prix_unitaire_millimes, quantite, total_ligne_millimes)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint
  from jsonb_array_elements(v_devis -> 'lignes') l;

  -- Le carnet d'adresses du compte : la prochaine commande la propose.
  if v_uid is not null and v_mode = 'domicile' and not exists (
    select 1 from public.adresses a
    where a.boutique_id = p_boutique_id and a.client_id = v_client.id
      and a.ligne1 = v_ligne1 and a.ville = v_ville and a.gouvernorat_code = v_gouv
  ) then
    insert into public.adresses (boutique_id, client_id, nom_destinataire, telephone, ligne1, ligne2, ville,
                                 gouvernorat_code, code_postal, par_defaut)
    values (p_boutique_id, v_client.id, v_nom, v_tel, v_ligne1, v_ligne2, v_ville, v_gouv, v_cp,
            not exists (select 1 from public.adresses a
                        where a.boutique_id = p_boutique_id and a.client_id = v_client.id and a.par_defaut));
  end if;

  -- Confirmation automatique (réglage) : la commande passe seule en confirmée.
  if private.reglage(p_boutique_id, 'commande.mode_confirmation') #>> '{}' = 'automatique' then
    update public.commandes set statut = 'confirmee'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;

  perform set_config('skanecom.geste_systeme', coalesce(v_systeme, ''), true);

  return jsonb_build_object('numero', v_commande.numero, 'jeton', v_jeton, 'statut', v_commande.statut,
                            'total_millimes', v_commande.total_millimes, 'rejouee', false);
end;
$$;

comment on function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text) is
  'Crée une commande de la vitrine en paiement à la livraison, livrée à domicile ou à retirer en magasin (livraison.mode). Tout est relu et recalculé en base ; refus avec un indice (HINT) lisible par la vitrine. Exige l''accord de l''acheteur aux conditions (contact.accepte_conditions) et le garde sur la commande. Rend le numéro et un jeton de suivi (montré une fois).';

-- L'ancien chiffrage (sans mode) n'a plus d'appelant.
drop function private.chiffre_commande(uuid, jsonb, text);


-- ---------------------------------------------------------------------
-- Ce que l'acheteur et l'équipe lisent : le mode, et le magasin
-- (migrations 08, 09, 17 et 18, reprises)
-- ---------------------------------------------------------------------
create or replace function public.commande_suivie(p_boutique_id uuid, p_numero text, p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero',        c.numero,
    'statut',        c.statut,
    'cree_le',       c.created_at,
    'mode_paiement', c.mode_paiement,
    'mode_livraison', c.mode_livraison,
    'retrait',       case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'contact',       jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'livraison',     jsonb_build_object(
                       'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
                       'code_postal', c.livraison_code_postal, 'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
                       'zone', c.livraison_zone_nom),
    'note_client',   c.note_client,
    'sous_total_millimes',      c.sous_total_millimes,
    'frais_livraison_millimes', c.frais_livraison_millimes,
    'remise_millimes',          c.remise_millimes,
    'total_millimes',           c.total_millimes,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                   limit 1)))
             order by l.created_at, l.produit_nom)
      from public.commande_lignes l
      left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
      where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb)
  )
  from public.commandes c
  join plateforme.boutiques b on b.id = c.boutique_id and b.statut = 'active'
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id
    and c.numero = p_numero
    and p_jeton ~ '^[0-9a-f]{64}$'
    and c.jeton_suivi_hash = sha256(convert_to(p_jeton, 'UTF8'));
$$;

create or replace function public.gestion_liste_commandes(
  p_boutique_id uuid,
  p_etape       text default 'a_confirmer',
  p_recherche   text default null,
  p_limite      integer default 50,
  p_decalage    integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_etape    text := coalesce(nullif(p_etape, ''), 'a_confirmer');
  v_q        text := nullif(btrim(p_recherche), '');
  v_chiffres text := regexp_replace(coalesce(p_recherche, ''), '\D', '', 'g');
  v_statuts  public.statut_commande[];
  v_limite   integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
  v_fifo     boolean := coalesce(nullif(p_etape, ''), 'a_confirmer') in ('a_confirmer', 'a_preparer', 'expediees');
  v_resultat jsonb;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  v_statuts := case v_etape
    when 'a_confirmer' then '{a_arbitrer,recue}'
    when 'a_preparer'  then '{confirmee}'
    when 'expediees'   then '{expediee}'
    when 'cloturees'   then '{livree,refusee,annulee}'
    when 'toutes'      then '{a_arbitrer,recue,confirmee,expediee,livree,refusee,annulee}'
  end::public.statut_commande[];
  if v_statuts is null then
    raise exception 'Étape inconnue : %', v_etape using errcode = 'check_violation', hint = 'canal';
  end if;

  with choisies as (
    select c.*
    from public.commandes c
    where c.boutique_id = p_boutique_id
      and c.statut = any (v_statuts)
      and (v_q is null
           or c.numero ilike '%' || v_q || '%'
           or c.contact_nom ilike '%' || v_q || '%'
           or (char_length(v_chiffres) >= 3 and c.contact_telephone like '%' || v_chiffres || '%'))
  ), page as (
    select * from choisies
    order by
      case when v_fifo then created_at end asc, case when v_fifo then numero end asc,
      case when not v_fifo then created_at end desc, case when not v_fifo then numero end desc
    limit v_limite offset v_decalage
  )
  select jsonb_build_object(
    'etape', v_etape,
    'total', (select count(*) from choisies),
    'compteurs', (
      select jsonb_build_object(
        'a_confirmer', count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
        'a_preparer',  count(*) filter (where c.statut = 'confirmee'),
        'expediees',   count(*) filter (where c.statut = 'expediee'),
        'cloturees',   count(*) filter (where c.statut in ('livree', 'refusee', 'annulee')))
      from public.commandes c where c.boutique_id = p_boutique_id),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero, 'statut', p.statut, 'cree_le', p.created_at,
        'contact_nom', p.contact_nom, 'contact_telephone', p.contact_telephone,
        'mode_livraison', p.mode_livraison, 'ville', p.livraison_ville, 'gouvernorat', coalesce(g.nom_fr, p.livraison_gouvernorat),
        'total_millimes', p.total_millimes, 'origine', p.origine,
        'articles', (select coalesce(sum(l.quantite), 0) from public.commande_lignes l
                     where l.boutique_id = p.boutique_id and l.commande_id = p.id),
        'premier_article', (select l.produit_nom from public.commande_lignes l
                            where l.boutique_id = p.boutique_id and l.commande_id = p.id
                            order by l.created_at, l.produit_nom limit 1),
        'appels', (select count(*) from public.confirmations k
                   where k.boutique_id = p.boutique_id and k.commande_id = p.id),
        'dernier_appel', (select k.resultat from public.confirmations k
                          where k.boutique_id = p.boutique_id and k.commande_id = p.id
                          order by k.created_at desc limit 1),
        'client', case when cl.id is null then null else jsonb_build_object(
                    'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus,
                    'niveau_risque', cl.niveau_risque, 'compte', cl.user_id is not null) end
      ) order by
          case when v_fifo then p.created_at end asc, case when v_fifo then p.numero end asc,
          case when not v_fifo then p.created_at end desc, case when not v_fifo then p.numero end desc)
      from page p
      left join public.gouvernorats g on g.code = p.livraison_gouvernorat
      left join public.clients cl on cl.boutique_id = p.boutique_id and cl.id = p.client_id
    ), '[]'::jsonb)
  ) into v_resultat;

  return v_resultat;
end;
$$;

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
    'mode_paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
    'mode_livraison', c.mode_livraison,
    'retrait', case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'contact', jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'livraison', jsonb_build_object(
      'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
      'code_postal', c.livraison_code_postal, 'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
      'zone', c.livraison_zone_nom),
    'sous_total_millimes', c.sous_total_millimes, 'frais_livraison_millimes', c.frais_livraison_millimes,
    'remise_millimes', c.remise_millimes, 'total_millimes', c.total_millimes,
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

create or replace function public.gestion_bordereaux(
  p_boutique_id uuid,
  p_numeros     text[] default null,
  p_etape       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_numeros is null and (p_etape is null or p_etape not in ('a_preparer', 'expediees')) then
    raise exception 'Choisissez des commandes, ou une étape (à préparer, expédiées)' using errcode = 'check_violation', hint = 'choix';
  end if;
  if cardinality(coalesce(p_numeros, '{}')) > 200 then
    raise exception '200 bordereaux au plus à la fois' using errcode = 'check_violation', hint = 'limite';
  end if;

  return jsonb_build_object(
    'expediteur', jsonb_build_object(
      'nom', (select b.nom from plateforme.boutiques b where b.id = p_boutique_id),
      'raison_sociale', nullif(private.reglage(p_boutique_id, 'legal.raison_sociale') #>> '{}', ''),
      'adresse', nullif(private.reglage(p_boutique_id, 'legal.adresse') #>> '{}', ''),
      'telephone', nullif(private.reglage(p_boutique_id, 'contact.telephone') #>> '{}', '')),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'statut', c.statut, 'cree_le', c.created_at,
               'nom', c.contact_nom, 'telephone', c.contact_telephone,
               'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
               'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat), 'code_postal', c.livraison_code_postal,
               'zone', c.livraison_zone_nom, 'note_client', c.note_client,
               'transporteur', c.transporteur, 'suivi', c.numero_suivi,
               'paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement, 'total', c.total_millimes,
               'lignes', coalesce((
                 select jsonb_agg(jsonb_build_object('produit', l.produit_nom, 'declinaison', l.variante_libelle,
                                                     'reference', l.sku, 'quantite', l.quantite)
                                  order by l.created_at, l.produit_nom)
                   from public.commande_lignes l where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb))
             order by c.created_at, c.numero)
        from public.commandes c
        left join public.gouvernorats g on g.code = c.livraison_gouvernorat
       where c.boutique_id = p_boutique_id
         and c.mode_livraison = 'domicile'
         and (case
                when p_numeros is not null then c.numero = any (p_numeros)
                when p_etape = 'a_preparer' then c.statut = 'confirmee'
                else c.statut = 'expediee'
              end)), '[]'::jsonb),
    -- Les commandes à retirer en magasin n'ont pas de bordereau : on les compte.
    'retraits', (select count(*) from public.commandes c
                  where c.boutique_id = p_boutique_id and c.mode_livraison = 'retrait'
                    and case when p_numeros is not null then c.numero = any (p_numeros)
                             when p_etape = 'a_preparer' then c.statut = 'confirmee'
                             else c.statut = 'expediee' end)
  );
end;
$$;

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
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');

  case p_quoi
    when 'commandes' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'date', c.created_at, 'statut', c.statut, 'origine', c.origine,
               'nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email,
               'adresse', c.livraison_ligne1, 'complement', c.livraison_ligne2, 'ville', c.livraison_ville,
               'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat), 'code_postal', c.livraison_code_postal,
               'zone', c.livraison_zone_nom, 'mode_livraison', c.mode_livraison,
               'sous_total', c.sous_total_millimes, 'frais_livraison', c.frais_livraison_millimes,
               'remise', c.remise_millimes, 'total', c.total_millimes,
               'paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
               'transporteur', c.transporteur, 'suivi', c.numero_suivi,
               'refus_origine', c.refus_origine, 'refus_commentaire', c.refus_commentaire,
               'motif_annulation', c.motif_annulation, 'note_client', c.note_client,
               'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at,
               'conditions_acceptees_le', c.conditions_acceptees ->> 'le')
             order by c.created_at), '[]'::jsonb) into v_lignes
        from public.commandes c
        left join public.gouvernorats g on g.code = c.livraison_gouvernorat
       where c.boutique_id = p_boutique_id;

    when 'articles' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'date', c.created_at, 'statut', c.statut,
               'produit', l.produit_nom, 'declinaison', l.variante_libelle, 'reference', l.sku,
               'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire_millimes, 'total', l.total_ligne_millimes)
             order by c.created_at, l.created_at), '[]'::jsonb) into v_lignes
        from public.commande_lignes l
        join public.commandes c on c.boutique_id = l.boutique_id and c.id = l.commande_id
       where l.boutique_id = p_boutique_id;

    when 'clients' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'nom', cl.nom, 'telephone', cl.telephone, 'email', cl.email, 'compte', cl.user_id is not null,
               'commandes', cl.nb_commandes, 'refus', cl.nb_refus, 'confiance', cl.niveau_risque,
               'depuis', cl.created_at, 'note', cl.note_interne)
             order by cl.created_at), '[]'::jsonb) into v_lignes
        from public.clients cl
       where cl.boutique_id = p_boutique_id;

    when 'catalogue' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'produit', p.nom_fr, 'adresse', p.slug, 'en_vitrine', p.publie, 'marque', p.marque,
               'rayon', c.nom_fr, 'reference', v.sku, 'declinaison', private.libelle_variante(p_boutique_id, p.id, v.options),
               'prix', v.prix_millimes, 'prix_barre', v.prix_barre_millimes, 'stock', v.stock,
               'alerte_sous', v.seuil_alerte_stock, 'en_vente', v.actif, 'poids_grammes', v.poids_grammes)
             order by p.nom_fr, v.position, v.sku), '[]'::jsonb) into v_lignes
        from public.variantes v
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.categories c on c.boutique_id = p.boutique_id and c.id = p.categorie_id
       where v.boutique_id = p_boutique_id;

    when 'stock' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', m.created_at, 'reference', v.sku, 'produit', p.nom_fr, 'motif', m.motif,
               'mouvement', m.delta, 'stock_apres', m.stock_apres, 'commande', c.numero,
               'auteur', u.email, 'commentaire', m.commentaire)
             order by m.created_at), '[]'::jsonb) into v_lignes
        from public.stock_mouvements m
        join public.variantes v on v.boutique_id = m.boutique_id and v.id = m.variante_id
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.commandes c on c.boutique_id = m.boutique_id and c.id = m.commande_id
        left join auth.users u on u.id = m.auteur_id
       where m.boutique_id = p_boutique_id;

    else
      raise exception 'Export inconnu : %', p_quoi using errcode = 'check_violation', hint = 'quoi';
  end case;

  perform private.console_trace(auth.uid(), p_boutique_id, 'export.' || p_quoi, null, null,
                                jsonb_build_object('lignes', jsonb_array_length(v_lignes)));
  return v_lignes;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function private.magasin(uuid)                                from public, anon, authenticated;
revoke execute on function private.retrait_propose(uuid)                        from public, anon, authenticated;
revoke execute on function private.valide_reglages_retrait()                    from public, anon, authenticated;
revoke execute on function private.chiffre_commande(uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public.devis_commande(uuid, jsonb, text, text)       from public;
grant  execute on function public.devis_commande(uuid, jsonb, text, text)       to anon, authenticated, service_role;
