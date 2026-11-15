// state.js — the whole game simulation: economy, waves, towers, enemies,
// projectiles, particles. No drawing here; render.js reads this state.
import {
  CELL, COLS, ROWS, GRID_Y, WAYPOINTS, PATH_SET, HEART_CELL,
  START_GOLD, START_LIVES, TOTAL_WAVES, SELL_RATE,
  TOWERS, towerDef, upgradeCost, towerDamage, towerRange, towerRate,
  ENEMIES, enemyHp, wavePlan, waveClearBonus, starsFor,
} from "./config.js";
import { RNG } from "./random.js";

export class Game {
  constructor(sfx) {
    this.sfx = sfx;
    this.rng = new RNG((Date.now() % 2147483647) || 1);
    this.screen = "title"; // title | playing | paused | victory | defeat
    this.time = 0;         // total simulated seconds (drives ambient animation)
    this.best = 0;
    try { this.best = parseInt(localStorage.getItem("emberkeep_best_v1") || "0", 10) || 0; } catch (e) { this.best = 0; }
    this.newGame();
  }

  newGame() {
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.wave = 0;
    this.score = 0;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floats = [];
    this.spawnQueue = [];
    this.waveTime = 0;
    this.waveActive = false;
    this.betweenWaves = true;
    this.speed = 1;
    this.placing = null;    // tower id being placed, or null
    this.selected = null;   // selected placed tower, or null
    this.banner = null;     // {text, sub, until}
    this.hint = "Pick a tower below (keys 1-4), then click a grass tile to build it.";
    this.stats = { kills: 0, leaked: 0, earned: 0, shots: 0 };
    this.endStats = null;
    this.screen = "playing";
    this.time = 0;
  }

  toTitle() {
    this.screen = "title";
    this.demoSetup();
  }

  // A quiet demo battlefield behind the title screen.
  demoSetup() {
    this.newGame(); // screen is "playing" while we pre-simulate
    this.gold = 640;
    this.wave = 3;
    this.lives = 999; // demo leaks never end the title scene
    const spots = [
      ["ember", 3, 0], ["frost", 4, 3], ["ember", 6, 4], ["storm", 7, 6],
      ["thorn", 12, 1], ["ember", 13, 5], ["frost", 15, 6], ["storm", 16, 5],
    ];
    for (const [id, c, r] of spots) this._addTower(id, c, r, 1 + (c % 2));
    this._spawnWaveEnemies(3, true);
    // Pre-advance the demo so the field is alive when the title shows.
    for (let i = 0; i < 60 * 6; i++) this.update(1 / 60, true);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.lives = 20;
    this.screen = "title";
  }

  // ---- placement -------------------------------------------------------
  cellAt(px, py) {
    if (py < GRID_Y || py >= GRID_Y + ROWS * CELL) return null;
    const col = Math.floor(px / CELL);
    const row = Math.floor((py - GRID_Y) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }
  isPath(col, row) { return PATH_SET.has(col + "," + row); }
  towerAt(col, row) { return this.towers.find((t) => t.col === col && t.row === row) || null; }
  canBuild(col, row) {
    return !this.isPath(col, row) && !this.towerAt(col, row) && !(col === HEART_CELL.col && row === HEART_CELL.row);
  }

  _addTower(defId, col, row, level) {
    const def = towerDef(defId);
    const t = {
      defId, col, row, level: level || 1,
      x: col * CELL + CELL / 2, y: GRID_Y + row * CELL + CELL / 2,
      invested: def.cost, cooldown: 0, angle: -Math.PI / 2, kills: 0,
      flash: 0,
    };
    this.towers.push(t);
    return t;
  }

  placeTower(col, row, defId) {
    const def = towerDef(defId);
    if (!def) return { ok: false, why: "Unknown tower." };
    if (!this.canBuild(col, row)) return { ok: false, why: "Cannot build there." };
    if (this.gold < def.cost) return { ok: false, why: "Not enough gold." };
    this.gold -= def.cost;
    const t = this._addTower(defId, col, row, 1);
    this.burst(t.x, t.y, def.color, 10, 90);
    this.sfx.place();
    this.hint = def.name + " built. Click it to upgrade or sell.";
    return { ok: true, tower: t };
  }

  upgradeTower(t) {
    if (!t || t.level >= 3) return { ok: false, why: "Already at max level." };
    const def = towerDef(t.defId);
    const cost = upgradeCost(def, t.level);
    if (this.gold < cost) return { ok: false, why: "Not enough gold to upgrade." };
    this.gold -= cost;
    t.invested += cost;
    t.level += 1;
    this.burst(t.x, t.y, "#ffe14d", 14, 110);
    this.sfx.upgrade();
    this.hint = towerDef(t.defId).name + " upgraded to level " + t.level + ".";
    return { ok: true };
  }

  sellTower(t) {
    if (!t) return { ok: false };
    const refund = Math.round(t.invested * SELL_RATE);
    this.gold += refund;
    this.stats.earned += refund;
    this.towers = this.towers.filter((x) => x !== t);
    if (this.selected === t) this.selected = null;
    this.burst(t.x, t.y, "#c9c9c9", 8, 70);
    this.sfx.sell();
    this.hint = "Sold for " + refund + " gold.";
    return { ok: true, refund };
  }

  // ---- waves ------------------------------------------------------------
  startWave() {
    if (this.waveActive || this.screen !== "playing") return false;
    if (this.wave >= TOTAL_WAVES) return false;
    this.wave += 1;
    this.waveActive = true;
    this.betweenWaves = false;
    this.waveTime = 0;
    this.spawnQueue = [];
    for (const g of wavePlan(this.wave)) {
      for (let i = 0; i < g.count; i++) {
        this.spawnQueue.push({ type: g.type, at: g.delay + i * g.gap });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    const boss = this.wave % 5 === 0;
    this.banner = {
      text: boss ? "WAVE " + this.wave + " — NIGHTMAW STIRS" : "WAVE " + this.wave,
      sub: boss ? "Something huge walks the road…" : "The shades are coming.",
      until: this.time + 2.6,
    };
    this.sfx.horn();
    return true;
  }

  _spawnEnemy(type, silent) {
    const def = ENEMIES[type];
    const hp = enemyHp(type, this.wave || 1);
    const start = WAYPOINTS[0];
    const e = {
      type, def, hp, maxHp: hp,
      x: start.x + this.rng.range(-6, 6), y: start.y + this.rng.range(-8, 8),
      wp: 1, speed: def.speed * CELL, dist: 0,
      slowUntil: 0, slowPct: 0, flash: 0, wobble: this.rng.range(0, Math.PI * 2),
      alive: true,
    };
    this.enemies.push(e);
    if (!silent) this.burst(e.x, e.y, "#8f7bff", 6, 60);
    return e;
  }

  _spawnWaveEnemies(wave, silent) {
    for (const g of wavePlan(wave)) {
      for (let i = 0; i < g.count; i++) {
        const e = this._spawnEnemy(g.type, silent);
        // Scatter them along the path so the demo is mid-flow.
        const ahead = this.rng.range(0, 900);
        this._advanceEnemy(e, ahead, true);
      }
    }
  }

  _advanceEnemy(e, px, silent) {
    let remaining = px;
    while (remaining > 0 && e.wp < WAYPOINTS.length) {
      const target = WAYPOINTS[e.wp];
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d <= remaining) { e.x = target.x; e.y = target.y; e.wp++; remaining -= d; }
      else { e.x += (dx / d) * remaining; e.y += (dy / d) * remaining; remaining = 0; }
    }
    e.dist = px;
  }

  // ---- combat -----------------------------------------------------------
  _fire(t, target) {
    const def = towerDef(t.defId);
    t.cooldown = 1 / towerRate(def, t.level);
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    t.flash = 0.12;
    this.stats.shots += 1;
    this.projectiles.push({
      x: t.x, y: t.y - 10, target,
      tx: target.x, ty: target.y,
      speed: def.projSpeed, damage: towerDamage(def, t.level),
      splash: def.splash || 0, slowPct: def.slowPct || 0, slowDur: def.slowDur || 0,
      color: def.color, defId: t.defId, alive: true,
    });
    if (t.defId === "storm") this.sfx.boom();
    else if (t.defId === "thorn") this.sfx.snipe();
    else if (t.defId === "frost") this.sfx.frost();
    else this.sfx.shoot();
  }

  _damageEnemy(e, dmg, slowPct, slowDur) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 0.1;
    if (slowPct && e.def.slowable) {
      e.slowPct = slowPct;
      e.slowUntil = this.time + slowDur;
    }
    if (e.hp <= 0) {
      e.alive = false;
      this.stats.kills += 1;
      this.gold += e.def.reward;
      this.stats.earned += e.def.reward;
      this.score += e.def.reward * 10;
      this.burst(e.x, e.y, e.def.color, e.def.boss ? 30 : 10, e.def.boss ? 170 : 90);
      this.addFloat(e.x, e.y - 18, "+" + e.def.reward + "g", "#ffd76a");
      this.sfx.coin();
    }
  }

  _leak(e) {
    e.alive = false;
    if (this.screen === "title") return; // demo leaks cost nothing
    this.lives -= e.def.boss ? 5 : 1;
    this.stats.leaked += 1;
    this.burst(WAYPOINTS[WAYPOINTS.length - 1].x - 30, e.y, "#ff5d5d", 16, 130);
    this.addFloat(VIEW_X_HEART, GRID_Y + HEART_CELL.row * CELL, "-1 life", "#ff7b7b");
    this.sfx.leak();
    if (this.lives <= 0) {
      this.lives = 0;
      this._defeat();
    }
  }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(speed * 0.3, speed);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
        life: 0, maxLife: this.rng.range(0.3, 0.7), color, size: this.rng.range(2, 5),
      });
    }
  }

  addFloat(x, y, text, color) {
    this.floats.push({ x, y, text, color, life: 0, maxLife: 1.1 });
  }

  _victory() {
    this.screen = "victory";
    const bonus = this.lives * 50;
    this.score += bonus;
    this.endStats = {
      score: this.score, wave: this.wave, kills: this.stats.kills,
      leaked: this.stats.leaked, earned: this.stats.earned,
      lives: this.lives, stars: starsFor(this.lives), bonus,
    };
    this._saveBest();
    this.sfx.victory();
    this.sfx.stopMusic();
  }

  _defeat() {
    this.screen = "defeat";
    this.endStats = {
      score: this.score, wave: this.wave, kills: this.stats.kills,
      leaked: this.stats.leaked, earned: this.stats.earned,
      lives: 0, stars: 0, bonus: 0,
    };
    this._saveBest();
    this.sfx.defeat();
    this.sfx.stopMusic();
  }

  _saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem("emberkeep_best_v1", String(this.best)); } catch (e) { /* private mode */ }
    }
  }

  // ---- main update ------------------------------------------------------
  update(dt, silent) {
    this.time += dt;
    // Particles and floats always animate, even on menus.
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    for (const f of this.floats) { f.life += dt; f.y -= 26 * dt; }
    this.floats = this.floats.filter((f) => f.life < f.maxLife);
    for (const t of this.towers) if (t.flash > 0) t.flash -= dt;
    for (const e of this.enemies) if (e.flash > 0) e.flash -= dt;

    if (this.screen !== "playing" && this.screen !== "title") return;
    if (this.banner && this.time > this.banner.until) this.banner = null;
    // Title demo: keep the battlefield alive forever.
    if (this.screen === "title" && !this.enemies.length && !this.spawnQueue.length) {
      this._spawnWaveEnemies(3, true);
    }

    // Spawn.
    if (this.waveActive) {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
        const s = this.spawnQueue.shift();
        this._spawnEnemy(s.type, silent);
      }
    }

    // Towers fire.
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const def = towerDef(t.defId);
      const rangePx = towerRange(def, t.level) * CELL;
      let best = null;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d <= rangePx && (!best || e.dist > best.dist)) best = e;
      }
      if (best) this._fire(t, best);
    }

    // Projectiles.
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const tgt = p.target && p.target.alive ? p.target : null;
      const tx = tgt ? tgt.x : p.tx;
      const ty = tgt ? tgt.y : p.ty;
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= Math.max(step, 10)) {
        p.alive = false;
        if (tgt || d <= 14) {
          if (p.splash > 0) {
            const cx = tgt ? tgt.x : tx, cy = tgt ? tgt.y : ty;
            for (const e of this.enemies) {
              if (!e.alive) continue;
              if (Math.hypot(e.x - cx, e.y - cy) <= p.splash * CELL) {
                this._damageEnemy(e, p.damage, p.slowPct, p.slowDur);
              }
            }
            this.burst(cx, cy, p.color, 8, 80);
          } else if (tgt) {
            this._damageEnemy(tgt, p.damage, p.slowPct, p.slowDur);
          }
        }
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    // Enemies walk.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const slowed = e.def.slowable && this.time < e.slowUntil;
      const sp = e.speed * (slowed ? 1 - e.slowPct : 1);
      let remaining = sp * dt;
      while (remaining > 0 && e.wp < WAYPOINTS.length) {
        const target = WAYPOINTS[e.wp];
        const dx = target.x - e.x, dy = target.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= remaining) { e.x = target.x; e.y = target.y; e.wp++; remaining -= d; }
        else { e.x += (dx / d) * remaining; e.y += (dy / d) * remaining; remaining = 0; }
      }
      e.dist += sp * dt;
      e.wobble += dt * 6;
      if (e.wp >= WAYPOINTS.length) this._leak(e);
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // Wave cleared?
    if (this.waveActive && !this.spawnQueue.length && !this.enemies.length) {
      this.waveActive = false;
      this.betweenWaves = true;
      const bonus = waveClearBonus(this.wave);
      this.gold += bonus;
      this.stats.earned += bonus;
      this.score += 100 * this.wave;
      this.addFloat(640, 320, "Wave clear! +" + bonus + "g", "#ffd76a");
      if (this.wave >= TOTAL_WAVES) {
        this._victory();
      } else {
        this.sfx.waveClear();
        this.hint = "Wave " + this.wave + " cleared! +" + bonus + " gold. Build, then start wave " + (this.wave + 1) + ".";
      }
    }
  }
}

const VIEW_X_HEART = 19 * CELL + CELL / 2;
