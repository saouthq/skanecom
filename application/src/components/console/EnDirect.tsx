"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* « En direct » — la page se relit toute seule (toutes les `secondes`)
   tant qu'elle est à l'écran : ce qu'elle montre est ce que la base compte.
   Elle attend qu'on ait fini : jamais pendant une saisie, ni quand un
   panneau « Régler » est ouvert. L'heure de la dernière lecture est dite. */
export function EnDirect({ secondes = 30, lue }: { secondes?: number; lue: string }) {
  const router = useRouter();
  const [enPause, setEnPause] = useState(false);
  useEffect(() => {
    const occupe = () => {
      const actif = document.activeElement;
      return Boolean(document.querySelector("main details[open]"))
        || (actif instanceof HTMLElement && actif.closest("main form") !== null && actif.matches("input, select, textarea"));
    };
    const tic = window.setInterval(() => {
      const pause = occupe();
      setEnPause(pause);
      if (!pause && document.visibilityState === "visible") router.refresh();
    }, secondes * 1000);
    const revient = () => { if (document.visibilityState === "visible" && !occupe()) router.refresh(); };
    document.addEventListener("visibilitychange", revient);
    return () => { window.clearInterval(tic); document.removeEventListener("visibilitychange", revient); };
  }, [router, secondes]);
  return (
    <span className="en-direct" data-pause={enPause || undefined} title={`Relue toutes les ${secondes} secondes, sauf pendant une saisie`}>
      <span className="en-direct-point" aria-hidden="true" />
      <span>{enPause ? "En pause" : "En direct"}</span>
      <span className="en-direct-heure">· lue à {lue}</span>
    </span>
  );
}
