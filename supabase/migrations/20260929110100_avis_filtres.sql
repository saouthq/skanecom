-- =====================================================================
-- SkanEcom — 62 · LES AVIS D'UNE FICHE SE FILTRENT ET SE PARCOURENT
-- =====================================================================
--
-- Une fiche montrait ses vingt derniers avis, sans suite ni tri : la
-- cliente qui veut voir la robe portée, ou lire ce que disent les deux
-- étoiles, faisait défiler tout le reste. Désormais :
--
-- - avis_produit dit aussi combien d'avis publiés portent des photos
--   (`avec_photos`, zéro sans le réglage avis.photos) ;
-- - avis_produit_page rend une page d'avis publiés, du plus récent au plus
--   ancien, pour un filtre : tous, avec photos, ou une note (1 à 5), avec
--   le nombre d'avis qui y répondent. Le même ordre que la fiche (date,
--   puis identifiant) : la page suivante ne répète ni ne saute personne.
--
-- Comme avis_produit : rien hors du module avis, ni pour une boutique
-- suspendue. Lu par tous (la vitrine), rien d'écrit.
-- =====================================================================

create or replace function public.avis_produit(p_boutique_id uuid, p_produit_id uuid, p_limite integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.avis_actif(p_boutique_id)
                   and exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    jsonb_build_object(
      'total',   (select count(*) from public.avis a where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'),
      'moyenne', (select round(avg(a.note), 1) from public.avis a where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'),
      'repartition', (select jsonb_build_object(
                        '5', count(*) filter (where a.note = 5), '4', count(*) filter (where a.note = 4),
                        '3', count(*) filter (where a.note = 3), '2', count(*) filter (where a.note = 2),
                        '1', count(*) filter (where a.note = 1))
                        from public.avis a where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'),
      'avec_photos', case when private.avis_photos_actives(p_boutique_id) then (
        select count(*) from public.avis a
         where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'
           and exists (select 1 from public.avis_photos ph where ph.boutique_id = a.boutique_id and ph.avis_id = a.id)) else 0 end,
      'photos', case when private.avis_photos_actives(p_boutique_id) then coalesce((
        select jsonb_agg(jsonb_build_object('id', y.id, 'avis_id', y.avis_id, 'chemin', y.chemin, 'largeur', y.largeur, 'hauteur', y.hauteur)
                         order by y.cree desc, y.position)
          from (select ph.*, a.created_at as cree from public.avis_photos ph
                  join public.avis a on a.boutique_id = ph.boutique_id and a.id = ph.avis_id
                 where ph.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'
                 order by a.created_at desc, ph.position
                 limit 12) y), '[]'::jsonb) else '[]'::jsonb end,
      'avis', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'note', x.note, 'texte', x.texte, 'auteur', x.auteur, 'variante_libelle', x.variante_libelle,
                 'cree_le', x.created_at, 'reponse', x.reponse, 'repondu_le', x.repondu_le,
                 'photos', case when private.avis_photos_actives(p_boutique_id) then private.photos_avis(x.boutique_id, x.id) else '[]'::jsonb end)
               order by x.created_at desc, x.id)
          from (select a.* from public.avis a
                 where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'
                 order by a.created_at desc, a.id
                 limit least(greatest(coalesce(p_limite, 20), 1), 50)) x), '[]'::jsonb))
  end
$$;

-- Une page d'avis publiés pour un filtre : 'tous', 'photos', ou '1' à '5'.
-- Rend {filtre, total, avis} ; `total` compte les avis du filtre, pas la page.
create function public.avis_produit_page(
  p_boutique_id uuid,
  p_produit_id  uuid,
  p_filtre      text    default 'tous',
  p_decalage    integer default 0,
  p_limite      integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_photos boolean;
  v_note   smallint;
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_saut   integer := greatest(coalesce(p_decalage, 0), 0);
begin
  if coalesce(p_filtre, '') not in ('tous', 'photos', '1', '2', '3', '4', '5') then
    raise exception 'Filtre d''avis inconnu' using errcode = 'check_violation', hint = 'filtre';
  end if;
  if not private.avis_actif(p_boutique_id)
     or not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    return null;
  end if;
  v_photos := private.avis_photos_actives(p_boutique_id);
  v_note   := case when p_filtre ~ '^[1-5]$' then p_filtre::smallint end;

  return (
    with retenus as (
      select a.* from public.avis a
       where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'
         and (v_note is null or a.note = v_note)
         and (p_filtre <> 'photos'
              or (v_photos and exists (select 1 from public.avis_photos ph where ph.boutique_id = a.boutique_id and ph.avis_id = a.id)))
    )
    select jsonb_build_object(
      'filtre', p_filtre,
      'total',  (select count(*) from retenus),
      'avis',   coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'note', x.note, 'texte', x.texte, 'auteur', x.auteur, 'variante_libelle', x.variante_libelle,
                 'cree_le', x.created_at, 'reponse', x.reponse, 'repondu_le', x.repondu_le,
                 'photos', case when v_photos then private.photos_avis(x.boutique_id, x.id) else '[]'::jsonb end)
               order by x.created_at desc, x.id)
          from (select r.* from retenus r order by r.created_at desc, r.id offset v_saut limit v_limite) x), '[]'::jsonb))
  );
end;
$$;

revoke execute on function public.avis_produit_page(uuid, uuid, text, integer, integer) from public;
grant  execute on function public.avis_produit_page(uuid, uuid, text, integer, integer) to anon, authenticated, service_role;
