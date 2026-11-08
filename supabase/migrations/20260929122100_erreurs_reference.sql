-- ============================================================================
-- LA RÉFÉRENCE D'UNE ERREUR SE RETROUVE — l'écran « n'a pas pu s'afficher »
-- donne une référence (le digest) : elle doit mener à l'erreur dans État
-- technique → Erreurs de l'application.
--
-- Le serveur la note désormais avec sa référence (instrumentation.ts la
-- calcule comme le rendu). Et si le serveur n'a pas pu la noter (le Worker
-- coupé avant l'envoi), le navigateur la signale lui-même, par sa référence
-- et son adresse : une ligne « sans détail », que la note du serveur
-- remplace si elle arrive ensuite. Une référence déjà notée par le serveur
-- ne compte pas deux fois.
-- ============================================================================

create or replace function public.erreurs_noter(
  p_surface text, p_genre text, p_slug text, p_hote text, p_route text, p_chemin text,
  p_message text, p_pile text, p_digest text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_surface text := case when p_surface in ('vitrine', 'backoffice', 'console', 'serveur') then p_surface else 'serveur' end;
  v_genre text := case when p_genre = 'navigateur' then 'navigateur' else 'serveur' end;
  v_boutique uuid;
  v_message text := left(nullif(btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')), ''), 500);
  v_route text := left(nullif(btrim(coalesce(p_route, '')), ''), 200);
  v_chemin text := left(nullif(split_part(split_part(btrim(coalesce(p_chemin, '')), '?', 1), '#', 1), ''), 300);
  v_empreinte text;
  v_id bigint;
  v_digest text;
begin
  if v_message is null then return null; end if;
  v_digest := left(nullif(btrim(coalesce(p_digest, '')), ''), 64);
  if v_digest is not null then
    if v_genre = 'navigateur' then
      -- Le navigateur signale une erreur du serveur par sa référence : déjà
      -- notée (par le serveur, ou par un premier signalement), rien de plus.
      select e.id into v_id from plateforme.erreurs e
       where e.digest = v_digest and e.derniere_le > now() - interval '1 day'
       order by e.derniere_le desc limit 1;
      if v_id is not null then return v_id; end if;
    else
      -- Le serveur note après le navigateur : la ligne sans détail cède la place.
      delete from plateforme.erreurs e where e.digest = v_digest and e.genre = 'navigateur';
    end if;
  end if;
  -- La boutique : par l'adresse réécrite (/_b/<boutique>/…, /gestion/<boutique>/…), sinon par l'hôte.
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    select b.id into v_boutique from plateforme.boutiques b where b.slug = lower(split_part(btrim(p_slug), '~', 1));
  end if;
  if v_boutique is null and nullif(btrim(coalesce(p_hote, '')), '') is not null then
    select d.boutique_id into v_boutique from plateforme.domaines d where d.hote = lower(split_part(btrim(p_hote), ':', 1));
  end if;
  -- L'empreinte : la même erreur au même endroit, chiffres et identifiants mis à part.
  v_empreinte := md5(concat_ws('|', v_surface, v_genre, coalesce(v_boutique::text, '-'), coalesce(v_route, v_chemin, '-'),
    regexp_replace(regexp_replace(v_message, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'gi'), '[0-9]+', '#', 'g')));

  update plateforme.erreurs e
     set nombre = least(e.nombre, 2000000000) + 1,
         nombre_heure = case when e.heure = date_trunc('hour', now()) then e.nombre_heure + 1 else 1 end,
         heure = date_trunc('hour', now()),
         derniere_le = now(),
         chemin = coalesce(v_chemin, e.chemin),
         digest = coalesce(left(nullif(btrim(coalesce(p_digest, '')), ''), 64), e.digest),
         pile = coalesce(e.pile, left(nullif(btrim(coalesce(p_pile, '')), ''), 1500))
   where e.empreinte = v_empreinte and e.reglee_le is null
  returning e.id into v_id;
  if v_id is not null then return v_id; end if;

  -- Une erreur nouvelle : cinq cents ouvertes au plus (une avalanche ne remplit pas la base).
  if (select count(*) from plateforme.erreurs e where e.reglee_le is null) >= 500 then return null; end if;
  insert into plateforme.erreurs (empreinte, surface, genre, boutique_id, route, chemin, message, pile, digest)
  values (v_empreinte, v_surface, v_genre, v_boutique, v_route, v_chemin, v_message,
          left(nullif(btrim(coalesce(p_pile, '')), ''), 1500), left(nullif(btrim(coalesce(p_digest, '')), ''), 64))
  on conflict (empreinte) where reglee_le is null do update set nombre = plateforme.erreurs.nombre + 1, derniere_le = now()
  returning id into v_id;
  -- Trente jours d'histoire.
  delete from plateforme.erreurs e where e.derniere_le < now() - interval '30 days';
  return v_id;
end;
$$;
