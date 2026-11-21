// Settings sheet: account, sync, rarity meanings, categories, display, backup.
import { h, replace, toast, openSheet, confirmDialog } from './dom.js';
import { language, t, categoryLabel } from './language.js';
import { TRACK_FIELDS, TRACK_LABELS, categoryFields } from '../data/tracking.js';
import { openPersonalHub } from './personal-hub.js';
import { RARITIES } from '../data/schema.js';
import { DEFAULT_SETTINGS } from '../data/defaults.js';
import { exportAll, importAll, inspectBackup, downloadBackup } from '../data/backup.js';
import {exportPortableArchive, inspectPortableTar, restorePortableArchive, downloadPortableArchive} from '../data/portable-archive.js';
import {legacyCacheExists,exportUnverifiedLegacyCache} from '../data/legacy-recovery.js';
import {getSyncConflicts,exportSyncConflicts} from '../data/conflicts.js';
import { openPlaceSearchSheet } from './place-search.js';
import { openMudSettings } from './mud-settings.js';
import { openSourcesSheet } from './feed.js';
import { openLayoutEditor } from './layout-editor.js';
import { openWallpaperSettings } from './wallpaper-settings.js';
import { skyLighting } from '../weather/environment.js';
import {clockAppearance,analogClockSvg} from '../widgets/registry.js';

export async function openSettings({ ctx, syncStatus, weather, feed, proxySuggestion }) {
  const { store, auth, mode } = ctx;
  const session = auth ? await auth.getSession() : null;
  const labels = await store.getSetting('rarity_labels');
  const ui = await store.getSetting('ui');
  const place = await store.getSetting('location');
  let categoryDefaults = (await store.getSetting('category_tracking_defaults')) || {};
  const categories = (await store.list('categories')).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const languageBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Language / Idioma'),
    h('label', {}, 'Language / Idioma'),
    h('select', { 'aria-label': 'Language', onchange: e => { localStorage.setItem('tracker-language', e.target.value); location.reload(); } },
      h('option', { value: 'en', selected: language() === 'en' }, 'English'),
      h('option', { value: 'es', selected: language() === 'es' }, 'Español')));

  // -- account & sync
  const account = h('section', { class: 'set-block' },
    h('h3', {}, 'Account and sync'),
    h('p', { class: 'prose' }, mode === 'local'
      ? 'Running on this device only, with sample data. Add your Supabase keys in config.js to sync with your phone and computer.'
      : `Signed in as ${session?.user?.email ?? 'unknown'}.`),
    mode === 'cloud' ? h('p', { class: 'prose' }, syncStatus()) : null,
    ctx.offlineAuthorized?h('p',{class:'hint',role:'status'},'Offline: this device is using the previously verified account cache. Reconnect to verify access and upload changes.'):null,
    mode === 'cloud' ? h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => { store.sync.syncNow(); toast('Syncing'); } }, 'Sync now'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: 'Download everything again?', message: 'Re-reads all data from the server. Changes that have not uploaded yet are kept.', confirmLabel: 'Download again' });
        if (ok) { store.sync.fullResync(); toast('Downloading everything'); }
      } }, 'Re-download everything'),
      h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        const ok = await confirmDialog({ title: 'Sign out?', message: 'Your account cache and pending uploads will be preserved on this device, but are NOT encrypted. Do not sign out on a shared computer without securely clearing device storage. For sensitive data, export a backup first.', confirmLabel: 'Sign out', danger: true });
        if (!ok) return;
        store.sync.stop();await auth.signOut();location.reload();
      } }, 'Sign out')) : null);

  const recovery=h('section',{class:'set-block'},h('h3',{},'Recovery and device privacy'),
  h('p',{class:'hint'},'The pre-upgrade browser cache has no verifiable owner. Review it before manually restoring. Signing out preserves local data; it is not encrypted.'),
  h('div',{class:'inline-actions'},
   h('button',{class:'btn small',type:'button',onclick:async()=>{
     try{if(!await legacyCacheExists()){toast('No pre-upgrade cache found.');return;}
       const ok=await confirmDialog({title:'Export unverified cache?',message:'Old data could belong to another account. The downloaded JSON is readable: save it privately.',confirmLabel:'Export legacy data'});
       if(ok)downloadBackup(await exportUnverifiedLegacyCache(),'personal-tracker-LEGACY-UNVERIFIED-'+new Date().toISOString().slice(0,10)+'.json');
     }catch(e){toast(e.message);}
   }},'Export old browser data'),
   h('button',{class:'btn small',type:'button',onclick:async()=>{
     try{
       const conflicts=await getSyncConflicts(store);
       if(!conflicts.length){toast('No losing sync revisions saved on this device.');return;}
       const ok=await confirmDialog({title:'Export sync conflict copies?',message:conflicts.length+' local versions were preserved when a newer server edit won. These copies may contain private data. Review before restoring.',confirmLabel:'Export conflict copies'});
       if(ok)downloadBackup(await exportSyncConflicts(store),'personal-tracker-sync-conflicts-'+new Date().toISOString().slice(0,10)+'.json');
     }catch(e){toast(e.message);}
   }},'Export conflicting edits'),
   mode==='cloud'?h('button',{class:'btn small danger',type:'button',onclick:async()=>{
      const s=store.sync.getStatus();if(s.pending||s.failed){toast('Unsynced changes exist. Export and sync before erasing this device.');return;}
      const ok=await confirmDialog({title:'Erase account cache?',message:'This permanently erases this account’s local database on this device. Verify your cloud backup first.',confirmLabel:'Erase local cache and sign out',danger:true});
      if(!ok)return;store.sync.stop();await store.resetCache();await auth.signOut();location.reload();
   }},'Erase account cache from device'):null));
  // -- mud forecast
  const hasPlace = place && typeof place.lat === 'number';
  const mudBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Mud forecast'),
    h('p', { class: 'prose' }, hasPlace
      ? `Forecast for ${place.label ?? place.name}${typeof place.elevation_m === 'number' ? `, ${Math.round(place.elevation_m)} m above sea level` : ''}.`
      : 'No place chosen yet.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openPlaceSearchSheet({ weather, current: hasPlace ? place : null }) }, hasPlace ? 'Change place' : 'Choose a place'),
      h('button', { class: 'btn small desktop-only', type: 'button', onclick: () => openMudSettings({ store, weather }) }, 'Tune the mud model')));

  // -- optional second clock inside the Overview weather / mud widget
  const analogBlock=createAnalogClockSettings(store,ui);
  const clockZone = h('input', { type: 'text', value: ui?.extra_clock_timezone ?? '',
    placeholder: 'e.g. GMT-4 or Europe/London', 'aria-label': 'Second clock time zone' });
  const clockLabel = h('input', { type: 'text', value: ui?.extra_clock_label ?? '',
    placeholder: 'e.g. London', maxlength: 32, 'aria-label': 'Second clock label' });
  const clockFeedback = h('p', { class: 'hint' }, 'Leave the time zone empty to show only your local clock.');
  const clockSettings = h('section', { class: 'set-block' },
    h('h3', {}, 'Overview clocks'),
    h('p', { class: 'hint' }, 'Add a city time zone (America/New_York) or a fixed offset (GMT-4). City zones automatically adjust for daylight saving.'),
    h('label', {}, 'Second clock time zone'), clockZone,
    h('label', {}, 'Second clock name'), clockLabel,
    h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const entered = clockZone.value.trim();
      const fixed = /^(?:GMT|UTC)\s*([+-])(\d{1,2})$/i.exec(entered);
      const zone = fixed ? `Etc/GMT${fixed[1] === '+' ? '-' : '+'}${Number(fixed[2])}` : entered;
      try {
        if (fixed && Number(fixed[2]) > 14) throw new RangeError('Offset out of range');
        if (zone) new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date());
        await store.setSetting('ui', { ...(await store.getSetting('ui')), extra_clock_timezone: zone, extra_clock_label: clockLabel.value.trim() || entered });
        clockFeedback.textContent = 'Clock settings saved.';
      } catch { clockFeedback.textContent = 'Invalid time zone. Try GMT-4, America/New_York, or Europe/London.'; }
    } }, 'Save clocks'), clockFeedback);

  // -- feed and layout
  const feedBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Feed'),
    h('p', { class: 'hint' }, 'Choose the accounts and sites your headlines come from, and the keywords to highlight.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openSourcesSheet({ store, feed, proxySuggestion }) }, 'Sources and keywords')));
  const layoutBlock = h('section', { class: 'set-block desktop-only-block' },
    h('h3', {}, 'Layout'),
    h('p', { class: 'hint' }, 'Arrange the widgets on the Overview tab and on the wallpaper.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small desktop-only', type: 'button', onclick: () => openLayoutEditor({ store, ctx: { store, weather, feed }, profile: 'wallpaper' }) }, 'Edit layouts')));

  // -- wallpaper
  const wallpaperBlock = h('section', { class: 'set-block' },
    h('h3', {}, 'Wallpaper'),
    h('p', { class: 'hint' }, 'Show your layout as a live Wallpaper Engine wallpaper. This makes a read-only key for it.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openWallpaperSettings({ ctx }) }, 'Wallpaper access')));

  // -- rarity meanings
  const rarityInputs = RARITIES.map((r) => {
    const cur = labels?.[r] ?? DEFAULT_SETTINGS.rarity_labels[r];
    return { r, storedLabel: cur.label, storedMeaning: cur.meaning ?? '', shownLabel: t(cur.label), shownMeaning: t(cur.meaning ?? ''),
      label: h('input', { type: 'text', value: t(cur.label), maxlength: 24, 'aria-label': `${r} name` }),
      meaning: h('input', { type: 'text', value: t(cur.meaning ?? ''), maxlength: 80, 'aria-label': `${r} meaning`, placeholder: 'What this tier means to you' }) };
  });
  const rarity = h('section', { class: 'set-block' },
    h('h3', {}, 'Rarity tiers'),
    h('p', { class: 'hint' }, 'Rename the four tiers and say what each one means to you.'),
    rarityInputs.map(({ r, label, meaning }) => h('div', { class: `rarity-edit r-${r}` }, label, meaning)),
    h('button', { class: 'btn small', type: 'button', onclick: async () => {
      const value = {};
      for (const { r, label, meaning, storedLabel, storedMeaning, shownLabel, shownMeaning } of rarityInputs) value[r] = { label: label.value.trim() === shownLabel ? storedLabel : (label.value.trim() || DEFAULT_SETTINGS.rarity_labels[r].label), meaning: meaning.value.trim() === shownMeaning ? storedMeaning : meaning.value.trim() };
      await store.setSetting('rarity_labels', value);
      toast('Rarity tiers saved');
    } }, 'Save tiers'));

  // -- categories
  const catList = h('div', { class: 'cat-list' });
  function renderCats(rows) {
    catList.replaceChildren(...rows.map((c) => {
      const icon = h('input', { type: 'text', value: c.icon ?? '', maxlength: 4, class: 'cat-icon', 'aria-label': `${c.name} icon` });
      const shownName = categoryLabel(c);
      const name = h('input', { type: 'text', value: shownName, maxlength: 80, 'aria-label': 'Category name' });
      const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.color ?? '') ? c.color : '#c9b58a', 'aria-label': `${c.name} colour` });
      const save = async () => { if (name.value.trim()) await store.upsert('categories', { ...c, name: name.value.trim() === shownName ? c.name : name.value.trim(), icon: icon.value.trim() || null, color: color.value }); };
      [icon, name, color].forEach((i) => i.addEventListener('change', save));
      const fieldControls = h('div', { class:'cat-field-controls' }, TRACK_FIELDS.map(key => {
        const checkbox = h('input', { type:'checkbox', checked: Boolean(categoryFields(categoryDefaults,c.id)[key]), onchange: async e => {
          categoryDefaults = { ...categoryDefaults, [c.id]: { ...categoryFields(categoryDefaults,c.id), [key]: e.target.checked } };
          await store.setSetting('category_tracking_defaults', categoryDefaults);
          toast('Category defaults saved');
        } });
        return h('label', { class:'check' }, checkbox, t(TRACK_LABELS[key]));
      }));
      return h('div', { class: 'cat-row cat-row-with-fields' }, h('div', { class:'cat-main' }, icon, name, color),
        fieldControls,
        h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          const ok = await confirmDialog({ title: `Delete ${c.name}?`, message: 'Items in this category stay in your pack, with no category.', confirmLabel: 'Delete category', danger: true });
          if (!ok) return;
          await store.removeCategory(c.id);
          renderCats(rows.filter((x) => x.id !== c.id));
        } }, 'Delete'));
    }));
  }
  renderCats(categories);
  const newCat = h('input', { type: 'text', placeholder: 'New category name', maxlength: 80, 'aria-label': 'New category name' });
  const cats = h('section', { class: 'set-block' },
    h('h3', {}, 'Categories'),
    h('p', { class: 'hint' }, 'Choose which inventory fields are enabled by default in each category. Individual items can override any checkbox. Saved values are never deleted when hidden.'), catList,
    h('div', { class: 'cat-row' }, newCat,
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const nm = newCat.value.trim();
        if (!nm) return;
        const row = await store.upsert('categories', { name: nm, sort_order: categories.length + 1 });
        categories.push(row); renderCats(categories); newCat.value = '';
      } }, 'Add category')));

  const personalHub = h('section', { class:'set-block' },
    h('h3', {}, t('Personal hub')),
    h('p', { class:'hint' }, 'Tasks, personal notes, expense records, search, and notifications in one place.'),
    h('button', { class:'btn', type:'button', onclick: () => { location.hash='#hub'; } }, 'Open personal hub'));

  // -- display
  const scan = h('input', { type: 'checkbox', id: 'st-scan', checked: Boolean(ui?.scanlines),
    onchange: async (e) => { await store.setSetting('ui', { ...(await store.getSetting('ui')), scanlines: e.target.checked }); } });
  const accentColor = h('input',{type:'color',value: /^#[0-9a-f]{6}$/i.test(ui?.accent_color||'')?ui.accent_color:'#43b9ad', onchange:async e=>{await store.setSetting('ui',{...(await store.getSetting('ui')),accent_color:e.target.value,theme_preset:'custom'}); updateChoices('custom'); window.dispatchEvent(new Event('tracker-theme-refresh'));}});
  const paletteColors = [ ['Background', 'background_color', '#17130f'], ['Panels', 'panel_color', '#231c15'], ['Secondary panels', 'panel_secondary_color', '#2e251c'], ['Text', 'text_color', '#eadfc4'], ['Muted text', 'muted_color', '#a39475'], ['Borders', 'border_color', '#4a3b2a'] ];
  const customColors = paletteColors.map(([label,key,def]) => h('label', { class: 'theme-color-field' }, h('span', {}, label), h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(ui?.[key] || '') ? ui[key] : def, onchange: async e => { await store.setSetting('ui', { ...(await store.getSetting('ui')), [key]:e.target.value,theme_preset:'custom' }); updateChoices('custom'); window.dispatchEvent(new Event('tracker-theme-refresh')); } })));
  const panelOpacity = h('input',{type:'range',min:65,max:100,step:5,value:Math.round(100*(ui?.panel_opacity??1)),onchange:async e=>await store.setSetting('ui',{...(await store.getSetting('ui')),panel_opacity:Number(e.target.value)/100})});
  const spriteMotion=h('select',{'aria-label':'Sprite animation',onchange:async e=>{await store.setSetting('ui',{...(await store.getSetting('ui')),sprite_motion:e.target.value});window.dispatchEvent(new Event('tracker-theme-refresh'));}},[['static','Static sprite depth','Profundidad estática'],['subtle','Reactive sprites','Sprites interactivos'],['lively','Animated idle sprites','Sprites animados en reposo']].map(([value,en,es])=>h('option',{value,selected:(ui?.sprite_motion||'subtle')===value},language()==='es'?es:en)));
  const lessMotion = h('input',{type:'checkbox',checked:Boolean(ui?.reduce_animations),onchange:async e=>await store.setSetting('ui',{...(await store.getSetting('ui')),reduce_animations:e.target.checked})});
  const presets = {
    sakura: {"name":"Sakura Dusk","accent_color":"#ec9cbb","background_color":"#201522","panel_color":"#302239","panel_secondary_color":"#47304b","text_color":"#ffedf4","muted_color":"#c4a1ba","border_color":"#77546d"},
    arctic: {"name":"Arctic Aurora","accent_color":"#83e3c6","background_color":"#111e2a","panel_color":"#1b3040","panel_secondary_color":"#254454","text_color":"#ecf7fa","muted_color":"#a0c0cc","border_color":"#456c7e"},
    forge: {"name":"Ember Forge","accent_color":"#f59e62","background_color":"#1d1213","panel_color":"#312023","panel_secondary_color":"#482c2a","text_color":"#ffe5c9","muted_color":"#c7a092","border_color":"#80554c"},
    moss: {"name":"Moss & Stone","accent_color":"#b2ce7b","background_color":"#1c2318","panel_color":"#2a3825","panel_secondary_color":"#3c4b32","text_color":"#edf0dc","muted_color":"#b1bd98","border_color":"#596c45"},
    cyber: {"name":"Neon Arcade","accent_color":"#ff78cc","background_color":"#111023","panel_color":"#211a39","panel_secondary_color":"#322455","text_color":"#f3ecff","muted_color":"#bfc0dd","border_color":"#7554a9"},
    lunar: {"name":"Lunar Silver","accent_color":"#bed1f1","background_color":"#141923","panel_color":"#242c38","panel_secondary_color":"#344253","text_color":"#eef4ff","muted_color":"#a2b3c9","border_color":"#536781"},
    copper: {"name":"Copper Coast","accent_color":"#d6a66b","background_color":"#172525","panel_color":"#233737","panel_secondary_color":"#314946","text_color":"#f2eadb","muted_color":"#b6c3ad","border_color":"#677b6b"},
    dawn: {"name":"Lavender Dawn","accent_color":"#7853a4","background_color":"#ece8f6","panel_color":"#fbf8ff","panel_secondary_color":"#dfd6ee","text_color":"#352b45","muted_color":"#675877","border_color":"#ae9dc1"},
    blueprint: {"name":"Blueprint","accent_color":"#75c9f9","background_color":"#0b1829","panel_color":"#122b43","panel_secondary_color":"#193d5d","text_color":"#e0f3ff","muted_color":"#9bbbd4","border_color":"#467094"},
    rosewood: {"name":"Rosewood","accent_color":"#e4ad98","background_color":"#25191c","panel_color":"#39272b","panel_secondary_color":"#50363a","text_color":"#fff0e7","muted_color":"#c9a5a0","border_color":"#84615b"},
    classic: { name:'Original / Classic', accent_color:'#43b9ad', background_color:'#17130f', panel_color:'#231c15', panel_secondary_color:'#2e251c', text_color:'#eadfc4', muted_color:'#a39475', border_color:'#4a3b2a' },
    pipboy: { name:'Vault Terminal', accent_color:'#65ff7c', background_color:'#07120a', panel_color:'#0c1c10', panel_secondary_color:'#142a19', text_color:'#a4ffad', muted_color:'#64ae70', border_color:'#2d7540' },
    amber: { name:'Amber CRT', accent_color:'#ffb347', background_color:'#180e08', panel_color:'#29190e', panel_secondary_color:'#362414', text_color:'#ffda99', muted_color:'#b38a55', border_color:'#79512a' },
    midnight: { name:'Midnight Observatory', accent_color:'#b7a5ff', background_color:'#0c0e1e', panel_color:'#171b31', panel_secondary_color:'#222843', text_color:'#e6e8ff', muted_color:'#9da6ca', border_color:'#4b537d' },
    ocean: { name:'Deep Ocean', accent_color:'#5de4e1', background_color:'#06191e', panel_color:'#0c2930', panel_secondary_color:'#16404a', text_color:'#d7f7f5', muted_color:'#8cbfc5', border_color:'#356775' },
    parchment: { name:'Paper Archive', accent_color:'#7b5c3d', background_color:'#ede2ca', panel_color:'#fff7e7', panel_secondary_color:'#e4d5b9', text_color:'#30261e', muted_color:'#746453', border_color:'#bba787' },
  };
  const presetChoices = h('div',{class:'theme-presets'});
  const presetName = h('p',{class:'hint'},'Every preset can be edited using the individual color controls below.');
  async function saveColor(key,value){await store.setSetting('ui',{...(await store.getSetting('ui')),[key]:value,theme_preset:'custom'});window.dispatchEvent(new Event('tracker-theme-refresh'));updateChoices('custom');}
  function updateChoices(selected){for(const b of presetChoices.children)b.setAttribute('aria-pressed',String(b.dataset.preset===selected));}
  for(const [id,preset] of Object.entries(presets)){
    const b=h('button',{class:'theme-choice',type:'button','data-preset':id,'aria-pressed':String((ui?.theme_preset||'classic')===id),onclick:async()=>{
      await store.setSetting('ui',{...(await store.getSetting('ui')),...Object.fromEntries(Object.entries(preset).filter(([key])=>key!=='name')),theme_preset:id});
      accentColor.value=preset.accent_color;
      customColors.forEach((field,i)=>{field.querySelector('input').value=preset[paletteColors[i][1]];});
      window.dispatchEvent(new Event('tracker-theme-refresh'));updateChoices(id);
    }},preset.name,h('span',{class:'theme-swatch'},[preset.background_color,preset.panel_color,preset.accent_color,preset.text_color].map(color=>h('i',{style:`background:${color}`}))));
    presetChoices.append(b);
  }
  // Personal palettes are stored with UI preferences; never require separate files.
  const savedThemes=h('div',{class:'theme-presets theme-saved-presets'});
  const paletteKeys=['accent_color',...paletteColors.map(row=>row[1])];
  function drawSavedThemes(saved=[]) {
    replace(savedThemes,...saved.map((palette,index)=>h('div',{class:'theme-saved-choice'},
      h('button',{class:'btn small',onclick:async()=>{const value=await store.getSetting('ui')||{};
        await store.setSetting('ui',{...value,...palette.colors,theme_preset:`saved-${index}`});
        accentColor.value=palette.colors.accent_color||'#43b9ad';
        customColors.forEach((field,i)=>{field.querySelector('input').value=palette.colors[paletteColors[i][1]];});
        window.dispatchEvent(new Event('tracker-theme-refresh'));updateChoices('none');
      }},palette.name),
      h('button',{class:'btn small ghost',title:language()==='es'?'Eliminar tema':'Delete theme',onclick:async()=>{
        const value=await store.getSetting('ui')||{};const list=(value.custom_theme_presets||[]).filter((_,i)=>i!==index);
        await store.setSetting('ui',{...value,custom_theme_presets:list});drawSavedThemes(list);
      }},language()==='es'?'Eliminar':'Delete'))));
  }
  drawSavedThemes(ui?.custom_theme_presets||[]);
  const saveTheme=h('button',{class:'btn',type:'button',onclick:async()=>{
    const name=prompt(language()==='es'?'Nombre del nuevo tema':'Name your new theme');if(!name?.trim())return;
    const value=await store.getSetting('ui')||{};const palettes=[...(value.custom_theme_presets||[])];
    if(palettes.length>=30){toast(language()==='es'?'Máximo de 30 temas':'Maximum 30 saved themes');return;}
    const colors=Object.fromEntries(paletteKeys.map(key=>[key,value[key]||presets.classic[key]]));
    palettes.push({name:name.trim().slice(0,42),colors});
    await store.setSetting('ui',{...value,custom_theme_presets:palettes});drawSavedThemes(palettes);toast(t('Save'));
  }},language()==='es'?'Guardar como tema nuevo':'Save current palette as theme');
  const layoutWidth=h('select',{'aria-label':'Layout width',onchange:async e=>{await store.setSetting('ui',{...(await store.getSetting('ui')),layout_width:e.target.value});window.dispatchEvent(new Event('tracker-theme-refresh'));}},
    [['adaptive','Adaptive (recommended)'],['compact','Compact'],['wide','Full width']].map(([value,label])=>h('option',{value,selected:(ui?.layout_width||'adaptive')===value},label)));
  // Environmental light augments the palette instead of replacing any colors.
  const skyMode=h('select',{'aria-label': 'Environmental lighting mode',onchange:async e=>{
    await store.setSetting('ui',{...(await store.getSetting('ui')),sky_lighting_mode:e.target.value});
    window.dispatchEvent(new Event('tracker-theme-refresh'));
  }},[['auto',language()==='es'?'Automático (clima y luna)':'Automatic (weather + moon)'],
     ['time',language()==='es'?'Solo hora del día':'Time of day only'],
     ['off',language()==='es'?'Desactivado':'Off — static theme']].map(([value,label])=>h('option',{value,selected:(ui?.sky_lighting_mode||'auto')===value},label)));
  const glowSlider=h('input',{type:'range',min:0,max:100,step:5,value:ui?.sky_lighting_intensity??35,
    'aria-label':'Environmental glow intensity',oninput:async e=>{
      await store.setSetting('ui',{...(await store.getSetting('ui')),sky_lighting_intensity:Number(e.target.value)});
      window.dispatchEvent(new Event('tracker-theme-refresh'));
    }});
  const skySmooth=h('input',{type:'checkbox',checked:ui?.sky_lighting_smooth!==false,onchange:async e=>{
    await store.setSetting('ui',{...(await store.getSetting('ui')),sky_lighting_smooth:e.target.checked});
    window.dispatchEvent(new Event('tracker-theme-refresh'));
  }});
  const skyEvents=h('input',{type:'checkbox',checked:ui?.sky_lighting_events!==false,onchange:async e=>{
    await store.setSetting('ui',{...(await store.getSetting('ui')),sky_lighting_events:e.target.checked});
    window.dispatchEvent(new Event('tracker-theme-refresh'));
  }});
  const skyControls=h('div',{class:'sky-settings'},
    h('h4',{},language()==='es'?'Iluminación ambiental':'Environmental lighting'),
    h('p',{class:'hint'},language()==='es'?'Usa la hora de salida y puesta del sol, el clima y la fase lunar del lugar seleccionado. Los eclipses son avisos globales: la visibilidad local no está confirmada.':'Uses sunrise/sunset, weather and moon phase at your selected location. Eclipse alerts are worldwide listings, not local visibility predictions.'),
    h('label',{},language()==='es'?'Modo de iluminación':'Lighting mode'),skyMode,
    h('label',{},language()==='es'?'Intensidad':'Glow intensity'),glowSlider,
    h('label',{class:'check'},skySmooth,language()==='es'?'Transiciones suaves':'Smooth transitions'),
    h('label',{class:'check'},skyEvents,language()==='es'?'Destacar eventos celestes':'Highlight sky events'));
  // A sample palette and sky-light preview. No saved preference changes
  // until Apply is pressed; the sample events are not local visibility claims.
  const previewPalette=h('select',{'aria-label':'Preview palette'},
    Object.entries(presets).map(([id,p])=>h('option',{value:id,selected:id===(presets[ui?.theme_preset]?ui.theme_preset:'classic')},p.name)));
  previewPalette.value=presets[ui?.theme_preset]?ui.theme_preset:'classic';
  const previewScene=h('select',{'aria-label':'Preview sky condition'},
    [['current','Current sky'],['dawn','Dawn'],['day','Daylight'],['dusk','Sunset'],['night','Moonlight'],['meteor','Meteor shower'],['eclipse','Eclipse accent'],['off','No lighting']]
      .map(([id,label])=>h('option',{value:id},label)));
  const previewCard=h('div',{class:'theme-live-preview'},
    h('div',{class:'theme-preview-panel'},
      h('strong',{},language()==='es'?'Vista previa':'Example panel'),
      h('p',{},language()==='es'?'Así se verían los colores y la iluminación.':'A sample of the colors and lighting.'),
      h('span',{class:'theme-preview-action'},language()==='es'?'Botón':'Button')));
  function updateThemePreview(){
    const palette=presets[previewPalette.value]||presets.classic;
    const scene=previewScene.value;
    const dates={dawn:'2026-11-11T06:20:00Z',day:'2026-11-11T12:00:00Z',dusk:'2026-11-11T18:00:00Z',
      night:'2026-11-11T23:00:00Z',meteor:'2026-11-17T23:00:00Z',eclipse:'2027-02-06T12:00:00Z'};
    const date=new Date(dates[scene]||Date.now());
    const key=date.toISOString().slice(0,10);
    const simulated={place:{timezone:'UTC'},rows:[{date:key,raw:{sunrise:key+'T06:20',sunset:key+'T18:00'}}],
      current:{is_day:scene==='night'||scene==='meteor'?0:1,cloud_cover:5,weather_code:0}};
    const result=skyLighting(scene==='current'?weather.getState():simulated,
      {sky_lighting_mode:scene==='off'?'off':'auto',sky_lighting_intensity:70},date);
    const strength=result.opacity>0?Math.min(.55,.15+result.opacity*3):0;
    previewCard.style.background=`radial-gradient(ellipse at 95% 8%,rgb(${result.rgb} / ${strength}),transparent 85%),${palette.background_color}`;
    previewCard.style.setProperty('--preview-panel',palette.panel_color);
    previewCard.style.setProperty('--preview-border',palette.border_color);
    previewCard.style.setProperty('--preview-text',palette.text_color);
    previewCard.style.setProperty('--preview-accent',palette.accent_color);
  }
  previewPalette.addEventListener('change',updateThemePreview);
  previewScene.addEventListener('change',updateThemePreview);
  updateThemePreview();
  const applyThemePreview=h('button',{class:'btn small primary',type:'button',onclick:async()=>{
    const id=previewPalette.value,preset=presets[id];
    if(!preset)return;
    await store.setSetting('ui',{...(await store.getSetting('ui')), ...Object.fromEntries(Object.entries(preset).filter(([k])=>k!=='name')),theme_preset:id});
    accentColor.value=preset.accent_color;
    customColors.forEach((field,i)=>{field.querySelector('input').value=preset[paletteColors[i][1]];});
    window.dispatchEvent(new Event('tracker-theme-refresh'));updateChoices(id);
    toast(language()==='es'?'Tema aplicado':'Theme applied');
  }},language()==='es'?'Aplicar este tema':'Apply this theme');
  const previewBlock=h('div',{class:'theme-preview-block'},
    h('h4',{},language()==='es'?'Vista previa sin guardar':'Preview without saving'),
    h('p',{class:'hint'},language()==='es'?'Cambia los ejemplos sin modificar tu tema actual.':'Try colors and sky effects without changing your saved theme.'),
    h('div',{class:'theme-preview-controls'},previewPalette,previewScene),
    previewCard,applyThemePreview);

  const display = h('section', { class: 'set-block' },
    h('h3', {}, 'Display'),
    h('label', {}, t('Theme presets')), presetChoices, presetName, previewBlock, h('h4',{},language()==='es'?'Mis temas':'My saved themes'),savedThemes,saveTheme,
    h('label', {}, 'Desktop layout width'), layoutWidth,skyControls,
    h('label', {}, 'Accent color'), accentColor,
    h('p', { class: 'hint' }, 'Customize each part of the palette. Changes sync with your account.'), ...customColors,
    h('label', {}, 'Panel opacity'), panelOpacity,
    h('label',{},language()==='es'?'Animación de sprites':'Sprite animation'),spriteMotion,
    h('label', {class:'check'}, lessMotion, 'Reduce animations'),
    h('label', { class: 'check', for: 'st-scan' }, scan, 'Scanline effect'),
    h('label', { for: 'st-week' }, 'Calendar week starts on'),
    h('select', { id: 'st-week', onchange: async (e) => { await store.setSetting('ui', { ...(await store.getSetting('ui')), week_start: e.target.value }); } },
      h('option', { value: 'mon', selected: ui?.week_start !== 'sun' }, 'Monday'),
      h('option', { value: 'sun', selected: ui?.week_start === 'sun' }, 'Sunday')));

  // -- typography and navigation (saved on this device)
  const fontSelect = h('select', { 'aria-label': 'Interface font' },
    [['clean', 'Clean / sharper (recommended)'], ['pixel', 'Original pixel font'], ['mono', 'Monospace']].map(([value, label]) =>
      h('option', { value, selected: (localStorage.getItem('tracker-font-v1') || 'clean') === value }, label)));
  const sizeSelect = h('select', { 'aria-label': 'Text size' },
    [14, 15, 16, 17, 18, 19, 20, 21].map(value => h('option', { value: String(value), selected: Number(localStorage.getItem('tracker-font-size-v1') || 16) === value }, `${value}px`)));
  fontSelect.addEventListener('change', () => { localStorage.setItem('tracker-font-v1', fontSelect.value); window.dispatchEvent(new Event('tracker-display-change')); });
  sizeSelect.addEventListener('change', () => { localStorage.setItem('tracker-font-size-v1', sizeSelect.value); window.dispatchEvent(new Event('tracker-display-change')); });
  const typography = h('section', { class: 'set-block' }, h('h3', {}, 'Typography'),
    h('p', { class: 'hint' }, 'Choose a sharper font and a comfortable text size. Saved on this device.'),
    h('label', {}, 'Font'), fontSelect, h('label', {}, 'Text size'), sizeSelect);
  const navNames = { overview: 'Overview', inventory: 'Pack', mud: 'Weather', calendar: 'Calendar', feed: 'Feed', diary: 'Logs', games: 'Library' };
  const navOrder = h('div');
  function renderNavOrder() {
    const order = (() => { try { return JSON.parse(localStorage.getItem('tracker-nav-order-v1') || 'null'); } catch { return null; } })();
    const keys = Array.isArray(order) ? [...order.filter(k=>k in navNames),...Object.keys(navNames).filter(k=>!order.includes(k))] : Object.keys(navNames);
    navOrder.replaceChildren(...keys.map((key, i) => h('div', { class: 'nav-order-row' },
      h('span', {}, navNames[key]), h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', disabled: i === 0, 'aria-label': `Move ${navNames[key]} earlier`, onclick: () => { window.dispatchEvent(new CustomEvent('tracker-nav-change', { detail: { from: key, to: keys[i-1] } })); renderNavOrder(); } }, 'Up'),
        h('button', { class: 'btn small', type: 'button', disabled: i === keys.length-1, 'aria-label': `Move ${navNames[key]} later`, onclick: () => { window.dispatchEvent(new CustomEvent('tracker-nav-change', { detail: { from: key, to: keys[i+1] } })); renderNavOrder(); } }, 'Down')))));
  }
  renderNavOrder();
  const navigation = h('section', { class: 'set-block' }, h('h3', {}, 'Navigation order'),
    h('p', { class: 'hint' }, 'Drag tabs on desktop, or use these buttons on desktop or phone. Saved on this device.'), navOrder);

  // -- backup
  const file = h('input', { type: 'file', accept: 'application/json', 'aria-label': 'Backup file' });
  const out = h('p', { class: 'prose' });
  const backup = h('section', { class: 'set-block' },
    h('h3', {}, 'Backup'),
    h('p', { class: 'hint' }, 'Exports include records and settings, but NOT photos, game backup file contents, or imported local music. The JSON is readable and may contain sensitive data. Protect it and back up media separately.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: async () => downloadBackup(await exportAll(store)) }, 'Download backup')),
    h('div', { class: 'inline-actions' }, file,
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const f = file.files?.[0];
        if (!f) { out.textContent = 'Choose a backup file first.'; return; }
        try {
          if(f.size>50*1024*1024)throw Error('Backup is too large to inspect safely (50 MB limit).');
          const backupData=JSON.parse(await f.text()),inspection=inspectBackup(backupData,{mode:'merge'});
          const count=Object.values(inspection.counts).reduce((total,n)=>total+n,0);
          const ok=await confirmDialog({title:'Review backup restore',
            message:'This file contains '+count+' records across '+Object.keys(inspection.counts).length+' tables. '+
              (inspection.errors.length?inspection.errors.length+' invalid entries will be SKIPPED. ':'')+
              'Merge keeps newer records. A readable safety checkpoint of your current records will be downloaded before applying. Photos and audio are NOT included in the checkpoint.',
            confirmLabel:'Download safety copy and restore'});
          if(!ok){out.textContent='Restore canceled. No records changed.';return;}
          // Never start a restore if creating its safety checkpoint fails.
          downloadBackup(await exportAll(store),'personal-tracker-before-restore-'+new Date().toISOString().slice(0,10)+'.json');
          const s=await importAll(store,backupData,{mode:'merge'});
          out.textContent=`Imported: ${s.added} added, ${s.updated} updated, ${s.skipped} unchanged${s.errors.length ? `, ${s.errors.length} could not be read` : ''}.`;
        } catch (err) { out.textContent=err.message; }
      } }, 'Restore (merge)')),
    out);


  // A portable TAR is an explicit, separate path from legacy structured JSON.
  // Partial category exports say which media were included. All downloads are
  // readable local files, so do not store them in public cloud drives.
  const portableFile=h('input',{type:'file',accept:'.tar,application/x-tar','aria-label':'Portable TAR archive'});
  const portableScope=h('select',{'aria-label':'Portable media categories'},[
    ['all','All records, photos, game saves and local audio'],
    ['photos','Records and photos only'],
    ['games','Records and game saves only'],
    ['audio','Records and local audio only'],
    ['records','Records only (portable TAR)']
  ].map(([value,name])=>h('option',{value},name)));
  const portableStatus=h('p',{class:'prose',role:'status','aria-live':'polite'});
  const portableExport=h('button',{class:'btn small primary',type:'button',onclick:async()=>{
    if(!await confirmDialog({title:'Export private portable archive?',
      message:'This TAR includes readable account records and selected files. It can contain private notes and financial records; protect it like a personal document. A full archive requires private media to be reachable.',
      confirmLabel:'Create private TAR'}))return;
    portableExport.disabled=true;portableStatus.textContent='Collecting and verifying selected private files…';
    try{
      const selected=portableScope.value;
      const include={photos:['all','photos'].includes(selected),games:['all','games'].includes(selected),audio:['all','audio'].includes(selected)};
      const result=await exportPortableArchive({store,photos:ctx.photos,gameBackups:ctx.gameBackups,include});
      downloadPortableArchive(result.blob);
      portableStatus.textContent='Archive ready: '+result.manifest.assets.length+' media files ('+Math.round(result.blob.size/1048576)+' MB). Keep it private.';
    }catch(err){portableStatus.textContent='Portable backup failed: '+err.message;}
    finally{portableExport.disabled=false;}
  }},'Download portable TAR');
  const portableRestore=h('button',{class:'btn small',type:'button',onclick:async()=>{
    const file=portableFile.files?.[0];if(!file){portableStatus.textContent='Choose a portable TAR first.';return;}
    portableRestore.disabled=true;portableStatus.textContent='Verifying every archived media chunk and record…';
    try{
      const inspected=await inspectPortableTar(file),manifest=inspected.manifest;
      const total=Object.values(inspected.inspection.counts).reduce((s,n)=>s+n,0);
      if(manifest.accountId!==(store.accountId||null))throw Error('Archive belongs to another account or storage mode.');
      const categories=Object.entries(manifest.mediaCoverage||{}).filter(([,on])=>on).map(([name])=>name).join(', ')||'none';
      const ok=await confirmDialog({title:'Review portable restore',
        message:'This archive contains '+total+' records and '+manifest.assets.length+' checked media files. Included categories: '+categories+'. Existing newer records are kept. Media uploads may be difficult to undo if interrupted. A structured safety checkpoint will be downloaded before any changes.',
        confirmLabel:'Download checkpoint and restore'});
      if(!ok){portableStatus.textContent='Canceled: no changes were made.';return;}
      downloadBackup(await exportAll(store),'personal-tracker-before-portable-restore-'+new Date().toISOString().slice(0,10)+'.json');
      const done=await restorePortableArchive({store,client:ctx.client,archive:file,inspected});
      portableStatus.textContent='Restore completed: '+done.summary.added+' records added, '+done.summary.updated+' updated; '+done.restored+' of '+done.files+' media files restored or already present.';
    }catch(err){portableStatus.textContent='Portable restore stopped: '+err.message+' Keep the TAR for a safe retry.';}
    finally{portableRestore.disabled=false;}
  }},'Restore portable TAR (merge)');
  const portable=h('section',{class:'set-block'},h('h3',{},'Portable backup with media'),
    h('p',{class:'hint'},'Includes structured records and selected photos, local audio and private game saves. TAR assets are verified with SHA-256 checksums. Up to 150 MB per file and 512 MB per archive; choose a smaller category when needed. Exports never include Supabase login tokens. A missing file stops export instead of silently omitting it.'),
    h('div',{class:'inline-actions'},portableScope,portableExport),
    h('div',{class:'inline-actions'},portableFile,portableRestore),portableStatus);

  // -- install help
  const install = h('section', { class: 'set-block' },
    h('h3', {}, 'Install on your phone'),
    h('p', { class: 'prose' }, 'iPhone: open this page in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, open the menu, then Install app.'));

  const diagnosticsReport=h('div',{class:'diagnostics-report','aria-live':'polite'});
  const runDiagnostics=h('button',{class:'btn small',type:'button',onclick:async()=>{
    runDiagnostics.disabled=true;
    replace(diagnosticsReport,h('p',{class:'hint'},language()==='es'?'Verificando...':'Checking...'));
    try{
      const es=language()==='es';
      const sync=mode==='cloud'?store.sync.getStatus():null;
      const worker='serviceWorker' in navigator?(navigator.serviceWorker.controller?(es?'Activo':'Active'):(es?'Aún sin controlar esta página':'Not controlling this page yet')):(es?'No compatible':'Not supported');
      const cached=typeof caches==='undefined'?[]:await caches.keys();
      const estimate=await navigator.storage?.estimate?.().catch(()=>null);
      const storageSize=estimate?.usage!=null?Math.round(estimate.usage/1048576)+' MB'+(estimate.quota?' / '+Math.round(estimate.quota/1048576)+' MB quota':''):(es?'No disponible':'Unavailable');
      const shells=cached.filter(n=>n.startsWith('tracker-shell-')).sort();
      const weatherState=weather.getState();
      let storage=es?'Sin cuenta conectada':'Not connected';
      if(mode==='cloud'&&ctx.client){
        try{
          const {data}=await ctx.client.auth.getSession();
          if(data?.session?.user?.id){
            const {error}=await ctx.client.storage.from('game-backups').list(data.session.user.id+'/',{limit:1});
            storage=error?(es?'No disponible o sin configurar':'Unavailable or not configured'):(es?'Acceso privado comprobado':'Private access check passed');
          }
        }catch{storage=es?'No se pudo comprobar':'Could not check';}
      }
      const rows=[
        [es?'Conexión':'Connection',navigator.onLine===false?(es?'Sin conexión':'Offline'):(es?'En línea':'Online')],
        [es?'Almacenamiento local':'Local storage',store.adapter.kind==='memory'?(es?'Temporal: puede perderse':'Temporary: may be lost'):(es?'Persistente':'Persistent')],
        [es?'Uso de almacenamiento':'Storage usage',storageSize],
        [es?'Sincronización':'Sync',sync?`${sync.state} · ${sync.pending||0} pending`:(es?'Solo local':'Local only')],
        [es?'Modo sin conexión':'Offline mode',worker],
        [es?'Caché guardada':'Stored cache',shells.at(-1)||(es?'Sin caché':'No stored shell cache')],
        [es?'Datos meteorológicos':'Weather data',weatherState.status+(weatherState.fetchedAt?' · '+new Date(weatherState.fetchedAt).toLocaleString():'')],
        [es?'Copias privadas':'Private backups',storage],
      ];
      replace(diagnosticsReport,...rows.map(([name,value])=>h('p',{class:'diagnostics-line'},h('strong',{},name+': '),value)));
    }catch(err){replace(diagnosticsReport,h('p',{class:'form-error'},String(err.message||err)));}
    finally{runDiagnostics.disabled=false;}
  }},language()==='es'?'Ejecutar diagnósticos':'Run diagnostics');
  const diagnostics=h('section',{class:'set-block'},
    h('h3',{},language()==='es'?'Diagnósticos del proyecto':'Project diagnostics'),
    h('p',{class:'hint'},language()==='es'?'Revisa la sincronización, la caché, el clima y los respaldos sin mostrar contraseñas ni datos personales.':'Check sync, caching, weather, and private storage without showing passwords or personal records.'),
    runDiagnostics,diagnosticsReport);

  // Compact settings categories: only the selected section is visible.
  const groups = [
    ['general', 'General', [languageBlock, account, recovery, install]],
    ['overview', 'Overview & weather', [mudBlock, clockSettings, analogBlock, feedBlock, layoutBlock, wallpaperBlock]],
    ['pack', 'Pack', [cats, rarity]],
    ['appearance', 'Appearance', [display, typography, navigation]],
    ['data', 'Data & tools', [personalHub, backup, portable]],
    ['diagnostics', 'Diagnostics', [diagnostics]],
  ];
  const selected = sessionStorage.getItem('tracker-settings-section') || 'general';
  const tabs = h('nav', { class: 'settings-tabs', 'aria-label': t('Settings') });
  const panes = new Map();
  const buttons = new Map();
  const content = h('div', { class: 'settings-content' });
  for (const [id, name, blocks] of groups) {
    const btn = h('button', { class: 'btn small settings-tab', type: 'button', onclick: () => show(id) }, t(name));
    buttons.set(id, btn); tabs.append(btn);
    const pane = h('div', { class: 'settings-pane', id: `settings-${id}` }, ...blocks);
    panes.set(id, pane); content.append(pane);
  }
  function show(id) {
    if (!panes.has(id)) id = 'general';
    sessionStorage.setItem('tracker-settings-section', id);
    for (const [key, pane] of panes) {
      pane.hidden = key !== id;
      buttons.get(key).classList.toggle('active', key === id);
      buttons.get(key).setAttribute('aria-pressed', String(key === id));
    }
    content.closest('.sheet-body')?.scrollTo({top: 0});
  }
  show(selected);
  openSheet({ title: t('Settings'), body: h('div', { class: 'settings settings-organized' }, tabs, content) });
}

export function createAnalogClockSettings(store,ui={}){
 const es=language()==='es',tr=(a,b)=>es?b:a;
 let draft=clockAppearance(ui);const preview=h('div',{class:'analog-settings-preview'}),feedback=h('p',{class:'hint',role:'status'});
 const select=(key,values)=>h('select',{'aria-label':key,onchange:e=>{draft[key]=e.target.value;draw();}},values.map(([v,en,sp])=>h('option',{value:v,selected:v===draft[key]},tr(en,sp))));
 const style=select('style',[['square','Pixel square','Cuadrado pixel'],['round','Round','Redondo'],['retro','Retro','Retro'],['minimal','Minimal','Minimalista'],['roman','Roman numerals','Números romanos']]),size=select('size',[['small','Small','Pequeño'],['medium','Medium','Mediano'],['large','Large','Grande']]);
 const options=[['visible','Show analog clock','Mostrar reloj analógico'],['numbers','Show numerals','Mostrar números'],['seconds','Second hand','Segundero']].map(([key,en,sp])=>h('label',{class:'check'},h('input',{type:'checkbox',checked:draft[key],onchange:e=>{draft[key]=e.target.checked;draw();}}),tr(en,sp)));
 const colors=[['face','Face','Esfera','#202639'],['hands','Hands','Manecillas','#e9e0cb'],['accent','Accent','Acento','#b9a2f4']].map(([key,en,sp,initial])=>{const input=h('input',{type:'color',value:draft[key]||initial,oninput:e=>{draft[key]=e.target.value;draw();}});return h('div',{class:'analog-color-field'},h('label',{},tr(en,sp),input),h('button',{class:'btn small',type:'button',onclick:()=>{draft[key]=null;input.value=initial;draw();}},tr('Theme','Tema')));});
 function draw(){preview.innerHTML=analogClockSvg(new Date(),{analog_clock:draft});preview.style.opacity=draft.visible?'1':'.45';}
 draw();
 const section=h('section',{class:'set-block analog-clock-settings'},h('h3',{},tr('Analog clock','Reloj analógico')),preview,h('label',{},tr('Clock face','Diseño'),style),h('label',{},tr('Size','Tamaño'),size),options,colors,h('button',{class:'btn primary small',type:'button',onclick:async e=>{const btn=e.currentTarget;btn.disabled=true;try{await store.setSetting('ui',{...(await store.getSetting('ui')),analog_clock:{...draft}});feedback.textContent=tr('Clock appearance saved.','Apariencia guardada.');}catch{feedback.textContent=tr('Could not save clock.','No se pudo guardar el reloj.');}finally{btn.disabled=false;}}},tr('Save appearance','Guardar apariencia')),feedback);
 return section;
}
