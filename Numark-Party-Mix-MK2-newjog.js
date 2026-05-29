// Author: cokomairena 
/*
This versions tries to make a more efficient jog swheel management for scratch
*/

// Based on the Numark Party Mix MK2 mapping by magtomm
// Originally based on the Numark Party Mix mapping by Ryli Dunlap (rylito)
// Thanks to authors of other scripts used as a reference and to DJ Dexter and DarkPoubelle
// for the initial PartyMix mappings posted on the forum.

var NumarkPartyMix = function() {


    var LIBRARY_LONGPRESS_DELAY = 500;

    // --- CONFIGURACIÓN DE ORDENACIÓN DE BIBLIOTECA (LONG PRESS BROWSE) ---
    // Puedes modificar esta lista agregando, quitando o alterando el orden de las columnas:
    //  15: BPM, 20: Key (Tono), 8: Grouping, 1: Artista, 2: Título, 13: Duración
    var SORT_CRITERIA = [15, 20, 30, 31]; 
    var currentSortIndex = 0;


    var RESOLUTION = 310;  
    var RECORD_SPEED = 33 + (1 / 3);
    var ALPHA = 1.0 / 8; 
    var BETA = ALPHA / 32;
    var RAMP_DOWN = true;
    var RAMP_UP = false;

    var ON = 0x7F;
    var OFF = 0x00;
    var DIM = 0x01;
    var FLASH = 0x40; 

    var SELF = 'SELF';



    var hotcuesDownCount = { 1: 0, 2: 0 };
    var isManualBraking = { 1: false, 2: false }; 

    this.isPadModeHeld = false; 



    var isScratchEnabled = { 1: true, 2: true }; 

    // --- VARIABLES DE CONFIGURACIÓN ---
    var INERTIA_TIMEOUT_MS = 5;        
    var INERTIA_TIMEOUT_MS_PAUSE = 20; 
    var POST_SCRATCH_LOCKOUT_MS = 250; 
    var PAUSE_JOG_SENSITIVITY = 0.1;    

    var isDeckTouched = { 1: false, 2: false };
    var scratchStopTimer = { 1: 0, 2: 0 };
    var lastMovementTime = { 1: 0, 2: 0 };
    var lastScratchExitTime = { 1: 0, 2: 0 }; 

    var deckPadMode = { 'DECK1': 'CUE', 'DECK2': 'CUE' };
    var lastLightValues = { 0x40: -1, 0x41: -1, 0x43: -1 }; 
    var currentLightPattern = 0;
    var lightMasterDeck = 0; // 0 = None, 1 = Deck 1, 2 = Deck 2
    this.lightTimer = 0;
    var isSoftwareLightMode = false; // True only when hardware sends Value 1

    var lastLibraryMoveTime = 0;

    // --- CONFIGURACIÓN DE STEMS VIRTUALES ---
    // Índices oficiales de Mixxx: 1 (Vocals), 2 (Drums), 3 (Bass), 4 (Melody/Other)
    // Asigna cada índice a una perilla física virtual: 'high', 'mid', 'low', 'none'
    // 'none' significa que ese stem no se asocia a ninguna perilla (se mantiene al centro/completo)
    var STEM_MAPPING = {
        1: 'low', // Drums asignado a la perilla LO
        2: 'low',  // Bass asignado a la perilla LO
        3: 'none', // Instrumental/Melody sin perilla física asignada (se simula en el centro)
        4: 'high'  // Vocals asignado a la perilla HI
    };

    // Almacén de valores físicos actuales para evitar saltos bruscos
    var knobValues = {
        1: { 'high': 0.5, 'mid': 0.5, 'low': 0.5 },
        2: { 'high': 0.5, 'mid': 0.5, 'low': 0.5 }
    };


    
    // LIGHTSHOWS
    
    var LightPatterns = [
        {
            name: "Linear Beat",
            beatCounter: 0,
            onBeat: function(deck, value) {
                if (value > 0) {
                    this.beatCounter = (this.beatCounter + 1) % 4;
                }
            },
            onTick: function(deck) {
                var pos = NumarkPartyMix.getBeatPos(deck);
                var brightness = Math.floor(127 * (1 - pos)); 

                var r = 0, g = 0, b = 0;

                if (this.beatCounter === 0) {
                    // Beat 1: Siempre blanco (las 3 luces) para marcar el inicio del compás
                    r = brightness; g = brightness; b = brightness;
                } else {
                    // Lógica invertida según el Deck
                    if (deck === 1) {
                        // DECK 1: Azul -> Verde -> Rojo
                        if (this.beatCounter === 1) b = brightness;
                        else if (this.beatCounter === 2) g = brightness;
                        else if (this.beatCounter === 3) r = brightness;
                    } else {
                        // DECK 2: Rojo -> Verde -> Azul (Invertido)
                        if (this.beatCounter === 1) r = brightness;
                        else if (this.beatCounter === 2) g = brightness;
                        else if (this.beatCounter === 3) b = brightness;
                    }
                }
                
                NumarkPartyMix.setPartyLights(r, g, b);
            }
        },{
            name: "Fade",
            beatCounter: 0,
            onBeat: function(deck, value) {
                if (value > 0) {
                    this.beatCounter = (this.beatCounter + 1) % 8;
                }
            },
            onTick: function(deck) {
                var pos = NumarkPartyMix.getBeatPos(deck);
                var angle = ((this.beatCounter + pos) / 8) * 2 * Math.PI;
                var r = Math.floor((Math.sin(angle) + 1) * 63.5);
                var g = Math.floor((Math.sin(angle + 2) + 1) * 63.5);
                var b = Math.floor((Math.sin(angle + 4) + 1) * 63.5);
                NumarkPartyMix.setPartyLights(r, g, b);
            }
        },{
            name: "Random Beat Mask",
            lastState: -1,
            onBeat: function(deck, value) {
                if (value <= 0) return;
                var newState;
                do {
                    newState = Math.floor(Math.random() * 8);
                } while (newState === this.lastState);
                
                this.lastState = newState;

                var r = (newState & 1) ? 127 : 0;
                var g = (newState & 2) ? 127 : 0;
                var b = (newState & 4) ? 127 : 0;
                
                NumarkPartyMix.setPartyLights(r, g, b);
            },
            onTick: function(deck) { 
                // No hace nada, pero se deja vacío para evitar errores
            }
        },{
            name: "One beam",
            beatCounter: 0,
            colorIdx: 0,
            colorOrder: [0, 1, 2], 
            levels: [0, 0, 0],     
            shuffle: function() {
                var j, x, i;
                for (i = this.colorOrder.length - 1; i > 0; i--) {
                    j = Math.floor(Math.random() * (i + 1));
                    x = this.colorOrder[i];
                    this.colorOrder[i] = this.colorOrder[j];
                    this.colorOrder[j] = x;
                }
            },
            onBeat: function(deck, value) {
                if (value <= 0) return;
                var flashNow = false;
                if (this.beatCounter < 16) {
                    flashNow = true;
                } else {
                    if (this.beatCounter % 2 === 0) flashNow = true;
                }
                if (flashNow) {
                    var activeColor = this.colorOrder[this.colorIdx];
                    this.levels[activeColor] = 127; 
                    this.colorIdx = (this.colorIdx + 1) % 3;
                }
                this.beatCounter = (this.beatCounter + 1) % 32;
                if (this.beatCounter === 0) this.shuffle();
            },
            onTick: function(deck) {
                for (var i = 0; i < 3; i++) {
                    this.levels[i] = Math.max(0, this.levels[i] - 6); 
                }
                NumarkPartyMix.setPartyLights(this.levels[0], this.levels[1], this.levels[2]);
            }
        },
        {
            name: "Sparkle strobo",
            beatCounter: 0,
            lastSub: -1,
            lastColorIdx: -1,
            onBeat: function(deck, value) {
                if (value > 0) this.beatCounter = (this.beatCounter + 1) % 32;
            },
            onTick: function(deck) {
                var pos = NumarkPartyMix.getBeatPos(deck);
                var divisions = (this.beatCounter < 16) ? 4 : 2;
                var currentSub = Math.floor(pos * divisions);
                if (currentSub !== this.lastSub) {
                    var nextColorIdx;
                    do { nextColorIdx = Math.floor(Math.random() * 3); } while (nextColorIdx === this.lastColorIdx);
                    this.lastColorIdx = nextColorIdx;
                    var r = 0, g = 0, b = 0;
                    if (nextColorIdx === 0) r = 127;
                    else if (nextColorIdx === 1) g = 127;
                    else b = 127;
                    NumarkPartyMix.setPartyLights(r, g, b);
                    this.lastSub = currentSub;
                } else {
                    NumarkPartyMix.setPartyLights(0, 0, 0);
                }
            }
        },
        {
            name: "White beat",
            beatCounter: 0,
            onBeat: function(deck, value) {
                if (value > 0) {
                    var flashNow = (this.beatCounter < 16 || this.beatCounter % 2 === 0);
                    if (flashNow) NumarkPartyMix.setPartyLights(127, 127, 127);
                    this.beatCounter = (this.beatCounter + 1) % 32;
                }
            },
            onTick: function(deck) { 
                var current = lastLightValues[0x40];
                if (current > 0) {
                    var r = Math.max(0, current - 10);
                    NumarkPartyMix.setPartyLights(r, r, r);
                }
            }
        }
    ];

    this.lightModeControl = function(channel, control, value, status, group) {
        // Value 1 is the specific mode for Software Control
        if (value === 1) {
            isSoftwareLightMode = true;
            // If a track is already playing, start the show immediately
            if (lightMasterDeck !== 0) {
                NumarkPartyMix.startLightShow();
            }
        } else {
            // Any other value (0, 2, 3, 4) means the hardware is using 
            // internal modes. We must stop our script.
            isSoftwareLightMode = false;
            NumarkPartyMix.stopLightShow();
        }
    };


    this.updateLightMaster = function(value, group) {
        var deck = script.deckFromGroup(group);
        var isPlaying = (value > 0);

        if (isPlaying) {
            if (lightMasterDeck === 0) {
                lightMasterDeck = deck;
                // ONLY start if the hardware is in Mode 1
                if (isSoftwareLightMode) {
                    NumarkPartyMix.startLightShow();
                }
            }
        } else {
            if (lightMasterDeck === deck) {
                var otherDeck = (deck === 1) ? 2 : 1;
                var otherIsPlaying = engine.getValue('[Channel' + otherDeck + ']', 'play');

                if (otherIsPlaying) {
                    lightMasterDeck = otherDeck;
                } else {
                    lightMasterDeck = 0;
                    NumarkPartyMix.stopLightShow();
                }
            }
        }
    };

    this.startLightShow = function() {
        if (this.lightTimer === 0) {
            this.lightTimer = engine.beginTimer(30, function() { NumarkPartyMix.onLightTick(); });
        }
    };

    this.stopLightShow = function() {
        if (this.lightTimer !== 0) {
            engine.stopTimer(this.lightTimer);
            this.lightTimer = 0;
        }
        this.killLights(); // Ensure everything is OFF
    };

    


    var forEach = function(array, func) {
        for (var i = 0; i < array.length; i++) { func(array[i]); }
    };

    var lookup = function(dict) {
        var inverse = {};
        for (var k in dict) { inverse[dict[k]] = k; }
        for (var key in inverse) { dict[key] = inverse[key]; }
        return dict;
    };

    var flashTimer = 0;
    var flashVal = DIM;

    var flashLoop = function() {
        flashVal = (flashVal === DIM) ? ON : DIM;
        if (deckPadMode['DECK1'] === 'LOOP' && engine.getValue('[Channel1]', 'loop_enabled')) NumarkPartyMix.repaintPads(1);
        if (deckPadMode['DECK2'] === 'LOOP' && engine.getValue('[Channel2]', 'loop_enabled')) NumarkPartyMix.repaintPads(2);
    };


    var padCallbackMappings = {};

    var syncPadLedCallbackHelper = function(group, control, valueByte) {
        NumarkPartyMix.repaintPads(1);
        NumarkPartyMix.repaintPads(2);
    };

    var padDefProto = {
        getCallbackKeyMappings: function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[this.group, this.bindingControl]] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, value ? ON : DIM);
            };
            return callbackKeyMappings;
        },
        handle: function(isPressed) {
            if (this.actionControl && this.actionControl.indexOf('hotcue_') !== -1) {
                var deckNum = parseInt(this.group.substring(8, 9));
                if (isPressed) {
                    hotcuesDownCount[deckNum]++;
                    if (isManualBraking[deckNum]) {
                        engine.brake(deckNum, false);
                        engine.setValue(this.group, "play", 0);
                        isManualBraking[deckNum] = false;
                    }
                } else {
                    hotcuesDownCount[deckNum]--;
                }
                if (hotcuesDownCount[deckNum] < 0) hotcuesDownCount[deckNum] = 0;
            }
            if (this.toggle) {
                if (isPressed) { script.toggleControl(this.group, this.actionControl); }
            } else {
                engine.setValue(this.group, this.actionControl, isPressed);
            }
        },
    };

    var padDefCue = function(deck, cueNum) {
        this.group = '[Channel' + deck + ']';
        this.actionControl = 'hotcue_' + cueNum + '_activate';
        this.bindingControl = 'hotcue_' + cueNum + '_enabled';
        this.toggle = false;
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[this.group, this.bindingControl]] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, value ? ON : OFF);
            };
            return callbackKeyMappings;
        };
    };
    padDefCue.prototype = padDefProto;

    var padDefCueClear = function(deck, cueNum) {
        this.group = '[Channel' + deck + ']';
        this.actionControl = 'hotcue_' + cueNum + '_clear';
        this.bindingControl = 'hotcue_' + cueNum + '_enabled';
        this.toggle = false;
    };
    padDefCueClear.prototype = padDefProto;

    var padDefLoop = function(deck, type) {
        this.group = '[Channel' + deck + ']';
        this.actionControl = (type === 'halve') ? 'loop_halve' : 'loop_double';
        this.toggle = false;
    };
    padDefLoop.prototype = padDefProto;

    var padDefSimpleSampler = function(samplerNum) {
        this.group = '[Sampler' + samplerNum + ']';
        this.bindingControl = 'play'; 
        this.handle = function(isPressed) {
            if (isPressed && engine.getValue(this.group, 'track_loaded')) {
                engine.setValue(this.group, 'cue_gotoandplay', 1);
            }
        };
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[this.group, 'play']] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, value ? ON : OFF);
            };
            return callbackKeyMappings;
        };
    };

    var padDefSamplerPanic = function() {
        this.handle = function(isPressed) {
            if (isPressed) { for (var i = 1; i <= 7; i++) { engine.setValue('[Sampler' + i + ']', 'stop', 1); } }
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var padDefEffectToggle = function(unitNum, effectNum) {
        this.group = '[EffectRack1_EffectUnit' + unitNum + '_Effect' + effectNum + ']';
        this.actionControl = 'enabled';
        this.bindingControl = 'enabled';
        this.toggle = true;
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[this.group, this.bindingControl]] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, value ? ON : OFF);
            };
            return callbackKeyMappings;
        };
    };
    padDefEffectToggle.prototype = padDefProto;

    var padDefLoopToggle = function(deck) {
        this.group = '[Channel' + deck + ']';
        this.bindingControl = 'loop_enabled';
        this.handle = function(isPressed) {
            if (!isPressed) return;
            if (engine.getValue(this.group, 'loop_enabled')) {
                engine.setValue(this.group, 'reloop_toggle', 1);
            } else {
                engine.setValue(this.group, 'beatloop_activate', 1);
            }
        };
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[this.group, this.bindingControl]] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, value ? FLASH : OFF);
            };
            return callbackKeyMappings;
        };
    };
    padDefLoopToggle.prototype = padDefProto;

    var padDefBeatjump = function(deck, amount) {
        this.group = '[Channel' + deck + ']';
        
        // Verificamos si mandamos un número o un texto
        if (typeof amount === 'number') {
            // Comportamiento clásico: salto fijo (ej: beatjump_4_forward)
            var direction = (amount > 0) ? '_forward' : '_backward';
            this.actionControl = 'beatjump_' + Math.abs(amount) + direction;
        } else {
            // Comportamiento dinámico: usa el valor del software (ej: beatjump_forward)
            // Aquí 'amount' debe ser exactamente "forward" o "backward"
            this.actionControl = 'beatjump_' + amount;
        }
        
        this.bindingControl = this.actionControl;
        this.toggle = false;
    };
    padDefBeatjump.prototype = padDefProto;

    var padDefLoopRoll = function(deck) {
        this.group = '[Channel' + deck + ']';
        this.actionControl = 'beatlooproll_activate'; 
        this.bindingControl = 'beatlooproll_activate';
        this.toggle = false;
    };
    padDefLoopRoll.prototype = padDefProto;

    var padDefMultiParam = function(unitNum, direction) {
        var suffix = (direction === 'up') ? '_up' : '_down';
        this.handle = function(isPressed) {
            if (isPressed) {
                engine.setValue('[EffectRack1_EffectUnit' + unitNum + '_Effect1]', 'meta' + suffix, 1);
                engine.setValue('[EffectRack1_EffectUnit' + unitNum + '_Effect2]', 'meta' + suffix, 1);
            }
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var padDefTempoRange = function(deck) {
        var group = '[Channel' + deck + ']';
        this.handle = function(isPressed) {
            if (!isPressed) return;
            var current = engine.getValue(group, 'rateRange');
            var next = (current < 0.12) ? 0.16 : (current < 0.30) ? 0.50 : 0.08;
            engine.setValue(group, 'rateRange', next);
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var padDefConfigToggle = function(group, control) {
        this.group = group;
        this.actionControl = control;
        this.bindingControl = control;
        this.toggle = true;
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[this.group, this.bindingControl]] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, (value > 0) ? ON : OFF);
            };
            return callbackKeyMappings;
        };
    };
    padDefConfigToggle.prototype = padDefProto;

    var padDefScratchToggle = function(deck) {
        this.handle = function(isPressed) {
            if (!isPressed) return;
            isScratchEnabled[deck] = !isScratchEnabled[deck];
            NumarkPartyMix.refreshLayout(deck);
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var padDefLightCycle = function() {
        this.handle = function(isPressed) {
            if (!isPressed) return;
            NumarkPartyMix.killLights();
            currentLightPattern = (currentLightPattern + 1) % LightPatterns.length;
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var PAD_MAPPINGS = {
        DECK1: {
            PAD1: { CUE: new padDefCue(1, 1), LOOP: new padDefLoopToggle(1), SAMPLER: new padDefSimpleSampler(1), EFFECT: new padDefEffectToggle(1, 1) },
            PAD2: { CUE: new padDefCue(1, 2), LOOP: new padDefLoopRoll(1),   SAMPLER: new padDefSimpleSampler(2), EFFECT: new padDefEffectToggle(1, 2) },
            PAD3: { CUE: new padDefCue(1, 3), LOOP: new padDefLoop(1, 'halve'), SAMPLER: new padDefSimpleSampler(3), EFFECT: new padDefEffectToggle(1, 3) },
            PAD4: { CUE: new padDefCue(1, 4), LOOP: new padDefLoop(1, 'double'), SAMPLER: new padDefSimpleSampler(4), EFFECT: new padDefLightCycle() },
            PAD5: { CUE: new padDefCueClear(1, 1), LOOP: new padDefBeatjump(1, -1), SAMPLER: new padDefSimpleSampler(5), EFFECT: new padDefConfigToggle('[Channel1]', 'quantize') },
            PAD6: { CUE: new padDefCueClear(1, 2), LOOP: new padDefBeatjump(1, 1),  SAMPLER: new padDefSimpleSampler(6), EFFECT: new padDefTempoRange(1) },
            PAD7: { CUE: new padDefCueClear(1, 3), LOOP: new padDefBeatjump(1, "backward"), SAMPLER: new padDefSimpleSampler(7), EFFECT: new padDefScratchToggle(1) }, 
            PAD8: { CUE: new padDefCueClear(1, 4), LOOP: new padDefBeatjump(1, "forward"),  SAMPLER: new padDefSamplerPanic(),   EFFECT: new padDefLightCycle() }
        },
        DECK2: {
            PAD1: { CUE: new padDefCue(2, 1), LOOP: new padDefLoopToggle(2), SAMPLER: new padDefSimpleSampler(1), EFFECT: new padDefEffectToggle(2, 1) },
            PAD2: { CUE: new padDefCue(2, 2), LOOP: new padDefLoopRoll(2),   SAMPLER: new padDefSimpleSampler(2), EFFECT: new padDefEffectToggle(2, 2) },
            PAD3: { CUE: new padDefCue(2, 3), LOOP: new padDefLoop(2, 'halve'), SAMPLER: new padDefSimpleSampler(3), EFFECT: new padDefEffectToggle(2, 3) },
            PAD4: { CUE: new padDefCue(2, 4), LOOP: new padDefLoop(2, 'double'), SAMPLER: new padDefSimpleSampler(4), EFFECT: new padDefLightCycle() },
            PAD5: { CUE: new padDefCueClear(2, 1), LOOP: new padDefBeatjump(2, -1), SAMPLER: new padDefSimpleSampler(5), EFFECT: new padDefConfigToggle('[Channel2]', 'quantize') },
            PAD6: { CUE: new padDefCueClear(2, 2), LOOP: new padDefBeatjump(2, 1),  SAMPLER: new padDefSimpleSampler(6), EFFECT: new padDefTempoRange(2) },
            PAD7: { CUE: new padDefCueClear(2, 3), LOOP: new padDefBeatjump(2, "backward"), SAMPLER: new padDefSimpleSampler(7), EFFECT: new padDefScratchToggle(2) }, 
            PAD8: { CUE: new padDefCueClear(2, 4), LOOP: new padDefBeatjump(2, "forward"),  SAMPLER: new padDefSamplerPanic(),   EFFECT: new padDefLightCycle() }
        }
    };

    // Funciones matemáticas auxiliares para stems
    var cut = function(x) {
        if (x <= 0.5) return 2.0 * x;
        return 1.0;
    };

    var iso = function(x) {
        if (x <= 0.5) return 1.0;
        return 2.0 * (1.0 - x);
    };

    var getKnobValue = function(deck, stemIndex) {
        var physicalKnob = STEM_MAPPING[stemIndex];
        if (physicalKnob === 'none' || !physicalKnob) {
            return 0.5; // Si no hay perilla física asignada, simula que está en el centro
        }
        return knobValues[deck][physicalKnob];
    };

    // Mapea la perilla física (0.0..0.5..1.0) al rango real de EQ de Mixxx (0.0..1.0..4.0)
    var getEqParameterValue = function(normalizedValue) {
        if (normalizedValue <= 0.5) {
            return normalizedValue * 2.0; // Mapea de Kill (0.0) a Flat (1.0)
        } else {
            return 1.0 + (normalizedValue - 0.5) * 6.0; // Mapea de Flat (1.0) a Boost (4.0)
        }
    };

    var calculateStemVolume = function(deck, stemIndex) {
        // Obtener la posición actual de las 4 perillas virtuales
        var k1 = getKnobValue(deck, 1);
        var k2 = getKnobValue(deck, 2);
        var k3 = getKnobValue(deck, 3);
        var k4 = getKnobValue(deck, 4);

        // Identificar la perilla física más a la derecha (máximo aislamiento)
        var kmax = Math.max(k1, k2, k3, k4);
        var ki = getKnobValue(deck, stemIndex);

        if (kmax <= 0.5) {
            // LADO IZQUIERDO PURO (Corte clásico):
            return 2.0 * ki;
        } else {
            // LADO DERECHO ACTIVO (Aislamiento proporcional continuo):
            // B define la línea base de volumen para los elementos no aislados.
            // Va bajando suavemente de 1.0 (en kmax = 0.5) hasta 0.0 (en kmax = 1.0).
            var B = 2.0 * (1.0 - kmax); 

            if (ki > 0.5) {
                // Interpolación lineal continua que inicia en la línea base B (en ki = 0.5)
                // y termina en 1.0 (cuando ki alcanza a kmax).
                var ratio = (ki - 0.5) / (kmax - 0.5);
                return B + (1.0 - B) * ratio;
            } else {
                // Los elementos a la izquierda de la mitad se atenúan proporcionalmente hacia B.
                return (2.0 * ki) * B;
            }
        }
    };

    var PAD_MODE_CONTROL_BYTE = lookup({ CUE: 0x00, LOOP: 0x0E, SAMPLER: 0x0B, EFFECT: 0x0F });
    var PAD_NUM_CONTROL_BYTE = lookup({ PAD1: 0x14, PAD2: 0x15, PAD3: 0x16, PAD4: 0x17, PAD5: 0x1C, PAD6: 0x1D, PAD7: 0x1E, PAD8: 0x1F });
    var DECK_PAD_CHANNEL = lookup({ DECK1: 4, DECK2: 5 });

    var initPads = function() {
        for (var deck in PAD_MAPPINGS) {
            for (var pad in PAD_MAPPINGS[deck]) {
                for (var mode in PAD_MAPPINGS[deck][pad]) {
                    var defs = PAD_MAPPINGS[deck][pad][mode];
                    var deckPadChannel = DECK_PAD_CHANNEL[deck];
                    var statusByte = deckPadChannel + 0x90;
                    var controlByte = PAD_NUM_CONTROL_BYTE[pad];
                    var callbackKeys = defs.getCallbackKeyMappings();
                    for (var key in callbackKeys) {
                        if (padCallbackMappings[key] === undefined) {
                            padCallbackMappings[key] = [];
                            var gc = key.split(',');
                            if (gc[0] !== SELF) engine.connectControl(gc[0], gc[1], callbackKeys[key]);
                        }
                        padCallbackMappings[key].push({ 'deck': deck, 'modeName': mode, 'statusByte': statusByte, 'controlByte': controlByte });
                    }
                }
            }
        }
    };

    this.init = function(id, debugging) {
        deckPadMode = { 'DECK1': 'CUE', 'DECK2': 'CUE' };
        var pflLED = function(value, group) {
            var ch = (group === '[Channel1]') ? 0 : 1;
            midi.sendShortMsg(value ? 0x90 + ch : 0x80 + ch, 0x1B, value ? 0x7F : 0x00);
        };
        engine.connectControl('[Channel1]', 'pfl', pflLED);
        engine.connectControl('[Channel2]', 'pfl', pflLED);

        initPads();

        for (var i = 1; i <= 2; i++) {
            engine.setValue('[EffectRack1_EffectUnit' + i + ']', 'enabled', 1);
            for (var f = 1; f <= 2; f++) {
                var eg = '[EffectRack1_EffectUnit' + i + '_Effect' + f + ']';
                engine.setValue(eg, 'enabled', 0);
                engine.setValue(eg, 'meta', 0.5);
            }
        }



        midi.sendShortMsg(0xBF, 0x21, 16); 
        engine.connectControl('[Channel1]', 'track_loaded', 'NumarkPartyMix.onTrackLoaded');
        engine.connectControl('[Channel2]', 'track_loaded', 'NumarkPartyMix.onTrackLoaded');

        flashTimer = engine.beginTimer(200, flashLoop, false);
        //midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x05, 0xF7], 6);

        engine.connectControl('[Channel1]', 'beat_active', 'NumarkPartyMix.onLightBeat');
        engine.connectControl('[Channel2]', 'beat_active', 'NumarkPartyMix.onLightBeat');

        engine.connectControl('[Channel1]', 'play', 'NumarkPartyMix.updateLightMaster');
        engine.connectControl('[Channel2]', 'play', 'NumarkPartyMix.updateLightMaster');
        //this.lightTimer = engine.beginTimer(30, function() { NumarkPartyMix.onLightTick(); });

        // 1. Ponemos la controladora en modo Serato (ID 7F) y Comando 03
        midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x03, 0xF7], 6);

        // 2. LOS CÓDIGOS "SECRETOS" DE SERATO (Capturados de tu Wireshark)
        // Estos comandos suelen configurar la respuesta de los LEDs y Jogs
        midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0xF7], 12);
        midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0xF7], 12);

        // 3. Activamos el Heartbeat constante (Comando 05) cada 250ms con ID de Serato
        this.heartbeatTimer = engine.beginTimer(250, function() {
            midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x05, 0xF7], 6);
        });

    }; 

    var longPressTimers = {};
    var longPressHelper = function(status, control, delay, onDownCallback, onTimerEndWhileDownCallback, onUpBeforeTimerEndCallback, onUpAfterTimerEndCallback) {
        var opcode = status & 0xF0;
        var channel = (status & 0x0F);
        var timerKey = channel + "_" + control;
        var timer = longPressTimers[timerKey];

        if (opcode === 0x80) {
            if (timer) {
                engine.stopTimer(timer);
                longPressTimers[timerKey] = 0;
                if (onUpBeforeTimerEndCallback) onUpBeforeTimerEndCallback();
            } else if (onUpAfterTimerEndCallback) {
                onUpAfterTimerEndCallback();
            }
        } else if (opcode === 0x90) {
            if (onDownCallback) onDownCallback();
            longPressTimers[timerKey] = engine.beginTimer(delay, function() {
                longPressTimers[timerKey] = 0;
                if (onTimerEndWhileDownCallback) onTimerEndWhileDownCallback();
            }, true);
        }
    };

    this.play = function(channel, control, value, status, group){
        var isPlaying = engine.getValue(group, "play");
        midi.sendShortMsg(0x90 + channel, control, (value > 0 || isPlaying) ? 0x7F : 0x01);
    };

    this.handleEqHighKnob = function(channel, control, value, status, group) {
        var deck = script.deckFromGroup(group);
        NumarkPartyMix.processKnobInput(deck, 'high', value);
    };

    this.handleEqLowKnob = function(channel, control, value, status, group) {
        var deck = script.deckFromGroup(group);
        NumarkPartyMix.processKnobInput(deck, 'low', value);
    };

    this.processKnobInput = function(deck, knobName, rawValue) {
        // Corrección del centro físico MIDI (64 -> 0.5, 127 -> 1.0)
        var normalizedValue = 0.5;
        if (rawValue <= 64) {
            normalizedValue = (rawValue / 64.0) * 0.5;
        } else {
            normalizedValue = 0.5 + ((rawValue - 64.0) / 63.0) * 0.5;
        }

        knobValues[deck][knobName] = normalizedValue;

        // Comprobación dinámica de stems
        var hasStems = (engine.getValue('[Channel' + deck + ']', 'stem_count') > 0);

        if (hasStems) {
            // Aplicar la lógica matemática a los 4 stems, pero solo si el valor cambia
            for (var i = 1; i <= 4; i++) {
                var vol = calculateStemVolume(deck, i);
                var groupName = '[Channel' + deck + '_Stem' + i + ']';
                var currentVol = engine.getValue(groupName, 'volume');
                
                if (Math.abs(currentVol - vol) > 0.001) {
                    engine.setValue(groupName, 'volume', vol);
                }
            }
        } else {
            // Comportamiento normal de ecualización en Mixxx
            var eqGroup = '[EqualizerRack1_[Channel' + deck + ']_Effect1]';
            var eqParam = (knobName === 'high') ? 'parameter3' : 'parameter1';
            
            // Convertimos la posición física al rango real de Mixxx (0.0 a 4.0)
            var eqValue = getEqParameterValue(normalizedValue);
            var currentEq = engine.getValue(eqGroup, eqParam);

            if (Math.abs(currentEq - eqValue) > 0.001) {
                engine.setValue(eqGroup, eqParam, eqValue);
            }
        }
    };

	
    this.setPadMode = function(channel, control, value, status, group) {
        if (value === 0 && control !== null) return; 
        var deckNum = (status === 0x94 || group === '[Channel1]') ? 1 : 2;
        var modeName = (control === null) ? deckPadMode['DECK' + deckNum] : PAD_MODE_CONTROL_BYTE[control];
        if (modeName) {
            deckPadMode['DECK' + deckNum] = modeName;
            
            if (modeName === 'CUE') {
                for (var i = 1; i <= 3; i++) {
                    engine.setValue('[EffectRack1_EffectUnit' + deckNum + '_Effect' + i + ']', 'meta', 0);
                }
            }

            midi.sendShortMsg((deckNum === 1 ? 0x94 : 0x95), PAD_MODE_CONTROL_BYTE[modeName], 0x7F);
            NumarkPartyMix.repaintPads(deckNum);
        }
    };

    this.handlePad = function(channel, control, value, status, group) {
        var deckNum = (status === 0x94 || status === 0x84) ? 1 : 2;
        var modeName = deckPadMode['DECK' + deckNum];
        var padNum = PAD_NUM_CONTROL_BYTE[control];
        var padDefinition = PAD_MAPPINGS['DECK' + deckNum][padNum][modeName];
        if (padDefinition) padDefinition.handle(value ? 1 : 0);
        //if (value === 0) engine.beginTimer(20, function() { NumarkPartyMix.repaintPads(deckNum); }, true);
    };

    this.exitScratchMode = function(deckNum) {
        if (engine.isScratching(deckNum)) {
            engine.scratchDisable(deckNum, RAMP_UP);
            lastScratchExitTime[deckNum] = Date.now(); 
        }
        if (scratchStopTimer[deckNum]) {
            engine.stopTimer(scratchStopTimer[deckNum]);
            scratchStopTimer[deckNum] = 0;
        }
    };

    this.scratch = function(channel, control, value, status, group) {
        var deckNum = script.deckFromGroup(group);
        if (deckPadMode['DECK' + deckNum] === 'EFFECT') return;
        if (!isScratchEnabled[deckNum]) return;
        if (value > 0) {
            isDeckTouched[deckNum] = true;
            if (scratchStopTimer[deckNum]) { engine.stopTimer(scratchStopTimer[deckNum]); scratchStopTimer[deckNum] = 0; }
            if (isManualBraking[deckNum]) { engine.brake(deckNum, false); engine.setValue(group, "play", 0); isManualBraking[deckNum] = false; }
            if (!engine.isScratching(deckNum)) engine.scratchEnable(deckNum, RESOLUTION, RECORD_SPEED, ALPHA, BETA, RAMP_DOWN);
        } else {
            isDeckTouched[deckNum] = false;
            if (scratchStopTimer[deckNum]) engine.stopTimer(scratchStopTimer[deckNum]);
            scratchStopTimer[deckNum] = engine.beginTimer(INERTIA_TIMEOUT_MS + 5, function() {
                if (!isDeckTouched[deckNum]) NumarkPartyMix.exitScratchMode(deckNum);
            }, true);
        }
    };

    this.wheelTurn = function(channel, control, value, status, group) {
        var deckNum = script.deckFromGroup(group);
        var newValue = (value < 64) ? value : value - 128;

        if (deckPadMode['DECK' + deckNum] === 'EFFECT') {
            var action = (newValue > 0) ? 'meta_up_small' : 'meta_down_small';
            for (var i = 1; i <= 3; i++) {
                engine.setValue('[EffectRack1_EffectUnit' + deckNum + '_Effect' + i + ']', action, 1);
            }
            return;
        }

        var now = Date.now();
        var delta = now - lastMovementTime[deckNum];
        lastMovementTime[deckNum] = now;

        if (engine.isScratching(deckNum)) {
            if (!isDeckTouched[deckNum]) {
                var isPlaying = engine.getValue(group, "play");
                var timeout = (isPlaying && newValue > 0) ? INERTIA_TIMEOUT_MS : INERTIA_TIMEOUT_MS_PAUSE;
                if (delta > timeout) { NumarkPartyMix.exitScratchMode(deckNum); return; }
                if (scratchStopTimer[deckNum]) engine.stopTimer(scratchStopTimer[deckNum]);
                scratchStopTimer[deckNum] = engine.beginTimer(timeout + 10, function() {
                    if (!isDeckTouched[deckNum]) NumarkPartyMix.exitScratchMode(deckNum);
                }, true);
            }
            engine.scratchTick(deckNum, newValue);
        } else {
            if (now - lastScratchExitTime[deckNum] < POST_SCRATCH_LOCKOUT_MS) return;
            engine.setValue(group, 'jog', newValue * (engine.getValue(group, "play") ? 1 : PAUSE_JOG_SENSITIVITY));
        }
    };

    
    this.toggleView = function(channel, control, value, status, group) {
        
        // ACCIÓN 1: Cambio de panel (Click corto al soltar)
        var shortPressAction = function() {
            var currentWidget = engine.getValue("[Library]", "focused_widget");
            
            /* 
               Valores de focused_widget:
               1: Search Bar
               2: Tree View (Sidebar)
               3: Tracks Table
            */
            var nextWidget;
            if (currentWidget === 2) {
                // Si estoy en el Sidebar, voy a la Lista de temas
                nextWidget = 3;
                
                // Reiniciamos el contador cada vez que pasamos del Sidebar a la lista de temas
                currentSortIndex = 0;
            } else if (currentWidget === 3) {
                // Si estoy en la Lista de temas, voy al Buscador
                nextWidget = 1;
            } else {
                // Si estoy en el Buscador (o cualquier otro sitio), vuelvo al Sidebar
                nextWidget = 2;
            }
            
            engine.setValue("[Library]", "focused_widget", nextWidget);
        };

        // ACCIÓN 2: Acción contextual (Click largo a los 500ms)
        var longPressAction = function() {
            var currentWidget = engine.getValue("[Library]", "focused_widget");

            if (currentWidget === 2) {
                // Si estamos en el Sidebar: Expandir/Cerrar carpeta
                engine.setValue("[Library]", "GoToItem", 1);
            } 
            else if (currentWidget === 3) {
                // Ordenamos secuencialmente usando la lista configurable
                if (SORT_CRITERIA.length > 0) {
                    var columnToSort = SORT_CRITERIA[currentSortIndex];
                    
                    // Asignamos la columna. Mixxx ordenará automáticamente en modo creciente (ascendente)
                    engine.setValue("[Library]", "sort_column_toggle", columnToSort);
                    
                    // Avanzamos al siguiente elemento de la lista para la próxima pulsación
                    currentSortIndex = (currentSortIndex + 1) % SORT_CRITERIA.length;
                }
            }
            else if (currentWidget === 1) {
                // Si estamos en el Buscador: Limpiar la búsqueda con el click largo
                engine.setValue("[Library]", "clear_search", 1);
            }
            else {
                // Por defecto en otros casos, usar acción nativa
                engine.setValue("[Library]", "GoToItem", 1);
            }
        };

        // Ejecución mediante el helper de pulsación larga
        longPressHelper(status, control, LIBRARY_LONGPRESS_DELAY, null, longPressAction, shortPressAction, null);
    };




    this.shutdown = function() {
        if (this.heartbeatTimer) {
            engine.stopTimer(this.heartbeatTimer);
        }
        midi.sendShortMsg(0x94, PAD_MODE_CONTROL_BYTE.CUE, ON);
        midi.sendShortMsg(0x95, PAD_MODE_CONTROL_BYTE.CUE, ON);
        this.killLights();
    };
    
    this.handleGlobalShift = function(channel, control, value, status, group) {
        NumarkPartyMix.isPadModeHeld = (status === 0x9F);
        NumarkPartyMix.setPadMode(null, null, 1, 0x94, '[Channel1]');
        NumarkPartyMix.setPadMode(null, null, 1, 0x95, '[Channel2]');
    };

    this.refreshLayout = function(deck) {
        NumarkPartyMix.setPadMode(null, null, 1, (deck === 1 ? 0x94 : 0x95), '[Channel' + deck + ']');
    };
    
    this.handleStandardCue = function(channel, control, value, status, group) {
        var deck = script.deckFromGroup(group);
        if (value > 0) {
            hotcuesDownCount[deck]++;
            if (isManualBraking[deck]) { engine.brake(deck, false); engine.setValue(group, "play", 0); isManualBraking[deck] = false; }
            if (engine.isScratching(deck) && !isDeckTouched[deck]) { engine.setValue(group, "cue_gotoandstop", 1); return; }
            if (engine.getValue(group, "play")) { engine.setValue(group, "cue_gotoandstop", 1); } 
            else { engine.setValue(group, isDeckTouched[deck] ? "cue_set" : "cue_default", 1); }
        } else {
            hotcuesDownCount[deck]--;
            engine.setValue(group, "cue_default", 0);
        }
        if (hotcuesDownCount[deck] < 0) hotcuesDownCount[deck] = 0;
    };

    this.handlePlayWithBrake = function(channel, control, value, status, group) {
        if (value === 0) return; 
        var deck = script.deckFromGroup(group);
        if (hotcuesDownCount[deck] > 0) { engine.setValue(group, "play", 0); engine.setValue(group, "play", 1); isManualBraking[deck] = false; return; }
        if (isManualBraking[deck]) { engine.brake(deck, false); isManualBraking[deck] = false; engine.setValue(group, "play", 1); return; }
        if (!engine.getValue(group, "play")) { engine.setValue(group, "play", 1); } 
        else {
            if (isDeckTouched[deck]) { 
                engine.setValue(group, "play", 0); 
            } 
            else if (engine.isScratching(deck)) {
                // Si hay backspin (scratch activo pero sin toque), solo quitamos el Play
                engine.setValue(group, "play", 0);
            } 
            else {
                // Si no hay movimiento de scratch, aplicamos el freno normal
                isManualBraking[deck] = true; 
                engine.brake(deck, true, 100); 
            }
        }
    };

    
    this.onTrackLoaded = function(value, group) {
        if (value === 1) {
            var deckNum = script.deckFromGroup(group);

            deckPadMode['DECK' + deckNum] = 'CUE'; 

            // Restablecer el volumen de todos los stems a 1.0
            for (var s = 1; s <= 4; s++) {
                engine.setValue('[Channel' + deckNum + '_Stem' + s + ']', 'volume', 1.0);
            }

            var hasStems = (engine.getValue(group, 'stem_count') > 0);
            if (hasStems) {
                // SI TIENE STEMS: Reseteamos la ecualización a FLAT (1.0) para que no interfiera 
                // ya que los knobs ahora controlarán Stems.
                engine.setValue('[EqualizerRack1_[Channel' + deckNum + ']_Effect1]', 'parameter3', 1.0);
                engine.setValue('[EqualizerRack1_[Channel' + deckNum + ']_Effect1]', 'parameter1', 1.0);

                // Aplicar volúmenes iniciales según la posición física de las perillas
                for (var i = 1; i <= 4; i++) {
                    var vol = calculateStemVolume(deckNum, i);
                    engine.setValue('[Channel' + deckNum + '_Stem' + i + ']', 'volume', vol);
                }
            } else {
                // SI ES NORMAL: Sincronizamos la EQ visual en pantalla con las perillas físicas
                var eqHighVal = getEqParameterValue(knobValues[deckNum]['high']);
                var eqLowVal = getEqParameterValue(knobValues[deckNum]['low']);
                engine.setValue('[EqualizerRack1_[Channel' + deckNum + ']_Effect1]', 'parameter3', eqHighVal);
                engine.setValue('[EqualizerRack1_[Channel' + deckNum + ']_Effect1]', 'parameter1', eqLowVal);
            }

            engine.setValue(group, 'beatloop_size', 4);
            isManualBraking[deckNum] = false; 
            
            hotcuesDownCount[deckNum] = 0;
            /*
            if (engine.isScratching(deckNum)) {
                engine.scratchDisable(deckNum);
            }*/

            NumarkPartyMix.setPadMode(null, null, 1, (deckNum === 1 ? 0x94 : 0x95), group);
        }
    };





    this.handlePfl = function(channel, control, value, status, group) {
        engine.setValue(group, 'pfl', value ? 1 : 0);
    };

    this.repaintPads = function(deck) {
        var mode = deckPadMode['DECK' + deck];
        var status = (deck === 1) ? 0x94 : 0x95;
        var group = '[Channel' + deck + ']';
        for (var i = 0; i < 4; i++) {
            var physicalPad = 0x14 + i;
            var logicPadNum = i + 1;
            var midiVal = 0x00;
            if (mode === 'CUE') midiVal = engine.getValue(group, 'hotcue_' + logicPadNum + '_enabled') ? 0x7F : 0x00;
            else if (mode === 'LOOP') midiVal = (logicPadNum === 1) ? (engine.getValue(group, 'loop_enabled') ? flashVal : 0x00) : 0x01;
            else if (mode === 'SAMPLER') {
                // Si mantenemos "Pad Mode", mostramos la segunda capa (Samplers 5-8)
                if (NumarkPartyMix.isPadModeHeld) {
                    if(logicPadNum <= 3){
                        
                        var sg = '[Sampler' + (logicPadNum + 4) + ']';
                        midiVal = engine.getValue(sg, 'play') ? 0x7F : (engine.getValue(sg, 'track_loaded') ? 0x01 : 0x00);
                    }
                    else {
                        midiVal = 0x7F;
                    }
                    
                } else {
                    // Capa normal: Samplers 1-4
                    var sg = '[Sampler' + logicPadNum + ']';
                    midiVal = engine.getValue(sg, 'play') ? 0x7F : (engine.getValue(sg, 'track_loaded') ? 0x01 : 0x00);
                }
            } else if (mode === 'EFFECT') {
                if (NumarkPartyMix.isPadModeHeld) {
                    if (logicPadNum === 1) midiVal = engine.getValue(group, 'quantize') ? 0x7F : 0x00;
                    else if (logicPadNum === 3) midiVal = isScratchEnabled[deck] ? 0x7F : 0x00;
                    else midiVal = 0x01;
                } else {
                    if (logicPadNum <= 3) {
                        midiVal = engine.getValue('[EffectRack1_EffectUnit' + deck + '_Effect' + logicPadNum + ']', 'enabled') ? 0x7F : 0x00;
                    } else {
                        midiVal = 0x00;
                    }
                }
            }
            midi.sendShortMsg(status, physicalPad, midiVal);
        }
    };

    this.setPartyLights = function(r, g, b) {
        var mapping = { 0x40: r, 0x41: g, 0x43: b };
        for (var cc in mapping) {
            var val = Math.floor(Math.min(127, Math.max(0, mapping[cc])));
            if (lastLightValues[cc] !== val) {
                midi.sendShortMsg(0xBF, parseInt(cc), val);
                lastLightValues[cc] = val;
            }
        }
    };

    this.killLights = function() { this.setPartyLights(0, 0, 0); };
    this.getBeatPos = function(deck) { return engine.getValue('[Channel' + deck + ']', 'beat_distance') || 0; };

    this.onLightTick = function() {
        // Double check: if no master, do nothing
        if (lightMasterDeck === 0) return;

        var effect = LightPatterns[currentLightPattern];
        if (effect && effect.onTick) {
            effect.onTick(lightMasterDeck);
        }
    };

    this.onLightBeat = function(value, group) {
        // If hardware is NOT in mode 1, ignore all beats
        if (!isSoftwareLightMode) return;

        var deck = script.deckFromGroup(group);
        if (value > 0 && deck === lightMasterDeck) {
            var effect = LightPatterns[currentLightPattern];
            if (effect && effect.onBeat) effect.onBeat(deck, value);
        }
    };

    this.moveVertical = function(channel, control, value, status, group) {
        var now = Date.now();
        var delta = now - lastLibraryMoveTime;
        lastLibraryMoveTime = now;

        // Dirección básica: 1 para abajo, -1 para arriba
        var val = (value === 0x01) ? 1 : -1;

        // Solo aplicamos aceleración si estamos en la lista de temas (widget 3)
        var currentWidget = engine.getValue("[Library]", "focused_widget");
        if (currentWidget === 3) {
            var multiplier = 1;
            if (delta < 10) multiplier = 10;      // Giro muy rápido
            else if (delta < 20) multiplier = 3; // Giro medio
            
            val = val * multiplier;
        }

        engine.setValue("[Library]", "MoveVertical", val);
    };

    this.loadTrack = function(channel, control, value, status, group) {
        if (value === 0) return; // Ignorar el evento al soltar el botón (solo actuar al presionar)

        // Comprobamos si el plato correspondiente está sonando actualmente
        var isPlaying = engine.getValue(group, "play");
        
        if (isPlaying > 0) {
            // Si el plato estaba sonando, carga y reproduce automáticamente
            engine.setValue(group, "LoadSelectedTrackAndPlay", 1);
        } else {
            // Si estaba detenido, hace una carga normal sin alterar el estado de pausa
            engine.setValue(group, "LoadSelectedTrack", 1);
        }
    };

};

NumarkPartyMix = new NumarkPartyMix();