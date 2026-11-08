#!/usr/bin/env python3
# Watches a running Marea for a while and prints transport state and output level. Restores volume afterwards.
import sys, time, importlib.util, socket, base64, os, json
port, token, secs = int(sys.argv[1]), sys.argv[2], float(sys.argv[3])
s = socket.create_connection(('127.0.0.1', port)); key = base64.b64encode(os.urandom(16)).decode()
s.sendall(f"GET /ws?k={token} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
buf = b''
while b'\r\n\r\n' not in buf: buf += s.recv(4096)
buf = buf.split(b'\r\n\r\n', 1)[1]
def tx(text):
    b = text.encode(); m = os.urandom(4); s.sendall(bytes([0x81, 0x80 | len(b)]) + m + bytes(c ^ m[i % 4] for i, c in enumerate(b)))
def rx():
    global buf
    while True:
        if len(buf) >= 2:
            n = buf[1] & 127; h = 2
            if n == 126 and len(buf) >= 4: n = int.from_bytes(buf[2:4], 'big'); h = 4
            elif n == 127 and len(buf) >= 10: n = int.from_bytes(buf[2:10], 'big'); h = 10
            if n < 126 or h > 2:
                if len(buf) >= h + n:
                    p = buf[h:h+n]; buf = buf[h+n:]; return json.loads(p)
        buf += s.recv(65536)
hello = rx()
P = {p['k']: p for p in hello['params']}
vol = P['mst.volume']
tx(f"p {vol['i']} 0.06")
t0 = time.time(); last = None; maxlvl = 0; steps = []
while time.time() - t0 < secs:
    m = rx()
    if 't' not in m: continue
    for i, v in m.get('p', []):
        k = next((a for a, b in P.items() if b['i'] == i), i)
        if k != 'mst.volume': print(f"{time.time()-t0:5.1f}s param {k} = {v}", flush=True)
    t = m['t']; st = (t[3], t[10], round(t[4], 1))
    maxlvl = max(maxlvl, t[5], t[6])
    if t[0] != (steps[-1] if steps else None): steps.append(t[0])
    if st != last: print(f"{time.time()-t0:5.1f}s run={t[3]} hostPresent={t[10]} bpm={t[4]:.1f}", flush=True); last = st
print('steps seen:', steps[:40], flush=True)
print('peak output at low volume: %.5f' % maxlvl, flush=True)
tx(f"p {vol['i']} {vol['v']}")
time.sleep(.2)
