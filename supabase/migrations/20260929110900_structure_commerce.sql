-- =====================================================================
-- SkanEcom — 70 · LA STRUCTURE COMMERCE
-- =====================================================================
--
-- Les structures de vitrine (feuille de route E) : le COMMERCE — high-tech,
-- électroménager, outillage, grande distribution. On vient chercher une
-- référence : la recherche d'abord (dans l'en-tête et sur l'ouverture), le
-- grand menu des rayons, les services en bande, les références en grille
-- dense (prix, stock, prix pro), la comparaison côte à côte ; au
-- téléphone, une barre d'onglets. Il repose sur les composants techniques
-- (fiches, catalogue, tunnel) ; `themes.code` dit la structure
-- (lib/theme.ts).
--
-- 1. themes.code accepte « commerce » ; la validation d'un brouillon ou
--    d'une publication d'apparence aussi. Rien d'autre ne change : la
--    comparaison se fait dans le navigateur, sur les fiches publiques.

alter table public.themes drop constraint themes_code_check;
alter table public.themes add constraint themes_code_check check (code in ('editorial', 'technique', 'bento', 'immersif', 'commerce'));

comment on column public.themes.code is
  'La structure de la vitrine : editorial, technique, bento (la mosaïque), immersif (le plein écran) — ces deux-là sur les composants éditoriaux —, commerce (la recherche d''abord, sur les composants techniques).';

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
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento', 'immersif', 'commerce') then
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
