import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { TexteConditions } from "@/components/TexteConditions";
import { dateJournal } from "@/lib/console/libelles";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";

export const metadata: Metadata = { title: "Conditions de service" };

/* ============================================================================
   LES CONDITIONS DE SERVICE (migration …_conditions_service) — ce qui lie
   SkanEcom à chaque commerçant, et l'accord de traitement des données de
   ses acheteurs (loi organique n° 2004-63). Ici : où en est chaque
   boutique, la version en vigueur, le brouillon de la suivante (écrit,
   relu, publié par un super-administrateur) ; le propriétaire de chaque
   boutique les accepte depuis son backoffice.
   ========================================================================== */

type Version = { version: number; titre: string; changements: string | null; publie_le: string; publie_par: string | null; acceptations: number };
type Brouillon = { version: number; titre: string; texte: string; changements: string | null; modifie_le: string; modifie_par: string | null; a_completer: string[] };
type BoutiqueConditions = { slug: string; nom: string; statut: string; accord: { version: number; qui: string; au_nom_de: string; le: string } | null };
type Donnees = { en_vigueur: number | null; texte_en_vigueur: string | null; versions: Version[]; brouillon: Brouillon | null; boutiques: BoutiqueConditions[] };

const STATUTS: Record<string, string> = { active: "Ouverte", en_preparation: "En préparation", suspendue: "Suspendue" };

export default async function Conditions({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; nouvelle?: string }> }) {
  const { user, role } = await exigeAdmin();
  const v = await searchParams;
  const { data, error } = await clientService().rpc("console_conditions", { p_acteur: user.id });
  if (error) throw new Error(`Conditions illisibles : ${error.message}`);
  const d = data as Donnees;
  const superAdmin = role === "super_admin";
  const enVigueur = d.versions.find((x) => x.version === d.en_vigueur) ?? null;
  const aAccepter = d.en_vigueur ? d.boutiques.filter((b) => b.accord?.version !== d.en_vigueur) : [];
  // Écrire la version suivante : le brouillon part du texte en vigueur.
  const brouillon: Brouillon | null = d.brouillon ?? (v.nouvelle && enVigueur && d.texte_en_vigueur
    ? { version: enVigueur.version + 1, titre: enVigueur.titre, texte: d.texte_en_vigueur, changements: null, modifie_le: "", modifie_par: null, a_completer: [] }
    : null);
  const message = v.ok ? <p className="message message-succes" role="status">{v.ok}</p> : v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null;

  return (
    <>
      <EnTetePage
        titre="Conditions de service"
        description="Ce qui lie SkanEcom à chaque commerçant, et l'accord de traitement des données de ses acheteurs. Le propriétaire de chaque boutique les accepte depuis son backoffice ; une version publiée ne change plus."
      />
      {message}
      <div className="cdt-grille">
        <section className="carte" aria-labelledby="t-cdt-boutiques">
          <div className="carte-tete">
            <div>
              <h2 id="t-cdt-boutiques" className="carte-titre-icone"><Icone nom="boutique" /> Les boutiques</h2>
              <p>{!d.en_vigueur ? "Aucune version publiée : rien n'est encore demandé aux commerçants."
                : aAccepter.length ? `${aAccepter.length} sur ${d.boutiques.length} n'ont pas encore accepté la version ${d.en_vigueur}.`
                : `Toutes ont accepté la version ${d.en_vigueur}.`}</p>
            </div>
          </div>
          {d.boutiques.length ? (
            <ul className="cdt-boutiques" role="list">
              {d.boutiques.map((b) => {
                const ok = d.en_vigueur !== null && b.accord?.version === d.en_vigueur;
                return (
                  <li key={b.slug}>
                    <div>
                      <Link href={`/boutiques/${b.slug}`}>{b.nom}</Link>
                      <span className="discret"> · {STATUTS[b.statut] ?? b.statut}</span>
                    </div>
                    <div className="cdt-accord">
                      <span className={`ui-etat ui-etat-point ${ok ? "ui-etat-vert" : d.en_vigueur ? "ui-etat-ambre" : ""}`}>
                        {ok ? `Version ${b.accord!.version} acceptée` : b.accord ? `Version ${b.accord.version} seulement` : d.en_vigueur ? "À accepter" : "Rien à accepter"}
                      </span>
                      {b.accord ? <span className="aide">par {b.accord.qui}, le {dateJournal(b.accord.le)}, au nom de {b.accord.au_nom_de}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="discret">Aucune boutique cliente pour l&apos;instant (les démonstrations ne comptent pas).</p>}
        </section>

        {enVigueur && d.texte_en_vigueur ? (
          <section className="carte" aria-labelledby="t-cdt-vigueur">
            <div className="carte-tete">
              <div>
                <h2 id="t-cdt-vigueur" className="carte-titre-icone"><Icone nom="fichier" /> En vigueur : version {enVigueur.version}</h2>
                <p>Publiée le {dateJournal(enVigueur.publie_le)}{enVigueur.publie_par ? ` par ${enVigueur.publie_par}` : ""} · acceptée par {enVigueur.acceptations} boutique{enVigueur.acceptations > 1 ? "s" : ""}.</p>
              </div>
              {superAdmin && !d.brouillon ? <Link className="btn btn-second btn-petit" href="/conditions?nouvelle=1#t-cdt-brouillon">Écrire la version {enVigueur.version + 1}</Link> : null}
            </div>
            {enVigueur.changements ? <div className="message"><p className="cdt-champs"><b>Ce qui change :</b> {enVigueur.changements}</p></div> : null}
            <details className="cdt-lire">
              <summary>Lire le texte</summary>
              <TexteConditions texte={d.texte_en_vigueur} niveau={3} />
            </details>
          </section>
        ) : null}

        {brouillon ? (
          <section className="carte cdt-brouillon" aria-labelledby="t-cdt-brouillon" id="t-cdt-brouillon">
            <div className="carte-tete">
              <div>
                <h2 id="t-cdt-brouillon" className="carte-titre-icone"><Icone nom="crayon" /> Brouillon de la version {brouillon.version}</h2>
                <p>{brouillon.modifie_le ? `Enregistré le ${dateJournal(brouillon.modifie_le)}${brouillon.modifie_par ? ` par ${brouillon.modifie_par}` : ""}.` : "Pas encore enregistré."} À faire relire par un avocat avant de le publier.</p>
              </div>
            </div>
            {brouillon.a_completer.length ? (
              <div className="message message-attention" role="note">
                <p className="cdt-champs">
                  <b>À compléter avant de publier ({brouillon.a_completer.length}) :</b>{" "}
                  {brouillon.a_completer.map((c, i) => <span key={c}>{i ? ", " : ""}<mark className="cdt-a-completer">[{c}]</mark></span>)}
                </p>
              </div>
            ) : null}
            {superAdmin ? (
              <form action="/conditions/enregistrer" method="post" className="formulaire cdt-formulaire">
                <div className="champ">
                  <label htmlFor="cdt-titre">Titre</label>
                  <input id="cdt-titre" name="titre" required minLength={3} maxLength={120} defaultValue={brouillon.titre} />
                </div>
                {brouillon.version > 1 ? (
                  <div className="champ">
                    <label htmlFor="cdt-changements">Ce qui change</label>
                    <textarea id="cdt-changements" name="changements" rows={2} maxLength={600} defaultValue={brouillon.changements ?? ""} aria-describedby="cdt-changements-aide" />
                    <p className="aide" id="cdt-changements-aide">Le propriétaire le lit en premier, avant d&apos;accepter.</p>
                  </div>
                ) : null}
                <div className="champ">
                  <label htmlFor="cdt-texte">Le texte</label>
                  <textarea id="cdt-texte" name="texte" required minLength={200} maxLength={60000} rows={22} defaultValue={brouillon.texte} spellCheck aria-describedby="cdt-texte-aide" />
                  <p className="aide" id="cdt-texte-aide">« ## » ouvre un titre, « - » une ligne de liste, une ligne vide sépare les paragraphes. Ce qui reste entre crochets est à compléter.</p>
                </div>
                <div className="cdt-actions"><button type="submit" className="btn btn-second">Enregistrer le brouillon</button></div>
              </form>
            ) : <p className="aide">Un super-administrateur écrit et publie les conditions.</p>}
            {superAdmin && d.brouillon ? (
              <form action="/conditions/publier" method="post" className="cdt-publier">
                <input type="hidden" name="version" value={d.brouillon.version} />
                <button type="submit" className="btn btn-primaire" disabled={d.brouillon.a_completer.length > 0}>Publier la version {d.brouillon.version}</button>
                <p className="aide">{d.brouillon.a_completer.length
                  ? "Possible une fois chaque champ entre crochets complété."
                  : "Une fois publiée, elle ne change plus ; le propriétaire de chaque boutique la verra dans son backoffice, à accepter."}</p>
              </form>
            ) : null}
            <details className="cdt-lire">
              <summary>Voir le rendu</summary>
              <TexteConditions texte={brouillon.texte} niveau={3} />
            </details>
          </section>
        ) : null}

        {d.versions.length > 1 ? (
          <section className="carte" aria-labelledby="t-cdt-versions">
            <h2 id="t-cdt-versions" className="carte-titre-icone"><Icone nom="horloge" /> Les versions publiées</h2>
            <ul className="cdt-versions" role="list">
              {d.versions.map((x) => (
                <li key={x.version}>
                  <b>Version {x.version}</b> · publiée le {dateJournal(x.publie_le)} · {x.acceptations} accord{x.acceptations > 1 ? "s" : ""}
                  {x.changements ? <p className="aide">{x.changements}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
