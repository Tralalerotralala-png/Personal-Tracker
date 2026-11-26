// Settings -> Wallpaper: create, replace or switch off the wallpaper key, and choose
// whether the wallpaper may show where your things are stored.
import { h, replace, toast, openSheet, confirmDialog } from './dom.js';

// Thin wrapper over the database functions in supabase/schema.sql (section 6).
export function createWallpaperAdmin(client) {
  const fail = (error) => {
    const missing = error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message ?? '');
    return new Error(missing
      ? 'Your Supabase project does not have the wallpaper functions yet. Run the latest supabase/schema.sql in the SQL Editor, then try again.'
      : (error.message || 'Something went wrong talking to Supabase.'));
  };
  const call = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw fail(error);
    return data;
  };
  return {
    status: () => call('wallpaper_status'),
    createKey: (showPlaces) => call('create_wallpaper_key', { p_show_places: Boolean(showPlaces) }),
    setShowPlaces: (show) => call('set_wallpaper_show_places', { p_show: Boolean(show) }),
    revoke: () => call('revoke_wallpaper_key'),
  };
}

async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { input?.select(); toast('Press copy on your keyboard to copy the selected text'); }
}

function copyRow(label, value) {
  const input = h('input', { type: 'text', value, readonly: true, 'aria-label': label, class: 'copy-input' });
  return h('div', { class: 'copy-row' }, h('label', {}, label), h('div', { class: 'inline-actions' }, input,
    h('button', { class: 'btn small', type: 'button', onclick: () => copyText(value, input) }, 'Copy')));
}

export function openWallpaperSettings({ ctx }) {
  const body = h('div', { class: 'wp-settings' });
  const sheet = openSheet({ title: 'Wallpaper', body });

  if (ctx.mode !== 'cloud') {
    replace(body, h('p', { class: 'prose' }, 'The wallpaper reads your data from Supabase, so it needs cloud mode. Add your Supabase address and key to config.js (see the README), then come back here to create a wallpaper key.'));
    return sheet;
  }

  const admin = createWallpaperAdmin(ctx.client);
  const cfg = ctx.config ?? {};

  function revealKey(key, showPlaces) {
    const previewUrl = `${new URL('wallpaper/index.html', location.href).href}#${new URLSearchParams({ url: cfg.SUPABASE_URL, anon: cfg.SUPABASE_ANON_KEY, key })}`;
    replace(body,
      h('p', { class: 'banner warn', role: 'status' }, 'Copy these now. The wallpaper key is shown only this once and cannot be looked up later. If you lose it, make a new one.'),
      h('p', { class: 'prose' }, 'In Wallpaper Engine, open this wallpaper\'s settings and paste the three values:'),
      copyRow('Supabase project address', cfg.SUPABASE_URL),
      copyRow('Supabase public (anon) key', cfg.SUPABASE_ANON_KEY),
      copyRow('Wallpaper key', key),
      h('p', { class: 'hint' }, showPlaces ? 'The wallpaper may show where items are stored.' : 'The wallpaper will not show where items are stored.'),
      h('div', { class: 'inline-actions' },
        h('a', { class: 'btn', href: previewUrl, target: '_blank', rel: 'noopener' }, 'Preview in a browser'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => build() }, 'Done')));
  }

  async function build() {
    replace(body, h('p', { class: 'hint' }, 'Loading...'));
    let status;
    try { status = await admin.status(); }
    catch (err) { replace(body, h('p', { class: 'form-error', role: 'alert' }, err.message)); return; }

    if (!status.exists) {
      const places = h('input', { type: 'checkbox', id: 'wp-places' });
      replace(body,
        h('p', { class: 'prose' }, 'The wallpaper has no sign-in. Instead it uses a long secret key that can only read a small summary of your data: your layout, upcoming events, item names and counts, lost items, and your feed sources. It cannot change anything, and never receives notes, photos or backups.'),
        h('label', { class: 'check', for: 'wp-places' }, places, 'Also show where items are stored (visible to anyone who sees your screen)'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          try { revealKey(await admin.createKey(places.checked), places.checked); }
          catch (err) { toast(err.message); }
        } }, 'Create wallpaper key'));
      return;
    }

    replace(body,
      h('p', { class: 'prose' }, `A wallpaper key exists (made ${new Date(status.created_at).toLocaleDateString()}). For safety it cannot be shown again.`),
      h('p', { class: 'prose' }, status.show_places ? 'The wallpaper currently shows where items are stored.' : 'The wallpaper does not show where items are stored.'),
      h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          try { await admin.setShowPlaces(!status.show_places); toast('Saved. The wallpaper updates at its next refresh.'); build(); }
          catch (err) { toast(err.message); }
        } }, status.show_places ? 'Hide where items are stored' : 'Show where items are stored')),
      h('div', { class: 'inline-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const ok = await confirmDialog({ title: 'Make a new key?', message: 'The old key stops working straight away, so you will need to paste the new one into Wallpaper Engine.', confirmLabel: 'Make new key' });
          if (!ok) return;
          try { revealKey(await admin.createKey(status.show_places), status.show_places); } catch (err) { toast(err.message); }
        } }, 'Make a new key'),
        h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
          const ok = await confirmDialog({ title: 'Turn off the wallpaper?', message: 'The key is deleted and the wallpaper stops updating (it keeps showing its last saved data).', confirmLabel: 'Turn off', danger: true });
          if (!ok) return;
          try { await admin.revoke(); toast('Wallpaper access turned off'); build(); } catch (err) { toast(err.message); }
        } }, 'Turn off wallpaper access')));
  }

  build();
  return sheet;
}
