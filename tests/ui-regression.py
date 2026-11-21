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
        # Stress asynchronous tab mounts: only the final requested view may
        # complete its navigation and hide the current screen.
        page.evaluate("""async () => {
          for (const name of ['calendar','diary','games','hub','inventory','overview']) {
            location.hash='#'+name;
            await new Promise(resolve=>setTimeout(resolve,1));
          }
        }""")
        page.wait_for_timeout(350)
        assert page.locator('main [data-view]:not([hidden])').count()==1,"Multiple tabs stayed visible after rapid navigation"
        assert page.locator('main [data-view="overview"]').is_visible(),"The latest navigation did not win"
        assert not errors,"Rapid navigation raised browser errors: "+str(errors)
        # Verify the real IndexedDB transaction, not only the in-memory test
        # adapter: device erasure must clear photo/cache metadata as well.
        erased=page.evaluate("""async () => {
          const {openIdbAdapter}=await import('./js/data/adapters.js');
          const {createStore}=await import('./js/data/store.js');
          const adapter=await openIdbAdapter('tracker-erase-atomic-regression');
          const store=createStore({adapter});
          await store.upsert('items',{id:'tmp-private',name:'Sensitive record'});
          await store.meta.set('photo:tmp-private',{dataUrl:'SENSITIVE'});
          await store.meta.set('sync-conflict:test',{value:'SENSITIVE'});
          await store.eraseDeviceCache();
          return {items:(await adapter.getAll('items')).length,
            meta:(await adapter.getAll('meta')).length,
            outbox:(await adapter.getAll('outbox')).length};
        }""")
        assert erased=={"items":0,"meta":0,"outbox":0},"Device erasure left cached data: "+str(erased)
        # B2 daily practice keeps the old beginner history and reveals the
        # next turn in an accessible sheet rather than growing a small widget.
        dialogue_ui=page.evaluate("""async () => {
          const {createPhraseOfDay}=await import('./js/ui/daily-phrases.js');
          const old=createPhraseOfDay({date:new Date(2026,10,20)});
          const newDay=createPhraseOfDay({date:new Date(2026,10,21)});
          const olderChar=!!old.querySelector('.phrase-char');
          const compact=document.createElement('div');
          compact.className='widget wd-phrase';
          const body=document.createElement('div');
          body.className='widget-body';compact.append(body);
          body.append(newDay);document.body.append(compact);
          const before={oldChar:olderChar,b2:newDay.classList.contains('phrase-b2-panel'),
            speech:!!newDay.querySelector('.phrase-b2-pattern'),
            turns:[...newDay.querySelectorAll('.phrase-b2-turn-head')].filter(x=>!x.closest('[hidden]')).length,
            pinyin:!!newDay.querySelector('[lang="zh-Latn-pinyin"]'),
            replyHidden:!!newDay.querySelector('.phrase-b2-answer[hidden]')};
          const toggle=newDay.querySelector('.phrase-b2-toggle');
          toggle.click();
          const sheet=[...document.querySelectorAll('dialog.sheet[open]')].at(-1);
          const reply=sheet?.querySelector('.phrase-b2-answer');
          const after={sheet:!!sheet,reply:!!reply&&!reply.hidden,
            notes:!!sheet?.querySelector('.phrase-b2-tip'),
            vocab:sheet?.querySelectorAll('.phrase-b2-vocab').length||0,
            pinyin:sheet?.querySelectorAll('[lang="zh-Latn-pinyin"]').length||0};
          sheet?.close();compact.remove();
          return {before,after};
        }""")
        assert dialogue_ui["before"]=={"oldChar":True,"b2":True,"speech":True,"turns":1,"pinyin":True,"replyHidden":True},dialogue_ui
        assert dialogue_ui["after"]=={"sheet":True,"reply":True,"notes":True,"vocab":2,"pinyin":2},dialogue_ui

        # Actual Chromium integration: forecast-only days, meter, current UV,
        # and daily peak UV. Unavailable later dates now carry estimated wetness.
        agenda_fit=page.evaluate("""async () => {
          const {mountWidget}=await import('./js/widgets/registry.js');
          const {todayKeyLocal,addDaysKey}=await import('./js/calendar/recurrence.js');
          const from=todayKeyLocal(),tomorrow=addDaysKey(from,1),missing=addDaysKey(from,4);
          const raw={weather_code:0,uvMax:8};
          const dates=[from,tomorrow];
          const events=[
            {id:'one',title:'Forecast only today',starts_at:from+'T12:00:00',all_day:false},
            {id:'two',title:'Forecast only tomorrow',starts_at:tomorrow+'T12:00:00',all_day:false},
            {id:'three',title:'Estimated final day',starts_at:missing+'T12:00:00',all_day:false}
          ];
          const store={list:async()=>events,subscribe:()=>()=>{}};
          const weather={
            getState:()=>({rows:dates.map((date,i)=>({date,index:20+i*15,label:'Dry',
              phase:i===0?'today':'future',raw})),
              status:'ok',current:{uv_index:5}}),
            subscribe:()=>()=>{}
          };
          const widget=document.createElement('section');
          widget.className='widget wd-calendar';
          widget.style.cssText='position:fixed;top:10px;left:10px;width:350px;height:230px;z-index:9999';
          const head=document.createElement('header');head.className='widget-head';head.textContent='Coming up';
          const body=document.createElement('div');body.className='widget-body';
          widget.append(head,body);document.body.append(widget);
          const instance=mountWidget('calendar',body,{store,weather,interactive:true});
          await new Promise(resolve=>setTimeout(resolve,380));
          const labels=[...body.querySelectorAll('.w-cal-day')].map(x=>({
            date:x.dataset.date,meter:!!x.querySelector('.mud-bar'),dailyUV:x.textContent.includes('Peak UV 8'),estimated:x.textContent.includes('Est.')
          }));
          const result={labels,uv:body.textContent.includes('UV index 5'),
            estimated:body.textContent.includes('Estimated final day'),unavailable:body.textContent.includes('Unavailable'),
            height:body.clientHeight,scrollHeight:body.scrollHeight};
          instance.destroy();widget.remove();
          return result;
        }""")
        assert len(agenda_fit["labels"])==3 and all(row["meter"] for row in agenda_fit["labels"]),agenda_fit
        assert sum(row["dailyUV"] for row in agenda_fit["labels"])==2,agenda_fit
        assert any(row["estimated"] for row in agenda_fit["labels"]),agenda_fit
        assert agenda_fit["uv"] and agenda_fit["estimated"] and not agenda_fit["unavailable"],agenda_fit
        assert agenda_fit["scrollHeight"]<=agenda_fit["height"]+8,"Coming Up needed internal scroll: "+str(agenda_fit)
        # A day-detail drawer renders both hourly rain and UV on one compact
        # chart, and omits the UV curve if the model returns no UV values.
        chart_result=page.evaluate("""async () => {
          const {renderHourlyDay}=await import('./js/ui/day-hourly.js');
          const rows=Array.from({length:24},(_,i)=>({
            time:'2026-11-21T'+String(i).padStart(2,'0')+':00',
            precipitation:i===14?0.5:0,probability:i===14?45:0,
            uv_index:i>6&&i<19?Math.round((19-i)*(i-6)/4):0
          }));
          const a=renderHourlyDay(rows,'2026-11-21','America/Mexico_City');
          const info={charts:a?.querySelectorAll('.day-hourly-chart').length||0,
            rects:a?.querySelectorAll('.hourly-column').length||0,
            uv:!!a?.textContent.includes('UV over the day')};
          const empty=renderHourlyDay(rows.map(({uv_index,...x})=>x),'2026-11-21');
          info.noUv=empty?.querySelectorAll('.day-hourly-chart').length===1;
          return info;
        }""")
        assert chart_result=={"charts":2,"rects":48,"uv":True,"noUv":True},chart_result

        # Clicking celestial event opens local prose rather than a source-code
        # repository, on both mobile and desktop widget dimensions.
        sky_explanation=page.evaluate("""async () => {
          const {mountWidget}=await import('./js/widgets/registry.js');
          const widget=document.createElement('section');widget.className='widget wd-sky';
          widget.style.cssText='position:fixed;top:10px;left:10px;width:340px;height:240px;z-index:9999';
          const body=document.createElement('div');body.className='widget-body';
          widget.append(body);document.body.append(widget);
          const instance=mountWidget('sky',body,{weather:{getState:()=>({place:null}),subscribe:()=>()=>{}},interactive:true});
          await new Promise(resolve=>setTimeout(resolve,400));
          const button=body.querySelector('.w-sky-event');
          if(!button){instance.destroy();widget.remove();return {count:0};}
          button.click();
          const dialog=document.querySelector('dialog.sheet[open]');
          const result={count:body.querySelectorAll('.w-sky-event').length,
            explanation:dialog?.querySelector('.sky-explanation')?.textContent||'',
            links:[...body.querySelectorAll('a[href]')].map(a=>a.href)};
          dialog?.close();instance.destroy();widget.remove();
          return result;
        }""")
        assert sky_explanation["count"]>=1 and "What is happening" in sky_explanation["explanation"],sky_explanation
        assert "What it might mean" in sky_explanation["explanation"],sky_explanation
        assert not sky_explanation["links"],sky_explanation
        # Real mobile/desktop SVG DOM: layered sprites have two complete
        # directions; the classic style remains immediately available.
        page.evaluate("location.hash='#inventory'")
        art=page.locator(".inventory .tile svg.sprite-stacked-asset")
        art.first.wait_for(state="visible",timeout=15000)
        pixels=art.first.evaluate("""svg => ({
          a:svg.querySelector('.sprite-stack-direction-a')?.childElementCount||0,
          b:svg.querySelector('.sprite-stack-direction-b')?.childElementCount||0,
          bbox:svg.getBBox().width
        })""")
        assert pixels["a"]>0 and pixels["b"]>0 and pixels["bbox"]>0,"Stacked pixel art was blank"
        page.evaluate("""() => {
          document.documentElement.dataset.spriteStyle='flat';
          window.dispatchEvent(new Event('tracker-sprite-style-change'));
        }""")
        page.locator(".inventory .tile .sprite-stack-face").first.wait_for(state="visible",timeout=10000)
        assert page.locator(".inventory .tile svg.sprite-stacked-asset").count()==0,"Classic flat mode still rendered stacks"
        page.evaluate("""() => {
          document.documentElement.dataset.spriteStyle='stack';
          window.dispatchEvent(new Event('tracker-sprite-style-change'));
        }""")
        page.locator(".inventory .tile svg.sprite-stacked-asset").first.wait_for(state="visible",timeout=10000)
        page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)

        stray_text=page.locator("#app").evaluate(
            "(el) => [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim())"
        )
        assert not stray_text,"Unexpected text nodes in app grid: "+str(stray_text)
        # A real IndexedDB transaction must preserve a losing local edit and
        # its recoverable conflict copy atomically, not just in memory tests.
        pull_case=page.evaluate("""async () => {
          const {openIdbAdapter}=await import('./js/data/adapters.js');
          const db=await openIdbAdapter('tracker-regression-pull-conflict');
          for(const table of ['items','outbox','meta'])await db.clear(table);
          const id='77777777-7777-4777-8777-777777777777';
          await db.put('items',{id,name:'Offline edit',updated_at:'2026-11-20T09:00:00Z'});
          await db.put('outbox',{key:'items:'+id,table:'items',id});
          await db.applyRemoteRow('items',{
            id,name:'Other-device version',updated_at:'2026-11-21T09:00:00Z',
            synced_at:'2026-11-21T09:00:01Z'
          });
          const saved=await db.getAll('meta');
          return {name:(await db.get('items',id)).name,outbox:(await db.getAll('outbox')).length,
            conflicts:saved.filter(x=>x.key.startsWith('sync-conflict:')).map(x=>x.value.local.name)};
        }""")
        assert pull_case=={"name":"Other-device version","outbox":0,"conflicts":["Offline edit"]},pull_case
        # A stale upload must not remove a newer photo queue entry after an
        # IndexedDB transaction has committed that newer upload marker.
        photo_case=page.evaluate("""async () => {
          const {openIdbAdapter}=await import('./js/data/adapters.js');
          const db=await openIdbAdapter('tracker-regression-photo-queue');
          await db.clear('meta');
          const key='photoq:77777777-7777-4777-8777-777777777777';
          await db.put('meta',{key,value:{path:'photo-A.webp'}});
          await db.put('meta',{key,value:{path:'photo-B.webp'}});
          const stale=await db.deleteMetaIfPath(key,'photo-A.webp');
          const kept=(await db.get('meta',key))?.value?.path;
          const current=await db.deleteMetaIfPath(key,'photo-B.webp');
          return {stale,kept,current,empty:(await db.get('meta',key))===undefined};
        }""")
        assert photo_case=={"stale":False,"kept":"photo-B.webp","current":True,"empty":True},photo_case
        # An older signed URL request must not overwrite a newly selected
        # photo's cache in the real IndexedDB adapter.
        download_cache=page.evaluate("""async () => {
          const {openIdbAdapter}=await import('./js/data/adapters.js');
          const db=await openIdbAdapter('tracker-regression-photo-cache');
          await db.clear('items');await db.clear('meta');
          const id='88888888-8888-4888-8888-888888888888';
          await db.put('items',{id,photo_path:'old.webp'});
          await db.put('meta',{key:'photo:'+id,value:{path:'new.webp',dataUrl:'data:new'}});
          const blocked=await db.cachePhotoIfCurrent(id,'old.webp','data:stale');
          const kept=(await db.get('meta','photo:'+id))?.value;
          await db.put('items',{id,photo_path:'new.webp'});
          const accepted=await db.cachePhotoIfCurrent(id,'new.webp','data:refresh');
          const fresh=(await db.get('meta','photo:'+id))?.value;
          return {blocked,kept,accepted,fresh};
        }""")
        assert download_cache=={
          "blocked":False,"kept":{"path":"new.webp","dataUrl":"data:new"},
          "accepted":True,"fresh":{"path":"new.webp","dataUrl":"data:refresh"}
        },download_cache
        skip=page.locator(".skip-link")
        skip.focus()
        assert skip.bounding_box()["y"]>=0,"Keyboard skip link did not appear on focus"
        skip.press("Enter")
        assert page.evaluate("document.activeElement.id")=="main","Skip link did not move keyboard focus to main content"
        # Customize a non-backpack icon, then verify it persists across reloads.
        page.locator(".top .gear").click()
        page.locator(".settings-tabs button",has_text="Appearance").click()
        page.get_by_role("button",name="Customize navigation icons").click()
        picker=page.locator("dialog.sheet[open]").last
        picker.locator('select[aria-label="Section to customize"]').select_option("games")
        picker.locator('select[aria-label="Alternate icon"]').select_option("gear")
        picker.locator('input[aria-label="Icon color"]').fill("#bc6745")
        picker.get_by_role("button",name="Save icons").click()
        assert page.evaluate("JSON.parse(localStorage.getItem('tracker-nav-icon-choices-v1')).games.glyph")=="gear"
        page.keyboard.press("Escape")
        page.reload(wait_until="domcontentloaded")
        page.locator(".top .gear").wait_for(timeout=25000)
        assert "#bc6745" in page.locator('.slot[data-route="games"] .slot-icon').inner_html()
        if width<899:
            page.evaluate("location.hash='#expenses'")
            page.locator('.slot[data-route="expenses"][aria-current="page"]').wait_for(timeout=10000)
            page.wait_for_timeout(150)
            x=page.locator('.slot[data-route="expenses"]').bounding_box()
            assert x and 0<=x["x"]<width and x["x"]+x["width"]<=width+3,"Active mobile tab not revealed"
            page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
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
        # Search deep links must open the exact saved note and expense,
        # not merely switch to the relevant section.
        page.evaluate("""async () => {
          const db=await new Promise((resolve,reject)=>{
            const req=indexedDB.open('personal-tracker-local',1);
            req.onsuccess=()=>resolve(req.result);
            req.onerror=()=>reject(req.error);
          });
          const now=new Date().toISOString();
          await new Promise((resolve,reject)=>{
            const tx=db.transaction('settings','readwrite');
            for(const [key,value] of [
              ['hub_note:99999999-9999-4999-8999-999999999991',{title:'Unique test notebook',body:'Search deep-link test'}],
              ['hub_expense:99999999-9999-4999-8999-999999999992',{title:'Unique test payment',amount:12,currency:'MXN',category:'Other',due:'2026-11-01',type:'expense'}],
              ['game_library_v1',{games:[{id:'99999999-9999-4999-8999-999999999993',title:'Unique test game',platform:'PC',status:'Playing',shelf:'Backlog'}],shelves:['Backlog'],mode:'shelf'}]
            ])tx.objectStore('settings').put({key,value,created_at:now,updated_at:now,deleted_at:null});
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
          });
          db.close();
        }""")
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("Unique test notebook")
        page.locator(".global-search-result").first.click()
        page.locator("dialog.sheet[open] input").first.wait_for(timeout=10000)
        assert page.locator("dialog.sheet[open] input").first.input_value()=="Unique test notebook"
        page.keyboard.press("Escape")
        page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("Unique test payment")
        page.locator(".global-search-result").first.click()
        page.locator(".expense-editor input").first.wait_for(timeout=10000)
        assert page.locator(".expense-editor input").first.input_value()=="Unique test payment"
        page.evaluate("location.hash='#overview'")
        page.locator(".overview .widget").first.wait_for(state="visible",timeout=10000)
        page.locator(".pixel-search-toggle").click()
        page.locator(".global-search-input").fill("Unique test game")
        page.locator(".global-search-result").first.click()
        page.wait_for_timeout(500)
        print("GAME_DEBUG",page.evaluate("location.hash"),"detail",page.locator(".game-detail").count(),
              "games",page.locator(".games-view").count(),
              "visible",page.locator(".games-view").first.is_visible() if page.locator(".games-view").count() else False,
              "excerpt",page.locator(".media-library-view").inner_text()[:450])
        page.locator(".game-detail").first.wait_for(timeout=10000)
        assert "Unique test game" in page.locator(".games-view").inner_text()
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
        # The v3 journal must persist independently encrypted entries through
        # a complete lock/unlock cycle in a real browser and IndexedDB.
        page.locator(".journal-shell .hub-tabs button",has_text="Private Vault").click()
        page.locator(".journal-list-head button",has_text="New entry").click()
        page.locator(".journal-inline-editor input[type=text]").first.fill("Sensitive vault entry")
        page.locator(".journal-inline-editor textarea").first.fill("Never appears in the public search")
        page.locator(".journal-editor-actions button",has_text="Save").click()
        page.locator(".journal-shell .journal-entry").filter(has_text="Sensitive vault entry").wait_for(timeout=10000)
        page.evaluate("location.hash='#overview'")
        page.locator(".journal-shell").wait_for(state="detached",timeout=5000)
        page.evaluate("location.hash='#diary'")
        page.get_by_role("button",name="Open private journal").wait_for(state="visible",timeout=10000)
        assert page.locator(".journal-shell").count()==0,"Private journal remained unlocked after navigating away"
        page.get_by_role("button",name="Open private journal").click()
        page.locator(".journal-unlock input[type=password]").first.fill("local regression passphrase")
        page.get_by_role("button",name="Unlock",exact=True).click()
        page.locator(".journal-shell").wait_for(state="visible",timeout=12000)
        page.locator(".journal-shell .hub-tabs button",has_text="Private Vault").click()
        assert page.locator(".journal-shell .journal-entry").filter(has_text="Sensitive vault entry").count()==1
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
