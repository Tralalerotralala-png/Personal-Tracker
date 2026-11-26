# Browser test of the SHIPPED wallpaper (wallpaper/index.html + wallpaper.js), opened from a
# file:// path the way Wallpaper Engine loads it. Supabase, the weather and the news feed are
# faked, so it runs offline. The key-management screen is tested through the served app.
# Serve the project first:  python3 -m http.server 8099   then:  python3 tests/ui-wallpaper.py
import json, os, tempfile, datetime as dt
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CHROME = os.environ.get('CHROME_PATH', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
APP = os.environ.get('BASE_URL', 'http://localhost:8099/index.html')
FILE = 'file://' + os.path.abspath(os.path.join(ROOT, 'wallpaper', 'index.html'))
SHOTS = tempfile.mkdtemp(prefix='tracker-shots-')
shot = lambda n: os.path.join(SHOTS, n + '.png')
errors = []
CORS = {'access-control-allow-origin': '*'}
KEY, ANON, SB = 'wp_' + 'k' * 40, 'ANON_PUBLIC_KEY', 'https://abc.supabase.co'
HASH = f'#url={SB}&anon={ANON}&key={KEY}'

today = dt.datetime.now(dt.timezone.utc).date()
iso = [(today + dt.timedelta(days=i)).isoformat() for i in range(-10, 6)]
daily = {'time': iso, 'weather_code': [3] * 16, 'temperature_2m_max': [11] * 16, 'temperature_2m_min': [5] * 16,
         'precipitation_sum': [0, 0, 0, 2, 0, 0, 12, 18, 9, 3, 1, 0, 6, 14, 4, 0], 'rain_sum': [0] * 16, 'snowfall_sum': [0] * 16,
         'et0_fao_evapotranspiration': [1.2] * 16, 'wind_speed_10m_max': [15] * 16}
hours = [f'{d}T{h:02d}:00' for d in iso for h in (0, 12)]
soil = [0.3] * len(hours)
RSS = """<rss version="2.0"><channel><title>Valley News</title>
<item><title>Flooding expected on the B1</title><link>https://valley.example/rain</link><pubDate>Thu, 08 Oct 2026 06:00:00 GMT</pubDate></item>
<item><title>Alpine pass reopens</title><link>https://valley.example/pass</link><pubDate>Wed, 07 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>"""

def day(n, hour=None):
    d = dt.datetime.combine(today + dt.timedelta(days=n), dt.time(hour or 0), tzinfo=dt.timezone.utc)
    return d.isoformat().replace('+00:00', 'Z')

def snapshot(show_places=False):
    return {
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'show_places': show_places,
        'layout': [{'id': 'mud', 'x': 0, 'y': 0, 'w': 7, 'h': 4}, {'id': 'calendar', 'x': 7, 'y': 0, 'w': 5, 'h': 4},
                   {'id': 'feed', 'x': 4, 'y': 4, 'w': 8, 'h': 4}, {'id': 'loot', 'x': 0, 'y': 4, 'w': 4, 'h': 2}, {'id': 'clock', 'x': 0, 'y': 6, 'w': 4, 'h': 2}],
        'settings': {'location': {'name': 'Bad Ischl', 'label': 'Bad Ischl, Austria', 'lat': 47.71, 'lon': 13.62, 'elevation_m': 468, 'timezone': 'UTC'},
                     'feed_keywords': ['flooding']},
        'events': [{'id': 'e1', 'title': 'Bin day', 'starts_at': day(1), 'ends_at': None, 'all_day': True, 'color': '#7fb356', 'rrule': None},
                   {'id': 'e2', 'title': 'Fix the garden gate', 'starts_at': day(2, 10), 'ends_at': day(2, 12), 'all_day': False, 'color': '#e0a23a', 'rrule': None}],
        'items': [{'id': 'i1', 'name': 'Headlamp', 'quantity': 1, 'rarity': 'rare', 'is_lost': False, 'lost_since': None, 'location_id': 'l1' if show_places else None},
                  {'id': 'i2', 'name': 'Allen key set', 'quantity': 1, 'rarity': 'common', 'is_lost': True, 'lost_since': day(-9), 'location_id': 'l1' if show_places else None},
                  {'id': 'i3', 'name': 'Camp stove', 'quantity': 2, 'rarity': 'legendary', 'is_lost': False, 'lost_since': None, 'location_id': 'l1' if show_places else None}],
        'locations': [{'id': 'l1', 'parent_id': None, 'name': 'Secret Shed'}] if show_places else [],
        'news_sources': [{'id': 's1', 'name': 'Valley News', 'kind': 'rss', 'url': 'https://valley.example/feed.xml', 'enabled': True}],
    }

state = {'places': False, 'mode': 'ok'}      # mode: ok | key | down
seen = []

def handle(route):
    req = route.request
    url = req.url
    seen.append({'url': url, 'method': req.method, 'body': req.post_data, 'headers': req.headers})
    if 'abc.supabase.co' in url:
        if state['mode'] == 'down': return route.abort('internetdisconnected')
        if state['mode'] == 'key':
            return route.fulfill(status=403, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps({'code': '28000', 'message': 'Invalid wallpaper key'}))
        return route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(snapshot(state['places'])))
    if state['mode'] == 'down': return route.abort('internetdisconnected')
    if 'open-meteo.com' in url:
        body = {'hourly': {'time': hours, 'soil_moisture_0_to_1cm': soil, 'soil_moisture_1_to_3cm': soil, 'soil_moisture_3_to_9cm': soil}, 'timezone': 'UTC'} if 'hourly=' in url else {'daily': daily, 'timezone': 'UTC'}
        return route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(body))
    if 'valley.example' in url:
        return route.fulfill(status=200, headers={**CORS, 'content-type': 'application/rss+xml'}, body=RSS)
    return route.abort('failed')

def routed(browser, **kw):
    ctx = browser.new_context(**kw)
    ctx.route(lambda u: any(h in u for h in ('abc.supabase.co', 'open-meteo.com', 'valley.example')), handle)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    return ctx, page

def fits(page, where):
    m = page.evaluate('({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight})')
    assert m['sw'] <= m['iw'] and m['sh'] <= m['ih'], f'{where}: page overflows the screen {m}'

def text(page): return page.inner_text('body')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])

    # ---------- 1. the full wallpaper at 1080p, loaded from a file:// path ----------
    ctx, page = routed(b, viewport={'width': 1920, 'height': 1080})
    page.goto(FILE + HASH)
    page.wait_for_selector('.wp-grid .widget')
    page.wait_for_selector('.w-mud-label'); page.wait_for_selector('.w-feed li'); page.wait_for_selector('.w-ev')
    page.wait_for_timeout(600)
    t = text(page)
    print('widgets:', page.locator('.wp-grid .widget').count())
    assert page.locator('.wp-grid .widget').count() == 5
    print('mud:', page.locator('.w-mud-label').inner_text(), '| calendar:', page.locator('.w-ev').all_inner_texts(), '| headline:', page.locator('.w-feed .w-title').first.inner_text())
    assert 'Bin day' in t and 'Fix the garden gate' in t and 'Flooding expected on the B1' in t
    assert page.locator('.w-clock b').inner_text().count(':') == 1
    assert 'Headlamp' in t or 'Camp stove' in t, 'loot widget shows an item'
    assert 'Allen key set' in t and '1 lost quest' in t
    # PRIVACY: places are off, so no storage location may appear anywhere
    assert 'Secret Shed' not in t and 'last seen' not in t, 'a storage place leaked while show_places is off'
    for bad in ('null', 'undefined', 'NaN', 'Loading', 'Almost there'):
        assert bad not in t, f'unexpected text: {bad}'
    fits(page, '1080p')
    page.screenshot(path=shot('w1_1080p'))

    # the request: one POST, key only in the body, public key as the credential, nothing sensitive in any address
    rpc = [r for r in seen if 'wallpaper_snapshot' in r['url']]
    assert rpc and rpc[0]['method'] == 'POST'
    assert json.loads(rpc[0]['body']) == {'p_key': KEY}
    assert rpc[0]['headers']['apikey'] == ANON
    assert 'authorization' not in rpc[0]['headers'], 'a non-JWT public key must not be sent as a Bearer token'
    assert all(KEY not in r['url'] and ANON not in r['url'] for r in seen), 'a secret appeared in a web address'
    hosts = sorted({r['url'].split('/')[2] for r in seen if r['url'].startswith('http')})
    print('hosts contacted:', hosts)
    assert set(hosts) <= {'abc.supabase.co', 'api.open-meteo.com', 'valley.example', 'fonts.googleapis.com', 'fonts.gstatic.com'}

    # ---------- 2. other screen shapes: always fills the screen, never overflows ----------
    for w, h, name in [(2560, 1440, '1440p'), (3440, 1440, 'ultrawide'), (1366, 768, 'laptop'), (3840, 2160, '4k')]:
        page.set_viewport_size({'width': w, 'height': h}); page.wait_for_timeout(250)
        fits(page, name)
        g = page.locator('.wp-grid').bounding_box()
        assert g['width'] > w * 0.9 and g['height'] > h * 0.9, f'{name}: the grid does not fill the screen {g}'
        print(f'{name}: ok, base font {page.evaluate("getComputedStyle(document.documentElement).fontSize")}')
    page.set_viewport_size({'width': 1920, 'height': 1080})
    page.set_viewport_size({'width': 3440, 'height': 1440}); page.wait_for_timeout(300)
    page.screenshot(path=shot('w2_ultrawide'))
    page.set_viewport_size({'width': 1920, 'height': 1080})

    # ---------- 3. turning "show places" on redraws the loot widget ----------
    state['places'] = True
    page.evaluate('window.__wallpaper.reload()')
    page.wait_for_function("document.body.innerText.includes('Secret Shed')", timeout=8000)
    print('places on: loot shows', 'Secret Shed' in text(page))
    assert 'last seen Secret Shed' in text(page)
    state['places'] = False
    page.evaluate('window.__wallpaper.reload()')
    page.wait_for_function("!document.body.innerText.includes('Secret Shed')", timeout=8000)
    page.wait_for_timeout(300)

    # ---------- 4. offline: the saved snapshot keeps showing ----------
    state['mode'] = 'down'
    page.goto('about:blank')          # a real fresh start (going to the identical address would not reload)
    page.goto(FILE + HASH)
    page.wait_for_selector('.wp-grid .widget', timeout=8000)
    page.wait_for_selector('.wp-status:not([hidden])', timeout=8000)
    print('offline status:', page.locator('.wp-status').inner_text(), '| widgets still shown:', page.locator('.wp-grid .widget').count())
    assert 'Offline' in page.locator('.wp-status').inner_text() and 'Bin day' in text(page)
    page.screenshot(path=shot('w3_offline'))
    state['mode'] = 'ok'
    ctx.close()

    # ---------- 5. wrong key (nothing saved yet) and unconfigured ----------
    state['mode'] = 'key'
    ctx, page = routed(b, viewport={'width': 1920, 'height': 1080})
    page.goto(FILE + HASH)
    page.wait_for_selector('.wp-message')
    print('wrong key shows:', page.locator('.wp-message').inner_text().replace('\n', ' | ')[:120])
    assert 'Cannot load your data' in text(page) and 'wallpaper key was not accepted' in text(page)
    page.screenshot(path=shot('w4_wrong_key'))
    ctx.close(); state['mode'] = 'ok'

    ctx, page = routed(b, viewport={'width': 1920, 'height': 1080})
    page.goto(FILE)
    page.wait_for_selector('.wp-message')
    assert 'Almost there' in text(page) and 'Wallpaper Engine' in text(page)
    print('unconfigured:', page.locator('.wp-message h1').inner_text())

    # ---------- 6. Wallpaper Engine delivers settings through its property listener ----------
    page.evaluate("""() => window.wallpaperPropertyListener.applyUserProperties({
        supabaseurl: {value: 'abc.supabase.co'}, anonkey: {value: 'ANON_PUBLIC_KEY'}, wallpaperkey: {value: '%s'},
        refreshminutes: {value: 5}, textscale: {value: 1.25}, scanlines: {value: true}, accentcolor: {value: '1 0.5 0'} })""" % KEY)
    page.wait_for_selector('.wp-grid .widget'); page.wait_for_selector('.w-ev'); page.wait_for_timeout(400)
    css = page.evaluate("({accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), scan: document.documentElement.classList.contains('scanlines'), fs: getComputedStyle(document.documentElement).fontSize})")
    print('after properties:', css)
    assert css['accent'] == '#ff8000' and css['scan'] is True
    assert float(css['fs'][:-2]) > 1.85 * 1080 / 100 * 1.2, 'text size property must enlarge the text'
    fits(page, 'with properties')
    # a later property change (empty text boxes) must not wipe the working settings
    page.evaluate("() => window.wallpaperPropertyListener.applyUserProperties({supabaseurl: {value: ''}, wallpaperkey: {value: ''}})")
    page.wait_for_timeout(500)
    assert page.locator('.wp-grid .widget').count() == 5, 'empty properties must not erase a working configuration'
    ctx.close()
    b.close()

    # ---------- 7. the key screen in the app (fake Supabase client) ----------
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(APP, wait_until='domcontentloaded'); page.wait_for_selector('.tile')
    page.evaluate("""async (args) => {
      const { openWallpaperSettings } = await import('/js/ui/wallpaper-settings.js');
      window.__fake = { exists: false, show: false, created: null, calls: [] };
      const fake = { rpc: async (fn, a) => {
        window.__fake.calls.push([fn, a]);
        const f = window.__fake;
        if (fn === 'wallpaper_status') return { data: f.exists ? { exists: true, show_places: f.show, created_at: f.created } : { exists: false }, error: null };
        if (fn === 'create_wallpaper_key') { f.exists = true; f.show = a.p_show_places; f.created = new Date().toISOString(); return { data: 'wp_' + 'z'.repeat(40), error: null }; }
        if (fn === 'set_wallpaper_show_places') { f.show = a.p_show; return { data: null, error: null }; }
        if (fn === 'revoke_wallpaper_key') { f.exists = false; return { data: null, error: null }; }
      } };
      openWallpaperSettings({ ctx: { mode: 'cloud', client: fake, config: { SUPABASE_URL: args.sb, SUPABASE_ANON_KEY: args.anon } } });
    }""", {'sb': SB, 'anon': ANON})
    page.wait_for_selector('dialog[open] button:has-text("Create wallpaper key")')
    assert page.locator('dialog[open] #wp-places').is_checked() is False, 'showing places must be OFF by default'
    page.screenshot(path=shot('w5_key_screen_before'))
    page.click('dialog[open] button:has-text("Create wallpaper key")')
    page.wait_for_selector('dialog[open] .copy-input')
    vals = page.locator('dialog[open] .copy-input').evaluate_all('els => els.map(e => e.value)')
    print('values to paste:', [v[:30] for v in vals])
    assert vals[0] == SB and vals[1] == ANON and vals[2].startswith('wp_') and len(vals[2]) > 30
    assert 'shown only this once' in page.locator('dialog[open]').inner_text()
    href = page.locator('dialog[open] a:has-text("Preview")').get_attribute('href')
    assert '/wallpaper/index.html#' in href and 'key=wp_' in href and '?key' not in href, 'the key belongs in the # part, never in the query'
    page.locator('dialog[open] .copy-row button').nth(2).click()
    assert page.evaluate('navigator.clipboard.readText()') == vals[2], 'Copy must put the key on the clipboard'
    page.screenshot(path=shot('w6_key_screen_created'))
    page.click('dialog[open] button:has-text("Done")')
    page.wait_for_selector('dialog[open] button:has-text("Make a new key")')
    assert 'cannot be shown again' in page.locator('dialog[open]').inner_text()
    assert vals[2] not in page.locator('dialog[open]').inner_text(), 'the key must not be shown again after "Done"'
    page.click('dialog[open] button:has-text("Show where items are stored")')
    page.wait_for_selector('dialog[open] button:has-text("Hide where items are stored")')
    page.click('dialog[open] button:has-text("Turn off wallpaper access")')
    page.click('dialog[open] button:has-text("Turn off") >> nth=-1')
    page.wait_for_selector('dialog[open] button:has-text("Create wallpaper key")')
    print('rpc calls:', [c[0] for c in page.evaluate('window.__fake.calls')])
    b.close()

real = [e for e in errors if 'ERR_' not in e and 'Failed to load resource' not in e and 'fonts.g' not in e and 'net::' not in e]
print('ERRORS:', json.dumps(real, indent=1))
print('screenshots in', SHOTS)
open('/tmp/shots_dir', 'w').write(SHOTS)
