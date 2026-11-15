// Emberkeep — Defence of the Last Lantern
// config.js — every tunable number, tower/enemy definition and wave plan.
// One clear job: the game's data, no logic.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const HUD_H = 64;          // top bar height
export const CELL = 64;           // grid cell size in px
export const COLS = 20;
export const ROWS = 9;
export const GRID_Y = 64;         // grid top edge
export const BAR_Y = 640;         // build bar top edge (GRID_Y + ROWS*CELL)
export const BAR_H = 80;

export const START_GOLD = 200;
export const START_LIVES = 20;
export const TOTAL_WAVES = 20;
export const SELL_RATE = 0.7;
export const BEST_KEY = "emberkeep_best_v1";

// The road the shades walk, as grid cells (col,row). Enters left, exits right.
export const PATH_CELLS = [
  [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],
  [5,2],[5,3],[5,4],[5,5],
  [6,5],[7,5],[8,5],[9,5],[10,5],
  [10,4],[10,3],[10,2],
  [11,2],[12,2],[13,2],[14,2],
  [14,3],[14,4],[14,5],[14,6],[14,7],
  [15,7],[16,7],[17,7],
  [17,6],[17,5],[17,4],
  [18,4],[19,4],
];

// Waypoints in pixels (cell centres), start/end just off-screen.
export const WAYPOINTS = (() => {
  const pts = [{ x: -40, y: GRID_Y + 1 * CELL + CELL / 2 }];
  for (const [c, r] of PATH_CELLS) {
    pts.push({ x: c * CELL + CELL / 2, y: GRID_Y + r * CELL + CELL / 2 });
  }
  pts.push({ x: VIEW_W + 40, y: GRID_Y + 4 * CELL + CELL / 2 });
  return pts;
})();

export const PATH_SET = new Set(PATH_CELLS.map(([c, r]) => c + "," + r));
export const HEART_CELL = { col: 19, row: 4 }; // the Last Lantern stands here

export const TOWERS = [
  {
    id: "ember", name: "Ember Spire", key: "1", cost: 50,
    range: 2.3, damage: 12, rate: 2.0, projSpeed: 520,
    color: "#ff9a3c", dark: "#b3541e",
    desc: "Fast fire bolts. Cheap and eager.",
  },
  {
    id: "frost", name: "Frost Lantern", key: "2", cost: 80,
    range: 1.9, damage: 5, rate: 1.1, projSpeed: 420,
    color: "#7fd4ff", dark: "#2f7fb8",
    slowPct: 0.45, slowDur: 1.6,
    desc: "Chills shades, slowing them down.",
  },
  {
    id: "storm", name: "Storm Bell", key: "3", cost: 130,
    range: 2.7, damage: 34, rate: 0.55, projSpeed: 380,
    color: "#c9a7ff", dark: "#7a4fd0",
    splash: 1.0,
    desc: "Heavy shells that burst and splash.",
  },
  {
    id: "thorn", name: "Thorn Coil", key: "4", cost: 160,
    range: 4.2, damage: 58, rate: 0.5, projSpeed: 900,
    color: "#9dff6e", dark: "#4d9b2f",
    desc: "Long-range piercing thorns.",
  },
];

export function towerDef(id) {
  return TOWERS.find((t) => t.id === id);
}
export function upgradeCost(def, level) {
  // level 1 -> 2 costs 70% of base, 2 -> 3 costs 110% of base
  return Math.round(def.cost * (level === 1 ? 0.7 : 1.1));
}
export function towerDamage(def, level) {
  return Math.round(def.damage * Math.pow(1.6, level - 1));
}
export function towerRange(def, level) {
  return def.range * (1 + 0.12 * (level - 1));
}
export function towerRate(def, level) {
  return def.rate * (1 + 0.08 * (level - 1));
}

export const ENEMIES = {
  wisp:   { name: "Wisp",     hp: 30,  speed: 1.65, reward: 6,  radius: 13, color: "#e8ecff", eye: "#8f7bff", slowable: true },
  crawler:{ name: "Crawler",  hp: 85,  speed: 1.0,  reward: 9,  radius: 16, color: "#b8c4a8", eye: "#ff5d5d", slowable: true },
  brute:  { name: "Brute",    hp: 260, speed: 0.55, reward: 18, radius: 21, color: "#d8a06a", eye: "#7a1f1f", slowable: true },
  shade:  { name: "Shade",    hp: 60,  speed: 2.0,  reward: 11, radius: 13, color: "#5a5f8a", eye: "#ffe14d", slowable: false },
  boss:   { name: "Nightmaw", hp: 2400,speed: 0.42, reward: 160,radius: 30, color: "#3a2b52", eye: "#ff2e63", slowable: true, boss: true },
};

export function enemyHp(type, wave) {
  const base = ENEMIES[type].hp;
  const mul = 1 + 0.13 * (wave - 1) + (wave >= 11 ? 0.35 : 0);
  return Math.round(base * mul);
}

// Wave plan: list of spawn groups {type, count, gap (seconds between spawns), delay (seconds before group starts)}
export function wavePlan(wave) {
  const groups = [];
  const wisps = 6 + wave * 2;
  const crawlers = 1 + wave;
  const brutes = Math.floor(wave / 2);
  const shades = wave >= 4 ? 2 + Math.floor(wave / 3) : 0;
  groups.push({ type: "wisp", count: wisps, gap: 0.55, delay: 0 });
  if (crawlers > 0) groups.push({ type: "crawler", count: crawlers, gap: 0.9, delay: 4 + wave * 0.4 });
  if (shades > 0) groups.push({ type: "shade", count: shades, gap: 0.7, delay: 8 + wave * 0.3 });
  if (brutes > 0) groups.push({ type: "brute", count: brutes, gap: 1.6, delay: 12 + wave * 0.3 });
  if (wave % 5 === 0) {
    const bosses = wave === 20 ? 2 : 1;
    groups.push({ type: "boss", count: bosses, gap: 6, delay: 16 + wave * 0.2 });
  }
  return groups;
}

export function waveClearBonus(wave) {
  return 25 + wave * 3;
}

export function starsFor(livesLeft) {
  if (livesLeft >= 18) return 3;
  if (livesLeft >= 12) return 2;
  return 1;
}
