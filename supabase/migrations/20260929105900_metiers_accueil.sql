-- =====================================================================
-- 60 · L'accueil de chaque métier, posé avec son préréglage
-- =====================================================================
-- Le préréglage d'un métier (migration 58) posait le gabarit, la palette,
-- les rayons et les caractéristiques ; l'accueil restait celui du gabarit.
-- Une boutique de beauté ouvre sur ses nouveautés et ce qu'en disent ses
-- clientes ; une boutique high-tech sur ses rayons et ses marques. Chaque
-- métier a désormais son accueil, pris dans la bibliothèque (migration 59).
--
-- Aucun texte n'y est écrit : chaque section prend son titre par défaut,
-- et celles qui n'ont rien à montrer (pas encore d'avis, une seule
-- marque) ne s'affichent pas — elles paraissent d'elles-mêmes à mesure
-- que la boutique se remplit. L'accueil d'une boutique qui a déjà composé
-- le sien n'est jamais touché.

update plateforme.metiers m
   set definition = m.definition || jsonb_build_object('sections', x.sections)
  from (values
    ('mode',         '[{"type": "hero"}, {"type": "rayons"}, {"type": "selection", "tri": "nouveautes", "nombre": 8}, {"type": "avis", "nombre": 6}, {"type": "selection", "nombre": 8}, {"type": "questions", "nombre": 5}, {"type": "engagements"}]'::jsonb),
    ('beaute',       '[{"type": "hero"}, {"type": "selection", "tri": "nouveautes", "nombre": 8}, {"type": "rayons"}, {"type": "avis", "nombre": 6}, {"type": "marques"}, {"type": "questions", "nombre": 5}, {"type": "engagements"}]'),
    ('bijoux',       '[{"type": "hero"}, {"type": "rayons"}, {"type": "selection", "nombre": 8}, {"type": "avis", "nombre": 6}, {"type": "selection", "tri": "nouveautes", "nombre": 4}, {"type": "engagements"}]'),
    ('high_tech',    '[{"type": "hero"}, {"type": "rayons"}, {"type": "selection", "tri": "nouveautes", "nombre": 10}, {"type": "marques"}, {"type": "avis", "nombre": 6}, {"type": "questions", "nombre": 5}, {"type": "engagements"}]'),
    ('maison',       '[{"type": "hero"}, {"type": "rayons"}, {"type": "selection", "nombre": 8}, {"type": "avis", "nombre": 6}, {"type": "selection", "tri": "nouveautes", "nombre": 8}, {"type": "engagements"}]'),
    ('alimentation', '[{"type": "hero"}, {"type": "selection", "nombre": 8}, {"type": "rayons"}, {"type": "avis", "nombre": 6}, {"type": "questions", "nombre": 5}, {"type": "engagements"}]'),
    ('outillage',    '[{"type": "hero"}, {"type": "rayons"}, {"type": "selection", "nombre": 10}, {"type": "marques"}, {"type": "selection", "tri": "nouveautes", "nombre": 5}, {"type": "questions", "nombre": 5}, {"type": "engagements"}]'),
    ('bagages',      '[{"type": "hero"}, {"type": "selection", "nombre": 8}, {"type": "rayons"}, {"type": "avis", "nombre": 6}, {"type": "marques"}, {"type": "engagements"}]')
  ) as x(code, sections)
 where m.code = x.code;

-- L'accueil du métier n'est posé que si la boutique garde celui du gabarit
-- (sections NULL) : une composition propre n'est jamais remplacée. La
-- réponse dit s'il l'a été (`accueil`).
create or replace function public.console_appliquer_metier(p_acteur uuid, p_boutique_id uuid, p_metier text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_def      jsonb;
  v_rayon    jsonb;
  v_enfant   jsonb;
  v_attr     jsonb;
  v_reglage  record;
  v_parent   uuid;
  v_attr_id  uuid;
  v_pos      integer := 0;
  v_pos_enf  integer;
  v_n_rayons integer := 0;
  v_n_attrs  integer := 0;
  v_n_regl   integer := 0;
  v_accueil  boolean;
begin
  perform private.console_exige_admin(p_acteur);
  select m.definition into v_def from plateforme.metiers m where m.code = p_metier;
  if v_def is null then
    raise exception 'Métier inconnu' using errcode = 'check_violation', hint = 'metier';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'check_violation', hint = 'boutique';
  end if;
  if exists (select 1 from public.categories c where c.boutique_id = p_boutique_id)
     or exists (select 1 from public.produits p where p.boutique_id = p_boutique_id)
     or exists (select 1 from public.attributs a where a.boutique_id = p_boutique_id) then
    raise exception 'La boutique a déjà un catalogue : un préréglage ne vient que sur une boutique vide'
      using errcode = 'check_violation', hint = 'catalogue';
  end if;

  -- Le gabarit, la palette, les polices ; les textes de la boutique gardés,
  -- ceux du métier ajoutés là où il n'y en a pas ; l'accueil du métier si
  -- la boutique n'a pas composé le sien.
  insert into public.themes (boutique_id, code, updated_by) values (p_boutique_id, v_def ->> 'theme', p_acteur)
  on conflict (boutique_id) do nothing;
  select t.sections is null and v_def ? 'sections' into v_accueil from public.themes t where t.boutique_id = p_boutique_id;
  update public.themes t
     set code = v_def ->> 'theme',
         couleurs = coalesce(v_def -> 'couleurs', '{}'::jsonb),
         polices = coalesce(v_def -> 'polices', '{}'::jsonb),
         textes = coalesce(v_def -> 'textes', '{}'::jsonb) || t.textes,
         sections = coalesce(t.sections, v_def -> 'sections'),
         version = t.version + 1, updated_at = now(), updated_by = p_acteur
   where t.boutique_id = p_boutique_id;

  -- Les rayons et leurs sous-rayons.
  for v_rayon in select * from jsonb_array_elements(v_def -> 'rayons') loop
    v_pos := v_pos + 1;
    insert into public.categories (boutique_id, slug, nom_fr, position)
    values (p_boutique_id, v_rayon ->> 'slug', v_rayon ->> 'nom', v_pos)
    returning id into v_parent;
    v_n_rayons := v_n_rayons + 1;
    v_pos_enf := 0;
    for v_enfant in select * from jsonb_array_elements(coalesce(v_rayon -> 'enfants', '[]'::jsonb)) loop
      v_pos_enf := v_pos_enf + 1;
      insert into public.categories (boutique_id, parent_id, slug, nom_fr, position)
      values (p_boutique_id, v_parent, v_enfant ->> 'slug', v_enfant ->> 'nom', v_pos_enf);
      v_n_rayons := v_n_rayons + 1;
    end loop;
  end loop;

  -- Les caractéristiques, chacune sur ses rayons (aucun : tout le catalogue).
  v_pos := 0;
  for v_attr in select * from jsonb_array_elements(coalesce(v_def -> 'attributs', '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    insert into public.attributs (boutique_id, cle, label_fr, unite, type, filtrable, en_carte, position)
    values (p_boutique_id, v_attr ->> 'cle', v_attr ->> 'label', v_attr ->> 'unite', coalesce(v_attr ->> 'type', 'texte'),
            coalesce((v_attr ->> 'filtrable')::boolean, true), coalesce((v_attr ->> 'en_carte')::boolean, false), v_pos)
    returning id into v_attr_id;
    v_n_attrs := v_n_attrs + 1;
    insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
    select p_boutique_id, c.id, v_attr_id
      from jsonb_array_elements_text(coalesce(v_attr -> 'rayons', '[]'::jsonb)) s(slug)
      join public.categories c on c.boutique_id = p_boutique_id and c.slug = s.slug and c.parent_id is null;
  end loop;

  -- Les réglages : seulement ceux que la boutique n'a pas encore réglés.
  for v_reglage in select * from jsonb_each(coalesce(v_def -> 'reglages', '{}'::jsonb)) loop
    insert into public.reglages (boutique_id, cle, valeur)
    select p_boutique_id, v_reglage.key, v_reglage.value
     where exists (select 1 from plateforme.reglages_catalogue rc where rc.cle = v_reglage.key)
    on conflict (boutique_id, cle) do nothing;
    if found then v_n_regl := v_n_regl + 1; end if;
  end loop;

  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.metier', p_metier, null,
    jsonb_build_object('rayons', v_n_rayons, 'caracteristiques', v_n_attrs, 'reglages', v_n_regl, 'gabarit', v_def ->> 'theme', 'accueil', v_accueil));
  return jsonb_build_object('rayons', v_n_rayons, 'caracteristiques', v_n_attrs, 'reglages', v_n_regl, 'gabarit', v_def ->> 'theme', 'accueil', v_accueil);
end;
$$;

-- Ce que la console montre d'un métier avant de le choisir : son accueil
-- aussi (le nombre de ses sections).
create or replace function public.console_metiers(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', m.code, 'nom', m.nom, 'description', m.description, 'gabarit', m.definition ->> 'theme',
             'accent', m.definition #>> '{couleurs,accent}',
             'rayons', jsonb_array_length(m.definition -> 'rayons'),
             'sous_rayons', (select coalesce(sum(jsonb_array_length(coalesce(r -> 'enfants', '[]'::jsonb))), 0) from jsonb_array_elements(m.definition -> 'rayons') r),
             'caracteristiques', jsonb_array_length(m.definition -> 'attributs'),
             'sections', coalesce(jsonb_array_length(m.definition -> 'sections'), 0))
           order by m.position)
      from plateforme.metiers m), '[]'::jsonb);
end;
$$;

-- L'écran « Page d'accueil » (migration 59) : chaque rayon avec le nombre
-- de ses pièces publiées (sous-rayons compris). La vitrine ne montre que
-- les rayons qui en ont ; l'écran dit pourquoi une section reste masquée.
create or replace function public.gestion_accueil(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_theme public.themes;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_theme from public.themes t where t.boutique_id = p_boutique_id;
  return jsonb_build_object(
    'code',     coalesce(v_theme.code, 'editorial'),
    'theme',    v_theme.boutique_id is not null,
    'version',  v_theme.version,
    'sections', v_theme.sections,
    'modifie_le',  v_theme.updated_at,
    'modifie_par', (select u.email from auth.users u where u.id = v_theme.updated_by),
    'rayons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', c.slug, 'nom', coalesce(c.nom_fr, c.nom_ar),
               'parent', (select pc.slug from public.categories pc where pc.boutique_id = c.boutique_id and pc.id = c.parent_id),
               'produits', (select count(*) from public.produits p
                             where p.boutique_id = c.boutique_id and p.publie
                               and (p.categorie_id = c.id
                                    or p.categorie_id in (select e.id from public.categories e where e.boutique_id = c.boutique_id and e.parent_id = c.id))))
             order by c.parent_id nulls first, c.position, c.slug)
        from public.categories c where c.boutique_id = p_boutique_id and c.actif), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'titre', p.titre_fr, 'publie', p.publie) order by p.position, p.slug)
        from public.pages_boutique p where p.boutique_id = p_boutique_id and p.genre = 'questions'), '[]'::jsonb),
    'avis', jsonb_build_object(
      'actif', private.avis_actif(p_boutique_id),
      'montrables', (select count(*) from public.avis a
                      join public.produits p on p.boutique_id = a.boutique_id and p.id = a.produit_id
                      where a.boutique_id = p_boutique_id and a.statut = 'publie' and a.note >= 4 and a.texte is not null and p.publie)),
    'marques', (select count(distinct lower(btrim(p.marque))) from public.produits p
                 where p.boutique_id = p_boutique_id and p.publie and nullif(btrim(p.marque), '') is not null),
    'produits', (select count(*) from public.produits p where p.boutique_id = p_boutique_id and p.publie)
  );
end;
$$;
