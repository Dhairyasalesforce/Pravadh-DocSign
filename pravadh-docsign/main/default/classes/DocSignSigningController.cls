/**
 * Pravadh DocSign - controller for the public signing page (Salesforce Site, guest user).
 * All authorization is delegated to DocSignSigningService (token + optional access code).
 * This controller does no SOQL or DML itself, so it runs with sharing; only the token-checked
 * service it calls is declared without sharing.
 */
public with sharing class DocSignSigningController {
    public String token { get; private set; }
    public String accessCode { get; set; }
    public String payloadJson { get; set; }
    public String declineReason { get; set; }
    public String state { get; private set; }
    public String message { get; private set; }
    /** True once the "Document Viewed" event has been recorded for this page session. */
    public Boolean viewLogged { get; private set; }
    private transient DocSignSigningService.Session session;

    public DocSignSigningController() {
        String raw = ApexPages.currentPage().getParameters().get('t');
        // Tokens are URL-safe base64; anything else is rejected before use (and never rendered).
        token = DocSignTokenService.isValidTokenFormat(raw) ? raw.escapeHtml4() : null;
        // Read-only here: Visualforce forbids DML in constructors, and the page has no load action
        // (no GET side effects). The view is recorded by recordView(), a CSRF-protected postback.
        viewLogged = false;
        load(false);
    }

    /**
     * Records "Document Viewed" (recipient/envelope status + audit event). Called once by the signing
     * page through an apex:actionFunction postback after it has rendered, so the view-state CSRF
     * protection applies and link scanners that only fetch the URL do not mark documents as viewed.
     */
    public PageReference recordView() {
        if (viewLogged != true) {
            load(true);
            viewLogged = state == 'sign';
        }
        return null;
    }

    private void load(Boolean logView) {
        session = DocSignSigningService.open(token, accessCode, clientIp(), userAgent(), logView);
        state = session.state;
        message = session.message;
    }

    public PageReference verify() {
        load(true);
        viewLogged = state == 'sign';
        return null;
    }

    public PageReference submit() {
        DocSignSigningService.Submission sub = new DocSignSigningService.Submission();
        sub.accessCode = accessCode;
        try {
            Map<String, Object> p = (Map<String, Object>) JSON.deserializeUntyped(payloadJson == null ? '{}' : payloadJson);
            sub.consent = p.get('consent') == true;
            sub.signatureImage = (String) p.get('signatureImage');
            sub.initialsImage = (String) p.get('initialsImage');
            sub.signatureMethod = (String) p.get('signatureMethod');
            Object vals = p.get('values');
            if (vals instanceof Map<String, Object>) {
                for (String k : ((Map<String, Object>) vals).keySet()) {
                    Object v = ((Map<String, Object>) vals).get(k);
                    sub.values.put(k, v == null ? null : String.valueOf(v));
                }
            }
        } catch (Exception e) {
            state = 'sign';
            load(false);
            message = 'We could not read your submission. Please try again.';
            return null;
        }
        payloadJson = null;
        DocSignSigningService.Session res = DocSignSigningService.submit(token, sub, clientIp(), userAgent());
        if (!res.ok && (res.errorCode == 'SIGNATURE' || res.errorCode == 'INITIALS' || res.errorCode == 'REQUIRED' || res.errorCode == 'CONSENT' || res.errorCode == 'LENGTH')) {
            load(false);
            message = res.message;
            return null;
        }
        session = res;
        state = res.state;
        message = res.message;
        return null;
    }

    public PageReference decline() {
        DocSignSigningService.Session res = DocSignSigningService.decline(token, accessCode, declineReason, clientIp(), userAgent());
        if (!res.ok && res.errorCode == 'REASON') {
            load(false);
            message = res.message;
            return null;
        }
        session = res;
        state = res.state;
        message = res.message;
        return null;
    }

    public String jsToken {
        get { return token == null ? '' : token; }
    }

    // ------------------------------------------------------------------ view model

    /** "Your fields are highlighted…" helper text for the signing page. */
    public String othersText {
        get {
            if (session == null || session.otherSigners == null || session.otherSigners.isEmpty()) {
                return '';
            }
            return String.join(session.otherSigners, ', ');
        }
    }

    public String recipientName {
        get { return session == null ? '' : session.recipientName; }
    }
    public String title {
        get { return session == null || session.title == null ? 'Document' : session.title; }
    }
    public String senderName {
        get { return session == null ? '' : session.senderName; }
    }
    public String emailMessage {
        get { return session == null ? '' : session.emailMessage; }
    }
    public String envelopeNumber {
        get { return session == null ? '' : session.envelopeNumber; }
    }
    public String expiresOn {
        get { return session == null ? '' : session.expiresOn; }
    }
    public String documentHtml {
        get { return session == null || session.documentHtml == null ? '' : session.documentHtml; }
    }
    public String fieldsJson {
        get { return JSON.serialize(session == null ? new List<DocSignSigningService.FieldDto>() : session.fields); }
    }
    public Boolean needsSignature {
        get { return session != null && session.needsSignature; }
    }
    public Boolean needsInitials {
        get { return session != null && session.needsInitials; }
    }
    public String brandColor {
        get { return DocSignEmailService.brandColor(); }
    }
    public String companyName {
        get { return DocSignEmailService.companyName(); }
    }
    public String consentText {
        get {
            String c = DocSignEmailService.settings().Consent_Text__c;
            return String.isNotBlank(c) ? c
                : 'I agree to use electronic records and signatures, and I understand that my electronic signature is the legal equivalent of my handwritten signature.';
        }
    }

    // ------------------------------------------------------------------ request evidence

    private static String clientIp() {
        Map<String, String> h = ApexPages.currentPage() == null ? new Map<String, String>() : ApexPages.currentPage().getHeaders();
        for (String k : new List<String>{ 'True-Client-IP', 'X-Salesforce-SIP', 'X-Forwarded-For' }) {
            if (String.isNotBlank(h.get(k))) {
                return h.get(k).split(',')[0].trim().left(64);
            }
        }
        return null;
    }

    private static String userAgent() {
        Map<String, String> h = ApexPages.currentPage() == null ? new Map<String, String>() : ApexPages.currentPage().getHeaders();
        String ua = h.get('User-Agent');
        return ua == null ? null : ua.left(255);
    }
}
