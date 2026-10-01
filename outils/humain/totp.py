#!/usr/bin/env python3
# Le code à six chiffres de la double authentification, depuis la clé que
# l'écran affiche (« Pas d'appareil photo ? Saisir la clé ») — ce que ferait
# une application d'authentification. Base locale seulement.
#   python3 outils/humain/totp.py <CLÉ>   → « 123456 <secondes restantes> »
import base64, hmac, hashlib, struct, sys, time
cle = sys.argv[1].replace(" ", "").upper()
k = base64.b32decode(cle + "=" * (-len(cle) % 8))
h = hmac.new(k, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
o = h[-1] & 15
print("%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7fffffff) % 1000000), 30 - int(time.time()) % 30)
