# VoltAfrica Group — Corporate Structure (Draft for Counsel)

**Prepared:** 7 July 2026
**Status:** Draft for counsel review before CAC registration.
**Related documents:** `LEGAL_REVIEW_PACKET.md` §2, `INTERCOMPANY_MSA.md`, and the four Orkora legal drafts in `LEGAL/`.

This document walks a corporate lawyer through the proposed VoltAfrica group structure. It is a companion to the Orkora legal-review binder and should be read alongside it. Nothing here is filed yet; every registration below is a decision counsel is being asked to validate before we go to the Corporate Affairs Commission.

## 1. Structure at a glance

```
                     +------------------------------------------+
                     |     VoltAfrica Technologies Ltd          |
                     |     (Nigerian limited holding company)   |
                     |     100% owner of every subsidiary       |
                     +------------------------------------------+
                                        |
        +---------------+---------------+---------------+---------------+
        |               |               |               |               |
+---------------+ +---------------+ +---------------+ +---------------+ +---------------+
| VoltAfrica    | | Orkora        | | GlowMall      | | Assemble      | | KapexFlow     |
| Mobility      | | Technologies  | | (planned)     | | Tech          | | (planned)     |
| (existing)    | | Ltd           | | commerce      | | (planned)     | | workflow SaaS |
| electric      | | (planned)     | | brand         | | SaaS          | | trade name    |
| mobility      | | events        | | subsidiary    | | trade name    | | of parent     |
| current legal | | platform      | | OR trade name | | of parent     |               |
| form: TBD by  | | subsidiary    | | (counsel to   |               |               |
| counsel       |               | | decide)       |               |               |
+---------------+ +---------------+ +---------------+ +---------------+ +---------------+
        |               |               |               |               |
        v               v               v               v               v
 electric mobility  event mgmt      commerce         SaaS product    workflow SaaS
 products           SaaS + payments SaaS + payments  (no direct     (no direct
                                                     money handling) money handling)
```

The visual diagram of the same structure is at `outputs/VoltAfrica_Group_Structure.svg` and the printable PDF is at `outputs/VoltAfrica_Group_Structure.pdf`.

## 2. Ownership

- **VoltAfrica Technologies Ltd** is the parent holding company. Registered in Nigeria. Owns 100% of every subsidiary listed below. Does not itself run any customer-facing product.
- **VoltAfrica Mobility** is the existing operating brand. Counsel to confirm whether it is currently registered as a distinct legal entity or as a division; if a distinct entity, it novates into the group either by share transfer to VoltAfrica Technologies Ltd (making it a subsidiary) or by name amendment.
- **Orkora Technologies Ltd** is a new subsidiary being formed to operate the Orkora event platform. Counsel is asked to confirm this is the preferred form (subsidiary) versus keeping Orkora as a business unit of the parent until scale justifies formalisation.
- **GlowMall, Assemble Tech, KapexFlow** are planned brands. GlowMall likely warrants a subsidiary because it handles money; Assemble Tech and KapexFlow start as trade names of the parent and can graduate to subsidiaries later.

## 3. Why a holding structure

Three reasons drive the choice, in order of weight:

1. **Liability isolation.** Money-touching products (Orkora, GlowMall) each contract with customers, banks, and payment processors. Isolating them into separate limited companies prevents a claim against one product from crossing into the balance sheet of another product or into the parent.
2. **Optional sale, spin-off, or partnering per brand.** A wholly-owned subsidiary is easier to sell, joint-venture, or bring in a minority investor into than a business unit division. VoltAfrica Mobility joining Orkora Technologies Ltd under a shared parent gives you flexibility to raise brand-specific capital.
3. **Group-level brand and shared services.** The parent owns the "VoltAfrica" mark, common IT and finance functions, and holds group-wide contracts (insurance, banking) that individual subsidiaries benefit from. Documented in `INTERCOMPANY_MSA.md`.

The countervailing costs (per-subsidiary CAC annual filings, separate tax returns, transfer-pricing documentation) are acceptable at the scale we are targeting.

## 4. IP arrangement

Counsel is asked to confirm the recommended pattern:

- **Group IP holding**: all product IP (source code, brand marks, domain names, trademarks) is assigned by the operating subsidiary to VoltAfrica Technologies Ltd at incorporation.
- **Licence-back**: the parent licenses the IP back to each subsidiary on a royalty-free perpetual basis for as long as the subsidiary remains wholly-owned. If the subsidiary is sold or partly divested, the licence converts to arm's-length terms.
- **Alternative pattern**: each subsidiary owns its own IP, with the parent holding a group licence for corporate use only.

Recommendation: **Group IP holding + royalty-free licence-back**. Cleanest for future M&A, matches how counsel usually structures Nigerian tech groups.

## 5. Inter-company services

VoltAfrica Technologies Ltd (as service provider) charges each operating subsidiary (as service recipient) for:

- **Group finance**: bookkeeping, group audit, tax filings, treasury.
- **Group HR**: employment contracts, payroll, benefits, occupational health.
- **Group legal**: corporate secretarial, contract review, IP administration.
- **Group IT**: shared infrastructure, security posture, incident response.
- **Group brand**: master brand mark, product brand governance, design system.

Costs are allocated pro-rata to each subsidiary's revenue with an arm's-length margin per FIRS Transfer Pricing Regulations 2018. The service terms live in the Intercompany Master Services Agreement at `INTERCOMPANY_MSA.md`.

## 6. Founders and boards

Counsel to confirm:

1. Founder shareholding structure at VoltAfrica Technologies Ltd (parent). Recommendation: founders hold all founder shares directly at the parent; every subsidiary is 100% owned by the parent so founder equity does not fragment across brands.
2. Board composition. Recommendation: parent has founders plus one independent director (post-launch). Each subsidiary board consists of the parent's authorised representative (typically the CEO), reducing board management overhead.
3. Company secretary. A single company secretarial function serves the whole group.

## 7. Registration sequence

Recommended order at the CAC:

1. **VoltAfrica Technologies Ltd** (parent). Standard limited-company incorporation.
2. **Orkora Technologies Ltd** (subsidiary). Incorporate with VoltAfrica Technologies Ltd as the sole shareholder.
3. **GlowMall Ltd** (subsidiary), if the money-touching decision is confirmed. Otherwise register `GlowMall` as a business name of the parent.
4. **Assemble Tech** and **KapexFlow** as business names of the parent.
5. **VoltAfrica Mobility** novation: transfer shares to the parent OR file a name-change/parent-child registration depending on current form.
6. IP assignments from any pre-existing operating entities (founders, Orkora working draft, etc.) to the appropriate group entity per §4.
7. Intercompany MSAs per `INTERCOMPANY_MSA.md`.

Anticipated CAC cost, all-in: **₦500,000-800,000** in CAC fees, stamp duty, and standard professional fees for a five-entity group. Ongoing annual filings: **~₦150,000/year** for the group.

## 8. What counsel is being asked to decide

1. Confirm the structure is workable (yes/no; if no, propose alternative).
2. Confirm whether Orkora, GlowMall each go direct-subsidiary or business-unit-first.
3. Confirm the IP holding pattern (§4).
4. Draft the parent-subsidiary shareholder agreement templates.
5. Draft the IP assignment templates.
6. Review the Intercompany MSA template (see `INTERCOMPANY_MSA.md`) and flag any FIRS transfer-pricing risks.
7. Advise on trademark clearance in the target markets before we file any brand names.
8. Advise on any competition-law notifications required (unlikely at our scale, but worth confirming).

## 9. Trademark clearance — parallel workstream

Independent of the CAC filings, we need trademark clearance searches on all five brand names before the CAC accepts them:

| Brand | Clearance risk | Recommended action |
|---|---|---|
| VoltAfrica | Moderate. "Volt" is common in electricity brands globally. | Full clearance search in NG + EU + US Class 9, 35, 42. |
| VoltAfrica Mobility | Low if VoltAfrica is cleared and "Mobility" is descriptive. | Rides on the VoltAfrica clearance. |
| Orkora | Low. Distinctive coinage. | NG + EU + US Class 9, 35, 42. |
| GlowMall | Moderate. "Glow" is common in beauty; "Mall" is descriptive. | NG + EU + US Class 35, 42 (retail). |
| Assemble Tech | **High**. "Assemble" is generic and heavily used. | Clearance before committing. Alternate name if refused. |
| KapexFlow | Low. Distinctive coinage. | NG + EU + US Class 9, 42. |

Budget for clearance across the five names: **US$2,000-4,000** through a Nigerian IP firm coordinating international searches.

## 10. Open questions for the counsel meeting

1. Timing: can the Orkora live-customer contract be signed against Orkora Technologies Ltd if that entity is at "registration in progress" status? Or does the customer need to see completed CAC docs?
2. Which entity signs the first customer contract if Orkora Technologies Ltd is not yet registered? Options: (a) hold the customer, (b) sign under a pre-incorporation contract that assigns to Orkora Technologies Ltd on completion.
3. VAT registration timing per subsidiary. Which subsidiaries need FIRS VAT registration at incorporation vs. only once turnover threshold is met?
4. NDPR / NDPA 2023 registration: does each subsidiary register separately with the Nigeria Data Protection Commission, or does the parent register and cover all subsidiaries?
