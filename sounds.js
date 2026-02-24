// ============================================
// FILE 5: sounds.js
// ============================================
const SoundManager = {
  sounds: {
    'gentle-bell': () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1);
    },

    'soft-chime': () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playNote = (freq, time) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.8);
        osc.start(time);
        osc.stop(time + 0.8);
      };
      const now = ctx.currentTime;
      playNote(523, now);
      playNote(659, now + 0.2);
      playNote(784, now + 0.4);
    },

    'calm-tone': () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = 432;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    },

    'nature-bird': () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playChirp = (time) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(2000, time);
        osc.frequency.exponentialRampToValueAtTime(3500, time + 0.1);
        osc.frequency.exponentialRampToValueAtTime(2000, time + 0.15);
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        osc.start(time);
        osc.stop(time + 0.2);
      };
      const now = ctx.currentTime;
      playChirp(now);
      playChirp(now + 0.3);
    }
  },

  customAudio: null,

  play(soundName) {
    if (soundName === 'custom' && this.customAudio) {
      this.customAudio.currentTime = 0;
      this.customAudio.play().catch(e => console.log('Sound play failed:', e));
    } else if (this.sounds[soundName]) {
      this.sounds[soundName]();
    }
  },

  setCustomSound(file) {
    if (!file || !file.type || !file.type.startsWith('audio/')) return;

    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result;

      // Create audio from the data URL (stable across restarts)
      this.customAudio = new Audio(dataUrl);

      // Persist the data URL (NOT a blob URL)
      chrome.storage.local.set({ customSoundDataUrl: dataUrl });
    };

    reader.onerror = () => {
      console.log('Custom sound read failed');
    };

    reader.readAsDataURL(file);
  },

  loadCustomSound() {
    chrome.storage.local.get(['customSoundDataUrl', 'customSoundUrl'], (data) => {
      // New correct storage key
      if (data.customSoundDataUrl) {
        this.customAudio = new Audio(data.customSoundDataUrl);
        return;
      }

      // Cleanup legacy/broken blob URL if it exists
      if (data.customSoundUrl && typeof data.customSoundUrl === 'string' && data.customSoundUrl.startsWith('blob:')) {
        chrome.storage.local.remove(['customSoundUrl']);
      }
    });
  }
};

// Load custom sound on startup
SoundManager.loadCustomSound();