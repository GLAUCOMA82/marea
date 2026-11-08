// Small DSP helpers shared by every module. No allocation, safe on the audio thread.
#pragma once
#include <cmath>
#include <cstdint>
namespace dsp {
constexpr float kPi = 3.14159265358979f;
constexpr float kTau = 6.28318530717959f;
inline float clamp(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
inline float lerp(float a, float b, float t) { return a + (b - a) * t; }
inline float expMap(float t, float lo, float hi) { return lo * std::pow(hi / lo, t); }
inline float tauCoef(float seconds, float sr) { return std::exp(-1.0f / (seconds * sr)); }
inline float soft(float x) { return std::tanh(x); }

struct Noise {
    uint32_t s = 0x1F2E3D4C;
    inline float next() {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return (float)(int32_t)s * (1.0f / 2147483648.0f);
    }
};

// Topology-preserving state variable filter.
struct SVF {
    float g = 0, k = 1, a1 = 0, a2 = 0, a3 = 0, ic1 = 0, ic2 = 0, lp = 0, bp = 0, hp = 0;
    void set(float fc, float q, float sr) {
        fc = clamp(fc, 10.f, sr * 0.45f);
        g = std::tan(kPi * fc / sr);
        k = 1.0f / q;
        a1 = 1.0f / (1.0f + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
    }
    inline void tick(float x) {
        float v3 = x - ic2;
        float v1 = a1 * ic1 + a2 * v3;
        float v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1;
        ic2 = 2 * v2 - ic2;
        lp = v2; bp = v1; hp = x - k * v1 - v2;
    }
    void reset() { ic1 = ic2 = lp = bp = hp = 0; }
};

// Per-chunk parameter smoother.
struct Smooth {
    float v = 0;
    inline float step(float target, float amt = 0.15f) { v += (target - v) * amt; return v; }
};
}
