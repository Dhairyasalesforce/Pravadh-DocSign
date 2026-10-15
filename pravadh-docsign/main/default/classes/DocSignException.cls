/**
 * Pravadh DocSign - base exception. Messages are user-safe (no stack traces, no data).
 */
public with sharing class DocSignException extends Exception {
    public static AuraHandledException toAura(Exception e) {
        String msg = (e instanceof DocSignException || e instanceof DmlException || e instanceof QueryException || e instanceof System.NoAccessException)
            ? e.getMessage()
            : 'Pravadh DocSign could not complete the request: ' + e.getMessage();
        if (e instanceof DmlException) {
            msg = ((DmlException) e).getDmlMessage(0);
        }
        AuraHandledException ae = new AuraHandledException(msg);
        ae.setMessage(msg);
        return ae;
    }
}
