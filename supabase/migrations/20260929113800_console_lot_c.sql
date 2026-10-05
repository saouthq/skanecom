-- =====================================================================
-- LA CONSOLE, LOT C — l'accueil
--
-- · « À surveiller » se met à plus tard : un signal reporté (jusqu'à
--   demain, ou pour une semaine) se tait pour toute l'équipe SkanEcom, puis
--   revient seul. S'il s'aggrave entre-temps (une attente qui devient
--   urgente), il revient aussitôt : la console garde le niveau qu'il avait.
-- · La liste des boutiques s'exporte (l'export est tracé, comme les autres).
-- =====================================================================

create table plateforme.vigilances_reportees (
  -- La clé du signal, telle que la console la fabrique (« <boutique>:attente »,
  -- « <boutique>:certificat:<hôte> », « plateforme:envois »…).
  cle    text primary key check (cle ~ '^[A-Za-z0-9:._-]{3,200}$'),
  niveau text not null check (niveau in ('urgent', 'attention', 'info')),
  jusqua timestamptz not null,
  acteur uuid references auth.users (id) on delete set null,
  le     timestamptz not null default now()
);
alter table plateforme.vigilances_reportees enable row level security;

-- La boutique d'une clé (son identifiant en tête), si c'en est une.
create function private.boutique_de_vigilance(p_cle text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select b.id from plateforme.boutiques b
   where substring(p_cle from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):') is not null
     and b.id = substring(p_cle from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):')::uuid
$$;
revoke execute on function private.boutique_de_vigilance(text) from public, anon, authenticated;

-- Reporter un signal : jusqu'à demain (1) ou pour une semaine (7).
create function public.console_reporter_vigilance(p_acteur uuid, p_cle text, p_niveau text, p_jours integer)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jusqua timestamptz;
begin
  perform private.console_exige_admin(p_acteur);
  if p_jours not in (1, 7) then
    raise exception 'Reporter d''un jour ou d''une semaine' using errcode = 'check_violation';
  end if;
  if coalesce(p_cle, '') !~ '^[A-Za-z0-9:._-]{3,200}$' then
    raise exception 'Signal inconnu' using errcode = 'check_violation';
  end if;
  v_jusqua := now() + make_interval(days => p_jours);
  insert into plateforme.vigilances_reportees (cle, niveau, jusqua, acteur)
  values (p_cle, p_niveau, v_jusqua, p_acteur)
  on conflict (cle) do update set niveau = excluded.niveau, jusqua = excluded.jusqua, acteur = excluded.acteur, le = now();
  perform private.console_trace(p_acteur, private.boutique_de_vigilance(p_cle), 'vigilance.reportee', p_cle, null,
    jsonb_build_object('jours', p_jours, 'niveau', p_niveau));
  return v_jusqua;
end;
$$;
revoke execute on function public.console_reporter_vigilance(uuid, text, text, integer) from public, anon, authenticated;
grant  execute on function public.console_reporter_vigilance(uuid, text, text, integer) to service_role;

-- Le reprendre tout de suite.
create function public.console_reprendre_vigilance(p_acteur uuid, p_cle text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  delete from plateforme.vigilances_reportees where cle = p_cle;
  if found then
    perform private.console_trace(p_acteur, private.boutique_de_vigilance(p_cle), 'vigilance.reprise', p_cle, null, null);
  end if;
end;
$$;
revoke execute on function public.console_reprendre_vigilance(uuid, text) from public, anon, authenticated;
grant  execute on function public.console_reprendre_vigilance(uuid, text) to service_role;

-- Les signaux reportés encore tus (les échus s'effacent au passage).
create function public.console_vigilances_reportees(p_acteur uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  delete from plateforme.vigilances_reportees r where r.jusqua <= now();
  return coalesce((
    select jsonb_agg(jsonb_build_object('cle', r.cle, 'niveau', r.niveau, 'jusqua', r.jusqua, 'par', u.email) order by r.jusqua)
      from plateforme.vigilances_reportees r
      left join auth.users u on u.id = r.acteur
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.console_vigilances_reportees(uuid) from public, anon, authenticated;
grant  execute on function public.console_vigilances_reportees(uuid) to service_role;

-- L'export de la liste des boutiques se trace comme ceux du journal et du tableau.
create or replace function public.console_tracer_export(p_acteur uuid, p_quoi text, p_filtres jsonb default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if p_quoi not in ('journal', 'tableau', 'boutiques') then
    raise exception 'Export inconnu « % »', p_quoi using errcode = 'check_violation';
  end if;
  perform private.console_trace(p_acteur, null, 'export.' || p_quoi, null, null, nullif(coalesce(p_filtres, '{}'::jsonb), '{}'::jsonb));
end;
$$;
