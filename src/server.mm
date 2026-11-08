#include "server.h"
#include "core.h"
#import <Foundation/Foundation.h>
#import <CoreImage/CoreImage.h>
#import <CommonCrypto/CommonDigest.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
#include <TargetConditionals.h>
#include <algorithm>
#include <map>
#include <sstream>

static const int kFirstPort = 8060, kLastPort = 8069;
static const size_t kMaxUpload = 300 * 1024 * 1024;

static std::string b64(const uint8_t* d, size_t n) {
    NSData* data = [NSData dataWithBytes:d length:n];
    return [data base64EncodedStringWithOptions:0].UTF8String;
}
static std::string urlDecode(const std::string& s) {
    NSString* v = [[@(s.c_str()) stringByReplacingOccurrencesOfString:@"+" withString:@" "] stringByRemovingPercentEncoding];
    return v ? v.UTF8String : "";
}
static std::map<std::string, std::string> parseQuery(const std::string& q) {
    std::map<std::string, std::string> m;
    std::istringstream is(q);
    std::string kv;
    while (std::getline(is, kv, '&')) {
        auto eq = kv.find('=');
        if (eq != std::string::npos) m[kv.substr(0, eq)] = urlDecode(kv.substr(eq + 1));
    }
    return m;
}
static std::string jsonStr(const std::string& s) {
    std::string o = "\"";
    for (unsigned char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += (char)c; } else if (c < 0x20) o += ' '; else o += (char)c; }
    return o + "\"";
}
static std::string httpResp(int code, const std::string& type, const std::string& body) {
    const char* msg = code == 200 ? "OK" : code == 403 ? "Forbidden" : code == 404 ? "Not Found" : code == 413 ? "Too Large" : "Error";
    std::ostringstream os;
    os << "HTTP/1.1 " << code << " " << msg << "\r\nContent-Type: " << type << "\r\nContent-Length: " << body.size()
       << "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" << body;
    return os.str();
}

bool Server::start() {
    listenFd_ = socket(AF_INET6, SOCK_STREAM, 0);
    if (listenFd_ < 0) return false;
    int on = 1, off = 0;
    setsockopt(listenFd_, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on);
    setsockopt(listenFd_, IPPROTO_IPV6, IPV6_V6ONLY, &off, sizeof off);
    sockaddr_in6 a{};
    a.sin6_family = AF_INET6;
#if TARGET_OS_IOS
    // On the iPad the panel lives in the same app, so nothing else needs to reach this server.
    {
        close(listenFd_);
        listenFd_ = socket(AF_INET, SOCK_STREAM, 0);
        if (listenFd_ < 0) return false;
        setsockopt(listenFd_, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on);
        sockaddr_in a4{};
        a4.sin_family = AF_INET;
        a4.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        for (int p = kFirstPort; p <= kLastPort; p++) {
            a4.sin_port = htons(p);
            if (bind(listenFd_, (sockaddr*)&a4, sizeof a4) == 0) { port_ = p; break; }
        }
    }
#else
    a.sin6_addr = in6addr_any;
    for (int p = kFirstPort; p <= kLastPort; p++) {
        a.sin6_port = htons(p);
        if (bind(listenFd_, (sockaddr*)&a, sizeof a) == 0) { port_ = p; break; }
    }
#endif
    if (!port_ || listen(listenFd_, 16) != 0) { close(listenFd_); listenFd_ = -1; return false; }
    fcntl(listenFd_, F_SETFL, O_NONBLOCK);
    run_ = true;
    th_ = std::thread([this] { @autoreleasepool { loop(); } });
    return true;
}

void Server::stop() {
    if (!run_) return;
    run_ = false;
    if (th_.joinable()) th_.join();
    for (auto* c : conns_) { close(c->fd); delete c; }
    conns_.clear();
    if (listenFd_ >= 0) close(listenFd_);
    listenFd_ = -1;
}

void Server::loop() {
    pthread_setname_np("Marea server");
    auto last = std::chrono::steady_clock::now();
    while (run_) {
        std::vector<pollfd> fds;
        fds.push_back({listenFd_, POLLIN, 0});
        for (auto* c : conns_) fds.push_back({c->fd, (short)(POLLIN | (c->out.empty() ? 0 : POLLOUT)), 0});
        poll(fds.data(), (nfds_t)fds.size(), 16);
        if (fds[0].revents & POLLIN) {
            int fd;
            while ((fd = accept(listenFd_, nullptr, nullptr)) >= 0) {
                fcntl(fd, F_SETFL, O_NONBLOCK);
                int on = 1;
                setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &on, sizeof on);
                setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof on);
                auto* c = new Conn; c->fd = fd;
                conns_.push_back(c);
            }
        }
        size_t idx = 1;
        size_t polled = fds.size() - 1;
        for (size_t i = 0; i < polled; i++, idx++) {
            Conn* c = conns_[i];
            if (fds[idx].revents & (POLLERR | POLLNVAL)) { c->closing = true; c->out.clear(); continue; }
            if (fds[idx].revents & (POLLIN | POLLHUP)) {
                char buf[65536];
                ssize_t n;
                while ((n = read(c->fd, buf, sizeof buf)) > 0) {
                    c->in.append(buf, (size_t)n);
                    if (c->in.size() > kMaxUpload + 65536) { c->closing = true; break; }
                }
                if (n == 0) { c->closing = true; c->out.clear(); }
                if (c->ws) handleWS(*c); else if (!c->closing) handleHTTP(*c);
            }
        }
        auto now = std::chrono::steady_clock::now();
        if (now - last >= std::chrono::milliseconds(33)) { last = now; tick(); }
        for (auto it = conns_.begin(); it != conns_.end();) {
            Conn* c = *it;
            while (!c->out.empty()) {
                ssize_t n = write(c->fd, c->out.data(), std::min<size_t>(c->out.size(), 65536));
                if (n > 0) c->out.erase(0, (size_t)n); else break;
            }
            if (c->out.size() > 4 * 1024 * 1024) c->closing = true, c->out.clear();  // a stuck client must not eat memory
            if (c->closing && c->out.empty()) { close(c->fd); delete c; it = conns_.erase(it); }
            else ++it;
        }
    }
}

void Server::wsSend(Conn& c, const std::string& text) {
    std::string f;
    f.push_back((char)0x81);
    size_t n = text.size();
    if (n < 126) f.push_back((char)n);
    else if (n < 65536) { f.push_back(126); f.push_back((char)(n >> 8)); f.push_back((char)n); }
    else { f.push_back(127); for (int i = 7; i >= 0; i--) f.push_back((char)((uint64_t)n >> (i * 8))); }
    c.out += f; c.out += text;
}

void Server::handleWS(Conn& c) {
    while (c.in.size() >= 2) {
        const uint8_t* d = (const uint8_t*)c.in.data();
        int op = d[0] & 0x0F;
        bool masked = d[1] & 0x80;
        uint64_t len = d[1] & 0x7F;
        size_t h = 2;
        if (len == 126) { if (c.in.size() < 4) return; len = (d[2] << 8) | d[3]; h = 4; }
        else if (len == 127) { c.closing = true; return; }
        if (len > 1 << 20) { c.closing = true; return; }
        if (c.in.size() < h + (masked ? 4 : 0) + len) return;
        std::string payload = c.in.substr(h + (masked ? 4 : 0), len);
        if (masked) { const uint8_t* m = d + h; for (size_t i = 0; i < len; i++) payload[i] ^= m[i % 4]; }
        c.in.erase(0, h + (masked ? 4 : 0) + len);
        if (op == 1) {
            // Round-trip probe for the panel's latency readout; answered straight away.
            if (payload.rfind("ping ", 0) == 0) { wsSend(c, "{\"pong\":" + payload.substr(5) + "}"); continue; }
            std::istringstream is(payload);
            std::string line;
            while (std::getline(is, line)) if (!line.empty()) core_.command(line);
        } else if (op == 8) { c.closing = true; return; }
        else if (op == 9) { std::string f; f.push_back((char)0x8A); f.push_back((char)payload.size()); c.out += f + payload; }
    }
}

std::string Server::fullSteps() {
    std::ostringstream os;
    os << "[";
    for (int a = 0; a < Engine::kPatterns; a++) for (int t = 0; t < Engine::kTracks; t++) os << (a + t ? "," : "") << core_.engine.steps[a][t].load();
    os << "]";
    return os.str();
}

std::string Server::helloJson() {
    Engine& e = core_.engine;
    std::ostringstream os;
    os << "{\"hello\":1,\"host\":" << jsonStr(core_.hostName) << ",\"url\":" << jsonStr(urlForLAN(port_, core_.token())) << ",\"params\":[";
    bool first = true;
    for (auto& p : e.params.all()) {
        os << (first ? "" : ",") << "{\"i\":" << p.id << ",\"k\":" << jsonStr(p.key) << ",\"n\":" << jsonStr(p.name) << ",\"d\":" << p.def << ",\"s\":" << p.steps << ",\"v\":" << p.get() << "}";
        first = false;
    }
    os << "],\"steps\":" << fullSteps() << ",\"bs\":[";
    for (int a = 0; a < Engine::kPatterns; a++) for (int st = 0; st < Engine::kSteps; st++) os << (a + st ? "," : "") << e.bassSteps[a][st].load();
    os << "],\"cs\":[";
    for (int a = 0; a < Engine::kPatterns; a++) for (int st = 0; st < Engine::kSteps; st++) os << (a + st ? "," : "") << e.chopSteps[a][st].load();
    os << "],\"ps\":[";
    for (int a = 0; a < Engine::kPatterns; a++) for (int i = 0; i < Sampler::kPads; i++) os << (a + i ? "," : "") << e.padSteps[a][i].load();
    os << "],\"chop\":" << core_.chopJson() << ",\"lanes\":" << core_.lanesJson() << ",\"cn\":" << core_.chainJson() << ",\"pads\":" << core_.padsJson() << ",\"patNames\":[";
    for (int i = 0; i < Engine::kPatterns; i++) os << (i ? "," : "") << jsonStr(Engine::patternName(i));
    os << "]}";
    return os.str();
}

void Server::tick() {
    Engine& e = core_.engine;
    core_.reapSamples();
    core_.serviceRecording();
    bool anyWS = false;
    for (auto* c : conns_) if (c->ws && !c->closing) { anyWS = true; if (c->wantsHello) { wsSend(*c, helloJson()); c->wantsHello = false; } }
    auto& ps = e.params.all();
    if (shadowParams_.size() != ps.size()) { shadowParams_.clear(); for (auto& p : ps) shadowParams_.push_back(p.get()); }
    if (shadowSteps_.empty()) shadowSteps_.assign(Engine::kPatterns * Engine::kTracks, 0xFFFFFFFF);
    if (!anyWS) return;

    std::ostringstream msg;
    msg << "{\"t\":[" << e.curStep.load() << "," << e.pattern.load() << "," << e.queued.load() << "," << (e.active.load() ? (e.hostPlayingNow.load() ? 2 : 1) : 0)
        << "," << e.bpmNow.load() << "," << e.levelL.load() << "," << e.levelR.load() << "," << e.echo.meter.load() << "," << e.siren.meter.load() << "," << e.echo.delaySeconds.load()
        << "," << (e.hostPresentNow.load() ? 1 : 0) << "],\"a\":[";
    for (int i = 0; i < Pulse::kTracks; i++) msg << (i ? "," : "") << (int)(e.pulse.activity[i].load() * 99);
    msg << "],\"b\":[";
    for (int i = 0; i < Sampler::kPads; i++) msg << (i ? "," : "") << (int)(e.sampler.activity[i].load() * 99);
    msg << "],\"o\":[";
    int w = e.scopeW.load();
    const int N = 64;
    for (int i = 0; i < N; i++) {
        int rp = (w - (N - i) * 3 + Engine::kScope) % Engine::kScope;
        msg << (i ? "," : "") << (int)(e.scope[rp] * 99);
    }
    msg << "],\"x\":[" << e.bass.noteNow.load() << "," << (int)(std::min(1.f, e.bass.meter.load()) * 99) << "," << e.chop.sliceNow.load() << "," << (int)(std::min(1.f, e.chop.meter.load()) * 99)
        << "," << (core_.recording.load() ? 1 : 0) << "," << (int)(std::min(1.f, core_.recLevel.load()) * 99) << "," << core_.recSeconds.load() << "," << e.mutMask.load() << "," << e.chainNow.load() << "," << (core_.taking.load() ? 1 : 0) << "," << core_.takeSeconds.load() << "," << (int)core_.outLatencyMs.load() << "," << (int)(std::min(1.f, e.mic.meter.load()) * 99) << "," << e.midiDests.load() << "]";
    size_t i = 0; bool firstP = true;
    for (auto& p : ps) {
        float v = p.get();
        if (v != shadowParams_[i]) {
            shadowParams_[i] = v;
            msg << (firstP ? ",\"p\":[" : ",") << "[" << p.id << "," << v << "]";
            firstP = false;
        }
        i++;
    }
    if (!firstP) msg << "]";
    bool firstS = true;
    int n = 0;
    for (int a = 0; a < Engine::kPatterns; a++) for (int t = 0; t < Engine::kTracks; t++, n++) {
        uint32_t v = e.steps[a][t].load();
        if (v != shadowSteps_[n]) {
            shadowSteps_[n] = v;
            msg << (firstS ? ",\"s\":[" : ",") << "[" << a << "," << t << "," << v << "]";
            firstS = false;
        }
    }
    if (!firstS) msg << "]";
    if (shadowBass_.empty()) { shadowBass_.assign(Engine::kPatterns * Engine::kSteps, 0xFFFFFFFF); shadowChopSteps_ = shadowBass_; }
    bool firstB = true, firstC = true;
    std::ostringstream bm, cm;
    n = 0;
    for (int a = 0; a < Engine::kPatterns; a++) for (int st = 0; st < Engine::kSteps; st++, n++) {
        uint32_t v = e.bassSteps[a][st].load();
        if (v != shadowBass_[n]) { shadowBass_[n] = v; bm << (firstB ? "" : ",") << "[" << a << "," << st << "," << v << "]"; firstB = false; }
        v = e.chopSteps[a][st].load();
        if (v != shadowChopSteps_[n]) { shadowChopSteps_[n] = v; cm << (firstC ? "" : ",") << "[" << a << "," << st << "," << v << "]"; firstC = false; }
    }
    if (!firstB) msg << ",\"bs\":[" << bm.str() << "]";
    if (!firstC) msg << ",\"cs\":[" << cm.str() << "]";
    if (shadowPadSteps_.empty()) shadowPadSteps_.assign(Engine::kPatterns * Sampler::kPads, 0xFFFFFFFF);
    bool firstPS = true;
    n = 0;
    for (int a = 0; a < Engine::kPatterns; a++) for (int pi = 0; pi < Sampler::kPads; pi++, n++) {
        uint32_t v = e.padSteps[a][pi].load();
        if (v != shadowPadSteps_[n]) { shadowPadSteps_[n] = v; msg << (firstPS ? ",\"ps\":[" : ",") << "[" << a << "," << pi << "," << v << "]"; firstPS = false; }
    }
    if (!firstPS) msg << "]";
    int cv = core_.chopVersion.load();
    if (cv != shadowChop_) { shadowChop_ = cv; msg << ",\"chop\":" << core_.chopJson(); }
    int rv = core_.recVersion.load();
    if (rv != shadowRec_) { shadowRec_ = rv; msg << ",\"recErr\":" << jsonStr(core_.lastRecError()); }
    int pv = core_.padsVersion.load();
    if (pv != shadowPads_) { shadowPads_ = pv; msg << ",\"pads\":" << core_.padsJson() << ",\"lanes\":" << core_.lanesJson(); }
    int chv = core_.chainVersion.load();
    if (chv != shadowChain_) { shadowChain_ = chv; msg << ",\"cn\":" << core_.chainJson(); }
    int tv = core_.takeVersion.load();
    if (tv != shadowTake_) { shadowTake_ = tv; if (!core_.taking.load() && !core_.lastTakeName().empty()) msg << ",\"takeDone\":" << jsonStr(core_.lastTakeName()); }
    msg << "}";
    std::string text = msg.str();
    for (auto* c : conns_) if (c->ws && !c->closing && c->out.size() < 256 * 1024) wsSend(*c, text);
}

static std::string browseRoots() {
    NSString* h = NSHomeDirectory();
#if TARGET_OS_IOS
    [NSFileManager.defaultManager createDirectoryAtPath:[h stringByAppendingPathComponent:@"Documents"] withIntermediateDirectories:YES attributes:nil error:nil];
    [NSFileManager.defaultManager createDirectoryAtPath:[h stringByAppendingPathComponent:@"Library/Application Support/Marea/Samples"] withIntermediateDirectories:YES attributes:nil error:nil];
    NSArray* candidates = @[[h stringByAppendingPathComponent:@"Documents"], [h stringByAppendingPathComponent:@"Library/Application Support/Marea/Samples"]];
#else
    NSArray* candidates = @[[h stringByAppendingPathComponent:@"Desktop/music"], [h stringByAppendingPathComponent:@"Music/Marea"], [h stringByAppendingPathComponent:@"Music/Ableton/User Library"], [h stringByAppendingPathComponent:@"Music"], [h stringByAppendingPathComponent:@"Downloads"]];
#endif
    std::ostringstream os; os << "[";
    bool first = true;
    for (NSString* c in candidates) {
        BOOL d = NO;
        if ([NSFileManager.defaultManager fileExistsAtPath:c isDirectory:&d] && d) {
            os << (first ? "" : ",") << jsonStr(c.UTF8String);
            first = false;
        }
    }
    os << "]";
    return os.str();
}

// Only folders under the home-music locations can be browsed, whatever the page asks for.
static bool underAllowedRoot(NSString* path) {
    NSString* real = path.stringByResolvingSymlinksInPath.stringByStandardizingPath;
    NSString* h = NSHomeDirectory();
    for (NSString* sub in @[@"Desktop/music", @"Music", @"Downloads", @"Documents", @"Library/Application Support/Marea/Samples"]) {
        NSString* root = [h stringByAppendingPathComponent:sub];
        if ([real isEqualToString:root] || [real hasPrefix:[root stringByAppendingString:@"/"]]) return true;
    }
    return false;
}

static std::string qrPng(const std::string& text) {
    CIFilter* f = [CIFilter filterWithName:@"CIQRCodeGenerator"];
    [f setValue:[NSData dataWithBytes:text.data() length:text.size()] forKey:@"inputMessage"];
    [f setValue:@"M" forKey:@"inputCorrectionLevel"];
    CIImage* img = [f.outputImage imageByApplyingTransform:CGAffineTransformMakeScale(9, 9)];
    if (!img) return "";
    CIContext* ctx = [CIContext contextWithOptions:nil];
    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
    NSData* png = [ctx PNGRepresentationOfImage:img format:kCIFormatRGBA8 colorSpace:cs options:@{}];
    CGColorSpaceRelease(cs);
    return png ? std::string((const char*)png.bytes, png.length) : "";
}

void Server::handleHTTP(Conn& c) {
    auto headerEnd = c.in.find("\r\n\r\n");
    if (headerEnd == std::string::npos) { if (c.in.size() > 65536) c.closing = true; return; }
    std::string head = c.in.substr(0, headerEnd);
    std::istringstream is(head);
    std::string method, target, ver, line;
    is >> method >> target >> ver;
    std::getline(is, line);
    std::map<std::string, std::string> hdr;
    while (std::getline(is, line)) {
        auto col = line.find(':');
        if (col == std::string::npos) continue;
        std::string k = line.substr(0, col), v = line.substr(col + 1);
        std::transform(k.begin(), k.end(), k.begin(), ::tolower);
        v.erase(0, v.find_first_not_of(" \t"));
        while (!v.empty() && (v.back() == '\r' || v.back() == ' ')) v.pop_back();
        hdr[k] = v;
    }
    std::string path = target, query;
    auto qm = target.find('?');
    if (qm != std::string::npos) { path = target.substr(0, qm); query = target.substr(qm + 1); }
    auto q = parseQuery(query);
    bool authed = q["k"] == core_.token();

    // ---- WebSocket upgrade ----
    if (hdr.count("sec-websocket-key")) {
        if (!authed) { c.out += httpResp(403, "text/plain", "bad code"); c.closing = true; return; }
        std::string accept = hdr["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        uint8_t sha[CC_SHA1_DIGEST_LENGTH];
        CC_SHA1(accept.data(), (CC_LONG)accept.size(), sha);
        c.out += "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + b64(sha, sizeof sha) + "\r\n\r\n";
        c.ws = true; c.wantsHello = true;
        c.in.erase(0, headerEnd + 4);
        return;
    }

    if (method == "POST" && path == "/upload") {
        size_t len = hdr.count("content-length") ? strtoull(hdr["content-length"].c_str(), nullptr, 10) : 0;
        if (len > kMaxUpload) { c.out += httpResp(413, "text/plain", "That file is too big (300 MB limit)."); c.closing = true; return; }
        if (c.in.size() < headerEnd + 4 + len) return;  // still arriving
        if (!authed) { c.out += httpResp(403, "text/plain", "bad code"); c.closing = true; return; }
        int pad = atoi(q["pad"].c_str());
        std::string name = q["name"];
        for (auto& ch : name) if (ch == '/' || ch == ':' || ch == '\\' || (unsigned char)ch < 0x20) ch = '_';
        if (name.empty() || name[0] == '.') name = "upload" + name;
        NSString* dir = [@(Core::supportDir().c_str()) stringByAppendingPathComponent:@"Samples"];
        [NSFileManager.defaultManager createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
        NSString* dest = [dir stringByAppendingPathComponent:@(name.c_str())];
        NSData* body = [NSData dataWithBytes:c.in.data() + headerEnd + 4 length:len];
        std::string err;
        bool ok = false;
        if ((pad == 100 || (pad >= 200 && pad < 208) || (pad >= 0 && pad < Sampler::kPads)) && [body writeToFile:dest atomically:YES])
            ok = pad == 100 ? core_.loadChopFile(dest.UTF8String, &err) : pad >= 200 ? core_.loadLaneFile(pad - 200, dest.UTF8String, &err) : core_.loadSampleFile(pad, dest.UTF8String, &err);
        c.out += httpResp(ok ? 200 : 400, "text/plain", ok ? "ok" : (err.empty() ? "Upload failed" : err));
        c.closing = true;
        return;
    }

    if (method != "GET") { c.out += httpResp(404, "text/plain", "no"); c.closing = true; return; }

    if (path == "/songs") {
        if (!authed) { c.out += httpResp(403, "text/plain", "bad code"); c.closing = true; return; }
        c.out += httpResp(200, "application/json", core_.projectsJson());
    } else if (path == "/qr.png") {
        c.out += httpResp(200, "image/png", qrPng(urlForLAN(port_, core_.token())));
    } else if (path == "/browse") {
        if (!authed) { c.out += httpResp(403, "text/plain", "bad code"); c.closing = true; return; }
        std::ostringstream os;
        if (q["path"].empty()) {
            os << "{\"roots\":" << browseRoots() << "}";
        } else {
            NSString* dir = @(q["path"].c_str());
            if (!underAllowedRoot(dir)) { c.out += httpResp(403, "text/plain", "not allowed"); c.closing = true; return; }
            NSArray* names = [[NSFileManager.defaultManager contentsOfDirectoryAtPath:dir error:nil] sortedArrayUsingSelector:@selector(localizedStandardCompare:)];
            NSSet* exts = [NSSet setWithArray:@[@"wav", @"aif", @"aiff", @"mp3", @"flac", @"m4a", @"caf", @"ogg"]];
            std::ostringstream dirs, files;
            int nd = 0, nf = 0;
            for (NSString* n in names) {
                if ([n hasPrefix:@"."]) continue;
                BOOL isDir = NO;
                [NSFileManager.defaultManager fileExistsAtPath:[dir stringByAppendingPathComponent:n] isDirectory:&isDir];
                if (isDir) dirs << (nd++ ? "," : "") << jsonStr(n.UTF8String);
                else if ([exts containsObject:n.pathExtension.lowercaseString] && nf < 2000) files << (nf++ ? "," : "") << jsonStr(n.UTF8String);
            }
            os << "{\"path\":" << jsonStr(dir.UTF8String) << ",\"dirs\":[" << dirs.str() << "],\"files\":[" << files.str() << "]}";
        }
        c.out += httpResp(200, "application/json", os.str());
    } else {
        std::string rel = path == "/" ? "/index.html" : path;
        std::string type = "text/plain";
        if (rel.size() > 5 && rel.compare(rel.size() - 5, 5, ".html") == 0) type = "text/html; charset=utf-8";
        else if (rel.size() > 3 && rel.compare(rel.size() - 3, 3, ".js") == 0) type = "text/javascript; charset=utf-8";
        else if (rel.size() > 4 && rel.compare(rel.size() - 4, 4, ".css") == 0) type = "text/css; charset=utf-8";
        else if (rel.size() > 4 && rel.compare(rel.size() - 4, 4, ".png") == 0) type = "image/png";
        else if (rel.size() > 12 && rel.compare(rel.size() - 12, 12, ".webmanifest") == 0) type = "application/manifest+json";
        else if (rel.size() > 6 && rel.compare(rel.size() - 6, 6, ".woff2") == 0) type = "font/woff2";
        NSData* d = nil;
        if (rel.find("..") == std::string::npos) d = [NSData dataWithContentsOfFile:[@(core_.webRoot.c_str()) stringByAppendingString:@(rel.c_str())]];
        if (d) c.out += httpResp(200, type, std::string((const char*)d.bytes, d.length));
        else c.out += httpResp(404, "text/plain", "not found");
    }
    c.closing = true;
}
