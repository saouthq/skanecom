"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Le chemin vu par le visiteur : vinext rend le chemin interne
 *  (/_console/…), réécrit par le proxy. */
export function useChemin(): string {
  return (usePathname() ?? "/").replace(/^\/_console/, "") || "/";
}

/** Un lien de navigation qui sait s'il mène à la page affichée. */
export function LienNav({ href, exact = false, aussi = [], className, children }: {
  href: string;
  exact?: boolean;
  /** D'autres débuts de chemin où ce lien est « la page » (sous-pages). */
  aussi?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const chemin = useChemin();
  const actif = (exact ? chemin === href : chemin === href || chemin.startsWith(`${href}/`)) || aussi.some((a) => chemin.startsWith(a));
  return (
    <Link href={href} className={className} aria-current={actif ? "page" : undefined}>
      {children}
    </Link>
  );
}

/** Le menu du téléphone (un <details>) se referme quand on suit un lien. */
export function MenuMobile({ children }: { children: React.ReactNode }) {
  return (
    <details
      className="app-menu"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) (e.currentTarget as HTMLDetailsElement).open = false;
      }}
    >
      {children}
    </details>
  );
}
