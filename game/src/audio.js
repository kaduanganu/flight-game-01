// Sound made, not shipped: a WebAudio engine hum whose pitch follows the
// throttle, a chime for a ring, a thud for a crash and a fanfare for landing.
// No audio files, no network.
export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engine.start();
    return ctx;
  }

  function blip(freq, seconds, type = 'sine', volume = 0.16) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    engine(throttle, flying) {
      if (!ensure()) return;
      const target = muted || !flying ? 0 : 0.02 + (throttle / 100) * 0.05;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
      engine.frequency.setTargetAtTime(48 + throttle * 0.9, ctx.currentTime, 0.2);
    },
    ring() {
      blip(880, 0.25);
      setTimeout(() => blip(1318, 0.3), 90);
    },
    crash() {
      blip(70, 0.5, 'square', 0.25);
    },
    land() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.35), i * 120));
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
