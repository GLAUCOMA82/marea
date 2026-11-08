// CHOP: plays numbered slices of one audio file or recording, like an MPC-style chopped loop. The
// sequencer retriggers slices at the current tempo, so a loop follows any BPM without changing pitch.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include "sampler.h"
#include <atomic>
#include <memory>
#include <vector>

struct ChopData {
    std::shared_ptr<SampleBuf> buf;
    std::vector<uint32_t> starts;  // first frame of each slice, ascending
    float fileBpm = 0;
    float beats = 0;
    bool bpmFromName = false;
    double stepsPerSlice = 1;
};

class Chop : public Module {
public:
    static constexpr int kMaxSlices = 32;
    Param* pitch; Param* gate; Param* level; Param* echo; Param* rev; Param* fit; Param* div; Param* mode; Param* sens; Param* mute;
    std::atomic<float> meter{0};
    std::atomic<int> sliceNow{-1};
    std::atomic<double> tempo{120};

    explicit Chop(ParamTable& t) {
        pitch = t.add(800, "cho.pitch", "Chop Pitch", .5f);
        gate = t.add(801, "cho.gate", "Chop Length", 1);
        level = t.add(802, "cho.level", "Chop Level", .7f);
        echo = t.add(803, "cho.echo", "Chop Echo", .1f);
        rev = t.add(804, "cho.rev", "Chop Reverse", 0, 2);
        fit = t.add(805, "cho.fit", "Chop Fit Speed", 0, 2);
        div = t.add(806, "cho.div", "Chop Grid", 2 / 3.f, 4);
        mode = t.add(807, "cho.mode", "Chop Hits", 0, 2);
        sens = t.add(808, "cho.sens", "Chop Sensitivity", .5f);
        mute = t.add(809, "cho.mute", "Chop Mute", 0, 2);
        data.store(nullptr);
    }
    void prepare(double sampleRate) override { sr = (float)sampleRate; for (auto& v : voices) v = Voice{}; }
    void install(ChopData* d) { data.store(d, std::memory_order_release); }
    ChopData* get() const { return data.load(std::memory_order_acquire); }

    void hit(int slice, float vel) override {
        ChopData* d = get();
        if (!d || d->starts.empty() || mute->on()) return;
        if (slice < 0 || slice >= (int)d->starts.size()) return;
        // One slice at a time, like a chopped loop. The old one fades instead of clicking.
        for (auto& v : voices) if (v.active) v.fading = true;
        Voice& v = voices[next]; next = (next + 1) % kVoices;
        double a = d->starts[slice];
        double z = slice + 1 < (int)d->starts.size() ? d->starts[slice + 1] : (double)d->buf->L.size() - 2;
        v = Voice{};
        v.active = true; v.vel = vel; v.begin = a; v.end = z;
        v.rev = rev->on();
        v.pos = v.rev ? z - 1 : a;
        sliceNow.store(slice, std::memory_order_relaxed);
    }
    void render(Bus& b, int n) override {
        using namespace dsp;
        ChopData* d = get();
        if (!d) return;
        const auto& L = d->buf->L; const auto& R = d->buf->R;
        double rate = std::pow(2.0, (pitch->get() - .5f) * 24.0 / 12.0) * d->buf->sr / sr;
        if (fit->on() && d->fileBpm > 1) rate *= tempo.load(std::memory_order_relaxed) / d->fileBpm;
        float lev = level->get(); lev = lev * lev * 1.5f;
        float send = echo->get();
        float gt = gate->get();
        float fade = tauCoef(.004f, sr), atk = tauCoef(.0007f, sr);
        double maxPos = (double)L.size() - 2;
        float pk = 0;
        for (auto& v : voices) {
            if (!v.active) continue;
            double span = (v.end - v.begin) * std::max(.02f, gt);
            for (int i = 0; i < n; i++) {
                double done = v.rev ? v.end - v.pos : v.pos - v.begin;
                if (done >= span || v.pos < 0 || v.pos >= maxPos) v.fading = true;
                v.env = v.fading ? v.env * fade : 1 - (1 - v.env) * atk;
                if (v.fading && v.env < 1e-4f) { v.active = false; break; }
                if (v.pos < 0 || v.pos >= maxPos) continue;
                int ip = (int)v.pos; float fr = (float)(v.pos - ip);
                float l = lerp(L[ip], L[ip + 1], fr) * v.env * lev * v.vel, r = lerp(R[ip], R[ip + 1], fr) * v.env * lev * v.vel;
                b.L[i] += l; b.R[i] += r; b.sendL[i] += l * send; b.sendR[i] += r * send;
                pk = std::max(pk, std::fabs(l));
                v.pos += v.rev ? -rate : rate;
            }
        }
        meter.store(std::max(pk, meter.load(std::memory_order_relaxed) * .85f), std::memory_order_relaxed);
    }
private:
    static constexpr int kVoices = 3;
    struct Voice { bool active = false, fading = false, rev = false; double pos = 0, begin = 0, end = 0; float env = 0, vel = 1; };
    Voice voices[kVoices];
    int next = 0;
    std::atomic<ChopData*> data;
    float sr = 48000;
};
