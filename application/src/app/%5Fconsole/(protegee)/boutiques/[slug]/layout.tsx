import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { clientService } from "@/lib/console/service";
import { boutiqueConsole } from "@/lib/console/boutique-lue";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, MOTIFS_SUSPENSION, adresseVitrine, deNom } from "@/lib/console/libelles";
import { equipeDe } from "@/lib/console/equipe-serveur";
import { Icone } from "@/components/console/Icone";
import { Onglets } from "@/components/console/Onglets";
import { themeDeLaBoutique } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { ETAPES_MISE_EN_PLACE, detailEtape, type CleEtape, type MiseEnPlace } from "@/lib/console/mise-en-place";

/** Ce sans quoi une vitrine ouverte déçoit ou trompe : rien à vendre, personne pour répondre, ni mentions ni conditions, ni livreur. */
const ESSENTIELLES: CleEtape[] = ["catalogue", "equipe", "legal", "conditions", "branchements"];

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
  const { data } = await boutiqueConsole(slug);
  if (!data) notFound();
  const { boutique: b, domaines, theme } = data as {
    boutique: { id: string; slug: string; nom: string; statut: string; demonstration: boolean };
    domaines: { hote: string; principal: boolean }[];
    theme: { code: string; couleurs: Record<string, string> | null; monogramme_chemin: string | null } | null;
  };
  // Le monogramme de la boutique, à sa couleur : le même repère que sa tuile à l'accueil.
  const accent = themeDeLaBoutique({ code: theme?.code ?? "editorial", couleurs: theme?.couleurs ?? null }).couleurs.accent;
  const principal = domaines.find((d) => d.principal)?.hote;
  const hoteConsole = (await headers()).get("host");
  const enPreparation = b.statut === "en_preparation";
  const [equipe, { data: modules }, { data: mep }] = await Promise.all([
    equipeDe(b.id),
    clientService().rpc("console_modules", { p_boutique_id: b.id }),
    // Ouvrir pour la première fois : ce qui manque encore, dit avant (une boutique vide s'ouvrait d'un toucher).
    enPreparation ? clientService().rpc("console_mise_en_place", { p_boutique_id: b.id }) : Promise.resolve({ data: null }),
  ]);
  const actifs = equipe.filter((m) => m.actif).length;
  const modulesActifs = ((modules ?? []) as { actif: boolean }[]).filter((m) => m.actif).length;
  const base = `/boutiques/${b.slug}`;
  const manques = ((mep as MiseEnPlace | null)?.etapes ?? [])
    .filter((e) => !e.fait && ESSENTIELLES.includes(e.cle))
    .map((e) => ({ cle: e.cle, titre: ETAPES_MISE_EN_PLACE[e.cle].titre, detail: detailEtape(e) }));

  return (
    <>
      <div className="page-tete">
        <div className="page-avant">
          <Link href="/"><Icone nom="retour" taille={14} /> Boutiques</Link>
        </div>
        <div className="page-tete-rang">
          <div className="cellule-titre">
            <span className="initiale initiale-l bt-monogramme" aria-hidden="true" style={{ "--pl-accent": accent } as React.CSSProperties}>
              {theme?.monogramme_chemin ? (
                <span className="pl-masque" style={{ maskImage: `url("${urlFichier(theme.monogramme_chemin)}")`, WebkitMaskImage: `url("${urlFichier(theme.monogramme_chemin)}")` }} />
              ) : b.nom.trim().charAt(0).toUpperCase()}
            </span>
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
                  <div className="bt-confirmer-panneau fb-suspendre" role="group" aria-label="Confirmer la suspension">
                    <p>Sa vitrine cesse d&apos;être servie aux visiteurs. Les commandes déjà passées restent à traiter au backoffice ; la boutique se rouvre d&apos;un geste.</p>
                    <input type="hidden" name="confirme" value="1" />
                    <div className="champ">
                      <label htmlFor="su-motif">Pourquoi</label>
                      <select id="su-motif" name="motif" className="entree" required defaultValue="">
                        <option value="" disabled>Choisir un motif…</option>
                        {Object.entries(MOTIFS_SUSPENSION).map(([cle, titre]) => <option key={cle} value={cle}>{titre}</option>)}
                      </select>
                    </div>
                    <div className="champ">
                      <label htmlFor="su-message">Le message à son équipe <span className="discret">(lu en tête de son backoffice)</span></label>
                      <textarea id="su-message" name="message" className="entree" rows={3} maxLength={600}
                        placeholder="Votre abonnement d'octobre reste à régler : appelez-nous pour rouvrir la vitrine." />
                    </div>
                    <button type="submit" name="statut" value="suspendue" className="btn btn-danger btn-petit">Suspendre maintenant</button>
                  </div>
                </details>
              ) : manques.length ? (
                // Sa mise en place n'est pas finie : ce qui manque, dit avant d'ouvrir (ouvrir quand même reste possible).
                <details className="bt-confirmer" data-reste-ouvert>
                  <summary className="btn btn-primaire"><Icone nom="alimentation" taille={16} /> Ouvrir la boutique</summary>
                  <div className="bt-confirmer-panneau" role="group" aria-label="Confirmer l'ouverture">
                    <p><b>Sa mise en place n&apos;est pas finie.</b> Ouverte, sa vitrine est servie à tous, telle quelle :</p>
                    <ul className="bt-manques">
                      {manques.map((m) => <li key={m.cle}><b>{m.titre}</b>{m.detail ? <> : {m.detail}</> : null}</li>)}
                    </ul>
                    <button type="submit" name="statut" value="active" className="btn btn-primaire btn-petit">Ouvrir quand même</button>
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
          { href: `${base}/droits`, libelle: "Formule", icone: "etiquette" },
          { href: `${base}/modules`, libelle: "Modules", icone: "modules", compte: modulesActifs },
          { href: `${base}/courriels`, libelle: "E-mails", icone: "courriel" },
          { href: `${base}/import`, libelle: "Catalogue", icone: "importer" },
          { href: `${base}/facturation`, libelle: "Facturation", icone: "billet" },
          { href: `${base}/support`, libelle: "Support", icone: "support" },
          { href: `${base}/diagnostic`, libelle: "Diagnostic", icone: "jauge" },
        ]}
      />
      {children}
    </>
  );
}
