-- =====================================================================
-- SkanEcom — 63 · LES PIXELS PUBLICITAIRES (Meta, TikTok)
-- =====================================================================
--
-- En Tunisie, une boutique en ligne vend d'abord par ses publicités
-- Facebook, Instagram et TikTok. Pour savoir ce qu'elles rapportent — et
-- laisser la plateforme les montrer à qui achète —, la vitrine envoie au
-- pixel de la boutique les pages vues, les fiches regardées, les ajouts au
-- panier, la commande ouverte puis passée (son montant, ses références).
--
-- Deux réglages, vides par défaut : l'identifiant du pixel Meta (des
-- chiffres) et celui du pixel TikTok (des lettres et des chiffres). Vides :
-- rien. Remplis : la vitrine demande d'abord l'accord du visiteur — sans
-- lui, aucun script de ces plateformes n'est chargé (lib/pixels.ts) — et la
-- politique de confidentialité le dit.
--
-- La forme de chaque identifiant est vérifiée ici : la vitrine l'écrit dans
-- ses pages, il ne doit rien pouvoir y glisser d'autre.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('pub.pixel_meta', 'texte', null, '""', 'publicite', null, true,
     'Pixel Meta (Facebook, Instagram)',
     'L''identifiant du pixel (des chiffres), dans le gestionnaire d''événements de Meta. Rempli : avec l''accord du visiteur, la vitrine lui envoie les pages vues, les fiches regardées, les ajouts au panier et les commandes. Vide : rien.', 10),
  ('pub.pixel_tiktok', 'texte', null, '""', 'publicite', null, true,
     'Pixel TikTok',
     'L''identifiant du pixel (des lettres et des chiffres), dans le gestionnaire d''événements de TikTok. Rempli : avec l''accord du visiteur, la vitrine lui envoie les mêmes événements. Vide : rien.', 20);

create function private.valide_reglages_pixels()
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
  if new.cle = 'pub.pixel_meta' and v !~ '^[0-9]{10,20}$' then
    raise exception 'Identifiant du pixel Meta illisible : des chiffres seulement (15 ou 16, en général)' using errcode = 'check_violation', hint = 'pixel';
  end if;
  if new.cle = 'pub.pixel_tiktok' and v !~ '^[A-Z0-9]{16,24}$' then
    raise exception 'Identifiant du pixel TikTok illisible : des lettres majuscules et des chiffres (20, en général)' using errcode = 'check_violation', hint = 'pixel';
  end if;
  return new;
end;
$$;

create trigger reglages_valide_pixels
  before insert or update on public.reglages
  for each row when (new.cle in ('pub.pixel_meta', 'pub.pixel_tiktok'))
  execute function private.valide_reglages_pixels();

revoke execute on function private.valide_reglages_pixels() from public, anon, authenticated;
