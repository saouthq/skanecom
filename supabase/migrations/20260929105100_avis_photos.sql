-- =====================================================================
-- SkanEcom — 52 · LES PHOTOS DES AVIS (module « avis »)
-- =====================================================================
--
-- La robe portée, la valise après un voyage : la photo d'un autre acheteur
-- dit ce que la fiche ne peut pas dire. Avec son avis, un client livré
-- joint jusqu'à trois photos de l'article reçu. Elles suivent le sort de
-- l'avis : relues avec lui (avis.moderation), publiées avec lui ; l'équipe
-- peut en retirer une sans écarter l'avis.
--
-- Réglage de la boutique (avis.photos), coupé par défaut.
--
-- Le fichier est déposé par l'application (R2, ou le relais en local), sous
-- `<boutique>/avis/<avis>/…` ; la base n'inscrit que son chemin, et
-- seulement pour l'auteur de l'avis, dans l'heure qui suit l'avis (le même
-- envoi) : une photo ne s'ajoute pas plus tard à un avis déjà relu.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('avis.photos', 'booleen', null, 'false', 'avis', 'avis', true,
     'Photos dans les avis',
     'Oui = avec son avis, le client joint jusqu''à trois photos de l''article reçu ; elles paraissent avec l''avis, et vous pouvez en retirer une. Non = des avis sans photo.', 81);

create table public.avis_photos (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  avis_id     uuid not null,
  chemin      text not null,
  largeur     integer check (largeur is null or largeur between 1 and 20000),
  hauteur     integer check (hauteur is null or hauteur between 1 and 20000),
  position    smallint not null default 0 check (position between 0 and 2),
  created_at  timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, chemin),
  foreign key (boutique_id, avis_id) references public.avis (boutique_id, id) on delete cascade
);

comment on table public.avis_photos is
  'Les photos jointes à un avis par son auteur (trois au plus), rangées sous <boutique>/avis/<avis>/ ; elles paraissent quand l''avis est publié.';

create index avis_photos_avis_idx on public.avis_photos (boutique_id, avis_id, position);

create trigger avis_photos_boutique_immuable before update of boutique_id on public.avis_photos
  for each row execute function private.boutique_immuable();

alter table public.avis_photos enable row level security;
create policy "avis_photos: l'équipe lit celles de sa boutique"
  on public.avis_photos for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.avis_photos from anon, authenticated;

create function private.avis_photos_actives(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.avis_actif(p_boutique_id)
     and coalesce((private.reglage(p_boutique_id, 'avis.photos'))::boolean, false)
$$;

-- Les photos d'un avis, dans leur ordre, pour les réponses JSON.
create function private.photos_avis(p_boutique_id uuid, p_avis_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'chemin', ph.chemin, 'largeur', ph.largeur, 'hauteur', ph.hauteur)
                            order by ph.position), '[]'::jsonb)
    from public.avis_photos ph
   where ph.boutique_id = p_boutique_id and ph.avis_id = p_avis_id
$$;

revoke execute on function private.avis_photos_actives(uuid) from public, anon, authenticated;
revoke execute on function private.photos_avis(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Le client : donner son avis rend aussi son identifiant (pour y joindre
-- les photos), puis chaque photo s'inscrit
-- ---------------------------------------------------------------------
create or replace function public.donner_avis(
  p_boutique_id     uuid,
  p_numero_commande text,
  p_ligne_id        uuid,
  p_note            integer,
  p_texte           text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
  v_ligne    public.commande_lignes;
  v_produit  uuid;
  v_texte    text := nullif(btrim(coalesce(p_texte, '')), '');
  v_statut   text;
  v_id       uuid;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous avec votre numéro pour donner votre avis' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active')
     or not private.avis_actif(p_boutique_id) then
    raise exception 'Cette boutique ne recueille pas d''avis en ligne' using errcode = 'check_violation', hint = 'module';
  end if;

  select c.* into v_commande from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = p_numero_commande
     and c.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid());
  if not found then
    raise exception 'Commande introuvable' using errcode = 'check_violation', hint = 'commande';
  end if;
  if v_commande.statut <> 'livree' then
    raise exception 'Un avis porte sur un article reçu : la commande n''est pas encore livrée' using errcode = 'check_violation', hint = 'statut';
  end if;
  select l.* into v_ligne from public.commande_lignes l
   where l.boutique_id = p_boutique_id and l.commande_id = v_commande.id and l.id = p_ligne_id;
  if not found then
    raise exception 'Cet article n''est pas dans la commande' using errcode = 'check_violation', hint = 'ligne';
  end if;
  select v.produit_id into v_produit from public.variantes v where v.boutique_id = p_boutique_id and v.id = v_ligne.variante_id;
  if v_produit is null then
    raise exception 'Cet article n''est plus au catalogue : il ne peut plus être noté' using errcode = 'check_violation', hint = 'ligne';
  end if;
  if p_note is null or p_note not between 1 and 5 then
    raise exception 'Choisissez une note, de 1 à 5 étoiles' using errcode = 'check_violation', hint = 'note';
  end if;
  if char_length(v_texte) > 1000 then
    raise exception 'Avis trop long (1 000 caractères au plus)' using errcode = 'check_violation', hint = 'texte';
  end if;
  if exists (select 1 from public.avis a where a.boutique_id = p_boutique_id and a.ligne_id = v_ligne.id) then
    raise exception 'Vous avez déjà donné votre avis sur cet article' using errcode = 'check_violation', hint = 'deja';
  end if;

  v_statut := case when private.reglage(p_boutique_id, 'avis.moderation') #>> '{}' = 'automatique' then 'publie' else 'en_attente' end;
  insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, variante_libelle, statut)
  values (p_boutique_id, v_produit, v_commande.id, v_ligne.id, v_commande.client_id, p_note, v_texte,
          private.nom_public(v_commande.contact_nom), v_ligne.variante_libelle, v_statut)
  returning id into v_id;

  return jsonb_build_object('statut', v_statut, 'id', v_id, 'photos', private.avis_photos_actives(p_boutique_id));
end;
$$;

-- Inscrit une photo déposée par l'application. Rend sa place (0 à 2).
create function public.ajouter_photo_avis(p_boutique_id uuid, p_avis_id uuid, p_chemin text, p_largeur integer default null, p_hauteur integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a        public.avis;
  v_slug     text;
  v_position integer;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous avec votre numéro pour joindre une photo' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not private.avis_photos_actives(p_boutique_id) then
    raise exception 'Cette boutique ne recueille pas de photos avec les avis' using errcode = 'check_violation', hint = 'module';
  end if;
  select a.* into v_a from public.avis a
   where a.boutique_id = p_boutique_id and a.id = p_avis_id
     and a.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid())
   for update;
  if not found then
    raise exception 'Avis introuvable' using errcode = 'check_violation', hint = 'avis';
  end if;
  if v_a.created_at < now() - interval '1 hour' or v_a.statut = 'ecarte' then
    raise exception 'Les photos se joignent avec l''avis, au moment de le donner' using errcode = 'check_violation', hint = 'delai';
  end if;
  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  if p_chemin is null or p_chemin !~ ('^' || v_slug || '/avis/' || p_avis_id::text || '/[a-z0-9]{8,32}\.(jpg|png|webp)$') then
    raise exception 'Chemin de photo invalide' using errcode = 'check_violation', hint = 'chemin';
  end if;
  perform private.valide_chemin(p_boutique_id, p_chemin);
  select count(*) into v_position from public.avis_photos ph where ph.boutique_id = p_boutique_id and ph.avis_id = p_avis_id;
  if v_position >= 3 then
    raise exception 'Trois photos au plus par avis' using errcode = 'check_violation', hint = 'nombre';
  end if;
  insert into public.avis_photos (boutique_id, avis_id, chemin, largeur, hauteur, position)
  values (p_boutique_id, p_avis_id, p_chemin, p_largeur, p_hauteur, v_position);
  return jsonb_build_object('position', v_position);
end;
$$;

revoke execute on function public.ajouter_photo_avis(uuid, uuid, text, integer, integer) from public, anon;
grant  execute on function public.ajouter_photo_avis(uuid, uuid, text, integer, integer) to authenticated, service_role;

-- « Mes commandes » : les photos de ses avis aussi.
create or replace function public.mes_avis(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'ligne_id', a.ligne_id, 'commande', c.numero, 'note', a.note, 'texte', a.texte,
           'statut', a.statut, 'reponse', a.reponse, 'cree_le', a.created_at,
           'photos', private.photos_avis(a.boutique_id, a.id))
         order by a.created_at desc), '[]'::jsonb)
  from public.avis a
  join public.commandes c on c.boutique_id = a.boutique_id and c.id = a.commande_id
  where auth.uid() is not null
    and a.boutique_id = p_boutique_id
    and private.avis_actif(p_boutique_id)
    and a.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid());
$$;


-- ---------------------------------------------------------------------
-- La vitrine : les photos des avis publiés, avec chaque avis et en rang
-- (« Les photos des clients », douze au plus, les plus récentes d'abord)
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- L'équipe : les photos dans la liste, et le geste « retirer la photo »
-- ---------------------------------------------------------------------
create or replace function public.gestion_liste_avis(p_boutique_id uuid, p_filtre text default 'a_moderer', p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_statut text := case p_filtre when 'publies' then 'publie' when 'ecartes' then 'ecarte' else 'en_attente' end;
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.avis_actif(p_boutique_id),
    'moderation', coalesce(private.reglage(p_boutique_id, 'avis.moderation') #>> '{}', 'a_priori'),
    'compteurs', (select jsonb_build_object(
                    'a_moderer', count(*) filter (where a.statut = 'en_attente'),
                    'publies',   count(*) filter (where a.statut = 'publie'),
                    'ecartes',   count(*) filter (where a.statut = 'ecarte'),
                    'moyenne',   round(avg(a.note) filter (where a.statut = 'publie'), 1))
                    from public.avis a where a.boutique_id = p_boutique_id),
    'avis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'note', x.note, 'texte', x.texte, 'auteur', x.auteur, 'statut', x.statut, 'motif', x.motif,
               'reponse', x.reponse, 'repondu_le', x.repondu_le, 'cree_le', x.created_at, 'modere_le', x.modere_le,
               'modere_par', (select u.email from auth.users u where u.id = x.modere_par),
               'produit', jsonb_build_object('id', p.id, 'nom', coalesce(p.nom_fr, p.nom_ar), 'slug', p.slug), 'variante_libelle', x.variante_libelle,
               'commande', c.numero,
               'client', jsonb_build_object('id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone),
               'photos', private.photos_avis(x.boutique_id, x.id))
             order by case when v_statut = 'en_attente' then extract(epoch from x.created_at) else -extract(epoch from x.created_at) end, x.id)
        from (select a.* from public.avis a
               where a.boutique_id = p_boutique_id and a.statut = v_statut
               order by case when v_statut = 'en_attente' then a.created_at end asc,
                        case when v_statut <> 'en_attente' then a.created_at end desc, a.id
               limit least(greatest(coalesce(p_limite, 50), 1), 200)) x
        join public.produits p on p.boutique_id = x.boutique_id and p.id = x.produit_id
        join public.commandes c on c.boutique_id = x.boutique_id and c.id = x.commande_id
        join public.clients cl on cl.boutique_id = x.boutique_id and cl.id = x.client_id), '[]'::jsonb));
end;
$$;

-- Retire une photo (l'avis reste) ; rend son chemin, pour que l'application
-- retire aussi le fichier. Les suivantes remontent d'une place.
create function public.gestion_retirer_photo_avis(p_boutique_id uuid, p_photo_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ph public.avis_photos;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  delete from public.avis_photos ph where ph.boutique_id = p_boutique_id and ph.id = p_photo_id returning ph.* into v_ph;
  if not found then
    raise exception 'Photo introuvable' using errcode = 'check_violation', hint = 'photo';
  end if;
  update public.avis_photos ph set position = ph.position - 1
   where ph.boutique_id = p_boutique_id and ph.avis_id = v_ph.avis_id and ph.position > v_ph.position;
  perform private.console_trace(auth.uid(), p_boutique_id, 'avis.retirer_photo', v_ph.avis_id::text,
    jsonb_build_object('chemin', v_ph.chemin), null);
  return jsonb_build_object('chemin', v_ph.chemin);
end;
$$;

revoke execute on function public.gestion_retirer_photo_avis(uuid, uuid) from public, anon;
grant  execute on function public.gestion_retirer_photo_avis(uuid, uuid) to authenticated;
