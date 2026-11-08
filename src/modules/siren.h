// SIREN: one oscillator pushed around by one LFO, the classic hand-played dub box idea.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include <atomic>

class Siren : public Module {
public:
    Param* fire; Param* latch; Param* mode; Param* pitch; Param* rate; Param* depth; Param* tone; Param* tail; Param* level; Param* echo;
    std::atomic<float> meter{0};
    explicit Siren(ParamTable& t) {
        fire = t.add(300, "sir.fire", "Siren Fire", 0, 2);
        latch = t.add(301, "sir.latch", "Siren Latch", 0, 2);
        mode = t.add(302, "sir.mode", "Siren Mode", 0, 5);
        pitch = t.add(303, "sir.pitch", "Siren Pitch", .52f);
        rate = t.add(304, "sir.rate", "Siren Rate", .46f);
        depth = t.add(305, "sir.depth", "Siren Depth", .42f);
        tone = t.add(306, "sir.tone", "Siren Tone", .6f);
        tail = t.add(307, "sir.tail", "Siren Tail", .4f);
        level = t.add(308, "sir.level", "Siren Level", .56f);
        echo = t.add(309, "sir.echo", "Siren Echo", .55f);
    }
    void prepare(double sampleRate) override { sr = (float)sampleRate; env = 0; lfo = 0; osc = 0; dive = 0; filt.reset(); held = false; }
    void render(Bus& b, int n) override {
        using namespace dsp;
        bool gate = fire->on() || latch->on();
        if (gate && !held) { lfo = 0; dive = 0; }
        held = gate;
        if (!gate && env < 1e-4f) { env = 0; meter.store(0, std::memory_order_relaxed); return; }
        float base = expMap(pitch->get(), 90, 2100);
        float rateHz = expMap(rate->get(), .12f, 26);
        float dep = depth->get() * 3.2f;  // octaves
        float tail_s = expMap(tail->get(), .01f, 3.5f);
        float aCoef = tauCoef(.003f, sr), rCoef = tauCoef(tail_s, sr);
        filt.set(expMap(tone->get(), 500, 11000), .9f, sr);
        float lev = level->get(); lev = lev * lev * 1.1f;
        float send = echo->get();
        int m = mode->index();
        float pw = .5f - tone->get() * .28f;
        for (int s = 0; s < n; s++) {
            lfo += rateHz / sr; if (lfo >= 1) lfo -= 1;
            float l;
            switch (m) {
                case 0: l = .5f - .5f * std::cos(kTau * lfo); break;              // WAIL: smooth up and down
                case 1: l = lfo < .5f ? lfo * 2 : 2 - lfo * 2; break;              // YELP: triangle
                case 2: l = 1 - lfo; break;                                        // DIVE: falling saw
                case 3: l = lfo; break;                                            // RISE: climbing saw
                default: l = lfo < .5f ? 1.f : 0.f; break;                         // ALARM: two-tone
            }
            if (gate) env = 1 - (1 - env) * aCoef; else { env *= rCoef; dive += 1.f / (sr * tail_s * 1.5f); }
            float f = base * std::pow(2.0f, (l - .5f) * dep - std::min(dive, 3.f) * 1.4f);
            osc += clamp(f, 10.f, sr * .45f) / sr; if (osc >= 1) osc -= 1;
            float sqw = osc < pw ? 1.f : -1.f;
            float tri = 4 * std::fabs(osc - .5f) - 1;
            filt.tick(lerp(tri, sqw, .35f + tone->get() * .65f));
            float x = soft(filt.lp * 1.25f) * env;
            b.L[s] += x * lev; b.R[s] += x * lev;
            float sx = x * lev * send * 1.2f;
            b.sendL[s] += sx; b.sendR[s] += sx;
        }
        meter.store(env, std::memory_order_relaxed);
    }
private:
    float sr = 48000, env = 0, lfo = 0, osc = 0, dive = 0;
    bool held = false;
    dsp::SVF filt;
};
