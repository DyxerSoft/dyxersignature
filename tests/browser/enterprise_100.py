"""100 real browser contexts and mixed contract workloads on ISOLATED Docker Compose.

Playwright opens the actual React app and uses its silently issued JWT to send
API calls in each page's browser context. No network traffic goes to public
signature.dyxersoft.com or the real Stellar Testnet. Each user is independent.

Scenario: Inmobiliaria Juanjo (fictional), 25 readers, 25 contract creators,
25 PDF publishers, 25 reviewers/signers, then real dashboard correlation.
"""
import asyncio
import json
import os
import statistics
import time
import uuid
from collections import Counter
from pathlib import Path

from playwright.async_api import async_playwright
from pdf_fixture import valid_pdf_text

BASE = "http://127.0.0.1:3000"
REPORT = Path("artifacts/playwright-enterprise-100.json")
RUN = "IJ-" + uuid.uuid4().hex[:8].upper()
USERS = int(os.environ.get("BROWSER_USERS", "100"))
assert USERS == 100, "Acceptance profile must exercise exactly 100 browser users."
SCENARIOS = ["read", "create", "upload", "sign"]
PDF_HEADER = valid_pdf_text()


async def api_in_browser(page, method, path, payload=None):
    return await page.evaluate("""async ([method, path, payload]) => {
      const jwt = sessionStorage.getItem('dyxersignature.demo-token');
      if (!jwt) throw new Error('JWT automático ausente');
      const headers = { Authorization: 'Bearer ' + jwt };
      let body;
      if (payload && payload.multipart) {
        const file = new File([payload.pdf], 'contrato-reserva-vivienda.pdf', {type:'application/pdf'});
        body = new FormData();
        body.append('file', file);
      } else if (payload != null) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
      }
      const response = await fetch('/api/v1' + path, {method,headers,body});
      const data = response.status === 204 ? null :
        (response.headers.get('content-type')?.includes('application/pdf')
          ? await (async () => {
              const buf = await response.arrayBuffer();
              const decoder = new TextDecoder('latin1');
              const header = decoder.decode(buf.slice(0,5));
              const tail = decoder.decode(buf.slice(Math.max(0,buf.byteLength-4096)));
              return {pdfBytes:buf.byteLength,
                validPdf:header === '%PDF-' && tail.includes('startxref') && tail.includes('%%EOF')};
            })()
          : await response.json().catch(() => null));
      if (!response.ok) {
        const err = data?.title || data?.detail || 'sin respuesta JSON';
        throw new Error(method + ' ' + path.replace(/[0-9a-f-]{36}/g, ':id') +
          ' HTTP ' + response.status + ' ' + err);
      }
      return {status:response.status,data};
    }""", [method,path,payload])


async def simulated_user(browser, idx):
    scenario = SCENARIOS[idx % 4]
    viewport = {"width":390,"height":844} if idx % 10 == 0 else {"width":1366,"height":768}
    context = await browser.new_context(viewport=viewport)
    page = await context.new_page()
    page.set_default_timeout(90000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)[:250]))
    started = time.monotonic()
    result = {"user":idx+1,"scenario":scenario,"ok":False}
    try:
        response = await page.goto(BASE + "/", wait_until="domcontentloaded", timeout=75000)
        assert response and response.status == 200
        await page.locator(".stats-grid .stat-card").first.wait_for(timeout=90000)
        await page.get_by_text("Inmobiliaria Juanjo").first.wait_for(timeout=15000)
        route = {"read":"Dashboard","create":"Contratos","upload":"Documentos","sign":"Firmas"}[scenario]
        if viewport["width"] < 500:
            await page.get_by_role("button",name="Abrir menú").click()
        if route!="Dashboard":
            await page.locator(".side-nav .nav-item").filter(has_text=route).first.click()
            await page.locator(".section-intro h2").wait_for(timeout=30000)
        baseline = await api_in_browser(page,"GET","/dashboard")
        assert "recentActivity" in baseline["data"]
        if scenario == "read":
            listing = await api_in_browser(page,"GET","/contracts?page=1&pageSize=10")
            assert isinstance(listing["data"]["items"],list)
        else:
            ref = f"{RUN}-{idx+1:03}"
            title = ("Contrato de reserva de departamento — Inmobiliaria Juanjo "
                     + str(idx+1).zfill(3))
            created = await api_in_browser(page,"POST","/contracts",{
                "businessReference":ref,"title":title})
            assert created["status"] == 201
            contract_id = created["data"]["id"]
            detail = await api_in_browser(page,"GET","/contracts/"+contract_id)
            assert detail["data"]["businessReference"] == ref
            result["reference"]=ref
            if scenario in ("upload","sign"):
                uploaded = await api_in_browser(page,"POST",
                    "/contracts/"+contract_id+"/versions",
                    {"multipart":True,"pdf":PDF_HEADER})
                assert uploaded["status"] == 201
                version_id = uploaded["data"]["documentVersionId"]
                document_hash = uploaded["data"]["documentHash"]
                assert len(document_hash)==64
                verification = await api_in_browser(page,"GET",
                    f"/contracts/{contract_id}/versions/{version_id}/verify")
                assert verification["data"]["contentMatches"] is True
                # Protected public API -> private S3 stream -> valid PDF (not just '%PDF-').
                document = await api_in_browser(page,"GET",f"/documents/{version_id}/file")
                assert document["status"]==200
                assert document["data"]["validPdf"] is True
                assert document["data"]["pdfBytes"]>200
                result["pdf_verified"]=True
                if scenario=="sign":
                    reviewed=await api_in_browser(page,"POST",
                        f"/contracts/{contract_id}/versions/{version_id}/review",
                        {"documentHash":document_hash})
                    assert reviewed["status"]==204
                    signed=await api_in_browser(page,"POST",
                        f"/contracts/{contract_id}/versions/{version_id}/sign",{
                            "documentHash":document_hash,
                            "signerName":"Responsable de contratos "+str(idx+1).zfill(3),
                            "signerEmail":"gestion"+str(idx+1)+"@juanjo.example"
                        })
                    assert signed["status"]==202
                    signers=await api_in_browser(page,"GET",f"/contracts/{contract_id}/signatures")
                    assert len(signers["data"]["signers"])==1
                    audit=await api_in_browser(page,"GET",
                        f"/contracts/{contract_id}/audit?page=1&pageSize=30")
                    assert len(audit["data"]["items"])>=3
                    result["signed"]=True
        if errors:
            raise AssertionError("Browser JavaScript errors: "+repr(errors))
        result["ok"]=True
    except Exception as exc:
        result["error"]=type(exc).__name__+": "+str(exc)[:400]
    finally:
        result["duration_ms"]=round((time.monotonic()-started)*1000)
        await context.close()
    return result


async def navigation_warmup(browser,n):
    """All pages in a stage are real Chromium pages, not API-only virtual users."""
    async def one(idx):
        ctx=await browser.new_context()
        page=await ctx.new_page()
        start=time.monotonic()
        try:
            response=await page.goto(BASE,wait_until="domcontentloaded",timeout=75000)
            assert response.status==200
            await page.locator(".stats-grid .stat-card").first.wait_for(timeout=60000)
            assert await page.locator(".stats-grid .stat-card").count()==4
            return {"ok":True,"ms":int((time.monotonic()-start)*1000)}
        except Exception as exc:
            return {"ok":False,"error":str(exc)[:200]}
        finally:
            await ctx.close()
    started=time.monotonic()
    checks=await asyncio.gather(*(one(i) for i in range(n)))
    return {"users":n,"success":sum(x["ok"] for x in checks),
            "duration_s":round(time.monotonic()-started,2),
            "latency_p95_ms":sorted([x["ms"] for x in checks if x["ok"]])[int(sum(x["ok"] for x in checks)*.95)-1]
                if any(x["ok"] for x in checks) else None,
            "errors":[x.get("error") for x in checks if not x["ok"]][:5]}


async def assert_dashboard(browser, results):
    ctx=await browser.new_context()
    page=await ctx.new_page()
    try:
        await page.goto(BASE,wait_until="domcontentloaded")
        await page.locator(".stats-grid .stat-card").first.wait_for()
        dashboard=(await api_in_browser(page,"GET","/dashboard"))["data"]
        created=sum(x["ok"] and x["scenario"]!="read" for x in results)
        published=sum(x["ok"] and x["scenario"] in ("upload","sign") for x in results)
        signed=sum(x["ok"] and x["scenario"]=="sign" for x in results)
        assert len(results)==100
        assert len([x for x in results if x["ok"]])==100, "Some user scenarios failed"
        assert dashboard["contracts"]["total"]==created, (
            "Contract total mismatch",dashboard["contracts"]["total"],created)
        assert dashboard["documents"]["versions"]==published, (
            "PDF version mismatch",dashboard["documents"]["versions"],published)
        assert dashboard["signatures"]["total"]==signed
        assert dashboard["signatures"]["frequency"]["one"]==signed
        assert dashboard["signatures"]["averagePerContract"]==round(signed/created,2)
        assert dashboard["blockchain"]["pending"]==signed, (
            "Outbox anchor backlog mismatch",dashboard["blockchain"]["pending"],signed)
        assert dashboard["blockchain"]["confirmed"]==0, "Unexpected real Testnet confirmations in isolated CI"
        assert len(dashboard["recentActivity"])==8, "The recent list must contain 8 distinct contracts"
        assert len({x["contractId"] for x in dashboard["recentActivity"]})==8
        assert all(x["businessReference"].startswith(RUN) and x["eventCount"]>=1
                   for x in dashboard["recentActivity"])
        # Frontend values must match the API, not only exist in JSON.
        await page.reload()
        await page.locator(".stats-grid .stat-card").first.wait_for()
        cards=await page.locator(".stats-grid .stat-card").all_inner_texts()
        assert str(created) in cards[1] and str(published) in cards[0] and str(signed) in cards[2]
        kpi=page.locator(".stellar-health-panel .stellar-kpi")
        assert await kpi.count()==6,"Stellar operational cards not visible"
        for idx in range(6):
            assert await kpi.nth(idx).is_visible()
            bounds=await kpi.nth(idx).bounding_box()
            assert bounds and bounds["width"]>70 and bounds["height"]>50
        assert str(signed) in (await kpi.nth(1).inner_text())
        assert await page.locator(".activity-event").count()>0
        return {"contracts":created,"documents":published,"signatures":signed,
                "pendingAnchors":dashboard["blockchain"]["pending"],
                "oneSignatureContracts":dashboard["signatures"]["frequency"]["one"],
                "averageSignaturesPerContract":dashboard["signatures"]["averagePerContract"],
                "recentActivity":len(dashboard["recentActivity"]),
                "dashboardDomMatchesApi":True}
    finally:
        await ctx.close()


async def main():
    REPORT.parent.mkdir(parents=True,exist_ok=True)
    result={"environment":"ephemeral Docker Compose; no Stellar Testnet key",
            "workspace":"Inmobiliaria Juanjo","users":100,"stages":[]}
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,args=["--no-sandbox"])
        try:
            for n in (10,25,50):
                stage=await navigation_warmup(browser,n)
                result["stages"].append(stage)
                print("WARMUP",json.dumps(stage),flush=True)
                if stage["success"] != n:
                    raise AssertionError("Browser load stage failed: "+str(n))
            started=time.monotonic()
            tasks=[asyncio.create_task(simulated_user(browser,i)) for i in range(USERS)]
            users=await asyncio.gather(*tasks)
            result["mixedLoad"]={
                "concurrentBrowserUsers":USERS,
                "passed":sum(x["ok"] for x in users),
                "failed":sum(not x["ok"] for x in users),
                "duration_s":round(time.monotonic()-started,2),
                "scenarioSuccess":dict(Counter(x["scenario"] for x in users if x["ok"])),
                "failures":[x for x in users if not x["ok"]][:12]
            }
            print("MIXED",json.dumps(result["mixedLoad"]),flush=True)
            if result["mixedLoad"]["failed"]:
                raise AssertionError("100-browser mixed-load failures")
            result["dashboard"]=await assert_dashboard(browser,users)
            print("DASHBOARD_CORRELATION",json.dumps(result["dashboard"]),flush=True)
            result["passed"]=True
        except Exception as exc:
            result["passed"]=False
            result["error"]=type(exc).__name__+": "+str(exc)[:500]
        finally:
            await browser.close()
    REPORT.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding="utf-8")
    return 0 if result["passed"] else 1


if __name__=="__main__":
    raise SystemExit(asyncio.run(main()))
