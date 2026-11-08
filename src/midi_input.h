// Hardware MIDI for the standalone apps: any connected keyboard or controller plays Marea, and when
// CLOCK is on, every connected MIDI output gets Marea's tempo, start and stop.
// (Inside Live, Live delivers MIDI to the plugin instead.)
#pragma once
class Engine;
void startMidiInput(Engine* engine);
