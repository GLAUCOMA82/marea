#include "engine.h"
#include <algorithm>
#include <cmath>
#include <mach/mach_time.h>

using namespace dsp;

static const char* kFactory[Engine::kPatterns][Engine::kTracks] = {
    // KICK                SNARE               RIM                 CLAP                HAT                 OPEN                TOM                 BELL
    {"........X.......", "................", "........X.......", "................", "x.x.x.x.x.x.x.x.", "..............x.", "................", "..x.......x....."},  // A
    {"X.......x.......", "................", "....X.......X...", "................", "..x...x...x...x.", "................", "..............x.", "......x.........."},  // B
    {"X...x...x...x...", "................", "....X.......X...", "................", "..x...x...x...x.", "................", "................", "...x......x....."},  // C
    {"X...X...X...X...", "................", "...x..x....x..x.", "....X.......X...", "x.xxx.xxx.xxx.xx", "..x...x...x...x.", "................", "................"},  // D
    {"X..x..x.X..x..x.", "...X..x....X..x.", "................", "................", "x.x.x.x.x.x.x.x.", "................", "................", "x..x..x...x....."},  // E
    {"X.x.......x.....", "....X.......X..x", ".......x.........", "................", "x.xxx.xxx.xxx.x.", "..............x.", "..........x.x...", "................"},  // F
    {"X.....x...X.....", "....X.......X...", "..x.....x.....x.", "............X...", "xxxxxxxxxxxxxxxx", "................", "................", "x.......x......."},  // G
    {"................", "................", "................", "................", "................", "................", "................", "................"},  // H
};
static const char* kNames[Engine::kPatterns] = {"ONE DROP", "ROCKERS", "STEPPERS", "DEEP FOUR", "RIDDIM", "BROKEN", "ACID", "EMPTY"};
// Bass lines in G minor. Token = MIDI note, a = accent, s = slide into the next note, - = rest.
static const char* kBassLines[Engine::kPatterns] = {
    "43 - - 46 - - 43 - - - 41 - 38 - 41 -",
    "43a - - 43 - 50 - - 46 - - 45 - 41 - -",
    "31a - 43 - 31 - 43 - 34 - 46 - 29 - 41 -",
    "31a - 31 43s 31 - 31 - 34 - 34 46s 29 - 38 -",
    "43a - - 43 - - 41 - 43 - - 46 - - 38 -",
    "31a 43s 46 - 31 - 50a 43 - 31 - 41s 43 - 38 -",
    "31a 31 43a 31 34s 46 31 43a 31 31 41a 31 38s 41 31 43a",
    "- - - - - - - - - - - - - - - -",
};
const char* Engine::patternName(int i) { return kNames[i & 7]; }

Engine::Engine() {
    bpm = params.add(600, "seq.bpm", "Tempo", (92 - 60) / 120.f);
    swing = params.add(601, "seq.swing", "Swing", .08f);
    drop = params.add(602, "seq.drop", "Drop", 0, 2);
    volume = params.add(610, "mst.volume", "Volume", .78f);
    sweep = params.add(611, "mst.sweep", "Filter Sweep", .5f);
    drive = params.add(612, "mst.drive", "Drive", .2f);
    vary = params.add(614, "seq.vary", "Vary", 0);
    micFx = params.add(615, "rec.fx", "Mic Effect", 0, 6);
    for (auto& c : chain) c.store(0);
    keysTarget = params.add(613, "key.target", "Keys Target", 0, 3);
    clickOn = params.add(620, "met.on", "Metronome", 0, 2);
    clickLevel = params.add(621, "met.level", "Metronome Level", .55f);
    clockOut = params.add(640, "midi.clock", "MIDI Clock Out", 0, 2);
    modules = {&pulse, &bass, &chop, &siren, &sampler, &mic};
    loadFactoryPatterns();
}

void Engine::loadFactoryPatterns() {
    for (auto& pat : padSteps) for (auto& v : pat) v.store(0);
    for (int p = 0; p < kPatterns; p++)
        for (int t = 0; t < kTracks; t++) {
            uint32_t v = 0;
            const char* s = kFactory[p][t];
            for (int i = 0; i < kSteps && s[i]; i++) {
                if (s[i] == 'x') v |= 1u << i;
                if (s[i] == 'X') v |= (1u << i) | (1u << (i + 16));
            }
            steps[p][t].store(v);
        }
    for (int p = 0; p < kPatterns; p++) {
        const char* s = kBassLines[p];
        for (int st = 0; st < kSteps; st++) {
            while (*s == ' ') s++;
            uint32_t v = 0;
            if (*s == '-') s++;
            else if (*s) {
                int note = 0;
                while (*s >= '0' && *s <= '9') note = note * 10 + (*s++ - '0');
                v = (uint32_t)note | (1u << 8);
                while (*s == 'a' || *s == 's') { v |= *s == 'a' ? (1u << 9) : (1u << 10); s++; }
            }
            bassSteps[p][st].store(v);
            chopSteps[p][st].store(0);
        }
    }
}

void Engine::prepare(double sampleRate, int maxFrames) {
    sr = sampleRate;
    maxF = maxFrames;
    L.assign(maxF, 0); R.assign(maxF, 0); sL.assign(maxF, 0); sR.assign(maxF, 0);
    for (auto* m : modules) m->prepare(sr);
    echo.prepare(sr);
    reset();
}

void Engine::reset() {
    sweepL.reset(); sweepR.reset();
    limGain = 1; dcL = dcR = 0;
    wasActive = false;
}

void Engine::togglePlay() {
    bool hostPlaying = hostPlayingNow.load();
    if (hostPlaying) {
        // While Live plays, this button connects or disconnects the drums from Live's clock.
        bool on = active.load();
        followHost = !on;
        localRun = false;
    } else {
        localRun = !localRun.load();
        followHost = true;
    }
}
void Engine::selectPattern(int p) {
    if (p < 0 || p >= kPatterns) return;
    if (active.load()) queued = p; else { pattern = p; queued = -1; }
}
void Engine::clearPattern(int p) {
    for (int t = 0; t < kTracks; t++) steps[p & 7][t] = 0;
    for (int st = 0; st < kSteps; st++) { bassSteps[p & 7][st] = 0; chopSteps[p & 7][st] = 0; }
    for (int i = 0; i < Sampler::kPads; i++) padSteps[p & 7][i] = 0;
}
void Engine::copyPattern(int src, int dst) {
    if (src < 0 || src >= kPatterns || dst < 0 || dst >= kPatterns || src == dst) return;
    for (int t = 0; t < kTracks; t++) steps[dst][t].store(steps[src][t].load());
    for (int st = 0; st < kSteps; st++) { bassSteps[dst][st].store(bassSteps[src][st].load()); chopSteps[dst][st].store(chopSteps[src][st].load()); }
    for (int i = 0; i < Sampler::kPads; i++) padSteps[dst][i].store(padSteps[src][i].load());
}

void Engine::midiEvent(int status, int d1, int d2, int offset) {
    int type = status & 0xF0;
    bool on = type == 0x90 && d2 > 0, off = type == 0x80 || (type == 0x90 && d2 == 0);
    if (!on && !off) return;
    float vel = d2 / 127.f;
    // Channel 2 always plays the bass and channel 3 the chop slices. Otherwise KEYS decides.
    int channel = status & 0x0F, target = keysTarget->index();
    if (channel == 1) target = 1;
    if (channel == 2) target = 2;
    if (target == 1) {
        fromMidi.push({on ? Cmd::Hit : Cmd::Release, 2, (uint8_t)d1, vel, offset});
        return;
    }
    if (target == 2) {
        if (on && d1 >= 36) fromMidi.push({Cmd::Hit, 3, (uint8_t)(d1 - 36), vel, offset});
        return;
    }
    static const int drumNotes[kTracks] = {36, 38, 37, 39, 42, 46, 41, 56};
    for (int i = 0; i < kTracks; i++) if (d1 == drumNotes[i]) { if (on) fromMidi.push({Cmd::Hit, 0, (uint8_t)i, vel, offset}); return; }
    if (d1 >= 48 && d1 < 60) { fromMidi.push({on ? Cmd::Hit : Cmd::Release, 1, (uint8_t)(d1 - 48), vel, offset}); return; }
    if (d1 >= 84 && d1 < 96) { fromMidi.push({on ? Cmd::Hit : Cmd::Release, 1, (uint8_t)(d1 - 84 + 12), vel, offset}); return; }
    switch (d1) {
        case 60: siren.fire->set(on ? 1 : 0); return;
        case 61: echo.throw_->set(on ? 1 : 0); return;
        case 62: echo.hold->set(on ? 1 : 0); return;
        case 63: echo.crash->set(on ? 1 : 0); return;
        case 64: drop->set(on ? 1 : 0); return;
    }
    if (on && d1 >= 72 && d1 < 72 + kPatterns) selectPattern(d1 - 72);
}

void Engine::applyCmd(const Cmd& c) {
    if (c.module == 9) { clickEnv = 1; clickPh = 0; clickHz = c.index ? 1760.f : 1100.f; return; }
    if (c.kind == Cmd::Hit && c.module == 2 && c.hold != -1) { bass.noteOn(c.index, c.vel, c.flags, c.hold); return; }
    Module* m = moduleForIndex(c.module);
    if (c.kind == Cmd::Hit) m->hit(c.index, c.vel); else m->release(c.index);
}

void Engine::scheduleSteps(double beat0, double beat1, double beatsPerFrame, int frames) {
    double sw = swing->get() * .6;  // 0 = straight, full = heavy shuffle
    long first = (long)std::floor(beat0 * 4) - 1, last = (long)std::floor(beat1 * 4);
    bool dropped = drop->on();
    for (long n = first; n <= last; n++) {
        double t = n * .25 + ((n & 1) ? sw * .25 : 0);
        if (t < beat0 || t >= beat1) continue;
        int pos = (int)(((n % kSteps) + kSteps) % kSteps);
        int frame = std::clamp((int)((t - beat0) / beatsPerFrame), 0, frames - 1);
        if (pos == 0) {
            int q = queued.exchange(-1);
            if (q >= 0) pattern = q;
            else if (chainOn.load(std::memory_order_relaxed)) {
                int len = chainLen.load(std::memory_order_relaxed);
                if (len > 0) {
                    int at = chainPos.load(std::memory_order_relaxed) % len;
                    pattern = chain[at].load(std::memory_order_relaxed);
                    chainNow.store(at, std::memory_order_relaxed);
                    chainPos.store((at + 1) % len, std::memory_order_relaxed);
                }
            }
        }
        if (clickOn->on() && pos % 4 == 0 && pendingN < 512) pendingBuf[pendingN++] = {Cmd::Hit, 9, (uint8_t)(pos == 0), 1, frame};
        float vr = vary->get();
        uint32_t mut = 0;
        curStep.store(pos, std::memory_order_relaxed);
        int pat = pattern.load(std::memory_order_relaxed);
        for (int tr = 0; tr < kTracks; tr++) {
            uint32_t v = steps[pat][tr].load(std::memory_order_relaxed);
            bool isOn = v & (1u << pos);
            float ghost = 0;
            if (vr > 0) {
                // The downbeat kick anchors the bar, so it never moves.
                if (isOn && !(tr == 0 && pos == 0)) { if (rnd() < vr * .7f) { isOn = false; mut |= 1u << tr; } }
                else if (!isOn && rnd() < vr * .3f) { isOn = true; ghost = .5f; mut |= 1u << tr; }
            }
            if (!isOn) continue;
            // DROP takes out everything except the hats, the classic dub breakdown.
            if (dropped && tr != Pulse::HAT && tr != Pulse::OPEN) continue;
            float vel = ghost > 0 ? ghost : (v & (1u << (pos + 16))) ? 1.0f : .72f;
            if (pendingN < 512) pendingBuf[pendingN++] = {Cmd::Hit, 0, (uint8_t)tr, vel, frame};
        }
        if (!dropped) {
            uint32_t bs = bassSteps[pat][pos].load(std::memory_order_relaxed);
            uint32_t prev = bassSteps[pat][(pos + kSteps - 1) % kSteps].load(std::memory_order_relaxed);
            // A step inside a held note stays quiet, so the randomizer doesn't cut it short.
            bool covered = false;
            if (!(bs & (1u << 8)))
                for (int b = 1; b < kSteps; b++) {
                    uint32_t pv = bassSteps[pat][(pos + kSteps - b) % kSteps].load(std::memory_order_relaxed);
                    if (pv & (1u << 8)) { covered = 1 + (int)((pv >> 11) & 15u) > b; break; }
                }
            if (vr > 0 && !covered && rnd() < vr) {
                static const int moves[6] = {12, -12, 7, -5, 3, -2};
                if (bs & (1u << 8)) {
                    int note = std::clamp((int)(bs & 0xFF) + moves[(int)(rnd() * 5.99f)], 12, 96);
                    bs = (bs & ~0xFFu) | (uint32_t)note;
                } else if (prev & (1u << 8)) {
                    bs = (prev & 0xFFu) | (1u << 8);
                }
                mut |= 1u << 8;
            }
            if (bs & (1u << 8)) {
                uint8_t flags = 0;
                if ((prev & (1u << 8)) && (prev & (1u << 10))) flags |= 1;
                if (bs & (1u << 9)) flags |= 2;
                // Bits 11-14 hold the length in steps minus one. A slide holds the note into the next step;
                // a one-step note without slide is a short, punchy gate.
                int stepFrames = (int)(.25 / beatsPerFrame);
                int len = 1 + (int)((bs >> 11) & 15u);
                int hold = (bs & (1u << 10)) ? stepFrames * (len + 1) : len > 1 ? (int)(stepFrames * (len - .1f)) : (int)(stepFrames * .62);
                Cmd c{Cmd::Hit, 2, (uint8_t)(bs & 0xFF), (bs & (1u << 9)) ? 1.0f : .8f, frame};
                c.flags = flags; c.hold = hold;
                if (pendingN < 512) pendingBuf[pendingN++] = c;
            }
            uint32_t cs = chopSteps[pat][pos].load(std::memory_order_relaxed);
            if (vr > 0 && cs > 0 && rnd() < vr) {
                if (ChopData* cd = chop.get()) if (!cd->starts.empty()) cs = 1 + (uint32_t)(rnd() * .999f * cd->starts.size());
                mut |= 1u << 9;
            }
            if (cs > 0 && pendingN < 512) pendingBuf[pendingN++] = {Cmd::Hit, 3, (uint8_t)(cs - 1), .9f, frame};
            for (int i = 0; i < Sampler::kPads; i++) {
                uint32_t ps = padSteps[pat][i].load(std::memory_order_relaxed);
                if ((ps & (1u << pos)) && pendingN < 512) pendingBuf[pendingN++] = {Cmd::Hit, 1, (uint8_t)i, (ps & (1u << (pos + 16))) ? 1.0f : .75f, frame};
            }
        }
        mutMask.store(mut, std::memory_order_relaxed);
    }
}

void Engine::scheduleClock(double beat0, double beat1, double beatsPerFrame, uint64_t base, bool run) {
    bool on = clockOut->on();
    if (!run || !on) {
        if (clockStarted) { midiOut.push({0xFC, base}); clockStarted = false; }
        return;
    }
    static const double ticksPerSec = [] { mach_timebase_info_data_t tb; mach_timebase_info(&tb); return 1e9 * tb.denom / tb.numer; }();
    double lead = clockDelaySec.load(std::memory_order_relaxed);
    for (long n = (long)std::ceil(beat0 * 24); n / 24.0 < beat1; n++) {
        double frame = (n / 24.0 - beat0) / beatsPerFrame;
        uint64_t when = base + (uint64_t)((frame / sr + lead) * ticksPerSec);
        // Gear starts on a bar line, so turning the clock on mid-song waits for the next one.
        if (!clockStarted && n % 96 == 0) { midiOut.push({0xFA, when}); clockStarted = true; }
        midiOut.push({0xF8, when});
    }
}

void Engine::render(float* outL, float* outR, int frames, const Transport& t) {
    frames = std::min(frames, maxF);
    double tempo = t.hostBpm > 0 ? t.hostBpm : 60.0 + bpm->get() * 120.0;
    bpmNow.store(tempo, std::memory_order_relaxed);
    echo.setTempo(tempo);
    chop.tempo.store(tempo, std::memory_order_relaxed);
    bass.tempo.store(tempo, std::memory_order_relaxed);
    hostPlayingNow.store(t.hostPlaying, std::memory_order_relaxed);
    hostPresentNow.store(t.hostPresent, std::memory_order_relaxed);
    if (!t.hostPlaying && !localRun.load(std::memory_order_relaxed)) followHost.store(true, std::memory_order_relaxed);

    bool linked = t.hostPlaying && followHost.load(std::memory_order_relaxed);
    bool run = linked || localRun.load(std::memory_order_relaxed);
    active.store(run, std::memory_order_relaxed);

    double bpf = tempo / 60.0 / sr;
    pendingN = 0;
    Cmd c;
    while (fromTouch.pop(c)) if (pendingN < 512) { c.frame = 0; pendingBuf[pendingN++] = c; }
    while (fromUI.pop(c)) if (pendingN < 512) { c.frame = 0; pendingBuf[pendingN++] = c; }
    while (fromMidi.pop(c)) if (pendingN < 512) { c.frame = std::clamp(c.frame, 0, frames - 1); pendingBuf[pendingN++] = c; }

    if (run) {
        if (!wasActive && !linked) localBeat = 0;
        if (!wasActive) chainPos.store(0, std::memory_order_relaxed);
        double b0 = linked ? t.hostBeat : localBeat;
        scheduleSteps(b0, b0 + frames * bpf, bpf, frames);
        scheduleClock(b0, b0 + frames * bpf, bpf, t.hostTime ? t.hostTime : mach_absolute_time(), true);
        if (linked) localBeat = t.hostBeat + frames * bpf; else localBeat += frames * bpf;
    } else {
        scheduleClock(0, 0, bpf, t.hostTime ? t.hostTime : mach_absolute_time(), false);
        curStep.store(-1, std::memory_order_relaxed);
        int q = queued.exchange(-1);
        if (q >= 0) pattern = q;
    }
    wasActive = run;

    std::stable_sort(pendingBuf, pendingBuf + pendingN, [](const Cmd& a, const Cmd& b) { return a.frame < b.frame; });

    int pos = 0, ev = 0;
    while (pos < frames) {
        while (ev < pendingN && pendingBuf[ev].frame <= pos) applyCmd(pendingBuf[ev++]);
        int n = std::min(32, frames - pos);
        if (ev < pendingN) n = std::min(n, pendingBuf[ev].frame - pos);
        renderChunk(pos, n, outL, outR);
        pos += n;
    }
    while (ev < pendingN) applyCmd(pendingBuf[ev++]);
}

void Engine::renderChunk(int offset, int n, float* outL, float* outR) {
    std::memset(L.data(), 0, n * sizeof(float)); std::memset(R.data(), 0, n * sizeof(float));
    std::memset(sL.data(), 0, n * sizeof(float)); std::memset(sR.data(), 0, n * sizeof(float));
    Bus bus{L.data(), R.data(), sL.data(), sR.data()};
    for (auto* m : modules) m->render(bus, n);

    // THROW opens the echo send for everything that's playing.
    float th = echo.throwAmount(n);
    if (th > .001f) for (int i = 0; i < n; i++) { sL[i] += L[i] * th; sR[i] += R[i] * th; }
    echo.render(bus, n);

    // Master: one-knob filter, drive, limiter.
    float vol = volS.step(volume->get(), .2f); vol = vol * vol * 1.5f;
    float drv = driveS.step(drive->get(), .2f);
    float dGain = 1 + drv * 5;
    float dNorm = 1.f / (1 + drv * 1.6f);
    float sw = sweepS += (sweep->get() - sweepS) * .2f;
    bool lpOn = sw < .48f, hpOn = sw > .52f;
    if (lpOn) { float fc = expMap(sw / .48f, 140, 20000); sweepL.set(fc, 1.3f, (float)sr); sweepR.set(fc, 1.3f, (float)sr); }
    else if (hpOn) { float fc = expMap((sw - .52f) / .48f, 20, 5200); sweepL.set(fc, 1.3f, (float)sr); sweepR.set(fc, 1.3f, (float)sr); }
    float peakL = 0, peakR = 0;
    const float clickDecay = tauCoef(.012f, (float)sr);
    const float attack = .05f, release = .9998f;
    int w = scopeW.load(std::memory_order_relaxed);
    for (int i = 0; i < n; i++) {
        float l = L[i], r = R[i];
        if (lpOn) { sweepL.tick(l); sweepR.tick(r); l = sweepL.lp; r = sweepR.lp; }
        else if (hpOn) { sweepL.tick(l); sweepR.tick(r); l = sweepL.hp; r = sweepR.hp; }
        l = soft(l * dGain) * dNorm * vol; r = soft(r * dGain) * dNorm * vol;
        dcL += (l - dcL) * .0005f; dcR += (r - dcR) * .0005f;
        l -= dcL; r -= dcR;
        float a = std::max(std::fabs(l), std::fabs(r));
        float want = a > .92f ? .92f / a : 1.f;
        limGain = want < limGain ? limGain + (want - limGain) * attack : 1 - (1 - limGain) * release;
        l = soft(l * limGain * 1.02f); r = soft(r * limGain * 1.02f);
        if (!std::isfinite(l) || !std::isfinite(r)) { l = r = 0; }
        outL[offset + i] = l; outR[offset + i] = r;
        peakL = std::max(peakL, std::fabs(l)); peakR = std::max(peakR, std::fabs(r));
        if (recOutput.load(std::memory_order_relaxed)) {
            int rn = recCount.load(std::memory_order_relaxed);
            if (rn < recCap) { recL[rn] = l; recR[rn] = r; recCount.store(rn + 1, std::memory_order_relaxed); }
        }
        if (takeOn.load(std::memory_order_relaxed) && !takeRing.empty()) {
            uint32_t tw = takeW.load(std::memory_order_relaxed), cap = (uint32_t)takeRing.size();
            if (tw - takeR.load(std::memory_order_acquire) + 2 <= cap) {
                takeRing[tw % cap] = l; takeRing[(tw + 1) % cap] = r;
                takeW.store(tw + 2, std::memory_order_release);
            }
        }
        if (++scopeDecim >= 4) { scopeDecim = 0; scope[w] = (l + r) * .5f; w = (w + 1) % kScope; }
        // The metronome joins after the recording taps, so it never ends up in a take.
        if (clickEnv > 1e-4f) {
            clickPh += clickHz / (float)sr; if (clickPh >= 1) clickPh -= 1;
            float cl = clickLevel->get(), x = std::sin(kTau * clickPh) * clickEnv * cl * cl * .9f;
            clickEnv *= clickDecay;
            outL[offset + i] += x; outR[offset + i] += x;
        }
    }
    scopeW.store(w, std::memory_order_relaxed);
    levelL.store(std::max(peakL, levelL.load(std::memory_order_relaxed) * .985f), std::memory_order_relaxed);
    levelR.store(std::max(peakR, levelR.load(std::memory_order_relaxed) * .985f), std::memory_order_relaxed);
}
