/* ============================================================================
   LA VERSION DE L'APPLICATION — posée à la construction (vite.config.ts) :
   son commit, son titre, l'heure, la dernière migration qu'elle attend.
   Elle se note d'elle-même dans la base (public.versions_noter) : au
   déploiement (.github/workflows/apercu.yml), à chaque passage de la
   surveillance et à chaque ouverture de l'État technique — la chronologie
   dit ainsi quand chaque version est arrivée en ligne.
   ========================================================================== */

export type Version = { version: string; titre: string; construite_le: string | null; migration: string | null };

declare const __SKANECOM_VERSION__: Version | undefined;

export const VERSION: Version = typeof __SKANECOM_VERSION__ !== "undefined"
  ? __SKANECOM_VERSION__
  : { version: "inconnue", titre: "", construite_le: null, migration: null };

type Rpc = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> };

/** Noter la version en ligne (une ligne par mise en ligne) : jamais bloquant. */
export async function noterVersion(service: Rpc): Promise<void> {
  if (VERSION.version === "inconnue") return;
  try {
    await service.rpc("versions_noter", {
      p_version: VERSION.version, p_titre: VERSION.titre || null, p_construite_le: VERSION.construite_le, p_migration: VERSION.migration,
    });
  } catch {
    // La chronologie attendra le prochain passage.
  }
}
