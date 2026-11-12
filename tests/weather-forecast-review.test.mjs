import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('weather archives old forecasts without claiming measurements',()=>{
 const service=fs.readFileSync(new URL('../js/weather/service.js',import.meta.url),'utf8');
 const view=fs.readFileSync(new URL('../js/ui/mud.js',import.meta.url),'utf8');
 assert.match(service,/FORECAST_ARCHIVE_KEY/);
 assert.match(service,/retrospectiveRain/);
 assert.match(view,/Both values come from Open-Meteo model data/);
 assert.match(view,/wx-viewing-guide/);
 assert.match(view,/Confirm viewing direction, peak time, and local visibility/);
});
