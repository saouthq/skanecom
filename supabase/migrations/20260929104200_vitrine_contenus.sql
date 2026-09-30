-- =====================================================================
-- SkanEcom — 43 · VITRINE COMPLÈTE : PAGES, RÉSEAUX, SUIVI SANS COMPTE
-- =====================================================================
-- Ce qu'une vraie boutique a, en plus de son catalogue (feuille de route B) :
--
-- 1. SES PAGES : « À propos », « Questions fréquentes », « Livraison et
--    retours », « Guide des tailles »… écrites au backoffice (un titre, un
--    texte en paragraphes simples), en brouillon ou publiées, au pied de page
--    ou non, servies à leur adresse (/a-propos). Une page « questions » se
--    lit en accordéon : chaque intertitre est une question.
-- 2. SES RÉSEAUX ET SON CONTACT : Instagram, Facebook, TikTok, les horaires
--    du service client (réglages publics) ; le bouton WhatsApp sur toutes
--    les pages ; une annonce en tête du site.
-- 3. LE SUIVI D'UNE COMMANDE SANS COMPTE : son numéro et le téléphone qui
--    l'a passée suffisent. Les essais manqués sont comptés, par numéro et par
--    téléphone : on ne devine pas les commandes des autres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les réglages
-- ---------------------------------------------------------------------
insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('contact.instagram', 'texte', null, '""', 'vitrine', null, true,
     'Instagram', 'Le compte de la boutique : « @maison.selma » ou l''adresse du profil. Au pied de page et sur la page Contact.', 40),
  ('contact.facebook', 'texte', null, '""', 'vitrine', null, true,
     'Facebook', 'La page de la boutique : son nom (facebook.com/…) ou son adresse.', 41),
  ('contact.tiktok', 'texte', null, '""', 'vitrine', null, true,
     'TikTok', 'Le compte de la boutique : « @maison.selma » ou l''adresse du profil.', 42),
  ('contact.horaires', 'texte', null, '""', 'vitrine', null, true,
     'Horaires du service client', 'Exemple : « Du lundi au samedi, de 9 h à 19 h ». Sur la page Contact.', 43),
  ('vitrine.whatsapp_flottant', 'booleen', null, 'false', 'vitrine', null, true,
     'Bouton WhatsApp sur toutes les pages', 'Un bouton rond en bas de l''écran ouvre la conversation avec le numéro WhatsApp de la boutique.', 44),
  ('vitrine.annonce', 'texte', null, '""', 'vitrine', null, true,
     'Annonce en tête du site', 'Une phrase courte en tête de toutes les pages, 140 caractères au plus (« La collection d''été est arrivée »). Vide : les faits de service.', 45);

-- Des comptes qui se lisent comme des comptes, des textes courts : bornés ici,
-- pour toute écriture (backoffice comme console).
create function private.valide_reglages_vitrine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := btrim(coalesce(new.valeur #>> '{}', ''));
begin
  if jsonb_typeof(new.valeur) <> 'string' or v = '' then
    return new;
  end if;
  if new.cle = 'vitrine.annonce' and char_length(v) > 140 then
    raise exception 'Annonce trop longue (140 caractères au plus)' using errcode = 'check_violation', hint = 'limite';
  end if;
  if new.cle = 'contact.horaires' and char_length(v) > 160 then
    raise exception 'Horaires trop longs (160 caractères au plus)' using errcode = 'check_violation', hint = 'limite';
  end if;
  if new.cle = 'contact.instagram'
     and v !~ '^@?[A-Za-z0-9._]{1,30}$' and v !~* '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$' then
    raise exception 'Compte Instagram illisible : « @compte » ou l''adresse du profil' using errcode = 'check_violation', hint = 'reseau';
  end if;
  if new.cle = 'contact.tiktok'
     and v !~ '^@?[A-Za-z0-9._]{1,30}$' and v !~* '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._]{1,30}/?$' then
    raise exception 'Compte TikTok illisible : « @compte » ou l''adresse du profil' using errcode = 'check_violation', hint = 'reseau';
  end if;
  if new.cle = 'contact.facebook'
     and v !~ '^[A-Za-z0-9.\-]{1,80}$' and v !~* '^https://([a-z]+\.)?facebook\.com/[^[:space:]<>"]{1,200}$' then
    raise exception 'Page Facebook illisible : son nom ou son adresse (https://facebook.com/…)' using errcode = 'check_violation', hint = 'reseau';
  end if;
  return new;
end;
$$;

-- Après private.valide_reglage (ordre alphabétique des triggers) : le type
-- est déjà vérifié quand la forme l'est.
create trigger reglages_valide_vitrine
  before insert or update on public.reglages
  for each row when (new.cle in ('contact.instagram', 'contact.facebook', 'contact.tiktok', 'contact.horaires', 'vitrine.annonce'))
  execute function private.valide_reglages_vitrine();

revoke execute on function private.valide_reglages_vitrine() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Les pages de la boutique
-- ---------------------------------------------------------------------
create table public.pages_boutique (
  id           uuid primary key default gen_random_uuid(),
  boutique_id  uuid not null references plateforme.boutiques (id) on delete cascade,
  slug         text not null,
  -- « texte » : des paragraphes ; « questions » : chaque intertitre est une
  -- question, le texte qui le suit sa réponse (un accordéon dans la vitrine).
  genre        text not null default 'texte' check (genre in ('texte', 'questions')),
  titre_fr     text not null check (char_length(btrim(titre_fr)) between 2 and 80),
  titre_ar     text check (titre_ar is null or char_length(btrim(titre_ar)) between 2 and 80),
  corps_fr     text not null default '' check (char_length(corps_fr) <= 20000),
  corps_ar     text check (corps_ar is null or char_length(corps_ar) <= 20000),
  publie       boolean not null default false,
  dans_pied    boolean not null default true,
  position     smallint not null default 0,
  -- Relue à l'enregistrement : la page qu'un collègue a changée entre-temps
  -- est refusée, pas écrasée.
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  unique (boutique_id, id),
  unique (boutique_id, slug),
  constraint pages_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  -- Les adresses que la vitrine sert déjà : une page ne les prend jamais.
  constraint pages_slug_libre check (slug not in (
    'catalogue', 'categorie', 'produit', 'recherche', 'commande', 'compte', 'devis', 'filtrer',
    'conditions-de-vente', 'mentions-legales', 'confidentialite', 'garantie-et-sav',
    'contact', 'suivi', 'pages', 'api', 'crochets'))
);

comment on table public.pages_boutique is
  'Les pages de contenu d''une boutique (À propos, questions fréquentes, livraison et retours…), écrites au backoffice, servies à /<slug>.';

create index pages_boutique_publiees_idx on public.pages_boutique (boutique_id, position) where publie;

-- La date de mise à jour suit le contenu, pas l'ordre des pages.
create trigger pages_boutique_updated_at
  before update of slug, genre, titre_fr, titre_ar, corps_fr, corps_ar, publie, dans_pied on public.pages_boutique
  for each row execute function private.set_updated_at();
create trigger pages_boutique_boutique_immuable before update of boutique_id on public.pages_boutique
  for each row execute function private.boutique_immuable();

alter table public.pages_boutique enable row level security;
create policy "pages : l'équipe lit celles de sa boutique"
  on public.pages_boutique for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.pages_boutique from anon, authenticated;

-- La vitrine : une page publiée d'une boutique ouverte, ou rien.
create function public.page_publique(p_boutique_id uuid, p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', p.slug, 'genre', p.genre, 'titre_fr', p.titre_fr, 'titre_ar', p.titre_ar,
    'corps_fr', p.corps_fr, 'corps_ar', p.corps_ar, 'modifiee_le', p.updated_at)
  from public.pages_boutique p
  join plateforme.boutiques b on b.id = p.boutique_id and b.statut = 'active'
  where p.boutique_id = p_boutique_id and p.slug = p_slug and p.publie;
$$;

grant execute on function public.page_publique(uuid, text) to anon, authenticated, service_role;

-- Le cadre de la vitrine porte désormais ses pages publiées (le pied de page,
-- le menu) : reprise de la définition de la migration 29, plus « pages ».
-- Composé une fois, ici, et lu de deux façons : par la vitrine, boutique
-- ouverte (boutique_publique), par son équipe, même en préparation
-- (gestion_cadre : les modèles de pages se composent de ses réglages).
create function private.cadre_boutique(p_boutique_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'boutique', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'nom', b.nom,
      'langue_defaut', b.langue_defaut, 'langues_actives', b.langues_actives, 'devise', b.devise,
      'hote_principal', (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal),
      'nb_produits', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie)),
    'configuration', public.configuration_publique(b.id),
    'theme', (select to_jsonb(t) - 'boutique_id' - 'updated_by' from public.themes t where t.boutique_id = b.id),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'parent_id', c.parent_id, 'slug', c.slug,
               'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar,
               'description_fr', c.description_fr, 'description_ar', c.description_ar,
               'image_chemin', c.image_chemin, 'position', c.position,
               'nb_produits', (select count(*) from public.produits p
                                where p.boutique_id = b.id and p.categorie_id = c.id and p.publie))
             order by c.position, c.slug)
      from public.categories c where c.boutique_id = b.id and c.actif), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom_fr', z.nom_fr, 'nom_ar', z.nom_ar, 'frais_millimes', z.frais_millimes,
               'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
             order by z.position)
      from public.zones_livraison z where z.boutique_id = b.id and z.actif), '[]'::jsonb),
    -- Le supplément au poids, s'il est en vigueur (conditions de vente, tunnel).
    'tranches_poids', case when coalesce((private.reglage(b.id, 'livraison.supplement_poids') #>> '{}')::boolean, false) then
      coalesce((select jsonb_agg(jsonb_build_object('jusqu_a_grammes', t.jusqu_a_grammes, 'supplement_millimes', t.supplement_millimes)
                                 order by t.jusqu_a_grammes nulls last)
                  from public.tranches_poids t where t.boutique_id = b.id), '[]'::jsonb) end,
    -- Les pages publiées, dans l'ordre de la boutique.
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'titre_fr', p.titre_fr, 'titre_ar', p.titre_ar,
                                          'genre', p.genre, 'dans_pied', p.dans_pied)
             order by p.position, p.titre_fr)
      from public.pages_boutique p where p.boutique_id = b.id and p.publie), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.id = p_boutique_id;
$$;

revoke execute on function private.cadre_boutique(uuid) from public, anon, authenticated;

create or replace function public.boutique_publique(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.cadre_boutique(b.id) from plateforme.boutiques b where b.slug = p_slug and b.statut = 'active';
$$;

-- Le même cadre, pour l'équipe de la boutique, qu'elle soit ouverte ou non.
create function public.gestion_cadre(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return private.cadre_boutique(p_boutique_id);
end;
$$;

revoke execute on function public.gestion_cadre(uuid) from public, anon;
grant  execute on function public.gestion_cadre(uuid) to authenticated;

-- Le backoffice : toutes les pages, brouillons compris.
create function public.gestion_pages(p_boutique_id uuid)
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
             'id', p.id, 'slug', p.slug, 'genre', p.genre, 'titre_fr', p.titre_fr, 'corps_fr', p.corps_fr,
             'publie', p.publie, 'dans_pied', p.dans_pied, 'position', p.position, 'version', p.version,
             'modifiee_le', p.updated_at, 'modifiee_par', (select u.email from auth.users u where u.id = p.updated_by))
           order by p.position, p.titre_fr)
    from public.pages_boutique p where p.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

-- Créer (sans id) ou modifier (avec l'id et la version lue : une page qu'un
-- collègue a changée entre-temps est refusée, pas écrasée).
create function public.gestion_enregistrer_page(p_boutique_id uuid, p_page jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id      uuid := nullif(p_page ->> 'id', '')::uuid;
  v_version integer := nullif(p_page ->> 'version', '')::integer;
  v_slug    text := lower(btrim(coalesce(p_page ->> 'slug', '')));
  v_titre   text := btrim(coalesce(p_page ->> 'titre_fr', ''));
  v_avant   public.pages_boutique;
  v_apres   public.pages_boutique;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if v_id is not null then
    select * into v_avant from public.pages_boutique p where p.boutique_id = p_boutique_id and p.id = v_id for update;
    if not found then
      raise exception 'Page introuvable' using errcode = 'check_violation', hint = 'page';
    end if;
    if v_version is distinct from v_avant.version then
      raise exception 'Cette page a été modifiée entre-temps : rechargez-la avant d''enregistrer' using errcode = 'check_violation', hint = 'version';
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.pages_boutique (boutique_id, slug, genre, titre_fr, corps_fr, publie, dans_pied, position, updated_by)
      values (p_boutique_id, v_slug, coalesce(nullif(p_page ->> 'genre', ''), 'texte'), v_titre, coalesce(p_page ->> 'corps_fr', ''),
              coalesce((p_page ->> 'publie')::boolean, false), coalesce((p_page ->> 'dans_pied')::boolean, true),
              coalesce((p_page ->> 'position')::smallint,
                       (select coalesce(max(p.position), 0) + 1 from public.pages_boutique p where p.boutique_id = p_boutique_id)),
              auth.uid())
      returning * into v_apres;
    else
      update public.pages_boutique p
         set slug = v_slug,
             genre = coalesce(nullif(p_page ->> 'genre', ''), p.genre),
             titre_fr = v_titre,
             corps_fr = coalesce(p_page ->> 'corps_fr', p.corps_fr),
             publie = coalesce((p_page ->> 'publie')::boolean, p.publie),
             dans_pied = coalesce((p_page ->> 'dans_pied')::boolean, p.dans_pied),
             position = coalesce((p_page ->> 'position')::smallint, p.position),
             version = p.version + 1,
             updated_by = auth.uid()
       where p.id = v_id
      returning * into v_apres;
    end if;
  exception
    when unique_violation then
      raise exception 'Une autre page a déjà cette adresse' using errcode = 'check_violation', hint = 'slug';
    when check_violation then
      if sqlerrm like '%pages_slug_libre%' then
        raise exception 'Cette adresse est déjà celle d''une page de la boutique (catalogue, commande, contact…) : choisissez-en une autre'
          using errcode = 'check_violation', hint = 'slug';
      elsif sqlerrm like '%pages_slug%' then
        raise exception 'Adresse illisible : des minuscules, des chiffres et des tirets, de 2 à 60 caractères (« a-propos »)'
          using errcode = 'check_violation', hint = 'slug';
      elsif sqlerrm like '%titre_fr%' then
        raise exception 'Le titre compte de 2 à 80 caractères' using errcode = 'check_violation', hint = 'titre';
      elsif sqlerrm like '%corps_fr%' then
        raise exception 'Texte trop long (20 000 caractères au plus)' using errcode = 'check_violation', hint = 'corps';
      elsif sqlerrm like '%genre%' then
        raise exception 'Genre de page inconnu' using errcode = 'check_violation', hint = 'genre';
      else
        raise;
      end if;
  end;

  perform private.console_trace(auth.uid(), p_boutique_id, case when v_id is null then 'page.creer' else 'page.modifier' end,
    v_apres.id::text,
    case when v_id is null then null
         else jsonb_build_object('slug', v_avant.slug, 'titre', v_avant.titre_fr, 'publie', v_avant.publie, 'longueur', char_length(v_avant.corps_fr)) end,
    jsonb_build_object('slug', v_apres.slug, 'titre', v_apres.titre_fr, 'publie', v_apres.publie, 'longueur', char_length(v_apres.corps_fr)));
  return jsonb_build_object('id', v_apres.id, 'version', v_apres.version, 'slug', v_apres.slug);
end;
$$;

create function public.gestion_retirer_page(p_boutique_id uuid, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.pages_boutique;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  delete from public.pages_boutique p where p.boutique_id = p_boutique_id and p.id = p_id returning * into v;
  if not found then
    raise exception 'Page introuvable' using errcode = 'check_violation', hint = 'page';
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'page.retirer', p_id::text,
    jsonb_build_object('slug', v.slug, 'titre', v.titre_fr, 'publie', v.publie), null);
end;
$$;

-- L'ordre des pages (le pied de page, le backoffice) : toutes les pages de la
-- boutique, dans l'ordre voulu, d'un coup. Une liste qui n'est plus celle de
-- la base (une page ajoutée ou retirée entre-temps) est refusée. L'ordre ne
-- change ni le texte ni sa date de mise à jour, et ne dérange pas un
-- collègue en train d'écrire (sa version reste la même).
create function public.gestion_ordonner_pages(p_boutique_id uuid, p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nombre integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select count(*) into v_nombre from public.pages_boutique p where p.boutique_id = p_boutique_id;
  if coalesce(cardinality(p_ids), 0) <> v_nombre
     or (select count(distinct x) from unnest(p_ids) x) <> v_nombre
     or exists (select 1 from unnest(p_ids) x
                 where not exists (select 1 from public.pages_boutique p where p.boutique_id = p_boutique_id and p.id = x)) then
    raise exception 'La liste des pages a changé entre-temps : rechargez-la' using errcode = 'check_violation', hint = 'ordre';
  end if;
  update public.pages_boutique p
     set position = o.rang
    from unnest(p_ids) with ordinality as o(id, rang)
   where p.boutique_id = p_boutique_id and p.id = o.id and p.position <> o.rang;
  perform private.console_trace(auth.uid(), p_boutique_id, 'page.ordonner', null, null, jsonb_build_object('ordre', to_jsonb(p_ids)));
end;
$$;

revoke execute on function public.gestion_pages(uuid)                    from public, anon;
revoke execute on function public.gestion_enregistrer_page(uuid, jsonb)  from public, anon;
revoke execute on function public.gestion_retirer_page(uuid, uuid)       from public, anon;
revoke execute on function public.gestion_ordonner_pages(uuid, uuid[])   from public, anon;
grant  execute on function public.gestion_pages(uuid)                    to authenticated;
grant  execute on function public.gestion_enregistrer_page(uuid, jsonb)  to authenticated;
grant  execute on function public.gestion_retirer_page(uuid, uuid)       to authenticated;
grant  execute on function public.gestion_ordonner_pages(uuid, uuid[])   to authenticated;


-- ---------------------------------------------------------------------
-- 3. Suivre une commande sans compte
-- ---------------------------------------------------------------------
-- Les essais manqués, par numéro et par téléphone, gardés un jour : au-delà
-- de 5 essais sur un numéro (ou 10 sur un téléphone) dans l'heure, le suivi
-- attend. Rien de lisible depuis l'API (schéma private).
create table private.essais_suivi (
  boutique_id uuid not null,
  cle         text not null,
  le          timestamptz not null default now()
);
create index essais_suivi_idx on private.essais_suivi (boutique_id, cle, le);

-- Ce que l'acheteur lit d'une commande : la forme de « Mes commandes ».
create function private.commande_pour_acheteur(p_boutique_id uuid, p_commande_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero',         c.numero,
    'statut',         c.statut,
    'cree_le',        c.created_at,
    'mode_livraison', c.mode_livraison,
    'ville',          case when c.mode_livraison = 'domicile' then c.livraison_ville end,
    'gouvernorat',    case when c.mode_livraison = 'domicile' then coalesce(g.nom_fr, c.livraison_gouvernorat) end,
    'magasin',        case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'total_millimes', c.total_millimes,
    'transporteur',   c.transporteur,
    'numero_suivi',   c.numero_suivi,
    'expediee_le',    c.expediee_at,
    'livree_le',      c.livree_at,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'quantite', l.quantite,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                   limit 1)))
             order by l.created_at, l.produit_nom)
        from public.commande_lignes l
        left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
       where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb))
  from public.commandes c
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id and c.id = p_commande_id;
$$;

-- Le numéro se tape comme on l'a lu : « MAY-2026-00012 », « may202600012 »,
-- ou son seul rang (« 12 ») — le téléphone qui a passé la commande le
-- confirme. Rien de trouvé : null (sans dire lequel des deux est faux).
create function public.suivre_commande(p_boutique_id uuid, p_numero text, p_telephone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_saisi  text := upper(regexp_replace(coalesce(p_numero, ''), '[^A-Za-z0-9]', '', 'g'));
  v_tel    text := private.telephone_tunisien(p_telephone);
  v_depuis timestamptz := now() - interval '1 hour';
  v_id     uuid;
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'check_violation', hint = 'boutique';
  end if;
  if v_saisi = '' or char_length(v_saisi) > 40 or v_tel is null then
    raise exception 'Le numéro de la commande et le téléphone qui l''a passée sont attendus' using errcode = 'check_violation', hint = 'saisie';
  end if;
  if (select count(*) from private.essais_suivi e
       where e.boutique_id = p_boutique_id and e.cle = 'numero:' || v_saisi and e.le > v_depuis) >= 5
     or (select count(*) from private.essais_suivi e
          where e.boutique_id = p_boutique_id and e.cle = 'tel:' || v_tel and e.le > v_depuis) >= 10 then
    raise exception 'Trop d''essais : réessayez dans une heure, ou appelez la boutique' using errcode = 'check_violation', hint = 'essais';
  end if;

  select c.id into v_id
    from public.commandes c
   where c.boutique_id = p_boutique_id
     and c.contact_telephone = v_tel
     and (upper(regexp_replace(c.numero, '[^A-Za-z0-9]', '', 'g')) = v_saisi
          or (v_saisi ~ '^[0-9]{1,6}$' and ltrim(split_part(c.numero, '-', 3), '0') = ltrim(v_saisi, '0')))
   order by c.created_at desc
   limit 1;

  if v_id is null then
    delete from private.essais_suivi e where e.le < now() - interval '1 day';
    insert into private.essais_suivi (boutique_id, cle)
    values (p_boutique_id, 'numero:' || v_saisi), (p_boutique_id, 'tel:' || v_tel);
    return null;
  end if;
  return private.commande_pour_acheteur(p_boutique_id, v_id);
end;
$$;

revoke execute on function private.commande_pour_acheteur(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.suivre_commande(uuid, text, text) to anon, authenticated, service_role;
