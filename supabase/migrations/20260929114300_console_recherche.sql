-- =====================================================================
-- LA CONSOLE, LOT E — la recherche (Ctrl+K)
--
-- Ce qu'on tape retrouve, d'un coup : une boutique (son nom, son
-- identifiant, un de ses domaines), son client (la personne à appeler,
-- son téléphone, son e-mail), un prospect, un membre d'une équipe de
-- boutique ou de l'équipe SkanEcom (son adresse). Quelques lignes par
-- sorte, prêtes à afficher ; la console seule (clé de service).
-- =====================================================================

create function public.console_recherche(p_acteur uuid, p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q        text := btrim(coalesce(p_q, ''));
  v_motif    text;
  v_chiffres text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  perform private.console_exige_admin(p_acteur);
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  v_motif := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- Un numéro : les chiffres seuls (« 20 123 456 » retrouve « +21620123456 »).
  if char_length(v_chiffres) < 4 then
    v_chiffres := null;
  end if;

  return coalesce((select jsonb_agg(x) from (
    (select jsonb_build_object('genre', 'boutique', 'slug', b.slug, 'titre', b.nom,
              'hote', (select d.hote from plateforme.domaines d where d.boutique_id = b.id order by d.principal desc, d.created_at limit 1),
              'statut', b.statut, 'demonstration', b.demonstration) as x
       from plateforme.boutiques b
      where lower(b.nom) like v_motif or b.slug like v_motif
         or exists (select 1 from plateforme.domaines d where d.boutique_id = b.id and d.hote like v_motif)
      order by (lower(b.nom) like lower(v_q) || '%') desc, b.nom
      limit 6)
    union all
    (select jsonb_build_object('genre', 'client', 'slug', b.slug, 'titre', coalesce(c.nom, b.nom),
              'boutique', b.nom, 'telephone', c.telephone, 'email', c.email) as x
       from plateforme.contacts_boutiques c join plateforme.boutiques b on b.id = c.boutique_id
      where lower(coalesce(c.nom, '')) like v_motif or lower(coalesce(c.email, '')) like v_motif
         or (v_chiffres is not null and c.telephone like '%' || v_chiffres || '%')
         or (v_chiffres is not null and c.whatsapp like '%' || v_chiffres || '%')
      order by b.nom
      limit 4)
    union all
    (select jsonb_build_object('genre', 'prospect', 'id', p.id, 'titre', p.nom,
              'contact', p.contact_nom, 'telephone', p.telephone, 'ville', p.ville, 'etape', p.etape) as x
       from plateforme.prospects p
      where lower(p.nom) like v_motif or lower(coalesce(p.contact_nom, '')) like v_motif or lower(coalesce(p.email, '')) like v_motif
         or (v_chiffres is not null and p.telephone like '%' || v_chiffres || '%')
      order by (p.etape in ('gagne', 'perdu')), p.modifie_le desc
      limit 4)
    union all
    (select jsonb_build_object('genre', 'membre', 'slug', b.slug, 'titre', u.email,
              'boutique', b.nom, 'role', m.role, 'actif', m.actif) as x
       from plateforme.membres m
       join plateforme.boutiques b on b.id = m.boutique_id
       join auth.users u on u.id = m.user_id
      where lower(u.email) like v_motif
      order by u.email, b.nom
      limit 4)
    union all
    (select jsonb_build_object('genre', 'administrateur', 'titre', u.email, 'role', a.role) as x
       from plateforme.administrateurs a join auth.users u on u.id = a.user_id
      where lower(u.email) like v_motif
      order by u.email
      limit 3)
  ) t), '[]'::jsonb);
end;
$$;
revoke execute on function public.console_recherche(uuid, text) from public, anon, authenticated;
grant  execute on function public.console_recherche(uuid, text) to service_role;
