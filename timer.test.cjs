const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const source = readFileSync(`${__dirname}/background.js`, 'utf8');
function worker(initial = {}, initialAlarms = {}) {
  let now = 1000000;
  const state = { interval: 20, enabled: true, nextAlarmFireTime: now + 185000, ...initial };
  const alarms = { ...initialAlarms };
  const event = () => ({ addListener(fn) { this.listener = fn; } });
  const chrome = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { onChanged: event(), sync: {
      get: (keys, callback) => { const copy = { ...state }; if (callback) queueMicrotask(() => callback(copy)); return Promise.resolve(copy); },
      set: (data, callback) => new Promise(resolve => queueMicrotask(() => { Object.assign(state, data); if (callback) callback(); resolve(); }))
    } },
    notifications: { onClicked: event(), onButtonClicked: event() },
    alarms: { onAlarm: event(),
      clear: (name, cb) => queueMicrotask(() => { delete alarms[name]; cb(true); }),
      get: (name, cb) => queueMicrotask(() => cb(alarms[name])),
      create: (name, opts) => { alarms[name] = { scheduledTime: opts.when ?? now + opts.delayInMinutes * 60000 }; }
    }
  };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { chrome, Date: Clock, console: { log() {}, error() {} } });
  return { state, alarms, advance: ms => now += ms,
    send: (action, data = {}) => new Promise(resolve => {
      assert.equal(chrome.runtime.onMessage.listener({ action, ...data }, {}, resolve), true);
    })
  };
}
test('pause freezes time; repeated pause and resume do not reset the countdown', async () => {
  const app = worker(); await app.send('pauseTimer');
  assert.equal(app.state.pausedRemainingMs, 185000);
  app.advance(600000); await app.send('pauseTimer');
  assert.equal((await app.send('getTimeRemaining')).timeRemaining, 185000);
  await app.send('resumeTimer');
  // The response must wait until the new deadline and running state are saved.
  assert.equal(app.state.isPaused, false);
  assert.equal((await app.send('getTimeRemaining')).timeRemaining, 185000);
  app.advance(10000); await app.send('resumeTimer');
  assert.equal((await app.send('getTimeRemaining')).timeRemaining, 175000);
});
for (const remaining of [45000, 0]) {
  test(`resume preserves ${remaining}ms instead of replacing it with a full interval`, async () => {
    const app = worker({ isPaused: true, pausedRemainingMs: remaining, nextAlarmFireTime: null });
    await app.send('resumeTimer');
    assert.equal((await app.send('getTimeRemaining')).timeRemaining, remaining);
  });
}
test('saving other settings while paused preserves the remainder', async () => {
  const app = worker({ isPaused: true, pausedRemainingMs: 91000, nextAlarmFireTime: null });
  await app.send('applySettings', { interval: 20, duration: 25, snoozeMinutes: 5, enabled: true, intervalChanged: false });
  assert.equal(app.state.pausedRemainingMs, 91000); assert.equal(app.state.isPaused, true);
});
test('pause recovers a real alarm when the stored deadline is missing', async () => {
  const app = worker({ nextAlarmFireTime: null }, { eyeBreak: { scheduledTime: 1073000 } });
  await app.send('pauseTimer'); assert.equal(app.state.pausedRemainingMs, 73000);
});
test('snoozed countdown keeps its identity through pause and resume', async () => {
  const app = worker({ isSnoozed: true }); await app.send('pauseTimer');
  assert.equal((await app.send('getTimeRemaining')).isSnoozed, true);
  await app.send('resumeTimer'); assert.equal(app.state.isSnoozed, true);
});

for (const isPaused of [true, false]) {
  test(`saving 30 → 10 minutes immediately updates a ${isPaused ? 'paused' : 'running'} countdown`, async () => {
    const app = worker({ interval: 30, isPaused, pausedRemainingMs: isPaused ? 1800000 : null,
      nextAlarmFireTime: isPaused ? null : 2800000, isSnoozed: true },
      { eyeBreakSnooze: { scheduledTime: 2800000 } });
    // The popup persists preferences before sending applySettings.
    app.state.interval = 10;
    await app.send('applySettings', { interval: 10, duration: 20, snoozeMinutes: 5,
      enabled: true, intervalChanged: true });
    assert.equal(app.state.isPaused, isPaused);
    assert.equal(app.state.isSnoozed, false);
    assert.equal(app.alarms.eyeBreakSnooze, undefined);
    assert.equal((await app.send('getTimeRemaining')).timeRemaining, 600000);
    if (isPaused) {
      assert.equal(app.alarms.eyeBreak, undefined);
      await app.send('resumeTimer');
      assert.equal((await app.send('getTimeRemaining')).timeRemaining, 600000);
    }
    assert.equal(app.alarms.eyeBreak.scheduledTime, 1600000);
  });
}
test('saving a new interval while disabled updates the display without scheduling reminders', async () => {
  const app = worker({ enabled: false, interval: 10, pausedRemainingMs: 1800000 });
  await app.send('applySettings', { interval: 10, duration: 20, snoozeMinutes: 5,
    enabled: false, intervalChanged: true });
  assert.equal(app.state.enabled, false);
  assert.equal(app.state.pausedRemainingMs, 600000);
  assert.equal(app.state.nextAlarmFireTime, null);
  assert.deepEqual(app.alarms, {});
});
test('Save captures interval changes before storage listeners update popup settings', () => {
  const popup = readFileSync(`${__dirname}/popup.js`, 'utf8');
  const saveHandler = popup.slice(popup.indexOf("document.getElementById('saveBtn').addEventListener"), popup.indexOf('setInterval(updateAchievements'));
  for (const previousInterval of [30, 10]) {
    let click;
    let message;
    const settings = { interval: previousInterval, enabled: true };
    vm.runInNewContext(saveHandler, {
      settings,
      document: { getElementById: id => id === 'saveBtn'
        ? { addEventListener: (_, handler) => { click = handler; } }
        : { value: { intervalInput: '10', durationInput: '20', snoozeInput: '5' }[id] } },
      chrome: {
        storage: { sync: { set: (data, callback) => { Object.assign(settings, data); callback(); } } },
        runtime: { sendMessage: request => { message = request; } }
      }
    });
    click();
    assert.equal(message.interval, 10);
    assert.equal(message.intervalChanged, previousInterval !== 10);
  }
});
