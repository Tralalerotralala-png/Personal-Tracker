"""No credentials and no live user data: Playwright intercepts config.js."""
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:8099/"
for width,height in [(390,844),(1280,900)]:
    with sync_playwright() as p:
        browser=p.chromium.launch(args=["--no-sandbox"])
        ctx=browser.new_context(viewport={"width":width,"height":height},service_workers="block")
        page=ctx.new_page()
        errors=[]
        page.on("pageerror",lambda e: errors.append(str(e)))
        page.route("**/config.js",lambda route: route.fulfill(status=200,content_type="text/javascript",body="export const CONFIG=null;"))
        page.goto(BASE,wait_until="domcontentloaded")
        page.locator(".top .gear").wait_for(timeout=25000)
        assert page.locator(".widget").count()>=3,"Dashboard widgets missing"
        first_widget=page.locator(".overview .widget").first
        first_widget.wait_for(state="visible",timeout=10000)
        rect=first_widget.bounding_box()
        assert rect and 0<=rect["y"]<height,"Overview widgets were pushed below the viewport"
        stray_text=page.locator("#app").evaluate(
            "(el) => [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim())"
        )
        assert not stray_text,"Unexpected text nodes in app grid: "+str(stray_text)
        skip=page.locator(".skip-link")
        skip.focus()
        assert skip.bounding_box()["y"]>=0,"Keyboard skip link did not appear on focus"
        skip.press("Enter")
        assert page.evaluate("document.activeElement.id")=="main","Skip link did not move keyboard focus to main content"
        # Search must read the real locations table, not a missing "places" table.
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("Headlamp")
        first_result=page.locator(".global-search-results .global-search-result").first
        first_result.wait_for(state="visible",timeout=5000)
        assert "Headlamp" in first_result.inner_text(),"Global search did not return a seeded inventory item"
        first_result.click()
        assert page.evaluate("window.location.hash")=="#inventory","Search result failed to navigate"
        page.locator("dialog.sheet[open]").wait_for(state="visible",timeout=10000)
        assert page.locator("dialog.sheet[open] #it-name").input_value()=="Headlamp","Search did not open the actual item"
        page.keyboard.press("Escape")
        page.locator("dialog.sheet[open]").wait_for(state="detached",timeout=5000)
        page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("Bin day")
        calendar_result=page.locator(".global-search-results .global-search-result").first
        calendar_result.wait_for(state="visible",timeout=5000)
        assert "Bin day" in calendar_result.inner_text()
        calendar_result.click()
        assert page.evaluate("location.hash")=="#calendar","Event search did not open Calendar"
        page.locator("dialog.sheet[open] #ev-title").wait_for(state="visible",timeout=10000)
        assert page.locator("dialog.sheet[open] #ev-title").input_value()=="Bin day"
        page.keyboard.press("Escape")
        page.locator("dialog.sheet[open]").wait_for(state="detached",timeout=5000)
        page.locator(".overview").evaluate("(el) => { location.hash='#overview'; }")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        # Search doubles as a keyboard-accessible section picker.
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("weather")
        page.locator(".global-search-result").filter(has=page.locator("small",has_text="Section")).first.click()
        assert page.evaluate("location.hash")=="#mud","Search did not route to a section"
        # Each media collection must start without the previous shelf's filters.
        page.evaluate("location.hash='#games'")
        page.locator(".media-library-view .hub-tabs button",has_text="Books").click()
        media_search=page.locator(".media-library-view .media-search-filters input")
        media_search.fill("unmatched title")
        page.locator(".media-library-view .media-search-filters select").select_option("Finished")
        page.locator(".media-library-view .hub-tabs button",has_text="Albums").click()
        assert page.locator(".media-library-view .media-search-filters input").input_value()==""
        assert page.locator(".media-library-view .media-search-filters select").input_value()=="all"
        page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        # The decrypted private journal must close on navigation, not merely
        # disappear visually while its plaintext remains in memory.
        page.evaluate("location.hash='#diary'")
        page.get_by_role("button",name="Open private journal").click(timeout=10000)
        page.locator(".journal-unlock input[type=password]").first.wait_for(timeout=10000)
        keys=page.locator(".journal-unlock input[type=password]")
        assert keys.count()==2,"Expected new local journal key setup"
        keys.nth(0).fill("local regression passphrase")
        keys.nth(1).fill("local regression passphrase")
        page.get_by_role("button",name="Create journal key").click()
        page.locator(".journal-shell").wait_for(state="visible",timeout=12000)
        page.evaluate("location.hash='#overview'")
        page.locator(".journal-shell").wait_for(state="detached",timeout=5000)
        page.evaluate("location.hash='#diary'")
        page.get_by_role("button",name="Open private journal").wait_for(state="visible",timeout=10000)
        assert page.locator(".journal-shell").count()==0,"Private journal remained unlocked after navigating away"
        page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        page.locator(".top .gear").click()
        page.locator("dialog.sheet[open]").wait_for(timeout=5000)
        # Local-mode TAR export and merge roundtrip use only synthetic data.
        page.locator(".settings-tabs button",has_text="Data & tools").click()
        page.locator('select[aria-label="Portable media categories"]').select_option("records")
        page.locator("button",has_text="Download portable TAR").click()
        top=page.locator("dialog.sheet[open]").last
        with page.expect_download(timeout=15000) as archive_download:
            top.locator("button",has_text="Create private TAR").click()
        archive=archive_download.value
        assert archive.suggested_filename.endswith(".tar")
        portable_path=archive.path()
        page.locator('input[aria-label="Portable TAR archive"]').set_input_files(str(portable_path))
        page.locator("button",has_text="Restore portable TAR").click()
        top=page.locator("dialog.sheet[open]").last
        top.locator("button",has_text="Download checkpoint and restore").click()
        page.locator("p[role=status]").filter(has_text="Restore completed").first.wait_for(timeout=20000)
        page.keyboard.press("Escape")
        assert page.locator("dialog.sheet[open]").count()==0,"Settings dialog did not close"
        page.locator(".widget-expand").first.click()
        page.locator("dialog.sheet[open]").wait_for(timeout=5000)
        page.keyboard.press("Escape")
        assert not errors,"Browser JS errors: "+str(errors)
        print(f"OK {width}x{height}: {page.locator('.widget').count()} widgets")
        # Simulate private-browsing/storage-blocked environments. Report volatile
        # data explicitly and offer a structured backup instead of "Synced".
        memory_page=ctx.new_page()
        memory_page.add_init_script("""Object.defineProperty(window,'indexedDB',{
          configurable:true,
          value:{open(){throw new Error('IndexedDB blocked by test');}}
        });""")
        memory_page.route("**/config.js",lambda route: route.fulfill(status=200,content_type="text/javascript",body="export const CONFIG=null;"))
        memory_page.goto(BASE,wait_until="domcontentloaded")
        memory_page.locator(".pill").wait_for(timeout=25000)
        assert "Temporary session" in memory_page.locator(".pill").inner_text(),"Volatile storage was not reported"
        memory_page.locator(".pill").click()
        memory_page.locator("dialog.sheet[open]").wait_for(timeout=5000)
        assert "Download backup" in memory_page.locator("dialog.sheet[open]").inner_text()
        memory_page.close()
        browser.close()
