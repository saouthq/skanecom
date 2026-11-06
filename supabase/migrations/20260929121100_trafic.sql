-- =====================================================================
-- LE TRAFIC DE LA PLATEFORME — ce que Cloudflare a servi, heure par heure.
--
-- Le passage de l'heure (et « Relire maintenant ») lit chez Cloudflare,
-- avec une clé en lecture seule (Account Analytics: Read), les appels des
-- Workers de SkanEcom : combien de requêtes, combien d'erreurs, le temps
-- de calcul (médiane et 99e centile), par Worker et par heure. Les 25
-- dernières heures sont relues à chaque tour (la dernière se remplit
-- encore) ; trente jours sont gardés. La console les montre (État
-- technique → Trafic) ; un taux d'erreur qui monte passe au verdict.
-- =====================================================================

create table plateforme.trafic_heures (
  heure         timestamptz not null check (heure = date_trunc('hour', heure)),
  script        text not null check (char_length(script) between 1 and 80),
  -- Le Worker de l'application (il sert toutes les boutiques) ; les autres sont
  -- les routeurs de l'aperçu, un par adresse, qui lui passent chaque requête :
  -- les totaux ne comptent que lui, sans quoi une visite compterait deux fois.
  principal     boolean not null default false,
  requetes      bigint not null default 0 check (requetes >= 0),
  erreurs       bigint not null default 0 check (erreurs >= 0),
  sous_requetes bigint not null default 0 check (sous_requetes >= 0),
  -- Le temps de calcul, en millisecondes (Cloudflare le donne en microsecondes).
  cpu_p50       real check (cpu_p50 >= 0),
  cpu_p99       real check (cpu_p99 >= 0),
  primary key (heure, script)
);
alter table plateforme.trafic_heures enable row level security;

-- La dernière lecture : son mode, si Cloudflare a répondu, pourquoi sinon.
create table plateforme.trafic_lecture (
  id            boolean primary key default true check (id),
  mode          text not null check (mode in ('reel', 'local', 'aucun')),
  ok            boolean,
  detail        text check (char_length(detail) <= 300),
  le            timestamptz not null default now(),
  dernier_ok_le timestamptz
);
alter table plateforme.trafic_lecture enable row level security;
-- Aucune politique : seules les fonctions ci-dessous y touchent.

comment on table plateforme.trafic_heures is
  'Le trafic des Workers de SkanEcom, lu chez Cloudflare : requêtes, erreurs, temps de calcul, par heure et par Worker (trente jours).';

-- L'application note une lecture (clé service_role) : les heures relues, ou la raison d'un échec.
create function public.trafic_noter(p_mode text, p_ok boolean, p_detail text, p_heures jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e jsonb;
  n integer := 0;
begin
  insert into plateforme.trafic_lecture (id, mode, ok, detail, le, dernier_ok_le)
  values (true, p_mode, p_ok, left(nullif(btrim(coalesce(p_detail, '')), ''), 300), now(), case when p_ok then now() end)
  on conflict (id) do update
    set mode = excluded.mode, ok = excluded.ok, detail = excluded.detail, le = now(),
        dernier_ok_le = case when excluded.ok then now() else plateforme.trafic_lecture.dernier_ok_le end;

  if p_ok then
    for e in select * from jsonb_array_elements(coalesce(p_heures, '[]'::jsonb)) loop
      insert into plateforme.trafic_heures (heure, script, principal, requetes, erreurs, sous_requetes, cpu_p50, cpu_p99)
      values (date_trunc('hour', (e ->> 'heure')::timestamptz), e ->> 'script', coalesce((e ->> 'principal')::boolean, false),
              coalesce((e ->> 'requetes')::bigint, 0), coalesce((e ->> 'erreurs')::bigint, 0),
              coalesce((e ->> 'sous_requetes')::bigint, 0), (e ->> 'cpu_p50')::real, (e ->> 'cpu_p99')::real)
      on conflict (heure, script) do update
        set principal = excluded.principal, requetes = excluded.requetes, erreurs = excluded.erreurs, sous_requetes = excluded.sous_requetes,
            cpu_p50 = excluded.cpu_p50, cpu_p99 = excluded.cpu_p99;
      n := n + 1;
    end loop;
  end if;
  delete from plateforme.trafic_heures where heure < now() - interval '30 days';
  return n;
end;
$$;
revoke execute on function public.trafic_noter(text, boolean, text, jsonb) from public, anon, authenticated;
grant  execute on function public.trafic_noter(text, boolean, text, jsonb) to service_role;

-- La console : les 24 dernières heures (une ligne par heure, les heures sans
-- appel comprises), les totaux sur 24 heures et 7 jours — du Worker de
-- l'application seul —, le détail par Worker, la dernière lecture.
create function public.console_trafic(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fin timestamptz := date_trunc('hour', now());
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'lecture', (select jsonb_build_object('mode', l.mode, 'ok', l.ok, 'detail', l.detail, 'le', l.le, 'dernier_ok_le', l.dernier_ok_le)
                  from plateforme.trafic_lecture l),
    'heures', (select coalesce(jsonb_agg(jsonb_build_object('heure', h.heure, 'requetes', coalesce(t.requetes, 0), 'erreurs', coalesce(t.erreurs, 0),
                                                            'cpu_p50', t.cpu_p50, 'cpu_p99', t.cpu_p99) order by h.heure), '[]'::jsonb)
                 from generate_series(v_fin - interval '23 hours', v_fin, interval '1 hour') as h(heure)
                 left join (select x.heure, sum(x.requetes) as requetes, sum(x.erreurs) as erreurs,
                                   max(x.cpu_p50) as cpu_p50, max(x.cpu_p99) as cpu_p99
                              from plateforme.trafic_heures x where x.principal group by x.heure) t on t.heure = h.heure),
    'jour', (select jsonb_build_object('requetes', coalesce(sum(x.requetes), 0), 'erreurs', coalesce(sum(x.erreurs), 0),
                                       'cpu_p50', max(x.cpu_p50), 'cpu_p99', max(x.cpu_p99))
               from plateforme.trafic_heures x where x.principal and x.heure > v_fin - interval '24 hours'),
    'semaine', (select jsonb_build_object('requetes', coalesce(sum(x.requetes), 0), 'erreurs', coalesce(sum(x.erreurs), 0))
                  from plateforme.trafic_heures x where x.principal and x.heure > v_fin - interval '7 days'),
    'scripts', (select coalesce(jsonb_agg(jsonb_build_object('script', s.script, 'principal', s.principal, 'requetes', s.requetes, 'erreurs', s.erreurs)
                                          order by s.principal desc, s.requetes desc), '[]'::jsonb)
                  from (select x.script, bool_or(x.principal) as principal, sum(x.requetes) as requetes, sum(x.erreurs) as erreurs
                          from plateforme.trafic_heures x where x.heure > v_fin - interval '24 hours' group by x.script) s)
  );
end;
$$;
revoke execute on function public.console_trafic(uuid) from public, anon, authenticated;
grant  execute on function public.console_trafic(uuid) to service_role;

-- Une relecture lancée depuis la console : au journal.
create function public.console_tracer_trafic(p_acteur uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  perform private.console_trace(p_acteur, null, 'plateforme.trafic_relu', null, null, null);
end;
$$;
revoke execute on function public.console_tracer_trafic(uuid) from public, anon, authenticated;
grant  execute on function public.console_tracer_trafic(uuid) to service_role;
