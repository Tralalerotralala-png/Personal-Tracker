# Browser test for the Feed tab, the Overview tab and the layout editor (real mouse
# drags and key presses). News sources are faked, so it runs offline and repeatably.
# Serve the project first:  python3 -m http.server 8099   then:  python3 tests/ui-feed-layout.py
import json, os, tempfile
from playwright.sync_api import sync_playwright

CHROME = os.environ.get('CHROME_PATH', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
BASE = os.environ.get('BASE_URL', 'http://localhost:8099/index.html')
SHOTS = tempfile.mkdtemp(prefix='tracker-shots-')
shot = lambda n: os.path.join(SHOTS, n + '.png')
errors = []
CORS = {'access-control-allow-origin': '*'}

RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>Valley News</title>
<item><title>Flooding expected on the B1 &amp; side roads</title><link>https://valley.example/rain</link><pubDate>Thu, 08 Oct 2026 06:00:00 GMT</pubDate><description>&lt;p&gt;Up to 40 mm of rain.&lt;/p&gt;</description></item>
<item><title>Alpine pass reopens</title><link>https://valley.example/pass</link><pubDate>Wed, 07 Oct 2026 12:00:00 GMT</pubDate><description>Road works finished.</description></item>
<item><title>Market day moves to Saturday</title><link>https://valley.example/market</link><pubDate>Tue, 06 Oct 2026 09:00:00 GMT</pubDate></item>
</channel></rss>"""
BSKY = {'feed': [
    {'post': {'uri': 'at://did:plc:1/app.bsky.feed.post/3kaaa', 'author': {'handle': 'wx.example.com', 'displayName': 'Weather desk'}, 'record': {'text': 'Mud warning for the lower fields tonight.', 'createdAt': '2026-10-08T07:30:00.000Z'}}},
    {'post': {'uri': 'at://did:plc:1/app.bsky.feed.post/3kbbb', 'author': {'handle': 'wx.example.com'}, 'record': {'text': 'Clear skies tomorrow.', 'createdAt': '2026-10-07T07:30:00.000Z'}}},
]}

def handle(route):
    url = route.request.url
    if 'valley.example' in url:
        return route.fulfill(status=200, headers={**CORS, 'content-type': 'application/rss+xml'}, body=RSS)
    if 'public.api.bsky.app' in url:
        return route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(BSKY))
    return route.abort('failed')           # blocked.example etc: the browser cannot read it

def no_overflow(page, where, width=390):
    w = page.evaluate('document.documentElement.scrollWidth')
    assert w <= width + 1, f'{where}: page is {w}px wide on a {width}px screen'

def no_stray(page, where):
    t = page.inner_text('body')
    assert 'null' not in t and 'undefined' not in t and 'NaN' not in t, f'stray text on {where}'

def field(page, name):
    return int(page.locator(f'.ed-sel input[aria-label$="{name}"]').input_value())

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])

    # ============================ phone ============================
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.route(lambda u: any(h in u for h in ('valley.example', 'blocked.example', 'public.api.bsky.app', 'open-meteo.com')), handle)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(BASE, wait_until='domcontentloaded'); page.wait_for_selector('.tile')
    print('nav slots:', page.locator('.hotbar .slot').count())
    assert page.locator('.hotbar .slot').count() == 5
    no_overflow(page, 'pack with 5 tabs')

    # --- feed: starts empty, nothing preset
    page.click('.slot[data-route=feed]')
    page.wait_for_selector('.feed-empty')
    print('empty feed:', page.locator('.feed-empty h2').inner_text())
    no_overflow(page, 'feed empty'); no_stray(page, 'feed empty')
    page.screenshot(path=shot('f1_empty'))

    # --- add an RSS source (check first)
    page.click('button:has-text("Add a source")')
    page.wait_for_selector('#sf-address')
    page.fill('#sf-address', 'https://valley.example/feed.xml')
    page.click('button:has-text("Check it works")')
    page.wait_for_selector('.sf-ok')
    print('check:', page.locator('.sf-ok').inner_text().replace('\n', ' | '))
    page.click('button:has-text("Add source")')
    page.wait_for_selector('.src-row')
    page.locator('dialog[open] button:has-text("Close")').first.click()
    page.wait_for_selector('.feed-item')
    titles = page.locator('.feed-title').all_inner_texts()
    print('headlines:', titles)
    assert len(titles) == 3 and titles[0] == 'Flooding expected on the B1 & side roads'
    link = page.locator('a.feed-title').first
    assert link.get_attribute('target') == '_blank' and 'noopener' in link.get_attribute('rel')
    no_overflow(page, 'feed list'); no_stray(page, 'feed list')
    page.screenshot(path=shot('f2_feed'))

    # --- Bluesky + a site that blocks browsers
    page.click('button:has-text("Sources and keywords")')
    page.click('dialog[open] button:has-text("Add a source")')
    page.select_option('#sf-kind', 'bluesky')
    page.fill('#sf-address', '@wx.example.com')
    page.fill('#sf-name', 'Weather desk')
    page.click('dialog[open] button:has-text("Add source")')
    page.wait_for_selector('.src-row >> nth=1')
    page.click('dialog[open] button:has-text("Add a source")')
    page.select_option('#sf-kind', 'rss')
    page.fill('#sf-address', 'https://blocked.example/rss')
    page.click('dialog[open] button:has-text("Add source")')
    page.wait_for_function("document.querySelectorAll('.src-status.bad').length >= 1", timeout=8000)
    print('blocked source says:', page.locator('.src-status.bad').first.inner_text())
    assert 'proxy' in page.locator('.src-status.bad').first.inner_text().lower()
    page.screenshot(path=shot('f3_sources'))

    # --- keywords
    page.fill('#fd-kw', 'flooding, mud')
    page.click('dialog[open] button:has-text("Save keywords")')
    page.locator('dialog[open] button:has-text("Close")').first.click()
    page.wait_for_selector('mark')
    print('highlighted:', page.locator('mark').all_inner_texts(), '| banner:', page.locator('.banner').inner_text().replace('\n', ' '))
    assert page.locator('.chip:has-text("Weather desk")').count() == 1
    page.click('.chip.kw')
    page.wait_for_timeout(200)
    print('keyword matches only:', page.locator('.feed-item').count())
    assert page.locator('.feed-item').count() == 2        # the flooding story and the mud warning
    page.click('.chip.kw')
    page.click('.chip:has-text("Weather desk")')
    assert page.locator('.feed-item').count() == 2
    no_overflow(page, 'feed with filters'); no_stray(page, 'feed with filters')
    page.screenshot(path=shot('f4_filtered'))

    # --- overview on a phone: stacked widgets
    page.click('.slot[data-route=overview]')
    page.wait_for_selector('.ov-grid .widget')
    page.wait_for_timeout(500)
    print('phone overview widgets:', page.locator('.ov-grid .widget').count(), '| edit button visible:', page.locator('.overview .btn:has-text("Edit layout")').is_visible())
    assert page.locator('.ov-grid .widget').count() == 5
    assert not page.locator('.overview .btn:has-text("Edit layout")').is_visible()
    no_overflow(page, 'overview phone'); no_stray(page, 'overview phone')
    page.screenshot(path=shot('f5_overview_phone'))

    # ============================ desktop ============================
    d = b.new_context(viewport={'width': 1400, 'height': 900})
    d.route(lambda u: any(h in u for h in ('valley.example', 'blocked.example', 'public.api.bsky.app', 'open-meteo.com')), handle)
    dp = d.new_page()
    dp.on('pageerror', lambda e: errors.append(f'desktop pageerror: {e}'))
    dp.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' else None)
    dp.goto(BASE); dp.wait_for_selector('.tile')
    dp.click('.slot[data-route=overview]')
    dp.wait_for_selector('.ov-grid .widget'); dp.wait_for_timeout(500)
    print('desktop overview widgets:', dp.locator('.ov-grid .widget').count())
    assert dp.locator('.ov-grid .widget').count() == 5
    dp.screenshot(path=shot('f6_overview_desktop'))

    # --- the layout editor
    dp.click('button:has-text("Edit layout")')
    dp.wait_for_selector('dialog.editor .ed-item')
    print('editor opens on:', dp.locator('#ed-profile').evaluate('e => e.options[e.selectedIndex].text'), '| items:', dp.locator('.ed-item').count())
    dp.select_option('#ed-profile', 'wallpaper')
    dp.wait_for_timeout(300)
    assert dp.locator('.ed-item').count() == 5
    box = dp.locator('.ed-canvas').bounding_box()
    print('wallpaper canvas aspect:', round(box['width'] / box['height'], 3), '(16:9 = 1.778)')
    assert abs(box['width'] / box['height'] - 16 / 9) < 0.03
    dp.screenshot(path=shot('f7_editor'))
    cell = box['width'] / 12

    # numeric fields: make room (feed width 8 -> 4)
    dp.locator('.ed-item[data-id=feed]').click(position={'x': 40, 'y': 40})
    assert field(dp, 'Width') == 8
    dp.locator('.ed-sel input[aria-label$="Width"]').fill('4'); dp.locator('.ed-sel input[aria-label$="Width"]').press('Tab')
    dp.wait_for_timeout(200)
    assert field(dp, 'Width') == 4

    # drag the loot widget from column 1 to column 9 (8 cells right) with the real mouse
    loot = dp.locator('.ed-item[data-id=loot]').bounding_box()
    x, y = loot['x'] + loot['width'] / 2, loot['y'] + loot['height'] / 2
    dp.mouse.move(x, y); dp.mouse.down(); dp.mouse.move(x + cell * 4, y, steps=8); dp.mouse.move(x + cell * 8, y, steps=8)
    print('ghost while dragging:', dp.locator('.ed-ghost').get_attribute('class'))
    assert 'ok' in dp.locator('.ed-ghost').get_attribute('class')
    dp.mouse.up()
    dp.wait_for_timeout(200)
    print('loot column after drag:', field(dp, 'Column'), '(expected 9)')
    assert field(dp, 'Column') == 9

    # an invalid drop (onto another widget) snaps back
    mud = dp.locator('.ed-item[data-id=mud]').bounding_box()
    mx, my = mud['x'] + mud['width'] / 2, mud['y'] + mud['height'] / 2
    dp.mouse.move(mx, my); dp.mouse.down(); dp.mouse.move(mx + cell * 7, my, steps=10)
    assert 'bad' in dp.locator('.ed-ghost').get_attribute('class')
    dp.mouse.up(); dp.wait_for_timeout(200)
    print('mud column after invalid drop:', field(dp, 'Column'), '(expected 1)')
    assert field(dp, 'Column') == 1

    # resize with the corner handle (calendar: 5 wide -> 4 wide)
    dp.locator('.ed-item[data-id=calendar]').click(position={'x': 40, 'y': 40})
    cal = dp.locator('.ed-item[data-id=calendar]').bounding_box()
    hx, hy = cal['x'] + cal['width'] - 8, cal['y'] + cal['height'] - 8
    dp.mouse.move(hx, hy); dp.mouse.down(); dp.mouse.move(hx - cell, hy, steps=6); dp.mouse.up(); dp.wait_for_timeout(200)
    print('calendar width after resize:', field(dp, 'Width'), '(expected 4)')
    assert field(dp, 'Width') == 4

    # keyboard: clock up one row, then try to grow it into a neighbour (refused)
    clock = dp.locator('.ed-item[data-id=clock]')
    clock.focus()
    row_before = field(dp, 'Row')
    dp.keyboard.press('ArrowUp'); dp.wait_for_timeout(150)
    print('clock row:', row_before, '->', field(dp, 'Row'))
    assert field(dp, 'Row') == row_before - 1
    w_before = field(dp, 'Width')
    for _ in range(8): dp.keyboard.press('Shift+ArrowRight')
    assert field(dp, 'Width') < 12 and field(dp, 'Width') >= w_before
    # remove, then add back into the first free spot
    dp.locator('.ed-list li:has-text("Clock") button').click(); dp.wait_for_timeout(150)
    assert dp.locator('.ed-item').count() == 4
    dp.locator('.ed-list li:has-text("Clock") button').click(); dp.wait_for_timeout(150)
    assert dp.locator('.ed-item').count() == 5
    dp.screenshot(path=shot('f8_editor_edited'))
    saved_cols = (field(dp, 'Column'), field(dp, 'Row'))

    # cancel asks first; the second time we save
    dp.click('dialog.editor button:has-text("Cancel")')
    dp.wait_for_selector('dialog[open] button:has-text("Discard")')
    dp.locator('dialog[open] button:has-text("Cancel")').last.click()
    dp.wait_for_timeout(200)
    assert dp.locator('dialog.editor').count() == 1, 'editor must stay open when discard is declined'
    dp.click('dialog.editor button:has-text("Save")')
    dp.wait_for_selector('dialog.editor', state='detached')

    # reopen: the wallpaper layout was saved, the desktop overview was untouched
    dp.click('button:has-text("Edit layout")'); dp.wait_for_selector('dialog.editor .ed-item')
    dp.select_option('#ed-profile', 'wallpaper'); dp.wait_for_timeout(300)
    dp.locator('.ed-item[data-id=loot]').click(position={'x': 40, 'y': 40})
    print('after reopening, loot column:', field(dp, 'Column'))
    assert field(dp, 'Column') == 9
    dp.select_option('#ed-profile', 'desktop'); dp.wait_for_timeout(300)
    assert dp.locator('.ed-item').count() == 5
    # edit the desktop layout: remove the stats widget and save
    dp.locator('.ed-list li:has-text("Pack stats") button').click(); dp.wait_for_timeout(150)
    dp.click('dialog.editor button:has-text("Save")')
    dp.wait_for_selector('dialog.editor', state='detached')
    dp.wait_for_timeout(500)
    print('desktop overview widgets after removing one:', dp.locator('.ov-grid .widget').count())
    assert dp.locator('.ov-grid .widget').count() == 4
    dp.screenshot(path=shot('f9_overview_edited'))

    # layouts survive a reload
    dp.reload(); dp.wait_for_selector('.ov-grid .widget'); dp.wait_for_timeout(500)   # the URL still says #overview
    assert dp.locator('.ov-grid .widget').count() == 4
    b.close()

real = [e for e in errors if 'ERR_' not in e and 'Failed to load resource' not in e and 'fonts.g' not in e and 'blocked.example' not in e and 'net::' not in e]
print('ERRORS:', json.dumps(real, indent=1))
print('screenshots in', SHOTS)
open('/tmp/shots_dir', 'w').write(SHOTS)
