// render.js — every pixel the game draws: field, towers, enemies, HUD,
// build bar, and all screens. Reads Game state, draws nothing else.
import {
  VIEW_W, VIEW_H, HUD_H, CELL, COLS, ROWS, GRID_Y, BAR_Y, BAR_H,
  PATH_CELLS, PATH_SET, HEART_CELL, TOTAL_WAVES, TOWERS, towerDef,
  upgradeCost, towerDamage, towerRange, towerRate, WAYPOINTS,
} from "./config.js";

// Clickable regions, shared with main.js hit-testing.
export const LAYOUT = {
  cards: TOWERS.map((t, i) => ({ x: 16 + i * 192, y: BAR_Y + 8, w: 182, h: 56, id: t.id })),
  waveBtn: { x: 800, y: BAR_Y + 8, w: 200, h: 64 },
  speedBtn: { x: 1012, y: BAR_Y + 8, w: 76, h: 64 },
  pauseBtn: { x: 1096, y: BAR_Y + 8, w: 76, h: 64 },
  muteBtn: { x: 1180, y: BAR_Y + 8, w: 76, h: 64 },
  upgradeBtn: { x: 560, y: BAR_Y + 14, w: 150, h: 52 },
  sellBtn: { x: 720, y: BAR_Y + 14, w: 110, h: 52 },
  startBtn: { x: 440, y: 470, w: 400, h: 64 },
  againBtn: { x: 440, y: 570, w: 400, h: 64 },
};

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
export function hitButton(x, y, panelOpen) {
  if (panelOpen) {
    if (inRect(x, y, LAYOUT.upgradeBtn)) return { kind: "upgrade" };
    if (inRect(x, y, LAYOUT.sellBtn)) return { kind: "sell" };
  } else {
    for (const c of LAYOUT.cards) if (inRect(x, y, c)) return { kind: "card", id: c.id };
  }
  if (inRect(x, y, LAYOUT.waveBtn)) return { kind: "wave" };
  if (inRect(x, y, LAYOUT.speedBtn)) return { kind: "speed" };
  if (inRect(x, y, LAYOUT.pauseBtn)) return { kind: "pause" };
  if (inRect(x, y, LAYOUT.muteBtn)) return { kind: "mute" };
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawGame(ctx, game, ui) {
  drawField(ctx, game, ui);
  if (game.screen === "playing" || game.screen === "paused") {
    drawHUD(ctx, game);
    drawBuildBar(ctx, game, ui);
    if (game.banner) drawBanner(ctx, game);
    if (game.screen === "paused") drawPausedScreen(ctx, game);
  } else if (game.screen === "title") {
    drawTitleScreen(ctx, game);
  } else if (game.screen === "victory") {
    drawHUD(ctx, game);
    drawVictoryScreen(ctx, game);
  } else if (game.screen === "defeat") {
    drawHUD(ctx, game);
    drawDefeatScreen(ctx, game);
  }
}

// ---- field ----------------------------------------------------------------
function drawField(ctx, game, ui) {
  // Night sky gradient.
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#141733");
  g.addColorStop(0.5, "#1b2044");
  g.addColorStop(1, "#10122b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Stars (fixed pseudo-random positions, twinkle with time).
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const sx = (i * 173 + 41) % VIEW_W;
    const sy = ((i * 97 + 13) % 300) + 70;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(game.time * 0.7 + i));
    ctx.globalAlpha = 0.25 + 0.5 * tw;
    ctx.fillStyle = "#cdd6ff";
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.restore();

  // Grass tiles with subtle checker variation.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL, y = GRID_Y + r * CELL;
      const shade = (c + r) % 2 === 0 ? "#1d2c40" : "#1a2839";
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, CELL, CELL);
      // A few grass tufts, deterministic per tile.
      const h = (c * 31 + r * 17) % 5;
      if (h === 0) {
        ctx.strokeStyle = "#2c4a34";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 14, y + 46); ctx.lineTo(x + 18, y + 36);
        ctx.moveTo(x + 22, y + 46); ctx.lineTo(x + 22, y + 34);
        ctx.moveTo(x + 30, y + 46); ctx.lineTo(x + 26, y + 36);
        ctx.stroke();
      }
    }
  }

  // The road: warm stones with a glowing edge.
  ctx.save();
  ctx.strokeStyle = "rgba(255, 190, 90, 0.35)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
  for (let i = 1; i < WAYPOINTS.length; i++) ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
  ctx.stroke();
  ctx.restore();
  for (const [c, r] of PATH_CELLS) {
    const x = c * CELL, y = GRID_Y + r * CELL;
    ctx.fillStyle = "#3d3350";
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.fillStyle = "rgba(255, 200, 110, 0.10)";
    ctx.fillRect(x + 6, y + 6, CELL - 12, CELL - 12);
  }

  // The Last Lantern (the heart) at the road's end.
  const hx = HEART_CELL.col * CELL + CELL / 2;
  const hy = GRID_Y + HEART_CELL.row * CELL + CELL / 2;
  const pulse = 0.75 + 0.25 * Math.sin(game.time * 2.2);
  const glow = ctx.createRadialGradient(hx, hy, 4, hx, hy, 90 * pulse);
  glow.addColorStop(0, "rgba(255, 214, 106, 0.55)");
  glow.addColorStop(1, "rgba(255, 214, 106, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(hx - 95, hy - 95, 190, 190);
  ctx.fillStyle = "#2c2118";
  ctx.fillRect(hx - 16, hy - 6, 32, 26);
  ctx.fillStyle = "#ffd66a";
  ctx.fillRect(hx - 12, hy - 2, 24, 18);
  ctx.fillStyle = "#ff9a3c";
  ctx.beginPath();
  ctx.moveTo(hx - 16, hy - 6); ctx.lineTo(hx, hy - 26); ctx.lineTo(hx + 16, hy - 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffd66a";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("THE LAST LANTERN", VIEW_W - 8, hy + 40);
  ctx.textAlign = "center";

  // Placement ghost + range preview.
  if (ui.placing && ui.hoverCell && game.screen === "playing") {
    const def = towerDef(ui.placing);
    const cell = ui.hoverCell;
    const ok = game.canBuild(cell.col, cell.row) && game.gold >= def.cost;
    const cx = cell.col * CELL + CELL / 2, cy = GRID_Y + cell.row * CELL + CELL / 2;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = ok ? def.color : "#ff5d5d";
    ctx.beginPath();
    ctx.arc(cx, cy, towerRange(def, 1) * CELL, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ok ? def.color : "#ff5d5d";
    ctx.fillRect(cell.col * CELL + 4, GRID_Y + cell.row * CELL + 4, CELL - 8, CELL - 8);
    ctx.restore();
  }
  // Selected tower range.
  if (game.selected && game.screen === "playing") {
    const t = game.selected;
    const def = towerDef(t.defId);
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, towerRange(def, t.level) * CELL, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Towers.
  for (const t of game.towers) drawTower(ctx, game, t);
  // Enemies.
  for (const e of game.enemies) drawEnemy(ctx, game, e);
  // Projectiles.
  for (const p of game.projectiles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.defId === "storm" ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const p of game.particles) {
    ctx.globalAlpha = 1 - p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  // Floating texts.
  ctx.textAlign = "center";
  ctx.font = "bold 14px system-ui, sans-serif";
  for (const f of game.floats) {
    ctx.globalAlpha = 1 - f.life / f.maxLife;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawTower(ctx, game, t) {
  const def = towerDef(t.defId);
  const bob = Math.sin(game.time * 2 + t.col) * 1.5;
  ctx.save();
  ctx.translate(t.x, t.y + bob * 0.3);
  // Base.
  ctx.fillStyle = "#232946";
  ctx.strokeStyle = def.dark;
  ctx.lineWidth = 2;
  roundRect(ctx, -20, -8, 40, 26, 6);
  ctx.fill();
  ctx.stroke();
  // Head per type.
  if (t.defId === "ember") {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.lineTo(12, -8); ctx.lineTo(-12, -8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff3c9";
    ctx.beginPath();
    ctx.moveTo(0, -24); ctx.lineTo(6, -10); ctx.lineTo(-6, -10);
    ctx.closePath(); ctx.fill();
  } else if (t.defId === "frost") {
    ctx.strokeStyle = "#cfe9ff";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -28); ctx.stroke();
    const fg = ctx.createRadialGradient(0, -30, 1, 0, -30, 12);
    fg.addColorStop(0, "#eaf7ff");
    fg.addColorStop(1, def.color);
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(0, -30, 10, 0, Math.PI * 2); ctx.fill();
  } else if (t.defId === "storm") {
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, -14, 13, Math.PI, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#efe6ff";
    ctx.fillRect(-2, -30, 4, 6);
    ctx.fillStyle = def.dark;
    ctx.fillRect(-14, -16, 28, 3);
  } else {
    // thorn coil: a spiked green orb
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, -16, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = def.dark;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t.angle * 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, -16 + Math.sin(a) * 10);
      ctx.lineTo(Math.cos(a) * 17, -16 + Math.sin(a) * 17);
      ctx.stroke();
    }
    ctx.fillStyle = "#eaffd8";
    ctx.beginPath(); ctx.arc(0, -16, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Level pips.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < t.level ? "#ffd66a" : "#3a3f5c";
    ctx.beginPath();
    ctx.arc(-12 + i * 12, 24, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Muzzle flash.
  if (t.flash > 0) {
    ctx.globalAlpha = t.flash / 0.12;
    ctx.fillStyle = "#fff8d0";
    ctx.beginPath();
    ctx.arc(Math.cos(t.angle) * 26, -10 + Math.sin(t.angle) * 26, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEnemy(ctx, game, e) {
  const r = e.def.radius;
  const wob = Math.sin(e.wobble) * 2;
  ctx.save();
  ctx.translate(e.x, e.y + wob);
  // Shadow blob body.
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
  body.addColorStop(0, e.def.color);
  body.addColorStop(1, "#141428");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Boss crown spikes.
  if (e.def.boss) {
    ctx.fillStyle = "#ff2e63";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 11 - 5, -r + 4);
      ctx.lineTo(i * 11, -r - 12);
      ctx.lineTo(i * 11 + 5, -r + 4);
      ctx.closePath(); ctx.fill();
    }
  }
  // Eyes.
  const flash = e.flash > 0;
  ctx.fillStyle = flash ? "#ffffff" : e.def.eye;
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.15, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.15, 3.4, 0, Math.PI * 2); ctx.fill();
  // Slow tint.
  if (game.time < e.slowUntil) {
    ctx.strokeStyle = "#7fd4ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, Math.PI * 2); ctx.stroke();
  }
  // HP bar.
  const w = r * 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(-w / 2, -r - 10, w, 5);
  ctx.fillStyle = e.hp / e.maxHp > 0.5 ? "#7be36b" : e.hp / e.maxHp > 0.25 ? "#ffb347" : "#ff5d5d";
  ctx.fillRect(-w / 2, -r - 10, w * Math.max(0, e.hp / e.maxHp), 5);
  if (e.def.boss) {
    ctx.fillStyle = "#ff8fb0";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NIGHTMAW", 0, -r - 16);
  }
  ctx.restore();
}

// ---- HUD ------------------------------------------------------------------
function drawHUD(ctx, game) {
  ctx.fillStyle = "rgba(10, 12, 30, 0.92)";
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.fillStyle = "#ffd66a";
  ctx.font = "bold 22px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("EMBERKEEP", 16, 28);
  ctx.fillStyle = "#8f96c9";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Defence of the Last Lantern", 16, 48);

  ctx.font = "bold 17px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd76a";
  ctx.fillText("◉ " + game.gold + " gold", 300, 28);
  ctx.fillStyle = game.lives <= 5 ? "#ff7b7b" : "#ff9d9d";
  ctx.fillText("♥ " + game.lives + " lives", 300, 50);
  ctx.fillStyle = "#cdd6ff";
  ctx.fillText("Wave " + Math.max(1, game.wave) + " / " + TOTAL_WAVES, 520, 28);
  ctx.fillStyle = "#9dff6e";
  ctx.fillText("Score " + game.score, 520, 50);
  ctx.fillStyle = "#8f96c9";
  ctx.fillText("Best " + game.best, 760, 28);
  ctx.fillText("Kills " + game.stats.kills, 760, 50);
  if (game.waveActive) {
    ctx.fillStyle = "#ffb347";
    ctx.fillText("Shades left: " + (game.enemies.length + game.spawnQueue.length), 980, 28);
  } else if (game.screen === "playing") {
    ctx.fillStyle = "#7be36b";
    ctx.fillText("Press SPACE to start wave " + (game.wave + 1), 980, 28);
  }
  ctx.fillStyle = "#8f96c9";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Speed " + game.speed + "x  •  P pause  •  M mute", 980, 50);
}

// ---- build bar -------------------------------------------------------------
function drawBuildBar(ctx, game, ui) {
  ctx.fillStyle = "rgba(10, 12, 30, 0.92)";
  ctx.fillRect(0, BAR_Y, VIEW_W, BAR_H);
  ctx.strokeStyle = "#2c3358";
  ctx.beginPath(); ctx.moveTo(0, BAR_Y + 0.5); ctx.lineTo(VIEW_W, BAR_Y + 0.5); ctx.stroke();

  if (game.selected && game.screen === "playing") {
    drawTowerPanel(ctx, game);
  } else {
    for (let i = 0; i < TOWERS.length; i++) {
      const def = TOWERS[i];
      const r = LAYOUT.cards[i];
      const active = game.placing === def.id;
      const afford = game.gold >= def.cost;
      ctx.fillStyle = active ? "#2c3358" : "#171b36";
      ctx.strokeStyle = active ? def.color : "#2c3358";
      ctx.lineWidth = active ? 2.5 : 1.5;
      roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(r.x + 22, r.y + 22, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = afford ? "#e8ecff" : "#ff8f8f";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(def.name, r.x + 40, r.y + 20);
      ctx.fillStyle = "#8f96c9";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(def.cost + " gold  •  [" + def.key + "]", r.x + 40, r.y + 38);
      ctx.fillStyle = "#6b7194";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(def.desc, r.x + 10, r.y + 52);
    }
    // Hint line under the cards is the game.hint, drawn at the bar's bottom edge.
    ctx.fillStyle = "#8f96c9";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(game.hint, 16, BAR_Y + BAR_H - 4);
  }

  // Wave button.
  const wb = LAYOUT.waveBtn;
  const canStart = !game.waveActive && game.screen === "playing" && game.wave < TOTAL_WAVES;
  ctx.fillStyle = canStart ? "#3f7a34" : "#2a2f4d";
  ctx.strokeStyle = canStart ? "#9dff6e" : "#3a3f5c";
  ctx.lineWidth = 2;
  roundRect(ctx, wb.x, wb.y, wb.w, wb.h, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = canStart ? "#eaffd8" : "#8f96c9";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(game.waveActive ? "WAVE " + game.wave + "…" : game.wave >= TOTAL_WAVES ? "FINAL WAVE" : "▶ START WAVE " + (game.wave + 1), wb.x + wb.w / 2, wb.y + 26);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#c9c9c9";
  ctx.fillText(canStart ? "or press SPACE" : "defend the lantern", wb.x + wb.w / 2, wb.y + 46);

  // Small buttons: speed / pause / mute.
  const small = [
    [LAYOUT.speedBtn, game.speed + "x", "Speed (F)"],
    [LAYOUT.pauseBtn, game.screen === "paused" ? "▶" : "❚❚", "Pause (P)"],
    [LAYOUT.muteBtn, ui.muted ? "🔇" : "🔊", "Mute (M)"],
  ];
  for (const [r, label, sub] of small) {
    ctx.fillStyle = "#171b36";
    ctx.strokeStyle = "#2c3358";
    ctx.lineWidth = 1.5;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e8ecff";
    ctx.font = "bold 17px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, r.x + r.w / 2, r.y + 28);
    ctx.fillStyle = "#8f96c9";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(sub, r.x + r.w / 2, r.y + 48);
  }
}

function drawTowerPanel(ctx, game) {
  const t = game.selected;
  const def = towerDef(t.defId);
  ctx.fillStyle = "#171b36";
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  roundRect(ctx, 16, BAR_Y + 8, 768, 64, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e8ecff";
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(def.name + "  •  Level " + t.level + (t.level >= 3 ? " (MAX)" : ""), 32, BAR_Y + 32);
  ctx.fillStyle = "#8f96c9";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(
    "Damage " + towerDamage(def, t.level) + "   •   Range " + towerRange(def, t.level).toFixed(1) +
    "   •   " + towerRate(def, t.level).toFixed(1) + "/s   •   Kills " + t.kills +
    "   •   Invested " + t.invested + "g",
    32, BAR_Y + 54);
  // Upgrade button.
  const ub = LAYOUT.upgradeBtn;
  const cost = t.level < 3 ? upgradeCost(def, t.level) : 0;
  const canUp = t.level < 3 && game.gold >= cost;
  ctx.fillStyle = canUp ? "#3f7a34" : "#2a2f4d";
  ctx.strokeStyle = canUp ? "#9dff6e" : "#3a3f5c";
  ctx.lineWidth = 2;
  roundRect(ctx, ub.x, ub.y, ub.w, ub.h, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = canUp ? "#eaffd8" : "#8f96c9";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(t.level >= 3 ? "MAX LEVEL" : "⬆ UPGRADE " + cost + "g", ub.x + ub.w / 2, ub.y + 31);
  // Sell button.
  const sb = LAYOUT.sellBtn;
  ctx.fillStyle = "#4d2a2a";
  ctx.strokeStyle = "#ff8f8f";
  ctx.lineWidth = 2;
  roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffd9d9";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("SELL +" + Math.round(t.invested * 0.7) + "g", sb.x + sb.w / 2, sb.y + 31);
  ctx.fillStyle = "#8f96c9";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Click another tile to move selection • right-click to cancel", 16, BAR_Y + BAR_H - 4);
}

function drawBanner(ctx, game) {
  const b = game.banner;
  const remain = b.until - game.time;
  const alpha = Math.min(1, remain / 0.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd66a";
  ctx.font = "bold 44px Georgia, serif";
  ctx.fillText(b.text, VIEW_W / 2, 300);
  ctx.fillStyle = "#cdd6ff";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(b.sub, VIEW_W / 2, 334);
  ctx.restore();
}

// ---- screens ----------------------------------------------------------------
function dim(ctx, alpha) {
  ctx.fillStyle = "rgba(8, 9, 24, " + alpha + ")";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawTitleScreen(ctx, game) {
  dim(ctx, 0.55);
  ctx.textAlign = "center";
  // Glow behind the title.
  const glow = ctx.createRadialGradient(640, 240, 10, 640, 240, 320);
  glow.addColorStop(0, "rgba(255, 190, 90, 0.22)");
  glow.addColorStop(1, "rgba(255, 190, 90, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(300, 0, 680, 480);
  ctx.fillStyle = "#ffd66a";
  ctx.font = "bold 84px Georgia, serif";
  ctx.fillText("EMBERKEEP", 640, 240);
  ctx.fillStyle = "#e8ecff";
  ctx.font = "24px Georgia, serif";
  ctx.fillText("Defence of the Last Lantern", 640, 282);
  ctx.fillStyle = "#cdd6ff";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("The shades march on the last light in the vale. Build towers, hold the road,", 640, 330);
  ctx.fillText("survive all 20 waves — and do not let a single Nightmaw reach the lantern.", 640, 354);
  // Start button.
  const sb = LAYOUT.startBtn;
  ctx.fillStyle = "#3f7a34";
  ctx.strokeStyle = "#9dff6e";
  ctx.lineWidth = 2.5;
  roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#eaffd8";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText("▶  PLAY", 640, sb.y + 41);
  ctx.fillStyle = "#8f96c9";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("or press ENTER", 640, sb.y + sb.h + 24);
  ctx.fillStyle = "#cdd6ff";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Build with mouse or keys 1–4  •  SPACE starts a wave  •  F speed  •  P pause  •  M mute", 640, 600);
  ctx.fillText("Upgrades, selling, 4 tower kinds, 5 shade kinds, bosses every 5 waves.", 640, 624);
  if (game.best > 0) {
    ctx.fillStyle = "#ffd76a";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillText("Best score: " + game.best, 640, 664);
  }
}

function drawPausedScreen(ctx, game) {
  dim(ctx, 0.6);
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8ecff";
  ctx.font = "bold 56px Georgia, serif";
  ctx.fillText("PAUSED", 640, 330);
  ctx.fillStyle = "#cdd6ff";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText("Press P or click ❚❚ to resume. The shades wait for no one — except now.", 640, 372);
}

function statsLines(ctx, game, y0) {
  const s = game.endStats;
  const rows = [
    ["Score", String(s.score)],
    ["Waves survived", String(s.wave) + " / " + TOTAL_WAVES],
    ["Shades banished", String(s.kills)],
    ["Shades leaked", String(s.leaked)],
    ["Gold earned", String(s.earned)],
    ["Lives left", String(s.lives)],
  ];
  if (s.bonus) rows.push(["Lantern bonus", "+" + s.bonus]);
  ctx.font = "17px system-ui, sans-serif";
  let y = y0;
  for (const [k, v] of rows) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#8f96c9";
    ctx.fillText(k, 600, y);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e8ecff";
    ctx.fillText(v, 660, y);
    y += 28;
  }
  return y;
}

function drawVictoryScreen(ctx, game) {
  dim(ctx, 0.62);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd66a";
  ctx.font = "bold 58px Georgia, serif";
  ctx.fillText("THE VALE ENDURES", 640, 190);
  ctx.fillStyle = "#e8ecff";
  ctx.font = "20px Georgia, serif";
  ctx.fillText("All 20 waves broken against your towers. The lantern burns on.", 640, 228);
  // Stars.
  for (let i = 0; i < 3; i++) {
    star(ctx, 580 + i * 60, 290, 26, i < game.endStats.stars ? "#ffd66a" : "#3a3f5c");
  }
  const yEnd = statsLines(ctx, game, 335);
  ctx.fillStyle = "#ffd76a";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Best score: " + game.best, 640, yEnd + 16);
  const ab = LAYOUT.againBtn;
  ctx.fillStyle = "#3f7a34";
  ctx.strokeStyle = "#9dff6e";
  ctx.lineWidth = 2.5;
  roundRect(ctx, ab.x, ab.y, ab.w, ab.h, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#eaffd8";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText("↻  PLAY AGAIN", 640, ab.y + 40);
  ctx.fillStyle = "#8f96c9";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("or press R", 640, ab.y + ab.h + 24);
}

function drawDefeatScreen(ctx, game) {
  dim(ctx, 0.66);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff7b7b";
  ctx.font = "bold 58px Georgia, serif";
  ctx.fillText("THE LIGHT GOES OUT", 640, 190);
  ctx.fillStyle = "#e8ecff";
  ctx.font = "20px Georgia, serif";
  ctx.fillText("The shades reached the Last Lantern on wave " + game.endStats.wave + ".", 640, 228);
  ctx.fillStyle = "#cdd6ff";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("Rebuild the line — the vale remembers every defence.", 640, 258);
  const yEnd = statsLines(ctx, game, 310);
  ctx.fillStyle = "#ffd76a";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Best score: " + game.best, 640, yEnd + 16);
  const ab = LAYOUT.againBtn;
  ctx.fillStyle = "#7a3434";
  ctx.strokeStyle = "#ff8f8f";
  ctx.lineWidth = 2.5;
  roundRect(ctx, ab.x, ab.y, ab.w, ab.h, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffd9d9";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText("↻  TRY AGAIN", 640, ab.y + 40);
  ctx.fillStyle = "#8f96c9";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("or press R", 640, ab.y + ab.h + 24);
}
