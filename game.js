// NEON VICE HEAT — a top-down open-world crime game set in Vice Bay.
// Fresh code, written for the make.fun gta6-01 bounty, round 7.
(function () {
  "use strict";

  // ---------------------------------------------------------------- constants
  var WORLD_W = 2400, WORLD_H = 1800;
  var VIEW_W = 960, VIEW_H = 600;
  var ROAD_W = 120;
  var ROADS_V = [200, 800, 1400, 2000];   // vertical road center x
  var ROADS_H = [200, 800, 1400];         // horizontal road center y
  var WATER_X = 2280;                      // ocean starts here (east edge)
  var BEACH_X = 2180;                      // sand starts here
  var TAU = Math.PI * 2;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var mini = document.getElementById("minimap");
  var mctx = mini.getContext("2d");

  var moneyEl = document.getElementById("money");
  var healthEl = document.getElementById("health-fill");
  var wantedEl = document.getElementById("wanted");
  var missionTitleEl = document.getElementById("mission-title");
  var missionObjEl = document.getElementById("mission-objective");
  var speedEl = document.getElementById("speed");
  var bannerEl = document.getElementById("banner");

  // ------------------------------------------------------------------- utils
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function turnToward(cur, target, maxStep) {
    var d = target - cur;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    if (d > maxStep) return cur + maxStep;
    if (d < -maxStep) return cur - maxStep;
    return target;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rng = mulberry32(20261123);

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ------------------------------------------------------------------- world
  // Buildings fill the blocks between roads. Each block gets 1-3 buildings.
  var BUILDING_COLORS = ["#3a2b4d", "#4d2b3a", "#2b3a4d", "#4d3f2b", "#2e4d3a", "#453052"];
  var buildings = [];
  (function buildCity() {
    var xs = [0, 260, 860, 1460, 2060];
    var xe = [140, 740, 1340, 1940, 2120];
    var ys = [0, 260, 860, 1460];
    var ye = [140, 740, 1340, 1740];
    for (var i = 0; i < xs.length; i++) {
      for (var j = 0; j < ys.length; j++) {
        var bx = xs[i], by = ys[j], bw = xe[i] - xs[i], bh = ye[j] - ys[j];
        if (bw < 60 || bh < 60) continue;
        var n = 1 + Math.floor(rng() * 2);
        for (var k = 0; k < n; k++) {
          var w = 60 + rng() * (bw - 70);
          var h = 60 + rng() * (bh - 70);
          // Keep buildings 12px inside the block so a car driving on the
          // road edge never scrapes them (car collision radius is 12).
          var x = bx + 12 + rng() * Math.max(1, bw - w - 24);
          var y = by + 12 + rng() * Math.max(1, bh - h - 24);
          buildings.push({
            x: x, y: y, w: w, h: h,
            color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)],
            tall: rng() > 0.6
          });
        }
      }
    }
    // The Vice Bay Bank — big landmark in the center block. Keep a clear
    // plaza around it so the mission marker in front stays reachable.
    var BANK_ZONE = { x: 1000, y: 980, w: 210, h: 170 };
    buildings = buildings.filter(function (b) {
      return !rectsOverlap(b.x, b.y, b.w, b.h, BANK_ZONE.x, BANK_ZONE.y, BANK_ZONE.w, BANK_ZONE.h);
    });
    buildings.push({ x: 1030, y: 1010, w: 150, h: 110, color: "#6b5a1e", tall: true, bank: true });
  })();

  function onRoad(x, y) {
    for (var i = 0; i < ROADS_V.length; i++) {
      if (Math.abs(x - ROADS_V[i]) < ROAD_W / 2) return true;
    }
    for (var j = 0; j < ROADS_H.length; j++) {
      if (Math.abs(y - ROADS_H[j]) < ROAD_W / 2) return true;
    }
    return false;
  }
  function inWater(x, y) { return x > WATER_X; }
  function onBeach(x, y) { return x > BEACH_X && x <= WATER_X; }

  function hitsBuilding(x, y, r) {
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (rectsOverlap(x - r, y - r, r * 2, r * 2, b.x, b.y, b.w, b.h)) return b;
    }
    return null;
  }
  function pushOutOfBuildings(e, r) {
    var b = hitsBuilding(e.x, e.y, r);
    if (!b) return;
    var cx = clamp(e.x, b.x, b.x + b.w), cy = clamp(e.y, b.y, b.y + b.h);
    var dx = e.x - cx, dy = e.y - cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) { e.x = b.x - r - 1; return; }
    e.x = cx + (dx / d) * (r + 1);
    e.y = cy + (dy / d) * (r + 1);
  }

  // ------------------------------------------------------------------- input
  var keys = {};
  var game = {
    started: false, paused: false, over: false,
    time: 0, money: 0, heat: 0, muted: false
  };
  window.addEventListener("keydown", function (e) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === "Enter" && !game.started) startGame();
    if (e.key.toLowerCase() === "p" && game.started) game.paused = !game.paused;
    if (e.key.toLowerCase() === "m") game.muted = !game.muted;
    // Enter/exit a car immediately on keydown: a quick tap can fall between
    // two animation frames, so polling keys[] in the update loop would miss it.
    if (e.key.toLowerCase() === "e" && game.started && !game.paused) toggleCar();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(e.key.toLowerCase()) >= 0) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("continue-btn").addEventListener("click", function () {
    document.getElementById("end-screen").classList.add("hidden");
    game.over = false;
  });

  // ------------------------------------------------------------------- audio
  var audio = { ctx: null, engine: null, engineGain: null, siren: null, sirenGain: null };
  function initAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new AC();
      audio.engine = audio.ctx.createOscillator();
      audio.engine.type = "sawtooth";
      audio.engine.frequency.value = 60;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engine.connect(audio.engineGain);
      audio.engineGain.connect(audio.ctx.destination);
      audio.engine.start();
      audio.siren = audio.ctx.createOscillator();
      audio.siren.type = "triangle";
      audio.siren.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.siren.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.ctx.destination);
      audio.siren.start();
    } catch (err) { audio.ctx = null; }
  }
  function beep(freq, dur, type, vol) {
    if (!audio.ctx || game.muted) return;
    var o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = vol || 0.15;
    g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
    o.connect(g); g.connect(audio.ctx.destination);
    o.start(); o.stop(audio.ctx.currentTime + dur);
  }
  function crashSound() {
    if (!audio.ctx || game.muted) return;
    var len = audio.ctx.sampleRate * 0.15;
    var buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = audio.ctx.createBufferSource(), g = audio.ctx.createGain();
    src.buffer = buf; g.gain.value = 0.25;
    src.connect(g); g.connect(audio.ctx.destination);
    src.start();
  }

  // ---------------------------------------------------------------- entities
  var CAR_COLORS = ["#e33", "#3ae", "#fc3", "#7d3", "#c6c", "#eee", "#f80", "#0cc"];
  var player = {
    x: 500, y: 500, angle: 0, speed: 0,
    health: 100, inCar: null, onFootSpeed: 3.1,
    bustTimer: 0, wastedTimer: 0
  };

  function makeCar(x, y, angle, color, kind) {
    return { x: x, y: y, angle: angle, speed: 0, color: color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      kind: kind || "parked", hp: 100, axis: null, road: 0, dir: 1, lane: 0, sirenPhase: 0, ramCd: 0 };
  }

  var cars = [];
  var parkedSpots = [
    [560, 240, 0], [620, 240, 0], [840, 560, Math.PI / 2], [840, 640, Math.PI / 2],
    [1460, 240, 0], [2040, 860, Math.PI / 2], [240, 1440, 0], [1460, 1440, 0],
    [240, 860, Math.PI / 2], [2060, 240, 0], [860, 1440, 0], [560, 1440, 0]
  ];
  parkedSpots.forEach(function (s) { cars.push(makeCar(s[0], s[1], s[2], null, "parked")); });

  var traffic = [];
  function spawnTrafficCar() {
    var vertical = Math.random() > 0.5;
    var road, x, y, angle;
    if (vertical) {
      road = ROADS_V[Math.floor(Math.random() * ROADS_V.length)];
      x = road + (Math.random() > 0.5 ? 28 : -28);
      y = 60 + Math.random() * (WORLD_H - 120);
      angle = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      road = ROADS_H[Math.floor(Math.random() * ROADS_H.length)];
      y = road + (Math.random() > 0.5 ? 28 : -28);
      x = 60 + Math.random() * (WORLD_W - 120);
      angle = Math.random() > 0.5 ? 0 : Math.PI;
    }
    var c = makeCar(x, y, angle, null, "traffic");
    c.axis = vertical ? "v" : "h";
    c.road = road;
    c.dir = angle === 0 || angle === Math.PI / 2 ? 1 : -1;
    c.lane = (vertical ? x - road : y - road);
    c.speed = 2.2 + Math.random() * 1.2;
    traffic.push(c);
  }
  for (var ti = 0; ti < 10; ti++) spawnTrafficCar();

  var peds = [];
  function spawnPed() {
    var x, y, tries = 0;
    do {
      x = 80 + Math.random() * (WORLD_W - 160);
      y = 80 + Math.random() * (WORLD_H - 160);
      tries++;
    } while ((onRoad(x, y) || hitsBuilding(x, y, 12) || inWater(x, y)) && tries < 40);
    return { x: x, y: y, angle: Math.random() * TAU, speed: 0.7 + Math.random() * 0.6,
      color: ["#f8c", "#8cf", "#fc8", "#8f8", "#c8f"][Math.floor(Math.random() * 5)], wait: 0 };
  }
  for (var pi = 0; pi < 14; pi++) peds.push(spawnPed());

  var police = [];
  function spawnPolice() {
    var a = Math.random() * TAU;
    var x = clamp(player.x + Math.cos(a) * 520, 60, WORLD_W - 60);
    var y = clamp(player.y + Math.sin(a) * 520, 60, WORLD_H - 60);
    var c = makeCar(x, y, angleTo(x, y, player.x, player.y), "#111", "police");
    c.speed = 0;
    police.push(c);
    beep(880, 0.15, "square", 0.1);
  }

  var pickups = [];
  (function placePickups() {
    var spots = [[420, 620], [980, 420], [1620, 980], [700, 1220], [1900, 620],
      [420, 1520], [1300, 1620], [2200, 900]];
    spots.forEach(function (s) { pickups.push({ x: s[0], y: s[1], taken: false }); });
  })();

  function wantedStars() { return Math.min(5, Math.floor(game.heat / 20)); }
  function addHeat(n) { game.heat = clamp(game.heat + n, 0, 100); }
  function showBanner(text, ms) {
    bannerEl.textContent = text;
    bannerEl.style.opacity = 1;
    setTimeout(function () { bannerEl.style.opacity = 0; }, ms || 2200);
  }

  // ---------------------------------------------------------------- missions
  var marker = null; // {x, y, r, label}
  var missionIndex = 0;
  var missionTimer = 0;
  var crewPicked = 0;

  var missions = [
    {
      title: "Mission 1 — Wheels Up",
      objective: "Steal a parked car (walk up to one and press E)",
      start: function () { marker = null; },
      update: function () {
        if (player.inCar) return completeMission(300, "Nice wheels. The city is open.");
        return null;
      }
    },
    {
      title: "Mission 2 — The Drop",
      objective: "Drive the package to the docks marker (south)",
      start: function () { marker = { x: 400, y: 1700, r: 70, label: "DOCKS" }; },
      update: function () {
        if (player.inCar && dist(player.x, player.y, 400, 1700) < 70) {
          return completeMission(500, "Package delivered. Clean work.");
        }
        return null;
      }
    },
    {
      title: "Mission 3 — Hot Pursuit",
      objective: "Lose the heat! Get your wanted level to zero",
      start: function () {
        game.heat = 65; // exactly 3 stars, regardless of earlier heat
        police.length = 0; // fresh pursuit spawns at a distance, not on top of the player
        marker = null;
        missionTimer = 120;
        showBanner("3 STARS — LOSE THE HEAT!", 2600);
      },
      update: function (dt) {
        missionTimer -= dt;
        if (game.heat <= 0) return completeMission(800, "Heat gone. You vanished.");
        if (missionTimer <= 0) {
          showBanner("Too slow — the heat found you", 2200);
          restartMission();
        }
        return null;
      }
    },
    {
      title: "Mission 4 — Crew Call",
      objective: "Pick up your crew — 2 members waiting in the city",
      // Crew members wait on the roadside (road H 800), so they are always
      // reachable by car or on foot — never inside a building.
      start: function () {
        crewPicked = 0;
        marker = { x: 1700, y: 800, r: 60, label: "CREW 1" };
      },
      update: function () {
        if (crewPicked === 0 && dist(player.x, player.y, 1700, 800) < 60) {
          crewPicked = 1;
          game.money += 100;
          beep(660, 0.2, "sine", 0.2);
          marker = { x: 500, y: 800, r: 60, label: "CREW 2" };
          showBanner("Crew member 1 aboard!", 1800);
        } else if (crewPicked === 1 && dist(player.x, player.y, 500, 800) < 60) {
          return completeMission(1000, "Crew assembled. Time for the big one.");
        }
        return null;
      }
    },
    {
      title: "Mission 5 — The Big Score",
      objective: "Hit the Vice Bay Bank, then escape to the beach",
      // Bank marker sits on the road just east of the bank: the car drives
      // north up the road to it, then keeps going north to the escape —
      // no U-turn needed after the hit.
      start: function () { marker = { x: 1380, y: 1065, r: 80, label: "BANK" }; },
      update: function () {
        if (marker && marker.label === "BANK" && dist(player.x, player.y, 1380, 1065) < 80) {
          game.money += 2000;
          game.heat = 85; // exactly 4 stars for the escape, regardless of earlier heat
          marker = { x: 2230, y: 300, r: 70, label: "ESCAPE" };
          showBanner("4 STARS — GET TO THE BEACH!", 2800);
          beep(220, 0.5, "sawtooth", 0.2);
        } else if (marker && marker.label === "ESCAPE" && dist(player.x, player.y, 2230, 300) < 70) {
          return completeMission(5000, "The score is yours. Legend status.");
        }
        return null;
      }
    }
  ];

  function completeMission(reward, line) {
    game.money += reward;
    player.health = 100; // each mission starts at full health
    showBanner(line + "  +$" + reward, 2600);
    beep(523, 0.15, "sine", 0.2);
    setTimeout(function () { beep(784, 0.25, "sine", 0.2); }, 160);
    missionIndex++;
    marker = null;
    if (missionIndex >= missions.length) {
      game.over = true;
      document.getElementById("end-stats").textContent =
        "All 5 missions complete — $" + game.money + " banked, heat survived.";
      document.getElementById("end-screen").classList.remove("hidden");
      missionTitleEl.textContent = "FREE ROAM";
      missionObjEl.textContent = "Vice Bay is yours — drive anywhere";
    } else {
      missions[missionIndex].start();
    }
    return true;
  }

  function restartMission() {
    game.heat = 0;
    police.length = 0;
    if (player.health <= 0) player.health = 100;
    missions[missionIndex].start();
  }

  function startGame() {
    if (game.started) return;
    game.started = true;
    document.getElementById("start-screen").classList.add("hidden");
    initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    missions[0].start();
    showBanner("WELCOME TO VICE BAY", 2400);
  }

  function respawn(reason) {
    showBanner(reason, 2600);
    game.money = Math.max(0, game.money - 200);
    game.heat = 0;
    police.length = 0;
    player.health = 100;
    player.inCar = null;
    player.x = 500; player.y = 500; player.speed = 0;
    player.bustTimer = 0; player.wastedTimer = 0;
    if (missionIndex === 2) restartMission();
  }

  // ------------------------------------------------------------------ update
  function tryEnterCar() {
    var best = null, bestD = 80;
    cars.forEach(function (c) {
      if (c.kind === "police") return;
      var d = dist(player.x, player.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    });
    if (best) {
      if (best.kind === "parked") addHeat(25);
      player.inCar = best;
      best.kind = "player";
      player.x = best.x; player.y = best.y; player.angle = best.angle;
      beep(330, 0.12, "square", 0.12);
      showBanner("Car jacked!", 1200);
    }
  }

  function toggleCar() {
    if (player.inCar) {
      var c = player.inCar;
      c.kind = "parked";
      player.inCar = null;
      player.x = c.x + Math.cos(c.angle + Math.PI / 2) * 26;
      player.y = c.y + Math.sin(c.angle + Math.PI / 2) * 26;
      player.speed = 0;
    } else {
      tryEnterCar();
    }
  }

  function updatePlayer(dt) {
    var up = keys["w"] || keys["arrowup"];
    var down = keys["s"] || keys["arrowdown"];
    var left = keys["a"] || keys["arrowleft"];
    var right = keys["d"] || keys["arrowright"];
    var brake = keys[" "];

    if (player.inCar) {
      var car = player.inCar;
      var maxSpeed = 8.2, accel = 0.14, reverseMax = 3;
      if (up) car.speed += accel;
      else if (down) car.speed -= accel * 0.8;
      else car.speed *= 0.985;
      if (brake) car.speed *= 0.94;
      car.speed = clamp(car.speed, -reverseMax, maxSpeed);
      var steer = (left ? -1 : 0) + (right ? 1 : 0);
      // Scrub speed in a hard turn so a 90-degree corner fits the intersection.
      if (steer !== 0 && car.speed > 5) car.speed -= 0.12;
      if (Math.abs(car.speed) > 0.2) {
        // Arcade steering: turn rate grows with speed so full-speed corners
        // still fit inside a 120px-wide intersection. Full rate at any
        // rolling speed, so slow sharp turns stay tight.
        var turnRate = 0.065 + 0.05 * Math.min(1, Math.abs(car.speed) / maxSpeed);
        car.angle += steer * turnRate * (car.speed > 0 ? 1 : -1);
      }
      var nx = car.x + Math.cos(car.angle) * car.speed;
      var ny = car.y + Math.sin(car.angle) * car.speed;
      var before = { x: car.x, y: car.y };
      car.x = clamp(nx, 30, WORLD_W - 30);
      car.y = clamp(ny, 30, WORLD_H - 30);
      if (inWater(car.x, car.y)) { car.x = before.x; car.y = before.y; car.speed *= -0.3; }
      if (hitsBuilding(car.x, car.y, 12)) {
        car.x = before.x; car.y = before.y;
        if (Math.abs(car.speed) > 4) { crashSound(); player.health -= 6; addHeat(5); }
        car.speed *= -0.35;
      }
      player.x = car.x; player.y = car.y; player.angle = car.angle; player.speed = car.speed;
      if (onRoad(car.x, car.y) && Math.abs(car.speed) > 6.5 && wantedStars() > 0) addHeat(0.02);
    } else {
      var mx = (right ? 1 : 0) - (left ? 1 : 0);
      var my = (down ? 1 : 0) - (up ? 1 : 0);
      if (mx || my) {
        var len = Math.sqrt(mx * mx + my * my);
        player.angle = Math.atan2(my / len, mx / len);
        var nx2 = player.x + (mx / len) * player.onFootSpeed;
        var ny2 = player.y + (my / len) * player.onFootSpeed;
        player.x = clamp(nx2, 20, WORLD_W - 20);
        player.y = clamp(ny2, 20, WORLD_H - 20);
        if (inWater(player.x, player.y)) { player.x -= (mx / len) * player.onFootSpeed; player.y -= (my / len) * player.onFootSpeed; }
        pushOutOfBuildings(player, 12);
        player.speed = player.onFootSpeed;
      } else {
        player.speed = 0;
      }
    }
  }

  function updateTraffic(dt) {
    traffic.forEach(function (c) {
      var step = c.speed * c.dir;
      if (c.axis === "v") {
        c.y += step;
        c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        // At an intersection, sometimes turn onto the crossing road.
        for (var j = 0; j < ROADS_H.length; j++) {
          if (Math.abs(c.y - ROADS_H[j]) < 4 && Math.random() < 0.25) {
            c.axis = "h"; c.road = ROADS_H[j];
            c.dir = Math.random() > 0.5 ? 1 : -1;
            c.lane = Math.random() > 0.5 ? 28 : -28;
            c.y = ROADS_H[j] + c.lane;
            break;
          }
        }
        if (c.y < 40) { c.dir = 1; }
        if (c.y > WORLD_H - 40) { c.dir = -1; }
      } else {
        c.x += step;
        c.angle = c.dir > 0 ? 0 : Math.PI;
        for (var i = 0; i < ROADS_V.length; i++) {
          if (Math.abs(c.x - ROADS_V[i]) < 4 && Math.random() < 0.25) {
            c.axis = "v"; c.road = ROADS_V[i];
            c.dir = Math.random() > 0.5 ? 1 : -1;
            c.lane = Math.random() > 0.5 ? 28 : -28;
            c.x = ROADS_V[i] + c.lane;
            break;
          }
        }
        if (c.x < 40) { c.dir = 1; }
        if (c.x > WORLD_W - 40) { c.dir = -1; }
      }
      // Slow down for the player's car ahead.
      if (player.inCar) {
        var d = dist(c.x, c.y, player.x, player.y);
        if (d < 70 && Math.abs(c.angle - player.angle) < 0.6) c.speed = Math.max(0.5, c.speed - 0.05);
        else c.speed = Math.min(3.4, c.speed + 0.02);
      }
    });
  }

  function updatePeds(dt) {
    peds.forEach(function (p) {
      if (p.wait > 0) { p.wait -= dt; return; }
      var nx = p.x + Math.cos(p.angle) * p.speed;
      var ny = p.y + Math.sin(p.angle) * p.speed;
      if (onRoad(nx, ny) || hitsBuilding(nx, ny, 10) || inWater(nx, ny) ||
          nx < 30 || nx > WORLD_W - 30 || ny < 30 || ny > WORLD_H - 30) {
        p.angle = Math.random() * TAU;
        p.wait = 0.3 + Math.random() * 1.2;
        return;
      }
      p.x = nx; p.y = ny;
      // Hit by a fast car: ped falls, heat rises.
      if (player.inCar && Math.abs(player.speed) > 3 && dist(p.x, p.y, player.x, player.y) < 24) {
        addHeat(15);
        crashSound();
        p.x = 80 + Math.random() * (WORLD_W - 160);
        p.y = 80 + Math.random() * (WORLD_H - 160);
        showBanner("Pedestrian down! +1 heat", 1200);
      }
    });
  }

  function updatePolice(dt) {
    var stars = wantedStars();
    var want = stars >= 1 ? Math.min(stars, 5) : 0;
    while (police.length < want) spawnPolice();
    while (police.length > want) police.pop();
    police.forEach(function (c) {
      var target = angleTo(c.x, c.y, player.x, player.y);
      c.angle = turnToward(c.angle, target, 0.06);
      var maxSpd = player.inCar ? 6.8 : 3.4;
      c.speed = Math.min(maxSpd, c.speed + 0.12);
      var nx = c.x + Math.cos(c.angle) * c.speed;
      var ny = c.y + Math.sin(c.angle) * c.speed;
      if (!hitsBuilding(nx, ny, 12) && !inWater(nx, ny)) { c.x = nx; c.y = ny; }
      else { c.angle += 0.5; }
      c.sirenPhase += dt * 7;
      c.ramCd = Math.max(0, (c.ramCd || 0) - dt);
      var d = dist(c.x, c.y, player.x, player.y);
      if (d < 34) {
        if (player.inCar) {
          // A ram lands at most once per 2s per cruiser, so a pinned player
          // gets time to reverse out instead of being deleted in seconds.
          if (c.ramCd <= 0) {
            player.health -= 5;
            player.inCar.speed *= 0.97;
            var pd = d || 1;
            c.x += ((c.x - player.x) / pd) * 8;
            c.y += ((c.y - player.y) / pd) * 8;
            if (Math.random() < 0.5) crashSound();
            c.ramCd = 2.0;
          }
        } else {
          player.bustTimer += dt;
          if (player.bustTimer > 1.5) respawn("BUSTED! $200 bail, heat cleared.");
        }
      } else {
        player.bustTimer = Math.max(0, player.bustTimer - dt);
      }
    });
  }

  function updateHeat(dt) {
    var nearCop = false;
    police.forEach(function (c) { if (dist(c.x, c.y, player.x, player.y) < 320) nearCop = true; });
    if (!nearCop && game.heat > 0) game.heat = Math.max(0, game.heat - dt * 1.5);
  }

  function updatePickups() {
    pickups.forEach(function (p) {
      if (!p.taken && dist(p.x, p.y, player.x, player.y) < 26) {
        p.taken = true;
        game.money += 50;
        beep(990, 0.12, "sine", 0.18);
        showBanner("+$50 cash pickup", 1000);
      }
    });
  }

  function updateHud() {
    moneyEl.textContent = "$" + game.money;
    healthEl.style.width = Math.max(0, player.health) + "%";
    var stars = wantedStars(), s = "";
    for (var i = 0; i < 5; i++) s += i < stars ? "★" : "☆";
    wantedEl.textContent = s;
    wantedEl.style.color = stars > 0 ? "#ff5a5a" : "#888";
    if (missionIndex < missions.length) {
      missionTitleEl.textContent = missions[missionIndex].title;
      var obj = missions[missionIndex].objective;
      if (missionIndex === 2) obj += " — " + Math.ceil(missionTimer) + "s left";
      missionObjEl.textContent = obj;
    }
    var mph = Math.round(Math.abs(player.speed || 0) * 9);
    speedEl.textContent = player.inCar ? mph + " mph" : (player.speed > 0 ? "on foot" : "—");
  }

  function updateAudio() {
    if (!audio.ctx) return;
    var engineOn = game.started && !game.paused && !game.muted && player.inCar;
    audio.engineGain.gain.value = engineOn ? 0.03 + Math.abs(player.speed || 0) * 0.006 : 0;
    if (audio.engine) audio.engine.frequency.value = 55 + Math.abs(player.speed || 0) * 14;
    var sirenOn = wantedStars() > 0 && !game.paused && !game.muted;
    audio.sirenGain.gain.value = sirenOn ? 0.02 : 0;
    if (audio.siren) audio.siren.frequency.value = 650 + Math.sin(game.time * 0.09) * 250;
  }

  // ------------------------------------------------------------------ render
  function drawCarShape(c, isPlayer) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = "#000";
    ctx.fillRect(-19, -11, 38, 22);
    ctx.fillStyle = c.color;
    ctx.fillRect(-17, -9, 34, 18);
    ctx.fillStyle = "rgba(180,220,255,0.85)";
    ctx.fillRect(2, -8, 8, 16);
    ctx.fillStyle = "#ffd23d";
    ctx.fillRect(15, -8, 2, 3);
    ctx.fillRect(15, 5, 2, 3);
    if (c.kind === "police") {
      var flash = Math.sin(c.sirenPhase * 2) > 0;
      ctx.fillStyle = flash ? "#f00" : "#00f";
      ctx.fillRect(-4, -9, 8, 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(-14, -9, 28, 3);
    }
    ctx.restore();
    if (isPlayer) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 21, c.y - 13, 42, 26);
    }
  }

  function render() {
    var camX = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    var camY = clamp(player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    ctx.save();
    ctx.translate(-camX, -camY);

    // Ground: grassy city base.
    ctx.fillStyle = "#1d2b1a";
    ctx.fillRect(camX, camY, VIEW_W, VIEW_H);

    // Ocean + beach (east edge).
    ctx.fillStyle = "#0a4d8c";
    ctx.fillRect(Math.max(camX, WATER_X), camY, WORLD_W - Math.max(camX, WATER_X), VIEW_H);
    ctx.fillStyle = "#d9c27a";
    ctx.fillRect(Math.max(camX, BEACH_X), camY, WATER_X - Math.max(camX, BEACH_X), VIEW_H);

    // Roads.
    ctx.fillStyle = "#23232b";
    ROADS_V.forEach(function (x) { ctx.fillRect(x - ROAD_W / 2, camY, ROAD_W, VIEW_H); });
    ROADS_H.forEach(function (y) { ctx.fillRect(camX, y - ROAD_W / 2, VIEW_W, ROAD_W); });
    // Sidewalks.
    ctx.fillStyle = "#3d3d46";
    ROADS_V.forEach(function (x) {
      ctx.fillRect(x - ROAD_W / 2 - 10, camY, 10, VIEW_H);
      ctx.fillRect(x + ROAD_W / 2, camY, 10, VIEW_H);
    });
    ROADS_H.forEach(function (y) {
      ctx.fillRect(camX, y - ROAD_W / 2 - 10, VIEW_W, 10);
      ctx.fillRect(camX, y + ROAD_W / 2, VIEW_W, 10);
    });
    // Lane dashes.
    ctx.fillStyle = "#ffd23d";
    ROADS_V.forEach(function (x) {
      for (var y = Math.floor(camY / 40) * 40; y < camY + VIEW_H; y += 40) {
        ctx.fillRect(x - 2, y, 4, 20);
      }
    });
    ROADS_H.forEach(function (y) {
      for (var x = Math.floor(camX / 40) * 40; x < camX + VIEW_W; x += 40) {
        ctx.fillRect(x, y - 2, 20, 4);
      }
    });

    // Buildings.
    buildings.forEach(function (b) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.tall ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)";
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 8);
      ctx.fillStyle = "rgba(255,210,61,0.5)";
      var cols = Math.floor(b.w / 22), rows = Math.floor(b.h / 22);
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          if ((i * 7 + j * 3 + b.x) % 5 !== 0) ctx.fillRect(b.x + 8 + i * 22, b.y + 16 + j * 22, 10, 8);
        }
      }
      if (b.bank) {
        ctx.fillStyle = "#ffd23d";
        ctx.font = "bold 13px Trebuchet MS";
        ctx.fillText("VICE BAY BANK", b.x + 12, b.y + 58);
      }
    });

    // Cash pickups.
    pickups.forEach(function (p) {
      if (p.taken) return;
      var pulse = 1 + Math.sin(game.time * 5 + p.x) * 0.15;
      ctx.fillStyle = "#7dff9b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#063";
      ctx.font = "bold 12px Trebuchet MS";
      ctx.fillText("$", p.x - 4, p.y + 4);
    });

    // Mission marker.
    if (marker) {
      var mr = marker.r * (1 + Math.sin(game.time * 4) * 0.08);
      ctx.strokeStyle = "#ffd23d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, mr, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,210,61,0.18)";
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, mr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffd23d";
      ctx.font = "bold 14px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(marker.label, marker.x, marker.y - mr - 8);
      ctx.textAlign = "left";
    }

    // Pedestrians.
    peds.forEach(function (p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4, 3, 0, TAU);
      ctx.fill();
    });

    // Parked + player cars, traffic, police.
    cars.forEach(function (c) { drawCarShape(c, c === player.inCar); });
    traffic.forEach(function (c) { drawCarShape(c, false); });
    police.forEach(function (c) { drawCarShape(c, false); });

    // Player on foot.
    if (!player.inCar) {
      ctx.fillStyle = "#ff2d78";
      ctx.beginPath();
      ctx.arc(player.x, player.y, 11, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
      ctx.stroke();
    }

    ctx.restore();

    if (game.paused) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", VIEW_W / 2, VIEW_H / 2);
      ctx.textAlign = "left";
    }
  }

  function renderMinimap() {
    var sx = mini.width / WORLD_W, sy = mini.height / WORLD_H;
    mctx.fillStyle = "#12200f";
    mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = "#0a4d8c";
    mctx.fillRect(WATER_X * sx, 0, (WORLD_W - WATER_X) * sx, mini.height);
    mctx.fillStyle = "#3a3a44";
    ROADS_V.forEach(function (x) { mctx.fillRect((x - ROAD_W / 2) * sx, 0, ROAD_W * sx, mini.height); });
    ROADS_H.forEach(function (y) { mctx.fillRect(0, (y - ROAD_W / 2) * sy, mini.width, ROAD_W * sy); });
    if (marker) {
      mctx.fillStyle = "#ffd23d";
      mctx.beginPath();
      mctx.arc(marker.x * sx, marker.y * sy, 5, 0, TAU);
      mctx.fill();
    }
    police.forEach(function (c) {
      mctx.fillStyle = "#f44";
      mctx.fillRect(c.x * sx - 2, c.y * sy - 2, 4, 4);
    });
    mctx.fillStyle = "#fff";
    mctx.beginPath();
    mctx.arc(player.x * sx, player.y * sy, 3.5, 0, TAU);
    mctx.fill();
  }

  // -------------------------------------------------------------------- loop
  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!game.started || game.paused) { render(); return; }
    game.time += dt;

    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateHeat(dt);
    updatePickups();

    // Traffic cars nudge apart from the player's car instead of overlapping.
    if (player.inCar) {
      traffic.forEach(function (c) {
        var d = dist(c.x, c.y, player.x, player.y);
        if (d < 34 && d > 0.01) {
          var push = (34 - d) / 2;
          c.x += ((c.x - player.x) / d) * push;
          c.y += ((c.y - player.y) / d) * push;
        }
      });
    }

    if (player.health <= 0) { respawn("WASTED! $200 hospital bill, heat cleared."); return; }

    if (missionIndex < missions.length) missions[missionIndex].update(dt);

    updateHud();
    updateAudio();
    render();
    renderMinimap();
  }
  requestAnimationFrame(frame);
})();
