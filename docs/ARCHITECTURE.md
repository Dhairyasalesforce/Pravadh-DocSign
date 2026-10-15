# Architecture

Package directory: `pravadh-docsign/` (2GP managed package "Pravadh DocSign", namespace `prvd`; also deployable unmanaged).


```
Salesforce Record ──► Template (any object) ──► Merge Engine ──► Render (HTML→PDF | DOCX)
                                                        │
                                   DocSign_Document__c + Salesforce Files (linked to record)
                                                        │
                            Send ──► DocSign_Envelope__c ─┬─ DocSign_Recipient__c (routing order)
                                                          ├─ DocSign_Field__c (signature/initial/date/name/email/text/checkbox)
                                                          └─ DocSign_Audit_Event__c (immutable, SHA-256 hash chain)
                                                        │
      Signer (no license) ──► Salesforce Site ──► DocSignSign.page (token + optional access code)
                                                        │
                    DocSign_Envelope_Event__e ──► DocSignEventJob (next signer / finalize / decline notice)
                                                        │
             Signed PDF + Certificate of Completion ──► Files on source record ──► optional field update ──► Flow
```

| Layer | Classes |
|---|---|
| Schema discovery (no hardcoded objects) | `DocSignSchemaService` |
| Merge engine | `DocSignMergeEngine`, `DocSignFormatter` |
| Rendering | `DocSignRenderService` (HTML→PDF via `Blob.toPdf`), `DocSignDocxRenderer` (Compression API) |
| Generation & Files | `DocSignGenerationService`, `DocSignFileService` |
| Envelopes & routing | `DocSignEnvelopeService`, `DocSignRoutingService`, `DocSignLifecycle` |
| External signing | `DocSignSigningService`, `DocSignSigningController`, `DocSignSign.page`, `DocSignPageImage.page`, `DocSignTokenService` |
| Audit | `DocSignAuditService`, `DocSignAuditGuard` (+ triggers) |
| Completion | `DocSignCompletionService`, `DocSignCertificateBuilder` |
| Async / jobs | `DocSignEvents`, `DocSignEventHandler`, `DocSignEventJob`, `DocSignMaintenanceJob` |
| Flow actions | Generate Document, Send for Signature, Get Signature Status, Cancel Envelope, Resend Envelope |
| UI (LWC) | `docSignHome`, `docSignTemplateManager`, `docSignTemplateEditor`, `docSignRecordPanel`, `docSignSendDialog`, `docSignWorkspace`, `docSignSettings`, `docSignPdfPrep`, `docSignTips` |
| AI extension point | `DocSignIntelligence.Provider` |

## Template syntax (summary)

Full reference: [TEMPLATE-SYNTAX.md](TEMPLATE-SYNTAX.md).

| Purpose | Syntax |
|---|---|
| Field | `{{Name}}` · `{{Opportunity.Amount}}` (root prefix optional) |
| Parent fields (up to 5 levels) | `{{Account.Owner.Email}}` |
| Formatting | `{{Amount \| currency}}` `{{CloseDate \| date:"d MMM yyyy"}}` `{{Discount__c \| number:2}}` `{{Name \| upper}}` `{{Phone \| default:"—"}}` |
| Child records (repeating rows) | `{{#each OpportunityLineItems orderBy="SortOrder" limit="200"}}<tr><td>{{$index}}</td><td>{{Product2.Name}}</td></tr>{{else}}…{{/each}}` |
| Conditions | `{{#if Payment_Terms__c == "Net 30"}}…{{else}}…{{/if}}` — `== != > < >= <= contains startsWith`, `and`/`or`, `not` |
| Built-ins | `{{$Today}}` `{{$Now}}` `{{$User.Name}}` `{{$Org.Name}}` `{{$root.Name}}` `{{$PageNumber}}` `{{$PageCount}}` |
| Images | `{{image:<ContentVersionId or ContentDocumentId> width="140"}}` |
| Signature fields | `{{sign:signature:1}}` `{{sign:initial:1}}` `{{sign:date:1}}` `{{sign:name:1}}` `{{sign:email:1}}` `{{sign:text:2:Company}}` `{{sign:checkbox:2:I agree:optional}}` |

The number after the type is the signer role (1, 2, 3…). If a document has no signature tags, a signature block is added automatically for each signer.

## Setup (per org)

Full steps: [INSTALL.md](INSTALL.md).

1. Assign **Pravadh DocSign Admin** (admins) / **Pravadh DocSign User** (users).
2. Add the **Pravadh DocSign** component to any record page (Lightning App Builder).
3. External signers: Setup → Sites → create a site, add the `DocSignSign` and `DocSignPageImage` Visualforce pages, assign **Pravadh DocSign Signing Guest** to the site guest user, paste the site URL in DocSign → Settings.
4. Optional: pick an Org-Wide Email Address, turn on the hourly maintenance job (expiry + reminders).
5. Optional: Setup → Platform Events → DocSign Envelope Event → subscriber config, to run follow-up processing as a named integration user (default is Automated Process).

## Security design

* CRUD/FLS: all user-facing reads/writes use `WITH USER_MODE` / `AccessLevel.USER_MODE`; merge paths are checked for accessibility per hop.
* `without sharing` classes and why:
  * `DocSignSigningService`, `DocSignSigningController`: external signers are Site guests; they are authorized by a 256-bit single-use token (SHA-256 hash stored; raw token only emailed), optional salted access code with lockout, routing and expiry checks on every call.
  * `DocSignAuditService`, `DocSignRoutingService`, `DocSignLifecycle`, `DocSignCompletionService`, `DocSignEventHandler`, `DocSignEventJob`, `DocSignCertificateBuilder`, `DocSignEvents`, `DocSignReminderSender`, `DocSignMaintenanceJob`: system processes invoked only after the user/signer/job has been authorized.
* Custom setting DML (`DocSignHomeController.saveSettings`) is gated by the `Pravadh_DocSign_Admin` custom permission.
* Output encoding: every merged value is XML/HTML-escaped (`raw` filter is opt-in for admin-authored rich text). Signing page renders the document in a script-less sandboxed iframe. Preview HTML is sanitized.
* Signature images: only PNG/JPEG base64 data URIs are accepted and embedded.
* Audit trail: insert only via service, update/delete blocked by trigger, SHA-256 hash chain verified on the workspace and printed on the Certificate of Completion. Sent envelopes cannot be deleted.
* No hardcoded IDs, credentials, org IDs, object or field names in product logic.

## Uploaded PDFs (any PDF → eSignature)

1. On any record: **Pravadh DocSign → Upload a PDF for signature** (stored in Salesforce Files on the record).
2. The **Prepare** editor (`DocSignPdfPrep` Visualforce page, PDF.js in the user's browser) renders each page and detects
   blank lines (`____`), checkboxes and existing PDF form fields, reads the label next to each blank or the table column header,
   groups signature blocks (Signature + Date/Name/Email/Title/Address under the same heading) into signers, names signers
   from headings (e.g. "DHAIRYA SHAH"), and suggests values for fields you fill now from the record, your user and today's date.
3. Adjust fields with drag/resize, assign them to "You (fill now)" or a signer, then **Save & continue** → Send dialog.
4. Signers see the page images with fields on top (no PDF parsing on the public site). The final signed PDF is rebuilt natively
   from the page images with values and signatures stamped at their positions; the original upload is kept unchanged and its
   hash is printed on the Certificate of Completion.

**Save & resume:** while an uploaded PDF is a Draft, the editor autosaves fields, values and signers every few seconds (and on Close / tab hidden). Resume from the record panel ("Continue preparing" banner or the Prepare button), from DocSign Home ("Continue where you left off"), or from the DocSign Document record ("Continue preparing"). Page images are re-rendered from the stored PDF on resume.

Limits: 50 MB, 100 pages, 600 fields, no password-protected PDFs. Scanned PDFs have no text layer; place fields manually.

## AI & Agentforce (GA platform features only)

* **Agent actions** (global invocables, planner-friendly descriptions): Find Document Templates, Check Missing Document Data,
  Get Signature Summary, plus Generate Document, Send for Signature, Get Signature Status, Resend/Cancel Envelope.
  Add them to any Agentforce agent (Agent Builder → topic → New Action → Apex). They run as the user (sharing, CRUD, FLS),
  whichever model the agent uses (including Claude via Agentforce).
* **Runtime detection** (no package dependency): Settings shows agents found and whether the Models API is enabled.
* **Provider plug-in**: `DocSignIntelligence.Provider` (global, single `handle(Request)` method) registered via
  `DocSign_AI_Provider__mdt`. The planned "Pravadh DocSign for Agentforce" add-on package implements it with Prompt Builder /
  Models API; the built-in heuristic provider is the fallback.

## Formats

* **HTML → PDF** (native Salesforce PDF renderer): full eSignature support.
* **DOCX → DOCX** (Apex Compression API): merge fields, loops in table rows, conditions. Generate-only.
* PDF-overlay templates and DOCX→PDF conversion are extension points (`DocSignRenderService`) for a later phase.
* **Uploaded PDF → signed PDF**: the signed copy is rebuilt from page images (text is rasterised); the untouched original is stored alongside.

## Visual template editor

* `DocSignTemplateEditor` static resource: Tiptap 2.27.2 / ProseMirror (MIT) plus DocSign nodes for merge fields, signer fields, repeating rows, repeat and *Show if* blocks and page breaks. Source: [`template-editor/`](../template-editor).
* `DocSignTemplateEditor.page` (header-less Visualforce, `DocSignTemplateEditorController`, `with sharing`, no SOQL or DML) runs the editor outside Lightning Web Security.
* The `docSignTemplateEditor` LWC hosts the page in an iframe. Messages are accepted only from Salesforce origins with a one-time nonce. The frame can request one server call, `describeObject` (API-name validated), which runs `DocSignTemplateController.describeObject` in user mode.
* `docSignTemplateManager` shows a **Visual / HTML** switch for the body. The editor serialises to the normal template syntax with inline table styles and a leading `<!--dsx:1-->` marker, so the merge engine and PDF renderer need no changes.

## PDF images (verified in an org)

`Blob.toPdf` does not render `data:` URI images, so every server-rendered PDF (generate, preview, signed PDF, certificate) references committed Salesforce Files versions by relative URL (`DocSignRenderService.resolveImagesForPdf`). Signature and initials images are stored as files in one transaction and the PDF is rendered in the next. A size check detects a render without images; the envelope then stays unfinalised and the record panel re-queues finalisation as the viewing user.
