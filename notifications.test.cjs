const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const source = readFileSync(`${__dirname}/background.js`, 'utf8');
function worker(os, options = {}) {
  const created = [], audio = [], documents = [], windows = [];
  let exists = !!options.existing;
  const state = { duration: 45, selectedSound: 'soft-chime', ...options.state };
  const event = () => ({ addListener(fn) { this.listener = fn; } });
  const chrome = {
    runtime: {
      onInstalled: event(), onStartup: event(), onMessage: event(),
      getPlatformInfo: async () => ({ os }),
      getURL: path => `chrome-extension://test/${path}`,
      getContexts: async () => exists ? [{}] : [],
      sendMessage: async message => { audio.push(message); return options.audioError ? { success: false, error: options.audioError } : { success: true }; }
    },
    offscreen: { createDocument: async opts => { documents.push(opts); if (options.documentError) throw Error('Document failed'); exists = true; } },
    windows: { create: opts => windows.push(opts) },
    alarms: { onAlarm: event() },
    storage: { sync: { get: async () => state, set: async data => Object.assign(state, data) }, onChanged: event() },
    notifications: {
      getPermissionLevel: async () => options.denied ? 'denied' : 'granted',
      create: async (id, opts) => { if (options.failure) throw Error(options.failure); created.push({ id, options: opts }); return id; },
      clear: () => {}, onClicked: event(), onButtonClicked: event()
    }
  };
  if (options.legacy) delete chrome.runtime.getContexts;
  const context = vm.createContext({ chrome, clients: { matchAll: async () => exists ? [{ url: 'chrome-extension://test/offscreen.html' }] : [] }, console: { log() {}, error() {} } });
  vm.runInContext(source, context);
  return {
    created, audio, documents, windows, state, context,
    remind: () => context.showBreakNotification(),
    click: id => chrome.notifications.onClicked.listener(id),
    send: (action = 'testNotification') => new Promise(resolve => {
      assert.equal(chrome.runtime.onMessage.listener({ action }, {}, resolve), true);
    })
  };
}
for (const os of ['mac', 'win', 'linux']) {
  test(`${os}: reminders and tests play selected audio without duplicate native sound`, async () => {
    const app = worker(os);
    await app.remind();
    const response = await app.send();
    assert.equal(response.success, true); assert.equal(response.soundError, undefined);
    assert.equal(app.created.length, 2); assert.equal(app.audio.length, 2);
    for (const { options } of app.created) {
      assert.equal(options.requireInteraction, os !== 'mac'); assert.equal(options.silent, true);
      assert.equal(options.type, 'basic');
    }
    assert.equal(app.audio[0].sound, 'soft-chime');
    assert.equal(app.documents.length, 1);
    assert.equal(app.documents[0].reasons[0], 'AUDIO_PLAYBACK');
    assert.match(app.created[0].options.message, /45-second/);
    assert.equal(app.created[0].options.buttons.length, 2);
    assert.equal(app.state.isBreakActive, true);
  });
}
test('muting keeps banners but starts no background audio', async () => {
  const app = worker('mac', { state: { soundEnabled: false } });
  await app.remind(); const response = await app.send();
  assert.equal(response.soundEnabled, false); assert.equal(app.created.length, 2);
  assert.equal(app.audio.length, 0); assert.equal(app.documents.length, 0);
});
test('denied permission returns feedback and does not play a chime', async () => {
  const app = worker('mac', { denied: true }); const response = await app.send();
  assert.equal(response.success, false); assert.match(response.error, /blocked/);
  assert.equal(app.created.length, 0); assert.equal(app.audio.length, 0);
});
test('native creation error reaches the test button', async () => {
  const app = worker('mac', { failure: 'Native notification failed' });
  const response = await app.send(); assert.equal(response.error, 'Native notification failed');
});
test('audio failure preserves banner success and reports a partial failure', async () => {
  const app = worker('mac', { audioError: 'Playback blocked' }); const response = await app.send();
  assert.equal(response.success, true); assert.equal(response.soundError, 'Playback blocked');
  assert.equal(app.created.length, 1);
});
test('concurrent playback creates one document, and existing documents are reused', async () => {
  const app = worker('mac');
  await Promise.all([app.context.playReminderSound('calm-tone'), app.context.playReminderSound('soft-chime')]);
  assert.equal(app.documents.length, 1);
  const existing = worker('mac', { existing: true }); await existing.send();
  assert.equal(existing.documents.length, 0);
});
test('Chrome 110 fallback reuses the offscreen client', async () => {
  const app = worker('mac', { legacy: true, existing: true }); await app.send();
  assert.equal(app.documents.length, 0); assert.equal(app.audio.length, 1);
});
test('failed offscreen creation can be retried', async () => {
  const app = worker('mac', { documentError: true }); await app.send(); await app.send();
  assert.equal(app.documents.length, 2);
});
test('sound-only test exercises background playback without a notification', async () => {
  const app = worker('mac'); assert.equal((await app.send('testReminderSound')).success, true);
  assert.equal(app.created.length, 0); assert.equal(app.audio.length, 1);
});
test('test notification clicks do not open a break window', () => {
  const app = worker('mac'); app.click('test'); assert.equal(app.windows.length, 0);
  app.click('eyeBreak'); assert.equal(app.windows.length, 1);
});
test('offscreen playback works without storage APIs and reports playback errors', async () => {
  let listener, fail = false; const urls = [];
  class Audio { constructor(url) { urls.push(url); } pause() {} async play() { if (fail) throw Error('Muted renderer'); } }
  const context = vm.createContext({ Audio, chrome: { runtime: { getURL: path => `extension://${path}`, onMessage: { addListener: fn => listener = fn } } } });
  vm.runInContext(readFileSync(`${__dirname}/sounds.js`, 'utf8'), context);
  vm.runInContext(readFileSync(`${__dirname}/offscreen.js`, 'utf8'), context);
  const send = sound => new Promise(resolve => listener({ target: 'reminder-audio', action: 'playSound', sound }, {}, resolve));
  assert.equal((await send('calm-tone')).success, true);
  assert.equal(urls[0], 'extension://sounds/calm-tone.wav');
  fail = true; assert.equal((await send('gentle-bell')).error, 'Muted renderer');
});
