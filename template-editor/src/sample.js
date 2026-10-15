// Sample object schema and record for the demo. In Salesforce these come from
// DocSignSchemaService (fields) and the record the template is opened against.

export const OBJECT_NAME = 'Opportunity'

export const FIELD_GROUPS = [
  {
    id: 'root',
    label: 'Opportunity',
    prefix: '',
    fields: [
      { api: 'Name', label: 'Opportunity Name', type: 'text' },
      { api: 'Amount', label: 'Amount', type: 'currency' },
      { api: 'CloseDate', label: 'Close Date', type: 'date' },
      { api: 'StageName', label: 'Stage', type: 'picklist' },
      { api: 'Payment_Terms__c', label: 'Payment Terms', type: 'picklist' },
      { api: 'Discount__c', label: 'Discount %', type: 'percent' },
      { api: 'Description', label: 'Description', type: 'text' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    prefix: 'Account.',
    fields: [
      { api: 'Name', label: 'Account Name', type: 'text' },
      { api: 'BillingStreet', label: 'Billing Street', type: 'text' },
      { api: 'BillingCity', label: 'Billing City', type: 'text' },
      { api: 'BillingCountry', label: 'Billing Country', type: 'text' },
      { api: 'Phone', label: 'Phone', type: 'phone' },
    ],
  },
  {
    id: 'accountOwner',
    label: 'Account › Owner',
    prefix: 'Account.Owner.',
    fields: [
      { api: 'Name', label: 'Account Owner Name', type: 'text' },
      { api: 'Email', label: 'Account Owner Email', type: 'email' },
    ],
  },
  {
    id: 'owner',
    label: 'Opportunity Owner',
    prefix: 'Owner.',
    fields: [
      { api: 'Name', label: 'Owner Name', type: 'text' },
      { api: 'Email', label: 'Owner Email', type: 'email' },
    ],
  },
  {
    id: 'lines',
    label: 'Products',
    related: 'OpportunityLineItems',
    prefix: '',
    fields: [
      { api: 'Product2.Name', label: 'Product Name', type: 'text' },
      { api: 'Quantity', label: 'Quantity', type: 'number' },
      { api: 'UnitPrice', label: 'Sales Price', type: 'currency' },
      { api: 'TotalPrice', label: 'Total Price', type: 'currency' },
      { api: 'Description', label: 'Line Description', type: 'text' },
    ],
  },
  {
    id: 'builtins',
    label: 'Built-in values',
    prefix: '',
    fields: [
      { api: '$Today', label: 'Today', type: 'date' },
      { api: '$Now', label: 'Now', type: 'text' },
      { api: '$User.Name', label: 'Current user', type: 'text' },
      { api: '$Org.Name', label: 'Company name', type: 'text' },
      { api: '$index', label: 'Row number', type: 'number' },
      { api: '$PageNumber', label: 'Page number', type: 'number' },
      { api: '$PageCount', label: 'Page count', type: 'number' },
    ],
  },
]

export const RELATIONS = [{ api: 'OpportunityLineItems', label: 'Products', orderFields: ['SortOrder', 'Product2.Name', 'TotalPrice desc', 'Quantity desc'] }]

export const SAMPLE_RECORD = {
  Name: 'Fleet Telematics Rollout, Phase 1',
  Amount: 48562.5,
  CloseDate: '2026-11-30',
  StageName: 'Proposal/Price Quote',
  Payment_Terms__c: 'Net 30',
  Discount__c: 7.5,
  Description: '',
  CurrencyIsoCode: 'USD',
  Account: {
    Name: 'Acme Logistics Pvt. Ltd.',
    BillingStreet: 'Plot 14, Hinjewadi Phase 2',
    BillingCity: 'Pune',
    BillingCountry: 'India',
    Phone: '+91 20 4000 1200',
    Owner: { Name: 'Kavya Rao', Email: 'kavya.rao@northwind.example' },
  },
  Owner: { Name: 'Arjun Patel', Email: 'arjun.patel@northwind.example' },
  OpportunityLineItems: [
    { SortOrder: 1, Product2: { Name: 'Telematics gateway TG-200' }, Quantity: 40, UnitPrice: 690, TotalPrice: 27600, Description: 'Hardware, 3-year warranty' },
    { SortOrder: 2, Product2: { Name: 'Driver app licence (annual)' }, Quantity: 40, UnitPrice: 180, TotalPrice: 7200, Description: '' },
    { SortOrder: 3, Product2: { Name: 'Fleet dashboard (annual)' }, Quantity: 1, UnitPrice: 9600, TotalPrice: 9600, Description: '' },
    { SortOrder: 4, Product2: { Name: 'Installation and onboarding' }, Quantity: 1, UnitPrice: 8100, TotalPrice: 8100, Description: 'On site, Pune depot' },
  ],
}

export const SAMPLE_ENV = {
  objectName: OBJECT_NAME,
  user: { Name: 'Arjun Patel', Email: 'arjun.patel@northwind.example' },
  org: { Name: 'Northwind Fleet Systems' },
}

export const DEFAULT_ROLES = { 1: 'Customer', 2: 'Northwind' }

// Written in DocSign template syntax on purpose: the editor loads it through
// the same parser it would use for an existing template.
export const SAMPLE_TEMPLATE = `<table class="dsx-plain">
  <tr><td><h1>Quotation</h1><p>{{Name}}</p></td><td><p style="text-align: right"><strong>{{$Org.Name}}</strong></p><p style="text-align: right">Quote date {{$Today | date:"d MMM yyyy"}}</p><p style="text-align: right">Valid until {{CloseDate | date:"d MMM yyyy"}}</p></td></tr>
</table>
<h2>Prepared for</h2>
<p><strong>{{Account.Name}}</strong><br/>{{Account.BillingStreet}}, {{Account.BillingCity}}, {{Account.BillingCountry}}<br/>Phone {{Account.Phone | default:"not on file"}}</p>
<p>Your account manager is {{Owner.Name}} ({{Owner.Email}}).</p>
<h2>Pricing</h2>
<table class="dsx-grid">
  <tr><th><p>#</p></th><th><p>Product</p></th><th><p style="text-align: right">Qty</p></th><th><p style="text-align: right">Unit price</p></th><th><p style="text-align: right">Total</p></th></tr>
  {{#each OpportunityLineItems orderBy="SortOrder" limit="200"}}<tr><td><p>{{$index}}</p></td><td><p>{{Product2.Name}}</p></td><td><p style="text-align: right">{{Quantity | number:0}}</p></td><td><p style="text-align: right">{{UnitPrice | currency}}</p></td><td><p style="text-align: right">{{TotalPrice | currency}}</p></td></tr>{{/each}}
  <tr><td colspan="4"><p><strong>Total after {{Discount__c | number:1}}% discount</strong></p></td><td><p style="text-align: right"><strong>{{Amount | currency}}</strong></p></td></tr>
</table>
<h2>Payment terms</h2>
{{#if Payment_Terms__c == "Net 30"}}
<p>Invoices are payable within 30 days of the invoice date. Hardware ships once the first invoice is paid.</p>
{{else}}
<p>Payment terms: {{Payment_Terms__c | default:"to be agreed"}}. Hardware ships once payment is received.</p>
{{/if}}
{{#if Amount > 40000}}
<p>Orders above $40,000 include a named onboarding manager for the first 90 days.</p>
{{/if}}
<h2>Acceptance</h2>
<p>By signing below, both parties accept this quotation and the Northwind master services agreement.</p>
<table class="dsx-plain">
  <tr><td><p><strong>For {{Account.Name}}</strong></p><p>{{sign:signature:1}}</p><p>{{sign:name:1}}</p><p>{{sign:date:1}}</p></td><td><p><strong>For {{$Org.Name}}</strong></p><p>{{sign:signature:2}}</p><p>{{sign:name:2}}</p><p>{{sign:date:2}}</p></td></tr>
</table>
<p>{{sign:checkbox:1:I have read the master services agreement}}</p>
`
