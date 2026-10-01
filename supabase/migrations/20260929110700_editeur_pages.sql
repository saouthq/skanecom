-- =====================================================================
-- SkanEcom — 68 · L'ÉDITEUR DE LA VITRINE : LES PAGES DE CONTENU
-- =====================================================================
--
-- Troisième pas de l'éditeur (feuille de route E) : les pages de la
-- boutique (« À propos », questions fréquentes, livraison…) s'écrivent à
-- côté de la vraie vitrine, et partent en ligne avec le reste, au même
-- « Publier ».
--
-- 1. Chaque page a son brouillon (`pages_boutique.brouillon` : titre, texte,
--    genre, publiée ou non, au pied de page ou non). Ce que les visiteurs
--    lisent reste dans les colonnes de la page jusqu'à « Publier ».
-- 2. gestion_brouillon_page écrit le brouillon d'une page, ou crée une page
--    (encore hors ligne, son brouillon dedans) ; un brouillon de la vitrine
--    est ouvert au besoin, pour que l'aperçu ait son jeton.
-- 3. « Publier » applique aussi les brouillons des pages ; abandonner le
--    brouillon de la vitrine les abandonne aussi (une page créée dans
--    l'éditeur reste, hors ligne).
-- 4. L'aperçu : apercu_apparence rend les pages telles que le brouillon les
--    montre (le pied de page, le menu), apercu_page une page avec son
--    brouillon — même hors ligne : c'est pour la relire avant de la publier.

-- ---------------------------------------------------------------------
-- 1. Le brouillon d'une page
-- ---------------------------------------------------------------------
alter table public.pages_boutique
  add column brouillon jsonb,
  add column brouillon_le timestamptz,
  add column brouillon_par uuid references auth.users (id) on delete set null;

comment on column public.pages_boutique.brouillon is
  'Le brouillon de la page écrit dans l''éditeur de la vitrine ({titre_fr, corps_fr, genre, publie, dans_pied}) : en ligne à « Publier ». NULL : rien en attente.';

create function private.valide_page_brouillon(p_contenu jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_contenu) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_contenu) k where k not in ('titre_fr', 'corps_fr', 'genre', 'publie', 'dans_pied'))
     or not (p_contenu ?& array['titre_fr', 'corps_fr', 'genre', 'publie', 'dans_pied'])
     or jsonb_typeof(p_contenu -> 'titre_fr') <> 'string' or jsonb_typeof(p_contenu -> 'corps_fr') <> 'string'
     or jsonb_typeof(p_contenu -> 'publie') <> 'boolean' or jsonb_typeof(p_contenu -> 'dans_pied') <> 'boolean' then
    raise exception 'Page : {titre_fr, corps_fr, genre, publie, dans_pied} attendu' using errcode = 'check_violation', hint = 'forme';
  end if;
  if char_length(btrim(p_contenu ->> 'titre_fr')) not between 2 and 80 then
    raise exception 'Le titre compte de 2 à 80 caractères' using errcode = 'check_violation', hint = 'titre';
  end if;
  if char_length(p_contenu ->> 'corps_fr') > 20000 then
    raise exception 'Texte trop long (20 000 caractères au plus)' using errcode = 'check_violation', hint = 'corps';
  end if;
  if (p_contenu ->> 'genre') not in ('texte', 'questions') then
    raise exception 'Genre de page inconnu' using errcode = 'check_violation', hint = 'genre';
  end if;
end;
$$;

revoke execute on function private.valide_page_brouillon(jsonb) from public, anon, authenticated;

-- Le brouillon de la vitrine, ouvert au besoin (ce qui est publié, recopié) :
-- l'aperçu d'une page passe par son jeton.
create function private.brouillon_vitrine(p_boutique_id uuid)
returns public.themes_brouillons
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.themes_brouillons;
begin
  insert into public.themes_brouillons (boutique_id, contenu, updated_by)
  select t.boutique_id, jsonb_build_object('code', t.code, 'couleurs', t.couleurs, 'polices', t.polices, 'style', t.style), auth.uid()
    from public.themes t where t.boutique_id = p_boutique_id
  on conflict (boutique_id) do nothing;
  select * into v from public.themes_brouillons b where b.boutique_id = p_boutique_id;
  return v;
end;
$$;

revoke execute on function private.brouillon_vitrine(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Écrire le brouillon d'une page, ou créer une page
-- ---------------------------------------------------------------------
-- `p_page` : {id, version, contenu} pour une page (contenu NULL : son
-- brouillon abandonné) ; {slug, contenu} pour en créer une. La version est
-- celle de la page en ligne, lue à l'ouverture : changée entre-temps, refus.
create function public.gestion_brouillon_page(p_boutique_id uuid, p_page jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_page ->> 'id', '')::uuid;
  v_contenu jsonb := case when jsonb_typeof(p_page -> 'contenu') = 'object' then p_page -> 'contenu' end;
  v_avant public.pages_boutique;
  v_apres public.pages_boutique;
  v_brouillon public.themes_brouillons;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not exists (select 1 from public.themes t where t.boutique_id = p_boutique_id) then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  if v_contenu is not null then
    perform private.valide_page_brouillon(v_contenu);
  end if;

  if v_id is null then
    if v_contenu is null then
      raise exception 'Une page neuve a besoin de son titre et de son texte' using errcode = 'check_violation', hint = 'forme';
    end if;
    begin
      insert into public.pages_boutique (boutique_id, slug, genre, titre_fr, corps_fr, publie, dans_pied, position, updated_by,
                                         brouillon, brouillon_le, brouillon_par)
      values (p_boutique_id, lower(btrim(coalesce(p_page ->> 'slug', ''))), v_contenu ->> 'genre', btrim(v_contenu ->> 'titre_fr'), '',
              false, (v_contenu ->> 'dans_pied')::boolean,
              (select coalesce(max(p.position), 0) + 1 from public.pages_boutique p where p.boutique_id = p_boutique_id),
              auth.uid(), v_contenu, now(), auth.uid())
      returning * into v_apres;
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
        else
          raise;
        end if;
    end;
    perform private.console_trace(auth.uid(), p_boutique_id, 'page.creer', v_apres.id::text, null,
      jsonb_build_object('slug', v_apres.slug, 'titre', v_apres.titre_fr, 'publie', false, 'brouillon', true));
  else
    select * into v_avant from public.pages_boutique p where p.boutique_id = p_boutique_id and p.id = v_id for update;
    if not found then
      raise exception 'Page introuvable' using errcode = 'check_violation', hint = 'page';
    end if;
    if nullif(p_page ->> 'version', '')::integer is distinct from v_avant.version then
      raise exception 'Cette page a été modifiée entre-temps : rechargez-la avant d''écrire' using errcode = 'check_violation', hint = 'version';
    end if;
    update public.pages_boutique p
       set brouillon = v_contenu,
           brouillon_le = case when v_contenu is null then null else now() end,
           brouillon_par = case when v_contenu is null then null else auth.uid() end
     where p.id = v_id
    returning * into v_apres;
  end if;

  -- Le brouillon de la vitrine avance d'une version : l'aperçu (son adresse
  -- interne porte la version) rend la page telle qu'elle est maintenant.
  perform private.brouillon_vitrine(p_boutique_id);
  update public.themes_brouillons b set version = b.version + 1, updated_at = now(), updated_by = auth.uid()
   where b.boutique_id = p_boutique_id
  returning * into v_brouillon;
  return jsonb_build_object('id', v_apres.id, 'slug', v_apres.slug, 'version', v_apres.version,
                            'jeton', v_brouillon.jeton, 'brouillon_version', v_brouillon.version);
end;
$$;

comment on function public.gestion_brouillon_page(uuid, jsonb) is
  'Écrit le brouillon d''une page de la boutique ({id, version, contenu} ; contenu NULL l''abandonne) ou crée une page hors ligne, son brouillon dedans ({slug, contenu}) — propriétaire, administrateur. La version de la page en ligne lue est exigée (indice « version ») ; la forme est vérifiée (indices « forme », « titre », « corps », « genre », « slug »). Ouvre au besoin le brouillon de la vitrine, le fait avancer d''une version et rend son jeton et sa version : rien n''est en ligne avant « Publier ».';

revoke execute on function public.gestion_brouillon_page(uuid, jsonb) from public, anon;
grant  execute on function public.gestion_brouillon_page(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Lire, abandonner, publier : les pages avec le reste
-- ---------------------------------------------------------------------
create or replace function public.gestion_apparence(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_theme public.themes;
  v_brouillon public.themes_brouillons;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_theme from public.themes t where t.boutique_id = p_boutique_id;
  select * into v_brouillon from public.themes_brouillons b where b.boutique_id = p_boutique_id;
  return jsonb_build_object(
    'theme', v_theme.boutique_id is not null,
    'version', v_theme.version,
    'publie', case when v_theme.boutique_id is null then null else jsonb_build_object(
      'code', v_theme.code, 'couleurs', v_theme.couleurs, 'polices', v_theme.polices, 'style', v_theme.style,
      'sections', v_theme.sections) end,
    'reglages', (select jsonb_object_agg(c.cle, coalesce(r.valeur, c.defaut))
                   from plateforme.reglages_catalogue c
                   left join public.reglages r on r.boutique_id = p_boutique_id and r.cle = c.cle
                  where c.cle = any (private.reglages_editeur())),
    -- Les pages : ce qui est en ligne, et leur brouillon.
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'slug', p.slug, 'genre', p.genre, 'titre_fr', p.titre_fr, 'corps_fr', p.corps_fr,
               'publie', p.publie, 'dans_pied', p.dans_pied, 'position', p.position, 'version', p.version,
               'brouillon', p.brouillon)
             order by p.position, p.titre_fr)
        from public.pages_boutique p where p.boutique_id = p_boutique_id), '[]'::jsonb),
    'modifie_le', v_theme.updated_at,
    'modifie_par', (select u.email from auth.users u where u.id = v_theme.updated_by),
    'brouillon', case when v_brouillon.boutique_id is null then null else jsonb_build_object(
      'contenu', v_brouillon.contenu, 'version', v_brouillon.version, 'jeton', v_brouillon.jeton, 'modifie_le', v_brouillon.updated_at,
      'modifie_par', (select u.email from auth.users u where u.id = v_brouillon.updated_by)) end
  );
end;
$$;

create or replace function public.gestion_brouillon_apparence(p_boutique_id uuid, p_contenu jsonb, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.themes_brouillons;
  v_version integer;
  v_jeton uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not exists (select 1 from public.themes t where t.boutique_id = p_boutique_id) then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  select * into v_avant from public.themes_brouillons b where b.boutique_id = p_boutique_id for update;
  if v_avant.version is distinct from p_version then
    raise exception 'Le brouillon a été modifié entre-temps : rechargez-le avant d''enregistrer'
      using errcode = 'check_violation', hint = 'version';
  end if;

  if p_contenu is null then
    delete from public.themes_brouillons b where b.boutique_id = p_boutique_id;
    -- Les brouillons des pages s'en vont avec (une page créée dans l'éditeur reste, hors ligne).
    update public.pages_boutique p set brouillon = null, brouillon_le = null, brouillon_par = null
     where p.boutique_id = p_boutique_id and p.brouillon is not null;
    -- Les photos que seul le brouillon employait.
    return jsonb_build_object('version', null, 'jeton', null, 'orphelins', coalesce((
      select jsonb_agg(c order by c)
        from private.photos_sections(v_avant.contenu -> 'sections') c
       where c not in (select private.photos_sections(t.sections) from public.themes t where t.boutique_id = p_boutique_id)), '[]'::jsonb));
  end if;

  perform private.valide_contenu_apparence(p_boutique_id, p_contenu);
  perform private.valide_reglages_brouillon(p_boutique_id, p_contenu -> 'reglages');
  insert into public.themes_brouillons as b (boutique_id, contenu, updated_by)
  values (p_boutique_id, p_contenu, auth.uid())
  on conflict (boutique_id) do update
     set contenu = excluded.contenu, version = b.version + 1, updated_at = now(), updated_by = auth.uid()
  returning b.version, b.jeton into v_version, v_jeton;
  return jsonb_build_object('version', v_version, 'jeton', v_jeton);
end;
$$;

create or replace function public.gestion_publier_apparence(p_boutique_id uuid, p_contenu jsonb, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.themes;
  v_apres public.themes;
  v_brouillon jsonb;
  v_reglages_avant jsonb;
  v_pages jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_avant from public.themes t where t.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  if p_version is distinct from v_avant.version then
    raise exception 'L''apparence a été modifiée entre-temps : rechargez-la avant de publier'
      using errcode = 'check_violation', hint = 'version';
  end if;
  perform private.valide_contenu_apparence(p_boutique_id, p_contenu);
  perform private.valide_reglages_brouillon(p_boutique_id, p_contenu -> 'reglages');
  select b.contenu into v_brouillon from public.themes_brouillons b where b.boutique_id = p_boutique_id;

  update public.themes t
     set code = p_contenu ->> 'code', couleurs = p_contenu -> 'couleurs', polices = p_contenu -> 'polices',
         style = p_contenu -> 'style',
         -- Sans `sections`, l'accueil publié reste tel quel.
         sections = case when p_contenu ? 'sections' then
                      case when jsonb_typeof(p_contenu -> 'sections') = 'array' then p_contenu -> 'sections' else null end
                    else t.sections end,
         updated_by = auth.uid()
   where t.boutique_id = p_boutique_id
  returning * into v_apres;

  -- Les réglages de la vitrine changés dans l'éditeur.
  if jsonb_typeof(p_contenu -> 'reglages') = 'object' then
    select jsonb_object_agg(e.key, r.valeur) into v_reglages_avant
      from jsonb_each(p_contenu -> 'reglages') e
      left join public.reglages r on r.boutique_id = p_boutique_id and r.cle = e.key;
    insert into public.reglages as r (boutique_id, cle, valeur)
    select p_boutique_id, e.key, e.value from jsonb_each(p_contenu -> 'reglages') e
    on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
  end if;

  -- Les pages écrites dans l'éditeur : leur brouillon passe en ligne.
  with publiees as (
    update public.pages_boutique p
       set titre_fr = btrim(p.brouillon ->> 'titre_fr'), corps_fr = p.brouillon ->> 'corps_fr', genre = p.brouillon ->> 'genre',
           publie = (p.brouillon ->> 'publie')::boolean, dans_pied = (p.brouillon ->> 'dans_pied')::boolean,
           version = p.version + 1, updated_by = auth.uid(), brouillon = null, brouillon_le = null, brouillon_par = null
     where p.boutique_id = p_boutique_id and p.brouillon is not null
    returning p.slug, p.publie
  )
  select jsonb_agg(jsonb_build_object('slug', slug, 'publie', publie) order by slug) into v_pages from publiees;
  delete from public.themes_brouillons b where b.boutique_id = p_boutique_id;

  perform private.console_trace(auth.uid(), p_boutique_id, 'apparence.publier', 'apparence',
    jsonb_build_object('code', v_avant.code, 'couleurs', v_avant.couleurs, 'polices', v_avant.polices, 'style', v_avant.style,
                       'sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) x))
      || case when v_reglages_avant is null then '{}'::jsonb else jsonb_build_object('reglages', v_reglages_avant) end,
    (p_contenu - 'sections') || jsonb_build_object('sections',
      (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_apres.sections, '[]'::jsonb)) x))
      || case when v_pages is null then '{}'::jsonb else jsonb_build_object('pages', v_pages) end);
  -- Les photos que plus rien n'emploie : celles de l'accueil d'avant et du
  -- brouillon que le nouvel accueil n'a pas gardées.
  return jsonb_build_object('version', v_apres.version, 'pages', coalesce(v_pages, '[]'::jsonb), 'orphelins', coalesce((
    select jsonb_agg(c order by c)
      from (select private.photos_sections(v_avant.sections) c
            union
            select private.photos_sections(v_brouillon -> 'sections')) a
     where c not in (select private.photos_sections(v_apres.sections))), '[]'::jsonb));
end;
$$;

comment on function public.gestion_publier_apparence(uuid, jsonb, integer) is
  'Publie la vitrine (propriétaire, administrateur) : structure, couleurs, polices, style et, si le contenu en porte, l''accueil et les réglages de l''en-tête et du pied de page ; les brouillons des pages passent en ligne ; le brouillon s''efface. La version du thème lue est exigée (indice « version »), la forme est vérifiée. Rend la nouvelle version, les pages publiées et les photos que plus rien n''emploie (orphelins). Tracé au journal (apparence.publier).';

-- ---------------------------------------------------------------------
-- 4. L'aperçu : les pages telles que le brouillon les montre
-- ---------------------------------------------------------------------
create or replace function public.apercu_apparence(p_slug text, p_jeton uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select b.contenu || jsonb_build_object('pages', coalesce((
           select jsonb_agg(jsonb_build_object(
                    'slug', p.slug, 'titre_fr', coalesce(btrim(p.brouillon ->> 'titre_fr'), p.titre_fr), 'titre_ar', p.titre_ar,
                    'genre', coalesce(p.brouillon ->> 'genre', p.genre),
                    'dans_pied', coalesce((p.brouillon ->> 'dans_pied')::boolean, p.dans_pied))
                  order by p.position, p.titre_fr)
             from public.pages_boutique p
            where p.boutique_id = b.boutique_id and coalesce((p.brouillon ->> 'publie')::boolean, p.publie)), '[]'::jsonb))
    from public.themes_brouillons b
    join plateforme.boutiques x on x.id = b.boutique_id
   where x.slug = p_slug and x.statut = 'active' and b.jeton = p_jeton;
$$;

comment on function public.apercu_apparence(text, uuid) is
  'Le brouillon de la vitrine d''une boutique ouverte (apparence, accueil, réglages, et ses pages telles que le brouillon les montre), pour qui présente le jeton de son aperçu ; NULL sinon.';

-- Une page avec son brouillon, même hors ligne : on la relit avant de la publier.
create function public.apercu_page(p_slug text, p_jeton uuid, p_page text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', p.slug, 'genre', coalesce(p.brouillon ->> 'genre', p.genre),
    'titre_fr', coalesce(btrim(p.brouillon ->> 'titre_fr'), p.titre_fr), 'titre_ar', p.titre_ar,
    'corps_fr', coalesce(p.brouillon ->> 'corps_fr', p.corps_fr), 'corps_ar', p.corps_ar,
    'modifiee_le', coalesce(p.brouillon_le, p.updated_at))
    from public.pages_boutique p
    join public.themes_brouillons b on b.boutique_id = p.boutique_id and b.jeton = p_jeton
    join plateforme.boutiques x on x.id = p.boutique_id and x.slug = p_slug and x.statut = 'active'
   where p.slug = p_page;
$$;

comment on function public.apercu_page(text, uuid, text) is
  'Une page d''une boutique ouverte telle que son brouillon la montre — même hors ligne —, pour qui présente le jeton de l''aperçu de la vitrine ; NULL sinon.';

grant execute on function public.apercu_page(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Ranger, retirer : l'aperçu suit
-- ---------------------------------------------------------------------
-- L'ordre et le retrait d'une page sont aussitôt en ligne (comme avant
-- l'éditeur) ; un brouillon de la vitrine ouvert avance d'une version, pour
-- que l'aperçu (son adresse interne porte la version) rende le pied de page
-- tel qu'il est maintenant. Rendent la version et le jeton du brouillon
-- (NULL sans brouillon).
create function private.brouillon_avance(p_boutique_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with b as (
    update public.themes_brouillons b set version = b.version + 1, updated_at = now(), updated_by = auth.uid()
     where b.boutique_id = p_boutique_id
    returning b.version, b.jeton
  )
  select jsonb_build_object('version', (select version from b), 'jeton', (select jeton from b));
$$;

revoke execute on function private.brouillon_avance(uuid) from public, anon, authenticated;

drop function public.gestion_retirer_page(uuid, uuid);
create function public.gestion_retirer_page(p_boutique_id uuid, p_id uuid)
returns jsonb
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
  return private.brouillon_avance(p_boutique_id);
end;
$$;

drop function public.gestion_ordonner_pages(uuid, uuid[]);
create function public.gestion_ordonner_pages(p_boutique_id uuid, p_ids uuid[])
returns jsonb
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
  return private.brouillon_avance(p_boutique_id);
end;
$$;

revoke execute on function public.gestion_retirer_page(uuid, uuid)     from public, anon;
revoke execute on function public.gestion_ordonner_pages(uuid, uuid[]) from public, anon;
grant  execute on function public.gestion_retirer_page(uuid, uuid)     to authenticated;
grant  execute on function public.gestion_ordonner_pages(uuid, uuid[]) to authenticated;
