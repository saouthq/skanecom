-- =====================================================================
-- SkanEcom — 67 · L'ÉDITEUR DE LA VITRINE : L'EN-TÊTE ET LE PIED DE PAGE
-- =====================================================================
--
-- Deuxième pas de l'éditeur (feuille de route E) : ce que disent l'en-tête
-- et le pied de page de la vitrine se règle aussi à côté de la vraie
-- vitrine, dans le même brouillon que le style et l'accueil — l'annonce en
-- tête du site, les réseaux, le bouton WhatsApp, les horaires du service
-- client.
--
-- 1. Le contenu d'un brouillon peut porter `reglages` : les réglages de la
--    vitrine que l'éditeur a changés (et eux seuls), {clé: valeur}. Ils sont
--    vérifiés par les règles mêmes de la table des réglages (types, longueur
--    de l'annonce, forme des comptes) : un essai d'écriture, défait aussitôt.
-- 2. « Publier » les écrit dans les réglages de la boutique, avec le style et
--    l'accueil ; le journal garde leurs valeurs d'avant et d'après.
-- 3. La vitrine en aperçu les lit dans le brouillon (application :
--    chargeCadre), les visiteurs ne voient que ceux publiés.

-- ---------------------------------------------------------------------
-- 1. Les réglages que l'éditeur règle, et leur vérification
-- ---------------------------------------------------------------------
create function private.reglages_editeur()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['vitrine.annonce', 'contact.instagram', 'contact.facebook', 'contact.tiktok', 'contact.horaires', 'vitrine.whatsapp_flottant']
$$;

revoke execute on function private.reglages_editeur() from public, anon, authenticated;

-- Chaque valeur passe par les déclencheurs de public.reglages (type du
-- catalogue, private.valide_reglages_vitrine) dans une sous-transaction
-- annulée : la règle est écrite une fois, au même endroit. Un refus garde
-- son indice (« limite », « reseau »), à défaut « forme ».
create function private.valide_reglages_brouillon(p_boutique_id uuid, p_reglages jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cle text;
  v_valeur jsonb;
  v_message text;
  v_indice text;
begin
  if p_reglages is null then
    return;
  end if;
  if jsonb_typeof(p_reglages) <> 'object' then
    raise exception 'Apparence : les réglages de la vitrine forment un objet' using errcode = 'check_violation', hint = 'forme';
  end if;
  for v_cle, v_valeur in select e.key, e.value from jsonb_each(p_reglages) e loop
    if not (v_cle = any (private.reglages_editeur())) then
      raise exception 'Apparence : le réglage % ne se règle pas dans l''éditeur', v_cle using errcode = 'check_violation', hint = 'forme';
    end if;
    begin
      insert into public.reglages as r (boutique_id, cle, valeur) values (p_boutique_id, v_cle, v_valeur)
      on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
      raise exception '__essai__' using errcode = 'P0001';
    exception
      when sqlstate 'P0001' then
        if sqlerrm <> '__essai__' then
          raise;
        end if;
      when check_violation then
        get stacked diagnostics v_message = message_text, v_indice = pg_exception_hint;
        raise exception '%', v_message using errcode = 'check_violation', hint = coalesce(nullif(v_indice, ''), 'forme');
    end;
  end loop;
end;
$$;

revoke execute on function private.valide_reglages_brouillon(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Le contenu : l'apparence, l'accueil, les réglages de la vitrine
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
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento') then
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

-- ---------------------------------------------------------------------
-- 3. Lire : les réglages de la vitrine publiés, avec l'apparence
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
    -- Les réglages de la vitrine en vigueur (ceux de la boutique, sinon ceux du catalogue).
    'reglages', (select jsonb_object_agg(c.cle, coalesce(r.valeur, c.defaut))
                   from plateforme.reglages_catalogue c
                   left join public.reglages r on r.boutique_id = p_boutique_id and r.cle = c.cle
                  where c.cle = any (private.reglages_editeur())),
    'modifie_le', v_theme.updated_at,
    'modifie_par', (select u.email from auth.users u where u.id = v_theme.updated_by),
    'brouillon', case when v_brouillon.boutique_id is null then null else jsonb_build_object(
      'contenu', v_brouillon.contenu, 'version', v_brouillon.version, 'jeton', v_brouillon.jeton, 'modifie_le', v_brouillon.updated_at,
      'modifie_par', (select u.email from auth.users u where u.id = v_brouillon.updated_by)) end
  );
end;
$$;

comment on function public.gestion_apparence(uuid) is
  'La vitrine de la boutique pour son équipe : ce qui est publié (structure, couleurs, polices, style, sections de l''accueil — NULL : celles de la structure), les réglages de la vitrine en vigueur (annonce, réseaux, bouton WhatsApp, horaires), la version du thème, le brouillon en cours (sa version, qui et quand).';

comment on function public.gestion_brouillon_apparence(uuid, jsonb, integer) is
  'Enregistre le brouillon de la vitrine — apparence, accueil, réglages de l''en-tête et du pied de page (propriétaire, administrateur ; NULL l''abandonne et rend les photos que lui seul employait, orphelins). La version du brouillon lue est exigée (indice « version », NULL s''il n''y en avait pas), la forme est vérifiée (indices « forme », « vide », et ceux des réglages : « limite », « reseau »). Ne touche ni au thème ni aux réglages publiés.';

-- ---------------------------------------------------------------------
-- 4. Publier : le style, l'accueil et les réglages de la vitrine, d'un coup
-- ---------------------------------------------------------------------
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
  delete from public.themes_brouillons b where b.boutique_id = p_boutique_id;

  perform private.console_trace(auth.uid(), p_boutique_id, 'apparence.publier', 'apparence',
    jsonb_build_object('code', v_avant.code, 'couleurs', v_avant.couleurs, 'polices', v_avant.polices, 'style', v_avant.style,
                       'sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) x))
      || case when v_reglages_avant is null then '{}'::jsonb else jsonb_build_object('reglages', v_reglages_avant) end,
    (p_contenu - 'sections') || jsonb_build_object('sections',
      (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_apres.sections, '[]'::jsonb)) x)));
  -- Les photos que plus rien n'emploie : celles de l'accueil d'avant et du
  -- brouillon que le nouvel accueil n'a pas gardées.
  return jsonb_build_object('version', v_apres.version, 'orphelins', coalesce((
    select jsonb_agg(c order by c)
      from (select private.photos_sections(v_avant.sections) c
            union
            select private.photos_sections(v_brouillon -> 'sections')) a
     where c not in (select private.photos_sections(v_apres.sections))), '[]'::jsonb));
end;
$$;

comment on function public.gestion_publier_apparence(uuid, jsonb, integer) is
  'Publie la vitrine (propriétaire, administrateur) : structure, couleurs, polices, style et, si le contenu en porte, l''accueil et les réglages de l''en-tête et du pied de page ; le brouillon s''efface. La version du thème lue est exigée (indice « version »), la forme est vérifiée (indices « forme », « vide », « limite », « reseau »). Rend la nouvelle version et les photos que plus rien n''emploie (orphelins : de l''accueil d''avant ou du brouillon). Tracé au journal (apparence.publier, avec les réglages d''avant).';
