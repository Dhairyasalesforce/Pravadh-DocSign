@IsTest
private class DocSignControllersTest {
    @IsTest
    static void templateManagerLifecycle() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Test.startTest();
            Assert.isFalse(DocSignTemplateController.listObjects().isEmpty());
            Assert.isFalse(DocSignTemplateController.describeObject('Account').isEmpty());
            String starter = DocSignTemplateController.starterBody('Account');
            Assert.isTrue(starter.contains('{{sign:signature:1}}'));
            DocSignTemplateController.TemplateDto d = new DocSignTemplateController.TemplateDto();
            d.name = 'MSA';
            d.objectApiName = 'account';
            d.body = starter;
            d.active = true;
            d.onCompleteField = 'Description';
            d.onCompleteValue = 'Signed';
            Id tid = DocSignTemplateController.saveTemplate(JSON.serialize(d));
            DocSignTemplateController.TemplateDto loaded = DocSignTemplateController.getTemplate(tid);
            Assert.areEqual('Account', loaded.objectApiName);
            loaded.body = '<p>{{Name}}</p>';
            DocSignTemplateController.saveTemplate(JSON.serialize(loaded));
            Assert.areEqual(2, DocSignTemplateController.getTemplate(tid).version);
            Id copy = DocSignTemplateController.cloneTemplate(tid);
            update new DocSign_Template__c(Id = copy, Active__c = true); // UI uses Lightning Data Service
            Assert.areEqual(2, DocSignTemplateController.listTemplates().size());
            Assert.areEqual(1, DocSignTemplateController.searchRecords('Account', 'Acme').size());
            Assert.areEqual(1, DocSignTemplateController.searchRecords('Account', String.valueOf(a.Id)).size());
            DocSignGenerationService.PreviewResult p = DocSignTemplateController.previewPdf(tid, a.Id);
            Assert.isNotNull(p.contentDocumentId);
            DocSignGenerationService.PreviewResult p2 = DocSignTemplateController.previewPdf(tid, a.Id);
            Assert.areEqual(p.contentDocumentId, p2.contentDocumentId, 'preview reuses one file with new versions');
            delete new DocSign_Template__c(Id = copy); // UI uses Lightning Data Service
            Test.stopTest();
            Assert.areEqual(1, [SELECT COUNT() FROM DocSign_Template__c]);
            d.onCompleteField = 'Owner.Name';
            d.id = null;
            try {
                DocSignTemplateController.saveTemplate(JSON.serialize(d));
                Assert.fail('invalid on-complete field');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('updateable'));
            }
        }
    }

    @IsTest
    static void recordPanelGenerateAndSend() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSign_Template__c t = DocSignTestFactory.template('<p>{{Name}}</p>');
            Test.startTest();
            DocSignRecordController.Context ctx = DocSignRecordController.getContext(a.Id);
            Assert.areEqual(1, ctx.templates.size());
            DocSignGenerationService.GenerateResult g = DocSignRecordController.generate(t.Id, a.Id);
            DocSignRecordController.SendDefaults sd = DocSignRecordController.getSendDefaults(g.documentId);
            Assert.areEqual(0, sd.requiredSigners);
            Assert.isFalse(sd.suggestions.isEmpty());
            DocSignEnvelopeService.SendRequest req = new DocSignEnvelopeService.SendRequest();
            req.documentId = g.documentId;
            req.recipients = new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('Ann', 'ann@example.com', null) };
            DocSignEnvelopeService.SendResult res = DocSignRecordController.send(JSON.serialize(req));
            Assert.areEqual('Sent', res.status);
            Assert.areEqual(3, [SELECT COUNT() FROM DocSign_Field__c WHERE Envelope__c = :res.envelopeId], 'auto signature block');
            try {
                DocSignRecordController.send(JSON.serialize(req));
                Assert.fail('already out for signature');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('already'));
            }
            ctx = DocSignRecordController.getContext(a.Id);
            Assert.areEqual('Sent', ctx.documents[0].envelopeStatus);

            DocSignWorkspaceController.Detail byEnv = DocSignWorkspaceController.getDetail(res.envelopeId);
            Assert.isTrue(byEnv.chainIntact);
            Assert.areEqual(1, byEnv.recipients.size());
            Assert.isFalse(byEnv.events.isEmpty());
            DocSignWorkspaceController.Detail byDoc = DocSignWorkspaceController.getDetail(g.documentId);
            Assert.areEqual(res.envelopeId, byDoc.envelopeId);
            Assert.areEqual(1, DocSignWorkspaceController.resendEnvelope(res.envelopeId));
            DocSignWorkspaceController.cancelEnvelope(res.envelopeId, 'test');
            try {
                DocSignWorkspaceController.getDetail(a.Id);
                Assert.fail('wrong object');
            } catch (AuraHandledException e) {
                Assert.isNotNull(e.getMessage());
            }
            Test.stopTest();
            Assert.areEqual('Cancelled', [SELECT Status__c FROM DocSign_Envelope__c WHERE Id = :res.envelopeId].Status__c);
        }
    }

    @IsTest
    static void validatesRecipients() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSign_Template__c t = DocSignTestFactory.template(DocSignTestFactory.SIGN_BODY);
            Id docId = DocSignTestFactory.generate(t.Id, a.Id).documentId;
            List<List<DocSignEnvelopeService.RecipientInput>> bad = new List<List<DocSignEnvelopeService.RecipientInput>>{
                new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('A', 'a@example.com', null) },
                new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('A', 'bad', null), DocSignTestFactory.recipient('B', 'b@example.com', null) },
                new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('', 'a@example.com', null), DocSignTestFactory.recipient('B', 'b@example.com', null) }
            };
            for (List<DocSignEnvelopeService.RecipientInput> r : bad) {
                try {
                    DocSignTestFactory.send(docId, r, 'Sequential');
                    Assert.fail('expected validation error');
                } catch (DocSignException e) {
                    Assert.isNotNull(e.getMessage());
                }
            }
            try {
                DocSignTestFactory.send(docId, new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('A', 'a@example.com', null), DocSignTestFactory.recipient('B', 'b@example.com', null) }, 'Random');
                Assert.fail('bad order');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('Sequential'));
            }
        }
    }

    @IsTest
    static void homeAndSettings() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Test.startTest();
            DocSignHomeController.Dashboard d = DocSignHomeController.getDashboard();
            Assert.areEqual(6, d.metrics.size());
            Assert.areEqual(5, d.setup.size(), 'template, site, sender, email domain, jobs');
            DocSignHomeController.SettingsDto s = DocSignHomeController.getSettings();
            s.signingSiteUrl = 'https://acme.my.salesforce-sites.com/sign/';
            s.brandColor = '#123456';
            s.companyName = 'Acme';
            s.defaultExpiryDays = 10;
            s.orgWideEmails = null;
            DocSignHomeController.saveSettings(JSON.serialize(s));
            Assert.isTrue(DocSignHomeController.promotionsEnabled());
            s.showPromotions = false;
            DocSignHomeController.saveSettings(JSON.serialize(s));
            Assert.isTrue(DocSignHomeController.setMaintenance(true));
            Assert.isFalse(DocSignHomeController.setMaintenance(false));
            s.signingSiteUrl = 'http://insecure';
            try {
                DocSignHomeController.saveSettings(JSON.serialize(s));
                Assert.fail('https required');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('https'));
            }
            Test.stopTest();
            DocSign_Settings__c saved = DocSign_Settings__c.getOrgDefaults();
            Assert.areEqual('https://acme.my.salesforce-sites.com/sign', saved.Signing_Site_Url__c);
            Assert.isFalse(saved.Show_Promotions__c);
            Assert.isTrue(DocSignEmailService.signingUrl('abc').startsWith('https://acme.my.salesforce-sites.com/sign/'));
        }
    }

    @IsTest
    static void flowActions() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSignTestFactory.template('<p>{{Name}}</p>{{sign:signature:1}}');
            Test.startTest();
            DocSignGenerateDocumentAction.Request gr = new DocSignGenerateDocumentAction.Request();
            gr.recordId = a.Id;
            gr.templateName = 'Test Agreement';
            DocSignGenerateDocumentAction.Result g = DocSignGenerateDocumentAction.generate(new List<DocSignGenerateDocumentAction.Request>{ gr })[0];
            Assert.isNotNull(g.documentId);

            DocSignSendForSignatureAction.Request sr = new DocSignSendForSignatureAction.Request();
            sr.documentId = g.documentId;
            sr.signerNames = new List<String>{ 'Ann' };
            sr.signerEmails = new List<String>{ 'ann@example.com' };
            DocSignSendForSignatureAction.Result s = DocSignSendForSignatureAction.send(new List<DocSignSendForSignatureAction.Request>{ sr })[0];
            Assert.areEqual('Sent', s.status);

            DocSignEnvelopeActions.StatusRequest st = new DocSignEnvelopeActions.StatusRequest();
            st.envelopeId = s.envelopeKey;
            Assert.areEqual('Sent', DocSignEnvelopeActions.getStatus(new List<DocSignEnvelopeActions.StatusRequest>{ st })[0].status);

            DocSignResendEnvelopeAction.Request rr = new DocSignResendEnvelopeAction.Request();
            rr.envelopeId = s.envelopeId;
            Assert.areEqual(1, DocSignResendEnvelopeAction.resend(new List<DocSignResendEnvelopeAction.Request>{ rr })[0]);

            DocSignCancelEnvelopeAction.Request cr = new DocSignCancelEnvelopeAction.Request();
            cr.envelopeId = [SELECT Name FROM DocSign_Envelope__c WHERE Id = :s.envelopeId].Name;
            cr.reason = 'done';
            Assert.areEqual('Cancelled', DocSignCancelEnvelopeAction.cancel(new List<DocSignCancelEnvelopeAction.Request>{ cr })[0]);

            // Apex-defined signer input
            DocSignGenerateDocumentAction.Result g2 = DocSignGenerateDocumentAction.generate(new List<DocSignGenerateDocumentAction.Request>{ gr })[0];
            DocSignRecipientInput ri = new DocSignRecipientInput();
            ri.name = 'Bob';
            ri.email = 'bob@example.com';
            ri.roleLabel = 'Customer';
            ri.accessCode = 'X1';
            DocSignSendForSignatureAction.Request sr2 = new DocSignSendForSignatureAction.Request();
            sr2.documentId = g2.documentId;
            sr2.signers = new List<DocSignRecipientInput>{ ri };
            sr2.signingOrder = 'Parallel';
            Assert.areEqual('Sent', DocSignSendForSignatureAction.send(new List<DocSignSendForSignatureAction.Request>{ sr2 })[0].status);
            Test.stopTest();
            try {
                DocSignGenerateDocumentAction.findTemplate('Nope', a.Id);
                Assert.fail('missing template');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('Nope'));
            }
            try {
                DocSignEnvelopeService.findByKeyOrId('does-not-exist');
                Assert.fail('missing envelope');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('not found'));
            }
        }
    }

    @IsTest
    static void agentActionsAndIntelligence() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            DocSign_Template__c t = DocSignTestFactory.template('<p>{{Name}} {{Website}} {{Missing__c}}</p>{{sign:signature:1}}');
            Test.startTest();
            DocSignAgentActions.FindTemplatesRequest fr = new DocSignAgentActions.FindTemplatesRequest();
            fr.recordId = a.Id;
            fr.request = 'Generate the test agreement please';
            DocSignAgentActions.FindTemplatesResult found = DocSignAgentActions.findTemplates(new List<DocSignAgentActions.FindTemplatesRequest>{ fr })[0];
            Assert.areEqual(t.Id, found.templateId);
            Assert.areEqual(1, found.templateCount);

            DocSignMissingDataAction.Request mr = new DocSignMissingDataAction.Request();
            mr.recordId = a.Id;
            mr.templateName = 'Test Agreement';
            DocSignMissingDataAction.Result missing = DocSignMissingDataAction.check(new List<DocSignMissingDataAction.Request>{ mr })[0];
            Assert.isFalse(missing.isReady);
            Assert.isTrue(missing.missingData.contains('Website'), missing.missingData);
            Assert.isTrue(missing.missingData.contains('Missing__c'), missing.missingData);

            DocSignSignatureSummaryAction.Request sq = new DocSignSignatureSummaryAction.Request();
            sq.recordId = a.Id;
            Assert.isTrue(DocSignSignatureSummaryAction.summarize(new List<DocSignSignatureSummaryAction.Request>{ sq })[0].summary.contains('No signature request'));
            Id docId = DocSignTestFactory.generate(t.Id, a.Id).documentId;
            DocSignTestFactory.send(docId, new List<DocSignEnvelopeService.RecipientInput>{ DocSignTestFactory.recipient('Ann', 'ann@example.com', null) }, 'Sequential');
            DocSignSignatureSummaryAction.Result sum = DocSignSignatureSummaryAction.summarize(new List<DocSignSignatureSummaryAction.Request>{ sq })[0];
            Assert.areEqual('Sent', sum.status);
            Assert.isTrue(sum.summary.contains('Waiting on: Ann'), sum.summary);
            Assert.isFalse(sum.isCompleted);

            DocSignIntelligence.Request dr = new DocSignIntelligence.Request();
            dr.task = DocSignIntelligence.TASK_SUMMARIZE_DOCUMENT;
            dr.documentId = docId;
            Assert.isTrue(DocSignIntelligence.run(dr).text.contains('Acme Test Corp'));
            DocSignIntelligence.Request bad = new DocSignIntelligence.Request();
            bad.task = 'unknown';
            Assert.isFalse(DocSignIntelligence.provider().handle(bad).handled);

            DocSignAgentSupport.AiStatus st = DocSignAgentSupport.status();
            Assert.isNotNull(st.activeProvider);
            Assert.isNotNull(DocSignHomeController.getSettings().ai);
            Assert.isTrue(DocSignIntelligence.registeredProviders().isEmpty());
            Test.stopTest();
            Assert.isNotNull(DocSignException.toAura(new DocSignException('x')));
        }
    }
}
