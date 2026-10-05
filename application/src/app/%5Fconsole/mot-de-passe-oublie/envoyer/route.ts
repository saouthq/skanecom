import { clientService } from "@/lib/console/service";
import { ipDe, memeOrigine, vers } from "@/lib/console/http";
import { jetonAcces } from "@/lib/console/equipe-serveur";
import { lienBienvenue } from "@/lib/console/equipe";
import { MARQUE_PLATEFORME, courrielMotDePasse } from "@/lib/courriels/messages";
import { envoyer } from "@/lib/courriels/envoi";

/* Envoyer le lien « mot de passe oublié ». La base en limite le rythme par
   adresse ; l'écran répond pareil dans tous les cas (compte ou non, envoyé
   ou trop tôt) : on ne dit jamais quelles adresses ont un compte. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const email = String((await req.formData()).get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const ip = ipDe(req);
  const { data: permis } = await clientService(ip).rpc("compte_demande_mot_de_passe", { p_email: email });
  if (permis === true) {
    const r = await jetonAcces(ip, email, "recovery");
    if (r.ok) {
      const origine = req.headers.get("origin") ?? new URL(req.url).origin;
      const c = courrielMotDePasse(MARQUE_PLATEFORME, lienBienvenue(origine, r.jeton, "recovery", email));
      await envoyer({ a: email, nom: MARQUE_PLATEFORME.nom, sujet: c.sujet, html: c.html, texte: c.texte, nature: "equipe" });
    }
  }
  return vers(`/mot-de-passe-oublie?${new URLSearchParams({ envoye: "1", email })}`);
}
