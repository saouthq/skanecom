-- =====================================================================
-- SkanEcom · jeu de démonstration : LES LOTS (migration 86)
-- =====================================================================
-- Maison Selma a le module « promotions » (seed-promotions.sql) : deux lots
-- pour la démonstration, à des prix plus bas que leurs pièces une à une —
--   · « La tenue du week-end » : la chemise ample en lin (159) et les
--     mocassins en cuir (249) — 359,000 au lieu de 408,000 ;
--   · « Le vestiaire de l'homme » : le polo en coton piqué (99), le pull col
--     rond en coton (149) et le blazer en laine froide (459) — 599,000 au
--     lieu de 707,000.
-- Maymar ne l'a pas (sa charte refuse la promotion).
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  l record;
  v_lot uuid;
begin
  for l in
    select * from (values
      (0, 'La tenue du week-end', 'Le lin et le cuir, pour les après-midi d''été.', 359000::bigint,
       array['chemise-lin-ample', 'mocassins-cuir']),
      (1, 'Le vestiaire de l''homme', 'Du polo au blazer : la semaine entière, en trois pièces.', 599000::bigint,
       array['polo-coton-pique', 'pull-col-rond-coton', 'blazer-laine-froide'])
    ) as x(position, nom, accroche, prix, slugs)
  loop
    continue when exists (select 1 from public.lots where boutique_id = s and nom = l.nom);
    -- Chaque produit doit être là, en vente : sinon, pas de lot.
    continue when (select count(*) from public.produits p
                    where p.boutique_id = s and p.slug = any(l.slugs) and p.publie) <> cardinality(l.slugs);
    insert into public.lots (boutique_id, nom, accroche, prix_millimes, position)
    values (s, l.nom, l.accroche, l.prix, l.position)
    returning id into v_lot;
    insert into public.lot_produits (boutique_id, lot_id, produit_id, position)
    select s, v_lot, p.id, array_position(l.slugs, p.slug) - 1
      from public.produits p
     where p.boutique_id = s and p.slug = any(l.slugs);
  end loop;
end;
$$;
