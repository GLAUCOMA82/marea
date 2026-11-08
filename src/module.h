// A Marea module = one of these classes + one panel in web/modules.js.
// See "Adding a module" in README.md.
#pragma once
#include "params.h"

struct Bus {
    float* L; float* R;          // dry output, modules ADD to it
    float* sendL; float* sendR;  // echo/spring send, modules ADD to it
};

class Module {
public:
    virtual ~Module() = default;
    virtual void prepare(double sampleRate) = 0;
    virtual void hit(int /*index*/, float /*velocity*/) {}
    virtual void release(int /*index*/) {}
    // Called in short chunks (at most 32 frames) between events.
    virtual void render(Bus& bus, int frames) = 0;
};
