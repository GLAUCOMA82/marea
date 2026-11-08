#!/usr/bin/env python3
# Two fake iPads: one moves a knob and presses a step, the other must see it. Also tests auth and uploads.
import socket, base64, os, json, sys, urllib.request, time
port, token, wav = int(sys.argv[1]), sys.argv[2], sys.argv[3]
def conn(tok=token):
    s = socket.create_connection(('127.0.0.1', port)); key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(f"GET /ws?k={tok} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
    h = b''
    while b'\r\n\r\n' not in h:
        d = s.recv(4096)
        if not d: break
        h += d
    return s, h.split(b'\r\n')[0].decode(), h.split(b'\r\n\r\n',1)[1] if b'\r\n\r\n' in h else b''
def tx(s, text):
    b = text.encode(); m = os.urandom(4); s.sendall(bytes([0x81, 0x80 | len(b)]) + m + bytes(c ^ m[i % 4] for i, c in enumerate(b)))
class Rx:
    def __init__(s, sock, rest): s.sock, s.buf = sock, rest
    def next(s):
        while True:
            if len(s.buf) >= 2:
                n = s.buf[1] & 127; h = 2
                if n == 126 and len(s.buf) >= 4: n = int.from_bytes(s.buf[2:4], 'big'); h = 4
                elif n == 127 and len(s.buf) >= 10: n = int.from_bytes(s.buf[2:10], 'big'); h = 10
                if len(s.buf) >= h + n and n < 126 or (len(s.buf) >= h + n and h > 2):
                    p = s.buf[h:h+n]; s.buf = s.buf[h+n:]; return json.loads(p)
            s.buf += s.sock.recv(65536)
print('wrong code ->', conn('000')[1])
a, st, ra = conn(); b, _, rb = conn(); print('right code ->', st)
A, B = Rx(a, ra), Rx(b, rb)
ha = A.next(); hb = B.next(); print('hello: params', len(ha['params']), 'pads', [p['name'] for p in ha['pads']], 'url host ok', ha['url'].startswith('http://'))
pid = next(p['i'] for p in ha['params'] if p['k'] == 'ech.feedback')
tx(a, f'p {pid} 0.875'); tx(a, 's 7 2 5 2')
seen_p = seen_s = False; t0 = time.time(); ticks = 0
while time.time() - t0 < 3 and not (seen_p and seen_s):
    m = B.next(); ticks += 1
    if 'p' in m and any(i == pid for i, v in m['p']): seen_p = time.time() - t0
    if 's' in m and any(x[0] == 7 and x[1] == 2 for x in m['s']): seen_s = True
print('other client saw knob after %.0f ms, saw step: %s' % (seen_p * 1000 if seen_p else -1, seen_s))
data = open(wav, 'rb').read()
req = urllib.request.Request(f'http://127.0.0.1:{port}/upload?k={token}&pad=2&name=test%20upload.wav', data=data, method='POST')
print('upload ->', urllib.request.urlopen(req).read().decode())
t0 = time.time(); name = None
while time.time() - t0 < 3:
    m = B.next()
    if 'pads' in m and m['pads'][2]['name'] != 'VOX': name = m['pads'][2]['name']; break
print('pad 3 now:', name)
print('roots:', urllib.request.urlopen(f'http://127.0.0.1:{port}/browse?k={token}').read().decode()[:200])
tx(a, 'builtin 2')
try: urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/upload?k=bad&pad=2&name=x.wav', data=b'xx', method='POST')); print('bad upload ACCEPTED')
except Exception as e: print('bad upload ->', e)
try: urllib.request.urlopen(f'http://127.0.0.1:{port}/browse?k={token}&path=/etc'); print('browse /etc ALLOWED')
except Exception as e: print('browse /etc ->', e)
