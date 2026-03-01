# Technical Guide: Numark Party Mix II Rear LED Control

To enable direct MIDI control of the three rear LEDs, follow these specifications.

### 1. Unlock (Initialization)
Send the following **System Exclusive (SysEx)** message **once** upon connection to enable MIDI control of the rear lamps:

`F0 00 20 7F 05 F7`

---

### 2. MIDI Mapping
The LEDs operate as individual dimmers on **MIDI Channel 16** (Hex: `0x0F`).

| LED Position | Color | MIDI CC (Dec) | MIDI CC (Hex) | Range |
| :--- | :--- | :--- | :--- | :--- |
| **Left** | Blue | **67** | `0x43` | 0–127 |
| **Center** | Green | **65** | `0x41` | 0–127 |
| **Right** | Red | **64** | `0x40` | 0–127 |

---

### 3. Basic Commands (Hex)

*   **Unlock LEDs:** `F0 00 20 7F 05 F7`
*   **Blue (Left) ON:** `BF 43 7F`
*   **Green (Center) ON:** `BF 41 7F`
*   **Red (Right) ON:** `BF 40 7F`
*   **All LEDs OFF:** `BF 43 00`, `BF 41 00`, `BF 40 00`

---

### 4. Implementation Notes
*   **One-time Setup:** Only one SysEx Unlock message is required per session.
*   **Color Mixing:** Lighting multiple LEDs simultaneously creates blended hues (e.g., Red + Blue for Purple).
*   **Precision:** CC values (0–127) allow for smooth fading and intensity control.