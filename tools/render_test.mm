// Offline test: renders the real engine to WAV files so the sound can be measured without speakers.
// Usage: render_test <output-dir>
#include "../src/core.h"
#include "../src/analysis.h"
#include "../src/midi_input.h"
#import <CoreMIDI/CoreMIDI.h>
#include <mach/mach_time.h>
#include <mutex>
#import <Foundation/Foundation.h>
#include <cstdio>
#include <fstream>
#include <unistd.h>

static void writeWav(const std::string& path, const std::vector<float>& L, const std::vector<float>& R, int sr) {
    std::ofstream o(path, std::ios::binary);
    auto u32 = [&](uint32_t v) { o.write((char*)&v, 4); };
    auto u16 = [&](uint16_t v) { o.write((char*)&v, 2); };
    uint32_t bytes = (uint32_t)L.size() * 4;
    o.write("RIFF", 4); u32(36 + bytes); o.write("WAVEfmt ", 8); u32(16); u16(1); u16(2); u32(sr); u32(sr * 4); u16(4); u16(16);
    o.write("data", 4); u32(bytes);
    for (size_t i = 0; i < L.size(); i++) {
        int16_t a = (int16_t)(std::max(-1.f, std::min(1.f, L[i])) * 32767), b = (int16_t)(std::max(-1.f, std::min(1.f, R[i])) * 32767);
        o.write((char*)&a, 2); o.write((char*)&b, 2);
    }
}

struct Run {
    Engine& e; std::vector<float> L, R; int sr;
    void go(double secs, bool hostPlaying = false, double* beat = nullptr, double bpm = 0) {
        int total = (int)(secs * sr), done = 0;
        size_t base = L.size();
        L.resize(base + total); R.resize(base + total);
        while (done < total) {
            int n = std::min(512, total - done);
            Transport t;
            if (beat) { t.hostPresent = true; t.hostPlaying = hostPlaying; t.hostBeat = *beat; t.hostBpm = bpm; if (hostPlaying) *beat += n * bpm / 60.0 / sr; }
            e.render(L.data() + base + done, R.data() + base + done, n, t);
            done += n;
        }
    }
};

int main(int argc, char** argv) {
    @autoreleasepool {
        if (argc > 2 && std::string(argv[1]) == "--serve") {
            // Runs the real engine and server without touching the speakers, for testing the panel.
            Core c("Standalone");
            c.webRoot = argv[2];
            c.engine.prepare(48000, 4096);
            c.startServer();
            printf("%s\n", urlForLAN(c.port(), c.token()).c_str()); fflush(stdout);
            std::vector<float> L(512), R(512);
            for (;;) { Transport t; c.engine.render(L.data(), R.data(), 512, t); usleep(10666); }
        }
        std::string out = argc > 1 ? argv[1] : ".";
        const int sr = 48000;
        auto scene = [&](const char* name, auto fn) {
            Core core("Test");
            core.engine.prepare(sr, 4096);
            Run r{core.engine, {}, {}, sr};
            fn(core, r);
            writeWav(out + "/" + name + ".wav", r.L, r.R, sr);
            printf("wrote %s\n", name);
        };
        scene("idle", [](Core&, Run& r) { r.go(1); });
        for (int i = 0; i < 8; i++) {
            static const char* n[] = {"drum_kick", "drum_snare", "drum_rim", "drum_clap", "drum_hat", "drum_open", "drum_tom", "drum_bell"};
            scene(n[i], [i](Core& c, Run& r) { c.engine.echo.ret->set(0); c.engine.echo.spring->set(0); c.command("hit 0 " + std::to_string(i) + " 1"); r.go(1.0); });
        }
        scene("groove_patternA", [](Core& c, Run& r) { c.command("play"); r.go(8); });
        scene("groove_host_sync", [](Core& c, Run& r) { double beat = 0; r.go(8, true, &beat, 120); });
        scene("siren_modes", [](Core& c, Run& r) {
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            for (int m = 0; m < 5; m++) { c.engine.siren.mode->set(m / 4.f); c.engine.siren.fire->set(1); r.go(1.0); c.engine.siren.fire->set(0); r.go(.6); }
        });
        for (int i = 0; i < 6; i++) {
            std::string n = "pad_" + std::to_string(i + 1);
            scene(n.c_str(), [i](Core& c, Run& r) { c.engine.echo.ret->set(0); c.engine.echo.spring->set(0); c.command("hit 1 " + std::to_string(i) + " 1"); r.go(2.2); });
        }
        scene("echo_tail", [](Core& c, Run& r) {
            c.engine.sampler.pad[0].echo->set(1); c.engine.echo.feedback->set(.6f); c.command("hit 1 0 1"); r.go(5);
        });
        scene("echo_no_send", [](Core& c, Run& r) { c.engine.sampler.pad[0].echo->set(0); c.engine.echo.spring->set(0); c.command("hit 1 0 1"); r.go(5); });
        scene("echo_throw_and_hold", [](Core& c, Run& r) {
            c.command("play"); r.go(2);
            c.engine.echo.throw_->set(1); r.go(.6); c.engine.echo.throw_->set(0);
            c.engine.echo.hold->set(1); c.command("play"); r.go(6); c.engine.echo.hold->set(0); r.go(2);
        });
        scene("stress_everything", [](Core& c, Run& r) {
            // Worst case on purpose: must stay finite and limited.
            c.engine.echo.feedback->set(1); c.engine.echo.ret->set(1); c.engine.echo.spring->set(1); c.engine.drive->set(1); c.engine.volume->set(1);
            for (int t = 0; t < 8; t++) { c.engine.pulse.tr[t].level->set(1); c.engine.pulse.tr[t].echo->set(1); }
            c.engine.siren.fire->set(1); c.engine.siren.level->set(1); c.engine.echo.throw_->set(1);
            c.command("play"); r.go(20);
        });
        // Timing proof: steps must land exactly on the Live beat grid.
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            c.engine.swing->set(0);
            for (int t = 0; t < 8; t++) c.engine.steps[0][t] = 0;
            c.engine.steps[0][0] = 0x1111;  // kick on every beat
            c.engine.bass.mute->set(1);
            c.engine.pulse.tr[0].decay->set(0);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            Run r{c.engine, {}, {}, sr};
            double beat = 0; r.go(4, true, &beat, 120);  // 120 BPM: one beat = 24000 samples
            long lastHit = -100000; std::vector<long> onsets;
            for (long i = 0; i < (long)r.L.size(); i++) if (std::fabs(r.L[i]) > .05f && i - lastHit > 12000) { onsets.push_back(i); lastHit = i; }
            printf("sync onsets:"); for (long o : onsets) printf(" %ld", o); printf("\n");
        }
        // Pattern queueing must wait for the bar line.
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            Run r{c.engine, {}, {}, sr};
            c.command("play"); r.go(.5);
            c.command("pat 3");
            int before = c.engine.pattern.load();
            double bar = 16 * 60.0 / (60 + c.engine.bpm->get() * 120) / 4;
            r.go(bar);
            printf("pattern before=%d after one bar=%d queued=%d\n", before, c.engine.pattern.load(), c.engine.queued.load());
        }
        // ---- new: bass ----
        scene("bass_patternA", [](Core& c, Run& r) {
            for (int t = 0; t < 8; t++) c.engine.pulse.tr[t].mute->set(1);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            c.command("play"); r.go(8);
        });
        scene("bass_acid_open_filter", [](Core& c, Run& r) {
            for (int t = 0; t < 8; t++) c.engine.pulse.tr[t].mute->set(1);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            c.engine.bass.reso->set(.9f); c.engine.bass.cutoff->set(.5f); c.engine.bass.env->set(.8f);
            c.engine.pattern = 6; c.command("play"); r.go(8);
        });
        scene("bass_high_reso_stress", [](Core& c, Run& r) {
            c.engine.bass.reso->set(1); c.engine.bass.cutoff->set(1); c.engine.bass.env->set(1); c.engine.bass.drive->set(1); c.engine.bass.level->set(1); c.engine.bass.accent->set(1);
            c.engine.pattern = 6; c.command("play"); r.go(10);
        });
        // Bass keyboard note: pitch must match the note asked for.
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            c.engine.bass.sub->set(0); c.engine.bass.detune->set(0); c.engine.bass.wave->set(0); c.engine.bass.cutoff->set(.9f); c.engine.bass.env->set(0); c.engine.bass.reso->set(0);
            for (int note : {43, 55, 67}) {
                Run r{c.engine, {}, {}, sr};
                c.command("hit 2 " + std::to_string(note) + " .8"); r.go(.4); c.command("rel 2 " + std::to_string(note));
                int z = 0; for (size_t i = sr / 10 + 1; i < r.L.size(); i++) if (r.L[i - 1] <= 0 && r.L[i] > 0) z++;
                double hz = z / ((r.L.size() - sr / 10) / (double)sr), want = 440 * std::pow(2.0, (note - 69) / 12.0);
                printf("bass note %d: %.1f Hz (want %.1f)\n", note, hz, want);
                r.go(.3);
            }
            printf("slide on legato pair: ");
            Run r{c.engine, {}, {}, sr};
            Engine::Cmd a{Engine::Cmd::Hit, 2, 43, .8f, 0}; a.hold = 48000; c.engine.fromUI.push(a); r.go(.2);
            Engine::Cmd b{Engine::Cmd::Hit, 2, 55, .8f, 0}; b.flags = 1; b.hold = 24000; c.engine.fromUI.push(b); r.go(.4);
            printf("rendered %zu frames ok\n", r.L.size());
        }
        // Long bass notes: a note with length 4 must sound about four steps, a plain one well under one step.
        for (int len : {1, 4, 8}) {
            Core c("Test"); c.engine.prepare(sr, 4096);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            for (int t = 0; t < 8; t++) c.engine.pulse.tr[t].mute->set(1);
            c.engine.bass.env->set(0); c.engine.bass.cutoff->set(.8f);
            c.engine.bpm->set((120 - 60) / 120.f);
            for (int st = 0; st < 16; st++) c.command("b 0 " + std::to_string(st) + " 0");
            c.command("b 0 0 " + std::to_string(256 | 36 | ((len - 1) << 11)));
            c.engine.pattern = 0;
            Run r{c.engine, {}, {}, sr};
            c.command("play"); r.go(1.9);
            float pk = 0; for (float v : r.L) pk = std::max(pk, std::fabs(v));
            long last = 0; for (size_t i = 0; i < r.L.size(); i++) if (std::fabs(r.L[i]) > pk * .3f) last = (long)i;
            printf("bass length %d: loud for %.3f s (one step = 0.125 s)\n", len, last / (double)sr);
        }
        // ---- new: tempo detection on real loops; names hidden unless they carry the answer ----
        for (int i = 2; i < argc; i++) {
            Core c("Test"); c.engine.prepare(sr, 4096);
            std::string path = argv[i];
            if (!c.loadChopFile(path)) { printf("couldn't load %s\n", path.c_str()); continue; }
            ChopData* d = c.engine.chop.get();
            float named = bpmFromFilename(path);
            ChopData blind; blind.buf = d->buf;
            auto tmp = std::make_shared<SampleBuf>(*d->buf); tmp->path = ""; tmp->name = ""; blind.buf = tmp;
            analyzeTempo(blind, false);
            printf("%-52s name=%3.0f detected=%6.1f beats=%5.1f slices=%zu\n", path.substr(path.find_last_of('/') + 1).substr(0, 50).c_str(), named, blind.fileBpm, blind.beats, d->starts.size());
        }
        // ---- new: chop a synthetic 96 BPM loop written to disk, retrigger it at 120 ----
        {
            const int beatsTotal = 8; double bpmFile = 96; int lenF = (int)(beatsTotal * 60.0 / bpmFile * sr);
            std::vector<float> L(lenF, 0), R(lenF, 0);
            dsp::Noise noise;
            for (int s = 0; s < beatsTotal * 4; s++) {
                int at = (int)(s * .25 * 60 / bpmFile * sr);
                bool beat = s % 4 == 0;
                for (int n = 0; n < sr / 12 && at + n < lenF; n++) {
                    float e = std::exp(-n / (sr * (beat ? .04f : .012f)));
                    float v = beat ? std::sin(n * .012f) * e : noise.next() * e * (s % 2 ? .35f : .6f);
                    L[at + n] += v; R[at + n] += v;
                }
            }
            std::string path = out + "/synth_loop.wav";
            writeWav(path, L, R, sr);
            Core c("Test"); c.engine.prepare(sr, 4096);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            for (int t = 0; t < 8; t++) c.engine.pulse.tr[t].mute->set(1);
            c.engine.bass.mute->set(1);
            bool ok = c.loadChopFile(path);
            ChopData* d = c.engine.chop.get();
            auto blind = std::make_shared<SampleBuf>(*d->buf); blind->path = ""; blind->name = "";
            ChopData bd; bd.buf = blind; analyzeTempo(bd, false);
            printf("chop load=%d detected=%.2f (true 96) slices=%zu first slice starts:", ok, bd.fileBpm, d->starts.size());
            for (int i = 0; i < 5 && i < (int)d->starts.size(); i++) printf(" %u", d->starts[i]);
            printf(" (grid %d)\n", (int)(.25 * 60 / 96 * sr));
            printf("pattern A chop steps:"); for (int s = 0; s < 16; s++) printf(" %u", c.engine.chopSteps[0][s].load()); printf("\n");
            Run r{c.engine, {}, {}, sr};
            double beat = 0; r.go(4, true, &beat, 120);
            writeWav(out + "/chop_retrigger_120.wav", r.L, r.R, sr);
            float pk = 0; for (float x : r.L) pk = std::max(pk, std::fabs(x));
            // Beats at 120 BPM land every 24000 frames.
            std::vector<long> on; long last = -100000; for (long i = 0; i < (long)r.L.size(); i++) if (std::fabs(r.L[i]) > .25f && i - last > 12000) { on.push_back(i); last = i; }
            printf("chop at 120 BPM: peak %.2f, loud onsets:", pk); for (long o : on) printf(" %ld", o); printf("\n");
        }
        // ---- new: resample Marea's own output, put it on a pad ----
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            Run r{c.engine, {}, {}, sr};
            std::string err;
            c.command("play");
            bool started = c.startRecording(0, 1, &err);
            r.go(2);
            printf("recording running=%d seconds=%.2f\n", (int)c.recording.load(), (float)c.engine.recCount.load() / sr);
            c.stopRecording();
            SampleBuf* b = c.engine.sampler.get(0);
            printf("resample started=%d pad1 name='%s' frames=%zu err='%s'\n", started, b->name.c_str(), b->L.size(), c.lastRecError().c_str());
            printf("state has pad path: %d\n", c.saveState().find("\npad 0 ") != std::string::npos);
            [NSFileManager.defaultManager removeItemAtPath:@(b->path.c_str()) error:nil];
        }
        // ---- new: chain plays patterns in order, one bar each ----
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            c.command("chain 1 2 0 5");
            Run r{c.engine, {}, {}, sr};
            c.command("play");
            double bar = 16 * 60.0 / (60 + c.engine.bpm->get() * 120) / 4;
            printf("chain patterns:");
            r.go(.05); for (int i = 0; i < 6; i++) { printf(" %d", c.engine.pattern.load()); r.go(bar); }
            printf(" (want 2 0 5 2 0 5)\n");
        }
        // ---- new: randomizer changes the expected share and never edits the stored pattern ----
        {
            for (float pct : {0.f, .05f, .5f}) {
                Core c("Test"); c.engine.prepare(sr, 4096);
                c.engine.vary->set(pct); c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
                uint32_t before = c.engine.steps[0][4].load();
                Run r{c.engine, {}, {}, sr};
                c.command("play");
                int mutated = 0, stepsSeen = 0, last = -1;
                for (int i = 0; i < 2400; i++) {
                    r.go(.01);
                    int st = c.engine.curStep.load();
                    if (st != last) { last = st; stepsSeen++; if (c.engine.mutMask.load()) mutated++; }
                }
                printf("vary %.0f%%: %d of %d steps had a change; pattern untouched=%d\n", pct * 100, mutated, stepsSeen, before == c.engine.steps[0][4].load());
            }
        }
        // ---- new: full take to disk, then a song save and open ----
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            Run r{c.engine, {}, {}, sr};
            c.command("play");
            bool ok = c.startTake();
            for (int i = 0; i < 300; i++) { r.go(.01); c.serviceRecording(); }
            c.stopTake();
            std::string path = Core::dataDir("Takes") + "/" + c.lastTakeName();
            NSDictionary* at = [NSFileManager.defaultManager attributesOfItemAtPath:@(path.c_str()) error:nil];
            printf("take ok=%d secs=%.2f bytes=%llu (want about %d)\n", ok, c.takeSeconds.load(), at.fileSize, (int)(c.takeSeconds.load() * sr * 6));
            [NSFileManager.defaultManager removeItemAtPath:@(path.c_str()) error:nil];
            c.engine.params.byKey("seq.vary")->set(.123f); c.command("chain 1 3 4");
            bool sv = c.saveProject("__marea_test");
            Core d("Test"); d.engine.prepare(sr, 4096);
            bool op = d.openProject("__marea_test");
            printf("song save=%d open=%d vary=%.3f chainOn=%d len=%d listed=%d\n", sv, op, d.engine.vary->get(), (int)d.engine.chainOn.load(), d.engine.chainLen.load(), d.projectsJson().find("__marea_test") != std::string::npos);
            [NSFileManager.defaultManager removeItemAtPath:@((Core::dataDir("Songs") + "/__marea_test.marea").c_str()) error:nil];
        }
        // ---- new: your Riddim kit loads onto lanes and pads, and a lane sample sounds ----
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            std::string err; bool ok = c.loadRiddimKit(&err);
            printf("riddim kit ok=%d err='%s' lanes=%s\n", ok, err.c_str(), c.lanesJson().c_str());
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            Run r{c.engine, {}, {}, sr};
            c.command("hit 0 0 1"); r.go(.5);
            float pk = 0; for (float x : r.L) pk = std::max(pk, std::fabs(x));
            printf("riddim kick peak %.2f\n", pk);
            c.command("kit synth");
            printf("after synth kit lanes=%s\n", c.lanesJson().c_str());
        }
        // MIDI notes from a Live clip must reach the right voices.
        {
            Core c("Test"); c.engine.prepare(sr, 4096);
            c.engine.echo.ret->set(0); c.engine.echo.spring->set(0);
            auto peak = [&](int note) { Run r{c.engine, {}, {}, sr}; c.engine.midiEvent(0x90, note, 110, 100); r.go(.15); c.engine.midiEvent(0x80, note, 0, 0); float p = 0; for (float x : r.L) p = std::max(p, std::fabs(x)); r.go(1.5); return p; };
            printf("midi peaks: kick(36)=%.2f snare(38)=%.2f hat(42)=%.2f pad1(48)=%.2f siren(60)=%.2f unmapped(100)=%.2f\n", peak(36), peak(38), peak(42), peak(48), peak(60), peak(100));
            c.engine.midiEvent(0x90, 75, 100, 0);
            Run r{c.engine, {}, {}, sr}; r.go(.05);
            printf("midi pattern note 75 -> pattern %d\n", c.engine.pattern.load());
        }
        // State must survive a save and load.
        {
            Core a("Test"), b("Test");
            a.engine.params.byKey("sir.pitch")->set(.123f);
            a.command("s 2 3 4 2");
            std::string s = a.saveState();
            b.loadState(s);
            printf("state roundtrip pitch=%.3f step=%x\n", b.engine.params.byKey("sir.pitch")->get(), b.engine.steps[2][3].load());
        }
    }
    // ---- 24 pads, voices, keys, metronome, live mic, duplicate ----
    {
        Core c("test");
        Engine& e = c.engine;
        const int SR = 48000, N = 512;
        e.prepare(SR, 4096);
        std::vector<float> L(N), R(N);
        auto run = [&](float secs, int* crossings = nullptr) {
            float pk = 0; float prev = 0; int xc = 0; bool bad = false;
            int blocks = (int)(secs * SR / N);
            Transport t;
            for (int b = 0; b < blocks; b++) {
                e.render(L.data(), R.data(), N, t);
                for (int i = 0; i < N; i++) { if (!std::isfinite(L[i])) bad = true; pk = std::max(pk, std::fabs(L[i])); if ((prev < 0) != (L[i] < 0)) xc++; prev = L[i]; }
            }
            if (crossings) *crossings = xc;
            return bad ? -1.f : pk;
        };
        e.clearPattern(0);
        for (int v = 0; v < 7; v++) {
            e.bass.voice->set(v / 6.f);
            run(.05f);
            e.fromUI.push({Engine::Cmd::Hit, 2, 36, .9f, 0});
            float pk = run(.25f);
            e.fromUI.push({Engine::Cmd::Release, 2, 36, 0, 0});
            run(.2f);
            printf("bass voice %d peak %.3f\n", v, pk);
        }
        // key: the same tom an octave up should cross zero about twice as often
        Param* key = e.params.byKey("pul.tom.key");
        int a = 0, b2 = 0;
        e.fromUI.push({Engine::Cmd::Hit, 0, 6, .9f, 0}); run(.2f, &a); run(1.f);
        key->set(.75f);
        e.fromUI.push({Engine::Cmd::Hit, 0, 6, .9f, 0}); run(.2f, &b2); run(1.f);
        key->set(.5f);
        printf("tom crossings %d, one octave up %d (ratio %.2f)\n", a, b2, (float)b2 / std::max(a, 1));
        // a sequenced pad
        e.padSteps[0][3].store(1u);
        e.localRun = true;
        float padPk = run(.6f);
        e.localRun = false;
        run(2.f);
        printf("sequenced pad 4 peak %.3f, empty pad 12 safe: ", padPk);
        e.fromUI.push({Engine::Cmd::Hit, 1, 11, .9f, 0});
        printf("%.3f\n", run(.05f));
        // duplicate
        e.steps[0][2].store(0x1234); e.bassSteps[0][5].store(300); e.padSteps[0][7].store(9);
        e.copyPattern(0, 5);
        printf("duplicate: %x %u %u\n", e.steps[5][2].load(), e.bassSteps[5][5].load(), e.padSteps[5][7].load());
        e.clearPattern(5); e.clearPattern(0);
        // metronome is heard but never reaches a take
        e.takeRing.assign(SR * 2, 0); e.takeW = 0; e.takeR = 0; e.takeOn = true;
        e.clickOn->set(1); e.localRun = true;
        float clickPk = run(1.f);
        float takePk = 0; uint32_t w = e.takeW.load();
        for (uint32_t i = 0; i < w && i < e.takeRing.size(); i++) takePk = std::max(takePk, std::fabs(e.takeRing[i]));
        e.takeOn = false; e.clickOn->set(0); e.localRun = false;
        printf("click output peak %.3f, in the take %.5f\n", clickPk, takePk);
        run(1.f);
        // live mic through every voice
        e.mic.on->set(1);
        std::vector<float> in(N);
        float ph = 0;
        for (int fx = 0; fx < 6; fx++) {
            e.mic.fx->set(fx / 5.f);
            float pk = 0; bool bad = false; int xc = 0; float prev = 0;
            for (int bl = 0; bl < 90; bl++) {
                for (int i = 0; i < N; i++) { ph += 440.f / SR; if (ph >= 1) ph -= 1; in[i] = std::sin(6.2831853f * ph) * .4f; }
                e.mic.push(in.data(), N);
                Transport t; e.render(L.data(), R.data(), N, t);
                for (int i = 0; i < N; i++) { if (!std::isfinite(L[i])) bad = true; if (bl > 40) { pk = std::max(pk, std::fabs(L[i])); if ((prev < 0) != (L[i] < 0)) xc++; } prev = L[i]; }
            }
            printf("mic fx %d peak %.3f crossings %d%s\n", fx, pk, xc, bad ? " NOT FINITE" : "");
        }
        e.mic.on->set(0);
        // a native touch and the page's copy of the same press play once
        Engine::Cmd cmd;
        while (e.fromUI.pop(cmd)) {}
        c.instantHit(0, 2, .9f);
        c.command("hit 0 2 .95");
        printf("page copy dropped after native touch: %s\n", e.fromUI.pop(cmd) ? "NO" : "yes");
        c.command("hit 0 2 .95");
        printf("next press still plays: %s\n", e.fromUI.pop(cmd) ? "yes" : "NO");
        // pad steps survive saving
        e.padSteps[3][20].store(0x10001);
        std::string st = c.saveState();
        Core d("test2"); d.loadState(st);
        printf("pad steps saved: %x\n", d.engine.padSteps[3][20].load());
    }
    // ---- MIDI clock, listened to on a virtual MIDI port as outside gear would ----
    {
        Core c("clock");
        Engine& e = c.engine;
        const int SR = 48000, N = 128;
        e.prepare(SR, 4096);
        struct Rx { uint8_t st; uint64_t when; };
        static std::mutex mu; static std::vector<Rx> rx;
        MIDIClientRef cl; MIDIEndpointRef dest;
        MIDIClientCreateWithBlock(CFSTR("clocktest"), &cl, nil);
        MIDIDestinationCreateWithBlock(cl, CFSTR("clock listener"), &dest, ^(const MIDIPacketList* l, void*) {
            std::lock_guard<std::mutex> g(mu);
            const MIDIPacket* p = &l->packet[0];
            for (UInt32 i = 0; i < l->numPackets; i++) { for (int k = 0; k < p->length; k++) rx.push_back({p->data[k], p->timeStamp ? p->timeStamp : mach_absolute_time()}); p = MIDIPacketNext(p); }
        });
        startMidiInput(&e);
        e.bpm->set((120 - 60) / 120.f);
        std::vector<float> L(N), R(N);
        auto play = [&](double secs) {
            mach_timebase_info_data_t tb; mach_timebase_info(&tb);
            uint64_t next = mach_absolute_time();
            uint64_t step = (uint64_t)(N / (double)SR * 1e9 * tb.denom / tb.numer);
            for (int b = 0; b < (int)(secs * SR / N); b++) {
                Transport t; t.hostTime = next; e.render(L.data(), R.data(), N, t);
                next += step; mach_wait_until(next);
            }
        };
        auto summary = [&](const char* label) {
            usleep(60000);
            std::lock_guard<std::mutex> g(mu);
            int ticks = 0, starts = 0, stops = 0, firstTickAfterStart = -1;
            for (size_t i = 0; i < rx.size(); i++) { if (rx[i].st == 0xF8) ticks++; if (rx[i].st == 0xFA) { starts++; firstTickAfterStart = ticks; } if (rx[i].st == 0xFC) stops++; }
            mach_timebase_info_data_t tb; mach_timebase_info(&tb);
            double lo = 1e9, hi = 0, sum = 0; int n = 0; uint64_t prev = 0;
            for (auto& r : rx) if (r.st == 0xF8) { if (prev) { double ms = (r.when - prev) * tb.numer / (double)tb.denom / 1e6; lo = std::min(lo, ms); hi = std::max(hi, ms); sum += ms; n++; } prev = r.when; }
            printf("%s: start %d stop %d ticks %d, gap avg %.3f ms (min %.3f max %.3f, want 20.833), ticks before start %d\n", label, starts, stops, ticks, n ? sum / n : 0, n ? lo : 0, hi, firstTickAfterStart);
            rx.clear();
        };
        e.localRun = true; play(1); e.localRun = false; play(.1);
        summary("clock off");
        e.clockOut->set(1);
        e.localRun = true; play(4); e.localRun = false; play(.1);
        summary("clock on, 120 BPM, 4 s");
        e.clockOut->set(0);
        e.localRun = true; play(1.2);
        e.clockOut->set(1); play(2.2);
        summary("turned on mid-bar");
        e.clockOut->set(0); play(.1); e.localRun = false;
        summary("turned off");
        usleep(100000);
        printf("midi outputs seen: %d\n", (int)MIDIGetNumberOfDestinations());
    }
    return 0;
}
