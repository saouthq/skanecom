import { acces } from "@/lib/console/session";
import { clientService } from "@/lib/console/service";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { LIBELLES_ROLE_PLATEFORME } from "@/lib/console/equipe-plateforme";
import { LIBELLE_ETAPE, type EtapeProspect } from "@/lib/console/prospects";
import { numeroLisible } from "@/lib/legal";
import type { ElementPalette } from "@/lib/gestion/palette";

/* ============================================================================
   LA RECHERCHE DE LA CONSOLE (Ctrl+K) — une boutique (nom, identifiant,
   domaine), son client (nom, téléphone, e-mail), un prospect, un membre
   d'une équipe (son adresse) : console_recherche, quelques lignes par
   sorte, mises en mots ici.
   ========================================================================== */

export const dynamic = "force-dynamic";

const ROLES_BOUTIQUE: Record<string, string> = {
  proprietaire: "Propriétaire", admin: "Administrateur", confirmateur: "Confirmation", preparateur: "Préparation", lecture: "Lecture",
};

type Trouve = {
  genre: "boutique" | "client" | "prospect" | "membre" | "administrateur";
  titre: string; slug?: string; id?: string; hote?: string | null; statut?: string; demonstration?: boolean;
  boutique?: string; telephone?: string | null; email?: string | null; contact?: string | null; ville?: string | null;
  etape?: EtapeProspect; role?: string; actif?: boolean;
};

function reponse(elements: ElementPalette[], statut = 200): Response {
  return Response.json({ elements }, { status: statut, headers: { "cache-control": "private, no-store" } });
}

const joint = (...x: (string | null | undefined | false)[]) => x.filter(Boolean).join(" · ");

export async function GET(req: Request) {
  const a = await acces();
  if (a.etat !== "ok") return reponse([], 401);
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2) return reponse([]);
  const { data } = await clientService().rpc("console_recherche", { p_acteur: a.user.id, p_q: q });
  const elements = ((data ?? []) as Trouve[]).map((t): ElementPalette => {
    switch (t.genre) {
      case "boutique":
        return { groupe: "Boutiques", icone: "boutique", href: `/boutiques/${t.slug}`, titre: t.titre,
          detail: joint(t.hote, LIBELLES_STATUT[t.statut ?? ""] ?? t.statut, t.demonstration && "démonstration") };
      case "client":
        return { groupe: "Clients des boutiques", icone: "personne", href: `/boutiques/${t.slug}#client`, titre: t.titre,
          detail: joint(t.boutique, t.telephone && numeroLisible(t.telephone), t.email) };
      case "prospect":
        return { groupe: "Prospects", icone: "personne", href: `/prospects?${new URLSearchParams({
          // Gagné ou perdu : hors de « En cours », sous son étape.
          ...(t.etape === "gagne" || t.etape === "perdu" ? { etape: t.etape } : {}), vu: t.id ?? "", ouvert: t.id ?? "",
        })}#p-${t.id}`, titre: t.titre,
          detail: joint(t.contact, t.telephone && numeroLisible(t.telephone), t.ville, t.etape && LIBELLE_ETAPE[t.etape]) };
      case "membre":
        return { groupe: "Équipes des boutiques", icone: "equipe", href: `/boutiques/${t.slug}/equipe`, titre: t.titre,
          detail: joint(t.boutique, ROLES_BOUTIQUE[t.role ?? ""] ?? t.role, t.actif === false && "accès retiré") };
      case "administrateur":
        return { groupe: "Équipe SkanEcom", icone: "bouclier", href: "/equipe-plateforme", titre: t.titre,
          detail: LIBELLES_ROLE_PLATEFORME[t.role ?? ""] ?? t.role };
    }
  });
  return reponse(elements);
}
