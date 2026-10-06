-- =====================================================================
-- Le paiement en ligne Konnect, sur le compte de la boutique (PRD V9,
-- cadrage 02 § 4.2, décision D14) — coupé par défaut.
--
--   · SkanEcom n'encaisse jamais : chaque boutique branche SON compte
--     Konnect (son portefeuille, sa clé d'API) depuis son backoffice ; la
--     clé est chiffrée par l'application (secret du Worker), la base ne
--     garde qu'un chiffré lié à la boutique, et ses quatre derniers
--     caractères pour la reconnaître ;
--   · le réglage « Paiement en ligne » ne s'allume qu'avec un compte
--     branché ; retirer le compte l'éteint ;
--   · la commande se passe comme avant, puis l'application ouvre le
--     paiement chez Konnect et y envoie l'acheteur. Konnect injoignable :
--     la commande reste à payer à la livraison (D14) ;
--   · Konnect prévient par un appel non signé : on n'en garde que la
--     référence, et l'état se relit chez Konnect avant d'être noté. Payée,
--     la commande ne laisse rien à encaisser au livreur (bordereau) ;
--   · une boutique peut ne prendre que le paiement en ligne :
--     passer_commande l'accepte quand Konnect est prêt.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Le compte Konnect de la boutique
-- ---------------------------------------------------------------------
create table plateforme.konnect_comptes (
  boutique_id  uuid primary key references plateforme.boutiques (id) on delete cascade,
  -- L'identifiant du portefeuille qui reçoit (tableau de bord Konnect).
  wallet_id    text not null check (wallet_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- La clé d'API, chiffrée par l'application (lib/gestion/chiffre.ts) ; jamais en clair.
  cle_chiffree text not null check (char_length(cle_chiffree) between 20 and 2000),
  cle_fin      text not null check (char_length(cle_fin) between 1 and 4),
  -- « essai » : le bac à sable de Konnect (aucun argent réel) ; « reel » : la production.
  mode         text not null default 'essai' check (mode in ('essai', 'reel')),
  branche_le   timestamptz not null default now(),
  branche_par  uuid references auth.users (id) on delete set null
);
alter table plateforme.konnect_comptes enable row level security;
comment on table plateforme.konnect_comptes is
  'Le compte Konnect d''une boutique (le sien) : portefeuille, clé chiffrée, essai ou réel.';

-- ---------------------------------------------------------------------
-- Les paiements ouverts chez Konnect
-- ---------------------------------------------------------------------
create table plateforme.paiements (
  id               bigint generated always as identity primary key,
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  commande_id      uuid not null references public.commandes (id) on delete cascade,
  fournisseur      text not null default 'konnect' check (fournisseur in ('konnect')),
  -- La référence du paiement chez Konnect (paymentRef).
  reference        text not null unique check (reference ~ '^[A-Za-z0-9_-]{6,80}$'),
  -- La page de paiement (payUrl), le temps qu'elle vaut.
  adresse          text check (adresse is null or adresse ~ '^https?://'),
  montant_millimes bigint not null check (montant_millimes > 0),
  mode             text not null check (mode in ('essai', 'reel')),
  statut           public.statut_paiement not null default 'en_attente',
  ouvert_le        timestamptz not null default now(),
  verifie_le       timestamptz,
  paye_le          timestamptz,
  details          jsonb
);
create index paiements_commande on plateforme.paiements (commande_id, ouvert_le desc);
alter table plateforme.paiements enable row level security;
comment on table plateforme.paiements is
  'Les paiements en ligne ouverts chez Konnect pour une commande ; l''état se relit chez Konnect.';

-- ---------------------------------------------------------------------
-- Konnect est-il prêt pour cette boutique ?
-- ---------------------------------------------------------------------
create function private.konnect_pret(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.reglage(p_boutique_id, 'paiement.konnect_actif'))::boolean, false)
     and exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'paiement_en_ligne' and ma.actif)
     and exists (select 1 from plateforme.konnect_comptes k where k.boutique_id = p_boutique_id);
$$;
revoke execute on function private.konnect_pret(uuid) from public, anon, authenticated;

-- Le réglage ne s'allume qu'avec un compte branché.
create function private.reglage_konnect_garde()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cle = 'paiement.konnect_actif' and coalesce((new.valeur)::boolean, false)
     and not exists (select 1 from plateforme.konnect_comptes k where k.boutique_id = new.boutique_id) then
    raise exception 'Branchez d''abord le compte Konnect de la boutique (son portefeuille et sa clé)'
      using errcode = 'check_violation', hint = 'konnect';
  end if;
  return new;
end;
$$;
create trigger reglages_konnect before insert or update of valeur on public.reglages
  for each row execute function private.reglage_konnect_garde();
revoke execute on function private.reglage_konnect_garde() from public, anon, authenticated;

-- Le module se propose désormais (la console l'active, la boutique branche son compte).
update plateforme.modules set disponible = true,
       description_fr = 'Konnect, sur le compte de la boutique : carte bancaire, e-dinar, portefeuille. Elle branche son compte dans ses Réglages.'
 where code = 'paiement_en_ligne';

-- ---------------------------------------------------------------------
-- Le backoffice : lire, retirer (brancher passe par l'application, qui chiffre)
-- ---------------------------------------------------------------------
create function public.gestion_konnect(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mois timestamptz := date_trunc('month', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis';
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  return jsonb_build_object(
    'module_actif', exists (select 1 from plateforme.modules_actifs ma
                             where ma.boutique_id = p_boutique_id and ma.module = 'paiement_en_ligne' and ma.actif),
    'actif', coalesce((private.reglage(p_boutique_id, 'paiement.konnect_actif'))::boolean, false),
    'cod_actif', coalesce((private.reglage(p_boutique_id, 'paiement.cod_actif'))::boolean, true),
    'compte', (select jsonb_build_object('wallet_id', k.wallet_id, 'cle_fin', k.cle_fin, 'mode', k.mode, 'branche_le', k.branche_le)
                 from plateforme.konnect_comptes k where k.boutique_id = p_boutique_id),
    'mois', jsonb_build_object(
      'payes', (select count(*) from plateforme.paiements p where p.boutique_id = p_boutique_id and p.statut = 'paye' and p.paye_le >= v_mois),
      'encaisse_millimes', coalesce((select sum(p.montant_millimes) from plateforme.paiements p
                                      where p.boutique_id = p_boutique_id and p.statut = 'paye' and p.paye_le >= v_mois), 0),
      'en_attente', (select count(*) from plateforme.paiements p where p.boutique_id = p_boutique_id and p.statut = 'en_attente'),
      -- Des commandes, pas des tentatives : réessayer deux fois ne compte qu'une.
      'echoues', (select count(distinct p.commande_id) from plateforme.paiements p join public.commandes c on c.id = p.commande_id
                   where p.boutique_id = p_boutique_id and p.statut = 'echoue' and p.ouvert_le >= v_mois and c.statut_paiement <> 'paye')));
end;
$$;

create function public.gestion_konnect_retirer(p_boutique_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant plateforme.konnect_comptes;
  v_av jsonb := '{}'::jsonb;
  v_ap jsonb := '{}'::jsonb;
  v_k jsonb;
  v_c jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  delete from plateforme.konnect_comptes k where k.boutique_id = p_boutique_id returning * into v_avant;
  if v_avant.boutique_id is null then
    return false;
  end if;
  -- Sans compte, plus de paiement en ligne (et toujours un moyen de payer) :
  -- les deux réglages reviennent à leur défaut (en ligne non, à la livraison oui).
  v_k := coalesce((select r.valeur from public.reglages r where r.boutique_id = p_boutique_id and r.cle = 'paiement.konnect_actif'), 'false'::jsonb);
  v_c := coalesce((select r.valeur from public.reglages r where r.boutique_id = p_boutique_id and r.cle = 'paiement.cod_actif'), 'true'::jsonb);
  delete from public.reglages r where r.boutique_id = p_boutique_id and r.cle in ('paiement.konnect_actif', 'paiement.cod_actif');
  if v_k <> 'false'::jsonb then
    v_av := v_av || jsonb_build_object('paiement.konnect_actif', v_k);
    v_ap := v_ap || jsonb_build_object('paiement.konnect_actif', false);
  end if;
  if v_c <> 'true'::jsonb then
    v_av := v_av || jsonb_build_object('paiement.cod_actif', v_c);
    v_ap := v_ap || jsonb_build_object('paiement.cod_actif', true);
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'konnect.retirer', null,
    jsonb_build_object('wallet', v_avant.wallet_id, 'cle', '…' || v_avant.cle_fin, 'mode', v_avant.mode), null);
  -- Et dans le journal des réglages, comme un changement fait à la main.
  if v_av <> '{}'::jsonb then
    perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.modifier', null, v_av, v_ap);
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- L'application (clé de service) : brancher, ouvrir, relire, noter
-- ---------------------------------------------------------------------
create function public.konnect_brancher(p_boutique_id uuid, p_user uuid, p_wallet text, p_cle_chiffree text,
                                        p_cle_fin text, p_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant plateforme.konnect_comptes;
begin
  -- La personne qui branche : propriétaire ou administrateur de la boutique (l'application l'a vérifié ; la base le redit).
  if not exists (select 1 from plateforme.membres m
                  where m.boutique_id = p_boutique_id and m.user_id = p_user and m.actif and m.role in ('proprietaire', 'admin')) then
    raise exception 'Seuls le propriétaire et les administrateurs branchent le paiement en ligne' using errcode = '42501';
  end if;
  if p_mode not in ('essai', 'reel') then
    raise exception 'Mode inconnu : essai ou réel' using errcode = '22023';
  end if;
  if coalesce(p_wallet, '') !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'L''identifiant du portefeuille est illisible (tableau de bord Konnect → portefeuille)' using errcode = '22023', hint = 'konnect';
  end if;
  select * into v_avant from plateforme.konnect_comptes k where k.boutique_id = p_boutique_id;
  insert into plateforme.konnect_comptes (boutique_id, wallet_id, cle_chiffree, cle_fin, mode, branche_par)
  values (p_boutique_id, p_wallet, p_cle_chiffree, left(coalesce(p_cle_fin, ''), 4), p_mode, p_user)
  on conflict (boutique_id) do update
    set wallet_id = excluded.wallet_id, cle_chiffree = excluded.cle_chiffree, cle_fin = excluded.cle_fin,
        mode = excluded.mode, branche_le = now(), branche_par = p_user;
  perform private.console_trace(p_user, p_boutique_id, 'konnect.brancher', null,
    case when v_avant.boutique_id is null then null
         else jsonb_build_object('wallet', v_avant.wallet_id, 'cle', '…' || v_avant.cle_fin, 'mode', v_avant.mode) end,
    jsonb_build_object('wallet', p_wallet, 'cle', '…' || left(coalesce(p_cle_fin, ''), 4), 'mode', p_mode));
  return jsonb_build_object('wallet_id', p_wallet, 'mode', p_mode, 'remplace', v_avant.boutique_id is not null);
end;
$$;

-- Ce qu'il faut pour ouvrir le paiement d'une commande que l'acheteur vient
-- de passer (son numéro et son jeton) ; rien si elle ne s'y prête pas.
create function public.konnect_preparer(p_boutique_id uuid, p_numero text, p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'commande_id', c.id, 'numero', c.numero, 'total_millimes', c.total_millimes,
    'contact', jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'wallet_id', k.wallet_id, 'cle_chiffree', k.cle_chiffree, 'mode', k.mode,
    'cod_actif', coalesce((private.reglage(c.boutique_id, 'paiement.cod_actif'))::boolean, true))
  from public.commandes c
  join plateforme.konnect_comptes k on k.boutique_id = c.boutique_id
  where c.boutique_id = p_boutique_id and c.numero = p_numero
    and c.jeton_suivi_hash = sha256(convert_to(coalesce(p_jeton, ''), 'UTF8'))
    and c.statut in ('a_arbitrer', 'recue', 'confirmee')
    and c.statut_paiement <> 'paye' and c.total_millimes > 0
    and private.konnect_pret(c.boutique_id);
$$;

create function public.konnect_ouvert(p_commande_id uuid, p_reference text, p_adresse text, p_montant bigint, p_mode text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_boutique uuid;
begin
  select c.boutique_id into v_boutique from public.commandes c where c.id = p_commande_id;
  if v_boutique is null then
    raise exception 'Commande introuvable' using errcode = 'no_data_found';
  end if;
  -- Un paiement plus ancien encore ouvert est remplacé par celui-ci.
  update plateforme.paiements p set statut = 'echoue', verifie_le = now()
   where p.commande_id = p_commande_id and p.statut = 'en_attente';
  insert into plateforme.paiements (boutique_id, commande_id, reference, adresse, montant_millimes, mode)
  values (v_boutique, p_commande_id, p_reference, p_adresse, p_montant, p_mode)
  on conflict (reference) do nothing;
  update public.commandes c set mode_paiement = 'konnect', statut_paiement = 'en_attente'
   where c.id = p_commande_id and c.statut_paiement <> 'paye';
end;
$$;

-- Konnect injoignable pour une boutique qui ne prend pas le paiement à la
-- livraison : la commande reste « à payer en ligne », à réessayer.
create function public.konnect_a_reessayer(p_commande_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.commandes c set mode_paiement = 'konnect'
   where c.id = p_commande_id and c.statut_paiement <> 'paye'
     and not coalesce((private.reglage(c.boutique_id, 'paiement.cod_actif'))::boolean, true);
$$;

-- Pour relire un paiement chez Konnect (l'appel de Konnect, le retour de l'acheteur).
create function public.konnect_paiement(p_reference text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', p.reference, 'boutique_id', p.boutique_id, 'commande_id', p.commande_id, 'numero', c.numero,
    'statut', p.statut, 'montant_millimes', p.montant_millimes, 'mode', p.mode,
    'cle_chiffree', k.cle_chiffree)
  from plateforme.paiements p
  join public.commandes c on c.id = p.commande_id
  left join plateforme.konnect_comptes k on k.boutique_id = p.boutique_id
  where p.reference = p_reference;
$$;

-- Noter ce que Konnect a répondu. Jamais de retour en arrière sur un
-- paiement reçu ; un montant différent de celui ouvert n'est pas « payé ».
create function public.konnect_noter(p_reference text, p_statut text, p_montant_paye bigint, p_details jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v plateforme.paiements;
  v_statut public.statut_paiement;
begin
  select * into v from plateforme.paiements p where p.reference = p_reference for update;
  if v.id is null then
    raise exception 'Paiement inconnu' using errcode = 'no_data_found';
  end if;
  v_statut := case
    when p_statut = 'paye' and p_montant_paye is not null and p_montant_paye >= v.montant_millimes then 'paye'
    when p_statut in ('echoue', 'expire') then 'echoue'
    else 'en_attente' end::public.statut_paiement;
  if v.statut = 'paye' then
    update plateforme.paiements p set verifie_le = now() where p.id = v.id;
    return jsonb_build_object('statut', 'paye', 'change', false, 'numero', (select numero from public.commandes where id = v.commande_id));
  end if;
  update plateforme.paiements p
     set statut = v_statut, verifie_le = now(), details = case when octet_length(coalesce(p_details, '{}'::jsonb)::text) <= 8000 then p_details
                        else jsonb_build_object('tronque', true) end,
         paye_le = case when v_statut = 'paye' then now() end
   where p.id = v.id;
  if v_statut = 'paye' then
    update public.commandes c set statut_paiement = 'paye', mode_paiement = 'konnect' where c.id = v.commande_id;
  elsif v_statut = 'echoue' and not exists (select 1 from plateforme.paiements p
                                             where p.commande_id = v.commande_id and p.statut = 'en_attente') then
    update public.commandes c set statut_paiement = 'echoue' where c.id = v.commande_id and c.mode_paiement = 'konnect';
  end if;
  return jsonb_build_object('statut', v_statut, 'change', v_statut is distinct from v.statut,
                            'numero', (select numero from public.commandes where id = v.commande_id));
end;
$$;

-- ---------------------------------------------------------------------
-- La vitrine : l'acheteur et sa commande (son numéro et son jeton)
-- ---------------------------------------------------------------------
create function public.vitrine_paiement(p_boutique_id uuid, p_numero text, p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mode_paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement, 'total_millimes', c.total_millimes,
    'cod_actif', coalesce((private.reglage(c.boutique_id, 'paiement.cod_actif'))::boolean, true),
    'konnect_pret', private.konnect_pret(c.boutique_id),
    'paiement', (select jsonb_build_object('reference', p.reference, 'adresse', p.adresse, 'statut', p.statut, 'ouvert_le', p.ouvert_le)
                   from plateforme.paiements p where p.commande_id = c.id order by p.ouvert_le desc limit 1))
  from public.commandes c
  where c.boutique_id = p_boutique_id and c.numero = p_numero
    and c.jeton_suivi_hash = sha256(convert_to(coalesce(p_jeton, ''), 'UTF8'));
$$;

-- « Payer à la livraison à la place » : un paiement en ligne abandonné.
create function public.vitrine_payer_a_la_livraison(p_boutique_id uuid, p_numero text, p_jeton text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce((private.reglage(p_boutique_id, 'paiement.cod_actif'))::boolean, true) then
    raise exception 'Cette boutique ne prend que le paiement en ligne' using errcode = 'check_violation', hint = 'paiement';
  end if;
  select c.id into v_id from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = p_numero
     and c.jeton_suivi_hash = sha256(convert_to(coalesce(p_jeton, ''), 'UTF8'))
     and c.mode_paiement = 'konnect' and c.statut_paiement <> 'paye'
     and c.statut in ('a_arbitrer', 'recue', 'confirmee')
   for update;
  if v_id is null then
    return false;
  end if;
  update plateforme.paiements p set statut = 'echoue', verifie_le = now() where p.commande_id = v_id and p.statut = 'en_attente';
  update public.commandes c set mode_paiement = 'cod', statut_paiement = 'en_attente' where c.id = v_id;
  return true;
end;
$$;

-- L'équipe, au téléphone : le client paiera à la livraison (son paiement en
-- ligne n'a pas abouti). Un paiement qui arriverait quand même ensuite
-- l'emporte : konnect_noter remet la commande en « payée en ligne ».
create function public.gestion_payer_a_la_livraison(p_boutique_id uuid, p_numero text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
begin
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur}', null);
  if v_commande.mode_paiement <> 'konnect' or v_commande.statut_paiement = 'paye' then
    raise exception 'Cette commande n''attend pas de paiement en ligne' using errcode = 'check_violation', hint = 'change';
  end if;
  if v_commande.statut not in ('a_arbitrer', 'recue', 'confirmee') then
    raise exception 'La commande est déjà « % » : le moyen de paiement ne change plus', v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;
  update plateforme.paiements p set statut = 'echoue', verifie_le = now() where p.commande_id = v_commande.id and p.statut = 'en_attente';
  update public.commandes c set mode_paiement = 'cod', statut_paiement = 'en_attente'
   where c.boutique_id = p_boutique_id and c.id = v_commande.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.gestion_konnect(uuid) from public, anon;
revoke execute on function public.gestion_konnect_retirer(uuid) from public, anon;
grant  execute on function public.gestion_konnect(uuid) to authenticated;
grant  execute on function public.gestion_konnect_retirer(uuid) to authenticated;
revoke execute on function public.gestion_payer_a_la_livraison(uuid, text) from public, anon;
grant  execute on function public.gestion_payer_a_la_livraison(uuid, text) to authenticated;
revoke execute on function public.konnect_brancher(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.konnect_preparer(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.konnect_ouvert(uuid, text, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.konnect_a_reessayer(uuid) from public, anon, authenticated;
revoke execute on function public.konnect_paiement(text) from public, anon, authenticated;
revoke execute on function public.konnect_noter(text, text, bigint, jsonb) from public, anon, authenticated;
grant  execute on function public.konnect_brancher(uuid, uuid, text, text, text, text) to service_role;
grant  execute on function public.konnect_preparer(uuid, text, text) to service_role;
grant  execute on function public.konnect_ouvert(uuid, text, text, bigint, text) to service_role;
grant  execute on function public.konnect_a_reessayer(uuid) to service_role;
grant  execute on function public.konnect_paiement(text) to service_role;
grant  execute on function public.konnect_noter(text, text, bigint, jsonb) to service_role;
grant  execute on function public.vitrine_paiement(uuid, text, text) to anon, authenticated;
grant  execute on function public.vitrine_payer_a_la_livraison(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Passer commande : le paiement en ligne seul suffit, quand Konnect est
-- prêt (reprise à l'identique de …_precommandes, sauf ce contrôle)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.passer_commande(p_boutique_id uuid, p_cle_idempotence text, p_lignes jsonb, p_contact jsonb, p_livraison jsonb, p_total_attendu_millimes bigint, p_note text DEFAULT NULL::text, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Paiement : à la livraison, ou en ligne seul quand Konnect est prêt (…_konnect) ;
  -- l'application ouvre ensuite le paiement chez Konnect.
  if not coalesce((private.reglage(p_boutique_id, 'paiement.cod_actif'))::boolean, true)
     and not private.konnect_pret(p_boutique_id) then
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
     prix_unitaire_millimes, quantite, total_ligne_millimes, lot_id, lot_nom, remise_lot_millimes,
     precommande, precommande_arrivage_id)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint, (l ->> 'lot_id')::uuid, l ->> 'lot',
         coalesce((l ->> 'remise_lot_millimes')::bigint, 0),
         coalesce(jsonb_typeof(l -> 'precommande') = 'object', false), (l #>> '{precommande,arrivage_id}')::uuid
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
$function$;
