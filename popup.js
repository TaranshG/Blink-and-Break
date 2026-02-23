

// ============================================
// FILE 6: popup.js
// ============================================
let updateInterval = null;
let breakCountdownInterval = null;
let settings = {
  interval: 20,
  duration: 20,
  enabled: true,
  soundEnabled: true,
  selectedSound: 'gentle-bell',
  blinkReminders: true,
  darkMode: false
};

// Load settings and initialize
chrome.storage.sync.get(null, (data) => {
  settings = { ...settings, ...data };
  
  console.log('Initializing with settings:', data);
  
  // Check if we're in break mode
  if (data.isBreakActive && data.isBreakActive === true) {
    console.log('Break is active, showing break view');
    showBreakView();
  } else if (data.breakComplete && data.breakComplete === true) {
    console.log('Break is complete, showing completion');
    showBreakComplete();
  } else {
    console.log('Normal mode, showing main view');
    initializeUI();
    startRealtimeUpdates();
  }
});

// Listen for storage changes (for when notification triggers break)
chrome.storage.onChanged.addListener((changes) => {
  console.log('Storage changed:', changes);
  
  if (changes.isBreakActive && changes.isBreakActive.newValue === true) {
    console.log('Break activated via storage change');
    showBreakView();
  } else if (changes.breakComplete && changes.breakComplete.newValue === true) {
    console.log('Break completed via storage change');
    showBreakComplete();
  } else if (changes.isBreakActive && changes.isBreakActive.newValue === false) {
    // Break ended, return to main view
    console.log('Break ended via storage change');
    if (document.getElementById('breakView').style.display !== 'none') {
      showMainView();
    }
  }
});

function showBreakView() {
  console.log('Showing break view');
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('breakView').style.display = 'flex';
  document.getElementById('breakComplete').style.display = 'none';
  
  document.getElementById('skipBreakBtn').style.display = 'block';

  // Reset timer display
  document.getElementById('breakTimer').parentElement.style.display = 'block';
  
  // Apply dark mode if enabled
  chrome.storage.sync.get(['darkMode', 'breakDuration', 'duration', 'blinkReminders'], (data) => {
    console.log('Break data:', data);
    document.body.classList.toggle('dark-mode', data.darkMode);
    
    // Use breakDuration if available, otherwise use duration setting
    let timeLeft = data.breakDuration || data.duration || 20;
    document.getElementById('breakTimer').textContent = timeLeft;
    
    // Update blink reminder message
    if (data.blinkReminders) {
      document.getElementById('breakMessage').textContent = 'Look 20 feet away and blink fully';
    } else {
      document.getElementById('breakMessage').textContent = 'Look at something 20 feet away';
    }
    
    if (breakCountdownInterval) {
      clearInterval(breakCountdownInterval);
      breakCountdownInterval = null;
    }
    
    console.log('Starting countdown from:', timeLeft);
    
    breakCountdownInterval = setInterval(() => {
      timeLeft--;
      console.log('Countdown:', timeLeft);
      
      if (timeLeft <= 0) {
        clearInterval(breakCountdownInterval);
        breakCountdownInterval = null;
        
        console.log('Break complete!');
        
        // Tell background that break is complete
        chrome.runtime.sendMessage({ action: 'breakComplete' }, (response) => {
          // Show completion view with achievement data
          showBreakComplete(response);
        });
      } else {
        document.getElementById('breakTimer').textContent = timeLeft;
      }
    }, 1000);
  });
}

function showBreakComplete(response) {
  console.log('Showing break complete');
  
  // Play sound
  chrome.storage.sync.get(['soundEnabled', 'selectedSound'], (data) => {
    console.log('Sound settings:', data);
    if (data.soundEnabled !== false) {
      const sound = data.selectedSound || 'gentle-bell';
      console.log('Playing sound:', sound);
      SoundManager.play(sound);
    }
  });
  
  // Hide timer, show completion
  document.getElementById('breakTimer').parentElement.style.display = 'none';
  document.getElementById('skipBreakBtn').style.display = 'none';
  document.getElementById('breakComplete').style.display = 'block';
  
  // Show achievements if provided
  if (response) {
    const achievementBadge = document.getElementById('achievementBadge');
    
    if (response.leveledUp) {
      achievementBadge.textContent = response.achievement;
      achievementBadge.style.display = 'block';
      achievementBadge.style.background = 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)';
    } else if (response.achievement) {
      achievementBadge.textContent = response.achievement;
      achievementBadge.style.display = 'block';
    }
    
    // Vary the completion message with XP
    const messages = [
      `+${response.xpGain || 15} XP! Eyes refreshed! ✨`,
      `+${response.xpGain || 15} XP! Excellent! 🌟`,
      `+${response.xpGain || 15} XP! You rock! 💪`,
      `+${response.xpGain || 15} XP! Amazing! 🎉`
    ];
    document.getElementById('completeText').textContent = 
      messages[Math.floor(Math.random() * messages.length)];
  }
  
  // Wait 3 seconds then return to main view
  setTimeout(() => {
    console.log('Returning to main view');
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
  
  // Notify background that break was skipped (no shame, just tracking)
  chrome.runtime.sendMessage({ action: 'breakSkipped' });
  
  // Return to main view immediately
  chrome.storage.sync.set({ isBreakActive: false }, () => {
    showMainView();
  });
}

function showMainView() {
  if (breakCountdownInterval) clearInterval(breakCountdownInterval);
  
  document.getElementById('breakView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('mainView').style.display = 'block';
  
  // Reset break timer display
  document.getElementById('breakTimer').parentElement.style.display = 'block';
  document.getElementById('breakComplete').style.display = 'none';
  
  initializeUI();
  startRealtimeUpdates();
}

function initializeUI() {
  // Set input values
  document.getElementById('intervalInput').value = settings.interval;
  document.getElementById('durationInput').value = settings.duration;
  
  // Set toggles
  document.getElementById('blinkToggle').classList.toggle('active', settings.blinkReminders);
  document.getElementById('darkModeToggle').classList.toggle('active', settings.darkMode);
  document.getElementById('soundToggle').classList.toggle('active', settings.soundEnabled);
  
  // Apply dark mode
  document.body.classList.toggle('dark-mode', settings.darkMode);
  
  // Show/hide sound settings
  document.getElementById('soundSettings').style.display = 
    settings.soundEnabled ? 'flex' : 'none';
  
  // Set active sound
  document.querySelectorAll('.sound-option').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.sound === settings.selectedSound) {
      btn.classList.add('active');
    }
  });
  
  // Update stats
  updateStats();
  
  // Update pet
  updatePet();
  
  // Update play/pause button
  updateToggleButton();
}

function updatePet() {
  chrome.storage.sync.get(['eyePetName', 'eyePetMood', 'eyePetLevel', 'eyePetXP'], (data) => {
    const petName = data.eyePetName || 'Eye Buddy';
    const petMood = data.eyePetMood || 'happy';
    const petLevel = data.eyePetLevel || 1;
    const petXP = data.eyePetXP || 0;
    const xpNeeded = petLevel * 100;
    
    // Update name
    document.getElementById('petName').textContent = petName;
    
    // Update level
    document.getElementById('petLevel').textContent = petLevel;
    
    // Update XP bar
    const xpPercentage = (petXP / xpNeeded) * 100;
    document.getElementById('petXPFill').style.width = `${xpPercentage}%`;
    document.getElementById('petXPText').textContent = `${petXP}/${xpNeeded} XP`;
    
    // Update mood/appearance
    const petBody = document.querySelector('.pet-body');
    petBody.className = `pet-body ${petMood}`;
    
    const petMouth = document.getElementById('petMouth');
    const moodMouths = {
      'ecstatic': '◠',
      'happy': '◡',
      'content': '⌣',
      'sleepy': '~'
    };
    petMouth.textContent = moodMouths[petMood] || '◡';
    
    // Update speech bubble
    const petBubble = document.getElementById('petBubble');
    const bubbleMessages = {
      'ecstatic': [
        "I'm so energized! Let's keep going!",
        "You're the best! My energy is maxed!",
        "Woohoo! This is amazing!"
      ],
      'happy': [
        "Thanks for taking care of me! 😊",
        "Your eyes feel great, right?",
        "We make a great team!"
      ],
      'content': [
        "Doing good! Keep it up!",
        "Nice and relaxed here~",
        "We're on the right track!"
      ],
      'sleepy': [
        "Could use a break soon...",
        "Getting a bit tired here...",
        "Remember to blink!"
      ]
    };
    
    const messages = bubbleMessages[petMood] || bubbleMessages['happy'];
    petBubble.textContent = messages[Math.floor(Math.random() * messages.length)];
  });
}

function updateStats() {
  chrome.storage.sync.get(['breaksToday', 'totalBreaksCompleted', 'eyeScore', 'latestAchievement'], (data) => {
    document.getElementById('breaksToday').textContent = data.breaksToday || 0;
    document.getElementById('totalBreaks').textContent = data.totalBreaksCompleted || 0;
    document.getElementById('eyeScore').textContent = data.eyeScore || 100;
    
    // Show motivation card if there's a recent achievement
    if (data.latestAchievement) {
      const motivationCard = document.getElementById('motivationCard');
      const motivationText = document.getElementById('motivationText');
      motivationText.textContent = data.latestAchievement;
      motivationCard.style.display = 'flex';
      
      // Hide after 10 seconds
      setTimeout(() => {
        motivationCard.style.display = 'none';
        chrome.storage.sync.set({ latestAchievement: null });
      }, 10000);
    }
  });
}

function startRealtimeUpdates() {
  // Clear any existing interval
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Update immediately
  updateTimerDisplay();
  
  // Update every second
  updateInterval = setInterval(() => {
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  chrome.runtime.sendMessage({ action: 'getTimeRemaining' }, (response) => {
    if (chrome.runtime.lastError) {
      // If there's an error, fall back to stored interval
      chrome.storage.sync.get(['interval'], (data) => {
        const totalSeconds = (data.interval || 20) * 60;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        document.getElementById('nextBreakTime').textContent = 
          `${minutes}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('progressFill').style.width = '0%';
      });
      return;
    }
    
    if (response && response.timeRemaining !== undefined) {
      const totalSeconds = Math.ceil(response.timeRemaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      document.getElementById('nextBreakTime').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // Update progress bar
      chrome.storage.sync.get(['interval'], (data) => {
        const totalInterval = (data.interval || 20) * 60;
        const elapsed = totalInterval - totalSeconds;
        const progress = (elapsed / totalInterval) * 100;
        document.getElementById('progressFill').style.width = `${Math.max(0, Math.min(100, progress))}%`;
      });
    }
  });
}

function updateToggleButton() {
  const pauseIcon = document.getElementById('pauseIcon');
  const playIcon = document.getElementById('playIcon');
  const statusText = document.getElementById('statusText');
  
  if (settings.enabled) {
    pauseIcon.style.display = 'block';
    playIcon.style.display = 'none';
    statusText.textContent = 'Active';
    statusText.style.color = '#10b981';
  } else {
    pauseIcon.style.display = 'none';
    playIcon.style.display = 'block';
    statusText.textContent = 'Paused';
    statusText.style.color = '#f59e0b';
  }
}

function showSaveStatus() {
  const status = document.getElementById('saveStatus');
  status.textContent = '✓ Settings saved!';
  status.classList.add('success');
  
  setTimeout(() => {
    status.textContent = '';
    status.classList.remove('success');
  }, 3000);
}

// Event Listeners
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'block';
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  document.getElementById('settingsView').style.display = 'none';
  document.getElementById('mainView').style.display = 'block';
});

document.getElementById('toggleBtn').addEventListener('click', () => {
  settings.enabled = !settings.enabled;
  chrome.storage.sync.set({ enabled: settings.enabled });
  updateToggleButton();
});

document.getElementById('blinkToggle').addEventListener('click', function() {
  this.classList.toggle('active');
  settings.blinkReminders = this.classList.contains('active');
});

document.getElementById('darkModeToggle').addEventListener('click', function() {
  this.classList.toggle('active');
  settings.darkMode = this.classList.contains('active');
  document.body.classList.toggle('dark-mode', settings.darkMode);
});

document.getElementById('soundToggle').addEventListener('click', function() {
  this.classList.toggle('active');
  settings.soundEnabled = this.classList.contains('active');
  document.getElementById('soundSettings').style.display = 
    settings.soundEnabled ? 'flex' : 'none';
});

document.querySelectorAll('.sound-option[data-sound]').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.sound-option').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    settings.selectedSound = this.dataset.sound;
    SoundManager.play(settings.selectedSound);
  });
});

document.getElementById('customSoundInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    SoundManager.setCustomSound(file);
    settings.selectedSound = 'custom';
    document.querySelectorAll('.sound-option').forEach(b => b.classList.remove('active'));
    // Find the upload label and mark it active
    const uploadLabel = document.querySelector('.upload-option');
    if (uploadLabel) {
      uploadLabel.classList.add('active');
    }
    // Update the label text to show filename
    const labelSpan = uploadLabel.querySelector('span');
    if (labelSpan) {
      labelSpan.textContent = `🎵 ${file.name.substring(0, 20)}${file.name.length > 20 ? '...' : ''}`;
    }
  }
});

document.getElementById('testSoundBtn').addEventListener('click', () => {
  SoundManager.play(settings.selectedSound);
});

document.getElementById('testNotificationBtn').addEventListener('click', () => {
  // Send message to background to trigger a test notification
  chrome.runtime.sendMessage({ action: 'testNotification' }, (response) => {
    if (response && response.success) {
      console.log('Test notification sent');
    }
  });
});

document.getElementById('skipBreakBtn').addEventListener('click', () => {
  skipBreak();
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const newInterval = parseInt(document.getElementById('intervalInput').value);
  const newDuration = parseInt(document.getElementById('durationInput').value);
  
  // Check if interval actually changed
  const intervalChanged = newInterval !== settings.interval;
  
  settings.interval = newInterval;
  settings.duration = newDuration;
  
  // If interval didn't change, we can save without triggering reschedule
  if (!intervalChanged) {
    chrome.storage.sync.set(settings, () => {
      showSaveStatus();
      setTimeout(() => {
        document.getElementById('settingsView').style.display = 'none';
        document.getElementById('mainView').style.display = 'block';
      }, 800);
    });
  } else {
    // Interval changed - get current time remaining first
    chrome.runtime.sendMessage({ action: 'getTimeRemaining' }, (response) => {
      // Save the current remaining time before updating interval
      if (response && response.timeRemaining) {
        chrome.storage.local.set({ 
          savedTimeRemaining: response.timeRemaining,
          preserveTimer: true 
        }, () => {
          // Now save settings
          chrome.storage.sync.set(settings, () => {
            showSaveStatus();
            setTimeout(() => {
              document.getElementById('settingsView').style.display = 'none';
              document.getElementById('mainView').style.display = 'block';
            }, 800);
          });
        });
      } else {
        // Fallback if we can't get time remaining
        chrome.storage.sync.set(settings, () => {
          showSaveStatus();
          setTimeout(() => {
            document.getElementById('settingsView').style.display = 'none';
            document.getElementById('mainView').style.display = 'block';
          }, 800);
        });
      }
    });
  }
});

// Update stats periodically
setInterval(updateStats, 10000);
setInterval(updatePet, 8000); // Update pet messages periodically

// Cleanup on unload
window.addEventListener('unload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});

