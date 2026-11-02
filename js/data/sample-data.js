// Sample data for local-only mode, so the app has something to show before
// Supabase is set up. Ids are fixed so re-seeding never duplicates.
import { DEFAULT_CATEGORIES, ensureDefaults } from './defaults.js';

const sid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CAT = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.name, c.id]));

const L = {
  house: sid('a', 1), garage: sid('a', 2), shelf2: sid('a', 3), blueBin: sid('a', 4),
  pegboard: sid('a', 5), kitchen: sid('a', 6), pantry: sid('a', 7), office: sid('a', 8),
  deskDrawer: sid('a', 9), shed: sid('a', 10), bootTray: sid('a', 11),
};

export const SAMPLE_LOCATIONS = [
  { id: L.house,      name: 'House',        kind: 'building', parent_id: null },
  { id: L.garage,     name: 'Garage',       kind: 'room',     parent_id: L.house },
  { id: L.shelf2,     name: 'Shelf 2',      kind: 'shelf',    parent_id: L.garage },
  { id: L.blueBin,    name: 'Blue bin',     kind: 'bin',      parent_id: L.shelf2 },
  { id: L.pegboard,   name: 'Pegboard',     kind: 'wall',     parent_id: L.garage },
  { id: L.kitchen,    name: 'Kitchen',      kind: 'room',     parent_id: L.house },
  { id: L.pantry,     name: 'Pantry',       kind: 'cupboard', parent_id: L.kitchen },
  { id: L.office,     name: 'Office',       kind: 'room',     parent_id: L.house },
  { id: L.deskDrawer, name: 'Desk drawer',  kind: 'drawer',   parent_id: L.office },
  { id: L.shed,       name: 'Shed',         kind: 'building', parent_id: null },
  { id: L.bootTray,   name: 'Boot tray',    kind: 'tray',     parent_id: L.shed },
];

const px = (desc) => `16x16 pixel art icon, ${desc}, limited 8-colour palette, transparent background`;

export const SAMPLE_ITEMS = [
  { id: sid('b', 1),  name: 'Headlamp', quantity: 1, rarity: 'rare', category_id: CAT['Outdoor & Garden'], location_id: L.shed,
    pixel_description: px('orange headlamp with a glowing white lens'), notes: 'Uses AAA batteries' },
  { id: sid('b', 2),  name: 'Mud boots', quantity: 1, rarity: 'uncommon', category_id: CAT['Clothing & Gear'], location_id: L.bootTray,
    pixel_description: px('tall green rubber boots with a brown mud splatter') },
  { id: sid('b', 3),  name: 'Spare 18650 batteries', quantity: 8, rarity: 'common', category_id: CAT['Electronics'], location_id: L.blueBin,
    pixel_description: px('row of silver cylindrical batteries with blue wrappers') },
  { id: sid('b', 4),  name: 'Multimeter', quantity: 1, rarity: 'uncommon', category_id: CAT['Tools'], location_id: L.deskDrawer,
    pixel_description: px('yellow multimeter with a tiny dial and red and black probes') },
  { id: sid('b', 5),  name: 'Hand trowel', quantity: 1, rarity: 'common', category_id: CAT['Outdoor & Garden'], location_id: L.shed,
    pixel_description: px('small steel trowel with a wooden handle') },
  { id: sid('b', 6),  name: 'Duct tape', quantity: 3, rarity: 'common', category_id: CAT['Tools'], location_id: L.pegboard,
    pixel_description: px('grey roll of duct tape') },
  { id: sid('b', 7),  name: 'Warranty folder', quantity: 1, rarity: 'uncommon', category_id: CAT['Household'], location_id: L.deskDrawer,
    pixel_description: px('blue document folder with a white label') },
  { id: sid('b', 8),  name: "Grandfather's pocketknife", quantity: 1, rarity: 'legendary', category_id: CAT['Keepsakes'], location_id: L.deskDrawer,
    pixel_description: px('small folding pocketknife with a worn wooden handle and a golden glint'),
    notes: 'Irreplaceable. Keep in the felt pouch.' },
  { id: sid('b', 9),  name: 'Allen key set', quantity: 1, rarity: 'common', category_id: CAT['Tools'], location_id: L.shelf2,
    pixel_description: px('folded set of silver hex keys'), is_lost: true, lost_since: '2026-09-28T09:00:00.000Z',
    notes: 'Last seen while building the shelf' },
  { id: sid('b', 10), name: 'Raspberry Pi 4', quantity: 1, rarity: 'rare', category_id: CAT['Electronics'], location_id: L.blueBin,
    pixel_description: px('green circuit board with silver ports and a tiny raspberry') },
  { id: sid('b', 11), name: 'Rain jacket', quantity: 1, rarity: 'uncommon', category_id: CAT['Clothing & Gear'], location_id: L.bootTray,
    pixel_description: px('yellow hooded rain jacket with raindrops') },
  { id: sid('b', 12), name: 'Camp stove', quantity: 1, rarity: 'rare', category_id: CAT['Outdoor & Garden'], location_id: L.shed,
    pixel_description: px('compact silver camp stove with a blue flame') },
];

// Events are placed relative to "today" so the sample always looks current.
function dayAt(offsetDays, hour = 9) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
function allDay(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function sampleEvents() {
  return [
    { id: sid('e', 1), title: 'Bin day', starts_at: allDay(2), all_day: true, rrule: 'FREQ=WEEKLY;BYDAY=TU', color: '#5fb85f' },
    { id: sid('e', 2), title: 'Fix the garden gate', starts_at: dayAt(3, 10), ends_at: dayAt(3, 12), color: '#e0a030' },
    { id: sid('e', 3), title: 'Return library books', starts_at: allDay(5), all_day: true, color: '#4aa3df' },
    { id: sid('e', 4), title: 'Check the gear in the shed', starts_at: dayAt(7, 15), ends_at: dayAt(7, 16), color: '#b07acc' },
  ];
}

// Local-only mode: seed once, then leave the user's changes alone.
export async function seedSample(store) {
  if (await store.meta.get('sample_seeded')) return false;
  await ensureDefaults(store);
  for (const row of SAMPLE_LOCATIONS) await store.upsert('locations', row);
  for (const row of SAMPLE_ITEMS) await store.upsert('items', row);
  for (const row of sampleEvents()) await store.upsert('events', row);
  await store.meta.set('sample_seeded', true);
  return true;
}
