@IsTest
private class DocSignMergeEngineTest {
    @IsTest
    static void mergesFieldsRelationshipsLoopsAndConditions() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = DocSignTestFactory.account();
            Contact c = [SELECT Id FROM Contact WHERE LastName = 'Alpha' LIMIT 1];
            Test.startTest();
            String src = 'Acct={{Account.Name}}|Upper={{Name | upper}}|Rev={{AnnualRevenue | currency}}|Num={{AnnualRevenue | number:2}}'
                + '|{{#if AnnualRevenue >= 250000 and Name contains "acme"}}YES{{else}}NO{{/if}}'
                + '|{{#if not Website}}NOSITE{{/if}}|{{#if Industry == "Banking" or AnnualRevenue < 5}}X{{else}}Y{{/if}}'
                + '|{{#each Contacts orderBy="LastName DESC" limit="5"}}[{{$index}}:{{LastName}}:{{$root.Name}}]{{else}}none{{/each}}'
                + '|Desc={{Description}}|Missing={{Nope__c | default:"n/a"}}|Today={{$Today | date:"yyyy"}}|Me={{$User.Name}}|Org={{$Org.Name}}'
                + '|{{! a comment }}|{{sign:text:2:Company:optional}}|{{image:068000000000000AAA width="80"}}|{{$PageNumber}}';
            DocSignMergeEngine.Job job = new DocSignMergeEngine.Job();
            String out = DocSignMergeEngine.mergeParts(a.Id, new Map<String, String>{ 'b' => src }, DocSignMergeEngine.OutputMode.HTML, job).get('b');
            String viaContact = DocSignMergeEngine.mergeText(c.Id, '{{Account.Name}} / {{Contact.LastName}} / {{Owner.Name}}');
            Test.stopTest();

            Assert.isTrue(out.contains('Acct=Acme Test Corp'), out);
            Assert.isTrue(out.contains('Upper=ACME TEST CORP'), out);
            Assert.isTrue(out.contains('YES'), out);
            Assert.isTrue(out.contains('NOSITE'), out);
            Assert.isTrue(out.contains('|Y|'), out);
            Assert.isTrue(out.indexOf(':Zeta:') < out.indexOf(':Alpha:'), out);
            Assert.isTrue(out.contains('[1:Zeta:Acme Test Corp]'), out);
            Assert.isTrue(out.contains('Line one<br/>Line two'), out);
            Assert.isTrue(out.contains('Missing=n/a'), out);
            Assert.isTrue(out.contains('Today=' + String.valueOf(Date.today().year())), out);
            Assert.isTrue(out.contains('[[DSF|0|Text|2|0|Company]]'), out);
            Assert.isTrue(out.contains('[[DSI|068000000000000AAA|80]]'), out);
            Assert.isTrue(out.contains('<span class="ds-page"></span>'), out);
            Assert.isTrue(job.warnings.size() >= 1, 'unknown field reported');
            Assert.isTrue(viaContact.startsWith('Acme Test Corp / Alpha / '), viaContact);
        }
    }

    @IsTest
    static void escapesValuesAndSupportsTextMode() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Account a = new Account(Name = '<b>Tom & Jerry</b>');
            Database.insert(a, AccessLevel.SYSTEM_MODE);
            String html = DocSignMergeEngine.mergeParts(a.Id, new Map<String, String>{ 'b' => '{{Name}}|{{Name | raw}}' }, DocSignMergeEngine.OutputMode.HTML, null).get('b');
            Assert.isTrue(html.startsWith('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;|<b>Tom & Jerry</b>'), html);
            Assert.areEqual('<b>Tom & Jerry</b>.pdf', DocSignMergeEngine.mergeText(a.Id, '{{Name}}.pdf'));
        }
    }

    @IsTest
    static void formatterCoversTypes() {
        List<DocSignFormatter.Filter> none = new List<DocSignFormatter.Filter>();
        Assert.areEqual('Yes', DocSignFormatter.format(true, Schema.DisplayType.BOOLEAN, none, null, null));
        Assert.areEqual('A, B', DocSignFormatter.format('A;B', Schema.DisplayType.MULTIPICKLIST, none, null, null));
        Assert.isTrue(DocSignFormatter.format(12.5, Schema.DisplayType.PERCENT, none, null, 1).endsWith('%'));
        Assert.isTrue(DocSignFormatter.format(1234.5, Schema.DisplayType.CURRENCY, none, 'EUR', 2).startsWith('€'));
        Assert.isTrue(DocSignFormatter.format(-5, Schema.DisplayType.CURRENCY, none, 'INR', 2).startsWith('-INR'));
        Assert.isNotNull(DocSignFormatter.format(Date.today(), Schema.DisplayType.DATE, none, null, null));
        Assert.isNotNull(DocSignFormatter.format(Datetime.now(), Schema.DisplayType.DATETIME, none, null, null));
        Assert.isNotNull(DocSignFormatter.format(Time.newInstance(9, 30, 0, 0), Schema.DisplayType.TIME, none, null, null));
        Assert.isNotNull(DocSignFormatter.format(3, Schema.DisplayType.INTEGER, none, null, 0));
        List<DocSignFormatter.Filter> f = DocSignFormatter.parseFilters(new List<String>{ 'datetime:"yyyy"', 'title', 'truncate:3' });
        Assert.areEqual(3 + 1, DocSignFormatter.format(Datetime.now(), null, f, null, null).length());
        Assert.areEqual('No', DocSignFormatter.format(false, null, DocSignFormatter.parseFilters(new List<String>{ 'yesno' }), null, null));
        Assert.areEqual('5%', DocSignFormatter.format('5', null, DocSignFormatter.parseFilters(new List<String>{ 'percent' }), null, null));
        Assert.areEqual('Hello World', DocSignFormatter.format('hello world', null, DocSignFormatter.parseFilters(new List<String>{ 'title', 'lower', 'title' }), null, null));
        Assert.areEqual('x', DocSignFormatter.format(null, null, DocSignFormatter.parseFilters(new List<String>{ 'default:\'x\'' }), null, null));
        Assert.isNotNull(DocSignFormatter.format('2026-01-31', null, DocSignFormatter.parseFilters(new List<String>{ 'date:"dd/MM/yyyy"' }), null, null));
        Assert.areEqual('Yes', DocSignFormatter.defaultFormat(true, null, null, null));
        Assert.isNotNull(DocSignFormatter.defaultFormat(Decimal.valueOf('1.25'), null, null, null));
        Assert.isNotNull(DocSignFormatter.toDecimal(Long.valueOf('5')));
        Assert.isNull(DocSignFormatter.toDecimal('abc'));
    }

    @IsTest
    static void docxHelpersRepairSplitTagsAndRepeatRows() {
        String split = '<w:p><w:r><w:t>Hello {{Na</w:t></w:r><w:r><w:rPr/><w:t xml:space="preserve">me}} end</w:t></w:r><w:r><w:t/></w:r></w:p>';
        String fixed = DocSignDocxRenderer.consolidateTags(split);
        Assert.isTrue(fixed.contains('{{Name}}'), fixed);
        String row = '<w:tbl><w:tr><w:tc><w:t>{{#each Contacts}}{{LastName}}</w:t></w:tc><w:tc><w:t>{{Email}}{{/each}}</w:t></w:tc></w:tr></w:tbl>';
        String rep = DocSignDocxRenderer.repeatRows(row);
        Assert.isTrue(rep.startsWith('<w:tbl>{{#each Contacts}}<w:tr>'), rep);
        Assert.isTrue(rep.contains('</w:tr>{{/each}}'), rep);
    }

    @IsTest
    static void schemaServiceDiscoversAnyObject() {
        System.runAs(DocSignTestFactory.adminUser()) {
            Assert.isFalse(DocSignSchemaService.listObjects().isEmpty());
            List<DocSignSchemaService.FieldInfo> f = DocSignSchemaService.describeForExplorer('Account');
            Boolean hasChild = false;
            for (DocSignSchemaService.FieldInfo i : f) {
                hasChild = hasChild || i.kind == 'child';
            }
            Assert.isTrue(hasChild);
            Assert.isNotNull(DocSignSchemaService.resolvePath(Contact.SObjectType, 'Account.Owner.Name'));
            Assert.isNull(DocSignSchemaService.resolvePath(Contact.SObjectType, 'Nope.Name'));
            Assert.isNotNull(DocSignSchemaService.resolveChild(Account.SObjectType, 'Contacts'));
            Assert.isNotNull(DocSignSchemaService.nsPage('DocSignSign'));
            try {
                DocSignSchemaService.describeForExplorer('Not_An_Object__zz');
                Assert.fail('expected exception');
            } catch (DocSignException e) {
                Assert.isTrue(e.getMessage().contains('not found'));
            }
        }
    }
}
