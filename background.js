console.log('=== BACKGROUND WORKER STARTED ===');

let settings = {
  interval: 20,
  duration: 20,
  enabled: true,
  snoozeMinutes: 5
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function clearAllBreakAlarms(cb) {
  chrome.alarms.clear('eyeBreak', () => {
    chrome.alarms.clear('eyeBreakSnooze', () => {
      if (cb) cb();
    });
  });
}

/**
 * Schedule the primary break alarm delayMs milliseconds from now.
 * Clears any existing break/snooze alarms first to prevent duplicates.
 * Persists nextAlarmFireTime so popup and restart-recovery can use it.
 * NOTE: All work (create alarm + write storage) happens inside the
 * clearAllBreakAlarms callback to prevent race conditions.
 */
function scheduleBreakInMs(delayMs, onScheduled, isSnoozed = false) {
  if (delayMs < 0) delayMs = 0;
  clearAllBreakAlarms(() => {
    // Create the alarm and write storage INSIDE the callback so there is
    // no race with the clear operation.
    // Preserve the exact remaining time. Chrome may deliver short alarms late.
    const fireTime = Date.now() + delayMs;
    chrome.alarms.create('eyeBreak', { when: fireTime });
    chrome.storage.sync.set({
      nextAlarmFireTime: fireTime,
      isPaused: false,
      pausedRemainingMs: null,
      isSnoozed
    }, () => { if (onScheduled) onScheduled(); });
    chrome.alarms.get('eyeBreak', (alarm) => {
      if (alarm) {
        console.log(`✅ Break scheduled for: ${new Date(alarm.scheduledTime).toLocaleTimeString()}`);
      } else {
        console.error('❌ FAILED to create alarm!');
      }
    });
  });
}

function scheduleBreak(minutes) {
  scheduleBreakInMs(minutes * 60000);
}

function scheduleSnooze(minutes) {
  // Enforce minimum 1-minute snooze so alarm is guaranteed to fire.
  if (minutes < 1) minutes = 1;
  const delayMs = minutes * 60000;
  const fireTime = Date.now() + delayMs;
  clearAllBreakAlarms(() => {
    chrome.alarms.create('eyeBreakSnooze', { delayInMinutes: minutes });
    chrome.storage.sync.set({
      nextAlarmFireTime: fireTime,
      isPaused: false,
      pausedRemainingMs: null,
      isSnoozed: true
    });
    console.log(`💤 Snooze alarm set for ${minutes} minutes`);
  });
}

function openBreakPopupWindow() {
  chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 420,
    height: 640,
    focused: true
  });
}

// ─── Install ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('🔧 Extension installed/updated');

  const stored = await chrome.storage.sync.get([
    'interval', 'enabled', 'duration', 'snoozeMinutes'
  ]);

  settings = {
    interval:      stored.interval      ?? 20,
    duration:      stored.duration      ?? 20,
    enabled:       stored.enabled       !== false,
    snoozeMinutes: stored.snoozeMinutes ?? 5
  };

  // Only write defaults for keys that are genuinely absent.
  // Never overwrite user data (stats, pet state, etc.) on update.
  const defaults = {};
  if (stored.interval      == null) defaults.interval      = 20;
  if (stored.duration      == null) defaults.duration      = 20;
  if (stored.snoozeMinutes == null) defaults.snoozeMinutes = 5;
  if (stored.enabled       == null) defaults.enabled       = true;

  // Always reset transient scheduling state on install/update.
  await chrome.storage.sync.set({
    ...defaults,
    isPaused:          false,
    pausedRemainingMs: null,
    isSnoozed:         false,
    isBreakActive:     false
    // NOTE: Do NOT reset stats or pet state here so user data survives updates.
  });

  // Initialise non-scheduling defaults only if they are absent.
  const stored2 = await chrome.storage.sync.get([
    'soundEnabled', 'selectedSound', 'breaksToday', 'totalBreaksCompleted',
    'eyeScore', 'eyePetLevel', 'eyePetXP', 'eyePetMood', 'achievements'
  ]);
  const initDefaults = {};
  if (stored2.soundEnabled         == null) initDefaults.soundEnabled         = true;
  if (stored2.selectedSound        == null) initDefaults.selectedSound        = 'gentle-bell';
  if (stored2.breaksToday          == null) initDefaults.breaksToday          = 0;
  if (stored2.totalBreaksCompleted == null) initDefaults.totalBreaksCompleted = 0;
  if (stored2.eyeScore             == null) initDefaults.eyeScore             = 100;
  if (stored2.eyePetLevel          == null) initDefaults.eyePetLevel          = 1;
  if (stored2.eyePetXP             == null) initDefaults.eyePetXP             = 0;
  if (stored2.eyePetMood           == null) initDefaults.eyePetMood           = 'happy';
  if (stored2.achievements         == null) initDefaults.achievements         = [];
  if (Object.keys(initDefaults).length > 0) {
    await chrome.storage.sync.set(initDefaults);
  }

  console.log('📋 Settings initialized:', settings);

  if (settings.enabled) {
    scheduleBreak(settings.interval);
  }
});

// ─── Alarm handler ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`🔔 ALARM FIRED: ${alarm.name} at ${new Date().toLocaleTimeString()}`);
  if (alarm.name === 'eyeBreak' || alarm.name === 'eyeBreakSnooze') {
    chrome.storage.sync.set({ isSnoozed: false });
    showBreakNotification();
  }
});

// ─── Notification ─────────────────────────────────────────────────────────────

// Lazily create one audio document; Chrome closes it after 30 seconds of silence.
let creatingAudioDocument;

async function ensureAudioDocument() {
  if (!creatingAudioDocument) {
    creatingAudioDocument = (async () => {
      const url = chrome.runtime.getURL('offscreen.html');
      const contexts = chrome.runtime.getContexts
        ? await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] })
        : (await clients.matchAll()).filter(client => client.url === url);
      if (contexts.length) return;
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play the selected break reminder chime while the popup is closed.'
      });
    })().finally(() => { creatingAudioDocument = null; });
  }
  await creatingAudioDocument;
}

async function playReminderSound(sound) {
  await ensureAudioDocument();
  const result = await chrome.runtime.sendMessage({
    target: 'reminder-audio', action: 'playSound', sound
  });
  if (!result?.success) throw new Error(result?.error || 'The reminder sound could not start.');
}

async function createNotification(id, content) {
  const [platform, permission, preferences] = await Promise.all([
    chrome.runtime.getPlatformInfo(),
    chrome.notifications.getPermissionLevel(),
    chrome.storage.sync.get(['soundEnabled', 'selectedSound'])
  ]);
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Check the extension notification permission and your browser’s system notification settings.');
  }

  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    priority: 2,
    // Play one selected app chime, avoiding a second system sound.
    silent: true,
    ...content,
    // Use standard banners on macOS and persistent reminders elsewhere.
    requireInteraction: platform.os !== 'mac'
  });
  let soundError;
  if (preferences.soundEnabled !== false) {
    try { await playReminderSound(preferences.selectedSound || 'gentle-bell'); }
    catch (error) { soundError = error.message; }
  }
  return { soundEnabled: preferences.soundEnabled !== false, soundError };
}

async function showBreakNotification() {
  console.log('📢 Showing break notification...');

  const stored = await chrome.storage.sync.get(['duration']);
  const dur = stored.duration ?? settings.duration ?? 20;

  await chrome.storage.sync.set({
    isBreakActive:     true,
    breakStartTime:    Date.now(),
    breakDuration:     dur,
    nextAlarmFireTime: null
  });

  const messages = [
    'Time for an eye break! 👀',
    'Quick break time! ✨',
    'Give your eyes a rest! 💙',
    'Break time! 🌟'
  ];
  const title = messages[Math.floor(Math.random() * messages.length)];

  try {
    const result = await createNotification('eyeBreak', {
      title,
      // Clicking the banner works even when macOS hides the action buttons.
      message:            `Click this notification to begin your ${dur}-second break`,
      // Button order matters: primary action first.
      buttons: [
        { title: '▶ Start break' },
        { title: '💤 Snooze' }
      ]
    });
    if (result.soundError) console.error('Reminder sound failed:', result.soundError);
    console.log('✅ Notification created');
  } catch (error) {
    console.error('❌ Notification failed:', error);
  }
}

chrome.notifications.onClicked.addListener((notificationId) => {
  console.log(`🖱️ Notification clicked: ${notificationId}`);
  chrome.notifications.clear(notificationId);
  if (notificationId === 'eyeBreak') openBreakPopupWindow();
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  console.log(`🖱️ Notification button: ${notificationId}, index: ${buttonIndex}`);
  chrome.notifications.clear(notificationId);

  if (notificationId !== 'eyeBreak') return;

  if (buttonIndex === 0) {
    // Start break
    openBreakPopupWindow();
    return;
  }

  if (buttonIndex === 1) {
  // Snooze
  chrome.storage.sync.get(['snoozeMinutes'], (data) => {
    const snoozeMin = data.snoozeMinutes ?? settings.snoozeMinutes ?? 5;

    chrome.storage.sync.set({ isBreakActive: false }, () => {
      scheduleSnooze(snoozeMin);
      console.log(`💤 Snoozed from notification for ${snoozeMin} minutes`);
    });
  });

  return;
}
});

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === 'reminder-audio') return;
  console.log('📨 Message received:', request.action);

  if (request.action === 'testReminderSound') {
    chrome.storage.sync.get(['selectedSound']).then(data =>
      playReminderSound(data.selectedSound || 'gentle-bell')
    ).then(
      () => sendResponse({ success: true }),
      error => sendResponse({ success: false, error: error.message })
    );
    return true;
  }

  // ── getTimeRemaining ──────────────────────────────────────────────────────
  if (request.action === 'getTimeRemaining') {
    chrome.storage.sync.get(
      ['isPaused', 'pausedRemainingMs', 'nextAlarmFireTime', 'interval', 'isSnoozed', 'snoozeMinutes'],
      (data) => {
        if (data.isPaused) {
          sendResponse({
            timeRemaining: data.pausedRemainingMs ?? 0,
            isSnoozed:     !!data.isSnoozed,
            isPaused:      true
          });
          return;
        }

        if (data.nextAlarmFireTime) {
          const remaining = Math.max(0, data.nextAlarmFireTime - Date.now());
          sendResponse({
            timeRemaining: remaining,
            isSnoozed:     !!data.isSnoozed,
            isPaused:      false
          });
          return;
        }

        // Fallback: check actual alarm objects
        chrome.alarms.get('eyeBreakSnooze', (snoozeAlarm) => {
          if (snoozeAlarm) {
            sendResponse({
              timeRemaining: Math.max(0, snoozeAlarm.scheduledTime - Date.now()),
              isSnoozed:     true,
              isPaused:      false
            });
            return;
          }
          chrome.alarms.get('eyeBreak', (alarm) => {
            if (alarm) {
              sendResponse({
                timeRemaining: Math.max(0, alarm.scheduledTime - Date.now()),
                isSnoozed:     false,
                isPaused:      false
              });
            } else {
              const fallback = (data.interval ?? 20) * 60000;
              sendResponse({ timeRemaining: fallback, isSnoozed: false, isPaused: false });
            }
          });
        });
      }
    );
    return true;
  }

    // ── enableBreaks ───────────────────────────────────────────────────────────
  if (request.action === 'enableBreaks') {
    settings.enabled = true;

    chrome.storage.sync.set({
      enabled:           true,
      isBreakActive:     false,
      isSnoozed:         false
      // keep isPaused/pausedRemainingMs as-is (if user paused intentionally)
    }, () => {
      // If paused, don't force scheduling; user should explicitly resume.
      chrome.storage.sync.get(['isPaused', 'interval'], (data) => {
        if (!data.isPaused) {
          const interval = data.interval ?? settings.interval ?? 20;
          scheduleBreak(interval);
        }
        sendResponse({ success: true });
      });
    });

    return true;
  }

  // ── disableBreaks ──────────────────────────────────────────────────────────
  if (request.action === 'disableBreaks') {
    settings.enabled = false;

    clearAllBreakAlarms(() => {
      chrome.notifications.clear('eyeBreak', () => {});
      chrome.storage.sync.set({
        enabled:           false,
        isBreakActive:     false,
        isSnoozed:         false,
        isPaused:          false,
        pausedRemainingMs: null,
        nextAlarmFireTime: null
      }, () => {
        sendResponse({ success: true });
      });
    });

    return true;
  }

  // ── pauseTimer ────────────────────────────────────────────────────────────
  if (request.action === 'pauseTimer') {
    chrome.storage.sync.get(['isPaused', 'pausedRemainingMs', 'nextAlarmFireTime', 'interval'], (data) => {
      // Repeated pause requests must not replace the frozen remainder.
      if (data.isPaused) {
        sendResponse({ success: true, pausedRemainingMs: data.pausedRemainingMs ?? 0 });
        return;
      }
      const freeze = (fireTime) => {
        const remaining = fireTime != null
          ? Math.max(0, fireTime - Date.now())
          : (data.interval ?? 20) * 60000;
        chrome.storage.sync.set({
          isPaused: true,
          pausedRemainingMs: remaining,
          nextAlarmFireTime: null
        }, () => clearAllBreakAlarms(() => {
          sendResponse({ success: true, pausedRemainingMs: remaining });
        }));
      };
      if (data.nextAlarmFireTime != null) {
        freeze(data.nextAlarmFireTime);
      } else {
        // Recover the existing timer if its stored deadline is missing.
        chrome.alarms.get('eyeBreakSnooze', snooze => {
          chrome.alarms.get('eyeBreak', alarm => freeze((snooze || alarm)?.scheduledTime));
        });
      }
    });
    return true;
  }

  // ── resumeTimer ───────────────────────────────────────────────────────────
  if (request.action === 'resumeTimer') {
    chrome.storage.sync.get(['isPaused', 'pausedRemainingMs', 'interval', 'isSnoozed'], (data) => {
      if (!data.isPaused) {
        sendResponse({ success: true });
        return;
      }
      const remaining = data.pausedRemainingMs ?? (data.interval ?? 20) * 60000;
      scheduleBreakInMs(remaining, () => sendResponse({ success: true }), !!data.isSnoozed);
    });
    return true;
  }

  // ── resetTimer ────────────────────────────────────────────────────────────
  if (request.action === 'resetTimer') {
    chrome.storage.sync.get(['interval', 'enabled'], (data) => {
      const interval = data.interval ?? 20;
      const enabled  = data.enabled  !== false;
      if (enabled) {
        scheduleBreak(interval);
      } else {
        // Extension is disabled — just update the paused remainder so the
        // display shows the full interval when the user re-enables.
        chrome.storage.sync.set({
          isPaused:          true,
          pausedRemainingMs: interval * 60000,
          nextAlarmFireTime: null
        });
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // ── applySettings ─────────────────────────────────────────────────────────
  if (request.action === 'applySettings') {
    const { interval, duration, snoozeMinutes, enabled } = request;
    settings.interval      = interval;
    settings.duration      = duration;
    settings.snoozeMinutes = snoozeMinutes;
    settings.enabled       = enabled;

    chrome.storage.sync.get(['isPaused'], (data) => {
      if (!enabled || (data.isPaused && request.intervalChanged)) {
        // Apply a changed interval without starting paused/disabled reminders.
        clearAllBreakAlarms(() => {
          chrome.storage.sync.set({
            isPaused:          enabled ? true : false,
            pausedRemainingMs: request.intervalChanged ? interval * 60000 : null,
            nextAlarmFireTime: null,
            isSnoozed:         false
          }, () => sendResponse({ success: true }));
        });
      } else if (data.isPaused) {
        // Other preferences leave the frozen countdown untouched.
        sendResponse({ success: true });
      } else {
        // Respond only after the new countdown is ready for the popup.
        scheduleBreakInMs(interval * 60000, () => sendResponse({ success: true }));
      }
    });
    return true;
  }

  // ── snoozeBreak ───────────────────────────────────────────────────────────
  if (request.action === 'snoozeBreak') {
    chrome.storage.sync.get(['snoozeMinutes'], (data) => {
      const snoozeMin = data.snoozeMinutes ?? settings.snoozeMinutes ?? 5;
      chrome.notifications.clear('eyeBreak', () => {});
      chrome.storage.sync.set({ isBreakActive: false }, () => {
        scheduleSnooze(snoozeMin);
        sendResponse({ success: true, snoozeMinutes: snoozeMin });
      });
    });
    return true;
  }

  // ── breakComplete ─────────────────────────────────────────────────────────
  if (request.action === 'breakComplete') {
    console.log('✅ Break completed');
    chrome.storage.sync.get(
      ['breaksToday', 'totalBreaksCompleted', 'eyeScore', 'eyePetXP', 'eyePetLevel', 'interval', 'enabled'],
      async (data) => {
        const newBreaksToday = (data.breaksToday || 0) + 1;
        const newTotal       = (data.totalBreaksCompleted || 0) + 1;
        const newScore       = Math.min(100, (data.eyeScore || 100) + 2);

        const xpGain       = Math.floor(Math.random() * 15) + 10;
        const currentXP    = (data.eyePetXP || 0) + xpGain;
        const currentLevel = data.eyePetLevel || 1;
        const xpNeeded     = currentLevel * 100;

        let newLevel  = currentLevel;
        let newXP     = currentXP;
        let leveledUp = false;

        if (currentXP >= xpNeeded) {
          newLevel  = currentLevel + 1;
          newXP     = currentXP - xpNeeded;
          leveledUp = true;
        }

        let achievement;
        if (leveledUp) {
          achievement = `🎉 Level ${newLevel}! Your eye buddy evolved!`;
        } else {
          const msgs = [
            `+${xpGain} XP! Great job! ✨`,
            `+${xpGain} XP! Your eyes thank you! 💙`,
            `+${xpGain} XP! Keep it up! 🌟`
          ];
          achievement = msgs[Math.floor(Math.random() * msgs.length)];
        }

        await chrome.storage.sync.set({
          isBreakActive:        false,
          breaksToday:          newBreaksToday,
          totalBreaksCompleted: newTotal,
          eyeScore:             newScore,
          eyePetXP:             newXP,
          eyePetLevel:          newLevel,
          eyePetMood:           'happy',
          latestAchievement:    achievement
        });

        console.log(`📊 Stats: ${newBreaksToday} today, ${newTotal} total`);

        const interval = data.interval ?? 20;
        const enabled  = data.enabled !== false;
        if (enabled) {
          scheduleBreak(interval);
        }

        sendResponse({ success: true, achievement, xpGain, leveledUp });
      }
    );
    return true;
  }

  // ── breakSkipped ──────────────────────────────────────────────────────────
  if (request.action === 'breakSkipped') {
    console.log('⏭️ Break skipped (neutral dismiss)');
    chrome.storage.sync.get(['eyeScore', 'interval', 'enabled'], async (data) => {
      await chrome.storage.sync.set({
        isBreakActive: false,
        eyeScore:      data.eyeScore ?? 100
      });

      const interval = data.interval ?? 20;
      const enabled  = data.enabled  !== false;
      if (enabled) {
        scheduleBreak(interval);
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // ── testNotification ──────────────────────────────────────────────────────
  if (request.action === 'testNotification') {
    createNotification('test', {
      title: 'Test Notification 🧪',
      message: 'If you see this, notifications work!'
    }).then(
      result => sendResponse({ success: true, ...result }),
      (error) => sendResponse({ success: false, error: error.message })
    );
    return true;
  }
});

// ─── Storage change watcher ───────────────────────────────────────────────────
// This watcher keeps the in-memory settings object in sync.
// It does NOT trigger re-scheduling on its own — scheduling is driven
// explicitly by message handlers and applySettings to avoid races.

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;

  if (changes.interval)      settings.interval      = changes.interval.newValue;
  if (changes.duration)      settings.duration      = changes.duration.newValue;
  if (changes.snoozeMinutes) settings.snoozeMinutes = changes.snoozeMinutes.newValue;
  if (changes.enabled)       settings.enabled       = changes.enabled.newValue;
});

// ─── Startup recovery ────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Browser started – recovering state');

  const stored = await chrome.storage.sync.get([
    'interval', 'enabled', 'duration', 'snoozeMinutes',
    'isBreakActive', 'isPaused', 'pausedRemainingMs', 'nextAlarmFireTime', 'isSnoozed'
  ]);

  settings.interval      = stored.interval      ?? 20;
  settings.duration      = stored.duration      ?? 20;
  settings.enabled       = stored.enabled       !== false;
  settings.snoozeMinutes = stored.snoozeMinutes ?? 5;

  if (!settings.enabled || stored.isBreakActive) return;

  if (stored.isPaused) {
    console.log('⏸️ Was paused – staying paused');
    return;
  }

  // Check if a valid alarm already exists (alarms survive SW restart).
  const [breakAlarm, snoozeAlarm] = await Promise.all([
    new Promise(r => chrome.alarms.get('eyeBreak',       r)),
    new Promise(r => chrome.alarms.get('eyeBreakSnooze', r))
  ]);

  if (breakAlarm || snoozeAlarm) {
    // Alarm survived the restart — sync nextAlarmFireTime from it.
    const alarm = breakAlarm || snoozeAlarm;
    chrome.storage.sync.set({ nextAlarmFireTime: alarm.scheduledTime });
    return;
  }

  // No alarm found — recover from stored fire time if still in the future.
  if (stored.nextAlarmFireTime && stored.nextAlarmFireTime > Date.now()) {
    scheduleBreakInMs(stored.nextAlarmFireTime - Date.now());
    return;
  }

  // Fallback: schedule fresh from the full interval.
  console.log('📅 No alarm found on startup – scheduling fresh');
  scheduleBreak(settings.interval);
});

console.log('=== BACKGROUND WORKER READY ===');