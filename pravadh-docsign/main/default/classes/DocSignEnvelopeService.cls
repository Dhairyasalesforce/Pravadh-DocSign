/**
 * Pravadh DocSign - envelope lifecycle for Salesforce users (and Flow):
 * create & send, status, cancel, resend. Runs with the user's sharing and CRUD/FLS.
 */
public with sharing class DocSignEnvelopeService {
    public class RecipientInput {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String email { get; set; }
        @AuraEnabled public Integer roleNumber { get; set; }
        @AuraEnabled public Integer routingOrder { get; set; }
        @AuraEnabled public String roleLabel { get; set; }
        @AuraEnabled public String accessCode { get; set; }
    }

    public class SendRequest {
        @AuraEnabled public Id documentId { get; set; }
        @AuraEnabled public List<RecipientInput> recipients { get; set; }
        @AuraEnabled public String signingOrder { get; set; }
        @AuraEnabled public String emailSubject { get; set; }
        @AuraEnabled public String emailMessage { get; set; }
        @AuraEnabled public Integer expiryDays { get; set; }
    }

    public class SendResult {
        @AuraEnabled public Id envelopeId;
        @AuraEnabled public String envelopeKey;
        @AuraEnabled public String envelopeNumber;
        @AuraEnabled public String status;
        @AuraEnabled public List<String> warnings = new List<String>();
    }

    public static SendResult createAndSend(SendRequest req) {
        if (req == null || req.documentId == null) {
            throw new DocSignException('Choose a document to send.');
        }
        if (req.recipients == null || req.recipients.isEmpty()) {
            throw new DocSignException('Add at least one signer.');
        }
        List<DocSign_Document__c> docs = [
            SELECT Id, Title__c, Format__c, Status__c, Record_Id__c, Object_API_Name__c, Template__c, Document_Hash__c,
                Merged_Html__c, Merged_Html_2__c, Merged_Html_3__c
            FROM DocSign_Document__c WHERE Id = :req.documentId WITH USER_MODE LIMIT 1
        ];
        if (docs.isEmpty()) {
            throw new DocSignException('Document not found or you do not have access to it.');
        }
        DocSign_Document__c doc = docs[0];
        if (doc.Status__c == 'Draft') {
            throw new DocSignException('Finish preparing this PDF (place the fields and save) before sending it.');
        }
        if (doc.Format__c != 'PDF') {
            throw new DocSignException('Only PDF documents (generated from HTML templates) can be sent for signature.');
        }
        Integer active = [SELECT COUNT() FROM DocSign_Envelope__c WHERE Document__c = :doc.Id AND Status__c IN :DocSignRoutingService.ACTIVE_STATUSES WITH USER_MODE];
        if (active > 0) {
            throw new DocSignException('This document already has an envelope out for signature. Cancel it before sending again.');
        }
        DocSign_Template__c t = null;
        if (doc.Template__c != null) {
            List<DocSign_Template__c> ts = [
                SELECT Id, Signing_Order__c, Default_Expiry_Days__c, Default_Email_Subject__c, Default_Email_Message__c, On_Complete_Field__c, On_Complete_Value__c
                FROM DocSign_Template__c WHERE Id = :doc.Template__c WITH USER_MODE LIMIT 1
            ];
            t = ts.isEmpty() ? null : ts[0];
        }
        String order = String.isNotBlank(req.signingOrder) ? req.signingOrder : (t != null && t.Signing_Order__c != null ? t.Signing_Order__c : 'Sequential');
        if (order != 'Sequential' && order != 'Parallel') {
            throw new DocSignException('Signing order must be Sequential or Parallel.');
        }
        String html = DocSignRenderService.readHtml(doc);
        List<DocSignRenderService.FieldSpec> specs = DocSignRenderService.parseFields(html);
        Integer requiredRoles = DocSignGenerationService.maxRole(specs);
        if (req.recipients.size() < requiredRoles) {
            throw new DocSignException('This document has signature fields for ' + requiredRoles + ' signer(s). Add at least ' + requiredRoles + ' recipients.');
        }

        // Normalise recipients
        Set<Integer> roleNumbers = new Set<Integer>();
        for (Integer i = 0; i < req.recipients.size(); i++) {
            RecipientInput r = req.recipients[i];
            if (r == null || String.isBlank(r.name) || String.isBlank(r.email)) {
                throw new DocSignException('Each signer needs a name and an email address.');
            }
            r.name = r.name.trim().left(80);
            r.email = r.email.trim().toLowerCase();
            if (!Pattern.matches('^[A-Za-z0-9._%+\'-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$', r.email)) {
                throw new DocSignException('Invalid email address: ' + r.email);
            }
            if (r.roleNumber == null || r.roleNumber < 1) {
                r.roleNumber = i + 1;
            }
            if (roleNumbers.contains(r.roleNumber)) {
                throw new DocSignException('Signer role ' + r.roleNumber + ' is assigned twice.');
            }
            roleNumbers.add(r.roleNumber);
            if (r.routingOrder == null || r.routingOrder < 1) {
                r.routingOrder = order == 'Parallel' ? 1 : r.roleNumber;
            }
        }
        for (Integer role = 1; role <= requiredRoles; role++) {
            Boolean referenced = false;
            for (DocSignRenderService.FieldSpec s : specs) {
                referenced = referenced || s.role == role;
            }
            if (referenced && !roleNumbers.contains(role)) {
                throw new DocSignException('No recipient is assigned to signer role ' + role + '.');
            }
        }

        Integer days = req.expiryDays != null && req.expiryDays > 0 ? req.expiryDays
            : (t != null && t.Default_Expiry_Days__c != null ? t.Default_Expiry_Days__c.intValue() : defaultExpiry());
        Integer firstOrder = null;
        for (RecipientInput r : req.recipients) {
            firstOrder = firstOrder == null ? r.routingOrder : Math.min(firstOrder, r.routingOrder);
        }

        DocSign_Envelope__c env = new DocSign_Envelope__c(
            Envelope_Key__c = UUID.randomUUID().toString(),
            Title__c = doc.Title__c,
            Document__c = doc.Id,
            Object_API_Name__c = doc.Object_API_Name__c,
            Record_Id__c = doc.Record_Id__c,
            Status__c = 'Prepared',
            Signing_Order__c = order,
            Current_Routing_Order__c = firstOrder,
            Expires_On__c = Datetime.now().addDays(Math.min(days, 365)),
            Email_Subject__c = String.isNotBlank(req.emailSubject) ? req.emailSubject.left(255) : (t != null ? t.Default_Email_Subject__c : null),
            Email_Message__c = String.isNotBlank(req.emailMessage) ? req.emailMessage.left(4000) : (t != null ? t.Default_Email_Message__c : null),
            Original_Hash__c = doc.Document_Hash__c,
            On_Complete_Field__c = t != null ? t.On_Complete_Field__c : null,
            On_Complete_Value__c = t != null ? t.On_Complete_Value__c : null,
            Event_Count__c = 0
        );
        insert as user env;

        Map<Integer, DocSign_Recipient__c> byRole = new Map<Integer, DocSign_Recipient__c>();
        List<DocSign_Recipient__c> recips = new List<DocSign_Recipient__c>();
        for (RecipientInput r : req.recipients) {
            DocSign_Recipient__c rec = new DocSign_Recipient__c(
                Envelope__c = env.Id,
                Name = r.name,
                Email__c = r.email,
                Role_Number__c = r.roleNumber,
                Role_Label__c = String.isNotBlank(r.roleLabel) ? r.roleLabel.left(80) : 'Signer ' + r.roleNumber,
                Routing_Order__c = r.routingOrder
                // Status__c defaults to 'Created' (picklist default); users cannot edit signing status.
            );
            recips.add(rec);
            byRole.put(r.roleNumber, rec);
        }
        insert as user recips;
        // Access codes are hashed with the recipient id as salt (needs the id first).
        List<DocSign_Recipient__c> codes = new List<DocSign_Recipient__c>();
        for (Integer i = 0; i < req.recipients.size(); i++) {
            if (String.isNotBlank(req.recipients[i].accessCode)) {
                codes.add(new DocSign_Recipient__c(Id = recips[i].Id, Access_Code_Hash__c = DocSignTokenService.hashAccessCode(recips[i].Id, req.recipients[i].accessCode)));
            }
        }
        if (!codes.isEmpty()) {
            update as user codes;
        }

        List<DocSign_Field__c> fields = new List<DocSign_Field__c>();
        Set<Integer> rolesWithFields = new Set<Integer>();
        for (DocSignRenderService.FieldSpec s : specs) {
            DocSign_Recipient__c owner = byRole.get(s.role);
            if (owner == null) {
                continue;
            }
            rolesWithFields.add(s.role);
            fields.add(newField(env.Id, owner.Id, s));
        }
        Integer autoIdx = DocSignRenderService.AUTO_FIELD_BASE;
        List<Integer> sortedRoles = new List<Integer>(byRole.keySet());
        sortedRoles.sort();
        for (Integer role : sortedRoles) {
            if (rolesWithFields.contains(role)) {
                continue;
            }
            for (String type : new List<String>{ 'Signature', 'Name', 'Date Signed' }) {
                DocSignRenderService.FieldSpec s = new DocSignRenderService.FieldSpec();
                s.index = autoIdx++;
                s.type = type;
                s.role = role;
                s.required = true;
                s.label = '';
                fields.add(newField(env.Id, byRole.get(role).Id, s));
            }
        }
        insert as user fields;

        DocSignAuditService.Entry created = DocSignAuditService.userEntry(env.Id, 'Envelope Created',
            'Envelope created with ' + recips.size() + ' recipient(s), ' + fields.size() + ' field(s), ' + order.toLowerCase() + ' signing. Expires ' + env.Expires_On__c.formatGmt('yyyy-MM-dd HH:mm') + ' UTC.');
        created.documentReference = doc.Document_Hash__c;
        DocSignAuditService.log(created);

        DocSignRoutingService.sendCurrentGroup(env.Id, 'initial', UserInfo.getName(), UserInfo.getUserEmail());

        env.Status__c = 'Sent';
        update as user new DocSign_Envelope__c(Id = env.Id, Status__c = 'Sent', Sent_Date__c = Datetime.now());
        update as user new DocSign_Document__c(Id = doc.Id, Status__c = 'Out for Signature');
        DocSignEvents.publish(env.Id, 'Sent', null);

        SendResult res = new SendResult();
        res.envelopeId = env.Id;
        res.envelopeKey = env.Envelope_Key__c;
        res.status = 'Sent';
        res.envelopeNumber = [SELECT Name FROM DocSign_Envelope__c WHERE Id = :env.Id WITH USER_MODE].Name;
        if (!DocSignEmailService.usesSite()) {
            res.warnings.add('No public Signing Site URL is configured, so signing links open inside Salesforce and require a login. Configure a Site in DocSign Settings for external signers.');
        }
        return res;
    }

    private static DocSign_Field__c newField(Id envelopeId, Id recipientId, DocSignRenderService.FieldSpec s) {
        return new DocSign_Field__c(
            Envelope__c = envelopeId,
            Recipient__c = recipientId,
            Name = (s.type + ' ' + s.index).left(80),
            Field_Type__c = s.type,
            Field_Index__c = s.index,
            Label__c = String.isBlank(s.label) ? null : s.label.left(255),
            Required__c = s.required
        );
    }

    public static Integer defaultExpiry() {
        Decimal d = DocSignEmailService.settings().Default_Expiry_Days__c;
        return d == null || d < 1 ? 30 : d.intValue();
    }

    public static DocSign_Envelope__c getEnvelope(Id envelopeId) {
        List<DocSign_Envelope__c> envs = [
            SELECT Id, Name, Envelope_Key__c, Status__c, Title__c, Document__c, Record_Id__c, Object_API_Name__c, Sent_Date__c, Completed_Date__c,
                Expires_On__c, Current_Routing_Order__c, Signing_Order__c, Signed_Version_Id__c, Certificate_Version_Id__c, Final_Hash__c, Original_Hash__c,
                Declined_Date__c, Cancelled_Date__c, Cancel_Reason__c, CreatedDate, Owner.Name
            FROM DocSign_Envelope__c
            WHERE Id = :envelopeId OR Envelope_Key__c = :String.valueOf(envelopeId)
            WITH USER_MODE LIMIT 1
        ];
        if (envs.isEmpty()) {
            throw new DocSignException('Envelope not found or you do not have access to it.');
        }
        return envs[0];
    }

    public static DocSign_Envelope__c findByKeyOrId(String keyOrId) {
        if (String.isBlank(keyOrId)) {
            throw new DocSignException('Envelope ID is required.');
        }
        String k = keyOrId.trim();
        Id asId = null;
        if (k.length() == 15 || k.length() == 18) {
            try {
                asId = Id.valueOf(k);
            } catch (Exception e) {
                asId = null;
            }
        }
        List<DocSign_Envelope__c> envs = [
            SELECT Id, Name, Envelope_Key__c, Status__c, Document__c, Record_Id__c, Object_API_Name__c, Completed_Date__c, Signed_Version_Id__c, Certificate_Version_Id__c
            FROM DocSign_Envelope__c
            WHERE Envelope_Key__c = :k OR Name = :k OR Id = :asId
            WITH USER_MODE LIMIT 1
        ];
        if (envs.isEmpty()) {
            throw new DocSignException('Envelope not found or you do not have access to it: ' + k);
        }
        return envs[0];
    }

    public static void cancel(Id envelopeId, String reason) {
        DocSign_Envelope__c env = getEnvelope(envelopeId);
        if (!DocSignRoutingService.ACTIVE_STATUSES.contains(env.Status__c) && env.Status__c != 'Prepared' && env.Status__c != 'Draft') {
            throw new DocSignException('Only envelopes that are in progress can be cancelled (current status: ' + env.Status__c + ').');
        }
        // Authorization gate: the user must be able to edit the envelope.
        update as user new DocSign_Envelope__c(Id = env.Id, Status__c = 'Cancelled', Cancelled_Date__c = Datetime.now(), Cancel_Reason__c = reason == null ? null : reason.left(255));
        DocSignLifecycle.afterCancel(env.Id, reason);
    }

    public static Integer resend(Id envelopeId) {
        DocSign_Envelope__c env = getEnvelope(envelopeId);
        if (!DocSignRoutingService.ACTIVE_STATUSES.contains(env.Status__c)) {
            throw new DocSignException('Only envelopes that are out for signature can be resent (current status: ' + env.Status__c + ').');
        }
        if (env.Expires_On__c != null && env.Expires_On__c < Datetime.now()) {
            throw new DocSignException('This envelope has expired.');
        }
        update as user new DocSign_Envelope__c(Id = env.Id, Last_Reminder_Date__c = Datetime.now());
        return DocSignRoutingService.sendCurrentGroup(env.Id, 'resend', UserInfo.getName(), UserInfo.getUserEmail());
    }
}
