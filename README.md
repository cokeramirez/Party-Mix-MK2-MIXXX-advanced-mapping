# Numark Party Mix MK2 - Mixxx Mapping (Jog FX branch)

MIDI mapping for the **Numark Party Mix MK2**. This version focuses on improved jog wheel response, extra pad functions and lightshows.

> **Note:** This mapping was developed using AI tools.

## 🛠 Installation
1.  Download `Numark-Party-Mix-MK2-newjog.js` and `.midi.xml`.
2.  Place them in your Mixxx controller folder
3.  In Mixxx Preferences, select **"Numark Party Mix MK2 NewJog"**.

---

## ⚡ Track Load Automation
When you load a track, the script automatically:
*   Turns off **Effects 1 & 2**.
*   Resets **Effect Meta Knobs** to 50% (middle).
*   Resets **Loop size** to 4 beats.
*   Sets **Pad Mode** to **Hotcue**.
*   Clears any active vinyl brakes or scratches.

---

## 🎮 Pad Modes
Functions change when holding the **PAD MODE** button.

### 1. Hotcue Mode
*   **Pads 1-4:** Set/Trigger Hotcues.
*   **PAD MODE + Pads:** Delete Hotcues.

### 2. Loop Mode
*   **Pads 1-4:** Toggle Loop, Loop Roll, Half Loop, Double Loop.
*   **PAD MODE + Pads:** Beatjump 1 beat (5/6) and 4 beats (7/8).

### 3. Sampler Mode
*   **Pads 1-4:** Trigger Samplers 1-4.
*   **PAD MODE + Pads:** Trigger Samplers 5-7. **Pad 8 stops all samplers.**

### 4. Effect Mode
In this mode the JOG becomes an fx intensity "knob", move it to change the FX parameter.

*   **Pads 1-2-3:** Toggle FX 1, 2 and 3.
*   **Pad 4:** Change the lightshow.
*   **PAD MODE + Pads:**
    *   Pad 5: Toggle Quantize.
    *   Pad 6: Change Pitch Range (8%, 16%, 50%).
    *   Pad 7: Enable/Disable Scratch (Jog touch).
    *   **Pad 8: Change the lightshow.**

---

## 🕹 Playback & Jogs
*   **Play/Pause:** Starts music. If already playing, it triggers a **Vinyl Brake** effect.
*   **Jog Wheels:** 
    *   Improved response for scratching and backspins. 
    *   Backspins continue briefly after you let go based on speed.
*   **Cue:** Standard cue behavior.

---

## 📂 Library Navigation
The **Browse Knob** has two ways to interact:
*   **Scroll:** Move through the list. It moves faster depending on how quick you turn the knob.
*   **Short Press:** Switch focus between the Sidebar (folders), the Track List, and the Search Bar.
*   **Long Press (0.5s):**
    *   If in the sidebar: Open/Close folders.
    *   If in the track list: Zoom in/out the library view (Maximize).
    *   If in search bar: Clear current search text.

---

## 💡 Party Lights
Requires the hardware light button to be in **Mode 1** (Software Control).

1.  **Fade:** RGB colors rotate every 8 beats.
2.  **Random Beat Mask:** Chooses a random combination of the 3 lights on every beat. It never picks the same combination twice in a row.
3.  **One Beam:** Flashes one color at a time; changes speed every 16 beats.
4.  **Sparkle Strobo:** Fast color flashes.
5.  **White Beat:** White pulse on every beat.
