// MIC: a live channel so you can talk over the mix. The host pushes input frames into a ring and the
// channel runs them through the same effects as mic recordings, in real time, with an echo send.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include <atomic>
#include <cmath>

class Mic : public Module {
public:
    Param* on; Param* level; Param* echo; Param* fx; Param* mute;
    std::atomic<float> meter{0};

    explicit Mic(ParamTable& t) {
        on = t.add(630, "mic.on", "Mic Open", 0, 2);
        level = t.add(631, "mic.level", "Mic Level", .7f);
        echo = t.add(632, "mic.echo", "Mic Echo", .15f);
        fx = t.add(633, "mic.fx", "Mic Voice", 0, 6);
        mute = t.add(634, "mic.mute", "Mic Mute", 0, 2);
    }
    void prepare(double sampleRate) override {
        sr = (float)sampleRate;
        hp.reset(); radHp.reset(); radLp.reset();
        hp.set(95, .7f, sr); radHp.set(420, .8f, sr); radLp.set(2800, 1.2f, sr);
        for (auto& d : dly) d = 0;
        wp = 0; shift = 0; env = 0;
    }
    // Input side: the audio thread on iPad, the input queue's thread on the Mac.
    void push(const float* in, int n) {
        uint32_t w = w_.load(std::memory_order_relaxed);
        for (int i = 0; i < n; i++) { ring[w % kRing] = in[i]; w++; }
        w_.store(w, std::memory_order_release);
    }
    void render(Bus& b, int n) override {
        using namespace dsp;
        uint32_t r = r_.load(std::memory_order_relaxed), w = w_.load(std::memory_order_acquire);
        // If the input ever runs ahead, jump forward: a late voice is worse than a tiny skip.
        if (w - r > 1536) r = w - 256;
        float want = on->on() && !mute->on() ? 1.f : 0.f;
        if (!on->on()) { r_.store(w, std::memory_order_release); if (env < 1e-4f) { meter.store(0, std::memory_order_relaxed); return; } }
        float lev = level->get(); lev = lev * lev * 2.2f;
        float send = echo->get(), pk = 0;
        int mode = fx->index();
        float fade = tauCoef(.008f, sr);
        for (int i = 0; i < n; i++) {
            float x = 0;
            if (r != w) { x = ring[r % kRing]; r++; }
            hp.tick(x); x = hp.hp;
            pk = std::max(pk, std::fabs(x));
            switch (mode) {
                case 1: radHp.tick(x); radLp.tick(radHp.hp); x = soft(radLp.lp * 5.f) * .75f; break;
                case 2: if (hold-- <= 0) { hold = (int)(sr / 7000); held = std::round(x * 12) / 12; } x = held; break;
                case 3: ring_ += 92.f / sr; if (ring_ >= 1) ring_ -= 1; x = soft(x * std::sin(kTau * ring_) * 2.2f); break;
                case 4: x = pitch(x, 2.f); break;
                case 5: x = pitch(x, .5f); break;
                default: break;
            }
            env = want + (env - want) * fade;
            x = soft(x * lev) * env;
            b.L[i] += x; b.R[i] += x;
            float sx = x * send; b.sendL[i] += sx; b.sendR[i] += sx;
        }
        r_.store(r, std::memory_order_release);
        meter.store(std::max(pk, meter.load(std::memory_order_relaxed) * .9f), std::memory_order_relaxed);
    }
private:
    // Two read heads sliding through a short buffer, crossfaded so the jumps can't be heard.
    inline float pitch(float x, float ratio) {
        static constexpr int kD = 2048;
        dly[wp] = x;
        shift += (1 - ratio) / kD; if (shift >= 1) shift -= 1; if (shift < 0) shift += 1;
        float out = 0;
        for (int k = 0; k < 2; k++) {
            float ph = shift + k * .5f; if (ph >= 1) ph -= 1;
            float d = ph * (kD - 4) + 2, rp = (float)wp - d; if (rp < 0) rp += kD;
            int a = (int)rp, c = (a + 1) % kD; float fr = rp - a;
            out += (dly[a] + (dly[c] - dly[a]) * fr) * std::sin(dsp::kPi * ph);
        }
        wp = (wp + 1) % kD;
        return out * .8f;
    }
    static constexpr int kRing = 16384;
    float ring[kRing] = {0}, dly[2048] = {0};
    std::atomic<uint32_t> w_{0}, r_{0};
    dsp::SVF hp, radHp, radLp;
    float sr = 48000, env = 0, shift = 0, ring_ = 0, held = 0;
    int wp = 0, hold = 0;
};
