/* Efeitos sonoros sintetizados com Web Audio — sem arquivos de áudio. */
(function (root) {
  "use strict";

  var ctx = null;
  var enabled = true;
  try { enabled = localStorage.getItem("geoaventura:som") !== "off"; } catch (e) { /* sem storage */ }

  function ac() {
    if (!enabled) return null;
    if (!ctx) {
      var C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, o) {
    o = o || {};
    var c = ac();
    if (!c) return;
    var t = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noise(dur, o) {
    o = o || {};
    var c = ac();
    if (!c) return;
    var t = c.currentTime + (o.delay || 0);
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = o.freq || 1800;
    var g = c.createGain();
    g.gain.value = o.vol || 0.12;
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t);
  }

  function notes(seq, type, vol, step) {
    seq.forEach(function (f, i) { tone(f, step * 1.6, { type: type, vol: vol, delay: i * step }); });
  }

  root.Sfx = {
    isEnabled: function () { return enabled; },
    setEnabled: function (v) {
      enabled = v;
      try { localStorage.setItem("geoaventura:som", v ? "on" : "off"); } catch (e) { /* ok */ }
    },
    click: function () { tone(700, 0.05, { type: "triangle", vol: 0.07 }); },
    roll: function () {
      for (var i = 0; i < 7; i++) noise(0.05, { delay: i * 0.09, freq: 2200 + Math.random() * 1500, vol: 0.18 });
    },
    land: function () { tone(220, 0.12, { type: "triangle", vol: 0.2 }); },
    step: function (i) { tone(520 + (i % 4) * 60, 0.08, { type: "triangle", vol: 0.1 }); },
    correct: function () { notes([523, 659, 784, 1047], "triangle", 0.14, 0.08); },
    wrong: function () {
      tone(300, 0.18, { type: "sawtooth", vol: 0.08 });
      tone(200, 0.3, { type: "sawtooth", vol: 0.08, delay: 0.16 });
    },
    bonus: function () { notes([880, 1175, 1568], "sine", 0.1, 0.06); },
    onus: function () { tone(160, 0.35, { type: "square", vol: 0.07, slide: 90 }); },
    card: function () { noise(0.25, { freq: 900, vol: 0.1 }); },
    tick: function () { tone(1200, 0.04, { type: "square", vol: 0.04 }); },
    jump: function () { tone(300, 0.45, { type: "sine", vol: 0.14, slide: 1200 }); },
    fall: function () { tone(900, 0.5, { type: "sine", vol: 0.14, slide: 180 }); },
    shield: function () { notes([660, 990], "triangle", 0.1, 0.07); },
    win: function () {
      notes([523, 523, 523, 659, 784, 659, 784, 1047], "triangle", 0.15, 0.13);
      notes([262, 330, 392, 523], "sine", 0.08, 0.26);
    }
  };
})(window);
