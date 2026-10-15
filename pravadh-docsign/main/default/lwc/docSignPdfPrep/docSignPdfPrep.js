import { LightningElement, api } from 'lwc';
import getContext from '@salesforce/apex/DocSignPdfPrepController.getContext';
import savePage from '@salesforce/apex/DocSignPdfPrepController.savePage';
import saveLayout from '@salesforce/apex/DocSignPdfPrepController.saveLayout';
import getPdfData from '@salesforce/apex/DocSignPdfPrepController.getPdfData';
import saveDraft from '@salesforce/apex/DocSignPdfPrepController.saveDraft';

// Only these server calls can be requested by the editor frame, each with a fixed argument shape.
const RPC = {
    getContext: (a) => getContext({ documentId: a[0] }),
    savePage: (a) => savePage({ documentId: a[0], pageNo: a[1], dataUrl: a[2] }),
    saveLayout: (a) => saveLayout({ documentId: a[0], payload: a[1] }),
    getPdfData: (a) => getPdfData({ documentId: a[0] }),
    saveDraft: (a) => saveDraft({ documentId: a[0], payload: a[1] })
};

const ALLOWED_ORIGIN = /^https:\/\/[a-z0-9.-]+\.(force\.com|salesforce\.com|salesforce-setup\.com|visualforce\.com|force-user\.com)$/i;

/**
 * Hosts the DocSignPdfPrep Visualforce editor (PDF.js runs there, outside Lightning) in a full-screen
 * modal. The editor's Salesforce calls are relayed through this component (allow-listed Apex methods,
 * always for this component's document), and its completion message is handled here. Messages are
 * accepted only from Salesforce origins and must echo the one-time nonce generated here.
 */
export default class DocSignPdfPrep extends LightningElement {
    @api documentId;
    @api prepUrl;
    @api title = 'Prepare PDF for signature';

    nonce;
    handler;
    frameOrigin;
    flushDone;

    connectedCallback() {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        this.nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        this.handler = (event) => this.onMessage(event);
        window.addEventListener('message', this.handler);
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handler);
    }

    get frameSrc() {
        if (!this.prepUrl) return null;
        const sep = this.prepUrl.includes('?') ? '&' : '?';
        return `${this.prepUrl}${sep}o=${encodeURIComponent(window.location.origin)}&n=${this.nonce}`;
    }

    onMessage(event) {
        const data = event.data;
        if (!data || typeof data !== 'object' || data.nonce !== this.nonce || !ALLOWED_ORIGIN.test(event.origin)) {
            return;
        }
        this.frameOrigin = event.origin;
        if (data.type === 'docsign:rpc') {
            this.relay(data, event.origin);
        } else if (data.type === 'docsign:prepared') {
            this.dispatchEvent(new CustomEvent('prepared', { detail: { documentId: this.documentId } }));
        } else if (data.type === 'docsign:cancel') {
            this.dispatchEvent(new CustomEvent('close'));
        } else if (data.type === 'docsign:flushed' && this.flushDone) {
            this.flushDone();
        }
    }

    async relay(data, origin) {
        const reply = { type: 'docsign:rpc-result', id: data.id, nonce: this.nonce };
        const call = Object.prototype.hasOwnProperty.call(RPC, data.method) ? RPC[data.method] : null;
        const args = Array.isArray(data.args) ? data.args.slice(0, 3) : [];
        const sameDoc = typeof args[0] === 'string' && !!this.documentId && args[0].substring(0, 15) === String(this.documentId).substring(0, 15);
        if (sameDoc) {
            args[0] = this.documentId;
        }
        if (!call || typeof data.id !== 'string' || !sameDoc) {
            reply.ok = false;
            reply.error = 'Request not allowed.';
        } else {
            try {
                reply.result = await call(args);
                reply.ok = true;
            } catch (e) {
                reply.ok = false;
                reply.error = (e && e.body && e.body.message) || (e && e.message) || 'Request failed';
            }
        }
        const frame = this.template.querySelector('iframe');
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage(reply, origin);
        }
    }

    /** Asks the editor to save the work in progress (max 2 s), then closes. */
    async close() {
        const frame = this.template.querySelector('iframe');
        if (frame && frame.contentWindow && this.frameOrigin) {
            await new Promise((resolve) => {
                this.flushDone = resolve;
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(resolve, 2000);
                frame.contentWindow.postMessage({ type: 'docsign:flush', nonce: this.nonce }, this.frameOrigin);
            });
            this.flushDone = undefined;
        }
        this.dispatchEvent(new CustomEvent('close'));
    }
}
