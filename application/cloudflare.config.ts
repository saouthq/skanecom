import { bindings, defineConfig, defineWorker, triggers } from "cf/config";
import { createWorkersResponseStoreServiceBindingConfig } from "@vinext/cloudflare/cache/config";

const responseStore = await createWorkersResponseStoreServiceBindingConfig({
  worker: {
    name: "skanecom-application-response-store",
    compatibilityDate: "2026-09-28",
    compatibilityFlags: ["nodejs_compat"],
  },
  bucket: "skanecom-application-response-store-cache-bodies",
});

export const responseStoreServiceBinding = responseStore.serviceBindingWorker;

export default defineConfig({
  worker: defineWorker({
    ...responseStore.applicationWorker,
    name: "skanecom-application",
    // vinext, plus le déclencheur planifié de la surveillance (src/worker.ts).
    entrypoint: "./src/worker.ts",
    // Chaque heure : la surveillance des vitrines ouvertes (État technique).
    triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
    compatibilityDate: "2026-09-28",
    // global_fetch_strictly_public : sans lui, la vitrine ne peut pas appeler le
    // faux Supabase, qui est un autre Worker du même sous-domaine workers.dev
    // (erreur 1042). Inutile avec la vraie base Supabase.
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: { notFoundHandling: "none" },
    env: {
      ...responseStore.applicationWorker.env,
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      // Photos des produits déposées par le backoffice (src/lib/gestion/fichiers.ts),
      // servies au public par le domaine du bucket (NEXT_PUBLIC_FICHIERS_URL).
      // En local, c'est le relais qui en tient lieu.
      FICHIERS: bindings.r2({ name: "skanecom-fichiers" }),
      // La clé service_role, pour la console seule (src/lib/console/service.ts).
      // Production : `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` ; local :
      // application/.dev.vars, écrit par outils/api-locale.sh.
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      // Les e-mails (src/lib/courriels) : la signature du crochet de Supabase
      // Auth, et l'envoi (« relais », « apercu » ou « resend:<clé>:<adresse> »).
      // Un secret déclaré est exigé partout — en local, seuls ceux-ci passent.
      COURRIELS_CROCHET_SECRET: bindings.secret(),
      COURRIELS_ENVOI: bindings.secret(),
      // Les SMS des codes de connexion (src/lib/sms/envoi.ts, crochet
      // /crochets/sms, signé du même secret que celui des e-mails) :
      // « relais » en local, « aucun » sur l'aperçu (ses codes passent par un
      // crochet Postgres), « twilio:<compte>:<jeton>:<expéditeur> » en production.
      SMS_ENVOI: bindings.secret(),
      // La facturation des clients, lue dans SkanFact (src/lib/console/skanfact.ts,
      // cadrage 06) : son adresse, l'entreprise SkanEcom, une clé qui n'a que le
      // geste ventes.pieces.voir, et le secret de l'abonnement aux avis.
      // « aucune » : SkanFact n'est pas branché (l'aperçu en ligne). En local :
      // SkanFact simulé par le relais (outils/skanfact-dev.mjs).
      SKANFACT_URL: bindings.secret(),
      SKANFACT_ENTREPRISE: bindings.secret(),
      SKANFACT_CLE: bindings.secret(),
      SKANFACT_AVIS_SECRET: bindings.secret(),
      // Le chiffrement des clés SkanFact que les commerçants confient à leur
      // boutique (module Facturation SkanFact, src/lib/gestion/chiffre.ts) :
      // 32 octets en base64, posés une fois — changé, les clés gardées ne se
      // relisent plus (chaque boutique se reconnecte).
      SKANFACT_CHIFFRE: bindings.secret(),
      // Le secret de SkanEcom, partenaire déclaré de SkanFact (« Connecter
      // SkanFact », B0) : 32 octets tirés au hasard, posé une fois ; SkanFact
      // n'en connaît que l'empreinte SHA-256 (src/lib/console/skanfact.ts).
      SKANFACT_SECRET: bindings.secret(),
    },
  }),
});
