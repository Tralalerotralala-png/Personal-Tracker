import test from 'node:test';
import assert from 'node:assert/strict';
import {glyphSvg,compactWeatherSvg} from '../js/ui/pixel-icon.js';
test('compact forecast glyphs retain one theme hue and detailed geometry',()=>{for(const name of ['sun','partly','cloud','fog','rain','snow','storm']){const svg=glyphSvg(name);assert.match(svg,/viewBox="0 0 40 40"/);assert.match(svg,/fill="currentColor"/);assert.doesNotMatch(svg,/fill="#/);assert.match(svg,/wx-compact/);}});
test('weather motion uses separate layers',()=>{for(const [code,layer] of [[0,'wx-sun-art'],[2,'wx-cloud-layer'],[45,'wx-fog-layer'],[61,'wx-rain-drop'],[71,'wx-snow-flake'],[95,'wx-lightning']])assert.ok(compactWeatherSvg(code).includes(layer));});
