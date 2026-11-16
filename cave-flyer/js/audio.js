// Tiny synthesized sound effects with Web Audio; no sound files needed.
// Browsers only allow audio after a user gesture, so unlock() is called on input.

const MUTE_KEY = 'cave-flyer.muted';

export class Sound {
  constructor() {
    this.ctx = null;
    this.noiseBuf = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* storage blocked */ }
  }

  get ready() {
    return this.ctx && !this.muted && this.ctx.state === 'running';
  }

  tone({ freq, to, dur, type = 'sine', vol = 0.3, delay = 0 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur, vol = 0.4, from = 3000, to = 200 }) {
    if (!this.ready) return;
    const c = this.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  gem() {
    this.tone({ freq: 1046, dur: 0.12, type: 'triangle', vol: 0.25 });
    this.tone({ freq: 1568, dur: 0.18, type: 'triangle', vol: 0.22, delay: 0.06 });
  }

  crash() {
    this.noise({ dur: 0.9, vol: 0.6, from: 2500, to: 80 });
    this.tone({ freq: 140, to: 40, dur: 0.5, type: 'square', vol: 0.18 });
  }

  launch() {
    this.tone({ freq: 220, to: 880, dur: 0.35, type: 'triangle', vol: 0.25 });
  }

  milestone() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.18, type: 'square', vol: 0.12, delay: i * 0.08 }));
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.22, delay: 0.3 + i * 0.18 }));
  }
}
