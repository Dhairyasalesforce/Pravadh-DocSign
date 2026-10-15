/**
 * Pravadh DocSign - external signing service (no Salesforce license required).
 *
 * SECURITY MODEL
 *  - Signers are authenticated by a 256-bit single-purpose token delivered by email; only its SHA-256 hash is stored.
 *  - Optional access code (hashed + salted), with lockout after 5 failed attempts.
 *  - Every operation re-validates: token, envelope state, expiry, recipient state and routing order.
 *  - The signer can only read/write their own recipient row and fields of their envelope.
 *  - Runs without sharing by necessity (the Site guest user owns no records); the token is the authorization.
 *  - All values are validated server-side; Name/Email/Date are system-populated and never trusted from the client.
 */
public without sharing class DocSignSigningService {
    public static final Integer MAX_ATTEMPTS = 5;

    public class FieldDto {
        public Integer index { get; set; }
        public String type { get; set; }
        public String label { get; set; }
        public Boolean required { get; set; }
        public String value { get; set; }
    }

    public class Session {
        public Boolean ok = false;
        public String errorCode;
        public String message;
        public String state; // access | sign | signed | declined | done | error
        public Id recipientId;
        public Id envelopeId;
        public String recipientName;
        public String recipientEmail;
        public String envelopeNumber;
        public String envelopeKey;
        public String title;
        public String senderName;
        public String emailMessage;
        public String documentHtml;
        public List<FieldDto> fields = new List<FieldDto>();
        public Boolean needsSignature = false;
        public Boolean needsInitials = false;
        public String expiresOn;
        /** Names of the other signers whose (greyed) fields appear in the document. */
        public List<String> otherSigners = new List<String>();
    }

    public class Submission {
        public String accessCode;
        public Boolean consent = false;
        public String signatureImage;
        public String initialsImage;
        public String signatureMethod;
        public Map<String, String> values = new Map<String, String>();
    }

    private class Ctx {
        DocSign_Recipient__c recipient;
        DocSign_Envelope__c envelope;
    }

    // ------------------------------------------------------------------ public operations

    public static Session open(String rawToken, String accessCode, String ip, String ua, Boolean logView) {
        Session s = new Session();
        Ctx c = resolve(rawToken, s);
        if (c == null) {
            return s;
        }
        fill(s, c);
        if (c.recipient.Status__c == 'Signed') {
            s.state = 'signed';
            s.ok = true;
            return s;
        }
        if (c.recipient.Status__c == 'Declined') {
            s.state = 'declined';
            s.ok = true;
            return s;
        }
        if (!checkState(c, s)) {
            return s;
        }
        if (String.isNotBlank(c.recipient.Access_Code_Hash__c) && !verifyCode(c, accessCode, ip, ua)) {
            s.ok = true;
            s.state = 'access';
            if (String.isNotBlank(accessCode)) {
                s.message = 'The access code is incorrect.';
            }
            return s;
        }
        if (logView) {
            Datetime now = Datetime.now();
            DocSign_Recipient__c r = new DocSign_Recipient__c(Id = c.recipient.Id);
            if (c.recipient.Status__c == 'Sent') {
                r.Status__c = 'Viewed';
            }
            if (c.recipient.Viewed_Date__c == null) {
                r.Viewed_Date__c = now;
            }
            Database.update(r, AccessLevel.SYSTEM_MODE);
            if (c.envelope.Status__c == 'Sent') {
                Database.update(new DocSign_Envelope__c(Id = c.envelope.Id, Status__c = 'Viewed'), AccessLevel.SYSTEM_MODE);
                DocSignEvents.publish(c.envelope.Id, 'Viewed', c.recipient.Id);
            }
            DocSignAuditService.log(signerEntry(c, 'Document Viewed', 'Document opened by signer.', ip, ua));
        }
        buildDocument(s, c);
        s.ok = true;
        s.state = 'sign';
        return s;
    }

    public static Session submit(String rawToken, Submission sub, String ip, String ua) {
        Session s = new Session();
        Ctx c = resolve(rawToken, s);
        if (c == null) {
            return s;
        }
        fill(s, c);
        if (c.recipient.Status__c == 'Signed' || c.recipient.Status__c == 'Declined' || !checkState(c, s)) {
            if (s.errorCode == null) {
                s.state = c.recipient.Status__c == 'Signed' ? 'signed' : 'declined';
                s.ok = true;
            }
            return s;
        }
        if (String.isNotBlank(c.recipient.Access_Code_Hash__c) && !verifyCode(c, sub.accessCode, ip, ua)) {
            return fail(s, 'ACCESS', 'Access code verification is required.');
        }
        if (sub.consent != true) {
            return fail(s, 'CONSENT', 'Please agree to use electronic records and signatures before signing.');
        }
        Datetime now = Datetime.now();
        String today = now.format('d MMM yyyy');
        List<DocSign_Field__c> updates = new List<DocSign_Field__c>();
        List<DocSignAuditService.Entry> audit = new List<DocSignAuditService.Entry>();
        audit.add(signerEntry(c, 'Consent Given', 'Signer agreed to use electronic records and signatures.', ip, ua));
        Boolean usedSignature = false;
        Boolean usedInitials = false;
        for (DocSign_Field__c f : c.recipient.Fields__r) {
            String key = String.valueOf(f.Field_Index__c.intValue());
            String v = sub.values == null ? null : sub.values.get(key);
            DocSign_Field__c u = new DocSign_Field__c(Id = f.Id, Completed_Date__c = now);
            switch on f.Field_Type__c {
                when 'Signature' {
                    if (!DocSignRenderService.isSafeImage(sub.signatureImage)) {
                        return fail(s, 'SIGNATURE', 'Please adopt your signature.');
                    }
                    u.Value__c = 'Signed';
                    usedSignature = true;
                    audit.add(signerEntry(c, 'Signature Added', 'Signature applied to field ' + key + (f.Label__c == null ? '' : ' (' + f.Label__c + ')') + '.', ip, ua));
                }
                when 'Initial' {
                    if (!DocSignRenderService.isSafeImage(sub.initialsImage)) {
                        return fail(s, 'INITIALS', 'Please adopt your initials.');
                    }
                    u.Value__c = 'Initialed';
                    usedInitials = true;
                    audit.add(signerEntry(c, 'Initial Added', 'Initials applied to field ' + key + '.', ip, ua));
                }
                when 'Date Signed' {
                    u.Value__c = today;
                }
                when 'Name' {
                    u.Value__c = c.recipient.Name;
                }
                when 'Email' {
                    u.Value__c = c.recipient.Email__c;
                }
                when 'Checkbox' {
                    Boolean checked = v == 'true';
                    if (f.Required__c && !checked) {
                        return fail(s, 'REQUIRED', 'Please complete: ' + (f.Label__c == null ? 'checkbox' : f.Label__c));
                    }
                    u.Value__c = checked ? 'true' : 'false';
                    audit.add(signerEntry(c, 'Field Completed', 'Checkbox ' + key + (f.Label__c == null ? '' : ' (' + f.Label__c + ')') + ' = ' + u.Value__c + '.', ip, ua));
                }
                when else {
                    String t = v == null ? '' : v.trim();
                    if (f.Required__c && String.isBlank(t)) {
                        return fail(s, 'REQUIRED', 'Please complete: ' + (f.Label__c == null ? 'text field' : f.Label__c));
                    }
                    if (t.length() > 255) {
                        return fail(s, 'LENGTH', 'A field value is too long (max 255 characters).');
                    }
                    u.Value__c = String.isBlank(t) ? null : t;
                    audit.add(signerEntry(c, 'Field Completed', 'Text field ' + key + (f.Label__c == null ? '' : ' (' + f.Label__c + ')') + ' completed.', ip, ua));
                }
            }
            updates.add(u);
        }
        Database.update(updates, AccessLevel.SYSTEM_MODE);
        Database.update(new DocSign_Recipient__c(
            Id = c.recipient.Id,
            Status__c = 'Signed',
            Signed_Date__c = now,
            Consent_Date__c = now,
            IP_Address__c = DocSignAuditService.cut(ip, 64),
            User_Agent__c = DocSignAuditService.cut(ua, 255),
            Signature_Image__c = usedSignature ? sub.signatureImage : null,
            Initials_Image__c = usedInitials ? sub.initialsImage : null,
            Signature_Method__c = sub.signatureMethod == 'Typed' ? 'Typed' : 'Drawn'
        ), AccessLevel.SYSTEM_MODE);
        audit.add(signerEntry(c, 'Recipient Signed', c.recipient.Name + ' completed signing.', ip, ua));
        DocSignAuditService.log(audit);
        DocSignRoutingService.advance(c.envelope.Id);
        s.ok = true;
        s.state = 'done';
        return s;
    }

    public static Session decline(String rawToken, String accessCode, String reason, String ip, String ua) {
        Session s = new Session();
        Ctx c = resolve(rawToken, s);
        if (c == null) {
            return s;
        }
        fill(s, c);
        if (c.recipient.Status__c == 'Signed' || c.recipient.Status__c == 'Declined' || !checkState(c, s)) {
            return s.errorCode != null ? s : fail(s, 'STATE', 'This document can no longer be declined.');
        }
        if (String.isNotBlank(c.recipient.Access_Code_Hash__c) && !verifyCode(c, accessCode, ip, ua)) {
            return fail(s, 'ACCESS', 'Access code verification is required.');
        }
        if (String.isBlank(reason)) {
            return fail(s, 'REASON', 'Please tell the sender why you are declining.');
        }
        Datetime now = Datetime.now();
        Database.update(new DocSign_Recipient__c(Id = c.recipient.Id, Status__c = 'Declined', Declined_Date__c = now, Decline_Reason__c = reason.left(4000),
            IP_Address__c = DocSignAuditService.cut(ip, 64), User_Agent__c = DocSignAuditService.cut(ua, 255)), AccessLevel.SYSTEM_MODE);
        Database.update(new DocSign_Envelope__c(Id = c.envelope.Id, Status__c = 'Declined', Declined_Date__c = now), AccessLevel.SYSTEM_MODE);
        if (c.envelope.Document__c != null) {
            Database.update(new DocSign_Document__c(Id = c.envelope.Document__c, Status__c = 'Declined'), AccessLevel.SYSTEM_MODE);
        }
        List<DocSign_Recipient__c> others = [SELECT Id FROM DocSign_Recipient__c WHERE Envelope__c = :c.envelope.Id AND Id != :c.recipient.Id AND Token_Hash__c != null WITH SYSTEM_MODE];
        for (DocSign_Recipient__c o : others) {
            o.Token_Hash__c = null;
        }
        Database.update(others, AccessLevel.SYSTEM_MODE);
        DocSignAuditService.log(signerEntry(c, 'Document Declined', 'Declined by signer. Reason: ' + reason.left(2000), ip, ua));
        DocSignEvents.publish(c.envelope.Id, 'Declined', c.recipient.Id);
        s.ok = true;
        s.state = 'declined';
        return s;
    }

    // ------------------------------------------------------------------ internals

    private static Ctx resolve(String rawToken, Session s) {
        if (!DocSignTokenService.isValidTokenFormat(rawToken)) {
            fail(s, 'INVALID', 'This signing link is invalid or has been replaced by a newer one.');
            return null;
        }
        String h = DocSignTokenService.hash(rawToken);
        List<DocSign_Recipient__c> rs = [
            SELECT Id, Name, Email__c, Status__c, Routing_Order__c, Role_Number__c, Access_Code_Hash__c, Failed_Access_Attempts__c, Viewed_Date__c, Envelope__c,
                (SELECT Id, Field_Type__c, Field_Index__c, Label__c, Required__c, Value__c FROM Fields__r ORDER BY Field_Index__c)
            FROM DocSign_Recipient__c
            WHERE Token_Hash__c = :h
            WITH SYSTEM_MODE LIMIT 1
        ];
        if (rs.isEmpty()) {
            fail(s, 'INVALID', 'This signing link is invalid or has been replaced by a newer one.');
            return null;
        }
        Ctx c = new Ctx();
        c.recipient = rs[0];
        c.envelope = [
            SELECT Id, Name, Envelope_Key__c, Title__c, Status__c, Expires_On__c, Current_Routing_Order__c, Email_Message__c, Document__c, Owner.Name
            FROM DocSign_Envelope__c WHERE Id = :c.recipient.Envelope__c WITH SYSTEM_MODE LIMIT 1
        ];
        return c;
    }

    private static Boolean checkState(Ctx c, Session s) {
        String st = c.envelope.Status__c;
        if (st == 'Completed') {
            fail(s, 'COMPLETED', 'This document has already been completed by all parties.');
            return false;
        }
        if (st == 'Cancelled' || st == 'Declined') {
            fail(s, 'VOID', 'This signature request is no longer active (' + st.toLowerCase() + ').');
            return false;
        }
        if (st == 'Expired' || (c.envelope.Expires_On__c != null && c.envelope.Expires_On__c < Datetime.now())) {
            fail(s, 'EXPIRED', 'This signature request has expired. Please contact the sender.');
            return false;
        }
        if (!DocSignRoutingService.ACTIVE_STATUSES.contains(st)) {
            fail(s, 'STATE', 'This document is not ready for signing.');
            return false;
        }
        if (c.recipient.Routing_Order__c != c.envelope.Current_Routing_Order__c) {
            fail(s, 'WAITING', 'It is not your turn to sign yet. You will receive an email when it is.');
            return false;
        }
        if (c.recipient.Failed_Access_Attempts__c != null && c.recipient.Failed_Access_Attempts__c >= MAX_ATTEMPTS) {
            fail(s, 'LOCKED', 'Too many incorrect access code attempts. Ask the sender to resend the document.');
            return false;
        }
        return true;
    }

    private static Boolean verifyCode(Ctx c, String code, String ip, String ua) {
        if (String.isBlank(code)) {
            return false;
        }
        Boolean ok = DocSignTokenService.hashAccessCode(c.recipient.Id, code) == c.recipient.Access_Code_Hash__c;
        if (!ok) {
            Decimal n = (c.recipient.Failed_Access_Attempts__c == null ? 0 : c.recipient.Failed_Access_Attempts__c) + 1;
            Database.update(new DocSign_Recipient__c(Id = c.recipient.Id, Failed_Access_Attempts__c = n), AccessLevel.SYSTEM_MODE);
            c.recipient.Failed_Access_Attempts__c = n;
            DocSignAuditService.log(signerEntry(c, 'Access Code Failed', 'Incorrect access code (attempt ' + n + ').', ip, ua));
        }
        return ok;
    }

    private static void fill(Session s, Ctx c) {
        s.recipientId = c.recipient.Id;
        s.envelopeId = c.envelope.Id;
        s.recipientName = c.recipient.Name;
        s.recipientEmail = c.recipient.Email__c;
        s.envelopeNumber = c.envelope.Name;
        s.envelopeKey = c.envelope.Envelope_Key__c;
        s.title = c.envelope.Title__c;
        s.senderName = c.envelope.Owner.Name;
        s.emailMessage = c.envelope.Email_Message__c;
        s.expiresOn = c.envelope.Expires_On__c == null ? null : c.envelope.Expires_On__c.format('d MMM yyyy');
    }

    private static void buildDocument(Session s, Ctx c) {
        DocSign_Document__c doc = [SELECT Merged_Html__c, Merged_Html_2__c, Merged_Html_3__c, Source_Type__c FROM DocSign_Document__c WHERE Id = :c.envelope.Document__c WITH SYSTEM_MODE LIMIT 1];
        List<DocSign_Field__c> all = [
            SELECT Field_Type__c, Field_Index__c, Label__c, Required__c, Value__c, Recipient__c, Recipient__r.Role_Number__c,
                Recipient__r.Signature_Image__c, Recipient__r.Initials_Image__c, Recipient__r.Name, Recipient__r.Role_Label__c
            FROM DocSign_Field__c WHERE Envelope__c = :c.envelope.Id WITH SYSTEM_MODE ORDER BY Field_Index__c
        ];
        Map<Integer, DocSignRenderService.FieldValue> values = new Map<Integer, DocSignRenderService.FieldValue>();
        List<DocSignRenderService.FieldSpec> auto = new List<DocSignRenderService.FieldSpec>();
        String today = Datetime.now().format('d MMM yyyy');
        List<String> others = new List<String>();
        for (DocSign_Field__c f : all) {
            Integer idx = f.Field_Index__c.intValue();
            Boolean mine = f.Recipient__c == c.recipient.Id;
            DocSignRenderService.FieldValue v = new DocSignRenderService.FieldValue();
            v.type = f.Field_Type__c;
            v.mine = mine;
            v.label = f.Label__c;
            if (mine) {
                if (f.Field_Type__c == 'Name') {
                    v.value = c.recipient.Name;
                } else if (f.Field_Type__c == 'Email') {
                    v.value = c.recipient.Email__c;
                } else if (f.Field_Type__c == 'Date Signed') {
                    v.value = today;
                }
                FieldDto d = new FieldDto();
                d.index = idx;
                d.type = f.Field_Type__c;
                d.label = f.Label__c;
                d.required = f.Required__c;
                d.value = v.value;
                s.fields.add(d);
                s.needsSignature = s.needsSignature || f.Field_Type__c == 'Signature';
                s.needsInitials = s.needsInitials || f.Field_Type__c == 'Initial';
            } else {
                v.owner = f.Recipient__r == null ? null : f.Recipient__r.Name;
                if (!others.contains(v.owner) && String.isNotBlank(v.owner)) {
                    others.add(v.owner);
                }
                v.value = f.Field_Type__c == 'Signature' || f.Field_Type__c == 'Initial' ? null : f.Value__c;
                v.image = f.Field_Type__c == 'Signature' && f.Value__c != null ? f.Recipient__r.Signature_Image__c
                    : (f.Field_Type__c == 'Initial' && f.Value__c != null ? f.Recipient__r.Initials_Image__c : null);
            }
            values.put(idx, v);
            if (idx >= DocSignRenderService.AUTO_FIELD_BASE) {
                auto.add(toSpec(f));
            }
        }
        String html = DocSignRenderService.appendAutoBlock(DocSignRenderService.readHtml(doc), auto);
        html = DocSignRenderService.renderFields(html, DocSignRenderService.FieldMode.SIGNING, values, c.envelope.Name);
        s.otherSigners = others;
        // Uploaded PDFs: page images are fetched one at a time by the signing page (keeps the page light).
        s.documentHtml = doc.Source_Type__c == 'Uploaded PDF' ? DocSignPdfLayout.lazyImages(html) : DocSignRenderService.resolveImages(html, true);
    }

    /**
     * Returns one page image of an uploaded PDF to a signer. Authorized by the signing token and
     * restricted to the page images registered on that envelope's document.
     */
    public static String pageImage(String rawToken, String versionId) {
        Session s = new Session();
        Ctx c = resolve(rawToken, s);
        if (c == null || c.recipient.Status__c == 'Declined' || !checkState(c, s)) {
            throw new DocSignException('This signing link is not active.');
        }
        if (String.isBlank(versionId) || !Pattern.matches('068[A-Za-z0-9]{12}([A-Za-z0-9]{3})?', versionId)) {
            throw new DocSignException('Invalid page.');
        }
        DocSign_Document__c doc = [SELECT Page_Images__c FROM DocSign_Document__c WHERE Id = :c.envelope.Document__c WITH SYSTEM_MODE LIMIT 1];
        if (!DocSignPdfLayout.pageVersionIds(doc.Page_Images__c).contains(versionId)) {
            throw new DocSignException('Invalid page.');
        }
        Id vid = Id.valueOf(versionId);
        ContentVersion cv = [SELECT VersionData FROM ContentVersion WHERE Id = :vid WITH SYSTEM_MODE LIMIT 1];
        return 'data:image/jpeg;base64,' + EncodingUtil.base64Encode(cv.VersionData);
    }

    public static DocSignRenderService.FieldSpec toSpec(DocSign_Field__c f) {
        DocSignRenderService.FieldSpec sp = new DocSignRenderService.FieldSpec();
        sp.index = f.Field_Index__c.intValue();
        sp.type = f.Field_Type__c;
        sp.role = f.Recipient__r == null || f.Recipient__r.Role_Number__c == null ? 1 : f.Recipient__r.Role_Number__c.intValue();
        sp.required = f.Required__c;
        sp.label = f.Label__c == null ? '' : f.Label__c;
        return sp;
    }

    private static DocSignAuditService.Entry signerEntry(Ctx c, String type, String details, String ip, String ua) {
        DocSignAuditService.Entry e = new DocSignAuditService.Entry(c.envelope.Id, type);
        e.recipientId = c.recipient.Id;
        e.actorName = c.recipient.Name;
        e.actorEmail = c.recipient.Email__c;
        e.ip = ip;
        e.userAgent = ua;
        e.details = details;
        return e;
    }

    private static Session fail(Session s, String code, String msg) {
        s.ok = false;
        s.errorCode = code;
        s.message = msg;
        s.state = 'error';
        return s;
    }
}
