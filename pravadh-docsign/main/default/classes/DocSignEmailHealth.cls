/**
 * Pravadh DocSign - email delivery health: which address signing emails are sent from, whether its
 * domain is verified in Salesforce (active DKIM key), and a "send test email" check for admins.
 * Salesforce only sends from verified domains; otherwise it may use a substitute sender address and
 * mailbox providers can delay or drop the message even though Salesforce accepted it.
 */
public with sharing class DocSignEmailHealth {
    private static final Set<String> PUBLIC_DOMAINS = new Set<String>{
        'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'rediffmail.com'
    };

    public class Health {
        @AuraEnabled public String senderAddress;
        @AuraEnabled public String domain;
        @AuraEnabled public Boolean orgWide = false;
        /** active | pending (key created, not active yet) | missing | public | unknown */
        @AuraEnabled public String dkim = 'unknown';
        /** Selector of the DKIM key found for the domain (e.g. sf1), for the setup guide. */
        @AuraEnabled public String dkimSelector;
        /** ok | warn | info */
        @AuraEnabled public String level = 'info';
        @AuraEnabled public String message;
    }

    public class TestResult {
        @AuraEnabled public Boolean ok = false;
        @AuraEnabled public String message;
    }

    public static Health check() {
        Health h = new Health();
        String owea = DocSignEmailService.settings().Org_Wide_Email_Id__c;
        if (String.isNotBlank(owea)) {
            List<OrgWideEmailAddress> rows = [SELECT Address FROM OrgWideEmailAddress WHERE Id = :owea WITH USER_MODE LIMIT 1];
            if (!rows.isEmpty()) {
                h.senderAddress = rows[0].Address;
                h.orgWide = true;
            }
        }
        if (String.isBlank(h.senderAddress)) {
            h.senderAddress = UserInfo.getUserEmail();
        }
        h.domain = String.isBlank(h.senderAddress) ? '' : h.senderAddress.substringAfter('@').toLowerCase();
        if (PUBLIC_DOMAINS.contains(h.domain)) {
            h.dkim = 'public';
        } else {
            h.dkim = dkimStatus(h.domain);
            h.dkimSelector = lastSelector;
        }
        String who = h.orgWide ? 'the organization-wide address ' + h.senderAddress : 'the sending user\'s address (' + h.senderAddress + ')';
        if (h.dkim == 'active') {
            h.level = 'ok';
            h.message = 'Signing emails are sent from ' + who + '. The domain ' + h.domain + ' has an active DKIM key.';
        } else if (h.dkim == 'pending') {
            h.level = 'warn';
            h.message = 'Signing emails are sent from ' + who + '. A DKIM key (' + h.dkimSelector + ') exists for ' + h.domain
                + ' but is not active yet: add its two CNAME records to your DNS, wait until Salesforce shows it as published, then click Activate in Setup > DKIM Keys.';
        } else if (h.dkim == 'missing') {
            h.level = 'warn';
            h.message = 'Signing emails are sent from ' + who + ', but ' + h.domain + ' is not verified in Salesforce (no active DKIM key). '
                + 'Salesforce may send from a substitute address and Gmail or Outlook can delay or drop the email. Verify the domain in Setup > DKIM Keys.';
        } else if (h.dkim == 'public') {
            h.level = 'warn';
            h.message = 'Signing emails are sent from ' + h.senderAddress + '. Public mailbox domains like ' + h.domain
                + ' cannot be verified in Salesforce, so delivery is unreliable. Use an organization-wide address on your company domain.';
        } else {
            h.message = 'Signing emails are sent from ' + who + '. Domain verification could not be checked; use Send test email to confirm delivery.';
        }
        if (!h.orgWide) {
            h.message += ' Tip: choose an organization-wide address under "Send emails from" so every signing email comes from one company address.';
        }
        return h;
    }

    private static String lastSelector;

    /**
     * active if an active DKIM key covers the domain, pending if a key exists but is not active,
     * missing if there is none, unknown if the check is not possible.
     */
    public static String dkimStatus(String domain) {
        lastSelector = null;
        if (String.isBlank(domain)) {
            return 'unknown';
        }
        try {
            List<SObject> keys = Database.query('SELECT Domain, IsActive, Selector FROM EmailDomainKey LIMIT 200', AccessLevel.USER_MODE);
            String result = 'missing';
            for (SObject k : keys) {
                String d = String.valueOf(k.get('Domain')).toLowerCase();
                if (domain == d || domain.endsWith('.' + d)) {
                    lastSelector = String.valueOf(k.get('Selector'));
                    if (k.get('IsActive') == true) {
                        return 'active';
                    }
                    result = 'pending';
                }
            }
            return result;
        } catch (Exception e) {
            return 'unknown';
        }
    }

    /** Sends a short test email (admins only) and reports whether Salesforce accepted it. */
    public static TestResult sendTest(String toAddress) {
        if (!DocSignHomeController.isAdmin()) {
            throw new DocSignException('Only Pravadh DocSign admins can send test emails.');
        }
        String to = toAddress == null ? '' : toAddress.trim();
        if (!Pattern.matches('[A-Za-z0-9._%+\'-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', to)) {
            throw new DocSignException('Enter a valid email address.');
        }
        Messaging.SingleEmailMessage m = DocSignEmailService.notice(
            to,
            'Pravadh DocSign test email',
            'Your signing emails can reach this inbox',
            '<p>This is a test from Pravadh DocSign in ' + DocSignEmailService.esc(UserInfo.getOrganizationName()) + '. '
                + 'If you received it, signing requests will be delivered the same way.</p>',
            null
        );
        DocSignEmailService.lastError = null;
        List<Messaging.SendEmailResult> res = DocSignEmailService.send(new List<Messaging.SingleEmailMessage>{ m });
        TestResult r = new TestResult();
        r.ok = !res.isEmpty() && res[0].isSuccess();
        if (r.ok) {
            r.message = 'Salesforce accepted the test email for ' + to + '. If it does not arrive within 5 minutes (check spam), '
                + 'request a log in Setup > Email Log Files and verify your sending domain in Setup > DKIM Keys.';
        } else {
            String why = !res.isEmpty() && !res[0].getErrors().isEmpty() ? res[0].getErrors()[0].getMessage() : DocSignEmailService.lastError;
            r.message = 'Salesforce did not send the email: ' + (why == null ? 'unknown error' : why)
                + '. Check Setup > Deliverability (Access level must be "All email").';
        }
        return r;
    }
}
