import { headers } from "next/headers";

/* ============================================================================
   UNE LECTURE PAR REQUÊTE — un Worker gratuit ne permet que 50 appels sortants
   par requête (« Too many subrequests by single Worker invocation »). Or
   vinext exécute chaque layout une première fois « pour essai » avant le
   rendu, hors du cache de React (`cache()`) : le menu, les compteurs, la
   session de la console étaient lus deux fois, et une page riche (la fiche
   d'une boutique, l'État technique) dépassait la limite.

   `parRequete` garde le résultat le temps de la requête — l'essai et le rendu
   le partagent. La clé est l'objet des en-têtes de la requête (le même pour
   tout ce qu'elle exécute) ; hors requête (un script, une tâche planifiée),
   la fonction s'exécute simplement.
   ========================================================================== */

const memoire = new WeakMap<object, Map<string, Promise<unknown>>>();

export function parRequete<A extends unknown[], T>(nom: string, f: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  return async (...args: A) => {
    let requete: object;
    try {
      requete = await headers();
    } catch {
      return f(...args);
    }
    let m = memoire.get(requete);
    if (!m) memoire.set(requete, (m = new Map()));
    const cle = `${nom}:${JSON.stringify(args)}`;
    let p = m.get(cle) as Promise<T> | undefined;
    if (!p) {
      p = f(...args);
      m.set(cle, p);
      // Une erreur ne reste pas en mémoire : le rendu la relira, et la dira.
      const carte = m;
      p.catch(() => carte.delete(cle));
    }
    return p;
  };
}
