// Widget metadata (no DOM code, so tests and the wallpaper can read it).
// Sizes are in grid cells on the 12-column layout.
export const WIDGET_DEFS = {
  mud:      { title: 'Weather',          minW: 3, minH: 2, defaultW: 6, defaultH: 3, route: 'mud' },
  calendar: { title: 'Coming up',             minW: 3, minH: 3, defaultW: 4, defaultH: 4, route: 'calendar' },
  loot:     { title: 'Loot and lost quests',  minW: 3, minH: 2, defaultW: 4, defaultH: 3, route: 'inventory' },
  feed:     { title: 'Headlines',             minW: 3, minH: 3, defaultW: 5, defaultH: 4, route: 'feed' },
  stats:    { title: 'Pack stats',            minW: 3, minH: 1, defaultW: 4, defaultH: 1, route: 'inventory' },
  // The clock is integrated into Weather on the dashboard; legacy wallpaper layouts retain it.
  clock:    { title: 'Clock and date',        minW: 2, minH: 1, defaultW: 3, defaultH: 2, route: null },
  currency: { title: 'Currency Converter', minW: 3, minH: 2, defaultW: 4, defaultH: 3, route: null },
  sky:      { title:'Sky events', minW:3,minH:2,defaultW:4,defaultH:3, route:'mud' },
  recent:   { title: 'Recently played', minW:3, minH:2, defaultW:4, defaultH:3, route:'games' },
  games:    { title: 'Currently playing', minW: 3, minH: 2, defaultW: 4, defaultH: 3, route: 'games' },
  phrase:   { title: 'Phrase of the day',     minW: 4, minH: 3, defaultW: 8, defaultH: 4, route: null },
};
export const WIDGET_IDS = Object.keys(WIDGET_DEFS);

// Which grid each layout profile lives on. The wallpaper is a fixed 16:9 screen
// of 12 x 8 cells; the others grow downwards as far as needed.
export const PROFILES = {
  wallpaper: { label: 'Wallpaper', cols: 12, rows: 8 },
  desktop:   { label: 'Overview on a computer', cols: 12, rows: null },
  mobile:    { label: 'Overview on a phone', cols: 12, rows: null },
};
