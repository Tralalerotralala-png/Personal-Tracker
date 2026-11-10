import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all weather and ground meters use three proportional segments', () => {
  const js = source('js/ui/mud-format-v2.js');
  const css = source('css/app.css');
  assert.match(js, /Array\.from\(\{ length: 3 \}/);
  assert.match(js, /\(100 \/ 3\)/);
  assert.doesNotMatch(js, /Array\.from\(\{ length: 4 \}/);
  assert.match(css, /\.w-forecast-day \.mud-bar \{[^}]*repeat\(3,/);
  assert.match(css, /\.w-day \.w-agenda-ground \.mud-bar/);
});

test('Coming Up date and event rows send distinct calendar selections', () => {
  const widgets = source('js/widgets/registry.js');
  const calendar = source('js/ui/calendar.js');
  assert.match(widgets, /openCalendarSelection\(\{ dateKey: key \}\)/);
  assert.match(widgets, /openCalendarSelection\(\{ dateKey: key, eventId: o\.event\.id \}\)/);
  assert.match(widgets, /tracker-calendar-open/);
  assert.match(calendar, /window\.addEventListener\('tracker-calendar-open'/);
  assert.match(calendar, /openEventSheet\(\{ event: selected \}\)/);
  assert.match(calendar, /openDaySheet\(dateKey\)/);
  assert.match(calendar, /processOverviewSelection\(\)/);
  assert.match(source('js/widgets/defs.js'), /calendar: \{[^}]*route: 'calendar'/);
});
