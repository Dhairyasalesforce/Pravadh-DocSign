@IsTest
private class DocSignEmailHealthTest {
    @IsTest
    static void checksSenderAndSendsTestEmail() {
        System.runAs(DocSignTestFactory.adminUser()) {
            DocSignEmailHealth.Health h = DocSignEmailHealth.check();
            Assert.isNotNull(h.senderAddress);
            Assert.isNotNull(h.message);
            Assert.isTrue(new Set<String>{ 'active', 'pending', 'missing', 'public', 'unknown' }.contains(h.dkim), h.dkim);
            Assert.areEqual('unknown', DocSignEmailHealth.dkimStatus(''));

            DocSignHomeController.SettingsDto s = DocSignHomeController.getSettings();
            Assert.isNotNull(s.emailHealth);
            DocSignHomeController.Dashboard d = DocSignHomeController.getDashboard();
            Boolean hasDomainStep = false;
            for (DocSignHomeController.SetupItem i : d.setup) {
                hasDomainStep = hasDomainStep || i.key == 'domain';
            }
            Assert.isTrue(hasDomainStep);

            try {
                DocSignHomeController.sendTestEmail('not-an-email');
                Assert.fail('invalid address rejected');
            } catch (AuraHandledException e) {
                Assert.isNotNull(e.getMessage());
            }
            DocSignEmailHealth.TestResult r = DocSignHomeController.sendTestEmail('someone@example.com');
            Assert.isNotNull(r.message);
        }
    }
}
