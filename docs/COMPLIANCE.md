# Regulatory context (Indonesia): what Amanta supports, and what it does not claim

> Amanta is a record-keeping and workflow tool. It does **not** certify compliance and does not replace BPOM, BPJPH or LSPro processes, or a qualified HACCP team. This summary is not legal advice. Each item below needs verification against the current official text (JDIH BPOM, BPJPH, BSN).

| Topic | Source (seen during research) | Confidence | How Amanta supports it |
|---|---|---|---|
| CPPOB (Good Manufacturing Practice for processed food). BPOM Regulation No. 22 of 2021 sets the procedure for issuing the CPPOB implementation permit. | hukumonline summary of Peraturan BPOM 22/2021 | **Medium.** The title is confirmed. Whether it has since been amended is not verified. | The `GMP_CPPOB` checklist category. The seed includes a sample daily hygiene and sanitation checklist, labelled as a template to adapt. Evidence and records are kept. |
| HACCP structure follows the Codex General Principles of Food Hygiene (CXC 1-1969), adopted in Indonesia as SNI CAC/RCP 1. | General knowledge | **Medium.** This needs verification of the current SNI edition. | Hazard analysis, CCP decision rationale, critical limits, monitoring, corrective action, verification and records in every control. Approvals are logged. |
| **Halal certification obligations.** Per a BPJPH news item on PP 40/2026: food and beverage from medium and large enterprises since 18 Oct 2024; micro and small enterprises extended to 17 Oct 2028; imported products 18 Oct 2028, subject to mutual recognition agreements. | BPJPH article on PP 40/2026 | **Medium.** This comes from a press item, not the regulation text. | Halal certificate tracking per supplier with expiry alerts. A `HALAL` hazard type. A halal-critical flag on ingredients, which blocks lot release unless the supplier has a valid halal certificate. A `HALAL` checklist category. |
| Product registration (BPOM MD/ML, SPP-IRT) | General knowledge | **High** for the existence of these schemes. | Registration number field on products. Certificate types `BPOM` and `SPP_IRT`. |
| Personal data protection: UU No. 27/2022 (UU PDP) | General knowledge | **Medium.** Implementing regulations need verification. | Minimal personal data (name and email of staff). Data stays per tenant. The AI provider can be chosen, including self-hosted. Document content is sent to the configured AI provider, so a data processing agreement with that provider is required. |

## Responsibilities that stay with the manufacturer

* Validate every AI-drafted hazard, critical limit and frequency against the actual process and scientific evidence.
* Keep checklist templates aligned with the current BPOM and BPJPH requirements and with customer or retailer standards.
* Keep retention periods for records, as required by the regulator and customers. Amanta does not delete records automatically.
* If customer or auditor PII is uploaded in documents, handle it according to UU PDP.

## Sources consulted

- [Peraturan BPOM Nomor 22 Tahun 2021 (hukumonline)](https://www.hukumonline.com/pusatdata/detail/lt61710a5f3a072/peraturan-badan-pengawas-obat-dan-makanan-nomor-22-tahun-2021/analysis/)
- [BPJPH: Penyesuaian penahapan kewajiban sertifikasi halal (PP 40/2026)](https://bpjph.halal.go.id/read/penyesuaian-penahapan-kewajiban-sertifikasi-halal-diatur-dalam-pp-40-tahun-2026-begini-rinciannya)
