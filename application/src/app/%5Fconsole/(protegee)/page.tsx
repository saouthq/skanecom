import type { Metadata } from "next";
import Link from "next/link";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, LIBELLES_THEME } from "@/lib/console/libelles";

export const metadata: Metadata = { title: "Boutiques" };

type Ligne = {
  id: string; slug: string; nom: string; statut: string; hote_principal: string | null;
  domaines: string[]; theme: string | null; nb_produits: number; created_at: string;
};

export default async function Tableau() {
  await exigeAdmin();
  const { data, error } = await clientService().rpc("console_boutiques");
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as Ligne[];

  return (
    <>
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h1>Boutiques</h1>
          <p className="text-encre-doux mt-1">{boutiques.length} boutique{boutiques.length > 1 ? "s" : ""} sur la plateforme.</p>
        </div>
        <Link href="/nouvelle-boutique" className="btn btn-primaire">Nouvelle boutique</Link>
      </div>

      <div className="carte mt-6 defile">
        <table className="tableau">
          <thead>
            <tr><th>Boutique</th><th>Domaine</th><th>Statut</th><th>Thème</th><th>Produits</th></tr>
          </thead>
          <tbody>
            {boutiques.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/boutiques/${b.slug}`}>{b.nom}</Link>
                  <div className="text-legende text-encre-doux">{b.slug}</div>
                </td>
                <td>{b.hote_principal ?? "—"}{b.domaines.length > 1 ? <span className="text-encre-doux"> (+{b.domaines.length - 1})</span> : null}</td>
                <td><span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span></td>
                <td>{(b.theme && LIBELLES_THEME[b.theme]) ?? "—"}</td>
                <td className="tabular-nums">{b.nb_produits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
