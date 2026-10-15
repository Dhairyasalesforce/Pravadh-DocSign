@IsTest
private class DocSignSigningTest {
    private static Id prepare(String order, String code) {
        Account a = DocSignTestFactory.account();
        DocSign_Template__c t = DocSignTestFactory.template(DocSignTestFactory.SIGN_BODY);
        DocSignGenerationService.GenerateResult g = DocSignTestFactory.generate(t.Id, a.Id);
        return DocSignTestFactory.send(
                g.documentId,
                new List<DocSignEnvelopeService.RecipientInput>{
                    DocSignTestFactory.recipient('Ann Alpha', 'ann@example.com', code),
                    DocSignTestFactory.recipient('Bob Beta', 'bob@example.com', null)
                },
                order
            )
            .envelopeId;
    }

    @IsTest
    static void sequentialSigningCompletesWithCertificateAndAudit() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Test.startTest();
            Id envId = prepare('Sequential', '1234');
            DocSign_Envelope__c env = [SELECT Status__c, Current_Routing_Order__c, Record_Id__c FROM DocSign_Envelope__c WHERE Id = :envId];
            Assert.areEqual('Sent', env.Status__c);
            Id r1 = DocSignTestFactory.recipientId(envId, 1);
            Id r2 = DocSignTestFactory.recipientId(envId, 2);
            String t1 = DocSignTestFactory.token(r1);
            Assert.isNotNull(t1);
            Assert.isNull(DocSignTestFactory.token(r2), 'second signer waits for routing');

            // Access code gate
            DocSignSigningService.Session s = DocSignSigningService.open(t1, null, '10.0.0.1', 'UnitTest', true);
            Assert.areEqual('access', s.state);
            s = DocSignSigningService.open(t1, 'nope', '10.0.0.1', 'UnitTest', true);
            Assert.areEqual('access', s.state);
            Assert.isNotNull(s.message);
            s = DocSignSigningService.open(t1, '1234', '10.0.0.1', 'UnitTest', true);
            Assert.areEqual('sign', s.state);
            Assert.areEqual(6, s.fields.size());
            Assert.isTrue(s.needsSignature && s.needsInitials);
            Assert.isTrue(s.documentHtml.contains('ds-mine'));

            // Validation
            DocSignSigningService.Submission bad = DocSignTestFactory.fullSubmission(s, '1234');
            bad.consent = false;
            Assert.areEqual('CONSENT', DocSignSigningService.submit(t1, bad, '10.0.0.1', 'UnitTest').errorCode);
            bad.consent = true;
            bad.signatureImage = 'data:text/html;base64,PHNjcmlwdD4=';
            Assert.areEqual('SIGNATURE', DocSignSigningService.submit(t1, bad, '10.0.0.1', 'UnitTest').errorCode);

            // Second signer cannot act out of order
            DocSignRoutingService.issuedTokens.clear();
            DocSignSigningService.Session done1 = DocSignSigningService.submit(t1, DocSignTestFactory.fullSubmission(s, '1234'), '10.0.0.1', 'UnitTest');
            Assert.areEqual('done', done1.state, 'state=' + done1.state + ' code=' + done1.errorCode + ' msg=' + done1.message);
            env = [SELECT Status__c, Current_Routing_Order__c FROM DocSign_Envelope__c WHERE Id = :envId];
            Assert.areEqual('Partially Signed', env.Status__c);
            Assert.areEqual(2, env.Current_Routing_Order__c);
            Assert.areEqual('signed', DocSignSigningService.open(t1, '1234', null, null, false).state);

            // Next routing group (normally done by the platform-event job)
            DocSignRoutingService.sendCurrentGroup(envId, 'initial', 'Pravadh DocSign', null);
            String t2 = DocSignTestFactory.token(r2);
            DocSignSigningService.Session s2 = DocSignSigningService.open(t2, null, '10.0.0.2', 'UnitTest', true);
            Assert.areEqual('sign', s2.state);
            Assert.areEqual('done', DocSignSigningService.submit(t2, DocSignTestFactory.fullSubmission(s2, null), '10.0.0.2', 'UnitTest').state);

            DocSignCompletionService.finalizeEnvelope(envId);
            DocSignCompletionService.finalizeEnvelope(envId); // idempotent
            Test.stopTest();

            env = [SELECT Status__c, Finalized__c, Signed_Version_Id__c, Certificate_Version_Id__c, Final_Hash__c, Document__r.Status__c, Record_Id__c FROM DocSign_Envelope__c WHERE Id = :envId];
            Assert.areEqual('Completed', env.Status__c);
            Assert.isTrue(env.Finalized__c);
            Assert.isNotNull(env.Signed_Version_Id__c);
            Assert.isNotNull(env.Certificate_Version_Id__c);
            Assert.areEqual('Completed', env.Document__r.Status__c);
            Assert.areEqual('Signed', [SELECT Description FROM Account WHERE Id = :env.Record_Id__c].Description);
            Assert.isTrue(DocSignAuditService.verifyChain(envId));
            String signed = [SELECT VersionData FROM ContentVersion WHERE Id = :env.Signed_Version_Id__c].VersionData.toString();
            Assert.isTrue(signed.contains('ds-signed'));
            Assert.isTrue(signed.contains('CEO'));
            String cert = [SELECT VersionData FROM ContentVersion WHERE Id = :env.Certificate_Version_Id__c].VersionData.toString();
            Assert.isTrue(cert.contains('Certificate of Completion'));
            Assert.isTrue(cert.contains('Verified'));

            // Audit events are immutable
            DocSign_Audit_Event__c ev = [SELECT Id FROM DocSign_Audit_Event__c WHERE Envelope__c = :envId LIMIT 1];
            ev.Details__c = 'tampered';
            try {
                Database.update(ev, AccessLevel.SYSTEM_MODE);
                Assert.fail('audit update must be blocked');
            } catch (DmlException e) {
                Assert.isTrue(e.getMessage().contains('immutable'));
            }
            try {
                Database.delete(ev, AccessLevel.SYSTEM_MODE);
                Assert.fail('audit delete must be blocked');
            } catch (DmlException e) {
                Assert.isTrue(e.getMessage().contains('immutable'));
            }
            try {
                Database.delete(new DocSign_Envelope__c(Id = envId), AccessLevel.SYSTEM_MODE);
                Assert.fail('sent envelopes cannot be deleted');
            } catch (DmlException e) {
                Assert.isTrue(e.getMessage().contains('cannot be deleted'));
            }
        }
    }

    @IsTest
    static void parallelDeclineVoidsEnvelope() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Test.startTest();
            Id envId = prepare('Parallel', null);
            Id r1 = DocSignTestFactory.recipientId(envId, 1);
            Id r2 = DocSignTestFactory.recipientId(envId, 2);
            String t2 = DocSignTestFactory.token(r2);
            Assert.isNotNull(DocSignTestFactory.token(r1));
            Assert.isNotNull(t2, 'parallel signers receive links together');
            Assert.areEqual('REASON', DocSignSigningService.decline(t2, null, '', null, null).errorCode);
            Assert.areEqual('declined', DocSignSigningService.decline(t2, null, 'Wrong amount', '1.1.1.1', 'UA').state);
            DocSignLifecycle.notifyDeclined(envId);
            Test.stopTest();
            DocSign_Envelope__c env = [SELECT Status__c, Document__r.Status__c FROM DocSign_Envelope__c WHERE Id = :envId];
            Assert.areEqual('Declined', env.Status__c);
            Assert.areEqual('Declined', env.Document__r.Status__c);
            Assert.areEqual('error', DocSignSigningService.open(DocSignTestFactory.token(r1), null, null, null, false).state, 'other links voided');
            Assert.areEqual('error', DocSignSigningService.open('short', null, null, null, false).state);
        }
    }

    @IsTest
    static void cancelResendAndExpire() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Test.startTest();
            Id envId = prepare('Sequential', null);
            Id r1 = DocSignTestFactory.recipientId(envId, 1);
            String first = DocSignTestFactory.token(r1);
            Assert.areEqual(1, DocSignEnvelopeService.resend(envId));
            String second = DocSignTestFactory.token(r1);
            Assert.areNotEqual(first, second);
            Assert.areEqual('error', DocSignSigningService.open(first, null, null, null, false).state, 'old link replaced');
            DocSignEnvelopeService.cancel(envId, 'Superseded');
            try {
                DocSignEnvelopeService.cancel(envId, 'again');
                Assert.fail('cannot cancel twice');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('in progress'));
            }
            Test.stopTest();
            Assert.areEqual('Cancelled', [SELECT Status__c FROM DocSign_Envelope__c WHERE Id = :envId].Status__c);
            Assert.areEqual('error', DocSignSigningService.open(second, null, null, null, false).state);
        }
    }

    @IsTest
    static void maintenanceJobExpiresAndReminds() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Id envId = prepare('Parallel', null);
            Database.insert(new DocSign_Settings__c(SetupOwnerId = UserInfo.getOrganizationId(), Reminder_Interval_Days__c = 1), AccessLevel.SYSTEM_MODE);
            Id docId = [SELECT Document__c FROM DocSign_Envelope__c WHERE Id = :envId].Document__c;
            // second envelope on a fresh document that should only get a reminder
            DocSign_Envelope__c env = [SELECT Id FROM DocSign_Envelope__c WHERE Id = :envId];
            env.Expires_On__c = Datetime.now().addDays(-1);
            Database.update(env, AccessLevel.SYSTEM_MODE);
            Test.startTest();
            new DocSignMaintenanceJob().execute((SchedulableContext) null);
            Test.stopTest();
            Assert.areEqual('Expired', [SELECT Status__c FROM DocSign_Envelope__c WHERE Id = :envId].Status__c);
            Assert.areEqual('Expired', [SELECT Status__c FROM DocSign_Document__c WHERE Id = :docId].Status__c);
        }
    }

    @IsTest
    static void remindersResendLinks() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Id envId = prepare('Sequential', null);
            Database.insert(new DocSign_Settings__c(SetupOwnerId = UserInfo.getOrganizationId(), Reminder_Interval_Days__c = 1), AccessLevel.SYSTEM_MODE);
            Database.update(new DocSign_Envelope__c(Id = envId, Sent_Date__c = Datetime.now().addDays(-3)), AccessLevel.SYSTEM_MODE);
            Test.startTest();
            Database.executeBatch(new DocSignMaintenanceJob());
            Test.stopTest();
            Assert.isNotNull([SELECT Last_Reminder_Date__c FROM DocSign_Envelope__c WHERE Id = :envId].Last_Reminder_Date__c);
            Assert.areEqual(1, [SELECT COUNT() FROM DocSign_Audit_Event__c WHERE Envelope__c = :envId AND Event_Type__c = 'Reminder Sent']);
        }
    }

    @IsTest
    static void eventPipelineRunsAsync() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Id envId = prepare('Sequential', null);
            DocSign_Envelope__c env = [SELECT Id, Envelope_Key__c, Document__c, Record_Id__c, Object_API_Name__c, Status__c FROM DocSign_Envelope__c WHERE Id = :envId];
            Test.startTest();
            DocSignEventHandler.handle(new List<DocSign_Envelope_Event__e>{
                new DocSign_Envelope_Event__e(Envelope_Id__c = envId, Event_Type__c = 'RoutingAdvanced'),
                new DocSign_Envelope_Event__e(Envelope_Id__c = envId, Event_Type__c = 'Declined'),
                new DocSign_Envelope_Event__e(Envelope_Id__c = envId, Event_Type__c = 'AllSigned'),
                new DocSign_Envelope_Event__e(Envelope_Id__c = envId, Event_Type__c = 'Sent')
            });
            DocSignEvents.publish(new List<DocSign_Envelope__c>{ env }, 'Viewed', null);
            Test.stopTest();
            Assert.areEqual('Sent', [SELECT Status__c FROM DocSign_Envelope__c WHERE Id = :envId].Status__c, 'not finalized while unsigned');
        }
    }

    @IsTest
    static void signingPageController() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Id envId = prepare('Sequential', null);
            Id r1 = DocSignTestFactory.recipientId(envId, 1);
            String t1 = DocSignTestFactory.token(r1);
            Test.startTest();
            PageReference p = Page.DocSignSign;
            p.getParameters().put('t', t1);
            p.getHeaders().put('True-Client-IP', '203.0.113.9');
            p.getHeaders().put('User-Agent', 'Mozilla/5.0 Test');
            Test.setCurrentPage(p);
            DocSignSigningController c = new DocSignSigningController();
            Assert.areEqual('sign', c.state);
            Assert.isFalse(c.viewLogged, 'constructor is read-only');
            Assert.areEqual(0, [SELECT COUNT() FROM DocSign_Audit_Event__c WHERE Envelope__c = :envId AND Event_Type__c = 'Document Viewed'], 'no GET side effects');
            c.recordView();
            Assert.isTrue(c.viewLogged);
            c.recordView();
            Assert.areEqual(1, [SELECT COUNT() FROM DocSign_Audit_Event__c WHERE Envelope__c = :envId AND Event_Type__c = 'Document Viewed'], 'view recorded once');
            Assert.isNotNull(c.documentHtml);
            Assert.isTrue(c.needsSignature);
            Assert.isNotNull(c.fieldsJson);
            Assert.isNotNull(c.consentText);
            Assert.isNotNull(c.brandColor + c.companyName + c.title + c.senderName + c.envelopeNumber + c.expiresOn + c.recipientName);
            Assert.isFalse(c.needsInitials == null);
            c.payloadJson = 'not json';
            c.submit();
            Assert.isNotNull(c.message);
            c.payloadJson = JSON.serialize(new Map<String, Object>{ 'consent' => true, 'signatureImage' => DocSignTestFactory.PNG });
            c.submit();
            Assert.areEqual('sign', c.state, 'missing required fields keeps signer on page');
            DocSignSigningService.Session s = DocSignSigningService.open(t1, null, null, null, false);
            DocSignSigningService.Submission sub = DocSignTestFactory.fullSubmission(s, null);
            c.payloadJson = JSON.serialize(new Map<String, Object>{
                'consent' => true, 'signatureImage' => sub.signatureImage, 'initialsImage' => sub.initialsImage, 'signatureMethod' => 'Typed', 'values' => sub.values
            });
            c.submit();
            Assert.areEqual('done', c.state, 'state=' + c.state + ' msg=' + c.message);
            c.verify();
            c.declineReason = 'x';
            c.decline();
            Test.stopTest();
            DocSign_Recipient__c r = [SELECT Status__c, IP_Address__c, User_Agent__c, Signature_Method__c FROM DocSign_Recipient__c WHERE Id = :r1];
            Assert.areEqual('Signed', r.Status__c);
            Assert.areEqual('203.0.113.9', r.IP_Address__c);
            Assert.areEqual('Typed', r.Signature_Method__c);
        }
    }
}
