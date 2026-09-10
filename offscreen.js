chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'reminder-audio' || request.action !== 'playSound') return;
  SoundManager.play(request.sound).then(
    () => sendResponse({ success: true }),
    error => sendResponse({ success: false, error: error.message })
  );
  return true;
});
