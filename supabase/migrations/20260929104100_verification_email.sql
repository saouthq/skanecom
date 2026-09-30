-- =====================================================================
-- SkanEcom — 42 · LA VÉRIFICATION PAR E-MAIL, À CÔTÉ DU SMS
-- =====================================================================
-- Le compte de l'acheteur se confirmait par un code SMS, qui coûte à chaque
-- envoi. Un code par e-mail ne coûte presque rien : « fais les deux et
-- mets-le en réglage » (compte.verification) —
--   · sms      : le code part par SMS, le numéro est vérifié ;
--   · email    : le code part par e-mail ;
--   · les_deux : l'acheteur choisit (SMS proposé d'abord). Par défaut.
--
-- Un compte ouvert par e-mail n'a pas de numéro vérifié. Ce qui en découle :
--   · à la commande, le numéro se saisit (celui du livreur), comme en
--     invité : public.passer_commande prend déjà le numéro du contact quand
--     le compte n'en a pas. L'appel de confirmation le vérifie, comme pour
--     toute commande ;
--   · pour une demande de devis ou de compte professionnel sans fiche dans la
--     boutique (jamais commandé), le numéro se donne d'abord :
--     public.renseigner_telephone crée la fiche, et les deux demandes disent
--     « telephone » (et non plus « compte ») quand il manque ;
--   · public.mon_telephone rend le numéro que la boutique connaît au compte
--     (sa fiche, sinon celui du compte SMS) : la vitrine ne le redemande pas.
-- Un numéro bloqué par la boutique ne se renseigne pas.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('compte.verification', 'choix', '["sms", "email", "les_deux"]', '"les_deux"', 'commande', null, true,
     'Vérification du compte client',
     'SMS = un code par SMS confirme le numéro. E-mail = un code par e-mail (presque gratuit) ; le numéro, saisi à la commande, se vérifie à l''appel de confirmation. Les deux = le client choisit, le SMS proposé d''abord.', 1);


-- ---------------------------------------------------------------------
-- Le numéro du compte, dans une boutique
-- ---------------------------------------------------------------------
create function public.mon_telephone(p_boutique_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.telephone from public.clients c where c.boutique_id = p_boutique_id and c.user_id = auth.uid()),
    private.telephone_tunisien((select u.phone from auth.users u where u.id = auth.uid())))
$$;

comment on function public.mon_telephone(uuid) is
  'Le numéro que la boutique connaît au compte connecté : celui de sa fiche, sinon celui du compte (SMS). NULL : un compte e-mail qui n''a encore rien demandé ici, ou personne de connecté.';

create function public.renseigner_telephone(p_boutique_id uuid, p_telephone text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_tel    text := private.telephone_tunisien(p_telephone);
  v_client public.clients;
begin
  if v_uid is null then
    raise exception 'Connectez-vous d''abord' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique inconnue' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  -- Une fiche existe déjà : son numéro ne change pas d'ici (l'équipe le
  -- corrige au backoffice).
  select * into v_client from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid;
  if found then
    return v_client.telephone;
  end if;
  if v_tel is null then
    raise exception 'Numéro tunisien à 8 chiffres attendu (par exemple 20 123 456)' using errcode = 'check_violation', hint = 'telephone';
  end if;
  if exists (select 1 from public.clients c
              where c.boutique_id = p_boutique_id and c.telephone = v_tel and c.niveau_risque = 'bloque') then
    raise exception 'Ce numéro ne peut pas faire de demande en ligne : contactez la boutique'
      using errcode = 'insufficient_privilege', hint = 'bloque';
  end if;
  insert into public.clients (boutique_id, user_id, telephone, email)
  values (p_boutique_id, v_uid, v_tel, (select u.email from auth.users u where u.id = v_uid))
  on conflict (boutique_id, user_id) do nothing;
  return (select c.telephone from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid);
end;
$$;

comment on function public.renseigner_telephone(uuid, text) is
  'Le numéro d''un compte e-mail, donné avant sa première demande dans une boutique : crée sa fiche client. Sans effet si la fiche existe (rend son numéro). Refuse un numéro bloqué par la boutique.';

revoke execute on function public.mon_telephone(uuid)              from public, anon;
revoke execute on function public.renseigner_telephone(uuid, text) from public, anon;
grant  execute on function public.mon_telephone(uuid)              to authenticated, service_role;
grant  execute on function public.renseigner_telephone(uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Les demandes de compte professionnel et de devis (migrations 36 et 37,
-- reprises) : ce qui change, le numéro qui manque à un compte e-mail
-- ---------------------------------------------------------------------
create or replace function public.demander_compte_pro(
  p_boutique_id      uuid,
  p_raison_sociale   text,
  p_matricule_fiscal text default null,
  p_metier           text default null,
  p_message          text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_raison    text := nullif(btrim(regexp_replace(coalesce(p_raison_sociale, ''), '\s+', ' ', 'g')), '');
  v_matricule text := nullif(upper(regexp_replace(coalesce(p_matricule_fiscal, ''), '\s+', '', 'g')), '');
  v_metier    text := nullif(btrim(coalesce(p_metier, '')), '');
  v_message   text := nullif(btrim(coalesce(p_message, '')), '');
  v_tel       text;
  v_client    public.clients;
  v_avant     text;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour demander un compte professionnel'
      using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active')
     or not private.comptes_pro_actif(p_boutique_id) then
    raise exception 'Cette boutique n''ouvre pas de compte professionnel en ligne' using errcode = 'check_violation', hint = 'module';
  end if;
  if v_raison is null or char_length(v_raison) not between 2 and 120 then
    raise exception 'Indiquez le nom de votre entreprise (2 à 120 caractères)' using errcode = 'check_violation', hint = 'raison_sociale';
  end if;
  if v_matricule is not null and char_length(v_matricule) not between 5 and 30 then
    raise exception 'Matricule fiscal illisible (5 à 30 caractères, par exemple 1234567A/M/000)'
      using errcode = 'check_violation', hint = 'matricule';
  end if;
  if char_length(coalesce(v_metier, '')) > 80 then
    raise exception 'Métier trop long (80 caractères au plus)' using errcode = 'check_violation', hint = 'metier';
  end if;
  if char_length(coalesce(v_message, '')) > 500 then
    raise exception 'Message trop long (500 caractères au plus)' using errcode = 'check_violation', hint = 'message';
  end if;

  -- La fiche client du compte : créée si le client n'a encore rien commandé.
  -- Un compte ouvert par e-mail n'a pas de numéro : il le donne d'abord
  -- (public.renseigner_telephone).
  v_tel := private.telephone_tunisien((select u.phone from auth.users u where u.id = v_uid));
  select * into v_client from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid;
  if not found then
    if v_tel is null then
      raise exception 'Indiquez votre numéro de téléphone : la boutique vous rappelle sur ce numéro'
        using errcode = 'check_violation', hint = 'telephone';
    end if;
    insert into public.clients (boutique_id, user_id, telephone) values (p_boutique_id, v_uid, v_tel)
    returning * into v_client;
  end if;
  if v_client.niveau_risque = 'bloque' then
    raise exception 'Ce compte ne peut pas faire de demande en ligne : contactez la boutique'
      using errcode = 'insufficient_privilege', hint = 'bloque';
  end if;

  select cp.statut into v_avant from public.comptes_pro cp
   where cp.boutique_id = p_boutique_id and cp.client_id = v_client.id for update;
  if v_avant = 'valide' then
    raise exception 'Votre compte professionnel est déjà ouvert' using errcode = 'check_violation', hint = 'deja';
  end if;

  -- Une demande en attente se complète ; après un refus ou un retrait, on
  -- redemande (la boutique tranche de nouveau).
  insert into public.comptes_pro as cp (boutique_id, client_id, raison_sociale, matricule_fiscal, metier, message)
  values (p_boutique_id, v_client.id, v_raison, v_matricule, v_metier, v_message)
  on conflict (boutique_id, client_id) do update
    set statut = 'demande', raison_sociale = excluded.raison_sociale, matricule_fiscal = excluded.matricule_fiscal,
        metier = excluded.metier, message = excluded.message,
        motif = null, decide_le = null, decide_par = null,
        demande_le = case when cp.statut = 'demande' then cp.demande_le else now() end;

  return public.mon_compte_pro(p_boutique_id);
end;
$$;

create or replace function public.demander_devis(p_boutique_id uuid, p_lignes jsonb, p_message text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_tel     text;
  v_client  public.clients;
  v_rang    integer;
  v_numero  text;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour demander un devis' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active')
     or not private.devis_actif(p_boutique_id) then
    raise exception 'Cette boutique ne fait pas de devis en ligne' using errcode = 'check_violation', hint = 'module';
  end if;
  if char_length(coalesce(v_message, '')) > 1000 then
    raise exception 'Message trop long (1 000 caractères au plus)' using errcode = 'check_violation', hint = 'message';
  end if;
  -- Le panier : lu comme celui d'une commande (lignes, quantités, doublons).
  perform 1 from private.lignes_panier(p_lignes);
  if exists (select 1 from private.lignes_panier(p_lignes) d
              left join public.variantes v on v.boutique_id = p_boutique_id and v.id = d.variante_id and v.actif
              left join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id and p.publie
             where p.id is null) then
    raise exception 'Un article n''est plus en vente : retirez-le du panier' using errcode = 'check_violation', hint = 'panier';
  end if;

  -- Un compte ouvert par e-mail sans fiche : son numéro d'abord
  -- (public.renseigner_telephone).
  v_tel := private.telephone_tunisien((select u.phone from auth.users u where u.id = v_uid));
  select * into v_client from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid;
  if not found then
    if v_tel is null then
      raise exception 'Indiquez votre numéro de téléphone : la boutique vous rappelle sur ce numéro'
        using errcode = 'check_violation', hint = 'telephone';
    end if;
    insert into public.clients (boutique_id, user_id, telephone) values (p_boutique_id, v_uid, v_tel) returning * into v_client;
  end if;
  if v_client.niveau_risque = 'bloque' then
    raise exception 'Ce compte ne peut pas demander de devis en ligne : contactez la boutique'
      using errcode = 'insufficient_privilege', hint = 'bloque';
  end if;

  -- Deux demandes simultanées de la même boutique prennent chacune leur rang.
  perform 1 from plateforme.boutiques b where b.id = p_boutique_id for no key update;
  if (select count(*) from public.devis d
       where d.boutique_id = p_boutique_id and d.client_id = v_client.id and d.statut in ('demande', 'envoye')
         and private.statut_devis(d.statut, d.valide_jusqu_au) <> 'expire') >= 3 then
    raise exception 'Trois devis sont déjà en cours : la boutique vous répond' using errcode = 'check_violation', hint = 'trop';
  end if;

  select coalesce(max(d.rang), 0) + 1 into v_rang from public.devis d where d.boutique_id = p_boutique_id;
  v_numero := 'DEV-' || lpad(v_rang::text, 5, '0');
  insert into public.devis (boutique_id, rang, numero, client_id, message)
  values (p_boutique_id, v_rang, v_numero, v_client.id, v_message)
  returning id into v_id;

  insert into public.devis_lignes (boutique_id, devis_id, variante_id, position, quantite,
                                   produit_nom, variante_libelle, sku, prix_catalogue_millimes)
  select p_boutique_id, v_id, v.id, row_number() over (order by coalesce(p.nom_fr, p.nom_ar), v.position, v.sku)::integer,
         d.quantite, coalesce(p.nom_fr, p.nom_ar), private.libelle_variante(p_boutique_id, p.id, v.options), v.sku, v.prix_millimes
    from private.lignes_panier(p_lignes) d
    join public.variantes v on v.boutique_id = p_boutique_id and v.id = d.variante_id
    join public.produits  p on p.boutique_id = v.boutique_id and p.id = v.produit_id;

  return jsonb_build_object('numero', v_numero);
end;
$$;


-- ---------------------------------------------------------------------
-- L'équipe : quelles commandes portent un numéro vérifié
-- ---------------------------------------------------------------------
-- « Compte client » ne veut plus dire « numéro vérifié par SMS » : un compte
-- e-mail a donné son numéro sans le prouver. La liste et la fiche d'une
-- commande le disent à qui appelle : le numéro de la commande est celui du
-- compte SMS de son client, confirmé.
create function public.gestion_numeros_verifies(p_boutique_id uuid, p_commandes text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return coalesce((
    select array_agg(k.numero order by k.numero)
      from public.commandes k
      join public.clients c on c.boutique_id = k.boutique_id and c.id = k.client_id
      join auth.users u on u.id = c.user_id
     where k.boutique_id = p_boutique_id
       and k.numero = any (coalesce(p_commandes, '{}'))
       and u.phone_confirmed_at is not null
       and private.telephone_tunisien(u.phone) = k.contact_telephone), '{}');
end;
$$;

comment on function public.gestion_numeros_verifies(uuid, text[]) is
  'Parmi les commandes demandées (numéros), celles dont le numéro de contact est celui du compte SMS confirmé de leur client. Un compte e-mail n''y figure pas : son numéro se vérifie à l''appel.';

revoke execute on function public.gestion_numeros_verifies(uuid, text[]) from public, anon;
grant  execute on function public.gestion_numeros_verifies(uuid, text[]) to authenticated, service_role;
