-- =====================================================================
-- 59 · Composer l'accueil : la bibliothèque de sections, et l'équipe qui
--      l'ordonne depuis le backoffice
-- =====================================================================
-- Jusqu'ici, l'accueil d'une boutique ne se composait qu'à sa mise en
-- place (le thème posé par la console). Le propriétaire veut le tenir
-- lui-même : changer le titre d'ouverture pour la rentrée, montrer les
-- nouveautés avant les rayons, ajouter ce que disent ses clients.
--
-- 1. Trois sections de plus, communes aux gabarits — chacune tirée de ce
--    que la boutique a déjà, jamais d'un texte inventé :
--      · avis      : ses avis publiés (4 et 5 étoiles, avec un texte), le
--                    produit reçu et sa note moyenne ;
--      · questions : les premières questions d'une de ses pages de
--                    questions fréquentes (`page`), en accordéon ;
--      · marques   : les marques de son catalogue.
--    Et la sélection choisit son ordre (`tri`) : la sélection de la
--    boutique, ou les nouveautés.
-- 2. public.gestion_accueil (l'équipe) et public.gestion_enregistrer_accueil
--    (propriétaire, administrateur ; la version du thème protège un collègue
--    d'être écrasé ; tracé). La validation reste celle du thème.
-- 3. public.avis_accueil : ce que la vitrine montre de la section « avis ».

-- ---------------------------------------------------------------------
-- 1. La validation du thème (migration 05), avec les nouvelles sections
-- ---------------------------------------------------------------------
create or replace function private.valide_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  s jsonb;
begin
  -- Couleurs
  if jsonb_typeof(new.couleurs) <> 'object' then
    raise exception 'themes.couleurs : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(new.couleurs) loop
    if e.key not in ('fond', 'surface', 'surface_2', 'filet', 'filet_fort', 'contour_champ',
                     'encre', 'encre_doux', 'accent', 'accent_clair', 'succes', 'erreur', 'alerte') then
      raise exception 'themes.couleurs : jeton inconnu « % »', e.key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'themes.couleurs : « % » doit valoir #RRGGBB', e.key using errcode = 'check_violation';
    end if;
  end loop;

  -- Polices
  if jsonb_typeof(new.polices) <> 'object' then
    raise exception 'themes.polices : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(new.polices) loop
    if not ((e.key = 'titres' and e.value in ('"instrument-serif"', '"instrument-sans"', '"archivo"', '"young-serif"', '"plex-sans"'))
            or (e.key = 'texte' and e.value in ('"instrument-sans"', '"archivo"', '"plex-sans"'))) then
      raise exception 'themes.polices : « % » = % n''est pas une police disponible', e.key, e.value
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Fichiers
  perform private.valide_chemin(new.boutique_id, new.logo_chemin);
  perform private.valide_chemin(new.boutique_id, new.monogramme_chemin);
  perform private.valide_chemin(new.boutique_id, new.favicon_chemin);

  -- Textes de marque
  perform private.valide_textes(new.textes, 'themes.textes');

  -- Sections de l'accueil
  if new.sections is not null then
    if jsonb_typeof(new.sections) <> 'array' or jsonb_array_length(new.sections) > 12 then
      raise exception 'themes.sections : une liste de 12 sections au plus est attendue' using errcode = 'check_violation';
    end if;
    for s in select * from jsonb_array_elements(new.sections) loop
      if jsonb_typeof(s) <> 'object'
         or coalesce(s ->> 'type', '') not in ('hero', 'rayons', 'selection', 'editorial', 'engagements', 'texte',
                                               'avis', 'questions', 'marques')
         or exists (select 1 from jsonb_object_keys(s) k
                     where k not in ('type', 'textes', 'image', 'nombre', 'lien', 'rayon', 'alignement', 'tri', 'page')) then
        raise exception 'themes.sections : section invalide %', s using errcode = 'check_violation';
      end if;
      if s ? 'textes' then
        perform private.valide_textes(s -> 'textes', 'themes.sections.' || (s ->> 'type'));
      end if;
      if s ? 'image' then
        if jsonb_typeof(s -> 'image') <> 'object'
           or exists (select 1 from jsonb_object_keys(s -> 'image') k where k not in ('chemin', 'chemin_portrait', 'detouree'))
           or (s -> 'image' ? 'detouree' and jsonb_typeof(s -> 'image' -> 'detouree') <> 'boolean') then
          raise exception 'themes.sections : image invalide %', s -> 'image' using errcode = 'check_violation';
        end if;
        perform private.valide_chemin(new.boutique_id, s -> 'image' ->> 'chemin');
        -- Le cadrage portrait, pour les téléphones (facultatif).
        perform private.valide_chemin(new.boutique_id, s -> 'image' ->> 'chemin_portrait');
      end if;
      if s ? 'nombre' and (jsonb_typeof(s -> 'nombre') <> 'number' or (s ->> 'nombre')::numeric not between 1 and 24) then
        raise exception 'themes.sections : nombre entre 1 et 24' using errcode = 'check_violation';
      end if;
      -- Un lien reste DANS la boutique : un chemin, jamais une autre origine.
      if s ? 'lien' and (jsonb_typeof(s -> 'lien') <> 'string' or (s ->> 'lien') !~ '^/[A-Za-z0-9/_=~%.-]*$'
                         or (s ->> 'lien') like '//%' or (s ->> 'lien') like '%..%') then
        raise exception 'themes.sections : lien interne attendu (« /categorie/… »), pas %', s -> 'lien' using errcode = 'check_violation';
      end if;
      if s ? 'rayon' and (jsonb_typeof(s -> 'rayon') <> 'string' or (s ->> 'rayon') !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
        raise exception 'themes.sections : identifiant de rayon invalide %', s -> 'rayon' using errcode = 'check_violation';
      end if;
      -- Où poser le texte sur la photo d'ouverture : au début de la ligne
      -- (à gauche en français) ou à la fin, pour ne pas couvrir le sujet.
      if s ? 'alignement' and (s ->> 'type') <> 'hero' then
        raise exception 'themes.sections : l''alignement ne se règle que sur la section d''ouverture (hero)' using errcode = 'check_violation';
      end if;
      if s ? 'alignement' and (jsonb_typeof(s -> 'alignement') <> 'string' or (s ->> 'alignement') not in ('debut', 'fin')) then
        raise exception 'themes.sections : alignement « debut » ou « fin » attendu, pas %', s -> 'alignement' using errcode = 'check_violation';
      end if;
      -- L'ordre d'une sélection : celle de la boutique, ou les nouveautés.
      if s ? 'tri' and ((s ->> 'type') <> 'selection' or jsonb_typeof(s -> 'tri') <> 'string'
                        or (s ->> 'tri') not in ('selection', 'nouveautes')) then
        raise exception 'themes.sections : tri « selection » ou « nouveautes », sur une sélection seulement, pas %', s -> 'tri'
          using errcode = 'check_violation';
      end if;
      -- La page de questions d'où la section tire ses questions.
      if s ? 'page' and ((s ->> 'type') <> 'questions' or jsonb_typeof(s -> 'page') <> 'string'
                         or (s ->> 'page') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(s ->> 'page') > 60) then
        raise exception 'themes.sections : page de questions invalide %', s -> 'page' using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

comment on column public.themes.sections is
  'Sections de l''accueil, dans l''ordre : [{"type": "hero", "textes": {...}, "image": {"chemin": "...", "chemin_portrait": "...", "detouree": true}, "alignement": "fin"}, {"type": "selection", "tri": "nouveautes", "rayon": "robes", "nombre": 8}, {"type": "avis", "nombre": 6}, {"type": "questions", "page": "questions-frequentes", "nombre": 5}, {"type": "marques"}, …]. NULL = les sections par défaut du thème.';


-- ---------------------------------------------------------------------
-- 2. L'équipe : lire et enregistrer l'accueil
-- ---------------------------------------------------------------------
create function public.gestion_accueil(p_boutique_id uuid)
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
    -- Ce que les sections peuvent montrer, pour le dire à l'équipe.
    'rayons', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'nom', coalesce(c.nom_fr, c.nom_ar), 'parent',
                                          (select pc.slug from public.categories pc where pc.boutique_id = c.boutique_id and pc.id = c.parent_id))
                       order by c.parent_id nulls first, c.position, c.slug)
        from public.categories c where c.boutique_id = p_boutique_id and c.actif), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'titre', p.titre_fr, 'publie', p.publie) order by p.position, p.slug)
        from public.pages_boutique p where p.boutique_id = p_boutique_id and p.genre = 'questions'), '[]'::jsonb),
    'avis', jsonb_build_object(
      'actif', private.avis_actif(p_boutique_id),
      'montrables', (select count(*) from public.avis a
                      where a.boutique_id = p_boutique_id and a.statut = 'publie' and a.note >= 4 and a.texte is not null)),
    'marques', (select count(distinct lower(btrim(p.marque))) from public.produits p
                 where p.boutique_id = p_boutique_id and p.publie and nullif(btrim(p.marque), '') is not null),
    'produits', (select count(*) from public.produits p where p.boutique_id = p_boutique_id and p.publie)
  );
end;
$$;

comment on function public.gestion_accueil(uuid) is
  'L''accueil de la boutique pour son équipe : le gabarit, les sections (NULL = celles du gabarit), la version du thème, et ce que les sections peuvent montrer (rayons, pages de questions, avis montrables, marques).';

create function public.gestion_enregistrer_accueil(p_boutique_id uuid, p_sections jsonb, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.themes;
  v_apres public.themes;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_avant from public.themes t where t.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  if p_version is distinct from v_avant.version then
    raise exception 'L''accueil a été modifié entre-temps : rechargez-le avant d''enregistrer'
      using errcode = 'check_violation', hint = 'version';
  end if;
  -- NULL rend les sections du gabarit ; une liste vide ne laisserait qu'un
  -- en-tête et un pied de page.
  if p_sections is not null and (jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0) then
    raise exception 'L''accueil garde une section au moins' using errcode = 'check_violation', hint = 'vide';
  end if;

  begin
    update public.themes t set sections = p_sections, updated_by = auth.uid()
     where t.boutique_id = p_boutique_id
    returning * into v_apres;
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'check_violation', hint = 'section';
  end;

  perform private.console_trace(auth.uid(), p_boutique_id, 'accueil.modifier', 'accueil',
    jsonb_build_object('sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) x)),
    jsonb_build_object('sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_apres.sections, '[]'::jsonb)) x)));
  return jsonb_build_object('version', v_apres.version);
end;
$$;

comment on function public.gestion_enregistrer_accueil(uuid, jsonb, integer) is
  'Enregistre les sections de l''accueil (propriétaire, administrateur ; NULL = celles du gabarit). La version lue est exigée (indice « version »), la forme est celle du thème (indice « section »). Tracé au journal (accueil.modifier).';

revoke execute on function public.gestion_accueil(uuid), public.gestion_enregistrer_accueil(uuid, jsonb, integer) from public, anon;
grant  execute on function public.gestion_accueil(uuid), public.gestion_enregistrer_accueil(uuid, jsonb, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 3. La vitrine : ce que disent les clients
-- ---------------------------------------------------------------------
-- Les avis publiés de 4 et 5 étoiles qui ont un texte, les plus récents
-- d'abord, avec le produit reçu (son nom, son adresse, sa première photo) ;
-- la moyenne et le nombre portent sur TOUS les avis publiés — la section
-- choisit des citations, elle ne maquille pas la note.
create function public.avis_accueil(p_boutique_id uuid, p_limite integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.avis_actif(p_boutique_id)
                   and exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    jsonb_build_object(
      'total',   (select count(*) from public.avis a join public.produits p on p.boutique_id = a.boutique_id and p.id = a.produit_id
                   where a.boutique_id = p_boutique_id and a.statut = 'publie' and p.publie),
      'moyenne', (select round(avg(a.note), 1) from public.avis a join public.produits p on p.boutique_id = a.boutique_id and p.id = a.produit_id
                   where a.boutique_id = p_boutique_id and a.statut = 'publie' and p.publie),
      'avis', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'note', x.note, 'texte', x.texte, 'auteur', x.auteur, 'variante_libelle', x.variante_libelle,
                 'cree_le', x.created_at,
                 'produit', jsonb_build_object('slug', x.slug, 'nom_fr', x.nom_fr, 'nom_ar', x.nom_ar,
                                               'image', (select i.chemin from public.produit_images i
                                                          where i.boutique_id = x.boutique_id and i.produit_id = x.produit_id
                                                          order by i.position, i.chemin limit 1)))
               order by x.created_at desc, x.id)
          from (select a.*, p.slug, p.nom_fr, p.nom_ar
                  from public.avis a
                  join public.produits p on p.boutique_id = a.boutique_id and p.id = a.produit_id
                 where a.boutique_id = p_boutique_id and a.statut = 'publie' and p.publie
                   and a.note >= 4 and a.texte is not null
                 order by a.created_at desc, a.id
                 limit least(greatest(coalesce(p_limite, 6), 1), 12)) x), '[]'::jsonb))
  end
$$;

comment on function public.avis_accueil(uuid, integer) is
  'La section « avis » de l''accueil : les avis publiés de 4 et 5 étoiles avec un texte (12 au plus), le produit reçu, et la moyenne et le nombre de tous les avis publiés. NULL sans le module avis ou pour une boutique fermée.';

grant execute on function public.avis_accueil(uuid, integer) to anon, authenticated, service_role;
