// The Engine owns the modules, the sequencer and the master bus. It knows nothing about Audio Units,
// sockets or windows, which keeps it testable.
#pragma once
#include "modules/bass.h"
#include "modules/chop.h"
#include "modules/echo.h"
#include "modules/mic.h"
#include "modules/pulse.h"
#include "modules/sampler.h"
#include "modules/siren.h"
#include <atomic>
#include <cstring>
#include <vector>

struct Transport {
    bool hostPresent = false;  // running inside a DAW
    bool hostPlaying = false;
    double hostBeat = 0;
    double hostBpm = 0;
    uint64_t hostTime = 0;  // when this buffer plays, on the system clock; 0 if the host doesn't say
};

// Lock-free single-producer, single-consumer ring.
template <typename T, int N> class Ring {
public:
    bool push(const T& v) {
        int w = w_.load(std::memory_order_relaxed), nx = (w + 1) % N;
        if (nx == r_.load(std::memory_order_acquire)) return false;
        d_[w] = v; w_.store(nx, std::memory_order_release); return true;
    }
    bool pop(T& v) {
        int r = r_.load(std::memory_order_relaxed);
        if (r == w_.load(std::memory_order_acquire)) return false;
        v = d_[r]; r_.store((r + 1) % N, std::memory_order_release); return true;
    }
private:
    T d_[N]; std::atomic<int> w_{0}, r_{0};
};

class Engine {
public:
    static constexpr int kPatterns = 8, kTracks = Pulse::kTracks, kSteps = 16;
    struct Cmd { enum Kind : uint8_t { Hit, Release } kind; uint8_t module; uint8_t index; float vel; int frame; uint8_t flags = 0; int hold = -1; };

    ParamTable params;
    Pulse pulse{params};
    Siren siren{params};
    Sampler sampler{params};
    Echo echo{params};
    Bass bass{params};
    Chop chop{params};
    Mic mic{params};
    std::vector<Module*> modules;  // add new sound modules to this list in the constructor

    Param* vary;        // chance per step of playing something different this pass, never written back
    Param* micFx;       // effect applied to microphone recordings
    Param* keysTarget;  // what incoming MIDI notes play: 0 drum map, 1 bass, 2 chop slices
    Param* clickOn; Param* clickLevel;  // metronome: heard but never recorded
    Param* bpm; Param* swing; Param* drop; Param* volume; Param* sweep; Param* drive;

    // Low 16 bits = step on, high 16 bits = accent.
    std::atomic<uint32_t> steps[kPatterns][kTracks];
    // Bass step: bits 0-7 MIDI note, bit 8 on, bit 9 accent, bit 10 slide. Chop step: 0 off, n = slice n-1.
    std::atomic<uint32_t> bassSteps[kPatterns][kSteps];
    std::atomic<uint32_t> chopSteps[kPatterns][kSteps];
    // Pad sequence: low 16 bits = step on, high 16 bits = accent, like the drum lanes.
    std::atomic<uint32_t> padSteps[kPatterns][Sampler::kPads];
    std::atomic<int> pattern{0}, queued{-1}, curStep{-1};
    std::atomic<bool> localRun{false}, followHost{true}, hostPlayingNow{false}, hostPresentNow{false}, active{false};
    std::atomic<double> bpmNow{120};
    std::atomic<float> levelL{0}, levelR{0};

    static constexpr int kScope = 2048;
    std::atomic<int> scopeW{0};
    float scope[kScope] = {0};

    Ring<Cmd, 512> fromUI, fromMidi, fromTouch;

    // MIDI clock for outside gear: 24 ticks a beat plus start and stop. The audio thread stamps each
    // message with when it should leave, and the MIDI thread in midi_input.mm sends it.
    struct MidiOut { uint8_t status; uint64_t when; };
    Ring<MidiOut, 1024> midiOut;
    Param* clockOut;
    std::atomic<int> midiDests{-1};           // outputs found, -1 until the MIDI thread has looked
    std::atomic<double> clockDelaySec{.008};  // lines the clock up with when the audio is actually heard

    // Song chain: pattern letters played in order, one bar each.
    static constexpr int kChainMax = 64;
    std::atomic<int> chain[kChainMax];
    std::atomic<int> chainLen{0}, chainPos{0};
    std::atomic<bool> chainOn{false};
    std::atomic<int> chainNow{-1};
    std::atomic<uint32_t> mutMask{0};  // which lanes the randomizer changed on the current step

    // Whole-take recording: a ring the server thread empties to disk.
    std::atomic<bool> takeOn{false};
    std::vector<float> takeRing;
    std::atomic<uint32_t> takeW{0}, takeR{0};

    // Recording what Marea itself is playing. Buffers are owned by Core.
    std::atomic<bool> recOutput{false};
    std::atomic<int> recCount{0};
    float* recL = nullptr; float* recR = nullptr; int recCap = 0;
    double sampleRate() const { return sr; }

    Engine();
    void prepare(double sampleRate, int maxFrames);
    void reset();
    void render(float* outL, float* outR, int frames, const Transport& t);

    void midiEvent(int status, int d1, int d2, int offset);
    void togglePlay();
    void selectPattern(int p);
    void clearPattern(int p);
    void copyPattern(int src, int dst);
    void loadFactoryPatterns();
    static const char* patternName(int i);

private:
    Module* moduleForIndex(int m) { return m == 0 ? (Module*)&pulse : m == 1 ? (Module*)&sampler : m == 2 ? (Module*)&bass : (Module*)&chop; }
    void renderChunk(int offset, int n, float* outL, float* outR);
    void scheduleSteps(double beat0, double beat1, double beatsPerFrame, int frames);
    void applyCmd(const Cmd& c);
    void scheduleClock(double beat0, double beat1, double beatsPerFrame, uint64_t base, bool run);
    bool clockStarted = false;

    uint32_t rng = 0x9E3779B9;
    inline float rnd() { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return (rng >> 8) * (1.0f / 16777216.0f); }
    double sr = 48000, localBeat = 0;
    bool wasActive = false;
    int maxF = 4096;
    std::vector<float> L, R, sL, sR;
    Cmd pendingBuf[512]; int pendingN = 0;
    dsp::SVF sweepL, sweepR;
    float limGain = 1, dcL = 0, dcR = 0, scopeDecim = 0;
    dsp::Smooth volS, driveS;
    float sweepS = .5f;
    float clickEnv = 0, clickPh = 0, clickHz = 1000;
};
