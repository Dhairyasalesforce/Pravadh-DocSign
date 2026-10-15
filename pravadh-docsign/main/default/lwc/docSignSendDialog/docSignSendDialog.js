import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getSendDefaults from '@salesforce/apex/DocSignRecordController.getSendDefaults';
import send from '@salesforce/apex/DocSignRecordController.send';
import { reduceError } from 'c/docSignUtils';

let seq = 0;
const ROLE_COLORS = ['#0f766e', '#0b5cab', '#7c3aed', '#c2410c', '#be185d', '#15803d', '#4338ca', '#b45309', '#0e7490', '#9333ea'];

export default class DocSignSendDialog extends LightningElement {
    @api documentId;
    @track recipients = [];
    @track suggestions = [];
    signingOrder = 'Sequential';
    emailSubject = '';
    emailMessage = '';
    expiryDays = 30;
    requiredSigners = 0;
    summaries = [];
    title = '';
    loading = true;
    sending = false;
    error;
    showCodes = false;

    connectedCallback() {
        this.load();
    }

    async load() {
        try {
            const d = await getSendDefaults({ documentId: this.documentId });
            this.signingOrder = d.signingOrder || 'Sequential';
            this.emailSubject = d.emailSubject || `Please sign: ${d.title || 'document'}`;
            this.emailMessage = d.emailMessage || '';
            this.expiryDays = d.expiryDays || 30;
            this.requiredSigners = d.requiredSigners || 0;
            this.title = d.title;
            this.suggestions = (d.suggestions || []).map((s, i) => ({ ...s, key: `s${i}`, label: `${s.name} · ${s.source}` }));
            const count = Math.max(1, this.requiredSigners);
            this.summaries = d.roleSummaries || [];
            this.recipients = [];
            for (let i = 0; i < count; i++) this.addRow();
            // Pre-fill the first signer with the best record-derived suggestion (not "Me").
            const hints = d.roleHints || [];
            if (hints.length) {
                this.recipients = this.recipients.map((r, i) => (hints[i] && !/^Signer \d+$/.test(hints[i]) ? { ...r, roleLabel: hints[i] } : r));
                // A signer named in the document who is also a suggested person gets name + email filled in.
                hints.forEach((h, i) => {
                    const match = h && this.suggestions.find((s) => (s.name || '').toLowerCase() === h.toLowerCase());
                    if (match) this.fill(i, match);
                });
            } else {
                const first = this.suggestions.find((s) => s.source !== 'Me');
                if (first) this.fill(0, first);
            }
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.loading = false;
        }
    }

    addRow() {
        const n = this.recipients.length + 1;
        this.recipients = [...this.recipients, { key: `r${++seq}`, name: '', email: '', roleLabel: '', accessCode: '', number: n, removable: n > Math.max(1, this.requiredSigners) }];
    }

    /** Same colours as the PDF editor, so "who fills what" matches everywhere. */
    get rows() {
        return this.recipients.map((r, i) => ({
            ...r,
            summary: this.summaries && this.summaries[i] ? this.summaries[i] : i >= this.requiredSigners && this.requiredSigners > 0 ? 'no fields in the document yet, so a signature block is added at the end.' : '',
            numStyle: `background:${ROLE_COLORS[i % ROLE_COLORS.length]};color:#fff`,
            barStyle: `border-left-color:${ROLE_COLORS[i % ROLE_COLORS.length]}`
        }));
    }

    fill(index, s) {
        const rows = [...this.recipients];
        rows[index] = { ...rows[index], name: s.name, email: s.email, roleLabel: rows[index].roleLabel || (s.source === 'Me' ? 'Sender' : s.source) };
        this.recipients = rows;
    }

    useSuggestion(event) {
        const s = this.suggestions.find((x) => x.key === event.currentTarget.dataset.key);
        if (!s) return;
        let idx = this.recipients.findIndex((r) => !r.email);
        if (idx < 0) {
            this.addRow();
            idx = this.recipients.length - 1;
        }
        this.fill(idx, s);
    }

    removeRow(event) {
        const key = event.currentTarget.dataset.key;
        this.recipients = this.recipients.filter((r) => r.key !== key).map((r, i) => ({ ...r, number: i + 1 }));
    }

    handleRow(event) {
        const { key, field } = event.target.dataset;
        this.recipients = this.recipients.map((r) => (r.key === key ? { ...r, [field]: event.detail.value } : r));
    }

    handle(event) {
        this[event.target.dataset.field] = event.detail.value;
    }

    toggleCodes() {
        this.showCodes = !this.showCodes;
    }

    get orderOptions() {
        return [
            { label: 'Sequential', value: 'Sequential' },
            { label: 'Parallel', value: 'Parallel' }
        ];
    }
    get isSequential() {
        return this.signingOrder === 'Sequential';
    }
    get hasSuggestions() {
        return this.suggestions.length > 0;
    }
    get requirementText() {
        return this.requiredSigners > 0
            ? `This document has signature fields for ${this.requiredSigners} signer(s). Signer 1 fills the Signer 1 fields, and so on.`
            : 'No signature fields were placed in the template, so a signature block is added for each signer automatically.';
    }
    get codeToggleLabel() {
        return this.showCodes ? 'Hide access codes' : 'Add access codes (optional)';
    }

    close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    async submit() {
        const inputs = [...this.template.querySelectorAll('lightning-input[data-validate]')];
        const valid = inputs.reduce((ok, i) => i.reportValidity() && ok, true);
        if (!valid) return;
        this.sending = true;
        try {
            const payload = {
                documentId: this.documentId,
                signingOrder: this.signingOrder,
                emailSubject: this.emailSubject,
                emailMessage: this.emailMessage,
                expiryDays: Number(this.expiryDays) || null,
                recipients: this.recipients.map((r, i) => ({ name: r.name, email: r.email, roleNumber: i + 1, roleLabel: r.roleLabel, accessCode: r.accessCode || null }))
            };
            const res = await send({ payload: JSON.stringify(payload) });
            this.dispatchEvent(new ShowToastEvent({ title: 'Sent for signature', message: `${res.envelopeNumber} is on its way.`, variant: 'success' }));
            (res.warnings || []).forEach((w) => this.dispatchEvent(new ShowToastEvent({ title: 'Heads up', message: w, variant: 'warning', mode: 'sticky' })));
            this.dispatchEvent(new CustomEvent('sent', { detail: res }));
        } catch (e) {
            this.error = reduceError(e);
        } finally {
            this.sending = false;
        }
    }
}
