-- =====================================================================
-- SkanEcom — 27 · CATALOGUE B9 : LES FICHES TECHNIQUES
-- 29/09/2026 — PRD §6.2 B9 et §6.3 V2 ; étude 05 (D17, D19)
-- =====================================================================
--
-- L'acheteur d'outillage choisit sur des chiffres : puissance (W), tension
-- (V), couple (Nm), vitesse (tr/min), plateforme de batterie. Ces
-- caractéristiques ne sont pas des déclinaisons (une perceuse a un seul
-- couple, quelle que soit sa version) : elles décrivent le PRODUIT.
--
-- La boutique définit ses caractéristiques (public.attributs) : un nom, une
-- unité, nombre ou texte, filtrable ou non, montrée ou non sur la carte du
-- produit ; elle les rattache à ses rayons (public.rayon_attributs : un
-- attribut du rayon « Outillage » vaut pour « Perceuses », son sous-rayon).
-- Chaque produit porte ses valeurs (produits.caracteristiques : {"tension":
-- "18", "plateforme": "18 V XR"}), vérifiées par la base.
--
-- Dans le catalogue de la vitrine (public.liste_produits), une
-- caractéristique filtrable se comporte comme un axe de variante que
-- chaque déclinaison hériterait de son produit : mêmes filtres dans
-- l'adresse (/categorie/perceuses/tension=18~54), mêmes facettes, mêmes
-- comptes. Les nombres se trient comme des nombres. La fiche produit les
-- lit dans public.vitrine_produits (colonne caracteristiques), dans l'ordre
-- voulu par la boutique.

create table public.attributs (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  cle         text not null check (cle ~ '^[a-z0-9_]{1,40}$'),
  label_fr    text not null check (char_length(btrim(label_fr)) between 1 and 60),
  label_ar    text check (label_ar is null or char_length(label_ar) <= 60),
  unite       text check (unite is null or char_length(unite) between 1 and 12),
  type        text not null default 'texte' check (type in ('texte', 'nombre')),
  filtrable   boolean not null default true,
  en_carte    boolean not null default false,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, cle)
);

comment on table public.attributs is
  'Les caractéristiques techniques d''une boutique (puissance, tension…) : unité, type, filtrable, montrée sur la carte (B9).';

create table public.rayon_attributs (
  boutique_id  uuid not null references plateforme.boutiques (id) on delete cascade,
  categorie_id uuid not null,
  attribut_id  uuid not null,
  primary key (boutique_id, categorie_id, attribut_id),
  foreign key (boutique_id, categorie_id) references public.categories (boutique_id, id) on delete cascade,
  foreign key (boutique_id, attribut_id) references public.attributs (boutique_id, id) on delete cascade
);

comment on table public.rayon_attributs is
  'Les rayons d''une caractéristique : elle vaut pour eux et leurs sous-rayons (aucun rayon : pour tout le catalogue).';

alter table public.produits add column caracteristiques jsonb not null default '{}'::jsonb
  check (jsonb_typeof(caracteristiques) = 'object');

comment on column public.produits.caracteristiques is
  'Les valeurs des caractéristiques du produit, par clé d''attribut : {"tension": "18"}. Un nombre s''écrit avec un point.';

create trigger attributs_updated_at before update on public.attributs
  for each row execute function private.set_updated_at();
create trigger attributs_boutique_immuable before update of boutique_id on public.attributs
  for each row execute function private.boutique_immuable();
create trigger rayon_attributs_boutique_immuable before update of boutique_id on public.rayon_attributs
  for each row execute function private.boutique_immuable();

create index produits_caracteristiques_idx on public.produits using gin (caracteristiques);


-- ---------------------------------------------------------------------
-- La base vérifie chaque valeur : une caractéristique connue, un texte de
-- 80 caractères au plus, un nombre pour un attribut « nombre ».
-- ---------------------------------------------------------------------
create function private.valide_caracteristiques()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  a public.attributs;
begin
  for e in select * from jsonb_each(new.caracteristiques) loop
    select * into a from public.attributs x where x.boutique_id = new.boutique_id and x.cle = e.key;
    if a.id is null then
      raise exception 'Caractéristique inconnue : %', e.key using errcode = 'check_violation', hint = 'caracteristique';
    end if;
    if jsonb_typeof(e.value) <> 'string' or char_length(btrim(e.value #>> '{}')) not between 1 and 80 then
      raise exception '« % » : un texte de 80 caractères au plus', a.label_fr using errcode = 'check_violation', hint = 'caracteristique';
    end if;
    if a.type = 'nombre' and (e.value #>> '{}') !~ '^-?[0-9]{1,9}(\.[0-9]{1,4})?$' then
      raise exception '« % » attend un nombre (18, 2,5…)', a.label_fr using errcode = 'check_violation', hint = 'nombre';
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function private.valide_caracteristiques() from public, anon, authenticated;

create trigger produits_valide_caracteristiques before insert or update of caracteristiques on public.produits
  for each row execute function private.valide_caracteristiques();


-- ---------------------------------------------------------------------
-- RLS : la vitrine lit les définitions des boutiques ouvertes, l'équipe
-- celles de sa boutique ; on n'écrit que par les fonctions ci-dessous.
-- ---------------------------------------------------------------------
alter table public.attributs       enable row level security;
alter table public.rayon_attributs enable row level security;

create policy "attributs: lecture publique"
  on public.attributs for select
  using (boutique_id in (select private.boutiques_visibles()));
create policy "attributs: l'équipe lit tout"
  on public.attributs for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "rayon_attributs: lecture publique"
  on public.rayon_attributs for select
  using (boutique_id in (select private.boutiques_visibles()));
create policy "rayon_attributs: l'équipe lit tout"
  on public.rayon_attributs for select
  using (boutique_id in (select private.mes_boutiques()));

revoke insert, update, delete, truncate on public.attributs       from anon, authenticated;
revoke insert, update, delete, truncate on public.rayon_attributs from anon, authenticated;


-- ---------------------------------------------------------------------
-- Le backoffice : définir, ranger, retirer
-- ---------------------------------------------------------------------

-- Les caractéristiques de la boutique, avec leurs rayons et le nombre de
-- produits qui en portent une valeur.
create function public.gestion_attributs(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'cle', a.cle, 'label', a.label_fr, 'unite', a.unite, 'type', a.type,
             'filtrable', a.filtrable, 'en_carte', a.en_carte, 'position', a.position,
             'rayons', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nom', coalesce(c.nom_fr, c.nom_ar)) order by c.position, c.nom_fr)
                                   from public.rayon_attributs ra
                                   join public.categories c on c.boutique_id = ra.boutique_id and c.id = ra.categorie_id
                                  where ra.boutique_id = a.boutique_id and ra.attribut_id = a.id), '[]'::jsonb),
             'produits', (select count(*) from public.produits p where p.boutique_id = a.boutique_id and p.caracteristiques ? a.cle))
           order by a.position, a.label_fr)
      from public.attributs a
     where a.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

-- Créer (p_id null) ou modifier une caractéristique. Sa clé (celle de
-- l'adresse des filtres) se fixe à la création et ne change plus : une
-- liste filtrée partagée par WhatsApp reste valable.
create function public.gestion_enregistrer_attribut(
  p_boutique_id uuid,
  p_id          uuid,
  p_cle         text,
  p_label       text,
  p_unite       text,
  p_type        text,
  p_filtrable   boolean,
  p_en_carte    boolean,
  p_rayons      uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_label  text := btrim(coalesce(p_label, ''));
  v_unite  text := nullif(btrim(coalesce(p_unite, '')), '');
  v_rayons uuid[] := coalesce(p_rayons, '{}');
  v_a      public.attributs;
  v_id     uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if char_length(v_label) not between 1 and 60 then
    raise exception 'Le nom de la caractéristique est obligatoire (60 caractères au plus)' using errcode = 'check_violation', hint = 'label';
  end if;
  if v_unite is not null and char_length(v_unite) > 12 then
    raise exception 'L''unité compte 12 caractères au plus (W, V, Nm, tr/min…)' using errcode = 'check_violation', hint = 'unite';
  end if;
  if p_type is null or p_type not in ('texte', 'nombre') then
    raise exception 'Type inconnu : un nombre, ou un texte' using errcode = 'check_violation', hint = 'type';
  end if;
  if exists (select 1 from unnest(v_rayons) r
              where not exists (select 1 from public.categories c where c.boutique_id = p_boutique_id and c.id = r)) then
    raise exception 'Rayon inconnu' using errcode = 'check_violation', hint = 'rayon';
  end if;

  if p_id is null then
    if p_cle is null or p_cle !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'Ce nom ne donne pas de clé utilisable : ajoutez-y des lettres' using errcode = 'check_violation', hint = 'label';
    end if;
    if exists (select 1 from public.attributs a where a.boutique_id = p_boutique_id and a.cle = p_cle) then
      raise exception 'Une caractéristique porte déjà ce nom' using errcode = 'check_violation', hint = 'cle';
    end if;
    if (select count(*) from public.attributs a where a.boutique_id = p_boutique_id) >= 60 then
      raise exception 'Soixante caractéristiques au plus par boutique' using errcode = 'check_violation', hint = 'trop';
    end if;
    insert into public.attributs (boutique_id, cle, label_fr, unite, type, filtrable, en_carte, position)
    values (p_boutique_id, p_cle, v_label, v_unite, p_type, coalesce(p_filtrable, true), coalesce(p_en_carte, false),
            (select coalesce(max(a.position) + 1, 0) from public.attributs a where a.boutique_id = p_boutique_id))
    returning id into v_id;
  else
    select * into v_a from public.attributs a where a.boutique_id = p_boutique_id and a.id = p_id for update;
    if v_a.id is null then
      raise exception 'Caractéristique introuvable' using errcode = 'no_data_found', hint = 'attribut';
    end if;
    if p_type = 'nombre' and v_a.type <> 'nombre' and exists (
      select 1 from public.produits p
       where p.boutique_id = p_boutique_id and p.caracteristiques ? v_a.cle
         and (p.caracteristiques ->> v_a.cle) !~ '^-?[0-9]{1,9}(\.[0-9]{1,4})?$') then
      raise exception 'Des produits portent pour « % » des valeurs qui ne sont pas des nombres : corrigez-les d''abord', v_a.label_fr
        using errcode = 'check_violation', hint = 'type';
    end if;
    update public.attributs set label_fr = v_label, unite = v_unite, type = p_type,
           filtrable = coalesce(p_filtrable, true), en_carte = coalesce(p_en_carte, false)
     where boutique_id = p_boutique_id and id = p_id;
    v_id := p_id;
  end if;

  delete from public.rayon_attributs ra where ra.boutique_id = p_boutique_id and ra.attribut_id = v_id and ra.categorie_id <> all (v_rayons);
  insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
  select p_boutique_id, r, v_id from unnest(v_rayons) r
  on conflict do nothing;
  return v_id;
end;
$$;

-- Monter (-1) ou descendre (+1) une caractéristique : l'ordre de la fiche
-- technique et des filtres.
create function public.gestion_deplacer_attribut(p_boutique_id uuid, p_id uuid, p_sens integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_i   integer;
  v_j   integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select array_agg(a.id order by a.position, a.label_fr, a.id) into v_ids
    from public.attributs a where a.boutique_id = p_boutique_id;
  v_i := array_position(v_ids, p_id);
  if v_i is null then
    raise exception 'Caractéristique introuvable' using errcode = 'no_data_found', hint = 'attribut';
  end if;
  v_j := v_i + sign(coalesce(p_sens, 0))::integer;
  if v_j >= 1 and v_j <= cardinality(v_ids) and v_j <> v_i then
    v_ids[v_i] := v_ids[v_j];
    v_ids[v_j] := p_id;
  end if;
  update public.attributs a set position = o.n - 1
    from unnest(v_ids) with ordinality o(id, n)
   where a.boutique_id = p_boutique_id and a.id = o.id and a.position <> o.n - 1;
end;
$$;

-- Retirer une caractéristique : ses valeurs quittent les produits.
create function public.gestion_retirer_attribut(p_boutique_id uuid, p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.attributs;
  v_n integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_a from public.attributs a where a.boutique_id = p_boutique_id and a.id = p_id for update;
  if v_a.id is null then
    raise exception 'Caractéristique introuvable' using errcode = 'no_data_found', hint = 'attribut';
  end if;
  update public.produits p set caracteristiques = p.caracteristiques - v_a.cle
   where p.boutique_id = p_boutique_id and p.caracteristiques ? v_a.cle;
  get diagnostics v_n = row_count;
  delete from public.attributs a where a.boutique_id = p_boutique_id and a.id = p_id;
  return v_n;
end;
$$;


-- ---------------------------------------------------------------------
-- La fiche technique d'un produit, au backoffice
-- ---------------------------------------------------------------------

-- Les caractéristiques à remplir : celles de son rayon et de ses rayons
-- parents, celles de tout le catalogue (sans rayon), et celles qui ont déjà
-- une valeur ; chacune avec sa valeur.
create function public.gestion_fiche_technique(p_boutique_id uuid, p_produit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p public.produits;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_p from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id;
  if v_p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'version', v_p.updated_at,
    'attributs', coalesce((
      with recursive parents as (
        select c.id, c.parent_id from public.categories c where c.boutique_id = p_boutique_id and c.id = v_p.categorie_id
        union
        select c.id, c.parent_id from public.categories c join parents x on c.id = x.parent_id where c.boutique_id = p_boutique_id
      )
      select jsonb_agg(jsonb_build_object('id', a.id, 'cle', a.cle, 'label', a.label_fr, 'unite', a.unite, 'type', a.type,
                                          'valeur', v_p.caracteristiques ->> a.cle)
                       order by a.position, a.label_fr)
        from public.attributs a
       where a.boutique_id = p_boutique_id
         and (v_p.caracteristiques ? a.cle
              or not exists (select 1 from public.rayon_attributs ra where ra.boutique_id = a.boutique_id and ra.attribut_id = a.id)
              or exists (select 1 from public.rayon_attributs ra
                          where ra.boutique_id = a.boutique_id and ra.attribut_id = a.id and ra.categorie_id in (select id from parents)))
    ), '[]'::jsonb));
end;
$$;

-- Enregistrer la fiche technique : {"cle": "valeur"} ; une valeur vide
-- retire la caractéristique du produit. Les nombres s'écrivent 2,5 ou 2.5,
-- l'unité saisie par habitude (« 18 V ») est ôtée.
create function public.gestion_enregistrer_caracteristiques(
  p_boutique_id uuid,
  p_produit_id  uuid,
  p_version     timestamptz,
  p_valeurs     jsonb
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p      public.produits;
  v_car    jsonb;
  e        record;
  a        public.attributs;
  v_valeur text;
  v_maj    timestamptz;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_valeurs is null or jsonb_typeof(p_valeurs) <> 'object' then
    raise exception 'Valeurs illisibles' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_p from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id for update;
  if v_p.id is null then
    raise exception 'Produit introuvable' using errcode = 'no_data_found', hint = 'produit';
  end if;
  if p_version is not null and v_p.updated_at <> p_version then
    raise exception 'La fiche a été modifiée entre-temps' using errcode = 'check_violation', hint = 'change';
  end if;

  v_car := v_p.caracteristiques;
  for e in select * from jsonb_each_text(p_valeurs) loop
    select * into a from public.attributs x where x.boutique_id = p_boutique_id and x.cle = e.key;
    if a.id is null then
      raise exception 'Caractéristique inconnue : %', e.key using errcode = 'check_violation', hint = 'caracteristique';
    end if;
    v_valeur := regexp_replace(btrim(coalesce(e.value, '')), '\s+', ' ', 'g');
    if a.unite is not null then
      v_valeur := btrim(regexp_replace(v_valeur, '\s*' || regexp_replace(a.unite, '([^[:alnum:]])', '\\\1', 'g') || '$', '', 'i'));
    end if;
    if a.type = 'nombre' then
      v_valeur := replace(replace(v_valeur, ' ', ''), ',', '.');
    end if;
    if v_valeur = '' then
      v_car := v_car - e.key;
    else
      v_car := v_car || jsonb_build_object(e.key, v_valeur);
    end if;
  end loop;

  update public.produits set caracteristiques = v_car
   where boutique_id = p_boutique_id and id = p_produit_id
  returning updated_at into v_maj;
  return v_maj;
end;
$$;

revoke execute on function public.gestion_attributs(uuid)                                                        from public, anon;
revoke execute on function public.gestion_enregistrer_attribut(uuid, uuid, text, text, text, text, boolean, boolean, uuid[]) from public, anon;
revoke execute on function public.gestion_deplacer_attribut(uuid, uuid, integer)                                 from public, anon;
revoke execute on function public.gestion_retirer_attribut(uuid, uuid)                                           from public, anon;
revoke execute on function public.gestion_fiche_technique(uuid, uuid)                                            from public, anon;
revoke execute on function public.gestion_enregistrer_caracteristiques(uuid, uuid, timestamptz, jsonb)           from public, anon;
grant  execute on function public.gestion_attributs(uuid)                                                        to authenticated, service_role;
grant  execute on function public.gestion_enregistrer_attribut(uuid, uuid, text, text, text, text, boolean, boolean, uuid[]) to authenticated, service_role;
grant  execute on function public.gestion_deplacer_attribut(uuid, uuid, integer)                                 to authenticated, service_role;
grant  execute on function public.gestion_retirer_attribut(uuid, uuid)                                           to authenticated, service_role;
grant  execute on function public.gestion_fiche_technique(uuid, uuid)                                            to authenticated, service_role;
grant  execute on function public.gestion_enregistrer_caracteristiques(uuid, uuid, timestamptz, jsonb)           to authenticated, service_role;


-- ---------------------------------------------------------------------
-- La vitrine : la fiche technique d'un produit, dans l'ordre de la boutique
-- ---------------------------------------------------------------------
create or replace view public.vitrine_produits
with (security_invoker = true) as
select
  p.boutique_id, p.id, p.slug, p.nom_fr, p.nom_ar, p.description_fr, p.description_ar,
  p.marque, p.mis_en_avant, p.position, p.created_at, p.meta_titre_fr, p.meta_description_fr,
  (select jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'slug', c.slug, 'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar)
     from public.categories c
    where c.boutique_id = p.boutique_id and c.id = p.categorie_id and c.actif) as categorie,
  coalesce((select jsonb_agg(jsonb_build_object('cle', o.cle, 'label_fr', o.label_fr, 'label_ar', o.label_ar)
                             order by o.position, o.cle)
              from public.produit_options o
             where o.boutique_id = p.boutique_id and o.produit_id = p.id), '[]'::jsonb) as options,
  coalesce((select jsonb_agg(jsonb_build_object(
                     'id', v.id, 'sku', v.sku, 'options', v.options,
                     'prix_millimes', v.prix_millimes, 'prix_barre_millimes', v.prix_barre_millimes,
                     'stock', v.stock, 'seuil_alerte_stock', v.seuil_alerte_stock,
                     'poids_grammes', v.poids_grammes, 'image_chemin', v.image_chemin)
                   order by v.position, v.sku)
              from public.variantes v
             where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif), '[]'::jsonb) as variantes,
  coalesce((select jsonb_agg(jsonb_build_object('chemin', i.chemin, 'variante_id', i.variante_id,
                                                'alt_fr', i.alt_fr, 'alt_ar', i.alt_ar)
                             order by i.position, i.chemin)
              from public.produit_images i
             where i.boutique_id = p.boutique_id and i.produit_id = p.id), '[]'::jsonb) as images,
  coalesce((select jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar,
                                                'unite', a.unite, 'type', a.type, 'en_carte', a.en_carte,
                                                'valeur', p.caracteristiques ->> a.cle)
                             order by a.position, a.label_fr)
              from public.attributs a
             where a.boutique_id = p.boutique_id and p.caracteristiques ? a.cle), '[]'::jsonb) as caracteristiques
from public.produits p
where p.publie;

comment on view public.vitrine_produits is
  'Un produit publié avec son rayon, ses axes, ses variantes actives, ses photos et sa fiche technique, en une ligne. Lue par la fiche produit (filtrer par boutique_id ET slug) et par public.liste_produits.';


-- ---------------------------------------------------------------------
-- Le catalogue filtré : les caractéristiques filtrables comme des axes
-- ---------------------------------------------------------------------
-- Reprise de la migration 05 ; ce qui change :
--   · chaque déclinaison hérite des caractéristiques FILTRABLES de son
--     produit (une option de la déclinaison du même nom l'emporte), si
--     bien que filtres, facettes et comptes les traitent comme des axes ;
--   · la facette des axes les donne d'abord (dans l'ordre de la boutique),
--     avant les axes de variante, avec leur unité et leur type ; les
--     valeurs d'un nombre se trient comme des nombres ;
--   · la recherche lit aussi les valeurs des caractéristiques.
create or replace function public.liste_produits(
  p_boutique_id uuid,
  p_filtres     jsonb   default '{}'::jsonb,
  p_tri         text    default 'nouveautes',
  p_page        integer default 1,
  p_par_page    integer default 24
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_options  jsonb   := coalesce(p_filtres -> 'options', '{}'::jsonb);
  v_en_stock boolean := coalesce((p_filtres ->> 'en_stock')::boolean, false);
  v_min      bigint  := (p_filtres ->> 'prix_min')::bigint;
  v_max      bigint  := (p_filtres ->> 'prix_max')::bigint;
  v_rayon    text    := nullif(btrim(p_filtres ->> 'rayon'), '');
  v_q        text    := nullif(left(btrim(coalesce(p_filtres ->> 'q', '')), 80), '');
  v_tri      text    := case when p_tri in ('nouveautes', 'selection', 'prix-asc', 'prix-desc', 'nom', 'pertinence')
                             then p_tri else 'nouveautes' end;
  v_par_page integer := least(greatest(coalesce(p_par_page, 24), 1), 100);
  v_page     integer := greatest(coalesce(p_page, 1), 1);
  v_motif    text;
  v_resultat jsonb;
begin
  if jsonb_typeof(v_options) <> 'object' then
    raise exception 'filtres.options : un objet {"axe": ["valeur", …]} est attendu'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Une valeur seule vaut une liste d'une valeur.
  select coalesce(jsonb_object_agg(e.key, case jsonb_typeof(e.value) when 'array' then e.value
                                                                      else jsonb_build_array(e.value) end), '{}'::jsonb)
    into v_options
    from jsonb_each(v_options) e;
  -- Les jokers de LIKE saisis par le visiteur sont pris au pied de la lettre.
  v_motif := case when v_q is null then null
                  else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with recursive
  rayon as (
    select c.id from public.categories c
     where c.boutique_id = p_boutique_id and c.slug = v_rayon and c.actif
    union
    select c.id from public.categories c join rayon r on c.parent_id = r.id
     where c.boutique_id = p_boutique_id and c.actif
  ),
  filtrables as (
    select a.cle, a.label_fr, a.label_ar, a.unite, a.type, a.position
      from public.attributs a
     where a.boutique_id = p_boutique_id and a.filtrable
  ),
  produits_q as (
    select p.id, p.categorie_id, p.created_at, p.position, p.mis_en_avant,
           lower(coalesce(p.nom_fr, p.nom_ar)) as nom,
           coalesce((select jsonb_object_agg(f.cle, p.caracteristiques -> f.cle)
                       from filtrables f where p.caracteristiques ? f.cle), '{}'::jsonb) as herite,
           case when v_q is null then 0::real
                else greatest(
                       extensions.similarity(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, ''), v_q),
                       case when exists (select 1 from public.variantes v
                                          where v.boutique_id = p.boutique_id and v.produit_id = p.id
                                            and v.actif and v.sku ilike v_motif) then 1 else 0 end)
           end as pertinence
      from public.produits p
     where p.boutique_id = p_boutique_id and p.publie
       and (v_q is null
            or (coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) ilike v_motif
            or (coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) operator(extensions.%) v_q
            or to_tsvector('french', coalesce(p.nom_fr, '') || ' ' || coalesce(p.marque, '') || ' ' || coalesce(p.description_fr, ''))
               @@ websearch_to_tsquery('french', v_q)
            or exists (select 1 from jsonb_each_text(p.caracteristiques) c where c.value ilike v_motif)
            or exists (select 1 from public.variantes v
                        where v.boutique_id = p.boutique_id and v.produit_id = p.id
                          and v.actif and v.sku ilike v_motif))
  ),
  dans_rayon as (
    select * from produits_q where v_rayon is null or categorie_id in (select id from rayon)
  ),
  variantes_q as (
    select v.produit_id, pq.herite || v.options as options, v.prix_millimes, v.position,
           (not v_en_stock or v.stock > 0)
           and (v_min is null or v.prix_millimes >= v_min)
           and (v_max is null or v.prix_millimes <= v_max) as ok_base
      from public.variantes v
      join produits_q pq on pq.id = v.produit_id
     where v.boutique_id = p_boutique_id and v.actif
  ),
  -- Produits retenus par les critères de variante, rayon non compris (il
  -- sert à la facette des rayons).
  retenus_tous as (
    select distinct vq.produit_id
      from variantes_q vq
     where vq.ok_base
       and not exists (select 1 from jsonb_each(v_options) f
                        where not coalesce(f.value ? (vq.options ->> f.key), false))
  ),
  retenus as (
    select d.* from dans_rayon d where d.id in (select produit_id from retenus_tous)
  ),
  ordonnes as (
    select r.id,
           row_number() over (order by
             case when v_tri = 'selection'  then r.mis_en_avant end desc nulls last,
             case when v_tri = 'prix-asc'   then pp.prix end asc  nulls last,
             case when v_tri = 'prix-desc'  then pp.prix end desc nulls last,
             case when v_tri = 'nom'        then r.nom end asc,
             case when v_tri = 'pertinence' then r.pertinence end desc,
             case when v_tri in ('nouveautes', 'selection', 'pertinence') then r.created_at end desc,
             r.position, r.id) as n
      from retenus r
      left join (select produit_id, min(prix_millimes) as prix from variantes_q group by produit_id) pp
        on pp.produit_id = r.id
  ),
  page as (
    select id, n from ordonnes
     where n > (v_page - 1) * v_par_page and n <= v_page * v_par_page
  ),
  valeurs as (
    select o.key as cle, o.value as valeur, min(vq.position) as rang
      from variantes_q vq
      join dans_rayon d on d.id = vq.produit_id
     cross join lateral jsonb_each_text(vq.options) o
     group by o.key, o.value
  ),
  comptes as (
    select o.key as cle, o.value as valeur, count(distinct vq.produit_id) as compte
      from variantes_q vq
      join dans_rayon d on d.id = vq.produit_id
     cross join lateral jsonb_each_text(vq.options) o
     where vq.ok_base
       and not exists (select 1 from jsonb_each(v_options) f
                        where f.key <> o.key and not coalesce(f.value ? (vq.options ->> f.key), false))
     group by o.key, o.value
  ),
  facette_rayons as (
    select c.slug, c.nom_fr, c.nom_ar, min(c.position) as position, count(*) as compte
      from produits_q p
      join retenus_tous rt on rt.produit_id = p.id
      join public.categories c on c.boutique_id = p_boutique_id and c.id = p.categorie_id and c.actif
     group by c.slug, c.nom_fr, c.nom_ar
  ),
  -- Les axes présents dans le rayon : les caractéristiques filtrables (dans
  -- l'ordre de la boutique), puis ceux des variantes (dans l'ordre des
  -- fiches). Un nom porté par les deux n'apparaît qu'une fois, en
  -- caractéristique.
  axes as (
    select distinct on (x.cle) x.*
      from (select o.cle, min(o.label_fr) as label_fr, min(o.label_ar) as label_ar,
                   null::text as unite, null::text as type, 1 as groupe, min(o.position)::integer as position
              from public.produit_options o
             where o.boutique_id = p_boutique_id and o.produit_id in (select id from dans_rayon)
             group by o.cle
            union all
            select f.cle, f.label_fr, f.label_ar, f.unite, f.type, 0, f.position
              from filtrables f
             where exists (select 1 from dans_rayon d where d.herite ? f.cle)) x
     order by x.cle, x.groupe
  )
  select jsonb_build_object(
    'total', (select count(*) from retenus),
    'page', v_page,
    'par_page', v_par_page,
    'produits', coalesce((
      select jsonb_agg(to_jsonb(vp) - 'boutique_id' order by pg.n)
        from page pg
        join public.vitrine_produits vp on vp.boutique_id = p_boutique_id and vp.id = pg.id), '[]'::jsonb),
    'facettes', jsonb_build_object(
      'axes', coalesce((
        select jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar,
                                            'unite', a.unite, 'type', a.type)
                         order by a.groupe, a.position, a.cle)
          from axes a), '[]'::jsonb),
      'options', coalesce((
        select jsonb_object_agg(x.cle, x.valeurs)
          from (select v.cle,
                       jsonb_agg(jsonb_build_object('valeur', v.valeur, 'compte', coalesce(c.compte, 0))
                                 order by case when a.type = 'nombre' and v.valeur ~ '^-?[0-9]{1,9}(\.[0-9]{1,4})?$'
                                               then v.valeur::numeric end nulls last,
                                          v.rang, v.valeur) as valeurs
                  from valeurs v
                  left join comptes c using (cle, valeur)
                  left join axes a on a.cle = v.cle
                 group by v.cle) x), '{}'::jsonb),
      'rayons', coalesce((
        select jsonb_agg(jsonb_build_object('slug', slug, 'nom_fr', nom_fr, 'nom_ar', nom_ar, 'compte', compte)
                         order by position, slug)
          from facette_rayons), '[]'::jsonb),
      'prix', (select case when count(*) = 0 then null
                           else jsonb_build_object('min', min(vq.prix_millimes), 'max', max(vq.prix_millimes)) end
                 from variantes_q vq where vq.produit_id in (select id from dans_rayon))
    )
  ) into v_resultat;

  return v_resultat;
end;
$$;

comment on function public.liste_produits(uuid, jsonb, text, integer, integer) is
  'Catalogue public d''une boutique : filtres sur n''importe quel axe de variante ou caractéristique filtrable, rayon et sous-rayons, stock, prix, recherche (nom, marque, description, caractéristiques, SKU, fautes de frappe) ; tri, pagination, facettes. Sous la RLS de l''appelant.';
