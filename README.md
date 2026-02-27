# Numark Party Mix MK2 - Advanced Mapping for Mixxx

Advanced MIDI mapping for the **Numark Party Mix MK2**. Features inertia-based backspins, vinyl braking, and a comprehensive dual-layer pad system for every mode.

## 🚀 Key Features
*   **Vinyl Brake:** Pressing `PLAY` while a track is running triggers a vinyl stop effect.
*   **Inertia Backspin:** Jog wheels follow physical momentum; flick and release for realistic backspins.
*   **Hotcue Deletion:** Access a second layer to clear hotcues directly from the controller.
*   **Dual-Layer Pads:** The 2x2 pad grid uses two logical layers (Pads 1-4 and Pads 5-8) for deep control.
*   **Hardware Shift:** Holding the `Pad Mode` button toggles a secondary configuration layer with instant LED feedback.

---

## 🛠 Installation
1.  Download `Numark-Party-Mix-MK2-advanced.js` and `Numark Party Mix MK2 advanced.midi.xml`.
2.  Place files in your Mixxx controller folder:
    *   **Windows:** `Documents\Mixxx\controllers`
    *   **macOS:** `~/Library/Application Support/Mixxx/controllers`
3.  Restart Mixxx and select the preset **"Numark Party Mix MK2 Advanced"**.

---

## 🎮 Pad Mapping (2x2 Grid)

Every mode utilizes two layers. "Layer 2" is accessed via the hardware's built-in secondary pad assignments.

### 1. Hotcue Mode
*   **Layer 1 (Pads 1-4):** Set / Trigger Hotcues 1-4.
*   **Layer 2 (Pads 5-8):** Delete Hotcues 1-4.

### 2. Loop Mode
*   **Layer 1 (Pads 1-4):** 1: Toggle Loop, 2: Loop Roll, 3: Half Size, 4: Double Size.
*   **Layer 2 (Pads 5-8):** 5/6: Beatjump (1 Beat Bwd/Fwd), 7/8: Beatjump (4 Beats Bwd/Fwd).

### 3. Sampler Mode
*   **Layer 1 (Pads 1-4):** Trigger Samplers 1-4.
*   **Layer 2 (Pads 5-8):** 5-7: Trigger Samplers 5-7, **Pad 8: Panic Stop** (Stops all samplers).

### 4. Effect Mode
*Hold the physical **Pad Mode** button to see Layer 2 LEDs.*

*   **Layer 1 (Standard FX):** 1/2: Toggle FX 1/2, 3/4: Meta Knob Down/Up.
*   **Layer 2 (Config):** 5: Quantize, 6: Pitch Range (8/16/50% cycle), 7: Scratch Toggle, 8: Keylock.

---

## 🕹 Playback & Wheels
*   **Play/Pause:** Press to Play. If playing, press to **Vinyl Brake**. Touching the platter during a brake results in an instant stop.
*   **Wheels:** Touch top to scratch. Flick and release for **Inertia Backspin**.
*   **Cue:** Standard Mixxx Cue (stops backspins and brakes immediately).

---

## 📜 Credits
*   **Author:** cokomairena
*   **Lineage:** Based on the MK2 update by **magtomm**, originally based on the mapping by **Ryli Dunlap (rylito)**.