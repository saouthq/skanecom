-- =====================================================================
-- SkanEcom — LE SITE VITRINE PREMIUM (1/2) : la structure « studio »
-- =====================================================================
--
-- Un site vitrine (vitrine.site_vitrine, migration 73) ne vend pas : un
-- studio d'architecture, un restaurant, un artisan sur mesure montrent ce
-- qu'ils font et se font appeler. Les structures d'avant sont pensées pour
-- vendre (rails de produits, prix, collections « N modèles »). Celle-ci est
-- pensée pour se faire contacter, et pour impressionner :
--
-- 1. themes.code accepte « studio » (sur les composants éditoriaux : la
--    fiche d'une réalisation, le catalogue ; lib/theme.ts), la validation
--    d'un brouillon ou d'une publication aussi.
-- 2. Le style « animations » gagne « expressives » (application/src/app/
--    studio.css et vitrine-mouvement.css) : titres dévoilés, images liées
--    au défilement, sections épinglées, texte qui s'allume en lisant. « oui »
--    (sobres) reste le défaut de chaque gabarit : rien ne change ailleurs.
-- 3. Trois sections, communes à toutes les structures :
--    · services : jusqu'à six, chacun un titre et un texte ;
--    · etapes   : la méthode, jusqu'à cinq étapes numérotées ;
--    · contact  : l'appel à prendre contact, avec le formulaire de la
--      boutique (migration suivante) et ses moyens directs (WhatsApp,
--      téléphone, adresse). Une seule par accueil.
--    Leurs éléments sont des textes numérotés (s1_titre_fr, s1_texte_fr…,
--    e1_titre_fr…) : la validation des textes les connaît déjà, et
--    l'éditeur les écrit dans l'aperçu comme les autres.
-- 4. Le réglage vitrine.prix_masques (coupé par défaut) : en site vitrine,
--    ni carte ni fiche ne montre de prix (« prix sur demande »).
-- =====================================================================

alter table public.themes drop constraint themes_code_check;
alter table public.themes add constraint themes_code_check
  check (code in ('editorial', 'technique', 'bento', 'immersif', 'commerce', 'monoproduit', 'studio'));

comment on column public.themes.code is
  'La structure de la vitrine : editorial, technique, bento (la mosaïque), immersif (le plein écran), monoproduit (la page de vente), studio (le site vitrine qui se fait contacter) — ces quatre-là sur les composants éditoriaux —, commerce (la recherche d''abord, sur les composants techniques).';

-- ---------------------------------------------------------------------
-- 1. La structure
-- ---------------------------------------------------------------------
create or replace function private.valide_contenu_apparence(p_boutique_id uuid, p_contenu jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_contenu) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_contenu) k where k not in ('code', 'couleurs', 'polices', 'style', 'sections', 'reglages'))
     or not (p_contenu ? 'code' and p_contenu ? 'couleurs' and p_contenu ? 'polices' and p_contenu ? 'style') then
    raise exception 'Apparence : {code, couleurs, polices, style, sections ?, reglages ?} attendu' using errcode = 'check_violation', hint = 'forme';
  end if;
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento', 'immersif', 'commerce', 'monoproduit', 'studio') then
    raise exception 'Apparence : structure inconnue %', p_contenu -> 'code' using errcode = 'check_violation', hint = 'forme';
  end if;
  -- Une liste vide ne laisserait qu'un en-tête et un pied de page.
  if jsonb_typeof(p_contenu -> 'sections') = 'array' and jsonb_array_length(p_contenu -> 'sections') = 0 then
    raise exception 'L''accueil garde une section au moins' using errcode = 'check_violation', hint = 'vide';
  end if;
  begin
    perform private.valide_apparence(p_contenu -> 'couleurs', p_contenu -> 'polices', p_contenu -> 'style');
    if jsonb_typeof(p_contenu -> 'sections') = 'array' then
      perform private.valide_sections(p_boutique_id, p_contenu -> 'sections');
    end if;
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'check_violation', hint = 'forme';
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Le style : les animations « expressives »
-- ---------------------------------------------------------------------
create or replace function private.valide_apparence(p_couleurs jsonb, p_polices jsonb, p_style jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  e record;
  v_permis jsonb := '{
    "coins": ["droits", "doux", "arrondis", "ronds"],
    "boutons": ["pleins", "contour", "pilule"],
    "teinte": ["encre", "accent"],
    "cartes": ["nues", "cadre", "ombre"],
    "photos": ["4-5", "1-1", "3-4"],
    "titres": ["sobre", "ample", "immense"],
    "casse": ["normale", "majuscules"],
    "densite": ["serree", "normale", "aeree"],
    "mode": ["clair", "sombre"],
    "animations": ["oui", "non", "expressives"],
    "allure": ["classique", "contemporaine"]
  }'::jsonb;
begin
  -- Couleurs : 13 jetons connus, #RRGGBB.
  if jsonb_typeof(p_couleurs) is distinct from 'object' then
    raise exception 'themes.couleurs : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_couleurs) loop
    if e.key not in ('fond', 'surface', 'surface_2', 'filet', 'filet_fort', 'contour_champ',
                     'encre', 'encre_doux', 'accent', 'accent_clair', 'succes', 'erreur', 'alerte') then
      raise exception 'themes.couleurs : jeton inconnu « % »', e.key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'themes.couleurs : « % » doit valoir #RRGGBB', e.key using errcode = 'check_violation';
    end if;
  end loop;

  -- Polices : les familles servies par l'application.
  if jsonb_typeof(p_polices) is distinct from 'object' then
    raise exception 'themes.polices : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_polices) loop
    if not ((e.key = 'titres' and e.value in ('"instrument-serif"', '"instrument-sans"', '"archivo"', '"young-serif"', '"plex-sans"',
                                              '"bodoni-moda"', '"fraunces"', '"syne"', '"space-grotesk"', '"manrope"', '"dm-sans"'))
            or (e.key = 'texte' and e.value in ('"instrument-sans"', '"archivo"', '"plex-sans"', '"manrope"', '"dm-sans"'))) then
      raise exception 'themes.polices : « % » = % n''est pas une police disponible', e.key, e.value
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Style : des clés et des valeurs de la liste.
  if jsonb_typeof(p_style) is distinct from 'object' then
    raise exception 'themes.style : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_style) loop
    if not v_permis ? e.key then
      raise exception 'themes.style : réglage inconnu « % »', e.key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(e.value) <> 'string' or not (v_permis -> e.key) ? (e.value #>> '{}') then
      raise exception 'themes.style : « % » ne peut valoir %', e.key, e.value using errcode = 'check_violation';
    end if;
  end loop;
end;
$$;

comment on column public.themes.style is
  'Le style par-dessus le gabarit, en listes fermées : coins (droits, doux, arrondis, ronds), boutons (pleins, contour, pilule), teinte des boutons (encre, accent), cartes (nues, cadre, ombre), photos (4-5, 1-1, 3-4), titres (sobre, ample, immense), casse (normale, majuscules), densite (serree, normale, aeree), mode (clair, sombre), animations (oui, non, expressives), allure (classique, contemporaine). Clé absente = le choix du gabarit.';


-- ---------------------------------------------------------------------
-- 3. Les sections : services, étapes, contact
-- ---------------------------------------------------------------------
create or replace function private.valide_sections(p_boutique_id uuid, p_sections jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
  d jsonb;
begin
  if p_sections is null then
    return;
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) > 12 then
    raise exception 'themes.sections : une liste de 12 sections au plus est attendue' using errcode = 'check_violation';
  end if;
  for s in select * from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(s) <> 'object'
       or coalesce(s ->> 'type', '') not in ('hero', 'rayons', 'selection', 'editorial', 'engagements', 'texte',
                                             'avis', 'questions', 'marques', 'lookbook', 'piece', 'bannieres',
                                             'services', 'etapes', 'contact')
       or exists (select 1 from jsonb_object_keys(s) k
                   where k not in ('type', 'textes', 'image', 'nombre', 'lien', 'rayon', 'alignement', 'tri', 'page',
                                   'points', 'produit', 'diapos')) then
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
      perform private.valide_chemin(p_boutique_id, s -> 'image' ->> 'chemin');
      -- Le cadrage portrait, pour les téléphones (facultatif).
      perform private.valide_chemin(p_boutique_id, s -> 'image' ->> 'chemin_portrait');
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
    -- Le lookbook : sur sa photo, six points au plus, chacun posé en pour cent
    -- de la largeur et de la hauteur, et menant à un produit (par son slug).
    if s ? 'points' then
      if (s ->> 'type') <> 'lookbook' or jsonb_typeof(s -> 'points') <> 'array' or jsonb_array_length(s -> 'points') > 6 then
        raise exception 'themes.sections : six points au plus, sur un lookbook seulement' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from jsonb_array_elements(s -> 'points') p
         where jsonb_typeof(p) <> 'object'
            or exists (select 1 from jsonb_object_keys(p) k where k not in ('x', 'y', 'produit'))
            or jsonb_typeof(p -> 'x') is distinct from 'number' or jsonb_typeof(p -> 'y') is distinct from 'number'
            or (p ->> 'x')::numeric not between 0 and 100 or (p ->> 'y')::numeric not between 0 and 100
            or jsonb_typeof(p -> 'produit') is distinct from 'string'
            or (p ->> 'produit') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p ->> 'produit') > 120
      ) then
        raise exception 'themes.sections : point de lookbook invalide (x, y entre 0 et 100, un produit)' using errcode = 'check_violation';
      end if;
    end if;
    -- Les bannières : une à cinq diapos, chacune sa photo (et son cadrage
    -- pour téléphone), ses textes, son lien — qui reste DANS la boutique.
    if s ? 'diapos' then
      if (s ->> 'type') <> 'bannieres' or jsonb_typeof(s -> 'diapos') <> 'array'
         or jsonb_array_length(s -> 'diapos') not between 1 and 5 then
        raise exception 'themes.sections : une à cinq diapos, sur des bannières seulement' using errcode = 'check_violation';
      end if;
      for d in select * from jsonb_array_elements(s -> 'diapos') loop
        if jsonb_typeof(d) <> 'object'
           or exists (select 1 from jsonb_object_keys(d) k where k not in ('image', 'textes', 'lien')) then
          raise exception 'themes.sections : diapo invalide %', d using errcode = 'check_violation';
        end if;
        if d ? 'textes' then
          perform private.valide_textes(d -> 'textes', 'themes.sections.bannieres');
        end if;
        if d ? 'image' then
          if jsonb_typeof(d -> 'image') <> 'object'
             or exists (select 1 from jsonb_object_keys(d -> 'image') k where k not in ('chemin', 'chemin_portrait'))
             or jsonb_typeof(d -> 'image' -> 'chemin') is distinct from 'string' then
            raise exception 'themes.sections : image de diapo invalide %', d -> 'image' using errcode = 'check_violation';
          end if;
          perform private.valide_chemin(p_boutique_id, d -> 'image' ->> 'chemin');
          perform private.valide_chemin(p_boutique_id, d -> 'image' ->> 'chemin_portrait');
        end if;
        if d ? 'lien' and (jsonb_typeof(d -> 'lien') <> 'string' or (d ->> 'lien') !~ '^/[A-Za-z0-9/_=~%.-]*$'
                           or (d ->> 'lien') like '//%' or (d ->> 'lien') like '%..%') then
          raise exception 'themes.sections : lien interne attendu (« /categorie/… »), pas %', d -> 'lien' using errcode = 'check_violation';
        end if;
      end loop;
    end if;
    -- La pièce de la saison : un produit, par son slug.
    if s ? 'produit' and ((s ->> 'type') <> 'piece' or jsonb_typeof(s -> 'produit') <> 'string'
                          or (s ->> 'produit') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(s ->> 'produit') > 120) then
      raise exception 'themes.sections : produit invalide %, sur une pièce de la saison seulement', s -> 'produit'
        using errcode = 'check_violation';
    end if;
  end loop;
  -- Un seul appel à prendre contact : son formulaire est celui de la page (#contact).
  if (select count(*) from jsonb_array_elements(p_sections) x where x ->> 'type' = 'contact') > 1 then
    raise exception 'themes.sections : une seule section de contact par accueil' using errcode = 'check_violation';
  end if;
  -- Une seule pièce de la saison : sa barre d'achat est celle de la page.
  if (select count(*) from jsonb_array_elements(p_sections) x where x ->> 'type' = 'piece') > 1 then
    raise exception 'themes.sections : une seule pièce de la saison par accueil' using errcode = 'check_violation';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Les prix masqués d'un site vitrine
-- ---------------------------------------------------------------------
insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('vitrine.prix_masques', 'booleen', null, 'false', 'commande', null, true,
     'Prix masqués (site vitrine)',
     'Oui = en site vitrine, les cartes et les fiches ne montrent ni prix ni stock : le visiteur demande. Non = les prix s''affichent. Sans effet sur une boutique qui vend en ligne.', 0);
