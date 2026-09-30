import Image from "next/image";
import Link from "next/link";
import { Icone } from "./Icone";
import { urlFichier } from "@/lib/photos";
import { formateMontant } from "@/lib/prix";
import { LIBELLES_STATUT, LIBELLES_THEME, adresseVitrine } from "@/lib/console/libelles";
import { couleursDe, depuis, titreEtape, type LignePilotage } from "@/lib/console/pilotage";

/* ============================================================================
   UNE BOUTIQUE AU POSTE DE PILOTAGE — elle se reconnaît : sa photo
   d'ouverture, sa couleur, son monogramme. Puis ce qu'on veut savoir d'elle
   en passant : sa semaine (une barre par jour), ce qui attend, où en est sa
   mise en place et la prochaine étape. La tuile est un lien vers sa fiche
   (nommé par le nom de la boutique) ; la vitrine s'ouvre à part, du pied.
   ========================================================================== */

/** Sept barres : les commandes reçues chaque jour, aujourd'hui à droite. */
export function Semaine({ jours }: { jours: number[] }) {
  const haut = Math.max(1, ...jours);
  const libelle = `Commandes des sept derniers jours : ${jours.join(", ")} (aujourd'hui en dernier)`;
  return (
    <svg className="pl-semaine" viewBox="0 0 70 24" role="img" aria-label={libelle} preserveAspectRatio="none">
      {jours.map((n, i) => {
        const h = n ? Math.max(3, (n / haut) * 22) : 1.5;
        return <rect key={i} x={i * 10 + 1} y={24 - h} width={8} height={h} rx={1.5} data-aujourdhui={i === jours.length - 1 ? "" : undefined} data-vide={n ? undefined : ""} />;
      })}
    </svg>
  );
}

export function TuileBoutique({ b, maintenant, hoteConsole }: { b: LignePilotage; maintenant: number; hoteConsole: string | null }) {
  const { accent, fond, encre } = couleursDe(b);
  const c = b.commandes;
  const mp = b.mise_en_place;
  const prochaine = titreEtape(mp.prochaine);
  const attenteLongue = c.a_confirmer > 0 && c.attente_depuis && maintenant - new Date(c.attente_depuis).getTime() >= 2 * 3_600_000;
  const monogramme = b.marque.monogramme_chemin;
  const style = { "--pl-accent": accent, "--pl-fond": fond, "--pl-encre": encre } as React.CSSProperties;

  return (
    <article className="pl-tuile" style={style} data-statut={b.statut}>
      <Link href={`/boutiques/${b.slug}`} className="pl-lien" aria-labelledby={`pl-${b.id}`}>
      <div className="pl-couverture">
        {b.marque.image ? (
          <Image src={urlFichier(b.marque.image)} alt="" fill sizes="(max-width: 699px) 100vw, 400px" className="pl-photo" />
        ) : (
          <span className="pl-photo pl-photo-vide" aria-hidden="true" />
        )}
        <span className="pl-voile" aria-hidden="true" />
        <span className="pl-etiquettes">
          {b.support ? (
            <span className="pl-support" title={`Accès support ouvert (${b.support.role === "admin" ? "agir" : "regarder"})`}>
              <Icone nom="support" taille={12} /> Support
            </span>
          ) : null}
          <span className={`statut statut-${b.statut}`}>{LIBELLES_STATUT[b.statut] ?? b.statut}</span>
        </span>
        <span className="pl-identite">
          <span className="pl-monogramme" aria-hidden="true">
            {monogramme ? (
              <span className="pl-masque" style={{ maskImage: `url("${urlFichier(monogramme)}")`, WebkitMaskImage: `url("${urlFichier(monogramme)}")` }} />
            ) : (
              b.nom.trim().charAt(0).toUpperCase()
            )}
          </span>
          <span className="pl-nom-bloc">
            <h2 id={`pl-${b.id}`} className="pl-nom">{b.nom}</h2>
            <span className="pl-hote">{b.hote ?? b.slug}</span>
          </span>
        </span>
      </div>

      <div className="pl-corps">
        <div className="pl-activite">
          <Semaine jours={b.jours} />
          <p className="pl-chiffres">
            <span><b className="tabular-nums">{c.semaine}</b> commande{c.semaine > 1 ? "s" : ""} en 7 jours</span>
            <span className="pl-encaisse">
              {c.encaisse_semaine > 0 ? <><b className="tabular-nums">{formateMontant(c.encaisse_semaine)}</b> TND encaissés</> : "rien d'encaissé"}
            </span>
          </p>
        </div>

        {c.a_confirmer > 0 ? (
          <p className="pl-attente" data-longue={attenteLongue ? "" : undefined}>
            <Icone nom="horloge" taille={14} />
            <span>
              <b className="tabular-nums">{c.a_confirmer}</b> à confirmer
              {c.attente_depuis ? <> · depuis {depuis(c.attente_depuis, maintenant)}</> : null}
            </span>
          </p>
        ) : (
          <p className="pl-attente pl-attente-rien"><Icone nom="coche" taille={14} /> <span>Aucune commande n&apos;attend</span></p>
        )}

        <div className="pl-mise">
          <span className="pl-mise-tete">
            <span>Mise en place</span>
            <span className="tabular-nums">{mp.faites}/{mp.total}</span>
          </span>
          <span className="pl-mise-barre" aria-hidden="true"><span style={{ inlineSize: `${(mp.faites / Math.max(1, mp.total)) * 100}%` }} /></span>
          <span className="pl-mise-suite">{prochaine ? <>Prochaine : {prochaine}</> : "Tout est fait"}</span>
        </div>
      </div>
      </Link>

      <div className="pl-pied">
        <span className="discret">
          {(b.marque.code && LIBELLES_THEME[b.marque.code]) ?? "—"} · {b.publies} produit{b.publies > 1 ? "s" : ""} en vitrine
        </span>
        {b.hote ? (
          <a className="pl-vitrine" href={adresseVitrine(b.hote, hoteConsole)} target="_blank" rel="noopener">
            Vitrine <Icone nom="externe" taille={13} />
          </a>
        ) : null}
      </div>
    </article>
  );
}
