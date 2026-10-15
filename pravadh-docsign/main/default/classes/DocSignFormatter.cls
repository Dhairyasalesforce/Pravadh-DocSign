/**
 * Pravadh DocSign - locale-aware value formatting for merge fields.
 * Supported filters: date:"pattern", datetime:"pattern", currency[:"ISO"], number[:scale],
 * percent, upper, lower, title, default:"text", truncate:n, yesno, raw.
 */
public with sharing class DocSignFormatter {
    public class Filter {
        public String name;
        public String arg;
        public Filter(String name, String arg) {
            this.name = name == null ? '' : name.trim().toLowerCase();
            this.arg = arg;
        }
    }

    private static final Map<String, String> SYMBOLS = new Map<String, String>{
        'USD' => '$', 'EUR' => '€', 'GBP' => '£', 'JPY' => '¥', 'CNY' => '¥', 'AUD' => 'A$', 'CAD' => 'CA$', 'NZD' => 'NZ$', 'SGD' => 'S$', 'HKD' => 'HK$'
    };
    private static String decimalSep;

    public static List<Filter> parseFilters(List<String> raw) {
        List<Filter> out = new List<Filter>();
        if (raw == null) {
            return out;
        }
        for (String r : raw) {
            String s = r.trim();
            if (String.isBlank(s)) {
                continue;
            }
            Integer c = s.indexOf(':');
            if (c < 0) {
                out.add(new Filter(s, null));
            } else {
                out.add(new Filter(s.substring(0, c), unquote(s.substring(c + 1))));
            }
        }
        return out;
    }

    public static String unquote(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.length() >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\'')))) {
            return t.substring(1, t.length() - 1);
        }
        return t;
    }

    public static Boolean hasFilter(List<Filter> filters, String name) {
        for (Filter f : filters) {
            if (f.name == name) {
                return true;
            }
        }
        return false;
    }

    public static String format(Object value, Schema.DisplayType type, List<Filter> filters, String currencyIso, Integer scale) {
        String out = null;
        Filter typeFilter = null;
        for (Filter f : filters) {
            if (f.name == 'date' || f.name == 'datetime' || f.name == 'currency' || f.name == 'number' || f.name == 'percent' || f.name == 'yesno') {
                typeFilter = f;
            }
        }
        if (value != null) {
            out = typeFilter != null ? applyTypeFilter(value, typeFilter, currencyIso) : defaultFormat(value, type, currencyIso, scale);
        }
        for (Filter f : filters) {
            switch on f.name {
                when 'default' {
                    if (String.isBlank(out)) {
                        out = f.arg;
                    }
                }
                when 'upper' {
                    out = out == null ? null : out.toUpperCase();
                }
                when 'lower' {
                    out = out == null ? null : out.toLowerCase();
                }
                when 'title' {
                    out = titleCase(out);
                }
                when 'truncate' {
                    Integer n = toInt(f.arg, 100);
                    if (out != null && out.length() > n) {
                        out = out.substring(0, n) + '…';
                    }
                }
            }
        }
        return out == null ? '' : out;
    }

    private static String applyTypeFilter(Object value, Filter f, String currencyIso) {
        switch on f.name {
            when 'date' {
                Date d = toDate(value);
                if (d == null) {
                    return String.valueOf(value);
                }
                return String.isBlank(f.arg) ? d.format() : Datetime.newInstanceGmt(d, Time.newInstance(0, 0, 0, 0)).formatGmt(f.arg);
            }
            when 'datetime' {
                Datetime dt = value instanceof Datetime ? (Datetime) value : null;
                if (dt == null) {
                    Date d = toDate(value);
                    return d == null ? String.valueOf(value) : d.format();
                }
                return String.isBlank(f.arg) ? dt.format() : dt.format(f.arg);
            }
            when 'currency' {
                Decimal n = toDecimal(value);
                return n == null ? String.valueOf(value) : money(n, String.isBlank(f.arg) ? currencyIso : f.arg);
            }
            when 'number' {
                Decimal n = toDecimal(value);
                return n == null ? String.valueOf(value) : formatNumber(n, toInt(f.arg, 0));
            }
            when 'percent' {
                Decimal n = toDecimal(value);
                return n == null ? String.valueOf(value) : formatNumber(n, toInt(f.arg, 0)) + '%';
            }
            when 'yesno' {
                return (value == true || String.valueOf(value) == 'true') ? 'Yes' : 'No';
            }
        }
        return String.valueOf(value);
    }

    public static String defaultFormat(Object value, Schema.DisplayType type, String currencyIso, Integer scale) {
        if (value == null) {
            return '';
        }
        if (type == null) {
            if (value instanceof Date) {
                return ((Date) value).format();
            }
            if (value instanceof Datetime) {
                return ((Datetime) value).format();
            }
            if (value instanceof Decimal) {
                return formatNumber((Decimal) value, ((Decimal) value).scale());
            }
            if (value instanceof Boolean) {
                return (Boolean) value ? 'Yes' : 'No';
            }
            return String.valueOf(value);
        }
        Schema.DisplayType t = type;
        if (t == Schema.DisplayType.DATE) {
            return ((Date) value).format();
        } else if (t == Schema.DisplayType.DATETIME) {
            return ((Datetime) value).format();
        } else if (t == Schema.DisplayType.CURRENCY) {
            return money(toDecimal(value), currencyIso);
        } else if (t == Schema.DisplayType.PERCENT) {
            return formatNumber(toDecimal(value), scale == null ? 0 : scale) + '%';
        } else if (t == Schema.DisplayType.DOUBLE || t == Schema.DisplayType.INTEGER || t == Schema.DisplayType.LONG) {
            return formatNumber(toDecimal(value), scale == null ? 0 : scale);
        } else if (t == Schema.DisplayType.BOOLEAN) {
            return (Boolean) value ? 'Yes' : 'No';
        } else if (t == Schema.DisplayType.MULTIPICKLIST) {
            return String.valueOf(value).replace(';', ', ');
        } else if (t == Schema.DisplayType.TIME) {
            return Datetime.newInstanceGmt(Date.today(), (Time) value).formatGmt('h:mm a');
        }
        return String.valueOf(value);
    }

    public static String money(Decimal n, String iso) {
        String code = String.isBlank(iso) ? UserInfo.getDefaultCurrency() : iso.toUpperCase();
        String body = formatNumber(n.abs(), 2);
        String sym = SYMBOLS.get(code);
        String s = sym != null ? sym + body : code + ' ' + body;
        return n < 0 ? '-' + s : s;
    }

    /** Formats with locale grouping and a fixed number of decimals (Decimal.format drops trailing zeros). */
    public static String formatNumber(Decimal n, Integer scale) {
        if (n == null) {
            return '';
        }
        Integer sc = scale == null || scale < 0 ? 0 : scale;
        Decimal r = n.setScale(sc, RoundingMode.HALF_UP);
        Boolean neg = r < 0;
        r = r.abs();
        Decimal intPart = r.setScale(0, RoundingMode.DOWN);
        String s = intPart.format();
        if (sc > 0) {
            String frac = String.valueOf(r - intPart);
            frac = frac.contains('.') ? frac.substringAfter('.') : '';
            frac = frac.rightPad(sc, '0').left(sc);
            s += separator() + frac;
        }
        return neg ? '-' + s : s;
    }

    private static String separator() {
        if (decimalSep == null) {
            String probe = Decimal.valueOf('1.5').format();
            decimalSep = probe.length() == 3 ? probe.substring(1, 2) : '.';
        }
        return decimalSep;
    }

    public static Date toDate(Object v) {
        if (v instanceof Date) {
            return (Date) v;
        }
        if (v instanceof Datetime) {
            return ((Datetime) v).date();
        }
        try {
            return v == null ? null : Date.valueOf(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    public static Decimal toDecimal(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Decimal) {
            return (Decimal) v;
        }
        if (v instanceof Integer) {
            return Decimal.valueOf((Integer) v);
        }
        if (v instanceof Long) {
            return Decimal.valueOf((Long) v);
        }
        if (v instanceof Double) {
            return Decimal.valueOf((Double) v);
        }
        try {
            return Decimal.valueOf(String.valueOf(v).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static Integer toInt(String s, Integer dflt) {
        try {
            return String.isBlank(s) ? dflt : Integer.valueOf(s.trim());
        } catch (Exception e) {
            return dflt;
        }
    }

    private static String titleCase(String s) {
        if (String.isBlank(s)) {
            return s;
        }
        List<String> words = new List<String>();
        for (String w : s.toLowerCase().split(' ')) {
            words.add(w.capitalize());
        }
        return String.join(words, ' ');
    }

    /** XML/HTML-safe escaping that keeps Unicode intact (valid for both HTML and DOCX XML). */
    public static String escapeXml(String s) {
        if (s == null) {
            return '';
        }
        return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace('\'', '&#39;');
    }
}
