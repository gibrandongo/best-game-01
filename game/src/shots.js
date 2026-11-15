// shots.js — deterministic screenshot scenes. Each scene builds a fixed game
// state from a seeded RNG and advances it by fixed 1/60 s steps only, so the
// same ?shot=<scene>&seed=<n> always renders the same frame. No wall clock.
import { RNG } from "./random.js";

const STEP = 1 / 60;

function stepFor(game, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) game.update(STEP, true);
}

function stepUntil(game, pred, maxSeconds) {
  const n = Math.round(maxSeconds / STEP);
  for (let i = 0; i < n; i++) {
    game.update(STEP, true);
    if (pred()) return true;
  }
  return false;
}

// Fixed tower layouts per scene: [towerId, col, row, level]
const PLAY_TOWERS = [
  ["ember", 3, 0, 1], ["frost", 4, 3, 1], ["ember", 6, 4, 2],
  ["storm", 7, 6, 1], ["thorn", 12, 1, 1], ["ember", 13, 5, 1],
  ["frost", 15, 6, 1],
];
const BOSS_TOWERS = [
  ["thorn", 3, 0, 3], ["storm", 4, 3, 2], ["ember", 6, 4, 3],
  ["frost", 7, 6, 2], ["storm", 9, 6, 3], ["thorn", 12, 1, 3],
  ["ember", 13, 5, 2], ["frost", 13, 3, 2], ["storm", 15, 6, 2],
  ["thorn", 16, 5, 3], ["ember", 16, 8, 2], ["frost", 18, 6, 2],
];

function placeLayout(game, layout) {
  for (const [id, c, r, level] of layout) {
    const t = game._addTower(id, c, r, level);
    t.invested = 50 * level;
  }
}

export function setupShot(game, scene, seed) {
  game.rng = new RNG(seed);
  if (scene === "title") {
    game.toTitle();
    return;
  }
  if (scene === "play") {
    game.newGame();
    game.gold = 480;
    placeLayout(game, PLAY_TOWERS);
    game.wave = 2;
    game.startWave(); // wave 3
    stepFor(game, 13);
    game.placing = "ember";
    return;
  }
  if (scene === "boss") {
    game.newGame();
    game.gold = 2600;
    placeLayout(game, BOSS_TOWERS);
    game.wave = 9;
    game.startWave(); // wave 10: Nightmaw
    // Wait until the boss is well on screen, not still at the edge.
    stepUntil(game, () => game.enemies.some((e) => e.type === "boss" && e.x > 140), 40);
    stepFor(game, 0.5);
    return;
  }
  if (scene === "victory") {
    game.newGame();
    game.gold = 1240;
    placeLayout(game, BOSS_TOWERS.slice(0, 6));
    game.wave = 20;
    game.score = 12480;
    game.stats.kills = 312;
    game.stats.earned = 5840;
    game.stats.leaked = 3;
    game.lives = 17;
    game._victory();
    return;
  }
  // Unknown scene: fall back to the title.
  game.toTitle();
}
