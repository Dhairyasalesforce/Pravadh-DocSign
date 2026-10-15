/**
 * Pravadh DocSign - envelope finalization: signed PDF, Certificate of Completion,
 * Salesforce Files storage, record update and completion notifications.
 * Runs as a system process after the last signature (idempotent via Finalized__c).
 */
public without sharing class DocSignCompletionService {
    /** Minimum age before a user session may re-request a pending finalization. */
    private static final Integer RETRY_MINUTES = 10;

    public static void finalizeEnvelope(Id envelopeId) {
        finalizeStep(envelopeId);
    }

    /**
     * Runs one finalization step. Returns true when the envelope must be processed again in a new
     * transaction: signer images were just stored as Salesforce Files, and the PDF service can only
     * read files that are already committed.
     */
    public static Boolean finalizeStep(Id envelopeId) {
        DocSign_Envelope__c env = [
            SELECT Id, Name, Envelope_Key__c, Title__c, Status__c, Finalized__c, Document__c, Record_Id__c, Object_API_Name__c, Signing_Order__c,
                Sent_Date__c, CreatedDate, Expires_On__c, Original_Hash__c, On_Complete_Field__c, On_Complete_Value__c, Owner.Name, Owner.Email,
                CreatedBy.Name, CreatedBy.Email
            FROM DocSign_Envelope__c WHERE Id = :envelopeId WITH SYSTEM_MODE LIMIT 1 FOR UPDATE
        ];
        if (env.Finalized__c || env.Status__c == 'Cancelled' || env.Status__c == 'Declined' || env.Status__c == 'Expired') {
            return false;
        }
        List<DocSign_Recipient__c> recips = [
            SELECT Id, Name, Email__c, Status__c, Role_Number__c, Role_Label__c, Routing_Order__c, Sent_Date__c, Viewed_Date__c, Signed_Date__c,
                Consent_Date__c, IP_Address__c, User_Agent__c, Signature_Image__c, Initials_Image__c, Signature_Method__c,
                Signature_File_Id__c, Initials_File_Id__c
            FROM DocSign_Recipient__c WHERE Envelope__c = :envelopeId WITH SYSTEM_MODE ORDER BY Routing_Order__c, Role_Number__c
        ];
        for (DocSign_Recipient__c r : recips) {
            if (r.Status__c != 'Signed') {
                return false; // not everyone has signed
            }
        }
        if (storeSignerImages(env.Id, recips) && !Test.isRunningTest()) {
            return true;
        }
        DocSign_Document__c doc = [
            SELECT Id, Title__c, File_Name__c, Merged_Html__c, Merged_Html_2__c, Merged_Html_3__c, Content_Document_Id__c
            FROM DocSign_Document__c WHERE Id = :env.Document__c WITH SYSTEM_MODE LIMIT 1
        ];

        // 1. Signed document
        Map<Id, DocSign_Recipient__c> byId = new Map<Id, DocSign_Recipient__c>(recips);
        List<DocSign_Field__c> fields = [
            SELECT Field_Type__c, Field_Index__c, Label__c, Required__c, Value__c, Recipient__c, Recipient__r.Role_Number__c
            FROM DocSign_Field__c WHERE Envelope__c = :envelopeId WITH SYSTEM_MODE ORDER BY Field_Index__c
        ];
        Map<Integer, DocSignRenderService.FieldValue> values = new Map<Integer, DocSignRenderService.FieldValue>();
        List<DocSignRenderService.FieldSpec> auto = new List<DocSignRenderService.FieldSpec>();
        for (DocSign_Field__c f : fields) {
            DocSignRenderService.FieldValue v = new DocSignRenderService.FieldValue();
            DocSign_Recipient__c r = byId.get(f.Recipient__c);
            v.type = f.Field_Type__c;
            v.value = f.Value__c;
            if (f.Field_Type__c == 'Signature' && f.Value__c != null && r != null) {
                v.image = imageRef(r.Signature_File_Id__c, r.Signature_Image__c);
            } else if (f.Field_Type__c == 'Initial' && f.Value__c != null && r != null) {
                v.image = imageRef(r.Initials_File_Id__c, r.Initials_Image__c);
            }
            values.put(f.Field_Index__c.intValue(), v);
            if (f.Field_Index__c >= DocSignRenderService.AUTO_FIELD_BASE) {
                auto.add(DocSignSigningService.toSpec(f));
            }
        }
        String html = DocSignRenderService.appendAutoBlock(DocSignRenderService.readHtml(doc), auto);
        html = DocSignRenderService.renderFields(html, DocSignRenderService.FieldMode.FINAL_VALUES, values, env.Name);
        html = DocSignRenderService.resolveImagesForPdf(html, true);
        Long imageBytes = DocSignRenderService.lastImageBytes;
        Blob signedPdf = DocSignRenderService.toPdf(html);
        html = null;
        if (!Test.isRunningTest() && imageBytes > 50000 && signedPdf.size() < imageBytes / 4) {
            // The PDF service could not read the page images in this context (for example the
            // automated process user has no access to the files). Leave the envelope unfinalized;
            // it is retried in a user session (see resumePending).
            return false;
        }
        String finalHash = DocSignRenderService.sha256(signedPdf);
        String baseTitle = String.isNotBlank(doc.Title__c) ? doc.Title__c : env.Name;

        Set<Id> links = new Set<Id>{ env.Id };
        DocSign_Settings__c settings = DocSign_Settings__c.getOrgDefaults();
        if ((settings == null || settings.Id == null || settings.Link_To_Source_Record__c) && String.isNotBlank(env.Record_Id__c)) {
            links.add(Id.valueOf(env.Record_Id__c));
        }
        DocSignFileService.SavedFile signedFile = saveFinalFile(baseTitle + ' - Signed', baseTitle + ' - Signed.pdf', signedPdf, doc.Id, links);

        DocSignAuditService.Entry gen = DocSignAuditService.systemEntry(env.Id, 'Signed Document Generated', 'Signed PDF stored in Salesforce Files (' + signedFile.contentDocumentId + ').');
        gen.documentReference = finalHash;
        DocSignAuditService.Entry done = DocSignAuditService.systemEntry(env.Id, 'Document Completed', 'All ' + recips.size() + ' recipient(s) signed.' + applyRecordUpdate(env));
        done.documentReference = finalHash;
        DocSignAuditService.log(new List<DocSignAuditService.Entry>{ gen, done });

        // 2. Certificate of Completion (includes the full audit trail up to completion)
        Datetime completed = DocSignAuditService.nowSeconds();
        String certHtml = DocSignCertificateBuilder.build(env, recips, finalHash, completed);
        Blob certPdf = DocSignRenderService.toPdf(certHtml);
        DocSignFileService.SavedFile certFile = saveFinalFile('Certificate of Completion - ' + baseTitle, 'Certificate of Completion - ' + baseTitle + '.pdf', certPdf, doc.Id, links);
        DocSignAuditService.Entry cert = DocSignAuditService.systemEntry(env.Id, 'Certificate Generated', 'Certificate of Completion stored in Salesforce Files (' + certFile.contentDocumentId + ').');
        cert.documentReference = DocSignRenderService.sha256(certPdf);
        DocSignAuditService.log(cert);

        Database.update(new DocSign_Envelope__c(
            Id = env.Id,
            Status__c = 'Completed',
            Completed_Date__c = completed,
            Final_Hash__c = finalHash,
            Signed_Version_Id__c = signedFile.versionId,
            Certificate_Version_Id__c = certFile.versionId,
            Finalized__c = true
        ), AccessLevel.SYSTEM_MODE);
        Database.update(new DocSign_Document__c(Id = doc.Id, Status__c = 'Completed', Signed_Version_Id__c = signedFile.versionId, Certificate_Version_Id__c = certFile.versionId), AccessLevel.SYSTEM_MODE);
        List<DocSign_Recipient__c> clear = new List<DocSign_Recipient__c>();
        for (DocSign_Recipient__c r : recips) {
            clear.add(new DocSign_Recipient__c(Id = r.Id, Token_Hash__c = null));
        }
        Database.update(clear, AccessLevel.SYSTEM_MODE);

        notify(env, recips, baseTitle, signedPdf, certPdf);
        DocSignEvents.publish(env.Id, 'Completed', null);
        return false;
    }

    /** Server PDFs reference signer images as committed Salesforce Files; data URIs only as a fallback. */
    public static String imageRef(String fileId, String dataUri) {
        if (String.isNotBlank(fileId) && Pattern.matches('068[A-Za-z0-9]{12}([A-Za-z0-9]{3})?', fileId)) {
            return DocSignRenderService.fileUrl(Id.valueOf(fileId));
        }
        return dataUri;
    }

    /** Stores drawn/typed signature and initials images as files on the envelope. Returns true if any were created. */
    public static Boolean storeSignerImages(Id envelopeId, List<DocSign_Recipient__c> recips) {
        List<ContentVersion> files = new List<ContentVersion>();
        List<DocSign_Recipient__c> owners = new List<DocSign_Recipient__c>();
        List<String> kinds = new List<String>();
        for (DocSign_Recipient__c r : recips) {
            if (String.isBlank(r.Signature_File_Id__c) && isDataImage(r.Signature_Image__c)) {
                files.add(imageFile(envelopeId, r, 'signature', r.Signature_Image__c));
                owners.add(r);
                kinds.add('signature');
            }
            if (String.isBlank(r.Initials_File_Id__c) && isDataImage(r.Initials_Image__c)) {
                files.add(imageFile(envelopeId, r, 'initials', r.Initials_Image__c));
                owners.add(r);
                kinds.add('initials');
            }
        }
        if (files.isEmpty()) {
            return false;
        }
        Database.insert(files, AccessLevel.SYSTEM_MODE);
        Map<Id, DocSign_Recipient__c> upd = new Map<Id, DocSign_Recipient__c>();
        for (Integer i = 0; i < files.size(); i++) {
            DocSign_Recipient__c r = owners[i];
            DocSign_Recipient__c u = upd.containsKey(r.Id) ? upd.get(r.Id) : new DocSign_Recipient__c(Id = r.Id);
            if (kinds[i] == 'signature') {
                u.Signature_File_Id__c = files[i].Id;
                r.Signature_File_Id__c = files[i].Id;
            } else {
                u.Initials_File_Id__c = files[i].Id;
                r.Initials_File_Id__c = files[i].Id;
            }
            upd.put(r.Id, u);
        }
        Database.update(upd.values(), AccessLevel.SYSTEM_MODE);
        return true;
    }

    /**
     * Saves the signed PDF / Certificate of Completion. Finalization runs after the last external
     * signer as the platform-event process user (or the viewing user via resumePending), so the
     * files are written in system mode; see the security-review notes.
     */
    private static DocSignFileService.SavedFile saveFinalFile(String title, String fileName, Blob data, Id firstPublishLocationId, Set<Id> linkTo) {
        ContentVersion cv = new ContentVersion(
            Title = title.left(255),
            PathOnClient = DocSignFileService.sanitize(fileName),
            VersionData = data,
            FirstPublishLocationId = firstPublishLocationId,
            Description = 'Generated by Pravadh DocSign'
        );
        Database.insert(cv, AccessLevel.SYSTEM_MODE);
        cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id WITH SYSTEM_MODE LIMIT 1];
        DocSignFileService.SavedFile sf = new DocSignFileService.SavedFile();
        sf.versionId = cv.Id;
        sf.contentDocumentId = cv.ContentDocumentId;
        List<ContentDocumentLink> links = DocSignFileService.linksFor(cv.ContentDocumentId, firstPublishLocationId, linkTo);
        if (!links.isEmpty()) {
            // Some objects do not support Files; linking failures must not block finalization.
            Database.insert(links, false, AccessLevel.SYSTEM_MODE);
        }
        return sf;
    }

    private static Boolean isDataImage(String s) {
        return DocSignRenderService.isSafeImage(s) && s.startsWith('data:');
    }

    private static ContentVersion imageFile(Id envelopeId, DocSign_Recipient__c r, String kind, String dataUri) {
        Boolean png = dataUri.startsWith('data:image/png');
        return new ContentVersion(
            Title = ('DocSign ' + kind + ' - ' + r.Name).left(255),
            PathOnClient = 'docsign-' + kind + (png ? '.png' : '.jpg'),
            VersionData = EncodingUtil.base64Decode(dataUri.substringAfter(',')),
            FirstPublishLocationId = envelopeId,
            Description = 'Pravadh DocSign signer image'
        );
    }

    /**
     * Retry for envelopes that everyone signed but whose signed PDF could not be produced by the
     * background process. Called from a Salesforce user's session (record panel); the queued job
     * then runs as that user. Rate-limited per envelope.
     */
    public static Integer resumePending(Id recordId) {
        if (recordId == null) {
            return 0;
        }
        String rid = String.valueOf(recordId);
        Datetime cutoff = Datetime.now().addMinutes(-RETRY_MINUTES);
        // Envelopes everyone signed that still have no signed PDF.
        List<DocSign_Envelope__c> pending = [
            SELECT Id, Finalize_Requested__c FROM DocSign_Envelope__c
            WHERE Record_Id__c = :rid AND Finalized__c = FALSE
                AND Status__c NOT IN ('Draft', 'Prepared', 'Cancelled', 'Declined', 'Expired', 'Completed')
                AND Id NOT IN (SELECT Envelope__c FROM DocSign_Recipient__c WHERE Status__c != 'Signed')
            WITH USER_MODE
            LIMIT 5
        ];
        List<DocSign_Envelope__c> retry = new List<DocSign_Envelope__c>();
        List<Id> ids = new List<Id>();
        for (DocSign_Envelope__c e : pending) {
            if (e.Finalize_Requested__c == null || e.Finalize_Requested__c < cutoff) {
                retry.add(new DocSign_Envelope__c(Id = e.Id, Finalize_Requested__c = Datetime.now()));
                ids.add(e.Id);
            }
        }
        if (!ids.isEmpty() && Limits.getQueueableJobs() < Limits.getLimitQueueableJobs()) {
            Database.update(retry, AccessLevel.SYSTEM_MODE);
            if (!Test.isRunningTest()) {
                System.enqueueJob(new DocSignEventJob(new Map<String, List<Id>>{ 'AllSigned' => ids }));
            }
        }
        return pending.size();
    }

    /** Optional template-driven update of the source record (e.g. Status__c = 'Signed'). */
    private static String applyRecordUpdate(DocSign_Envelope__c env) {
        if (String.isBlank(env.On_Complete_Field__c) || String.isBlank(env.Record_Id__c)) {
            return '';
        }
        try {
            Id rid = Id.valueOf(env.Record_Id__c);
            Schema.DescribeFieldResult d = DocSignSchemaService.fields(rid.getSObjectType()).get(env.On_Complete_Field__c.trim().toLowerCase());
            if (d == null || !d.isUpdateable()) {
                return ' Source record update skipped: field ' + env.On_Complete_Field__c + ' is not updateable.';
            }
            SObject rec = rid.getSObjectType().newSObject(rid);
            rec.put(d.getName(), convert(env.On_Complete_Value__c, d.getType()));
            Database.SaveResult sr = Database.update(rec, false);
            return sr.isSuccess() ? ' Source record updated: ' + d.getName() + ' = ' + env.On_Complete_Value__c + '.'
                : ' Source record update failed: ' + sr.getErrors()[0].getMessage();
        } catch (Exception e) {
            return ' Source record update failed: ' + e.getMessage();
        }
    }

    private static Object convert(String v, Schema.DisplayType t) {
        if (v == null) {
            return null;
        }
        if (t == Schema.DisplayType.BOOLEAN) {
            return v.equalsIgnoreCase('true');
        }
        if (t == Schema.DisplayType.DOUBLE || t == Schema.DisplayType.CURRENCY || t == Schema.DisplayType.PERCENT) {
            return Decimal.valueOf(v);
        }
        if (t == Schema.DisplayType.INTEGER) {
            return Integer.valueOf(v);
        }
        if (t == Schema.DisplayType.DATE) {
            return v.equalsIgnoreCase('TODAY') ? Date.today() : Date.valueOf(v);
        }
        if (t == Schema.DisplayType.DATETIME) {
            return v.equalsIgnoreCase('NOW') ? Datetime.now() : Datetime.valueOf(v);
        }
        return v;
    }

    private static void notify(DocSign_Envelope__c env, List<DocSign_Recipient__c> recips, String title, Blob signedPdf, Blob certPdf) {
        List<Messaging.EmailFileAttachment> atts = new List<Messaging.EmailFileAttachment>();
        Integer totalSize = signedPdf.size() + certPdf.size();
        if (totalSize < 9000000) {
            Messaging.EmailFileAttachment a1 = new Messaging.EmailFileAttachment();
            a1.setFileName(DocSignFileService.sanitize(title + ' - Signed.pdf'));
            a1.setBody(signedPdf);
            a1.setContentType('application/pdf');
            Messaging.EmailFileAttachment a2 = new Messaging.EmailFileAttachment();
            a2.setFileName(DocSignFileService.sanitize('Certificate of Completion - ' + title + '.pdf'));
            a2.setBody(certPdf);
            a2.setContentType('application/pdf');
            atts.add(a1);
            atts.add(a2);
        }
        String body = '<p>All parties have signed <b>' + DocSignEmailService.esc(title) + '</b> (' + DocSignEmailService.esc(env.Name) + ').</p>'
            + '<p>The signed document and Certificate of Completion are attached.</p>';
        List<Messaging.SingleEmailMessage> msgs = new List<Messaging.SingleEmailMessage>();
        Set<String> sent = new Set<String>();
        for (DocSign_Recipient__c r : recips) {
            if (sent.add(r.Email__c)) {
                msgs.add(DocSignEmailService.notice(r.Email__c, 'Completed: ' + title, 'Your document is complete', body, atts));
            }
        }
        if (String.isNotBlank(env.Owner.Email) && sent.add(env.Owner.Email.toLowerCase())) {
            msgs.add(DocSignEmailService.notice(env.Owner.Email, 'Completed: ' + title, 'Your document is complete',
                body + DocSignEmailService.button(URL.getOrgDomainUrl().toExternalForm() + '/' + env.Id, 'Open envelope'), atts));
        }
        DocSignEmailService.send(msgs);
    }
}
