/**
 * Pravadh DocSign - "Upload PDF for signature" preparation endpoints.
 * Used by the record panel (LWC) and by the DocSignPdfPrep editor, whose Salesforce calls are relayed
 * through the hosting docSignPdfPrep Lightning component (no Visualforce remoting).
 * Runs as the Salesforce user with sharing and CRUD/FLS enforced (user mode).
 */
public with sharing class DocSignPdfPrepController {
    public static final Integer MAX_BYTES = 50 * 1024 * 1024;
    public static final Integer MAX_PAGE_IMAGE_BYTES = 1200000;

    public class Created {
        @AuraEnabled public Id documentId;
        @AuraEnabled public String prepUrl;
    }

    public class SaveResult {
        public Id documentId;
        public Integer signatureFieldCount;
        public Integer signerRoles;
    }

    public DocSignPdfPrepController() {
        return;
    }

    /** Id of the document being prepared (from the page URL); validated as a DocSign Document id. */
    public String documentId {
        get {
            String raw = ApexPages.currentPage() == null ? null : ApexPages.currentPage().getParameters().get('id');
            return isDocumentId(raw) ? String.valueOf(Id.valueOf(raw)).escapeHtml4() : '';
        }
    }

    /** Lightning origin that embeds the editor (postMessage target); only Salesforce-owned https origins are accepted. */
    public String parentOrigin {
        get {
            String raw = ApexPages.currentPage() == null ? null : ApexPages.currentPage().getParameters().get('o');
            return raw != null && Pattern.matches('https://[A-Za-z0-9.-]+\\.(force\\.com|salesforce\\.com|salesforce-setup\\.com|force-user\\.com)', raw) ? raw.escapeHtml4() : '';
        }
    }

    /** One-time value echoed back to the embedding component to pair messages. */
    public String nonce {
        get {
            String raw = ApexPages.currentPage() == null ? null : ApexPages.currentPage().getParameters().get('n');
            return raw != null && Pattern.matches('[A-Za-z0-9]{8,64}', raw) ? raw : '';
        }
    }

    public static Boolean isDocumentId(String raw) {
        if (String.isBlank(raw) || !Pattern.matches('[A-Za-z0-9]{15,18}', raw)) {
            return false;
        }
        try {
            return Id.valueOf(raw).getSObjectType() == DocSign_Document__c.SObjectType;
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ create from upload (LWC)

    @AuraEnabled
    public static Created createFromUpload(Id recordId, Id contentDocumentId) {
        try {
            List<ContentVersion> cvs = [
                SELECT Id, Title, FileExtension, FileType, ContentSize, Checksum, ContentDocumentId
                FROM ContentVersion
                WHERE ContentDocumentId = :contentDocumentId AND IsLatest = TRUE
                WITH USER_MODE
                LIMIT 1
            ];
            if (cvs.isEmpty()) {
                throw new DocSignException('The uploaded file could not be found.');
            }
            ContentVersion cv = cvs[0];
            if (cv.FileType != 'PDF' && (cv.FileExtension == null || cv.FileExtension.toLowerCase() != 'pdf')) {
                throw new DocSignException('Please upload a PDF file.');
            }
            if (cv.ContentSize > MAX_BYTES) {
                throw new DocSignException('The PDF is larger than 50 MB.');
            }
            String hash;
            if (cv.ContentSize <= 4000000) {
                Blob data = [SELECT VersionData FROM ContentVersion WHERE Id = :cv.Id WITH USER_MODE].VersionData;
                // "%PDF-" signature (checked on the first bytes only, to stay well inside the heap limit)
                if (cv.ContentSize <= 1500000 && !EncodingUtil.base64Encode(data).startsWith('JVBERi0')) {
                    throw new DocSignException('This file is not a valid PDF.');
                }
                hash = DocSignRenderService.sha256(data);
            } else {
                hash = 'md5:' + cv.Checksum;
            }
            Schema.SObjectType t = recordId.getSObjectType();
            String nameField = DocSignSchemaService.nameField(t);
            String recName = null;
            if (nameField != 'Id') {
                List<SObject> rows = Database.queryWithBinds(
                    'SELECT ' + nameField + ' FROM ' + t.getDescribe().getName() + ' WHERE Id = :rid LIMIT 1',
                    new Map<String, Object>{ 'rid' => recordId },
                    AccessLevel.USER_MODE
                );
                recName = rows.isEmpty() || rows[0].get(nameField) == null ? null : String.valueOf(rows[0].get(nameField)).left(255);
            }
            DocSign_Document__c doc = new DocSign_Document__c(
                Title__c = cv.Title == null ? 'Document' : cv.Title.left(255),
                Object_API_Name__c = t.getDescribe().getName(),
                Record_Id__c = recordId,
                Record_Name__c = recName,
                Status__c = 'Draft',
                Format__c = 'PDF',
                Source_Type__c = 'Uploaded PDF',
                Content_Document_Id__c = cv.ContentDocumentId,
                Content_Version_Id__c = cv.Id,
                File_Name__c = (cv.Title + '.pdf').left(255),
                Document_Hash__c = hash,
                Version_Number__c = 1
            );
            insert as user doc;
            insert as user new ContentDocumentLink(ContentDocumentId = cv.ContentDocumentId, LinkedEntityId = doc.Id, ShareType = 'I', Visibility = 'AllUsers');
            Created c = new Created();
            c.documentId = doc.Id;
            c.prepUrl = prepUrl(doc.Id);
            return c;
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static String getPrepUrl(Id documentId) {
        try {
            loadEditable(documentId);
            return prepUrl(documentId);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    public static String prepUrl(Id documentId) {
        return '/apex/' + DocSignSchemaService.nsPage('DocSignPdfPrep') + '?id=' + documentId;
    }

    // ------------------------------------------------------------------ editor (relayed by the docSignPdfPrep LWC)

    @AuraEnabled
    public static Map<String, Object> getContext(String documentId) {
        try {
            return contextFor(documentId);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static String savePage(String documentId, Integer pageNo, String dataUrl) {
        try {
            return storePage(documentId, pageNo, dataUrl);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    @AuraEnabled
    public static Map<String, Object> saveLayout(String documentId, String payload) {
        try {
            return applyLayout(documentId, payload);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    /** Autosave of the preparer's work in progress (fields, values, signers) while the document is a Draft. */
    @AuraEnabled
    public static Datetime saveDraft(String documentId, String payload) {
        try {
            return storeDraft(documentId, payload);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    public static Datetime storeDraft(String documentId, String payload) {
        DocSign_Document__c doc = loadEditable(documentId);
        if (doc.Status__c != 'Draft') {
            throw new DocSignException('This PDF is already prepared. Use Save & continue to apply changes.');
        }
        if (String.isBlank(payload) || payload.length() > 400000) {
            throw new DocSignException('The draft is too large.');
        }
        DocSignPdfLayout.Layout l = (DocSignPdfLayout.Layout) JSON.deserialize(payload, DocSignPdfLayout.Layout.class);
        l = DocSignPdfLayout.validateDraft(l);
        String layoutJson = JSON.serialize(new Map<String, Object>{ 'fields' => l.fields, 'roles' => l.roles, 'draft' => true, 'pageCount' => l.pages.size() });
        if (layoutJson.length() > 131072) {
            throw new DocSignException('The layout is too large. Remove some fields.');
        }
        update as user new DocSign_Document__c(Id = doc.Id, Layout_Json__c = layoutJson, Page_Count__c = l.pages.size());
        return Datetime.now();
    }

    /** Base64 of a small uploaded PDF, used when the browser cannot download the file directly. */
    @AuraEnabled
    public static String getPdfData(String documentId) {
        try {
            return pdfData(documentId);
        } catch (Exception e) {
            throw DocSignException.toAura(e);
        }
    }

    public static final Integer MAX_INLINE_PDF_BYTES = 2000000;

    public static String pdfData(String documentId) {
        DocSign_Document__c doc = loadEditable(documentId);
        Id vid = Id.valueOf(doc.Content_Version_Id__c);
        List<ContentVersion> cv = [SELECT ContentSize, VersionData FROM ContentVersion WHERE Id = :vid AND ContentSize <= :MAX_INLINE_PDF_BYTES WITH USER_MODE LIMIT 1];
        return cv.isEmpty() ? null : EncodingUtil.base64Encode(cv[0].VersionData);
    }

    /** Everything the editor needs: file reference, limits, and Salesforce data for fill suggestions. */
    public static Map<String, Object> contextFor(String documentId) {
        DocSign_Document__c doc = loadEditable(documentId);
        Map<String, Object> ctx = new Map<String, Object>{
            'title' => doc.Title__c,
            'status' => doc.Status__c,
            'recordId' => doc.Record_Id__c,
            'objectApiName' => doc.Object_API_Name__c,
            'recordName' => doc.Record_Name__c,
            'versionId' => doc.Content_Version_Id__c,
            'maxPages' => DocSignPdfLayout.MAX_PAGES,
            'layout' => doc.Layout_Json__c,
            'today' => Datetime.now().format('d MMM yyyy'),
            'fields' => suggestionData(Id.valueOf(doc.Record_Id__c))
        };
        List<ContentVersion> cv = [SELECT ContentSize FROM ContentVersion WHERE Id = :doc.Content_Version_Id__c WITH USER_MODE LIMIT 1];
        ctx.put('contentSize', cv.isEmpty() ? null : cv[0].ContentSize);
        return ctx;
    }

    /** Stores one rendered page image (JPEG) against the document. */
    public static String storePage(String documentId, Integer pageNo, String dataUrl) {
        DocSign_Document__c doc = loadEditable(documentId);
        if (pageNo == null || pageNo < 1 || pageNo > DocSignPdfLayout.MAX_PAGES) {
            throw new DocSignException('Invalid page number.');
        }
        String prefix = 'data:image/jpeg;base64,';
        if (String.isBlank(dataUrl) || !dataUrl.startsWith(prefix) || dataUrl.length() > MAX_PAGE_IMAGE_BYTES * 4 / 3 + 64) {
            throw new DocSignException('Page ' + pageNo + ' image is missing or too large.');
        }
        String b64 = dataUrl.substring(prefix.length());
        // JPEG files start with FF D8 FF, which is "/9j/" in base64.
        if (!b64.startsWith('/9j/')) {
            throw new DocSignException('Page ' + pageNo + ' image is not a JPEG.');
        }
        Blob img = EncodingUtil.base64Decode(b64);
        ContentVersion cv = new ContentVersion(
            Title = ('DocSign page ' + pageNo + ' - ' + doc.Title__c).left(255),
            PathOnClient = 'docsign-page-' + pageNo + '.jpg',
            VersionData = img,
            FirstPublishLocationId = doc.Id,
            Description = 'Pravadh DocSign page image'
        );
        insert as user cv;
        return cv.Id;
    }

    /** Validates the placed fields and turns the prepared PDF into a signable document. */
    public static Map<String, Object> applyLayout(String documentId, String payload) {
        DocSign_Document__c doc = loadEditable(documentId);
        DocSignPdfLayout.Layout l = (DocSignPdfLayout.Layout) JSON.deserialize(payload, DocSignPdfLayout.Layout.class);
        l = DocSignPdfLayout.validate(l);
        Set<Id> versionIds = new Set<Id>();
        for (DocSignPdfLayout.PageInfo p : l.pages) {
            try {
                versionIds.add(Id.valueOf(p.versionId));
            } catch (Exception e) {
                throw new DocSignException('Invalid page image reference.');
            }
        }
        Integer owned = [SELECT COUNT() FROM ContentVersion WHERE Id IN :versionIds AND FirstPublishLocationId = :doc.Id WITH USER_MODE];
        if (owned != versionIds.size()) {
            throw new DocSignException('Page images do not belong to this document.');
        }
        String html = DocSignPdfLayout.buildHtml(l, doc.Title__c);
        List<Map<String, Object>> pages = new List<Map<String, Object>>();
        for (DocSignPdfLayout.PageInfo p : l.pages) {
            pages.add(new Map<String, Object>{ 'page' => p.page, 'w' => p.w, 'h' => p.h, 'versionId' => p.versionId });
        }
        String layoutJson = JSON.serialize(new Map<String, Object>{ 'fields' => l.fields, 'roles' => l.roles });
        if (layoutJson.length() > 131072) {
            throw new DocSignException('The layout is too large. Remove some fields.');
        }
        DocSign_Document__c upd = new DocSign_Document__c(
            Id = doc.Id,
            Status__c = 'Generated',
            Page_Count__c = l.pages.size(),
            Page_Images__c = JSON.serialize(pages),
            Layout_Json__c = layoutJson
        );
        DocSignRenderService.writeHtml(upd, html);
        update as user upd;
        List<DocSignRenderService.FieldSpec> specs = DocSignRenderService.parseFields(html);
        return new Map<String, Object>{
            'documentId' => doc.Id,
            'recordId' => doc.Record_Id__c,
            'signatureFieldCount' => specs.size(),
            'signerRoles' => DocSignGenerationService.maxRole(specs)
        };
    }

    // ------------------------------------------------------------------ helpers

    private static DocSign_Document__c loadEditable(String documentId) {
        if (!isDocumentId(documentId)) {
            throw new DocSignException('Invalid document.');
        }
        Id docId = Id.valueOf(documentId);
        List<DocSign_Document__c> docs = [
            SELECT Id, Title__c, Status__c, Source_Type__c, Record_Id__c, Object_API_Name__c, Record_Name__c, Content_Version_Id__c, Layout_Json__c
            FROM DocSign_Document__c
            WHERE Id = :docId
            WITH USER_MODE
            LIMIT 1
        ];
        if (docs.isEmpty()) {
            throw new DocSignException('Document not found or you do not have access to it.');
        }
        DocSign_Document__c doc = docs[0];
        if (doc.Source_Type__c != 'Uploaded PDF') {
            throw new DocSignException('Only uploaded PDFs can be prepared here.');
        }
        if (doc.Status__c != 'Draft' && doc.Status__c != 'Generated') {
            throw new DocSignException('This document has already been sent and can no longer be changed.');
        }
        List<UserRecordAccess> access = [SELECT RecordId, HasEditAccess FROM UserRecordAccess WHERE UserId = :UserInfo.getUserId() AND RecordId = :docId WITH SYSTEM_MODE];
        if (access.isEmpty() || !access[0].HasEditAccess) {
            throw new DocSignException('You do not have edit access to this document.');
        }
        return doc;
    }

    /**
     * Candidate values for "fill now" fields: readable, non-empty fields of the source record plus the
     * current user and org. Only data the user can already see is returned (user mode + FLS).
     */
    public static List<Map<String, String>> suggestionData(Id recordId) {
        List<Map<String, String>> out = new List<Map<String, String>>();
        Schema.SObjectType t = recordId.getSObjectType();
        List<String> selects = new List<String>();
        Map<String, Schema.DescribeFieldResult> useful = new Map<String, Schema.DescribeFieldResult>();
        for (Schema.DescribeFieldResult d : DocSignSchemaService.fields(t).values()) {
            Schema.DisplayType ty = d.getType();
            if (!d.isAccessible() || ty == Schema.DisplayType.ID || ty == Schema.DisplayType.REFERENCE || ty == Schema.DisplayType.BASE64
                || ty == Schema.DisplayType.TEXTAREA && d.getLength() > 1000 || ty == Schema.DisplayType.ENCRYPTEDSTRING || ty == Schema.DisplayType.ADDRESS
                || ty == Schema.DisplayType.LOCATION || d.getName().startsWith('System') || d.getName().endsWith('ById') || useful.size() >= 150) {
                continue;
            }
            selects.add(d.getName());
            useful.put(d.getName(), d);
        }
        if (!selects.isEmpty()) {
            List<SObject> rows = Database.queryWithBinds(
                'SELECT ' + String.join(selects, ', ') + ' FROM ' + t.getDescribe().getName() + ' WHERE Id = :rid LIMIT 1',
                new Map<String, Object>{ 'rid' => recordId },
                AccessLevel.USER_MODE
            );
            if (!rows.isEmpty()) {
                for (String f : selects) {
                    Object v = rows[0].get(f);
                    if (v == null || String.valueOf(v).trim() == '') {
                        continue;
                    }
                    Schema.DescribeFieldResult d = useful.get(f);
                    String s = DocSignFormatter.defaultFormat(v, d.getType(), null, d.getScale());
                    out.add(new Map<String, String>{ 'label' => d.getLabel(), 'value' => s.left(255), 'type' => String.valueOf(d.getType()) });
                }
            }
        }
        List<User> me = [SELECT Name, Title, Email, Phone, CompanyName, Street, City, State, PostalCode, Country FROM User WHERE Id = :UserInfo.getUserId() WITH USER_MODE LIMIT 1];
        if (!me.isEmpty()) {
            addIf(out, 'My Name', me[0].Name);
            addIf(out, 'My Title', me[0].Title);
            addIf(out, 'My Email', me[0].Email);
            addIf(out, 'My Phone', me[0].Phone);
            List<String> addr = new List<String>();
            for (String part : new List<String>{ me[0].Street, me[0].City, me[0].State, me[0].PostalCode, me[0].Country }) {
                if (String.isNotBlank(part)) {
                    addr.add(part.replace('\n', ', '));
                }
            }
            addIf(out, 'My Address', String.join(addr, ', '));
        }
        addIf(out, 'Company Legal Name', UserInfo.getOrganizationName());
        return out;
    }

    private static void addIf(List<Map<String, String>> out, String label, String value) {
        if (String.isNotBlank(value)) {
            out.add(new Map<String, String>{ 'label' => label, 'value' => value });
        }
    }
}
