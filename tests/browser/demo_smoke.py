#!/usr/bin/env python3
"""Read-only Playwright smoke against a DyxerSignature demo URL.

Never creates contracts, signs, transfers funds, or reads/prints JWT contents.
All write-load testing runs against isolated local Docker Compose.
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

BASE_URL = os.environ.get("PUBLIC_URL", "https://signature.dyxersoft.com").rstrip("/")
OUT = Path(os.environ.get("PLAYWRIGHT_REPORT_DIR", "artifacts/browser"))
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {"target": BASE_URL, "mode": "read-only", "browsers": []}


def assert_metrics(metrics):
    contracts = metrics["contracts"]
    signatures = metrics["signatures"]
    distribution = signatures["frequency"]
    buckets = [distribution[k] for k in ("one", "two", "three", "four", "fivePlus")]
    assert all(isinstance(x, int) and x >= 0 for x in buckets), "Invalid signature histogram"
    assert sum(buckets) <= signatures["total"], "Histogram contains more contracts than signatures"
    assert sum(buckets) <= contracts["total"], "Histogram contains more contracts than total contracts"
    expected_average = round(signatures["total"] / contracts["total"], 2) if contracts["total"] else 0
    assert abs(expected_average - signatures["averagePerContract"]) <= 0.02, "Average signatures per contract mismatch"
    assert contracts["active"] <= contracts["total"], "Active contracts exceed total"
    assert metrics["documents"]["versions"] >= 0
    assert metrics["blockchain"]["pending"] >= 0


def run_viewport(browser, name, width, height):
    outcome = {"viewport": name, "width": width, "height": height, "steps": [], "console_errors": [], "api_failures": []}
    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
    page = context.new_page()
    page.set_default_timeout(20000)
    page.on("pageerror", lambda exc: outcome["console_errors"].append(str(exc)[:400]))
    def on_response(res):
        if "/api/" in res.url and res.status >= 400:
            path = urlsplit(res.url).path
            outcome["api_failures"].append({"path": path, "status": res.status})
    page.on("response", on_response)
    start = time.monotonic()
    try:
        response = page.goto(BASE_URL + "/", wait_until="domcontentloaded", timeout=45000)
        outcome["homepage_http"] = response.status if response else None
        assert response and response.status == 200, "Homepage did not respond with HTTP 200"
        page.locator(".main-panel").wait_for(state="visible", timeout=30000)
        page.get_by_role("heading", name="Panel de gestión documental").wait_for(timeout=20000)
        page.locator(".stats-grid .stat-card").first.wait_for(timeout=25000)
        assert page.locator(".stats-grid .stat-card").count() == 4, "Expected four dashboard KPI cards"
        outcome["time_to_dashboard_ms"] = round((time.monotonic() - start) * 1000)
        outcome["steps"].append("Dashboard mounted with live KPI cards")
        values = page.evaluate("""async () => {
            const jwt = sessionStorage.getItem("dyxersignature.demo-token");
            if (!jwt) throw new Error("Automatic demo JWT missing in session storage");
            const headers = { Authorization: "Bearer " + jwt };
            const [dash, listing] = await Promise.all([
                fetch("/api/v1/dashboard", {headers}),
                fetch("/api/v1/contracts?page=1&pageSize=25", {headers})
            ]);
            if (!dash.ok || !listing.ok) throw new Error("Read API status: dashboard=" + dash.status + ", contracts=" + listing.status);
            const [dashboard, contracts] = await Promise.all([dash.json(), listing.json()]);
            return {dashboard, listing: {total: contracts.total, count: contracts.items.length}};
        }""")
        assert_metrics(values["dashboard"])
        assert values["listing"]["total"] >= values["listing"]["count"]
        outcome["kpis"] = {
            "contracts": values["dashboard"]["contracts"]["total"],
            "signed_events": values["dashboard"]["signatures"]["total"],
            "pdf_versions": values["dashboard"]["documents"]["versions"],
            "pending_anchors": values["dashboard"]["blockchain"]["pending"],
            "contracts_first_page": values["listing"]["count"],
            "signature_frequency": values["dashboard"]["signatures"]["frequency"]
        }
        outcome["steps"].append("Authorized dashboard and contracts APIs; aggregate KPI invariants consistent")
        page.screenshot(path=str(OUT / (name + "-dashboard.png")), full_page=True, mask=page.locator(".profile-mini"))

        for section in ["Documentos", "Contratos", "Firmas", "Dashboard"]:
            if name == "mobile":
                page.get_by_role("button", name="Abrir menú").click()
            page.locator(".side-nav .nav-item").filter(has_text=section).first.click()
            if section == "Dashboard":
                page.get_by_role("heading", name="Panel de gestión documental").wait_for()
            else:
                page.locator(".main-panel h1").filter(has_text=section).wait_for()
                page.locator(".section-intro h2").wait_for()
            outcome["steps"].append("UI navigation " + section)
        outcome["passed"] = not outcome["console_errors"] and not outcome["api_failures"]
        if not outcome["passed"]:
            outcome["error"] = "Browser console or API reported errors"
    except Exception as exc:
        outcome["passed"] = False
        outcome["error"] = type(exc).__name__ + ": " + str(exc)[:500]
        try:
            page.screenshot(path=str(OUT / (name + "-failure.png")), full_page=True, timeout=5000)
        except Exception:
            pass
    finally:
        outcome["duration_ms"] = round((time.monotonic() - start) * 1000)
        print(json.dumps(outcome, ensure_ascii=False), flush=True)
        context.close()
    return outcome


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            REPORT["browsers"].append(run_viewport(browser, "desktop", 1440, 900))
            REPORT["browsers"].append(run_viewport(browser, "mobile", 390, 844))
        finally:
            browser.close()
    REPORT["passed"] = all(item["passed"] for item in REPORT["browsers"])
    (OUT / "report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8")
    print("PASS" if REPORT["passed"] else "FAIL", "public read-only Playwright checks", flush=True)
    return 0 if REPORT["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
