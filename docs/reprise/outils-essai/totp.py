import base64, hmac, hashlib, struct, sys, time
s = sys.argv[1].strip().upper(); s += "=" * (-len(s) % 8)
k = base64.b32decode(s); c = struct.pack(">Q", int(time.time()) // 30)
h = hmac.new(k, c, hashlib.sha1).digest(); o = h[-1] & 15
print(str((struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000).zfill(6))
