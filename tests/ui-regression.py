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
        # Search must read the real locations table, not a missing "places" table.
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("Headlamp")
        first_result=page.locator(".global-search-results .global-search-result").first
        first_result.wait_for(state="visible",timeout=5000)
        assert "Headlamp" in first_result.inner_text(),"Global search did not return a seeded inventory item"
        first_result.click()
        assert page.evaluate("window.location.hash")=="#inventory","Search result failed to navigate"
        page.locator(".overview").evaluate("(el) => { location.hash='#overview'; }")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        page.locator(".top .gear").click()
        page.locator("dialog.sheet[open]").wait_for(timeout=5000)
        page.keyboard.press("Escape")
        assert page.locator("dialog.sheet[open]").count()==0,"Settings dialog did not close"
        page.locator(".widget-expand").first.click()
        page.locator("dialog.sheet[open]").wait_for(timeout=5000)
        page.keyboard.press("Escape")
        assert not errors,"Browser JS errors: "+str(errors)
        print(f"OK {width}x{height}: {page.locator('.widget').count()} widgets")
        browser.close()
