// The Audio Unit (version 2) wrapper, written directly against Apple's C API. It's an instrument with
// one stereo output, MIDI in, and every knob exposed to Live for automation.
#include "core.h"
#import <AudioToolbox/AudioToolbox.h>
#import <AudioUnit/AUCocoaUIView.h>
#import <Cocoa/Cocoa.h>
#import <CoreAudioKit/CoreAudioKit.h>
#import <WebKit/WebKit.h>
#include <mach/mach_time.h>
#include <vector>

static const OSType kSubtype = 'Mr01', kManu = 'Mrea';
static const AudioUnitPropertyID kPropConnectionInfo = 64001;

struct ConnectionInfo { int port; char token[64]; };

struct Listener { AudioUnitPropertyID id; AudioUnitPropertyListenerProc proc; void* ref; };
struct RenderNotify { AURenderCallback proc; void* ref; };

struct Marea {
    AudioComponentPlugInInterface iface;
    AudioUnit self = nullptr;
    Core core{"Live"};
    double sampleRate = 48000;
    UInt32 maxFrames = 4096;
    bool initialized = false;
    HostCallbackInfo host{};
    std::vector<Listener> listeners;
    std::vector<RenderNotify> notifies;
    std::vector<float> scratchL, scratchR;
    std::vector<AudioUnitParameterID> paramIds;
    CFStringRef presetName = CFSTR("Untitled");
    Marea();
    void notifyProp(AudioUnitPropertyID id, AudioUnitScope scope, AudioUnitElement elem) {
        for (auto& l : listeners) if (l.id == id) l.proc(l.ref, self, id, scope, elem);
    }
};

// ------------------------------- selectors ---------------------------------
static OSStatus AUInit(void* s) {
    auto* m = (Marea*)s;
    if (m->initialized) return noErr;
    m->scratchL.assign(m->maxFrames, 0); m->scratchR.assign(m->maxFrames, 0);
    m->core.engine.prepare(m->sampleRate, m->maxFrames);
    m->core.startServer();
    m->initialized = true;
    return noErr;
}
static OSStatus AUUninit(void* s) { ((Marea*)s)->initialized = false; return noErr; }
static OSStatus AUReset(void* s, AudioUnitScope, AudioUnitElement) { auto* m = (Marea*)s; if (m->initialized) m->core.engine.reset(); return noErr; }

static AudioStreamBasicDescription streamFormat(double sr) {
    AudioStreamBasicDescription f{};
    f.mSampleRate = sr; f.mFormatID = kAudioFormatLinearPCM;
    f.mFormatFlags = kAudioFormatFlagsNativeFloatPacked | kAudioFormatFlagIsNonInterleaved;
    f.mFramesPerPacket = 1; f.mChannelsPerFrame = 2; f.mBitsPerChannel = 32; f.mBytesPerFrame = 4; f.mBytesPerPacket = 4;
    return f;
}

static OSStatus AUGetPropInfo(void* s, AudioUnitPropertyID id, AudioUnitScope scope, AudioUnitElement elem, UInt32* size, Boolean* w) {
    auto* m = (Marea*)s;
    UInt32 sz = 0; Boolean wr = false;
    switch (id) {
        case kAudioUnitProperty_StreamFormat:
            if (scope != kAudioUnitScope_Output || elem != 0) return scope == kAudioUnitScope_Input ? kAudioUnitErr_InvalidElement : kAudioUnitErr_InvalidScope;
            sz = sizeof(AudioStreamBasicDescription); wr = true; break;
        case kAudioUnitProperty_SampleRate:
            if (scope == kAudioUnitScope_Input) return kAudioUnitErr_InvalidElement;
            if (scope != kAudioUnitScope_Output && scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope;
            sz = sizeof(Float64); wr = true; break;
        case kAudioUnitProperty_MaximumFramesPerSlice: sz = sizeof(UInt32); wr = true; break;
        case kAudioUnitProperty_ElementCount: sz = sizeof(UInt32); wr = false; break;
        case kAudioUnitProperty_ClassInfo: if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope; sz = sizeof(CFPropertyListRef); wr = true; break;
        case kAudioUnitProperty_ParameterList:
            sz = scope == kAudioUnitScope_Global ? (UInt32)(m->paramIds.size() * sizeof(AudioUnitParameterID)) : 0; break;
        case kAudioUnitProperty_ParameterInfo:
            if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidParameter;
            sz = sizeof(AudioUnitParameterInfo); break;
        case kAudioUnitProperty_Latency: case kAudioUnitProperty_TailTime:
            if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope;
            sz = sizeof(Float64); break;
        case kAudioUnitProperty_SupportedNumChannels: if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope; sz = sizeof(AUChannelInfo); break;
        case kAudioUnitProperty_HostCallbacks: if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope; sz = sizeof(HostCallbackInfo); wr = true; break;
        case kAudioUnitProperty_CocoaUI: if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope; sz = sizeof(AudioUnitCocoaViewInfo); break;
        case kAudioUnitProperty_InPlaceProcessing: sz = sizeof(UInt32); wr = true; break;
        case kAudioUnitProperty_PresentPreset: if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope; sz = sizeof(AUPreset); wr = true; break;
        case kAudioUnitProperty_LastRenderError: sz = sizeof(OSStatus); break;
        case kMusicDeviceProperty_InstrumentCount: if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope; sz = sizeof(UInt32); break;
        case kPropConnectionInfo: sz = sizeof(ConnectionInfo); break;
        default: return kAudioUnitErr_InvalidProperty;
    }
    if (size) *size = sz;
    if (w) *w = wr;
    return noErr;
}

static OSStatus AUGetProp(void* s, AudioUnitPropertyID id, AudioUnitScope scope, AudioUnitElement elem, void* data, UInt32* size) {
    auto* m = (Marea*)s;
    UInt32 need = 0; Boolean wr;
    OSStatus st = AUGetPropInfo(s, id, scope, elem, &need, &wr);
    if (st != noErr) return st;
    if (!data) { if (size) *size = need; return noErr; }
    if (*size < need) return kAudioUnitErr_InvalidPropertyValue;
    *size = need;
    switch (id) {
        case kAudioUnitProperty_StreamFormat: *(AudioStreamBasicDescription*)data = streamFormat(m->sampleRate); break;
        case kAudioUnitProperty_SampleRate: *(Float64*)data = m->sampleRate; break;
        case kAudioUnitProperty_MaximumFramesPerSlice: *(UInt32*)data = m->maxFrames; break;
        case kAudioUnitProperty_ElementCount: *(UInt32*)data = scope == kAudioUnitScope_Input ? 0 : 1; break;
        case kAudioUnitProperty_ClassInfo: {
            CFMutableDictionaryRef d = CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
            auto putInt = [&](CFStringRef k, SInt32 v) { CFNumberRef n = CFNumberCreate(nullptr, kCFNumberSInt32Type, &v); CFDictionarySetValue(d, k, n); CFRelease(n); };
            putInt(CFSTR(kAUPresetVersionKey), 0);
            putInt(CFSTR(kAUPresetTypeKey), kAudioUnitType_MusicDevice);
            putInt(CFSTR(kAUPresetSubtypeKey), kSubtype);
            putInt(CFSTR(kAUPresetManufacturerKey), kManu);
            CFDictionarySetValue(d, CFSTR(kAUPresetNameKey), m->presetName);
            std::string text = m->core.saveState();
            CFDataRef blob = CFDataCreate(nullptr, (const UInt8*)text.data(), (CFIndex)text.size());
            CFDictionarySetValue(d, CFSTR(kAUPresetDataKey), blob);
            CFRelease(blob);
            *(CFPropertyListRef*)data = d;
            break;
        }
        case kAudioUnitProperty_ParameterList:
            if (scope == kAudioUnitScope_Global) std::copy(m->paramIds.begin(), m->paramIds.end(), (AudioUnitParameterID*)data);
            break;
        case kAudioUnitProperty_ParameterInfo: {
            Param* p = m->core.engine.params.byId((int)elem);
            if (!p) return kAudioUnitErr_InvalidParameter;
            auto* info = (AudioUnitParameterInfo*)data;
            memset(info, 0, sizeof *info);
            CFStringRef name = CFStringCreateWithCString(nullptr, p->name.c_str(), kCFStringEncodingUTF8);
            CFStringGetCString(name, info->name, sizeof info->name, kCFStringEncodingUTF8);
            info->cfNameString = name;
            info->flags = kAudioUnitParameterFlag_IsReadable | kAudioUnitParameterFlag_IsWritable | kAudioUnitParameterFlag_HasCFNameString | kAudioUnitParameterFlag_CFNameRelease;
            info->unit = p->steps == 2 ? kAudioUnitParameterUnit_Boolean : kAudioUnitParameterUnit_Generic;
            info->minValue = 0; info->maxValue = 1; info->defaultValue = p->def;
            break;
        }
        case kAudioUnitProperty_Latency: *(Float64*)data = 0; break;
        case kAudioUnitProperty_TailTime: *(Float64*)data = 4; break;
        case kAudioUnitProperty_SupportedNumChannels: { AUChannelInfo c{0, 2}; *(AUChannelInfo*)data = c; break; }
        case kAudioUnitProperty_HostCallbacks: *(HostCallbackInfo*)data = m->host; break;
        case kAudioUnitProperty_CocoaUI: {
            auto* info = (AudioUnitCocoaViewInfo*)data;
            NSBundle* b = [NSBundle bundleWithIdentifier:@"com.marea.instrument.au"];
            if (!b) return kAudioUnitErr_InvalidProperty;
            info->mCocoaAUViewBundleLocation = (CFURLRef)CFBridgingRetain(b.bundleURL);
            info->mCocoaAUViewClass[0] = CFStringCreateCopy(nullptr, CFSTR("MareaAUViewFactory_1_0"));
            break;
        }
        case kAudioUnitProperty_InPlaceProcessing: *(UInt32*)data = 0; break;
        case kAudioUnitProperty_PresentPreset: { AUPreset pr{-1, m->presetName}; CFRetain(m->presetName); *(AUPreset*)data = pr; break; }
        case kAudioUnitProperty_LastRenderError: *(OSStatus*)data = noErr; break;
        case kMusicDeviceProperty_InstrumentCount: *(UInt32*)data = 0; break;
        case kPropConnectionInfo: {
            auto* ci = (ConnectionInfo*)data;
            m->core.startServer();
            ci->port = m->core.port();
            snprintf(ci->token, sizeof ci->token, "%s", m->core.token().c_str());
            break;
        }
    }
    return noErr;
}

static OSStatus AUSetProp(void* s, AudioUnitPropertyID id, AudioUnitScope scope, AudioUnitElement elem, const void* data, UInt32 size) {
    auto* m = (Marea*)s;
    switch (id) {
        case kAudioUnitProperty_StreamFormat: {
            if (scope != kAudioUnitScope_Output) return scope == kAudioUnitScope_Input ? kAudioUnitErr_InvalidElement : kAudioUnitErr_InvalidScope;
            if (elem != 0) return kAudioUnitErr_InvalidElement;
            if (size < sizeof(AudioStreamBasicDescription)) return kAudioUnitErr_InvalidPropertyValue;
            auto* f = (const AudioStreamBasicDescription*)data;
            if (f->mFormatID != kAudioFormatLinearPCM || f->mChannelsPerFrame != 2 || !(f->mFormatFlags & kAudioFormatFlagIsFloat) ||
                !(f->mFormatFlags & kAudioFormatFlagIsNonInterleaved) || f->mBitsPerChannel != 32 || f->mSampleRate <= 0) return kAudioUnitErr_FormatNotSupported;
            if (m->initialized && f->mSampleRate != m->sampleRate) return kAudioUnitErr_Initialized;
            bool changed = m->sampleRate != f->mSampleRate;
            m->sampleRate = f->mSampleRate;
            if (changed) { m->notifyProp(kAudioUnitProperty_SampleRate, scope, elem); }
            m->notifyProp(id, scope, elem);
            return noErr;
        }
        case kAudioUnitProperty_SampleRate: {
            if (scope != kAudioUnitScope_Output && scope != kAudioUnitScope_Global) return scope == kAudioUnitScope_Input ? kAudioUnitErr_InvalidElement : kAudioUnitErr_InvalidScope;
            if (size < sizeof(Float64)) return kAudioUnitErr_InvalidPropertyValue;
            Float64 sr = *(const Float64*)data;
            if (sr <= 0) return kAudioUnitErr_InvalidPropertyValue;
            if (m->initialized && sr != m->sampleRate) return kAudioUnitErr_Initialized;
            m->sampleRate = sr;
            m->notifyProp(id, scope, elem);
            return noErr;
        }
        case kAudioUnitProperty_MaximumFramesPerSlice: {
            if (size < sizeof(UInt32)) return kAudioUnitErr_InvalidPropertyValue;
            UInt32 v = *(const UInt32*)data;
            if (v == 0) return kAudioUnitErr_InvalidPropertyValue;
            if (m->initialized && v != m->maxFrames) return kAudioUnitErr_Initialized;
            m->maxFrames = v;
            m->notifyProp(id, scope, elem);
            return noErr;
        }
        case kAudioUnitProperty_HostCallbacks: {
            HostCallbackInfo h{};
            memcpy(&h, data, std::min<size_t>(size, sizeof h));
            m->host = h;
            return noErr;
        }
        case kAudioUnitProperty_ClassInfo: {
            if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope;
            CFPropertyListRef pl = *(const CFPropertyListRef*)data;
            if (!pl || CFGetTypeID(pl) != CFDictionaryGetTypeID()) return kAudioUnitErr_InvalidPropertyValue;
            CFStringRef nm = (CFStringRef)CFDictionaryGetValue((CFDictionaryRef)pl, CFSTR(kAUPresetNameKey));
            if (nm && CFGetTypeID(nm) == CFStringGetTypeID()) { CFRetain(nm); CFRelease(m->presetName); m->presetName = nm; }
            CFDataRef blob = (CFDataRef)CFDictionaryGetValue((CFDictionaryRef)pl, CFSTR(kAUPresetDataKey));
            if (blob && CFGetTypeID(blob) == CFDataGetTypeID())
                m->core.loadState(std::string((const char*)CFDataGetBytePtr(blob), (size_t)CFDataGetLength(blob)));
            return noErr;
        }
        case kAudioUnitProperty_InPlaceProcessing: return noErr;
        case kAudioUnitProperty_PresentPreset: {
            if (size < sizeof(AUPreset)) return kAudioUnitErr_InvalidPropertyValue;
            CFStringRef nm = ((const AUPreset*)data)->presetName;
            if (nm) { CFRetain(nm); CFRelease(m->presetName); m->presetName = nm; }
            return noErr;
        }
        default: return kAudioUnitErr_InvalidProperty;
    }
}

static OSStatus AUGetParam(void* s, AudioUnitParameterID id, AudioUnitScope scope, AudioUnitElement, AudioUnitParameterValue* v) {
    auto* m = (Marea*)s;
    if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope;
    Param* p = m->core.engine.params.byId((int)id);
    if (!p) return kAudioUnitErr_InvalidParameter;
    *v = p->get();
    return noErr;
}
static OSStatus AUSetParam(void* s, AudioUnitParameterID id, AudioUnitScope scope, AudioUnitElement, AudioUnitParameterValue v, UInt32) {
    auto* m = (Marea*)s;
    if (scope != kAudioUnitScope_Global) return kAudioUnitErr_InvalidScope;
    Param* p = m->core.engine.params.byId((int)id);
    if (!p) return kAudioUnitErr_InvalidParameter;
    p->set(v);
    return noErr;
}
static OSStatus AUSchedule(void* s, const AudioUnitParameterEvent* ev, UInt32 n) {
    for (UInt32 i = 0; i < n; i++) {
        if (ev[i].eventType == kParameterEvent_Immediate)
            AUSetParam(s, ev[i].parameter, ev[i].scope, ev[i].element, ev[i].eventValues.immediate.value, 0);
        else
            AUSetParam(s, ev[i].parameter, ev[i].scope, ev[i].element, ev[i].eventValues.ramp.endValue, 0);
    }
    return noErr;
}

static OSStatus AURender(void* s, AudioUnitRenderActionFlags* flags, const AudioTimeStamp* ts, UInt32 bus, UInt32 frames, AudioBufferList* io) {
    auto* m = (Marea*)s;
    if (!m->initialized) return kAudioUnitErr_Uninitialized;
    if (bus != 0) return kAudioUnitErr_InvalidElement;
    if (frames > m->maxFrames) return kAudioUnitErr_TooManyFramesToProcess;
    if (!io || io->mNumberBuffers < 2) return kAudio_ParamError;
    AudioUnitRenderActionFlags f = flags ? *flags : 0;
    for (auto& n : m->notifies) { AudioUnitRenderActionFlags pre = f | kAudioUnitRenderAction_PreRender; n.proc(n.ref, &pre, ts, bus, frames, io); }

    float* L = (float*)io->mBuffers[0].mData;
    float* R = (float*)io->mBuffers[1].mData;
    if (!L) { L = m->scratchL.data(); io->mBuffers[0].mData = L; }
    if (!R) { R = m->scratchR.data(); io->mBuffers[1].mData = R; }
    io->mBuffers[0].mDataByteSize = frames * sizeof(float);
    io->mBuffers[1].mDataByteSize = frames * sizeof(float);

    Transport t;
    if (m->host.beatAndTempoProc) {
        Float64 beat = 0, tempo = 0;
        if (m->host.beatAndTempoProc(m->host.hostUserData, &beat, &tempo) == noErr) { t.hostPresent = true; t.hostBeat = beat; t.hostBpm = tempo; }
    }
    if (m->host.transportStateProc2) {
        Boolean playing = false;
        if (m->host.transportStateProc2(m->host.hostUserData, &playing, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr) == noErr) t.hostPlaying = playing;
    } else if (m->host.transportStateProc) {
        Boolean playing = false;
        if (m->host.transportStateProc(m->host.hostUserData, &playing, nullptr, nullptr, nullptr, nullptr, nullptr) == noErr) t.hostPlaying = playing;
    }
    m->core.engine.render(L, R, (int)frames, t);
    for (auto& n : m->notifies) { AudioUnitRenderActionFlags post = f | kAudioUnitRenderAction_PostRender; n.proc(n.ref, &post, ts, bus, frames, io); }
    return noErr;
}

static OSStatus AUAddListener(void* s, AudioUnitPropertyID id, AudioUnitPropertyListenerProc p, void* r) { ((Marea*)s)->listeners.push_back({id, p, r}); return noErr; }
static OSStatus AURemoveListener(void* s, AudioUnitPropertyID id, AudioUnitPropertyListenerProc p) {
    auto& v = ((Marea*)s)->listeners;
    v.erase(std::remove_if(v.begin(), v.end(), [&](auto& l) { return l.id == id && l.proc == p; }), v.end());
    return noErr;
}
static OSStatus AURemoveListenerWithUserData(void* s, AudioUnitPropertyID id, AudioUnitPropertyListenerProc p, void* r) {
    auto& v = ((Marea*)s)->listeners;
    v.erase(std::remove_if(v.begin(), v.end(), [&](auto& l) { return l.id == id && l.proc == p && l.ref == r; }), v.end());
    return noErr;
}
static OSStatus AUAddNotify(void* s, AURenderCallback p, void* r) { ((Marea*)s)->notifies.push_back({p, r}); return noErr; }
static OSStatus AURemoveNotify(void* s, AURenderCallback p, void* r) {
    auto& v = ((Marea*)s)->notifies;
    v.erase(std::remove_if(v.begin(), v.end(), [&](auto& n) { return n.proc == p && n.ref == r; }), v.end());
    return noErr;
}
static OSStatus AUMidi(void* s, UInt32 status, UInt32 d1, UInt32 d2, UInt32 offset) {
    ((Marea*)s)->core.engine.midiEvent((int)status, (int)d1, (int)d2, (int)offset);
    return noErr;
}
static OSStatus AUSysEx(void*, const UInt8*, UInt32) { return noErr; }

static AudioComponentMethod AULookup(SInt16 sel) {
    switch (sel) {
        case kAudioUnitInitializeSelect: return (AudioComponentMethod)AUInit;
        case kAudioUnitUninitializeSelect: return (AudioComponentMethod)AUUninit;
        case kAudioUnitGetPropertyInfoSelect: return (AudioComponentMethod)AUGetPropInfo;
        case kAudioUnitGetPropertySelect: return (AudioComponentMethod)AUGetProp;
        case kAudioUnitSetPropertySelect: return (AudioComponentMethod)AUSetProp;
        case kAudioUnitAddPropertyListenerSelect: return (AudioComponentMethod)AUAddListener;
        case kAudioUnitRemovePropertyListenerSelect: return (AudioComponentMethod)AURemoveListener;
        case kAudioUnitRemovePropertyListenerWithUserDataSelect: return (AudioComponentMethod)AURemoveListenerWithUserData;
        case kAudioUnitAddRenderNotifySelect: return (AudioComponentMethod)AUAddNotify;
        case kAudioUnitRemoveRenderNotifySelect: return (AudioComponentMethod)AURemoveNotify;
        case kAudioUnitGetParameterSelect: return (AudioComponentMethod)AUGetParam;
        case kAudioUnitSetParameterSelect: return (AudioComponentMethod)AUSetParam;
        case kAudioUnitScheduleParametersSelect: return (AudioComponentMethod)AUSchedule;
        case kAudioUnitRenderSelect: return (AudioComponentMethod)AURender;
        case kAudioUnitResetSelect: return (AudioComponentMethod)AUReset;
        case kMusicDeviceMIDIEventSelect: return (AudioComponentMethod)AUMidi;
        case kMusicDeviceSysExSelect: return (AudioComponentMethod)AUSysEx;
        default: return nullptr;
    }
}
static OSStatus AUOpen(void* s, AudioComponentInstance inst) { ((Marea*)s)->self = inst; return noErr; }
static OSStatus AUClose(void* s) { delete (Marea*)s; return noErr; }

Marea::Marea() {
    iface.Open = AUOpen; iface.Close = AUClose; iface.Lookup = AULookup; iface.reserved = nullptr;
    for (auto& p : core.engine.params.all()) paramIds.push_back((AudioUnitParameterID)p.id);
    NSBundle* b = [NSBundle bundleWithIdentifier:@"com.marea.instrument.au"];
    core.webRoot = [b.resourcePath stringByAppendingPathComponent:@"web"].UTF8String ?: "";
    core.onParamFromUI = [this](int id, float value) {
        AudioUnitEvent ev{};
        ev.mEventType = kAudioUnitEvent_ParameterValueChange;
        ev.mArgument.mParameter = {self, (AudioUnitParameterID)id, kAudioUnitScope_Global, 0};
        AUEventListenerNotify(nullptr, nullptr, &ev);
        (void)value;
    };
    core.onGesture = [this](int id, bool begin) {
        AudioUnitEvent ev{};
        ev.mEventType = begin ? kAudioUnitEvent_BeginParameterChangeGesture : kAudioUnitEvent_EndParameterChangeGesture;
        ev.mArgument.mParameter = {self, (AudioUnitParameterID)id, kAudioUnitScope_Global, 0};
        AUEventListenerNotify(nullptr, nullptr, &ev);
    };
}

extern "C" __attribute__((visibility("default"))) void* MareaFactory(const AudioComponentDescription*) { return new Marea(); }

// ------------------------------- the plugin window ---------------------------------
@interface MareaWebView : WKWebView
@end
@implementation MareaWebView
- (BOOL)acceptsFirstMouse:(NSEvent*)e { return YES; }  // first click on a knob should turn it, not just focus the window
@end

@interface MareaAUViewFactory_1_0 : NSObject <AUCocoaUIBase>
@end
@implementation MareaAUViewFactory_1_0
- (unsigned)interfaceVersion { return 0; }
- (NSString*)description { return @"Marea"; }
- (NSView*)uiViewForAudioUnit:(AudioUnit)au withSize:(NSSize)size {
    ConnectionInfo ci{};
    UInt32 sz = sizeof ci;
    AudioUnitGetProperty(au, kPropConnectionInfo, kAudioUnitScope_Global, 0, &ci, &sz);
    NSRect frame = NSMakeRect(0, 0, 1240, 790);
    WKWebViewConfiguration* cfg = [WKWebViewConfiguration new];
    MareaWebView* web = [[MareaWebView alloc] initWithFrame:frame configuration:cfg];
    web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    NSString* url = [NSString stringWithFormat:@"http://127.0.0.1:%d/?local=1#k=%s", ci.port, ci.token];
    [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:url]]];
    return web;
}
@end
