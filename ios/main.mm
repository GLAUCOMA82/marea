// Marea for iPad: the same engine and panel as the Mac, running entirely on the iPad.
#include "../src/core.h"
#include "../src/midi_input.h"
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <UIKit/UIKit.h>
#import <UIKit/UIGestureRecognizerSubclass.h>
#import <WebKit/WebKit.h>
#include <fstream>
#include <sstream>
#include <vector>

static Core* gCore;
static AudioUnit gOut;
static bool gMicLive = false;   // the live mic channel is open: input runs through the render callback
static float gMicBuf[8192];

static OSStatus renderCB(void*, AudioUnitRenderActionFlags* flags, const AudioTimeStamp* ts, UInt32, UInt32 frames, AudioBufferList* io) {
    if (gMicLive && frames <= 8192) {
        AudioBufferList in;
        in.mNumberBuffers = 1;
        in.mBuffers[0] = {1, frames * (UInt32)sizeof(float), gMicBuf};
        if (AudioUnitRender(gOut, flags, ts, 1, frames, &in) == noErr) gCore->engine.mic.push(gMicBuf, (int)frames);
    }
    Transport t;
    t.hostTime = ts->mHostTime;
    gCore->engine.render((float*)io->mBuffers[0].mData, (float*)io->mBuffers[1].mData, (int)frames, t);
    return noErr;
}
static std::string statePath() { return Core::supportDir() + "/ipad.state"; }
static void saveState() { std::ofstream out(statePath()); out << gCore->saveState(); }

static void updateLatency() {
    AVAudioSession* s = AVAudioSession.sharedInstance;
    gCore->outLatencyMs = (float)((s.outputLatency + s.IOBufferDuration) * 1000);
    gCore->engine.clockDelaySec = std::max(.005, s.outputLatency);
}
static void configureSession(BOOL forMic) {
    AVAudioSession* s = AVAudioSession.sharedInstance;
    NSError* err = nil;
    if (gMicLive) {
        // Talking through AirPods needs their microphone; the high-quality option keeps the music from
        // dropping to phone-call sound where the AirPods support it.
        AVAudioSessionCategoryOptions o = AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetoothHFP | AVAudioSessionCategoryOptionAllowBluetoothA2DP;
        if (@available(iOS 26.0, *)) o |= AVAudioSessionCategoryOptionBluetoothHighQualityRecording;
        [s setCategory:AVAudioSessionCategoryPlayAndRecord withOptions:o error:&err];
    }
    else if (forMic) [s setCategory:AVAudioSessionCategoryPlayAndRecord withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetoothA2DP error:&err];
    else [s setCategory:AVAudioSessionCategoryPlayback error:&err];
    [s setPreferredIOBufferDuration:128.0 / 48000 error:&err];  // short buffer: tight pads and keys
    [s setPreferredSampleRate:48000 error:&err];
    [s setActive:YES error:&err];
    updateLatency();
}

static void stopAudio() {
    if (!gOut) return;
    AudioOutputUnitStop(gOut);
    AudioUnitUninitialize(gOut);
    AudioComponentInstanceDispose(gOut);
    gOut = nullptr;
}
static bool startAudio() {
    stopAudio();
    double sr = AVAudioSession.sharedInstance.sampleRate;
    if (sr <= 0) sr = 48000;
    AudioComponentDescription d{kAudioUnitType_Output, kAudioUnitSubType_RemoteIO, kAudioUnitManufacturer_Apple, 0, 0};
    AudioComponent c = AudioComponentFindNext(nullptr, &d);
    if (!c || AudioComponentInstanceNew(c, &gOut) != noErr) return false;
    AudioStreamBasicDescription f{};
    f.mSampleRate = sr; f.mFormatID = kAudioFormatLinearPCM;
    f.mFormatFlags = kAudioFormatFlagsNativeFloatPacked | kAudioFormatFlagIsNonInterleaved;
    f.mFramesPerPacket = 1; f.mChannelsPerFrame = 2; f.mBitsPerChannel = 32; f.mBytesPerFrame = 4; f.mBytesPerPacket = 4;
    AudioUnitSetProperty(gOut, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &f, sizeof f);
    if (gMicLive) {
        UInt32 one = 1;
        AudioUnitSetProperty(gOut, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &one, sizeof one);
        AudioStreamBasicDescription m = f;
        m.mChannelsPerFrame = 1;
        AudioUnitSetProperty(gOut, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 1, &m, sizeof m);
    }
    UInt32 maxF = 4096;
    AudioUnitSetProperty(gOut, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxF, sizeof maxF);
    AURenderCallbackStruct cb{renderCB, nullptr};
    AudioUnitSetProperty(gOut, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &cb, sizeof cb);
    gCore->engine.prepare(sr, 4096);
    if (AudioUnitInitialize(gOut) != noErr) return false;
    return AudioOutputUnitStart(gOut) == noErr;
}

// The page tells us where its keys and pads are. A touch on one plays immediately from here, a beat
// before the web page gets to run. The page's own copy of the press is dropped by Core::instantHit.
struct Zone { CGRect r; int m, i; float vel; int pid; float pval; };
static std::vector<Zone> gZones;

@interface InstantTouch : UIGestureRecognizer <UIGestureRecognizerDelegate>
@end
@implementation InstantTouch
- (instancetype)init {
    if ((self = [super initWithTarget:nil action:nil])) {
        self.cancelsTouchesInView = NO; self.delaysTouchesBegan = NO; self.delaysTouchesEnded = NO; self.delegate = self;
    }
    return self;
}
- (BOOL)gestureRecognizer:(UIGestureRecognizer*)g shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer*)o { return YES; }
- (void)touchesBegan:(NSSet<UITouch*>*)touches withEvent:(UIEvent*)e {
    for (UITouch* t in touches) {
        CGPoint p = [t locationInView:self.view];
        const Zone* best = nullptr; CGFloat area = 1e12;
        for (auto& z : gZones) if (CGRectContainsPoint(z.r, p)) { CGFloat a = z.r.size.width * z.r.size.height; if (a < area) { area = a; best = &z; } }
        if (!best) continue;
        if (best->pid >= 0) if (Param* q = gCore->engine.params.byId(best->pid)) q->set(best->pval);
        if (best->m >= 0) gCore->instantHit(best->m, best->i, best->vel);
    }
}
- (void)finish:(UIEvent*)e {
    for (UITouch* t in e.allTouches) if (t.view && t.phase != UITouchPhaseEnded && t.phase != UITouchPhaseCancelled) return;
    self.state = UIGestureRecognizerStateFailed;
}
- (void)touchesEnded:(NSSet<UITouch*>*)touches withEvent:(UIEvent*)e { [self finish:e]; }
- (void)touchesCancelled:(NSSet<UITouch*>*)touches withEvent:(UIEvent*)e { [self finish:e]; }
@end

@interface VC : UIViewController <WKUIDelegate, WKScriptMessageHandler>
@property(strong) WKWebView* web;
@end
@implementation VC
- (void)userContentController:(WKUserContentController*)c didReceiveScriptMessage:(WKScriptMessage*)msg {
    if (![msg.body isKindOfClass:NSArray.class]) return;
    std::vector<Zone> zs;
    for (NSArray* a in (NSArray*)msg.body) {
        if (![a isKindOfClass:NSArray.class] || a.count < 9) continue;
        zs.push_back({CGRectMake([a[0] doubleValue], [a[1] doubleValue], [a[2] doubleValue], [a[3] doubleValue]), [a[4] intValue], [a[5] intValue], [a[6] floatValue], [a[7] intValue], [a[8] floatValue]});
    }
    gZones.swap(zs);
}
- (void)loadView {
    WKWebViewConfiguration* cfg = [WKWebViewConfiguration new];
    [cfg.userContentController addScriptMessageHandler:self name:@"zones"];
    self.web = [[WKWebView alloc] initWithFrame:UIScreen.mainScreen.bounds configuration:cfg];
    self.web.opaque = NO;
    self.web.backgroundColor = UIColor.blackColor;
    self.web.scrollView.backgroundColor = UIColor.blackColor;
    self.web.scrollView.scrollEnabled = NO;
    self.web.scrollView.bounces = NO;
    self.web.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    self.view = self.web;
    [self.web addGestureRecognizer:[InstantTouch new]];
    NSString* url = [NSString stringWithFormat:@"http://127.0.0.1:%d/?local=1&app=1#k=%s", gCore->port(), gCore->token().c_str()];
    [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:url]]];
}
- (BOOL)prefersStatusBarHidden { return YES; }
- (BOOL)prefersHomeIndicatorAutoHidden { return YES; }
- (UIRectEdge)preferredScreenEdgesDeferringSystemGestures { return UIRectEdgeAll; }
- (UIInterfaceOrientationMask)supportedInterfaceOrientations { return UIInterfaceOrientationMaskLandscape; }
@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@end
@implementation AppDelegate
- (BOOL)application:(UIApplication*)app didFinishLaunchingWithOptions:(NSDictionary*)opts {
    gCore = new Core("iPad");
    gCore->webRoot = [NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"web"].UTF8String;
    std::ifstream in(statePath());
    if (in) { std::stringstream ss; ss << in.rdbuf(); gCore->loadState(ss.str()); }

    // The mic is only opened, and only asked for, the first time you press record.
    gCore->prepareMic = [] {
        __block BOOL allowed = NO;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [AVAudioSession.sharedInstance requestRecordPermission:^(BOOL granted) { allowed = granted; dispatch_semaphore_signal(sem); }];
        dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
        if (!allowed) return false;
        dispatch_sync(dispatch_get_main_queue(), ^{ configureSession(YES); startAudio(); });
        return true;
    };
    gCore->micFinished = [] { dispatch_async(dispatch_get_main_queue(), ^{ configureSession(NO); startAudio(); }); };
    gCore->liveMicStarted = [] {
        __block BOOL allowed = NO;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [AVAudioSession.sharedInstance requestRecordPermission:^(BOOL granted) { allowed = granted; dispatch_semaphore_signal(sem); }];
        dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
        if (!allowed) return false;
        dispatch_sync(dispatch_get_main_queue(), ^{ gMicLive = true; configureSession(YES); startAudio(); });
        return true;
    };
    gCore->liveMicStopped = [] { dispatch_async(dispatch_get_main_queue(), ^{ gMicLive = false; configureSession(NO); startAudio(); }); };

    configureSession(NO);
    startAudio();
    gCore->startServer();
    startMidiInput(&gCore->engine);

    NSNotificationCenter* nc = NSNotificationCenter.defaultCenter;
    [nc addObserverForName:AVAudioSessionInterruptionNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification* n) {
        if ([n.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeEnded) { configureSession(NO); startAudio(); }
    }];
    __block double lastRate = AVAudioSession.sharedInstance.sampleRate;
    [nc addObserverForName:AVAudioSessionRouteChangeNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification* n) {
        // Headphones and Bluetooth can change the sample rate, and the engine must follow.
        double r = AVAudioSession.sharedInstance.sampleRate;
        if (r != lastRate) { lastRate = r; startAudio(); }
        updateLatency();
    }];
    [nc addObserverForName:AVAudioSessionMediaServicesWereResetNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification* n) { gOut = nullptr; configureSession(NO); startAudio(); }];

    app.idleTimerDisabled = YES;  // an instrument shouldn't dim mid-performance
    return YES;
}
- (void)applicationWillTerminate:(UIApplication*)a { saveState(); }
@end

// iPadOS 27 requires the scene lifecycle: the window lives here.
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(strong) UIWindow* window;
@end
@implementation SceneDelegate
- (void)scene:(UIScene*)scene willConnectToSession:(UISceneSession*)session options:(UISceneConnectionOptions*)options {
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene*)scene];
    self.window.backgroundColor = UIColor.blackColor;
    self.window.rootViewController = [VC new];
    [self.window makeKeyAndVisible];
}
- (void)sceneDidEnterBackground:(UIScene*)scene { saveState(); }
- (void)sceneWillEnterForeground:(UIScene*)scene { configureSession(NO); if (!gOut) startAudio(); }
@end

int main(int argc, char** argv) {
    @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(AppDelegate.class)); }
}
