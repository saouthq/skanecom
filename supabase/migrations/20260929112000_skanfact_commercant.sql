-- =====================================================================
-- SkanEcom — 81 · LA FACTURATION DU COMMERÇANT, DANS SON SKANFACT
-- =====================================================================
--
-- Briques 131 à 133 de SkanFact (docs/boutique.md de la plateforme, B0 à
-- B4) : le commerçant tient sa facturation et sa comptabilité dans
-- SkanFact ; SkanEcom ne refait ni l'un ni l'autre.
--
--   · B0 « Connecter SkanFact » : le commerçant autorise SkanEcom chez
--     SkanFact ; le serveur échange le code contre une clé d'un an, gardée
--     ICI CHIFFRÉE par l'application (jamais en clair) ; un 401 de SkanFact
--     coupe la connexion (accès retiré, clé expirée) ;
--   · B1 la commande devient une facture (à la confirmation, ou à la
--     livraison : un réglage) ; B3 le paiement à la livraison ; B4 le retour
--     (une commande refusée ou annulée après sa facture, un article
--     remboursé au SAV) ;
--   · la FILE des envois : chaque envoi naît ici (déclencheurs), part par
--     l'application, et se renvoie à l'identique après une panne (le corps
--     est figé au premier essai) ; un refus de SkanFact (403…) attend que
--     le commerçant corrige et réessaie.
-- SkanFact ne fait jamais de doublon : la même référence, le même id de
-- paiement ou de retour rendent le même résultat.
-- =====================================================================

insert into plateforme.modules (code, libelle_fr, description_fr, position, disponible) values
  ('skanfact', 'Facturation SkanFact',
   'Chaque commande devient une facture dans le SkanFact du commerçant, avec ses encaissements et ses retours : sa facturation et sa comptabilité, sans double saisie.',
   9, true);

-- ---------------------------------------------------------------------
-- La connexion d'une boutique à l'entreprise du commerçant dans SkanFact
-- ---------------------------------------------------------------------
create table plateforme.skanfact_connexions (
  boutique_id    uuid primary key references plateforme.boutiques (id) on delete cascade,
  entreprise     uuid not null,
  nom            text not null check (char_length(nom) between 1 and 300),
  gestes         text[] not null default '{}',
  cle_chiffree   text check (char_length(cle_chiffree) between 20 and 2000),
  expire_le      timestamptz not null,
  etat           text not null default 'connectee' check (etat in ('connectee', 'coupee')),
  coupee_le      timestamptz,
  -- Les réglages du commerçant : ses taux de TVA (SkanEcom n'en avait pas ;
  -- rien ne part avant qu'il les ait choisis), le moment de la facture. Le
  -- timbre fiscal n'y est pas : une commande SkanEcom ne le fait pas payer,
  -- la facture n'en porte donc pas (« timbre »: false).
  tva_produits   text check (tva_produits in ('19', '13', '7', '0')),
  tva_livraison  text check (tva_livraison in ('19', '13', '7', '0')),
  moment         text not null default 'confirmation' check (moment in ('confirmation', 'livraison')),
  depuis         timestamptz not null default now(),
  connecte_le    timestamptz not null default now(),
  connecte_par   uuid references auth.users (id) on delete set null,
  check ((etat = 'connectee') = (cle_chiffree is not null))
);

comment on table plateforme.skanfact_connexions is
  'Le SkanFact d''un commerçant (B0) : son entreprise, la clé d''un an chiffrée par l''application (jamais en clair ici), ses réglages ; « coupee » : SkanFact a refusé la clé (401).';

alter table plateforme.skanfact_connexions enable row level security;
revoke all on plateforme.skanfact_connexions from public, anon, authenticated;

-- Les demandes de connexion en cours : l'état envoyé à SkanFact, à retrouver au retour (dix minutes).
create table plateforme.skanfact_etats (
  etat        text primary key check (char_length(etat) between 32 and 100),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  cree_le     timestamptz not null default now()
);
alter table plateforme.skanfact_etats enable row level security;
revoke all on plateforme.skanfact_etats from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- La file des envois
-- ---------------------------------------------------------------------
create table public.skanfact_envois (
  id             uuid primary key default gen_random_uuid(),
  boutique_id    uuid not null references plateforme.boutiques (id) on delete cascade,
  commande_id    uuid not null,
  entreprise     uuid not null,
  genre          text not null check (genre in ('facture', 'paiement', 'retour')),
  -- La clé de l'envoi chez SkanFact : la commande (facture), l'id du paiement ou du retour.
  cle            text not null check (char_length(cle) between 1 and 60),
  -- D'où vient un retour : la commande (refusée, annulée) ou une demande de SAV remboursée.
  sav_id         uuid,
  motif          text check (char_length(motif) <= 300),
  -- Le corps envoyé, figé au premier essai : un renvoi part à l'identique.
  corps          jsonb,
  etat           text not null default 'a_envoyer' check (etat in ('a_envoyer', 'fait', 'refuse', 'annule')),
  essais         integer not null default 0 check (essais >= 0),
  prochain_essai timestamptz not null default now(),
  erreur         text check (char_length(erreur) <= 600),
  reponse        jsonb,
  cree_le        timestamptz not null default now(),
  fait_le        timestamptz,
  unique (boutique_id, id),
  unique (boutique_id, commande_id, genre, cle),
  foreign key (boutique_id, commande_id) references public.commandes (boutique_id, id) on delete cascade
);
create index skanfact_envois_file_idx on public.skanfact_envois (boutique_id, etat, prochain_essai);

comment on table public.skanfact_envois is
  'Ce que la boutique envoie au SkanFact du commerçant (B1 facture, B3 paiement, B4 retour) : à envoyer, fait (la réponse de SkanFact), refusé (sa phrase, à corriger), annulé.';

create trigger skanfact_envois_boutique_immuable before update of boutique_id on public.skanfact_envois
  for each row execute function private.boutique_immuable();

alter table public.skanfact_envois enable row level security;
create policy "skanfact_envois: l'équipe lit ceux de sa boutique"
  on public.skanfact_envois for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.skanfact_envois from anon, authenticated;

create function private.skanfact_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'skanfact' and ma.actif);
$$;

-- Mettre un envoi dans la file (une fois : la même clé ne revient pas).
create function private.skanfact_mettre(p_boutique_id uuid, p_commande_id uuid, p_genre text, p_cle text,
                                        p_sav_id uuid default null, p_motif text default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.skanfact_envois (boutique_id, commande_id, entreprise, genre, cle, sav_id, motif)
  select p_boutique_id, p_commande_id, c.entreprise, p_genre, p_cle, p_sav_id, left(p_motif, 300)
    from plateforme.skanfact_connexions c
   where c.boutique_id = p_boutique_id
  on conflict (boutique_id, commande_id, genre, cle) do nothing;
$$;

-- Ce qu'une commande devient chez SkanFact, à chaque étape (déclencheur).
-- Le motif d'un retour est fixe : le commentaire de l'équipe ne part pas
-- chez SkanFact (il irait sur l'avoir du client).
create function private.skanfact_suivre_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       plateforme.skanfact_connexions;
  v_facture public.skanfact_envois;
begin
  if tg_op = 'UPDATE' and new.statut = old.statut then
    return new;
  end if;
  select * into v_c from plateforme.skanfact_connexions c where c.boutique_id = new.boutique_id;
  if not found or not private.skanfact_actif(new.boutique_id) then
    return new;
  end if;
  select * into v_facture from public.skanfact_envois e
   where e.boutique_id = new.boutique_id and e.commande_id = new.id and e.genre = 'facture' and e.etat <> 'annule';
  -- Facturée dans une autre entreprise (la boutique a changé de SkanFact) : son histoire reste là-bas.
  if v_facture.id is not null and v_facture.entreprise <> v_c.entreprise then
    return new;
  end if;

  if new.statut = 'confirmee' and v_c.moment = 'confirmation' then
    perform private.skanfact_mettre(new.boutique_id, new.id, 'facture', new.numero);
  elsif new.statut = 'livree' then
    if v_facture.id is null then
      -- Facturée à la livraison (ou pas encore facturée) : la facture porte l'encaissement.
      perform private.skanfact_mettre(new.boutique_id, new.id, 'facture', new.numero);
    elsif new.statut_paiement = 'paye' and new.mode_paiement = 'cod' then
      perform private.skanfact_mettre(new.boutique_id, new.id, 'paiement', 'livraison');
    end if;
  elsif new.statut in ('refusee', 'annulee') and v_facture.id is not null then
    if v_facture.etat = 'refuse' or (v_facture.etat = 'a_envoyer' and v_facture.essais = 0) then
      -- Jamais facturée chez SkanFact (un refus n'émet rien) : rien à défaire.
      update public.skanfact_envois e set etat = 'annule', erreur = null where e.id = v_facture.id;
    else
      perform private.skanfact_mettre(new.boutique_id, new.id, 'retour', case when new.statut = 'refusee' then 'refus' else 'annulation' end,
        null, case when new.statut = 'refusee' then 'Commande refusée à la livraison' else 'Commande annulée' end);
    end if;
  end if;
  return new;
end;
$$;

create trigger commandes_skanfact after insert or update of statut on public.commandes
  for each row execute function private.skanfact_suivre_commande();

-- Un article remboursé au SAV : le retour de cet article, et l'argent rendu.
create function private.skanfact_suivre_sav()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.statut = 'resolue' and new.issue = 'remboursement'
     and (tg_op = 'INSERT' or old.statut is distinct from new.statut or old.issue is distinct from new.issue)
     and private.skanfact_actif(new.boutique_id)
     and exists (select 1 from public.skanfact_envois e
                   join plateforme.skanfact_connexions c on c.boutique_id = e.boutique_id and c.entreprise = e.entreprise
                  where e.boutique_id = new.boutique_id and e.commande_id = new.commande_id
                    and e.genre = 'facture' and e.etat <> 'annule') then
    perform private.skanfact_mettre(new.boutique_id, new.commande_id, 'retour', 'sav-' || new.numero, new.id,
                                    'Article remboursé au service après-vente (' || new.numero || ')');
  end if;
  return new;
end;
$$;

create trigger sav_skanfact after insert or update of statut, issue on public.sav_demandes
  for each row execute function private.skanfact_suivre_sav();

-- ---------------------------------------------------------------------
-- Pour l'équipe (sa session)
-- ---------------------------------------------------------------------

-- L'état, pour la navigation : à voir (refusés, en attente), coupée, bientôt expirée, à régler.
create function public.gestion_skanfact_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return (
    select jsonb_build_object(
      'actif', private.skanfact_actif(p_boutique_id),
      'connecte', c.boutique_id is not null,
      'coupee', coalesce(c.etat = 'coupee', false),
      'expire_bientot', coalesce(c.etat = 'connectee' and c.expire_le < now() + interval '30 days', false),
      'a_regler', c.boutique_id is not null and (c.tva_produits is null or c.tva_livraison is null),
      'a_envoyer', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer'),
      'dus', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer'
                and e.prochain_essai <= now() and e.entreprise = c.entreprise and c.etat = 'connectee'),
      'refuses', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.etat = 'refuse'))
    from (select 1) x left join plateforme.skanfact_connexions c on c.boutique_id = p_boutique_id);
end;
$$;

-- La page « Facturation SkanFact » (la direction ; la lecture regarde).
create function public.gestion_skanfact(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  return jsonb_build_object(
    'actif', private.skanfact_actif(p_boutique_id),
    'connexion', (select jsonb_build_object('entreprise', c.entreprise, 'nom', c.nom, 'gestes', c.gestes, 'expire_le', c.expire_le,
                                            'etat', c.etat, 'coupee_le', c.coupee_le, 'tva_produits', c.tva_produits, 'tva_livraison', c.tva_livraison,
                                            'moment', c.moment, 'depuis', c.depuis, 'connecte_le', c.connecte_le, 'connecte_par', u.email)
                    from plateforme.skanfact_connexions c left join auth.users u on u.id = c.connecte_par
                   where c.boutique_id = p_boutique_id),
    'file', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'commande', k.numero, 'genre', e.genre, 'cle', e.cle, 'etat', e.etat,
                                                          'essais', e.essais, 'prochain_essai', e.prochain_essai, 'erreur', e.erreur,
                                                          'motif', e.motif, 'cree_le', e.cree_le)
                                       order by e.etat desc, e.cree_le)
                        from public.skanfact_envois e join public.commandes k on k.boutique_id = e.boutique_id and k.id = e.commande_id
                       where e.boutique_id = p_boutique_id and e.etat in ('a_envoyer', 'refuse')), '[]'::jsonb),
    'faits', coalesce((select jsonb_agg(x order by x ->> 'fait_le' desc) from (
                         select jsonb_build_object('commande', k.numero, 'client', k.contact_nom, 'genre', e.genre, 'motif', e.motif,
                                                   'reponse', e.reponse, 'fait_le', e.fait_le) x
                           from public.skanfact_envois e join public.commandes k on k.boutique_id = e.boutique_id and k.id = e.commande_id
                          where e.boutique_id = p_boutique_id and e.etat = 'fait' and e.genre in ('facture', 'retour')
                          order by e.fait_le desc limit 20) t), '[]'::jsonb),
    'compteurs', jsonb_build_object(
      'factures', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.genre = 'facture' and e.etat = 'fait'),
      'avoirs', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.genre = 'retour' and e.etat = 'fait'),
      -- Les commandes qui auraient une facture si la boutique avait été connectée plus tôt.
      'avant', (select count(*) from public.commandes k join plateforme.skanfact_connexions c on c.boutique_id = k.boutique_id
                 where k.boutique_id = p_boutique_id
                   and k.statut = any (case c.moment when 'confirmation' then array['confirmee', 'expediee', 'livree']::public.statut_commande[]
                                                     else array['livree']::public.statut_commande[] end)
                   and not exists (select 1 from public.skanfact_envois e where e.boutique_id = k.boutique_id and e.commande_id = k.id
                                    and e.genre = 'facture' and e.etat <> 'annule'))));
end;
$$;

-- Ce que SkanFact sait d'une commande, pour sa fiche (toute l'équipe).
create function public.gestion_skanfact_commande(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.skanfact_actif(p_boutique_id),
    'connecte', exists (select 1 from plateforme.skanfact_connexions c where c.boutique_id = p_boutique_id and c.etat = 'connectee'),
    'moment', (select c.moment from plateforme.skanfact_connexions c where c.boutique_id = p_boutique_id),
    'envois', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'genre', e.genre, 'cle', e.cle, 'etat', e.etat, 'essais', e.essais,
                                                            'prochain_essai', e.prochain_essai, 'erreur', e.erreur, 'reponse', e.reponse,
                                                            'motif', e.motif, 'fait_le', e.fait_le) order by e.cree_le)
                          from public.skanfact_envois e join public.commandes k on k.boutique_id = e.boutique_id and k.id = e.commande_id
                         where e.boutique_id = p_boutique_id and k.numero = p_numero and e.etat <> 'annule'), '[]'::jsonb));
end;
$$;

-- Commencer « Connecter SkanFact » : l'état tiré par l'application, gardé dix minutes.
create function public.gestion_skanfact_demarrer(p_boutique_id uuid, p_etat text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not private.skanfact_actif(p_boutique_id) then
    raise exception 'Le module Facturation SkanFact n''est pas allumé pour cette boutique' using errcode = 'check_violation', hint = 'module';
  end if;
  delete from plateforme.skanfact_etats s where s.cree_le < now() - interval '1 hour' or (s.boutique_id = p_boutique_id and s.user_id = auth.uid());
  insert into plateforme.skanfact_etats (etat, boutique_id, user_id) values (p_etat, p_boutique_id, auth.uid());
end;
$$;

-- Les réglages : les taux de TVA, le moment de la facture.
create function public.gestion_skanfact_regler(p_boutique_id uuid, p_tva_produits text, p_tva_livraison text, p_moment text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if coalesce(p_tva_produits, '') not in ('19', '13', '7', '0') or coalesce(p_tva_livraison, '') not in ('19', '13', '7', '0') then
    raise exception 'Choisissez le taux de TVA de vos produits et celui de la livraison' using errcode = 'check_violation', hint = 'champ';
  end if;
  if coalesce(p_moment, '') not in ('confirmation', 'livraison') then
    raise exception 'Choisissez quand la facture part' using errcode = 'check_violation', hint = 'champ';
  end if;
  update plateforme.skanfact_connexions c
     set tva_produits = p_tva_produits, tva_livraison = p_tva_livraison, moment = p_moment
   where c.boutique_id = p_boutique_id;
  if not found then
    raise exception 'La boutique n''est pas connectée à SkanFact' using errcode = 'check_violation', hint = 'connexion';
  end if;
end;
$$;

-- Déconnecter : la clé oubliée chez SkanEcom (ce qui est fait reste, dans SkanFact et ici).
create function public.gestion_skanfact_deconnecter(p_boutique_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  delete from plateforme.skanfact_connexions c where c.boutique_id = p_boutique_id;
end;
$$;

-- Facturer une commande qui ne l'est pas encore (confirmée ou livrée avant la connexion).
create function public.gestion_skanfact_facturer(p_boutique_id uuid, p_numero text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_k public.commandes;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  select * into v_k from public.commandes k where k.boutique_id = p_boutique_id and k.numero = p_numero;
  if not found or v_k.statut not in ('confirmee', 'expediee', 'livree') then
    raise exception 'Seule une commande confirmée, expédiée ou livrée se facture' using errcode = 'check_violation', hint = 'change';
  end if;
  if not exists (select 1 from plateforme.skanfact_connexions c where c.boutique_id = p_boutique_id and c.etat = 'connectee')
     or not private.skanfact_actif(p_boutique_id) then
    raise exception 'La boutique n''est pas connectée à SkanFact' using errcode = 'check_violation', hint = 'connexion';
  end if;
  update public.skanfact_envois e
     set etat = 'a_envoyer', essais = 0, prochain_essai = now(), corps = null, erreur = null,
         entreprise = (select c.entreprise from plateforme.skanfact_connexions c where c.boutique_id = p_boutique_id)
   where e.boutique_id = p_boutique_id and e.commande_id = v_k.id and e.genre = 'facture' and e.etat = 'annule';
  perform private.skanfact_mettre(p_boutique_id, v_k.id, 'facture', v_k.numero);
end;
$$;

-- Réessayer un envoi refusé, après correction : le corps se refait (les réglages ont pu changer).
create function public.gestion_skanfact_reessayer(p_boutique_id uuid, p_envoi uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  update public.skanfact_envois e set etat = 'a_envoyer', prochain_essai = now(), corps = null, erreur = null
   where e.boutique_id = p_boutique_id and e.id = p_envoi and e.etat = 'refuse';
  if not found then
    raise exception 'Cet envoi n''attend pas d''être réessayé' using errcode = 'check_violation', hint = 'change';
  end if;
end;
$$;

-- « Renvoyer maintenant » : ce qui attend une panne, avancé à tout de suite.
create function public.gestion_skanfact_avancer(p_boutique_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  update public.skanfact_envois e set prochain_essai = now()
   where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer' and e.prochain_essai > now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Pour le serveur de l'application (la clé de service seule)
-- ---------------------------------------------------------------------

-- Le retour de SkanFact : l'état reconnu (le même membre, moins de dix minutes), consommé une fois.
create function public.skanfact_retrouver_etat(p_etat text, p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s plateforme.skanfact_etats;
begin
  delete from plateforme.skanfact_etats s where s.etat = p_etat returning * into v_s;
  if v_s.etat is null or v_s.user_id <> p_user or v_s.cree_le < now() - interval '10 minutes' then
    return null;
  end if;
  return (select jsonb_build_object('boutique_id', b.id, 'slug', b.slug) from plateforme.boutiques b where b.id = v_s.boutique_id);
end;
$$;

-- La clé reçue de SkanFact (chiffrée par l'application) : la boutique connectée.
create function public.skanfact_connecter(p_boutique_id uuid, p_user uuid, p_entreprise uuid, p_nom text, p_gestes text[],
                                          p_cle_chiffree text, p_expire_le timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_entreprise is null or p_cle_chiffree is null or p_expire_le is null or coalesce(btrim(p_nom), '') = '' then
    raise exception 'La réponse de SkanFact est incomplète' using errcode = 'check_violation';
  end if;
  -- Une autre entreprise : ce qui attendait l'ancienne n'y partira jamais.
  update public.skanfact_envois e set etat = 'annule', erreur = 'La boutique a été reliée à une autre entreprise SkanFact'
   where e.boutique_id = p_boutique_id and e.etat in ('a_envoyer', 'refuse') and e.entreprise <> p_entreprise;
  insert into plateforme.skanfact_connexions (boutique_id, entreprise, nom, gestes, cle_chiffree, expire_le, connecte_par)
  values (p_boutique_id, p_entreprise, left(btrim(p_nom), 300), coalesce(p_gestes, '{}'), p_cle_chiffree, p_expire_le, p_user)
  on conflict (boutique_id) do update
    set nom = excluded.nom, gestes = excluded.gestes, cle_chiffree = excluded.cle_chiffree, expire_le = excluded.expire_le,
        etat = 'connectee', coupee_le = null, connecte_le = now(), connecte_par = excluded.connecte_par,
        -- Une autre entreprise : les taux et la date repartent ; la même : rien ne se perd.
        tva_produits = case when plateforme.skanfact_connexions.entreprise = excluded.entreprise then plateforme.skanfact_connexions.tva_produits end,
        tva_livraison = case when plateforme.skanfact_connexions.entreprise = excluded.entreprise then plateforme.skanfact_connexions.tva_livraison end,
        depuis = case when plateforme.skanfact_connexions.entreprise = excluded.entreprise then plateforme.skanfact_connexions.depuis else now() end,
        entreprise = excluded.entreprise;
  -- Reconnectée : ce qui attendait part tout de suite.
  update public.skanfact_envois e set prochain_essai = now()
   where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer' and e.prochain_essai > now();
end;
$$;

-- SkanFact a refusé la clé (401) : la boutique coupée, la clé oubliée, la file attend.
create function public.skanfact_couper(p_boutique_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update plateforme.skanfact_connexions c set etat = 'coupee', cle_chiffree = null, coupee_le = now()
   where c.boutique_id = p_boutique_id and c.etat = 'connectee';
$$;

-- La file due d'une boutique (ou d'une de ses commandes), avec ce qu'il faut pour faire chaque corps.
-- Rien tant que la boutique n'est pas connectée, ou ses taux de TVA pas choisis.
create function public.skanfact_file(p_boutique_id uuid, p_numero text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'connexion', jsonb_build_object('entreprise', c.entreprise, 'cle_chiffree', c.cle_chiffree, 'tva_produits', c.tva_produits,
                                    'tva_livraison', c.tva_livraison),
    'jour', (now() at time zone 'Africa/Tunis')::date,
    'envois', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'genre', e.genre, 'cle', e.cle, 'corps', e.corps, 'essais', e.essais, 'motif', e.motif,
        'facture', (select jsonb_build_object('etat', f.etat, 'corps', f.corps) from public.skanfact_envois f
                     where f.boutique_id = e.boutique_id and f.commande_id = e.commande_id and f.genre = 'facture' and f.etat <> 'annule'),
        -- Un paiement à part (B3) : la facture ne le porte pas.
        'paiement_a_part', exists (select 1 from public.skanfact_envois p where p.boutique_id = e.boutique_id and p.commande_id = e.commande_id
                                    and p.genre = 'paiement' and p.etat <> 'annule'),
        'commande', jsonb_build_object(
          'id', k.id, 'numero', k.numero, 'statut', k.statut, 'mode_paiement', k.mode_paiement, 'statut_paiement', k.statut_paiement,
          'client_id', k.client_id, 'nom', k.contact_nom, 'telephone', k.contact_telephone, 'email', k.contact_email,
          'adresse', concat_ws(', ', k.livraison_ligne1, k.livraison_ligne2, k.livraison_code_postal, k.livraison_ville, k.livraison_gouvernorat),
          'matricule', (select cp.matricule_fiscal from public.comptes_pro cp
                         where cp.boutique_id = k.boutique_id and cp.client_id = k.client_id and cp.statut = 'valide'),
          'raison_sociale', (select cp.raison_sociale from public.comptes_pro cp
                              where cp.boutique_id = k.boutique_id and cp.client_id = k.client_id and cp.statut = 'valide'),
          'frais', k.frais_livraison_millimes, 'remise', k.remise_millimes, 'total', k.total_millimes),
        'lignes', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'designation', concat_ws(' — ', l.produit_nom, nullif(btrim(l.variante_libelle), '')),
                                                                'code', nullif(btrim(l.sku), ''), 'quantite', l.quantite,
                                                                'prix', l.prix_unitaire_millimes, 'total', l.total_ligne_millimes)
                                              order by l.created_at, l.produit_nom, l.variante_libelle, l.id)
                              from public.commande_lignes l where l.boutique_id = k.boutique_id and l.commande_id = k.id), '[]'::jsonb),
        'sav_ligne', (select s.ligne_id from public.sav_demandes s where s.id = e.sav_id))
      order by e.cree_le, case e.genre when 'facture' then 0 when 'paiement' then 1 else 2 end, e.id)
      from public.skanfact_envois e join public.commandes k on k.boutique_id = e.boutique_id and k.id = e.commande_id
     where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer' and e.entreprise = c.entreprise
       and e.prochain_essai <= now() and (p_numero is null or k.numero = p_numero)), '[]'::jsonb))
  from plateforme.skanfact_connexions c
  where c.boutique_id = p_boutique_id and c.etat = 'connectee' and c.tva_produits is not null and c.tva_livraison is not null
    and private.skanfact_actif(p_boutique_id);
$$;

-- Prendre un envoi pour l'envoyer : son corps figé (le premier reste), un essai compté, deux minutes à
-- lui seul (un autre tour de la file ne l'envoie pas en même temps). Rend { corps } à envoyer, ou rien.
create function public.skanfact_prendre(p_envoi uuid, p_corps jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  update public.skanfact_envois e
     set corps = coalesce(e.corps, p_corps), essais = e.essais + 1, prochain_essai = now() + interval '2 minutes'
   where e.id = p_envoi and e.etat = 'a_envoyer' and e.prochain_essai <= now()
  returning jsonb_build_object('corps', e.corps);
$$;

-- Ce que SkanFact a répondu à un envoi pris : fait, refusé (sa phrase), ou à renvoyer plus tard (le même corps).
create function public.skanfact_noter(p_envoi uuid, p_resultat text, p_reponse jsonb, p_erreur text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_resultat is null or p_resultat not in ('fait', 'refuse', 'plus_tard') then
    raise exception 'Résultat inconnu : %', p_resultat using errcode = 'check_violation';
  end if;
  update public.skanfact_envois e
     set etat = case p_resultat when 'fait' then 'fait' when 'refuse' then 'refuse' else 'a_envoyer' end,
         reponse = case when p_resultat = 'fait' then p_reponse else e.reponse end,
         erreur = case when p_resultat = 'fait' then null else left(p_erreur, 600) end,
         fait_le = case when p_resultat = 'fait' then now() else e.fait_le end,
         -- Après une panne : 1 min, 5 min, 30 min, 2 h, puis toutes les 6 h.
         prochain_essai = case p_resultat
                            when 'plus_tard' then now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'])[least(greatest(e.essais, 1), 4)]
                                                        + case when e.essais > 4 then interval '4 hours' else interval '0' end
                            else e.prochain_essai end
   where e.id = p_envoi and e.etat = 'a_envoyer';
end;
$$;

revoke execute on function private.skanfact_actif(uuid) from public, anon, authenticated;
revoke execute on function private.skanfact_mettre(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function private.skanfact_suivre_commande() from public, anon, authenticated;
revoke execute on function private.skanfact_suivre_sav() from public, anon, authenticated;
revoke execute on function public.gestion_skanfact_etat(uuid) from public, anon;
revoke execute on function public.gestion_skanfact(uuid) from public, anon;
revoke execute on function public.gestion_skanfact_commande(uuid, text) from public, anon;
revoke execute on function public.gestion_skanfact_demarrer(uuid, text) from public, anon;
revoke execute on function public.gestion_skanfact_regler(uuid, text, text, text) from public, anon;
revoke execute on function public.gestion_skanfact_deconnecter(uuid) from public, anon;
revoke execute on function public.gestion_skanfact_facturer(uuid, text) from public, anon;
revoke execute on function public.gestion_skanfact_reessayer(uuid, uuid) from public, anon;
revoke execute on function public.gestion_skanfact_avancer(uuid) from public, anon;
revoke execute on function public.skanfact_retrouver_etat(text, uuid) from public, anon, authenticated;
revoke execute on function public.skanfact_connecter(uuid, uuid, uuid, text, text[], text, timestamptz) from public, anon, authenticated;
revoke execute on function public.skanfact_couper(uuid) from public, anon, authenticated;
revoke execute on function public.skanfact_file(uuid, text) from public, anon, authenticated;
revoke execute on function public.skanfact_prendre(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.skanfact_noter(uuid, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.gestion_skanfact_etat(uuid) to authenticated, service_role;
grant  execute on function public.gestion_skanfact(uuid) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_commande(uuid, text) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_demarrer(uuid, text) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_regler(uuid, text, text, text) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_deconnecter(uuid) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_facturer(uuid, text) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_reessayer(uuid, uuid) to authenticated, service_role;
grant  execute on function public.gestion_skanfact_avancer(uuid) to authenticated, service_role;
grant  execute on function public.skanfact_retrouver_etat(text, uuid) to service_role;
grant  execute on function public.skanfact_connecter(uuid, uuid, uuid, text, text[], text, timestamptz) to service_role;
grant  execute on function public.skanfact_couper(uuid) to service_role;
grant  execute on function public.skanfact_file(uuid, text) to service_role;
grant  execute on function public.skanfact_prendre(uuid, jsonb) to service_role;
grant  execute on function public.skanfact_noter(uuid, text, jsonb, text) to service_role;
