// audio.js — all sounds are synthesised live with WebAudio. No audio files,
// no copied samples. Every effect is a few oscillators / filtered noise.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, filterFreq, delay) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq || 800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  shoot() { this.tone(880, 0.07, "square", 0.05, 440); }
  snipe() { this.tone(1400, 0.1, "sawtooth", 0.06, 500); }
  frost() { this.tone(1200, 0.18, "sine", 0.07, 1800); }
  boom() { this.noise(0.25, 0.22, 500); this.tone(120, 0.2, "sine", 0.14, 50); }
  coin() { this.tone(988, 0.08, "sine", 0.09); this.tone(1319, 0.14, "sine", 0.09, null, 0.07); }
  place() { this.tone(330, 0.1, "triangle", 0.12, 520); this.tone(520, 0.12, "triangle", 0.1, null, 0.08); }
  upgrade() { this.tone(523, 0.09, "triangle", 0.1); this.tone(659, 0.09, "triangle", 0.1, null, 0.08); this.tone(784, 0.16, "triangle", 0.12, null, 0.16); }
  sell() { this.tone(660, 0.08, "triangle", 0.09, 440); }
  click() { this.tone(700, 0.05, "sine", 0.07); }
  error() { this.tone(160, 0.15, "square", 0.08, 110); }
  leak() { this.tone(220, 0.3, "sawtooth", 0.16, 55); this.noise(0.2, 0.12, 300); }
  horn() { this.tone(196, 0.35, "sawtooth", 0.1, 196); this.tone(294, 0.35, "sawtooth", 0.08, 294, 0.05); }
  waveClear() { this.tone(523, 0.12, "triangle", 0.1); this.tone(784, 0.2, "triangle", 0.1, null, 0.1); }
  victory() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone(n, 0.22, "triangle", 0.12, null, i * 0.13));
  }
  defeat() {
    const notes = [392, 370, 349, 311, 262];
    notes.forEach((n, i) => this.tone(n, 0.4, "sawtooth", 0.08, null, i * 0.22));
  }

  // A slow, quiet music-box loop over a minor pentatonic, scheduled ahead.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const n = scale[this.musicStep % scale.length];
      const oct = this.musicStep % 7 === 3 ? 2 : 1;
      this.tone(n * oct, 0.5, "sine", 0.035);
      if (this.musicStep % 4 === 0) this.tone(n / 2, 0.9, "sine", 0.03);
      this.musicStep++;
    }, 420);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
