-- =====================================================================
-- SkanEcom — 09 · BACKOFFICE : LE CYCLE DE COMMANDE
-- Appels de confirmation · confirmer · annuler · expédier · livrée ·
-- refusée à la livraison · note interne · liste et fiche pour l'équipe
-- 29/09/2026 — PRD §6.2 B3 et B4 (repris de Maymar), boutique par boutique
-- =====================================================================
-- Le cycle, tel que Maymar l'a posé :
--
--   reçue ──appel──▶ confirmée ──▶ expédiée ──▶ livrée
--     │                 │              └──────▶ refusée (origine obligatoire)
--     └────────┬────────┘
--              ▼
--           annulée (motif obligatoire)
--
-- Chaque geste passe par une fonction de la base, qui vérifie le rôle du
-- membre dans CETTE boutique, l'étape où en est la commande (celle que
-- l'écran affichait : deux employés ne confirment pas deux fois la même),
-- et ce que le geste exige (motif, origine du refus). L'UPDATE direct des
-- commandes par l'API est retiré (docs/cadrage/03-reprise-maymar.md §4.1 :
-- « écritures sensibles uniquement par fonctions SQL »).
--
-- Qui fait quoi :
--   appeler, confirmer, annuler          propriétaire, admin, confirmateur
--   expédier                             propriétaire, admin, préparateur
--   livrée, refusée à la livraison       propriétaire, admin, confirmateur, préparateur
--   note interne                         tous sauf lecture
--   lire la liste et les fiches          tous
-- Chaque refus porte un indice (HINT) : role, commande, change, motif,
-- origine, canal. Jamais le code 40001 (serialization_failure) pour dire
-- « la commande a changé » : PostgREST rejoue d'office une transaction en
-- conflit de sérialisation, et un refus certain serait rejoué sans fin.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Les appels de confirmation (et messages WhatsApp)
-- ---------------------------------------------------------------------
create type public.canal_confirmation as enum ('appel', 'whatsapp', 'sms');
create type public.resultat_confirmation as enum ('confirmee', 'injoignable', 'rappeler', 'refus');

create table public.confirmations (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  commande_id uuid not null,
  canal       public.canal_confirmation not null,
  resultat    public.resultat_confirmation not null,
  note        text check (char_length(note) <= 500),
  auteur_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default clock_timestamp(),
  unique (boutique_id, id),
  foreign key (boutique_id, commande_id)
    references public.commandes (boutique_id, id) on delete cascade
);

comment on table public.confirmations is
  'Chaque tentative de confirmation (appel, WhatsApp, SMS) et son résultat. Écrites par public.gestion_appel seulement.';

create index confirmations_commande_idx on public.confirmations (boutique_id, commande_id, created_at);

create trigger confirmations_boutique_immuable
  before update of boutique_id on public.confirmations
  for each row execute function private.boutique_immuable();

alter table public.confirmations enable row level security;

create policy "confirmations: l'équipe lit celles de sa boutique"
  on public.confirmations for select using (boutique_id in (select private.mes_boutiques()));
-- Aucune écriture par l'API : public.gestion_appel.

-- L'UPDATE direct des commandes disparaît : tout passe par les fonctions.
drop policy "commandes: l'équipe des commandes les fait avancer" on public.commandes;


-- ---------------------------------------------------------------------
-- La commande à faire avancer : membre, rôle, verrou, étape attendue
-- ---------------------------------------------------------------------
create function private.commande_a_gerer(
  p_boutique_id    uuid,
  p_numero         text,
  p_roles          text[],
  p_statut_attendu text
)
returns public.commandes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id, p_roles) then
    raise exception 'Action réservée à l''équipe de la boutique (%)', array_to_string(p_roles, ', ')
      using errcode = 'insufficient_privilege', hint = 'role';
  end if;

  select * into v_commande from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = p_numero
   for update;
  if not found then
    raise exception 'Commande introuvable : %', p_numero using errcode = 'no_data_found', hint = 'commande';
  end if;

  -- Ce que l'écran affichait : si la commande a bougé entre-temps (un
  -- collègue l'a confirmée), on ne rejoue pas le geste à l'aveugle.
  if p_statut_attendu is not null and v_commande.statut::text <> p_statut_attendu then
    raise exception 'La commande % est passée à « % » entre-temps', p_numero, v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;
  return v_commande;
end;
$$;


-- ---------------------------------------------------------------------
-- Appeler (ou écrire) : noter la tentative ; « confirmée » confirme,
-- « refus » annule
-- ---------------------------------------------------------------------
create function public.gestion_appel(
  p_boutique_id uuid,
  p_numero      text,
  p_canal       text,
  p_resultat    text,
  p_note        text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
  v_note     text := nullif(btrim(p_note), '');
begin
  if p_canal is null or p_canal not in ('appel', 'whatsapp', 'sms')
     or p_resultat is null or p_resultat not in ('confirmee', 'injoignable', 'rappeler', 'refus') then
    raise exception 'Canal ou résultat inconnu' using errcode = 'check_violation', hint = 'canal';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'La note compte 500 caractères au plus' using errcode = 'check_violation', hint = 'motif';
  end if;

  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur}', null);
  if v_commande.statut not in ('a_arbitrer', 'recue') then
    raise exception 'La commande % n''attend plus de confirmation (« % »)', p_numero, v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;

  insert into public.confirmations (boutique_id, commande_id, canal, resultat, note, auteur_id)
  values (p_boutique_id, v_commande.id, p_canal::public.canal_confirmation,
          p_resultat::public.resultat_confirmation, v_note, auth.uid());

  if p_resultat = 'confirmee' then
    update public.commandes set statut = 'confirmee'
     where boutique_id = p_boutique_id and id = v_commande.id;
    return 'confirmee';
  elsif p_resultat = 'refus' then
    update public.commandes
       set statut = 'annulee', motif_annulation = coalesce(v_note, 'Refusée à l''appel de confirmation')
     where boutique_id = p_boutique_id and id = v_commande.id;
    return 'annulee';
  end if;
  return v_commande.statut::text;
end;
$$;


-- ---------------------------------------------------------------------
-- Annuler (avant l'expédition), avec un motif
-- ---------------------------------------------------------------------
create function public.gestion_annuler(
  p_boutique_id    uuid,
  p_numero         text,
  p_statut_attendu text,
  p_motif          text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
  v_motif    text := nullif(btrim(p_motif), '');
begin
  if v_motif is null or char_length(v_motif) not between 3 and 500 then
    raise exception 'Indiquez le motif de l''annulation' using errcode = 'check_violation', hint = 'motif';
  end if;
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur}', p_statut_attendu);
  if v_commande.statut not in ('a_arbitrer', 'recue', 'confirmee') then
    raise exception 'Une commande « % » ne s''annule plus : elle est partie', v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;
  update public.commandes set statut = 'annulee', motif_annulation = v_motif
   where boutique_id = p_boutique_id and id = v_commande.id;
end;
$$;


-- ---------------------------------------------------------------------
-- Expédier : transporteur (le réglage de la boutique par défaut) et
-- numéro de suivi, facultatif
-- ---------------------------------------------------------------------
create function public.gestion_expedier(
  p_boutique_id    uuid,
  p_numero         text,
  p_statut_attendu text,
  p_transporteur   text default null,
  p_numero_suivi   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
begin
  if char_length(coalesce(p_transporteur, '')) > 80 or char_length(coalesce(p_numero_suivi, '')) > 80 then
    raise exception 'Transporteur ou numéro de suivi trop long' using errcode = 'check_violation', hint = 'motif';
  end if;
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,preparateur}', p_statut_attendu);
  if v_commande.statut <> 'confirmee' then
    raise exception 'Seule une commande confirmée part en livraison (celle-ci est « % »)', v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;
  update public.commandes
     set statut = 'expediee',
         transporteur = coalesce(nullif(btrim(p_transporteur), ''), v_commande.transporteur),
         numero_suivi = coalesce(nullif(btrim(p_numero_suivi), ''), v_commande.numero_suivi)
   where boutique_id = p_boutique_id and id = v_commande.id;
end;
$$;


-- ---------------------------------------------------------------------
-- Livrée (le livreur a remis le colis et encaissé), ou refusée à la
-- livraison (origine obligatoire : le stock revient, la fiche compte)
-- ---------------------------------------------------------------------
create function public.gestion_livrer(p_boutique_id uuid, p_numero text, p_statut_attendu text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
begin
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur,preparateur}', p_statut_attendu);
  if v_commande.statut <> 'expediee' then
    raise exception 'Seule une commande expédiée est livrée (celle-ci est « % »)', v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;
  update public.commandes
     set statut = 'livree',
         statut_paiement = case when v_commande.mode_paiement = 'cod' then 'paye' else v_commande.statut_paiement end
   where boutique_id = p_boutique_id and id = v_commande.id;
end;
$$;

create function public.gestion_refuser(
  p_boutique_id    uuid,
  p_numero         text,
  p_statut_attendu text,
  p_origine        text,
  p_commentaire    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
begin
  if p_origine is null or p_origine not in ('client', 'livreur', 'injoignable', 'autre') then
    raise exception 'Dites d''où vient le refus : client, livreur, injoignable ou autre'
      using errcode = 'check_violation', hint = 'origine';
  end if;
  if char_length(coalesce(p_commentaire, '')) > 500 then
    raise exception 'Le commentaire compte 500 caractères au plus' using errcode = 'check_violation', hint = 'motif';
  end if;
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur,preparateur}', p_statut_attendu);
  if v_commande.statut <> 'expediee' then
    raise exception 'Seule une commande expédiée peut être refusée à la livraison (celle-ci est « % »)', v_commande.statut
      using errcode = 'check_violation', hint = 'change';
  end if;
  update public.commandes
     set statut = 'refusee', refus_origine = p_origine::public.origine_refus,
         refus_commentaire = nullif(btrim(p_commentaire), '')
   where boutique_id = p_boutique_id and id = v_commande.id;
end;
$$;


-- ---------------------------------------------------------------------
-- La note interne (jamais montrée à l'acheteur)
-- ---------------------------------------------------------------------
create function public.gestion_note(p_boutique_id uuid, p_numero text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
begin
  if char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'La note compte 2 000 caractères au plus' using errcode = 'check_violation', hint = 'motif';
  end if;
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur,preparateur}', null);
  update public.commandes set note_interne = nullif(btrim(p_note), '')
   where boutique_id = p_boutique_id and id = v_commande.id;
end;
$$;


-- ---------------------------------------------------------------------
-- La liste de l'équipe : une étape, une recherche, les compteurs
-- ---------------------------------------------------------------------
-- Étapes : a_confirmer (reçues, à vérifier), a_preparer (confirmées),
-- expediees, cloturees (livrées, refusées, annulées), toutes. Les trois
-- premières se servent dans l'ordre d'arrivée (la plus ancienne d'abord) ;
-- les clôturées et « toutes », la plus récente d'abord.
create function public.gestion_liste_commandes(
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
        'ville', p.livraison_ville, 'gouvernorat', coalesce(g.nom_fr, p.livraison_gouvernorat),
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


-- ---------------------------------------------------------------------
-- La fiche d'une commande pour l'équipe
-- ---------------------------------------------------------------------
create function public.gestion_commande(p_boutique_id uuid, p_numero text)
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


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function private.commande_a_gerer(uuid, text, text[], text) from public, anon, authenticated;

revoke execute on function public.gestion_appel(uuid, text, text, text, text)          from public, anon;
revoke execute on function public.gestion_annuler(uuid, text, text, text)              from public, anon;
revoke execute on function public.gestion_expedier(uuid, text, text, text, text)       from public, anon;
revoke execute on function public.gestion_livrer(uuid, text, text)                     from public, anon;
revoke execute on function public.gestion_refuser(uuid, text, text, text, text)        from public, anon;
revoke execute on function public.gestion_note(uuid, text, text)                       from public, anon;
revoke execute on function public.gestion_liste_commandes(uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.gestion_commande(uuid, text)                         from public, anon;
grant  execute on function public.gestion_appel(uuid, text, text, text, text)          to authenticated, service_role;
grant  execute on function public.gestion_annuler(uuid, text, text, text)              to authenticated, service_role;
grant  execute on function public.gestion_expedier(uuid, text, text, text, text)       to authenticated, service_role;
grant  execute on function public.gestion_livrer(uuid, text, text)                     to authenticated, service_role;
grant  execute on function public.gestion_refuser(uuid, text, text, text, text)        to authenticated, service_role;
grant  execute on function public.gestion_note(uuid, text, text)                       to authenticated, service_role;
grant  execute on function public.gestion_liste_commandes(uuid, text, text, integer, integer) to authenticated, service_role;
grant  execute on function public.gestion_commande(uuid, text)                         to authenticated, service_role;
