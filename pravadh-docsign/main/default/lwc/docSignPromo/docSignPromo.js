import { LightningElement, api } from 'lwc';
import promotionsEnabled from '@salesforce/apex/DocSignHomeController.promotionsEnabled';

const STORAGE_KEY = 'pravadhDocSignPromo';
const REAPPEAR_MS = 15 * 60 * 1000; // show again 15 minutes after being closed
const CHECK_MS = 30 * 1000;
const ROTATE_MS = 9000;
const UTM = 'utm_source=salesforce&utm_medium=pravadh_docsign&utm_campaign=in_app_promo';

const PRODUCTS = [
    {
        key: 'labs',
        mark: 'P',
        eyebrow: 'Pravadh Labs',
        headline: 'Unify the process. Drive the next action.',
        body: 'AI and agents are everywhere. Pravadh unifies the work on the stack you already run and drives the next action.',
        cta: 'Explore Pravadh Labs',
        url: 'https://pravadhlabs.com',
        theme: 'labs'
    },
    {
        key: 'iq',
        mark: 'IQ',
        eyebrow: 'Pravadh IQ',
        headline: 'Deploy Code. Move Data. Govern Everything.',
        body: 'The unified Code DevOps + Data DevOps platform for Salesforce and modern SaaS.',
        cta: 'Try Pravadh IQ',
        url: 'https://pravadhiq.pravadhlabs.com',
        theme: 'iq'
    },
    {
        key: 'si',
        mark: 'SI',
        eyebrow: 'Pravadh SI',
        headline: 'Command the next send. Never burn the domain.',
        body: 'Finds the buyer, ranks the moment, drafts the touch, and never reaches a real person until you approve.',
        cta: 'See Pravadh SI',
        url: 'https://pravadhsi.pravadhlabs.com',
        theme: 'si'
    },
    {
        key: 'pm',
        mark: 'PM',
        eyebrow: 'Pravadh PM',
        headline: 'Jira-grade issues. ClickUp-grade views. Your brand.',
        body: 'White-label project management on your brand or your servers, without handing over source.',
        cta: 'Discover Pravadh PM',
        url: 'https://pravadhpm.pravadhlabs.com',
        theme: 'pm'
    }
];

export default class DocSignPromo extends LightningElement {
    /** Seconds to wait before the first appearance on a page. */
    @api initialDelay = 4;

    visible = false;
    index = 0;
    enabled = false;
    checkTimer;
    rotateTimer;
    delayTimer;

    async connectedCallback() {
        try {
            this.enabled = await promotionsEnabled();
        } catch (ignoredError) {
            this.enabled = false;
        }
        if (!this.enabled) return;
        const state = this.readState();
        this.index = Number.isInteger(state.next) ? state.next % PRODUCTS.length : 0;
        if (this.isDue(state)) {
            this.delayTimer = setTimeout(() => this.show(), Math.max(0, this.initialDelay) * 1000);
        }
        this.checkTimer = setInterval(() => {
            if (!this.visible && this.isDue(this.readState())) this.show();
        }, CHECK_MS);
    }

    disconnectedCallback() {
        clearTimeout(this.delayTimer);
        clearInterval(this.checkTimer);
        clearInterval(this.rotateTimer);
    }

    // ---------------------------------------------------------------- state
    readState() {
        try {
            return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch (ignoredError) {
            return {};
        }
    }

    writeState(state) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (ignoredError) {
            // storage unavailable (private mode): fall back to in-memory behaviour
            this.memoryState = state;
        }
    }

    isDue(state) {
        const s = state && state.dismissedAt ? state : this.memoryState || {};
        return !s.dismissedAt || Date.now() - s.dismissedAt >= REAPPEAR_MS;
    }

    // ---------------------------------------------------------------- behaviour
    show() {
        this.visible = true;
        clearInterval(this.rotateTimer);
        this.rotateTimer = setInterval(() => this.next(), ROTATE_MS);
    }

    close() {
        this.visible = false;
        clearInterval(this.rotateTimer);
        this.writeState({ dismissedAt: Date.now(), next: (this.index + 1) % PRODUCTS.length });
    }

    next() {
        this.index = (this.index + 1) % PRODUCTS.length;
    }

    prev() {
        this.index = (this.index - 1 + PRODUCTS.length) % PRODUCTS.length;
    }

    pick(event) {
        this.index = Number(event.currentTarget.dataset.index);
        this.show();
    }

    pause() {
        clearInterval(this.rotateTimer);
    }

    resume() {
        if (this.visible) this.show();
    }

    // ---------------------------------------------------------------- view
    get product() {
        return PRODUCTS[this.index];
    }

    get href() {
        return `${this.product.url}/?${UTM}`;
    }

    get cardClass() {
        return `ds-promo ds-${this.product.theme}`;
    }

    get dots() {
        return PRODUCTS.map((p, i) => ({ key: p.key, index: i, label: p.eyebrow, cls: i === this.index ? 'ds-dot ds-dot-on' : 'ds-dot' }));
    }

    get showPromo() {
        return this.enabled && this.visible;
    }
}
