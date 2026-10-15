/**
 * Pravadh DocSign - Certificate of Completion (HTML -> PDF).
 */
public without sharing class DocSignCertificateBuilder {
    public static String build(DocSign_Envelope__c env, List<DocSign_Recipient__c> recips, String finalHash, Datetime completed) {
        List<DocSign_Audit_Event__c> events = [
            SELECT Sequence__c, Event_Type__c, Actor_Name__c, Actor_Email__c, Event_Timestamp__c, IP_Address__c, Details__c, Hash__c
            FROM DocSign_Audit_Event__c WHERE Envelope__c = :env.Id WITH SYSTEM_MODE ORDER BY Sequence__c ASC
        ];
        Boolean intact = DocSignAuditService.verifyChain(env.Id);
        String brand = DocSignEmailService.brandColor();
        List<String> h = new List<String>();
        h.add('<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><style type="text/css">');
        h.add('@page { size: A4 portrait; margin: 16mm 14mm 16mm 14mm; @bottom-center { content: "Pravadh DocSign Certificate of Completion - Page " counter(page) " of " counter(pages); font-size: 7.5pt; color: #777; } }');
        h.add('body { font-family: Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #1b1f24; }');
        h.add('.band { background: ' + brand + '; color: #fff; padding: 12pt 14pt; } .band h1 { margin: 0; font-size: 16pt; } .band p { margin: 3pt 0 0 0; font-size: 9pt; }');
        h.add('h2 { font-size: 10.5pt; color: ' + brand + '; border-bottom: 1px solid #dde3ea; padding-bottom: 3pt; margin: 14pt 0 6pt 0; }');
        h.add('table { width: 100%; border-collapse: collapse; } td, th { padding: 4pt 5pt; border-bottom: 1px solid #eef1f5; vertical-align: top; text-align: left; } th { background: #f4f6f9; font-size: 8pt; }');
        h.add('.k { width: 30%; color: #5c6670; } .mono { font-family: Courier, monospace; font-size: 7pt; word-wrap: break-word; } .sig img { height: 34px; } .ok { color: #1a7f37; font-weight: bold; } .bad { color: #c62828; font-weight: bold; }');
        h.add('</style></head><body>');
        h.add('<div class="band"><h1>Certificate of Completion</h1><p>' + e(DocSignEmailService.companyName()) + ' &#183; Secured by Pravadh DocSign</p></div>');

        h.add('<h2>Envelope</h2><table>');
        row(h, 'Document', env.Title__c);
        row(h, 'Envelope', env.Name + ' (' + env.Envelope_Key__c + ')');
        row(h, 'Status', 'Completed');
        row(h, 'Source record', nz(env.Object_API_Name__c) + ' ' + nz(env.Record_Id__c));
        row(h, 'Sender', env.CreatedBy.Name + ' <' + nz(env.CreatedBy.Email) + '>');
        row(h, 'Signing order', env.Signing_Order__c);
        row(h, 'Created', utc(env.CreatedDate));
        row(h, 'Sent', utc(env.Sent_Date__c));
        row(h, 'Completed', utc(completed));
        h.add('<tr><td class="k">Original document SHA-256</td><td class="mono">' + e(env.Original_Hash__c) + '</td></tr>');
        h.add('<tr><td class="k">Signed document SHA-256</td><td class="mono">' + e(finalHash) + '</td></tr>');
        h.add('<tr><td class="k">Audit trail integrity</td><td>' + (intact ? '<span class="ok">Verified</span> (hash chain of ' + events.size() + ' events intact)' : '<span class="bad">NOT VERIFIED</span>') + '</td></tr>');
        h.add('</table>');

        h.add('<h2>Signers</h2><table><tr><th>Signer</th><th>Signature</th><th>Timeline (UTC)</th><th>Evidence</th></tr>');
        for (DocSign_Recipient__c r : recips) {
            String sigRef = DocSignCompletionService.imageRef(r.Signature_File_Id__c, r.Signature_Image__c);
            String sig = DocSignRenderService.isSafeImage(sigRef) ? '<img src="' + sigRef + '"/>' : '';
            h.add('<tr><td><b>' + e(r.Name) + '</b><br/>' + e(r.Email__c) + '<br/>' + e(r.Role_Label__c) + ' &#183; order ' + r.Routing_Order__c + '</td>');
            h.add('<td class="sig">' + sig + '<br/>' + e(r.Signature_Method__c) + ' signature</td>');
            h.add('<td>Sent: ' + utc(r.Sent_Date__c) + '<br/>Viewed: ' + utc(r.Viewed_Date__c) + '<br/>Consent: ' + utc(r.Consent_Date__c) + '<br/>Signed: ' + utc(r.Signed_Date__c) + '</td>');
            h.add('<td>IP: ' + e(r.IP_Address__c) + '<br/><span class="mono">' + e(r.User_Agent__c) + '</span><br/>Authentication: email link' + '</td></tr>');
        }
        h.add('</table>');

        h.add('<h2>Audit Trail</h2><table><tr><th>#</th><th>Time (UTC)</th><th>Event</th><th>Actor</th><th>IP</th><th>Details</th></tr>');
        for (DocSign_Audit_Event__c ev : events) {
            h.add('<tr><td>' + ev.Sequence__c.intValue() + '</td><td>' + utc(ev.Event_Timestamp__c) + '</td><td>' + e(ev.Event_Type__c) + '</td><td>' + e(ev.Actor_Name__c)
                + (String.isBlank(ev.Actor_Email__c) ? '' : '<br/>' + e(ev.Actor_Email__c)) + '</td><td>' + e(ev.IP_Address__c) + '</td><td>' + e(ev.Details__c)
                + '<br/><span class="mono">' + e(ev.Hash__c == null ? '' : ev.Hash__c.left(24)) + '…</span></td></tr>');
        }
        h.add('</table>');
        h.add('<p style="margin-top:14pt;color:#5c6670">Each signer consented to conduct business electronically, was authenticated through a unique link sent to their email address, '
            + 'and applied their signature through Pravadh DocSign. Every event above is sealed with a SHA-256 hash chained to the previous event.</p>');
        h.add('</body></html>');
        return String.join(h, '');
    }

    private static void row(List<String> h, String k, String v) {
        h.add('<tr><td class="k">' + e(k) + '</td><td>' + e(v) + '</td></tr>');
    }

    private static String utc(Datetime d) {
        return d == null ? '-' : d.formatGmt('yyyy-MM-dd HH:mm:ss') + ' UTC';
    }

    private static String e(String s) {
        return DocSignFormatter.escapeXml(s);
    }

    private static String nz(String s) {
        return s == null ? '' : s;
    }
}
