@IsTest
private class DocSignGenerationTest {
    @IsTest
    static void generatesPdfDocumentStoredInFiles() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSign_Template__c t = DocSignTestFactory.template(DocSignTestFactory.SIGN_BODY);
            Test.startTest();
            DocSignGenerationService.GenerateResult r = DocSignTestFactory.generate(t.Id, a.Id);
            DocSignGenerationService.GenerateResult r2 = DocSignTestFactory.generate(t.Id, a.Id);
            Test.stopTest();
            DocSign_Document__c d = [SELECT Status__c, Format__c, Title__c, Record_Name__c, Document_Hash__c, Version_Number__c, Content_Document_Id__c, Merged_Html__c FROM DocSign_Document__c WHERE Id = :r.documentId];
            Assert.areEqual('Generated', d.Status__c);
            Assert.areEqual('PDF', d.Format__c);
            Assert.areEqual('Acme Test Corp - Agreement', d.Title__c);
            Assert.areEqual('Acme Test Corp', d.Record_Name__c);
            Assert.areEqual(64, d.Document_Hash__c.length());
            Assert.areEqual(8, r.signatureFieldCount);
            Assert.areEqual(2, r.signerRoles);
            Assert.areEqual(2, [SELECT Version_Number__c FROM DocSign_Document__c WHERE Id = :r2.documentId].Version_Number__c);
            Assert.isTrue(d.Merged_Html__c.contains('[[DSF|'));
            Assert.areEqual(1, [SELECT COUNT() FROM ContentDocumentLink WHERE ContentDocumentId = :d.Content_Document_Id__c AND LinkedEntityId = :a.Id]);
        }
    }

    @IsTest
    static void previewDoesNotPersist() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSign_Template__c t = DocSignTestFactory.template('<p>{{Name}} {{Unknown__c}}</p>{{sign:signature:1}}');
            DocSignGenerationService.PreviewResult p = DocSignGenerationService.preview(DocSignGenerationService.loadTemplate(t.Id), a.Id);
            Assert.isTrue(p.html.contains('Acme Test Corp'));
            Assert.isTrue(p.html.contains('ds-tab'));
            Assert.areEqual(1, p.warnings.size());
            Assert.areEqual(0, [SELECT COUNT() FROM DocSign_Document__c]);
        }
    }

    @IsTest
    static void rejectsInactiveOrMismatchedTemplates() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Contact c = [SELECT Id FROM Contact LIMIT 1];
            DocSign_Template__c t = DocSignTestFactory.template('<p>{{Name}}</p>');
            try {
                DocSignTestFactory.generate(t.Id, c.Id);
                Assert.fail('expected mismatch');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('Account'));
            }
            t.Active__c = false;
            Database.update(t, AccessLevel.SYSTEM_MODE);
            try {
                DocSignTestFactory.generate(t.Id, a.Id);
                Assert.fail('expected inactive');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('not active'));
            }
        }
    }

    @IsTest
    static void generatesWordDocuments() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Compression.ZipWriter w = new Compression.ZipWriter();
            w.addEntry('[Content_Types].xml', Blob.valueOf('<Types/>'));
            w.addEntry('word/document.xml', Blob.valueOf('<w:document><w:body><w:p><w:r><w:t>Hello {{Na</w:t></w:r><w:r><w:t>me}}</w:t></w:r></w:p>'
                + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{{#each Contacts orderBy="LastName"}}{{LastName}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{Email}}{{/each}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'));
            w.addEntry('word/footer1.xml', Blob.valueOf('<w:ftr><w:p><w:r><w:t>{{$Org.Name}}</w:t></w:r></w:p></w:ftr>'));
            ContentVersion cv = new ContentVersion(Title = 'Tpl', PathOnClient = 'tpl.docx', VersionData = w.getArchive());
            Database.insert(cv, AccessLevel.SYSTEM_MODE);
            Id cdId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
            DocSign_Template__c t = DocSignTestFactory.template('');
            t.Format__c = 'DOCX';
            t.Template_File_Id__c = cdId;
            Database.update(t, AccessLevel.SYSTEM_MODE);
            Test.startTest();
            DocSignGenerationService.GenerateResult r = DocSignTestFactory.generate(t.Id, a.Id);
            Test.stopTest();
            Assert.areEqual('DOCX', r.format);
            Assert.isTrue(r.fileName.endsWith('.docx'));
            Blob out = [SELECT VersionData FROM ContentVersion WHERE Id = :r.contentVersionId].VersionData;
            Compression.ZipReader reader = new Compression.ZipReader(out);
            String xml;
            for (Compression.ZipEntry e : reader.getEntries()) {
                if (e.getName() == 'word/document.xml') {
                    xml = reader.extract(e).toString();
                }
            }
            Assert.isTrue(xml.contains('Hello Acme Test Corp'), xml);
            Assert.isTrue(xml.indexOf('Alpha') < xml.indexOf('Zeta'), xml);
            Assert.areEqual(2, xml.countMatches('<w:tr>'), xml);
            try {
                DocSignTestFactory.send(r.documentId, new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('A', 'a@example.com', null) }, 'Sequential');
                Assert.fail('DOCX cannot be signed');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('PDF'));
            }
        }
    }

    @IsTest
    static void renderServiceHelpers() {
        String html = DocSignRenderService.composeDocument('<p>x</p>', 'h', 'f', '.x{}', 'Letter', 'Landscape', 'T');
        Assert.isTrue(html.contains('Letter landscape'));
        List<DocSignRenderService.FieldSpec> auto = new List<DocSignRenderService.FieldSpec>();
        DocSignRenderService.FieldSpec s = new DocSignRenderService.FieldSpec();
        s.index = 1000;
        s.type = 'Checkbox';
        s.role = 1;
        s.required = false;
        s.label = 'OK';
        auto.add(s);
        String withBlock = DocSignRenderService.appendAutoBlock(html, auto);
        Map<Integer, DocSignRenderService.FieldValue> vals = new Map<Integer, DocSignRenderService.FieldValue>();
        DocSignRenderService.FieldValue v = new DocSignRenderService.FieldValue();
        v.value = 'true';
        vals.put(1000, v);
        Assert.isTrue(DocSignRenderService.renderFields(withBlock, DocSignRenderService.FieldMode.FINAL_VALUES, vals, 'ENV').contains('ds-check'));
        Assert.isFalse(DocSignRenderService.isSafeImage('javascript:alert(1)'));
        Assert.isTrue(DocSignRenderService.isSafeImage(DocSignTestFactory.PNG));
        DocSign_Document__c d = new DocSign_Document__c();
        DocSignRenderService.writeHtml(d, 'a'.repeat(140000));
        Assert.areEqual(140000, DocSignRenderService.readHtml(d).length());
        try {
            DocSignRenderService.writeHtml(d, 'a'.repeat(400000));
            Assert.fail('too large');
        } catch (DocSignException e) {
            Assert.isTrue(e.getMessage().contains('too large'));
        }
    }
}
