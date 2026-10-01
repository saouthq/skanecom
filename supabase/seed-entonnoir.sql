-- =====================================================================
-- SkanEcom · jeu de démonstration : L'ENTONNOIR ET LES CAMPAGNES (migration 56)
-- =====================================================================
-- Les visites inventées de Maison Selma (seed-visites.sql) reçoivent leur
-- étape — autant de commandes passées, chaque jour, que la boutique en a
-- reçu de la vitrine ce jour-là ; deux fois plus de commandes ouvertes ;
-- un peu plus de paniers ; une fiche vue par une visite sur deux — et
-- trois campagnes : « lin-d-ete » sur Instagram, « vente-privee » sur
-- Facebook, « lettre-septembre » par e-mail.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage (il
-- recalcule les mêmes valeurs).
-- =====================================================================

do $$
declare
  b         constant uuid := '00000000-0000-4000-8000-000000000003';
  v_aujourd constant date := (now() at time zone 'Africa/Tunis')::date;
begin
  with cmd as (
    select (c.created_at at time zone 'Africa/Tunis')::date as jour, count(*) as n
      from public.commandes c
     where c.boutique_id = b and c.origine = 'vitrine' and c.statut <> 'a_arbitrer'
     group by 1
  ), r as (
    select v.jour, v.empreinte,
           row_number() over (partition by v.jour order by v.empreinte) as rn,
           count(*) over (partition by v.jour) as total
      from public.vitrine_visites v
     where v.boutique_id = b and v.jour < v_aujourd
  )
  update public.vitrine_visites v
     set etape = case
                   when r.rn <= coalesce(c.n, 0) then 4
                   when r.rn <= coalesce(c.n, 0) * 2 + 1 then 3
                   when r.rn <= coalesce(c.n, 0) * 3 + round(r.total * 0.07) then 2
                   when r.rn <= round(r.total * 0.52) or v.entree like '/produit/%' then 1
                   else 0
                 end
    from r left join cmd c on c.jour = r.jour
   where v.boutique_id = b and v.jour = r.jour and v.empreinte = r.empreinte;

  -- Les campagnes : une visite sur trois venue d'Instagram ces trois
  -- dernières semaines, une sur deux venue de Facebook ces douze derniers
  -- jours, une directe sur cinq il y a cinq à huit jours (la lettre).
  update public.vitrine_visites v set campagne = 'lin-d-ete'
   where v.boutique_id = b and v.jour between v_aujourd - 21 and v_aujourd - 1
     and v.source = 'instagram.com' and get_byte(v.empreinte, 1) % 3 = 0;
  update public.vitrine_visites v set campagne = 'vente-privee'
   where v.boutique_id = b and v.jour between v_aujourd - 12 and v_aujourd - 1
     and v.source = 'facebook.com' and get_byte(v.empreinte, 1) % 2 = 0;
  update public.vitrine_visites v set campagne = 'lettre-septembre', source = 'email'
   where v.boutique_id = b and v.jour between v_aujourd - 8 and v_aujourd - 5
     and v.source is null and get_byte(v.empreinte, 1) % 5 = 0;
  -- Deux commandes ouvertes sur trois, ces trois semaines, viennent des
  -- deux campagnes de réseau : elles ont vendu.
  update public.vitrine_visites v
     set campagne = case when v.jour >= v_aujourd - 12 and get_byte(v.empreinte, 2) % 2 = 0 then 'vente-privee' else 'lin-d-ete' end,
         source   = case when v.jour >= v_aujourd - 12 and get_byte(v.empreinte, 2) % 2 = 0 then 'facebook.com' else 'instagram.com' end
   where v.boutique_id = b and v.jour between v_aujourd - 21 and v_aujourd - 1
     and v.etape >= 3 and get_byte(v.empreinte, 3) % 3 <> 0;
end;
$$;
