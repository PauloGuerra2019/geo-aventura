/* Regras do GeoAventura — lógica pura, sem DOM (coberta por tests/testes.html). */
(function (root) {
  "use strict";

  var LAST = 49;
  var MAX_ITEM = 3;

  var REGIONS = {
    br: { name: "Brasil", color: "#1f9d5c" },
    am: { name: "Américas", color: "#e9822a" },
    eu: { name: "Europa", color: "#3a76d8" },
    af: { name: "África", color: "#c9532c" },
    as: { name: "Ásia", color: "#d23c63" },
    oc: { name: "Oceania", color: "#0c9a9a" },
    mundo: { name: "Polos", color: "#7656d6" }
  };

  var SPACE_TYPES = {
    inicio: { name: "Partida", icon: "🛫" },
    quiz: { name: "Conhecimento", icon: "❓" },
    enigma: { name: "Enigma", icon: "🔍" },
    atividade: { name: "Atividade", icon: "🎯" },
    sorte: { name: "Sorte ou Revés", icon: "🃏" },
    duelo: { name: "Duelo", icon: "⚔️" },
    atalho: { name: "Atalho", icon: "✈️" },
    perigo: { name: "Perigo", icon: "🌪️" },
    final: { name: "Desafio Final", icon: "🏆" }
  };

  // Uma entrada por casa, da 0 (partida) à 49 (chegada).
  var LAYOUT = [
    "inicio", "quiz", "atividade", "quiz", "sorte", "enigma", "quiz", "duelo", "atividade", "quiz",
    "enigma", "sorte", "quiz", "atalho", "atividade", "perigo", "quiz", "duelo", "enigma", "quiz",
    "atividade", "sorte", "quiz", "enigma", "atividade", "quiz", "atalho", "enigma", "sorte", "perigo",
    "quiz", "atividade", "duelo", "quiz", "enigma", "sorte", "atalho", "quiz", "atividade", "enigma",
    "quiz", "sorte", "perigo", "atividade", "quiz", "enigma", "duelo", "quiz", "atividade", "final"
  ];

  var SPECIAL = {
    13: { to: 19, name: "Voo Transatlântico", text: "Acerte e voe direto para a Europa!" },
    26: { to: 31, name: "Canal de Suez", text: "Acerte e corte caminho pelo canal!" },
    36: { to: 40, name: "Ferrovia Transiberiana", text: "Acerte e embarque no trem mais longo do mundo!" },
    15: { to: 10, name: "Triângulo das Bermudas", text: "Acerte para escapar — ou será arrastado de volta!" },
    29: { to: 24, name: "Tempestade no Saara", text: "Acerte para achar abrigo — ou a areia te leva de volta!" },
    42: { to: 37, name: "Ciclone no Pacífico", text: "Acerte para desviar — ou o ciclone te joga para trás!" }
  };

  var ITEMS = {
    bussola: { name: "Bússola", icon: "🧭", desc: "Elimina 2 alternativas erradas de uma pergunta." },
    escudo: { name: "Escudo", icon: "🛡️", desc: "Bloqueia automaticamente o próximo ônus." },
    turbo: { name: "Turbo", icon: "🚀", desc: "Ative antes de rolar para jogar 2 dados." }
  };

  var BONUS = [
    { icon: "💨", t: "Vento de cauda", d: "Avance 2 casas", e: { move: 2 }, w: 3 },
    { icon: "👣", t: "Passo extra", d: "Avance 1 casa", e: { move: 1 }, w: 3 },
    { icon: "🔁", t: "Conexão rápida", d: "Jogue novamente!", e: { extra: true }, w: 2 },
    { icon: "🧭", t: "Bússola", d: "Ganhe uma Bússola", e: { item: "bussola" }, w: 2 },
    { icon: "🛡️", t: "Escudo", d: "Ganhe um Escudo", e: { item: "escudo" }, w: 2 },
    { icon: "🚀", t: "Turbo", d: "Ganhe um Turbo", e: { item: "turbo" }, w: 2 },
    { icon: "💰", t: "Prêmio extra", d: "Ganhe +100 pontos", e: { pts: 100 }, w: 3 }
  ];

  var ONUS = [
    { icon: "↩️", t: "Desvio de rota", d: "Volte 2 casas", e: { move: -2 }, w: 3 },
    { icon: "🐢", t: "Trânsito lento", d: "Volte 1 casa", e: { move: -1 }, w: 3 },
    { icon: "⏸️", t: "Voo atrasado", d: "Perca a próxima vez", e: { skip: 1 }, w: 2 },
    { icon: "💸", t: "Multa no aeroporto", d: "Perca 100 pontos", e: { pts: -100 }, w: 3 },
    { icon: "🎒", t: "Item perdido", d: "Perca um item", e: { loseItem: true }, w: 1 }
  ];

  function regionAt(i) {
    if (i <= 8) return "br";
    if (i <= 16) return "am";
    if (i <= 24) return "eu";
    if (i <= 32) return "af";
    if (i <= 40) return "as";
    if (i <= 46) return "oc";
    return "mundo";
  }

  function buildBoard() {
    return LAYOUT.map(function (type, i) {
      var s = { i: i, type: type, region: regionAt(i) };
      if (SPECIAL[i]) {
        s.to = SPECIAL[i].to;
        s.name = SPECIAL[i].name;
        s.text = SPECIAL[i].text;
      }
      return s;
    });
  }

  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function weighted(list, rnd) {
    var total = list.reduce(function (s, x) { return s + (x.w || 1); }, 0);
    var r = rnd() * total;
    for (var i = 0; i < list.length; i++) {
      r -= list[i].w || 1;
      if (r < 0) return list[i];
    }
    return list[list.length - 1];
  }

  function rollDie(rnd) { return 1 + Math.floor(rnd() * 6); }

  function clampPos(n) { return Math.max(0, Math.min(LAST, n)); }

  function createGame(players, settings) {
    return {
      v: 1,
      players: players.map(function (p, i) {
        return {
          id: i, name: p.name, color: p.color, avatar: p.avatar,
          pos: 0, points: 0, skip: 0,
          items: { bussola: 1, escudo: 0, turbo: 0 },
          stats: { acertos: 0, erros: 0 }
        };
      }),
      current: 0,
      round: 1,
      settings: { time: settings.time, level: settings.level },
      used: {},
      extraTurn: false,
      winner: null,
      lastActivity: null
    };
  }

  /* Sorteia um elemento de `pool` sem repetir (por partida), tentando cada filtro de
   * `tiers` em ordem até achar candidatos. Quando o baralho acaba, ele é reembaralhado. */
  function pick(state, kind, pool, tiers, rnd) {
    var used = state.used[kind] || (state.used[kind] = []);
    if (used.length >= pool.length) used.length = 0;
    var free = [];
    for (var i = 0; i < pool.length; i++) if (used.indexOf(i) < 0) free.push(i);
    var cands = free;
    for (var t = 0; t < (tiers || []).length; t++) {
      var f = free.filter(function (k) { return tiers[t](pool[k]); });
      if (f.length) { cands = f; break; }
    }
    var idx = cands[Math.floor(rnd() * cands.length)];
    used.push(idx);
    return pool[idx];
  }

  function levelOk(level, d) {
    if (level === "facil") return d <= 2;
    if (level === "dificil") return d >= 2;
    return true;
  }

  // ~65% das perguntas são da região da casa; o resto vem de geografia geral.
  function pickQuiz(state, data, region, rnd, opts) {
    opts = opts || {};
    var lvl = state.settings.level;
    var wantRegion = region && region !== "mundo" && rnd() < 0.65 ? region : "mundo";
    var minD = opts.minD || 1;
    return pick(state, "quiz", data.quiz, [
      function (q) { return q.r === wantRegion && q.d >= minD && levelOk(lvl, q.d); },
      function (q) { return q.d >= minD && levelOk(lvl, q.d); },
      function (q) { return q.d >= minD; }
    ], rnd);
  }

  function pickEnigma(state, data, region, rnd) {
    return pick(state, "enigma", data.enigmas, [function (e) { return e.r === region; }], rnd);
  }

  function quizPoints(d, frac) { return 100 * d + Math.round(50 * (frac || 0)); }
  function enigmaPoints(cluesShown) { return [300, 200, 100][Math.min(3, Math.max(1, cluesShown)) - 1]; }

  function itemCount(p) { return p.items.bussola + p.items.escudo + p.items.turbo; }

  /* Aplica a parte imediata de um efeito (pontos, itens, vez perdida, jogada extra).
   * Movimentos são devolvidos para a interface animar. Retorna { move, othersMove, notes }. */
  function applyEffect(state, player, e, rnd) {
    var out = { move: 0, othersMove: 0, notes: [] };
    if (e.pts) player.points = Math.max(0, player.points + e.pts);
    if (e.item) {
      if (player.items[e.item] >= MAX_ITEM) {
        player.points += 50;
        out.notes.push("Mochila cheia de " + ITEMS[e.item].name + ": virou +50 pontos.");
      } else {
        player.items[e.item]++;
      }
    }
    if (e.skip) player.skip += e.skip;
    if (e.extra) state.extraTurn = true;
    if (e.loseItem) {
      var owned = Object.keys(player.items).filter(function (k) { return player.items[k] > 0; });
      if (owned.length) {
        var k = owned[Math.floor(rnd() * owned.length)];
        player.items[k]--;
        out.notes.push("Perdeu: " + ITEMS[k].icon + " " + ITEMS[k].name + ".");
      } else {
        player.points = Math.max(0, player.points - 50);
        out.notes.push("Sem itens na mochila: perdeu 50 pontos.");
      }
    }
    if (e.collect) {
      var total = 0;
      state.players.forEach(function (o) {
        if (o === player) return;
        var v = Math.min(e.collect, o.points);
        o.points -= v;
        total += v;
      });
      player.points += total;
      out.notes.push("Você recebeu " + total + " pontos dos outros jogadores.");
    }
    if (e.move) out.move = e.move;
    if (e.othersMove) out.othersMove = e.othersMove;
    return out;
  }

  // Consome um Escudo, se houver. true = o ônus foi bloqueado.
  function useShield(player) {
    if (player.items.escudo > 0) {
      player.items.escudo--;
      return true;
    }
    return false;
  }

  function nextTurn(state) {
    if (state.extraTurn) {
      state.extraTurn = false;
      return state.current;
    }
    state.current = (state.current + 1) % state.players.length;
    if (state.current === 0) state.round++;
    return state.current;
  }

  function ranking(state) {
    return state.players.slice().sort(function (a, b) {
      if (state.winner === a.id) return -1;
      if (state.winner === b.id) return 1;
      return b.pos - a.pos || b.points - a.points;
    });
  }

  root.GeoEngine = {
    LAST: LAST, MAX_ITEM: MAX_ITEM, REGIONS: REGIONS, SPACE_TYPES: SPACE_TYPES,
    ITEMS: ITEMS, BONUS: BONUS, ONUS: ONUS, LAYOUT: LAYOUT, SPECIAL: SPECIAL,
    regionAt: regionAt, buildBoard: buildBoard, shuffle: shuffle, weighted: weighted,
    rollDie: rollDie, clampPos: clampPos, createGame: createGame, pick: pick,
    pickQuiz: pickQuiz, pickEnigma: pickEnigma, quizPoints: quizPoints,
    enigmaPoints: enigmaPoints, itemCount: itemCount, applyEffect: applyEffect,
    useShield: useShield, nextTurn: nextTurn, ranking: ranking
  };
})(window);
