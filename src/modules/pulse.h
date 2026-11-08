// PULSE: eight synthesized drum voices. Every sound is generated here; no samples are used.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include "sampler.h"
#include <atomic>
#include <algorithm>
#include <string>

class Pulse : public Module {
public:
    static constexpr int kTracks = 8;
    enum { KICK, SNARE, RIM, CLAP, HAT, OPEN, TOM, BELL };
    struct Track { Param* key; Param* tune; Param* decay; Param* tone; Param* echo; Param* level; Param* mute; Param* solo; };
    Track tr[kTracks];
    std::atomic<float> activity[kTracks];

    explicit Pulse(ParamTable& t) {
        static const char* keys[kTracks] = {"kick", "snare", "rim", "clap", "hat", "open", "tom", "bell"};
        static const char* names[kTracks] = {"Kick", "Snare", "Rim", "Clap", "Hat", "Open Hat", "Tom", "Bell"};
        static const float echoDef[kTracks] = {0, .12f, .35f, .18f, 0, .1f, .3f, .4f};
        static const float levDef[kTracks] = {.86f, .72f, .62f, .62f, .55f, .5f, .66f, .46f};
        for (int i = 0; i < kTracks; i++) {
            std::string k = std::string("pul.") + keys[i] + ".", n = std::string(names[i]) + " ";
            int base = 100 + i * 10;
            tr[i].tune = t.add(base, k + "tune", n + "Tune", .5f);
            tr[i].decay = t.add(base + 1, k + "decay", n + "Decay", .5f);
            tr[i].tone = t.add(base + 2, k + "tone", n + "Tone", .5f);
            tr[i].echo = t.add(base + 3, k + "echo", n + "Echo", echoDef[i]);
            tr[i].level = t.add(base + 4, k + "level", n + "Level", levDef[i]);
            tr[i].mute = t.add(base + 5, k + "mute", n + "Mute", 0, 2);
            tr[i].solo = t.add(base + 6, k + "solo", n + "Solo", 0, 2);
            tr[i].key = t.add(base + 7, k + "key", n + "Key", .5f, 49);  // -24..+24 semitones, set from the keyboard
            activity[i] = 0;
            laneSample[i] = nullptr;
        }
    }
    // A lane can play a sample instead of its synthesized voice.
    std::atomic<SampleBuf*> laneSample[kTracks];
    void prepare(double sampleRate) override {
        sr = (float)sampleRate;
        for (auto& v : voice) v = Voice{};
        for (int i = 0; i < kTracks; i++) activity[i] = 0;
    }
    void hit(int i, float vel) override {
        if (i < 0 || i >= kTracks) return;
        bool anySolo = false;
        for (auto& t : tr) anySolo = anySolo || t.solo->on();
        if (tr[i].mute->on() || (anySolo && !tr[i].solo->on())) return;
        Voice& v = voice[i];
        v.amp = vel; v.amp2 = vel; v.pEnv = 1; v.ph1 = v.ph2 = 0; v.t = 0; v.click = vel; v.spos = 0; v.fade = 0;
        if (i == HAT) voice[OPEN].choke = true;
        if (i == OPEN) v.choke = false;
        activity[i].store(vel, std::memory_order_relaxed);
    }
    void render(Bus& b, int n) override {
        for (int i = 0; i < kTracks; i++) {
            Voice& v = voice[i];
            if (v.amp < 1e-5f && v.amp2 < 1e-5f) continue;
            float tune = tr[i].tune->get(), decay = tr[i].decay->get(), tone = tr[i].tone->get();
            keyMul = std::pow(2.f, (tr[i].key->get() - .5f) * 48.f / 12.f);
            float lev = tr[i].level->get();
            lev = lev * lev * 1.6f;
            float send = tr[i].echo->get();
            float pan = kPan[i];
            float gL = lev * std::sqrt(0.5f * (1 - pan)), gR = lev * std::sqrt(0.5f * (1 + pan));
            SampleBuf* smp = laneSample[i].load(std::memory_order_acquire);
            if (smp && !smp->L.empty()) {
                using namespace dsp;
                double rate = std::pow(2.0, (tune - .5) * 2.0) * keyMul * smp->sr / sr;
                double last = (double)smp->L.size() - 2;
                float dcy = tauCoef(expMap(decay, .03f, 3.f), sr), fadeIn = tauCoef(.0006f, sr);
                bool dark = tone < .48f;
                if (dark) v.f1.set(expMap(tone / .48f, 250, 18000), .8f, sr);
                for (int s = 0; s < n; s++) {
                    if (v.spos >= last) { v.amp = v.amp2 = 0; break; }
                    int ip = (int)v.spos; float fr = (float)(v.spos - ip);
                    float x = ((smp->L[ip] + (smp->L[ip + 1] - smp->L[ip]) * fr) + (smp->R[ip] + (smp->R[ip + 1] - smp->R[ip]) * fr)) * .5f;
                    if (dark) { v.f1.tick(x); x = v.f1.lp; }
                    if (i == OPEN && v.choke) { v.amp *= tauCoef(.003f, sr); if (v.amp < 1e-4f) { v.amp = v.amp2 = 0; v.choke = false; break; } }
                    // Decay at the top of the knob lets the whole sample ring.
                    if (decay < .97f) v.amp *= dcy;
                    v.fade = 1 - (1 - v.fade) * fadeIn;
                    x *= v.amp * v.fade * 1.3f;
                    if (v.amp < 1e-5f) { v.amp = v.amp2 = 0; break; }
                    b.L[s] += x * gL; b.R[s] += x * gR;
                    float sx = x * lev * send;
                    b.sendL[s] += sx; b.sendR[s] += sx;
                    v.spos += rate;
                }
                continue;
            }
            for (int s = 0; s < n; s++) {
                float x = tickVoice(i, v, tune, decay, tone);
                b.L[s] += x * gL; b.R[s] += x * gR;
                float sx = x * lev * send;
                b.sendL[s] += sx; b.sendR[s] += sx;
            }
        }
        for (auto& a : activity) a.store(a.load(std::memory_order_relaxed) * 0.93f, std::memory_order_relaxed);
    }
private:
    struct Voice { double spos = 0; float fade = 0; float amp = 0, amp2 = 0, pEnv = 0, ph1 = 0, ph2 = 0, t = 0, click = 0; bool choke = false; float metal[6] = {0, 0, 0, 0, 0, 0}; dsp::SVF f1, f2; };
    static constexpr float kPan[kTracks] = {0, 0, .18f, -.12f, .28f, .28f, -.3f, -.2f};
    Voice voice[kTracks];
    dsp::Noise noise;
    float sr = 48000, keyMul = 1;

    inline float sq(float& ph, float f) { ph += f / sr; if (ph >= 1) ph -= 1; return ph < .5f ? 1.f : -1.f; }

    float tickVoice(int i, Voice& v, float tune, float decay, float tone) {
        using namespace dsp;
        float out = 0;
        v.t += 1.f / sr;
        switch (i) {
            case KICK: {
                float base = expMap(tune, 34, 92) * keyMul;
                float f = base * (1 + (3.5f + tone * 4) * v.pEnv);
                v.pEnv *= tauCoef(.022f, sr);
                v.ph1 += f / sr; if (v.ph1 >= 1) v.ph1 -= 1;
                float body = soft(std::sin(kTau * v.ph1) * (1.1f + tone * 3.2f));
                v.amp *= tauCoef(expMap(decay, .06f, .75f), sr);
                v.click *= tauCoef(.0025f, sr);
                out = body * v.amp + noise.next() * v.click * (.08f + tone * .3f);
                out *= 1.05f;
                break;
            }
            case SNARE: {
                float m = expMap(tune, .7f, 1.45f) * keyMul;
                float f1 = 182 * m * (1 + .35f * v.pEnv), f2 = 331 * m * (1 + .2f * v.pEnv);
                v.pEnv *= tauCoef(.012f, sr);
                v.ph1 += f1 / sr; if (v.ph1 >= 1) v.ph1 -= 1;
                v.ph2 += f2 / sr; if (v.ph2 >= 1) v.ph2 -= 1;
                v.amp *= tauCoef(.075f, sr);
                v.amp2 *= tauCoef(expMap(decay, .05f, .34f), sr);
                float body = (std::sin(kTau * v.ph1) * .62f + std::sin(kTau * v.ph2) * .38f) * v.amp;
                v.f1.set(1500 + 5200 * tone, .8f, sr); v.f1.tick(noise.next());
                out = body * (1 - tone * .55f) + v.f1.hp * v.amp2 * (.42f + tone * .55f);
                break;
            }
            case RIM: {
                float m = expMap(tune, .65f, 1.6f) * keyMul;
                v.ph1 += 1650 * m / sr; if (v.ph1 >= 1) v.ph1 -= 1;
                v.ph2 += 480 * m / sr; if (v.ph2 >= 1) v.ph2 -= 1;
                v.amp *= tauCoef(expMap(decay, .004f, .045f), sr);
                float s = std::sin(kTau * v.ph1) * tone + std::sin(kTau * v.ph2) * (1 - tone * .6f);
                out = soft(s * 2.2f) * v.amp * 1.1f;
                break;
            }
            case CLAP: {
                static const float bursts[] = {0, .0105f, .021f, .0335f};
                float be = 0;
                for (float bt : bursts) if (v.t >= bt) be = std::max(be, std::exp(-(v.t - bt) / .0035f));
                float tail = v.t >= .034f ? std::exp(-(v.t - .034f) / expMap(decay, .04f, .32f)) : 0;
                v.f1.set(std::min(expMap(tone, 750, 2600) * expMap(tune, .75f, 1.35f) * keyMul, sr * .4f), 1.6f, sr);
                v.f1.tick(noise.next());
                float e = std::max(be, tail * .75f);
                v.amp2 = e > 1e-5f ? v.amp2 : 0;
                if (v.t > 3) v.amp = v.amp2 = 0;
                out = v.f1.bp * e * v.amp * 2.1f;
                if (e < 1e-4f && v.t > .05f) v.amp = v.amp2 = 0;
                break;
            }
            case HAT: case OPEN: {
                if (v.choke) { v.amp *= tauCoef(.003f, sr); if (v.amp < 1e-4f) { v.amp = v.amp2 = 0; v.choke = false; } }
                static const float r[6] = {1, 1.483f, 1.739f, 2.213f, 2.587f, 3.341f};
                float base = 311 * expMap(tune, .72f, 1.42f) * keyMul, sum = 0;
                for (int k = 0; k < 6; k++) sum += sq(v.metal[k], base * r[k]);
                sum = lerp(sum / 6, noise.next(), .22f + tone * .55f);
                v.f1.set(7600 + tone * 3200, 1.1f, sr); v.f1.tick(sum);
                v.f2.set(5400, .7f, sr); v.f2.tick(v.f1.bp);
                float t = i == HAT ? expMap(decay, .012f, .12f) : expMap(decay, .09f, .9f);
                v.amp *= tauCoef(t, sr);
                out = v.f2.hp * v.amp * 2.0f;
                break;
            }
            case TOM: {
                float base = expMap(tune, 62, 210) * keyMul;
                float f = base * (1 + .9f * v.pEnv);
                v.pEnv *= tauCoef(.04f, sr);
                v.ph1 += f / sr; if (v.ph1 >= 1) v.ph1 -= 1;
                v.amp *= tauCoef(expMap(decay, .07f, .7f), sr);
                v.f1.set(900 + tone * 3000, .7f, sr); v.f1.tick(noise.next());
                out = soft(std::sin(kTau * v.ph1) * 1.5f) * v.amp + v.f1.bp * v.click * tone * .35f;
                v.click *= tauCoef(.03f, sr);
                break;
            }
            case BELL: {
                float m = expMap(tune, .55f, 1.8f) * keyMul;
                float s = sq(v.metal[0], 611 * m) * .55f + sq(v.metal[1], 897 * m) * .45f;
                v.f1.set(expMap(tone, 800, 4200), 1.3f, sr); v.f1.tick(s);
                float fast = std::exp(-v.t / .012f);
                v.amp *= tauCoef(expMap(decay, .03f, .75f), sr);
                out = v.f1.bp * v.amp * (.75f + fast * .6f);
                break;
            }
        }
        if (v.amp < 1e-5f && i != SNARE) v.amp2 = 0;
        if (i == SNARE && v.amp2 < 1e-5f && v.amp < 1e-5f) v.amp = v.amp2 = 0;
        return out;
    }
};
