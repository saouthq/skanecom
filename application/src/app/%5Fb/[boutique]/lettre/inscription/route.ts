import { chargeCadre } from "@/lib/boutique";
import { memeOrigine } from "@/lib/origine";
import { clientService } from "@/lib/console/service";
import { envoyer } from "@/lib/courriels/envoi";
import { courrielLettre, courrielLettreDeja, marqueDeBoutique } from "@/lib/courriels/messages";
import { t } from "@/lib/i18n";

/* S'inscrire à la lettre (réglage vitrine.lettre), depuis le pied de page
   (components/LettreInscription.tsx). La case cochée, la phrase que la base
   garde est celle que la vitrine affiche (t.lettre.consentement), composée
   ici, jamais reçue du navigateur.

   La base rend le jeton du lien de confirmation (public.lettre_inscrire,
   ouverte au seul serveur : la clé de service ne sert qu'à cet appel) ; il
   part dans l'e-mail, jamais dans la réponse — taper l'adresse d'un autre
   n'inscrit personne. Déjà inscrite, l'adresse reçoit un e-mail qui le dit
   (un par jour au plus) ; la réponse, elle, est la même dans tous les cas. */

export const dynamic = "force-dynamic";

/** Les refus que la personne peut lire tels quels (la phrase vient de la base). */
const LISIBLES = new Set(["email", "consentement", "essais"]);

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  if (!memeOrigine(req)) return reponse({ ok: false, raison: "origine" }, 403);
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre?.lettre) return reponse({ ok: false, raison: "reglage" }, 404);

  const corps = (await req.json().catch(() => null)) as { email?: unknown; accepte?: unknown; page?: unknown } | null;
  const email = typeof corps?.email === "string" ? corps.email.trim().slice(0, 200) : "";
  if (corps?.accepte !== true) {
    return reponse({ ok: false, raison: "consentement", message: t.lettre.cochez }, 422);
  }
  const page = typeof corps?.page === "string" && corps.page.startsWith("/") ? corps.page.split(/[?#]/)[0].slice(0, 300) : null;

  const { data, error } = await clientService().rpc("lettre_inscrire", {
    p_boutique_id: cadre.boutique.id, p_email: email,
    p_consentement: t.lettre.consentement(cadre.boutique.nom), p_page: page,
  });
  if (error) {
    if (error.hint && LISIBLES.has(error.hint)) return reponse({ ok: false, raison: error.hint, message: error.message }, 422);
    console.error(`lettre_inscrire (${boutique}) : ${error.code} ${error.message}`);
    return reponse({ ok: false, raison: "serveur" }, 500);
  }

  // L'adresse publique de la boutique : celle de la page qui a posté
  // (memeOrigine l'a vérifiée), pour le lien et le logo de l'e-mail.
  const site = new URL(req.headers.get("origin") ?? "").origin;
  const resultat = data as { etat: "a_confirmer" | "deja"; jeton?: string; courriel?: boolean };
  // Déjà inscrite, et déjà prévenue aujourd'hui : rien ne part, la réponse est la même.
  if (resultat.etat === "deja" && !resultat.courriel) return reponse({ ok: true });
  const marque = marqueDeBoutique(cadre, site);
  const courriel = resultat.etat === "a_confirmer" && resultat.jeton
    ? courrielLettre(marque, `${site}/lettre?${new URLSearchParams({ j: resultat.jeton })}`)
    : courrielLettreDeja(marque);
  const envoi = await envoyer({ a: email.toLowerCase(), nom: cadre.boutique.nom, sujet: courriel.sujet, html: courriel.html, texte: courriel.texte });
  if (!envoi.ok) {
    console.error(`lettre (${boutique}) : ${envoi.raison}`);
    return reponse({ ok: false, raison: "envoi" }, 503);
  }
  return reponse({ ok: true });
}
