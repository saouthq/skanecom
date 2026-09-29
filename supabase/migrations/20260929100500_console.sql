-- =====================================================================
-- SkanEcom · la console de la plateforme (PRD §6.1)
-- =====================================================================
-- La console sert à Skander et à son père à mettre une boutique en place :
-- la créer et lui donner son domaine (C1), régler sa marque (C2), importer
-- son catalogue (C5). Elle travaille côté serveur avec la clé service_role,
-- qui contourne la RLS : c'est voulu, les administrateurs n'ont AUCUN droit
-- par la RLS (docs/cadrage/03-reprise-maymar.md). En échange :
--
--   · elle n'agit QUE par les fonctions `public.console_*` ci-dessous,
--     exécutables par service_role seul ;
--   · chaque fonction qui écrit vérifie que `p_acteur` est administrateur
--     et trace l'action dans plateforme.journal_audit, dans la même
--     transaction : pas d'écriture sans trace, pas de trace sans écriture ;
--   · le serveur de la console vérifie AVANT tout appel que l'utilisateur
--     est administrateur et connecté en double authentification (aal2).
--
-- Les fonctions sont SECURITY DEFINER (search_path vide, noms qualifiés) :
-- elles lisent plateforme et auth.users, que service_role ne voit pas en
-- entier. Ce sont leurs droits d'exécution, réservés à service_role, qui
-- bornent l'accès.
--
-- L'adresse IP de l'administrateur arrive dans l'en-tête `x-console-ip`
-- (PostgREST expose les en-têtes dans `request.headers`). Seul service_role
-- appelle ces fonctions : l'en-tête vient donc du serveur de la console.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Outils internes
-- ---------------------------------------------------------------------
create function private.console_exige_admin(p_acteur uuid)
returns plateforme.role_administrateur
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role plateforme.role_administrateur;
begin
  select a.role into v_role from plateforme.administrateurs a where a.user_id = p_acteur;
  if v_role is null then
    raise exception 'Console : % n''est pas administrateur de la plateforme', coalesce(p_acteur::text, 'personne')
      using errcode = 'insufficient_privilege';
  end if;
  return v_role;
end;
$$;

create function private.console_trace(
  p_acteur uuid, p_boutique_id uuid, p_action text, p_cible text, p_avant jsonb, p_apres jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip inet;
begin
  begin
    v_ip := nullif(current_setting('request.headers', true)::jsonb ->> 'x-console-ip', '')::inet;
  exception when others then
    v_ip := null;  -- une IP illisible ne doit jamais empêcher la trace
  end;
  insert into plateforme.journal_audit (acteur, boutique_id, action, cible, avant, apres, ip)
  values (p_acteur, p_boutique_id, p_action, p_cible, p_avant, p_apres, v_ip);
end;
$$;

revoke execute on function private.console_exige_admin(uuid) from public, anon, authenticated;
revoke execute on function private.console_trace(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function private.console_exige_admin(uuid) to service_role;
grant  execute on function private.console_trace(uuid, uuid, text, text, jsonb, jsonb) to service_role;


-- ---------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------

-- Le rôle d'administrateur d'un utilisateur, ou NULL.
create function public.console_administrateur(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role::text from plateforme.administrateurs a where a.user_id = p_user_id;
$$;

-- Toutes les boutiques, pour le tableau de bord.
create function public.console_boutiques()
returns table (
  id             uuid,
  slug           text,
  nom            text,
  statut         text,
  hote_principal text,
  domaines       text[],
  theme          text,
  nb_produits    integer,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.slug, b.nom, b.statut::text,
         (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal),
         coalesce((select array_agg(d.hote order by d.principal desc, d.hote)
                     from plateforme.domaines d where d.boutique_id = b.id), '{}'),
         (select t.code from public.themes t where t.boutique_id = b.id),
         (select count(*)::integer from public.produits p where p.boutique_id = b.id),
         b.created_at
  from plateforme.boutiques b
  order by b.created_at, b.nom;
$$;

-- Une boutique, pour sa fiche : identité, domaines, thème, derniers
-- événements du journal.
create function public.console_boutique(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'boutique', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut,
      'langue_defaut', b.langue_defaut, 'langues_actives', b.langues_actives, 'created_at', b.created_at),
    'domaines', coalesce((select jsonb_agg(jsonb_build_object('hote', d.hote, 'type', d.type, 'principal', d.principal,
                                                              'statut_certificat', d.statut_certificat)
                                           order by d.principal desc, d.hote)
                            from plateforme.domaines d where d.boutique_id = b.id), '[]'::jsonb),
    'theme', (select to_jsonb(t) - 'boutique_id' from public.themes t where t.boutique_id = b.id),
    'compteurs', jsonb_build_object(
      'produits',   (select count(*) from public.produits p where p.boutique_id = b.id),
      'publies',    (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
      'variantes',  (select count(*) from public.variantes v where v.boutique_id = b.id),
      'categories', (select count(*) from public.categories c where c.boutique_id = b.id)),
    'journal', coalesce((select jsonb_agg(j order by j.at desc)
                           from (select ja.at, ja.action, ja.cible, u.email as acteur
                                   from plateforme.journal_audit ja
                                   left join auth.users u on u.id = ja.acteur
                                  where ja.boutique_id = b.id
                                  order by ja.at desc
                                  limit 20) j), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.slug = p_slug;
$$;


-- ---------------------------------------------------------------------
-- C1 · Créer une boutique et lui attribuer son domaine
-- ---------------------------------------------------------------------
-- La boutique naît « en préparation » : la vitrine ne la sert pas encore
-- (page « bientôt » du proxy). On l'ouvre avec console_changer_statut quand
-- la liste de mise en place est faite (PRD §7).
create function public.console_creer_boutique(
  p_acteur uuid,
  p_slug   text,
  p_nom    text,
  p_hote   text,
  p_theme  text default 'editorial',
  p_langue text default 'fr'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_hote text := lower(btrim(p_hote));
begin
  perform private.console_exige_admin(p_acteur);

  if btrim(coalesce(p_nom, '')) = '' then
    raise exception 'Le nom de la boutique est obligatoire' using errcode = 'check_violation';
  end if;

  insert into plateforme.boutiques (slug, nom, langue_defaut, langues_actives)
  values (lower(btrim(p_slug)), btrim(p_nom), p_langue, array[p_langue])
  returning id into v_id;

  insert into plateforme.domaines (hote, boutique_id, type, principal)
  values (v_hote, v_id, 'personnalise', true);

  insert into public.themes (boutique_id, code, updated_by)
  values (v_id, p_theme, p_acteur);

  perform private.console_trace(p_acteur, v_id, 'boutique.creer', lower(btrim(p_slug)), null,
    jsonb_build_object('nom', btrim(p_nom), 'hote', v_hote, 'theme', p_theme, 'langue', p_langue));
  return v_id;
end;
$$;

-- Ajouter un domaine (www., ancien domaine…) ; `p_principal` en fait le
-- domaine principal, celui des liens canoniques.
create function public.console_ajouter_domaine(p_acteur uuid, p_boutique_id uuid, p_hote text, p_principal boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hote text := lower(btrim(p_hote));
begin
  perform private.console_exige_admin(p_acteur);
  if p_principal then
    update plateforme.domaines set principal = false where boutique_id = p_boutique_id and principal;
  end if;
  insert into plateforme.domaines (hote, boutique_id, type, principal)
  values (v_hote, p_boutique_id, 'personnalise', p_principal);
  perform private.console_trace(p_acteur, p_boutique_id, 'domaine.ajouter', v_hote, null,
    jsonb_build_object('principal', p_principal));
end;
$$;

create function public.console_changer_statut(p_acteur uuid, p_boutique_id uuid, p_statut text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
begin
  perform private.console_exige_admin(p_acteur);
  select b.statut::text into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant = p_statut then
    return;
  end if;
  update plateforme.boutiques set statut = p_statut::plateforme.statut_boutique where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.statut', p_statut,
    jsonb_build_object('statut', v_avant), jsonb_build_object('statut', p_statut));
end;
$$;


-- ---------------------------------------------------------------------
-- C2 · Réglages de marque
-- ---------------------------------------------------------------------
-- Remplace les champs de marque du thème (code, couleurs, polices, textes,
-- mode du logo). La validation est celle de toujours (private.valide_theme) :
-- une couleur hors #RRGGBB ou une police inconnue est refusée par la base,
-- quelle que soit la console. `p_version` est la version lue par le
-- formulaire : si quelqu'un a enregistré entre-temps, on refuse plutôt que
-- d'écraser son travail.
create function public.console_modifier_theme(p_acteur uuid, p_boutique_id uuid, p_version integer, p_theme jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant   jsonb;
  v_version integer;
  v_cle     text;
begin
  perform private.console_exige_admin(p_acteur);

  for v_cle in select jsonb_object_keys(p_theme) loop
    if v_cle not in ('code', 'couleurs', 'polices', 'textes', 'logo_mode') then
      raise exception 'Thème : champ « % » non modifiable ici', v_cle using errcode = 'check_violation';
    end if;
  end loop;

  select to_jsonb(t) - 'boutique_id' - 'updated_at' - 'updated_by', t.version
    into v_avant, v_version
    from public.themes t where t.boutique_id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Cette boutique n''a pas de thème' using errcode = 'no_data_found';
  end if;
  if v_version <> p_version then
    -- Pas le code 40001 (serialization_failure) : PostgREST rejoue d'office
    -- une transaction en conflit de sérialisation, sans fin ici.
    raise exception 'Le thème a été modifié entre-temps (version % au lieu de %) : rechargez la page', v_version, p_version
      using errcode = 'check_violation', hint = 'version';
  end if;

  update public.themes t set
    code      = coalesce(p_theme ->> 'code', t.code),
    couleurs  = coalesce(p_theme -> 'couleurs', t.couleurs),
    polices   = coalesce(p_theme -> 'polices', t.polices),
    textes    = coalesce(p_theme -> 'textes', t.textes),
    logo_mode = coalesce(p_theme ->> 'logo_mode', t.logo_mode),
    updated_by = p_acteur
  where t.boutique_id = p_boutique_id
  returning t.version into v_version;

  perform private.console_trace(p_acteur, p_boutique_id, 'theme.modifier', null, v_avant, p_theme);
  return v_version;
end;
$$;


-- ---------------------------------------------------------------------
-- Droits : service_role seul
-- ---------------------------------------------------------------------
-- Les droits par défaut du schéma public ouvrent toute nouvelle fonction à
-- anon et authenticated (comme chez Supabase) : on les retire un par un.
revoke execute on function public.console_administrateur(uuid)                               from public, anon, authenticated;
revoke execute on function public.console_boutiques()                                         from public, anon, authenticated;
revoke execute on function public.console_boutique(text)                                      from public, anon, authenticated;
revoke execute on function public.console_creer_boutique(uuid, text, text, text, text, text)  from public, anon, authenticated;
revoke execute on function public.console_ajouter_domaine(uuid, uuid, text, boolean)          from public, anon, authenticated;
revoke execute on function public.console_changer_statut(uuid, uuid, text)                    from public, anon, authenticated;
revoke execute on function public.console_modifier_theme(uuid, uuid, integer, jsonb)          from public, anon, authenticated;
grant  execute on function public.console_administrateur(uuid)                               to service_role;
grant  execute on function public.console_boutiques()                                         to service_role;
grant  execute on function public.console_boutique(text)                                      to service_role;
grant  execute on function public.console_creer_boutique(uuid, text, text, text, text, text)  to service_role;
grant  execute on function public.console_ajouter_domaine(uuid, uuid, text, boolean)          to service_role;
grant  execute on function public.console_changer_statut(uuid, uuid, text)                    to service_role;
grant  execute on function public.console_modifier_theme(uuid, uuid, integer, jsonb)          to service_role;
