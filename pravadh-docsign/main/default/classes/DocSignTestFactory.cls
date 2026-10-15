@IsTest
public class DocSignTestFactory {
    public static final String PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    public static final String SIGN_BODY = '<h1>{{Name}}</h1><p>Revenue: {{AnnualRevenue | currency}}</p>'
        + '{{#if AnnualRevenue > 1000}}<p>BIG</p>{{else}}<p>SMALL</p>{{/if}}'
        + '<table>{{#each Contacts orderBy="LastName ASC"}}<tr><td>{{$index}}</td><td>{{LastName}}</td><td>{{Email}}</td></tr>{{/each}}</table>'
        + '<p>Signer 1: {{sign:signature:1}} {{sign:initial:1}} {{sign:date:1}} {{sign:name:1}} {{sign:text:1:Title}} {{sign:checkbox:1:I agree}}</p>'
        + '<p>Signer 2: {{sign:signature:2}} {{sign:email:2}}</p>';

    private static User cachedAdmin;

    /**
     * A dedicated test user with the Pravadh DocSign Admin permission set. Tests run as this user via
     * System.runAs so that the permission set (object + field access) is effective for user-mode code,
     * in every org including package build orgs. Setup DML runs as the current user to avoid mixed DML.
     */
    public static User adminUser() {
        if (cachedAdmin != null) {
            return cachedAdmin;
        }
        List<PermissionSet> ps = [SELECT Id FROM PermissionSet WHERE Name = 'Pravadh_DocSign_Admin' WITH SYSTEM_MODE LIMIT 1];
        Assert.isFalse(ps.isEmpty(), 'Pravadh_DocSign_Admin permission set not found');
        Profile prof = [SELECT Id FROM Profile WHERE PermissionsModifyAllData = TRUE AND UserType = 'Standard' WITH SYSTEM_MODE ORDER BY CreatedDate LIMIT 1];
        String unique = String.valueOf(Crypto.getRandomInteger()).replace('-', '') + String.valueOf(Datetime.now().getTime());
        User u = new User(
            Alias = 'dsadm',
            Email = 'docsign.admin@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'DocSign Admin',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            TimeZoneSidKey = 'America/Los_Angeles',
            ProfileId = prof.Id,
            Username = 'docsign.admin.' + unique + '@example.com.test'
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Database.insert(u, AccessLevel.SYSTEM_MODE);
            Database.insert(new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps[0].Id), AccessLevel.SYSTEM_MODE);
        }
        cachedAdmin = u;
        return u;
    }

    public static Account account() {
        Account a = new Account(Name = 'Acme Test Corp', AnnualRevenue = 250000, Description = 'Line one\nLine two');
        Database.insert(a, AccessLevel.SYSTEM_MODE);
        Database.insert(new List<Contact>{
            new Contact(FirstName = 'Zed', LastName = 'Zeta', Email = 'zed@example.com', AccountId = a.Id),
            new Contact(FirstName = 'Ann', LastName = 'Alpha', Email = 'ann@example.com', AccountId = a.Id)
        }, AccessLevel.SYSTEM_MODE);
        return a;
    }

    public static DocSign_Template__c template(String body) {
        DocSign_Template__c t = new DocSign_Template__c(
            Name = 'Test Agreement',
            Object_API_Name__c = 'Account',
            Active__c = true,
            Format__c = 'HTML',
            Body__c = body,
            Header_Html__c = '<b>{{Name}}</b>',
            Footer_Html__c = 'Page {{$PageNumber}} of {{$PageCount}}',
            Output_File_Name__c = '{{Name}} - Agreement',
            Page_Size__c = 'A4',
            Orientation__c = 'Portrait',
            Signing_Order__c = 'Sequential',
            Version__c = 1,
            On_Complete_Field__c = 'Description',
            On_Complete_Value__c = 'Signed'
        );
        Database.insert(t, AccessLevel.SYSTEM_MODE);
        return t;
    }

    public static DocSignGenerationService.GenerateResult generate(Id templateId, Id recordId) {
        DocSignGenerationService.GenerateRequest g = new DocSignGenerationService.GenerateRequest();
        g.templateId = templateId;
        g.recordId = recordId;
        return DocSignGenerationService.generate(g);
    }

    public static DocSignEnvelopeService.RecipientInput recipient(String name, String email, String code) {
        DocSignEnvelopeService.RecipientInput r = new DocSignEnvelopeService.RecipientInput();
        r.name = name;
        r.email = email;
        r.accessCode = code;
        return r;
    }

    public static DocSignEnvelopeService.SendResult send(Id documentId, List<DocSignEnvelopeService.RecipientInput> recips, String order) {
        DocSignEnvelopeService.SendRequest s = new DocSignEnvelopeService.SendRequest();
        s.documentId = documentId;
        s.recipients = recips;
        s.signingOrder = order;
        s.emailMessage = 'Please sign';
        return DocSignEnvelopeService.createAndSend(s);
    }

    public static Id recipientId(Id envelopeId, Integer role) {
        return [SELECT Id FROM DocSign_Recipient__c WHERE Envelope__c = :envelopeId AND Role_Number__c = :role LIMIT 1].Id;
    }

    public static String token(Id recipientId) {
        return DocSignRoutingService.issuedTokens.get(recipientId);
    }

    /** Builds a complete submission for the fields of a signing session. */
    public static DocSignSigningService.Submission fullSubmission(DocSignSigningService.Session s, String accessCode) {
        DocSignSigningService.Submission sub = new DocSignSigningService.Submission();
        sub.accessCode = accessCode;
        sub.consent = true;
        sub.signatureImage = PNG;
        sub.initialsImage = PNG;
        sub.signatureMethod = 'Drawn';
        for (DocSignSigningService.FieldDto f : s.fields) {
            if (f.type == 'Text') {
                sub.values.put(String.valueOf(f.index), 'CEO');
            } else if (f.type == 'Checkbox') {
                sub.values.put(String.valueOf(f.index), 'true');
            }
        }
        return sub;
    }
}
