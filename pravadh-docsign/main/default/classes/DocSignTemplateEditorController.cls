/**
 * Pravadh DocSign - visual template editor page (DocSignTemplateEditor).
 * The page only renders the editor; it makes no server calls and runs no SOQL or DML.
 * Its data (object describe) is requested through the hosting docSignTemplateEditor
 * Lightning component, which relays to DocSignTemplateController.describeObject (user mode).
 */
public with sharing class DocSignTemplateEditorController {
    public DocSignTemplateEditorController() {
        return;
    }

    /** Lightning origin that embeds the editor (postMessage target); only Salesforce-owned https origins are accepted. */
    public String parentOrigin {
        get {
            String raw = ApexPages.currentPage() == null ? null : ApexPages.currentPage().getParameters().get('o');
            return raw != null && Pattern.matches('https://[A-Za-z0-9.-]+\\.(force\\.com|salesforce\\.com|salesforce-setup\\.com|force-user\\.com)', raw) ? raw.escapeHtml4() : '';
        }
    }

    /** One-time value echoed back to the embedding component to pair messages. */
    public String nonce {
        get {
            String raw = ApexPages.currentPage() == null ? null : ApexPages.currentPage().getParameters().get('n');
            return raw != null && Pattern.matches('[A-Za-z0-9]{8,64}', raw) ? raw : '';
        }
    }

    /** Relative URL of the editor page, namespace-aware. */
    @AuraEnabled(cacheable=true)
    public static String editorUrl() {
        return '/apex/' + DocSignSchemaService.nsPage('DocSignTemplateEditor');
    }
}
