import { Icone } from "./Icone";
import { dateJournal } from "@/lib/console/libelles";
import { ilYa } from "@/lib/console/pilotage";

/* ============================================================================
   LES FOURNISSEURS (État technique) — le dernier essai de chacun : répond,
   refuse la clé, injoignable, ou non branché ; en combien de temps ; depuis
   quand il ne répond plus. Essayés chaque heure, et à la demande.
   ========================================================================== */

type EssaiLu = { mode: "reel" | "local" | "apercu" | "aucun"; ok: boolean | null; duree_ms: number | null; detail: string | null; le: string; dernier_ok_le: string | null };
export type DonneesFournisseurs = Partial<Record<"courriels" | "sms" | "skanfact" | "konnect" | "cloudflare", EssaiLu>>;
type Niveau = "ok" | "attention" | "panne" | "neutre";

const LISTE: { cle: keyof DonneesFournisseurs; nom: string; role: string; critique: boolean }[] = [
  { cle: "courriels", nom: "E-mails", role: "codes de connexion, commandes, alertes", critique: true },
  { cle: "sms", nom: "SMS", role: "codes de connexion des acheteurs", critique: false },
  { cle: "skanfact", nom: "SkanFact", role: "factures des clients et des commerçants", critique: false },
  { cle: "konnect", nom: "Konnect", role: "paiement par carte", critique: false },
  { cle: "cloudflare", nom: "Cloudflare", role: "domaines des boutiques", critique: false },
];
const MODE: Record<EssaiLu["mode"], string> = { reel: "en ligne", local: "simulé en local", apercu: "aperçu", aucun: "non branché" };
const PASTILLE: Record<Niveau, string> = {
  ok: "ui-etat ui-etat-point ui-etat-vert", attention: "ui-etat ui-etat-point ui-etat-ambre",
  panne: "ui-etat ui-etat-point ui-etat-rouge", neutre: "ui-etat ui-etat-point",
};

const niveauDe = (e: EssaiLu | undefined, critique: boolean): Niveau => (!e || e.ok === null ? "neutre" : e.ok ? "ok" : critique ? "panne" : "attention");

/** Ce qu'il faut regarder (le verdict en tête de l'État). */
export function pointsFournisseurs(d: DonneesFournisseurs): { niveau: "attention" | "panne"; texte: string }[] {
  return LISTE.flatMap((f) => {
    const e = d[f.cle];
    if (!e || e.ok !== false) return [];
    return [{ niveau: f.critique ? "panne" as const : "attention" as const, texte: `${f.nom} : ${e.detail ?? "ne répond pas"}${e.dernier_ok_le ? ` (dernier succès le ${dateJournal(e.dernier_ok_le)})` : ""}.` }];
  });
}

export function CarteFournisseurs({ d, maintenant, message }: { d: DonneesFournisseurs; maintenant: number; message: React.ReactNode }) {
  const niveaux = LISTE.map((f) => niveauDe(d[f.cle], f.critique));
  const niveau: Niveau = niveaux.includes("panne") ? "panne" : niveaux.includes("attention") ? "attention" : niveaux.includes("ok") ? "ok" : "neutre";
  const le = LISTE.map((f) => d[f.cle]?.le).filter(Boolean).sort().at(-1);
  return (
    <section className="carte et-carte et-large" aria-labelledby="t-fournisseurs" data-niveau={niveau}>
      <header className="et-tete">
        <h2 id="t-fournisseurs" className="carte-titre-icone"><Icone nom="lien" /> Fournisseurs</h2>
        <span className={PASTILLE[niveau]}>{niveau === "panne" ? "Un fournisseur casse" : niveau === "attention" ? "À regarder" : niveau === "ok" ? "Ils répondent" : "Pas encore essayés"}</span>
      </header>
      {message}
      <p className="aide et-alertes-regle">
        Un appel inoffensif à chacun — rien n&apos;est envoyé, rien n&apos;est créé : répond-il, accepte-t-il encore notre clé, en combien de temps.
        Chaque heure, et à la demande.{le ? <> Dernier essai {ilYa(le, maintenant)}.</> : null}
      </p>
      <ul className="fo-liste" role="list">
        {LISTE.map((f, i) => {
          const e = d[f.cle];
          const n = niveaux[i];
          return (
            <li key={f.cle} data-niveau={n}>
              <div className="fo-nom"><b>{f.nom}</b><span className="aide">{f.role}</span></div>
              <div className="fo-essai">
                {e ? (
                  <>
                    <span>{e.ok === true ? `répond${e.duree_ms !== null ? ` en ${e.duree_ms.toLocaleString("fr-FR")} ms` : ""}` : e.ok === false ? <b className="et-manque">{e.detail ?? "ne répond pas"}</b> : e.detail ?? MODE[e.mode]}</span>
                    <span className="aide">{MODE[e.mode]}{e.ok === false && e.dernier_ok_le ? ` · dernier succès le ${dateJournal(e.dernier_ok_le)}` : ""}</span>
                  </>
                ) : <span className="discret">pas encore essayé</span>}
              </div>
              <div className="fo-etat"><span className={PASTILLE[n]}>{n === "ok" ? "Répond" : n === "panne" ? "En panne" : n === "attention" ? "À regarder" : e ? "Non branché" : "—"}</span></div>
            </li>
          );
        })}
      </ul>
      <div className="et-pied">
        <form action="/etat/fournisseurs" method="post">
          <button type="submit" className="btn btn-second btn-petit"><Icone nom="refaire" taille={14} /> Essayer maintenant</button>
        </form>
        <p className="aide">Un secret changé, une panne annoncée par un fournisseur : l&apos;essai le dit tout de suite.</p>
      </div>
    </section>
  );
}
