import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { LONGUEUR_MOT_DE_PASSE } from "@/lib/console/equipe";

/* Le formulaire du lien d'accès : le jeton à usage unique ouvre la session
   (écrite dans les cookies par @supabase/ssr), puis le mot de passe choisi
   est enregistré. Ensuite, la porte du backoffice (double authentification
   d'abord pour un propriétaire). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const f = await req.formData();
  const jeton = String(f.get("jeton") ?? "");
  const type = f.get("type") === "recovery" ? "recovery" : "invite";
  const reprise = f.get("reprise") === "1";
  const email = String(f.get("e") ?? "");
  const motDePasse = String(f.get("mot_de_passe") ?? "");

  const ici = (valeurs: Record<string, string>) =>
    vers(`/bienvenue?${new URLSearchParams(reprise ? { reprise: "1", ...valeurs } : { jeton, type, e: email, ...valeurs })}`);

  // Vérifié AVANT de consommer le jeton : une faute de frappe ne le grille pas.
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    return ici({ erreur: `Le mot de passe doit faire ${LONGUEUR_MOT_DE_PASSE} caractères au moins.` });
  }
  if (motDePasse !== String(f.get("confirmation") ?? "")) {
    return ici({ erreur: "Les deux saisies ne sont pas identiques." });
  }

  const sb = await clientSession();
  if (reprise) {
    const { data } = await sb.auth.getUser();
    if (!data.user) return vers("/bienvenue?perime=1");
  } else {
    if (!jeton) return vers("/bienvenue");
    const { error } = await sb.auth.verifyOtp({ token_hash: jeton, type });
    if (error) return vers("/bienvenue?perime=1");
  }

  const { error } = await sb.auth.updateUser({ password: motDePasse });
  if (error) {
    // Le jeton a servi, la session est ouverte : on redemande seulement le mot de passe.
    const message = error.code === "weak_password"
      ? "Ce mot de passe est trop facile à deviner : choisissez-en un autre."
      : error.code === "same_password"
        ? "C'est déjà votre mot de passe actuel : choisissez-en un autre."
        : "Le mot de passe n'a pas pu être enregistré : réessayez.";
    return vers(`/bienvenue?${new URLSearchParams({ reprise: "1", erreur: message })}`);
  }
  return vers("/gestion");
}
