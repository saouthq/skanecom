/* PROTOTYPE SkanEcom — page du test de séparation du cache entre domaines.
   Le dossier s'appelle %5Fb et non _b : dans Next.js, un dossier qui commence
   par « _ » est privé et n'est pas routé ; %5F donne l'adresse /_b/…
   On l'atteint seulement par la réécriture de src/proxy.ts. */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

export default async function TestDomaine({ params }: { params: Promise<{ boutique: string }> }) {
  const { boutique } = await params;
  return (
    <main>
      <p>{`boutique=${boutique}`}</p>
      <p>{`genere=${new Date().toISOString()}`}</p>
    </main>
  );
}
