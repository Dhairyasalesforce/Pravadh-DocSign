/**
 * Pravadh DocSign - branded transactional email (signing requests, reminders, completion, decline, void).
 */
public inherited sharing class DocSignEmailService {
    public static String lastError;

    public static DocSign_Settings__c settings() {
        DocSign_Settings__c s = DocSign_Settings__c.getOrgDefaults();
        return s == null ? new DocSign_Settings__c() : s;
    }

    public static String brandColor() {
        String c = settings().Brand_Color__c;
        return String.isNotBlank(c) && Pattern.matches('#[0-9A-Fa-f]{3,6}', c) ? c : '#0B5CAB';
    }

    public static String companyName() {
        String c = settings().Company_Name__c;
        return String.isNotBlank(c) ? c : UserInfo.getOrganizationName();
    }

    public static Boolean usesSite() {
        return String.isNotBlank(settings().Signing_Site_Url__c);
    }

    public static String signingUrl(String rawToken) {
        String base = settings().Signing_Site_Url__c;
        String page = DocSignSchemaService.nsPage('DocSignSign');
        String root = String.isNotBlank(base) ? base.trim().removeEnd('/') + '/' : URL.getOrgDomainUrl().toExternalForm() + '/apex/';
        return root + page + '?t=' + EncodingUtil.urlEncode(rawToken, 'UTF-8');
    }

    public static Messaging.SingleEmailMessage signingRequest(DocSign_Envelope__c env, DocSign_Recipient__c r, String link, String kind, String senderName) {
        String title = String.isNotBlank(env.Title__c) ? env.Title__c : 'Document';
        String subject = String.isNotBlank(env.Email_Subject__c) ? env.Email_Subject__c : 'Please sign: ' + title;
        if (kind == 'reminder') {
            subject = 'Reminder: ' + subject;
        }
        List<String> b = new List<String>();
        b.add('<p style="margin:0 0 12px 0">Hello ' + esc(r.Name) + ',</p>');
        b.add('<p style="margin:0 0 12px 0">' + esc(senderName) + ' has sent you <b>' + esc(title) + '</b> to review and sign electronically.</p>');
        if (String.isNotBlank(env.Email_Message__c)) {
            b.add('<div style="margin:0 0 16px 0;padding:12px 14px;background:#f4f6f9;border-left:3px solid ' + brandColor() + ';white-space:pre-wrap">' + esc(env.Email_Message__c) + '</div>');
        }
        b.add(button(link, 'Review &amp; Sign'));
        if (kind != 'initial') {
            b.add('<p style="font-size:12px;color:#5c6670">This link replaces any earlier signing link you received for this document.</p>');
        }
        if (env.Expires_On__c != null) {
            b.add('<p style="font-size:12px;color:#5c6670">This request expires on ' + esc(env.Expires_On__c.format('d MMM yyyy')) + '.</p>');
        }
        b.add('<p style="font-size:12px;color:#5c6670">Do not forward this email: the link is personal to you. Envelope ' + esc(env.Name) + '.</p>');
        return build(r.Email__c, subject, String.join(b, ''), null);
    }

    public static Messaging.SingleEmailMessage notice(String toAddress, String subject, String headline, String bodyHtml, List<Messaging.EmailFileAttachment> atts) {
        String html = '<p style="margin:0 0 12px 0;font-size:16px;font-weight:600">' + esc(headline) + '</p>' + bodyHtml;
        return build(toAddress, subject, html, atts);
    }

    private static Messaging.SingleEmailMessage build(String toAddress, String subject, String innerHtml, List<Messaging.EmailFileAttachment> atts) {
        Messaging.SingleEmailMessage m = new Messaging.SingleEmailMessage();
        m.setToAddresses(new List<String>{ toAddress });
        m.setSubject(subject.left(250));
        m.setHtmlBody(wrap(innerHtml));
        m.setPlainTextBody(innerHtml.replaceAll('<[^>]+>', ' ').replace('&amp;', '&').normalizeSpace());
        m.setSaveAsActivity(false);
        m.setUseSignature(false);
        String owea = settings().Org_Wide_Email_Id__c;
        if (String.isNotBlank(owea)) {
            m.setOrgWideEmailAddressId(owea);
        } else {
            m.setSenderDisplayName(companyName().left(100));
        }
        if (atts != null && !atts.isEmpty()) {
            m.setFileAttachments(atts);
        }
        return m;
    }

    public static List<Messaging.SendEmailResult> send(List<Messaging.SingleEmailMessage> msgs) {
        if (msgs == null || msgs.isEmpty()) {
            return new List<Messaging.SendEmailResult>();
        }
        try {
            return Messaging.sendEmail(msgs, false);
        } catch (Exception e) {
            // e.g. org email deliverability set to "System email only": never block the signing workflow.
            lastError = e.getMessage();
            return new List<Messaging.SendEmailResult>();
        }
    }

    public static String button(String link, String label) {
        return '<p style="margin:20px 0"><a href="' + esc(link) + '" style="background:' + brandColor()
            + ';color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">' + label + '</a></p>';
    }

    private static String wrap(String innerContent) {
        return '<div style="background:#eef1f5;padding:24px 0;font-family:Helvetica,Arial,sans-serif;color:#1b1f24">'
            + '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde3ea">'
            + '<div style="background:' + brandColor() + ';color:#ffffff;padding:16px 22px;font-size:15px;font-weight:600">' + esc(companyName()) + '</div>'
            + '<div style="padding:22px;font-size:14px;line-height:1.5">' + innerContent + '</div>'
            + '<div style="padding:12px 22px;border-top:1px solid #eef1f5;font-size:11px;color:#8a949e">Secured by Pravadh DocSign &#183; Any Object. Any Document. Any Signature.</div>'
            + '</div></div>';
    }

    public static String esc(String s) {
        return DocSignFormatter.escapeXml(s);
    }
}
