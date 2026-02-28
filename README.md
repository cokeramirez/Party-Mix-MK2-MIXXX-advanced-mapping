# Numark Party Mix MK2 - Mixxx Mapping

MIDI mapping for the **Numark Party Mix MK2**. This mapping implements custom behavior for the jog wheels, play buttons, and an integrated shift system using the Pad Mode button.

## 🛠 Installation
1.  Download `Numark-Party-Mix-MK2-advanced.js` and `Numark Party Mix MK2 advanced.midi.xml`.
2.  Place the files in your Mixxx controller folder:
    *   **Windows:** `Documents\Mixxx\controllers`
    *   **macOS:** `~/Library/Application Support/Mixxx/controllers`
    *   **Linux:** `~/.mixxx/controllers`
3.  In Mixxx Preferences, go to **Controllers** and select **"Numark Party Mix MK2 Advanced"**.

---

## ⚡ Track Load Automation
When a track is loaded into a deck:
*   **Effects 1 & 2** are turned off.
*   **Effect Meta Knobs** are reset to 50%.
*   **Loop size** is reset to 4 beats.
*   **Mode** automatically switches to **Hotcue** and updates LEDs.

---

## 🎮 Pad Modes
Each mode has a primary layer and a secondary layer. The secondary layer is accessed by holding the physical **PAD MODE** button while pressing a pad.

### 1. Hotcue Mode
*   **Primary:** Set or Trigger Hotcues 1-4.
*   **PAD MODE + Pad:** Delete Hotcues 1-4.

### 2. Loop Mode
*   **Primary:** 1: Toggle Loop, 2: Loop Roll, 3: Half Size, 4: Double Size.
*   **PAD MODE + Pad:** 5/6: Beatjump (1 Beat), 7/8: Beatjump (4 Beats).

### 3. Sampler Mode
*   **Primary:** Trigger Samplers 1-4.
*   **PAD MODE + Pad:** 5-7: Trigger Samplers 5-7, **Pad 8: Panic Stop** (Stops all playing samplers).

### 4. Effect Mode
*   **Primary:** 
    *   Pads 1-2: Toggle Effect 1 and Effect 2.
    *   Pads 3-4: Decrease/Increase Meta Knob (Intensity).
*   **PAD MODE + Pad:** 
    *   Pad 5: Quantize Toggle.
    *   Pad 6: Pitch Range Cycle (8%, 16%, 50%).
    *   Pad 7: Scratch Mode Toggle (Enable/Disable touch-to-scratch).
    *   Pad 8: Keylock Toggle.

---

## 🕹 Playback & Jog Wheels
*   **Play/Pause:** Starts playback. If a track is already playing, it triggers a **Vinyl Brake** (gradual stop).
*   **Jog Wheels:** 
    *   Touch the top to scratch. 
    *   **Inertia Backspin:** Flick the wheel and release it to perform a backspin that follows the physical momentum of the platter.
*   **Standard Cue:** Returns to the cue point. Cancels active vinyl brakes or backspins immediately.
*   **Browse Knob:** Scroll through tracks. Press to toggle focus between the sidebar and the track list.

---

## 📜 Credits
*   **Author:** cokomairena
*   **Lineage:** Based on work by **magtomm** and **Ryli Dunlap (rylito)**.