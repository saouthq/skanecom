-- =====================================================================
-- SkanEcom — 65 · UNE TROISIÈME STRUCTURE : BENTO
-- =====================================================================
--
-- Les structures de vitrine (feuille de route E) : à côté de l'éditoriale
-- et de la technique, le BENTO — l'accueil en mosaïque de tuiles, l'en-tête
-- flottant en pilule. Il repose sur les composants éditoriaux (ses fiches,
-- son catalogue, son tunnel) : `themes.code` dit la structure choisie,
-- l'application en déduit la famille de composants (lib/theme.ts).
--
-- 1. themes.code accepte « bento » ; la validation d'un brouillon ou d'une
--    publication d'apparence aussi (private.valide_contenu_apparence).
-- 2. Rien d'autre ne change : une boutique garde sa structure tant qu'elle
--    n'en choisit pas une autre (écran « Apparence »).

alter table public.themes drop constraint themes_code_check;
alter table public.themes add constraint themes_code_check check (code in ('editorial', 'technique', 'bento'));

comment on column public.themes.code is
  'La structure de la vitrine : editorial, technique, bento (l''accueil en mosaïque, sur les composants éditoriaux).';

create or replace function private.valide_contenu_apparence(p_contenu jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_contenu) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_contenu) k where k not in ('code', 'couleurs', 'polices', 'style'))
     or not (p_contenu ? 'code' and p_contenu ? 'couleurs' and p_contenu ? 'polices' and p_contenu ? 'style') then
    raise exception 'Apparence : {code, couleurs, polices, style} attendu' using errcode = 'check_violation', hint = 'forme';
  end if;
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento') then
    raise exception 'Apparence : structure inconnue %', p_contenu -> 'code' using errcode = 'check_violation', hint = 'forme';
  end if;
  begin
    perform private.valide_apparence(p_contenu -> 'couleurs', p_contenu -> 'polices', p_contenu -> 'style');
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'check_violation', hint = 'forme';
  end;
end;
$$;
