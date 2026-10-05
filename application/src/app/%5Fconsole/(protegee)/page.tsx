import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { LIBELLES_STATUT } from "@/lib/console/libelles";
import { couleursDe, depuis, vigilances, type LignePilotage, type Rappel } from "@/lib/console/pilotage";
import { configSkanFact } from "@/lib/console/skanfact";
import { formateMontant } from "@/lib/prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Semaine, TuileBoutique } from "@/components/console/TuileBoutique";
import { SANS_FORMULE, type DonneesFormules } from "@/lib/console/formules";
import type { Sante } from "@/lib/console/pilotage";

export const metadata: Metadata = { title: "Boutiques" };

type CodeApercu = { id: number; le: string; canal: "sms" | "email"; destinataire: string; code: string; sujet: string | null; courriel: boolean };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });

/* LE POSTE DE PILOTAGE — toutes les boutiques d'un coup d'œil (lib/console/
   pilotage.ts) : chacune à sa couleur, avec sa photo et son monogramme, sa
   semaine, ce qui attend, sa mise en place ; en tête, ce qui demande un
   regard. En liste (?vue=liste), le même état en tableau. Sur l'aperçu en
   ligne seulement (supabase/apercu/codes-demo.sql), les codes de connexion
   que Supabase aurait envoyés par SMS ou par e-mail. */
/** Les filtres de la liste : par défaut, les boutiques en activité (les fermées à part). */
const STATUTS_FILTRE = [
  { cle: "", titre: "En activité" },
  { cle: "active", titre: "Ouvertes" },
  { cle: "en_preparation", titre: "En préparation" },
  { cle: "suspendue", titre: "Suspendues" },
  { cle: "fermee", titre: "Fermées" },
  { cle: "toutes", titre: "Tout statut" },
] as const;

/** Pour chercher sans se soucier des accents ni des majuscules. */
const plat = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default async function Tableau({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; statut?: string; formule?: string; type?: string }> }) {
  const { user } = await exigeAdmin();
  const p = await searchParams;
  const enListe = p.vue === "liste";
  const q = (p.q ?? "").trim().slice(0, 80);
  const statut = STATUTS_FILTRE.find((x) => x.cle === p.statut)?.cle ?? "";
  const type = p.type === "clientes" || p.type === "demos" ? p.type : "";
  const service = clientService();
  const [{ data, error }, { data: codesApercu }, { data: df }, { data: ds }, { data: dr }, { data: de }] = await Promise.all([
    service.rpc("console_pilotage"),
    // Absente hors de l'aperçu : l'erreur la cache, rien d'autre.
    service.rpc("console_codes_apercu"),
    service.rpc("console_formules", { p_acteur: user.id }),
    service.rpc("console_sante", { p_acteur: user.id }),
    service.rpc("console_rappels", { p_acteur: user.id }),
    // (une ligne suffit : on n'en lit que la semaine)
    service.rpc("console_envois", { p_acteur: user.id, p_echecs: true, p_limite: 1 }),
  ]);
  const formules = (df ?? { formules: [], droits: [], boutiques: [] }) as DonneesFormules;
  const nomsFormules = new Map(formules.formules.map((f) => [f.code, f.nom]));
  const formuleDe = new Map(formules.boutiques.map((x) => [x.id, x.formule ? nomsFormules.get(x.formule) ?? x.formule : null]));
  const codes = Array.isArray(codesApercu) ? (codesApercu as CodeApercu[]) : null;
  if (error) throw new Error(`Boutiques illisibles : ${error.message}`);
  const boutiques = (data ?? []) as LignePilotage[];
  const formuleFiltre = p.formule === "sur-mesure" || formules.formules.some((f) => f.code === p.formule) ? (p.formule as string) : "";
  const codeFormuleDe = new Map(formules.boutiques.map((x) => [x.id, x.formule]));
  const filtree = q !== "" || statut !== "" || formuleFiltre !== "" || type !== "";
  const visibles = boutiques.filter((b) =>
    (statut === "toutes" ? true : statut === "" ? b.statut !== "fermee" : b.statut === statut)
    && (type === "" || (type === "demos") === b.demonstration)
    && (formuleFiltre === "" || (formuleFiltre === "sur-mesure" ? !codeFormuleDe.get(b.id) : codeFormuleDe.get(b.id) === formuleFiltre))
    && (q === "" || [b.nom, b.slug, b.hote ?? ""].some((t) => plat(t).includes(plat(q)))));
  const fermees = boutiques.filter((b) => b.statut === "fermee").length;
  const lienVue = (liste: boolean) => {
    const u = new URLSearchParams();
    if (liste) u.set("vue", "liste");
    if (q) u.set("q", q);
    if (statut) u.set("statut", statut);
    if (formuleFiltre) u.set("formule", formuleFiltre);
    if (type) u.set("type", type);
    const t = u.toString();
    return `/${t ? `?${t}` : ""}`;
  };
  const hoteConsole = (await headers()).get("host");
  const maintenant = new Date().getTime();
  const aSurveiller = vigilances(boutiques, maintenant, {
    skanfact: configSkanFact() !== null, sante: (ds ?? []) as Sante[], rappels: (dr ?? []) as Rappel[],
    envoisRefuses: (de as { semaine?: { refuses: number } } | null)?.semaine?.refuses ?? 0,
  });

  // La synthèse ne compte que les clientes : les boutiques de démonstration vendent pour de faux.
  const clientes = boutiques.filter((b) => !b.demonstration);
  const demos = boutiques.filter((b) => b.demonstration);
  const ouvertes = clientes.filter((b) => b.statut === "active").length;
  const enPreparation = clientes.filter((b) => b.statut === "en_preparation").length;
  const publies = clientes.reduce((n, b) => n + b.publies, 0);
  const semaine = clientes.reduce((n, b) => n + b.commandes.semaine, 0);
  const encaisse = clientes.reduce((n, b) => n + b.commandes.encaisse_semaine, 0);
  const tuiles = (liste: LignePilotage[]) => (
    <div className="pl-grille">
      {liste.map((b) => <TuileBoutique key={b.id} b={b} maintenant={maintenant} hoteConsole={hoteConsole} formule={formuleDe.get(b.id) ?? SANS_FORMULE} />)}
    </div>
  );
  const clientesVisibles = visibles.filter((b) => !b.demonstration);
  const demosVisibles = visibles.filter((b) => b.demonstration);

  return (
    <>
      <EnTetePage
        titre="Boutiques"
        description={
          <span className="pl-synthese ligne-points">
            <span><b className="tabular-nums">{clientes.length}</b> cliente{clientes.length > 1 ? "s" : ""}, <b className="tabular-nums">{ouvertes}</b> ouverte{ouvertes > 1 ? "s" : ""}{enPreparation ? <>, <b className="tabular-nums">{enPreparation}</b> en préparation</> : null}{demos.length ? <> · <b className="tabular-nums">{demos.length}</b> de démonstration</> : null}</span>
            <span><b className="tabular-nums">{publies}</b> produit{publies > 1 ? "s" : ""} en vitrine</span>
            <span><b className="tabular-nums">{semaine}</b> commande{semaine > 1 ? "s" : ""} en 7 jours</span>
            <span><b className="tabular-nums">{formateMontant(encaisse)}</b> TND encaissés{demos.length ? " (clientes seules)" : ""}</span>
          </span>
        }
        actions={
          <>
            <nav className="segments pl-vues" aria-label="Affichage des boutiques">
              <Link href={lienVue(false)} aria-current={enListe ? undefined : "page"}><Icone nom="apercu" taille={14} /> Tuiles</Link>
              <Link href={lienVue(true)} aria-current={enListe ? "page" : undefined}><Icone nom="liste" taille={14} /> Liste</Link>
            </nav>
            <Link href="/nouvelle-boutique" className="btn btn-primaire"><Icone nom="plus" /> Nouvelle boutique</Link>
          </>
        }
      />

      {boutiques.length === 0 ? (
        <div className="vide">
          <span className="vide-icone"><Icone nom="boutique" taille={20} /></span>
          <strong>Aucune boutique pour l&apos;instant</strong>
          <p>Créez la première : son domaine, son gabarit, puis sa marque et son catalogue.</p>
          <Link href="/nouvelle-boutique" className="btn btn-primaire mt-3"><Icone nom="plus" /> Nouvelle boutique</Link>
        </div>
      ) : (
        <>
          <section className="pl-vigilance" aria-labelledby="t-vigilance">
            <h2 id="t-vigilance" className="pl-vigilance-titre">
              À surveiller{aSurveiller.length ? <span className="pl-compte tabular-nums">{aSurveiller.length}</span> : null}
            </h2>
            {aSurveiller.length ? (
              <ul className="pl-vigilance-liste" role="list">
                {aSurveiller.map((v) => (
                  <li key={v.cle} data-niveau={v.niveau}>
                    <Link href={v.href}>
                      <span className="pl-point" aria-hidden="true" />
                      <span><b>{v.boutique?.nom ?? "Plateforme"}</b> : {v.texte}</span>
                      <Icone nom="droite" taille={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pl-vigilance-calme">Rien ne presse : aucune commande n&apos;attend depuis plus de deux heures, aucune boutique en préparation.</p>
            )}
          </section>

          <form action="/" method="get" className="pl-filtres" role="search" aria-label="Chercher une boutique">
            {enListe ? <input type="hidden" name="vue" value="liste" /> : null}
            <label className="sr-only" htmlFor="pl-q">Nom, identifiant ou domaine</label>
            <span className="pl-filtres-q">
              <Icone nom="recherche" taille={16} />
              <input id="pl-q" name="q" type="search" className="entree" defaultValue={q} placeholder="Nom, identifiant ou domaine" autoComplete="off" />
            </span>
            <label className="sr-only" htmlFor="pl-statut">Statut</label>
            <select id="pl-statut" name="statut" className="entree" defaultValue={statut}>
              {STATUTS_FILTRE.map((x) => <option key={x.cle} value={x.cle}>{x.titre}{x.cle === "fermee" && fermees ? ` (${fermees})` : ""}</option>)}
            </select>
            <label className="sr-only" htmlFor="pl-formule">Formule</label>
            <select id="pl-formule" name="formule" className="entree" defaultValue={formuleFiltre}>
              <option value="">Toute formule</option>
              {formules.formules.map((f) => <option key={f.code} value={f.code}>{f.nom}</option>)}
              <option value="sur-mesure">{SANS_FORMULE}</option>
            </select>
            <label className="sr-only" htmlFor="pl-type">Clientes ou démonstrations</label>
            <select id="pl-type" name="type" className="entree" defaultValue={type}>
              <option value="">Clientes et démos</option>
              <option value="clientes">Clientes</option>
              <option value="demos">Démos</option>
            </select>
            <button type="submit" className="btn btn-second">Filtrer</button>
            {filtree ? (
              <span className="pl-filtres-compte">
                {visibles.length} sur {boutiques.length} · <Link href={enListe ? "/?vue=liste" : "/"} className="btn-lien">Tout voir</Link>
              </span>
            ) : fermees ? (
              <span className="pl-filtres-compte discret">{fermees} fermée{fermees > 1 ? "s" : ""} à part</span>
            ) : null}
          </form>

          {visibles.length === 0 ? (
            <p className="message">Aucune boutique pour ce filtre. <Link href={enListe ? "/?vue=liste" : "/"}>Tout voir</Link></p>
          ) : enListe ? (
            <div className="carte carte-plate defile">
              <table className="tableau">
                <thead>
                  <tr><th>Boutique</th><th>Domaine</th><th>Statut</th><th>Formule</th><th>Mise en place</th><th className="text-end">À confirmer</th><th>7 jours</th><th className="text-end">Produits</th><th aria-label="Ouvrir" /></tr>
                </thead>
                <tbody>
                  {[...clientesVisibles, ...demosVisibles].map((b) => (
                    <tr key={b.id} className="ligne-lien">
                      <td>
                        <span className="cellule-titre">
                          <span className="initiale" style={{ background: couleursDe(b).accent, color: "#fff" }} aria-hidden="true">{b.nom.trim().charAt(0).toUpperCase()}</span>
                          <span>
                            <Link href={`/boutiques/${b.slug}`} className="ligne-cible">{b.nom}</Link>
                            <small>{b.slug}{b.demonstration ? " · démonstration" : ""}</small>
                          </span>
                        </span>
                      </td>
                      <td className="discret">{b.hote ?? "—"}</td>
                      <td><span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span></td>
                      <td className={formuleDe.get(b.id) ? "whitespace-nowrap" : "discret whitespace-nowrap"}>{formuleDe.get(b.id) ?? SANS_FORMULE}</td>
                      <td>
                        <span className="mp-mini" title={`${b.mise_en_place.faites} étapes faites sur ${b.mise_en_place.total}`}>
                          <span className="mp-barre" aria-hidden="true">
                            <span style={{ inlineSize: `${(b.mise_en_place.faites / Math.max(1, b.mise_en_place.total)) * 100}%` }} />
                          </span>
                          <span className="tabular-nums">{b.mise_en_place.faites}/{b.mise_en_place.total}</span>
                        </span>
                      </td>
                      <td className="tabular-nums text-end">
                        {b.commandes.a_confirmer ? (
                          <span title={b.commandes.attente_depuis ? `La plus ancienne attend depuis ${depuis(b.commandes.attente_depuis, maintenant)}` : undefined}>
                            {b.commandes.a_confirmer}
                          </span>
                        ) : <span className="discret">—</span>}
                      </td>
                      <td><span className="pl-semaine-cellule" style={{ "--pl-accent": couleursDe(b).accent } as React.CSSProperties}><Semaine jours={b.jours} /> <span className="tabular-nums">{b.commandes.semaine}</span></span></td>
                      <td className="tabular-nums text-end">{b.produits}</td>
                      <td className="text-end discret"><Icone nom="droite" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : clientesVisibles.length && demosVisibles.length ? (
            <>
              <h2 className="pl-groupe">Clientes <span className="pl-compte tabular-nums">{clientesVisibles.length}</span></h2>
              {tuiles(clientesVisibles)}
              <h2 className="pl-groupe">Démonstrations <span className="pl-compte tabular-nums">{demosVisibles.length}</span></h2>
              <p className="aide pl-groupe-aide">Montrées aux prospects : leurs commandes ne comptent pas dans la synthèse ni dans « À surveiller ».</p>
              {tuiles(demosVisibles)}
            </>
          ) : (
            tuiles(visibles)
          )}
        </>
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
