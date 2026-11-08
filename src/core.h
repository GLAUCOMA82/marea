// Core = Engine + saved state + sample loading + the network server that drives the panel.
// Shared unchanged by the Audio Unit, the standalone app and the test tool.
#pragma once
#include "engine.h"
#include "modules/chop.h"
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class Server;

class Core {
public:
    explicit Core(std::string hostName);
    ~Core();
    Engine engine;
    std::string hostName;

    void startServer();  // safe to call repeatedly
    int port() const;
    const std::string& token() const { return token_; }

    // Text command protocol, used by the WebSocket and by saved state. One command per line.
    void command(const std::string& line);
    std::string saveState();
    void loadState(const std::string& text);

    bool loadSampleFile(int pad, const std::string& path, std::string* err = nullptr);
    void restoreBuiltin(int pad);
    void reapSamples();
    std::string padsJson();
    std::string chopJson();
    std::atomic<int> chopVersion{1};

    // CHOP: load a file or recording, work out its tempo, cut it and lay the slices across the patterns.
    bool loadChopFile(const std::string& path, std::string* err = nullptr, bool fillSequence = true);
    void rechop(bool fillSequence);

    // Recording. dest: 0-5 = sample pad, 100 = CHOP. source: 0 = microphone/input, 1 = Marea's own output.
    bool startRecording(int dest, int source, std::string* err = nullptr);
    void stopRecording();
    std::atomic<bool> recording{false};
    std::atomic<float> recLevel{0};
    std::atomic<float> recSeconds{0};
    std::atomic<int> recVersion{0};
    // Whole takes: Marea's output written straight to a WAV file for as long as you like.
    bool startTake();
    void stopTake();
    std::atomic<bool> taking{false};
    std::atomic<float> takeSeconds{0};
    std::string lastTakeName();
    std::atomic<int> takeVersion{0};

    // Songs: everything saved under a name, in Documents on iPad and ~/Music/Marea on Mac.
    bool saveProject(const std::string& name);
    bool openProject(const std::string& name);
    std::string projectsJson();
    static std::string dataDir(const char* sub);
    void snapshot();
    void undoSnapshot();

    // Keys and pads pressed on the iPad fire from the native touch before the page even hears about it.
    void instantHit(int module, int index, float vel);
    void previewFile(const std::string& path);
    void setLiveMic(bool open);
    std::function<bool()> liveMicStarted;   // host hook: iPad routes input through its render callback
    std::function<void()> liveMicStopped;
    std::atomic<float> outLatencyMs{0};
    bool loadLaneFile(int lane, const std::string& path, std::string* err = nullptr);
    void clearLane(int lane);
    std::string lanesJson();
    bool loadRiddimKit(std::string* err = nullptr);
    void useSynthKit();
    std::atomic<int> chainVersion{1};
    std::string chainJson();
    std::string lastRecError();
    void serviceRecording();  // called regularly from the server thread
    std::atomic<int> padsVersion{1};

    // Called on the server thread so a host can record automation when a panel control moves.
    std::function<void(int id, float value)> onParamFromUI;
    std::function<void(int id, bool begin)> onGesture;
    // iPad only: get the audio session ready before and after using the microphone.
    std::function<bool()> prepareMic;
    std::function<void()> micFinished;

    std::string webRoot;
    static std::string supportDir();
private:
    std::mutex padMutex_;
    std::vector<std::unique_ptr<ChopData>> ownedChops_;
    std::vector<std::pair<ChopData*, double>> retiringChops_;
    void installChop(std::unique_ptr<ChopData> d);
    bool decodeFile(const std::string& path, SampleBuf& b, std::string* err);
    // Recording state
    std::vector<float> recBufL_, recBufR_;
    std::atomic<int> micCount_{0};
    int recDest_ = 0, recSource_ = 0, recRate_ = 48000, recCap_ = 0;
    void* recQueue_ = nullptr;
    void* liveQueue_ = nullptr;
    SampleBuf* previewOwned_ = nullptr;
    std::atomic<int> instantCount_[4][128];
    std::atomic<double> instantAt_[4][128];
    friend void liveMicCallback(void*, struct OpaqueAudioQueue*, struct AudioQueueBuffer*, const struct AudioTimeStamp*, unsigned int, const struct AudioStreamPacketDescription*);
    double recStarted_ = 0;
    std::string recError_, takeName_, snapshot_;
    void* takeFile_ = nullptr;
    int64_t takeFrames_ = 0;
    int takeRate_ = 48000;
    void drainTake(bool closing);
    void applyMicFx(std::vector<float>& L, std::vector<float>& R, int& n, int rate, int fx);
    friend void micInputCallback(void*, struct OpaqueAudioQueue*, struct AudioQueueBuffer*, const struct AudioTimeStamp*, unsigned int, const struct AudioStreamPacketDescription*);
    std::vector<std::unique_ptr<SampleBuf>> ownedBufs_;
    std::vector<std::pair<SampleBuf*, double>> retiring_;
    std::vector<std::unique_ptr<SampleBuf>> builtin_;
    std::unique_ptr<Server> server_;
    std::string token_;
    void installBuf(int pad, std::unique_ptr<SampleBuf> b);
};

std::string urlForLAN(int port, const std::string& token);
