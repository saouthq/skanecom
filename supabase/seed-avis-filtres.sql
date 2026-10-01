-- =====================================================================
-- SkanEcom · jeu de démonstration : UNE FICHE AUX NOMBREUX AVIS (migration 62)
-- =====================================================================
-- Le sac de voyage de Maison Selma, vendu depuis l'automne 2025 : douze
-- clientes et clients livrés le notent (de deux à cinq étoiles, un sans
-- texte), trois avec des photos, la boutique répond à trois. De quoi
-- filtrer (« avec photos », par note) et voir la suite de la liste.
--
-- Les photos sont des recadrages de la photo du sac
-- (supabase/fichiers-demo/maison-selma/avis/, aucune personne dessus) : un
-- avis de démonstration n'est pas celui d'un vrai client, et une photo de
-- mannequin n'est jamais présentée comme celle d'un client.
--
-- Les commandes datent de 2025 (SEL-2025-001xx) : ni la période du tableau
-- de bord ni les six mois de l'objectif ne bougent. Chaque sac vendu revient
-- au stock (un arrivage du même jour) : le stock de démonstration non plus.
--
-- Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

do $$
declare
  s constant uuid := '00000000-0000-4000-8000-000000000003';
  a          record;
  t0         timestamptz;
  v_variante public.variantes;
  v_client   uuid;
  v_commande uuid;
  v_devis    jsonb;
  v_ligne    public.commande_lignes;
  v_avis     uuid;
  v_stock    integer;
  v_photo    text;
  v_rang     integer;
begin
  select * into v_variante from public.variantes where boutique_id = s and sku = 'SEL19-COG';
  if v_variante.id is null or exists (select 1 from public.commandes where boutique_id = s and numero like 'SEL-2025-001%') then
    return;
  end if;
  for a in
    select * from (values
      (1,  'Amel Bouazizi',   '+21620333401', 'Tunis',     'tunis',     date '2025-09-06', 5,
           'Acheté pour un mariage à Djerba : tout mon week-end dedans, et il a fière allure. Le cuir a déjà pris une jolie patine.',
           array['sac-boucle'], null),
      (2,  'Youssef Karoui',  '+21620333402', 'Sfax',      'sfax',      date '2025-09-14', 4,
           'Très beau sac, solide. Un peu lourd à vide, mais c''est le prix du vrai cuir.',
           array[]::text[], 'Merci Youssef ! C''est le cuir pleine fleur : il s''assouplit avec le temps.'),
      (3,  'Leila Mansour',   '+21620333403', 'Bizerte',   'bizerte',   date '2025-09-27', 5,
           'Livré en deux jours, bien emballé. Les coutures sont nettes et la bandoulière se règle sur toute sa longueur.',
           array['sac-coutures', 'sac-bandouliere'], null),
      (4,  'Hatem Saidi',     '+21620333404', 'Monastir',  'monastir',  date '2025-10-08', 5,
           'Offert à mon père, il ne le quitte plus pour ses déplacements.',
           array[]::text[], null),
      (5,  'Salma Dridi',     '+21620333405', 'Nabeul',    'nabeul',    date '2025-10-19', 3,
           'Joli sac, mais la couleur est plus foncée que sur la photo. La boutique m''a bien répondu.',
           array[]::text[], 'Merci Salma. Chaque peau prend la teinte à sa façon ; écrivez-nous si vous souhaitez l''échanger.'),
      (6,  'Nizar Chebbi',    '+21620333406', 'Ariana',    'ariana',    date '2025-10-30', 5,
           'Le format idéal pour la cabine : il passe sous le siège et tient trois jours de déplacement.',
           array[]::text[], null),
      (7,  'Rania Ayari',     '+21620333407', 'Sousse',    'sousse',    date '2025-11-09', 4,
           'Belle finition. J''aurais aimé une poche intérieure zippée pour les papiers.',
           array[]::text[], null),
      (8,  'Mourad Zouari',   '+21620333408', 'Gabès',     'gabes',     date '2025-11-21', 2,
           'Une sangle s''est décousue au bout de deux mois. La boutique l''a reprise et réparée, mais j''attendais mieux.',
           array[]::text[], 'Merci Mourad, et pardon pour ce défaut : la réparation reste gratuite tant que vous l''avez.'),
      (9,  'Ines Ferchichi',  '+21620333409', 'Tunis',     'tunis',     date '2025-12-02', 5,
           'Le rabat des poches ferme bien, rien ne tombe. Il sent le vrai cuir.',
           array['sac-rabat'], null),
      (10, 'Karima Gharsalli', '+21620333410', 'La Marsa', 'tunis',     date '2025-12-13', 5,
           null,
           array[]::text[], null),
      (11, 'Bilel Toumi',     '+21620333411', 'Kairouan',  'kairouan',  date '2025-12-20', 4,
           'Bon rapport qualité-prix pour du cuir tunisien. Livraison rapide jusqu''à Kairouan.',
           array[]::text[], null),
      (12, 'Olfa Ben Salem',  '+21620333412', 'Mahdia',    'mahdia',    date '2025-12-28', 5,
           'Deuxième achat chez Maison Selma, toujours aussi soigné. Je le recommande.',
           array[]::text[], null)
    ) as t(n, nom, tel, ville, gouv, le, note, texte, photos, reponse)
    order by n
  loop
    t0 := a.le + time '20:15';
    select id into v_client from public.clients where boutique_id = s and telephone = a.tel and user_id is null;
    if v_client is null then
      insert into public.clients (boutique_id, nom, telephone, created_at) values (s, a.nom, a.tel, t0) returning id into v_client;
    end if;
    v_devis := private.chiffre_commande(s, jsonb_build_array(jsonb_build_object('variante_id', v_variante.id, 'quantite', 1)), a.gouv, false);
    insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
    values (s, 'SEL-2025-' || lpad((100 + a.n)::text, 5, '0'), 'vitrine', v_client, a.nom, a.tel, 'Adresse de démonstration',
            a.ville, a.gouv, v_devis -> 'zone' ->> 'nom_fr',
            (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
            (v_devis ->> 'total_millimes')::bigint, t0)
    returning id into v_commande;
    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
                                        prix_unitaire_millimes, quantite, total_ligne_millimes, created_at)
    select s, v_commande, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle', l ->> 'sku',
           (l ->> 'prix_unitaire_millimes')::bigint, 1, (l ->> 'prix_unitaire_millimes')::bigint, t0
    from jsonb_array_elements(v_devis -> 'lignes') l
    returning * into v_ligne;

    -- Vendu sur un arrivage d'alors : le sac revient au stock du jour.
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes set stock = stock + 1 where boutique_id = s and id = v_variante.id returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', '', true);
    insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, created_at)
    values (s, v_variante.id, 1, v_stock, 'reception', 'Arrivage de 2025 (jeu de démo)', t0);

    insert into public.confirmations (boutique_id, commande_id, canal, resultat, created_at)
    values (s, v_commande, 'appel', 'confirmee', t0 + interval '13 hours');
    update public.commandes set statut = 'confirmee' where id = v_commande;
    update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (46900000 + a.n * 173) where id = v_commande;
    update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = v_commande;
    update public.commande_evenements e
       set created_at = t0 + case e.statut_apres when 'recue' then interval '0' when 'confirmee' then interval '13 hours'
                                                 when 'expediee' then interval '30 hours' else interval '52 hours' end
     where e.commande_id = v_commande;
    update public.commandes
       set confirmee_at = t0 + interval '13 hours', expediee_at = t0 + interval '30 hours',
           livree_at = t0 + interval '52 hours', cloturee_at = t0 + interval '52 hours'
     where id = v_commande;

    -- L'avis, deux jours après la livraison ; publié le lendemain.
    insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, variante_libelle,
                             statut, modere_le, reponse, repondu_le, created_at)
    values (s, v_variante.produit_id, v_commande, v_ligne.id, v_client, a.note, a.texte,
            private.nom_public(a.nom), v_ligne.variante_libelle, 'publie', t0 + interval '5 days',
            a.reponse, case when a.reponse is not null then t0 + interval '5 days' end, t0 + interval '4 days')
    returning id into v_avis;
    v_rang := 0;
    foreach v_photo in array a.photos loop
      insert into public.avis_photos (boutique_id, avis_id, chemin, largeur, hauteur, position, created_at)
      values (s, v_avis, 'maison-selma/avis/' || v_photo || '.webp',
              case v_photo when 'sac-boucle' then 480 when 'sac-coutures' then 500 when 'sac-bandouliere' then 560 else 540 end,
              case v_photo when 'sac-boucle' then 480 when 'sac-coutures' then 500 when 'sac-bandouliere' then 560 else 540 end,
              v_rang, t0 + interval '4 days');
      v_rang := v_rang + 1;
    end loop;
  end loop;
end
$$;
