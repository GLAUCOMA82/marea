#include "midi_input.h"
#include "engine.h"
#import <CoreMIDI/CoreMIDI.h>
#import <Foundation/Foundation.h>
#include <pthread.h>
#include <thread>
#include <unistd.h>

static MIDIClientRef gClient;
static MIDIPortRef gPort;
static Engine* gEngine;
static MIDIPortRef gOutPort;

static void connectAll() {
    ItemCount n = MIDIGetNumberOfSources();
    for (ItemCount i = 0; i < n; i++) MIDIPortConnectSource(gPort, MIDIGetSource(i), nullptr);
}

static void onPackets(const MIDIPacketList* list, void*, void*) {
    const MIDIPacket* p = &list->packet[0];
    for (UInt32 i = 0; i < list->numPackets; i++) {
        int at = 0;
        while (at < p->length) {
            int status = p->data[at];
            if (status < 0x80 || status >= 0xF0) { at++; continue; }
            int type = status & 0xF0;
            int size = (type == 0xC0 || type == 0xD0) ? 2 : 3;
            if ((type == 0x90 || type == 0x80) && at + 2 < p->length) gEngine->midiEvent(status, p->data[at + 1], p->data[at + 2], 0);
            at += size;
        }
        p = MIDIPacketNext(p);
    }
}

static void sendLoop() {
    pthread_setname_np("Marea MIDI out");
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
    int idle = 0;
    for (;;) {
        Engine::MidiOut m;
        while (gEngine->midiOut.pop(m)) {
            MIDIPacketList list;
            MIDIPacket* p = MIDIPacketListInit(&list);
            MIDIPacketListAdd(&list, sizeof list, p, m.when, 1, &m.status);
            ItemCount n = MIDIGetNumberOfDestinations();
            for (ItemCount i = 0; i < n; i++) MIDISend(gOutPort, MIDIGetDestination(i), &list);
        }
        if (++idle >= 250) { idle = 0; gEngine->midiDests.store((int)MIDIGetNumberOfDestinations(), std::memory_order_relaxed); }
        usleep(2000);
    }
}

void startMidiInput(Engine* engine) {
    gEngine = engine;
    if (MIDIClientCreateWithBlock(CFSTR("Marea"), &gClient, ^(const MIDINotification* note) {
            if (note->messageID == kMIDIMsgSetupChanged) connectAll();  // plugged in while running
        }) != noErr) return;
    if (MIDIInputPortCreate(gClient, CFSTR("Marea In"), onPackets, nullptr, &gPort) != noErr) return;
    connectAll();
    engine->midiDests.store((int)MIDIGetNumberOfDestinations());
    if (MIDIOutputPortCreate(gClient, CFSTR("Marea Out"), &gOutPort) == noErr) std::thread(sendLoop).detach();
}
