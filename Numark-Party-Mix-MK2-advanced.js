// Author: cokomairena 
/*
Updates:
- you can now delete hotcues
- pressing pause now breaks
- you can stop the braking with hotcues or play
- the backspin works perfectly! it follows the physical platter
- loop pads: pad 1 toggles the loop on or off, pad 2 rolls the loop, pad 3 halves the loop, pad 4 doubles the loop
- beatjump: pad 5 backward 1 beat, pad 6 forward 1 beat, pad 7 backward 4 beats, pad 8 forward 4 beats
- effect pads: pad 1 toggles effect 1, pad 2 toggles effect 2, pad 3 turns the meta knob down, pad 4 turns the meta knob up
- effect config (Layer 2): pad 5 toggles quantize, pad 6 changes tempo range (8%/16%/50% cycle), pad 8 toggles keylock
- advanced led logic: implemented hardware-shift awareness for FX mode. LEDs now refresh instantly to show secondary functions when holding "Pad Mode".
- fixed cue while backspining and general scratch responsiveness, before sometimes it reverted to jog mode when playing with the brake.
- implementing scratch mode on/off
*/

// Based on the Numark Party Mix MK2 mapping by magtomm
// Originally based on the Numark Party Mix mapping by Ryli Dunlap (rylito)
// Thanks to authors of other scripts used as a reference and to DJ Dexter and DarkPoubelle
// for the initial PartyMix mappings posted on the forum.

////////////////////////////////////////////////////////////////////////
// JSHint configuration                                               //
////////////////////////////////////////////////////////////////////////
/* global engine                                                      */
/* global script                                                      */
/* global midi                                                        */
//////////////////////////////////////////////////////////////////////// 

var NumarkPartyMix = function() {

    var SCRATCH_LONGPRESS_DELAY = 0;
    var LIBRARY_LONGPRESS_DELAY = 500;
    var FLASH_DELAY = 200;
    var USE_FLASH = false;
    var USE_SAMPLE_BANK = true;

    var RESOLUTION = 310; //300
    var RECORD_SPEED = 33 + (1 / 3);
    var ALPHA = 1.0 / 8; //original 1.0 / 8
    var BETA = ALPHA / 32;
    var RAMP_DOWN = true;
    var RAMP_UP = false;

    var ON = 0x7F;
    var OFF = 0x00;
    var DIM = 0x01;
    var FLASH = 0x40; // not recognized by the controller, but used as a flag to flash this with the script

    var SELF = 'SELF';
    var NOOP = 'NOOP';
    var PAD_PRESS = 'PAD_PRESS';

    var PFL_CONTROL = 0x1B;

    var hotcuesDownCount = { 1: 0, 2: 0 };
    var isManualBraking = { 1: false, 2: false }; // Nueva variable para rastrear el freno

    this.isPadModeHeld = false; // Estado global del botón Pad Mode

    var isScratchEnabled = { 1: true, 2: true }; // El scratch empieza activado por defecto


    //variables para backspin sin touch off
    var lastMovementTime = { 1: 0, 2: 0 };
    var currentVelocity = { 1: 0, 2: 0 };
    var lastDirection = { 1: 0, 2: 0 }; // para no hacer inercia hacia adelante
    var isInertiaMode = { 1: false, 2: false };
    var inertiaTimer = { 1: 0, 2: 0 };

    var isDeckTouched = { 1: false, 2: false }; // Nueva variable para saber si la mano está en el plato

    // Historial para suavizar el jitter del USB (Ventana de 8 mensajes)
    var deltaHistory = { 
        1: [6, 6, 6, 6, 6, 6, 6, 6], 
        2: [6, 6, 6, 6, 6, 6, 6, 6] 
    };


    var BACKSPIN_THRESHOLD = 5; // Velocidad mínima para activar el modo inercia, default 15
    var STOP_THRESHOLD = 50;    // Milisegundos sin movimiento para considerar que el plato paró

    // Memoria de luces (Caché) para evitar spam MIDI
    var lastLightValues = { 0x40: -1, 0x41: -1, 0x43: -1 }; 

    // Índice del efecto actual de luces
    var currentLightPattern = 0;

    //LIGHTSHOWS DEFINED HERE
    var LightPatterns = [
        {
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
        }
        ,{
            name: "One beam",
            beatCounter: 0,
            colorIdx: 0,
            colorOrder: [0, 1, 2], // 0:R, 1:G, 2:B
            levels: [0, 0, 0],     // Niveles internos [r, g, b]
            
            // Función para desordenar los colores (Shuffle)
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
                // Fase 1: Cada beat (beats 0-15)
                if (this.beatCounter < 16) {
                    flashNow = true;
                } 
                // Fase 2: Cada 2 beats (beats 16-31)
                else {
                    if (this.beatCounter % 2 === 0) flashNow = true;
                }

                if (flashNow) {
                    // Elegimos el siguiente color del orden actual
                    var activeColor = this.colorOrder[this.colorIdx];
                    this.levels[activeColor] = 127; // Encendido inmediato
                    
                    this.colorIdx = (this.colorIdx + 1) % 3;
                }

                // Al completar el ciclo de 32 beats, barajamos el orden para la próxima
                this.beatCounter = (this.beatCounter + 1) % 32;
                if (this.beatCounter === 0) {
                    this.shuffle();
                }
            },

            onTick: function(deck) {
                // Reducimos el brillo de TODOS los colores simultáneamente
                // Esto permite que el color anterior se vaya apagando mientras el nuevo brilla
                for (var i = 0; i < 3; i++) {
                    this.levels[i] = Math.max(0, this.levels[i] - 6); 
                }

                NumarkPartyMix.setPartyLights(this.levels[0], this.levels[1], this.levels[2]);
            }
        },{
            name: "Sparkle strobo",
            beatCounter: 0,
            lastSub: -1,
            lastColorIdx: -1,
            onBeat: function(deck, value) {
                if (value > 0) {
                    // Contamos hasta 32 beats para alternar cada 16
                    this.beatCounter = (this.beatCounter + 1) % 32;
                }
            },
            onTick: function(deck) {
                var pos = NumarkPartyMix.getBeatPos(deck);
                
                // Decidimos la velocidad: 
                // Si estamos en los primeros 16 beats -> 4 destellos por beat (1/4)
                // Si estamos en los siguientes 16 beats -> 2 destellos por beat (1/2)
                var divisions = (this.beatCounter < 16) ? 4 : 2;
                
                var currentSub = Math.floor(pos * divisions);

                if (currentSub !== this.lastSub) {
                    // DISPARO: Elegir color sin repetir
                    var nextColorIdx;
                    do {
                        nextColorIdx = Math.floor(Math.random() * 3);
                    } while (nextColorIdx === this.lastColorIdx);

                    this.lastColorIdx = nextColorIdx;

                    var r = 0, g = 0, b = 0;
                    if (nextColorIdx === 0) r = 127;
                    else if (nextColorIdx === 1) g = 127;
                    else b = 127;

                    NumarkPartyMix.setPartyLights(r, g, b);
                    this.lastSub = currentSub;
                } else {
                    // APAGADO: Un frame después (efecto estrobo)
                    NumarkPartyMix.setPartyLights(0, 0, 0);
                }
            }
        },
        {
            name: "White beat",
            beatCounter: 0,
            onBeat: function(deck, value) {
                if (value > 0) {
                    // Evaluamos la condición ANTES de incrementar para asegurar sincronía
                    var flashNow = false;

                    if (this.beatCounter < 16) {
                        // Frase 1: Flash en todos los beats
                        flashNow = true;
                    } else {
                        // Frase 2: Flash solo en beats pares (16, 18, 20...)
                        if (this.beatCounter % 2 === 0) flashNow = true;
                    }

                    if (flashNow) {
                        // Forzamos el envío MIDI inmediato al máximo
                        NumarkPartyMix.setPartyLights(127, 127, 127);
                    }

                    // Incrementamos después de haber procesado el flash
                    this.beatCounter = (this.beatCounter + 1) % 32;
                }
            },
            onTick: function(deck) { 
                // Desvanecimiento suave constante
                // El caché de lastLightValues evitará mandar ceros innecesarios
                var current = lastLightValues[0x40];
                if (current > 0) {
                    var r = Math.max(0, current - 10);
                    NumarkPartyMix.setPartyLights(r, r, r);
                }
            }
        }
    ];


    var MIDI_CH_TO_DECK = {
        0: 'DECK1',
        1: 'DECK2',
        4: 'DECK1', // Canal de los pads Deck 1
        5: 'DECK2'  // Canal de los pads Deck 2
    };

    var forEach = function(array, func) {
        for (var i = 0; i < array.length; i++) {
            func(array[i]);
        }
    };

    var lookup = function(dict) {
        iterItems(dict, function(k, v) {
            dict[v] = k;
        });
        return dict;
    };

    //begin flash timer;
    var flashTimer = 0;
    var flashVal = DIM;

    var flashLoop = function() {
        // Alterna el valor del brillo (tenue/brillante)
        flashVal = (flashVal === DIM) ? ON : DIM;
        
        // Optimización Deck 1: Solo repinta si el modo actual es LOOP y hay un loop sonando
        if (deckPadMode['DECK1'] === 'LOOP' && engine.getValue('[Channel1]', 'loop_enabled')) {
            NumarkPartyMix.repaintPads(1);
        }

        // Optimización Deck 2: Solo repinta si el modo actual es LOOP y hay un loop sonando
        if (deckPadMode['DECK2'] === 'LOOP' && engine.getValue('[Channel2]', 'loop_enabled')) {
            NumarkPartyMix.repaintPads(2);
        }
    };


    var deckPadMode = { 'DECK1': 'CUE', 'DECK2': 'CUE' }; // Forzamos CUE desde el segundo 0

    var padCallbackMappings = {};

    var syncPadLedCallbackHelper = function(group, control, valueByte) {
        // No importa qué control cambió en Mixxx, simplemente repintamos los dos decks
        // para asegurar consistencia total.
        NumarkPartyMix.repaintPads(1);
        NumarkPartyMix.repaintPads(2);
    };




    //used to select relevent pad if callback has multiple mappings
    var syncSelfCallbackHelper = function(group, control, statusByte, controlByte, valueByte) {
        var key = [group, control];
        var mappings = padCallbackMappings[key];
		//var str = JSON.stringify(padCallbackMappings);
		//print(str);
        //forEach(mappings, function(mapping) {
        //    if (deckPadMode[mapping.deck] === mapping.modeName && mapping.statusByte === statusByte && mapping.controlByte === controlByte) {
        //        midi.sendShortMsg(mapping.statusByte, mapping.controlByte, valueByte);
        //    }
        //});
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
                    
                    // --- SOLUCIÓN PARA HOTCUES ---
                    if (isManualBraking[deckNum]) {
                        engine.brake(deckNum, false);      // Matamos el freno
                        engine.setValue(this.group, "play", 0); // FORZAMOS PAUSA
                        isManualBraking[deckNum] = false;  // Limpiamos estado
                    }
                } else {
                    hotcuesDownCount[deckNum]--;
                }
                if (hotcuesDownCount[deckNum] < 0) hotcuesDownCount[deckNum] = 0;
            }
            
            // Resto de la lógica (ejecutar el comando de Mixxx)
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
                // value 1 = ON, value 0 = OFF (apagado total)
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

    // Pad 3 y 4: Cambian el tamaño del loop (Mitad / Doble)
    var padDefLoop = function(deck, type) {
        this.group = '[Channel' + deck + ']';
        if (type === 'halve') {
            this.actionControl = 'loop_halve';
        } else if (type === 'double') {
            this.actionControl = 'loop_double';
        }
        this.toggle = false;
    };
    padDefLoop.prototype = padDefProto;

    
    // Definición para los Samplers 1 al 7 (Solo Play, no carga)
    var padDefSimpleSampler = function(samplerNum) {
        this.group = '[Sampler' + samplerNum + ']';
        this.bindingControl = 'play'; 

        this.handle = function(isPressed) {
            if (isPressed) {
                // Solo si hay un archivo cargado en el slot
                if (engine.getValue(this.group, 'track_loaded')) {
                    // Si ya está sonando, lo reinicia (tipo Hotcue)
                    engine.setValue(this.group, 'cue_gotoandplay', 1);
                }
            }
        };

        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            // El LED se enciende si el sampler está reproduciendo
            callbackKeyMappings[[this.group, 'play']] = function(value, group, control) {
                syncPadLedCallbackHelper(group, control, value ? ON : OFF);
            };
            return callbackKeyMappings;
        };
    };

    // Definición para el Botón de Pánico (Pad 8)
    var padDefSamplerPanic = function() {
        this.handle = function(isPressed) {
            if (isPressed) {
                // Detiene los 7 samplers de golpe
                for (var i = 1; i <= 7; i++) {
                    engine.setValue('[Sampler' + i + ']', 'stop', 1);
                }
            }
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var padDefNoOp = {
        getCallbackKeyMappings: function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[SELF, NOOP]] = null;
            return callbackKeyMappings;
        },
        handle: function(isPressed) {},
    };

    var padDefSimpleEffect = function(func) {
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[SELF, PAD_PRESS]] = null;
            return callbackKeyMappings;
        };

        this.handle = function(isPressed) {
            func(isPressed);
        };
    };

    var padDefGeneric = function(group, control, toggle) {
        this.group = group;
        this.actionControl = control;
        this.bindingControl = control;
        this.toggle = true;
    };
    padDefGeneric.prototype = padDefProto;

     // Pad 1: Crea un loop nuevo (tamaño actual) y lo apaga
    var padDefLoopToggle = function(deck) {
        this.group = '[Channel' + deck + ']';
        this.bindingControl = 'loop_enabled';
        
        this.handle = function(isPressed) {
            if (!isPressed) return;
            // Si el loop está prendido, lo apaga. Si está apagado, crea uno nuevo del tamaño actual.
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
        // Si el número es negativo usa backward, si es positivo forward
        var direction = (amount > 0) ? '_forward' : '_backward';
        this.actionControl = 'beatjump_' + Math.abs(amount) + direction;
        this.bindingControl = this.actionControl;
        this.toggle = false;
    };
    padDefBeatjump.prototype = padDefProto;

    var padDefLoopRoll = function(deck) {
        this.group = '[Channel' + deck + ']';
        this.actionControl = 'beatlooproll_activate'; 
        this.bindingControl = 'beatlooproll_activate';
        this.toggle = false; // false = Se apaga al soltar (Instant)
    };
    padDefLoopRoll.prototype = padDefProto;

    // Actualiza también padDefEffectToggle para que Mixxx reporte los cambios de LED
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

    var padDefMultiParam = function(unitNum, direction) {
        var suffix = (direction === 'up') ? '_up' : '_down';
        this.handle = function(isPressed) {
            if (isPressed) {
                // Mueve el Meta Knob de ambos efectos en la unidad seleccionada
                engine.setValue('[EffectRack1_EffectUnit' + unitNum + '_Effect1]', 'meta' + suffix, 1);
                engine.setValue('[EffectRack1_EffectUnit' + unitNum + '_Effect2]', 'meta' + suffix, 1);
            }
        };
        this.getCallbackKeyMappings = function() {
            var callbackKeyMappings = {};
            callbackKeyMappings[[SELF, PAD_PRESS]] = function(v, g, c) { syncPadLedCallbackHelper(g, c, DIM); };
            return callbackKeyMappings;
        };
    };


    var padDefTempoRange = function(deck) {
        var group = '[Channel' + deck + ']';
        this.handle = function(isPressed) {
            if (!isPressed) return;
            var current = engine.getValue(group, 'rateRange');
            var next = 0.08;
            
            // Ciclo inteligente: si está cerca de 8% -> 16%, si cerca de 16% -> 50%
            if (current < 0.12) next = 0.16;
            else if (current < 0.30) next = 0.50;
            else next = 0.08;
            
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
                // Convertimos el 1/0 de Mixxx en ON/OFF para el LED
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
            // Refrescamos los LEDs para que el Pad 7 muestre el nuevo estado
            NumarkPartyMix.refreshLayout(deck);
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };

    var padDefLightCycle = function() {
        this.handle = function(isPressed) {
            if (!isPressed) return;
            NumarkPartyMix.killLights(); // Limpieza previa
            currentLightPattern = (currentLightPattern + 1) % LightPatterns.length;
        };
        this.getCallbackKeyMappings = function() { return {}; };
    };






    // Begin pad mappings
    // Begin pad mappings
    var PAD_MAPPINGS = {
        DECK1: {
            // Capa Principal (Pads 1-4)
            PAD1: { CUE: new padDefCue(1, 1), LOOP: new padDefLoopToggle(1), SAMPLER: new padDefSimpleSampler(1), EFFECT: new padDefEffectToggle(1, 1) },
            PAD2: { CUE: new padDefCue(1, 2), LOOP: new padDefLoopRoll(1),   SAMPLER: new padDefSimpleSampler(2), EFFECT: new padDefEffectToggle(1, 2) },
            PAD3: { CUE: new padDefCue(1, 3), LOOP: new padDefLoop(1, 'halve'), SAMPLER: new padDefSimpleSampler(3), EFFECT: new padDefMultiParam(1, 'down') },
            PAD4: { CUE: new padDefCue(1, 4), LOOP: new padDefLoop(1, 'double'), SAMPLER: new padDefSimpleSampler(4), EFFECT: new padDefMultiParam(1, 'up') },
            // Capa Shift Hardware (Pads 5-8)
            PAD5: { CUE: new padDefCueClear(1, 1), LOOP: new padDefBeatjump(1, -1), SAMPLER: new padDefSimpleSampler(5), EFFECT: new padDefConfigToggle('[Channel1]', 'quantize') },
            PAD6: { CUE: new padDefCueClear(1, 2), LOOP: new padDefBeatjump(1, 1),  SAMPLER: new padDefSimpleSampler(6), EFFECT: new padDefTempoRange(1) },
            PAD7: { CUE: new padDefCueClear(1, 3), LOOP: new padDefBeatjump(1, -4), SAMPLER: new padDefSimpleSampler(7), EFFECT: new padDefScratchToggle(1) }, 
            PAD8: { CUE: new padDefCueClear(1, 4), LOOP: new padDefBeatjump(1, 4),  SAMPLER: new padDefSamplerPanic(),   EFFECT: new padDefLightCycle() }
        },
        DECK2: {
            // Capa Principal (Pads 1-4)
            PAD1: { CUE: new padDefCue(2, 1), LOOP: new padDefLoopToggle(2), SAMPLER: new padDefSimpleSampler(1), EFFECT: new padDefEffectToggle(2, 1) },
            PAD2: { CUE: new padDefCue(2, 2), LOOP: new padDefLoopRoll(2),   SAMPLER: new padDefSimpleSampler(2), EFFECT: new padDefEffectToggle(2, 2) },
            PAD3: { CUE: new padDefCue(2, 3), LOOP: new padDefLoop(2, 'halve'), SAMPLER: new padDefSimpleSampler(3), EFFECT: new padDefMultiParam(2, 'down') },
            PAD4: { CUE: new padDefCue(2, 4), LOOP: new padDefLoop(2, 'double'), SAMPLER: new padDefSimpleSampler(4), EFFECT: new padDefMultiParam(2, 'up') },
            // Capa Shift Hardware (Pads 5-8)
            PAD5: { CUE: new padDefCueClear(2, 1), LOOP: new padDefBeatjump(2, -1), SAMPLER: new padDefSimpleSampler(5), EFFECT: new padDefConfigToggle('[Channel2]', 'quantize') },
            PAD6: { CUE: new padDefCueClear(2, 2), LOOP: new padDefBeatjump(2, 1),  SAMPLER: new padDefSimpleSampler(6), EFFECT: new padDefTempoRange(2) },
            PAD7: { CUE: new padDefCueClear(2, 3), LOOP: new padDefBeatjump(2, -4), SAMPLER: new padDefSimpleSampler(7), EFFECT: new padDefScratchToggle(2) }, 
            PAD8: { CUE: new padDefCueClear(2, 4), LOOP: new padDefBeatjump(2, 4),  SAMPLER: new padDefSamplerPanic(),   EFFECT: new padDefLightCycle() }
        }
    };
    // End pad mappings

    var iterItems = function(obj, func) {
        for (var k in obj) {
            if (!obj.hasOwnProperty(k)) {
                continue;
            }
            func(k, obj[k]);
        }
    };

    var PAD_MODE_CONTROL_BYTE = lookup({
        CUE: 0x00,
        LOOP: 0x0E,
        SAMPLER: 0x0B,
        EFFECT: 0x0F,
    });

    var PAD_NUM_CONTROL_BYTE = lookup({
        PAD1: 0x14,
        PAD2: 0x15,
        PAD3: 0x16,
        PAD4: 0x17,
        PAD5: 0x1C, // Nota E
        PAD6: 0x1D, // Nota F
        PAD7: 0x1E, // Nota F#
        PAD8: 0x1F, // Nota G
    });

    var DECK_PAD_CHANNEL = lookup({
        DECK1: 4,
        DECK2: 5,
    });

    var initPads = function() {
        iterItems(PAD_MAPPINGS, function(deck, pads) {
            iterItems(pads, function(pad, modes) {
                iterItems(modes, function(mode, defs) {
                    var deckPadChannel = DECK_PAD_CHANNEL[deck];
                    var statusByte = deckPadChannel + 0x90;
                    var controlByte = PAD_NUM_CONTROL_BYTE[pad];
                    var callbackKeys = defs.getCallbackKeyMappings();
                    iterItems(callbackKeys, function(key, callbackFunc) {
                        var existing = padCallbackMappings[key];
                        if (existing === undefined) {
                            existing = [];
                            padCallbackMappings[key] = existing;
                            var groupAndControl = key.split(',');
                            if (groupAndControl[0] !== SELF) {
                                engine.connectControl(groupAndControl[0], groupAndControl[1], callbackFunc);
                            }
                        }
                        existing.push({
                            'deck': deck,
                            'modeName': mode,
                            'statusByte': statusByte,
                            'controlByte': controlByte
                        });
                    });
                });
            });
        });
    };

    this.init = function(id, debugging) {
        // 1. Estados iniciales
        deckPadMode = { 'DECK1': 'CUE', 'DECK2': 'CUE' };

        // 2. Auriculares (PFL)
        var pflLED = function(value, group, control) {
            var ch = (group === '[Channel1]') ? 0 : 1;
            midi.sendShortMsg(value ? 0x90 + ch : 0x80 + ch, 0x1B, value ? 0x7F : 0x00);
        };
        engine.connectControl('[Channel1]', 'pfl', pflLED);
        engine.connectControl('[Channel2]', 'pfl', pflLED);

        // 3. Inicializar Pads
        initPads();

        // 4. RESET DE EFECTOS (Unidades 1 y 2)
        for (var i = 1; i <= 2; i++) {
            var unitGroup = '[EffectRack1_EffectUnit' + i + ']';
            engine.setValue(unitGroup, 'enabled', 1);
            for (var f = 1; f <= 2; f++) {
                var effectGroup = '[EffectRack1_EffectUnit' + i + '_Effect' + f + ']';
                engine.setValue(effectGroup, 'enabled', 0);
                engine.setValue(effectGroup, 'meta', 0.5);
            }
        }

        // 5. Forzar actualización de Hotcues
        for (var j = 1; j <= 4; j++) {
            engine.trigger('[Channel1]', 'hotcue_' + j + '_enabled');
            engine.trigger('[Channel2]', 'hotcue_' + j + '_enabled');
        }

        // 6. Sysex Desbloqueo MK2
        midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x03, 0x01, 0xF7], 7);

 
        // 2. Activar modo software (CC 33, Valor 16)
        midi.sendShortMsg(0xBF, 0x21, 16); 



        engine.connectControl('[Channel1]', 'track_loaded', 'NumarkPartyMix.onTrackLoaded');
        engine.connectControl('[Channel2]', 'track_loaded', 'NumarkPartyMix.onTrackLoaded');

        flashTimer = engine.beginTimer(200, flashLoop, false);


        // Desbloqueo de las luces traseras (SysEx)
        midi.sendSysexMsg([0xF0, 0x00, 0x20, 0x7F, 0x05, 0xF7], 6);

        
        // Conexiones de los motores
        engine.connectControl('[Channel1]', 'beat_active', 'NumarkPartyMix.onLightBeat');
        engine.connectControl('[Channel2]', 'beat_active', 'NumarkPartyMix.onLightBeat');
        this.lightTimer = engine.beginTimer(30, function() { 
            NumarkPartyMix.onLightTick(); 
        });

    }; 

    var longPressTimers = {};

    var longPressHelper = function(status, control, delay, onDownCallback, onTimerEndWhileDownCallback, onUpBeforeTimerEndCallback, onUpAfterTimerEndCallback) {
        /*jslint bitwise: true */
        var opcode = status & 0xF0;
        /*jslint bitwise: false */
        var channel = (status - opcode);
        var timerKey = [channel, control];
        var timer = longPressTimers[timerKey];

        var resetTimer = function() {
            longPressTimers[timerKey] = 0;
        };

        var call = function(func) {
            if (func) {
                func();
            }
        };

        if (opcode === 0x80) {
            if (timer) {
                engine.stopTimer(timer);
                resetTimer();
                call(onUpBeforeTimerEndCallback);
            } else {
                call(onUpAfterTimerEndCallback);
            }
        } else if (opcode === 0x90) {
            call(onDownCallback);
            timer = engine.beginTimer(delay, function() {
                resetTimer();
                call(onTimerEndWhileDownCallback);
            }, true);
            longPressTimers[timerKey] = timer;
        }
    };

    this.handlePfl = function(channel, control, value, status, group) {
        engine.setValue(group, 'pfl', value ? 1 : 0);
    };
	
	this.play = function(channel, control, value, status, group){
        var isPlaying = engine.getValue(group, "play");
        // Solo enviamos luz si el botón está presionado o si está sonando
        if (value > 0 || isPlaying) {
            midi.sendShortMsg(0x90 + channel, control, 0x7F);
        } else {
            midi.sendShortMsg(0x90 + channel, control, 0x01);
        }
    };
	
    this.setPadMode = function(channel, control, value, status, group) {
        if (value === 0 && control !== null) return; 

        var deckNum = (status === 0x94 || group === '[Channel1]') ? 1 : 2;
        var modeName = (control === null) ? deckPadMode['DECK' + deckNum] : PAD_MODE_CONTROL_BYTE[control];

        if (modeName) {
            deckPadMode['DECK' + deckNum] = modeName;
            // Encender la luz del botón de modo (CUE, LOOP, etc)
            var modeNote = PAD_MODE_CONTROL_BYTE[modeName];
            midi.sendShortMsg((deckNum === 1 ? 0x94 : 0x95), modeNote, 0x7F);
            
            // Pintar los 4 pads físicos
            NumarkPartyMix.repaintPads(deckNum);
        }
    };

    this.handlePad = function(channel, control, value, status, group) {
        var deckNum = (status === 0x94 || status === 0x84) ? 1 : 2;
        var modeName = deckPadMode['DECK' + deckNum];
        var padNum = PAD_NUM_CONTROL_BYTE[control];

        var padDefinition = PAD_MAPPINGS['DECK' + deckNum][padNum][modeName];
        if (padDefinition) {
            padDefinition.handle(value ? 1 : 0);
        }

        // Al soltar el pad, repintamos para ganarle al "DIM" automático del hardware
        if (value === 0) {
            engine.beginTimer(20, function() {
                NumarkPartyMix.repaintPads(deckNum);
            }, true);
        }
    };






    this.scratch = function(channel, control, value, status, group) {
        var deckNum = script.deckFromGroup(group);

        if (!isScratchEnabled[deckNum]) return; 

        var stopScratching = function() {
            if (engine.isScratching(deckNum)) {
                engine.scratchDisable(deckNum, RAMP_UP);
                midi.sendShortMsg(status, control, DIM);
                isInertiaMode[deckNum] = false;
                return false;
            }
            return true;
        };

        var onDownCallback = function() {
            isDeckTouched[deckNum] = true; 
            
            if (inertiaTimer[deckNum]) {
                engine.stopTimer(inertiaTimer[deckNum]);
                inertiaTimer[deckNum] = 0;
            }
            isInertiaMode[deckNum] = false; 

            // RESET INTELIGENTE: Llenamos el historial con el delta que 
            // correspondería a la velocidad actual de la canción
            var currentRate = Math.abs(engine.getValue(group, "rate_ratio"));
            var idealDelta = (currentRate > 0) ? (6 / currentRate) : 6;
            deltaHistory[deckNum] = [idealDelta, idealDelta, idealDelta, idealDelta, idealDelta, idealDelta, idealDelta, idealDelta];

            if (isManualBraking[deckNum]) {
                engine.brake(deckNum, false);
                engine.setValue(group, "play", 0);
                isManualBraking[deckNum] = false;
            }

            if (!engine.isScratching(deckNum)) {
                engine.scratchEnable(deckNum, RESOLUTION, RECORD_SPEED, ALPHA, BETA, RAMP_DOWN);
                midi.sendShortMsg(status, control, ON);
            }
        };

        var onReleaseCallback = function() {
            isDeckTouched[deckNum] = false; 

            // Al ser BACKSPIN_THRESHOLD = 0, esto siempre entrará si el plato se está moviendo
            if (currentVelocity[deckNum] > BACKSPIN_THRESHOLD) {
                isInertiaMode[deckNum] = true;
                
                if (inertiaTimer[deckNum]) engine.stopTimer(inertiaTimer[deckNum]);
                
                // Timer de seguridad: si el plato no manda más ticks (se detuvo físicamente), matamos el scratch
                inertiaTimer[deckNum] = engine.beginTimer(STOP_THRESHOLD, function() {
                    if (engine.isScratching(deckNum)) {
                        engine.scratchDisable(deckNum, RAMP_UP);
                        midi.sendShortMsg(status, control, DIM);
                    }
                    isInertiaMode[deckNum] = false;
                }, true);
            } else {
                // Si se soltó estando totalmente quieto
                if (engine.isScratching(deckNum)) {
                    engine.scratchDisable(deckNum, RAMP_UP);
                    midi.sendShortMsg(status, control, DIM);
                    isInertiaMode[deckNum] = false;
                }
            }
        };

        longPressHelper(status, control, SCRATCH_LONGPRESS_DELAY, onDownCallback, null, null, onReleaseCallback);
    }; 

    this.wheelTurn = function(channel, control, value, status, group) {
        var deckNum = script.deckFromGroup(group);
        var newValue = (value < 64) ? value : value - 128;
        
        var now = Date.now();
        var deltaTime = now - lastMovementTime[deckNum];
        lastMovementTime[deckNum] = now;

        if (deltaTime > 0) {
            deltaHistory[deckNum].shift();
            deltaHistory[deckNum].push(deltaTime);

            var sumDeltas = 0;
            for (var i = 0; i < deltaHistory[deckNum].length; i++) {
                sumDeltas += deltaHistory[deckNum][i];
            }
            // Velocidad estable promediada en 8 mensajes
            currentVelocity[deckNum] = (100 * deltaHistory[deckNum].length) / sumDeltas;
        }

        if (engine.isScratching(deckNum)) {
            var isPlaying = engine.getValue(group, "play");
            
            if (isInertiaMode[deckNum] && isPlaying && newValue > 0) {
                // --- LA FUENTE DE LA VERDAD ---
                // rate_ratio nos da la velocidad real de salida (0.5 para -50%, 1.5 para +50%)
                // No importa si es por el fader, por Sync o por Master Clock.
                var targetRate = Math.abs(engine.getValue(group, "rate_ratio")); 

                // Calculamos la velocidad de sincronía física exacta para esa velocidad de audio
                var syncVelocity = ((RESOLUTION * RECORD_SPEED) / 600) * targetRate;

                // Aplicamos el Handoff
                if (currentVelocity[deckNum] <= syncVelocity) {
                    engine.scratchDisable(deckNum, RAMP_UP);
                    // No matamos la inercia aún para mantener el "escudo" contra el Jog residual
                }
            }

            if (engine.isScratching(deckNum)) {
                engine.scratchTick(deckNum, newValue);
            }
        } else {
            if (!isInertiaMode[deckNum]) {
                engine.setValue(group, 'jog', newValue);
            }
        }

        if (isInertiaMode[deckNum]) {
            if (inertiaTimer[deckNum]) engine.stopTimer(inertiaTimer[deckNum]);
            inertiaTimer[deckNum] = engine.beginTimer(STOP_THRESHOLD, function() {
                if (engine.isScratching(deckNum)) {
                    engine.scratchDisable(deckNum, RAMP_UP);
                }
                isInertiaMode[deckNum] = false; 
                midi.sendShortMsg(0x80 + (deckNum - 1), 0x06, 0x01); 
            }, true);
        }
    };

    //TODO The library functions have been improved greatly in 2.1. Update this to use them. For now, this will do

    var focusSidePane = true;

    this.moveVertical = function(channel, control, value, status, group) {

        var encoderValue = (value == 0x01) ? 1 : -1;

        if (focusSidePane) {
            engine.setValue('[Playlist]', 'SelectPlaylist', encoderValue);
        } else {
            engine.setValue('[Playlist]', 'SelectTrackKnob', encoderValue);
        }
    };

    this.toggleView = function(channel, control, value, status, group) {

        var toggleFocus = function() {
            focusSidePane = !focusSidePane;
        };

        var selectSidebar = function() {
            if (focusSidePane) {
                //TODO this is deprecated in 2.1
                engine.setValue('[Playlist]', 'ToggleSelectedSidebarItem', 1);
            }
        };

        longPressHelper(status, control, LIBRARY_LONGPRESS_DELAY, null, selectSidebar, toggleFocus, null);
    };


    this.shutdown = function() {
		//print("\n\n\n shutdown \n\n\n");
        // set modes back to CUE
        var cueByte = PAD_MODE_CONTROL_BYTE.CUE;
        midi.sendShortMsg(0x94, cueByte, ON);
        midi.sendShortMsg(0x95, cueByte, ON);

        // dim pads
        iterItems(PAD_MAPPINGS, function(deck, pads) {
            iterItems(pads, function(pad, modes) {
                midi.sendShortMsg(DECK_PAD_CHANNEL[deck] + 0x90, PAD_NUM_CONTROL_BYTE[pad], DIM);
            });
        });

        forEach([0x90, 0x91], function(deck) {
            // turn off LEDs for sync/play/cue
            forEach([0x00, 0x01, 0x02], function(control) {
                midi.sendShortMsg(deck, control, OFF);
            });

            // dim LEDs for scratch buttons
            midi.sendShortMsg(deck, 0x07, DIM);
        });

        // untoggle (dim) PFL switches
        forEach([0x80, 0x81], function(deck) {
            midi.sendShortMsg(deck, PFL_CONTROL, OFF);
        });

        this.killLights();
    };
    
    this.handleGlobalShift = function(channel, control, value, status, group) {
        NumarkPartyMix.isPadModeHeld = (status === 0x9F);
        // print("MODO CAPA 2: " + NumarkPartyMix.isPadModeHeld); // Opcional para debug

        // Refrescar visualmente los dos Decks
        NumarkPartyMix.setPadMode(null, null, 1, 0x94, '[Channel1]');
        NumarkPartyMix.setPadMode(null, null, 1, 0x95, '[Channel2]');
    };



    // Función auxiliar para refrescar la vista actual
    this.refreshLayout = function(deck) {
        var deckKey = 'DECK' + deck;
        var mode = deckPadMode[deckKey];
        var status = (deck === 1) ? 0x94 : 0x95;
        // Re-ejecutamos la lógica de setPadMode para este deck
        NumarkPartyMix.setPadMode(null, null, 1, status, '[Channel' + deck + ']');
    };
    
    this.handleStandardCue = function(channel, control, value, status, group) {
        var deck = (status === 0x91 || status === 0x81) ? 2 : 1;
        var isPlaying = engine.getValue(group, "play");

        if (value > 0) {
            hotcuesDownCount[deck]++;
            
            // 1. Si hay freno activo, lo matamos
            if (isManualBraking[deck]) {
                engine.brake(deck, false);
                engine.setValue(group, "play", 0);
                isManualBraking[deck] = false;
            }

            // 2. CASO BACKSPIN (Inercia)
            if (isInertiaMode[deck]) {
                // SOLO saltamos al Cue. NO tocamos la inercia ni el scratch.
                // El backspin seguirá sonando desde el punto de Cue hasta que 
                // el plato se detenga físicamente (la lógica de wheelTurn se encargará).
                engine.setValue(group, "cue_gotoandstop", 1);
                return; 
            }

            // 3. Lógica Normal
            if (isPlaying) {
                // Si está sonando, saltar y parar
                engine.setValue(group, "cue_gotoandstop", 1);
            } 
            else {
                // Si está pausado:
                // Redefinimos solo si tengo la mano en el plato (Scratch On manual)
                if (isDeckTouched[deck]) {
                    engine.setValue(group, "cue_set", 1);
                } 
                // Si no tengo la mano, comportamiento estándar (pre-escucha)
                else {
                    engine.setValue(group, "cue_default", 1);
                }
            }
        } else {
            hotcuesDownCount[deck]--;
            engine.setValue(group, "cue_default", 0);
        }
        
        if (hotcuesDownCount[deck] < 0) hotcuesDownCount[deck] = 0;
    };
 
    // 3. Función Play con Brake (Mejorada para Deck 2)
   this.handlePlayWithBrake = function(channel, control, value, status, group) {
        if (value === 0) return; 

        var deck = (status === 0x91) ? 2 : 1; 
        var isPlaying = engine.getValue(group, "play");
        var activeButtons = hotcuesDownCount[deck];

        // 1. Prioridad: Si hay Hotcues/Cues apretados, cancelar freno y dar play
        if (activeButtons > 0) {
            engine.brake(deck, false);
            isManualBraking[deck] = false;
            engine.setValue(group, "play", 0); 
            engine.setValue(group, "play", 1); 
            return;
        }

        // 2. Si hay un BACKSPIN (Inercia) corriendo:
        // Solo cambiamos el estado lógico de Play/Pausa. No tocamos el scratch.
        if (isInertiaMode[deck]) {
            engine.setValue(group, "play", isPlaying ? 0 : 1);
            return;
        }

        // 3. Si el freno (Vinyl Brake) estaba actuando y apretamos Play:
        // Cancelamos el freno y volvemos a velocidad normal.
        if (isManualBraking[deck]) {
            engine.brake(deck, false);
            isManualBraking[deck] = false;
            engine.setValue(group, "play", 1);
            return;
        }

        // 4. Lógica de inicio/parada normal:
        if (isPlaying === 0) {
            isManualBraking[deck] = false;
            engine.setValue(group, "play", 1);
        } 
        else {
            // Si apretamos Play para PARAR:
            // Si tenemos la mano puesta -> Pausa instantánea (freno físico)
            if (isDeckTouched[deck]) {
                engine.setValue(group, "play", 0);
            } 
            // Si NO tenemos la mano puesta -> Activamos el efecto de Vinyl Brake
            else {
                isManualBraking[deck] = true;
                engine.brake(deck, true, 100);
            }
        }
    };

    this.onTrackLoaded = function(value, group, control) {
        if (value === 1) {
            var deckNum = script.deckFromGroup(group);

            // Limpieza absoluta de estados al entrar un nuevo track (o clonar)
            isManualBraking[deckNum] = false; 
            hotcuesDownCount[deckNum] = 0;
            isInertiaMode[deckNum] = false;

            // 1. Reset de Audio
            for (var i = 1; i <= 2; i++) {
                var eff = '[EffectRack1_EffectUnit' + deckNum + '_Effect' + i + ']';
                engine.setValue(eff, 'enabled', 0);
                engine.setValue(eff, 'meta', 0.5);
            }
            engine.setValue(group, 'beatloop_size', 4);

            // 2. FORZAR MODO CUE en la variable interna
            deckPadMode['DECK' + deckNum] = 'CUE'; 

            // 3. Actualizar el controlador y los LEDs
            NumarkPartyMix.setPadMode(null, null, 1, (deckNum === 1 ? 0x94 : 0x95), group);
        }
    };

    this.repaintPads = function(deck) {
        var deckKey = 'DECK' + deck;
        var mode = deckPadMode[deckKey];
        var status = (deck === 1) ? 0x94 : 0x95;
        var group = '[Channel' + deck + ']';

        // Definimos qué valor MIDI enviar a cada uno de los 4 pads físicos (0x14 a 0x17)
        for (var i = 0; i < 4; i++) {
            var physicalPad = 0x14 + i;
            var logicPadNum = i + 1;
            var midiVal = 0x00; // Por defecto apagado

            if (mode === 'CUE') {
                // Modo Hotcue: Pad 1-4
                midiVal = engine.getValue(group, 'hotcue_' + logicPadNum + '_enabled') ? 0x7F : 0x00;
            } 
            else if (mode === 'LOOP') {
                if (logicPadNum === 1) {
                    // Si el loop está habilitado, usa el valor del "latido" (flashVal)
                    // Si no, apaga el LED (0x00)
                    midiVal = engine.getValue(group, 'loop_enabled') ? flashVal : 0x00;
                } else {
                    midiVal = 0x01; // Otros botones de loop en DIM
                }
            }
            else if (mode === 'SAMPLER') {
                var sGroup = '[Sampler' + logicPadNum + ']';
                if (engine.getValue(sGroup, 'play')) midiVal = 0x7F;
                else if (engine.getValue(sGroup, 'track_loaded')) midiVal = 0x01;
            } 
            else if (mode === 'EFFECT') {
                if (NumarkPartyMix.isPadModeHeld) {
                    // Capa Shift (Pads 5-8 lógicos)
                    if (logicPadNum === 1) midiVal = engine.getValue(group, 'quantize') ? 0x7F : 0x00;
                    if (logicPadNum === 2) midiVal = 0x01; // Tempo range siempre DIM
                    if (logicPadNum === 3) midiVal = isScratchEnabled[deck] ? 0x7F : 0x00;
                    //if (logicPadNum === 4) midiVal = engine.getValue(group, 'keylock') ? 0x7F : 0x00;
                    if (logicPadNum === 4) midiVal = 0x01; //always dim
                } else {
                    // Capa Normal (Pads 1-4 lógicos)
                    if (logicPadNum <= 2) {
                        var eff = '[EffectRack1_EffectUnit' + deck + '_Effect' + logicPadNum + ']';
                        midiVal = engine.getValue(eff, 'enabled') ? 0x7F : 0x00;
                    } else {
                        midiVal = 0x01; // Meta Knobs en DIM
                    }
                }
            }
            // Enviar el estado absoluto al controlador
            midi.sendShortMsg(status, physicalPad, midiVal);
        }
    };


    this.setPartyLights = function(r, g, b) {
        var status = 0xBF; // Canal 16
        var mapping = { 0x40: r, 0x41: g, 0x43: b };

        for (var cc in mapping) {
            var val = Math.floor(Math.min(127, Math.max(0, mapping[cc])));
            if (lastLightValues[cc] !== val) {
                midi.sendShortMsg(status, parseInt(cc), val);
                lastLightValues[cc] = val;
            }
        }
    };

    // Función para apagar todo y resetear caché
    this.killLights = function() {
        this.setPartyLights(0, 0, 0);
    };

    this.getBeatPos = function(deck) {
        var group = '[Channel' + deck + ']';
        var pos = engine.getValue(group, 'beat_distance');
        
        // Si la canción está pausada, beat_distance no se mueve. 
        // Para probar efectos, asegúrate de que la canción esté en PLAY.
        return (pos !== undefined && pos !== null) ? pos : 0;
    };

    this.onLightTick = function() {
        // Detectar deck activo (el que tiene el fader arriba y está en play)
        var masterDeck = 1;
        if (engine.getValue('[Channel2]', 'play') && engine.getValue('[Channel2]', 'volume') > 0.1) {
            masterDeck = 2;
        } else if (engine.getValue('[Channel1]', 'play')) {
            masterDeck = 1;
        }

        var effect = LightPatterns[currentLightPattern];
        if (effect && effect.onTick) {
            effect.onTick(masterDeck);
        }
    };

    this.onLightBeat = function(value, group, control) {
    // Detectamos el deck desde el grupo ([Channel1] o [Channel2])
    var deck = script.deckFromGroup(group); 
    
    // Buscamos el efecto actual
    var effect = LightPatterns[currentLightPattern];
    
    // Si el efecto tiene la función onBeat, se la ejecutamos pasándole el valor (1 o 0)
    if (effect && effect.onBeat) {
        effect.onBeat(deck, value);
    }
};
};

NumarkPartyMix = new NumarkPartyMix();
 