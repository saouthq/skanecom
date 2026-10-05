-- =====================================================================
-- LA CONSOLE, LOT E — les prospects
--
-- Les commerces à qui SkanEcom veut vendre, avant qu'ils soient clients :
-- qui appeler, où l'on en est (à contacter, contacté, démonstration
-- montrée, offre faite, gagné, perdu), la prochaine chose à faire et
-- quand. Gagné, le prospect devient une boutique (« Créer sa boutique »
-- reprend son nom et son contact) ; perdu, on note pourquoi.
-- La console seule les voit ; toute l'équipe SkanEcom les tient à jour,
-- et le journal garde chaque geste (pas le contenu des notes).
-- =====================================================================

create table plateforme.prospects (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null check (char_length(nom) between 1 and 120),
  contact_nom     text check (char_length(contact_nom) between 1 and 120),
  telephone       text check (telephone ~ '^\+[0-9]{8,15}$'),
  email           text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  ville           text check (char_length(ville) between 1 and 80),
  metier          text references plateforme.metiers (code) on delete set null,
  source          text not null default 'autre' check (source in ('bouche_a_oreille', 'reseaux', 'salon', 'demarchage', 'site', 'autre')),
  etape           text not null default 'a_contacter' check (etape in ('a_contacter', 'contacte', 'demo', 'offre', 'gagne', 'perdu')),
  prochaine_action text check (char_length(prochaine_action) between 1 and 200),
  prochaine_le    date,
  motif_perte     text check (char_length(motif_perte) between 1 and 300),
  note            text check (char_length(note) between 1 and 2000),
  boutique_id     uuid references plateforme.boutiques (id) on delete set null,
  cree_le         timestamptz not null default now(),
  cree_par        uuid references auth.users (id) on delete set null,
  modifie_le      timestamptz not null default now(),
  modifie_par     uuid references auth.users (id) on delete set null
);
create index prospects_etape on plateforme.prospects (etape, prochaine_le);
alter table plateforme.prospects enable row level security;

-- La liste, la plus pressée d'abord : la prochaine action la plus proche
-- (ou en retard), puis les plus récents.
create function public.console_prospects(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'nom', p.nom, 'contact_nom', p.contact_nom, 'telephone', p.telephone, 'email', p.email,
             'ville', p.ville, 'metier', p.metier, 'metier_nom', m.nom, 'source', p.source, 'etape', p.etape,
             'prochaine_action', p.prochaine_action, 'prochaine_le', p.prochaine_le, 'motif_perte', p.motif_perte,
             'note', p.note, 'boutique', case when b.id is null then null else jsonb_build_object('slug', b.slug, 'nom', b.nom) end,
             'cree_le', p.cree_le, 'modifie_le', p.modifie_le, 'par', u.email)
           order by (p.etape in ('gagne', 'perdu')), p.prochaine_le nulls last, p.modifie_le desc)
      from plateforme.prospects p
      left join plateforme.metiers m on m.code = p.metier
      left join plateforme.boutiques b on b.id = p.boutique_id
      left join auth.users u on u.id = p.modifie_par
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.console_prospects(uuid) from public, anon, authenticated;
grant  execute on function public.console_prospects(uuid) to service_role;

-- Créer (p_id null) ou modifier un prospect. Champ vide : effacé. Rend son id.
create function public.console_enregistrer_prospect(p_acteur uuid, p_id uuid, p_prospect jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id     uuid := p_id;
  v_nom    text := nullif(btrim(coalesce(p_prospect ->> 'nom', '')), '');
  v_email  text := lower(nullif(btrim(coalesce(p_prospect ->> 'email', '')), ''));
  v_metier text := nullif(p_prospect ->> 'metier', '');
  v_source text := coalesce(nullif(p_prospect ->> 'source', ''), 'autre');
  v_le     date;
begin
  perform private.console_exige_admin(p_acteur);
  if v_nom is null then
    raise exception 'Le nom du commerce est demandé' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail illisible : « % »', v_email using errcode = 'check_violation', hint = 'email';
  end if;
  if v_metier is not null and not exists (select 1 from plateforme.metiers m where m.code = v_metier) then
    raise exception 'Métier inconnu' using errcode = 'check_violation', hint = 'metier';
  end if;
  if v_source not in ('bouche_a_oreille', 'reseaux', 'salon', 'demarchage', 'site', 'autre') then
    raise exception 'Source inconnue' using errcode = 'check_violation', hint = 'source';
  end if;
  begin
    v_le := nullif(p_prospect ->> 'prochaine_le', '')::date;
  exception when others then
    raise exception 'Date illisible' using errcode = 'check_violation', hint = 'prochaine_le';
  end;

  if v_id is null then
    insert into plateforme.prospects (nom, contact_nom, telephone, email, ville, metier, source, prochaine_action, prochaine_le, note, cree_par, modifie_par)
    values (v_nom,
            nullif(btrim(coalesce(p_prospect ->> 'contact_nom', '')), ''),
            private.numero_international(p_prospect ->> 'telephone'),
            v_email,
            nullif(btrim(coalesce(p_prospect ->> 'ville', '')), ''),
            v_metier, v_source,
            nullif(btrim(coalesce(p_prospect ->> 'prochaine_action', '')), ''),
            v_le,
            nullif(btrim(coalesce(p_prospect ->> 'note', '')), ''),
            p_acteur, p_acteur)
    returning id into v_id;
    perform private.console_trace(p_acteur, null, 'prospect.creer', v_nom, null, jsonb_build_object('id', v_id));
  else
    update plateforme.prospects set
      nom = v_nom,
      contact_nom = nullif(btrim(coalesce(p_prospect ->> 'contact_nom', '')), ''),
      telephone = private.numero_international(p_prospect ->> 'telephone'),
      email = v_email,
      ville = nullif(btrim(coalesce(p_prospect ->> 'ville', '')), ''),
      metier = v_metier, source = v_source,
      prochaine_action = nullif(btrim(coalesce(p_prospect ->> 'prochaine_action', '')), ''),
      prochaine_le = v_le,
      note = nullif(btrim(coalesce(p_prospect ->> 'note', '')), ''),
      modifie_le = now(), modifie_par = p_acteur
     where id = v_id;
    if not found then
      raise exception 'Prospect introuvable' using errcode = 'no_data_found';
    end if;
    perform private.console_trace(p_acteur, null, 'prospect.modifier', v_nom, null, jsonb_build_object('id', v_id));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.console_enregistrer_prospect(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.console_enregistrer_prospect(uuid, uuid, jsonb) to service_role;

-- Changer d'étape. Perdu : un motif est demandé. Une étape d'avant la fin
-- efface le motif ; gagné garde la boutique liée (s'il y en a une).
create function public.console_etape_prospect(p_acteur uuid, p_id uuid, p_etape text, p_motif text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
  v_nom   text;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  perform private.console_exige_admin(p_acteur);
  if p_etape not in ('a_contacter', 'contacte', 'demo', 'offre', 'gagne', 'perdu') then
    raise exception 'Étape inconnue' using errcode = 'check_violation', hint = 'etape';
  end if;
  if p_etape = 'perdu' and v_motif is null then
    raise exception 'Dites pourquoi il est perdu (un mot suffit)' using errcode = 'check_violation', hint = 'motif';
  end if;
  select p.etape, p.nom into v_avant, v_nom from plateforme.prospects p where p.id = p_id for update;
  if v_avant is null then
    raise exception 'Prospect introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant = p_etape and p_etape <> 'perdu' then
    return;
  end if;
  update plateforme.prospects
     set etape = p_etape,
         motif_perte = case when p_etape = 'perdu' then v_motif end,
         modifie_le = now(), modifie_par = p_acteur
   where id = p_id;
  perform private.console_trace(p_acteur, null, 'prospect.etape', v_nom,
    jsonb_build_object('etape', v_avant), jsonb_build_object('etape', p_etape, 'motif', v_motif));
end;
$$;
revoke execute on function public.console_etape_prospect(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.console_etape_prospect(uuid, uuid, text, text) to service_role;

-- Gagné : la boutique créée pour lui s'y rattache, et il passe « gagné ».
create function public.console_lier_prospect(p_acteur uuid, p_id uuid, p_boutique_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom text;
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  update plateforme.prospects
     set boutique_id = p_boutique_id, etape = 'gagne', motif_perte = null, modifie_le = now(), modifie_par = p_acteur
   where id = p_id
  returning nom into v_nom;
  if v_nom is null then
    raise exception 'Prospect introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'prospect.gagne', v_nom, null, jsonb_build_object('id', p_id));
end;
$$;
revoke execute on function public.console_lier_prospect(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_lier_prospect(uuid, uuid, uuid) to service_role;

-- Retirer un prospect saisi par erreur (super-administrateur ; tracé).
create function public.console_retirer_prospect(p_acteur uuid, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom text;
begin
  perform private.console_exige_super_admin(p_acteur);
  delete from plateforme.prospects p where p.id = p_id returning p.nom into v_nom;
  if v_nom is null then
    raise exception 'Prospect introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, null, 'prospect.retirer', v_nom, null, null);
end;
$$;
revoke execute on function public.console_retirer_prospect(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_retirer_prospect(uuid, uuid) to service_role;
