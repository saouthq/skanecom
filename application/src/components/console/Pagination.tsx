import Link from "next/link";
import { Icone } from "@/components/console/Icone";

/** Les numéros à montrer : la première, la dernière, deux de part et
 *  d'autre de la page courante, et « … » pour les trous. */
export function numerosDePages(page: number, pages: number): (number | "…")[] {
  const garder = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => garder.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => garder.add(n));
  const vus = [...garder].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const sortie: (number | "…")[] = [];
  vus.forEach((n, i) => {
    if (i > 0 && n - vus[i - 1] > 1) sortie.push(n - vus[i - 1] === 2 ? n - 1 : "…");
    sortie.push(n);
  });
  return sortie;
}

/* ============================================================================
   LA PAGINATION DES LISTES DU BACKOFFICE — « 51–100 sur 312 commandes »,
   les numéros de page, Précédente et Suivante. Avant : « Précédentes · Page
   2 sur 7 · Suivantes », sans pouvoir sauter à la dernière ni savoir combien
   de lignes. Au téléphone, les numéros s'effacent derrière « 2 / 7 ».
   ========================================================================== */
export function Pagination({ page, pages, total, parPage, lien, unite }: {
  page: number;
  pages: number;
  total: number;
  parPage: number;
  /** L'adresse d'une page (les filtres et la recherche gardés). */
  lien: (page: number) => string;
  /** « commande » / « commandes ». */
  unite: [string, string];
}) {
  if (total === 0) return null;
  const debut = (page - 1) * parPage + 1;
  const fin = Math.min(total, page * parPage);
  const compte = (
    <p className="pagination-compte" aria-live="polite">
      {pages > 1 ? <><b>{debut}–{fin}</b> sur </> : null}<b>{total}</b> {total > 1 ? unite[1] : unite[0]}
    </p>
  );
  if (pages <= 1) return <div className="pagination">{compte}</div>;
  return (
    <nav className="pagination" aria-label="Pages">
      {compte}
      <ol role="list">
        <li>
          {page > 1 ? (
            <Link href={lien(page - 1)} rel="prev" className="pagination-pas"><Icone nom="gauche" taille={14} /> Précédente</Link>
          ) : (
            <span className="pagination-pas" aria-disabled="true"><Icone nom="gauche" taille={14} /> Précédente</span>
          )}
        </li>
        {numerosDePages(page, pages).map((n, i) => (
          <li key={`${n}-${i}`} className="pagination-numero">
            {n === "…" ? <span aria-hidden="true">…</span>
              : n === page ? <span aria-current="page">{n}</span>
              : <Link href={lien(n)} aria-label={`Page ${n}`}>{n}</Link>}
          </li>
        ))}
        <li className="pagination-ici" aria-hidden="true">{page} / {pages}</li>
        <li>
          {page < pages ? (
            <Link href={lien(page + 1)} rel="next" className="pagination-pas">Suivante <Icone nom="droite" taille={14} /></Link>
          ) : (
            <span className="pagination-pas" aria-disabled="true">Suivante <Icone nom="droite" taille={14} /></span>
          )}
        </li>
      </ol>
    </nav>
  );
}
