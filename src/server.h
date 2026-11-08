// A tiny HTTP + WebSocket server. It serves the panel to the plugin window and to the iPad, keeps
// them all in sync, and takes sample uploads. Nothing here runs on the audio thread.
#pragma once
#include <atomic>
#include <string>
#include <thread>
#include <vector>

class Core;

class Server {
public:
    explicit Server(Core& core) : core_(core) {}
    ~Server() { stop(); }
    bool start();
    void stop();
    int port() const { return port_; }
private:
    struct Conn {
        int fd = -1;
        std::string in, out;
        bool ws = false, closing = false, handshook = false, wantsHello = false;
    };
    void loop();
    void handleHTTP(Conn& c);
    void handleWS(Conn& c);
    void wsSend(Conn& c, const std::string& text);
    void tick();
    std::string helloJson();
    std::string fullSteps();
    Core& core_;
    int listenFd_ = -1, port_ = 0;
    std::atomic<bool> run_{false};
    std::thread th_;
    std::vector<Conn*> conns_;
    std::vector<float> shadowParams_;
    std::vector<uint32_t> shadowSteps_;
    int shadowPads_ = 0, shadowChop_ = 0, shadowRec_ = 0, shadowChain_ = 0, shadowTake_ = 0;
    std::vector<uint32_t> shadowBass_, shadowChopSteps_;
    std::vector<uint32_t> shadowPadSteps_;
};
