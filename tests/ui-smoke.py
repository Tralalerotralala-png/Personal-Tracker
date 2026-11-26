# Browser smoke test: runs the real app in headless Chromium (local mode) and clicks through
# search, item add, places, tabs and the service worker. Needs: pip install playwright.
# Serve the project first:  python3 -m http.server 8099   (then)  python3 tests/ui-smoke.py
# Set CHROME_PATH if Playwright cannot find its own browser. Screenshots go to a temp folder.
import json, sys
from playwright.sync_api import sync_playwright

import os, tempfile
CHROME = os.environ.get('CHROME_PATH', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
SHOTS = tempfile.mkdtemp(prefix='tracker-shots-')
BASE = os.environ.get('BASE_URL', 'http://localhost:8099/index.html')
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error',) else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    # fonts / CDN are unreachable in this sandbox; ignore those failures
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_selector('.tile', timeout=8000)
    page.wait_for_timeout(600)
    assert 'null' not in page.inner_text('body') and 'undefined' not in page.inner_text('body'), 'stray null/undefined text on home'
    page.screenshot(path=os.path.join(SHOTS, 'm1_home.png'))
    print('tiles:', page.locator('.tile').count(), '| stats:', page.locator('.stat').all_inner_texts())
    print('quests:', page.locator('.quest-log').inner_text().replace('\n', ' | ') if page.locator('.quest-log').count() else 'none')

    page.fill('#where-input', 'shed')
    page.wait_for_timeout(300)
    print('search "shed" rows:', page.locator('.row-item').count())
    assert 'null' not in page.inner_text('body'), 'stray null while searching'
    page.screenshot(path=os.path.join(SHOTS, 'm2_search.png'))

    page.fill('#where-input', 'allen')
    page.wait_for_timeout(200)
    print('allen ->', page.locator('.row-item').first.inner_text().replace('\n', ' | '))

    page.fill('#where-input', '')
    page.wait_for_timeout(200)
    page.locator('.tile', has_text='Headlamp').first.click()
    page.wait_for_selector('dialog[open]')
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, 'm3_item.png'))
    print('item sheet title:', page.locator('dialog[open] h2').inner_text())
    page.locator('dialog[open] button', has_text='Close').first.click()
    page.wait_for_timeout(200)

    # add item
    page.click('.fab')
    page.wait_for_selector('dialog[open] #it-name')
    page.fill('#it-name', 'Test wrench')
    page.fill('#it-qty', '2')
    page.screenshot(path=os.path.join(SHOTS, 'm4_add.png'))
    page.locator('dialog[open] button', has_text='Add to pack').click()
    page.wait_for_timeout(500)
    print('after add, tiles:', page.locator('.tile').count(), '| has wrench:', page.locator('.tile', has_text='Test wrench').count())

    # places
    page.click('.seg:has-text("Places")')
    page.wait_for_timeout(300)
    assert 'null' not in page.inner_text('body'), 'stray null on places'
    page.screenshot(path=os.path.join(SHOTS, 'm5_places.png'))
    print('place rows:', page.locator('.tree-row').count())
    page.locator('.tree-main', has_text='Shed').first.click()
    page.wait_for_timeout(300)
    print('browse shed -> tiles:', page.locator('.tile').count(), '| chip:', page.locator('.place-chip').inner_text())

    # nav to a coming-soon tab
    page.click('.slot[data-route=mud]')
    page.wait_for_timeout(200)
    print('mud tab text:', page.locator('.view:not([hidden]) h2').first.inner_text())
    page.screenshot(path=os.path.join(SHOTS, 'm6_mud.png'))

    # service worker
    page.goto(BASE)
    page.wait_for_timeout(1500)
    print('sw controlled:', page.evaluate('navigator.serviceWorker.controller !== null'),
          '| caches:', page.evaluate('caches.keys()'))

    # desktop
    d = b.new_context(viewport={'width': 1280, 'height': 800})
    dp = d.new_page()
    dp.on('pageerror', lambda e: errors.append(f'desktop pageerror: {e}'))
    dp.goto(BASE, wait_until='domcontentloaded')
    dp.wait_for_selector('.tile')
    dp.wait_for_timeout(500)
    dp.screenshot(path=os.path.join(SHOTS, 'd1_home.png'))
    dp.locator('.tile', has_text='Pocketknife').first.click() if dp.locator('.tile', has_text='Pocketknife').count() else dp.locator('.tile').nth(2).click()
    dp.wait_for_selector('dialog[open]')
    dp.wait_for_timeout(300)
    dp.screenshot(path=os.path.join(SHOTS, 'd2_item.png'))
    b.close()

print('ERRORS:', json.dumps([e for e in errors if 'fonts.g' not in e and 'ERR_' not in e and 'Failed to load resource' not in e], indent=1))
print('IGNORED (network-only):', len([e for e in errors if 'fonts.g' in e or 'ERR_' in e or 'Failed to load resource' in e]))
