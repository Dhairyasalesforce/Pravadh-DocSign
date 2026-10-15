@IsTest
private class DocSignPdfPrepTest {
    private static final String JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    private static Id uploadPdf(Id recordId, String name, String body) {
        ContentVersion cv = new ContentVersion(Title = name, PathOnClient = name + '.pdf', VersionData = Blob.valueOf(body), FirstPublishLocationId = recordId);
        Database.insert(cv, AccessLevel.SYSTEM_MODE);
        return [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
    }

    private static Map<String, Object> field(Integer page, String type, Integer role, String label, String value) {
        return new Map<String, Object>{
            'page' => page, 'x' => 100, 'y' => 200, 'w' => 150, 'h' => 20, 'type' => type, 'role' => role, 'label' => label, 'required' => true, 'value' => value
        };
    }

    private static Id prepared(Account a) {
        Id cdId = uploadPdf(a.Id, 'Operating Agreement', '%PDF-1.7 test document');
        DocSignPdfPrepController.Created c = DocSignPdfPrepController.createFromUpload(a.Id, cdId);
        String v1 = DocSignPdfPrepController.storePage(c.documentId, 1, JPEG);
        String v2 = DocSignPdfPrepController.storePage(c.documentId, 2, JPEG);
        Map<String, Object> layout = new Map<String, Object>{
            'pages' => new List<Object>{
                new Map<String, Object>{ 'page' => 1, 'w' => 612, 'h' => 792, 'versionId' => v1 },
                new Map<String, Object>{ 'page' => 2, 'w' => 612, 'h' => 792, 'versionId' => v2 }
            },
            'fields' => new List<Object>{
                field(1, 'Text', 0, 'Legal name', 'Pravadh <Labs> LLC'),
                field(1, 'Checkbox', 0, 'Agree', 'true'),
                field(2, 'Signature', 1, 'Signature', null),
                field(2, 'Date Signed', 1, 'Date', null),
                field(2, 'Text', 1, 'Address', null),
                field(2, 'Signature', 5, 'By', null),
                field(2, 'Initial', 5, 'Initials', null)
            },
            'roles' => new List<Object>{
                new Map<String, Object>{ 'role' => 1, 'label' => 'Dhairya Shah' },
                new Map<String, Object>{ 'role' => 5, 'label' => 'Pravadh Labs LLC' }
            }
        };
        Map<String, Object> res = DocSignPdfPrepController.applyLayout(c.documentId, JSON.serialize(layout));
        Assert.areEqual(5, res.get('signatureFieldCount'));
        Assert.areEqual(2, res.get('signerRoles'), 'roles renumbered to 1..n');
        return c.documentId;
    }

    @IsTest
    static void uploadPrepareSignAndComplete() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Test.startTest();
            Id docId = prepared(a);
            DocSign_Document__c doc = [SELECT Status__c, Source_Type__c, Page_Count__c, Merged_Html__c, Document_Hash__c, Layout_Json__c FROM DocSign_Document__c WHERE Id = :docId];
            Assert.areEqual('Generated', doc.Status__c);
            Assert.areEqual('Uploaded PDF', doc.Source_Type__c);
            Assert.areEqual(2, doc.Page_Count__c);
            Assert.areEqual(64, doc.Document_Hash__c.length());
            Assert.isTrue(doc.Merged_Html__c.contains('[[DSI|'));
            Assert.isTrue(doc.Merged_Html__c.contains('Pravadh &lt;Labs&gt; LLC'), 'preparer values are escaped');
            Assert.isTrue(doc.Layout_Json__c.contains('Pravadh Labs LLC'));

            DocSignRecordController.SendDefaults sd = DocSignRecordController.getSendDefaults(docId);
            Assert.areEqual(2, sd.requiredSigners);
            Assert.areEqual('Dhairya Shah', sd.roleHints[0]);
            Assert.areEqual(2, sd.roleSummaries.size());
            Assert.isTrue(sd.roleSummaries[0].contains('to complete') && sd.roleSummaries[0].contains('page'), sd.roleSummaries[0]);

            Id envId = DocSignTestFactory.send(docId, new List<DocSignEnvelopeService.RecipientInput>{
                DocSignTestFactory.recipient('Dhairya', 'd@example.com', null),
                DocSignTestFactory.recipient('Company', 'c@example.com', null)
            }, 'Parallel').envelopeId;

            Id r1 = DocSignTestFactory.recipientId(envId, 1);
            String t1 = DocSignTestFactory.token(r1);
            DocSignSigningService.Session s1 = DocSignSigningService.open(t1, null, '1.1.1.1', 'UA', true);
            Assert.areEqual('sign', s1.state);
            Assert.areEqual(1, s1.otherSigners.size(), 'the other signer is named on the signing page');
            Assert.isTrue(s1.documentHtml.contains(s1.otherSigners[0]), 'other signer fields carry their name');
            Assert.isTrue(s1.documentHtml.contains('ds-lazy'), 'page images are lazy on the signing page');
            String ref = s1.documentHtml.substringAfter('data-ref="').substringBefore('"');
            Assert.isTrue(DocSignPageImageController.imageFor(t1, ref).startsWith('/9j/'), 'signer gets the page image');
            Assert.areEqual('', DocSignPageImageController.imageFor(t1, '068000000000000AAA'), 'foreign image refused');
            Assert.areEqual('', DocSignPageImageController.imageFor('bad token', ref), 'token required');
            PageReference pr = Page.DocSignPageImage;
            pr.getParameters().put('t', t1);
            pr.getParameters().put('v', ref);
            Test.setCurrentPage(pr);
            Assert.isTrue(new DocSignPageImageController().data.startsWith('/9j/'));
            try {
                DocSignSigningService.pageImage(t1, '068000000000000AAA');
                Assert.fail('foreign images are refused');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('Invalid page'));
            }
            try {
                DocSignSigningService.pageImage('not-a-valid-token-but-long-enough-xxxxx', ref);
                Assert.fail('token required');
            } catch (DocSignException e) {
                Assert.isNotNull(e.getMessage());
            }
            Assert.areEqual('done', DocSignSigningService.submit(t1, DocSignTestFactory.fullSubmission(s1, null), '1.1.1.1', 'UA').state);
            String t2 = DocSignTestFactory.token(DocSignTestFactory.recipientId(envId, 2));
            DocSignSigningService.Session s2 = DocSignSigningService.open(t2, null, '2.2.2.2', 'UA', true);
            Assert.areEqual('done', DocSignSigningService.submit(t2, DocSignTestFactory.fullSubmission(s2, null), '2.2.2.2', 'UA').state);
            Assert.areEqual(1, DocSignCompletionService.resumePending(a.Id), 'signed-but-unfinished envelope is picked up');
            Assert.isNotNull([SELECT Finalize_Requested__c FROM DocSign_Envelope__c WHERE Id = :envId].Finalize_Requested__c);
            DocSignCompletionService.finalizeEnvelope(envId);
            Test.stopTest();

            DocSign_Envelope__c env = [SELECT Status__c, Signed_Version_Id__c FROM DocSign_Envelope__c WHERE Id = :envId];
            Assert.areEqual('Completed', env.Status__c);
            String signed = [SELECT VersionData FROM ContentVersion WHERE Id = :env.Signed_Version_Id__c].VersionData.toString();
            Assert.isTrue(signed.contains('ds-pdfpage'));
            Assert.isTrue(signed.contains('/sfc/servlet.shepherd/version/download/068'), 'page images are referenced as files in the final PDF');
            Assert.isFalse(signed.contains('data:image/'), 'no data URIs reach the PDF renderer');
            for (DocSign_Recipient__c r : [SELECT Signature_File_Id__c FROM DocSign_Recipient__c WHERE Envelope__c = :envId]) {
                Assert.isNotNull(r.Signature_File_Id__c, 'signature image stored as a file');
            }
            Assert.areEqual(0, DocSignCompletionService.resumePending(a.Id), 'nothing pending once finalized');
            try {
                DocSignPdfPrepController.getPrepUrl(docId);
                Assert.fail('sent documents are locked');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('already been sent'));
            }
        }
    }

    @IsTest
    static void validatesUploadsPagesAndLayouts() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Test.startTest();
            ContentVersion txt = new ContentVersion(Title = 'notes', PathOnClient = 'notes.txt', VersionData = Blob.valueOf('hello'), FirstPublishLocationId = a.Id);
            Database.insert(txt, AccessLevel.SYSTEM_MODE);
            try {
                DocSignPdfPrepController.createFromUpload(a.Id, [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :txt.Id].ContentDocumentId);
                Assert.fail('non-PDF rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('PDF'));
            }
            try {
                DocSignPdfPrepController.createFromUpload(a.Id, uploadPdf(a.Id, 'fake', 'not a pdf'));
                Assert.fail('bad signature rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('not a valid PDF'));
            }
            DocSignPdfPrepController.Created c = DocSignPdfPrepController.createFromUpload(a.Id, uploadPdf(a.Id, 'Draft', '%PDF-1.4 x'));
            Assert.isTrue(c.prepUrl.contains('DocSignPdfPrep?id='));
            Assert.isNotNull(DocSignPdfPrepController.getPrepUrl(c.documentId));
            Map<String, Object> ctx = DocSignPdfPrepController.getContext(c.documentId);
            Assert.isNotNull(DocSignPdfPrepController.getPdfData(c.documentId), 'small PDFs can be read inline');
            try {
                DocSignPdfPrepController.getContext('not-an-id');
                Assert.fail('invalid id rejected');
            } catch (AuraHandledException e) {
                Assert.isNotNull(e.getMessage());
            }
            Assert.isNotNull(ctx.get('today'));
            Assert.isFalse(((List<Map<String, String>>) ctx.get('fields')).isEmpty());

            for (String bad : new List<String>{ null, 'data:image/png;base64,iVBOR', 'data:image/jpeg;base64,AAAA' }) {
                try {
                    DocSignPdfPrepController.storePage(c.documentId, 1, bad);
                    Assert.fail('invalid image rejected');
                } catch (DocSignException e) {
                    Assert.isNotNull(e.getMessage());
                }
            }
            try {
                DocSignPdfPrepController.storePage(c.documentId, DocSignPdfLayout.MAX_PAGES + 1, JPEG);
                Assert.fail('page range');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('page'));
            }
            String v1 = DocSignPdfPrepController.storePage(c.documentId, 1, JPEG);
            Map<String, Object> outside = new Map<String, Object>{
                'pages' => new List<Object>{ new Map<String, Object>{ 'page' => 1, 'w' => 612, 'h' => 792, 'versionId' => v1 } },
                'fields' => new List<Object>{ new Map<String, Object>{ 'page' => 1, 'x' => 9000, 'y' => 1, 'w' => 10, 'h' => 10, 'type' => 'Signature', 'role' => 1 } }
            };
            try {
                DocSignPdfPrepController.applyLayout(c.documentId, JSON.serialize(outside));
                Assert.fail('outside page');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('outside'));
            }
            ContentVersion foreign = new ContentVersion(Title = 'x', PathOnClient = 'x.jpg', VersionData = Blob.valueOf('x'), FirstPublishLocationId = a.Id);
            Database.insert(foreign, AccessLevel.SYSTEM_MODE);
            Map<String, Object> stolen = new Map<String, Object>{
                'pages' => new List<Object>{ new Map<String, Object>{ 'page' => 1, 'w' => 612, 'h' => 792, 'versionId' => foreign.Id } },
                'fields' => new List<Object>()
            };
            try {
                DocSignPdfPrepController.applyLayout(c.documentId, JSON.serialize(stolen));
                Assert.fail('foreign page image');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('do not belong'));
            }
            // Draft documents cannot be sent
            try {
                DocSignTestFactory.send(c.documentId, new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('A', 'a@example.com', null) }, 'Sequential');
                Assert.fail('draft blocked');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('Finish preparing'));
            }
            DocSignRecordController.Context rc = DocSignRecordController.getContext(a.Id);
            Boolean sawDraft = false;
            for (DocSignRecordController.DocumentRow r : rc.documents) {
                sawDraft = sawDraft || (r.isDraft && !r.canSend);
            }
            Assert.isTrue(sawDraft);
            Test.stopTest();
        }
    }

    @IsTest
    static void editorPageParametersAreValidated() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSignPdfPrepController.Created c = DocSignPdfPrepController.createFromUpload(a.Id, uploadPdf(a.Id, 'P', '%PDF-1.4 y'));
            PageReference p = Page.DocSignPdfPrep;
            p.getParameters().put('id', c.documentId);
            p.getParameters().put('o', 'https://acme.lightning.force.com');
            p.getParameters().put('n', 'abcdef0123456789');
            Test.setCurrentPage(p);
            DocSignPdfPrepController ctl = new DocSignPdfPrepController();
            Assert.areEqual(String.valueOf(c.documentId), ctl.documentId);
            Assert.areEqual('https://acme.lightning.force.com', ctl.parentOrigin);
            Assert.areEqual('abcdef0123456789', ctl.nonce);
            p.getParameters().put('o', 'https://evil.example.com');
            p.getParameters().put('n', '<script>');
            p.getParameters().put('id', a.Id);
            Assert.areEqual('', ctl.parentOrigin);
            Assert.areEqual('', ctl.nonce);
            Assert.areEqual('', ctl.documentId);
            Assert.areEqual('<img class="ds-lazy" data-ref="068x" alt="Page"/>', DocSignPdfLayout.lazyImages('[[DSI|068x|]]'));
        }
    }

    @IsTest
    static void pdfImagesUseFileUrls() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = new Account(Name = 'Img Co');
            Database.insert(a, AccessLevel.SYSTEM_MODE);
            ContentVersion cv = new ContentVersion(Title = 'logo', PathOnClient = 'logo.png', VersionData = EncodingUtil.base64Decode(DocSignTestFactory.PNG.substringAfter(',')), FirstPublishLocationId = a.Id);
            Database.insert(cv, AccessLevel.SYSTEM_MODE);
            String html = '<p>x</p>' + DocSignMergeEngine.IMAGE_MARKER_PREFIX + cv.Id + '|120' + DocSignMergeEngine.MARKER_SUFFIX;
            String out = DocSignRenderService.resolveImagesForPdf(html, false);
            Assert.isTrue(out.contains(DocSignRenderService.fileUrl(cv.Id)), out);
            Assert.isTrue(DocSignRenderService.lastImageBytes > 0);
            Assert.isTrue(DocSignRenderService.resolveImages(html, false).contains('data:image/png;base64,'), 'browser rendering keeps inline images');
            Assert.isTrue(DocSignRenderService.isSafeImage(DocSignRenderService.fileUrl(cv.Id)));
            Assert.isFalse(DocSignRenderService.isSafeImage('/sfc/servlet.shepherd/version/download/../../x'));
            Assert.isFalse(DocSignRenderService.isSafeImage('https://evil.example.com/a.png'));
            Assert.areEqual(DocSignRenderService.fileUrl(cv.Id), DocSignCompletionService.imageRef(cv.Id, DocSignTestFactory.PNG));
            Assert.areEqual(DocSignTestFactory.PNG, DocSignCompletionService.imageRef(null, DocSignTestFactory.PNG));
            Assert.areEqual(0, DocSignCompletionService.resumePending(null));
        }
    }

    @IsTest
    static void draftAutosaveAndResume() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Id cdId = uploadPdf(a.Id, 'Lease', '%PDF-1.4 lease');
            DocSignPdfPrepController.Created c = DocSignPdfPrepController.createFromUpload(a.Id, cdId);
            Map<String, Object> draft = new Map<String, Object>{
                'pages' => new List<Object>{ new Map<String, Object>{ 'page' => 1, 'w' => 612, 'h' => 792 } },
                'fields' => new List<Object>{ field(1, 'Signature', 2, 'Tenant', null), field(1, 'Text', 0, 'Rent', '1000') },
                'roles' => new List<Object>{ new Map<String, Object>{ 'role' => 2, 'label' => 'Tenant' } }
            };
            Assert.isNotNull(DocSignPdfPrepController.saveDraft(c.documentId, JSON.serialize(draft)));
            Map<String, Object> ctx = DocSignPdfPrepController.contextFor(c.documentId);
            Assert.areEqual('Draft', ctx.get('status'));
            String layout = (String) ctx.get('layout');
            Assert.isTrue(layout.contains('Tenant') && layout.contains('"draft":true'), layout);

            List<DocSignHomeController.DraftRow> drafts = DocSignHomeController.myDrafts();
            Assert.areEqual(1, drafts.size());
            Assert.isTrue(drafts[0].hasProgress);
            DocSignWorkspaceController.Detail d = DocSignWorkspaceController.getDetail(c.documentId);
            Assert.isTrue(d.canPrepare);
            Assert.isTrue(d.isDraft);
            DocSignRecordController.Context rc = DocSignRecordController.getContext(a.Id);
            Assert.isTrue(rc.documents[0].isDraft);

            draft.put('fields', new List<Object>{ field(3, 'Signature', 1, 'x', null) });
            try {
                DocSignPdfPrepController.saveDraft(c.documentId, JSON.serialize(draft));
                Assert.fail('fields must be on an existing page');
            } catch (AuraHandledException e) {
                Assert.isNotNull(e.getMessage());
            }
        }
    }
}
