/* La requête vient-elle d'une page du même site ? Exigé de tout formulaire
   qui écrit (console, commande), en plus des cookies SameSite=Lax : un site
   tiers ne peut pas faire poster un formulaire à sa place. */
export function memeOrigine(req: Request): boolean {
  const origine = req.headers.get("origin");
  const hote = req.headers.get("host");
  if (!origine || !hote) return false;
  try {
    return new URL(origine).host === hote;
  } catch {
    return false;
  }
}
