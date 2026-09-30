-- =====================================================================
-- SkanEcom — 37 · LA DEMANDE DE DEVIS (module devis)
-- 30/09/2026 — étude 05 §2.3 (décidé le 29/09) : « listes de chantier :
-- le panier devient une demande, le commerçant répond avec un prix, la
-- demande devient une commande »
-- =====================================================================
--
-- Le parcours :
--   1. le client connecté envoie son panier en demande de devis, avec un
--      mot (le chantier, les délais) : public.demander_devis ;
--   2. la boutique chiffre chaque ligne (le prix catalogue, le prix pro s'il
--      y en a un, une remise), fixe les frais de livraison (ou laisse ceux
--      de la boutique) et une validité, puis l'envoie :
--      public.gestion_chiffrer_devis ;
--   3. le client le lit dans « Mes commandes », et l'accepte (ou le
--      refuse) ; accepter passe par le tunnel habituel — adresse ou
--      retrait, conditions de vente — et crée la commande AUX PRIX DU
--      DEVIS : public.accepter_devis appelle public.passer_commande, dont
--      toutes les garanties valent (rejeu, client bloqué, commandes en
--      attente, stock verrouillé, accord aux conditions).
-- Pour cela, le chiffrage (private.chiffre_commande) applique les prix et
-- les frais d'un devis quand la transaction le lui désigne
-- (skanecom.devis_id, posé seulement par chiffre_devis et accepter_devis ;
-- l'API ne pose pas de réglage de transaction) — et seulement un devis
-- ENVOYÉ, à son client connecté.
-- Le stock n'est pas réservé par un devis : il l'est à la commande.
--
-- En passant : le module « sav » (construit à la migration 30) n'avait pas
-- été rendu disponible à la console ; il l'est, avec « devis ».

update plateforme.modules set disponible = true where code in ('sav', 'devis');


-- ---------------------------------------------------------------------
-- Les devis et leurs lignes
-- ---------------------------------------------------------------------
create table public.devis (
  id                       uuid primary key default gen_random_uuid(),
  boutique_id              uuid not null references plateforme.boutiques (id) on delete cascade,
  rang                     integer not null check (rang > 0),
  numero                   text not null,
  client_id                uuid not null,
  statut                   text not null default 'demande'
                           constraint devis_statut check (statut in ('demande', 'envoye', 'accepte', 'refuse', 'annule')),
  message                  text constraint devis_message check (char_length(message) <= 1000),
  note_boutique            text constraint devis_note check (char_length(note_boutique) <= 1000),
  frais_livraison_millimes bigint constraint devis_frais check (frais_livraison_millimes >= 0),
  valide_jusqu_au          date,
  envoye_le                timestamptz,
  envoye_par               uuid references auth.users (id) on delete set null,
  clos_le                  timestamptz,
  motif                    text constraint devis_motif check (char_length(motif) <= 300),
  commande_id              uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, numero),
  unique (boutique_id, rang),
  foreign key (boutique_id, client_id)   references public.clients (boutique_id, id) on delete cascade,
  foreign key (boutique_id, commande_id) references public.commandes (boutique_id, id) on delete set null (commande_id),
  constraint devis_envoye_date check (statut in ('demande', 'annule', 'refuse') or (envoye_le is not null and valide_jusqu_au is not null)),
  constraint devis_accepte_commande check (statut <> 'accepte' or commande_id is not null)
);

comment on table public.devis is
  'Les demandes de devis : un panier envoyé par un client connecté, chiffré par la boutique, accepté (il devient une commande), refusé ou annulé. « Expiré » se lit : envoyé, validité dépassée. Écrit seulement par les fonctions.';

create index devis_statut_idx on public.devis (boutique_id, statut, created_at);
create index devis_client_idx on public.devis (boutique_id, client_id, created_at desc);

create trigger devis_updated_at before update on public.devis
  for each row execute function private.set_updated_at();
create trigger devis_boutique_immuable before update of boutique_id on public.devis
  for each row execute function private.boutique_immuable();

create table public.devis_lignes (
  id                      uuid primary key default gen_random_uuid(),
  boutique_id             uuid not null references plateforme.boutiques (id) on delete cascade,
  devis_id                uuid not null,
  variante_id             uuid not null,
  position                integer not null default 0,
  quantite                integer not null constraint devis_lignes_quantite check (quantite between 1 and 999),
  -- L'article COPIÉ au moment de la demande, comme une commande le garde.
  produit_nom             text not null,
  variante_libelle        text,
  sku                     text,
  prix_catalogue_millimes bigint not null constraint devis_lignes_catalogue check (prix_catalogue_millimes > 0),
  prix_devis_millimes     bigint constraint devis_lignes_prix check (prix_devis_millimes >= 0),
  unique (boutique_id, id),
  unique (boutique_id, devis_id, variante_id),
  foreign key (boutique_id, devis_id)    references public.devis (boutique_id, id) on delete cascade,
  foreign key (boutique_id, variante_id) references public.variantes (boutique_id, id)
);

create trigger devis_lignes_boutique_immuable before update of boutique_id on public.devis_lignes
  for each row execute function private.boutique_immuable();

alter table public.devis        enable row level security;
alter table public.devis_lignes enable row level security;
create policy "devis: l'équipe lit ceux de sa boutique"
  on public.devis for select using (boutique_id in (select private.mes_boutiques()));
create policy "devis_lignes: l'équipe lit celles de sa boutique"
  on public.devis_lignes for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.devis, public.devis_lignes from anon, authenticated;


-- ---------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------
create function private.devis_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'devis' and ma.actif)
$$;

-- Le statut lu : « expire » pour un devis envoyé dont la validité est passée
-- (heure de Tunis).
create function private.statut_devis(p_statut text, p_valide_jusqu_au date)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_statut = 'envoye' and p_valide_jusqu_au < (now() at time zone 'Africa/Tunis')::date then 'expire' else p_statut end
$$;

-- Le total d'un devis chiffré (lignes), sans les frais.
create function private.total_devis(p_boutique_id uuid, p_devis_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when bool_and(l.prix_devis_millimes is not null) then sum(l.prix_devis_millimes * l.quantite) end
    from public.devis_lignes l where l.boutique_id = p_boutique_id and l.devis_id = p_devis_id
$$;

-- Le devis ENVOYÉ, encore valable, de la personne connectée.
create function private.mon_devis_ouvert(p_boutique_id uuid, p_numero text)
returns public.devis
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_devis public.devis;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous avec votre numéro' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not private.devis_actif(p_boutique_id) then
    raise exception 'Cette boutique ne fait pas de devis en ligne' using errcode = 'check_violation', hint = 'module';
  end if;
  select d.* into v_devis from public.devis d
    join public.clients cl on cl.boutique_id = d.boutique_id and cl.id = d.client_id
   where d.boutique_id = p_boutique_id and d.numero = p_numero and cl.user_id = auth.uid();
  if not found then
    raise exception 'Devis introuvable' using errcode = 'check_violation', hint = 'devis';
  end if;
  if v_devis.statut = 'accepte' then
    raise exception 'Ce devis est déjà accepté : sa commande est dans « Mes commandes »' using errcode = 'check_violation', hint = 'deja';
  end if;
  if v_devis.statut <> 'envoye' then
    raise exception 'Ce devis n''est pas (ou plus) à accepter' using errcode = 'check_violation', hint = 'devis';
  end if;
  if private.statut_devis(v_devis.statut, v_devis.valide_jusqu_au) = 'expire' then
    raise exception 'Ce devis n''est plus valable depuis le % : demandez-en un nouveau', to_char(v_devis.valide_jusqu_au, 'DD/MM/YYYY')
      using errcode = 'check_violation', hint = 'expire';
  end if;
  return v_devis;
end;
$$;

revoke execute on function private.devis_actif(uuid)                 from public, anon, authenticated;
revoke execute on function private.statut_devis(text, date)          from public, anon, authenticated;
revoke execute on function private.total_devis(uuid, uuid)           from public, anon, authenticated;
revoke execute on function private.mon_devis_ouvert(uuid, text)      from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Le chiffrage : les prix et les frais d'un devis (migration 36, reprise ;
-- ce qui change : le devis désigné par la transaction)
-- ---------------------------------------------------------------------
create or replace function private.chiffre_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text, p_retrait boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lignes      jsonb;
  v_sous_total  bigint;
  v_complet     boolean;
  v_gouv        public.gouvernorats;
  v_frais       bigint;
  v_seuil       bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone        jsonb;
  v_retrait     jsonb;
  v_poids       integer;
  v_supplement  bigint := 0;
  v_pro         boolean := private.est_pro(p_boutique_id);
  v_economie    bigint;
  v_designe     text := nullif(current_setting('skanecom.devis_id', true), '');
  v_devis_id    uuid;
  v_devis_frais bigint;
begin
  -- Un devis ne vaut que s'il est envoyé, à son client connecté.
  if v_designe ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select d.id, d.frais_livraison_millimes into v_devis_id, v_devis_frais
      from public.devis d
      join public.clients cl on cl.boutique_id = d.boutique_id and cl.id = d.client_id
     where d.boutique_id = p_boutique_id and d.id = v_designe::uuid and d.statut = 'envoye'
       and cl.user_id = auth.uid() and auth.uid() is not null;
  end if;

  with demandees as (
    select d.variante_id, d.quantite from private.lignes_panier(p_lignes) d
  ), lues as (
    select d.variante_id, d.quantite,
           coalesce(v.actif and p.publie, false) as vendable,
           v.stock, v.sku, p.slug, v.poids_grammes,
           v.prix_millimes as prix_public,
           -- Le prix du devis ; sinon le prix pro, pour un pro (jamais plus
           -- cher que le prix public) ; sinon le prix public.
           case when dl.id is not null then dl.prix_devis_millimes
                when v_pro then least(coalesce(pp.prix_millimes, v.prix_millimes), v.prix_millimes)
                else v.prix_millimes end as prix_millimes,
           coalesce(v.quantite_min, 1) as quantite_min,
           dl.id is not null as au_devis,
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
    left join public.prix_pro pp on pp.boutique_id = v.boutique_id and pp.variante_id = v.id
    left join public.devis_lignes dl on v_devis_id is not null and dl.boutique_id = v.boutique_id
                                     and dl.devis_id = v_devis_id and dl.variante_id = v.id
                                     and dl.quantite = d.quantite and dl.prix_devis_millimes is not null
  )
  select
    jsonb_agg(jsonb_build_object(
      'variante_id',            l.variante_id,
      'disponible',             l.vendable and l.stock > 0 and l.stock >= l.quantite_min,
      'quantite',               l.quantite,
      'quantite_disponible',    case when l.vendable and l.stock >= l.quantite_min then least(l.quantite, l.stock) else 0 end,
      'quantite_min',           case when l.vendable then l.quantite_min end,
      'produit_nom',            case when l.vendable then l.produit_nom end,
      'produit_slug',           case when l.vendable then l.slug end,
      'variante_libelle',       case when l.vendable then l.libelle end,
      'sku',                    case when l.vendable then l.sku end,
      'image',                  case when l.vendable then l.image end,
      'prix_unitaire_millimes', case when l.vendable then l.prix_millimes end,
      'prix_public_millimes',   case when l.vendable and l.prix_millimes < l.prix_public then l.prix_public end,
      'total_ligne_millimes',   case when l.vendable then l.prix_millimes * l.quantite end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.prix_millimes * l.quantite end), 0),
    -- Au devis : chaque ligne doit en être (mêmes articles, mêmes quantités).
    bool_and(l.vendable and l.stock >= l.quantite and l.quantite >= l.quantite_min and (v_devis_id is null or l.au_devis)),
    coalesce(sum(case when l.vendable then coalesce(l.poids_grammes, 0) * l.quantite end), 0)::integer,
    coalesce(sum(case when l.vendable then (l.prix_public - l.prix_millimes) * l.quantite end), 0)
  into v_lignes, v_sous_total, v_complet, v_poids, v_economie
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
    v_frais := public.frais_livraison_millimes(p_boutique_id, v_gouv.code, v_sous_total, v_poids);
    v_supplement := case when v_frais > 0 then private.supplement_poids(p_boutique_id, v_poids) else 0 end;
    select jsonb_build_object('nom_fr', z.nom_fr, 'nom_ar', z.nom_ar,
                              'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
      into v_zone
      from public.zones_gouvernorats zg
      join public.zones_livraison z on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
     where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = v_gouv.code;
  end if;
  -- Les frais fixés par le devis remplacent ceux de la boutique (à domicile).
  if v_devis_id is not null and v_devis_frais is not null and not p_retrait then
    v_frais := v_devis_frais;
    v_supplement := 0;
  end if;

  return jsonb_build_object(
    'lignes',                   v_lignes,
    'complet',                  v_complet,
    'sous_total_millimes',      v_sous_total,
    'seuil_gratuite_millimes',  case when v_seuil > 0 and v_devis_id is null then v_seuil end,
    'gouvernorat',              case when v_gouv.code is not null then
                                  jsonb_build_object('code', v_gouv.code, 'nom_fr', v_gouv.nom_fr, 'nom_ar', v_gouv.nom_ar) end,
    'zone',                     v_zone,
    'mode',                     case when p_retrait then 'retrait' else 'domicile' end,
    'retrait',                  v_retrait,
    'frais_livraison_millimes', v_frais,
    'poids_grammes',            v_poids,
    'supplement_poids_millimes', v_supplement,
    'tarif',                    case when v_devis_id is not null then 'devis' when v_pro then 'pro' else 'public' end,
    'economie_pro_millimes',    case when v_pro and v_devis_id is null and v_economie > 0 then v_economie end,
    'total_millimes',           v_sous_total + v_frais
  );
end;
$$;


-- ---------------------------------------------------------------------
-- La vitrine : demander, lire, chiffrer, accepter, refuser
-- ---------------------------------------------------------------------
create function public.demander_devis(p_boutique_id uuid, p_lignes jsonb, p_message text default null)
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
    raise exception 'Connectez-vous avec votre numéro pour demander un devis' using errcode = 'insufficient_privilege', hint = 'compte';
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

  v_tel := private.telephone_tunisien((select u.phone from auth.users u where u.id = v_uid));
  select * into v_client from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid;
  if not found then
    if v_tel is null then
      raise exception 'Connectez-vous avec votre numéro pour demander un devis' using errcode = 'insufficient_privilege', hint = 'compte';
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

-- Les devis de la personne connectée, les plus récents d'abord. Les prix ne
-- se lisent qu'une fois le devis envoyé ; rien des notes internes.
create function public.mes_devis(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'cree_le' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'numero', d.numero, 'statut', private.statut_devis(d.statut, d.valide_jusqu_au),
             'cree_le', d.created_at, 'envoye_le', d.envoye_le, 'valide_jusqu_au', d.valide_jusqu_au,
             'message', d.message, 'motif', case when d.statut in ('refuse', 'annule') then d.motif end,
             'note', case when d.statut <> 'demande' then d.note_boutique end,
             'frais_livraison_millimes', case when d.statut <> 'demande' then d.frais_livraison_millimes end,
             'total_millimes', case when d.statut <> 'demande' then private.total_devis(d.boutique_id, d.id) end,
             'commande', (select c.numero from public.commandes c where c.boutique_id = d.boutique_id and c.id = d.commande_id),
             'lignes', (select jsonb_agg(jsonb_build_object(
                                 'variante_id', l.variante_id, 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle,
                                 'sku', l.sku, 'quantite', l.quantite,
                                 'prix_millimes', case when d.statut <> 'demande' then l.prix_devis_millimes end,
                                 'prix_catalogue_millimes', l.prix_catalogue_millimes,
                                 'image', (select coalesce(v.image_chemin,
                                                  (select i.chemin from public.produit_images i
                                                    where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                                                    order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at limit 1))
                                             from public.variantes v where v.boutique_id = l.boutique_id and v.id = l.variante_id),
                                 'produit_slug', (select p.slug from public.variantes v
                                                    join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
                                                   where v.boutique_id = l.boutique_id and v.id = l.variante_id))
                               order by l.position)
                          from public.devis_lignes l where l.boutique_id = d.boutique_id and l.devis_id = d.id)) as x
      from public.devis d
      join public.clients cl on cl.boutique_id = d.boutique_id and cl.id = d.client_id
     where d.boutique_id = p_boutique_id and cl.user_id = auth.uid() and auth.uid() is not null
       and private.devis_actif(p_boutique_id)
     order by d.created_at desc
     limit 20
  ) q
$$;

-- Le chiffrage d'un devis envoyé, pour le tunnel (la même forme que
-- devis_commande) : ses lignes, ses prix, ses frais.
create function public.chiffre_devis(p_boutique_id uuid, p_numero text, p_gouvernorat text default null, p_mode text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_devis  public.devis := private.mon_devis_ouvert(p_boutique_id, p_numero);
  v_lignes jsonb;
  v_res    jsonb;
begin
  if coalesce(p_mode, 'domicile') not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  select jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'quantite', l.quantite) order by l.position)
    into v_lignes from public.devis_lignes l where l.boutique_id = p_boutique_id and l.devis_id = v_devis.id;
  perform set_config('skanecom.devis_id', v_devis.id::text, true);
  v_res := private.chiffre_commande(p_boutique_id, v_lignes, nullif(btrim(p_gouvernorat), ''), coalesce(p_mode = 'retrait', false));
  perform set_config('skanecom.devis_id', '', true);
  return v_res || jsonb_build_object('devis', jsonb_build_object(
    'numero', v_devis.numero, 'valide_jusqu_au', v_devis.valide_jusqu_au, 'note', v_devis.note_boutique));
end;
$$;

-- Accepter : la commande aux prix du devis, par public.passer_commande.
create function public.accepter_devis(
  p_boutique_id     uuid,
  p_numero          text,
  p_cle_idempotence text,
  p_contact         jsonb,
  p_livraison       jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_devis    public.devis;
  v_lignes   jsonb;
  v_mode     text := coalesce(nullif(btrim(p_livraison ->> 'mode'), ''), 'domicile');
  v_chiffre  jsonb;
  v_resultat jsonb;
begin
  -- Le devis verrouillé : deux acceptations simultanées, la seconde attend
  -- puis trouve le devis accepté.
  perform 1 from public.devis d where d.boutique_id = p_boutique_id and d.numero = p_numero for update;
  v_devis := private.mon_devis_ouvert(p_boutique_id, p_numero);
  if v_mode not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;

  select jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'quantite', l.quantite) order by l.position)
    into v_lignes from public.devis_lignes l where l.boutique_id = p_boutique_id and l.devis_id = v_devis.id;
  perform set_config('skanecom.devis_id', v_devis.id::text, true);
  v_chiffre := private.chiffre_commande(p_boutique_id, v_lignes,
                 case when v_mode = 'domicile' then nullif(btrim(p_livraison ->> 'gouvernorat'), '') end, v_mode = 'retrait');
  v_resultat := public.passer_commande(p_boutique_id, p_cle_idempotence, v_lignes, p_contact, p_livraison,
                                       (v_chiffre ->> 'total_millimes')::bigint, 'Devis ' || v_devis.numero || ' accepté');
  perform set_config('skanecom.devis_id', '', true);

  update public.devis set
    statut = 'accepte', clos_le = now(),
    commande_id = (select c.id from public.commandes c where c.boutique_id = p_boutique_id and c.numero = v_resultat ->> 'numero')
  where boutique_id = p_boutique_id and id = v_devis.id;

  return v_resultat || jsonb_build_object('devis', v_devis.numero);
end;
$$;

create function public.refuser_devis(p_boutique_id uuid, p_numero text, p_motif text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_devis public.devis;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous avec votre numéro' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if char_length(coalesce(v_motif, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus)' using errcode = 'check_violation', hint = 'motif';
  end if;
  select d.* into v_devis from public.devis d
    join public.clients cl on cl.boutique_id = d.boutique_id and cl.id = d.client_id
   where d.boutique_id = p_boutique_id and d.numero = p_numero and cl.user_id = auth.uid()
   for update of d;
  if not found or v_devis.statut not in ('demande', 'envoye') then
    raise exception 'Ce devis n''est pas (ou plus) en cours' using errcode = 'check_violation', hint = 'devis';
  end if;
  update public.devis set statut = 'refuse', motif = v_motif, clos_le = now()
   where boutique_id = p_boutique_id and id = v_devis.id;
end;
$$;

revoke execute on function public.demander_devis(uuid, jsonb, text)                  from public, anon;
revoke execute on function public.mes_devis(uuid)                                    from public, anon;
revoke execute on function public.chiffre_devis(uuid, text, text, text)              from public;
revoke execute on function public.accepter_devis(uuid, text, text, jsonb, jsonb)     from public, anon;
revoke execute on function public.refuser_devis(uuid, text, text)                    from public, anon;
grant  execute on function public.demander_devis(uuid, jsonb, text)                  to authenticated, service_role;
grant  execute on function public.mes_devis(uuid)                                    to authenticated, service_role;
-- Aussi au visiteur : le lien « /commande?devis=… » ouvert sans session doit
-- lui dire de se connecter (indice compte), pas tomber en erreur.
grant  execute on function public.chiffre_devis(uuid, text, text, text)              to anon, authenticated, service_role;
grant  execute on function public.accepter_devis(uuid, text, text, jsonb, jsonb)     to authenticated, service_role;
grant  execute on function public.refuser_devis(uuid, text, text)                    to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Le backoffice : l'état, la liste, la fiche, le chiffrage, l'annulation
-- ---------------------------------------------------------------------
create function public.gestion_devis_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.devis_actif(p_boutique_id),
    'a_chiffrer', (select count(*) from public.devis d where d.boutique_id = p_boutique_id and d.statut = 'demande'));
end;
$$;

create function public.gestion_liste_devis(p_boutique_id uuid, p_filtre text default 'a_chiffrer')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_filtre is null or p_filtre not in ('a_chiffrer', 'envoyes', 'acceptes', 'clos') then
    raise exception 'Filtre inconnu : %', p_filtre using errcode = 'check_violation', hint = 'filtre';
  end if;
  return (
    with base as (
      select d.*, private.statut_devis(d.statut, d.valide_jusqu_au) as lu
        from public.devis d where d.boutique_id = p_boutique_id
    )
    select jsonb_build_object(
      'filtre', p_filtre,
      'actif', private.devis_actif(p_boutique_id),
      'compteurs', (select jsonb_build_object(
          'a_chiffrer', count(*) filter (where b.lu = 'demande'),
          'envoyes',    count(*) filter (where b.lu = 'envoye'),
          'acceptes',   count(*) filter (where b.lu = 'accepte'),
          'clos',       count(*) filter (where b.lu in ('refuse', 'annule', 'expire')))
        from base b),
      'devis', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'numero', b.numero, 'statut', b.lu, 'cree_le', b.created_at, 'envoye_le', b.envoye_le,
                 'valide_jusqu_au', b.valide_jusqu_au, 'clos_le', b.clos_le, 'message', b.message,
                 'client', jsonb_build_object('id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone),
                 'articles', (select count(*) from public.devis_lignes l where l.boutique_id = b.boutique_id and l.devis_id = b.id),
                 'pieces', (select coalesce(sum(l.quantite), 0) from public.devis_lignes l where l.boutique_id = b.boutique_id and l.devis_id = b.id),
                 'catalogue_millimes', (select coalesce(sum(l.prix_catalogue_millimes * l.quantite), 0)
                                          from public.devis_lignes l where l.boutique_id = b.boutique_id and l.devis_id = b.id),
                 'total_millimes', private.total_devis(b.boutique_id, b.id),
                 'commande', (select c.numero from public.commandes c where c.boutique_id = b.boutique_id and c.id = b.commande_id))
               order by case when p_filtre = 'a_chiffrer' then b.created_at end,
                        coalesce(b.clos_le, b.envoye_le, b.created_at) desc, b.rang)
          from base b
          join public.clients cl on cl.boutique_id = b.boutique_id and cl.id = b.client_id
         where case p_filtre when 'a_chiffrer' then b.lu = 'demande'
                             when 'envoyes'    then b.lu = 'envoye'
                             when 'acceptes'   then b.lu = 'accepte'
                             else b.lu in ('refuse', 'annule', 'expire') end), '[]'::jsonb))
  );
end;
$$;

-- La fiche : le client, ce qu'il a écrit, chaque ligne avec ce qui aide à
-- chiffrer (prix catalogue d'alors et d'aujourd'hui, prix pro, stock).
create function public.gestion_devis(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d public.devis;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_d from public.devis d where d.boutique_id = p_boutique_id and d.numero = p_numero;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'numero', v_d.numero, 'statut', private.statut_devis(v_d.statut, v_d.valide_jusqu_au), 'version', v_d.updated_at,
    'cree_le', v_d.created_at, 'envoye_le', v_d.envoye_le, 'valide_jusqu_au', v_d.valide_jusqu_au, 'clos_le', v_d.clos_le,
    'envoye_par', (select u.email from auth.users u where u.id = v_d.envoye_par),
    'message', v_d.message, 'note', v_d.note_boutique, 'motif', v_d.motif,
    'frais_livraison_millimes', v_d.frais_livraison_millimes,
    'total_millimes', private.total_devis(p_boutique_id, v_d.id),
    'commande', (select c.numero from public.commandes c where c.boutique_id = p_boutique_id and c.id = v_d.commande_id),
    'client', (select jsonb_build_object(
                 'id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone, 'commandes', cl.nb_commandes, 'refus', cl.nb_refus,
                 'niveau_risque', cl.niveau_risque,
                 'pro', (select cp.raison_sociale from public.comptes_pro cp
                          where cp.boutique_id = cl.boutique_id and cp.client_id = cl.id and cp.statut = 'valide'))
                 from public.clients cl where cl.boutique_id = p_boutique_id and cl.id = v_d.client_id),
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_catalogue_millimes', l.prix_catalogue_millimes,
               'prix_actuel_millimes', v.prix_millimes, 'prix_pro_millimes', pp.prix_millimes,
               'prix_devis_millimes', l.prix_devis_millimes, 'stock', v.stock, 'en_vente', v.actif and p.publie,
               'produit_id', v.produit_id)
             order by l.position)
        from public.devis_lignes l
        join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
        join public.produits  p on p.boutique_id = v.boutique_id and p.id = v.produit_id
        left join public.prix_pro pp on pp.boutique_id = v.boutique_id and pp.variante_id = v.id
       where l.boutique_id = p_boutique_id and l.devis_id = v_d.id), '[]'::jsonb),
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object('le', ja.at, 'action', ja.action, 'apres', ja.apres,
                                          'auteur', (select u.email from auth.users u where u.id = ja.acteur))
             order by ja.at desc)
        from plateforme.journal_audit ja
       where ja.boutique_id = p_boutique_id and ja.action like 'devis.%' and ja.cible = v_d.numero), '[]'::jsonb));
end;
$$;

-- Chiffrer (brouillon) ou chiffrer et envoyer. p_prix : { ligne_id: prix
-- unitaire en millimes }. Frais : NULL, ceux de la boutique à la commande ;
-- 0, livraison offerte. L'étape vue est revérifiée (p_version).
create function public.gestion_chiffrer_devis(
  p_boutique_id     uuid,
  p_numero          text,
  p_prix            jsonb,
  p_frais           bigint,
  p_validite_jours  integer,
  p_note            text,
  p_envoyer         boolean,
  p_version         timestamptz default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d     public.devis;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_total bigint;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not private.devis_actif(p_boutique_id) then
    raise exception 'Le module des devis n''est pas actif' using errcode = 'check_violation', hint = 'module';
  end if;
  select * into v_d from public.devis d where d.boutique_id = p_boutique_id and d.numero = p_numero for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'no_data_found', hint = 'devis';
  end if;
  if p_version is not null and v_d.updated_at <> p_version then
    raise exception 'Le devis a changé entre-temps : il est à jour ci-dessous' using errcode = 'check_violation', hint = 'change';
  end if;
  if v_d.statut not in ('demande', 'envoye') then
    raise exception 'Ce devis n''est plus à chiffrer' using errcode = 'check_violation', hint = 'etat';
  end if;
  if p_prix is null or jsonb_typeof(p_prix) <> 'object'
     or exists (select 1 from jsonb_each(p_prix) e
                 where jsonb_typeof(e.value) not in ('number', 'null')
                    or (jsonb_typeof(e.value) = 'number' and ((e.value)::numeric < 0 or (e.value)::numeric > 100000000000
                                                             or (e.value)::numeric <> trunc((e.value)::numeric)))) then
    raise exception 'Prix illisibles' using errcode = 'check_violation', hint = 'prix';
  end if;
  if exists (select 1 from jsonb_object_keys(p_prix) k
              where k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 or not exists (select 1 from public.devis_lignes l
                                 where l.boutique_id = p_boutique_id and l.devis_id = v_d.id and l.id = k::uuid)) then
    raise exception 'Une ligne n''est pas de ce devis' using errcode = 'check_violation', hint = 'prix';
  end if;
  if p_frais is not null and (p_frais < 0 or p_frais > 100000000) then
    raise exception 'Frais de livraison invalides' using errcode = 'check_violation', hint = 'frais';
  end if;
  if coalesce(p_validite_jours, 15) not between 1 and 90 then
    raise exception 'La validité va de 1 à 90 jours' using errcode = 'check_violation', hint = 'validite';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'Note trop longue (1 000 caractères au plus)' using errcode = 'check_violation', hint = 'note';
  end if;

  update public.devis_lignes l set prix_devis_millimes = (p_prix ->> l.id::text)::bigint
   where l.boutique_id = p_boutique_id and l.devis_id = v_d.id and p_prix ? l.id::text;

  if coalesce(p_envoyer, false) then
    v_total := private.total_devis(p_boutique_id, v_d.id);
    if v_total is null then
      raise exception 'Chiffrez chaque ligne avant d''envoyer' using errcode = 'check_violation', hint = 'incomplet';
    end if;
    if v_total <= 0 then
      raise exception 'Un devis à zéro ne s''envoie pas' using errcode = 'check_violation', hint = 'incomplet';
    end if;
  end if;

  update public.devis set
    frais_livraison_millimes = p_frais, note_boutique = v_note,
    statut = case when coalesce(p_envoyer, false) then 'envoye' else statut end,
    envoye_le = case when coalesce(p_envoyer, false) then now() else envoye_le end,
    envoye_par = case when coalesce(p_envoyer, false) then auth.uid() else envoye_par end,
    valide_jusqu_au = case when coalesce(p_envoyer, false)
                           then (now() at time zone 'Africa/Tunis')::date + coalesce(p_validite_jours, 15) else valide_jusqu_au end
  where boutique_id = p_boutique_id and id = v_d.id;

  if coalesce(p_envoyer, false) then
    perform private.console_trace(auth.uid(), p_boutique_id, 'devis.envoyer', v_d.numero,
      case when v_d.statut = 'envoye' then jsonb_build_object('total', private.total_devis(p_boutique_id, v_d.id)) end,
      jsonb_build_object('total', v_total, 'frais', p_frais, 'validite_jours', coalesce(p_validite_jours, 15)));
  end if;
end;
$$;

create function public.gestion_annuler_devis(p_boutique_id uuid, p_numero text, p_motif text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d     public.devis;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_d from public.devis d where d.boutique_id = p_boutique_id and d.numero = p_numero for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'no_data_found', hint = 'devis';
  end if;
  if v_d.statut not in ('demande', 'envoye') then
    raise exception 'Ce devis n''est plus en cours' using errcode = 'check_violation', hint = 'etat';
  end if;
  if v_motif is null or char_length(v_motif) > 300 then
    raise exception 'Dites pourquoi (300 caractères au plus) : le client le lira' using errcode = 'check_violation', hint = 'motif';
  end if;
  update public.devis set statut = 'annule', motif = v_motif, clos_le = now()
   where boutique_id = p_boutique_id and id = v_d.id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'devis.annuler', v_d.numero,
    jsonb_build_object('statut', v_d.statut), jsonb_build_object('motif', v_motif));
end;
$$;

revoke execute on function public.gestion_devis_etat(uuid)                                                    from public, anon;
revoke execute on function public.gestion_liste_devis(uuid, text)                                             from public, anon;
revoke execute on function public.gestion_devis(uuid, text)                                                   from public, anon;
revoke execute on function public.gestion_chiffrer_devis(uuid, text, jsonb, bigint, integer, text, boolean, timestamptz) from public, anon;
revoke execute on function public.gestion_annuler_devis(uuid, text, text)                                     from public, anon;
grant  execute on function public.gestion_devis_etat(uuid)                                                    to authenticated;
grant  execute on function public.gestion_liste_devis(uuid, text)                                             to authenticated;
grant  execute on function public.gestion_devis(uuid, text)                                                   to authenticated;
grant  execute on function public.gestion_chiffrer_devis(uuid, text, jsonb, bigint, integer, text, boolean, timestamptz) to authenticated;
grant  execute on function public.gestion_annuler_devis(uuid, text, text)                                     to authenticated;
