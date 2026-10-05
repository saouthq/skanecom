import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, adresseVitrine, deNom } from "@/lib/console/libelles";
import { equipeDe } from "@/lib/console/equipe-serveur";
import { Icone } from "@/components/console/Icone";
import { Onglets } from "@/components/console/Onglets";

/* L'en-tête commun des pages d'une boutique dans la console : son nom, son
   état, sa vitrine, et les onglets (vue d'ensemble, équipe, marque,
   modules, catalogue, facturation, support). La lecture se fait avec la clé service_role : l'administrateur
   est revérifié ici aussi. */
export default async function Boutique({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { role } = await exigeAdmin();
  const { slug } = await params;
  const { data } = await clientService().rpc("console_boutique", { p_slug: slug });
  if (!data) notFound();
  const { boutique: b, domaines } = data as {
    boutique: { id: string; slug: string; nom: string; statut: string; demonstration: boolean };
    domaines: { hote: string; principal: boolean }[];
  };
  const principal = domaines.find((d) => d.principal)?.hote;
  const hoteConsole = (await headers()).get("host");
  const [equipe, { data: modules }] = await Promise.all([
    equipeDe(b.id),
    clientService().rpc("console_modules", { p_boutique_id: b.id }),
  ]);
  const actifs = equipe.filter((m) => m.actif).length;
  const modulesActifs = ((modules ?? []) as { actif: boolean }[]).filter((m) => m.actif).length;
  const base = `/boutiques/${b.slug}`;

  return (
    <>
      <div className="page-tete">
        <div className="page-avant">
          <Link href="/"><Icone nom="retour" taille={14} /> Boutiques</Link>
        </div>
        <div className="page-tete-rang">
          <div className="cellule-titre">
            <span className="initiale initiale-l" aria-hidden="true">{b.nom.trim().charAt(0).toUpperCase()}</span>
            <span>
              <h1>
                {b.nom}
                <span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span>
                {b.demonstration ? <span className="pl-demo">Démonstration</span> : null}
              </h1>
              <span className="discret">
                {b.slug}
                {principal ? <> · {principal}</> : null}
              </span>
            </span>
          </div>
          <div className="page-actions">
            {principal ? (
              <a className="btn btn-second" href={adresseVitrine(principal, hoteConsole)} target="_blank" rel="noopener">
                Voir la vitrine <Icone nom="externe" taille={14} />
              </a>
            ) : null}
            {/* Ouvrir ou suspendre engage la boutique : le super-administrateur seul (la base le redit). */}
            {role === "super_admin" ? <form action={`${base}/statut`} method="post">
              <input type="hidden" name="boutique_id" value={b.id} />
              {b.statut === "active" ? (
                // Suspendre retire une vitrine en ligne : un second geste le confirme.
                <details className="bt-confirmer" data-reste-ouvert>
                  <summary className="btn btn-second"><Icone nom="alimentation" taille={16} /> Suspendre la boutique</summary>
                  <div className="bt-confirmer-panneau" role="group" aria-label="Confirmer la suspension">
                    <p>Sa vitrine cesse d&apos;être servie aux visiteurs. Les commandes déjà passées restent à traiter au backoffice ; la boutique se rouvre d&apos;un geste.</p>
                    <input type="hidden" name="confirme" value="1" />
                    <button type="submit" name="statut" value="suspendue" className="btn btn-danger btn-petit">Suspendre maintenant</button>
                  </div>
                </details>
              ) : (
                <button type="submit" name="statut" value="active" className="btn btn-primaire">
                  <Icone nom="alimentation" taille={16} /> Ouvrir la boutique
                </button>
              )}
            </form> : null}
          </div>
        </div>
      </div>
      <Onglets
        libelle={`Pages ${deNom(b.nom)}`}
        onglets={[
          { href: base, libelle: "Vue d'ensemble", icone: "apercu", exact: true },
          { href: `${base}/equipe`, libelle: "Équipe", icone: "equipe", compte: actifs },
          { href: `${base}/marque`, libelle: "Marque", icone: "marque" },
          { href: `${base}/modules`, libelle: "Modules", icone: "modules", compte: modulesActifs },
          { href: `${base}/import`, libelle: "Catalogue", icone: "importer" },
          { href: `${base}/facturation`, libelle: "Facturation", icone: "billet" },
          { href: `${base}/support`, libelle: "Support", icone: "support" },
        ]}
      />
      {children}
    </>
  );
}
