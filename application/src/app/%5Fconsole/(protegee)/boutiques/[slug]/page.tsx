import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { REGLES, type Emplacement } from "@/lib/console/images-marque";
import { ETAPES_MISE_EN_PLACE, type CleEtape, type MiseEnPlace as DonneesMiseEnPlace } from "@/lib/console/mise-en-place";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_MODULES, LIBELLES_STATUT, LIBELLES_THEME, adresseVitrine, dateJournal } from "@/lib/console/libelles";
import { equipeDe } from "@/lib/console/equipe-serveur";
import { initiales } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { MiseEnPlace } from "@/components/console/MiseEnPlace";

type Fiche = {
  boutique: { id: string; slug: string; nom: string; statut: string; langue_defaut: string; created_at: string };
  domaines: { hote: string; type: string; principal: boolean; statut_certificat: string }[];
  theme: { code: string; version: number; updated_at: string } | null;
  compteurs: { produits: number; publies: number; variantes: number; categories: number };
  journal: { at: string; action: string; cible: string | null; acteur: string | null }[];
};

const ACTIONS: Record<string, string> = {
  "boutique.creer": "Boutique créée",
  "boutique.statut": "Statut changé",
  "domaine.ajouter": "Domaine ajouté",
  "theme.modifier": "Marque modifiée",
  "theme.image": "Image de la marque",
  "module.activer": "Module activé",
  "module.couper": "Module coupé",
  "mise_en_place.faite": "Étape de mise en place faite",
  "mise_en_place.a_faire": "Étape de mise en place à refaire",
  "catalogue.importer": "Catalogue importé",
  "equipe.ajouter": "Membre invité",
  "equipe.modifier": "Accès modifié",
  "equipe.lien": "Lien d'accès remis",
};

const CERTIFICAT: Record<string, { texte: string; classe: string }> = {
  actif: { texte: "Actif", classe: "ui-etat ui-etat-point ui-etat-vert" },
  erreur: { texte: "En erreur", classe: "ui-etat ui-etat-point ui-etat-rouge" },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await params).slug };
}

/* La vue d'ensemble d'une boutique : ses domaines, son équipe, sa marque,
   son catalogue et le journal de tout ce que la console y a fait. */
export default async function FicheBoutique({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; cree?: string; ok?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { data, error } = await clientService().rpc("console_boutique", { p_slug: slug });
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  if (!data) notFound();
  const f = data as Fiche;
  const b = f.boutique;
  const hoteConsole = (await headers()).get("host");
  const [equipe, { data: miseEnPlace }] = await Promise.all([
    equipeDe(b.id),
    clientService().rpc("console_mise_en_place", { p_boutique_id: b.id }),
  ]);
  const actifs = equipe.filter((m) => m.actif);
  const enAttente = actifs.filter((m) => m.en_attente).length;

  return (
    <div className="pile">
      {messages.cree ? (
        <p className="message message-succes" role="status">
          Boutique créée, en préparation. Réglez sa marque, importez son catalogue, invitez son propriétaire, puis ouvrez-la.
        </p>
      ) : null}
      {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
      {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

      {miseEnPlace ? <MiseEnPlace slug={b.slug} boutiqueId={b.id} donnees={miseEnPlace as DonneesMiseEnPlace} /> : null}

      <div className="grille-2">
        <div className="pile">
          <section className="carte" aria-labelledby="t-domaines">
            <div className="carte-tete">
              <div>
                <h2 id="t-domaines" className="carte-titre-icone"><Icone nom="domaine" /> Domaines</h2>
                <p>Les adresses qui mènent à la vitrine. Le principal sert aux liens et au référencement.</p>
              </div>
            </div>
            <div className="defile">
              <table className="tableau">
                <thead><tr><th>Domaine</th><th>Rôle</th><th>Certificat</th></tr></thead>
                <tbody>
                  {f.domaines.map((d) => (
                    <tr key={d.hote}>
                      <td>
                        <a href={adresseVitrine(d.hote, hoteConsole)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5">
                          {d.hote} <Icone nom="externe" taille={12} className="discret" />
                        </a>
                      </td>
                      <td>{d.principal ? <span className="ui-etat">Principal</span> : <span className="discret">Secondaire</span>}</td>
                      <td>
                        <span className={CERTIFICAT[d.statut_certificat]?.classe ?? "ui-etat ui-etat-point ui-etat-ambre"}>
                          {CERTIFICAT[d.statut_certificat]?.texte ?? "En attente"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={`/boutiques/${b.slug}/domaines`} method="post" className="carte-pied">
              <input type="hidden" name="boutique_id" value={b.id} />
              <div className="champ flex-1 min-w-[14rem]">
                <label htmlFor="hote" className="sr-only">Ajouter un domaine</label>
                <input id="hote" name="hote" required placeholder="www.maboutique.tn" />
              </div>
              <label className="opt"><input type="checkbox" name="principal" value="1" /> Principal</label>
              <button type="submit" className="btn btn-second"><Icone nom="plus" /> Ajouter un domaine</button>
            </form>
          </section>

          <section className="carte" aria-labelledby="t-journal">
            <div className="carte-tete">
              <div>
                <h2 id="t-journal" className="carte-titre-icone"><Icone nom="journal" /> Journal</h2>
                <p>Chaque geste fait depuis la console, avec son auteur.</p>
              </div>
            </div>
            {f.journal.length === 0 ? (
              <p className="discret">Aucune action tracée.</p>
            ) : (
              <div className="defile">
                <table className="tableau">
                  <thead><tr><th>Action</th><th>Détail</th><th>Par</th><th>Quand</th></tr></thead>
                  <tbody>
                    {f.journal.map((j, i) => (
                      <tr key={i}>
                        <td className="font-medium whitespace-nowrap">{ACTIONS[j.action] ?? j.action}</td>
                        <td className="discret">{j.action === "boutique.statut" && j.cible ? (LIBELLES_STATUT[j.cible] ?? j.cible)
                          : j.action === "theme.image" && j.cible ? (REGLES[j.cible as Emplacement]?.titre ?? j.cible)
                          : j.action.startsWith("module.") && j.cible ? (LIBELLES_MODULES[j.cible] ?? j.cible)
                          : j.action.startsWith("mise_en_place.") && j.cible ? (ETAPES_MISE_EN_PLACE[j.cible as CleEtape]?.titre ?? j.cible) : (j.cible ?? "")}</td>
                        <td>
                          {j.acteur ? (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className="avatar" style={{ inlineSize: 22, blockSize: 22, fontSize: ".5625rem" }} aria-hidden="true">{initiales(j.acteur)}</span>
                              {j.acteur}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="tabular-nums whitespace-nowrap discret">{dateJournal(j.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="pile">
          <section className="carte" aria-labelledby="t-equipe">
            <div className="carte-tete">
              <div>
                <h2 id="t-equipe" className="carte-titre-icone"><Icone nom="equipe" /> Équipe</h2>
                <p>
                  {equipe.length === 0
                    ? "Personne n'entre encore dans son backoffice."
                    : `${actifs.length} ${actifs.length > 1 ? "personnes ont" : "personne a"} accès au backoffice${enAttente ? ` · ${enAttente} invitation${enAttente > 1 ? "s" : ""} en attente` : ""}`}
                </p>
              </div>
            </div>
            {actifs.length > 0 ? (
              <div className="flex items-center" aria-hidden="true">
                {actifs.slice(0, 5).map((m, i) => (
                  <span key={m.user_id} className="avatar" style={{ marginInlineStart: i ? -8 : 0, boxShadow: "0 0 0 2px #fff" }}>
                    {initiales(m.email ?? "?")}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="carte-pied">
              <Link href={`/boutiques/${b.slug}/equipe`} className="btn btn-second btn-bloc">
                {equipe.length === 0 ? "Inviter le propriétaire" : "Gérer l'équipe"}
              </Link>
            </div>
          </section>

          <section className="carte" aria-labelledby="t-catalogue">
            <div className="carte-tete">
              <div>
                <h2 id="t-catalogue" className="carte-titre-icone"><Icone nom="colis" /> Catalogue</h2>
              </div>
            </div>
            <dl className="liste-def tabular-nums">
              <div><dt>Produits</dt><dd>{f.compteurs.produits}</dd></div>
              <div><dt>Publiés</dt><dd>{f.compteurs.publies}</dd></div>
              <div><dt>Variantes</dt><dd>{f.compteurs.variantes}</dd></div>
              <div><dt>Rayons</dt><dd>{f.compteurs.categories}</dd></div>
            </dl>
            <div className="carte-pied">
              <Link href={`/boutiques/${b.slug}/import`} className="btn btn-second btn-bloc">
                <Icone nom="importer" /> Importer un catalogue
              </Link>
            </div>
          </section>

          <section className="carte" aria-labelledby="t-marque">
            <div className="carte-tete">
              <div>
                <h2 id="t-marque" className="carte-titre-icone"><Icone nom="marque" /> Marque</h2>
                <p>{f.theme ? `Gabarit ${(LIBELLES_THEME[f.theme.code] ?? f.theme.code).toLowerCase()} · version ${f.theme.version}` : "Aucun thème"}</p>
              </div>
            </div>
            <div className="carte-pied">
              <Link href={`/boutiques/${b.slug}/marque`} className="btn btn-second btn-bloc">Régler la marque</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
