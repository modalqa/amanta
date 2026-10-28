# Reference research: IONI (public information only)

**Scope.** This research used only publicly accessible marketing pages. IONI's private product (behind login), its source code, APIs and backend systems were **not** accessed and are not described here. No IONI code, text, branding or images were reused in Amanta.

## Method and blockers

| Step | Result |
|---|---|
| REA 6.8.0 (`rea-agents`) installed. Web commands available: `capture-browser-scenario`, `analyze-web-bundle`, `inspect-web-page`, `capture-web-screenshot`. | The CLI ran in the sandbox. |
| REA capture of `https://ioni.ai/` | **Blocked.** The sandbox egress proxy returned `403` (connect rejected) for `ioni.ai` from both the cloud workspace and the linked desktop VM. As a result, REA produced no evidence about IONI. |
| Fallback: a server-side web fetch of the public pages `/`, `/haccp-builder` and `/food-safety-software` | Done. The findings are summarized below. |

To repeat the REA analysis, allow `ioni.ai` in the egress settings. Use only REA's passive commands (`inspect-web-page`, `analyze-web-bundle`) on public pages, and follow REA's disclaimer and the site's terms.

## Observed public claims (unverified vendor marketing)

All of the following comes from the vendor's own pages and has not been independently verified.

* **Onboarding flow:** upload documents (Word, PDF or Excel), or answer questions about products, ingredients and operations. AI then maps products, ingredients, process steps, hazards and CCPs.
* **HACCP builder:** biological, chemical and physical hazards mapped to ingredients and process steps. CCPs with monitoring parameters and procedures. SOPs and flowcharts generated, then "review, adjust, download" as a PDF.
  - The pages contradict each other on what happens when a process changes: "regenerate automatically" in one place, "flag for review" in another.
* **Operator floor:**
  - Shift-specific checklists on a tablet or phone.
  - PIN login.
  - Timestamped entries.
  - Missed or failed steps flagged in real time to QA.
* **CAPA:** an AI-drafted corrective action with root cause when a deviation is logged.
* **Suppliers:**
  - Certificates and COAs in one place, with expiry alerts.
  - AI check of COAs against specifications (add-on).
* **Traceability:**
  - Batches and lots, traced forward and backward.
  - QuickBooks/Xero sync as an add-on.
  - Described as "not an ERP".
* **Audit:** a "one-click" audit package and gap analysis against standards (SQF, BRCGS, FSMA, CFIA, FSSC 22000).
* **Security status (self-reported):** GDPR completed; SOC 2 Type II and ISO 27001 "in progress".

## How Amanta differs (original design decisions)

* **Mandatory human approval.** No AI output becomes active without approval, and CCPs need critical limits before they can be approved. The public pages do not describe how IONI reviews AI output.
* **Indonesian regulatory context:**
  - Halal-critical points as a hazard type.
  - Halal certificate gating when releasing lots.
  - BPOM, SPP-IRT, SNI and NIB certificate types.
  - CPPOB checklist category.
  - Time zones (WIB/WITA/WIT).
  - Indonesian interface first.
* **Segregation of duties** in CAPA verification, and a hash-chained audit trail.
* **Open integration** through a scoped REST API, and a choice of AI provider including local models, for data residency.
* **Not built:** PIN or kiosk login, ERP sync, COA-vs-spec AI checking, regulatory change tracking and gap analysis. These are candidates for the roadmap.
