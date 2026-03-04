# Numark Party Mix MK2 - Advanced Mixxx Mapping

Advanced MIDI mapping for the **Numark Party Mix MK2**. This script implements professional features such as vinyl braking, momentum-based backspins, and a custom synchronized light show system.

## 🛠 Installation
1.  Download `Numark-Party-Mix-MK2-advanced.js` and `Numark Party Mix MK2 advanced.midi.xml`.
2.  Place the files in your Mixxx controller folder:
    *   **Windows:** `Documents\Mixxx\controllers`
    *   **macOS:** `~/Library/Application Support/Mixxx/controllers`
    *   **Linux:** `~/.mixxx/controllers`
3.  In Mixxx Preferences, go to **Controllers** and select **"Numark Party Mix MK2 Advanced"**.

---

## ⚡ Track Load Automation
When a track is loaded:
*   **Effects 1 & 2** are disabled.
*   **Effect Meta Knobs** reset to 50%.
*   **Loop size** resets to 4 beats.
*   **Pad Mode** automatically switches to **Hotcue**.

---

## 🎮 Pad Modes
Each mode has a primary layer and a secondary layer (accessed by holding the **PAD MODE** button).

### 1. Hotcue Mode
*   **Primary:** Set or Trigger Hotcues 1-4.
*   **PAD MODE + Pad:** Delete Hotcues 1-4.

### 2. Loop Mode
*   **Primary:** 1: Toggle Loop, 2: Loop Roll, 3: Half Size, 4: Double Size.
*   **PAD MODE + Pad:** 5/6: Beatjump (1 Beat), 7/8: Beatjump (4 Beats).

### 3. Sampler Mode
*   **Primary:** Trigger Samplers 1-4.
*   **PAD MODE + Pad:** 5-7: Trigger Samplers 5-7, **Pad 8: Panic Stop** (Stops all samplers).

### 4. Effect Mode
*   **Primary:** 
    *   Pads 1-2: Toggle Effect 1 and Effect 2.
    *   Pads 3-4: Decrease/Increase Meta Knob intensity.
*   **PAD MODE + Pad:** 
    *   Pad 5: Quantize Toggle.
    *   Pad 6: Pitch Range Cycle (8%, 16%, 50%).
    *   Pad 7: Scratch Mode Toggle.
    *   **Pad 8: Party Light Mode Cycle.**

---

## 🕹 Playback & Jog Wheels
*   **Play/Pause:** Starts playback. If playing, it triggers a **Vinyl Brake** (simulated motor stop).
*   **Jog Wheels:** 
    *   **Touch-to-Scratch:** Standard scratch behavior (can be toggled off via FX Pad 7).
    *   **Inertia Backspin:** Flicking and releasing the wheel performs a backspin that follows the physical momentum of the platter.
*   **Standard Cue:** Returns to the cue point. Instantly cancels active vinyl brakes or backspins.
*   **Browse Knob:** Scroll through tracks. **Push** to toggle focus between the sidebar and track list.

---

## 💡 Dynamic Party Lights
The rear lights are controlled via an optimized "Plugin System" that minimizes MIDI traffic. Cycle through modes using **PAD MODE + Pad 8 (in Effect Mode)**.

1.  **Fade:** Ultra-smooth RGB color transitions synced to an 8-beat phrase.
2.  **One Beam:** Randomized color rotation with cross-fading. Changes rhythm every 16 beats (1/1 to 1/2 beat).
3.  **Sparkle Strobo:** High-energy color flashes with no repeats. Alternates between 1/4 and 1/2 beat subdivisions every 16 beats.
4.  **White Beat:** Pure white pulses with organic decay. Changes rhythm every 16 beats (1/1 to 1/2 beat).

---
