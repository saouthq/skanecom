-- =====================================================================
-- LE CATALOGUE : LES DÉCLINAISONS ÉPUISÉES, DITES SUR LA LIGNE DU PRODUIT
-- (passe du backoffice, 06/10) — « Aujourd'hui » disait « 1 déclinaison
-- épuisée », la ligne du produit ne disait rien tant qu'il en restait
-- d'autres en stock. La liste rend aussi leur nombre ; les filtres ne
-- changent pas (« Stock bas » : sous le seuil, pas à zéro ; « En
-- rupture » : plus rien en stock).
-- =====================================================================

create or replace function public.gestion_liste_produits(
  p_boutique_id uuid,
  p_filtre      text default 'tous',
  p_recherche   text default null,
  p_limite      integer default 60,
  p_decalage    integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_filtre text := coalesce(p_filtre, 'tous');
  v_sortie jsonb;
begin
  perform private.catalogue_exige(p_boutique_id);
  if v_filtre not in ('tous', 'publies', 'brouillons', 'stock_bas', 'rupture') then
    raise exception 'Filtre inconnu : %', v_filtre using errcode = 'check_violation', hint = 'filtre';
  end if;

  with p as (
    select pr.*,
           coalesce(pr.nom_fr, pr.nom_ar) as nom,
           (select count(*) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as nb_variantes,
           (select coalesce(sum(v.stock), 0) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as stock_total,
           (select count(*) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif
              and v.stock > 0 and v.stock <= v.seuil_alerte_stock) as variantes_bas,
           (select count(*) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif
              and v.stock <= 0) as variantes_epuisees,
           (select min(v.prix_millimes) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as prix_min,
           (select max(v.prix_millimes) from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.actif) as prix_max
    from public.produits pr
    where pr.boutique_id = p_boutique_id
      and (v_q is null
           or coalesce(pr.nom_fr, '') || ' ' || coalesce(pr.nom_ar, '') || ' ' || coalesce(pr.marque, '') ilike '%' || v_q || '%'
           or exists (select 1 from public.variantes v where v.boutique_id = pr.boutique_id and v.produit_id = pr.id and v.sku ilike '%' || v_q || '%'))
  ),
  f as (
    select * from p
    where case v_filtre
            when 'publies'    then publie
            when 'brouillons' then not publie
            when 'stock_bas'  then variantes_bas > 0
            when 'rupture'    then stock_total = 0
            else true
          end
  )
  select jsonb_build_object(
    'filtre', v_filtre,
    'total', (select count(*) from f),
    'compteurs', jsonb_build_object(
      'tous',       (select count(*) from p),
      'publies',    (select count(*) from p where publie),
      'brouillons', (select count(*) from p where not publie),
      'stock_bas',  (select count(*) from p where variantes_bas > 0),
      'rupture',    (select count(*) from p where stock_total = 0)),
    'produits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'slug', f.slug, 'nom', f.nom, 'marque', f.marque, 'publie', f.publie, 'mis_en_avant', f.mis_en_avant,
               'categorie', (select coalesce(c.nom_fr, c.nom_ar) from public.categories c where c.boutique_id = f.boutique_id and c.id = f.categorie_id),
               'image', (select i.chemin from public.produit_images i where i.boutique_id = f.boutique_id and i.produit_id = f.id
                          order by i.position, i.created_at limit 1),
               'nb_variantes', f.nb_variantes, 'stock_total', f.stock_total, 'variantes_bas', f.variantes_bas,
               'variantes_epuisees', f.variantes_epuisees,
               'prix_min', f.prix_min, 'prix_max', f.prix_max, 'modifie_le', f.updated_at)
             order by f.position, lower(f.nom), f.id)
      from (select * from f order by position, lower(nom), id limit greatest(1, least(coalesce(p_limite, 60), 200)) offset greatest(0, coalesce(p_decalage, 0))) f
    ), '[]'::jsonb)
  ) into v_sortie;
  return v_sortie;
end;
$$;
