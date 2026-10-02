// La feuille de la console : ici, pas dans le layout racine (voir ../../layout.tsx).
import "../../feuille.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Porte } from "@/components/console/Porte";

export const metadata: Metadata = { title: "Connexion à SkanFact refusée" };

/* Le retour de « Connecter SkanFact » qu'on ne peut rattacher à aucune
   demande de ce navigateur (src/app/%5Fconsole/skanfact/retour/route.ts) :
   l'état n'est pas le nôtre, il a expiré, la session est fermée, ou le
   membre n'est plus propriétaire ni administrateur. Rien n'a changé. */

const RAISONS: Record<string, { titre: string; texte: string }> = {
  etat: {
    titre: "Cette demande de connexion n'est pas valable",
    texte: "Elle ne vient pas de ce navigateur, elle a déjà servi, ou plus de dix minutes ont passé. Par prudence, rien n'a changé : recommencez depuis la page SkanFact de votre boutique.",
  },
  session: {
    titre: "Votre session est fermée",
    texte: "Reconnectez-vous au backoffice, puis recommencez « Connecter SkanFact » depuis la page SkanFact de votre boutique. Rien n'a changé.",
  },
  role: {
    titre: "Votre rôle ne connecte pas la boutique",
    texte: "Seuls le propriétaire et un administrateur de la boutique la connectent à SkanFact. Rien n'a changé.",
  },
};

export default async function RefusSkanFact({ searchParams }: { searchParams: Promise<{ raison?: string }> }) {
  const { raison } = await searchParams;
  const r = RAISONS[raison ?? ""] ?? RAISONS.etat;
  return (
    <Porte titre={r.titre} description={r.texte}>
      <p className="text-center">
        <Link href="/gestion" className="btn btn-primaire">Revenir au backoffice</Link>
      </p>
    </Porte>
  );
}
