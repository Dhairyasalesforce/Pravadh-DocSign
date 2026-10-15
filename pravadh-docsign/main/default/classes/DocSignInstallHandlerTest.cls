@IsTest
private class DocSignInstallHandlerTest {
    @IsTest
    static void newInstallBuildsNoticeForInstaller() {
        Test.testInstall(new DocSignInstallHandler(), null);
        Messaging.SingleEmailMessage m = DocSignInstallHandler.lastMessage;
        Assert.isNotNull(m, 'A notice should be built on install');
        Assert.areEqual(DocSignInstallHandler.NOTIFY_ADDRESS, m.getToAddresses()[0]);
        Assert.isTrue(m.getSubject().startsWith('Pravadh DocSign new install'), m.getSubject());
        Assert.isTrue(m.getPlainTextBody().contains('First name:'), m.getPlainTextBody());
        Assert.isTrue(m.getPlainTextBody().contains('Org Id: ' + UserInfo.getOrganizationId()), m.getPlainTextBody());
    }

    @IsTest
    static void upgradeIsLabelled() {
        Test.testInstall(new DocSignInstallHandler(), new Version(1, 0), false);
        Messaging.SingleEmailMessage m = DocSignInstallHandler.lastMessage;
        Assert.isTrue(m.getPlainTextBody().contains('Event: Upgrade (from 1.0)'), m.getPlainTextBody());
    }

    @IsTest
    static void pushUpgradeIsLabelled() {
        Test.testInstall(new DocSignInstallHandler(), new Version(1, 0), true);
        Assert.isTrue(DocSignInstallHandler.lastMessage.getPlainTextBody().contains('Event: Push upgrade'));
    }
}
