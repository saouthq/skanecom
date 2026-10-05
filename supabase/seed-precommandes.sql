-- =====================================================================
-- SkanEcom · jeu de démonstration : LES PRÉCOMMANDES SUR ARRIVAGE (migration 88)
-- =====================================================================
-- Maison Selma allume « Précommandes sur arrivage » et annonce un
-- conteneur, dans douze jours, qui apporte trois déclinaisons épuisées :
--   · le polo en coton piqué, vert olive, XL — 6 pièces ;
--   · les mocassins en cuir, noir, pointure 44 — 4 pièces ;
--   · la chemise en popeline, bleu ciel, L — 5 pièces.
-- Leur fiche les propose en précommande, avec la date ; la commande attend
-- l'arrivage dans l'onglet « Précommandes ». Les autres boutiques n'ont
-- rien (réglage coupé par défaut).
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  v_arrivage uuid;
begin
  if not exists (select 1 from plateforme.boutiques where id = s) then return; end if;

  insert into public.reglages (boutique_id, cle, valeur)
  values (s, 'catalogue.precommandes', 'true')
  on conflict (boutique_id, cle) do nothing;

  if exists (select 1 from public.arrivages where boutique_id = s and nom = 'Le conteneur de Marseille') then return; end if;

  insert into public.arrivages (boutique_id, nom, date_prevue, note)
  values (s, 'Le conteneur de Marseille', (now() at time zone 'Africa/Tunis')::date + 12, 'Commande d''automne : polos, mocassins, chemises.')
  returning id into v_arrivage;

  insert into public.arrivage_lignes (boutique_id, arrivage_id, variante_id, quantite)
  select s, v_arrivage, v.id, x.quantite
    from (values ('SEL14-VER-XL', 6), ('SEL18-NOI-44', 4), ('SEL12-BLE-L', 5)) as x(sku, quantite)
    join public.variantes v on v.boutique_id = s and v.sku = x.sku and v.actif;
end;
$$;
