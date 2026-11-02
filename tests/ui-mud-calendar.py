# Browser test for the Mud tab, calendar and tuning. Open-Meteo is replaced by
# fake responses (so it runs offline and is repeatable).
# Serve the project first:  python3 -m http.server 8099   then:  python3 tests/ui-mud-calendar.py
import json, os, tempfile, datetime as dt
from playwright.sync_api import sync_playwright

CHROME = os.environ.get('CHROME_PATH', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
BASE = os.environ.get('BASE_URL', 'http://localhost:8099/index.html')
SHOTS = tempfile.mkdtemp(prefix='tracker-shots-')
shot = lambda n: os.path.join(SHOTS, n + '.png')
errors = []

today = dt.datetime.now(dt.timezone.utc).date()
days = [today + dt.timedelta(days=i) for i in range(-10, 6)]
iso = [d.isoformat() for d in days]
precip = [0, 0, 0, 2, 0, 0, 12, 18, 9, 3, 1, 0, 6, 14, 4, 0]     # wet spell before today, rain ahead
daily = {
    'time': iso,
    'weather_code': [1, 1, 3, 61, 2, 3, 63, 65, 61, 51, 3, 2, 61, 65, 80, 1],
    'temperature_2m_max': [14, 15, 12, 11, 13, 12, 10, 9, 9, 10, 11, 12, 10, 8, 9, 11],
    'temperature_2m_min': [6, 7, 5, 6, 6, 5, 5, 6, 5, 4, 4, 5, 5, 4, 3, 4],
    'precipitation_sum': precip, 'rain_sum': precip, 'snowfall_sum': [0] * 16,
    'et0_fao_evapotranspiration': [2.2, 2.0, 1.2, 1.0, 1.6, 1.4, 0.8, 0.7, 0.8, 1.1, 1.5, 1.8, 0.9, 0.7, 0.9, 1.9],
    'wind_speed_10m_max': [14, 12, 20, 22, 10, 12, 30, 26, 18, 15, 11, 9, 24, 28, 20, 10],
}
hours = [f'{d}T{h:02d}:00' for d in iso for h in (0, 12)]
soil_by_day = [0.24, 0.23, 0.25, 0.27, 0.26, 0.25, 0.36, 0.41, 0.40, 0.37, 0.34, 0.31, 0.35, 0.40, 0.39, 0.33]
soil = [soil_by_day[i // 2] for i in range(len(hours))]
hourly = {'time': hours, 'soil_moisture_0_to_1cm': soil, 'soil_moisture_1_to_3cm': soil, 'soil_moisture_3_to_9cm': soil}
CORS = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
online = {'on': True}
requests_seen = []

def handle(route):
    url = route.request.url
    requests_seen.append(url)
    if not online['on']:
        return route.abort('internetdisconnected')
    if 'geocoding-api' in url:
        body = {'results': [
            {'name': 'Bad Ischl', 'latitude': 47.71, 'longitude': 13.62, 'elevation': 468.0, 'timezone': 'UTC', 'country': 'Austria', 'admin1': 'Upper Austria'},
            {'name': 'Bad Ischl', 'latitude': 47.0, 'longitude': 13.0, 'elevation': 500.0, 'timezone': 'UTC', 'country': 'Austria', 'admin1': 'Salzburg'}]}
    elif 'hourly=' in url:
        body = {'hourly': hourly, 'timezone': 'UTC'}
    else:
        body = {'daily': daily, 'timezone': 'UTC', 'elevation': 470.0}
    route.fulfill(status=200, headers=CORS, body=json.dumps(body))

def no_overflow(page, where, width=390):
    # On a phone nothing may be wider than the screen (it would make the whole page slide sideways).
    w = page.evaluate('document.documentElement.scrollWidth')
    assert w <= width + 1, f'{where}: page is {w}px wide on a {width}px screen'

def no_stray(page, where):
    text = page.inner_text('body')
    assert 'null' not in text and 'undefined' not in text and 'NaN' not in text, f'stray text on {where}'

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.route(lambda u: 'open-meteo.com' in u, handle)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.tile')

    # ---- mud tab: no place yet -> type a place name
    page.click('.slot[data-route=mud]')
    page.wait_for_selector('.mud-empty')
    no_stray(page, 'mud empty')
    no_overflow(page, 'mud empty state')
    page.screenshot(path=shot('s1_mud_empty'))
    page.fill('#ps-input', 'bad ischl')
    page.wait_for_selector('.ps-item')
    print('place matches:', page.locator('.ps-item').count(), '|', page.locator('.ps-item').first.inner_text().replace('\n', ' | '))
    page.locator('.ps-item').first.click()
    page.wait_for_selector('.mud-row')
    page.wait_for_timeout(300)
    rows = page.locator('.mud-row')
    print('mud rows:', rows.count(), '| today row:', page.locator('.mud-row.today').count(),
          '| observed:', page.locator('section[aria-label="Observed days"] .mud-row').count(),
          '| forecast:', page.locator('section[aria-label="Forecast days"] .mud-row').count())
    assert rows.count() == 11
    print('summary:', page.locator('.mud-summary').inner_text().replace('\n', ' | '))
    print('header:', page.locator('.mud-head').inner_text().replace('\n', ' | '))
    labels = page.locator('.mud-label').all_inner_texts()
    print('labels:', labels)
    no_stray(page, 'mud rows')
    no_overflow(page, 'mud tab')
    page.screenshot(path=shot('s2_mud'))

    # ---- day detail
    page.locator('.mud-row.today').click()
    page.wait_for_selector('dialog[open]')
    page.wait_for_timeout(200)
    print('detail:', page.locator('dialog[open] .detail-table').inner_text().replace('\n', ' / ').replace('\t', ' '))
    no_stray(page, 'detail')
    no_overflow(page, 'day detail sheet')
    page.screenshot(path=shot('s3_detail'))
    page.locator('dialog[open] button:has-text("Close")').first.click()

    # ---- calendar
    page.click('.slot[data-route=calendar]')
    page.wait_for_selector('.cal-grid')
    print('mud dots on calendar:', page.locator('.cal-mud').count())
    assert page.locator('.cal-mud').count() == 11
    page.click('button:has-text("Add event")')
    page.fill('#ev-title', 'Fix the gate')
    page.select_option('#ev-repeat', 'WEEKLY')
    page.screenshot(path=shot('s4_event_form'))
    page.locator('dialog[open] button:has-text("Add event")').last.click()
    page.wait_for_timeout(500)
    print('event cells:', page.locator('.cal-ev').count(), '| agenda:', page.locator('.agenda-day').count())
    assert page.locator('.cal-ev').count() >= 4, 'weekly event should repeat through the month'
    no_stray(page, 'calendar')
    no_overflow(page, 'calendar tab')
    page.screenshot(path=shot('s5_calendar'))

    # import an .ics file
    ics = ('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:t1\r\nSUMMARY:Imported market day\r\n'
           f'DTSTART;VALUE=DATE:{today.strftime("%Y%m%d")}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n')
    path = os.path.join(SHOTS, 'test.ics'); open(path, 'w').write(ics)
    page.click('button:has-text("Import calendar")')
    page.set_input_files('#ics-file', path)
    page.locator('dialog[open] button:has-text("Import file")').click()
    page.wait_for_selector('dialog[open] [role=status]:has-text("Done")')
    print('import:', page.locator('dialog[open] [role=status]').inner_text())
    page.locator('dialog[open] button:has-text("Close")').first.click()
    page.wait_for_timeout(300)
    assert page.locator('.agenda-ev:has-text("Imported market day")').count() == 1

    # ---- offline: reload with no network, the saved forecast must still show
    online['on'] = False
    page.goto(BASE); page.wait_for_selector('.tile')
    page.click('.slot[data-route=mud]')
    page.wait_for_selector('.mud-row', timeout=8000)
    page.wait_for_timeout(500)
    # A fresh saved copy needs no network, so nothing is wrong yet...
    assert page.locator('.banner').count() == 0
    # ...but asking for new data while offline falls back to the saved copy and says so.
    page.click('button:has-text("Refresh")')
    page.wait_for_selector('.banner')
    banner = page.locator('.banner').inner_text()
    print('offline rows:', page.locator('.mud-row').count(), '| banner:', banner)
    assert page.locator('.mud-row').count() == 11 and 'saved forecast' in banner
    page.screenshot(path=shot('s6_offline'))
    online['on'] = True

    # ---- desktop: layout + tuning
    d = b.new_context(viewport={'width': 1280, 'height': 800})
    d.route(lambda u: 'open-meteo.com' in u, handle)
    dp = d.new_page()
    dp.on('pageerror', lambda e: errors.append(f'desktop pageerror: {e}'))
    dp.goto(BASE); dp.wait_for_selector('.tile')
    dp.click('.slot[data-route=mud]')
    dp.wait_for_selector('.mud-empty'); dp.fill('#ps-input', 'bad ischl'); dp.wait_for_selector('.ps-item'); dp.locator('.ps-item').first.click()
    dp.wait_for_selector('.mud-row'); dp.wait_for_timeout(300)
    before = dp.locator('.mud-label').all_inner_texts()
    dp.screenshot(path=shot('s7_desktop_mud'))
    dp.locator('.mud-foot button:has-text("Tune the model")').click()
    dp.wait_for_selector('.tune-cell')
    print('preview cells:', dp.locator('.tune-cell').count())
    assert dp.locator('.tune-cell').count() == 11
    dp.screenshot(path=shot('s8_tune'))
    dp.evaluate("const el = document.querySelector('#w-poor_drying'); el.value = 100; el.dispatchEvent(new Event('input'))")
    dp.evaluate("const el = document.querySelector('#w-recent_rain'); el.value = 0; el.dispatchEvent(new Event('input'))")
    dp.wait_for_timeout(300)
    print('preview after retune:', dp.locator('.tune-cell b').all_inner_texts())
    dp.evaluate("const el = document.querySelector('#t-muddy'); el.value = 10; el.dispatchEvent(new Event('input'))")  # invalid: muddy < tacky
    dp.wait_for_timeout(200)
    print('validation:', dp.locator('dialog[open] .form-error').inner_text())
    assert 'in order' in dp.locator('dialog[open] .form-error').inner_text()
    dp.evaluate("const el = document.querySelector('#t-muddy'); el.value = 45; el.dispatchEvent(new Event('input'))")
    dp.locator('dialog[open] button:has-text("Save")').click()
    dp.wait_for_timeout(500)
    after = dp.locator('.mud-label').all_inner_texts()
    print('rows changed after saving the tuning:', before != after)
    assert before != after
    dp.click('.slot[data-route=calendar]'); dp.wait_for_selector('.cal-grid'); dp.wait_for_timeout(300)
    dp.screenshot(path=shot('s9_desktop_calendar'))
    b.close()

real = [e for e in errors if 'ERR_' not in e and 'Failed to load resource' not in e and 'fonts.g' not in e and 'INTERNET_DISCONNECTED' not in e]
print('ERRORS:', json.dumps(real, indent=1))
print('screenshots in', SHOTS)
open('/tmp/shots_dir', 'w').write(SHOTS)
