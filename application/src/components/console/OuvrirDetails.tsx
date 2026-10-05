"use client";

/** Un bouton qui ouvre un bloc replié (`<details id=…>`), y mène et pose le
 *  curseur dans son premier champ : « Nouveau code » en tête de page ouvre le
 *  formulaire, au lieu d'un lien vers un formulaire toujours déplié. */
export function OuvrirDetails({ cible, className, children }: { cible: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      aria-controls={cible}
      onClick={() => {
        const d = document.getElementById(cible);
        if (!(d instanceof HTMLDetailsElement)) return;
        d.open = true;
        d.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        d.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus({ preventScroll: true });
      }}
    >
      {children}
    </button>
  );
}
