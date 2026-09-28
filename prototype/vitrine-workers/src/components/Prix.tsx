import { DEVISE, formateMontant } from "@/lib/prix";

/* ============================================================================
   PRIX — le montant se pose TOUJOURS dans un <bdi>.
   Constaté au rendu par Noah : en RTL, l'algorithme bidi déplace « TND » d'un
   côté à l'autre selon le contexte. Ce n'est pas un bug, mais ça se décide —
   <bdi> isole le montant et le rend stable dans les deux sens (charte §8).
   ========================================================================== */

export function Prix({
  millimes,
  fort = false,
  className = "",
}: {
  millimes: number;
  fort?: boolean;
  className?: string;
}) {
  return (
    <bdi className={["prix", fort ? "prix-fort" : "", className].filter(Boolean).join(" ")}>
      {formateMontant(millimes)}
      <span className="dev">{DEVISE}</span>
    </bdi>
  );
}
