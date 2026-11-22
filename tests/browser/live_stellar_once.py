#!/usr/bin/env python3
"""One idempotent synthetic signed-document path on the public TESTNET demo.

This intentionally creates exactly one fake contract, never loads real PII or
submits payment transactions. Repeated runs resume the same business reference.
"""
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.getenv("PUBLIC_URL", "https://signature.dyxersoft.com").rstrip("/")
REFERENCE = "QA-LIVE-STELLAR-20261122"
OUT = Path(os.getenv("PLAYWRIGHT_REPORT_DIR", "artifacts/browser"))
OUT.mkdir(parents=True, exist_ok=True)


def main():
    report = {"reference": REFERENCE, "scope": "one synthetic contract, no real PII", "stages": []}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        try:
            response = page.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
            assert response and response.status == 200, "Demo homepage not HTTP 200"
            page.locator(".stats-grid .stat-card").first.wait_for(timeout=30000)
            result = page.evaluate("""async (reference) => {
              const jwt = sessionStorage.getItem("dyxersignature.demo-token");
              if (!jwt) throw new Error("No demo JWT");
              async function request(method, path, data, contentType) {
                const headers = {Authorization: "Bearer " + jwt};
                if (contentType) headers["Content-Type"] = contentType;
                const res = await fetch("/api/v1" + path, {
                  method, headers, body: data
                });
                const body = res.status === 204 ? null : await res.json().catch(() => null);
                if (!res.ok) throw new Error(method + " " + path.replace(/[0-9a-f-]{36}/g, ":id") + " HTTP " + res.status + ": " +
                  (body?.title || body?.detail || "Unknown API error"));
                return body;
              }
              const initial = await request("GET", "/dashboard");
              const page = await request("GET", "/contracts?page=1&pageSize=100");
              let contract = page.items.find(item => item.businessReference === reference);
              const stages = [];
              if (!contract) {
                contract = await request("POST", "/contracts",
                  JSON.stringify({businessReference: reference, title: "QA de firma Stellar Testnet - datos ficticios"}),
                  "application/json");
                stages.push("Created one synthetic test contract");
              } else stages.push("Reused existing QA reference");
              let detail = await request("GET", "/contracts/" + contract.id);
              let version = detail.versions[0];
              if (!version) {
                const file = new Blob(["%PDF-1.4\\n% Synthetic QA document - no personal data\\n%%EOF\\n"],
                  {type:"application/pdf"});
                const form = new FormData();
                form.append("file", file, "qa-testnet.pdf");
                const uploaded = await request("POST", "/contracts/" + contract.id + "/versions", form);
                stages.push("Created version and stored synthetic PDF");
                if (uploaded.documentVersionId) version = {id:uploaded.documentVersionId, documentHash:uploaded.documentHash, status:"Draft"};
                else throw new Error("Missing document version ID after upload");
              }
              if (version.status === "Draft") {
                await request("POST", "/contracts/" + contract.id + "/versions/" + version.id + "/review",
                  JSON.stringify({documentHash:version.documentHash}), "application/json");
                stages.push("Reviewed immutable document SHA-256");
                version.status = "ClientAccepted";
              }
              if (version.status === "ClientAccepted") {
                await request("POST", "/contracts/" + contract.id + "/versions/" + version.id + "/sign",
                  JSON.stringify({documentHash:version.documentHash, signerName:"QA Synthetic Test", signerEmail:"qa@dyxer.local"}),
                  "application/json");
                stages.push("Recorded synthetic signature and enqueued Stellar anchor");
              }
              const signatures = await request("GET", "/contracts/" + contract.id + "/signatures");
              if (!Array.isArray(signatures.signers) || signatures.signers.length < 1)
                throw new Error("Signer not persisted after signature");
              const audit = await request("GET", "/contracts/" + contract.id + "/audit?page=1&pageSize=100");
              if (!Array.isArray(audit.items) || audit.items.length < 3)
                throw new Error("Audit timeline missing expected lifecycle events");
              stages.push("Checked signer and append-only audit");
              const later = await request("GET", "/dashboard");
              if (later.signatures.total < initial.signatures.total)
                throw new Error("Dashboard signer metrics went backwards");
              if (later.contracts.total < initial.contracts.total)
                throw new Error("Dashboard contract metrics went backwards");
              return {id:contract.id, versionId:version.id, stages,
                before:{contracts:initial.contracts.total,signatures:initial.signatures.total},
                after:{contracts:later.contracts.total,signatures:later.signatures.total}};
            }""", REFERENCE)
            report.update(result)
            report["stages"].append("Public API create/upload/review/sign/audit/dashboard checks passed")
            # Wait for at most 60 seconds: Testnet confirmation is asynchronous.
            deadline = time.monotonic() + 60
            anchor = {"status": "Pending"}
            while time.monotonic() < deadline:
                anchor = page.evaluate("""async ({contractId, versionId}) => {
                  const token = sessionStorage.getItem("dyxersignature.demo-token");
                  const response = await fetch("/api/v1/contracts/" + contractId, {
                    headers: {Authorization:"Bearer "+token}
                  });
                  if (!response.ok) throw new Error("Contract poll HTTP " + response.status);
                  const contract = await response.json();
                  const version = contract.versions.find(v => v.id === versionId);
                  return {status:version?.blockchain?.status ?? "Pending",
                    hasTxHash:Boolean(version?.blockchain?.transactionHash),
                    ledger:version?.blockchain?.ledgerNumber ?? null};
                }""", {"contractId": result["id"], "versionId": result["versionId"]})
                if anchor["status"] == "Confirmed":
                    break
                time.sleep(5)
            report["stellar"] = anchor
            if anchor["status"] == "Confirmed":
                verified = page.evaluate("""async ({contractId, versionId}) => {
                  const jwt = sessionStorage.getItem("dyxersignature.demo-token");
                  const response = await fetch("/api/v1/contracts/"+contractId+
                    "/versions/"+versionId+"/verify", {headers:{Authorization:"Bearer "+jwt}});
                  if (!response.ok) throw new Error("Verify HTTP " + response.status);
                  const data = await response.json();
                  return {verified:data.verified, contentMatches:data.contentMatches,
                    onchainVerified:data.blockchain.verified};
                }""", {"contractId": result["id"], "versionId": result["versionId"]})
                report["verification"] = verified
                if not (verified["verified"] and verified["contentMatches"] and verified["onchainVerified"]):
                    raise AssertionError("Stellar anchor found but independent verification failed")
                report["stages"].append("Confirmed hash + document integrity verified on Stellar Testnet")
                report["passed"] = True
            else:
                report["passed"] = False
                report["error"] = "Signed contract persisted but Stellar Testnet confirmation is pending after 60s"
        except Exception as exc:
            report["passed"] = False
            report["error"] = type(exc).__name__ + ": " + str(exc)[:400]
        finally:
            (OUT / "live-stellar-once.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False), flush=True)
            context.close()
            browser.close()
    return 0 if report.get("passed") else 1


if __name__ == "__main__":
    sys.exit(main())
