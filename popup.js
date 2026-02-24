let updateInterval    = null;
let breakCountdownInterval = null;

let settings = {
  interval:      20,
  duration:      20,
  enabled:       true,
  soundEnabled:  true,
  selectedSound: 'gentle-bell',
  blinkReminders: true,
  darkMode:      false,
  snoozeMinutes: 5
};

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.sync.get(null, (data) => {
  settings = { ...settings, ...data };
  console.log('Initializing with settings:', data);

  if (data.isBreakActive === true) {
    showBreakView();
  } else if (data.breakComplete === true) {
    showBreakComplete();
  } else {
    initializeUI();
    startRealtimeUpdates();
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.isBreakActive) {
    if (changes.isBreakActive.newValue === true) {
      showBreakView();
    } else if (changes.isBreakActive.newValue === false &&
               document.getElementById('breakView').style.display !== 'none') {
      showMainView();
    }
  }
  if (changes.breakComplete && changes.breakComplete.newValue === true) {
    showBreakComplete();
  }
  if (changes.enabled != null) {
    settings.enabled = changes.enabled.newValue;
    // Reflect the enabled/disabled state on the toggle button live.
    if (document.getElementById('mainView').style.display !== 'none') {
      chrome.storage.sync.get(['isPaused'], (data) => {
        updateToggleButton(!!data.isPaused);
      });
    }
  }
  if (changes.interval != null)      settings.interval      = changes.interval.newValue;
  if (changes.snoozeMinutes != null) settings.snoozeMinutes = changes.snoozeMinutes.newValue;
  if (changes.isPaused != null) {
    // Reflect pause state change on toggle button if main view is active
    if (document.getElementById('mainView').style.display !== 'none') {
      updateToggleButton(changes.isPaused.newValue);
    }
  }
});

// ─── Break View ───────────────────────────────────────────────────────────────

function showBreakView() {
  document.getElementById('mainView').style.display  = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('breakView').style.display = 'flex';
  document.getElementById('breakComplete').style.display = 'none';
  document.getElementById('skipBreakBtn').style.display  = 'block';
  document.getElementById('snoozeBreakBtn').style.display = 'block';
  document.getElementById('breakTimer').parentElement.style.display = 'block';

  chrome.storage.sync.get(
    ['darkMode', 'breakDuration', 'duration', 'blinkReminders', 'snoozeMinutes'],
    (data) => {
      document.body.classList.toggle('dark-mode', !!data.darkMode);
      settings.snoozeMinutes = data.snoozeMinutes ?? 5;

      let timeLeft = data.breakDuration || data.duration || 20;
      document.getElementById('breakTimer').textContent = timeLeft;
      document.getElementById('breakMessage').textContent = data.blinkReminders
        ? 'Look 20 feet away and blink fully'
        : 'Look at something 20 feet away';

      if (breakCountdownInterval) {
        clearInterval(breakCountdownInterval);
        breakCountdownInterval = null;
      }

      breakCountdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(breakCountdownInterval);
          breakCountdownInterval = null;
          chrome.runtime.sendMessage({ action: 'breakComplete' }, (response) => {
            showBreakComplete(response);
          });
        } else {
          document.getElementById('breakTimer').textContent = timeLeft;
        }
      }, 1000);
    }
  );
}

function showBreakComplete(response) {
  chrome.storage.sync.get(['soundEnabled', 'selectedSound'], (data) => {
    if (data.soundEnabled !== false) {
      SoundManager.play(data.selectedSound || 'gentle-bell');
    }
  });

  document.getElementById('breakTimer').parentElement.style.display = 'none';
  document.getElementById('skipBreakBtn').style.display   = 'none';
  document.getElementById('snoozeBreakBtn').style.display = 'none';
  document.getElementById('breakComplete').style.display  = 'block';

  if (response) {
    const badge = document.getElementById('achievementBadge');
    if (response.leveledUp) {
      badge.textContent = response.achievement;
      badge.style.display = 'block';
      badge.style.background = 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)';
    } else if (response.achievement) {
      badge.textContent = response.achievement;
      badge.style.display = 'block';
    }
    const msgs = [
      `+${response.xpGain || 15} XP! Eyes refreshed! ✨`,
      `+${response.xpGain || 15} XP! Excellent! 🌟`,
      `+${response.xpGain || 15} XP! You rock! 💪`,
      `+${response.xpGain || 15} XP! Amazing! 🎉`
    ];
    document.getElementById('completeText').textContent =
      msgs[Math.floor(Math.random() * msgs.length)];
  }

  setTimeout(() => {
    chrome.storage.sync.set({ isBreakActive: false, breakComplete: false }, () => {
      showMainView();
    });
  }, 3000);
}

function skipBreak() {
  if (breakCountdownInterval) {
    clearInterval(breakCountdownInterval);
    breakCountdownInterval = null;
  }
  chrome.runtime.sendMessage({ action: 'breakSkipped' });
  chrome.storage.sync.set({ isBreakActive: false }, () => showMainView());
}

function snoozeBreak() {
  if (breakCountdownInterval) {
    clearInterval(breakCountdownInterval);
    breakCountdownInterval = null;
  }
  chrome.runtime.sendMessage({ action: 'snoozeBreak' }, (response) => {
    console.log('Snoozed for', response && response.snoozeMinutes, 'minutes');
  });
  chrome.storage.sync.set({ isBreakActive: false }, () => showMainView());
}

// ─── Main View ────────────────────────────────────────────────────────────────

function showMainView() {
  if (breakCountdownInterval) {
    clearInterval(breakCountdownInterval);
    breakCountdownInterval = null;
  }
  document.getElementById('breakView').style.display    = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('mainView').style.display     = 'block';
  document.getElementById('breakTimer').parentElement.style.display = 'block';
  document.getElementById('breakComplete').style.display = 'none';

  initializeUI();
  startRealtimeUpdates();
}

function initializeUI() {
  document.getElementById('intervalInput').value  = settings.interval;
  document.getElementById('durationInput').value  = settings.duration;
  document.getElementById('snoozeInput').value    = settings.snoozeMinutes ?? 5;

  document.getElementById('blinkToggle').classList.toggle('active', !!settings.blinkReminders);
  document.getElementById('darkModeToggle').classList.toggle('active', !!settings.darkMode);
  document.getElementById('soundToggle').classList.toggle('active', settings.soundEnabled !== false);

  document.body.classList.toggle('dark-mode', !!settings.darkMode);

  document.getElementById('soundSettings').style.display =
    (settings.soundEnabled !== false) ? 'flex' : 'none';

  document.querySelectorAll('.sound-option[data-sound]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sound === settings.selectedSound);
  });

  updateStats();
  updatePet();

  // Read isPaused fresh from storage for toggle button
  chrome.storage.sync.get(['isPaused'], (data) => {
    updateToggleButton(!!data.isPaused);
  });
}

// ─── Toggle (Pause / Resume / Enable) ────────────────────────────────────────

function updateToggleButton(isPaused) {
  const pauseIcon  = document.getElementById('pauseIcon');
  const playIcon   = document.getElementById('playIcon');
  const statusText = document.getElementById('statusText');
  const toggleBtn  = document.getElementById('toggleBtn');

  if (!settings.enabled) {
    // Disabled state: show play icon so user can click to re-enable.
    pauseIcon.style.display  = 'none';
    playIcon.style.display   = 'block';
    statusText.textContent   = 'Disabled — click ▶ to enable';
    statusText.style.color   = '#ef4444';
    toggleBtn.title = 'Enable breaks';
    return;
  }

  if (isPaused) {
    pauseIcon.style.display  = 'none';
    playIcon.style.display   = 'block';
    statusText.textContent   = 'Paused';
    statusText.style.color   = '#f59e0b';
    toggleBtn.title = 'Resume';
  } else {
    pauseIcon.style.display  = 'block';
    playIcon.style.display   = 'none';
    statusText.textContent   = 'Active';
    statusText.style.color   = '#10b981';
    toggleBtn.title = 'Pause';
  }
}

// ─── Timer display ────────────────────────────────────────────────────────────

function startRealtimeUpdates() {
  if (updateInterval) clearInterval(updateInterval);
  updateTimerDisplay();
  updateInterval = setInterval(updateTimerDisplay, 1000);
}

/**
 * IMPORTANT: MV3 service worker may occasionally not respond fast enough.
 * In that case, we must NOT assume "Active" (isPaused=false), because that
 * causes the UI to appear to auto-resume after pausing.
 */
function updateTimerDisplay() {
  chrome.runtime.sendMessage({ action: 'getTimeRemaining' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Fallback: read state from storage and render consistently.
      chrome.storage.sync.get(
        ['enabled', 'isPaused', 'pausedRemainingMs', 'nextAlarmFireTime', 'interval', 'isSnoozed', 'snoozeMinutes'],
        (data) => {
          settings.enabled = data.enabled !== false;

          const isPaused = !!data.isPaused;
          const isSnoozed = !!data.isSnoozed;

          let remainingMs = 0;

          if (!settings.enabled) {
            // Disabled: show full interval (or pausedRemaining if present) but keep disabled UI.
            remainingMs = (data.pausedRemainingMs != null)
              ? data.pausedRemainingMs
              : (data.interval ?? 20) * 60000;
          } else if (isPaused) {
            remainingMs = data.pausedRemainingMs ?? (data.interval ?? 20) * 60000;
          } else if (data.nextAlarmFireTime) {
            remainingMs = Math.max(0, data.nextAlarmFireTime - Date.now());
          } else {
            // Unknown running state: keep display stable by showing full base.
            remainingMs = (data.interval ?? 20) * 60000;
          }

          const baseMs = isSnoozed
            ? (data.snoozeMinutes ?? 5) * 60000
            : (data.interval ?? 20) * 60000;

          updateToggleButton(isPaused);
          renderTimer(remainingMs, baseMs, isSnoozed, isPaused);
        }
      );
      return;
    }

    const { timeRemaining, isSnoozed, isPaused } = response;

    // Update pause/play icon
    updateToggleButton(!!isPaused);

    chrome.storage.sync.get(['interval', 'snoozeMinutes'], (data) => {
      const baseMs = isSnoozed
        ? (data.snoozeMinutes ?? 5) * 60000
        : (data.interval ?? 20) * 60000;
      renderTimer(timeRemaining, baseMs, isSnoozed, isPaused);
    });
  });
}

function renderTimer(remainingMs, baseMs, isSnoozed, isPaused) {
  const totalSecs = Math.ceil(remainingMs / 1000);
  const minutes   = Math.floor(totalSecs / 60);
  const seconds   = totalSecs % 60;

  document.getElementById('nextBreakTime').textContent =
    `${minutes}:${String(seconds).padStart(2, '0')}`;

  const elapsed  = baseMs - remainingMs;
  const progress = Math.max(0, Math.min(100, (elapsed / baseMs) * 100));
  document.getElementById('progressFill').style.width = `${progress}%`;

  const statusText = document.getElementById('statusText');
  if (!settings.enabled) {
    statusText.textContent = 'Disabled — click ▶ to enable';
    statusText.style.color = '#ef4444';
  } else if (isPaused) {
    statusText.textContent = 'Paused';
    statusText.style.color = '#f59e0b';
  } else if (isSnoozed) {
    statusText.textContent = 'Snoozed';
    statusText.style.color = '#a78bfa';
  } else {
    statusText.textContent = 'Active';
    statusText.style.color = '#10b981';
  }
}

// ─── Stats / Pet ──────────────────────────────────────────────────────────────

function updatePet() {
  chrome.storage.sync.get(['eyePetName', 'eyePetMood', 'eyePetLevel', 'eyePetXP'], (data) => {
    const petName  = data.eyePetName  || 'Eye Buddy';
    const petMood  = data.eyePetMood  || 'happy';
    const petLevel = data.eyePetLevel || 1;
    const petXP    = data.eyePetXP    || 0;
    const xpNeeded = petLevel * 100;

    document.getElementById('petName').textContent  = petName;
    document.getElementById('petLevel').textContent = petLevel;

    const pct = Math.min(100, (petXP / xpNeeded) * 100);
    document.getElementById('petXPFill').style.width = `${pct}%`;
    document.getElementById('petXPText').textContent = `${petXP}/${xpNeeded} XP`;

    const petBody  = document.querySelector('.pet-body');
    petBody.className = `pet-body ${petMood}`;

    const mouths = { ecstatic: '◠', happy: '◡', content: '⌣', sleepy: '~' };
    document.getElementById('petMouth').textContent = mouths[petMood] || '◡';

    const bubbles = {
      ecstatic: ["I'm so energized! Let's keep going!", "You're the best! My energy is maxed!", "Woohoo! This is amazing!"],
      happy:    ["Thanks for taking care of me! 😊", "Your eyes feel great, right?", "We make a great team!"],
      content:  ["Doing good! Keep it up!", "Nice and relaxed here~", "We're on the right track!"],
      sleepy:   ["Could use a break soon...", "Getting a bit tired here...", "Remember to blink!"]
    };
    const msgs = bubbles[petMood] || bubbles.happy;
    document.getElementById('petBubble').textContent = msgs[Math.floor(Math.random() * msgs.length)];
  });
}

function updateStats() {
  chrome.storage.sync.get(
    ['breaksToday', 'totalBreaksCompleted', 'eyeScore', 'latestAchievement'],
    (data) => {
      document.getElementById('breaksToday').textContent  = data.breaksToday          || 0;
      document.getElementById('totalBreaks').textContent  = data.totalBreaksCompleted || 0;
      document.getElementById('eyeScore').textContent     = data.eyeScore             || 100;

      if (data.latestAchievement) {
        const card = document.getElementById('motivationCard');
        document.getElementById('motivationText').textContent = data.latestAchievement;
        card.style.display = 'flex';
        setTimeout(() => {
          card.style.display = 'none';
          chrome.storage.sync.set({ latestAchievement: null });
        }, 10000);
      }
    }
  );
}

// ─── Save settings ────────────────────────────────────────────────────────────

function showSaveStatus() {
  const el = document.getElementById('saveStatus');
  el.textContent = '✓ Settings saved!';
  el.classList.add('success');
  setTimeout(() => {
    el.textContent = '';
    el.classList.remove('success');
  }, 3000);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
  if (updateInterval) clearInterval(updateInterval);
  document.getElementById('mainView').style.display    = 'none';
  document.getElementById('settingsView').style.display = 'block';
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('mainView').style.display     = 'block';
  startRealtimeUpdates();
});

// Pause / Resume / Enable toggle
document.getElementById('toggleBtn').addEventListener('click', () => {
  if (!settings.enabled) {
    // Re-enable breaks after "Turn off breaks" notification action.
    chrome.runtime.sendMessage({ action: 'enableBreaks' }, () => {
      settings.enabled = true;
      updateToggleButton(false);
    });
    return;
  }

  chrome.storage.sync.get(['isPaused'], (data) => {
    if (data.isPaused) {
      // Resume
      chrome.runtime.sendMessage({ action: 'resumeTimer' }, () => {
        updateToggleButton(false);
      });
    } else {
      // Pause
      chrome.runtime.sendMessage({ action: 'pauseTimer' }, () => {
        updateToggleButton(true);
      });
    }
  });
});

// Reset button
document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'resetTimer' }, () => {
    updateTimerDisplay();
  });
});

document.getElementById('blinkToggle').addEventListener('click', function () {
  this.classList.toggle('active');
  settings.blinkReminders = this.classList.contains('active');
});

document.getElementById('darkModeToggle').addEventListener('click', function () {
  this.classList.toggle('active');
  settings.darkMode = this.classList.contains('active');
  document.body.classList.toggle('dark-mode', settings.darkMode);
});

document.getElementById('soundToggle').addEventListener('click', function () {
  this.classList.toggle('active');
  settings.soundEnabled = this.classList.contains('active');
  document.getElementById('soundSettings').style.display =
    settings.soundEnabled ? 'flex' : 'none';
});

document.querySelectorAll('.sound-option[data-sound]').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.sound-option[data-sound]').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    settings.selectedSound = this.dataset.sound;
    SoundManager.play(settings.selectedSound);
  });
});

document.getElementById('testSoundBtn').addEventListener('click', () => {
  SoundManager.play(settings.selectedSound);
});

document.getElementById('testNotificationBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'testNotification' });
});

document.getElementById('skipBreakBtn').addEventListener('click', skipBreak);
document.getElementById('snoozeBreakBtn').addEventListener('click', snoozeBreak);

document.getElementById('turnOffBtn')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'disableBreaks' }, () => {
    settings.enabled = false;
    // Force UI refresh
    updateToggleButton(false);
    updateTimerDisplay();
  });
});

document.getElementById('turnOffBtnBreak')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'disableBreaks' }, () => {
    settings.enabled = false;
    chrome.storage.sync.set({ isBreakActive: false }, () => {
      showMainView();
    });
  });
});

// Save settings – immediately applies new values
document.getElementById('saveBtn').addEventListener('click', () => {
  const newInterval     = Math.max(1,   Math.min(1440, parseInt(document.getElementById('intervalInput').value)  || 20));
  const newDuration     = Math.max(5,   Math.min(300,  parseInt(document.getElementById('durationInput').value)  || 20));
  const newSnooze       = Math.max(1,   Math.min(120,  parseInt(document.getElementById('snoozeInput').value)    || 5));
  const newEnabled      = settings.enabled; // preserve current enabled state
  const newSoundEnabled = settings.soundEnabled;
  const newSound        = settings.selectedSound;
  const newBlink        = settings.blinkReminders;
  const newDark         = settings.darkMode;

  // Persist to storage first
  chrome.storage.sync.set({
    interval:      newInterval,
    duration:      newDuration,
    snoozeMinutes: newSnooze,
    enabled:       newEnabled,
    soundEnabled:  newSoundEnabled,
    selectedSound: newSound,
    blinkReminders: newBlink,
    darkMode:      newDark
  }, () => {
    // Tell background to apply immediately
    chrome.runtime.sendMessage({
      action:        'applySettings',
      interval:      newInterval,
      duration:      newDuration,
      snoozeMinutes: newSnooze,
      enabled:       newEnabled
    }, () => {
      settings.interval      = newInterval;
      settings.duration      = newDuration;
      settings.snoozeMinutes = newSnooze;

      showSaveStatus();
      setTimeout(() => {
        document.getElementById('settingsView').style.display = 'none';
        document.getElementById('mainView').style.display     = 'block';
        startRealtimeUpdates();
      }, 800);
    });
  });
});

setInterval(updateStats, 10000);
setInterval(updatePet,   8000);

window.addEventListener('unload', () => {
  if (updateInterval) clearInterval(updateInterval);
});