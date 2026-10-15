/**
 * Pravadh DocSign - post-install script.
 *
 * On every install and upgrade of the managed package, sends one email to Pravadh Labs
 * (inquire@pravadhlabs.com) with the contact details of the person who installed it and
 * the company details of the org, so Pravadh Labs can offer onboarding and support.
 * This is disclosed in the README, the install guide and on the install page.
 *
 * Runs in the install context, which has no user session: it reads only the installing
 * User and the Organization record, makes no callouts, writes no records, and never
 * blocks an install (all errors are swallowed). Source (unmanaged) deploys do not run it.
 */
global without sharing class DocSignInstallHandler implements InstallHandler {
    public static final String NOTIFY_ADDRESS = 'inquire@pravadhlabs.com';

    @TestVisible
    private static Messaging.SingleEmailMessage lastMessage;

    global void onInstall(InstallContext context) {
        try {
            Messaging.SingleEmailMessage m = buildMessage(context);
            lastMessage = m;
            if (!Test.isRunningTest()) {
                Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ m }, false);
            }
        } catch (Exception e) {
            // Never fail an install because the notice could not be sent
            // (for example a sandbox with email deliverability set to "System email only").
            System.debug(LoggingLevel.WARN, 'Pravadh DocSign install notice not sent: ' + e.getMessage());
        }
    }

    @TestVisible
    private static Messaging.SingleEmailMessage buildMessage(InstallContext context) {
        Organization org = [
            SELECT Id, Name, Phone, Street, City, State, PostalCode, Country, OrganizationType, IsSandbox, InstanceName
            FROM Organization
            LIMIT 1
        ];
        User u;
        if (context != null && context.installerId() != null) {
            List<User> users = [
                SELECT FirstName, LastName, Email, Phone, MobilePhone, Title, CompanyName, Street, City, State, PostalCode, Country, Username
                FROM User
                WHERE Id = :context.installerId()
                LIMIT 1
            ];
            u = users.isEmpty() ? null : users[0];
        }

        String kind = context == null ? 'Install' : context.isPush() ? 'Push upgrade' : context.isUpgrade() ? 'Upgrade' : 'New install';
        String previous = '';
        if (context != null && context.previousVersion() != null) {
            Version pv = context.previousVersion();
            previous = String.valueOf(pv.major()) + '.' + String.valueOf(pv.minor()) + (pv.patch() == null ? '' : '.' + String.valueOf(pv.patch()));
        }

        List<String[]> rows = new List<String[]>{
            new String[]{ 'Event', kind + (String.isBlank(previous) ? '' : ' (from ' + previous + ')') },
            new String[]{ 'First name', u == null ? '' : u.FirstName },
            new String[]{ 'Last name', u == null ? '' : u.LastName },
            new String[]{ 'Email', u == null ? '' : u.Email },
            new String[]{ 'Phone', u == null ? '' : firstNonBlank(u.Phone, u.MobilePhone) },
            new String[]{ 'Title', u == null ? '' : u.Title },
            new String[]{ 'Company', firstNonBlank(u == null ? null : u.CompanyName, org.Name) },
            new String[]{ 'Address', address(
                u == null ? null : u.Street, u == null ? null : u.City, u == null ? null : u.State,
                u == null ? null : u.PostalCode, u == null ? null : u.Country) },
            new String[]{ 'Username', u == null ? '' : u.Username },
            new String[]{ 'Org name', org.Name },
            new String[]{ 'Org Id', String.valueOf(org.Id) },
            new String[]{ 'Org edition', org.OrganizationType + (org.IsSandbox ? ' (sandbox)' : '') },
            new String[]{ 'Org phone', org.Phone },
            new String[]{ 'Org address', address(org.Street, org.City, org.State, org.PostalCode, org.Country) },
            new String[]{ 'Instance', org.InstanceName }
        };

        List<String> text = new List<String>();
        List<String> html = new List<String>{ '<p>Pravadh DocSign was installed.</p><table cellpadding="4" style="border-collapse:collapse">' };
        for (String[] r : rows) {
            String v = r[1] == null ? '' : r[1];
            text.add(r[0] + ': ' + v);
            html.add('<tr><th align="left" style="border-bottom:1px solid #ddd">' + r[0].escapeHtml4() + '</th><td style="border-bottom:1px solid #ddd">' + v.escapeHtml4() + '</td></tr>');
        }
        html.add('</table>');

        String who = u == null ? '' : (firstNonBlank(u.FirstName, '') + ' ' + firstNonBlank(u.LastName, '')).trim();
        Messaging.SingleEmailMessage m = new Messaging.SingleEmailMessage();
        m.setToAddresses(new List<String>{ NOTIFY_ADDRESS });
        m.setSubject(('Pravadh DocSign ' + kind.toLowerCase() + ': ' + firstNonBlank(u == null ? null : u.CompanyName, org.Name)
            + (String.isBlank(who) ? '' : ' (' + who + ')')).left(250));
        m.setPlainTextBody(String.join(text, '\n'));
        m.setHtmlBody(String.join(html, ''));
        m.setSenderDisplayName('Pravadh DocSign');
        if (u != null && String.isNotBlank(u.Email)) {
            m.setReplyTo(u.Email);
        }
        m.setSaveAsActivity(false);
        m.setUseSignature(false);
        return m;
    }

    private static String firstNonBlank(String a, String b) {
        return String.isNotBlank(a) ? a : (b == null ? '' : b);
    }

    private static String address(String street, String city, String state, String postal, String country) {
        List<String> parts = new List<String>();
        for (String p : new List<String>{ street, city, state, postal, country }) {
            if (String.isNotBlank(p)) {
                parts.add(p.replace('\n', ', ').trim());
            }
        }
        return String.join(parts, ', ');
    }
}
