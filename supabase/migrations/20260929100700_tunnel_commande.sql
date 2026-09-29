-- =====================================================================
-- SkanEcom — 08 · TUNNEL DE COMMANDE (paiement à la livraison)
-- Chiffrage (devis) · commande · suivi par jeton
-- 29/09/2026 — étape 5 de la reprise (docs/cadrage/03-reprise-maymar.md §5)
-- =====================================================================
-- La vitrine ne fabrique jamais une commande. Elle envoie des variantes et
-- des quantités, un contact, une adresse, et le total qu'elle a affiché. La
-- base relit tout le reste (prix, stock, réglages, frais) et refuse ce qui
-- ne tient pas :
--   · le total recalculé doit être celui que l'acheteur a lu : sinon la
--     commande est refusée et la page se met à jour. On ne fait jamais payer
--     un montant qu'il n'a pas vu ;
--   · compte obligatoire ou commande en invité : réglage de la boutique
--     (compte.obligatoire, oui par défaut) ;
--   · la même clé d'idempotence rend la même commande (double clic, réseau
--     coupé pendant la réponse), jamais une deuxième ;
--   · un numéro qui a déjà trop de commandes en attente d'appel, ou une
--     fiche bloquée par la boutique, ne commande plus en ligne : en paiement
--     à la livraison, une fausse commande immobilise du vrai stock.
-- Chaque refus porte un indice lisible par la vitrine (HINT) : boutique,
-- cle, panier, contact, adresse, compte, stock, total, en_attente, bloque,
-- paiement.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Réglage : commandes en attente par numéro
-- ---------------------------------------------------------------------
insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('commande.max_en_attente', 'entier', null, '3', 'commande', null, false,
     'Commandes en attente par numéro',
     'Au-delà, un même numéro ne peut plus commander en ligne tant que ses commandes n''ont pas été confirmées ou annulées. 0 = pas de limite.', 4);


-- ---------------------------------------------------------------------
-- Suivi sans compte : un jeton remis à l'acheteur, dont la base ne garde
-- que l'empreinte
-- ---------------------------------------------------------------------
alter table public.commandes add column jeton_suivi_hash bytea;

comment on column public.commandes.jeton_suivi_hash is
  'Empreinte SHA-256 du jeton remis à l''acheteur pour revoir sa commande sans compte (public.commande_suivie). Le jeton lui-même n''est jamais stocké.';

-- 244 bits d'aléa (deux UUID v4), en hexadécimal.
create function private.nouveau_jeton()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;


-- ---------------------------------------------------------------------
-- Auteur d'un geste : un membre de l'équipe, ou NULL pour le système
-- ---------------------------------------------------------------------
-- La commande passée sur la vitrine et sa confirmation automatique sont des
-- gestes du système : la fonction de commande le signale par
-- skanecom.geste_systeme, le temps de son exécution. L'identifiant de
-- l'acheteur n'entre ainsi jamais dans les journaux de l'équipe
-- (commande_evenements.auteur_id, stock_mouvements.auteur_id).
create function private.auteur()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when current_setting('skanecom.geste_systeme', true) = 'on' then null else auth.uid() end;
$$;

create or replace function private.trace_statut_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.commande_evenements (boutique_id, commande_id, statut_avant, statut_apres, auteur_id)
    values (new.boutique_id, new.id, null, new.statut, private.auteur());
    return new;
  end if;

  if new.statut is distinct from old.statut then
    insert into public.commande_evenements
      (boutique_id, commande_id, statut_avant, statut_apres, origine_refus, commentaire, auteur_id)
    values (new.boutique_id, new.id, old.statut, new.statut, new.refus_origine,
            coalesce(new.refus_commentaire, new.motif_annulation), private.auteur());

    -- Horodatages posés par la base : ils ne peuvent pas diverger du statut.
    if new.statut = 'confirmee' and new.confirmee_at is null then new.confirmee_at := now(); end if;
    if new.statut = 'expediee'  and new.expediee_at  is null then new.expediee_at  := now(); end if;
    if new.statut = 'livree'    and new.livree_at    is null then new.livree_at    := now(); end if;
    if new.statut in ('livree', 'refusee', 'annulee') and new.cloturee_at is null then
      new.cloturee_at := now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.reserve_stock_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock_apres integer;
  v_numero      text;
  v_ecriture    text := current_setting('skanecom.ecriture_stock', true);
begin
  if new.variante_id is null then
    return new;   -- ligne libre (produit retiré du catalogue) : rien à réserver
  end if;

  -- L'UPDATE verrouille la variante : deux clients qui commandent la
  -- dernière pièce en même temps sont sérialisés ici. La clé composite de la
  -- ligne garantit que la variante est de la même boutique.
  perform set_config('skanecom.ecriture_stock', 'on', true);
  update public.variantes
     set stock = stock - new.quantite
   where boutique_id = new.boutique_id and id = new.variante_id
     and stock >= new.quantite
  returning stock into v_stock_apres;
  perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);

  if v_stock_apres is null then
    raise exception 'Stock insuffisant pour la variante % (quantité demandée : %)',
      new.variante_id, new.quantite
      using errcode = 'check_violation';
  end if;

  select c.numero into v_numero
  from public.commandes c where c.boutique_id = new.boutique_id and c.id = new.commande_id;

  insert into public.stock_mouvements
    (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
  values (new.boutique_id, new.variante_id, -new.quantite, v_stock_apres, 'vente', new.commande_id,
          'Commande ' || coalesce(v_numero, '?'), private.auteur());

  return new;
end;
$$;

create or replace function private.reintegre_stock_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne    record;
  v_stock    integer;
  v_motif    public.motif_mouvement_stock;
  v_ecriture text := current_setting('skanecom.ecriture_stock', true);
begin
  if new.statut not in ('refusee', 'annulee') then return new; end if;
  if old.statut in ('refusee', 'annulee') then return new; end if;
  if new.stock_reintegre then return new; end if;

  v_motif := case when new.statut = 'refusee' then 'retour_refus' else 'annulation' end;

  for v_ligne in
    select l.variante_id, l.quantite from public.commande_lignes l
    where l.boutique_id = new.boutique_id and l.commande_id = new.id and l.variante_id is not null
  loop
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes
       set stock = stock + v_ligne.quantite
     where boutique_id = new.boutique_id and id = v_ligne.variante_id
    returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);

    insert into public.stock_mouvements
      (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
    values (new.boutique_id, v_ligne.variante_id, v_ligne.quantite, v_stock, v_motif, new.id,
            'Commande ' || new.numero || ' — ' || new.statut::text, private.auteur());
  end loop;

  update public.commandes set stock_reintegre = true
   where boutique_id = new.boutique_id and id = new.id;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- Numéro de téléphone tunisien
-- ---------------------------------------------------------------------
-- « 20 123 456 », « +216 20 123 456 », « 00216 20123456 » → +21620123456.
-- Huit chiffres, le premier parmi 2, 3, 4, 5, 7, 9 (mobiles et fixes) : le
-- livreur appelle ce numéro, il doit être joignable en Tunisie. NULL sinon.
create function private.telephone_tunisien(p_brut text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x.chiffres ~ '^[2-579][0-9]{7}$' then '+216' || x.chiffres end
  from (
    select regexp_replace(regexp_replace(coalesce(p_brut, ''), '[^0-9+]', '', 'g'),
                          '^(\+|00)?216([0-9]{8})$', '\2') as chiffres
  ) x;
$$;


-- ---------------------------------------------------------------------
-- Les lignes envoyées par la vitrine
-- ---------------------------------------------------------------------
-- [{"variante_id": "…", "quantite": 2}, …] : de 1 à 50 lignes, de 1 à 999
-- pièces par variante. Une variante en double est fusionnée ; tout le reste
-- est refusé.
create function private.lignes_panier(p_lignes jsonb)
returns table (variante_id uuid, quantite integer)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le panier est vide' using errcode = 'check_violation', hint = 'panier';
  end if;
  if jsonb_array_length(p_lignes) > 50 then
    raise exception 'Un panier compte 50 lignes au plus' using errcode = 'check_violation', hint = 'panier';
  end if;
  -- CASE et non OR : l'ordre des tests est garanti, aucune conversion n'est
  -- tentée sur une valeur qui n'a pas encore été vérifiée.
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where case
      when jsonb_typeof(l) <> 'object' then true
      when coalesce(jsonb_typeof(l -> 'variante_id'), '') <> 'string' then true
      when (l ->> 'variante_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when coalesce(jsonb_typeof(l -> 'quantite'), '') <> 'number' then true
      when (l ->> 'quantite') !~ '^[1-9][0-9]{0,2}$' then true
      else false
    end
  ) then
    raise exception 'Ligne de panier illisible' using errcode = 'check_violation', hint = 'panier';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    group by (l ->> 'variante_id')::uuid
    having sum((l ->> 'quantite')::integer) > 999
  ) then
    raise exception 'Au plus 999 pièces par article' using errcode = 'check_violation', hint = 'panier';
  end if;

  return query
    select (l ->> 'variante_id')::uuid, sum((l ->> 'quantite')::integer)::integer
    from jsonb_array_elements(p_lignes) l
    group by 1;
end;
$$;


-- ---------------------------------------------------------------------
-- Le chiffrage : partagé par le devis affiché et par la commande
-- ---------------------------------------------------------------------
-- Prix, stock et libellés relus en base. Une variante qui n'est pas en vente
-- dans CETTE boutique (autre boutique, brouillon, désactivée, inexistante)
-- revient « indisponible », sans rien dire d'elle : un brouillon ne fuit pas
-- par le panier.
create function private.chiffre_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text)
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

  if p_gouvernorat is not null then
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
    'frais_livraison_millimes', v_frais,
    'total_millimes',           v_sous_total + v_frais
  );
end;
$$;

comment on function private.chiffre_commande(uuid, jsonb, text) is
  'Chiffrage d''un panier dans une boutique. Sans gouvernorat : pas de frais ni de total, seulement les lignes et le sous-total.';


-- Le devis, pour la page de commande : les lignes telles que la base les
-- vendrait, les frais du gouvernorat choisi, le total.
create function public.devis_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text default null)
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
  return private.chiffre_commande(p_boutique_id, p_lignes, nullif(btrim(p_gouvernorat), ''));
end;
$$;


-- ---------------------------------------------------------------------
-- Passer commande
-- ---------------------------------------------------------------------
create function public.passer_commande(
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

  v_devis := private.chiffre_commande(p_boutique_id, p_lignes, v_gouv);

  if not (v_devis ->> 'complet')::boolean then
    raise exception 'Un article n''est plus disponible dans la quantité demandée'
      using errcode = 'check_violation', hint = 'stock', detail = (v_devis -> 'lignes')::text;
  end if;
  if p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception 'Le total a changé : % millimes', v_devis ->> 'total_millimes'
      using errcode = 'check_violation', hint = 'total', detail = v_devis::text;
  end if;

  insert into public.commandes (
    boutique_id, cle_idempotence, origine, client_id, statut, mode_paiement, statut_paiement,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes,
    transporteur, note_client, jeton_suivi_hash)
  values (
    p_boutique_id, p_cle_idempotence, 'vitrine', v_client.id, 'recue', 'cod', 'en_attente',
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint, 0,
    (v_devis ->> 'total_millimes')::bigint,
    nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), ''), v_note,
    sha256(convert_to(v_jeton, 'UTF8')))
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
  if v_uid is not null and not exists (
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
  'Crée une commande de la vitrine en paiement à la livraison. Tout est relu et recalculé en base ; refus avec un indice (HINT) lisible par la vitrine. Rend le numéro et un jeton de suivi (montré une fois).';


-- ---------------------------------------------------------------------
-- Revoir sa commande sans compte : numéro + jeton
-- ---------------------------------------------------------------------
-- Ni note interne, ni historique de l'équipe : ce que l'acheteur a commandé,
-- où, pour combien, et où en est la commande.
create function public.commande_suivie(p_boutique_id uuid, p_numero text, p_jeton text)
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


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function private.nouveau_jeton()                          from public, anon, authenticated;
revoke execute on function private.auteur()                                 from public, anon, authenticated;
revoke execute on function private.telephone_tunisien(text)                 from public, anon, authenticated;
revoke execute on function private.lignes_panier(jsonb)                     from public, anon, authenticated;
revoke execute on function private.chiffre_commande(uuid, jsonb, text)      from public, anon, authenticated;

revoke execute on function public.devis_commande(uuid, jsonb, text)                              from public;
revoke execute on function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text) from public;
revoke execute on function public.commande_suivie(uuid, text, text)                              from public;
grant  execute on function public.devis_commande(uuid, jsonb, text)                              to anon, authenticated, service_role;
grant  execute on function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text) to anon, authenticated, service_role;
grant  execute on function public.commande_suivie(uuid, text, text)                              to anon, authenticated, service_role;
