/* Un appel que le Worker se fait à lui-même (le déclencheur planifié, qui
   passe par les routes comme une requête) : un jeton tiré au hasard juste
   avant, gardé dans l'isolat, effacé après. Jamais écrit ailleurs. */
const CLE = "__skanecomJetonInterne";
type Porteur = { [CLE]?: string };

export function tirerJetonInterne(): string {
  const jeton = crypto.randomUUID() + crypto.randomUUID();
  (globalThis as Porteur)[CLE] = jeton;
  return jeton;
}

export function jetonInterne(): string | undefined {
  return (globalThis as Porteur)[CLE];
}

export function oublierJetonInterne(): void {
  delete (globalThis as Porteur)[CLE];
}
