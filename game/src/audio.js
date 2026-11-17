// All sound is synthesised with WebAudio: no audio files, nothing fetched. Short oscillator and
// noise blips cover the effects, and a tiny lookahead scheduler loops a bass-and-arpeggio music
// pattern. The context is created lazily on the first user gesture (browsers refuse it sooner),
// and every call is a no-op until then — screenshot scenes therefore stay silent and safe.

const MUSIC = {
  bpm: 112,
  // A minor bassline, one note per eighth note, two bars (frequencies in Hz).
  bass: [55, 0, 55, 55, 0, 55, 0, 65.41, 55, 0, 55, 55, 0, 82.41, 0, 73.42],
  // A sparse pentatonic sparkle over the top, four bars long; 0 means rest.
  arp: [440, 0, 523.25, 0, 659.25, 0, 523.25, 0, 440, 0, 523.25, 0, 783.99, 0, 659.25, 0,
    440, 0, 523.25, 0, 659.25, 0, 523.25, 0, 587.33, 0, 523.25, 0, 440, 0, 0, 0],
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;

  /** Create (or resume) the context. Call from a key or pointer gesture handler. */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(ctx.destination);
    return true;
  }

  function tone({ freq = 440, end = null, dur = 0.15, type = 'sine', vol = 0.2, delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, vol = 0.25, freq = 1200, delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
  }

  function scheduleStep(stepIndex, t0) {
    const bassFreq = MUSIC.bass[stepIndex % MUSIC.bass.length];
    if (bassFreq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = bassFreq;
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    }
    const arpFreq = MUSIC.arp[stepIndex % MUSIC.arp.length];
    if (arpFreq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = arpFreq;
      gain.gain.setValueAtTime(0.05, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    }
  }

  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.06;
    const stepDur = 60 / MUSIC.bpm / 2;
    musicTimer = window.setInterval(() => {
      if (!ctx) return;
      while (nextNoteTime < ctx.currentTime + 0.14) {
        if (!muted) scheduleStep(step, nextNoteTime);
        nextNoteTime += stepDur;
        step += 1;
      }
    }, 46);
  }

  function stopMusic() {
    if (musicTimer !== null) window.clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    ensure,
    startMusic,
    stopMusic,
    shoot() {
      tone({ freq: 840, end: 240, dur: 0.07, type: 'square', vol: 0.07 });
    },
    explosion(big = false) {
      noise({ dur: big ? 0.4 : 0.22, vol: big ? 0.32 : 0.2, freq: big ? 900 : 1400 });
      tone({ freq: big ? 150 : 190, end: 42, dur: big ? 0.36 : 0.22, type: 'sine', vol: 0.22 });
    },
    echo() {
      tone({ freq: 320, end: 940, dur: 0.34, type: 'sine', vol: 0.13 });
      tone({ freq: 640, end: 1500, dur: 0.28, type: 'sine', vol: 0.06, delay: 0.05 });
    },
    hurt() {
      tone({ freq: 130, end: 55, dur: 0.3, type: 'sawtooth', vol: 0.24 });
      noise({ dur: 0.18, vol: 0.16, freq: 700 });
    },
    waveClear() {
      tone({ freq: 659.25, dur: 0.14, type: 'triangle', vol: 0.16 });
      tone({ freq: 987.77, dur: 0.22, type: 'triangle', vol: 0.16, delay: 0.11 });
    },
    gameOver() {
      [392, 311.13, 233.08, 155.56].forEach((freq, i) => {
        tone({ freq, dur: 0.3, type: 'triangle', vol: 0.18, delay: i * 0.17 });
      });
    },
    gameClear() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone({ freq, dur: 0.26, type: 'triangle', vol: 0.17, delay: i * 0.12 });
      });
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.42;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
