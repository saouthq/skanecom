-- =====================================================================
-- SkanEcom — 39 · LES AVIS CLIENTS VÉRIFIÉS (module « avis »)
-- =====================================================================
--
-- Sur une boutique qu'on ne connaît pas, l'avis d'un autre acheteur pèse
-- plus que toute la page. Encore faut-il qu'il soit vrai : ici, seul un
-- client connecté (numéro confirmé par SMS) note un article d'une de SES
-- commandes LIVRÉES, une fois par article commandé. La vitrine affiche la
-- note, le texte, le prénom et l'initiale, la déclinaison achetée et
-- « Achat vérifié » ; jamais le numéro ni le nom complet.
--
-- « Fais les deux et mets-le en réglage » : la boutique relit chaque avis
-- avant publication (défaut), ou le laisse paraître aussitôt
-- (avis.moderation). Elle publie, écarte avec un motif (gardé pour elle),
-- et peut répondre en public. Chaque geste passe au journal d'audit.
--
-- Le client ne lit jamais la table : donner_avis et mes_avis, par la
-- session ; la vitrine lit avis_produit (publiés seulement) ; l'équipe lit
-- tout de sa boutique (RLS) et agit par les fonctions gestion_*.
-- =====================================================================

insert into plateforme.modules (code, libelle_fr, description_fr, position, disponible) values
  ('avis', 'Avis clients', 'Avis vérifiés : seul un client livré note l''article reçu ; la boutique publie, écarte ou répond.', 7, true);

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('avis.moderation', 'choix', '["a_priori", "automatique"]', '"a_priori"', 'avis', 'avis', false,
     'Publication des avis',
     'À priori = chaque avis attend votre relecture avant de paraître. Automatique = il paraît aussitôt, vous pouvez l''écarter ensuite.', 80);


-- ---------------------------------------------------------------------
-- Les avis
-- ---------------------------------------------------------------------
create table public.avis (
  id               uuid primary key default gen_random_uuid(),
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  produit_id       uuid not null,
  commande_id      uuid not null,
  ligne_id         uuid not null,
  client_id        uuid not null,
  note             smallint not null check (note between 1 and 5),
  texte            text check (texte is null or char_length(texte) between 1 and 1000),
  -- Ce que la vitrine montre de l'auteur (« Amel B. ») et de l'achat,
  -- COPIÉS au moment de l'avis.
  auteur           text not null check (char_length(auteur) between 1 and 40),
  variante_libelle text,
  statut           text not null default 'en_attente' check (statut in ('en_attente', 'publie', 'ecarte')),
  -- Pourquoi il a été écarté : pour l'équipe seulement.
  motif            text check (motif is null or char_length(motif) between 1 and 300),
  reponse          text check (reponse is null or char_length(reponse) between 1 and 1000),
  repondu_le       timestamptz,
  modere_le        timestamptz,
  modere_par       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (boutique_id, id),
  -- Un avis par article commandé.
  unique (boutique_id, ligne_id),
  foreign key (boutique_id, produit_id)  references public.produits (boutique_id, id) on delete cascade,
  foreign key (boutique_id, commande_id) references public.commandes (boutique_id, id) on delete cascade,
  foreign key (boutique_id, ligne_id)    references public.commande_lignes (boutique_id, id) on delete cascade,
  foreign key (boutique_id, client_id)   references public.clients (boutique_id, id) on delete cascade,
  constraint avis_ecarte_motif check ((statut = 'ecarte') = (motif is not null)),
  constraint avis_reponse_datee check ((reponse is null) = (repondu_le is null))
);

comment on table public.avis is
  'Les avis clients vérifiés : la note et le texte d''un client livré sur un article de sa commande, publiés, en attente ou écartés par la boutique.';

create index avis_produit_idx on public.avis (boutique_id, produit_id, created_at desc) where statut = 'publie';
create index avis_statut_idx on public.avis (boutique_id, statut, created_at);

create trigger avis_updated_at before update on public.avis
  for each row execute function private.set_updated_at();
create trigger avis_boutique_immuable before update of boutique_id on public.avis
  for each row execute function private.boutique_immuable();

alter table public.avis enable row level security;
create policy "avis: l'équipe lit ceux de sa boutique"
  on public.avis for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.avis from anon, authenticated;

create function private.avis_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'avis' and ma.actif)
$$;

-- « Amel Ben Salah » → « Amel B. » (le prénom, l'initiale de ce qui suit) ;
-- un seul mot reste tel quel.
create function private.nom_public(p_nom text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mots text[] := regexp_split_to_array(btrim(coalesce(p_nom, '')), '\s+');
  v_n    integer := coalesce(array_length(v_mots, 1), 0);
begin
  if v_n = 0 or v_mots[1] = '' then
    return 'Client';
  end if;
  if v_n = 1 then
    return left(v_mots[1], 30);
  end if;
  return left(v_mots[1], 30) || ' ' || upper(left(v_mots[2], 1)) || '.';
end;
$$;

revoke execute on function private.avis_actif(uuid) from public, anon, authenticated;
revoke execute on function private.nom_public(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Le client : noter un article livré, relire ses avis
-- ---------------------------------------------------------------------
create function public.donner_avis(
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
          private.nom_public(v_commande.contact_nom), v_ligne.variante_libelle, v_statut);

  return jsonb_build_object('statut', v_statut);
end;
$$;

comment on function public.donner_avis(uuid, text, uuid, integer, text) is
  'Le client connecté note (1 à 5) un article d''une de ses commandes livrées, une fois. Rend le statut : publie ou en_attente (réglage avis.moderation).';

-- Les avis du client connecté, par article commandé (« Mes commandes »).
-- Jamais le motif d'un avis écarté.
create function public.mes_avis(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'ligne_id', a.ligne_id, 'commande', c.numero, 'note', a.note, 'texte', a.texte,
           'statut', a.statut, 'reponse', a.reponse, 'cree_le', a.created_at)
         order by a.created_at desc), '[]'::jsonb)
  from public.avis a
  join public.commandes c on c.boutique_id = a.boutique_id and c.id = a.commande_id
  where auth.uid() is not null
    and a.boutique_id = p_boutique_id
    and private.avis_actif(p_boutique_id)
    and a.client_id in (select cl.id from public.clients cl where cl.boutique_id = p_boutique_id and cl.user_id = auth.uid());
$$;

revoke execute on function public.donner_avis(uuid, text, uuid, integer, text) from public, anon;
revoke execute on function public.mes_avis(uuid) from public, anon;
grant  execute on function public.donner_avis(uuid, text, uuid, integer, text) to authenticated, service_role;
grant  execute on function public.mes_avis(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- La vitrine : les avis publiés d'un produit (et leur moyenne)
-- ---------------------------------------------------------------------
-- NULL quand la boutique n'a pas le module : la fiche ne montre rien.
create function public.avis_produit(p_boutique_id uuid, p_produit_id uuid, p_limite integer default 20)
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
      'avis', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'note', x.note, 'texte', x.texte, 'auteur', x.auteur, 'variante_libelle', x.variante_libelle,
                 'cree_le', x.created_at, 'reponse', x.reponse, 'repondu_le', x.repondu_le)
               order by x.created_at desc, x.id)
          from (select a.* from public.avis a
                 where a.boutique_id = p_boutique_id and a.produit_id = p_produit_id and a.statut = 'publie'
                 order by a.created_at desc, a.id
                 limit least(greatest(coalesce(p_limite, 20), 1), 50)) x), '[]'::jsonb))
  end
$$;

grant execute on function public.avis_produit(uuid, uuid, integer) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- L'équipe : l'état, la liste, les gestes
-- ---------------------------------------------------------------------
create function public.gestion_avis_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.avis_actif(p_boutique_id),
    'a_moderer', (select count(*) from public.avis a where a.boutique_id = p_boutique_id and a.statut = 'en_attente'));
end;
$$;

-- À modérer (le plus ancien d'abord), publiés, écartés (les plus récents d'abord).
create function public.gestion_liste_avis(p_boutique_id uuid, p_filtre text default 'a_moderer', p_limite integer default 50)
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
               'client', jsonb_build_object('id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone))
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

-- Publier, écarter (avec un motif), répondre (vide : la réponse s'efface).
create function public.gestion_moderer_avis(p_boutique_id uuid, p_avis_id uuid, p_geste text, p_texte text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a     public.avis;
  v_texte text := nullif(btrim(coalesce(p_texte, '')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select a.* into v_a from public.avis a where a.boutique_id = p_boutique_id and a.id = p_avis_id for update;
  if not found then
    raise exception 'Avis introuvable' using errcode = 'check_violation', hint = 'avis';
  end if;

  case p_geste
    when 'publier' then
      if v_a.statut = 'publie' then
        raise exception 'Cet avis est déjà publié' using errcode = 'check_violation', hint = 'etat';
      end if;
      update public.avis set statut = 'publie', motif = null, modere_le = now(), modere_par = auth.uid() where id = v_a.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'avis.publier', v_a.id::text,
        jsonb_build_object('statut', v_a.statut), jsonb_build_object('statut', 'publie', 'note', v_a.note));
    when 'ecarter' then
      if v_a.statut = 'ecarte' then
        raise exception 'Cet avis est déjà écarté' using errcode = 'check_violation', hint = 'etat';
      end if;
      if v_texte is null or char_length(v_texte) > 300 then
        raise exception 'Dites pourquoi vous l''écartez (300 caractères au plus) : ce motif reste entre vous' using errcode = 'check_violation', hint = 'motif';
      end if;
      update public.avis set statut = 'ecarte', motif = v_texte, modere_le = now(), modere_par = auth.uid() where id = v_a.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'avis.ecarter', v_a.id::text,
        jsonb_build_object('statut', v_a.statut), jsonb_build_object('statut', 'ecarte', 'motif', v_texte));
    when 'repondre' then
      if v_a.statut = 'ecarte' then
        raise exception 'On ne répond pas à un avis écarté : publiez-le d''abord' using errcode = 'check_violation', hint = 'etat';
      end if;
      if char_length(v_texte) > 1000 then
        raise exception 'Réponse trop longue (1 000 caractères au plus)' using errcode = 'check_violation', hint = 'reponse';
      end if;
      update public.avis set reponse = v_texte, repondu_le = case when v_texte is null then null else now() end where id = v_a.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'avis.repondre', v_a.id::text,
        jsonb_build_object('reponse', v_a.reponse), jsonb_build_object('reponse', v_texte));
    else
      raise exception 'Geste inconnu' using errcode = 'check_violation', hint = 'geste';
  end case;

  return (select jsonb_build_object('statut', a.statut, 'reponse', a.reponse) from public.avis a where a.id = v_a.id);
end;
$$;

revoke execute on function public.gestion_avis_etat(uuid)                        from public, anon;
revoke execute on function public.gestion_liste_avis(uuid, text, integer)        from public, anon;
revoke execute on function public.gestion_moderer_avis(uuid, uuid, text, text)   from public, anon;
grant  execute on function public.gestion_avis_etat(uuid)                        to authenticated;
grant  execute on function public.gestion_liste_avis(uuid, text, integer)        to authenticated;
grant  execute on function public.gestion_moderer_avis(uuid, uuid, text, text)   to authenticated;
