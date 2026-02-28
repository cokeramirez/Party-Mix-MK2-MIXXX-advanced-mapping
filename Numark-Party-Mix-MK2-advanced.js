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

    var RESOLUTION = 300;
    var RECORD_SPEED = 33 + (1 / 3);
    var ALPHA = 1.0 / 8;
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
    var currentVelocity = { 1: 0, 2: 0 };isScratchEnabled
    var isInertiaMode = { 1: false, 2: false };
    var inertiaTimer = { 1: 0, 2: 0 };

    var isDeckTouched = { 1: false, 2: false }; // Nueva variable para saber si la mano está en el plato


    var BACKSPIN_THRESHOLD = 40; // Velocidad mínima para activar el modo inercia, default 15
    var STOP_THRESHOLD = 50;    // Milisegundos sin movimiento para considerar que el plato paró


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

    var flashSet = {};
    var flashCount = 0;

    var flashLoop = function() {
        flashVal = (flashVal === DIM) ? ON : DIM;
        iterItems(flashSet, function(key, controlBytes) {
            midi.sendShortMsg(controlBytes[0], controlBytes[1], flashVal);
        });
    };

    var makeFlash = function(statusByte, controlByte) {
        var key = [statusByte, controlByte];
        if (!(key in flashSet)) {
            flashSet[key] = key;
            flashCount += 1;

            if (!flashTimer) {
                flashTimer = engine.beginTimer(FLASH_DELAY, flashLoop, false);
            }
        }
    };

    var stopFlash = function(statusByte, controlByte) {
        var key = [statusByte, controlByte];
        var val = flashSet[key];
        if (val !== undefined) {
            delete flashSet[key];
            flashCount -= 1;

            if (!flashCount && flashTimer) {
                engine.stopTimer(flashTimer);
                flashTimer = 0;
            }
        }
    };
    //end flash timer

    var deckPadMode = { 'DECK1': 'CUE', 'DECK2': 'CUE' }; // Forzamos CUE desde el segundo 0

    var padCallbackMappings = {};

    var syncPadLedCallbackHelper = function(group, control, valueByte) {
        var deckNum = (group.indexOf('Channel2') !== -1 || group.indexOf('Unit2') !== -1) ? 2 : 1;
        var deckKey = 'DECK' + deckNum;
        var currentMode = deckPadMode[deckKey];

        iterItems(PAD_MAPPINGS[deckKey], function(padName, modes) {
            var modeDef = modes[currentMode];
            if (modeDef && modeDef.bindingControl === control && modeDef.group === group) {
                var statusByte = (deckNum === 1) ? 0x94 : 0x95;
                var logicControlByte = PAD_NUM_CONTROL_BYTE[padName];
                
                // TRADUCCIÓN: Convertimos nota lógica (0x1C-0x1F) a nota física (0x14-0x17)
                var physicalControlByte = logicControlByte;
                if (logicControlByte >= 0x1C) {
                    physicalControlByte = logicControlByte - 8; // 0x1C -> 0x14, etc.
                }

                if (currentMode === 'EFFECT') {
                    var isLayer2 = (logicControlByte >= 0x1C);
                    if (NumarkPartyMix.isPadModeHeld && !isLayer2) return;
                    if (!NumarkPartyMix.isPadModeHeld && isLayer2) return;
                }

                if (valueByte === 0) {
                    engine.beginTimer(25, function() {
                        midi.sendShortMsg(statusByte, physicalControlByte, OFF);
                    }, true);
                } else {
                    midi.sendShortMsg(statusByte, physicalControlByte, valueByte);
                }
            }
        });
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
            PAD8: { CUE: new padDefCueClear(1, 4), LOOP: new padDefBeatjump(1, 4),  SAMPLER: new padDefSamplerPanic(),   EFFECT: new padDefConfigToggle('[Channel1]', 'keylock') }
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
            PAD8: { CUE: new padDefCueClear(2, 4), LOOP: new padDefBeatjump(2, 4),  SAMPLER: new padDefSamplerPanic(),   EFFECT: new padDefConfigToggle('[Channel2]', 'keylock') }
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
            
            // ACTIVAR LA UNIDAD MAESTRA
            engine.setValue(unitGroup, 'enabled', 1);
            
            // Resetear Efectos 1 y 2 (Sintaxis corregida: [EffectRack1_EffectUnitN_EffectM])
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

        // 3. Encender las 3 luces a la vez para probar
        midi.sendShortMsg(0x9F, 12, 127); // Rojo
        midi.sendShortMsg(0x9F, 13, 127); // Verde
        midi.sendShortMsg(0x9F, 14, 127); // Azul

        engine.connectControl('[Channel1]', 'track_loaded', 'NumarkPartyMix.onTrackLoaded');
        engine.connectControl('[Channel2]', 'track_loaded', 'NumarkPartyMix.onTrackLoaded');

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
        if (value === 0) return; 

        var deckNum = (status === 0x94 || channel === 4 || group === '[Channel1]') ? 1 : 2;
        var deckKey = 'DECK' + deckNum;
        var modeName = (control === null) ? deckPadMode[deckKey] : PAD_MODE_CONTROL_BYTE[control];

        if (modeName) {
            deckPadMode[deckKey] = modeName;
            var st = (deckNum === 1) ? 0x94 : 0x95;

            // 1. Limpieza de los 4 LEDs físicos (0x14 a 0x17)
            for (var p = 0x14; p <= 0x17; p++) {
                midi.sendShortMsg(st, p, 0x00);
            }

            if (modeName === 'EFFECT') {
                if (NumarkPartyMix.isPadModeHeld) {
                    // --- CAPA 2 (Refresco en direcciones físicas) ---
                    var chGroup = '[Channel' + deckNum + ']';
                    
                    // Pad 5 lógico (Quantize) -> LED Pad 1 físico (0x14)
                    var qu = engine.getValue(chGroup, 'quantize');
                    midi.sendShortMsg(st, 0x14, qu ? ON : OFF);
                    
                    // Pad 6 lógico (Tempo) -> LED Pad 2 físico (0x15)
                    midi.sendShortMsg(st, 0x15, DIM);

                    // --- NUEVO: Pad 7 (Scratch Toggle) -> LED físico 0x16 ---
                    var sc = isScratchEnabled[deckNum];
                    midi.sendShortMsg(st, 0x16, sc ? ON : OFF);
                    
                    // Pad 8 lógico (Keylock) -> LED Pad 4 físico (0x17)
                    var kl = engine.getValue(chGroup, 'keylock');
                    midi.sendShortMsg(st, 0x17, kl ? ON : OFF);
                } else {
                    // --- CAPA 1 (Refresco en direcciones físicas) ---
                    engine.trigger('[EffectRack1_EffectUnit' + deckNum + '_Effect1]', 'enabled');
                    engine.trigger('[EffectRack1_EffectUnit' + deckNum + '_Effect2]', 'enabled');
                    midi.sendShortMsg(st, 0x16, DIM);
                    midi.sendShortMsg(st, 0x17, DIM);
                }
            } else {
                // Otros modos (Refresco normal en direcciones físicas)
                iterItems(padCallbackMappings, function(key, mappings) {
                    forEach(mappings, function(m) {
                        if (m.deck === deckKey && m.modeName === modeName) {
                            var parts = key.split(',');
                            if (parts[0] !== 'SELF') engine.trigger(parts[0], parts[1]);
                        }
                    });
                });
            }
        }
    };





    this.handlePad = function(channel, control, value, status, group) {
        var deckStr = (status === 0x94 || status === 0x84 || channel === 4) ? 'DECK1' : 'DECK2';
        var modeName = deckPadMode[deckStr];
        var padNum = PAD_NUM_CONTROL_BYTE[control];

        if (!deckStr || !modeName || !padNum) return;

        var padDefinition = PAD_MAPPINGS[deckStr][padNum][modeName];
        if (!padDefinition) return;

        // Ejecutar acción de Mixxx
        padDefinition.handle(value ? 1 : 0);

        // LÓGICA DE FEEDBACK VISUAL (Note Off)
        if (value === 0) {
            // Al soltar el pad, esperamos 25ms para que el comando DIM del hardware pase,
            // y luego forzamos el estado real que dicta el software.
            engine.beginTimer(25, function() {
                if (padDefinition.group && padDefinition.bindingControl) {
                    // Si el pad está vinculado a Mixxx (FX, Cue, Quantize), pedimos refresco
                    engine.trigger(padDefinition.group, padDefinition.bindingControl);
                } else {
                    // Si es un pad sin estado en Mixxx (Param +/-), lo forzamos a DIM manual
                    var st = (deckStr === 'DECK1') ? 0x94 : 0x95;
                    midi.sendShortMsg(st, control, DIM);
                }
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

            // Si tocamos el plato mientras el freno está actuando
            if (isManualBraking[deckNum]) {
                engine.brake(deckNum, false);      // 1. Matamos el efecto de freno
                engine.setValue(group, "play", 0); // 2. Forzamos la PAUSA lógica en Mixxx
                isManualBraking[deckNum] = false;  // 3. Limpiamos nuestra variable
            }

            // Ahora activamos el scratch (esto es lo que "amarrará" el track a tu mano)
            if (isInertiaMode[deckNum]) {
                if (inertiaTimer[deckNum]) {
                    engine.stopTimer(inertiaTimer[deckNum]);
                    inertiaTimer[deckNum] = 0;
                }
                isInertiaMode[deckNum] = false;
                // No llamamos a scratchEnable aquí porque ya venía de inercia (ya estaba activo)
            } else {
                if (!engine.isScratching(deckNum)) {
                    engine.scratchEnable(deckNum, RESOLUTION, RECORD_SPEED, ALPHA, BETA, RAMP_DOWN);
                    midi.sendShortMsg(status, control, ON);
                }
            }
        };

        var onReleaseCallback = function() {
            isDeckTouched[deckNum] = false; // <--- LA MANO SE HA QUITADO

            if (currentVelocity[deckNum] > BACKSPIN_THRESHOLD) {
                isInertiaMode[deckNum] = true;
                if (inertiaTimer[deckNum]) engine.stopTimer(inertiaTimer[deckNum]);
                inertiaTimer[deckNum] = engine.beginTimer(STOP_THRESHOLD, function() {
                    stopScratching();
                }, true);
            } else {
                stopScratching();
            }
        };

        longPressHelper(status, control, SCRATCH_LONGPRESS_DELAY, onDownCallback, null, null, onReleaseCallback);
    }; 

    this.wheelTurn = function(channel, control, value, status, group) {
        var deckNum = script.deckFromGroup(group);
        var newValue = (value < 64) ? value : value - 128;
        
        // --- CALCULO DE VELOCIDAD ---
        var now = Date.now();
        var deltaTime = now - lastMovementTime[deckNum];
        if (deltaTime > 0) {
            // Velocidad: pasos por milisegundo (usamos valor absoluto)
            currentVelocity[deckNum] = Math.abs(newValue) / deltaTime * 100; 
        }
        lastMovementTime[deckNum] = now;
        // ----------------------------

        if (engine.isScratching(deckNum)) {
            engine.scratchTick(deckNum, newValue);
            
            // Si estamos en modo inercia, cada movimiento refresca el temporizador de seguridad
            if (isInertiaMode[deckNum]) {
                if (inertiaTimer[deckNum]) {
                    engine.stopTimer(inertiaTimer[deckNum]);
                }
                inertiaTimer[deckNum] = engine.beginTimer(STOP_THRESHOLD, function() {
                    // Si el plato deja de mandar señales de giro por X tiempo, cerramos el scratch
                    if (engine.isScratching(deckNum)) {
                        engine.scratchDisable(deckNum, RAMP_UP);
                        // Buscamos el control de scratch para atenuar el LED (0x06)
                        midi.sendShortMsg(0x80 + (deckNum-1), 0x06, DIM); 
                    }
                    isInertiaMode[deckNum] = false;
                }, true);
            }
        } else {
            engine.setValue(group, 'jog', newValue);
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
        
        if (value > 0) {
            hotcuesDownCount[deck]++;
            
            // Si hay freno activo, lo matamos para que el salto al CUE sea instantáneo
            if (isManualBraking[deck]) {
                engine.brake(deck, false);
                engine.setValue(group, "play", 0);
                isManualBraking[deck] = false;
            }

            // Si hay un backspin (inercia), lo matamos para saltar al CUE y quedar parados
            if (isInertiaMode[deck]) {
                if (inertiaTimer[deck]) engine.stopTimer(inertiaTimer[deck]);
                engine.scratchDisable(deck, RAMP_UP); // Detiene el movimiento virtual
                isInertiaMode[deck] = false;
                midi.sendShortMsg(0x80 + (deck-1), 0x06, DIM); // Apaga luz de scratch
            }
        } else {
            hotcuesDownCount[deck]--;
        }
        
        if (hotcuesDownCount[deck] < 0) hotcuesDownCount[deck] = 0;
        engine.setValue(group, "cue_default", value ? 1 : 0);
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
        // Solo actuamos cuando el valor es 1 (track cargado)
        if (value === 1) {
            var deckNum = script.deckFromGroup(group);

            // 1. Resetear Efectos 1 y 2 de la unidad correspondiente al deck
            for (var i = 1; i <= 2; i++) {
                // Construcción correcta del string: [EffectRack1_EffectUnit1_Effect1]
                var effectGroup = '[EffectRack1_EffectUnit' + deckNum + '_Effect' + i + ']';
                engine.setValue(effectGroup, 'enabled', 0);
                engine.setValue(effectGroup, 'meta', 0.5);
            }

            // 2. Resetear tamaño de Loop a 4 beats
            engine.setValue(group, 'beatloop_size', 4);
            
            // OPCIONAL: Forzar refresco de LEDs de efectos si estuvieras en ese modo
            // engine.trigger('[EffectRack1_EffectUnit' + deckNum + '_Effect1]', 'enabled');
        }
    };

};

NumarkPartyMix = new NumarkPartyMix();
