# BreakChime

A Chrome extension for eye-break reminders, with a configurable interval, break duration, snooze, and chime.

## Get started

After installing from the Chrome Web Store, open Chrome’s Extensions menu (the puzzle-piece icon) and select BreakChime. Pin it for easy access. Open its Settings, turn on Sound Notifications, choose a chime, and try Test Notification.

Pause freezes the current countdown. Resume continues from that remaining time; saving a changed reminder interval immediately replaces the countdown with the new interval, while keeping it paused if it was paused. Saving other preferences leaves a paused countdown unchanged. Use Reset to start the current interval over.

Dark mode, sound on/off, and the selected chime save immediately. Use **Save Settings** for interval, duration, snooze, and other settings. Timing values are entered by typing; scrolling does not change them.

## Reminder behavior

Click the notification body to start the break. Start break and Snooze actions are also available; macOS may hide actions until you hover or expand the notification. If you miss a banner, open BreakChime from the toolbar to access the pending break.

Mac reminders request standard banners. Other platforms retain persistent reminders. The extension plays the selected chime itself, including while the popup is closed, and silences the native notification sound to avoid two sounds. Turning Sound Notifications off silences automatic reminder and completion chimes. Test Sound explicitly previews the chime using the background audio path.

App audio can still play while Focus suppresses notification banners. Turn off Sound Notifications or pause breaks for quiet time. The extension cannot detect or override system volume, audio routing, or Focus settings.

Keep the browser running and the computer awake for timely reminders. The popup can be closed. Sleeping or quitting the browser delays reminders.

## Mac troubleshooting

- **No banner:** Apple menu → System Settings → Notifications → your browser (such as Google Chrome). Enable Allow notifications. Current macOS offers Desktop with Temporary or Persistent styles; older versions use Banners or Alerts. Check the display-sharing and lock-screen notification options where relevant. [Apple notification settings](https://support.apple.com/en-gb/guide/mac-help/mh40583/mac).
- **Focus is active:** Turn it off briefly to test, or allow your browser in System Settings → Focus. [Apple Focus guide](https://support.apple.com/en-ie/guide/mac-help/mchl613dc43f/mac).
- **No chime:** Enable Sound Notifications in the extension and click Test Sound. Check System Settings → Sound → Output for the selected device, volume, and mute. The app chime uses media output, not the system notification-sound toggle. [Apple sound output guide](https://support.apple.com/en-gb/guide/mac-help/mchlp2256/mac).
- **Still failing:** Restart your browser, open BreakChime → Settings, and run both tests. Use Report bug in Settings if the problem continues, including your browser, operating system, and test result. The test result distinguishes notification creation errors from audio playback errors. Browser acceptance does not prove that macOS displayed the banner or that the speakers were audible.

Chrome's website notification settings are not a substitute for the browser's macOS notification permission. This extension uses `chrome.notifications`, not website push notifications.

## Windows troubleshooting

- **No banner:** Settings → System → Notifications (Windows 10: Notifications & actions). Enable notifications for your browser and allow banners. Turn off Do not disturb (Windows 11) or Focus assist (Windows 10) while testing. [Microsoft notification help](https://support.microsoft.com/en-us/windows/turn-off-notifications-about-device-setup-c88f6943-d169-23ca-5f3f-c6b927509e79).
- **No chime:** Enable Sound Notifications and click Test Sound. Check your output device in Settings → System → Sound. Right-click the taskbar speaker icon → Open Volume mixer and unmute your browser or raise its volume.
- **Still stuck:** Restart your browser and test again. Use Report bug in the extension’s settings and include which test failed and the displayed message.

The extension automatically shows Mac, Windows, or general troubleshooting for the current computer.

## Development checks

For local development, load this folder as an unpacked extension from `chrome://extensions` with Developer mode enabled.

Run `node --test *.test.cjs` and `node --check popup.js`.

The tests mock Chrome APIs and cover platform options, muted reminders, audio errors, offscreen reuse/concurrency, Chrome 110 compatibility, and test-notification clicks. They do not verify actual OS banners or physical speaker output.

Background audio uses Chrome's `offscreen` permission and an `AUDIO_PLAYBACK` document. Chrome closes this document after 30 seconds without audio. The popup and offscreen document share the bundled WAV chimes. No external audio service or website access is required. [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).
