// SAMPLER: twenty-four one-shot pads, plus a private slot for previewing files from the library. The built-in sounds are computed from scratch on start-up, so they
// are entirely original; any audio file can be loaded onto a pad from disk or the iPad.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include <atomic>
#include <cmath>
#include <memory>
#include <string>
#include <vector>

struct SampleBuf {
    std::vector<float> L, R;
    double sr = 48000;
    std::string name, path;  // path empty for a built-in sound
    std::vector<int8_t> overview;
};

class Sampler : public Module {
public:
    static constexpr int kPads = 24, kBuiltins = 6;
    struct Pad { Param* pitch; Param* decay; Param* level; Param* echo; Param* rev; };
    Pad pad[kPads];
    std::atomic<float> activity[kPads];
    Param* master; Param* mute;

    explicit Sampler(ParamTable& t) {
        master = t.add(470, "smp.master", "Pads Level", .75f);
        mute = t.add(471, "smp.mute", "Pads Mute", 0, 2);
        static const float echoDef[kBuiltins] = {.45f, .3f, .55f, .1f, .35f, .5f};
        for (int i = 0; i < kPads; i++) {
            std::string k = "smp." + std::to_string(i + 1) + ".", n = "Pad " + std::to_string(i + 1) + " ";
            // The first six keep their ids so old songs and Live sets still load.
            int base = i < kBuiltins ? 400 + i * 10 : 1000 + (i - kBuiltins) * 10;
            pad[i].pitch = t.add(base, k + "pitch", n + "Pitch", .5f);
            pad[i].decay = t.add(base + 1, k + "decay", n + "Length", 1);
            pad[i].level = t.add(base + 2, k + "level", n + "Level", .7f);
            pad[i].echo = t.add(base + 3, k + "echo", n + "Echo", i < kBuiltins ? echoDef[i] : .1f);
            pad[i].rev = t.add(base + 4, k + "rev", n + "Reverse", 0, 2);
            activity[i] = 0;
            current[i] = nullptr;
        }
        previewBuf = nullptr;
    }
    std::atomic<SampleBuf*> previewBuf;
    std::atomic<bool> previewGo{false};
    void prepare(double sampleRate) override { sr = (float)sampleRate; for (auto& v : voice) v = Voice{}; pv = Voice{}; }
    void install(int i, SampleBuf* b) { current[i].store(b, std::memory_order_release); }
    SampleBuf* get(int i) const { return current[i].load(std::memory_order_acquire); }

    void hit(int i, float vel) override {
        if (i < 0 || i >= kPads || mute->on()) return;
        Voice& v = voice[i];
        v.active = true; v.vel = vel; v.pos = -1; v.env = 0; v.fading = false; v.age = 0;
        activity[i].store(vel, std::memory_order_relaxed);
    }
    void release(int /*i*/) override {}  // one-shots ring out; Length controls the cut
    void render(Bus& bus, int n) override {
        using namespace dsp;
        if (previewGo.exchange(false, std::memory_order_relaxed)) { pv.active = true; pv.pos = 0; }
        if (pv.active) {
            SampleBuf* b = previewBuf.load(std::memory_order_acquire);
            double len = b ? (double)b->L.size() - 2 : 0, rate = b ? b->sr / sr : 1;
            for (int s = 0; s < n; s++) {
                if (!b || pv.pos >= len) { pv.active = false; break; }
                int ip = (int)pv.pos; float fr = (float)(pv.pos - ip);
                bus.L[s] += lerp(b->L[ip], b->L[ip + 1], fr) * .8f; bus.R[s] += lerp(b->R[ip], b->R[ip + 1], fr) * .8f;
                pv.pos += rate;
            }
        }
        for (int i = 0; i < kPads; i++) {
            Voice& v = voice[i];
            activity[i].store(activity[i].load(std::memory_order_relaxed) * 0.95f, std::memory_order_relaxed);
            if (!v.active) continue;
            SampleBuf* b = get(i);
            if (!b || b->L.empty()) { v.active = false; continue; }
            bool rev = pad[i].rev->on();
            double len = (double)b->L.size() - 2;
            double rate = std::pow(2.0, (pad[i].pitch->get() - .5f) * 48.0 / 12.0) * b->sr / sr;
            if (v.pos < 0) v.pos = rev ? len : 0;
            float dec = pad[i].decay->get();
            // Length knob: at maximum the whole sample plays, below that it fades out early.
            double stopAfter = dec >= .99f ? 1e12 : expMap(dec, .03f, 6.f) * sr;
            float lev = pad[i].level->get(); lev = lev * lev * 1.3f * v.vel * master->get() / .75f;
            float send = pad[i].echo->get();
            float fade = tauCoef(.012f, sr), attack = tauCoef(.0008f, sr);
            for (int s = 0; s < n; s++) {
                if (v.pos < 0 || v.pos >= len) { v.active = false; break; }
                int ip = (int)v.pos; float fr = (float)(v.pos - ip);
                float l = lerp(b->L[ip], b->L[ip + 1], fr), r = lerp(b->R[ip], b->R[ip + 1], fr);
                v.age += 1;
                if (v.age > stopAfter) v.fading = true;
                v.env = v.fading ? v.env * fade : 1 - (1 - v.env) * attack;
                if (v.fading && v.env < 1e-4f) { v.active = false; break; }
                l *= v.env * lev; r *= v.env * lev;
                bus.L[s] += l; bus.R[s] += r;
                bus.sendL[s] += l * send; bus.sendR[s] += r * send;
                v.pos += rev ? -rate : rate;
            }
        }
    }

    // ---- Original built-in sounds, generated once at 48 kHz (not on the audio thread) ----
    static std::unique_ptr<SampleBuf> makeBuiltin(int i) {
        auto b = std::make_unique<SampleBuf>();
        b->sr = 48000;
        const float sr = 48000;
        using namespace dsp;
        Noise noise;
        auto alloc = [&](float secs) { b->L.assign((size_t)(secs * sr), 0); };
        static const char* names[kBuiltins] = {"STAB", "HORN", "VOX", "BOOM", "SHOT", "ZAP"};
        b->name = names[i];
        switch (i) {
            case 0: {  // STAB: minor chord, filter snapping shut
                alloc(1.1f);
                const float freqs[] = {196.0f, 233.08f, 293.66f, 392.0f};
                float ph[8] = {0}; SVF f;
                for (size_t n = 0; n < b->L.size(); n++) {
                    float t = n / sr, s = 0;
                    for (int k = 0; k < 4; k++) for (int d = 0; d < 2; d++) {
                        float& p = ph[k * 2 + d];
                        p += freqs[k] * (d ? 1.004f : .996f) / sr; if (p >= 1) p -= 1;
                        s += 2 * p - 1;
                    }
                    f.set(300 + 5200 * std::exp(-t / .09f), 1.6f, sr); f.tick(s * .18f);
                    b->L[n] = soft(f.lp * 1.6f) * std::exp(-t / .3f) * std::min(1.f, t * 900);
                }
                break;
            }
            case 1: {  // HORN: swelling brass-like stack with a little vibrato
                alloc(1.5f);
                float ph[3] = {0}; SVF f;
                for (size_t n = 0; n < b->L.size(); n++) {
                    float t = n / sr;
                    float vib = 1 + .007f * std::sin(kTau * 5.3f * t) * std::min(1.f, t * 2);
                    float scoop = 1 - .05f * std::exp(-t / .05f);
                    float s = 0, fr[] = {233.08f, 293.66f, 349.23f};
                    for (int k = 0; k < 3; k++) { ph[k] += fr[k] * vib * scoop / sr; if (ph[k] >= 1) ph[k] -= 1; s += 2 * ph[k] - 1; }
                    float e = std::min(1.f, t / .05f) * (t > 1.1f ? std::max(0.f, 1 - (t - 1.1f) / .4f) : 1);
                    f.set(900 + 2600 * e * (0.7f + .3f * std::sin(kTau * 5.3f * t)), 1.1f, sr); f.tick(s * .3f);
                    b->L[n] = soft(f.lp * 1.8f) * e * .9f;
                }
                break;
            }
            case 2: {  // VOX: synthetic "ah" built from a pulse and three formants, not a recording
                alloc(.9f);
                SVF f1, f2, f3; float ph = 0;
                f1.set(760, 7, sr); f2.set(1180, 9, sr); f3.set(2600, 10, sr);
                for (size_t n = 0; n < b->L.size(); n++) {
                    float t = n / sr;
                    float pitch = 190 * (1 + .12f * std::exp(-t / .08f)) * (1 - .1f * t) * (1 + .006f * std::sin(kTau * 6 * t));
                    ph += pitch / sr; if (ph >= 1) ph -= 1;
                    float src = (ph < .12f ? std::sin(kPi * ph / .12f) : 0) + noise.next() * .02f;
                    f1.tick(src); f2.tick(src); f3.tick(src);
                    float e = std::min(1.f, t / .02f) * std::exp(-t / .42f);
                    b->L[n] = soft((f1.bp + f2.bp * .6f + f3.bp * .3f) * 2.6f) * e;
                }
                break;
            }
            case 3: {  // BOOM: sub drop
                alloc(1.9f);
                float ph = 0;
                for (size_t n = 0; n < b->L.size(); n++) {
                    float t = n / sr, f = 34 + 150 * std::exp(-t / .08f);
                    ph += f / sr; if (ph >= 1) ph -= 1;
                    b->L[n] = soft(std::sin(kTau * ph) * 2.2f) * std::exp(-t / .55f) * .95f;
                }
                break;
            }
            case 4: {  // SHOT: noise crack with a dark tail
                alloc(1.0f);
                SVF f;
                for (size_t n = 0; n < b->L.size(); n++) {
                    float t = n / sr;
                    f.set(600 + 8000 * std::exp(-t / .025f), .8f, sr); f.tick(noise.next());
                    b->L[n] = soft((f.lp * std::exp(-t / .13f) + noise.next() * std::exp(-t / .004f)) * 2.1f);
                }
                break;
            }
            default: {  // ZAP: falling FM laser
                alloc(.7f);
                float ph = 0, mod = 0;
                for (size_t n = 0; n < b->L.size(); n++) {
                    float t = n / sr, f = 90 + 2800 * std::exp(-t / .06f);
                    mod += f * 1.51f / sr; if (mod >= 1) mod -= 1;
                    ph += (f + std::sin(kTau * mod) * f * 1.2f * std::exp(-t / .15f)) / sr;
                    ph -= std::floor(ph);
                    b->L[n] = std::sin(kTau * ph) * std::exp(-t / .16f) * .85f;
                }
                break;
            }
        }
        b->R = b->L;
        buildOverview(*b);
        return b;
    }
    static void buildOverview(SampleBuf& b) {
        const int N = 96;
        b.overview.assign(N, 0);
        size_t len = b.L.size();
        if (!len) return;
        float peak = 1e-5f;
        std::vector<float> v(N, 0);
        for (int i = 0; i < N; i++) {
            size_t a = len * i / N, z = std::max(a + 1, len * (i + 1) / N);
            for (size_t n = a; n < z && n < len; n++) v[i] = std::max(v[i], std::fabs(b.L[n]));
            peak = std::max(peak, v[i]);
        }
        for (int i = 0; i < N; i++) b.overview[i] = (int8_t)std::min(99.f, v[i] / peak * 99.f);
    }
private:
    struct Voice { bool active = false, fading = false; double pos = -1; double age = 0; float vel = 1, env = 0; };
    Voice voice[kPads], pv;
    std::atomic<SampleBuf*> current[kPads];
    float sr = 48000;
};
