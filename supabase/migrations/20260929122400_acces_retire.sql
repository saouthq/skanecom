-- =====================================================================
-- L'ACCÈS RETIRÉ SE DIT (09/11, parcours en vrai)
-- =====================================================================
-- Un employé dont le propriétaire vient de retirer l'accès, encore
-- connecté sur son téléphone, tombait sur « Accès refusé : … demandez à son
-- propriétaire de vous ajouter à l'équipe » — comme s'il n'en avait jamais
-- fait partie. Ses boutiques d'avant (une ligne de membre inactive) se
-- lisent désormais : la porte dit laquelle lui a retiré l'accès, et comment
-- le retrouver. Rien de plus que leur nom, à lui seul.
-- =====================================================================

create function public.mes_acces_retires()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(b.nom order by m.updated_at desc), '[]'::jsonb)
    from plateforme.membres m
    join plateforme.boutiques b on b.id = m.boutique_id
   where m.user_id = auth.uid() and not m.actif and b.statut <> 'fermee';
$$;
comment on function public.mes_acces_retires() is
  'Le nom des boutiques dont l''équipe a retiré l''accès au compte connecté (membre inactif) : la porte « Accès refusé » le dit.';
revoke execute on function public.mes_acces_retires() from public, anon;
grant  execute on function public.mes_acces_retires() to authenticated;
