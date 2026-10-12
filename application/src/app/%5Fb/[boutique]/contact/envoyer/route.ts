import { chargeCadre } from "@/lib/boutique";
import { memeOrigine } from "@/lib/origine";
import { clientService } from "@/lib/console/service";
import { envoyer } from "@/lib/courriels/envoi";
import { adresseHote } from "@/lib/courriels/commandes";
import { courrielDemande } from "@/lib/courriels/demandes";
import { marqueDeBoutique } from "@/lib/courriels/messages";

/* Envoyer une demande de contact (réglage vitrine.formulaire_contact), depuis
   components/FormulaireContact.tsx (JSON) ou, sans JavaScript, le formulaire
   lui-même (réponse : retour à la page Contact, qui dit la suite).

   La base enregistre (public.contact_envoyer, ouverte au seul serveur) et
   rend les adresses de l'équipe à prévenir ; l'e-mail part d'ici. Contre les
   robots : le champ piège rempli, ou un formulaire envoyé en moins de deux
   secondes, reçoivent la même réponse qu'une vraie demande, sans rien
   enregistrer ; et la base compte les demandes d'un même visiteur (une
   empreinte de son adresse, jamais l'adresse). */

export const dynamic = "force-dynamic";

/** Les refus que la personne lit tels quels (la phrase vient de la base), et le champ qu'ils visent. */
const LISIBLES = new Set(["nom", "telephone", "email", "message", "sujet", "essais", "reglage"]);
const CHAMPS = new Set(["nom", "telephone", "email", "message", "sujet"]);

const reponse = (corps: unknown, statut = 200) =>
  Response.json(corps, { status: statut, headers: { "cache-control": "private, no-store" } });

const chaine = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** L'empreinte du visiteur : son adresse, signée par une clé du serveur (elle ne se retrouve pas). */
async function empreinte(req: Request): Promise<string | null> {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!ip || !secret) return null;
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signe = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`contact:${ip}`));
  return Array.from(new Uint8Array(signe), (o) => o.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request, { params }: { params: Promise<{ boutique: string }> }) {
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  // Sans JavaScript : de retour sur la page Contact, qui dit si la demande est partie.
  const retour = (q: Record<string, string>) =>
    new Response(null, { status: 303, headers: { location: `/contact?${new URLSearchParams(q)}#contact`, "cache-control": "private, no-store" } });

  if (!memeOrigine(req)) return json ? reponse({ ok: false, raison: "origine" }, 403) : new Response(null, { status: 403 });
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  if (!cadre?.formulaire) return json ? reponse({ ok: false, raison: "reglage" }, 404) : retour({ erreur: "1" });

  const corps = json
    ? ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {}
    : Object.fromEntries(((await req.formData().catch(() => null)) ?? new FormData()).entries());

  // Le piège (rempli par les robots) ou un envoi trop rapide : la même réponse, rien d'enregistré.
  const duree = typeof corps.duree === "number" ? corps.duree : null;
  if (chaine(corps.site, 200).trim() || (duree !== null && duree < 2000)) {
    return json ? reponse({ ok: true, numero: null }) : retour({ demande: "envoyee" });
  }

  const page = chaine(corps.page, 300);
  const { data, error } = await clientService().rpc("contact_envoyer", {
    p_boutique_id: cadre.boutique.id,
    p_nom: chaine(corps.nom, 120),
    p_telephone: chaine(corps.telephone, 40),
    p_email: chaine(corps.email, 200),
    p_sujet: chaine(corps.sujet, 80),
    p_message: chaine(corps.message, 2400),
    p_produit: chaine(corps.produit, 120) || null,
    p_page: page.startsWith("/") ? page.split(/[?#]/)[0] : null,
    p_empreinte: await empreinte(req),
  });
  if (error) {
    if (error.hint && LISIBLES.has(error.hint)) {
      return json
        ? reponse({ ok: false, raison: error.hint, champ: CHAMPS.has(error.hint) ? error.hint : null, message: error.message }, 422)
        : retour({ erreur: "1" });
    }
    console.error(`contact_envoyer (${boutique}) : ${error.code} ${error.message}`);
    return json ? reponse({ ok: false, raison: "serveur" }, 500) : retour({ erreur: "1" });
  }

  const resultat = data as { numero: string; produit: string | null; equipe: string[] };
  // L'équipe prévenue par e-mail ; un envoi manqué ne perd rien : la demande est au backoffice.
  const site = new URL(req.headers.get("origin") ?? "").origin;
  const adresseConsole = adresseHote(process.env.NEXT_PUBLIC_CONSOLE_HOTE);
  const courriel = courrielDemande(marqueDeBoutique(cadre, site), {
    numero: resultat.numero,
    nom: chaine(corps.nom, 120).trim().replace(/\s+/g, " "),
    telephone: chaine(corps.telephone, 40).trim() || null,
    email: chaine(corps.email, 200).trim().toLowerCase() || null,
    sujet: chaine(corps.sujet, 80).trim() || null,
    message: chaine(corps.message, 2400).trim(),
    produit: resultat.produit ?? null,
  }, adresseConsole ? `${adresseConsole}/gestion/${cadre.boutique.slug}/demandes` : null);
  const envois = await Promise.allSettled((resultat.equipe ?? []).slice(0, 10).map((a) => envoyer({
    a, nom: cadre.boutique.nom, sujet: courriel.sujet, html: courriel.html, texte: courriel.texte, boutique: cadre.boutique.id, nature: "equipe",
  })));
  for (const e of envois) {
    if (e.status === "rejected" || !e.value.ok) console.error(`demande ${resultat.numero} (${boutique}) : e-mail non parti`);
  }
  return json ? reponse({ ok: true, numero: resultat.numero }) : retour({ demande: resultat.numero });
}
