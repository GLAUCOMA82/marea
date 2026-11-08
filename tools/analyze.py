#!/usr/bin/env python3
# Measures the rendered WAVs: peak, loudness, energy over time and dominant frequency.
import wave, sys, os, math, array, glob
d = sys.argv[1]
def load(p):
    w = wave.open(p); n = w.getnframes(); a = array.array('h'); a.frombytes(w.readframes(n)); return [x/32768 for x in a[0::2]], [x/32768 for x in a[1::2]], w.getframerate()
def rms(x): return math.sqrt(sum(v*v for v in x)/max(1,len(x)))
def domfreq(x, sr):
    # zero-crossing estimate on the loudest 100 ms
    win = int(.1*sr); best = 0; bi = 0
    for i in range(0, max(1,len(x)-win), win):
        r = rms(x[i:i+win])
        if r > best: best, bi = r, i
    seg = x[bi:bi+win]; z = sum(1 for a,b in zip(seg,seg[1:]) if a<=0<b)
    return z/(len(seg)/sr) if seg else 0
print(f"{'file':24}{'peak':>7}{'rms':>8}{'stereo':>8}{'~Hz':>8}{'ring s':>8}  energy per slice")
for p in sorted(glob.glob(d+'/*.wav')):
    L,R,sr = load(p)
    pk = max(max(map(abs,L)), max(map(abs,R)))
    slices = 10; step = max(1,len(L)//slices)
    env = [rms(L[i:i+step]) for i in range(0,step*slices,step)]
    last = 0
    for i in range(len(L)-1,0,-int(sr*.01)):
        if abs(L[i])>.001: last=i; break
    sd = math.sqrt(sum((a-b)**2 for a,b in zip(L,R))/len(L))
    bar = ''.join(' .:-=+*#%@'[min(9,int(e*18))] for e in env)
    print(f"{os.path.basename(p)[:-4]:24}{pk:7.3f}{rms(L):8.3f}{sd:8.3f}{domfreq(L,sr):8.0f}{last/sr:8.2f}  {bar}")
