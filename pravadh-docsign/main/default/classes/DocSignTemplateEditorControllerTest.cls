@IsTest
private class DocSignTemplateEditorControllerTest {
    @IsTest
    static void acceptsSalesforceOriginAndNonce() {
        PageReference pr = Page.DocSignTemplateEditor;
        pr.getParameters().put('o', 'https://acme.lightning.force.com');
        pr.getParameters().put('n', 'a1b2c3d4e5f6a7b8');
        Test.setCurrentPage(pr);
        DocSignTemplateEditorController c = new DocSignTemplateEditorController();
        Assert.areEqual('https://acme.lightning.force.com', c.parentOrigin);
        Assert.areEqual('a1b2c3d4e5f6a7b8', c.nonce);
    }

    @IsTest
    static void rejectsForeignOriginAndBadNonce() {
        PageReference pr = Page.DocSignTemplateEditor;
        pr.getParameters().put('o', 'https://evil.example.com');
        pr.getParameters().put('n', '<script>');
        Test.setCurrentPage(pr);
        DocSignTemplateEditorController c = new DocSignTemplateEditorController();
        Assert.areEqual('', c.parentOrigin);
        Assert.areEqual('', c.nonce);
    }

    @IsTest
    static void returnsEditorUrl() {
        Assert.isTrue(DocSignTemplateEditorController.editorUrl().contains('DocSignTemplateEditor'));
    }
}
