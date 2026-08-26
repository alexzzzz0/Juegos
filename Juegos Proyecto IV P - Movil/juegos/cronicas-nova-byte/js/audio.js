(function () {
'use strict';
// Sonido retro generado con Web Audio API: no requiere descargar archivos de audio.
class PixelAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.musicTimer = null;
    this.step = 0;
    this.world = 0;
    this.variant = 0;
  }

  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.context) this.context = new AudioCtx();
    if (this.context.state === 'suspended') this.context.resume();
    if (this.enabled) this.startMusic();
  }

  setWorld(world, levelIndex = 0) {
    this.world = world || 0;
    this.variant = levelIndex % 3;
    this.step = 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) { this.unlock(); this.startMusic(); }
    else this.stopMusic();
    return this.enabled;
  }

  tone(frequency, duration, type = 'square', volume = .045, delay = 0) {
    if (!this.enabled || !this.context || !Number.isFinite(frequency)) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  play(effect) {
    if (!this.enabled) return;
    const notes = {
      jump: () => { this.tone(220, .08, 'square', .05); this.tone(440, .12, 'square', .04, .06); },
      coin: () => { this.tone(987, .06, 'square', .04); this.tone(1319, .09, 'square', .035, .055); },
      block: () => { this.tone(150, .06, 'square', .055); this.tone(220, .045, 'square', .035, .045); },
      break: () => { this.tone(310, .04, 'square', .04); this.tone(180, .08, 'sawtooth', .04, .035); },
      power: () => { [523, 659, 784, 1047].forEach((n, i) => this.tone(n, .1, 'square', .04, i * .07)); },
      oneup: () => { [659, 784, 880, 1047, 1319].forEach((n, i) => this.tone(n, .1, 'square', .045, i * .08)); },
      shoot: () => { this.tone(680, .07, 'sawtooth', .025); this.tone(330, .09, 'square', .025, .03); },
      skid: () => { this.tone(340, .05, 'sawtooth', .03); this.tone(210, .09, 'square', .025, .03); },
      enemy: () => { this.tone(270, .07, 'square', .045); this.tone(160, .13, 'sawtooth', .035, .05); },
      hurt: () => { this.tone(190, .12, 'sawtooth', .06); this.tone(110, .18, 'square', .04, .08); },
      clear: () => { [523, 659, 784, 1047].forEach((n, i) => this.tone(n, .12, 'square', .045, i * .11)); },
      boss: () => { [196, 247, 294, 392].forEach((n, i) => this.tone(n, .16, 'sawtooth', .04, i * .09)); },
      gameover: () => { [392, 330, 262, 196].forEach((n, i) => this.tone(n, .17, 'square', .05, i * .13)); },
    };
    notes[effect]?.();
  }

  startMusic() {
    if (!this.context || this.musicTimer || !this.enabled) return;
    this.playMusicStep();
    this.musicTimer = window.setInterval(() => this.playMusicStep(), 170);
  }

  stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  playMusicStep() {
    if (!this.enabled || !this.context) return;
    const songs = [
      [
        [523, 659, 784, 659, 587, 659, 523, null, 494, 587, 659, 587, 523, 494, 440, null],
        [523, 587, 659, 784, 880, 784, 659, null, 587, 523, 494, 440, 494, 523, 587, null],
        [659, 784, 988, 784, 659, 587, 523, null, 587, 659, 784, 659, 523, 494, 440, null],
        [440, 494, 523, 587, 659, 587, 523, 494, 440, null, 494, 523, 587, 523, 440, null],
      ],
      [
        [330, 392, 494, 523, 494, 392, 330, null, 294, 330, 392, 440, 494, 440, 392, null],
        [330, 440, 494, 587, 523, 494, 440, null, 392, 330, 294, 330, 392, 440, 494, null],
        [494, 523, 587, 659, 587, 523, 494, null, 440, 494, 523, 494, 440, 392, 330, null],
        [294, 330, 392, 440, 494, 523, 494, 440, 392, null, 330, 294, 330, 392, 440, null],
      ],
      [
        [659, 784, 880, 784, 659, 587, 659, null, 523, 587, 659, 784, 659, 587, 523, null],
        [784, 880, 988, 880, 784, 659, 587, null, 659, 784, 880, 784, 659, 523, 587, null],
        [523, 659, 784, 880, 784, 659, 523, null, 587, 659, 784, 988, 880, 784, 659, null],
        [587, 659, 784, 659, 587, 523, 494, 523, 587, null, 659, 784, 659, 587, 523, null],
      ],
    ];
    const roots = [[131, 147, 165, 147], [82, 98, 110, 98], [110, 123, 147, 123]];
    const phrase = Math.floor(this.step / 16) % 8;
    const beat = this.step % 16;
    const reprise = phrase >= 4;
    const transposition = [1, 1.05946, .94387][this.variant] * (reprise && phrase === 6 ? 1.12246 : 1);
    const melody = songs[this.world % songs.length][phrase % 4][beat];
    const bassPattern = roots[this.world % roots.length];
    const bass = bassPattern[(Math.floor(beat / 4) + (reprise ? phrase - 3 : 0)) % bassPattern.length];
    if (melody) this.tone(melody * transposition, .115, 'square', .017);
    if (beat % 2 === 0) this.tone(bass * transposition, .14, 'triangle', .027);
    if (beat === 0 || beat === 8) this.tone(bass / 2, .035, 'square', .015);
    if (reprise && beat === 12) this.tone(bass * 2, .07, 'square', .012);
    this.step = (this.step + 1) % 128;
  }
}

window.PixelAudio = PixelAudio;
})();
