import entree from "vinext/server/fetch-handler";
import { oublierJetonInterne, tirerJetonInterne } from "@/lib/console/interne";

export * from "vinext/server/fetch-handler";

/* ============================================================================
   LE WORKER — vinext répond aux requêtes ; le déclencheur planifié
   (cloudflare.config.ts, chaque heure) lance la surveillance. Il passe par
   la route de la console comme une requête (POST /crochets/surveillance sur
   l'hôte de la console), dans le même isolat, avec un jeton tiré pour cet
   appel puis oublié : de l'extérieur, la route ne répond rien.
   ========================================================================== */

// Le contexte d'exécution du Worker (types de Cloudflare non chargés ici).
type Contexte = { waitUntil(promesse: Promise<unknown>): void; passThroughOnException(): void };
type Gestionnaire = {
  fetch(requete: Request, env: unknown, ctx: Contexte): Promise<Response> | Response;
};
const application = entree as unknown as Gestionnaire;

const worker = {
  ...(entree as object),
  fetch: (requete: Request, env: unknown, ctx: Contexte) => application.fetch(requete, env, ctx),

  async scheduled(_controleur: { cron: string; scheduledTime: number }, env: unknown, ctx: Contexte) {
    const hote = process.env.NEXT_PUBLIC_CONSOLE_HOTE;
    if (!hote) {
      console.error("surveillance : NEXT_PUBLIC_CONSOLE_HOTE manque, le passage de l'heure ne part pas");
      return;
    }
    const jeton = tirerJetonInterne();
    try {
      const r = await application.fetch(
        new Request(`https://${hote}/crochets/surveillance`, { method: "POST", headers: { host: hote, "x-surveillance": jeton } }),
        env, ctx,
      );
      const corps = await r.text();
      if (!r.ok) console.error(`surveillance : le passage de l'heure a échoué (${r.status}) ${corps.slice(0, 300)}`);
    } finally {
      oublierJetonInterne();
    }
  },
};

export default worker;
