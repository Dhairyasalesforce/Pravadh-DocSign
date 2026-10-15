import { LightningElement, api } from 'lwc';

const TIPS = {
    home: [
        'Upload any PDF from a record page. Pravadh DocSign finds the blanks and signature lines for you.',
        'Drafts save automatically. Pick them up again under “Continue where you left off”.',
        'Automate sending with the “Send for Signature” Flow action. No clicks needed.',
        'Add the Pravadh DocSign component to any record page in Lightning App Builder.',
        'Turn on reminders & expiry in Settings so signers are nudged automatically.',
        'Every completed envelope gets a Certificate of Completion with a tamper-evident audit trail.',
        'Using Agentforce? Add the DocSign actions to your agent to find templates and check signature status.'
    ],
    record: [
        'PDFs up to 100 pages are supported. Upload one and fields are detected automatically.',
        'Close the PDF editor any time. Your work is saved and appears here as “Continue preparing”.',
        'Templates generate documents from this record’s data in one click.',
        'Sequential signing sends to one signer at a time, in order; parallel sends to everyone at once.',
        'The signed PDF and its Certificate of Completion are saved to this record’s Files.'
    ],
    workspace: [
        'The integrity check re-verifies the audit trail’s hash chain every time this page opens.',
        'Resend reminds only the signers who have not signed yet.',
        'The Certificate of Completion lists every event with time, IP address and device.'
    ],
    templates: [
        'Use {{#each OpportunityLineItems}} … {{/each}} to add a table row per related record.',
        'Put {{sign:signature:1}} where signer 1 signs, and {{sign:date:1}} for their signing date.',
        'Format values with filters: {{Amount | currency}}, {{CloseDate | date:"d MMM yyyy"}}.',
        'Preview with a real record before activating. Blank merge fields are listed for you.',
        'Show text only when it applies: {{#if Stage == "Closed Won"}} … {{/if}}.'
    ]
};

const STORAGE_KEY = 'prvdDocSignTips';
const FIRST_DELAY_MS = 8000;
const ROTATE_MS = 20000;
const SNOOZE_MS = 5 * 60 * 1000;

/**
 * Rotating tips. variant="floating" pops up in the lower-left corner (and comes back a few minutes
 * after it is closed); variant="inline" is a one-line strip inside a card. "Don't show tips" is
 * remembered per browser.
 */
export default class DocSignTips extends LightningElement {
    @api context = 'home';
    @api variant = 'inline';

    index = 0;
    visible = false;
    rotateTimer;
    showTimer;

    connectedCallback() {
        const s = this.state();
        if (s.off) return;
        this.index = Math.floor(Math.random() * this.tips.length);
        const wait = Math.max(this.variant === 'floating' ? FIRST_DELAY_MS : 0, (s.snoozeUntil || 0) - Date.now());
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.showTimer = setTimeout(() => this.show(), wait);
    }

    disconnectedCallback() {
        clearTimeout(this.showTimer);
        clearInterval(this.rotateTimer);
    }

    get tips() {
        return TIPS[this.context] || TIPS.home;
    }
    get tip() {
        return this.tips[this.index % this.tips.length];
    }
    get isFloating() {
        return this.variant === 'floating';
    }
    get cls() {
        return this.isFloating ? 'ds-tips ds-floating' : 'ds-tips ds-inline';
    }

    show() {
        if (this.state().off) return;
        this.visible = true;
        clearInterval(this.rotateTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.rotateTimer = setInterval(() => this.next(), ROTATE_MS);
    }

    next() {
        this.index += 1;
    }

    close() {
        this.visible = false;
        clearInterval(this.rotateTimer);
        this.save({ ...this.state(), snoozeUntil: Date.now() + SNOOZE_MS });
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.showTimer = setTimeout(() => this.show(), SNOOZE_MS);
    }

    turnOff() {
        this.visible = false;
        clearInterval(this.rotateTimer);
        clearTimeout(this.showTimer);
        this.save({ ...this.state(), off: true });
    }

    state() {
        try {
            return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch (ignoredError) {
            return this.memoryState || {};
        }
    }

    save(state) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (ignoredError) {
            this.memoryState = state;
        }
    }
}
