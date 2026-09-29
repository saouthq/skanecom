"""Résume les journaux de `wrangler tail --format json` : Worker, point d'entrée,
adresse ou méthode appelée, issue, exceptions et messages. Les en-têtes des
requêtes ne sont jamais affichés.
Usage : python3 scripts/journaux.py tail-*.json"""
import json
import sys

dec = json.JSONDecoder()
for chemin in sys.argv[1:]:
    texte = open(chemin, encoding="utf-8", errors="replace").read()
    i = 0
    while i < len(texte):
        while i < len(texte) and texte[i].isspace():
            i += 1
        if i >= len(texte):
            break
        try:
            ev, i = dec.raw_decode(texte, i)
        except ValueError:
            break
        e = ev.get("event") or {}
        requete = e.get("request") or {}
        cible = requete.get("url") or e.get("rpcMethod") or ",".join(sorted(e.keys())) or "-"
        statut = (e.get("response") or {}).get("status", "")
        print(f"{ev.get('scriptName')} [{ev.get('entrypoint') or '-'}] {cible} {statut} → {ev.get('outcome')}")
        for x in ev.get("exceptions", []):
            print("    exception :", x.get("name"), "-", str(x.get("message"))[:600])
        for l in ev.get("logs", [])[:20]:
            print("    journal :", l.get("level"), "-", " ".join(map(str, l.get("message", [])))[:600])
