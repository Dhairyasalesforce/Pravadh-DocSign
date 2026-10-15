# Template syntax

Templates are HTML with merge tags. The visual editor writes exactly this syntax, so anything built visually can be read and edited as HTML, and the other way round (with the limits listed at the end).

## Fields

| Purpose | Syntax |
|---|---|
| Field on the record | `{{Name}}` · `{{Opportunity.Amount}}` (the root object prefix is optional) |
| Parent fields, up to 5 levels | `{{Account.Owner.Email}}` |
| Built-in values | `{{$Today}}` `{{$Now}}` `{{$User.Name}}` `{{$Org.Name}}` `{{$root.Name}}` `{{$PageNumber}}` `{{$PageCount}}` `{{$index}}` (row number inside a loop) |
| Images from Salesforce Files | `{{image:<ContentVersionId or ContentDocumentId> width="140"}}` |

Every merged value is HTML-escaped. The `raw` filter turns escaping off and is meant only for admin-authored rich-text fields.

## Formatting filters

Filters follow a `|` and can be chained.

| Filter | Example | Result |
|---|---|---|
| `currency` (optionally `currency:"EUR"`) | `{{Amount \| currency}}` | $48,562.50 in the record's currency |
| `date:"pattern"` | `{{CloseDate \| date:"d MMM yyyy"}}` | 30 Nov 2026 |
| `datetime:"pattern"` | `{{CreatedDate \| datetime:"d MMM yyyy HH:mm"}}` | 14 Oct 2026 17:45 (user's time zone) |
| `number:n` | `{{Quantity \| number:0}}` | 1,200 |
| `percent:n` | `{{Discount__c \| percent:1}}` | 7.5% |
| `yesno` | `{{IsActive__c \| yesno}}` | Yes / No |
| `upper` / `lower` / `title` | `{{Name \| upper}}` | ACME LOGISTICS |
| `truncate:n` | `{{Description \| truncate:120}}` | first 120 characters, then … |
| `default:"text"` | `{{Phone \| default:"not on file"}}` | text used when the value is empty |

Date and time patterns follow Apex `Datetime.format()` (Java `SimpleDateFormat`): `yyyy`, `MM`, `MMM`, `MMMM`, `d`, `dd`, `EEEE`, `HH`, `h`, `mm`, `a`. Use `date` for Date fields and `datetime` for Date/Time fields; `date` on a Date/Time field prints the date only.

## Related records (loops)

Repeat a table row for each child record:

```html
<table>
  <tr><th>#</th><th>Product</th><th>Total</th></tr>
  {{#each OpportunityLineItems orderBy="SortOrder" limit="200"}}<tr><td>{{$index}}</td><td>{{Product2.Name}}</td><td>{{TotalPrice | currency}}</td></tr>{{else}}<tr><td colspan="3">No products</td></tr>{{/each}}
</table>
```

* Use the child relationship name (`OpportunityLineItems`, `Contacts`, `Cases`, or a custom `Line_Items__r`).
* `orderBy` takes a field and optional `asc`/`desc`; `limit` caps the rows.
* `{{else}}` prints when there are no child records.
* Inside the loop, fields refer to the child record. Use `{{$root.Field}}` to print a field of the main record.
* Loops cannot be nested.
* Loops can also wrap paragraphs instead of a row.

## Conditions

```html
{{#if Payment_Terms__c == "Net 30"}}
  <p>Payable within 30 days.</p>
{{else}}
  <p>Payable on receipt.</p>
{{/if}}
```

Operators: `==` `!=` `>` `<` `>=` `<=` `contains` `startsWith`. Combine with `and` / `or`, negate with `not` (or `!`). Quote text values. A bare field (`{{#if Description}}`) is true when the field has a value.

## Signer fields

| Tag | What the signer does |
|---|---|
| `{{sign:signature:1}}` | Draws or types a signature |
| `{{sign:initial:1}}` | Initials |
| `{{sign:date:1}}` | Date signed (filled automatically) |
| `{{sign:name:1}}` | Full name (filled from the recipient) |
| `{{sign:email:1}}` | Email (filled from the recipient) |
| `{{sign:text:2:Company}}` | Free text with a label |
| `{{sign:checkbox:2:I agree:optional}}` | Checkbox with a label; `optional` lets the signer skip it |

The number is the signer role (1, 2, 3…), which maps to the recipients you add when sending. If a document has no signature tags, DocSign adds a signature block for each signer automatically.

## Page layout

* Page size (A4, Letter, Legal) and orientation are template settings.
* Header and footer are separate HTML parts; `{{$PageNumber}}` and `{{$PageCount}}` work there.
* Page break: `<div style="page-break-after: always"></div>` (or **Page break** in the visual editor).

## Writing HTML that renders in the PDF

HTML → PDF uses Salesforce's built-in renderer (`Blob.toPdf`), which supports roughly CSS 2.1.

* Lay out columns with tables. Flexbox, grid and absolute positioning are ignored or render unpredictably.
* CSS variables and `calc()` are not supported.
* Do not embed `data:` images; upload the image to Files and use `{{image:…}}`.
* Use `&#160;` rather than `&nbsp;`.

The visual editor only produces HTML that follows these rules, and its **PDF check** flags anything that doesn't.

## Visual editor limits

The visual editor opens any template it created, and most hand-written ones. It keeps a template in HTML mode when the template has:

* a loop inside another loop,
* `{{else}}` inside a loop,
* a loop inside a table that wraps more or less than one whole row.

Converting a hand-written template keeps every merge field, loop, condition and signer field; hand-written styling such as column widths and colours may be simplified. Bodies saved by the visual editor start with `<!--dsx:1-->`.

## Word (.docx) templates

Write the same tags in Word. Put `{{#each Relationship}} … {{/each}}` inside a table row to repeat it. Word output is generate-only; use HTML templates for eSignature.
