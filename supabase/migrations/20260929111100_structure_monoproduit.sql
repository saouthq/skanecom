-- =====================================================================
-- SkanEcom — 72 · LA STRUCTURE MONOPRODUIT
-- =====================================================================
--
-- Les structures de vitrine (feuille de route E) : le MONOPRODUIT — la
-- boutique qui vend surtout une pièce, par la publicité (Facebook,
-- TikTok). L'accueil devient une page de vente : les photos du produit,
-- sa promesse, sa note, les offres par quantité (migration 71) en grandes
-- cartes, le formulaire de commande sur la page même ; au téléphone, une
-- barre « Commander » qui y ramène. Le produit vendu est celui de la
-- section « piece » (migration 69) ; le reste de la vitrine (catalogue,
-- fiches, panier, tunnel) reste celui du gabarit éditorial. `themes.code`
-- dit la structure (lib/theme.ts).
--
-- 1. themes.code accepte « monoproduit » ; la validation d'un brouillon ou
--    d'une publication d'apparence aussi. Rien d'autre ne change : la
--    commande passe par public.passer_commande, comme l'achat express.

alter table public.themes drop constraint themes_code_check;
alter table public.themes add constraint themes_code_check check (code in ('editorial', 'technique', 'bento', 'immersif', 'commerce', 'monoproduit'));

comment on column public.themes.code is
  'La structure de la vitrine : editorial, technique, bento (la mosaïque), immersif (le plein écran), monoproduit (la page de vente) — ces trois-là sur les composants éditoriaux —, commerce (la recherche d''abord, sur les composants techniques).';

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
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento', 'immersif', 'commerce', 'monoproduit') then
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

-- 2. L'entonnoir des visites (migration 56) se lit sur les pages vues : une
--    fiche (1), /commande (3), la page de fin (4). La page de vente montre
--    le produit et ouvre la commande sur l'accueil même : elle signale ces
--    deux étapes elle-même — le produit regardé, le formulaire commencé —,
--    comme la vitrine signale l'ajout au panier (2). Toujours sans donnée
--    personnelle, et sans visite comptée ce jour, rien.
create function public.compter_etape(p_boutique_id uuid, p_cle text, p_etape smallint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'Africa/Tunis')::date;
  v_sel  bytea;
begin
  -- La page de fin (4) se lit toujours sur la page vue : une commande passée ne se déclare pas.
  if p_cle is null or char_length(p_cle) not between 16 and 128 or p_etape is null or p_etape not between 1 and 3 then
    return;
  end if;
  select s.sel into v_sel from private.sels_visites s where s.jour = v_jour;
  if v_sel is null then
    return;
  end if;
  update public.vitrine_visites v set etape = p_etape
   where v.boutique_id = p_boutique_id and v.jour = v_jour and v.etape < p_etape
     and v.empreinte = sha256(v_sel || convert_to(p_boutique_id::text || p_cle, 'UTF8'));
end;
$$;

comment on function public.compter_etape(uuid, text, smallint) is
  'Une étape de l''entonnoir franchie hors des pages qui la disent (la page de vente du Monoproduit) : 1 le produit regardé, 2 un ajout au panier, 3 la commande commencée.';

revoke execute on function public.compter_etape(uuid, text, smallint) from public;
grant  execute on function public.compter_etape(uuid, text, smallint) to anon, authenticated;
