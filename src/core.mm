#include "core.h"
#include "server.h"
#include "analysis.h"
#import <Foundation/Foundation.h>
#include <TargetConditionals.h>
#include <unistd.h>
#import <AudioToolbox/AudioToolbox.h>
#include <arpa/inet.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <sstream>
#include <algorithm>

static void jsonEscape(std::ostringstream& os, const std::string& s);
static void fillChopSequence(Engine& e, const ChopData& d);

std::string Core::supportDir() {
    NSString* dir = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Marea"];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    return dir.UTF8String;
}

// The access code stays the same between launches, so an iPad home-screen icon keeps working.
static std::string loadToken() {
    std::string path = Core::supportDir() + "/token";
    NSString* existing = [NSString stringWithContentsOfFile:@(path.c_str()) encoding:NSUTF8StringEncoding error:nil];
    if (existing.length >= 8) return [existing stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].UTF8String;
    uint8_t bytes[6];
    arc4random_buf(bytes, sizeof bytes);
    char s[16];
    snprintf(s, sizeof s, "%02x%02x%02x%02x%02x%02x", bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    [@(s) writeToFile:@(path.c_str()) atomically:YES encoding:NSUTF8StringEncoding error:nil];
    return s;
}

Core::Core(std::string host) : hostName(std::move(host)) {
    token_ = loadToken();
    for (int i = 0; i < Sampler::kBuiltins; i++) {
        builtin_.push_back(Sampler::makeBuiltin(i));
        engine.sampler.install(i, builtin_[i].get());
    }
    for (auto& m : instantCount_) for (auto& v : m) v = 0;
    for (auto& m : instantAt_) for (auto& v : m) v = 0;
}
Core::~Core() { server_.reset(); setLiveMic(false); stopTake(); stopRecording(); serviceRecording(); }

void Core::startServer() {
    if (server_) return;
    server_ = std::make_unique<Server>(*this);
    if (!server_->start()) server_.reset();
}
int Core::port() const { return server_ ? server_->port() : 0; }

void Core::command(const std::string& line) {
    std::istringstream is(line);
    std::string c;
    is >> c;
    Engine& e = engine;
    if (c == "p") {
        int id; float v;
        if (is >> id >> v) if (Param* p = e.params.byId(id)) { p->set(v); if (onParamFromUI) onParamFromUI(id, p->get()); }
    } else if (c == "pb" || c == "pe") {
        int id;
        if ((is >> id) && onGesture) onGesture(id, c == "pb");
    } else if (c == "s") {
        int pat, tr, st, val;
        if ((is >> pat >> tr >> st >> val) && pat >= 0 && pat < Engine::kPatterns && tr >= 0 && tr < Engine::kTracks && st >= 0 && st < Engine::kSteps) {
            uint32_t on = 1u << st, ac = 1u << (st + 16);
            uint32_t v = e.steps[pat][tr].load();
            v &= ~(on | ac);
            if (val >= 1) v |= on;
            if (val >= 2) v |= ac;
            e.steps[pat][tr].store(v);
        }
    } else if (c == "pat") { int p; if (is >> p) e.selectPattern(p); }
    else if (c == "hit") {
        int m, i; float vel = .9f;
        if (is >> m >> i) {
            is >> vel;
            if (m >= 0 && m <= 3 && i >= 0 && i < 128) {
                // Already played by the native touch handler: the page's copy of the press is dropped.
                if (instantCount_[m][i].load() > 0) {
                    bool recent = CFAbsoluteTimeGetCurrent() - instantAt_[m][i].load() < .25;
                    instantCount_[m][i].fetch_sub(1);
                    if (recent) return;
                }
                e.fromUI.push({Engine::Cmd::Hit, (uint8_t)m, (uint8_t)i, vel, 0});
            }
        }
    }
    else if (c == "st") {
        int pat, tr; uint32_t v;
        if ((is >> pat >> tr >> v) && pat >= 0 && pat < Engine::kPatterns && tr >= 0 && tr < Engine::kTracks) e.steps[pat][tr].store(v);
    }
    else if (c == "chain") {
        // "chain <on> <a> <b> ...": replace the whole song chain.
        int on = 0, p, n = 0;
        is >> on;
        while ((is >> p) && n < Engine::kChainMax) if (p >= 0 && p < Engine::kPatterns) e.chain[n++].store(p);
        e.chainLen.store(n);
        if (e.chainPos.load() >= std::max(1, n)) e.chainPos.store(0);
        e.chainOn.store(on != 0 && n > 0);
        if (!e.chainOn.load()) e.chainNow.store(-1);
        chainVersion++;
    }
    else if (c == "ps") {
        int pat, i; uint32_t v;
        if ((is >> pat >> i >> v) && pat >= 0 && pat < Engine::kPatterns && i >= 0 && i < Sampler::kPads) e.padSteps[pat][i].store(v);
    }
    else if (c == "copy") { int a, b; if (is >> a >> b) e.copyPattern(a, b); }
    else if (c == "preview") { std::string path; std::getline(is, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1); previewFile(path); }
    else if (c == "micon") { int on = 0; is >> on; setLiveMic(on != 0); }
    else if (c == "takestart") startTake();
    else if (c == "takestop") stopTake();
    else if (c == "lanefile") {
        int t; std::string path;
        if (is >> t) { std::getline(is, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1); if (t >= 0 && t < Engine::kTracks) loadLaneFile(t, path); }
    }
    else if (c == "lanesynth") { int t; if ((is >> t) && t >= 0 && t < Engine::kTracks) clearLane(t); }
    else if (c == "kit") {
        std::string k; is >> k;
        // Your own Riddim pack, read from disk. The App Store version never loads it.
        bool riddim = k == "riddim";
#ifdef MAREA_STORE
        riddim = false;
#endif
        if (riddim) { std::string err; if (!loadRiddimKit(&err)) { recError_ = err; recVersion++; } }
        else useSynthKit();
    }
    else if (c == "save") { std::string n; std::getline(is, n); if (!n.empty() && n[0] == ' ') n.erase(0, 1); saveProject(n); }
    else if (c == "open") { std::string n; std::getline(is, n); if (!n.empty() && n[0] == ' ') n.erase(0, 1); openProject(n); }
    else if (c == "snapshot") snapshot();
    else if (c == "undo") undoSnapshot();
    else if (c == "rel") {
        int m, i;
        if ((is >> m >> i) && m >= 0 && m <= 3 && i >= 0) e.fromUI.push({Engine::Cmd::Release, (uint8_t)m, (uint8_t)i, 0, 0});
    }
    else if (c == "b") {
        int pat, st; uint32_t v;
        if ((is >> pat >> st >> v) && pat >= 0 && pat < Engine::kPatterns && st >= 0 && st < Engine::kSteps) e.bassSteps[pat][st].store(v);
    }
    else if (c == "cs") {
        int pat, st; uint32_t v;
        if ((is >> pat >> st >> v) && pat >= 0 && pat < Engine::kPatterns && st >= 0 && st < Engine::kSteps) e.chopSteps[pat][st].store(v);
    }
    else if (c == "chopmul") {
        // Fix a half-time or double-time guess by hand.
        float k = 0;
        if ((is >> k) && k > 0) if (ChopData* cur = e.chop.get()) {
            auto d = std::make_unique<ChopData>(*cur);
            d->fileBpm *= k; d->beats *= k; d->bpmFromName = false;
            makeSlices(*d, e.chop.div->index(), e.chop.mode->on(), e.chop.sens->get(), Chop::kMaxSlices);
            fillChopSequence(e, *d);
            installChop(std::move(d));
        }
    }
    else if (c == "rechop") { int fill = 0; is >> fill; rechop(fill != 0); }
    else if (c == "chopfile") {
        std::string path; std::getline(is, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1);
        loadChopFile(path);
    }
    else if (c == "rec") { int dest, src; if (is >> dest >> src) startRecording(dest, src); }
    else if (c == "recstop") stopRecording();
    else if (c == "play") e.togglePlay();
    else if (c == "clear") { int p; if (is >> p) e.clearPattern(p); }
    else if (c == "builtin") { int p; if ((is >> p) && p >= 0 && p < Sampler::kPads) restoreBuiltin(p); }
    else if (c == "loadpath") {
        int p; std::string path;
        if (is >> p) { std::getline(is, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1); if (p >= 0 && p < Sampler::kPads) loadSampleFile(p, path); }
    }
}

// iOS moves an app's folder when it updates, so saved paths are kept relative to the home folder.
static std::string toStoredPath(const std::string& path) {
    std::string h = NSHomeDirectory().UTF8String;
    return path.rfind(h + "/", 0) == 0 ? "~" + path.substr(h.size()) : path;
}
static std::string fromStoredPath(const std::string& path) {
    return path.rfind("~/", 0) == 0 ? std::string(NSHomeDirectory().UTF8String) + path.substr(1) : path;
}

std::string Core::saveState() {
    std::ostringstream os;
    os << "marea 1\n";
    for (auto& p : engine.params.all()) {
        // Momentary performance buttons never get saved in the pressed position.
        if (p.key == "sir.fire" || p.key == "ech.throw" || p.key == "ech.hold" || p.key == "ech.crash" || p.key == "mic.on") continue;
        os << "pk " << p.key << " " << p.get() << "\n";
    }
    for (int a = 0; a < Engine::kPatterns; a++)
        for (int t = 0; t < Engine::kTracks; t++) os << "st " << a << " " << t << " " << engine.steps[a][t].load() << "\n";
    for (int a = 0; a < Engine::kPatterns; a++)
        for (int st = 0; st < Engine::kSteps; st++) {
            os << "bs " << a << " " << st << " " << engine.bassSteps[a][st].load() << "\n";
            uint32_t cs = engine.chopSteps[a][st].load();
            if (cs) os << "ch " << a << " " << st << " " << cs << "\n";
        }
    for (int a = 0; a < Engine::kPatterns; a++)
        for (int i = 0; i < Sampler::kPads; i++) if (uint32_t v = engine.padSteps[a][i].load()) os << "ps " << a << " " << i << " " << v << "\n";
    os << "cur " << engine.pattern.load() << "\n";
    os << "chain " << (engine.chainOn.load() ? 1 : 0);
    for (int i = 0; i < engine.chainLen.load(); i++) os << " " << engine.chain[i].load();
    os << "\n";
    for (int t = 0; t < Engine::kTracks; t++) if (SampleBuf* b = engine.pulse.laneSample[t].load()) if (!b->path.empty()) os << "lane " << t << " " << toStoredPath(b->path) << "\n";
    if (ChopData* d = engine.chop.get()) if (!d->buf->path.empty()) os << "chop " << toStoredPath(d->buf->path) << "\n";
    std::lock_guard<std::mutex> g(padMutex_);
    for (int i = 0; i < Sampler::kPads; i++) if (SampleBuf* b = engine.sampler.get(i)) if (!b->path.empty()) os << "pad " << i << " " << toStoredPath(b->path) << "\n";
    return os.str();
}

void Core::loadState(const std::string& text) {
    std::istringstream is(text);
    std::string line;
    std::vector<bool> padSet(Sampler::kPads, false);
    bool chopCleared = false;
    std::vector<bool> laneSet(Engine::kTracks, false);
    for (auto& pat : engine.padSteps) for (auto& v : pat) v.store(0);
    while (std::getline(is, line)) {
        std::istringstream ls(line);
        std::string c; ls >> c;
        if (c == "pk") { std::string k; float v; if (ls >> k >> v) if (Param* p = engine.params.byKey(k)) p->set(v); }
        else if (c == "st") { int a, t; uint32_t v; if ((ls >> a >> t >> v) && a >= 0 && a < Engine::kPatterns && t >= 0 && t < Engine::kTracks) engine.steps[a][t].store(v); }
        else if (c == "bs") { int a, st; uint32_t v; if ((ls >> a >> st >> v) && a >= 0 && a < Engine::kPatterns && st >= 0 && st < Engine::kSteps) engine.bassSteps[a][st].store(v); }
        else if (c == "ch") { int a, st; uint32_t v; if ((ls >> a >> st >> v) && a >= 0 && a < Engine::kPatterns && st >= 0 && st < Engine::kSteps) { if (!chopCleared) { for (int x = 0; x < Engine::kPatterns; x++) for (int y = 0; y < Engine::kSteps; y++) engine.chopSteps[x][y] = 0; chopCleared = true; } engine.chopSteps[a][st].store(v); } }
        else if (c == "ps") { int a, i; uint32_t v; if ((ls >> a >> i >> v) && a >= 0 && a < Engine::kPatterns && i >= 0 && i < Sampler::kPads) engine.padSteps[a][i].store(v); }
        else if (c == "chain") {
            int on = 0, p, n = 0;
            ls >> on;
            while ((ls >> p) && n < Engine::kChainMax) if (p >= 0 && p < Engine::kPatterns) engine.chain[n++].store(p);
            engine.chainLen.store(n); engine.chainPos.store(0); engine.chainOn.store(on != 0 && n > 0);
            chainVersion++;
        }
        else if (c == "lane") {
            int t; std::string path;
            if (ls >> t) { std::getline(ls, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1);
                if (t >= 0 && t < Engine::kTracks && loadLaneFile(t, fromStoredPath(path))) laneSet[t] = true; }
        }
        else if (c == "chop") { std::string path; std::getline(ls, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1); loadChopFile(fromStoredPath(path), nullptr, false); }
        else if (c == "cur") { int p; if (ls >> p) engine.pattern = std::clamp(p, 0, Engine::kPatterns - 1); }
        else if (c == "pad") {
            int i; std::string path;
            if (ls >> i) { std::getline(ls, path); if (!path.empty() && path[0] == ' ') path.erase(0, 1);
                if (i >= 0 && i < Sampler::kPads && loadSampleFile(i, fromStoredPath(path))) padSet[i] = true; }
        }
    }
    for (int t = 0; t < Engine::kTracks; t++) if (!laneSet[t]) clearLane(t);
    for (int i = 0; i < Sampler::kPads; i++) if (!padSet[i]) { SampleBuf* b = engine.sampler.get(i); if (b && !b->path.empty()) restoreBuiltin(i); }
}

void Core::installBuf(int pad, std::unique_ptr<SampleBuf> b) {
    std::lock_guard<std::mutex> g(padMutex_);
    SampleBuf* old = engine.sampler.get(pad);
    engine.sampler.install(pad, b.get());
    ownedBufs_.push_back(std::move(b));
    if (old && !old->path.empty()) retiring_.push_back({old, CFAbsoluteTimeGetCurrent()});
    padsVersion++;
}
void Core::restoreBuiltin(int pad) {
    std::lock_guard<std::mutex> g(padMutex_);
    SampleBuf* old = engine.sampler.get(pad);
    engine.sampler.install(pad, pad < (int)builtin_.size() ? builtin_[pad].get() : nullptr);
    if (old && !old->path.empty()) retiring_.push_back({old, CFAbsoluteTimeGetCurrent()});
    padsVersion++;
}
// Old samples are freed a few seconds after being replaced so the audio thread can never touch freed memory.
void Core::reapSamples() {
    std::lock_guard<std::mutex> g(padMutex_);
    double now = CFAbsoluteTimeGetCurrent();
    for (auto it = retiring_.begin(); it != retiring_.end();) {
        if (now - it->second > 3) {
            SampleBuf* dead = it->first;
            ownedBufs_.erase(std::remove_if(ownedBufs_.begin(), ownedBufs_.end(), [&](auto& u) { return u.get() == dead; }), ownedBufs_.end());
            it = retiring_.erase(it);
        } else ++it;
    }
    for (auto it = retiringChops_.begin(); it != retiringChops_.end();) {
        if (now - it->second > 3) {
            ChopData* dead = it->first;
            ownedChops_.erase(std::remove_if(ownedChops_.begin(), ownedChops_.end(), [&](auto& u) { return u.get() == dead; }), ownedChops_.end());
            it = retiringChops_.erase(it);
        } else ++it;
    }
}

// Silence at the start of a file is heard as lag, so one-shots begin right at their first sound.
static void trimLeadingSilence(SampleBuf& b) {
    size_t n = b.L.size();
    float peak = 0;
    for (size_t i = 0; i < n; i++) peak = std::max({peak, std::fabs(b.L[i]), std::fabs(b.R[i])});
    float thr = std::max(peak * .01f, 1e-4f);
    size_t a = 0;
    while (a < n && std::fabs(b.L[a]) < thr && std::fabs(b.R[a]) < thr) a++;
    a = a > 16 ? a - 16 : 0;  // keep a few samples so the attack stays intact
    if (a > 0 && a + 64 < n) { b.L.erase(b.L.begin(), b.L.begin() + a); b.R.erase(b.R.begin(), b.R.begin() + a); Sampler::buildOverview(b); }
}

void Core::previewFile(const std::string& path) {
    if (path.empty()) { engine.sampler.previewBuf.store(nullptr, std::memory_order_release); return; }
    // Decoding can take a moment and must not hold up keys and pads.
    std::string p = path;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        auto b = std::make_unique<SampleBuf>();
        if (!decodeFile(p, *b, nullptr)) return;
        std::lock_guard<std::mutex> g(padMutex_);
        SampleBuf* old = engine.sampler.previewBuf.load();
        engine.sampler.previewBuf.store(b.get(), std::memory_order_release);
        engine.sampler.previewGo.store(true);
        ownedBufs_.push_back(std::move(b));
        if (old) retiring_.push_back({old, CFAbsoluteTimeGetCurrent()});
    });
}

void Core::instantHit(int m, int i, float vel) {
    if (m < 0 || m > 3 || i < 0 || i >= 128) return;
    instantAt_[m][i].store(CFAbsoluteTimeGetCurrent());
    instantCount_[m][i].fetch_add(1);
    engine.fromTouch.push({Engine::Cmd::Hit, (uint8_t)m, (uint8_t)i, vel, 0});
}

bool Core::loadSampleFile(int pad, const std::string& path, std::string* err) {
    auto b = std::make_unique<SampleBuf>();
    if (!decodeFile(path, *b, err)) return false;
    trimLeadingSilence(*b);
    installBuf(pad, std::move(b));
    return true;
}

bool Core::decodeFile(const std::string& path, SampleBuf& bb, std::string* err) {
    SampleBuf* b = &bb;
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)path.c_str(), path.size(), false);
    ExtAudioFileRef f = nullptr;
    OSStatus st = ExtAudioFileOpenURL(url, &f);
    CFRelease(url);
    if (st != noErr) { if (err) *err = "Couldn't open that file as audio"; return false; }
    AudioStreamBasicDescription src{}; UInt32 sz = sizeof src;
    ExtAudioFileGetProperty(f, kExtAudioFileProperty_FileDataFormat, &sz, &src);
    AudioStreamBasicDescription fmt{};
    fmt.mSampleRate = src.mSampleRate > 0 ? src.mSampleRate : 48000;
    fmt.mFormatID = kAudioFormatLinearPCM;
    fmt.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved;
    fmt.mChannelsPerFrame = 2; fmt.mFramesPerPacket = 1; fmt.mBitsPerChannel = 32; fmt.mBytesPerFrame = 4; fmt.mBytesPerPacket = 4;
    if (ExtAudioFileSetProperty(f, kExtAudioFileProperty_ClientDataFormat, sizeof fmt, &fmt) != noErr) { ExtAudioFileDispose(f); if (err) *err = "Unsupported audio format"; return false; }
    SInt64 frames = 0; sz = sizeof frames;
    ExtAudioFileGetProperty(f, kExtAudioFileProperty_FileLengthFrames, &sz, &frames);
    frames = std::min<SInt64>(frames, (SInt64)(fmt.mSampleRate * 90));  // pads are for shots and loops: 90 s max
    if (frames <= 4) { ExtAudioFileDispose(f); if (err) *err = "That file is empty"; return false; }
    b->sr = fmt.mSampleRate;
    b->L.assign(frames, 0); b->R.assign(frames, 0);
    SInt64 done = 0;
    while (done < frames) {
        struct { AudioBufferList l; AudioBuffer second; } abl;
        abl.l.mNumberBuffers = 2;
        UInt32 want = (UInt32)std::min<SInt64>(frames - done, 65536);
        abl.l.mBuffers[0] = {1, want * 4, b->L.data() + done};
        abl.second = {1, want * 4, b->R.data() + done};
        UInt32 got = want;
        if (ExtAudioFileRead(f, &got, &abl.l) != noErr || got == 0) break;
        done += got;
    }
    ExtAudioFileDispose(f);
    if (done <= 4) { if (err) *err = "Couldn't read that file"; return false; }
    b->L.resize(done); b->R.resize(done);
    b->path = path;
    NSString* name = [@(path.c_str()).lastPathComponent stringByDeletingPathExtension];
    b->name = name.UTF8String ?: "SAMPLE";
    Sampler::buildOverview(*b);
    return true;
}

void Core::installChop(std::unique_ptr<ChopData> d) {
    std::lock_guard<std::mutex> g(padMutex_);
    ChopData* old = engine.chop.get();
    engine.chop.install(d.get());
    ownedChops_.push_back(std::move(d));
    if (old) retiringChops_.push_back({old, CFAbsoluteTimeGetCurrent()});
    chopVersion++;
}

// Lay each slice on the step where it falls in the file. Pattern A is the first bar, B the next, and
// the loop repeats if there are more patterns than bars.
static void fillChopSequence(Engine& e, const ChopData& d) {
    int n = (int)d.starts.size();
    if (!n) return;
    const int steps = Engine::kPatterns * Engine::kSteps;
    std::vector<uint32_t> line(steps, 0);
    double framesPer16th = d.fileBpm > 1 ? d.buf->sr * 60 / d.fileBpm / 4 : 0;
    int loop = d.fileBpm > 1 ? std::clamp((int)std::lround(d.beats * 4), 1, steps) : n;
    for (int i = 0; i < n; i++) {
        int at = framesPer16th > 0 ? (int)std::lround(d.starts[i] / framesPer16th) : i;
        if (at < loop) line[at] = (uint32_t)i + 1;
    }
    for (int a = 0; a < steps; a++) e.chopSteps[a / Engine::kSteps][a % Engine::kSteps].store(line[a % loop]);
}

bool Core::loadChopFile(const std::string& path, std::string* err, bool fillSequence) {
    auto b = std::make_shared<SampleBuf>();
    if (!decodeFile(path, *b, err)) return false;
    auto d = std::make_unique<ChopData>();
    d->buf = b;
    analyzeTempo(*d);
    makeSlices(*d, engine.chop.div->index(), engine.chop.mode->on(), engine.chop.sens->get(), Chop::kMaxSlices);
    if (fillSequence) fillChopSequence(engine, *d);
    installChop(std::move(d));
    return true;
}

void Core::rechop(bool fillSequence) {
    ChopData* cur = engine.chop.get();
    if (!cur) return;
    auto d = std::make_unique<ChopData>();
    d->buf = cur->buf; d->stepsPerSlice = cur->stepsPerSlice; d->fileBpm = cur->fileBpm; d->beats = cur->beats; d->bpmFromName = cur->bpmFromName;
    makeSlices(*d, engine.chop.div->index(), engine.chop.mode->on(), engine.chop.sens->get(), Chop::kMaxSlices);
    if (fillSequence) fillChopSequence(engine, *d);
    installChop(std::move(d));
}

std::string Core::chopJson() {
    std::lock_guard<std::mutex> g(padMutex_);
    ChopData* d = engine.chop.get();
    if (!d) return "null";
    const SampleBuf& b = *d->buf;
    // A finer overview than the pads use, signed peaks are not needed.
    const int N = 400;
    std::ostringstream os;
    os << "{\"name\":";
    jsonEscape(os, b.name);
    os << ",\"bpm\":" << d->fileBpm << ",\"beats\":" << d->beats << ",\"named\":" << (d->bpmFromName ? 1 : 0) << ",\"secs\":" << b.L.size() / b.sr << ",\"starts\":[";
    for (size_t i = 0; i < d->starts.size(); i++) os << (i ? "," : "") << (double)d->starts[i] / (double)b.L.size();
    os << "],\"wave\":[";
    std::vector<float> v(N, 0);
    float peak = 1e-5f;
    size_t len = b.L.size();
    for (int i = 0; i < N; i++) {
        size_t a = len * i / N, z = std::max(a + 1, len * (i + 1) / N);
        for (size_t n = a; n < z && n < len; n += std::max<size_t>(1, (z - a) / 64)) v[i] = std::max(v[i], std::fabs(b.L[n]));
        peak = std::max(peak, v[i]);
    }
    for (int i = 0; i < N; i++) os << (i ? "," : "") << (int)(v[i] / peak * 99);
    os << "]}";
    return os.str();
}

// ---------------- lanes, kits, songs, takes ----------------
bool Core::loadLaneFile(int lane, const std::string& path, std::string* err) {
    auto b = std::make_unique<SampleBuf>();
    if (!decodeFile(path, *b, err)) return false;
    trimLeadingSilence(*b);
    std::lock_guard<std::mutex> g(padMutex_);
    SampleBuf* old = engine.pulse.laneSample[lane].load();
    engine.pulse.laneSample[lane].store(b.get(), std::memory_order_release);
    ownedBufs_.push_back(std::move(b));
    if (old) retiring_.push_back({old, CFAbsoluteTimeGetCurrent()});
    padsVersion++;
    return true;
}
void Core::clearLane(int lane) {
    std::lock_guard<std::mutex> g(padMutex_);
    SampleBuf* old = engine.pulse.laneSample[lane].exchange(nullptr);
    if (old) { retiring_.push_back({old, CFAbsoluteTimeGetCurrent()}); padsVersion++; }
}
std::string Core::lanesJson() {
    std::lock_guard<std::mutex> g(padMutex_);
    std::ostringstream os; os << "[";
    for (int t = 0; t < Engine::kTracks; t++) {
        SampleBuf* b = engine.pulse.laneSample[t].load();
        if (t) os << ",";
        jsonEscape(os, b ? b->name : "");
    }
    os << "]";
    return os.str();
}
void Core::useSynthKit() {
    for (int t = 0; t < Engine::kTracks; t++) clearLane(t);
    for (int i = 0; i < Sampler::kPads; i++) restoreBuiltin(i);
}
// Your own Riddim selection, read from disk. Nothing from it is stored inside Marea.
bool Core::loadRiddimKit(std::string* err) {
#ifdef MAREA_STORE
    // The App Store version doesn't know about personal sound packs at all.
    if (err) *err = "Not available in this version.";
    return false;
#else
    NSString* h = NSHomeDirectory();
    NSString* root = nil;
    for (NSString* c in @[@"Desktop/music/Selection EP-40 Riddim/Categorised", @"Documents/Riddim/Categorised", @"Documents/Riddim"]) {
        NSString* p = [h stringByAppendingPathComponent:c];
        BOOL d = NO;
        if ([NSFileManager.defaultManager fileExistsAtPath:p isDirectory:&d] && d) { root = p; break; }
    }
    if (!root) { if (err) *err = "Your Riddim folder wasn't found on this device."; return false; }
    NSMutableDictionary* byName = [NSMutableDictionary dictionary];
    NSDirectoryEnumerator* en = [NSFileManager.defaultManager enumeratorAtPath:root];
    for (NSString* rel in en) if ([rel.pathExtension.lowercaseString isEqualToString:@"wav"]) byName[rel.lastPathComponent.lowercaseString] = [root stringByAppendingPathComponent:rel];
    auto find = [&](const char* part) -> std::string {
        NSString* q = @(part);
        for (NSString* k in [byName.allKeys sortedArrayUsingSelector:@selector(compare:)]) if ([k containsString:q]) return ((NSString*)byName[k]).UTF8String;
        return "";
    };
    static const char* lanes[Engine::kTracks] = {"sub kik", "ep 40 snare a", "tik rim", "box clap", "ep 40 hh", "ep 40 oh", "flapjack tom a", "mpc perc"};
    static const char* pads[24] = {"horn skank amin", "eras bass", "rewind", "million boom", "backspin", "lazer",
        "thumpi kick", "clangy sn", "hand perc b", "sds tom", "mpc bass a", "beethree amin a",
        "guit amin", "guit emin", "horn skank e min", "horn skank gmaj", "baby g mel a", "mflux fill b",
        "hyper champion", "call it", "etana one two", "global", "trigga", "jammy fill b"};
    int loaded = 0;
    for (int t = 0; t < Engine::kTracks; t++) { std::string f = find(lanes[t]); if (!f.empty() && loadLaneFile(t, f)) loaded++; }
    for (int i = 0; i < 24; i++) { std::string f = find(pads[i]); if (!f.empty() && loadSampleFile(i, f)) loaded++; }
    if (!loaded && err) *err = "No matching sounds were found in your Riddim folder.";
    return loaded > 0;
#endif
}

std::string Core::dataDir(const char* sub) {
#if TARGET_OS_IOS
    NSString* base = [NSHomeDirectory() stringByAppendingPathComponent:@"Documents"];
#else
    NSString* base = [NSHomeDirectory() stringByAppendingPathComponent:@"Music/Marea"];
#endif
    NSString* d = [base stringByAppendingPathComponent:@(sub)];
    [NSFileManager.defaultManager createDirectoryAtPath:d withIntermediateDirectories:YES attributes:nil error:nil];
    return d.UTF8String;
}
static std::string safeName(std::string n) {
    for (auto& ch : n) if (ch == '/' || ch == ':' || ch == '\\' || (unsigned char)ch < 0x20) ch = '-';
    while (!n.empty() && (n[0] == '.' || n[0] == ' ')) n.erase(0, 1);
    return n.empty() ? "Untitled" : n.substr(0, 80);
}
bool Core::saveProject(const std::string& name) {
    std::string text = saveState();
    NSString* path = [NSString stringWithFormat:@"%s/%s.marea", dataDir("Songs").c_str(), safeName(name).c_str()];
    return [@(text.c_str()) writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
}
bool Core::openProject(const std::string& name) {
    NSString* path = [NSString stringWithFormat:@"%s/%s.marea", dataDir("Songs").c_str(), safeName(name).c_str()];
    NSString* t = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
    if (!t) return false;
    snapshot();
    loadState(t.UTF8String);
    return true;
}
std::string Core::projectsJson() {
    NSString* dir = @(dataDir("Songs").c_str());
    NSArray* names = [[NSFileManager.defaultManager contentsOfDirectoryAtPath:dir error:nil] sortedArrayUsingSelector:@selector(localizedStandardCompare:)];
    std::ostringstream os; os << "["; bool first = true;
    for (NSString* n in names) if ([n.pathExtension isEqualToString:@"marea"]) { os << (first ? "" : ","); jsonEscape(os, n.stringByDeletingPathExtension.UTF8String); first = false; }
    os << "]";
    return os.str();
}
void Core::snapshot() { snapshot_ = saveState(); }
void Core::undoSnapshot() { if (!snapshot_.empty()) { std::string t = snapshot_; loadState(t); } }

std::string Core::chainJson() {
    std::ostringstream os;
    os << "{\"on\":" << (engine.chainOn.load() ? 1 : 0) << ",\"list\":[";
    for (int i = 0; i < engine.chainLen.load(); i++) os << (i ? "," : "") << engine.chain[i].load();
    os << "]}";
    return os.str();
}

bool Core::startTake() {
    if (taking.load()) return false;
    takeRate_ = (int)engine.sampleRate();
    NSDateFormatter* df = [NSDateFormatter new];
    df.dateFormat = @"yyyy-MM-dd HH.mm.ss";
    NSString* name = [NSString stringWithFormat:@"Marea %@.wav", [df stringFromDate:NSDate.date]];
    std::string path = dataDir("Takes") + "/" + name.UTF8String;
    AudioStreamBasicDescription file{};
    file.mSampleRate = takeRate_; file.mFormatID = kAudioFormatLinearPCM;
    file.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
    file.mFramesPerPacket = 1; file.mChannelsPerFrame = 2; file.mBitsPerChannel = 24; file.mBytesPerFrame = 6; file.mBytesPerPacket = 6;
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)path.c_str(), path.size(), false);
    ExtAudioFileRef f = nullptr;
    OSStatus st = ExtAudioFileCreateWithURL(url, kAudioFileWAVEType, &file, nullptr, kAudioFileFlags_EraseFile, &f);
    CFRelease(url);
    if (st != noErr) { recError_ = "Couldn't start the recording."; recVersion++; return false; }
    AudioStreamBasicDescription client{};
    client.mSampleRate = takeRate_; client.mFormatID = kAudioFormatLinearPCM;
    client.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    client.mFramesPerPacket = 1; client.mChannelsPerFrame = 2; client.mBitsPerChannel = 32; client.mBytesPerFrame = 8; client.mBytesPerPacket = 8;
    ExtAudioFileSetProperty(f, kExtAudioFileProperty_ClientDataFormat, sizeof client, &client);
    takeFile_ = f;
    takeFrames_ = 0;
    takeName_ = name.UTF8String;
    engine.takeRing.assign((size_t)takeRate_ * 2 * 8, 0);  // 8 s of slack if the disk stalls
    engine.takeW = 0; engine.takeR = 0;
    engine.takeOn = true;
    taking = true;
    takeSeconds = 0;
    takeVersion++;
    return true;
}
void Core::drainTake(bool closing) {
    if (!takeFile_) return;
    uint32_t r = engine.takeR.load(std::memory_order_relaxed), w = engine.takeW.load(std::memory_order_acquire), cap = (uint32_t)engine.takeRing.size();
    static thread_local std::vector<float> chunk;
    uint32_t avail = w - r;
    if (avail >= 2) {
        chunk.resize(avail);
        for (uint32_t i = 0; i < avail; i++) chunk[i] = engine.takeRing[(r + i) % cap];
        engine.takeR.store(r + avail, std::memory_order_release);
        AudioBufferList abl;
        abl.mNumberBuffers = 1;
        abl.mBuffers[0] = {2, avail * (UInt32)sizeof(float), chunk.data()};
        ExtAudioFileWrite((ExtAudioFileRef)takeFile_, avail / 2, &abl);
        takeFrames_ += avail / 2;
    }
    takeSeconds = (float)takeFrames_ / takeRate_;
    if (closing) { ExtAudioFileDispose((ExtAudioFileRef)takeFile_); takeFile_ = nullptr; }
}
void Core::stopTake() {
    if (!taking.load()) return;
    engine.takeOn = false;
    taking = false;
    usleep(30000);  // let the audio thread finish its last chunk
    drainTake(true);
    takeVersion++;
}
std::string Core::lastTakeName() { return takeName_; }

// Effects for microphone recordings, all made here: they colour the sound before it lands on a pad.
void Core::applyMicFx(std::vector<float>& L, std::vector<float>& R, int& n, int rate, int fx) {
    using namespace dsp;
    if (fx <= 0 || n < 16) return;
    float sr = (float)rate;
    if (fx == 4 || fx == 5) {  // SQUEAK up an octave, GIANT down an octave
        double step = fx == 4 ? 2.0 : .5;
        int m = std::min((int)(n / step), recCap_);
        std::vector<float> a(m), b(m);
        for (int i = 0; i < m; i++) {
            double p = i * step; int ip = std::min((int)p, n - 2); float fr = (float)(p - ip);
            a[i] = L[ip] + (L[ip + 1] - L[ip]) * fr; b[i] = R[ip] + (R[ip + 1] - R[ip]) * fr;
        }
        std::copy(a.begin(), a.end(), L.begin()); std::copy(b.begin(), b.end(), R.begin());
        n = m;
        return;
    }
    SVF hp, lp; hp.set(420, .8f, sr); lp.set(2800, 1.2f, sr);
    float ph = 0, heldL = 0, heldR = 0; int hold = 0;
    for (int i = 0; i < n; i++) {
        float l = L[i], r = R[i];
        if (fx == 1) {  // RADIO: narrow band, overdriven
            float m = (l + r) * .5f;
            hp.tick(m); lp.tick(hp.hp);
            l = r = soft(lp.lp * 5.f) * .75f;
        } else if (fx == 2) {  // CRUSH: fewer samples, fewer bits
            if (hold-- <= 0) { hold = rate / 7000; heldL = std::round(l * 12) / 12; heldR = std::round(r * 12) / 12; }
            l = heldL; r = heldR;
        } else if (fx == 3) {  // ROBOT: ring modulation
            ph += 92.f / sr; if (ph >= 1) ph -= 1;
            float c = std::sin(kTau * ph);
            l = soft(l * c * 2.2f); r = soft(r * c * 2.2f);
        }
        L[i] = l; R[i] = r;
    }
}

// ---------------- recording ----------------
static const int kMaxRecordSeconds = 30;

void micInputCallback(void* user, AudioQueueRef q, AudioQueueBufferRef buf, const AudioTimeStamp*, UInt32, const AudioStreamPacketDescription*) {
    Core* c = (Core*)user;
    int frames = (int)(buf->mAudioDataByteSize / (sizeof(float) * 2));
    const float* in = (const float*)buf->mAudioData;
    int n = c->micCount_.load(std::memory_order_relaxed);
    float pk = 0;
    for (int i = 0; i < frames && n < c->recCap_; i++, n++) {
        c->recBufL_[n] = in[i * 2]; c->recBufR_[n] = in[i * 2 + 1];
        pk = std::max(pk, std::fabs(in[i * 2]));
    }
    c->micCount_.store(n, std::memory_order_relaxed);
    c->recLevel.store(std::max(pk, c->recLevel.load(std::memory_order_relaxed) * .8f), std::memory_order_relaxed);
    if (c->recording.load(std::memory_order_relaxed)) AudioQueueEnqueueBuffer(q, buf, 0, nullptr);
}

bool Core::startRecording(int dest, int source, std::string* err) {
    if (recording.load()) return false;
    recError_.clear();
    recDest_ = dest; recSource_ = source;
    recStarted_ = CFAbsoluteTimeGetCurrent();
    micCount_ = 0;
    recLevel = 0; recSeconds = 0;
    if (source == 1) {
        recRate_ = (int)engine.sampleRate();
        recCap_ = recRate_ * kMaxRecordSeconds;
        recBufL_.assign(recCap_, 0); recBufR_.assign(recCap_, 0);
        engine.recL = recBufL_.data(); engine.recR = recBufR_.data(); engine.recCap = recCap_;
        engine.recCount = 0;
        engine.recOutput = true;
        recording = true;
        recVersion++;
        return true;
    }
    if (prepareMic && !prepareMic()) {
        recError_ = "Marea isn't allowed to use the microphone. You can turn it on in Settings, Privacy & Security, Microphone.";
        if (err) *err = recError_;
        recVersion++;
        return false;
    }
    AudioStreamBasicDescription f{};
    f.mSampleRate = 48000; f.mFormatID = kAudioFormatLinearPCM;
    f.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    f.mFramesPerPacket = 1; f.mChannelsPerFrame = 2; f.mBitsPerChannel = 32; f.mBytesPerFrame = 8; f.mBytesPerPacket = 8;
    recRate_ = 48000;
    recCap_ = recRate_ * kMaxRecordSeconds;
    recBufL_.assign(recCap_, 0); recBufR_.assign(recCap_, 0);
    AudioQueueRef q = nullptr;
    OSStatus st = AudioQueueNewInput(&f, micInputCallback, this, nullptr, nullptr, 0, &q);
    if (st == noErr) {
        recording = true;
        for (int i = 0; i < 4 && st == noErr; i++) {
            AudioQueueBufferRef b = nullptr;
            st = AudioQueueAllocateBuffer(q, 4096 * 8, &b);
            if (st == noErr) st = AudioQueueEnqueueBuffer(q, b, 0, nullptr);
        }
        if (st == noErr) st = AudioQueueStart(q, nullptr);
    }
    if (st != noErr) {
        recording = false;
        if (q) AudioQueueDispose(q, true);
        recError_ = "Couldn't start the microphone. Check that this app is allowed in Privacy & Security, Microphone.";
        if (micFinished) micFinished();
        if (err) *err = recError_;
        recVersion++;
        return false;
    }
    recQueue_ = q;
    recVersion++;
    return true;
}

std::string Core::lastRecError() { return recError_; }

// ---------------- live mic channel ----------------
void liveMicCallback(void* user, AudioQueueRef q, AudioQueueBufferRef buf, const AudioTimeStamp*, UInt32, const AudioStreamPacketDescription*) {
    Core* c = (Core*)user;
    c->engine.mic.push((const float*)buf->mAudioData, (int)(buf->mAudioDataByteSize / sizeof(float)));
    if (c->liveQueue_) AudioQueueEnqueueBuffer(q, buf, 0, nullptr);
}
void Core::setLiveMic(bool open) {
    bool isOpen = engine.mic.on->on();
    if (open == isOpen) return;
    if (!open) {
        engine.mic.on->set(0);
        if (liveQueue_) { AudioQueueRef q = (AudioQueueRef)liveQueue_; liveQueue_ = nullptr; AudioQueueStop(q, true); AudioQueueDispose(q, true); }
        if (liveMicStopped) liveMicStopped();
        return;
    }
    const char* denied = "Marea isn't allowed to use the microphone. You can turn it on in Settings, Privacy & Security, Microphone.";
    if (liveMicStarted) {
        if (!liveMicStarted()) { recError_ = denied; recVersion++; return; }
        engine.mic.on->set(1);
        return;
    }
    AudioStreamBasicDescription f{};
    f.mSampleRate = engine.sampleRate(); f.mFormatID = kAudioFormatLinearPCM;
    f.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    f.mFramesPerPacket = 1; f.mChannelsPerFrame = 1; f.mBitsPerChannel = 32; f.mBytesPerFrame = 4; f.mBytesPerPacket = 4;
    AudioQueueRef q = nullptr;
    OSStatus st = AudioQueueNewInput(&f, liveMicCallback, this, nullptr, nullptr, 0, &q);
    liveQueue_ = q;
    for (int i = 0; i < 3 && st == noErr; i++) {
        AudioQueueBufferRef b = nullptr;
        st = AudioQueueAllocateBuffer(q, 256 * 4, &b);
        if (st == noErr) st = AudioQueueEnqueueBuffer(q, b, 0, nullptr);
    }
    if (st == noErr) st = AudioQueueStart(q, nullptr);
    if (st != noErr) {
        liveQueue_ = nullptr;
        if (q) AudioQueueDispose(q, true);
        recError_ = denied; recVersion++;
        return;
    }
    engine.mic.on->set(1);
}

static bool writeWav(const std::string& path, const float* L, const float* R, int frames, int rate) {
    AudioStreamBasicDescription file{};
    file.mSampleRate = rate; file.mFormatID = kAudioFormatLinearPCM;
    file.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
    file.mFramesPerPacket = 1; file.mChannelsPerFrame = 2; file.mBitsPerChannel = 24; file.mBytesPerFrame = 6; file.mBytesPerPacket = 6;
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)path.c_str(), path.size(), false);
    ExtAudioFileRef f = nullptr;
    OSStatus st = ExtAudioFileCreateWithURL(url, kAudioFileWAVEType, &file, nullptr, kAudioFileFlags_EraseFile, &f);
    CFRelease(url);
    if (st != noErr) return false;
    AudioStreamBasicDescription client{};
    client.mSampleRate = rate; client.mFormatID = kAudioFormatLinearPCM;
    client.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved;
    client.mFramesPerPacket = 1; client.mChannelsPerFrame = 2; client.mBitsPerChannel = 32; client.mBytesPerFrame = 4; client.mBytesPerPacket = 4;
    ExtAudioFileSetProperty(f, kExtAudioFileProperty_ClientDataFormat, sizeof client, &client);
    struct { AudioBufferList l; AudioBuffer second; } abl;
    abl.l.mNumberBuffers = 2;
    abl.l.mBuffers[0] = {1, (UInt32)frames * 4, (void*)L};
    abl.second = {1, (UInt32)frames * 4, (void*)R};
    st = ExtAudioFileWrite(f, (UInt32)frames, &abl.l);
    ExtAudioFileDispose(f);
    return st == noErr;
}

void Core::stopRecording() {
    if (!recording.load()) return;
    recording = false;
    engine.recOutput = false;
    if (recQueue_) {
        AudioQueueStop((AudioQueueRef)recQueue_, true); AudioQueueDispose((AudioQueueRef)recQueue_, true); recQueue_ = nullptr;
        if (micFinished) micFinished();
    }
    int n = recSource_ == 1 ? engine.recCount.load() : micCount_.load();
    // Trim quiet edges so a pad fires the moment it's hit.
    float peak = 0;
    for (int i = 0; i < n; i++) peak = std::max(peak, std::fabs(recBufL_[i]));
    int a = 0, z = n;
    float thr = std::max(peak * .03f, .0005f);
    while (a < n && std::fabs(recBufL_[a]) < thr) a++;
    a = std::max(0, a - recRate_ / 400);
    while (z > a && std::fabs(recBufL_[z - 1]) < thr * .3f) z--;
    if (peak < .0005f || z - a < recRate_ / 50) {
        recError_ = recSource_ == 1 ? "Nothing was playing, so nothing was recorded." : "The recording is silent. Check the microphone and its permission in System Settings.";
        recBufL_ = {}; recBufR_ = {};
        recVersion++;
        return;
    }
    if (recSource_ == 0) {
        int fx = engine.micFx->index();
        if (fx > 0) {
            int m = z - a;
            std::vector<float> l(recBufL_.begin() + a, recBufL_.begin() + z), r(recBufR_.begin() + a, recBufR_.begin() + z);
            int cap = std::max(m * 2, 16);
            int oldCap = recCap_; recCap_ = std::min(recCap_, cap);
            l.resize(cap, 0); r.resize(cap, 0);
            applyMicFx(l, r, m, recRate_, fx);
            recCap_ = oldCap;
            std::copy(l.begin(), l.begin() + m, recBufL_.begin()); std::copy(r.begin(), r.begin() + m, recBufR_.begin());
            a = 0; z = m;
        }
    }
    NSDateFormatter* df = [NSDateFormatter new];
    df.dateFormat = @"yyyy-MM-dd HH.mm.ss";
    NSString* dir = [@(supportDir().c_str()) stringByAppendingPathComponent:@"Samples"];
    [NSFileManager.defaultManager createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString* name = [NSString stringWithFormat:@"%@ %@.wav", recSource_ == 1 ? @"Output" : @"Recording", [df stringFromDate:NSDate.date]];
    std::string path = [dir stringByAppendingPathComponent:name].UTF8String;
    if (!writeWav(path, recBufL_.data() + a, recBufR_.data() + a, z - a, recRate_)) {
        recError_ = "Couldn't save the recording.";
    } else if (recDest_ == 100) {
        loadChopFile(path, &recError_);
    } else if (recDest_ >= 0 && recDest_ < Sampler::kPads) {
        loadSampleFile(recDest_, path, &recError_);
    }
    recBufL_ = {}; recBufR_ = {};
    recVersion++;
}

void Core::serviceRecording() {
    if (taking.load()) drainTake(false);
    if (!recording.load()) return;
    int n = recSource_ == 1 ? engine.recCount.load() : micCount_.load();
    recSeconds = (float)n / recRate_;
    if (recSource_ == 1) {
        int from = std::max(0, n - recRate_ / 30);
        float pk = 0;
        for (int i = from; i < n; i++) pk = std::max(pk, std::fabs(recBufL_[i]));
        recLevel = pk;
    }
    if (n >= recCap_) stopRecording();
}

static void jsonEscape(std::ostringstream& os, const std::string& s) {
    os << '"';
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') os << '\\' << c;
        else if (c < 0x20) os << ' ';
        else os << c;
    }
    os << '"';
}

std::string Core::padsJson() {
    std::lock_guard<std::mutex> g(padMutex_);
    std::ostringstream os;
    os << "[";
    for (int i = 0; i < Sampler::kPads; i++) {
        SampleBuf* b = engine.sampler.get(i);
        if (i) os << ",";
        os << "{\"name\":";
        jsonEscape(os, b ? b->name : "");
        os << ",\"user\":" << (b && !b->path.empty() ? 1 : 0) << ",\"wave\":[";
        if (b) for (size_t n = 0; n < b->overview.size(); n++) os << (n ? "," : "") << (int)b->overview[n];
        os << "]}";
    }
    os << "]";
    return os.str();
}

std::string urlForLAN(int port, const std::string& token) {
    std::string ip = "127.0.0.1";
    struct ifaddrs* ifs = nullptr;
    if (getifaddrs(&ifs) == 0) {
        int best = -1;
        for (auto* i = ifs; i; i = i->ifa_next) {
            if (!i->ifa_addr || i->ifa_addr->sa_family != AF_INET) continue;
            if (!(i->ifa_flags & IFF_UP) || (i->ifa_flags & IFF_LOOPBACK)) continue;
            char b[64]; inet_ntop(AF_INET, &((sockaddr_in*)i->ifa_addr)->sin_addr, b, sizeof b);
            int score = std::string(i->ifa_name) == "en0" ? 3 : (std::string(i->ifa_name).rfind("en", 0) == 0 ? 2 : 1);
            if (std::string(b).rfind("169.254", 0) == 0) score = 0;
            if (score > best) { best = score; ip = b; }
        }
        freeifaddrs(ifs);
    }
    return "http://" + ip + ":" + std::to_string(port) + "/#k=" + token;
}
