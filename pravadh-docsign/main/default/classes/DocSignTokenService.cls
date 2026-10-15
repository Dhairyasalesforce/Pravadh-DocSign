/**
 * Pravadh DocSign - signer access tokens. 256-bit random tokens are emailed once;
 * only their SHA-256 hash is stored, so a database reader cannot reconstruct signing links.
 */
public inherited sharing class DocSignTokenService {
    public static String newToken() {
        String t = EncodingUtil.base64Encode(Crypto.generateAesKey(256));
        return t.replace('+', '-').replace('/', '_').replace('=', '');
    }

    public static String hash(String rawToken) {
        if (String.isBlank(rawToken)) {
            return null;
        }
        return DocSignRenderService.sha256('pravadh-docsign-token:' + rawToken.trim());
    }

    public static String hashAccessCode(Id recipientId, String code) {
        if (String.isBlank(code)) {
            return null;
        }
        return DocSignRenderService.sha256('pravadh-docsign-code:' + String.valueOf(recipientId).left(15) + ':' + code.trim().toUpperCase());
    }

    public static Boolean isValidTokenFormat(String rawToken) {
        return String.isNotBlank(rawToken) && rawToken.length() >= 30 && rawToken.length() <= 64 && Pattern.matches('[A-Za-z0-9_-]+', rawToken);
    }
}
