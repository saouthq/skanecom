-- =====================================================================
-- SkanEcom — 02 · RÉGLAGES ET LIVRAISON PAR BOUTIQUE
-- Réglages · gouvernorats (référentiel partagé) · zones de livraison ·
-- calcul des frais
-- 29/09/2026 — reprise de Maymar (socle, durcissement) : pièges 4 et 5 de
-- docs/cadrage/03-reprise-maymar.md §3 corrigés
-- =====================================================================


-- ---------------------------------------------------------------------
-- Réglages de chaque boutique
-- ---------------------------------------------------------------------
-- Une boutique ne stocke que les réglages qu'elle change ; les autres
-- prennent la valeur par défaut du catalogue (plateforme.reglages_catalogue).
-- Supprimer une ligne = revenir à la valeur par défaut, sans rien casser.
create table public.reglages (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  cle         text not null references plateforme.reglages_catalogue (cle) on delete cascade,
  valeur      jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (boutique_id, cle)
);

-- La valeur doit avoir le type annoncé par le catalogue : un « oui » écrit
-- "oui" au lieu de true casserait la vitrine sans que personne comprenne.
create function private.valide_reglage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def plateforme.reglages_catalogue;
  v_ok  boolean;
begin
  select * into v_def from plateforme.reglages_catalogue where cle = new.cle;
  if not found then
    raise exception 'Réglage inconnu : % (absent de plateforme.reglages_catalogue)', new.cle
      using errcode = 'foreign_key_violation';
  end if;

  v_ok := case v_def.type_valeur
    when 'booleen' then jsonb_typeof(new.valeur) = 'boolean'
    when 'entier'  then jsonb_typeof(new.valeur) = 'number'
                        and (new.valeur #>> '{}')::numeric = trunc((new.valeur #>> '{}')::numeric)
    when 'texte'   then jsonb_typeof(new.valeur) = 'string'
    when 'choix'   then jsonb_typeof(new.valeur) = 'string' and v_def.choix_possibles @> jsonb_build_array(new.valeur)
    when 'liste'   then jsonb_typeof(new.valeur) = 'array'
    when 'objet'   then jsonb_typeof(new.valeur) = 'object'
  end;

  if not coalesce(v_ok, false) then
    raise exception 'Valeur invalide pour le réglage % (type attendu : %) : %',
      new.cle, v_def.type_valeur, new.valeur
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger reglages_valide
  before insert or update on public.reglages
  for each row execute function private.valide_reglage();

create trigger reglages_boutique_immuable
  before update of boutique_id on public.reglages
  for each row execute function private.boutique_immuable();

revoke execute on function private.valide_reglage() from public, anon, authenticated;

alter table public.reglages enable row level security;

create policy "reglages: l'équipe lit ceux de sa boutique"
  on public.reglages for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "reglages: la gestion ajoute"
  on public.reglages for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "reglages: la gestion modifie"
  on public.reglages for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "reglages: la gestion revient au défaut"
  on public.reglages for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

-- Valeur effective d'un réglage pour une boutique : la sienne, sinon le
-- défaut du catalogue. Réservée aux fonctions de la base : elle lit aussi les
-- réglages internes, elle n'est donc accordée à aucun rôle de l'API.
create function private.reglage(p_boutique_id uuid, p_cle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.valeur from public.reglages r where r.boutique_id = p_boutique_id and r.cle = p_cle),
    (select c.defaut from plateforme.reglages_catalogue c where c.cle = p_cle)
  );
$$;

revoke execute on function private.reglage(uuid, text) from public, anon, authenticated;


-- Ce que la vitrine a besoin de savoir d'une boutique active : ses réglages
-- publics (valeurs effectives) et ses modules actifs. Rien d'autre.
create function public.configuration_publique(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reglages', coalesce((
      select jsonb_object_agg(c.cle, coalesce(r.valeur, c.defaut))
      from plateforme.reglages_catalogue c
      left join public.reglages r on r.boutique_id = b.id and r.cle = c.cle
      where c.public
        and (c.module is null or exists (
          select 1 from plateforme.modules_actifs ma
          where ma.boutique_id = b.id and ma.module = c.module and ma.actif))
    ), '{}'::jsonb),
    'modules', coalesce((
      select jsonb_agg(ma.module order by ma.module)
      from plateforme.modules_actifs ma
      where ma.boutique_id = b.id and ma.actif
    ), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.id = p_boutique_id and b.statut = 'active';
$$;

comment on function public.configuration_publique(uuid) is
  'Réglages publics et modules actifs d''une boutique active, pour la vitrine. NULL si la boutique n''est pas active.';

-- Tous les réglages d'une boutique, avec leur définition, pour l'écran
-- « Réglages » du backoffice. Réservé à son équipe.
create function public.reglages_boutique(p_boutique_id uuid)
returns table (
  cle             text,
  valeur          jsonb,
  defaut          jsonb,
  personnalise    boolean,
  type_valeur     text,
  choix_possibles jsonb,
  groupe          text,
  module          text,
  public          boolean,
  libelle_fr      text,
  libelle_ar      text,
  description_fr  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.cle, coalesce(r.valeur, c.defaut), c.defaut, r.cle is not null,
         c.type_valeur, c.choix_possibles, c.groupe, c.module, c.public,
         c.libelle_fr, c.libelle_ar, c.description_fr
  from plateforme.reglages_catalogue c
  left join public.reglages r on r.boutique_id = p_boutique_id and r.cle = c.cle
  where private.est_membre(p_boutique_id)
  order by c.groupe, c.position, c.cle;
$$;

revoke execute on function public.reglages_boutique(uuid) from public, anon;
grant  execute on function public.reglages_boutique(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- Gouvernorats : référentiel partagé par toutes les boutiques
-- ---------------------------------------------------------------------
-- Le rattachement d'un gouvernorat à une zone tarifaire, lui, est propre à
-- chaque boutique (zones_gouvernorats) : chez Maymar il était global.
create table public.gouvernorats (
  code     text primary key,
  nom_fr   text not null,
  nom_ar   text not null,
  actif    boolean not null default true,
  position smallint not null default 0
);

comment on table public.gouvernorats is
  'Les 24 gouvernorats tunisiens. Référentiel fermé, en lecture seule pour les boutiques.';

alter table public.gouvernorats enable row level security;

create policy "gouvernorats: lecture publique"
  on public.gouvernorats for select using (actif = true);
-- Aucune écriture par l'API : la liste des 24 gouvernorats ne s'invente pas.

insert into public.gouvernorats (code, nom_fr, nom_ar, position) values
  ('tunis',        'Tunis',        'تونس',        1),
  ('ariana',       'Ariana',       'أريانة',       2),
  ('ben-arous',    'Ben Arous',    'بن عروس',     3),
  ('manouba',      'Manouba',      'منوبة',        4),
  ('bizerte',      'Bizerte',      'بنزرت',        5),
  ('nabeul',       'Nabeul',       'نابل',         6),
  ('zaghouan',     'Zaghouan',     'زغوان',        7),
  ('beja',         'Béja',         'باجة',         8),
  ('jendouba',     'Jendouba',     'جندوبة',       9),
  ('kef',          'Le Kef',       'الكاف',       10),
  ('siliana',      'Siliana',      'سليانة',      11),
  ('sousse',       'Sousse',       'سوسة',        12),
  ('monastir',     'Monastir',     'المنستير',    13),
  ('mahdia',       'Mahdia',       'المهدية',     14),
  ('sfax',         'Sfax',         'صفاقس',       15),
  ('kairouan',     'Kairouan',     'القيروان',    16),
  ('kasserine',    'Kasserine',    'القصرين',     17),
  ('sidi-bouzid',  'Sidi Bouzid',  'سيدي بوزيد',  18),
  ('gabes',        'Gabès',        'قابس',        19),
  ('medenine',     'Médenine',     'مدنين',       20),
  ('tataouine',    'Tataouine',    'تطاوين',      21),
  ('gafsa',        'Gafsa',        'قفصة',        22),
  ('tozeur',       'Tozeur',       'توزر',        23),
  ('kebili',       'Kébili',       'قبلي',        24);


-- ---------------------------------------------------------------------
-- Zones de livraison de chaque boutique
-- ---------------------------------------------------------------------
create table public.zones_livraison (
  id              uuid primary key default gen_random_uuid(),
  boutique_id     uuid not null references plateforme.boutiques (id) on delete cascade,
  nom_fr          text,
  nom_ar          text,
  frais_millimes  bigint not null default 0 check (frais_millimes >= 0),
  delai_jours_min smallint check (delai_jours_min >= 0),
  delai_jours_max smallint check (delai_jours_max >= 0),
  actif           boolean not null default true,
  position        smallint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (boutique_id, id),
  constraint zones_nom_present check (coalesce(nom_fr, nom_ar) is not null),
  constraint zones_delai_coherent check (
    delai_jours_min is null or delai_jours_max is null or delai_jours_max >= delai_jours_min
  )
);

create index zones_livraison_boutique_idx on public.zones_livraison (boutique_id, position);

-- Un gouvernorat appartient à UNE zone, dans chaque boutique : la clé
-- primaire (boutique_id, gouvernorat_code) le garantit.
create table public.zones_gouvernorats (
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  gouvernorat_code text not null references public.gouvernorats (code) on delete restrict,
  zone_id          uuid not null,
  primary key (boutique_id, gouvernorat_code),
  foreign key (boutique_id, zone_id) references public.zones_livraison (boutique_id, id) on delete cascade
);

comment on column public.zones_gouvernorats.zone_id is
  'Supprimer une zone détache ses gouvernorats (ON DELETE CASCADE sur ce rattachement) : ils retombent sur le tarif fixe, jamais sur zéro.';

create index zones_gouvernorats_zone_idx on public.zones_gouvernorats (boutique_id, zone_id);

create trigger zones_livraison_updated_at
  before update on public.zones_livraison
  for each row execute function private.set_updated_at();
create trigger zones_livraison_boutique_immuable
  before update of boutique_id on public.zones_livraison
  for each row execute function private.boutique_immuable();
create trigger zones_gouvernorats_boutique_immuable
  before update of boutique_id on public.zones_gouvernorats
  for each row execute function private.boutique_immuable();

alter table public.zones_livraison    enable row level security;
alter table public.zones_gouvernorats enable row level security;

create policy "zones: lecture publique des zones actives"
  on public.zones_livraison for select
  using (actif and boutique_id in (select private.boutiques_visibles()));
create policy "zones: l'équipe lit tout"
  on public.zones_livraison for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "zones: la gestion ajoute"
  on public.zones_livraison for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "zones: la gestion modifie"
  on public.zones_livraison for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "zones: la gestion supprime"
  on public.zones_livraison for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));

create policy "zones_gouvernorats: lecture publique"
  on public.zones_gouvernorats for select
  using (boutique_id in (select private.boutiques_visibles()));
create policy "zones_gouvernorats: l'équipe lit tout"
  on public.zones_gouvernorats for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "zones_gouvernorats: la gestion ajoute"
  on public.zones_gouvernorats for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "zones_gouvernorats: la gestion modifie"
  on public.zones_gouvernorats for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "zones_gouvernorats: la gestion supprime"
  on public.zones_gouvernorats for delete
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));


-- ---------------------------------------------------------------------
-- Frais de livraison d'une boutique
-- ---------------------------------------------------------------------
-- SECURITY DEFINER : elle lit les réglages de la boutique, dont la table
-- n'est pas lisible par un visiteur. Elle ne renvoie qu'un montant.
create function public.frais_livraison_millimes(
  p_boutique_id          uuid,
  p_gouvernorat_code     text,
  p_sous_total_millimes  bigint default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fixe  bigint := (private.reglage(p_boutique_id, 'livraison.frais_fixes_millimes') #>> '{}')::bigint;
  v_seuil bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone  bigint;
begin
  if v_seuil > 0 and p_sous_total_millimes >= v_seuil then
    return 0;
  end if;

  if private.reglage(p_boutique_id, 'livraison.mode_frais') #>> '{}' = 'zone' then
    select z.frais_millimes into v_zone
    from public.zones_gouvernorats zg
    join public.zones_livraison z
      on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
    where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = p_gouvernorat_code;
  end if;

  return coalesce(v_zone, v_fixe);
end;
$$;

comment on function public.frais_livraison_millimes(uuid, text, bigint) is
  'Applique les réglages livraison.* de la boutique. En mode zone, un gouvernorat non rattaché retombe sur le tarif fixe plutôt que sur zéro : jamais de livraison gratuite par accident de configuration.';
