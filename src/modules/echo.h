// ECHO: a tape-style delay plus a spring-like reverb. Everything sent by the other modules lands here.
// Turning TIME bends the pitch of what's already in the delay, because the read head glides.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include <atomic>
#include <vector>

class Echo : public Module {
public:
    Param* time; Param* sync; Param* feedback; Param* tone; Param* wobble; Param* spring; Param* ret; Param* throw_; Param* hold; Param* crash;
    std::atomic<float> meter{0};
    std::atomic<double> delaySeconds{0.25};

    explicit Echo(ParamTable& t) {
        time = t.add(500, "ech.time", "Echo Time", .6f);
        sync = t.add(501, "ech.sync", "Echo Sync", 1, 2);
        feedback = t.add(502, "ech.feedback", "Echo Feedback", .5f);
        tone = t.add(503, "ech.tone", "Echo Tone", .45f);
        wobble = t.add(504, "ech.wobble", "Echo Wobble", .28f);
        spring = t.add(505, "ech.spring", "Spring Amount", .22f);
        ret = t.add(506, "ech.return", "Echo Return", .7f);
        throw_ = t.add(507, "ech.throw", "Echo Throw", 0, 2);
        hold = t.add(508, "ech.hold", "Echo Hold", 0, 2);
        crash = t.add(509, "ech.crash", "Spring Crash", 0, 2);
    }
    void setTempo(double bpm) { tempo = bpm; }
    void prepare(double sampleRate) override {
        sr = (float)sampleRate;
        size = (int)(sr * 4.2f);
        bufL.assign(size, 0); bufR.assign(size, 0);
        wp = 0; delay = sr * .25f; wow = flut = 0;
        lpL.reset(); lpR.reset(); hpL.reset(); hpR.reset();
        springInit();
        crashEnv = 0; crashHeld = false; thr.v = 0;
    }
    float throwAmount(int n) { (void)n; return thr.step(throw_->on() ? 1.f : 0.f, .25f); }
    void render(Bus& b, int n) override {
        using namespace dsp;
        // Sync positions: 1/16, 1/8, dotted 1/8, 1/4, dotted 1/4, 1/2
        static const float beats[6] = {.25f, .5f, .75f, 1.f, 1.5f, 2.f};
        float targetSec;
        if (sync->on()) {
            int idx = (int)(time->get() * 5.999f);
            targetSec = beats[idx] * 60.f / (float)tempo;
        } else {
            targetSec = expMap(time->get(), .03f, 1.8f);
        }
        targetSec = std::min(targetSec, 4.0f);
        delaySeconds.store(targetSec, std::memory_order_relaxed);
        float target = targetSec * sr;
        bool holding = hold->on();
        float fbAmt = holding ? 1.0f : feedback->get() * 1.12f;
        float tn = tone->get();
        lpL.set(expMap(tn, 900, 11000), .6f, sr); lpR = withCoef(lpR, lpL);
        hpL.set(expMap(tn, 50, 420), .6f, sr); hpR = withCoef(hpR, hpL);
        float wob = wobble->get();
        float wowInc = .55f / sr, flutInc = 6.1f / sr;
        float glide = 1 - tauCoef(.09f, sr);
        float wetAmt = ret->get(); wetAmt = wetAmt * wetAmt * 1.3f;
        float spr = spring->get(); spr = spr * spr * 1.1f;
        bool c = crash->on();
        if (c && !crashHeld) crashEnv = 1;
        crashHeld = c;
        float crashC = tauCoef(.04f, sr);
        float pk = 0;
        for (int s = 0; s < n; s++) {
            delay += (target - delay) * glide;
            wow += wowInc; if (wow >= 1) wow -= 1;
            flut += flutInc; if (flut >= 1) flut -= 1;
            float mod = (std::sin(kTau * wow) * .0042f + std::sin(kTau * flut) * .0009f) * wob * sr;
            float d = clamp(delay + mod, 8.f, (float)size - 4);
            float yL = readAt(bufL, d), yR = readAt(bufR, d * 1.012f);
            lpL.tick(yR); hpL.tick(lpL.lp);
            lpR.tick(yL); hpR.tick(lpR.lp);
            float inGain = holding ? 0.f : 1.f;
            float m = (b.sendL[s] + b.sendR[s]) * .5f;
            float wL = soft((m * .78f * inGain + hpL.hp * fbAmt) * 1.08f) / 1.08f;
            float wR = soft((m * .28f * inGain + hpR.hp * fbAmt) * 1.08f) / 1.08f;
            bufL[wp] = wL; bufR[wp] = wR;
            if (++wp >= size) wp = 0;
            float cr = 0;
            if (crashEnv > 1e-4f) { cr = noise.next() * crashEnv * 2.4f; crashEnv *= crashC; }
            float rIn = (m + yL * .5f + yR * .5f) * .35f + cr;
            float rl, rr;
            springTick(rIn, rl, rr);
            b.L[s] += yL * wetAmt + rl * spr;
            b.R[s] += yR * wetAmt + rr * spr;
            pk = std::max(pk, std::fabs(yL));
        }
        meter.store(std::max(pk, meter.load(std::memory_order_relaxed) * .9f), std::memory_order_relaxed);
    }
private:
    static dsp::SVF withCoef(dsp::SVF f, const dsp::SVF& src) { f.g = src.g; f.k = src.k; f.a1 = src.a1; f.a2 = src.a2; f.a3 = src.a3; return f; }
    inline float readAt(const std::vector<float>& buf, float d) const {
        float rp = (float)wp - d; while (rp < 0) rp += size;
        int i0 = (int)rp; float fr = rp - i0; int i1 = i0 + 1; if (i1 >= size) i1 = 0;
        return buf[i0] + (buf[i1] - buf[i0]) * fr;
    }
    // ---- Spring: dispersive allpasses into a damped comb bank ----
    struct Delay { std::vector<float> b; int p = 0; void init(int n) { b.assign(n, 0); p = 0; }
        inline float allpass(float x, float g) { float y = b[p]; float w = x + y * g; b[p] = w; if (++p >= (int)b.size()) p = 0; return y - w * g; } };
    struct Comb { std::vector<float> b; int p = 0; float lp = 0; void init(int n) { b.assign(n, 0); p = 0; lp = 0; }
        inline float tick(float x, float fb, float damp) { float y = b[p]; lp += (y - lp) * damp; b[p] = x + lp * fb; if (++p >= (int)b.size()) p = 0; return y; } };
    void springInit() {
        float k = sr / 44100.f;
        static const int ap[6] = {11, 17, 23, 31, 41, 53};
        for (int i = 0; i < 6; i++) { disp[i].init(std::max(2, (int)(ap[i] * k))); }
        static const int cl[4] = {1422, 1617, 1813, 2003}, cr[4] = {1491, 1557, 1867, 2069};
        for (int i = 0; i < 4; i++) { combL[i].init((int)(cl[i] * k)); combR[i].init((int)(cr[i] * k)); }
    }
    inline void springTick(float x, float& l, float& r) {
        for (auto& d : disp) x = d.allpass(x, .62f);
        l = r = 0;
        for (int i = 0; i < 4; i++) { l += combL[i].tick(x, .84f, .42f); r += combR[i].tick(x, .84f, .42f); }
        l *= .28f; r *= .28f;
    }
    float sr = 48000, delay = 12000, wow = 0, flut = 0, crashEnv = 0;
    bool crashHeld = false;
    int size = 1, wp = 0;
    double tempo = 120;
    std::vector<float> bufL, bufR;
    dsp::SVF lpL, lpR, hpL, hpR;
    dsp::Smooth thr;
    dsp::Noise noise;
    Delay disp[6];
    Comb combL[4], combR[4];
};
