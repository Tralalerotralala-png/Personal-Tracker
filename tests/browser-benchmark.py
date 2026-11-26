"""Credential-free local-mode benchmark using synthetic sample data.
Run: python tests/browser-benchmark.py --root . --baseline /path/to/old/checkout
"""
import argparse, functools, http.server, json, pathlib, statistics, threading, time
from playwright.sync_api import sync_playwright

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

def measure(browser, root, sizes, repetitions):
    server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(QuietHandler,directory=str(root)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f"http://127.0.0.1:{server.server_port}"
    rows=[]
    try:
        for width,height in sizes:
            samples=[]
            for _ in range(repetitions):
                context=browser.new_context(viewport={"width":width,"height":height},service_workers="block",locale="en-US")
                page=context.new_page();counts={"local":0,"external_blocked":0};errors=[]
                page.on("pageerror",lambda error:errors.append(str(error)))
                def intercept(route):
                    url=route.request.url
                    if url.startswith(origin+"/"):
                        counts["local"]+=1
                        if url.endswith("/config.js") or url.endswith("/config.local.js"):
                            route.fulfill(status=200,content_type="text/javascript",body="export const CONFIG=null;")
                        else:
                            route.continue_()
                    else:
                        counts["external_blocked"]+=1;route.abort()
                page.route("**/*",intercept)
                start=time.perf_counter()
                page.goto(origin+"/",wait_until="domcontentloaded")
                page.locator(".overview .widget").first.wait_for(state="visible",timeout=25000)
                startup=(time.perf_counter()-start)*1000
                metrics=page.evaluate("""async()=>{
                    const widgets=[...document.querySelectorAll('.overview .widget')].filter(w=>w.getClientRects().length);
                    const overflowing=widgets.filter(w=>w.scrollWidth>w.clientWidth+2||w.querySelector('.widget-body')?.scrollWidth>w.querySelector('.widget-body')?.clientWidth+2)
                        .map(w=>[...w.classList].find(c=>c.startsWith('wd-'))||'unknown');
                    const storage=await navigator.storage?.estimate?.().catch(()=>null);
                    return {widget_count:widgets.length,widget_horizontal_overflow:overflowing,
                      document_horizontal_overflow:document.documentElement.scrollWidth>innerWidth+2,
                      transfer_bytes:performance.getEntriesByType('resource').reduce((sum,e)=>sum+(e.transferSize||0),0),
                      origin_storage_bytes:storage?.usage??null,
                      node_count:document.getElementsByTagName('*').length};
                }""")
                heap=context.new_cdp_session(page).send("Runtime.getHeapUsage")["usedSize"]
                routes={}
                for key in ["inventory","calendar","games","overview"]:
                    stamp=time.perf_counter()
                    page.evaluate("(route)=>location.hash='#'+route",key)
                    page.locator(f'main [data-view="{key}"]:not([hidden])').wait_for(state="visible",timeout=12000)
                    routes[key]=round((time.perf_counter()-stamp)*1000,2)
                if errors:raise AssertionError(errors)
                samples.append({"startup_ms":startup,"js_heap_bytes":heap,**metrics,**counts,"route_ms":routes})
                context.close()
            number_keys=["startup_ms","js_heap_bytes","transfer_bytes","origin_storage_bytes","node_count","local","external_blocked","widget_count"]
            median={key:round(statistics.median([s[key] for s in samples if s[key] is not None]),2)
                    if any(s[key] is not None for s in samples) else None for key in number_keys}
            median["route_ms"]={k:round(statistics.median(s["route_ms"][k] for s in samples),2) for k in samples[0]["route_ms"]}
            median["widget_horizontal_overflow"]=sorted({w for s in samples for w in s["widget_horizontal_overflow"]})
            median["document_horizontal_overflow"]=any(s["document_horizontal_overflow"] for s in samples)
            rows.append({"viewport":f"{width}x{height}","median":median,"samples":samples})
    finally:
        server.shutdown();server.server_close()
    return rows

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--root",type=pathlib.Path,default=pathlib.Path("."))
    parser.add_argument("--baseline",type=pathlib.Path)
    parser.add_argument("--output",type=pathlib.Path,default=pathlib.Path("benchmark.json"))
    parser.add_argument("--repetitions",type=int,default=3)
    args=parser.parse_args()
    sizes=[(360,800),(390,844),(768,1024),(1280,900),(1920,1080)]
    with sync_playwright() as p:
        browser=p.chromium.launch(args=["--no-sandbox"])
        report={"method":"fresh Chromium contexts, synthetic local mode, external network blocked; median per viewport",
                "baseline":measure(browser,args.baseline.resolve(),sizes,args.repetitions) if args.baseline else None,
                "current":measure(browser,args.root.resolve(),sizes,args.repetitions)}
        browser.close()
    args.output.write_text(json.dumps(report,indent=2),encoding="utf-8")
    for index,row in enumerate(report["current"]):
        print("BENCHMARK",row["viewport"],json.dumps(row["median"],sort_keys=True))
        if report["baseline"]:
            print("BASELINE",row["viewport"],json.dumps(report["baseline"][index]["median"],sort_keys=True))
    print("Raw report:",args.output)

if __name__=="__main__":
    main()
