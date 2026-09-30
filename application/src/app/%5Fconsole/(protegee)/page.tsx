import type { Metadata } from "next";
import Link from "next/link";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT, LIBELLES_THEME } from "@/lib/console/libelles";
import { EnTetePage, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";

export const metadata: Metadata = { title: "Boutiques" };

type CodeApercu = { id: number; le: string; canal: "sms" | "email"; destinataire: string; code: string; sujet: string | null; courriel: boolean };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

type Ligne = {
  id: string; slug: string; nom: string; statut: string; hote_principal: string | null;
  domaines: string[]; theme: string | null; nb_produits: number; created_at: string;
};

/* Le tableau de bord de la plateforme : toutes les boutiques, leur état.
   Sur l'aperçu en ligne seulement (supabase/apercu/codes-demo.sql), les codes
   de connexion que Supabase aurait envoyés par SMS ou par e-mail. */
export default async function Tableau() {
  await exigeAdmin();
  const service = clientService();
  const [{ data, error }, { data: avancements }, { data: codesApercu }] = await Promise.all([
    service.rpc("console_boutiques"),
    service.rpc("console_avancements"),
    // Absente hors de l'aperçu : l'erreur la cache, rien d'autre.
    service.rpc("console_codes_apercu"),
  ]);
  const codes = Array.isArray(codesApercu) ? (codesApercu as CodeApercu[]) : null;
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as Ligne[];
  const avancement = (avancements ?? {}) as Record<string, { faites: number; total: number }>;
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
              <tr><th>Boutique</th><th>Domaine</th><th>Statut</th><th>Mise en place</th><th>Gabarit</th><th className="text-end">Produits</th><th aria-label="Ouvrir" /></tr>
            </thead>
            <tbody>
              {boutiques.map((b) => (
                <tr key={b.id} className="ligne-lien">
                  <td>
                    <span className="cellule-titre">
                      <span className="initiale" style={styleAvatar(b.nom)} aria-hidden="true">{b.nom.trim().charAt(0).toUpperCase()}</span>
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
                  <td>
                    {avancement[b.id] ? (
                      <span className="mp-mini" title={`${avancement[b.id].faites} étapes faites sur ${avancement[b.id].total}`}>
                        <span className="mp-barre" aria-hidden="true">
                          <span style={{ inlineSize: `${(avancement[b.id].faites / avancement[b.id].total) * 100}%` }} />
                        </span>
                        <span className="tabular-nums">{avancement[b.id].faites}/{avancement[b.id].total}</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="discret">{(b.theme && LIBELLES_THEME[b.theme]) ?? "—"}</td>
                  <td className="tabular-nums text-end">{b.nb_produits}</td>
                  <td className="text-end discret"><Icone nom="droite" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {codes ? (
        <section className="carte mt-6" aria-labelledby="codes-apercu">
          <div className="carte-tete">
            <h2 id="codes-apercu" className="carte-titre-icone"><Icone nom="cle" /> Codes de connexion de l&apos;aperçu</h2>
            <Link href="/" className="btn-lien aide">Actualiser</Link>
          </div>
          <p className="aide">
            Sur l&apos;aperçu, aucun SMS ni e-mail ne part : le code demandé sur une vitrine s&apos;affiche ici, une heure,
            avec l&apos;e-mail tel qu&apos;il serait arrivé.
          </p>
          {codes.length === 0 ? (
            <p className="aide mt-3">Aucun code demandé dans la dernière heure.</p>
          ) : (
            <div className="defile mt-3">
              <table className="tableau">
                <thead><tr><th>À</th><th>Par</th><th>Pour</th><th className="text-end">Code</th><th aria-label="E-mail" /></tr></thead>
                <tbody>
                  {codes.map((c, i) => (
                    <tr key={`${c.le}-${i}`}>
                      <td className="tabular-nums discret">{HEURE.format(new Date(c.le))}</td>
                      <td>{c.canal === "sms" ? "SMS" : "E-mail"}</td>
                      <td>{c.destinataire}</td>
                      <td className="text-end"><b className="tabular-nums codes-apercu-code">{c.code || "—"}</b></td>
                      <td className="text-end">
                        {c.courriel ? <Link href={`/courriels/recu/${c.id}`} className="btn-lien aide">Voir l&apos;e-mail</Link> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
