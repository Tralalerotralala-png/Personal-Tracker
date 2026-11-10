import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('Overview weather shows the shared three-segment mud meter in each daily forecast',()=>{
  const s=source('js/widgets/registry.js');
  assert.match(s,/mudBar\(r\)\);/);
  assert.match(source('css/app.css'),/\.w-forecast-day \.mud-bar \{/);
});
test('Browser alerts remain opt-in and never promise background pushes',()=>{
  const s=source('js/ui/personal-hub.js');
  assert.match(s,/Notification\.requestPermission\(\)/);
  assert.match(s,/getSetting\(REMINDER_KEY,\{enabled:false/);
  assert.match(s,/document\.visibilityState==='hidden'/);
  assert.match(s,/not system alarms or background push notifications/);
});
test('Reminder events are deduplicated and have a limited due window',()=>{
  const s=source('js/ui/personal-hub.js');
  assert.match(s,/storageKey=`tracker-notified:/);
  assert.match(s,/starts\+5\*60000/);
  assert.match(s,/task\.due===day/);
});
test('Notification click opens the correct in-app tab',()=>{
  assert.match(source('sw.js'),/notificationclick/);
  assert.match(source('js/app.js'),/open-reminder-tab/);
});
