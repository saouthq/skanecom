import { acces } from "@/lib/console/session";
import { modeleCsv } from "@/lib/console/import";
import { vers } from "@/lib/console/http";

export async function GET() {
  if ((await acces()).etat !== "ok") return vers("/connexion");
  // BOM : Excel ouvre alors le fichier en UTF-8 (accents intacts).
  return new Response("﻿" + modeleCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="modele-catalogue-skanecom.csv"',
      "cache-control": "no-store",
    },
  });
}
