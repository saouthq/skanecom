-- =====================================================================
-- SkanEcom — 45 · LES CODES PROMO (module « promotions »)
-- =====================================================================
--
-- « BIENVENUE10 » en story Instagram, « LIVRAISON » le temps d'un
-- week-end : la boutique crée ses codes au backoffice — un pourcentage, un
-- montant ou la livraison offerte —, avec leurs conditions : un minimum
-- d'achat, des dates, un nombre d'utilisations, une fois par client.
-- L'acheteur le tape au tunnel ; la base le relit à chaque devis et à la
-- commande, qui garde le code et la remise : un code modifié ou coupé
-- ensuite ne change rien à une commande passée.
--
-- Les règles, tenues ici seulement (private.applique_code) :
--   · la remise porte sur les articles, jamais au-delà de leur montant ; la
--     livraison offerte efface les frais, à domicile, quand il y en a — au
--     retrait (gratuit) ou quand la livraison est déjà offerte, le code
--     n'apporte rien : il n'est pas consommé ;
--   · un code ne s'applique pas au tunnel d'un devis : son prix est déjà
--     négocié. Un pro validé en profite, sur ses prix pro ;
--   · une utilisation = une commande passée avec le code, sauf annulée (une
--     annulation la rend ; un refus à la livraison, non : la boutique a payé
--     le transport). « Une fois par client » compte la fiche ET le numéro :
--     un invité ne le reprend pas sous un autre compte ;
--   · sous le minimum, le code est reconnu mais attend : le devis dit ce
--     qu'il manque.
--
-- Module coupé : aucun code ne s'applique, rien ne s'efface. Maymar ne l'a
-- pas (sa charte refuse la promotion) ; Maison Selma l'a, au jeu de démo.
-- =====================================================================

insert into plateforme.modules (code, libelle_fr, description_fr, position, disponible) values
  ('promotions', 'Codes promo',
   'Des codes à taper au tunnel : un pourcentage, un montant ou la livraison offerte, avec un minimum d''achat, des dates et un nombre d''utilisations.',
   8, true);


-- ---------------------------------------------------------------------
-- Les codes
-- ---------------------------------------------------------------------
create table public.codes_promo (
  id                  uuid primary key default gen_random_uuid(),
  boutique_id         uuid not null references plateforme.boutiques (id) on delete cascade,
  -- En capitales, sans espace : l'acheteur le tape dans la casse qu'il veut.
  code                text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  type                text not null check (type in ('pourcentage', 'montant', 'livraison')),
  -- Le pourcentage (1 à 90) ou le montant en millimes (1 TND au moins) ;
  -- rien pour la livraison offerte.
  valeur              bigint,
  minimum_millimes    bigint not null default 0 check (minimum_millimes between 0 and 100000000),
  -- Valable de debut (inclus) à fin (exclue) ; l'écran les saisit en jours,
  -- heure de Tunis.
  debut               timestamptz,
  fin                 timestamptz,
  limite_utilisations integer check (limite_utilisations between 1 and 1000000),
  une_fois_par_client boolean not null default true,
  actif               boolean not null default true,
  -- Pour l'équipe : à qui il a été donné, pourquoi.
  note                text check (note is null or char_length(note) between 1 and 200),
  cree_par            uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, code),
  constraint codes_promo_valeur check (coalesce(case type
    when 'pourcentage' then valeur between 1 and 90
    when 'montant'     then valeur between 1000 and 100000000
    else valeur is null end, false)),
  constraint codes_promo_dates check (fin is null or debut is null or fin > debut)
);

comment on table public.codes_promo is
  'Les codes promo d''une boutique (module promotions) : un pourcentage, un montant ou la livraison offerte, et leurs conditions.';

create trigger codes_promo_updated_at before update on public.codes_promo
  for each row execute function private.set_updated_at();
create trigger codes_promo_boutique_immuable before update of boutique_id on public.codes_promo
  for each row execute function private.boutique_immuable();

alter table public.codes_promo enable row level security;
create policy "codes_promo: l'équipe lit ceux de sa boutique"
  on public.codes_promo for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.codes_promo from anon, authenticated;

-- La commande garde le code et sa remise (remise_millimes existe depuis la
-- migration 04) ; le code copié reste lisible si la boutique le retire.
alter table public.commandes
  add column code_promo_id uuid,
  add column code_promo    text,
  add constraint commandes_code_promo_fk foreign key (boutique_id, code_promo_id)
    references public.codes_promo (boutique_id, id) on delete set null (code_promo_id);

create index commandes_code_promo_idx on public.commandes (boutique_id, code_promo_id) where code_promo_id is not null;

comment on column public.commandes.code_promo is
  'Le code promo appliqué à la commande, copié (module promotions) ; la remise est dans remise_millimes.';


-- ---------------------------------------------------------------------
-- Les outils
-- ---------------------------------------------------------------------
create function private.promotions_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'promotions' and ma.actif)
$$;

-- Ce que l'acheteur a tapé, comme la base le range : « bienvenue 10 » → « BIENVENUE10 ».
create function private.code_saisi(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '')
$$;

-- Les utilisations d'un code : ses commandes, sauf annulées.
create function private.utilisations_code(p_boutique_id uuid, p_code_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.commandes c
   where c.boutique_id = p_boutique_id and c.code_promo_id = p_code_id and c.statut <> 'annulee'
$$;

-- « 150,000 » : un montant en dinars, pour les messages.
create function private.dinars(p_millimes bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(p_millimes / 1000.0, 'FM999999990.000'), '.', ',')
$$;

-- L'état d'un code, tel que l'écran le montre.
create function private.etat_code(p_c public.codes_promo, p_utilisations integer)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when not p_c.actif then 'coupe'
    when p_c.fin is not null and now() >= p_c.fin then 'termine'
    when p_c.limite_utilisations is not null and p_utilisations >= p_c.limite_utilisations then 'epuise'
    when p_c.debut is not null and now() < p_c.debut then 'programme'
    else 'actif'
  end
$$;


-- ---------------------------------------------------------------------
-- Le code sur un chiffrage (private.chiffre_commande) : la remise, le
-- nouveau total, et ce qu'on en dit. p_client_id et p_telephone : qui
-- commande, pour « une fois par client » (au devis, le compte connecté ; à
-- la commande, sa fiche et son numéro).
-- ---------------------------------------------------------------------
create function private.applique_code(
  p_boutique_id uuid,
  p_chiffrage   jsonb,
  p_code        text,
  p_client_id   uuid default null,
  p_telephone   text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_saisi  text := private.code_saisi(p_code);
  v_c      public.codes_promo;
  v_sous   bigint := coalesce((p_chiffrage ->> 'sous_total_millimes')::bigint, 0);
  v_frais  bigint := (p_chiffrage ->> 'frais_livraison_millimes')::bigint;
  v_raison text;
  v_remise bigint;
begin
  if v_saisi is null then
    return p_chiffrage || jsonb_build_object('code', null, 'remise_millimes', 0);
  end if;
  if private.promotions_actif(p_boutique_id) then
    select c.* into v_c from public.codes_promo c where c.boutique_id = p_boutique_id and c.code = v_saisi;
  end if;

  v_raison := case
    when v_c.id is null then 'inconnu'
    when not v_c.actif then 'coupe'
    when v_c.debut is not null and now() < v_c.debut then 'pas_encore'
    when v_c.fin is not null and now() >= v_c.fin then 'expire'
    when p_chiffrage ->> 'tarif' = 'devis' then 'devis'
    when v_c.limite_utilisations is not null
         and private.utilisations_code(p_boutique_id, v_c.id) >= v_c.limite_utilisations then 'epuise'
    when v_c.une_fois_par_client and exists (
           select 1 from public.commandes o
            where o.boutique_id = p_boutique_id and o.code_promo_id = v_c.id and o.statut <> 'annulee'
              and (o.client_id = p_client_id or o.contact_telephone = p_telephone)) then 'deja'
    when v_sous < v_c.minimum_millimes then 'minimum'
    when v_c.type = 'livraison' and p_chiffrage ->> 'mode' = 'retrait' then 'retrait'
    when v_c.type = 'livraison' and v_frais = 0 then 'offerte'
  end;

  if v_raison is null then
    v_remise := case v_c.type
      when 'pourcentage' then v_sous * v_c.valeur / 100
      when 'montant'     then least(v_c.valeur, v_sous)
      -- La livraison offerte : ses frais, connus avec le gouvernorat.
      else v_frais
    end;
  end if;

  return p_chiffrage || jsonb_build_object(
    'code', jsonb_build_object(
      'code',             v_saisi,
      'applique',         v_raison is null,
      'raison',           v_raison,
      'type',             case when v_raison <> 'inconnu' or v_raison is null then v_c.type end,
      'valeur',           case when v_raison <> 'inconnu' or v_raison is null then v_c.valeur end,
      'minimum_millimes', case when v_c.minimum_millimes > 0 then v_c.minimum_millimes end,
      'manque_millimes',  case when v_raison = 'minimum' then v_c.minimum_millimes - v_sous end,
      'debut',            case when v_raison = 'pas_encore' then v_c.debut end,
      'fin',              case when v_raison is null or v_raison = 'expire' then v_c.fin end),
    'remise_millimes', coalesce(v_remise, 0),
    'total_millimes',  (p_chiffrage ->> 'total_millimes')::bigint - coalesce(v_remise, 0));
end;
$$;

comment on function private.applique_code(uuid, jsonb, text, uuid, text) is
  'Applique un code promo à un chiffrage de private.chiffre_commande : remise_millimes, total_millimes réduit, et code (applique, raison du refus : inconnu, coupe, pas_encore, expire, devis, epuise, deja, minimum, retrait, offerte).';

-- La phrase d'un refus, pour la commande (la vitrine compose les siennes
-- à partir de la raison).
create function private.message_code(p_code jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code ->> 'raison'
    when 'coupe'      then 'Ce code n''est plus valable'
    when 'pas_encore' then 'Ce code n''est pas encore valable'
    when 'expire'     then 'Ce code a expiré'
    when 'devis'      then 'Un code promo ne s''applique pas à un devis : son prix est déjà négocié'
    when 'epuise'     then 'Ce code a déjà servi autant de fois que prévu'
    when 'deja'       then 'Ce code a déjà servi pour ce client : il vaut une fois par client'
    when 'minimum'    then 'Ce code vaut dès ' || private.dinars((p_code ->> 'minimum_millimes')::bigint) || ' TND d''achat'
    when 'retrait'    then 'Le retrait en magasin est déjà gratuit'
    when 'offerte'    then 'La livraison vous est déjà offerte'
    else 'Ce code n''est pas valable'
  end
$$;

revoke execute on function private.promotions_actif(uuid)                          from public, anon, authenticated;
revoke execute on function private.code_saisi(text)                                from public, anon, authenticated;
revoke execute on function private.utilisations_code(uuid, uuid)                   from public, anon, authenticated;
revoke execute on function private.dinars(bigint)                                  from public, anon, authenticated;
revoke execute on function private.etat_code(public.codes_promo, integer)          from public, anon, authenticated;
revoke execute on function private.applique_code(uuid, jsonb, text, uuid, text)    from public, anon, authenticated;
revoke execute on function private.message_code(jsonb)                             from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Le devis de la page de commande : un code de plus (migration 22, reprise)
-- ---------------------------------------------------------------------
drop function public.devis_commande(uuid, jsonb, text, text);
create function public.devis_commande(
  p_boutique_id uuid,
  p_lignes      jsonb,
  p_gouvernorat text default null,
  p_mode        text default null,
  p_code        text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_tel    text;
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  if coalesce(p_mode, 'domicile') not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  -- « Une fois par client » : ici, le compte connecté et son numéro ; un
  -- invité l'apprend à la commande, par le numéro qu'il donne.
  if private.code_saisi(p_code) is not null and auth.uid() is not null then
    select cl.id, cl.telephone into v_client, v_tel
      from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid();
    v_tel := coalesce(v_tel, private.telephone_tunisien((select u.phone from auth.users u where u.id = auth.uid())));
  end if;
  return private.applique_code(p_boutique_id,
           private.chiffre_commande(p_boutique_id, p_lignes, nullif(btrim(p_gouvernorat), ''), coalesce(p_mode = 'retrait', false)),
           p_code, v_client, v_tel);
end;
$$;

comment on function public.devis_commande(uuid, jsonb, text, text, text) is
  'Le récapitulatif de la page de commande, relu en base : prix, stock, frais du gouvernorat ou retrait, et le code promo tapé (module promotions : sa remise, ou pourquoi il ne s''applique pas).';

revoke execute on function public.devis_commande(uuid, jsonb, text, text, text) from public;
grant  execute on function public.devis_commande(uuid, jsonb, text, text, text) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Passer commande : le code promo tapé (migration 22, reprise ; ce qui
-- change : p_code, la remise et le code gardés sur la commande)
-- ---------------------------------------------------------------------
drop function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text);
create function public.passer_commande(
  p_boutique_id            uuid,
  p_cle_idempotence        text,
  p_lignes                 jsonb,
  p_contact                jsonb,
  p_livraison              jsonb,
  p_total_attendu_millimes bigint,
  p_note                   text default null,
  p_code                   text default null
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
  v_code_id   uuid;
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

  -- Le code promo (module promotions), verrouillé le temps de compter ses
  -- utilisations : deux commandes simultanées ne dépassent pas sa limite.
  if private.code_saisi(p_code) is not null then
    select c.id into v_code_id from public.codes_promo c
     where c.boutique_id = p_boutique_id and c.code = private.code_saisi(p_code);
    if v_code_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('code_promo:' || v_code_id::text, 0));
    end if;
  end if;

  v_devis := private.applique_code(p_boutique_id,
               private.chiffre_commande(p_boutique_id, p_lignes, v_gouv, v_mode = 'retrait'),
               p_code, v_client.id, v_tel);

  if not (v_devis ->> 'complet')::boolean then
    raise exception 'Un article n''est plus disponible dans la quantité demandée'
      using errcode = 'check_violation', hint = 'stock', detail = (v_devis -> 'lignes')::text;
  end if;
  -- Un code que l'acheteur a vu appliqué et qui ne l'est plus (sa limite
  -- atteinte entre-temps, déjà servi pour ce numéro) : on le lui dit, plutôt
  -- que « le total a changé ». Vu refusé, il commande sans lui.
  if jsonb_typeof(v_devis -> 'code') = 'object' and not (v_devis #>> '{code,applique}')::boolean
     and p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception '%', private.message_code(v_devis -> 'code')
      using errcode = 'check_violation', hint = 'code', detail = (v_devis -> 'code')::text;
  end if;
  if p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception 'Le total a changé : % millimes', v_devis ->> 'total_millimes'
      using errcode = 'check_violation', hint = 'total', detail = v_devis::text;
  end if;

  insert into public.commandes (
    boutique_id, cle_idempotence, origine, client_id, statut, mode_paiement, statut_paiement, mode_livraison,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes, code_promo_id, code_promo,
    transporteur, note_client, jeton_suivi_hash, conditions_acceptees)
  values (
    p_boutique_id, p_cle_idempotence, 'vitrine', v_client.id, 'recue', 'cod', 'en_attente', v_mode,
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
    (v_devis ->> 'remise_millimes')::bigint, (v_devis ->> 'total_millimes')::bigint,
    case when (v_devis #>> '{code,applique}')::boolean then v_code_id end,
    case when (v_devis #>> '{code,applique}')::boolean then v_devis #>> '{code,code}' end,
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

comment on function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text, text) is
  'Crée une commande de la vitrine en paiement à la livraison, livrée à domicile ou à retirer en magasin (livraison.mode), avec le code promo tapé (module promotions). Tout est relu et recalculé en base ; refus avec un indice (HINT) lisible par la vitrine. Exige l''accord de l''acheteur aux conditions (contact.accepte_conditions) et le garde sur la commande. Rend le numéro et un jeton de suivi (montré une fois).';

revoke execute on function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text, text) from public;
grant  execute on function public.passer_commande(uuid, text, jsonb, jsonb, jsonb, bigint, text, text) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Ce que l'acheteur et l'équipe lisent de la commande : son code
-- (migrations 22 et 33, reprises)
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
    'code_promo',               c.code_promo,
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
               'remise', c.remise_millimes, 'code_promo', c.code_promo, 'total', c.total_millimes,
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

    when 'sav' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', s.numero, 'date', s.created_at, 'statut', s.statut, 'issue', s.issue,
               'commande', c.numero, 'nom', coalesce(cl.nom, c.contact_nom), 'telephone', coalesce(cl.telephone, c.contact_telephone),
               'produit', s.produit_nom, 'declinaison', s.variante_libelle, 'reference', s.sku,
               'numero_serie', s.numero_serie, 'description', s.description, 'cloturee_le', s.cloturee_at)
             order by s.rang), '[]'::jsonb) into v_lignes
        from public.sav_demandes s
        join public.commandes c on c.boutique_id = s.boutique_id and c.id = s.commande_id
        left join public.clients cl on cl.boutique_id = s.boutique_id and cl.id = s.client_id
       where s.boutique_id = p_boutique_id;

    when 'versements' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'recu_le', v.recu_le, 'transporteur', v.transporteur, 'recu', v.recu_millimes,
               'attendu', v.attendu_millimes, 'ecart', v.recu_millimes - v.attendu_millimes,
               'colis', cardinality(v.numeros), 'commandes', array_to_string(v.numeros, ' '),
               'reference', v.reference, 'note', v.note, 'auteur', u.email, 'saisi_le', v.created_at,
               'annule_le', v.annule_le)
             order by v.recu_le, v.created_at), '[]'::jsonb) into v_lignes
        from public.versements v
        left join auth.users u on u.id = v.auteur_id
       where v.boutique_id = p_boutique_id;

    else
      raise exception 'Export inconnu : %', p_quoi using errcode = 'check_violation', hint = 'quoi';
  end case;

  perform private.console_trace(auth.uid(), p_boutique_id, 'export.' || p_quoi, null, null,
                                jsonb_build_object('lignes', jsonb_array_length(v_lignes)));
  return v_lignes;
end;
$$;


-- ---------------------------------------------------------------------
-- L'équipe : les codes et ce qu'ils rapportent, les gestes
-- ---------------------------------------------------------------------
-- Le module est-il actif, et la boutique a-t-elle des codes (la navigation).
create function public.gestion_promotions_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.promotions_actif(p_boutique_id),
    'codes', (select count(*) from public.codes_promo c where c.boutique_id = p_boutique_id));
end;
$$;

-- Les codes de la boutique : les vivants d'abord (actifs, programmés), puis
-- ceux qui ont fini ; chacun avec ses utilisations, les remises accordées
-- et les ventes qu'il a portées (commandes non annulées), ce qui en est
-- encaissé (livrées). Toute l'équipe lit.
create function public.gestion_codes_promo(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return (
    with stats as (
      select c.id,
             (count(o.id) filter (where o.statut <> 'annulee'))::integer          as utilisations,
             coalesce(sum(o.remise_millimes) filter (where o.statut <> 'annulee'), 0) as remises,
             coalesce(sum(o.total_millimes)  filter (where o.statut <> 'annulee'), 0) as ventes,
             coalesce(sum(o.total_millimes)  filter (where o.statut = 'livree'), 0)   as encaisse,
             max(o.created_at) filter (where o.statut <> 'annulee')                   as derniere,
             count(o.id) > 0                                                          as a_servi
        from public.codes_promo c
        left join public.commandes o on o.boutique_id = c.boutique_id and o.code_promo_id = c.id
       where c.boutique_id = p_boutique_id
       group by c.id
    ), lignes as (
      select c.*, s.utilisations, s.remises, s.ventes, s.encaisse, s.derniere, s.a_servi,
             private.etat_code(c, s.utilisations) as etat
        from public.codes_promo c join stats s on s.id = c.id
    )
    select jsonb_build_object(
      'actif', private.promotions_actif(p_boutique_id),
      'compteurs', jsonb_build_object(
        'vivants',          count(*) filter (where l.etat in ('actif', 'programme')),
        'termines',         count(*) filter (where l.etat not in ('actif', 'programme')),
        'utilisations',     coalesce(sum(l.utilisations), 0),
        'remises_millimes', coalesce(sum(l.remises), 0),
        'ventes_millimes',  coalesce(sum(l.ventes), 0)),
      'codes', coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'code', l.code, 'type', l.type, 'valeur', l.valeur, 'minimum_millimes', l.minimum_millimes,
        'debut', l.debut, 'fin', l.fin,
        -- Les jours de l'écran, heure de Tunis : le premier, et le dernier inclus.
        'debut_jour', (l.debut at time zone 'Africa/Tunis')::date,
        'fin_jour', ((l.fin at time zone 'Africa/Tunis') - interval '1 second')::date,
        'limite_utilisations', l.limite_utilisations, 'une_fois_par_client', l.une_fois_par_client,
        'actif', l.actif, 'etat', l.etat, 'note', l.note,
        'utilisations', l.utilisations, 'remises_millimes', l.remises, 'ventes_millimes', l.ventes,
        'encaisse_millimes', l.encaisse, 'derniere_utilisation', l.derniere, 'a_servi', l.a_servi,
        'cree_le', l.created_at, 'cree_par', (select u.email from auth.users u where u.id = l.cree_par))
        order by (l.etat in ('actif', 'programme')) desc, l.created_at desc, l.code), '[]'::jsonb))
    from lignes l
  );
end;
$$;

-- Créer (p_code_id vide) ou modifier un code. Les jours se saisissent à
-- Tunis : valable du premier jour à 0 h au dernier à minuit. Un code qui a
-- déjà servi garde son nom, son type et sa valeur (les commandes passées
-- les citent) ; le reste se règle encore.
create function public.gestion_enregistrer_code(
  p_boutique_id uuid,
  p_code_id     uuid,
  p_code        text,
  p_type        text,
  p_valeur      bigint,
  p_minimum     bigint  default 0,
  p_debut       date    default null,
  p_fin         date    default null,
  p_limite      integer default null,
  p_une_fois    boolean default true,
  p_note        text    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code   text := private.code_saisi(p_code);
  v_valeur bigint := case when p_type = 'livraison' then null else p_valeur end;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_debut  timestamptz := (p_debut::timestamp at time zone 'Africa/Tunis');
  v_fin    timestamptz := ((p_fin + 1)::timestamp at time zone 'Africa/Tunis');
  v_avant  public.codes_promo;
  v_apres  public.codes_promo;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not private.promotions_actif(p_boutique_id) then
    raise exception 'Les codes promo ne sont pas ouverts pour cette boutique' using errcode = 'check_violation', hint = 'module';
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,23}$' then
    raise exception 'Le code : de 3 à 24 lettres ou chiffres, sans espace ni accent (le tiret est permis)'
      using errcode = 'check_violation', hint = 'code';
  end if;
  if p_type is null or p_type not in ('pourcentage', 'montant', 'livraison') then
    raise exception 'Choisissez ce que le code offre' using errcode = 'check_violation', hint = 'type';
  end if;
  if p_type = 'pourcentage' and (v_valeur is null or v_valeur not between 1 and 90) then
    raise exception 'Une remise de 1 à 90 %%' using errcode = 'check_violation', hint = 'valeur';
  end if;
  if p_type = 'montant' and (v_valeur is null or v_valeur not between 1000 and 100000000) then
    raise exception 'Un montant d''au moins 1 TND' using errcode = 'check_violation', hint = 'valeur';
  end if;
  if coalesce(p_minimum, 0) not between 0 and 100000000 then
    raise exception 'Le minimum d''achat est illisible' using errcode = 'check_violation', hint = 'minimum';
  end if;
  if v_debut is not null and v_fin is not null and v_fin <= v_debut then
    raise exception 'Le dernier jour vient après le premier' using errcode = 'check_violation', hint = 'dates';
  end if;
  if p_limite is not null and p_limite not between 1 and 1000000 then
    raise exception 'Un nombre d''utilisations de 1 à 1 000 000, ou aucune limite' using errcode = 'check_violation', hint = 'limite';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'La note compte 200 caractères au plus' using errcode = 'check_violation', hint = 'note';
  end if;

  if p_code_id is null then
    begin
      insert into public.codes_promo (boutique_id, code, type, valeur, minimum_millimes, debut, fin,
                                      limite_utilisations, une_fois_par_client, note, cree_par)
      values (p_boutique_id, v_code, p_type, v_valeur, coalesce(p_minimum, 0), v_debut, v_fin,
              p_limite, coalesce(p_une_fois, true), v_note, auth.uid())
      returning * into v_apres;
    exception when unique_violation then
      raise exception 'Ce code existe déjà dans votre boutique' using errcode = 'check_violation', hint = 'doublon';
    end;
    perform private.console_trace(auth.uid(), p_boutique_id, 'code_promo.creer', v_apres.id::text, null,
      jsonb_build_object('code', v_apres.code, 'type', v_apres.type, 'valeur', v_apres.valeur));
  else
    select c.* into v_avant from public.codes_promo c where c.boutique_id = p_boutique_id and c.id = p_code_id for update;
    if not found then
      raise exception 'Ce code n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
    end if;
    if (v_code, p_type, v_valeur) is distinct from (v_avant.code, v_avant.type, v_avant.valeur)
       and exists (select 1 from public.commandes o where o.boutique_id = p_boutique_id and o.code_promo_id = v_avant.id) then
      raise exception 'Ce code a déjà servi : son nom et sa remise ne changent plus. Créez-en un autre'
        using errcode = 'check_violation', hint = 'servi';
    end if;
    begin
      update public.codes_promo set
        code = v_code, type = p_type, valeur = v_valeur, minimum_millimes = coalesce(p_minimum, 0),
        debut = v_debut, fin = v_fin, limite_utilisations = p_limite,
        une_fois_par_client = coalesce(p_une_fois, true), note = v_note
      where boutique_id = p_boutique_id and id = v_avant.id
      returning * into v_apres;
    exception when unique_violation then
      raise exception 'Ce code existe déjà dans votre boutique' using errcode = 'check_violation', hint = 'doublon';
    end;
    perform private.console_trace(auth.uid(), p_boutique_id, 'code_promo.modifier', v_apres.id::text,
      to_jsonb(v_avant) - '{boutique_id,cree_par,created_at,updated_at}'::text[],
      to_jsonb(v_apres) - '{boutique_id,cree_par,created_at,updated_at}'::text[]);
  end if;
  return jsonb_build_object('id', v_apres.id, 'code', v_apres.code);
end;
$$;

-- Couper (plus personne ne s'en sert), réactiver, retirer (un code qui n'a
-- jamais servi ; sinon on le coupe : les commandes le citent).
create function public.gestion_geste_code(p_boutique_id uuid, p_code_id uuid, p_geste text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.codes_promo;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select c.* into v_c from public.codes_promo c where c.boutique_id = p_boutique_id and c.id = p_code_id for update;
  if not found then
    raise exception 'Ce code n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  case p_geste
    when 'couper', 'reactiver' then
      if v_c.actif = (p_geste = 'reactiver') then
        raise exception '%', case when v_c.actif then 'Ce code est déjà actif' else 'Ce code est déjà coupé' end
          using errcode = 'check_violation', hint = 'etat';
      end if;
      if p_geste = 'reactiver' and not private.promotions_actif(p_boutique_id) then
        raise exception 'Les codes promo ne sont pas ouverts pour cette boutique' using errcode = 'check_violation', hint = 'module';
      end if;
      update public.codes_promo set actif = (p_geste = 'reactiver') where boutique_id = p_boutique_id and id = v_c.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'code_promo.' || p_geste, v_c.id::text,
        jsonb_build_object('code', v_c.code, 'actif', v_c.actif), jsonb_build_object('code', v_c.code, 'actif', p_geste = 'reactiver'));
    when 'retirer' then
      if exists (select 1 from public.commandes o where o.boutique_id = p_boutique_id and o.code_promo_id = v_c.id) then
        raise exception 'Ce code a déjà servi : coupez-le plutôt, les commandes le citent' using errcode = 'check_violation', hint = 'servi';
      end if;
      delete from public.codes_promo where boutique_id = p_boutique_id and id = v_c.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'code_promo.retirer', v_c.id::text,
        jsonb_build_object('code', v_c.code, 'type', v_c.type, 'valeur', v_c.valeur), null);
    else
      raise exception 'Geste inconnu' using errcode = 'check_violation', hint = 'geste';
  end case;
  return jsonb_build_object('code', v_c.code, 'geste', p_geste);
end;
$$;

revoke execute on function public.gestion_promotions_etat(uuid) from public, anon;
revoke execute on function public.gestion_codes_promo(uuid) from public, anon;
revoke execute on function public.gestion_enregistrer_code(uuid, uuid, text, text, bigint, bigint, date, date, integer, boolean, text) from public, anon;
revoke execute on function public.gestion_geste_code(uuid, uuid, text) from public, anon;
grant  execute on function public.gestion_promotions_etat(uuid) to authenticated;
grant  execute on function public.gestion_codes_promo(uuid) to authenticated;
grant  execute on function public.gestion_enregistrer_code(uuid, uuid, text, text, bigint, bigint, date, date, integer, boolean, text) to authenticated;
grant  execute on function public.gestion_geste_code(uuid, uuid, text) to authenticated;
