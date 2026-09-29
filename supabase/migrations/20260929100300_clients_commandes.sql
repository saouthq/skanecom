-- =====================================================================
-- SkanEcom — 04 · CLIENTS ET COMMANDES
-- Clients par boutique · adresses · numérotation par boutique · commandes ·
-- lignes · historique · réservation et retour du stock
-- 29/09/2026 — reprise de Maymar (commandes, réservation du stock) :
-- pièges 2, 3 et 6 de docs/cadrage/03-reprise-maymar.md §3 corrigés
-- =====================================================================
-- Changements par rapport à Maymar :
--   · un compte (auth.users) est une IDENTITÉ globale ; la relation avec une
--     boutique est une fiche `clients` propre à cette boutique. Le même
--     acheteur chez Maymar et chez la quincaillerie a deux fiches, et aucun
--     commerçant ne voit l'autre ;
--   · numéro de commande par boutique (préfixe réglable), sans séquence
--     globale ni « MAY- » écrit en dur ;
--   · clé d'idempotence par boutique, origine de la commande et statut
--     « a_arbitrer » pour les commandes rejouées après une panne ;
--   · compteurs de commandes et de refus sur la fiche client.
-- DÉCISION DE SÉCURITÉ reprise de Maymar : aucune policy INSERT sur les
-- commandes et leurs lignes. Une commande se crée côté serveur, qui
-- recalcule prix, totaux et frais depuis la base.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Clients de chaque boutique
-- ---------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  nom           text,
  telephone     text not null,
  email         text,
  nb_commandes  integer not null default 0 check (nb_commandes >= 0),
  nb_refus      integer not null default 0 check (nb_refus >= 0),
  niveau_risque text not null default 'normal' check (niveau_risque in ('normal', 'surveille', 'bloque')),
  note_interne  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, user_id)
);

comment on column public.clients.user_id is
  'NULL = client en invité (réglage compte.obligatoire = false), ou compte supprimé : la fiche et l''historique restent.';
comment on column public.clients.nb_refus is
  'Refus imputables au client (origine client ou injoignable), tenus par la base. Un refus du livreur ne compte pas.';

create index clients_telephone_idx on public.clients (boutique_id, telephone);

create trigger clients_updated_at
  before update on public.clients
  for each row execute function private.set_updated_at();
create trigger clients_boutique_immuable
  before update of boutique_id on public.clients
  for each row execute function private.boutique_immuable();

-- Fiches de l'utilisateur connecté, dans toutes les boutiques où il achète.
create function private.mes_clients()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c where c.user_id = auth.uid();
$$;

revoke execute on function private.mes_clients() from public, anon, authenticated;
grant  execute on function private.mes_clients() to anon, authenticated, service_role;

alter table public.clients enable row level security;

create policy "clients: chacun lit sa fiche"
  on public.clients for select
  using (user_id = auth.uid());
create policy "clients: l'équipe lit ceux de sa boutique"
  on public.clients for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "clients: la relation client modifie"
  on public.clients for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin,confirmateur}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin,confirmateur}')));

-- Un acheteur connecté devient client d'une boutique active : fiche créée
-- une fois, puis mise à jour. Il ne peut pas toucher à ses compteurs ni à
-- son niveau de risque.
create function public.inscrire_client(
  p_boutique_id uuid,
  p_nom         text,
  p_telephone   text,
  p_email       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;

  insert into public.clients as c (boutique_id, user_id, nom, telephone, email)
  values (p_boutique_id, auth.uid(), nullif(btrim(p_nom), ''), btrim(p_telephone), nullif(btrim(p_email), ''))
  on conflict (boutique_id, user_id) do update
    set nom = excluded.nom, telephone = excluded.telephone, email = excluded.email
  returning c.id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.inscrire_client(uuid, text, text, text) from public, anon;
grant  execute on function public.inscrire_client(uuid, text, text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Carnet d'adresses
-- ---------------------------------------------------------------------
create table public.adresses (
  id               uuid primary key default gen_random_uuid(),
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  client_id        uuid not null,
  nom_destinataire text not null,
  telephone        text not null,
  ligne1           text not null,
  ligne2           text,
  ville            text not null,
  gouvernorat_code text not null references public.gouvernorats (code) on delete restrict,
  code_postal      text,
  par_defaut       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (boutique_id, id),
  foreign key (boutique_id, client_id)
    references public.clients (boutique_id, id) on delete cascade
);

create index adresses_client_idx on public.adresses (boutique_id, client_id);
create unique index adresses_une_seule_par_defaut on public.adresses (boutique_id, client_id) where par_defaut;

create trigger adresses_updated_at
  before update on public.adresses
  for each row execute function private.set_updated_at();
create trigger adresses_boutique_immuable
  before update of boutique_id on public.adresses
  for each row execute function private.boutique_immuable();

alter table public.adresses enable row level security;

create policy "adresses: le client lit les siennes"
  on public.adresses for select using (client_id in (select private.mes_clients()));
create policy "adresses: l'équipe lit celles de sa boutique"
  on public.adresses for select using (boutique_id in (select private.mes_boutiques()));
create policy "adresses: le client ajoute la sienne"
  on public.adresses for insert with check (client_id in (select private.mes_clients()));
create policy "adresses: le client modifie la sienne"
  on public.adresses for update
  using (client_id in (select private.mes_clients()))
  with check (client_id in (select private.mes_clients()));
create policy "adresses: le client supprime la sienne"
  on public.adresses for delete using (client_id in (select private.mes_clients()));


-- ---------------------------------------------------------------------
-- Types du cycle de commande
-- ---------------------------------------------------------------------
-- Cycle de Maymar : reçue → confirmée → expédiée → livrée / refusée /
-- annulée. « a_arbitrer » : commande rejouée après une panne (tampon), à
-- vérifier par l'équipe avant d'entrer dans le cycle.
create type public.statut_commande as enum (
  'a_arbitrer', 'recue', 'confirmee', 'expediee', 'livree', 'refusee', 'annulee'
);

create type public.origine_refus as enum ('client', 'livreur', 'injoignable', 'autre');

create type public.origine_commande as enum ('vitrine', 'differee', 'manuelle', 'import');

create type public.mode_paiement as enum ('cod', 'konnect', 'flouci');

create type public.statut_paiement as enum ('en_attente', 'paye', 'echoue', 'rembourse');


-- ---------------------------------------------------------------------
-- Numérotation par boutique
-- ---------------------------------------------------------------------
create table public.compteurs_commandes (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  annee       smallint not null,
  dernier     integer not null check (dernier > 0),
  primary key (boutique_id, annee)
);

comment on table public.compteurs_commandes is
  'Un compteur par boutique et par année. Tenu par le trigger de numérotation ; aucun accès par l''API.';

alter table public.compteurs_commandes enable row level security;

create trigger compteurs_commandes_boutique_immuable
  before update of boutique_id on public.compteurs_commandes
  for each row execute function private.boutique_immuable();


-- ---------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------
create table public.commandes (
  id                       uuid primary key default gen_random_uuid(),
  boutique_id              uuid not null references plateforme.boutiques (id) on delete cascade,
  numero                   text not null,
  cle_idempotence          text,
  origine                  public.origine_commande not null default 'vitrine',
  client_id                uuid,

  statut                   public.statut_commande not null default 'recue',
  mode_paiement            public.mode_paiement   not null default 'cod',
  statut_paiement          public.statut_paiement not null default 'en_attente',

  -- Contact et adresse COPIÉS au moment de la commande : une commande est une
  -- archive, elle ne change pas quand le client édite sa fiche ou déménage.
  contact_nom              text not null,
  contact_telephone        text not null,
  contact_email            text,
  livraison_ligne1         text not null,
  livraison_ligne2         text,
  livraison_ville          text not null,
  livraison_gouvernorat    text not null,
  livraison_code_postal    text,
  livraison_zone_nom       text,

  sous_total_millimes      bigint not null default 0 check (sous_total_millimes >= 0),
  frais_livraison_millimes bigint not null default 0 check (frais_livraison_millimes >= 0),
  remise_millimes          bigint not null default 0 check (remise_millimes >= 0),
  total_millimes           bigint not null default 0 check (total_millimes >= 0),

  transporteur             text,
  numero_suivi             text,

  refus_origine            public.origine_refus,
  refus_commentaire        text,
  stock_reintegre          boolean not null default false,

  motif_annulation         text,
  note_client              text,
  note_interne             text,

  confirmee_at             timestamptz,
  expediee_at              timestamptz,
  livree_at                timestamptz,
  cloturee_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (boutique_id, id),
  unique (boutique_id, numero),
  unique (boutique_id, cle_idempotence),
  foreign key (boutique_id, client_id)
    references public.clients (boutique_id, id) on delete set null (client_id),
  -- Un refus sans origine est un refus dont on n'apprendra jamais rien.
  constraint commandes_refus_documente check (statut <> 'refusee' or refus_origine is not null)
);

comment on column public.commandes.cle_idempotence is
  'Fournie par la vitrine : une commande envoyée deux fois (double clic, rejeu après une panne) n''est créée qu''une fois.';
comment on column public.commandes.stock_reintegre is
  'Empêche la double réintégration : une commande refusée puis rouverte ne crédite pas le stock deux fois.';

create index commandes_statut_idx    on public.commandes (boutique_id, statut, created_at desc);
create index commandes_client_idx    on public.commandes (boutique_id, client_id, created_at desc);
create index commandes_telephone_idx on public.commandes (boutique_id, contact_telephone);

-- FK différée de la migration 03 : stock_mouvements précède commandes.
alter table public.stock_mouvements
  add constraint stock_mouvements_commande_fk
  foreign key (boutique_id, commande_id)
  references public.commandes (boutique_id, id) on delete set null (commande_id);

create function private.numerote_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_annee   smallint := extract(year from now() at time zone 'Africa/Tunis')::smallint;
  v_rang    integer;
  v_prefixe text;
begin
  if new.numero is not null then
    return new;
  end if;

  -- La ligne du compteur est verrouillée jusqu'à la fin de la transaction :
  -- deux commandes simultanées de la même boutique ne prennent jamais le
  -- même numéro, et deux boutiques ne s'attendent jamais.
  insert into public.compteurs_commandes as c (boutique_id, annee, dernier)
  values (new.boutique_id, v_annee, 1)
  on conflict (boutique_id, annee) do update set dernier = c.dernier + 1
  returning c.dernier into v_rang;

  v_prefixe := upper(nullif(btrim(private.reglage(new.boutique_id, 'commande.prefixe_numero') #>> '{}'), ''));
  if v_prefixe is null then
    select upper(left(regexp_replace(b.slug, '[^a-z0-9]', '', 'g'), 3)) into v_prefixe
    from plateforme.boutiques b where b.id = new.boutique_id;
  end if;

  new.numero := v_prefixe || '-' || v_annee || '-' || lpad(v_rang::text, 5, '0');
  return new;
end;
$$;

create trigger commandes_numerote
  before insert on public.commandes
  for each row execute function private.numerote_commande();

create trigger commandes_updated_at
  before update on public.commandes
  for each row execute function private.set_updated_at();
create trigger commandes_boutique_immuable
  before update of boutique_id on public.commandes
  for each row execute function private.boutique_immuable();


-- ---------------------------------------------------------------------
-- Lignes de commande
-- ---------------------------------------------------------------------
create table public.commande_lignes (
  id                     uuid primary key default gen_random_uuid(),
  boutique_id            uuid not null references plateforme.boutiques (id) on delete cascade,
  commande_id            uuid not null,
  variante_id            uuid,

  -- Copies figées : le prix change, le produit peut quitter le catalogue.
  produit_nom            text not null,
  variante_libelle       text,
  sku                    text,
  prix_unitaire_millimes bigint not null check (prix_unitaire_millimes >= 0),
  quantite               integer not null check (quantite > 0),
  total_ligne_millimes   bigint not null check (total_ligne_millimes >= 0),
  created_at             timestamptz not null default now(),

  unique (boutique_id, id),
  foreign key (boutique_id, commande_id)
    references public.commandes (boutique_id, id) on delete cascade,
  foreign key (boutique_id, variante_id)
    references public.variantes (boutique_id, id) on delete set null (variante_id)
);

comment on column public.commande_lignes.variante_id is
  'Clé composite : une ligne de la boutique A ne peut pas viser une variante de la boutique B. C''est ce qui rend sûre la réservation du stock, qui contourne la RLS.';

create index commande_lignes_commande_idx on public.commande_lignes (boutique_id, commande_id);
create index commande_lignes_variante_idx on public.commande_lignes (boutique_id, variante_id);

create trigger commande_lignes_boutique_immuable
  before update of boutique_id on public.commande_lignes
  for each row execute function private.boutique_immuable();


-- ---------------------------------------------------------------------
-- Historique des changements de statut (tenu par trigger, immuable)
-- ---------------------------------------------------------------------
create table public.commande_evenements (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  commande_id   uuid not null,
  statut_avant  public.statut_commande,
  statut_apres  public.statut_commande not null,
  origine_refus public.origine_refus,
  commentaire   text,
  auteur_id     uuid references auth.users (id) on delete set null,
  -- clock_timestamp() et non now() : plusieurs changements dans une même
  -- transaction gardent leur ordre réel.
  created_at    timestamptz not null default clock_timestamp(),
  unique (boutique_id, id),
  foreign key (boutique_id, commande_id)
    references public.commandes (boutique_id, id) on delete cascade
);

comment on column public.commande_evenements.auteur_id is
  'NULL = geste du système (confirmation automatique, rejeu). Renseigné = un membre de l''équipe.';

create index commande_evenements_commande_idx on public.commande_evenements (boutique_id, commande_id, created_at);

create trigger commande_evenements_boutique_immuable
  before update of boutique_id on public.commande_evenements
  for each row execute function private.boutique_immuable();

create function private.trace_statut_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.commande_evenements (boutique_id, commande_id, statut_avant, statut_apres, auteur_id)
    values (new.boutique_id, new.id, null, new.statut, auth.uid());
    return new;
  end if;

  if new.statut is distinct from old.statut then
    insert into public.commande_evenements
      (boutique_id, commande_id, statut_avant, statut_apres, origine_refus, commentaire, auteur_id)
    values (new.boutique_id, new.id, old.statut, new.statut, new.refus_origine,
            coalesce(new.refus_commentaire, new.motif_annulation), auth.uid());

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

-- BEFORE pour écrire les horodatages sur NEW ; AFTER à la création, quand
-- la ligne existe.
create trigger commandes_trace_statut_update
  before update on public.commandes
  for each row execute function private.trace_statut_commande();
create trigger commandes_trace_statut_insert
  after insert on public.commandes
  for each row execute function private.trace_statut_commande();


-- ---------------------------------------------------------------------
-- Compteurs de la fiche client
-- ---------------------------------------------------------------------
create function private.compte_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    update public.clients set nb_commandes = nb_commandes + 1
     where boutique_id = new.boutique_id and id = new.client_id;
  elsif new.statut = 'refusee' and old.statut is distinct from 'refusee'
        and new.refus_origine in ('client', 'injoignable') then
    update public.clients set nb_refus = nb_refus + 1
     where boutique_id = new.boutique_id and id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger commandes_compte_client_insert
  after insert on public.commandes
  for each row execute function private.compte_client();
create trigger commandes_compte_client_statut
  after update of statut on public.commandes
  for each row execute function private.compte_client();


-- ---------------------------------------------------------------------
-- Réservation du stock à la pose de la ligne (reprise de Maymar)
-- ---------------------------------------------------------------------
-- La base est la seule autorité du stock. Réserver à la pose de la ligne,
-- pas à la confirmation : en paiement à la livraison, la confirmation par
-- téléphone peut prendre un jour, on vendrait trois fois la dernière valise.
create function private.reserve_stock_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
set skanecom.ecriture_stock = 'on'
as $$
declare
  v_stock_apres integer;
  v_numero      text;
begin
  if new.variante_id is null then
    return new;   -- ligne libre (produit retiré du catalogue) : rien à réserver
  end if;

  -- L'UPDATE verrouille la variante : deux clients qui commandent la
  -- dernière pièce en même temps sont sérialisés ici. La clé composite de la
  -- ligne garantit que la variante est de la même boutique.
  update public.variantes
     set stock = stock - new.quantite
   where boutique_id = new.boutique_id and id = new.variante_id
     and stock >= new.quantite
  returning stock into v_stock_apres;

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
          'Commande ' || coalesce(v_numero, '?'), auth.uid());

  return new;
end;
$$;

create trigger commande_lignes_reserve_stock
  after insert on public.commande_lignes
  for each row execute function private.reserve_stock_ligne();


-- ---------------------------------------------------------------------
-- Retour en stock sur refus ou annulation (reprise de Maymar)
-- ---------------------------------------------------------------------
create function private.reintegre_stock_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
set skanecom.ecriture_stock = 'on'
as $$
declare
  v_ligne record;
  v_stock integer;
  v_motif public.motif_mouvement_stock;
begin
  if new.statut not in ('refusee', 'annulee') then return new; end if;
  if old.statut in ('refusee', 'annulee') then return new; end if;
  if new.stock_reintegre then return new; end if;

  v_motif := case when new.statut = 'refusee' then 'retour_refus' else 'annulation' end;

  for v_ligne in
    select l.variante_id, l.quantite from public.commande_lignes l
    where l.boutique_id = new.boutique_id and l.commande_id = new.id and l.variante_id is not null
  loop
    update public.variantes
       set stock = stock + v_ligne.quantite
     where boutique_id = new.boutique_id and id = v_ligne.variante_id
    returning stock into v_stock;

    insert into public.stock_mouvements
      (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
    values (new.boutique_id, v_ligne.variante_id, v_ligne.quantite, v_stock, v_motif, new.id,
            'Commande ' || new.numero || ' — ' || new.statut::text, auth.uid());
  end loop;

  update public.commandes set stock_reintegre = true
   where boutique_id = new.boutique_id and id = new.id;
  return new;
end;
$$;

create trigger commandes_reintegre_stock
  after update of statut on public.commandes
  for each row execute function private.reintegre_stock_commande();

revoke execute on function private.numerote_commande()        from public, anon, authenticated;
revoke execute on function private.trace_statut_commande()    from public, anon, authenticated;
revoke execute on function private.compte_client()            from public, anon, authenticated;
revoke execute on function private.reserve_stock_ligne()      from public, anon, authenticated;
revoke execute on function private.reintegre_stock_commande() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- RLS des commandes
-- ---------------------------------------------------------------------
alter table public.commandes           enable row level security;
alter table public.commande_lignes     enable row level security;
alter table public.commande_evenements enable row level security;

create policy "commandes: le client lit les siennes"
  on public.commandes for select using (client_id in (select private.mes_clients()));
create policy "commandes: l'équipe lit celles de sa boutique"
  on public.commandes for select using (boutique_id in (select private.mes_boutiques()));
create policy "commandes: l'équipe des commandes les fait avancer"
  on public.commandes for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin,confirmateur,preparateur}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin,confirmateur,preparateur}')));

create policy "lignes: le client lit celles de ses commandes"
  on public.commande_lignes for select
  using (exists (select 1 from public.commandes c
                 where c.boutique_id = commande_lignes.boutique_id and c.id = commande_lignes.commande_id
                   and c.client_id in (select private.mes_clients())));
create policy "lignes: l'équipe lit celles de sa boutique"
  on public.commande_lignes for select using (boutique_id in (select private.mes_boutiques()));

create policy "événements: le client lit ceux de ses commandes"
  on public.commande_evenements for select
  using (exists (select 1 from public.commandes c
                 where c.boutique_id = commande_evenements.boutique_id and c.id = commande_evenements.commande_id
                   and c.client_id in (select private.mes_clients())));
create policy "événements: l'équipe lit ceux de sa boutique"
  on public.commande_evenements for select using (boutique_id in (select private.mes_boutiques()));
-- Aucune policy UPDATE/DELETE sur les événements : l'historique est immuable.
