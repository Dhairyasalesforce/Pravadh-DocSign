/**
 * Pravadh DocSign - shared LWC helpers.
 */
export function reduceError(error) {
    if (!error) return 'Unknown error';
    if (Array.isArray(error)) return error.map(reduceError).join(', ');
    if (error.body) {
        if (Array.isArray(error.body)) return error.body.map((e) => e.message).join(', ');
        if (error.body.message) return error.body.message;
        if (error.body.pageErrors && error.body.pageErrors.length) return error.body.pageErrors[0].message;
    }
    return error.message || String(error);
}

const STATUS_THEME = {
    Draft: 'neutral',
    Prepared: 'neutral',
    Generated: 'neutral',
    Created: 'neutral',
    Sent: 'info',
    'Out for Signature': 'info',
    Viewed: 'info',
    'Partially Signed': 'warning',
    Completed: 'success',
    Signed: 'success',
    Declined: 'error',
    Expired: 'error',
    Cancelled: 'error'
};

export function statusTheme(status) {
    return STATUS_THEME[status] || 'neutral';
}

export function formatDateTime(value) {
    if (!value) return '';
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch (ignoredError) {
        return value;
    }
}
