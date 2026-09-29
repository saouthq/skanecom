/** Le contenu d'une page de boutique. Le lien d'évitement, l'en-tête et le
 *  pied sont posés par le layout (app/%5Fb/[boutique]/layout.tsx) : toute page
 *  les a, y compris la page introuvable. */
export function Gabarit({
  className = "enveloppe flex-1",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main id="principal" className={className}>
      {children}
    </main>
  );
}
