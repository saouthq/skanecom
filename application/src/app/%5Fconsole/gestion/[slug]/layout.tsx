import { clientSession, exigeMembre } from "@/lib/console/session";
import { Coquille, type LienCoquille } from "@/components/console/Coquille";
import { CompteurCommandes } from "@/components/console/Veille";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { MODES_SUPPORT, type ModeSupport } from "@/lib/console/support";
import { BandeauSupport } from "@/components/console/AccesSupport";
import { enFond, envoyerFile } from "@/lib/gestion/skanfact";
import { DIRECTION } from "@/lib/gestion/tableau";
import { PEUT_MODIFIER, PEUT_STOCKER } from "@/lib/gestion/catalogue";
import { PEUT_ECRIRE } from "@/lib/gestion/pages";
import type { ElementPalette } from "@/lib/gestion/palette";
import { OuvrirPalette, Palette } from "@/components/console/Palette";
import { BandeauAnnonces } from "@/components/console/BandeauAnnonces";
import { BandeauSuspension } from "@/components/console/BandeauSuspension";
import type { AnnonceBoutique } from "@/lib/console/annonces";
import { envoyerCourrielsCommandes } from "@/lib/courriels/commandes";

/* ============================================================================
   LE BACKOFFICE D'UNE BOUTIQUE — pour son équipe (PRD §6.2), sur téléphone
   autant que sur ordinateur : le père de Skander confirme ses commandes
   entre deux clients, au comptoir.

   Ce layout vérifie le membre pour poser la coquille ; chaque page et chaque
   gestionnaire le revérifient (une navigation côté client peut ne rendre
   que la page), et la base, elle, revérifie le rôle à chaque geste.
   Pendant un accès support (C7), un bandeau le rappelle en tête de page.
   ========================================================================== */
export default async function BackofficeBoutique({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, boutique, boutiques } = await exigeMembre(slug);
  // L'état des modules de la boutique, pour la navigation — en même temps,
  // pas l'un après l'autre : chaque page du backoffice les attend.
  const sb = await clientSession();
  const etat = { p_boutique_id: boutique.boutique_id };
  const [{ data: sav }, { data: pro }, { data: dv }, { data: av }, { data: pm }, { data: ra }, { data: pn }, { data: vi }, { data: lt }, { data: sf }, { data: an }, { data: su }] = await Promise.all([
    sb.rpc("gestion_sav_etat", etat),
    sb.rpc("gestion_pro_etat", etat),
    sb.rpc("gestion_devis_etat", etat),
    sb.rpc("gestion_avis_etat", etat),
    sb.rpc("gestion_promotions_etat", etat),
    sb.rpc("gestion_alertes_etat", etat),
    sb.rpc("gestion_paniers_etat", etat),
    sb.rpc("gestion_visites_etat", etat),
    sb.rpc("gestion_lettre_etat", etat),
    sb.rpc("gestion_skanfact_etat", etat),
    sb.rpc("gestion_annonces", etat),
    boutique.statut === "suspendue" ? sb.rpc("gestion_suspension", etat) : Promise.resolve({ data: null }),
  ]);
  const suspension = (su ?? null) as { motif: string | null; message: string | null; le: string | null } | null;
  const annonces = (Array.isArray(an) ? an : []) as AnnonceBoutique[];
  // La facturation SkanFact, si la boutique a le module (ou y reste connectée) : ce que SkanFact a
  // refusé, une connexion coupée ou bientôt expirée. Ce qui attendait une panne repart, en fond.
  const etatSkanFact = sf as { actif: boolean; connecte: boolean; coupee: boolean; expire_bientot: boolean; a_regler: boolean;
                               dus: number; refuses: number } | null;
  if (etatSkanFact?.dus) enFond(envoyerFile(boutique.boutique_id));
  // Les e-mails de commande restés dans leur file (une panne passée) repartent, en fond.
  enFond(envoyerCourrielsCommandes(boutique.boutique_id));
  const alerteSkanFact = etatSkanFact?.coupee ? "connexion coupée" : etatSkanFact?.a_regler ? "taux de TVA à choisir"
    : etatSkanFact?.expire_bientot ? "connexion à renouveler" : null;
  const lienSkanFact = DIRECTION.includes(boutique.role) && (etatSkanFact?.actif || etatSkanFact?.connecte)
    ? [{
        href: `/gestion/${slug}/skanfact`, libelle: "SkanFact", icone: "billet" as const,
        extra: etatSkanFact.refuses
          ? <span className="app-nav-compte" aria-label={`${etatSkanFact.refuses} envoi${etatSkanFact.refuses > 1 ? "s" : ""} refusé${etatSkanFact.refuses > 1 ? "s" : ""} par SkanFact`}>{etatSkanFact.refuses}</span>
          : alerteSkanFact
            ? <span className="app-nav-compte" aria-label={alerteSkanFact}>!</span>
            : undefined,
      }]
    : [];
  // Le service après-vente, si la boutique a le module : ses demandes à rappeler.
  const etatSav = sav as { actif: boolean; nouvelles: number } | null;
  // Les comptes professionnels, si la boutique a le module : les demandes en attente.
  const etatPro = pro as { actif: boolean; demandes: number } | null;
  const badgePro = etatPro?.actif && etatPro.demandes
    ? <span className="app-nav-compte" aria-label={`${etatPro.demandes} demande${etatPro.demandes > 1 ? "s" : ""} de compte pro`}>{etatPro.demandes}</span>
    : undefined;
  // Les devis, si la boutique a le module : ceux à chiffrer.
  const etatDevis = dv as { actif: boolean; a_chiffrer: number } | null;
  const badgeDevis = etatDevis?.a_chiffrer
    ? <span className="app-nav-compte" aria-label={`${etatDevis.a_chiffrer} à chiffrer`}>{etatDevis.a_chiffrer}</span>
    : undefined;
  const lienDevis = etatDevis?.actif || etatDevis?.a_chiffrer
    ? [{ href: `/gestion/${slug}/devis`, libelle: "Devis", icone: "fichier" as const, extra: badgeDevis }]
    : [];
  // Les avis clients, si la boutique a le module : ceux à relire.
  const etatAvis = av as { actif: boolean; a_moderer: number } | null;
  const badgeAvis = etatAvis?.a_moderer
    ? <span className="app-nav-compte" aria-label={`${etatAvis.a_moderer} avis à relire`}>{etatAvis.a_moderer}</span>
    : undefined;
  const lienAvis = etatAvis?.actif || etatAvis?.a_moderer
    ? [{ href: `/gestion/${slug}/avis`, libelle: "Avis", icone: "etoile" as const, extra: badgeAvis }]
    : [];
  // Les promotions (codes, prix barrés, lots), si la boutique a le module ou en a
  // eu : la direction. Une opération en cours se signale.
  const etatPromo = pm as { actif: boolean; codes: number; soldes: number; soldes_en_cours: number; lots: number } | null;
  const lienPromo = DIRECTION.includes(boutique.role) && (etatPromo?.actif || etatPromo?.codes || etatPromo?.soldes || etatPromo?.lots)
    ? [{
        href: `/gestion/${slug}/promotions`, libelle: "Promotions", icone: "etiquette" as const,
        extra: etatPromo?.soldes_en_cours
          ? <span className="app-nav-compte app-nav-compte-doux" aria-label={`${etatPromo.soldes_en_cours} opération${etatPromo.soldes_en_cours > 1 ? "s" : ""} de prix barrés en cours`}>{etatPromo.soldes_en_cours}</span>
          : undefined,
      }]
    : [];
  // Le réassort, si la boutique prévient du retour des pièces (ou a des
  // demandes en cours) : ceux dont la pièce est revenue, à prévenir.
  const etatReassort = ra as { actif: boolean; a_prevenir: number; ouvertes: number } | null;
  const lienReassort = etatReassort?.actif || etatReassort?.ouvertes
    ? [{
        href: `/gestion/${slug}/reassort`, libelle: "Réassort", icone: "cloche" as const,
        extra: etatReassort.a_prevenir
          ? <span className="app-nav-compte" aria-label={`${etatReassort.a_prevenir} personne${etatReassort.a_prevenir > 1 ? "s" : ""} à prévenir`}>{etatReassort.a_prevenir}</span>
          : undefined,
      }]
    : [];
  // Les paniers abandonnés, si la boutique les relance : ceux à relancer.
  const etatPaniers = pn as { actif: boolean; a_relancer: number } | null;
  const lienPaniers = etatPaniers?.actif
    ? [{
        href: `/gestion/${slug}/paniers`, libelle: "Paniers", icone: "panier" as const,
        extra: etatPaniers.a_relancer
          ? <span className="app-nav-compte" aria-label={`${etatPaniers.a_relancer} panier${etatPaniers.a_relancer > 1 ? "s" : ""} à relancer`}>{etatPaniers.a_relancer}</span>
          : undefined,
      }]
    : [];
  const badgeSav = etatSav?.nouvelles
    ? <span className="app-nav-compte" aria-label={`${etatSav.nouvelles} à rappeler`}>{etatSav.nouvelles}</span>
    : undefined;
  const lienCommandes = {
    href: `/gestion/${slug}`, libelle: "Commandes", icone: "commandes" as const, exact: true, aussi: [`/gestion/${slug}/commandes/`],
    extra: <CompteurCommandes slug={slug} />,
  };

  const liens: LienCoquille[] = [
    { href: `/gestion/${slug}/aujourdhui`, libelle: "Aujourd'hui", icone: "horloge" },
    lienCommandes,
    ...(DIRECTION.includes(boutique.role)
      ? [
          { href: `/gestion/${slug}/tableau`, libelle: "Tableau de bord", icone: "graphique" as const },
          // Les visites de la vitrine, si la boutique les mesure (ou les a mesurées).
          ...((vi as { actif: boolean; compte: boolean } | null)?.actif || (vi as { compte: boolean } | null)?.compte
            ? [{ href: `/gestion/${slug}/visites`, libelle: "Visites", icone: "oeil" as const }]
            : []),
          // La lettre, si la boutique en a une (ou en a eu des inscrits).
          ...((lt as { actif: boolean; inscrits: number } | null)?.actif || (lt as { inscrits: number } | null)?.inscrits
            ? [{ href: `/gestion/${slug}/lettre`, libelle: "Lettre", icone: "courriel" as const }]
            : []),
          { href: `/gestion/${slug}/encaissements`, libelle: "Encaissements", icone: "billet" as const },
          ...lienSkanFact,
        ]
      : []),
    ...lienDevis,
    { href: `/gestion/${slug}/produits`, libelle: "Catalogue", icone: "colis" },
    ...lienReassort,
    { href: `/gestion/${slug}/clients`, libelle: "Clients", icone: "personne", extra: badgePro },
    ...lienPaniers,
    ...lienAvis,
    ...lienPromo,
    ...(etatSav?.actif
      ? [{ href: `/gestion/${slug}/sav`, libelle: "SAV", icone: "outil" as const, extra: badgeSav }]
      : []),
    // L'éditeur de la vitrine (le style, l'accueil, l'en-tête et le pied, les pages de la boutique) : la direction.
    ...(DIRECTION.includes(boutique.role)
      ? [{ href: `/gestion/${slug}/apparence`, libelle: "Éditeur de la vitrine", icone: "marque" as const }]
      : []),
    ...(boutique.role === "proprietaire" || boutique.role === "admin"
      ? [{ href: `/gestion/${slug}/equipe`, libelle: "Équipe", icone: "equipe" as const }]
      : []),
    { href: `/gestion/${slug}/reglages`, libelle: "Réglages", icone: "reglages" },
  ];
  // La palette (⌘K) : les pages, puis ce que la recherche trouve.
  const pages: ElementPalette[] = [
    ...liens.map((l) => ({ groupe: "Aller à", icone: l.icone, href: l.href, titre: l.libelle })),
    ...(PEUT_STOCKER.includes(boutique.role)
      ? [
          { groupe: "Aller à", icone: "colis" as const, href: `/gestion/${slug}/produits/reception`, titre: "Réception d'un arrivage" },
          { groupe: "Aller à", icone: "calendrier" as const, href: `/gestion/${slug}/produits/arrivages`, titre: "Arrivages annoncés" },
        ]
      : []),
    ...(PEUT_MODIFIER.includes(boutique.role)
      ? [{ groupe: "Aller à", icone: "colis" as const, href: `/gestion/${slug}/produits/nouveau`, titre: "Nouveau produit" }]
      : []),
    ...(etatPro?.actif
      ? [{ groupe: "Aller à", icone: "etoile" as const, href: `/gestion/${slug}/clients/pros`, titre: "Comptes professionnels" }]
      : []),
    ...(PEUT_ECRIRE.includes(boutique.role)
      ? [
          { groupe: "Aller à", icone: "note" as const, href: `/gestion/${slug}/apparence?panneau=pages`, titre: "Les pages de la boutique" },
          { groupe: "Aller à", icone: "note" as const, href: `/gestion/${slug}/apparence?panneau=pages&page=nouvelle`, titre: "Nouvelle page de la boutique" },
        ]
      : []),
  ];

  return (
    <Coquille
      accueil={`/gestion/${slug}`}
      titre={boutique.nom}
      sousTitre="Backoffice"
      logo={boutique.nom.trim().charAt(0).toUpperCase()}
      changer={boutiques.length > 1 ? { href: "/gestion", libelle: "Changer de boutique" } : undefined}
      groupes={[{ titre: "Boutique", liens }]}
      onglets={[
        lienCommandes,
        { href: `/gestion/${slug}/produits`, libelle: "Catalogue", icone: "colis" },
        ...(etatSav?.actif ? [{ href: `/gestion/${slug}/sav`, libelle: "SAV", icone: "outil" as const, extra: badgeSav }] : []),
        { href: `/gestion/${slug}/clients`, libelle: "Clients", icone: "personne", extra: badgePro },
        { href: `/gestion/${slug}/reglages`, libelle: "Réglages", icone: "reglages" },
      ]}
      email={user.email ?? ""}
      compte={boutique.support_jusqu_a ? undefined : `/gestion/${slug}/compte`}
      role={boutique.support_jusqu_a
        ? `Support · ${MODES_SUPPORT[boutique.role as ModeSupport]?.court ?? boutique.role}`
        : (LIBELLES_ROLE[boutique.role] ?? boutique.role)}
      recherche={<OuvrirPalette />}
      rechercheCompacte={<OuvrirPalette compact />}
      palette={<Palette source={`/gestion/${slug}/palette`} pages={pages} />}
      bandeau={boutique.support_jusqu_a || annonces.length || suspension ? (
        <>
          {suspension ? <BandeauSuspension s={suspension} /> : null}
          {boutique.support_jusqu_a ? (
            <BandeauSupport slug={slug} mode={boutique.role as ModeSupport} jusqua={boutique.support_jusqu_a} motif={boutique.support_motif} />
          ) : null}
          <BandeauAnnonces slug={slug} annonces={annonces} />
        </>
      ) : undefined}
    >
      {children}
    </Coquille>
  );
}
