/* Interface e fluxo de turnos do GeoAventura. */
(function () {
  "use strict";

  var E = window.GeoEngine;
  var DATA = window.GEO_DATA;
  var BOARD = E.buildBoard();
  var SAVE_KEY = "geoaventura:partida:v1";

  var COLORS = ["#e5484d", "#2f7cf6", "#1fa45a", "#f0a20b"];
  var AVATARS = ["✈️", "🚢", "🎒", "🧭", "🐪", "🚂", "🎈", "🐧", "🦜", "🏄"];
  var PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

  var rnd = Math.random;
  var state = null;
  var setup = { n: 4, players: [{ avatar: "✈️" }, { avatar: "🚢" }, { avatar: "🎒" }, { avatar: "🧭" }] };
  var rollEnabled = false;
  var turboArmed = false;
  var keyHandler = null;
  var hint = "";
  var lastDice = [1];

  // ---------- utilitários ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function h(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cur() { return state.players[state.current]; }
  function chip(p) { return '<span class="pchip" style="--pc:' + p.color + '">' + p.avatar + " " + esc(p.name) + "</span>"; }
  function stars(d) { return '<span class="stars" title="Dificuldade ' + d + ' de 3">' + "★".repeat(d) + "<i>" + "★".repeat(3 - d) + "</i></span>"; }
  function toOptions(arr) { return E.shuffle(arr.map(function (t, i) { return { label: t, ok: i === 0 }; }), rnd); }
  function answerInfo(r, answer, info) {
    if (r.correct) return info;
    return (r.timeout ? "Tempo esgotado! " : "") + "Resposta certa: " + answer + ". " + (info || "");
  }

  function show(id) {
    $$(".screen").forEach(function (s) { s.classList.toggle("active", s.id === id); });
    window.scrollTo(0, 0);
  }

  // ---------- persistência ----------
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* sem storage */ } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ok */ } }
  function loadSave() {
    try {
      return sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch (e) { return null; }
  }

  /* O salvamento vem do localStorage e pode ter sido editado à mão: reconstrói o estado
   * só com campos conhecidos e valores válidos (avatar e cor entram em HTML/CSS sem escape).
   * Retorna null se algo essencial não bater. */
  function sanitizeSave(s) {
    if (!s || s.v !== 1 || s.winner != null || !Array.isArray(s.players)) return null;
    if (s.players.length < 2 || s.players.length > 4) return null;
    function int(v, min, max) {
      if (typeof v !== "number" || !isFinite(v)) throw new Error("número inválido");
      return Math.max(min, Math.min(max, Math.round(v)));
    }
    var HEX = /^#[0-9a-f]{6}$/i;
    try {
      var players = s.players.map(function (p, i) {
        if (!p || AVATARS.indexOf(p.avatar) < 0 || !HEX.test(p.color) || typeof p.name !== "string") throw new Error("jogador inválido");
        var items = p.items || {}, stats = p.stats || {};
        return {
          id: i, name: p.name.trim().slice(0, 16) || "Jogador " + (i + 1), color: p.color, avatar: p.avatar,
          pos: int(p.pos, 0, E.LAST), points: int(p.points, 0, 1e6), skip: int(p.skip, 0, 5),
          items: { bussola: int(items.bussola, 0, E.MAX_ITEM), escudo: int(items.escudo, 0, E.MAX_ITEM), turbo: int(items.turbo, 0, E.MAX_ITEM) },
          stats: { acertos: int(stats.acertos, 0, 1e4), erros: int(stats.erros, 0, 1e4) }
        };
      });
      var used = {};
      ["quiz", "enigma", "ordenar", "vf", "flag", "sorte", "reves"].forEach(function (k) {
        var arr = s.used && s.used[k];
        used[k] = Array.isArray(arr) ? arr.filter(function (n) { return Number.isInteger(n) && n >= 0 && n < 1000; }) : [];
      });
      var logs = Array.isArray(s.log) ? s.log.slice(0, 40).filter(function (e) {
        return e && typeof e.t === "string" && typeof e.n === "string" && HEX.test(e.c) && (e.a === "🌎" || AVATARS.indexOf(e.a) >= 0);
      }).map(function (e) { return { a: e.a, c: e.c, n: e.n.slice(0, 16), t: e.t.slice(0, 200) }; }) : [];
      var settings = s.settings || {};
      return {
        v: 1, players: players,
        current: int(s.current, 0, players.length - 1), round: int(s.round, 1, 1e4),
        settings: {
          time: [0, 20, 30, 45].indexOf(settings.time) >= 0 ? settings.time : 30,
          level: ["misto", "facil", "dificil"].indexOf(settings.level) >= 0 ? settings.level : "misto"
        },
        used: used, extraTurn: s.extraTurn === true, winner: null,
        lastActivity: ["ordenar", "vf", "bandeira"].indexOf(s.lastActivity) >= 0 ? s.lastActivity : null,
        log: logs
      };
    } catch (e) {
      return null;
    }
  }

  // ---------- tela inicial ----------
  function renderSetup() {
    $$("#count-picker button").forEach(function (b) {
      var on = +b.dataset.n === setup.n;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    var box = $("#player-forms");
    box.innerHTML = "";
    for (var i = 0; i < setup.n; i++) box.appendChild(playerForm(i));
    var saved = loadSave();
    $("#btn-resume").hidden = !saved;
    if (saved) $("#btn-resume").textContent = "↩️ Continuar partida (rodada " + saved.round + ")";
  }

  function playerForm(i) {
    var p = setup.players[i];
    var el = h(
      '<div class="pform" style="--pc:' + COLORS[i] + '">' +
        '<div class="pform-head"><span class="pform-token">' + p.avatar + "</span>" +
        '<input type="text" maxlength="16" placeholder="Jogador ' + (i + 1) + '" value="' + esc(p.name || "") +
        '" aria-label="Nome do jogador ' + (i + 1) + '"></div>' +
        '<div class="avatars">' + AVATARS.map(function (a) {
          return '<button type="button" class="av' + (a === p.avatar ? " on" : "") + '" data-av="' + a + '" aria-label="Avatar ' + a + '">' + a + "</button>";
        }).join("") + "</div></div>"
    );
    $("input", el).addEventListener("input", function (e) { p.name = e.target.value; });
    $$(".av", el).forEach(function (b) {
      b.addEventListener("click", function () {
        p.avatar = b.dataset.av;
        Sfx.click();
        $(".pform-token", el).textContent = p.avatar;
        $$(".av", el).forEach(function (x) { x.classList.toggle("on", x === b); });
      });
    });
    return el;
  }

  function startGame(players, settings) {
    state = E.createGame(players, settings);
    state.log = [];
    lastDice = [1];
    show("screen-game");
    renderBoard();
    log(null, "A viagem começou! " + state.players.length + " viajantes partem de Brasília.");
    startTurn();
  }

  function resumeGame(saved) {
    state = saved;
    lastDice = [1];
    show("screen-game");
    renderBoard();
    toast("Partida retomada na rodada " + state.round + ".");
    startTurn();
  }

  // ---------- tabuleiro ----------
  function spacePos(i) {
    var row = Math.floor(i / 10);
    var col = i % 10;
    if (row % 2) col = 9 - col;
    return { x: 58 + col * (884 / 9), y: 64 + row * 118 };
  }
  function pct(p) { return "left:" + (p.x / 10) + "%;top:" + (p.y / 6) + "%"; }

  function renderBoard() {
    var svg = '<svg class="board-svg" viewBox="0 0 1000 600" aria-hidden="true"><defs>' +
      '<marker id="arw-ok" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1f9d5c"/></marker>' +
      '<marker id="arw-bad" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#d63c3c"/></marker>' +
      "</defs>";
    for (var gx = 50; gx < 1000; gx += 100) svg += '<line class="grid" x1="' + gx + '" y1="0" x2="' + gx + '" y2="600"/>';
    for (var gy = 50; gy < 600; gy += 100) svg += '<line class="grid" x1="0" y1="' + gy + '" x2="1000" y2="' + gy + '"/>';

    var d = "";
    for (var i = 0; i < E.LAST; i++) {
      var a = spacePos(i), b = spacePos(i + 1);
      svg += '<line class="trail" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + E.REGIONS[BOARD[i].region].color + '"/>';
      d += (i ? " L " : "M ") + a.x + " " + a.y;
    }
    var end = spacePos(E.LAST);
    svg += '<path class="trail-dash" d="' + d + " L " + end.x + " " + end.y + '"/>';

    BOARD.forEach(function (s) {
      if (s.to == null) return;
      var a = spacePos(s.i), b = spacePos(s.to);
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      var bend = 0.28 * len + 30;
      var cx = (a.x + b.x) / 2 - dy / len * bend, cy = (a.y + b.y) / 2 + dx / len * bend;
      if (cy > a.y && cy > b.y) { cx = (a.x + b.x) / 2 + dy / len * bend; cy = (a.y + b.y) / 2 - dx / len * bend; }
      var k1 = 44 / Math.hypot(cx - a.x, cy - a.y), k2 = 50 / Math.hypot(cx - b.x, cy - b.y);
      var sx = a.x + (cx - a.x) * k1, sy = a.y + (cy - a.y) * k1;
      var ex = b.x + (cx - b.x) * k2, ey = b.y + (cy - b.y) * k2;
      var ok = s.type === "atalho";
      svg += '<path class="jump ' + (ok ? "ok" : "bad") + '" d="M ' + sx + " " + sy + " Q " + cx + " " + cy + " " + ex + " " + ey +
        '" marker-end="url(#' + (ok ? "arw-ok" : "arw-bad") + ')"/>';
    });
    svg += "</svg>";

    var html = svg;
    var seen = {};
    BOARD.forEach(function (s) {
      if (seen[s.region]) return;
      seen[s.region] = true;
      var p = spacePos(s.i);
      var r = E.REGIONS[s.region];
      html += '<div class="region-label" style="left:' + p.x / 10 + "%;top:" + (p.y - 51) / 6 + "%;--rc:" + r.color + '">' + r.name + "</div>";
    });
    BOARD.forEach(function (s) {
      var t = E.SPACE_TYPES[s.type];
      var title = "Casa " + s.i + " · " + (s.name ? s.name + " (" + (s.type === "atalho" ? "atalho" : "perigo") + " → " + s.to + ")" : t.name);
      html += '<div class="space t-' + s.type + '" data-i="' + s.i + '" style="' + pct(spacePos(s.i)) + ";--rc:" + E.REGIONS[s.region].color +
        '" title="' + esc(title) + '"><span class="s-icon">' + t.icon + '</span><span class="s-num">' + (s.type === "inicio" ? "START" : s.type === "final" ? "FIM" : s.i) + "</span></div>";
    });
    state.players.forEach(function (p) {
      html += '<div class="token" id="tok-' + p.id + '" style="--pc:' + p.color + '"><span>' + p.avatar + "</span></div>";
    });
    $("#board").innerHTML = html;

    $("#legend").innerHTML = ["quiz", "enigma", "atividade", "sorte", "duelo", "atalho", "perigo", "final"].map(function (k) {
      return '<span class="lg">' + E.SPACE_TYPES[k].icon + " " + E.SPACE_TYPES[k].name + "</span>";
    }).join("");
    placeTokens();
  }

  function placeTokens() {
    var groups = {};
    state.players.forEach(function (p) { (groups[p.pos] = groups[p.pos] || []).push(p); });
    var OFF = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    state.players.forEach(function (p) {
      var g = groups[p.pos], k = g.indexOf(p), pos = spacePos(p.pos);
      var dx = g.length > 1 ? OFF[k][0] * 15 : 0, dy = g.length > 1 ? OFF[k][1] * 15 : 0;
      var el = $("#tok-" + p.id);
      if (!el) return;
      el.style.left = (pos.x + dx) / 10 + "%";
      el.style.top = (pos.y + dy) / 6 + "%";
      el.classList.toggle("active", state.current === p.id && state.winner == null);
    });
  }

  function bump(p) {
    var el = $("#tok-" + p.id);
    if (!el) return;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  async function moveBy(p, n) {
    var target = E.clampPos(p.pos + n);
    var dir = target > p.pos ? 1 : -1, k = 0;
    while (p.pos !== target) {
      p.pos += dir;
      placeTokens();
      Sfx.step(k++);
      await sleep(dir > 0 ? 190 : 240);
    }
    Sfx.land();
    bump(p);
    renderPlayers();
  }

  async function flyTo(p, target) {
    var el = $("#tok-" + p.id);
    el.classList.add("flying");
    (target > p.pos ? Sfx.jump : Sfx.fall)();
    p.pos = target;
    placeTokens();
    await sleep(950);
    el.classList.remove("flying");
    bump(p);
    renderPlayers();
  }

  // ---------- painéis ----------
  function dieHTML(v) {
    var s = '<div class="die" data-v="' + v + '">';
    for (var i = 1; i <= 9; i++) s += "<i" + (PIPS[v].indexOf(i) >= 0 ? ' class="on"' : "") + "></i>";
    return s + "</div>";
  }

  function renderTurnPanel() {
    var p = cur();
    var tp = $("#turn-panel");
    tp.style.setProperty("--pc", p.color);
    var dice = turboArmed && lastDice.length < 2 ? [lastDice[0], lastDice[0]] : lastDice;
    tp.innerHTML =
      '<div class="tp-who"><span class="tp-avatar">' + p.avatar + "</span><div>" +
        '<div class="tp-label">Vez de</div><div class="tp-name">' + esc(p.name) + "</div></div>" +
        '<div class="dice-row" id="dice-row">' + dice.map(dieHTML).join("") + "</div></div>" +
      '<div class="tp-hint" id="tp-hint">' + esc(hint) + "</div>" +
      '<div class="tp-actions">' +
        '<button type="button" class="btn btn-primary btn-roll" id="btn-roll"' + (rollEnabled ? "" : " disabled") + ">🎲 Rolar dado</button>" +
        (p.items.turbo > 0 ? '<button type="button" class="btn btn-turbo' + (turboArmed ? " on" : "") + '" id="btn-turbo" aria-pressed="' + turboArmed +
          '"' + (rollEnabled ? "" : " disabled") + ' title="Jogar 2 dados nesta rodada">🚀 Turbo ×' + p.items.turbo + "</button>" : "") +
      "</div>";
    $("#btn-roll").onclick = doRoll;
    var bt = $("#btn-turbo");
    if (bt) bt.onclick = toggleTurbo;
  }

  function toggleTurbo() {
    if (!rollEnabled || cur().items.turbo < 1) return;
    turboArmed = !turboArmed;
    Sfx.click();
    lastDice = [lastDice[0]];
    renderTurnPanel();
  }

  function setHint(t) {
    hint = t;
    var el = $("#tp-hint");
    if (el) el.textContent = t;
  }

  function renderPlayers() {
    $("#players").innerHTML = state.players.map(function (p) {
      var items = Object.keys(E.ITEMS).map(function (k) {
        var it = E.ITEMS[k];
        return '<span class="item' + (p.items[k] ? "" : " zero") + '" title="' + it.name + ": " + it.desc + '">' + it.icon + "<b>" + p.items[k] + "</b></span>";
      }).join("");
      var lead = Math.max.apply(null, state.players.map(function (o) { return o.pos; }));
      return '<div class="pcard' + (p.id === state.current ? " active" : "") + '" style="--pc:' + p.color + '">' +
        '<div class="pc-top"><span class="pc-avatar">' + p.avatar + "</span>" +
          '<div class="pc-main"><div class="pc-name">' + esc(p.name) + (p.pos === lead && lead > 0 ? ' <span class="tag lead">🥇 líder</span>' : "") +
            (p.skip ? ' <span class="tag">⏸️ perde a vez</span>' : "") + "</div>" +
            '<div class="pc-meta">📍 Casa ' + p.pos + " · ✅ " + p.stats.acertos + " · ❌ " + p.stats.erros + "</div></div>" +
          '<div class="pc-pts"><b>' + p.points + "</b><small>pontos</small></div></div>" +
        '<div class="pc-bottom"><div class="progress"><div style="width:' + (p.pos / E.LAST * 100) + '%"></div></div>' +
          '<div class="items">' + items + "</div></div></div>";
    }).join("");
  }

  function log(p, text) {
    state.log.unshift({ a: p ? p.avatar : "🌎", c: p ? p.color : "#7656d6", n: p ? p.name : "", t: text });
    if (state.log.length > 40) state.log.length = 40;
    renderLog();
  }

  function renderLog() {
    $("#log").innerHTML = state.log.map(function (e) {
      return '<li style="--pc:' + e.c + '"><span class="log-av">' + e.a + "</span><span>" +
        (e.n ? "<b>" + esc(e.n) + "</b> " : "") + esc(e.t) + "</span></li>";
    }).join("");
  }

  function renderAll() {
    $("#round-chip").textContent = "Rodada " + state.round;
    $("#btn-sound").textContent = Sfx.isEnabled() ? "🔊" : "🔇";
    renderTurnPanel();
    renderPlayers();
    renderLog();
    placeTokens();
  }

  function toast(html, kind) {
    var el = h('<div class="toast ' + (kind || "") + '">' + html + "</div>");
    $("#toast-root").appendChild(el);
    setTimeout(function () { el.classList.add("out"); }, 2300);
    setTimeout(function () { el.remove(); }, 2800);
  }

  // ---------- modal + cronômetro ----------
  function openModal(o) {
    var t = E.SPACE_TYPES[o.type] || {};
    var reg = o.region ? E.REGIONS[o.region] : null;
    var regName = o.region === "mundo" ? "Geografia geral" : reg && reg.name;
    var ov = h(
      '<div class="overlay"><div class="modal' + (o.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-labelledby="m-title" style="--accent:' +
        (o.accent || (reg ? reg.color : "#7656d6")) + '">' +
        '<div class="m-head"><span class="m-badge">' + (o.icon || t.icon || "") + " " + esc(o.label || t.name || "") + "</span>" +
          (regName ? '<span class="m-region">' + regName + "</span>" : "") + (o.player ? chip(o.player) : "") + "</div>" +
        '<div class="m-timer" hidden><div class="m-timer-track"><div class="m-timer-bar"></div></div><span class="m-timer-num"></span></div>' +
        '<div class="m-body"></div><div class="m-foot"></div></div></div>'
    );
    $("#modal-root").appendChild(ov);
    var el = $(".modal", ov);
    var m = {
      el: el, body: $(".m-body", el), foot: $(".m-foot", el), timer: makeTimer(el),
      close: function () {
        m.timer.stop();
        keyHandler = null;
        ov.classList.add("out");
        return sleep(200).then(function () { ov.remove(); });
      }
    };
    return m;
  }

  function makeTimer(el) {
    var wrap = $(".m-timer", el), bar = $(".m-timer-bar", el), num = $(".m-timer-num", el);
    var id = null, total = 0, end = 0, lastS = -1;
    var t = {
      start: function (sec, onEnd) {
        t.stop();
        total = sec;
        if (!sec) { wrap.hidden = true; return; }
        wrap.hidden = false;
        end = Date.now() + sec * 1000;
        lastS = -1;
        var tick = function () {
          var left = Math.max(0, end - Date.now());
          bar.style.transform = "scaleX(" + left / (total * 1000) + ")";
          var s = Math.ceil(left / 1000);
          if (s !== lastS) {
            lastS = s;
            num.textContent = s + "s";
            wrap.classList.toggle("danger", s <= 5);
            if (s <= 5 && s > 0) Sfx.tick();
          }
          if (left <= 0) { t.stop(); onEnd(); }
        };
        tick();
        id = setInterval(tick, 100);
      },
      stop: function () { if (id) clearInterval(id); id = null; },
      frac: function () { return total ? Math.max(0, (end - Date.now()) / (total * 1000)) : 0.5; }
    };
    return t;
  }

  function questionHead(text, d, pre) {
    return (pre || "") + '<div class="q-meta">' + (d ? stars(d) : "") + '</div><h2 class="q-text" id="m-title">' + esc(text) + "</h2>";
  }

  /* Pergunta de múltipla escolha. o: { options, seconds, player, compass, onAnswer }.
   * Resolve com { correct, frac (tempo restante 0..1), timeout }. */
  function runChoice(m, o) {
    return new Promise(function (resolve) {
      var done = false;
      var grid = h('<div class="options"></div>');
      o.options.forEach(function (op, i) {
        op.el = h('<button type="button" class="opt"><span class="opt-key">' + "ABCD"[i] + '</span><span class="opt-text">' + esc(op.label) + "</span></button>");
        op.el.addEventListener("click", function () { answer(i); });
        grid.appendChild(op.el);
      });
      m.body.appendChild(grid);
      m.foot.innerHTML = "";
      if (o.compass && o.player.items.bussola > 0) {
        var cb = h('<button type="button" class="btn btn-ghost small">🧭 Usar Bússola (' + o.player.items.bussola + ")</button>");
        cb.onclick = function () {
          if (done) return;
          o.player.items.bussola--;
          Sfx.bonus();
          E.shuffle(o.options.filter(function (x) { return !x.ok && !x.el.disabled; }), rnd).slice(0, 2).forEach(function (x) {
            x.el.disabled = true;
            x.el.classList.add("eliminated");
          });
          cb.remove();
          renderPlayers();
        };
        m.foot.appendChild(cb);
      }
      keyHandler = function (e) {
        var k = e.key.toLowerCase();
        var idx = "abcd".indexOf(k);
        if (idx < 0) idx = "1234".indexOf(k);
        if (idx >= 0 && idx < o.options.length) { answer(idx); return true; }
        return false;
      };
      m.timer.start(o.seconds, function () { answer(-1); });

      function answer(i) {
        if (done || (i >= 0 && o.options[i].el.disabled)) return;
        done = true;
        var frac = m.timer.frac();
        m.timer.stop();
        keyHandler = null;
        if (o.onAnswer) o.onAnswer();
        var ok = i >= 0 && o.options[i].ok;
        o.options.forEach(function (op, k) {
          op.el.disabled = true;
          op.el.classList.add(op.ok ? "correct" : k === i ? "wrong" : "dim");
        });
        (ok ? Sfx.correct : Sfx.wrong)();
        m.foot.innerHTML = "";
        setTimeout(function () { resolve({ correct: ok, frac: frac, timeout: i < 0 }); }, 700);
      }
    });
  }

  /* Bloco de resultado com carta de bônus/ônus. Resolve quando o jogador clica em Continuar. */
  function showResult(m, o) {
    return new Promise(function (resolve) {
      var box = h('<div class="result ' + (o.tone || "neutral") + '"></div>');
      if (o.title) box.appendChild(h('<div class="verdict">' + o.title + "</div>"));
      if (o.info) box.appendChild(h('<p class="info">💡 ' + esc(o.info) + "</p>"));
      if (o.card) {
        var good = o.cardKind === "bonus";
        var c = h(
          '<div class="flip ' + o.cardKind + '"><div class="flip-inner">' +
            '<div class="flip-face flip-back"><span>' + (good ? "🎁" : "⚠️") + "</span>" + (good ? "BÔNUS" : "ÔNUS") + "</div>" +
            '<div class="flip-face flip-front"><div class="fc-icon">' + o.card.icon + '</div><div class="fc-text"><div class="fc-title">' + esc(o.card.t) +
              '</div><div class="fc-desc">' + esc(o.card.d) + "</div>" + (o.blocked ? '<div class="fc-blocked">🛡️ Bloqueado pelo Escudo!</div>' : "") + "</div></div>" +
          "</div></div>"
        );
        if (o.blocked) c.classList.add("blocked");
        box.appendChild(c);
        setTimeout(function () {
          c.classList.add("flipped");
          (o.blocked ? Sfx.shield : good ? Sfx.bonus : Sfx.onus)();
        }, 450);
      }
      (o.notes || []).forEach(function (n) { box.appendChild(h('<p class="note">' + esc(n) + "</p>")); });
      m.body.appendChild(box);
      m.foot.innerHTML = "";
      var btn = h('<button type="button" class="btn btn-primary" data-continue>Continuar ➜</button>');
      m.foot.appendChild(btn);
      setTimeout(function () {
        if (box.scrollIntoView) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
        btn.focus({ preventScroll: true });
      }, 120);
      var gone = false;
      function go() {
        if (gone) return;
        gone = true;
        keyHandler = null;
        Sfx.click();
        resolve();
      }
      btn.onclick = go;
      keyHandler = function (e) {
        if (e.key === "Enter" || e.key === " ") { go(); return true; }
        return false;
      };
    });
  }

  /* Acerto → pontos + carta de bônus. Erro → carta de ônus (o Escudo bloqueia). */
  async function settle(m, p, correct, pts, info, wrongTitle) {
    var card, blocked = false, fx = { move: 0, othersMove: 0, notes: [] };
    if (correct) {
      p.points += pts;
      p.stats.acertos++;
      card = E.weighted(E.BONUS, rnd);
      fx = E.applyEffect(state, p, card.e, rnd);
      log(p, "acertou (+" + pts + ") e ganhou: " + card.d.toLowerCase());
    } else {
      p.stats.erros++;
      card = E.weighted(E.ONUS, rnd);
      blocked = E.useShield(p);
      if (!blocked) fx = E.applyEffect(state, p, card.e, rnd);
      log(p, "errou — " + (blocked ? "o Escudo bloqueou o ônus 🛡️" : card.d.toLowerCase()));
    }
    renderPlayers();
    await showResult(m, {
      tone: correct ? "win" : "lose",
      title: correct ? "✅ Acertou! +" + pts + " pontos" : "❌ " + (wrongTitle || "Não foi dessa vez!"),
      info: info, card: card, cardKind: correct ? "bonus" : "onus", blocked: blocked, notes: fx.notes
    });
    await m.close();
    await applyMoves(p, fx);
  }

  async function applyMoves(p, fx) {
    if (fx.move) await moveBy(p, fx.move);
    if (fx.othersMove) {
      await Promise.all(state.players.filter(function (o) { return o !== p && o.pos > 0; }).map(function (o) { return moveBy(o, fx.othersMove); }));
    }
    renderAll();
  }

  // ---------- casas ----------
  function resolveSpace(p, sp) {
    switch (sp.type) {
      case "quiz": return doQuiz(p, sp);
      case "enigma": return doEnigma(p, sp);
      case "atividade": return doActivity(p, sp);
      case "sorte": return doLuck(p);
      case "duelo": return doDuel(p, sp);
      case "atalho":
      case "perigo": return doSpecial(p, sp);
      case "final": return doFinal(p);
      default: return Promise.resolve();
    }
  }

  async function doQuiz(p, sp) {
    var q = E.pickQuiz(state, DATA, sp.region, rnd);
    var m = openModal({ type: "quiz", region: q.r, player: p });
    m.body.innerHTML = questionHead(q.q, q.d);
    var r = await runChoice(m, { options: toOptions(q.o), seconds: state.settings.time, player: p, compass: true });
    await settle(m, p, r.correct, E.quizPoints(q.d, r.frac), answerInfo(r, q.o[0], q.i));
  }

  async function doEnigma(p, sp) {
    var e = E.pickEnigma(state, DATA, sp.region, rnd);
    var m = openModal({ type: "enigma", region: e.r, player: p });
    var shown = 1, locked = false;
    m.body.innerHTML = '<div class="q-meta">Quanto menos pistas, mais pontos</div><h2 class="q-text" id="m-title">Quem sou eu?</h2><ol class="clues"></ol>' +
      '<div class="enigma-bar"><span class="e-pts"></span><button type="button" class="btn btn-ghost small" id="btn-clue">🔓 Revelar próxima pista</button></div>';
    var btn = $("#btn-clue", m.body);
    function renderClues() {
      $(".clues", m.body).innerHTML = e.c.map(function (c, i) {
        return i < shown ? '<li class="clue"><b>Pista ' + (i + 1) + "</b><span>" + esc(c) + "</span></li>"
          : '<li class="clue locked"><b>Pista ' + (i + 1) + "</b><span>🔒 bloqueada</span></li>";
      }).join("");
      $(".e-pts", m.body).innerHTML = "Valendo <b>" + E.enigmaPoints(shown) + "</b> pontos";
      btn.hidden = shown >= 3;
    }
    btn.onclick = function () {
      if (locked || shown >= 3) return;
      shown++;
      Sfx.card();
      renderClues();
    };
    renderClues();
    var r = await runChoice(m, {
      options: toOptions(e.o), seconds: state.settings.time ? state.settings.time + 15 : 0, player: p, compass: true,
      onAnswer: function () { locked = true; btn.hidden = true; }
    });
    await settle(m, p, r.correct, E.enigmaPoints(shown) + Math.round(30 * r.frac), answerInfo(r, e.o[0], e.i));
  }

  async function doActivity(p) {
    var kinds = ["ordenar", "vf", "bandeira"].filter(function (k) { return k !== state.lastActivity; });
    var kind = kinds[Math.floor(rnd() * kinds.length)];
    state.lastActivity = kind;
    var T = state.settings.time;
    var m, r;
    if (kind === "ordenar") {
      var o = E.pick(state, "ordenar", DATA.ordenar, null, rnd);
      m = openModal({ type: "atividade", label: "Atividade · Ordenar", player: p, accent: "#0c9a9a" });
      r = await runOrder(m, o, T ? T + 20 : 0);
      await settle(m, p, r.correct, 250 + Math.round(50 * r.frac), (r.correct ? "" : "Ordem certa: " + o.it.join(" → ") + ". ") + o.i);
    } else if (kind === "vf") {
      var items = [];
      for (var i = 0; i < 5; i++) items.push(E.pick(state, "vf", DATA.vf, null, rnd));
      m = openModal({ type: "atividade", label: "Atividade · Verdadeiro ou Falso", player: p, accent: "#0c9a9a" });
      r = await runVF(m, items, T ? T + 20 : 0);
      await settleScore(m, p, r.hits, 5, 4, 3, 40, "afirmações");
    } else {
      m = openModal({ type: "atividade", label: "Atividade · Bandeiras", player: p, accent: "#0c9a9a" });
      r = await runFlags(m, p, T ? Math.max(10, Math.round(T / 2)) : 0);
      await settleScore(m, p, r.hits, 3, 2, null, 80, "bandeiras");
    }
  }

  // Atividades com placar: acima de winAt → bônus; entre neutralAt e winAt → só pontos; abaixo → ônus.
  async function settleScore(m, p, hits, total, winAt, neutralAt, perHit, noun) {
    var pts = hits * perHit;
    var summary = "Você acertou " + hits + " de " + total + " " + noun + ".";
    m.body.innerHTML = '<div class="score-big">' + hits + "<small>/" + total + "</small></div>";
    if (hits >= winAt) return settle(m, p, true, pts, summary);
    if (neutralAt != null && hits >= neutralAt) {
      p.points += pts;
      log(p, "fez " + hits + "/" + total + " na atividade (+" + pts + ")");
      renderPlayers();
      await showResult(m, { tone: "neutral", title: "😅 Quase! +" + pts + " pontos", info: summary + " Faltou pouco para o bônus — sem ônus desta vez." });
      await m.close();
      return renderAll();
    }
    p.points += pts;
    return settle(m, p, false, 0, summary, pts ? "Poucos acertos (+" + pts + " pontos)" : null);
  }

  function runOrder(m, o, seconds) {
    return new Promise(function (resolve) {
      var order = [], done = false;
      var pool = E.shuffle(o.it, rnd);
      if (pool.join("|") === o.it.join("|")) pool.reverse();
      m.body.innerHTML = '<div class="q-meta">Toque nos itens na ordem certa · toque num item colocado para removê-lo</div>' +
        '<h2 class="q-text" id="m-title">' + esc(o.t) + '</h2><ol class="order-slots"></ol><div class="order-pool"></div>';
      var slots = $(".order-slots", m.body), poolEl = $(".order-pool", m.body);
      m.foot.innerHTML = "";
      var reset = h('<button type="button" class="btn btn-ghost">↺ Limpar</button>');
      var confirm = h('<button type="button" class="btn btn-primary" disabled>Confirmar ordem ✔</button>');
      m.foot.appendChild(reset);
      m.foot.appendChild(confirm);

      function render() {
        slots.innerHTML = o.it.map(function (_, i) {
          return '<li class="slot' + (order[i] ? " filled" : "") + '" data-i="' + i + '"><span class="slot-n">' + (i + 1) + "º</span><span>" + (order[i] ? esc(order[i]) : "") + "</span></li>";
        }).join("");
        poolEl.innerHTML = pool.map(function (it) {
          return '<button type="button" class="chip-btn"' + (order.indexOf(it) >= 0 ? " disabled" : "") + ">" + esc(it) + "</button>";
        }).join("");
        $$(".chip-btn", poolEl).forEach(function (b, k) {
          b.onclick = function () { if (done) return; order.push(pool[k]); Sfx.click(); render(); };
        });
        $$(".slot.filled", slots).forEach(function (s) {
          s.onclick = function () { if (done) return; order.splice(+s.dataset.i, 1); render(); };
        });
        confirm.disabled = order.length !== o.it.length;
      }
      reset.onclick = function () { if (!done) { order = []; render(); } };
      confirm.onclick = function () { finish(false); };
      render();
      m.timer.start(seconds, function () { finish(true); });

      function finish(timeout) {
        if (done) return;
        done = true;
        var frac = m.timer.frac();
        m.timer.stop();
        var ok = order.length === o.it.length && order.every(function (x, i) { return x === o.it[i]; });
        slots.innerHTML = o.it.map(function (x, i) {
          return '<li class="slot filled ' + (order[i] === x ? "correct" : "wrong") + '"><span class="slot-n">' + (i + 1) + "º</span><span>" + esc(x) +
            (order[i] && order[i] !== x ? " <s>" + esc(order[i]) + "</s>" : "") + "</span></li>";
        }).join("");
        poolEl.innerHTML = "";
        m.foot.innerHTML = "";
        (ok ? Sfx.correct : Sfx.wrong)();
        setTimeout(function () { resolve({ correct: ok, frac: frac, timeout: timeout }); }, 900);
      }
    });
  }

  function runVF(m, items, seconds) {
    return new Promise(function (resolve) {
      var i = 0, hits = 0, done = false, locked = false, results = [];
      m.body.innerHTML = '<div class="q-meta">Rodada relâmpago · 4 acertos de 5 = bônus</div><div class="vf-progress"></div>' +
        '<h2 class="q-text vf-text" id="m-title"></h2><div class="vf-feedback"></div>' +
        '<div class="vf-buttons"><button type="button" class="btn vf-btn vf-v">✔ Verdadeiro <kbd>V</kbd></button>' +
        '<button type="button" class="btn vf-btn vf-f">✘ Falso <kbd>F</kbd></button></div>';
      m.foot.innerHTML = "";
      var fb = $(".vf-feedback", m.body);
      function dots() {
        $(".vf-progress", m.body).innerHTML = items.map(function (_, k) {
          return '<span class="dot ' + (k < results.length ? (results[k] ? "ok" : "bad") : k === i ? "now" : "") + '"></span>';
        }).join("");
      }
      function render() {
        dots();
        $(".vf-text", m.body).textContent = items[i].s;
        fb.innerHTML = "";
        fb.className = "vf-feedback";
      }
      function answer(v) {
        if (done || locked) return;
        locked = true;
        var it = items[i], ok = v === it.v;
        results.push(ok);
        if (ok) hits++;
        (ok ? Sfx.bonus : Sfx.wrong)();
        fb.className = "vf-feedback " + (ok ? "ok" : "bad");
        fb.innerHTML = (ok ? "✅ Isso! " : "❌ Era " + (it.v ? "VERDADEIRO" : "FALSO") + ". ") + (it.i ? esc(it.i) : "");
        i++;
        dots();
        setTimeout(function () {
          if (done) return;
          locked = false;
          if (i >= items.length) finish(); else render();
        }, ok ? 800 : 1900);
      }
      $(".vf-v", m.body).onclick = function () { answer(true); };
      $(".vf-f", m.body).onclick = function () { answer(false); };
      keyHandler = function (e) {
        var k = e.key.toLowerCase();
        if (k === "v") { answer(true); return true; }
        if (k === "f") { answer(false); return true; }
        return false;
      };
      render();
      m.timer.start(seconds, finish);
      function finish() {
        if (done) return;
        done = true;
        m.timer.stop();
        keyHandler = null;
        setTimeout(function () { resolve({ hits: hits }); }, 300);
      }
    });
  }

  async function runFlags(m, p, seconds) {
    var hits = 0;
    for (var k = 0; k < 3; k++) {
      var f = E.pick(state, "flag", DATA.bandeiras, null, rnd);
      var wrong = E.shuffle(DATA.bandeiras.filter(function (x) { return x.r === f.r && x.c !== f.c; }), rnd).slice(0, 3).map(function (x) { return x.n; });
      m.body.innerHTML = '<div class="q-meta">Bandeira ' + (k + 1) + " de 3 · 2 acertos = bônus</div>" +
        '<h2 class="q-text" id="m-title">De qual país é esta bandeira?</h2>' +
        '<div class="flag-wrap"><img class="flag" src="https://flagcdn.com/w320/' + f.c + '.png" srcset="https://flagcdn.com/w640/' + f.c + '.png 2x" alt="Bandeira misteriosa"></div>';
      var r = await runChoice(m, { options: toOptions([f.n].concat(wrong)), seconds: seconds, player: p, compass: true });
      if (r.correct) hits++;
    }
    return { hits: hits };
  }

  async function doLuck(p) {
    var good = rnd() < 0.5;
    var card = E.pick(state, good ? "sorte" : "reves", good ? DATA.sorte : DATA.reves, null, rnd);
    var m = openModal({ type: "sorte", label: good ? "Sorte!" : "Revés!", player: p, accent: good ? "#1f9d5c" : "#d63c3c" });
    m.body.innerHTML = '<h2 class="q-text center" id="m-title">' + (good ? "🍀 Carta de Sorte" : "⛈️ Carta de Revés") + "</h2>";
    var blocked = !good && E.useShield(p);
    var fx = blocked ? { move: 0, othersMove: 0, notes: [] } : E.applyEffect(state, p, card.e, rnd);
    log(p, (good ? "tirou Sorte: " : "tirou Revés: ") + card.t + (blocked ? " (bloqueado 🛡️)" : ""));
    renderPlayers();
    Sfx.card();
    await showResult(m, { tone: good ? "win" : "lose", card: card, cardKind: good ? "bonus" : "onus", blocked: blocked, notes: fx.notes });
    await m.close();
    await applyMoves(p, fx);
  }

  async function doDuel(p, sp) {
    var others = state.players.filter(function (o) { return o !== p; });
    var m = openModal({ type: "duelo", player: p, accent: "#b4471f" });
    m.body.innerHTML = '<h2 class="q-text" id="m-title">⚔️ Duelo! Escolha seu adversário</h2>' +
      '<p class="muted">Acertou? Roube até <b>150 pontos</b> dele e ele recua 1 casa. Errou? Ele ganha <b>100 pontos</b> e avança 1 casa.</p><div class="duel-pick"></div>';
    var opp = await new Promise(function (res) {
      var box = $(".duel-pick", m.body);
      others.forEach(function (o, i) {
        var b = h('<button type="button" class="duel-btn" style="--pc:' + o.color + '"><span class="duel-av">' + o.avatar + "</span><b>" + esc(o.name) +
          "</b><small>" + o.points + " pts · casa " + o.pos + "</small></button>");
        b.onclick = function () { Sfx.click(); res(o); };
        box.appendChild(b);
        if (i === 0) setTimeout(function () { b.focus({ preventScroll: true }); }, 50);
      });
    });
    var q = E.pickQuiz(state, DATA, sp.region, rnd, { minD: 2 });
    m.body.innerHTML = questionHead(q.q, q.d, '<div class="duel-vs">' + chip(p) + "<b>VS</b>" + chip(opp) + "</div>");
    var r = await runChoice(m, { options: toOptions(q.o), seconds: state.settings.time, player: p, compass: true });
    if (r.correct) {
      var steal = Math.min(150, opp.points);
      opp.points -= steal;
      p.points += steal;
      p.stats.acertos++;
      var oppShield = E.useShield(opp);
      log(p, "venceu o duelo contra " + opp.name + " (+" + steal + ")");
      renderPlayers();
      await showResult(m, {
        tone: "win", title: "⚔️ Vitória! Você roubou " + steal + " pontos de " + esc(opp.name) + ".", info: q.i,
        notes: [oppShield ? opp.name + " usou um Escudo e não recuou." : opp.name + " recua 1 casa."]
      });
      await m.close();
      if (!oppShield && opp.pos > 0) await moveBy(opp, -1);
    } else {
      p.stats.erros++;
      opp.points += 100;
      log(p, "perdeu o duelo para " + opp.name);
      renderPlayers();
      await showResult(m, { tone: "lose", title: "⚔️ Derrota! " + esc(opp.name) + " ganha 100 pontos e avança 1 casa.", info: answerInfo(r, q.o[0], q.i) });
      await m.close();
      await moveBy(opp, 1);
    }
    renderAll();
  }

  async function doSpecial(p, sp) {
    var isShortcut = sp.type === "atalho";
    var m = openModal({ type: sp.type, label: sp.name, player: p, accent: isShortcut ? "#1f9d5c" : "#d63c3c" });
    var q = E.pickQuiz(state, DATA, sp.region, rnd);
    m.body.innerHTML = questionHead(q.q, q.d, '<p class="special-text ' + (isShortcut ? "ok" : "bad") + '">' + esc(sp.text) + "</p>");
    var r = await runChoice(m, { options: toOptions(q.o), seconds: state.settings.time, player: p, compass: true });
    var pts = E.quizPoints(q.d, r.frac);
    var blocked = false, title;
    if (r.correct) {
      p.points += pts;
      p.stats.acertos++;
      title = isShortcut ? "✈️ Atalho liberado! +" + pts + " pontos — siga para a casa " + sp.to + "." : "🛟 Você escapou! +" + pts + " pontos.";
      log(p, isShortcut ? "pegou o atalho " + sp.name + " ✈️" : "escapou do " + sp.name);
    } else {
      p.stats.erros++;
      blocked = !isShortcut && E.useShield(p);
      title = isShortcut ? "Atalho perdido. Você fica onde está." :
        blocked ? "🛡️ O Escudo te protegeu! Você fica onde está." : "🌪️ Arrastado de volta para a casa " + sp.to + "!";
      log(p, isShortcut ? "perdeu o atalho " + sp.name : blocked ? "se protegeu do " + sp.name + " 🛡️" : "foi arrastado pelo " + sp.name);
    }
    renderPlayers();
    await showResult(m, { tone: r.correct ? "win" : "lose", title: title, info: answerInfo(r, q.o[0], q.i) });
    await m.close();
    if (isShortcut ? r.correct : !r.correct && !blocked) await flyTo(p, sp.to);
    renderAll();
  }

  async function doFinal(p) {
    var m = openModal({ type: "final", player: p, accent: "#c9900c" });
    var q = E.pickQuiz(state, DATA, null, rnd, { minD: state.settings.level === "facil" ? 2 : 3 });
    m.body.innerHTML = questionHead(q.q, q.d, '<p class="special-text gold">🏁 Última pergunta antes da chegada! Acerte para completar a volta ao mundo e vencer (+500 pontos).</p>');
    var r = await runChoice(m, { options: toOptions(q.o), seconds: state.settings.time, player: p, compass: true });
    if (r.correct) {
      p.points += 500;
      p.stats.acertos++;
      state.winner = p.id;
      log(p, "venceu o Desafio Final! 🏆");
      renderPlayers();
      await showResult(m, { tone: "win", title: "🏆 Volta ao mundo completa! +500 pontos", info: q.i });
      await m.close();
      return;
    }
    p.stats.erros++;
    var blocked = E.useShield(p);
    log(p, blocked ? "errou o Desafio Final, mas o Escudo o manteve na chegada" : "errou o Desafio Final e voltou 3 casas");
    renderPlayers();
    await showResult(m, {
      tone: "lose",
      title: blocked ? "🛡️ O Escudo te manteve na chegada — nova chance na próxima vez!" : "❌ Errou! Volte 3 casas e tente chegar de novo.",
      info: answerInfo(r, q.o[0], q.i)
    });
    await m.close();
    if (!blocked) await moveBy(p, -3);
  }

  // ---------- fluxo de turnos ----------
  function startTurn() {
    turboArmed = false;
    var p = cur();
    save();
    if (p.skip > 0) {
      p.skip--;
      rollEnabled = false;
      hint = "⏸️ " + p.name + " perde esta vez.";
      renderAll();
      log(p, "perdeu a vez ⏸️");
      toast(chip(p) + " perde a vez!", "warn");
      setTimeout(endTurn, 1700);
      return;
    }
    if (p.pos === E.LAST) {
      rollEnabled = false;
      hint = "🏆 Hora do Desafio Final!";
      renderAll();
      setTimeout(function () { runAction(function () { return doFinal(p); }); }, 900);
      return;
    }
    rollEnabled = true;
    hint = "Role o dado! (tecla Espaço)";
    renderAll();
    toast(chip(p) + " — sua vez!");
  }

  async function runAction(fn) {
    try {
      await fn();
    } catch (err) {
      console.error(err);
      $("#modal-root").innerHTML = "";
      keyHandler = null;
      toast("Ops, algo deu errado — o jogo continua.", "warn");
    }
    if (state.winner != null) return finishGame();
    endTurn();
  }

  function endTurn() {
    var again = state.extraTurn;
    E.nextTurn(state);
    if (again) toast(chip(cur()) + " joga de novo! 🔁", "good");
    startTurn();
  }

  async function doRoll() {
    if (!rollEnabled) return;
    rollEnabled = false;
    var p = cur();
    var useTurbo = turboArmed && p.items.turbo > 0;
    if (useTurbo) p.items.turbo--;
    turboArmed = false;
    var dice = [E.rollDie(rnd)];
    if (useTurbo) dice.push(E.rollDie(rnd));
    lastDice = dice;
    hint = useTurbo ? "🚀 Turbo ativado!" : "Rolando…";
    renderTurnPanel();
    renderPlayers();
    await animateDice(dice);
    var total = dice.reduce(function (a, b) { return a + b; }, 0);
    setHint("Tirou " + total + (useTurbo ? " com Turbo 🚀" : "") + "!");
    log(p, "rolou " + (useTurbo ? dice.join(" + ") + " = " + total + " 🚀" : total));
    await moveBy(p, total);
    var sp = BOARD[p.pos];
    setHint("Casa " + sp.i + ": " + (sp.name || E.SPACE_TYPES[sp.type].name));
    await sleep(350);
    runAction(function () { return resolveSpace(p, sp); });
  }

  async function animateDice(vals) {
    var row = $("#dice-row");
    Sfx.roll();
    row.classList.add("rolling");
    for (var t = 0; t < 9; t++) {
      row.innerHTML = vals.map(function () { return dieHTML(E.rollDie(Math.random)); }).join("");
      await sleep(70);
    }
    row.classList.remove("rolling");
    row.innerHTML = vals.map(dieHTML).join("");
    row.classList.add("landed");
    await sleep(450);
    row.classList.remove("landed");
  }

  // ---------- fim de jogo ----------
  function finishGame() {
    clearSave();
    rollEnabled = false;
    renderAll();
    var w = state.players[state.winner];
    var rank = E.ranking(state);
    setTimeout(function () {
      Sfx.win();
      confetti();
      $("#end-title").innerHTML = w.avatar + " " + esc(w.name) + " venceu!";
      $("#end-sub").textContent = "Volta ao mundo completada na rodada " + state.round + ".";
      var medals = ["🥇", "🥈", "🥉", "🎖️"];
      var podiumOrder = [1, 0, 2].filter(function (i) { return rank[i]; });
      $("#podium").innerHTML = podiumOrder.map(function (i) {
        var p = rank[i];
        return '<div class="pod pod-' + (i + 1) + '" style="--pc:' + p.color + '"><div class="pod-av">' + p.avatar + "</div><div class=\"pod-name\">" + esc(p.name) +
          '</div><div class="pod-block"><span>' + medals[i] + "</span><b>" + p.points + " pts</b></div></div>";
      }).join("");
      $("#end-stats").innerHTML = '<table><thead><tr><th>#</th><th>Viajante</th><th>Casa</th><th>Pontos</th><th>✅</th><th>❌</th><th>Aproveitamento</th></tr></thead><tbody>' +
        rank.map(function (p, i) {
          var tot = p.stats.acertos + p.stats.erros;
          return "<tr><td>" + medals[i] + "</td><td>" + chip(p) + "</td><td>" + p.pos + "</td><td><b>" + p.points + "</b></td><td>" + p.stats.acertos +
            "</td><td>" + p.stats.erros + "</td><td>" + (tot ? Math.round(p.stats.acertos / tot * 100) + "%" : "—") + "</td></tr>";
        }).join("") + "</tbody></table>";
      show("screen-end");
    }, 900);
  }

  function confetti() {
    var c = $("#confetti");
    if (!c.getContext) return;
    var ctx = c.getContext("2d");
    c.width = innerWidth;
    c.height = innerHeight;
    c.classList.add("on");
    var cols = COLORS.concat(["#ffffff", "#7656d6", "#0c9a9a"]);
    var parts = [];
    for (var i = 0; i < 200; i++) {
      parts.push({
        x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.6,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, s: 6 + Math.random() * 8, col: cols[i % cols.length]
      });
    }
    var start = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (now - start < 5500) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, c.width, c.height); c.classList.remove("on"); }
    })(start);
  }

  // ---------- regras / navegação ----------
  function showRules() {
    if ($("#modal-root").children.length) return;
    var prevKey = keyHandler;
    var m = openModal({ icon: "📖", label: "Como jogar", accent: "#3a76d8", wide: true });
    var T = E.SPACE_TYPES;
    m.body.innerHTML =
      '<h2 class="q-text" id="m-title">Volta ao mundo em 49 casas</h2>' +
      '<p>De 2 a 4 viajantes partem do Brasil e cruzam Américas, Europa, África, Ásia e Oceania até os Polos. Na sua vez, role o dado, ande e encare o desafio da casa. ' +
      "O primeiro a chegar à casa 49 <b>e acertar o Desafio Final</b> vence!</p>" +
      '<div class="rules-grid">' +
        rule(T.quiz, "Pergunta de múltipla escolha. Quanto mais difícil e mais rápido, mais pontos.") +
        rule(T.enigma, "Descubra o lugar pelas pistas. Responder com 1 pista vale 300; com 3, vale 100.") +
        rule(T.atividade, "Ordenar, Verdadeiro ou Falso relâmpago ou Bandeiras do mundo.") +
        rule(T.sorte, "Uma carta surpresa: pode ajudar… ou atrapalhar.") +
        rule(T.duelo, "Escolha um rival. Acertou: rouba pontos e ele recua. Errou: ele avança.") +
        rule(T.atalho, "Acerte e voe adiante pela seta verde.") +
        rule(T.perigo, "Erre e seja arrastado para trás pela seta vermelha.") +
        rule(T.final, "Acerte para vencer. Errou? Volte 3 casas.") +
      "</div>" +
      '<h3>🎁 Bônus e ⚠️ Ônus</h3><p>Todo <b>acerto</b> dá pontos e vira uma carta de <b>bônus</b> (avançar, jogar de novo, ganhar itens…). ' +
      "Todo <b>erro</b> vira uma carta de <b>ônus</b> (voltar casas, perder a vez, perder pontos ou itens). Movimentos de cartas não ativam a casa onde você cai.</p>" +
      '<h3>🎒 Itens (até 3 de cada)</h3><div class="rules-grid">' +
        Object.keys(E.ITEMS).map(function (k) { return rule(E.ITEMS[k], E.ITEMS[k].desc); }).join("") +
      "</div><p class=\"muted\">Todo viajante começa com 1 Bússola. Atalhos de teclado: <kbd>Espaço</kbd> rola o dado, <kbd>A</kbd>–<kbd>D</kbd> ou <kbd>1</kbd>–<kbd>4</kbd> respondem, <kbd>V</kbd>/<kbd>F</kbd> no relâmpago, <kbd>T</kbd> ativa o Turbo. A partida é salva automaticamente.</p>";
    var b = h('<button type="button" class="btn btn-primary">Entendi, bora jogar! 🌎</button>');
    function close() { m.close().then(function () { keyHandler = prevKey; }); }
    b.onclick = close;
    m.foot.appendChild(b);
    keyHandler = function (e) {
      if (e.key === "Escape" || e.key === "Enter") { close(); return true; }
      return false;
    };
  }
  function rule(t, text) { return '<div class="rule"><span class="rule-ic">' + t.icon + "</span><div><b>" + t.name + "</b><p>" + text + "</p></div></div>"; }

  function confirmQuit() {
    if ($("#modal-root").children.length || !rollEnabled) {
      toast("Termine a jogada atual antes de sair.", "warn");
      return;
    }
    var m = openModal({ icon: "🏠", label: "Sair da partida", accent: "#5b6b82" });
    m.body.innerHTML = '<h2 class="q-text" id="m-title">Voltar ao início?</h2><p>A partida fica salva — você pode continuar depois pelo botão <b>Continuar partida</b>.</p>';
    var no = h('<button type="button" class="btn btn-ghost">Ficar</button>');
    var yes = h('<button type="button" class="btn btn-primary">Sair</button>');
    no.onclick = function () { m.close(); };
    yes.onclick = function () { save(); m.close().then(function () { rollEnabled = false; renderSetup(); show("screen-setup"); }); };
    m.foot.appendChild(no);
    m.foot.appendChild(yes);
    keyHandler = function (e) { if (e.key === "Escape") { m.close(); return true; } return false; };
  }

  function readSettings() { return { time: +$("#opt-time").value, level: $("#opt-level").value }; }

  function init() {
    renderSetup();
    $$("#count-picker button").forEach(function (b) {
      b.onclick = function () { setup.n = +b.dataset.n; Sfx.click(); renderSetup(); };
    });
    $("#btn-start").onclick = function () {
      var players = [];
      for (var i = 0; i < setup.n; i++) {
        players.push({ name: (setup.players[i].name || "").trim() || "Jogador " + (i + 1), color: COLORS[i], avatar: setup.players[i].avatar });
      }
      clearSave();
      Sfx.click();
      startGame(players, readSettings());
    };
    $("#btn-resume").onclick = function () { var s = loadSave(); if (s) resumeGame(s); };
    $("#btn-rules-setup").onclick = showRules;
    $("#btn-rules").onclick = showRules;
    $("#btn-quit").onclick = confirmQuit;
    $("#btn-sound").onclick = function () {
      Sfx.setEnabled(!Sfx.isEnabled());
      $("#btn-sound").textContent = Sfx.isEnabled() ? "🔊" : "🔇";
      Sfx.click();
    };
    $("#btn-rematch").onclick = function () {
      var players = state.players.map(function (p) { return { name: p.name, color: p.color, avatar: p.avatar }; });
      startGame(players, state.settings);
    };
    $("#btn-new").onclick = function () { renderSetup(); show("screen-setup"); };

    document.addEventListener("keydown", function (e) {
      if (keyHandler) {
        if (keyHandler(e)) e.preventDefault();
        return;
      }
      if (!$("#screen-game").classList.contains("active") || $("#modal-root").children.length) return;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if ((e.code === "Space" || e.key === "Enter") && rollEnabled) { e.preventDefault(); doRoll(); }
      if (e.key.toLowerCase() === "t") toggleTurbo();
    });
  }

  // Gancho para os testes automatizados (tests/testes.html).
  window.__geo = {
    get state() { return state; },
    setRandom: function (fn) { rnd = fn; },
    sanitizeSave: sanitizeSave,
    board: BOARD
  };

  init();
})();
