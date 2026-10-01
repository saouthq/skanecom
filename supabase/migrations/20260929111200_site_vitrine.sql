-- =====================================================================
-- SkanEcom — 73 · LE SITE VITRINE (SANS COMMANDE EN LIGNE)
-- =====================================================================
--
-- Les structures de vitrine (feuille de route E6) : certaines boutiques ne
-- veulent pas — pas encore — de commande en ligne. Un artisan sur mesure,
-- un grossiste, un showroom : le site présente le catalogue, ses prix et
-- son stock, et le client écrit, appelle ou passe. « Fais les deux et
-- mets-le en réglage » : coupé par défaut, la vitrine reste une boutique.
--
-- 1. Le réglage `vitrine.site_vitrine` (public : la vitrine le lit) : plus
--    de panier ni de commande sur le site ; la fiche propose WhatsApp,
--    l'appel ou l'e-mail, avec le produit et sa référence.
-- 2. La base y veille : une commande ne s'enregistre plus pour une boutique
--    en site vitrine (public.passer_commande, l'achat express, un devis
--    accepté passent tous par là). L'historique reste : on peut repasser en
--    boutique à tout moment.

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('vitrine.site_vitrine', 'booleen', null, 'false', 'commande', null, true,
     'Site vitrine, sans commande en ligne',
     'Oui = le site présente le catalogue (prix, stock, fiches) sans panier ni commande : la fiche propose WhatsApp, l''appel ou l''e-mail. Non = une boutique en ligne.', 0);

create function private.refuse_commande_site_vitrine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((private.reglage(new.boutique_id, 'vitrine.site_vitrine'))::boolean, false) then
    raise exception 'Cette boutique ne prend pas de commande en ligne : écrivez-lui ou appelez-la'
      using errcode = 'check_violation', hint = 'paiement';
  end if;
  return new;
end;
$$;

revoke execute on function private.refuse_commande_site_vitrine() from public, anon, authenticated;

comment on function private.refuse_commande_site_vitrine() is
  'En site vitrine (réglage vitrine.site_vitrine), aucune commande ne s''enregistre ; l''historique reste.';

create trigger commandes_site_vitrine
  before insert on public.commandes
  for each row execute function private.refuse_commande_site_vitrine();
