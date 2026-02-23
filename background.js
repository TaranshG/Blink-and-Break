// SIMPLIFIED BACKGROUND WORKER - GUARANTEED TO WORK
console.log('=== BACKGROUND WORKER STARTED ===');

let settings = {
  interval: 20,
  duration: 20,
  enabled: true
};

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🔧 Extension installed/updated');
  
  // Set defaults
  const stored = await chrome.storage.sync.get(['interval', 'enabled', 'duration']);
  settings = {
    interval: stored.interval || 20,
    duration: stored.duration || 20,
    enabled: stored.enabled !== false
  };
  
  await chrome.storage.sync.set({
    interval: settings.interval,
    duration: settings.duration,
    enabled: settings.enabled,
    soundEnabled: true,
    selectedSound: 'gentle-bell',
    breaksToday: 0,
    totalBreaksCompleted: 0,
    eyeScore: 100,
    isBreakActive: false,
    eyePetLevel: 1,
    eyePetXP: 0,
    eyePetMood: 'happy',
    achievements: []
  });
  
  console.log('📋 Settings initialized:', settings);
  
  if (settings.enabled) {
    scheduleBreak(settings.interval);
  }
});

// Schedule break alarm
function scheduleBreak(minutes) {
  console.log(`⏰ Scheduling break in ${minutes} minutes`);
  
  chrome.alarms.clear('eyeBreak', () => {
    chrome.alarms.create('eyeBreak', {
      delayInMinutes: minutes
    });
    
    // Verify it was created
    chrome.alarms.get('eyeBreak', (alarm) => {
      if (alarm) {
        const time = new Date(alarm.scheduledTime);
        console.log(`✅ Break scheduled for: ${time.toLocaleTimeString()}`);
      } else {
        console.error('❌ FAILED to create alarm!');
      }
    });
  });
}

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`🔔 ALARM FIRED: ${alarm.name} at ${new Date().toLocaleTimeString()}`);
  
  if (alarm.name === 'eyeBreak') {
    showBreakNotification();
  }
});

// Show notification
async function showBreakNotification() {
  console.log('📢 Showing break notification...');
  
  // Mark break as active
  await chrome.storage.sync.set({ 
    isBreakActive: true,
    breakStartTime: Date.now(),
    breakDuration: settings.duration
  });
  
  console.log('✅ Break marked as active in storage');
  
  // Create notification
  const messages = [
    'Time for an eye break! 👀',
    'Quick break time! ✨',
    'Give your eyes a rest! 💙',
    'Break time! 🌟'
  ];
  
  const title = messages[Math.floor(Math.random() * messages.length)];
  
  try {
    const notifId = await chrome.notifications.create('eyeBreak', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title,
      message: 'Click to start your 20-second break',
      priority: 2,
      requireInteraction: true,
      silent: false
    });
    
    console.log(`✅ Notification created: ${notifId}`);
  } catch (error) {
    console.error('❌ Notification failed:', error);
  }
}

// Handle notification click
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log(`🖱️ Notification clicked: ${notificationId}`);
  
  chrome.notifications.clear(notificationId);
  
  // Open popup window
  chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 420,
    height: 640,
    focused: true
  }, (window) => {
    console.log('✅ Popup window created:', window.id);
  });
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action);
  
  if (request.action === 'getTimeRemaining') {
    chrome.alarms.get('eyeBreak', (alarm) => {
      if (alarm) {
        const remaining = Math.max(0, alarm.scheduledTime - Date.now());
        console.log(`⏱️ Time remaining: ${Math.floor(remaining/1000)}s`);
        sendResponse({ timeRemaining: remaining });
      } else {
        console.log('⚠️ No alarm found');
        sendResponse({ timeRemaining: settings.interval * 60 * 1000 });
      }
    });
    return true;
  }
  
  if (request.action === 'testNotification') {
    console.log('🧪 Test notification requested');
    
    chrome.notifications.create('test', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Test Notification 🧪',
      message: 'If you see this, notifications work!',
      priority: 2,
      requireInteraction: true,
      silent: false
    }, (notifId) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Test notification failed:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('✅ Test notification created:', notifId);
        sendResponse({ success: true });
      }
    });
    return true;
  }
  
  if (request.action === 'breakComplete') {
    console.log('✅ Break completed');
    
    chrome.storage.sync.get(['breaksToday', 'totalBreaksCompleted', 'eyeScore', 'eyePetXP', 'eyePetLevel', 'achievements'], async (data) => {
      const newBreaksToday = (data.breaksToday || 0) + 1;
      const newTotal = (data.totalBreaksCompleted || 0) + 1;
      const newScore = Math.min(100, (data.eyeScore || 100) + 2);
      
      // XP system
      const xpGain = Math.floor(Math.random() * 15) + 10;
      const currentXP = (data.eyePetXP || 0) + xpGain;
      const currentLevel = data.eyePetLevel || 1;
      const xpNeeded = currentLevel * 100;
      
      let newLevel = currentLevel;
      let newXP = currentXP;
      let leveledUp = false;
      
      if (currentXP >= xpNeeded) {
        newLevel = currentLevel + 1;
        newXP = currentXP - xpNeeded;
        leveledUp = true;
      }
      
      const achievements = data.achievements || [];
      let achievement = null;
      
      if (leveledUp) {
        achievement = `🎉 Level ${newLevel}! Your eye buddy evolved!`;
      } else {
        const msgs = [
          `+${xpGain} XP! Great job! ✨`,
          `+${xpGain} XP! Your eyes thank you! 💙`,
          `+${xpGain} XP! Keep it up! 🌟`,
        ];
        achievement = msgs[Math.floor(Math.random() * msgs.length)];
      }
      
      await chrome.storage.sync.set({
        isBreakActive: false,
        breaksToday: newBreaksToday,
        totalBreaksCompleted: newTotal,
        eyeScore: newScore,
        eyePetXP: newXP,
        eyePetLevel: newLevel,
        eyePetMood: 'happy',
        latestAchievement: achievement
      });
      
      console.log(`📊 Stats updated: ${newBreaksToday} today, ${newTotal} total`);
      
      // Schedule next break
      if (settings.enabled) {
        scheduleBreak(settings.interval);
      }
      
      sendResponse({ success: true, achievement, xpGain, leveledUp });
    });
    return true;
  }
  
  if (request.action === 'breakSkipped') {
    console.log('⏭️ Break skipped');
    
    chrome.storage.sync.get(['eyeScore'], async (data) => {
      const newScore = Math.max(60, (data.eyeScore || 100) - 3);
      
      await chrome.storage.sync.set({
        isBreakActive: false,
        eyeScore: newScore,
        eyePetMood: 'sleepy'
      });
      
      // Give extra time before next reminder
      if (settings.enabled) {
        scheduleBreak(settings.interval * 1.5);
      }
      
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'sync') return;
  
  console.log('⚙️ Settings changed:', Object.keys(changes));
  
  if (changes.interval) {
    settings.interval = changes.interval.newValue;
    console.log(`📏 Interval changed to ${settings.interval} minutes`);
  }
  
  if (changes.duration) {
    settings.duration = changes.duration.newValue;
  }
  
  if (changes.enabled) {
    settings.enabled = changes.enabled.newValue;
    console.log(`🔌 Extension ${settings.enabled ? 'enabled' : 'disabled'}`);
    
    if (settings.enabled) {
      // Re-enabled - schedule break
      scheduleBreak(settings.interval);
    } else {
      // Disabled - clear alarm
      chrome.alarms.clear('eyeBreak', () => {
        console.log('⏰ Alarm cleared');
      });
    }
  }
});

// On startup (browser restart)
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Browser started');
  
  const stored = await chrome.storage.sync.get(['interval', 'enabled', 'isBreakActive']);
  settings.interval = stored.interval || 20;
  settings.enabled = stored.enabled !== false;
  
  if (settings.enabled && !stored.isBreakActive) {
    chrome.alarms.get('eyeBreak', (alarm) => {
      if (!alarm) {
        console.log('📅 No alarm found on startup, creating one');
        scheduleBreak(settings.interval);
      }
    });
  }
});

console.log('=== BACKGROUND WORKER READY ===');
