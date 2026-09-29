import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersResponseStoreServiceBindingConfig } from "@vinext/cloudflare/cache/config";

const responseStore = await createWorkersResponseStoreServiceBindingConfig({
  worker: {
    name: "skanecom-prototype-vitrine-response-store",
    compatibilityDate: "2026-09-28",
    compatibilityFlags: ["nodejs_compat"],
  },
  bucket: "skanecom-prototype-vitrine-response-store-cache-bodies",
});

export const responseStoreServiceBinding = responseStore.serviceBindingWorker;

export default defineConfig({
  worker: defineWorker({
    ...responseStore.applicationWorker,
    name: "skanecom-prototype-vitrine",
    entrypoint: "vinext/server/fetch-handler",
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
    },
  }),
});
