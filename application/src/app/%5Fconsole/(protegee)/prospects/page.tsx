import type { Metadata } from "next";
import Link from "next/link";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Confirmation } from "@/components/console/Confirmation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { dateJournal } from "@/lib/console/libelles";
import { numeroLisible } from "@/lib/legal";
import type { Metier } from "@/lib/console/metiers";
import {
  ETAPES_PROSPECT, LIBELLE_ETAPE, SOURCES_PROSPECT, aRelancer, aujourdhui, echeance, enCours, lienCreation,
  type EtapeProspect, type Prospect,
} from "@/lib/console/prospects";

export const metadata: Metadata = { title: "Prospects" };

/* ============================================================================
   LES PROSPECTS — les commerces à qui vendre : qui appeler (d'un geste),
   où l'on en est, la prochaine chose à faire et quand. Le plus pressé en
   tête (en retard, puis aujourd'hui) ; un filtre par étape. Gagné, « Créer
   sa boutique » ouvre l'assistant déjà rempli ; perdu, on dit pourquoi.
   ========================================================================== */

type Params = {
  ok?: string; erreur?: string; etape?: string; vu?: string; ouvert?: string;
  nom?: string; contact_nom?: string; telephone?: string; email?: string; ville?: string; metier?: string; source?: string;
  prochaine_action?: string; prochaine_le?: string; note?: string;
};

/** La teinte de chaque étape (les pastilles d'état de la console). */
const TEINTES: Record<EtapeProspect, string> = {
  a_contacter: "", contacte: "ui-etat-bleu", demo: "ui-etat-violet", offre: "ui-etat-ambre", gagne: "ui-etat-vert", perdu: "",
};

const ECHEANCES = { retard: "en retard", aujourdhui: "aujourd'hui", a_venir: "" } as const;

const jourLisible = (j: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${j}T00:00:00Z`));

export default async function Prospects({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, role } = await exigeAdmin();
  const v = await searchParams;
  const service = clientService();
  const [{ data, error }, { data: dm }] = await Promise.all([
    service.rpc("console_prospects", { p_acteur: user.id }),
    service.rpc("console_metiers", { p_acteur: user.id }),
  ]);
  if (error) throw new Error(`Prospects illisibles : ${error.message}`);
  const tous = (data ?? []) as Prospect[];
  const metiers = (dm ?? []) as Metier[];
  const jour = aujourdhui();

  const filtre = ETAPES_PROSPECT.some((e) => e.code === v.etape) ? (v.etape as EtapeProspect) : null;
  const liste = filtre ? tous.filter((p) => p.etape === filtre) : tous.filter(enCours);
  const compte = (e: EtapeProspect) => tous.filter((p) => p.etape === e).length;
  const enCoursN = tous.filter(enCours).length;
  const relancer = aRelancer(tous, jour);
  // Une erreur à la création : le formulaire garde la saisie ; à la modification, la fiche se rouvre.
  const saisie = v.erreur && !v.ouvert ? v : {};

  return (
    <>
      <EnTetePage
        titre="Prospects"
        description="Les commerces à qui vendre : qui appeler, où l'on en est, la prochaine chose à faire."
        actions={<a href="#nouveau" className="btn btn-primaire"><Icone nom="plus" taille={16} /> Nouveau prospect</a>}
      />
      {v.ok ? <p className="message message-succes" role="status">{v.ok}</p> : null}
      {v.erreur ? <p className="message message-erreur" role="alert">{v.erreur}</p> : null}

      <ul className="tbp-chiffres pr-chiffres" role="list" aria-label="Les prospects en chiffres">
        <li className="carte">
          <span className="tbp-libelle">En cours</span>
          <b className="tbp-valeur">{enCoursN}</b>
          <span className="tbp-evolution discret">{compte("demo")} démo · {compte("offre")} offre{compte("offre") > 1 ? "s" : ""}</span>
        </li>
        <li className="carte" data-niveau={relancer ? "attention" : undefined}>
          <span className="tbp-libelle">À relancer</span>
          <b className="tbp-valeur">{relancer}</b>
          <span className="tbp-evolution discret">aujourd&apos;hui ou en retard</span>
        </li>
        <li className="carte">
          <span className="tbp-libelle">Gagnés</span>
          <b className="tbp-valeur">{compte("gagne")}</b>
          <span className="tbp-evolution discret">devenus clients</span>
        </li>
        <li className="carte">
          <span className="tbp-libelle">Perdus</span>
          <b className="tbp-valeur">{compte("perdu")}</b>
          <span className="tbp-evolution discret">avec leur motif</span>
        </li>
      </ul>

      <div className="grille-2">
        <section className="carte carte-plate" aria-labelledby="t-prospects">
          <div className="carte-tete">
            <div>
              <h2 id="t-prospects" className="carte-titre-icone"><Icone nom="personne" /> {filtre ? LIBELLE_ETAPE[filtre] : "En cours"}</h2>
              <p>{filtre ? `${liste.length} prospect${liste.length > 1 ? "s" : ""}.` : "Le plus pressé en tête : en retard, puis aujourd'hui, puis le reste."}</p>
            </div>
          </div>
          <nav className="onglets pr-onglets" aria-label="Étapes">
            <Link href="/prospects" aria-current={!filtre ? "page" : undefined}>En cours <span className="compte-onglet">{enCoursN}</span></Link>
            {ETAPES_PROSPECT.map((e) => (
              <Link key={e.code} href={`/prospects?etape=${e.code}`} aria-current={filtre === e.code ? "page" : undefined}>
                {e.court} <span className="compte-onglet">{compte(e.code)}</span>
              </Link>
            ))}
          </nav>

          {liste.length === 0 ? (
            <p className="aide pr-vide">
              {tous.length === 0
                ? "Aucun prospect encore : notez le premier commerce à appeler, à droite (en bas sur téléphone)."
                : "Personne à cette étape."}
            </p>
          ) : (
            <ul className="pr-liste" role="list">
              {liste.map((p) => {
                const e = echeance(p, jour);
                const whatsapp = p.telephone?.replace(/\D/g, "");
                return (
                  <li key={p.id} id={`p-${p.id}`} className="pr-ligne" data-vu={v.vu === p.id ? "" : undefined}>
                    <div className="pr-qui">
                      <p className="pr-nom">
                        <b>{p.nom}</b>
                        <span className={`ui-etat ${TEINTES[p.etape]}`}>{LIBELLE_ETAPE[p.etape]}</span>
                      </p>
                      <p className="aide">
                        {[p.contact_nom, p.telephone ? numeroLisible(p.telephone) : null, p.ville, p.metier_nom].filter(Boolean).join(" · ") || "Contact à noter"}
                      </p>
                      {p.etape === "perdu" && p.motif_perte ? <p className="aide pr-motif">Perdu : {p.motif_perte}</p> : null}
                      {p.boutique ? <p className="aide">Sa boutique : <Link href={`/boutiques/${p.boutique.slug}`} className="btn-lien">{p.boutique.nom}</Link></p> : null}
                      {enCours(p) ? (
                        <p className="pr-prochaine" data-echeance={e ?? undefined}>
                          <Icone nom="calendrier" taille={14} />
                          {p.prochaine_action || p.prochaine_le
                            ? <span>{p.prochaine_action ?? "À relancer"}{p.prochaine_le ? <> · <b>{jourLisible(p.prochaine_le)}</b>{e && ECHEANCES[e] ? ` (${ECHEANCES[e]})` : ""}</> : null}</span>
                            : <span className="discret">Rien de prévu : notez la prochaine chose à faire.</span>}
                        </p>
                      ) : null}
                    </div>
                    <div className="pr-gestes">
                      {p.telephone ? <a href={`tel:${p.telephone}`} className="btn btn-second btn-petit"><Icone nom="telephone" taille={14} /> Appeler</a> : null}
                      {whatsapp ? (
                        <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener" className="btn btn-second btn-petit"><Icone nom="message" taille={14} /> WhatsApp</a>
                      ) : null}
                      {p.etape === "offre" || p.etape === "demo" ? (
                        <a href={lienCreation(p)} className="btn btn-primaire btn-petit"><Icone nom="boutique" taille={14} /> Créer sa boutique</a>
                      ) : null}
                    </div>
                    <details className="pr-detail" open={v.ouvert === p.id}>
                      <summary className="btn btn-fantome btn-petit"><Icone nom="crayon" taille={14} /> Étape, prochaine action, fiche</summary>
                      <div className="pr-detail-corps">
                        {enCours(p) ? (
                          <div className="pr-etapes">
                            <form action="/prospects/etape" method="post" className="formulaire pr-etape">
                              <input type="hidden" name="id" value={p.id} />
                              <label htmlFor={`pe-${p.id}`}>Étape</label>
                              <select id={`pe-${p.id}`} name="etape" defaultValue={p.etape} data-envoi-auto>
                                {ETAPES_PROSPECT.filter((x) => x.code !== "perdu").map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
                              </select>
                              <noscript><button type="submit" className="btn btn-second btn-petit">Changer</button></noscript>
                            </form>
                            <form action="/prospects/etape" method="post" className="formulaire pr-perdu">
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="etape" value="perdu" />
                              <label htmlFor={`pm-${p.id}`}>Perdu ? Pourquoi</label>
                              <div className="pr-perdu-ligne">
                                <input id={`pm-${p.id}`} name="motif" className="entree" maxLength={300} required placeholder="Trop cher, déjà équipé, pas maintenant…" />
                                <button type="submit" className="btn btn-second btn-petit">Perdu</button>
                              </div>
                            </form>
                          </div>
                        ) : (
                          <form action="/prospects/etape" method="post" className="formulaire pr-etape">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="etape" value="contacte" />
                            <button type="submit" className="btn btn-second btn-petit"><Icone nom="rendre" taille={14} /> Reprendre (contacté)</button>
                          </form>
                        )}
                        <FormProspect p={p} metiers={metiers} />
                        <p className="aide">Créé le {dateJournal(p.cree_le)} ; mis à jour le {dateJournal(p.modifie_le)}{p.par ? ` par ${p.par}` : ""}.</p>
                        {role === "super_admin" ? (
                          <Confirmation
                            id={`pr-retirer-${p.id}`}
                            declencheur={<><Icone nom="corbeille" taille={14} /> Retirer ce prospect</>}
                            titre={`Retirer « ${p.nom} » ?`}
                            texte="Pour une fiche saisie par erreur. Le journal garde la trace du geste."
                            action="/prospects/retirer"
                            champs={{ id: p.id }}
                            bouton="Retirer"
                            classeDeclencheur="btn btn-fantome btn-petit pr-retirer"
                          />
                        ) : null}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="carte" aria-labelledby="t-nouveau" id="nouveau">
          <div className="carte-tete">
            <div>
              <h2 id="t-nouveau" className="carte-titre-icone"><Icone nom="plus" /> Nouveau prospect</h2>
              <p>Le commerce, qui appeler, et la prochaine chose à faire.</p>
            </div>
          </div>
          <FormProspect p={null} metiers={metiers} saisie={saisie} />
        </section>
      </div>
    </>
  );
}

/** Le formulaire d'un prospect : neuf (p null, avec la saisie refusée s'il y en a une) ou à modifier. */
function FormProspect({ p, metiers, saisie = {} }: { p: Prospect | null; metiers: Metier[]; saisie?: Partial<Params> }) {
  const id = p?.id ?? "neuf";
  const val = (cle: keyof Params & keyof Prospect) => (p ? (p[cle] as string | null) ?? "" : saisie[cle] ?? "");
  return (
    <form action="/prospects/enregistrer" method="post" className="formulaire pr-form">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="champ">
        <label htmlFor={`pr-nom-${id}`}>Commerce</label>
        <input id={`pr-nom-${id}`} name="nom" className="entree" required maxLength={120} defaultValue={val("nom")} placeholder="Parfumerie Yasmine" autoComplete="off" />
      </div>
      <div className="deux-colonnes">
        <div className="champ">
          <label htmlFor={`pr-contact-${id}`}>Qui appeler</label>
          <input id={`pr-contact-${id}`} name="contact_nom" className="entree" maxLength={120} defaultValue={val("contact_nom")} placeholder="Prénom, son rôle" autoComplete="off" />
        </div>
        <div className="champ">
          <label htmlFor={`pr-tel-${id}`}>Téléphone</label>
          <input id={`pr-tel-${id}`} name="telephone" type="tel" inputMode="tel" className="entree"
            defaultValue={p?.telephone ? numeroLisible(p.telephone) : saisie.telephone ?? ""} placeholder="20 123 456" autoComplete="off" />
        </div>
      </div>
      <div className="deux-colonnes">
        <div className="champ">
          <label htmlFor={`pr-ville-${id}`}>Ville</label>
          <input id={`pr-ville-${id}`} name="ville" className="entree" maxLength={80} defaultValue={val("ville")} placeholder="Sfax" autoComplete="off" />
        </div>
        <div className="champ">
          <label htmlFor={`pr-metier-${id}`}>Métier</label>
          <select id={`pr-metier-${id}`} name="metier" defaultValue={val("metier")}>
            <option value="">À préciser</option>
            {metiers.map((m) => <option key={m.code} value={m.code}>{m.nom}</option>)}
          </select>
        </div>
      </div>
      {/* La prochaine action se lit en entier ; sa date, à sa mesure, dessous. */}
      <div className="champ">
        <label htmlFor={`pr-action-${id}`}>Prochaine action</label>
        <input id={`pr-action-${id}`} name="prochaine_action" className="entree" maxLength={200} defaultValue={val("prochaine_action")} placeholder="Montrer la démonstration" autoComplete="off" />
      </div>
      <div className="champ pr-le">
        <label htmlFor={`pr-le-${id}`}>Le</label>
        <input id={`pr-le-${id}`} name="prochaine_le" type="date" className="entree" defaultValue={val("prochaine_le")} />
      </div>
      <details className="pr-plus" open={Boolean(p?.email || p?.note || saisie.email || saisie.note)}>
        <summary className="aide">E-mail, d&apos;où il vient, une note</summary>
        <div className="formulaire">
          <div className="champ">
            <label htmlFor={`pr-email-${id}`}>E-mail</label>
            <input id={`pr-email-${id}`} name="email" type="email" className="entree" maxLength={200} defaultValue={val("email")} placeholder="contact@exemple.tn" autoComplete="off" />
          </div>
          <div className="champ">
            <label htmlFor={`pr-source-${id}`}>D&apos;où il vient</label>
            <select id={`pr-source-${id}`} name="source" defaultValue={p?.source ?? saisie.source ?? "autre"}>
              {Object.entries(SOURCES_PROSPECT).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor={`pr-note-${id}`}>Note</label>
            <textarea id={`pr-note-${id}`} name="note" className="entree" rows={2} maxLength={2000} defaultValue={val("note")} placeholder="Ce qu'il vend, ce qui l'intéresse…" />
          </div>
        </div>
      </details>
      <div><button type="submit" className="btn btn-primaire">{p ? "Enregistrer" : "Ajouter le prospect"}</button></div>
    </form>
  );
}
