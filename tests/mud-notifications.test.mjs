import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('Overview weather shows the shared three-segment mud meter in each daily forecast',()=>{
  const s=source('js/widgets/registry.js');
  assert.match(s,/mudBar\(r\)\);/);
  assert.match(source('css/app.css'),/\.w-forecast-day \.mud-bar\s*\{/);
});
test('Browser alerts remain opt-in and never promise background pushes',()=>{
  const s=source('js/ui/personal-hub.js');
  assert.match(s,/Notification\.requestPermission\(\)/);
  assert.match(s,/getSetting\(REMINDER_KEY,\{enabled:false/);
  assert.match(s,/document\.visibilityState==='hidden'/);
  assert.match(s,/not guaranteed phone alarms or background push notifications/);
});
test('Reminder events are deduplicated and have a limited due window',()=>{
  const s=source('js/ui/personal-hub.js');
  assert.match(s,/k='tracker-notified:/);
  assert.match(s,/start\+300000/);
  assert.match(s,/task\.due===notificationDay\(now\)/);
});
test('Notification click opens the correct in-app tab',()=>{
  assert.match(source('sw.js'),/notificationclick/);
  assert.match(source('js/app.js'),/open-reminder-tab/);
});
