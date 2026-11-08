// BASS: a monophonic bass with its own melody sequencer and seven original voices that share one
// resonant 4-pole filter, envelope, accent and slide:
// ACID saw/square, SUB rounded sine, REESE beating saws, FM two-operator, WOBBLE tempo-synced filter,
// ORGAN stacked harmonics, REED a vibrato pulse for melodies.
#pragma once
#include "../dsp.h"
#include "../module.h"
#include <atomic>

class Bass : public Module {
public:
    Param* wave; Param* detune; Param* sub; Param* cutoff; Param* reso; Param* env; Param* decay; Param* accent; Param* drive; Param* level; Param* echo; Param* mute; Param* slideTime;
    Param* voice; Param* root; Param* scale;  // used by the panel to lay out the melody grid
    std::atomic<float> meter{0};
    std::atomic<int> noteNow{-1};
    std::atomic<double> tempo{120};

    explicit Bass(ParamTable& t) {
        wave = t.add(700, "bas.wave", "Bass Wave", .15f);
        detune = t.add(701, "bas.detune", "Bass Detune", .08f);
        sub = t.add(702, "bas.sub", "Bass Sub", .25f);
        cutoff = t.add(703, "bas.cutoff", "Bass Cutoff", .3f);
        reso = t.add(704, "bas.reso", "Bass Resonance", .55f);
        env = t.add(705, "bas.env", "Bass Env Amount", .55f);
        decay = t.add(706, "bas.decay", "Bass Decay", .4f);
        accent = t.add(707, "bas.accent", "Bass Accent", .6f);
        drive = t.add(708, "bas.drive", "Bass Drive", .3f);
        level = t.add(709, "bas.level", "Bass Level", .62f);
        echo = t.add(710, "bas.echo", "Bass Echo", .06f);
        mute = t.add(711, "bas.mute", "Bass Mute", 0, 2);
        slideTime = t.add(712, "bas.slide", "Bass Slide Time", .35f);
        root = t.add(713, "bas.root", "Bass Root", 7 / 11.f, 12);
        scale = t.add(714, "bas.scale", "Bass Scale", 0, 6);
        voice = t.add(715, "bas.voice", "Bass Voice", 0, 7);
    }
    void prepare(double sampleRate) override {
        sr = (float)sampleRate;
        s1 = s2 = s3 = s4 = 0; ph1 = ph2 = phSub = ph3 = lfo = vib = 0; ampEnv = filtEnv = 0; gate = false; autoOff = -1; freq = 110; accNow = 0;
        noteNow = -1;
    }
    // flags: 1 = slide into this note, 2 = accent. holdFrames < 0 means hold until release.
    void noteOn(int midi, float vel, int flags, long holdFrames) {
        if (mute->on()) return;
        target = 440.f * std::pow(2.f, (midi - 69) / 12.f);
        bool legato = (flags & 1) && gate;
        if (!legato) { freq = target; filtEnv = 1; }
        accNow = (flags & 2) ? 1.f : 0.f;
        if (legato && accNow > 0) filtEnv = std::max(filtEnv, .7f);
        velNow = vel;
        gate = true;
        current = midi;
        autoOff = holdFrames;
        noteNow.store(midi, std::memory_order_relaxed);
    }
    void noteOff(int midi) { if (midi == current || midi < 0) { gate = false; autoOff = -1; noteNow.store(-1, std::memory_order_relaxed); } }
    void hit(int midi, float vel) override { noteOn(midi, vel, vel > .9f ? 2 : 0, -1); }
    void release(int midi) override { noteOff(midi); }
    void render(Bus& b, int n) override {
        using namespace dsp;
        if (ampEnv < 1e-5f && !gate) { meter.store(0, std::memory_order_relaxed); return; }
        float wv = wave->get(), det = detune->get(), subLv = sub->get();
        float cut = cutoff->get(), rs = reso->get(), envAmt = env->get();
        float acc = accent->get() * accNow;
        float dec = expMap(decay->get(), .035f, 1.3f) * (1 - acc * .5f);
        float fCoef = tauCoef(dec, sr);
        float glide = 1 - tauCoef(expMap(slideTime->get(), .012f, .22f), sr);
        float ampDec = tauCoef(gate ? 1.6f : .009f, sr), attack = tauCoef(.0012f, sr);
        float drv = 1 + drive->get() * 6;
        float lev = level->get(); lev = lev * lev * 1.4f * (velNow * .25f + .75f) * (1 + acc * .7f);
        float send = echo->get();
        float detRatio = std::pow(2.f, det * 24.f / 1200.f * 4);
        float k = rs * rs * 4.15f;
        int vc = voice->index();
        float lfoInc = (float)(tempo.load(std::memory_order_relaxed) / 60.0 * 2.0) / sr;  // WOBBLE moves in eighth notes
        float pk = 0;
        for (int i = 0; i < n; i++) {
            if (autoOff >= 0 && --autoOff < 0) { gate = false; noteNow.store(-1, std::memory_order_relaxed); ampDec = tauCoef(.009f, sr); }
            freq += (target - freq) * glide;
            filtEnv *= fCoef;
            if (gate) ampEnv = 1 - (1 - ampEnv) * attack; else ampEnv *= ampDec;
            phSub += freq * .5f / sr; if (phSub >= 1) phSub -= 1;
            float subWave = (phSub < .5f ? 1.f : -1.f) * subLv * .7f, mix = 0, wob = 0;
            switch (vc) {
                case 1: {  // SUB: a rounded sine with a touch of second harmonic from WAVE
                    ph1 += freq / sr; if (ph1 >= 1) ph1 -= 1;
                    mix = std::sin(kTau * ph1) * 1.1f + std::sin(2 * kTau * ph1) * wv * .35f + subWave * .5f;
                    break;
                }
                case 2: {  // REESE: three saws drifting against each other; DETUNE sets how fast they beat
                    float d = .002f + det * .022f;
                    mix = (osc(ph1, freq * (1 - d), 0) + osc(ph2, freq * (1 + d), 0) + osc(ph3, freq * (1 + d * .37f), wv)) * .5f + subWave;
                    break;
                }
                case 3: {  // FM: WAVE picks the ratio, the envelope opens the brightness
                    float ratio = 1 + std::floor(wv * 3.99f);
                    ph2 += freq * ratio / sr; if (ph2 >= 1) ph2 -= 1;
                    float index = (.4f + envAmt * 5.f * filtEnv + acc * 2.f) * (1 + det * 2);
                    ph1 += freq / sr; if (ph1 >= 1) ph1 -= 1;
                    mix = std::sin(kTau * ph1 + index * std::sin(kTau * ph2)) * 1.1f + subWave;
                    break;
                }
                case 4: {  // WOBBLE: saws with a tempo-locked filter sweep
                    lfo += lfoInc; if (lfo >= 1) lfo -= 1;
                    wob = (.5f - .5f * std::cos(kTau * lfo)) * 3.4f;
                    mix = (osc(ph1, freq, wv) + osc(ph2, freq * detRatio, wv) * .8f) * .62f + subWave;
                    break;
                }
                case 5: {  // ORGAN: fixed harmonics, WAVE adds the upper ones
                    ph1 += freq / sr; if (ph1 >= 1) ph1 -= 1;
                    mix = std::sin(kTau * ph1) + std::sin(2 * kTau * ph1) * .5f + std::sin(3 * kTau * ph1) * (.1f + wv * .5f) + std::sin(4 * kTau * ph1) * wv * .3f + subWave;
                    mix *= .7f;
                    break;
                }
                case 6: {  // REED: a narrow pulse with slow vibrato, for playing melodies
                    vib += 5.2f / sr; if (vib >= 1) vib -= 1;
                    float f = freq * (1 + .006f * std::sin(kTau * vib));
                    ph1 += f / sr; if (ph1 >= 1) ph1 -= 1;
                    float width = .12f + wv * .35f, dt = clamp(f / sr, 1e-5f, .45f), t2 = ph1 + 1 - width; if (t2 >= 1) t2 -= 1;
                    mix = ((ph1 < width ? 1.f : -1.f) + blep(ph1, dt) - blep(t2, dt)) * .8f + subWave;
                    break;
                }
                default: {  // ACID
                    float o1 = osc(ph1, freq, wv);
                    float o2 = osc(ph2, freq * detRatio, wv);
                    mix = (o1 + o2 * (det > .001f ? .8f : 0)) * (det > .001f ? .62f : 1.f) + subWave;
                }
            }
            // Sweep in octaves from a low base; envelope and accent push it upward.
            float octs = cut * 7.2f + wob + (envAmt * 5.2f + acc * 2.2f) * filtEnv;
            float fc = clamp(38.f * std::pow(2.f, octs), 25.f, sr * .42f);
            float g = 1 - std::exp(-kTau * fc * .5f / sr);  // run twice per sample below
            float out = 0;
            for (int os = 0; os < 2; os++) {
                float in = soft(mix * .75f - k * s4);
                s1 += (in - s1) * g; s2 += (s1 - s2) * g; s3 += (s2 - s3) * g; s4 += (s3 - s4) * g;
                out = s4;
            }
            out *= 1 + k * .32f;  // keeps the body when resonance is high
            float x = soft(out * drv) / (1 + drive->get() * 1.2f) * ampEnv * lev;
            b.L[i] += x; b.R[i] += x;
            float sx = x * send; b.sendL[i] += sx; b.sendR[i] += sx;
            pk = std::max(pk, std::fabs(x));
        }
        meter.store(std::max(pk, meter.load(std::memory_order_relaxed) * .85f), std::memory_order_relaxed);
    }
private:
    // Band-limited saw that morphs into a square.
    inline float blep(float t, float dt) {
        if (t < dt) { t /= dt; return t + t - t * t - 1; }
        if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
        return 0;
    }
    inline float osc(float& ph, float f, float wv) {
        float dt = dsp::clamp(f / sr, 1e-5f, .45f);
        ph += dt; if (ph >= 1) ph -= 1;
        float saw = 2 * ph - 1 - blep(ph, dt);
        float t2 = ph + .5f; if (t2 >= 1) t2 -= 1;
        float sq = (ph < .5f ? 1.f : -1.f) + blep(ph, dt) - blep(t2, dt);
        return saw + (sq - saw) * wv;
    }
    float sr = 48000, s1 = 0, s2 = 0, s3 = 0, s4 = 0, ph1 = 0, ph2 = 0, ph3 = 0, phSub = 0, lfo = 0, vib = 0, ampEnv = 0, filtEnv = 0, freq = 110, target = 110, accNow = 0, velNow = 1;
    bool gate = false;
    long autoOff = -1;
    int current = -1;
};
