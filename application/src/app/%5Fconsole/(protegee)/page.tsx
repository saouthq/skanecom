import type { Metadata } from "next";
import Link from "next/link";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, LIBELLES_THEME } from "@/lib/console/libelles";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";

export const metadata: Metadata = { title: "Boutiques" };

type Ligne = {
  id: string; slug: string; nom: string; statut: string; hote_principal: string | null;
  domaines: string[]; theme: string | null; nb_produits: number; created_at: string;
};

/* Le tableau de bord de la plateforme : toutes les boutiques, leur état. */
export default async function Tableau() {
  await exigeAdmin();
  const { data, error } = await clientService().rpc("console_boutiques");
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as Ligne[];
  const ouvertes = boutiques.filter((b) => b.statut === "active").length;
  const enPreparation = boutiques.filter((b) => b.statut === "en_preparation").length;
  const produits = boutiques.reduce((n, b) => n + b.nb_produits, 0);

  return (
    <>
      <EnTetePage
        titre="Boutiques"
        description="Les boutiques de la plateforme : leur domaine, leur gabarit, leur catalogue."
        actions={<Link href="/nouvelle-boutique" className="btn btn-primaire"><Icone nom="plus" /> Nouvelle boutique</Link>}
      />

      <dl className="chiffres-cles">
        <div className="chiffre-cle"><dt><Icone nom="boutique" /> Boutiques</dt><dd>{boutiques.length}</dd></div>
        <div className="chiffre-cle"><dt><span className="ui-etat-point" style={{ color: "var(--ui-vert)" }} aria-hidden="true" /> Ouvertes</dt><dd>{ouvertes}</dd></div>
        <div className="chiffre-cle"><dt><span className="ui-etat-point" style={{ color: "var(--ui-ambre)" }} aria-hidden="true" /> En préparation</dt><dd>{enPreparation}</dd></div>
        <div className="chiffre-cle"><dt><Icone nom="colis" /> Produits</dt><dd>{produits}</dd></div>
      </dl>

      {boutiques.length === 0 ? (
        <div className="vide">
          <span className="vide-icone"><Icone nom="boutique" taille={20} /></span>
          <strong>Aucune boutique pour l&apos;instant</strong>
          <p>Créez la première : son domaine, son gabarit, puis sa marque et son catalogue.</p>
          <Link href="/nouvelle-boutique" className="btn btn-primaire mt-3"><Icone nom="plus" /> Nouvelle boutique</Link>
        </div>
      ) : (
        <div className="carte carte-plate defile">
          <table className="tableau">
            <thead>
              <tr><th>Boutique</th><th>Domaine</th><th>Statut</th><th>Gabarit</th><th className="text-end">Produits</th><th aria-label="Ouvrir" /></tr>
            </thead>
            <tbody>
              {boutiques.map((b) => (
                <tr key={b.id} className="ligne-lien">
                  <td>
                    <span className="cellule-titre">
                      <span className="initiale" aria-hidden="true">{b.nom.trim().charAt(0).toUpperCase()}</span>
                      <span>
                        <Link href={`/boutiques/${b.slug}`} className="ligne-cible">{b.nom}</Link>
                        <small>{b.slug}</small>
                      </span>
                    </span>
                  </td>
                  <td className="discret">
                    {b.hote_principal ?? "—"}
                    {b.domaines.length > 1 ? <span> +{b.domaines.length - 1}</span> : null}
                  </td>
                  <td><span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span></td>
                  <td className="discret">{(b.theme && LIBELLES_THEME[b.theme]) ?? "—"}</td>
                  <td className="tabular-nums text-end">{b.nb_produits}</td>
                  <td className="text-end discret"><Icone nom="droite" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
