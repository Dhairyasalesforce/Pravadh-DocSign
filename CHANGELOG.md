# Changelog

Package: **Pravadh DocSign** (2GP managed, namespace `prvd`, package Id `0HodN0000000W1VSAU`).

Install links use `https://login.salesforce.com/packaging/installPackage.apexp?p0=<04t id>` (production / Developer Edition) or `https://test.salesforce.com/...` (sandbox). Beta versions install only in sandboxes, scratch orgs and Developer Edition orgs, and cannot be upgraded.

| Version | Package version Id | Status |
|---|---|---|
| 1.0.0-1 | `04tdN000000StZRQA0` | **Released** (current) |
| 0.11.0-1 | `04tdN000000SNo5QAG` | Beta |
| 0.10.0-1 | `04tdN000000SKrpQAG` | Beta |
| 0.9.0-1 | `04tdN000000SKevQAG` | Beta |
| 0.8.0-1 | `04tdN000000SKBtQAO` | Beta |
| 0.7.0-1 | `04tdN000000SK8fQAG` | Beta |
| 0.6.0-1 | `04tdN000000SK73QAG` | Beta |
| 0.5.0-1 | `04tdN000000SJyzQAG` | Beta |
| 0.4.0-1 | `04tdN000000SJvlQAG` | Beta |
| 0.3.0-1 | `04tdN000000SI8TQAW` | Beta |
| 0.2.0-1 | `04tdN000000SI5FQAW` | Beta |
| 0.1.0-2 | `04tdN000000SHvZQAW` | Released (first release) |
| 0.1.0-1 | `04tdN000000SHtxQAG` | Beta |

## Unreleased (1.1.0)

* **Open source.** Pravadh DocSign is now published under the Apache 2.0 licence, with the package source, the template-editor and PDF-engine sources, the website and the security-review evidence in one repository.
* **Install notice.** A post-install script (`DocSignInstallHandler`) emails the installer's contact details and the org's company details to inquire@pravadhlabs.com on each managed-package install or upgrade. Disclosed in the README and the install guide; source deploys don't send it.
* Visual editor: Date/Time fields now default to the `datetime` filter (the `date` filter dropped the time), percent fields to `percent`, checkboxes to `yesno`, and text fields offer Title Case.

## 1.0.0 (released)

* **Visual template editor.** A Visual / HTML switch on the template body. Visual mode is a page editor built on Tiptap: field picker driven by your org's schema (parents up to five levels, related lists), repeating table rows, repeat and *Show if…* blocks, signer fields for signers 1–6, a `/` insert menu, a properties panel, and a PDF check for layout the Salesforce renderer can't draw. It saves the standard template syntax, so templates keep working with the merge engine and Flow.
* Hand-written templates open in HTML and can be converted after a confirmation. Templates with nested loops, `{{else}}` inside a loop, or loops that aren't one whole table row stay in HTML.
* New components: `DocSignTemplateEditor` static resource, `DocSignTemplateEditor` Visualforce page and controller, `docSignTemplateEditor` LWC; both permission sets updated.

## 0.11.0 (beta)

* Checkmarx hardening: settings save in user mode, Lightning Data Service for template activate / delete / Word upload, `with sharing` page controllers and file service, user-mode `resumePending`.
* Build submitted for the AppExchange security review (29 Sep 2026). Code Analyzer `AppExchange` selector: 28 moderate findings, all documented false positives; `Recommended:Security`: 0 violations. Evidence in [docs/security-review](docs/security-review).

## 0.6.0 – 0.10.0 (beta)

* Beta builds between the uploaded-PDF work and the security-review build. 0.10.0 includes a signing page fix.

## 0.5.0 (beta)

* Uploaded PDFs: fixed a signer going missing when two signature lines shared a line; named signing lines ("Name ____ Date ____", "For Company ____"); fill hints with two suggestions per blank; editor nudges; app-wide tips; Re-detect.

## 0.4.0 (beta)

* Uploaded PDFs up to 100 pages with a progress bar and REST download for large files; draft autosave and resume; file-URL images in all server PDFs (fixes blank signatures and page images); retry for pending finalisation.

## 0.3.0 (beta)

* Removed Visualforce remoting from the Prepare editor (fixes "Could not connect to Salesforce").

## 0.2.0 (beta)

* First beta after the 0.1.0 release.

## 0.1.0 (released)

* First release of Pravadh DocSign: document generation and eSignature on any object.
