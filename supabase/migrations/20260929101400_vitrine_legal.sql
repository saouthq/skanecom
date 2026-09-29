-- =====================================================================
-- SkanEcom — 15 · VITRINE : PAGES LÉGALES ET CONSENTEMENT (PRD §6.1 V8)
-- =====================================================================
-- Chaque boutique publie ses mentions légales, ses conditions de vente
-- (avec la rétractation de la loi n° 2000-83 relative aux échanges et au
-- commerce électroniques) et sa politique de confidentialité (loi organique
-- n° 2004-63 sur la protection des données à caractère personnel).
-- L'application compose ces pages à partir d'un modèle et des réglages
-- « legal.* » de la boutique : raison sociale, adresse, identifiant unique
-- (RNE), matricule fiscal, délai de rétractation, frais de retour…
--
-- Et l'acheteur les accepte, explicitement, au moment de commander : la
-- base refuse une commande sans cet accord (indice « conditions »), et garde
-- sur la commande ce qui a été accepté, et quand.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('legal.raison_sociale', 'texte', null, '""', 'legal', null, true,
     'Raison sociale', 'Le nom légal de l''entreprise (ou du commerçant), tel qu''au registre.', 50),
  ('legal.forme_juridique', 'texte', null, '""', 'legal', null, true,
     'Forme juridique', 'Exemple : SARL, SUARL, entreprise individuelle.', 51),
  ('legal.adresse', 'texte', null, '""', 'legal', null, true,
     'Adresse du siège', 'L''adresse où la boutique peut être jointe par courrier.', 52),
  ('legal.identifiant_rne', 'texte', null, '""', 'legal', null, true,
     'Identifiant unique (RNE)', 'L''identifiant au registre national des entreprises.', 53),
  ('legal.matricule_fiscal', 'texte', null, '""', 'legal', null, true,
     'Matricule fiscal', null, 54),
  ('legal.email', 'texte', null, '""', 'legal', null, true,
     'Adresse électronique', 'Pour les réclamations, la rétractation et les demandes sur les données personnelles.', 55),
  ('legal.retractation_jours', 'entier', null, '10', 'legal', null, true,
     'Délai de rétractation (jours ouvrables)', 'Dix jours ouvrables au moins (loi n° 2000-83), à compter de la réception.', 56),
  ('legal.retour_frais', 'choix', '["client", "boutique"]', '"client"', 'legal', null, true,
     'Frais de retour en cas de rétractation', 'Client = à la charge de l''acheteur (la règle de la loi). Boutique = offerts par la boutique.', 57),
  ('legal.inpdp_reference', 'texte', null, '""', 'legal', null, true,
     'Référence de la déclaration INPDP', 'Affichée dans la politique de confidentialité une fois la déclaration faite.', 58);

-- Des valeurs qui se lisent dans un texte de loi : on les borne ici, pour
-- toute écriture (backoffice comme console).
create function private.valide_reglages_legaux()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cle = 'legal.retractation_jours'
     and ((new.valeur #>> '{}')::numeric < 10 or (new.valeur #>> '{}')::numeric > 60) then
    raise exception 'Le délai de rétractation compte de 10 à 60 jours ouvrables (loi n° 2000-83 : 10 au moins)'
      using errcode = 'check_violation', hint = 'limite';
  end if;
  if new.cle = 'legal.email' and new.valeur #>> '{}' <> ''
     and (new.valeur #>> '{}') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresse électronique illisible' using errcode = 'check_violation', hint = 'email';
  end if;
  if new.cle like 'legal.%' and jsonb_typeof(new.valeur) = 'string' and char_length(new.valeur #>> '{}') > 300 then
    raise exception 'Texte trop long (300 caractères au plus)' using errcode = 'check_violation', hint = 'limite';
  end if;
  return new;
end;
$$;

-- Après private.valide_reglage (ordre alphabétique des triggers) : le type
-- est déjà vérifié quand les bornes le sont.
create trigger reglages_valide_legaux
  before insert or update on public.reglages
  for each row when (new.cle like 'legal.%')
  execute function private.valide_reglages_legaux();

revoke execute on function private.valide_reglages_legaux() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Ce que l'acheteur a accepté, sur la commande
-- ---------------------------------------------------------------------
alter table public.commandes add column conditions_acceptees jsonb;

comment on column public.commandes.conditions_acceptees is
  'L''accord de l''acheteur aux conditions de vente et à la politique de confidentialité : quand, sur quel modèle, avec quel délai de rétractation. NULL pour une commande saisie par l''équipe.';

-- La version du modèle des pages légales (application/src/lib/legal.ts,
-- MODELE_LEGAL) : les deux changent ensemble.
create function private.modele_legal()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-29' $$;

revoke execute on function private.modele_legal() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Passer commande : la même fonction (migration 08), qui exige désormais
-- l'accord de l'acheteur (contact.accepte_conditions = true) et le garde.
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
    transporteur, note_client, jeton_suivi_hash, conditions_acceptees)
  values (
    p_boutique_id, p_cle_idempotence, 'vitrine', v_client.id, 'recue', 'cod', 'en_attente',
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint, 0,
    (v_devis ->> 'total_millimes')::bigint,
    nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), ''), v_note,
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
  'Crée une commande de la vitrine en paiement à la livraison. Tout est relu et recalculé en base ; refus avec un indice (HINT) lisible par la vitrine. Exige l''accord de l''acheteur aux conditions (contact.accepte_conditions) et le garde sur la commande. Rend le numéro et un jeton de suivi (montré une fois).';
