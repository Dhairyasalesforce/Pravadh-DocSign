import { LightningElement, api } from 'lwc';
import editorUrl from '@salesforce/apex/DocSignTemplateEditorController.editorUrl';
import describeObject from '@salesforce/apex/DocSignTemplateController.describeObject';

const ALLOWED_ORIGIN = /^https:\/\/[a-z0-9.-]+\.(force\.com|salesforce\.com|salesforce-setup\.com|visualforce\.com|force-user\.com)$/i;
const API_NAME = /^[A-Za-z][A-Za-z0-9_]{0,119}$/;

// Only these server calls can be requested by the editor frame, each with a fixed argument shape.
const RPC = {
    describeObject: (a) => (typeof a[0] === 'string' && API_NAME.test(a[0]) ? describeObject({ objectApiName: a[0] }) : Promise.reject(new Error('Invalid object name.')))
};

/**
 * Hosts the DocSignTemplateEditor Visualforce page (Tiptap runs there, outside Lightning).
 * Messages are accepted only from Salesforce origins and must echo the one-time nonce generated here.
 * Fires `change` with the template body (DocSign syntax) whenever the user edits.
 */
export default class DocSignTemplateEditor extends LightningElement {
    @api body = '';
    url;
    nonce;
    handler;
    frameOrigin;
    ready = false;
    _objectApiName;

    @api
    get objectApiName() {
        return this._objectApiName;
    }
    set objectApiName(v) {
        const changed = v !== this._objectApiName;
        this._objectApiName = v;
        if (changed && this.ready) this.sendLoad();
    }

    /** Inserts DocSign template HTML at the cursor (used for starter content). */
    @api
    insertHtml(html) {
        this.send({ type: 'dstpl:insert', kind: 'starter', html });
    }

    async connectedCallback() {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        this.nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        this.handler = (event) => this.onMessage(event);
        window.addEventListener('message', this.handler);
        try {
            this.url = await editorUrl();
        } catch (e) {
            this.url = null;
        }
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handler);
    }

    get frameSrc() {
        if (!this.url) return null;
        return `${this.url}?o=${encodeURIComponent(window.location.origin)}&n=${this.nonce}`;
    }

    send(msg) {
        const frame = this.template.querySelector('iframe');
        if (frame && frame.contentWindow && this.frameOrigin) {
            frame.contentWindow.postMessage({ ...msg, nonce: this.nonce }, this.frameOrigin);
        }
    }

    sendLoad() {
        this.send({ type: 'dstpl:load', body: this.body || '', objectApiName: this._objectApiName || '' });
    }

    onMessage(event) {
        const data = event.data;
        if (!data || typeof data !== 'object' || data.nonce !== this.nonce || !ALLOWED_ORIGIN.test(event.origin)) {
            return;
        }
        this.frameOrigin = event.origin;
        if (data.type === 'dstpl:ready') {
            this.ready = true;
            this.sendLoad();
        } else if (data.type === 'dstpl:rpc') {
            this.relay(data);
        } else if (data.type === 'dstpl:change' && typeof data.body === 'string') {
            this.dispatchEvent(new CustomEvent('change', { detail: { body: data.body } }));
        }
    }

    async relay(data) {
        const reply = { type: 'dstpl:rpc-result', id: data.id };
        const call = Object.prototype.hasOwnProperty.call(RPC, data.method) ? RPC[data.method] : null;
        const args = Array.isArray(data.args) ? data.args.slice(0, 1) : [];
        if (!call || typeof data.id !== 'string') {
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
        this.send(reply);
    }
}
