-- =====================================================================
-- LA CONSOLE, LOT C (2) — la fiche d'une boutique
--
-- · Les coordonnées du client : qui appeler (son nom, son téléphone, son
--   WhatsApp, son e-mail), son matricule fiscal, son adresse, un mot. La
--   console seule les voit ; toute l'équipe SkanEcom les tient à jour, et le
--   journal dit quand et quels champs (pas leur contenu).
-- · Suspendre dit pourquoi : un motif, et un message que l'équipe de la
--   boutique lit en tête de son backoffice tant que la suspension dure.
--   Rouvrir l'efface ; le journal garde l'un et l'autre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Les coordonnées du client
-- ---------------------------------------------------------------------
create table plateforme.contacts_boutiques (
  boutique_id uuid primary key references plateforme.boutiques (id) on delete cascade,
  nom         text check (char_length(nom) between 1 and 120),
  telephone   text check (telephone ~ '^\+[0-9]{8,15}$'),
  whatsapp    text check (whatsapp ~ '^\+[0-9]{8,15}$'),
  email       text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  matricule   text check (char_length(matricule) between 1 and 40),
  adresse     text check (char_length(adresse) between 1 and 300),
  note        text check (char_length(note) between 1 and 1000),
  modifie_le  timestamptz not null default now(),
  modifie_par uuid references auth.users (id) on delete set null
);
alter table plateforme.contacts_boutiques enable row level security;

-- Un numéro tel qu'on le tape (« 20 123 456 », « +216 20-123-456 »,
-- « 0021620123456 ») → « +21620123456 » ; vide → null. Huit chiffres seuls :
-- un numéro tunisien. Illisible : l'erreur le dit.
create function private.numero_international(p_numero text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_numero, ''), '[\s.()/-]', '', 'g');
begin
  if v = '' then
    return null;
  end if;
  if v ~ '^00[0-9]+$' then
    v := '+' || substring(v from 3);
  elsif v ~ '^[0-9]{8}$' then
    v := '+216' || v;
  elsif v ~ '^216[0-9]{8}$' then
    v := '+' || v;
  end if;
  if v !~ '^\+[0-9]{8,15}$' then
    raise exception 'Numéro illisible : « % »', p_numero using errcode = 'check_violation', hint = 'numero';
  end if;
  return v;
end;
$$;
revoke execute on function private.numero_international(text) from public, anon, authenticated;

create function public.console_contact(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return (
    select jsonb_build_object(
             'nom', c.nom, 'telephone', c.telephone, 'whatsapp', c.whatsapp, 'email', c.email,
             'matricule', c.matricule, 'adresse', c.adresse, 'note', c.note,
             'modifie_le', c.modifie_le, 'par', u.email)
      from plateforme.contacts_boutiques c
      left join auth.users u on u.id = c.modifie_par
     where c.boutique_id = p_boutique_id);
end;
$$;
revoke execute on function public.console_contact(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_contact(uuid, uuid) to service_role;

-- Enregistrer les coordonnées (champ vide : effacé). Rend les champs changés.
create function public.console_enregistrer_contact(p_acteur uuid, p_boutique_id uuid, p_contact jsonb)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant  plateforme.contacts_boutiques;
  v_apres  plateforme.contacts_boutiques;
  v_champs text[] := '{}';
  v_texte  text;
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  select * into v_avant from plateforme.contacts_boutiques c where c.boutique_id = p_boutique_id;

  v_apres.boutique_id := p_boutique_id;
  v_apres.nom       := nullif(btrim(coalesce(p_contact ->> 'nom', '')), '');
  v_apres.telephone := private.numero_international(p_contact ->> 'telephone');
  v_apres.whatsapp  := private.numero_international(p_contact ->> 'whatsapp');
  v_texte := lower(nullif(btrim(coalesce(p_contact ->> 'email', '')), ''));
  if v_texte is not null and v_texte !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail illisible : « % »', v_texte using errcode = 'check_violation', hint = 'email';
  end if;
  v_apres.email     := v_texte;
  v_apres.matricule := upper(nullif(regexp_replace(btrim(coalesce(p_contact ->> 'matricule', '')), '\s+', ' ', 'g'), ''));
  v_apres.adresse   := nullif(btrim(coalesce(p_contact ->> 'adresse', '')), '');
  v_apres.note      := nullif(btrim(coalesce(p_contact ->> 'note', '')), '');

  if v_avant.nom       is distinct from v_apres.nom       then v_champs := array_append(v_champs, 'nom'); end if;
  if v_avant.telephone is distinct from v_apres.telephone then v_champs := array_append(v_champs, 'telephone'); end if;
  if v_avant.whatsapp  is distinct from v_apres.whatsapp  then v_champs := array_append(v_champs, 'whatsapp'); end if;
  if v_avant.email     is distinct from v_apres.email     then v_champs := array_append(v_champs, 'email'); end if;
  if v_avant.matricule is distinct from v_apres.matricule then v_champs := array_append(v_champs, 'matricule'); end if;
  if v_avant.adresse   is distinct from v_apres.adresse   then v_champs := array_append(v_champs, 'adresse'); end if;
  if v_avant.note      is distinct from v_apres.note      then v_champs := array_append(v_champs, 'note'); end if;
  if cardinality(v_champs) = 0 then
    return v_champs;
  end if;

  insert into plateforme.contacts_boutiques (boutique_id, nom, telephone, whatsapp, email, matricule, adresse, note, modifie_le, modifie_par)
  values (p_boutique_id, v_apres.nom, v_apres.telephone, v_apres.whatsapp, v_apres.email, v_apres.matricule, v_apres.adresse, v_apres.note, now(), p_acteur)
  on conflict (boutique_id) do update set
    nom = excluded.nom, telephone = excluded.telephone, whatsapp = excluded.whatsapp, email = excluded.email,
    matricule = excluded.matricule, adresse = excluded.adresse, note = excluded.note,
    modifie_le = now(), modifie_par = p_acteur;
  -- Le journal dit quels champs, pas leur contenu.
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.contact', null, null, jsonb_build_object('champs', to_jsonb(v_champs)));
  return v_champs;
end;
$$;
revoke execute on function public.console_enregistrer_contact(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.console_enregistrer_contact(uuid, uuid, jsonb) to service_role;


-- ---------------------------------------------------------------------
-- Suspendre, avec un motif et un message
-- ---------------------------------------------------------------------
alter table plateforme.boutiques
  add column suspension_motif   text check (suspension_motif in ('impaye', 'demande', 'contenu', 'securite', 'autre')),
  add column suspension_message text check (char_length(suspension_message) between 1 and 600),
  add column suspendue_le       timestamptz;

create function public.console_suspendre(p_acteur uuid, p_boutique_id uuid, p_motif text, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant   text;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  perform private.console_exige_super_admin(p_acteur);
  if coalesce(p_motif, '') not in ('impaye', 'demande', 'contenu', 'securite', 'autre') then
    raise exception 'Dites pourquoi la boutique est suspendue' using errcode = 'check_violation', hint = 'motif';
  end if;
  if p_motif = 'autre' and v_message is null then
    raise exception 'Pour « Autre raison », écrivez le message au commerçant' using errcode = 'check_violation', hint = 'message';
  end if;
  select b.statut::text into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant not in ('active', 'suspendue') then
    raise exception 'Seule une boutique ouverte se suspend' using errcode = 'check_violation';
  end if;
  update plateforme.boutiques
     set statut = 'suspendue', suspension_motif = p_motif, suspension_message = v_message,
         suspendue_le = case when v_avant = 'suspendue' then suspendue_le else now() end
   where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.statut', 'suspendue',
    jsonb_build_object('statut', v_avant), jsonb_build_object('statut', 'suspendue', 'motif', p_motif, 'message', v_message));
end;
$$;
revoke execute on function public.console_suspendre(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.console_suspendre(uuid, uuid, text, text) to service_role;

-- Rouvrir (ou fermer) efface le motif et le message de la suspension.
create or replace function public.console_changer_statut(p_acteur uuid, p_boutique_id uuid, p_statut text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
begin
  perform private.console_exige_super_admin(p_acteur);
  select b.statut::text into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant = p_statut then
    return;
  end if;
  update plateforme.boutiques
     set statut = p_statut::plateforme.statut_boutique,
         suspension_motif   = case when p_statut = 'suspendue' then suspension_motif end,
         suspension_message = case when p_statut = 'suspendue' then suspension_message end,
         suspendue_le       = case when p_statut = 'suspendue' then coalesce(suspendue_le, now()) end
   where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.statut', p_statut,
    jsonb_build_object('statut', v_avant), jsonb_build_object('statut', p_statut));
end;
$$;

-- La suspension telle que l'équipe de la boutique la lit (son backoffice) :
-- null si la boutique n'est pas suspendue, ou si l'on n'en est pas.
create function public.gestion_suspension(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('motif', b.suspension_motif, 'message', b.suspension_message, 'le', b.suspendue_le)
    from plateforme.boutiques b
   where b.id = p_boutique_id and b.statut = 'suspendue'
     and (private.est_membre(b.id)
          or exists (select 1 from plateforme.acces_support s
                      where s.boutique_id = b.id and s.user_id = auth.uid() and s.ferme_le is null and s.expire_le > now()))
$$;
revoke execute on function public.gestion_suspension(uuid) from public, anon;
grant  execute on function public.gestion_suspension(uuid) to authenticated;

-- La fiche de la console lit le motif et le message avec la boutique.
create function public.console_suspension(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return (select jsonb_build_object('motif', b.suspension_motif, 'message', b.suspension_message, 'le', b.suspendue_le)
            from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'suspendue');
end;
$$;
revoke execute on function public.console_suspension(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_suspension(uuid, uuid) to service_role;
