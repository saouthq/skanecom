import { createClient } from "@supabase/supabase-js";
import { clientSession } from "@/lib/console/session";
import { memeOrigine, vers } from "@/lib/console/http";
import { LONGUEUR_MOT_DE_PASSE } from "@/lib/console/equipe";
import { retourCompte, sessionCompte } from "@/lib/console/compte";

/* Changer son mot de passe : l'actuel d'abord (vérifié à part, sans toucher à
   la session ouverte), puis le nouveau, deux fois. Tracé au journal. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return new Response("Origine refusée", { status: 403 });
  const f = await req.formData();
  const retour = retourCompte(f.get("retour"));
  const dit = (cle: "ok" | "erreur", texte: string) => vers(`${retour}?${new URLSearchParams({ [cle]: texte, carte: "mot-de-passe" })}#t-mot-de-passe`);
  const moi = await sessionCompte();
  if (!moi) return vers("/connexion");
  if (moi.doitConfirmer) return vers("/double-authentification");

  const actuel = String(f.get("actuel") ?? "");
  const nouveau = String(f.get("nouveau") ?? "");
  if (nouveau.length < LONGUEUR_MOT_DE_PASSE) return dit("erreur", `Le nouveau mot de passe doit faire ${LONGUEUR_MOT_DE_PASSE} caractères au moins.`);
  if (nouveau !== String(f.get("confirmation") ?? "")) return dit("erreur", "Les deux saisies du nouveau mot de passe ne sont pas identiques.");

  // L'actuel, vérifié par une connexion à part, aussitôt refermée.
  const verif = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: faux } = await verif.auth.signInWithPassword({ email: moi.email, password: actuel });
  if (faux) return dit("erreur", "Le mot de passe actuel n'est pas le bon.");
  await verif.auth.signOut({ scope: "local" });

  const sb = await clientSession();
  const { error } = await sb.auth.updateUser({ password: nouveau });
  if (error) {
    return dit("erreur", error.code === "weak_password" ? "Ce mot de passe est trop facile à deviner : choisissez-en un autre."
      : error.code === "same_password" ? "C'est déjà votre mot de passe : choisissez-en un autre."
      : "Le mot de passe n'a pas pu être changé : réessayez.");
  }
  await sb.rpc("compte_tracer", { p_geste: "mot_de_passe" });
  return dit("ok", "Mot de passe changé. Il vaut dès maintenant, sur tous vos appareils.");
}
