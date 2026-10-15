<p align="center">
  <img src="brand/pravadh-docsign-wordmark.png" alt="Pravadh DocSign" width="360">
</p>

<h3 align="center">Document generation and eSignature, built natively for Salesforce.</h3>

<p align="center">
  <b>Any Object. Any Document. Any Signature.</b><br>
  Generate · Sign · Store · Automate
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence: Apache 2.0" src="https://img.shields.io/badge/licence-Apache%202.0-2563eb"></a>
  <a href="#install"><img alt="Release 1.0.0" src="https://img.shields.io/badge/release-1.0.0-0f9d6b"></a>
  <img alt="Salesforce API 67.0" src="https://img.shields.io/badge/Salesforce%20API-67.0-00a1e0">
  <a href="https://www.youtube.com/@PravadhLabs"><img alt="YouTube @PravadhLabs" src="https://img.shields.io/badge/YouTube-%40PravadhLabs-ff0000"></a>
</p>

---

Pravadh DocSign turns any Salesforce record into a document, sends it for signature, and files the signed copy back on the record. Everything runs inside your org: no external signing service, no data leaving Salesforce, no per-user licence for the people who sign.

It started as a free AppExchange package. It is now **fully open source under the Apache 2.0 licence**, so you can install it, read every line, change it, and contribute back.

Built by [Pravadh Labs](https://pravadhlabs.com).

## Watch it

[![Pravadh DocSign walkthrough](https://img.youtube.com/vi/dTtUZdvBDKw/hqdefault.jpg)](https://youtu.be/dTtUZdvBDKw)

▶ **[Watch the Pravadh DocSign video](https://youtu.be/dTtUZdvBDKw)** · Subscribe to **[@PravadhLabs on YouTube](https://www.youtube.com/@PravadhLabs)** for demos, release walkthroughs and Salesforce architecture videos.

## What it does

| | |
|---|---|
| **Generate** | Templates on any standard or custom object. Merge fields with parent fields up to five levels, related-list tables, conditions, images, currency/date/number formatting. Output HTML → PDF (Salesforce's own renderer) or Word → Word. |
| **Visual template editor** (new in 1.0) | Build templates on an A4 page without writing HTML: pick fields from your org, add repeating rows and *Show if…* sections, place signer fields, and see PDF-readiness checks as you go. Switch to HTML at any time. |
| **Sign** | Send to one or many signers, in order or in parallel. Signers open a secure link on your Salesforce Site; they need no Salesforce licence. Optional access codes, expiry, reminders, decline with reason. |
| **Any PDF** | Upload an existing PDF, let DocSign detect the blanks, checkboxes and signature lines, assign each field to a signer, and send. Drafts autosave and resume. |
| **Store** | The signed PDF and a Certificate of Completion are saved to Salesforce Files on the source record. Optionally update a field on the record when signing completes. |
| **Prove** | Every event goes into an immutable audit trail with a SHA-256 hash chain, re-verified each time the document is viewed and printed on the certificate. |
| **Automate** | Flow actions: Generate Document, Send for Signature, Get Signature Status, Resend Envelope, Cancel Envelope. Platform events for follow-up processing. |
| **Agentforce-ready** | Agent actions (find templates, check missing data, signature summary, generate, send) that run as the user with sharing, CRUD and FLS. Built only on GA platform features. |

No external callouts and no CDN scripts. Your documents and records never leave your org. See [docs/security-review](docs/security-review) for the full security-review evidence.

<a id="install"></a>
## Install

There are two ways to run Pravadh DocSign. Pick one per org.

### Option A: Managed package (recommended for most orgs)

Upgradeable, namespaced (`prvd`), installs in about a minute.

| Version | Status | Production / Developer Edition | Sandbox |
|---|---|---|---|
| **1.0.0** (`04tdN000000StZRQA0`) | **Current release** | [Install](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tdN000000StZRQA0) | [Install](https://test.salesforce.com/packaging/installPackage.apexp?p0=04tdN000000StZRQA0) |
| 0.1.0 (`04tdN000000SHvZQAW`) | Previous release | [Install](https://login.salesforce.com/packaging/installPackage.apexp?p0=04tdN000000SHvZQAW) | [Install](https://test.salesforce.com/packaging/installPackage.apexp?p0=04tdN000000SHvZQAW) |

> **Install notice.** From version 1.1.0, when the managed package is installed or upgraded it sends one email to Pravadh Labs (inquire@pravadhlabs.com) with the installing user's name, email, phone, title, company and address, and the org's name, Id, edition and address. We use it only to offer onboarding and support, and Pravadh Labs receives nothing else from your org. Source deploys (Option B) send nothing. Details: [docs/INSTALL.md](docs/INSTALL.md#install-notice).

Or with the Salesforce CLI:

```bash
sf package install --package 04tdN000000StZRQA0 --target-org <your-org-alias> --wait 20 --security-type AdminsOnly
```

**Beta builds** (0.2.0 to 0.11.0) are listed in [CHANGELOG.md](CHANGELOG.md). Salesforce only lets beta package versions install in sandboxes, scratch orgs and Developer Edition orgs, and they cannot be upgraded. Use them only to test a specific build.

### Option B: Deploy the source (unmanaged)

For teams that want to customise the code. Nothing is namespaced in your org, and you own the upgrades.

```bash
git clone https://github.com/Dhairyasalesforce/Pravadh-DocSign.git
cd Pravadh-DocSign
sf org login web --alias my-org
sf project deploy start --source-dir pravadh-docsign --target-org my-org --test-level RunLocalTests
```

Do not deploy the source into an org that already has the managed package installed.

### After installing (both options)

1. Assign the **Pravadh DocSign Admin** permission set to admins and **Pravadh DocSign User** to users.
2. Open the **Pravadh DocSign** app and add the **Pravadh DocSign** component to the record pages you want (Lightning App Builder).
3. To let people outside Salesforce sign: Setup → Sites → create a site, add the `DocSignSign` and `DocSignPageImage` Visualforce pages, assign the **Pravadh DocSign Signing Guest** permission set to the site guest user, and paste the site URL in **DocSign → Settings**.
4. Optional: choose an org-wide email address, and turn on the hourly maintenance job for expiry and reminders.

Full steps, including scratch-org setup for contributors: **[docs/INSTALL.md](docs/INSTALL.md)**.

## Template syntax at a glance

```html
<h1>Quotation for {{Account.Name}}</h1>
<p>Valid until {{CloseDate | date:"d MMM yyyy"}} · Total {{Amount | currency}}</p>

<table>
  {{#each OpportunityLineItems orderBy="SortOrder"}}<tr><td>{{$index}}</td><td>{{Product2.Name}}</td><td>{{TotalPrice | currency}}</td></tr>{{/each}}
</table>

{{#if Payment_Terms__c == "Net 30"}}<p>Payable within 30 days.</p>{{else}}<p>Payable on receipt.</p>{{/if}}

{{sign:signature:1}} {{sign:date:1}}     {{sign:signature:2}} {{sign:date:2}}
```

Everything above can also be built in the visual editor. Full reference: **[docs/TEMPLATE-SYNTAX.md](docs/TEMPLATE-SYNTAX.md)**.

## Repository layout

| Path | What it is |
|---|---|
| [`pravadh-docsign/`](pravadh-docsign) | The Salesforce package source: Apex, LWC, Visualforce, objects, permission sets |
| [`template-editor/`](template-editor) | Source of the visual template editor (Tiptap), built into the `DocSignTemplateEditor` static resource |
| [`pdf-engine/`](pdf-engine) | Source of the PDF preparation editor and field detection (PDF.js), built into `DocSignPdfEngine` |
| [`website/`](website) | Source of [pravadhdocsign.pravadhlabs.com](https://pravadhdocsign.pravadhlabs.com) (Next.js) |
| [`docs/`](docs) | Install guide, template syntax, architecture, security-review evidence |
| [`brand/`](brand) | Logos and icons (see [TRADEMARKS.md](TRADEMARKS.md)) |

Architecture overview: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** and the full [Solution Architecture and Usage guide (PDF)](docs/Pravadh-DocSign-Solution-Architecture-and-Usage.pdf).

## Contributing

Issues and pull requests are welcome. Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for the scratch-org setup, coding rules (user mode, no callouts, PDF-safe CSS) and how releases are cut. Please report security issues privately as described in **[SECURITY.md](SECURITY.md)**.

## About Pravadh Labs

[**Pravadh Labs**](https://pravadhlabs.com) is a founder-led product studio building inside the Salesforce ecosystem. One control plane, every product plugs in:

| Product | What it does |
|---|---|
| [**PravadhIQ**](https://pravadhiq.pravadhlabs.com) | Salesforce deployment, data migration and governance on one timeline, with a full audit trail |
| [**Pravadh GovernX**](https://pravadhgx.pravadhlabs.com) | Extract, clean and govern data across CRM, ERP and finance platforms, with the EMIE co-pilot on a visual pipeline canvas |
| [**Pravadh PM**](https://pravadhpm.pravadhlabs.com) | White-label project management: Jira-grade issues, ClickUp-grade views, your brand or your servers |
| [**Pravadh SI**](https://pravadhsi.pravadhlabs.com) | Multichannel outreach and AI sales intelligence with CRM write-back |
| [**Pravadh DocSign**](https://pravadhdocsign.pravadhlabs.com) | This project: open-source document generation and eSignature for Salesforce |

Pravadh Labs was founded by **[Dhairya Shah](https://www.linkedin.com/in/dhairyasf)**, a Salesforce architect with 11+ years in solution and enterprise architecture, Certified Agentforce Specialist and Agentblazer Legend.

Need help rolling DocSign out, building templates, or Salesforce architecture work beyond the product? Pravadh Labs offers implementation and support services.

* Website: [pravadhlabs.com](https://pravadhlabs.com)
* Email: inquire@pravadhlabs.com
* Book a call: [calendly.com/partners-pravadhlabs](https://calendly.com/partners-pravadhlabs)
* YouTube: [@PravadhLabs](https://www.youtube.com/@PravadhLabs)
* LinkedIn: [Pravadh Labs](https://www.linkedin.com/company/pravadhiq) · [Dhairya Shah](https://www.linkedin.com/in/dhairyasf)
* Instagram: [@pravadhlabs](https://www.instagram.com/pravadhlabs/)

If DocSign saves you a DocuSign bill, a ⭐ on this repository helps other Salesforce teams find it.

## Licence

Copyright 2026 Pravadh Labs Private Limited. Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE) for third-party components and [TRADEMARKS.md](TRADEMARKS.md) for use of the Pravadh names and logos.

Salesforce, Agentforce and AppExchange are trademarks of Salesforce, Inc. Pravadh DocSign is not affiliated with or endorsed by Salesforce. DocuSign is a trademark of Docusign, Inc.
