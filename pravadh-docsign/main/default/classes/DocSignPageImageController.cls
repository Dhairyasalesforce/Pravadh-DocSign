/**
 * Pravadh DocSign - serves one page image of an uploaded PDF to an external signer (DocSignPageImage page).
 * Runs as the Site guest user; authorization is the signing token checked by DocSignSigningService,
 * which also limits access to the page images registered on that envelope's document. This
 * controller does no SOQL or DML itself, so it runs with sharing; only the token-checked service
 * it calls is declared without sharing.
 */
public with sharing class DocSignPageImageController {
    /** Base64 JPEG data, or empty when the token / page reference is not valid. */
    public String data { get; private set; }

    public DocSignPageImageController() {
        Map<String, String> p = ApexPages.currentPage().getParameters();
        data = imageFor(p.get('t'), p.get('v'));
    }

    public static String imageFor(String token, String versionId) {
        if (!DocSignTokenService.isValidTokenFormat(token)) {
            return '';
        }
        try {
            return DocSignSigningService.pageImage(token, versionId).substringAfter('base64,');
        } catch (Exception e) {
            return '';
        }
    }
}
