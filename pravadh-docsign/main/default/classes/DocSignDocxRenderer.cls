/**
 * Pravadh DocSign - native DOCX template merge (Word in, Word out) using the Apex Compression API.
 * Handles Word's habit of splitting {{tags}} across runs and supports table-row repetition
 * when a {{#each}} ... {{/each}} pair sits inside a single table row.
 */
public with sharing class DocSignDocxRenderer {
    public static Blob render(Blob docx, Id recordId, DocSignMergeEngine.Job job) {
        Compression.ZipReader reader = new Compression.ZipReader(docx);
        Map<String, String> parts = new Map<String, String>();
        List<Compression.ZipEntry> entries = reader.getEntries();
        for (Compression.ZipEntry e : entries) {
            String n = e.getName();
            if (n == 'word/document.xml' || (n.startsWith('word/header') && n.endsWith('.xml')) || (n.startsWith('word/footer') && n.endsWith('.xml'))) {
                String xml = reader.extract(e).toString();
                parts.put(n, repeatRows(consolidateTags(xml)));
            }
        }
        Map<String, String> merged = DocSignMergeEngine.mergeParts(recordId, parts, DocSignMergeEngine.OutputMode.XML, job);
        Compression.ZipWriter writer = new Compression.ZipWriter();
        for (Compression.ZipEntry e : entries) {
            String n = e.getName();
            if (merged.containsKey(n)) {
                writer.addEntry(n, Blob.valueOf(merged.get(n)));
            } else {
                writer.addEntry(n, reader.extract(e));
            }
        }
        return writer.getArchive();
    }

    private class Segment {
        Integer start; // index of text content start
        Integer stop; // index of text content end (exclusive)
        String text;
    }

    /** Re-joins merge tags that Word split across several <w:t> runs. */
    @TestVisible
    private static String consolidateTags(String xml) {
        List<Segment> segs = new List<Segment>();
        Integer pos = 0;
        while (true) {
            Integer s = xml.indexOf('<w:t', pos);
            if (s < 0) {
                break;
            }
            String next = xml.substring(s + 4, Math.min(xml.length(), s + 5));
            if (next != '>' && next != ' ') {
                pos = s + 4;
                continue;
            }
            Integer gt = xml.indexOf('>', s);
            if (gt < 0) {
                break;
            }
            if (xml.substring(gt - 1, gt) == '/') {
                pos = gt + 1;
                continue; // <w:t/>
            }
            Integer close = xml.indexOf('</w:t>', gt);
            if (close < 0) {
                break;
            }
            Segment seg = new Segment();
            seg.start = gt + 1;
            seg.stop = close;
            seg.text = xml.substring(gt + 1, close);
            segs.add(seg);
            pos = close + 6;
        }
        if (segs.isEmpty()) {
            return xml;
        }
        // Build the flattened text and fix tags spanning segments.
        List<Integer> offsets = new List<Integer>();
        String full = '';
        for (Segment seg : segs) {
            offsets.add(full.length());
            full += seg.text;
        }
        Integer p = 0;
        while (true) {
            Integer a = full.indexOf('{{', p);
            if (a < 0) {
                break;
            }
            Integer b = full.indexOf('}}', a);
            if (b < 0) {
                break;
            }
            b += 2;
            Integer sa = segmentAt(offsets, a);
            Integer sb = segmentAt(offsets, b - 1);
            if (sa != sb) {
                String token = full.substring(a, b);
                Segment first = segs[sa];
                Integer localA = a - offsets[sa];
                first.text = first.text.substring(0, localA) + token;
                for (Integer i = sa + 1; i < sb; i++) {
                    segs[i].text = '';
                }
                Segment last = segs[sb];
                Integer localB = b - offsets[sb];
                last.text = last.text.substring(localB);
                // Mark consumed range in "full" so offsets stay consistent.
                full = rebuildFull(segs, offsets);
                p = offsets[sa] + localA + token.length();
            } else {
                p = b;
            }
        }
        List<String> out = new List<String>();
        Integer cursor = 0;
        for (Segment seg : segs) {
            out.add(xml.substring(cursor, seg.start));
            out.add(seg.text);
            cursor = seg.stop;
        }
        out.add(xml.substring(cursor));
        return String.join(out, '').replace('<w:t>{{', '<w:t xml:space="preserve">{{');
    }

    private static String rebuildFull(List<Segment> segs, List<Integer> offsets) {
        String full = '';
        for (Integer i = 0; i < segs.size(); i++) {
            offsets[i] = full.length();
            full += segs[i].text;
        }
        return full;
    }

    private static Integer segmentAt(List<Integer> offsets, Integer charIndex) {
        Integer lo = 0;
        for (Integer i = 0; i < offsets.size(); i++) {
            if (offsets[i] <= charIndex) {
                lo = i;
            } else {
                break;
            }
        }
        return lo;
    }

    /** Moves {{#each X}} / {{/each}} that live inside one table row to wrap the whole <w:tr>. */
    @TestVisible
    private static String repeatRows(String xml) {
        Integer guard = 0;
        Integer pos = 0;
        while (guard++ < 200) {
            Integer tagStart = xml.indexOf('{{#each', pos);
            if (tagStart < 0) {
                break;
            }
            Integer tagEnd = xml.indexOf('}}', tagStart) + 2;
            Integer rowStart = Math.max(xml.lastIndexOf('<w:tr>', tagStart), xml.lastIndexOf('<w:tr ', tagStart));
            Integer rowEnd = xml.indexOf('</w:tr>', tagStart);
            Integer closeTag = xml.indexOf('{{/each}}', tagEnd);
            Boolean inRow = rowStart >= 0 && rowEnd > 0 && xml.lastIndexOf('</w:tr>', tagStart) < rowStart;
            if (!inRow || closeTag < 0 || closeTag > rowEnd) {
                pos = tagEnd;
                continue;
            }
            String open = xml.substring(tagStart, tagEnd);
            rowEnd += 7;
            String row = xml.substring(rowStart, rowEnd);
            row = row.replace(open, '').replace('{{/each}}', '');
            xml = xml.substring(0, rowStart) + open + row + '{{/each}}' + xml.substring(rowEnd);
            pos = rowStart + open.length() + row.length() + 9;
        }
        return xml;
    }
}
