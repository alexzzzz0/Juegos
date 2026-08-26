/* ==========================================================================
   audio.js
   Todo el sonido del juego se genera con la Web Audio API (osciladores +
   ruido blanco). No se cargan archivos externos, asi que funciona sin red
   y suena a "chiptune" retro estilo 8/16 bits.
   ========================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicOn = true;
    this.sfxOn = true;
    this._musicTimer = null;
    this._musicStep = 0;
  }

  // El AudioContext debe crearse tras una interaccion del usuario (click)
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Buses separados para poder controlar volumen de musica y sfx
    // de forma independiente (antes ambos iban al mismo nodo master).
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.7;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1.0;
    this.sfxGain.connect(this.master);
  }

  setMusicVolume(v) {
    if (this.musicGain) this.musicGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setSfxVolume(v) {
    if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, v));
  }

  _env(gainNode, t0, attack, decay, sustain, release, peak = 1) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + attack + decay);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
  }

  _osc(type, freqStart, freqEnd, dur, gainPeak, t0, bus) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== undefined) {
      o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    }
    this._env(g, t0, 0.005, dur * 0.4, 0.3, dur * 0.6, gainPeak);
    o.connect(g);
    g.connect(bus || this.sfxGain || this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _noise(dur, gainPeak, t0, filterFreq = 2000, bus) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.002, dur * 0.3, 0.2, dur * 0.7, gainPeak);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus || this.sfxGain || this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  shoot(kind = 'pistol') {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    if (kind === 'pistol') {
      this._osc('square', 620, 140, 0.09, 0.35, t0);
      this._noise(0.05, 0.15, t0, 4000);
    } else if (kind === 'machinegun') {
      this._osc('square', 500, 180, 0.06, 0.25, t0);
      this._noise(0.04, 0.12, t0, 3500);
    } else if (kind === 'shotgun') {
      this._noise(0.16, 0.45, t0, 1800);
      this._osc('sawtooth', 220, 80, 0.14, 0.3, t0);
    } else if (kind === 'spread') {
      this._osc('sawtooth', 700, 300, 0.1, 0.3, t0);
      this._noise(0.07, 0.2, t0, 5000);
    }
  }

  jump() {
    if (!this.ctx || !this.sfxOn) return;
    this._osc('square', 260, 520, 0.14, 0.25, this.ctx.currentTime);
  }

  hit() {
    if (!this.ctx || !this.sfxOn) return;
    this._noise(0.08, 0.3, this.ctx.currentTime, 1200);
  }

  playerHurt() {
    if (!this.ctx || !this.sfxOn) return;
    this._osc('sawtooth', 220, 90, 0.22, 0.3, this.ctx.currentTime);
  }

  explosion(big = false) {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    this._noise(big ? 0.6 : 0.32, big ? 0.55 : 0.4, t0, big ? 900 : 1500);
    this._osc('sine', big ? 90 : 140, 30, big ? 0.5 : 0.25, big ? 0.5 : 0.3, t0);
  }

  powerup() {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      this._osc('square', f, f, 0.09, 0.22, t0 + i * 0.06);
    });
  }

  enemyDeath() {
    if (!this.ctx || !this.sfxOn) return;
    this._osc('triangle', 300, 40, 0.25, 0.25, this.ctx.currentTime);
  }

  bossHit() {
    if (!this.ctx || !this.sfxOn) return;
    this._osc('sawtooth', 160, 60, 0.15, 0.3, this.ctx.currentTime);
  }

  bossRoar() {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    this._osc('sawtooth', 80, 40, 0.9, 0.4, t0);
    this._noise(0.9, 0.25, t0, 500);
  }

  reload() {
    if (!this.ctx || !this.sfxOn) return;
    this._osc('square', 300, 500, 0.1, 0.2, this.ctx.currentTime);
  }

  dryFire() {
    if (!this.ctx || !this.sfxOn) return;
    this._osc('square', 200, 150, 0.05, 0.12, this.ctx.currentTime);
  }

  crateBreak() {
    if (!this.ctx || !this.sfxOn) return;
    this._noise(0.15, 0.3, this.ctx.currentTime, 2500);
  }

  gameOverJingle() {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    [400, 350, 300, 200].forEach((f, i) => {
      this._osc('sawtooth', f, f * 0.8, 0.3, 0.25, t0 + i * 0.22);
    });
  }

  victoryJingle() {
    if (!this.ctx || !this.sfxOn) return;
    const t0 = this.ctx.currentTime;
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this._osc('square', f, f, 0.18, 0.25, t0 + i * 0.14);
    });
  }

  // ---- Musica de fondo: bajo simple en loop + hi-hat sintetizado ----
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    const bassLine = [82, 82, 110, 98, 82, 82, 73, 65];
    const stepDur = 0.22;
    this._musicStep = 0;
    const scheduleStep = () => {
      if (!this.musicOn) { this._musicStep++; return; }
      const t0 = this.ctx.currentTime;
      const note = bassLine[this._musicStep % bassLine.length];
      this._osc('triangle', note, note, stepDur * 0.9, 0.14, t0, this.musicGain);
      if (this._musicStep % 2 === 0) {
        this._noise(0.03, 0.05, t0, 8000, this.musicGain); // hi-hat
      }
      this._musicStep++;
    };
    this._musicTimer = setInterval(scheduleStep, stepDur * 1000);
  }

  stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
  }
}

const AUDIO = new AudioEngine();
