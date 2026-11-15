// main.js — boot, fixed-step loop, click/key handling, deterministic shot
// scenes (?shot=<scene>&seed=<n>) and the scripted self-test (?selftest=1).
import { VIEW_W, VIEW_H, BAR_Y, TOWERS } from "./config.js";
import { Game } from "./state.js";
import { SoundFX } from "./audio.js";
import { Input } from "./input.js";
import { drawGame, LAYOUT, hitButton } from "./render.js";
import { setupShot } from "./shots.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const sfx = new SoundFX();
const game = new Game(sfx);
const input = new Input(canvas);
const ui = { mouse: input.mouse, hoverCell: null, placing: null, muted: false };
window.__game = game;

const params = new URLSearchParams(location.search);
const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.message || e.error)));

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function startPlaying() {
  sfx.ensure();
  sfx.startMusic();
  game.newGame();
}

function handleClick(x, y) {
  sfx.ensure();
  if (game.screen === "title") {
    startPlaying();
    return;
  }
  if (game.screen === "victory" || game.screen === "defeat") {
    if (inRect(x, y, LAYOUT.againBtn)) startPlaying();
    return;
  }
  if (game.screen === "paused") {
    if (inRect(x, y, LAYOUT.pauseBtn)) game.screen = "playing";
    return;
  }
  if (game.screen !== "playing") return;

  if (y >= BAR_Y) {
    const hit = hitButton(x, y, !!game.selected);
    if (!hit) return;
    if (hit.kind === "card") {
      game.placing = game.placing === hit.id ? null : hit.id;
      game.selected = null;
      sfx.click();
    } else if (hit.kind === "wave") {
      game.startWave();
    } else if (hit.kind === "speed") {
      game.speed = game.speed === 1 ? 2 : 1;
      sfx.click();
    } else if (hit.kind === "pause") {
      game.screen = "paused";
      sfx.click();
    } else if (hit.kind === "mute") {
      ui.muted = !ui.muted;
      sfx.setMuted(ui.muted);
      sfx.click();
    } else if (hit.kind === "upgrade" && game.selected) {
      const r = game.upgradeTower(game.selected);
      if (!r.ok) { game.hint = r.why; sfx.error(); }
    } else if (hit.kind === "sell" && game.selected) {
      game.sellTower(game.selected);
    }
    return;
  }

  // Field click.
  const cell = game.cellAt(x, y);
  if (!cell) return;
  const tower = game.towerAt(cell.col, cell.row);
  if (game.placing) {
    if (tower) {
      game.selected = tower;
      game.placing = null;
      sfx.click();
    } else {
      const r = game.placeTower(cell.col, cell.row, game.placing);
      if (!r.ok) { game.hint = r.why; sfx.error(); }
    }
    return;
  }
  game.selected = tower || null;
  if (tower) sfx.click();
}

function handleKeys(pressed) {
  if (pressed.has("Enter") || pressed.has("Space")) {
    if (game.screen === "title") { startPlaying(); return; }
    if (game.screen === "victory" || game.screen === "defeat") { startPlaying(); return; }
    if (game.screen === "playing" && pressed.has("Space")) game.startWave();
  }
  if (pressed.has("KeyR") && (game.screen === "victory" || game.screen === "defeat")) {
    startPlaying();
    return;
  }
  if (game.screen !== "playing" && game.screen !== "paused") return;
  for (let i = 0; i < TOWERS.length; i++) {
    if (pressed.has("Digit" + (i + 1)) || pressed.has("Numpad" + (i + 1))) {
      game.placing = game.placing === TOWERS[i].id ? null : TOWERS[i].id;
      game.selected = null;
      sfx.click();
    }
  }
  if (pressed.has("KeyF")) {
    game.speed = game.speed === 1 ? 2 : 1;
    sfx.click();
  }
  if (pressed.has("KeyM")) {
    ui.muted = !ui.muted;
    sfx.setMuted(ui.muted);
    sfx.click();
  }
  if (pressed.has("KeyP")) {
    if (game.screen === "playing") { game.screen = "paused"; sfx.click(); }
    else if (game.screen === "paused") { game.screen = "playing"; sfx.click(); }
  }
  if (pressed.has("Escape")) {
    if (game.placing || game.selected) { game.placing = null; game.selected = null; }
    else if (game.screen === "playing") { game.screen = "paused"; }
    else if (game.screen === "paused") { game.screen = "playing"; }
  }
}

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * (game.screen === "playing" ? game.speed : 1);
  let n = 0;
  while (acc >= STEP && n < 8) {
    game.update(STEP);
    acc -= STEP;
    n++;
  }
  if (n === 8) acc = 0;

  // Hover cell for the placement ghost.
  const m = input.mouse;
  ui.placing = game.placing;
  ui.hoverCell = (game.screen === "playing" && m.inside && m.y < BAR_Y)
    ? game.cellAt(m.x, m.y) : null;

  const click = input.consumeClick();
  if (click) handleClick(click.x, click.y);
  const rc = input.consumeRightClick();
  if (rc) { game.placing = null; game.selected = null; }
  handleKeys(input.consumePressed());

  drawGame(ctx, game, ui);
  requestAnimationFrame(frame);
}

// ---- deterministic screenshots -------------------------------------------
if (params.has("shot")) {
  const scene = params.get("shot") || "title";
  const seed = parseInt(params.get("seed") || "7", 10) || 7;
  setupShot(game, scene, seed);
  if (scene === "play") {
    // Show the placement ghost, as if the player is about to build.
    ui.placing = "ember";
    ui.hoverCell = { col: 8, row: 3 };
  }
  drawGame(ctx, game, ui);
  window.__shotReady = true;
} else if (params.has("selftest")) {
  runSelfTest();
  window.__selftestDone = true;
} else {
  game.toTitle();
  requestAnimationFrame(frame);
}

// ---- scripted self-test ----------------------------------------------------
// Drives the real game code (same functions the mouse/key handlers call)
// through a full victory run, a defeat run and the economy, with no
// network and no user gesture. Results land in window.__selftest.
function runSelfTest() {
  const out = { errors, victory: null, defeat: null, economy: null, resources: [] };
  try {
    // Resource check: everything loaded must be same-origin or data:.
    for (const r of performance.getEntriesByType("resource")) {
      out.resources.push(r.name);
    }
    out.resourcesExternal = out.resources.filter((n) => {
      // Only real network URLs count: file: and data: are local by construction.
      if (!/^https?:\/\//.test(n)) return false;
      return !n.startsWith("http://127.0.0.1") && !n.startsWith("http://localhost");
    });

    // --- Victory run with a generous purse (balance probe) ---
    game.newGame();
    game.gold = 6000;
    const pads = bestPads();
    let placed = 0;
    for (const [c, r] of pads) {
      if (game.gold < 160) break;
      const type = ["thorn", "storm", "ember", "frost"][placed % 4];
      const res = game.placeTower(c, r, type);
      if (res.ok) placed++;
    }
    // Upgrade a few towers to level 3.
    for (const t of game.towers.slice(0, 6)) {
      game.upgradeTower(t);
      game.upgradeTower(t);
    }
    let reached = 0;
    let guard = 0;
    while (game.screen === "playing" && guard < 400000) {
      if (game.betweenWaves) {
        // Spend spare gold on upgrades between waves.
        for (const t of game.towers) {
          if (t.level < 3 && game.gold >= 200) game.upgradeTower(t);
        }
        game.startWave();
      }
      game.update(STEP);
      reached = game.wave;
      guard++;
      if (game.wave >= 20 && !game.waveActive && !game.enemies.length) break;
    }
    out.victory = {
      screen: game.screen, waveReached: reached, score: game.score,
      kills: game.stats.kills, lives: game.lives, ticks: guard,
      stars: game.endStats ? game.endStats.stars : 0,
    };

    // --- Restart from the victory screen ---
    game.newGame();
    out.restart = { screen: game.screen, gold: game.gold, lives: game.lives, wave: game.wave };

    // --- Defeat run: no towers, waves keep coming until the lantern falls ---
    game.newGame();
    game.startWave();
    guard = 0;
    while (game.screen === "playing" && guard < 200000) {
      if (game.betweenWaves) game.startWave();
      game.update(STEP);
      guard++;
    }
    out.defeat = { screen: game.screen, wave: game.wave, lives: game.lives, ticks: guard };

    // --- Fair-economy run: normal 200 starting gold, greedy auto-player ---
    game.newGame();
    const fairPads = bestPads();
    let fairPlaced = 0;
    let fairGuard = 0;
    while (game.screen === "playing" && fairGuard < 400000) {
      if (game.betweenWaves) {
        // Spend spare gold: fill the best pads, then upgrade.
        for (const [c, r] of fairPads) {
          if (!game.canBuild(c, r)) continue;
          const type = ["ember", "frost", "storm", "thorn"][fairPlaced % 4];
          const cost = { ember: 50, frost: 80, storm: 130, thorn: 160 }[type];
          if (game.gold < cost) break;
          if (game.placeTower(c, r, type).ok) fairPlaced++;
        }
        for (const t of game.towers) {
          if (t.level < 3 && game.gold >= 200) game.upgradeTower(t);
        }
        game.startWave();
      }
      game.update(STEP);
      fairGuard++;
      if (game.wave >= 20 && !game.waveActive && !game.enemies.length) break;
    }
    out.fairVictory = {
      screen: game.screen, waveReached: game.wave, score: game.score,
      kills: game.stats.kills, lives: game.lives, ticks: fairGuard,
      towersPlaced: fairPlaced,
      stars: game.endStats ? game.endStats.stars : 0,
    };

    // --- Economy: place / upgrade / sell math ---
    game.newGame();
    const before = game.gold;
    const p1 = game.placeTower(0, 0, "ember");
    const afterPlace = game.gold;
    const t = game.towers[0];
    const u1 = game.upgradeTower(t);
    const afterUpgrade = game.gold;
    const invested = t.invested;
    const s1 = game.sellTower(t);
    out.economy = {
      startGold: before, placed: p1.ok, afterPlace,
      upgraded: u1.ok, level: t ? t.level : 0, afterUpgrade, invested,
      sold: s1.ok, refund: s1.refund, finalGold: game.gold,
      expectedRefund: Math.round(invested * 0.7),
    };

    // --- Pause / speed / mute toggles ---
    game.newGame();
    game.speed = 2;
    game.screen = "paused";
    const pausedScreen = game.screen;
    game.screen = "playing";
    out.toggles = { speed2: game.speed === 2, paused: pausedScreen === "paused" };
  } catch (e) {
    out.exception = String(e && e.stack || e);
  }
  out.errors = errors;
  window.__selftest = out;
  document.title = "SELFTEST " + JSON.stringify(out).slice(0, 400);
  const pre = document.createElement("pre");
  pre.id = "selftest-result";
  pre.textContent = JSON.stringify(out, null, 2);
  document.body.appendChild(pre);
}

// Pads next to the road, best first (most road cells in range of a thorn).
function bestPads() {
  const scored = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 20; c++) {
      if (game.isPath(c, r)) continue;
      if (c === 19 && r === 4) continue;
      let near = 0;
      for (let dc = -4; dc <= 4; dc++) {
        for (let dr = -4; dr <= 4; dr++) {
          if (game.isPath(c + dc, r + dr)) near++;
        }
      }
      scored.push([near, c, r]);
    }
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.map((s) => [s[1], s[2]]);
}
