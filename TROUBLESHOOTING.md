# NOTIFICATION TROUBLESHOOTING GUIDE

## CRITICAL FIRST STEPS

### 1. CHECK CHROME NOTIFICATION PERMISSIONS

**Windows:**
1. Open Chrome settings: `chrome://settings/content/notifications`
2. Make sure "Sites can ask to send notifications" is ON
3. Scroll down - make sure `chrome-extension://` is NOT in the "Not allowed" list
4. If it is, remove it

**Mac:**
1. System Preferences → Notifications
2. Find "Google Chrome" in the list
3. Make sure "Allow Notifications" is checked
4. Set alert style to "Alerts" (not "None" or "Banners")

### 2. RELOAD THE EXTENSION PROPERLY

1. Go to `chrome://extensions/`
2. Find "Blink & Break"
3. Click the **REFRESH** icon (circular arrow)
4. Then click "Service Worker" to open the console
5. You should see: `=== BACKGROUND WORKER STARTED ===`

If you don't see that message, the extension isn't loading properly.

### 3. TEST NOTIFICATIONS IMMEDIATELY

Open the test page:
1. Go to `chrome://extensions/`
2. Click "Service Worker" under your extension
3. In the console, type:
```javascript
chrome.notifications.create({type:'basic',iconUrl:'icons/icon128.png',title:'TEST',message:'Testing',priority:2})
```
4. Press Enter

**Did a notification appear?**
- YES → Notifications work! The issue is with alarms
- NO → Notifications are blocked. Check step 1 again

### 4. TEST ALARMS

In the same console, type:
```javascript
chrome.alarms.create('test', {delayInMinutes: 0.1})
```

Wait 6 seconds. You should see: `🔔 ALARM FIRED: test`

**Did you see that message?**
- YES → Alarms work! 
- NO → Alarms are not firing

### 5. FORCE AN IMMEDIATE BREAK

In the service worker console:
```javascript
chrome.alarms.create('eyeBreak', {delayInMinutes: 0.1})
```

In 6 seconds you should see:
- `🔔 ALARM FIRED: eyeBreak`
- `📢 Showing break notification...`
- `✅ Notification created: eyeBreak`
- A DESKTOP NOTIFICATION

---

## COMMON ISSUES & FIXES

### Issue: "Service Worker (Inactive)" 

**Fix:**
1. Click "Service Worker" to activate it
2. It will show logs immediately
3. The worker stays inactive until needed - this is NORMAL

### Issue: No logs appear at all

**Fix:**
1. Remove the extension completely
2. Download the extension folder again
3. Make sure the `icons` folder exists with 3 files:
   - icon16.png
   - icon48.png  
   - icon128.png
4. Load unpacked again

### Issue: Notification appears but no sound

**Fix:**
1. Open extension popup
2. Go to Settings
3. Make sure "Sound Notifications" toggle is ON
4. The sound plays AFTER the break completes, not when notification shows

### Issue: Alarm scheduled but never fires

**Check:**
1. Is Chrome minimized? Alarms still fire
2. Is your computer asleep? Alarms pause during sleep
3. In service worker console, type: `chrome.alarms.getAll((a) => console.log(a))`
4. You should see an alarm with `scheduledTime` in the future

**Fix:**
Force create a new alarm:
```javascript
chrome.alarms.clear('eyeBreak', () => {
  chrome.alarms.create('eyeBreak', {delayInMinutes: 1})
})
```

### Issue: Notification shows "Could not load icon"

**Fix:**
1. Make sure the `icons` folder is in the same directory as manifest.json
2. Check the icons folder has: icon16.png, icon48.png, icon128.png
3. Reload the extension

---

## USING THE TEST PAGE

I've included `test-extension.html` - here's how to use it:

1. Go to `chrome://extensions/`
2. Turn ON "Developer mode"
3. Find your extension ID (looks like: `abcdefghijklmnop`)
4. Open: `chrome-extension://YOUR_EXTENSION_ID/test-extension.html`
5. Click the test buttons to diagnose issues

---

## VERIFICATION CHECKLIST

Run through this checklist:

- [ ] Chrome notifications are enabled in browser settings
- [ ] Chrome notifications are enabled in OS settings  
- [ ] Extension reloaded using refresh button
- [ ] Service worker console shows startup message
- [ ] Icons folder exists with 3 PNG files
- [ ] Manual notification test works (step 3)
- [ ] Manual alarm test works (step 4)
- [ ] Forced break alarm creates notification (step 5)

If ALL checkboxes pass but you still don't get notifications at the scheduled time, there's a Chrome bug. Try:

1. Close ALL Chrome windows
2. Reopen Chrome
3. Go to `chrome://extensions/`
4. Reload the extension
5. Set interval to 1 minute in settings
6. Wait exactly 1 minute

---

## WHAT THE LOGS SHOULD SHOW

### On Extension Load:
```
=== BACKGROUND WORKER STARTED ===
🔧 Extension installed/updated
📋 Settings initialized: {interval: 20, duration: 20, enabled: true}
⏰ Scheduling break in 20 minutes
✅ Break scheduled for: [time]
=== BACKGROUND WORKER READY ===
```

### When Alarm Fires:
```
🔔 ALARM FIRED: eyeBreak at [time]
📢 Showing break notification...
✅ Break marked as active in storage
✅ Notification created: eyeBreak
```

### When Notification Clicked:
```
🖱️ Notification clicked: eyeBreak
✅ Popup window created: [window id]
```

---

## STILL NOT WORKING?

If you've done EVERYTHING above and it still doesn't work:

1. **Try a different browser profile:**
   - Chrome might have corrupted notification settings
   - Create new profile: Settings → Add person
   - Install extension in new profile

2. **Check Chrome version:**
   - Must be Chrome 88 or newer
   - Type `chrome://version/` to check

3. **Try Microsoft Edge:**
   - Edge uses same extension system
   - Download Edge, install extension there
   - If it works in Edge but not Chrome, Chrome is broken

4. **Nuclear option - reinstall Chrome:**
   - Backup your bookmarks
   - Uninstall Chrome completely
   - Reinstall fresh
   - Install extension

---

## GETTING CONSOLE LOGS TO ME

If you need help, send me the console output:

1. Go to `chrome://extensions/`
2. Click "Service Worker" 
3. In console, type: `copy(console.log)`
4. This doesn't work, so instead:
5. Right-click in the console
6. "Save as..." 
7. Send me the file

Or just screenshot the console and send me that.
