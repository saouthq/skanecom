/** Le contenu d'une page de boutique. Le lien d'évitement, l'en-tête et le
 *  pied sont posés par le layout (app/%5Fb/[boutique]/layout.tsx) : toute page
 *  les a, y compris la page introuvable.
 *
 *  Le repère `.haut-de-page`, posé tout en haut du document, sert au routeur :
 *  après une navigation, il ne remonte la page que si le haut du nouveau
 *  contenu est hors de l'écran. Or le haut de <main> peut être « à l'écran »
 *  tout en étant caché sous l'en-tête collant (page quittée un peu défilée) :
 *  la nouvelle page s'ouvrait alors le titre sous l'en-tête. Le repère, lui,
 *  sort de l'écran dès que la page a défilé d'un pixel : la page repart d'en
 *  haut. Les navigations qui gardent la position (filtres) le demandent
 *  explicitement (`scroll: false`) et n'en sont pas touchées. */
export function Gabarit({
  className = "enveloppe flex-1",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="haut-de-page" aria-hidden="true" />
      <main id="principal" className={className}>
        {children}
      </main>
    </>
  );
}
