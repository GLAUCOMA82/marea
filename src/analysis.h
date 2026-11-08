// Works out a file's tempo and where to cut it. Runs off the audio thread.
#pragma once
#include "modules/chop.h"
#include <string>

float bpmFromFilename(const std::string& path);                 // 0 if the name has no tempo
void analyzeTempo(ChopData& d, bool useFilename = true);        // fills fileBpm, beats, bpmFromName
// grid: 0 = 1/4, 1 = 1/8, 2 = 1/16, 3 = 1/32 of a beat bar; hits = cut on transients instead.
void makeSlices(ChopData& d, int grid, bool hits, float sensitivity, int maxSlices);
