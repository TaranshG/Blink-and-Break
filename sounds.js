// Shared by the popup and the background audio document.
const SoundManager = {
  customAudio: null,
  activeAudio: null,

  async play(soundName) {
    const names = ['gentle-bell', 'soft-chime', 'calm-tone', 'nature-bird'];
    if (this.activeAudio) this.activeAudio.pause();
    const audio = soundName === 'custom' && this.customAudio
      ? this.customAudio
      : new Audio(chrome.runtime.getURL(`sounds/${names.includes(soundName) ? soundName : 'gentle-bell'}.wav`));
    audio.currentTime = 0;
    this.activeAudio = audio;
    await audio.play();
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
if (chrome.storage?.local) SoundManager.loadCustomSound();