// Parameters are plain atomics. The UI, Live's automation and MIDI all write here; the audio
// thread only reads. Values are always 0..1 so that one knob widget and one AU range fit all.
#pragma once
#include <atomic>
#include <deque>
#include <string>
#include <unordered_map>

struct Param {
    int id;
    std::string key, name;
    float def;
    int steps;  // 0 = continuous, 2 = on/off, n = n positions
    std::atomic<float> v;
    Param(int i, std::string k, std::string n, float d, int s) : id(i), key(std::move(k)), name(std::move(n)), def(d), steps(s), v(d) {}
    inline float get() const { return v.load(std::memory_order_relaxed); }
    inline bool on() const { return get() >= 0.5f; }
    inline int index() const { return steps > 1 ? (int)(get() * (steps - 1) + 0.5f) : 0; }
    inline void set(float x) { v.store(x < 0 ? 0 : (x > 1 ? 1 : x), std::memory_order_relaxed); }
};

class ParamTable {
public:
    // id must stay stable forever: Live stores it in saved automation.
    Param* add(int id, const std::string& key, const std::string& name, float def, int steps = 0) {
        list_.emplace_back(id, key, name, def, steps);
        Param* p = &list_.back();
        byId_[id] = p;
        byKey_[key] = p;
        return p;
    }
    Param* byId(int id) const { auto it = byId_.find(id); return it == byId_.end() ? nullptr : it->second; }
    Param* byKey(const std::string& k) const { auto it = byKey_.find(k); return it == byKey_.end() ? nullptr : it->second; }
    std::deque<Param>& all() { return list_; }
private:
    std::deque<Param> list_;
    std::unordered_map<int, Param*> byId_;
    std::unordered_map<std::string, Param*> byKey_;
};
