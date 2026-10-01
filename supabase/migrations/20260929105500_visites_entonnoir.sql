-- =====================================================================
-- SkanEcom — 56 · LES VISITES : L'ENTONNOIR ET LES CAMPAGNES
-- =====================================================================
--
-- « Où perd-on les gens ? » et « ma publicité Instagram a-t-elle vendu ? » :
-- deux questions que les visites (migration 53) ne disaient pas.
--
--   · l'entonnoir : de chaque visite du jour, l'étape la plus loin atteinte
--     — une fiche vue (1), un article ajouté au panier (2), la commande
--     ouverte (3), la commande passée (4, la page de fin). Les étapes 1, 3
--     et 4 se lisent sur les pages vues ; l'ajout au panier, la vitrine le
--     signale (compter_ajout_panier). Toujours sans donnée personnelle :
--     un chiffre de plus sur la visite du jour ;
--   · les campagnes : un lien de la boutique qui porte utm_campaign (et
--     utm_source : instagram, facebook…) range la visite sous sa
--     campagne ; la source dite par le lien l'emporte sur le site d'où
--     l'on vient (une publicité Instagram ouverte dans l'application n'a
--     souvent aucun référent). Le backoffice compose ces liens.
-- =====================================================================

alter table public.vitrine_visites
  add column etape smallint not null default 0 check (etape between 0 and 4),
  add column campagne text check (campagne is null or campagne ~ '^[a-z0-9][a-z0-9_-]{0,59}$');

comment on column public.vitrine_visites.etape is
  'L''étape la plus loin atteinte ce jour-là : 0 rien, 1 une fiche vue, 2 un ajout au panier, 3 la commande ouverte, 4 la commande passée.';
comment on column public.vitrine_visites.campagne is
  'La campagne du lien d''arrivée (utm_campaign), en minuscules ; null sans campagne.';

-- Un mot de campagne ou de source, tel qu'un lien le porte : minuscules,
-- lettres, chiffres, tirets ; le reste devient un tiret. Null s'il ne reste rien.
create function private.mot_campagne(p_texte text, p_longueur integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(trim(both '-' from regexp_replace(
           lower(translate(btrim(coalesce(p_texte, '')),
                 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
                 'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy')),
           '[^a-z0-9_]+', '-', 'g')), p_longueur), '')
$$;
revoke execute on function private.mot_campagne(text, integer) from public, anon, authenticated;

drop function public.compter_vue(uuid, text, text, text, text);

create function public.compter_vue(p_boutique_id uuid, p_cle text, p_chemin text, p_source text default null,
                                   p_appareil text default 'ordinateur', p_campagne text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jour     date := (now() at time zone 'Africa/Tunis')::date;
  v_sel      bytea;
  v_chemin   text;
  v_source   text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_appareil text := case when p_appareil in ('telephone', 'tablette', 'ordinateur') then p_appareil else 'ordinateur' end;
  v_campagne text := private.mot_campagne(p_campagne, 60);
  v_etape    smallint;
  v_neuf     integer;
begin
  if p_cle is null or char_length(p_cle) not between 16 and 128
     or not coalesce((private.reglage(p_boutique_id, 'vitrine.statistiques'))::boolean, false)
     or not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    return;
  end if;
  -- Le chemin : sans paramètres ni ancre, les identifiants remplacés, 200 signes au plus.
  v_chemin := split_part(split_part(coalesce(p_chemin, ''), '?', 1), '#', 1);
  v_chemin := regexp_replace(v_chemin, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  if v_chemin !~ '^/[A-Za-z0-9/_.:%-]*$' then
    return;
  end if;
  v_chemin := left(v_chemin, 200);
  if v_source is not null and v_source !~ '^[a-z0-9.-]{1,120}$' then
    v_source := null;
  end if;
  -- Un site, un nom : www.instagram.com et l.instagram.com comptent comme instagram.com.
  v_source := regexp_replace(v_source, '^(www|m|l|lm|mobile|web)\.', '');
  v_etape := case
               when v_chemin like '/commande/merci%' then 4
               when v_chemin = '/commande' then 3
               when v_chemin like '/produit/_%' then 1
               else 0
             end;

  insert into private.sels_visites (jour, sel)
  values (v_jour, decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'))
  on conflict (jour) do nothing;
  get diagnostics v_neuf = row_count;
  if v_neuf > 0 then
    -- Premier passage du jour : le sel d'avant-hier s'efface, et les
    -- visites de plus de treize mois (toutes boutiques).
    delete from private.sels_visites s where s.jour < v_jour - 1;
    delete from public.vitrine_visites v where v.jour < v_jour - 400;
    delete from public.vitrine_pages p where p.jour < v_jour - 400;
  end if;
  select s.sel into v_sel from private.sels_visites s where s.jour = v_jour;

  -- La campagne et la source se lisent à l'arrivée (la première page du jour).
  insert into public.vitrine_visites as x (boutique_id, jour, empreinte, entree, source, appareil, etape, campagne)
  values (p_boutique_id, v_jour, sha256(v_sel || convert_to(p_boutique_id::text || p_cle, 'UTF8')), v_chemin, v_source, v_appareil, v_etape, v_campagne)
  on conflict (boutique_id, jour, empreinte) do update set pages = x.pages + 1, etape = greatest(x.etape, excluded.etape);
  insert into public.vitrine_pages as x (boutique_id, jour, chemin)
  values (p_boutique_id, v_jour, v_chemin)
  on conflict (boutique_id, jour, chemin) do update set vues = x.vues + 1;
end;
$$;

comment on function public.compter_vue(uuid, text, text, text, text, text) is
  'Compte une page vue de la vitrine (réglage vitrine.statistiques) : la visite du jour du visiteur (empreinte salée du jour), son étape, sa campagne d''arrivée ; la page. Ne rend rien ; ne refuse rien de façon visible.';

revoke execute on function public.compter_vue(uuid, text, text, text, text, text) from public;
grant  execute on function public.compter_vue(uuid, text, text, text, text, text) to anon, authenticated;

-- Un article ajouté au panier : la visite du jour passe à l'étape 2 (si
-- elle n'est pas déjà plus loin). Sans visite comptée ce jour, rien.
create function public.compter_ajout_panier(p_boutique_id uuid, p_cle text)
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
  if p_cle is null or char_length(p_cle) not between 16 and 128 then
    return;
  end if;
  select s.sel into v_sel from private.sels_visites s where s.jour = v_jour;
  if v_sel is null then
    return;
  end if;
  update public.vitrine_visites v set etape = 2
   where v.boutique_id = p_boutique_id and v.jour = v_jour and v.etape < 2
     and v.empreinte = sha256(v_sel || convert_to(p_boutique_id::text || p_cle, 'UTF8'));
end;
$$;

revoke execute on function public.compter_ajout_panier(uuid, text) from public;
grant  execute on function public.compter_ajout_panier(uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- L'écran Visites : l'entonnoir et les campagnes de la période
-- ---------------------------------------------------------------------
create function public.gestion_visites_parcours(p_boutique_id uuid, p_jours integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours   integer := case when p_jours in (7, 30, 90) then p_jours else 30 end;
  v_debut   date := (now() at time zone 'Africa/Tunis')::date - (v_jours - 1);
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  return (
    with visites as (
      select v.* from public.vitrine_visites v where v.boutique_id = p_boutique_id and v.jour >= v_debut
    )
    select jsonb_build_object(
      'entonnoir', (select jsonb_build_object(
                      'visiteurs', count(*),
                      'fiche',     count(*) filter (where v.etape >= 1),
                      'panier',    count(*) filter (where v.etape >= 2),
                      'commande',  count(*) filter (where v.etape >= 3),
                      'commandee', count(*) filter (where v.etape >= 4))
                      from visites v),
      -- Les campagnes de la période, les plus suivies d'abord : la source la
      -- plus fréquente de chacune, ce qu'elles ont amené jusqu'à la commande.
      'campagnes', coalesce((
        select jsonb_agg(jsonb_build_object('campagne', x.campagne, 'source', x.source, 'visiteurs', x.visiteurs,
                                            'panier', x.panier, 'commandes', x.commandes,
                                            'premier', x.premier, 'dernier', x.dernier)
                         order by x.visiteurs desc, x.campagne)
          from (select v.campagne,
                       mode() within group (order by v.source) as source,
                       count(*) as visiteurs,
                       count(*) filter (where v.etape >= 2) as panier,
                       count(*) filter (where v.etape >= 4) as commandes,
                       min(v.jour) as premier, max(v.jour) as dernier
                  from visites v where v.campagne is not null
                 group by v.campagne
                 order by count(*) desc, v.campagne
                 limit 12) x), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.gestion_visites_parcours(uuid, integer) from public, anon;
grant  execute on function public.gestion_visites_parcours(uuid, integer) to authenticated;
