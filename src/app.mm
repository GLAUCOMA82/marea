// Standalone Marea: the same engine and panel, playing through the Mac's default output.
#include "core.h"
#include "midi_input.h"
#import <AudioToolbox/AudioToolbox.h>
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <fstream>
#include <sstream>

static Core* gCore;
static AudioUnit gOut;

static OSStatus renderCB(void*, AudioUnitRenderActionFlags*, const AudioTimeStamp* ts, UInt32, UInt32 frames, AudioBufferList* io) {
    Transport t;
    t.hostTime = ts->mHostTime;
    gCore->engine.render((float*)io->mBuffers[0].mData, (float*)io->mBuffers[1].mData, (int)frames, t);
    return noErr;
}

static std::string statePath() { return Core::supportDir() + "/standalone.state"; }

static bool startAudio() {
    AudioComponentDescription d{kAudioUnitType_Output, kAudioUnitSubType_DefaultOutput, kAudioUnitManufacturer_Apple, 0, 0};
    AudioComponent c = AudioComponentFindNext(nullptr, &d);
    if (!c || AudioComponentInstanceNew(c, &gOut) != noErr) return false;
    AudioStreamBasicDescription hw{}; UInt32 sz = sizeof hw;
    AudioUnitGetProperty(gOut, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &hw, &sz);
    double sr = hw.mSampleRate > 0 ? hw.mSampleRate : 48000;
    AudioStreamBasicDescription f{};
    f.mSampleRate = sr; f.mFormatID = kAudioFormatLinearPCM;
    f.mFormatFlags = kAudioFormatFlagsNativeFloatPacked | kAudioFormatFlagIsNonInterleaved;
    f.mFramesPerPacket = 1; f.mChannelsPerFrame = 2; f.mBitsPerChannel = 32; f.mBytesPerFrame = 4; f.mBytesPerPacket = 4;
    AudioUnitSetProperty(gOut, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &f, sizeof f);
    // A short hardware buffer keeps pads and keys tight. The device may round this up.
    UInt32 frames = 128;
    AudioUnitSetProperty(gOut, kAudioDevicePropertyBufferFrameSize, kAudioUnitScope_Global, 0, &frames, sizeof frames);
    UInt32 maxF = 8192;
    AudioUnitSetProperty(gOut, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxF, sizeof maxF);
    AURenderCallbackStruct cb{renderCB, nullptr};
    AudioUnitSetProperty(gOut, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &cb, sizeof cb);
    gCore->engine.prepare(sr, 8192);
    if (AudioUnitInitialize(gOut) != noErr) return false;
    // What the Mac itself says its output adds, shown on the panel. Bluetooth headphones report a lot.
    AudioObjectID dev = 0; UInt32 ds = sizeof dev;
    if (AudioUnitGetProperty(gOut, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &dev, &ds) == noErr && dev) {
        UInt32 lat = 0, safety = 0, buf = 0, n = sizeof(UInt32);
        AudioObjectPropertyAddress a{kAudioDevicePropertyLatency, kAudioDevicePropertyScopeOutput, kAudioObjectPropertyElementMain};
        AudioObjectGetPropertyData(dev, &a, 0, nullptr, &n, &lat);
        a.mSelector = kAudioDevicePropertySafetyOffset; n = sizeof(UInt32);
        AudioObjectGetPropertyData(dev, &a, 0, nullptr, &n, &safety);
        a.mSelector = kAudioDevicePropertyBufferFrameSize; n = sizeof(UInt32);
        AudioObjectGetPropertyData(dev, &a, 0, nullptr, &n, &buf);
        gCore->outLatencyMs = (float)((lat + safety + buf) / sr * 1000);
        gCore->engine.clockDelaySec = std::max(.005, (lat + safety) / sr);
    }
    return AudioOutputUnitStart(gOut) == noErr;
}

@interface FirstMouseWeb : WKWebView @end
@implementation FirstMouseWeb
- (BOOL)acceptsFirstMouse:(NSEvent*)e { return YES; }
@end

@interface AppDel : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property(strong) NSWindow* window;
@property(strong) WKWebView* web;
@end
@implementation AppDel
- (void)applicationDidFinishLaunching:(NSNotification*)n {
    gCore = new Core("Standalone");
    gCore->webRoot = [NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"web"].UTF8String;
    std::ifstream in(statePath());
    if (in) { std::stringstream ss; ss << in.rdbuf(); gCore->loadState(ss.str()); }
    if (!startAudio()) NSLog(@"Marea: couldn't start audio output");
    gCore->startServer();
    startMidiInput(&gCore->engine);

    NSMenu* menu = [NSMenu new];
    NSMenuItem* appItem = [NSMenuItem new]; [menu addItem:appItem];
    NSMenu* appMenu = [NSMenu new];
    [appMenu addItemWithTitle:@"Quit Marea" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    NSMenuItem* winItem = [NSMenuItem new]; [menu addItem:winItem];
    NSMenu* winMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [winMenu addItemWithTitle:@"Close" action:@selector(performClose:) keyEquivalent:@"w"];
    [winMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    winItem.submenu = winMenu;
    NSApp.mainMenu = menu; NSApp.windowsMenu = winMenu;

    NSRect f = NSMakeRect(0, 0, 1240, 790);
    self.window = [[NSWindow alloc] initWithContentRect:f styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Marea";
    self.window.delegate = self;
    self.window.contentAspectRatio = NSMakeSize(1240, 790);
    self.window.contentMinSize = NSMakeSize(868, 553);
    self.window.frameAutosaveName = @"MareaMain";
    self.web = [[FirstMouseWeb alloc] initWithFrame:f configuration:[WKWebViewConfiguration new]];
    self.web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.window.contentView = self.web;
    NSString* url = [NSString stringWithFormat:@"http://127.0.0.1:%d/?local=1#k=%s", gCore->port(), gCore->token().c_str()];
    [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:url]]];
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    NSLog(@"Marea iPad address: %s", urlForLAN(gCore->port(), gCore->token()).c_str());
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)a { return YES; }
- (void)applicationWillTerminate:(NSNotification*)n {
    std::ofstream out(statePath());
    out << gCore->saveState();
    AudioOutputUnitStop(gOut);
}
@end

int main(int argc, const char** argv) {
    @autoreleasepool {
        NSApplication* app = NSApplication.sharedApplication;
        app.activationPolicy = NSApplicationActivationPolicyRegular;
        AppDel* d = [AppDel new];
        app.delegate = d;
        [app run];
    }
    return 0;
}
