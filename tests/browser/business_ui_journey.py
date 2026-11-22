"""A real end-user journey using React forms and Playwright clicks (not direct API writes).

Run AFTER enterprise_100.py against the same isolated stack.
"""
import asyncio
import json
import time
import uuid
from pathlib import Path

from playwright.async_api import async_playwright

BASE="http://127.0.0.1:3000"
OUT=Path("artifacts")
OUT.mkdir(exist_ok=True)
PDF=b"%PDF-1.4\n% Inmobiliaria Juanjo contrato de reserva documental\n%%EOF\n"


async def main():
    report={"flow":"React UI contract form -> PDF -> review -> sign -> persisted dashboard"}
    async with async_playwright() as playwright:
        browser=await playwright.chromium.launch(headless=True,args=["--no-sandbox"])
        ctx=await browser.new_context(viewport={"width":1440,"height":900})
        page=await ctx.new_page()
        page.set_default_timeout(60000)
        reference="IJ-FORM-"+uuid.uuid4().hex[:9].upper()
        try:
            await page.goto(BASE,wait_until="domcontentloaded",timeout=60000)
            await page.locator(".stats-grid .stat-card").first.wait_for()
            await page.locator(".side-nav .nav-item").filter(has_text="Contratos").first.click()
            await page.get_by_role("heading",name="Contratos").last.wait_for()
            await page.get_by_role("button",name="Crear, firmar y verificar").click()
            await page.locator("#workbench-title").wait_for()
            contract_form=page.locator("form.contract-create-form")
            await contract_form.locator("input").nth(0).fill(reference)
            await contract_form.locator("input").nth(1).fill("Contrato de reserva de vivienda - Inmobiliaria Juanjo")
            await contract_form.get_by_role("button",name="Crear contrato").click()
            await page.get_by_text("Contrato registrado.",exact=False).first.wait_for()
            report["create"]="UI form persisted contract"
            upload_form=page.locator("form.upload-form")
            await upload_form.locator("input[type=file]").set_input_files({
                "name":"reserva-vivienda.pdf","mimeType":"application/pdf","buffer":PDF})
            await upload_form.get_by_role("button",name="Guardar versión").click()
            await page.locator(".version-card").first.wait_for()
            await page.get_by_role("button",name="Confirmar revisión").first.click()
            await page.get_by_role("button",name="Firmar y anclar").first.wait_for()
            await page.get_by_role("button",name="Firmar y anclar").first.click()
            await page.get_by_text("Firma registrada.",exact=False).first.wait_for()
            report["signature"]="Reviewed PDF hash and registered signer via React controls"
            await page.screenshot(path=str(OUT/"juanjo-contract-ui.png"),full_page=True)
            # Navigating through React reloads metrics, which must include this final UI form write.
            await page.locator(".side-nav .nav-item").filter(has_text="Dashboard").first.click()
            await page.locator(".stats-grid .stat-card").first.wait_for()
            metrics=await page.evaluate("""async () => {
               const jwt=sessionStorage.getItem('dyxersignature.demo-token');
               const r=await fetch('/api/v1/dashboard',{headers:{Authorization:'Bearer '+jwt}});
               if(!r.ok)throw new Error('Dashboard HTTP '+r.status);
               return await r.json();
            }""")
            assert metrics["contracts"]["total"]==76
            assert metrics["documents"]["versions"]==51
            assert metrics["signatures"]["total"]==26
            assert metrics["signatures"]["frequency"]["one"]==26
            assert metrics["blockchain"]["pending"]==26
            assert metrics["signatures"]["averagePerContract"]==round(26/76,2)
            cards=await page.locator(".stats-grid .stat-card").all_inner_texts()
            assert "51" in cards[0] and "76" in cards[1] and "26" in cards[2]
            assert await page.locator(".stellar-health-panel .stellar-kpi").count()==6
            await page.screenshot(path=str(OUT/"juanjo-dashboard-correlated.png"),full_page=True)
            report["dashboard"]={"contracts":76,"pdfVersions":51,"signatures":26,
                                 "pending":26,"oneSignatureContracts":26,
                                 "average":metrics["signatures"]["averagePerContract"],
                                 "cardsMatchPersisted":True}
            report["passed"]=True
        except Exception as exc:
            report["passed"]=False
            report["error"]=type(exc).__name__+": "+str(exc)[:550]
            try:
                await page.screenshot(path=str(OUT/"juanjo-ui-failure.png"),full_page=True,timeout=5000)
            except Exception:
                pass
        finally:
            (OUT/"juanjo-ui-journey.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),
                                                     encoding="utf-8")
            print("UI_JOURNEY",json.dumps(report,ensure_ascii=False),flush=True)
            await ctx.close()
            await browser.close()
    return 0 if report["passed"] else 1


if __name__=="__main__":
    raise SystemExit(asyncio.run(main()))
