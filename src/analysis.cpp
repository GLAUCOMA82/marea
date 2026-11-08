#include "analysis.h"
#include <algorithm>
#include <cctype>
#include <cmath>

static const int kHop = 256;

float bpmFromFilename(const std::string& path) {
    std::string n = path.substr(path.find_last_of('/') == std::string::npos ? 0 : path.find_last_of('/') + 1);
    std::transform(n.begin(), n.end(), n.begin(), ::tolower);
    size_t at = 0;
    while ((at = n.find("bpm", at)) != std::string::npos) {
        // "94bpm", "94 bpm", "94_bpm"
        size_t i = at;
        while (i > 0 && (n[i - 1] == ' ' || n[i - 1] == '_' || n[i - 1] == '-')) i--;
        size_t e = i;
        while (i > 0 && std::isdigit((unsigned char)n[i - 1])) i--;
        if (e > i && e - i <= 3) { int v = std::stoi(n.substr(i, e - i)); if (v >= 40 && v <= 300) return (float)v; }
        // "bpm94"
        size_t j = at + 3;
        while (j < n.size() && (n[j] == ' ' || n[j] == '_' || n[j] == '-')) j++;
        size_t s = j;
        while (j < n.size() && std::isdigit((unsigned char)n[j])) j++;
        if (j > s && j - s <= 3) { int v = std::stoi(n.substr(s, j - s)); if (v >= 40 && v <= 300) return (float)v; }
        at += 3;
    }
    return 0;
}

// Onset strength per hop: how sharply brightness-weighted energy rises.
static std::vector<float> onsetCurve(const SampleBuf& b) {
    size_t len = b.L.size();
    std::vector<float> env;
    if (len < (size_t)kHop * 4) return env;
    env.reserve(len / kHop);
    float prevLog = 0, prevS = 0;
    for (size_t a = 0; a + kHop <= len; a += kHop) {
        float e = 0;
        for (size_t i = a; i < a + kHop; i++) {
            float s = (b.L[i] + b.R[i]) * .5f;
            e += std::fabs(s - prevS) + std::fabs(s) * .25f;
            prevS = s;
        }
        float lg = std::log(1 + e * 4);
        env.push_back(std::max(0.f, lg - prevLog));
        prevLog = lg;
    }
    float mean = 0;
    for (float v : env) mean += v;
    mean /= std::max<size_t>(1, env.size());
    for (auto& v : env) v = std::max(0.f, v - mean * .5f);
    return env;
}

void analyzeTempo(ChopData& d, bool useFilename) {
    const SampleBuf& b = *d.buf;
    double dur = b.L.size() / b.sr;
    d.bpmFromName = false;
    float named = useFilename ? bpmFromFilename(b.path.empty() ? b.name : b.path) : 0;
    if (named > 0) { d.fileBpm = named; d.bpmFromName = true; d.beats = (float)(dur * named / 60); return; }

    auto env = onsetCurve(b);
    double hopSec = kHop / b.sr;
    d.fileBpm = 0;
    if (env.size() < 32) { d.beats = 0; return; }
    int loLag = std::max(2, (int)(60.0 / 190 / hopSec)), hiLag = (int)(60.0 / 62 / hopSec);
    hiLag = std::min(hiLag, (int)env.size() / 2);
    // Comb over beat multiples, with a gentle preference for common tempos.
    auto score = [&](double lag) {
        float s = 0;
        for (int m = 1; m <= 4; m++) {
            int l = (int)std::lround(lag * m);
            if (l >= (int)env.size()) break;
            float sum = 0;
            for (size_t i = 0; i + l < env.size(); i++) sum += env[i] * env[i + l];
            s += sum / (float)(env.size() - l) / m;
        }
        double bpm = 60.0 / (lag * hopSec);
        return s * (float)std::exp(-std::pow(std::log2(bpm / 112.0), 2) / (2 * .55 * .55));
    };
    float best = -1; double bestBpm = 0;
    for (int lag = loLag; lag <= hiLag; lag++) {
        float s = score(lag);
        if (s > best) { best = s; bestBpm = 60.0 / (lag * hopSec); }
    }
    if (bestBpm <= 0) { d.beats = 0; return; }
    // A file cut as a loop lasts a whole number of bars, which gives an exact tempo. Prefer such a
    // tempo whenever the rhythm supports it reasonably well.
    float bestLoop = -1; double loopBpm = 0;
    for (int bars : {1, 2, 4, 8, 16, 32}) {
        double bpm = bars * 4 * 60 / dur;
        if (bpm < 62 || bpm > 190) continue;
        float s = score(60.0 / bpm / hopSec);
        if (s > bestLoop) { bestLoop = s; loopBpm = bpm; }
    }
    if (bestLoop >= best * .55f) bestBpm = loopBpm;
    d.fileBpm = (float)bestBpm;
    d.beats = (float)(dur * bestBpm / 60);
}

void makeSlices(ChopData& d, int grid, bool hits, float sensitivity, int maxSlices) {
    const SampleBuf& b = *d.buf;
    size_t len = b.L.size();
    d.starts.clear();
    if (len < 16) return;
    auto env = onsetCurve(b);

    // First moment of real sound, so a little silence at the top doesn't shift the grid.
    float peak = 1e-6f;
    for (size_t i = 0; i < len; i++) peak = std::max(peak, std::fabs(b.L[i]));
    size_t origin = 0;
    while (origin < len && std::fabs(b.L[origin]) < peak * .02f && origin < (size_t)(b.sr * .25)) origin++;
    if (origin >= (size_t)(b.sr * .25)) origin = 0;

    if (hits) {
        // Sensitivity moves the threshold; refractory period avoids double cuts.
        float top = 0;
        for (float v : env) top = std::max(top, v);
        float thr = top * (float)std::pow(10.0, -1.4 * sensitivity - .05);
        int gap = (int)(.055 * b.sr / kHop);
        std::vector<std::pair<float, uint32_t>> found;
        for (int i = 1; i + 1 < (int)env.size(); i++) {
            if (env[i] < thr || env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
            if (!found.empty() && i * kHop - (int)found.back().second < gap * kHop) {
                if (env[i] > found.back().first) found.back() = {env[i], (uint32_t)(i * kHop)};
                continue;
            }
            found.push_back({env[i], (uint32_t)(i * kHop)});
        }
        if ((int)found.size() > maxSlices) {
            std::sort(found.begin(), found.end(), [](auto& a, auto& z) { return a.first > z.first; });
            found.resize(maxSlices);
        }
        for (auto& f : found) d.starts.push_back(f.second);
        std::sort(d.starts.begin(), d.starts.end());
        if (d.starts.empty() || d.starts[0] > (uint32_t)(b.sr * .03)) d.starts.insert(d.starts.begin(), (uint32_t)origin);
        if ((int)d.starts.size() > maxSlices) d.starts.resize(maxSlices);
        return;
    }

    static const double stepsPerBeat[4] = {1, 2, 4, 8};
    double perBeat = stepsPerBeat[std::clamp(grid, 0, 3)];
    double bpm = d.fileBpm > 1 ? d.fileBpm : 120;
    double framesPerBeat = b.sr * 60 / bpm;
    double total = (len - origin) / framesPerBeat * perBeat;
    // Too many slices to fit? Keep doubling the note value.
    while (total > maxSlices && perBeat > 1) { perBeat /= 2; total /= 2; }
    if (total > maxSlices) perBeat *= maxSlices / total;
    int count = std::clamp((int)std::round(total), 1, maxSlices);
    d.stepsPerSlice = 4 / perBeat;
    double every = framesPerBeat / perBeat;
    int win = (int)(every * .18 / kHop);
    for (int i = 0; i < count; i++) {
        size_t at = origin + (size_t)(i * every);
        if (at >= len) break;
        // Nudge each cut onto the nearby transient so slices start cleanly.
        int centre = (int)(at / kHop), bestI = centre;
        float bestV = -1;
        for (int h = std::max(0, centre - win); h <= std::min((int)env.size() - 1, centre + win); h++) {
            float weight = 1 - .5f * std::abs(h - centre) / (float)std::max(1, win);
            if (env[h] * weight > bestV) { bestV = env[h] * weight; bestI = h; }
        }
        uint32_t cut = bestV > 0 && i > 0 ? (uint32_t)(bestI * kHop) : (uint32_t)at;
        if (!d.starts.empty() && cut <= d.starts.back()) cut = (uint32_t)at;
        if (d.starts.empty() || cut > d.starts.back()) d.starts.push_back(cut);
    }
}
