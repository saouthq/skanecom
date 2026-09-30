-- =====================================================================
-- SkanEcom — 32 · L'ARGENT DES LIVREURS (B12, 2e partie)
-- 30/09/2026 — PRD §6.2 B12 (« rapprochement des encaissements COD ») et
-- §8 (« l'argent gagné ou perdu par le client »)
-- =====================================================================
--
-- Au paiement à la livraison, le livreur encaisse l'argent du colis, puis
-- le reverse à la boutique, par lots, quelques jours plus tard, parfois
-- moins les frais. Le père de Skander demande : « combien Aramex me doit
-- encore ? » et « ce virement, il couvre quels colis ? ».
--
--   · à recevoir : les commandes livrées à domicile, payées au livreur,
--     que personne n'a encore rapprochées d'un versement — par transporteur,
--     la plus ancienne d'abord (le retrait en magasin se règle au comptoir) ;
--   · un versement : ce que le transporteur a reversé (montant reçu, date,
--     référence du virement ou du bordereau), et les colis qu'il couvre ;
--     l'attendu est la somme de ces colis, l'écart se lit tout de suite
--     (frais retenus, colis oublié) ;
--   · une erreur de saisie s'annule : le versement reste au journal (qui,
--     quand, quels colis), ses colis redeviennent « à recevoir ».
--
-- Un colis n'est rapproché qu'une fois (la clé primaire de
-- versement_commandes le garantit, même à deux sur le même écran).
-- Propriétaire et administrateur enregistrent ; la lecture regarde.
-- Rien ne s'écrit par l'API : tout passe par les fonctions.

create table public.versements (
  id               uuid primary key default gen_random_uuid(),
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  transporteur     text check (transporteur is null or char_length(transporteur) between 1 and 80),
  recu_le          date not null,
  attendu_millimes bigint not null check (attendu_millimes >= 0),
  recu_millimes    bigint not null check (recu_millimes >= 0),
  reference        text check (char_length(reference) <= 80),
  note             text check (char_length(note) <= 500),
  -- Les colis couverts, figés : le journal les garde même après annulation.
  numeros          text[] not null,
  auteur_id        uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default clock_timestamp(),
  annule_le        timestamptz,
  annule_par       uuid references auth.users (id) on delete set null,
  unique (boutique_id, id)
);
comment on table public.versements is
  'Ce qu''un transporteur a reversé à la boutique pour des colis payés à la livraison. Écrits par public.gestion_enregistrer_versement.';

create table public.versement_commandes (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  versement_id  uuid not null,
  commande_id   uuid not null,
  montant_millimes bigint not null check (montant_millimes >= 0),
  unique (boutique_id, id),
  -- Un colis n'est rapproché que d'un versement à la fois.
  unique (boutique_id, commande_id),
  foreign key (boutique_id, versement_id) references public.versements (boutique_id, id) on delete cascade,
  foreign key (boutique_id, commande_id) references public.commandes (boutique_id, id) on delete cascade
);
comment on table public.versement_commandes is
  'Les colis que couvre un versement en vigueur. Un versement annulé libère les siens (ils restent dans versements.numeros).';
create index versement_commandes_versement_idx on public.versement_commandes (boutique_id, versement_id);
create index versements_boutique_idx on public.versements (boutique_id, recu_le desc, created_at desc);

create trigger versements_boutique_immuable
  before update of boutique_id on public.versements
  for each row execute function private.boutique_immuable();
create trigger versement_commandes_boutique_immuable
  before update of boutique_id on public.versement_commandes
  for each row execute function private.boutique_immuable();

-- L'argent de la boutique : aucune lecture ni écriture directe par l'API
-- (RLS sans policy : rien de visible ; écritures retirées).
alter table public.versements enable row level security;
alter table public.versement_commandes enable row level security;
revoke insert, update, delete, truncate on public.versements, public.versement_commandes from anon, authenticated;

-- Le transporteur d'une commande, pour regrouper : sans casse ni espaces
-- autour (« aramex » et « Aramex » sont le même livreur) ; '' : aucun.
create function private.cle_transporteur(p_transporteur text)
returns text
language sql
immutable
set search_path = ''
as $$ select coalesce(lower(btrim(p_transporteur)), '') $$;

-- ---------------------------------------------------------------------
-- Ce qu'il y a à lire : à recevoir, par transporteur ; les versements
-- ---------------------------------------------------------------------
create function public.gestion_encaissements(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_depuis date := (now() at time zone 'Africa/Tunis')::date - 29;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');

  return jsonb_build_object(
    'a_recevoir', coalesce((
      select jsonb_agg(g order by g.plus_ancienne) from (
        -- Le nom du livreur tel qu'il a été saisi sur le plus ancien colis.
        select (array_agg(nullif(btrim(c.transporteur), '') order by c.livree_at, c.numero))[1] as transporteur,
               count(*)::int as nombre,
               sum(c.total_millimes)::bigint as total_millimes,
               min(c.livree_at) as plus_ancienne,
               jsonb_agg(jsonb_build_object(
                 'numero', c.numero, 'client', c.contact_nom, 'ville', c.livraison_ville,
                 'total_millimes', c.total_millimes, 'livree_le', c.livree_at, 'suivi', c.numero_suivi
               ) order by c.livree_at, c.numero) as commandes
          from public.commandes c
         where c.boutique_id = p_boutique_id
           and c.statut = 'livree' and c.mode_paiement = 'cod' and c.mode_livraison = 'domicile'
           and not exists (select 1 from public.versement_commandes vc
                            where vc.boutique_id = c.boutique_id and vc.commande_id = c.id)
         group by private.cle_transporteur(c.transporteur)
      ) g), '[]'::jsonb),
    'versements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'transporteur', v.transporteur, 'recu_le', v.recu_le,
               'attendu_millimes', v.attendu_millimes, 'recu_millimes', v.recu_millimes,
               'ecart_millimes', v.recu_millimes - v.attendu_millimes,
               'reference', v.reference, 'note', v.note, 'numeros', to_jsonb(v.numeros),
               'auteur', (select u.email from auth.users u where u.id = v.auteur_id),
               'cree_le', v.created_at, 'annule_le', v.annule_le,
               'annule_par', (select u.email from auth.users u where u.id = v.annule_par)
             ) order by v.recu_le desc, v.created_at desc)
        from (select * from public.versements v
               where v.boutique_id = p_boutique_id
               order by v.recu_le desc, v.created_at desc limit 50) v), '[]'::jsonb),
    'trente_jours', (
      select jsonb_build_object('nombre', count(*)::int,
                                'recu_millimes', coalesce(sum(v.recu_millimes), 0)::bigint,
                                'ecart_millimes', coalesce(sum(v.recu_millimes - v.attendu_millimes), 0)::bigint)
        from public.versements v
       where v.boutique_id = p_boutique_id and v.annule_le is null and v.recu_le >= v_depuis)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Enregistrer un versement
-- ---------------------------------------------------------------------
create function public.gestion_enregistrer_versement(
  p_boutique_id  uuid,
  p_transporteur text,
  p_numeros      text[],
  p_recu_millimes bigint,
  p_recu_le      date,
  p_reference    text default null,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numeros   text[] := array(select distinct btrim(n) from unnest(coalesce(p_numeros, '{}')) n where btrim(n) <> '' order by 1);
  v_cle       text := private.cle_transporteur(p_transporteur);
  v_aujourd   date := (now() at time zone 'Africa/Tunis')::date;
  v_commande  record;
  v_attendu   bigint := 0;
  v_id        uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');

  if cardinality(v_numeros) = 0 then
    raise exception 'Cochez les colis que couvre ce versement' using errcode = 'check_violation', hint = 'commandes';
  end if;
  if cardinality(v_numeros) > 500 then
    raise exception 'Au plus 500 colis par versement' using errcode = 'check_violation', hint = 'commandes';
  end if;
  if p_recu_millimes is null or p_recu_millimes < 0 or p_recu_millimes > 100000000000 then
    raise exception 'Le montant reçu est invalide' using errcode = 'check_violation', hint = 'montant';
  end if;
  if p_recu_le is null or p_recu_le > v_aujourd or p_recu_le < v_aujourd - 366 then
    raise exception 'La date du versement est invalide (ni dans le futur, ni il y a plus d''un an)'
      using errcode = 'check_violation', hint = 'date';
  end if;
  if char_length(coalesce(p_reference, '')) > 80 or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Référence (80 caractères) ou note (500) trop longue' using errcode = 'check_violation', hint = 'texte';
  end if;

  -- Chaque colis : de la boutique, livré, payé au livreur, de ce
  -- transporteur, et pas déjà rapproché. Verrouillés dans l'ordre (deux
  -- saisies simultanées ne se croisent pas).
  for v_commande in
    select c.id, c.numero, c.statut, c.mode_paiement, c.mode_livraison, c.transporteur, c.total_millimes
      from public.commandes c
     where c.boutique_id = p_boutique_id and c.numero = any (v_numeros)
     order by c.numero
       for update
  loop
    if v_commande.statut <> 'livree' or v_commande.mode_paiement <> 'cod' or v_commande.mode_livraison <> 'domicile' then
      raise exception 'La commande % n''est pas un colis livré payé au livreur', v_commande.numero
        using errcode = 'check_violation', hint = 'commande';
    end if;
    if private.cle_transporteur(v_commande.transporteur) <> v_cle then
      raise exception 'La commande % n''est pas passée par ce transporteur', v_commande.numero
        using errcode = 'check_violation', hint = 'transporteur';
    end if;
    if exists (select 1 from public.versement_commandes vc where vc.boutique_id = p_boutique_id and vc.commande_id = v_commande.id) then
      raise exception 'La commande % est déjà rapprochée d''un versement', v_commande.numero
        using errcode = 'check_violation', hint = 'deja';
    end if;
    v_attendu := v_attendu + v_commande.total_millimes;
  end loop;
  if (select count(*) from public.commandes c where c.boutique_id = p_boutique_id and c.numero = any (v_numeros)) <> cardinality(v_numeros) then
    raise exception 'Commande introuvable parmi : %', array_to_string(v_numeros, ', ')
      using errcode = 'no_data_found', hint = 'commande';
  end if;

  insert into public.versements (boutique_id, transporteur, recu_le, attendu_millimes, recu_millimes, reference, note, numeros, auteur_id)
  values (p_boutique_id, nullif(btrim(p_transporteur), ''), p_recu_le, v_attendu, p_recu_millimes,
          nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), v_numeros, auth.uid())
  returning id into v_id;

  insert into public.versement_commandes (boutique_id, versement_id, commande_id, montant_millimes)
  select p_boutique_id, v_id, c.id, c.total_millimes
    from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = any (v_numeros);

  return jsonb_build_object('id', v_id, 'nombre', cardinality(v_numeros), 'attendu_millimes', v_attendu,
                            'recu_millimes', p_recu_millimes, 'ecart_millimes', p_recu_millimes - v_attendu);
end;
$$;

-- ---------------------------------------------------------------------
-- Annuler une saisie : le versement reste au journal, ses colis redeviennent
-- « à recevoir »
-- ---------------------------------------------------------------------
create function public.gestion_annuler_versement(p_boutique_id uuid, p_versement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  update public.versements v
     set annule_le = clock_timestamp(), annule_par = auth.uid()
   where v.boutique_id = p_boutique_id and v.id = p_versement_id and v.annule_le is null;
  if not found then
    raise exception 'Versement introuvable, ou déjà annulé' using errcode = 'no_data_found', hint = 'versement';
  end if;
  delete from public.versement_commandes vc
   where vc.boutique_id = p_boutique_id and vc.versement_id = p_versement_id;
end;
$$;

revoke execute on function public.gestion_encaissements(uuid) from public, anon;
revoke execute on function public.gestion_enregistrer_versement(uuid, text, text[], bigint, date, text, text) from public, anon;
revoke execute on function public.gestion_annuler_versement(uuid, uuid) from public, anon;
grant  execute on function public.gestion_encaissements(uuid) to authenticated, service_role;
grant  execute on function public.gestion_enregistrer_versement(uuid, text, text[], bigint, date, text, text) to authenticated, service_role;
grant  execute on function public.gestion_annuler_versement(uuid, uuid) to authenticated, service_role;
revoke execute on function private.cle_transporteur(text) from public, anon, authenticated;
