// The JSON of the files and lines shared with the app (C# 5: no interpolation, no ?., no nameof, no tuples, no out var).
// Numbers are written with the invariant culture, so a Polish format of numbers never reaches a shared file.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace RegulatedDay
{
    public static class Json
    {
        // ------------------------------------------------------------ reading

        /// <summary>Parses JSON: objects as Dictionary&lt;string, object&gt;, arrays as List&lt;object&gt;, numbers as double.</summary>
        public static object Parse(string text)
        {
            int i = 0;
            object value = ReadValue(text, ref i);
            SkipWhite(text, ref i);
            if (i != text.Length) throw new FormatException("JSON: znaki po wartości");
            return value;
        }

        public static Dictionary<string, object> ParseObject(string text)
        {
            Dictionary<string, object> o = Parse(text) as Dictionary<string, object>;
            if (o == null) throw new FormatException("JSON: oczekiwano obiektu");
            return o;
        }

        static void SkipWhite(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++;
        }

        static object ReadValue(string s, ref int i)
        {
            SkipWhite(s, ref i);
            if (i >= s.Length) throw new FormatException("JSON: koniec tekstu");
            char c = s[i];
            if (c == '{') return ReadObject(s, ref i);
            if (c == '[') return ReadArray(s, ref i);
            if (c == '"') return ReadString(s, ref i);
            if (c == 't' && Match(s, ref i, "true")) return true;
            if (c == 'f' && Match(s, ref i, "false")) return false;
            if (c == 'n' && Match(s, ref i, "null")) return null;
            return ReadNumber(s, ref i);
        }

        static bool Match(string s, ref int i, string word)
        {
            if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) throw new FormatException("JSON: nieznane słowo");
            i += word.Length;
            return true;
        }

        static Dictionary<string, object> ReadObject(string s, ref int i)
        {
            Dictionary<string, object> o = new Dictionary<string, object>(StringComparer.Ordinal);
            i++;
            SkipWhite(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return o; }
            while (true)
            {
                SkipWhite(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new FormatException("JSON: oczekiwano klucza");
                string key = ReadString(s, ref i);
                SkipWhite(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new FormatException("JSON: oczekiwano ':'");
                i++;
                o[key] = ReadValue(s, ref i);
                SkipWhite(s, ref i);
                if (i >= s.Length) throw new FormatException("JSON: koniec obiektu");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return o; }
                throw new FormatException("JSON: oczekiwano ',' albo '}'");
            }
        }

        static List<object> ReadArray(string s, ref int i)
        {
            List<object> a = new List<object>();
            i++;
            SkipWhite(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return a; }
            while (true)
            {
                a.Add(ReadValue(s, ref i));
                SkipWhite(s, ref i);
                if (i >= s.Length) throw new FormatException("JSON: koniec tablicy");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return a; }
                throw new FormatException("JSON: oczekiwano ',' albo ']'");
            }
        }

        static string ReadString(string s, ref int i)
        {
            StringBuilder sb = new StringBuilder();
            i++;
            while (true)
            {
                if (i >= s.Length) throw new FormatException("JSON: niezamknięty tekst");
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                if (i >= s.Length) throw new FormatException("JSON: niepełna sekwencja");
                char e = s[i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw new FormatException("JSON: niepełne \\u");
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: throw new FormatException("JSON: nieznana sekwencja");
                }
            }
        }

        static double ReadNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (i == start) throw new FormatException("JSON: oczekiwano wartości");
            return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        // ------------------------------------------------------------ accessors

        public static string Str(Dictionary<string, object> o, string key)
        {
            object v;
            return o != null && o.TryGetValue(key, out v) ? v as string : null;
        }

        public static bool Bool(Dictionary<string, object> o, string key, bool fallback)
        {
            object v;
            return o != null && o.TryGetValue(key, out v) && v is bool ? (bool)v : fallback;
        }

        public static long Long(Dictionary<string, object> o, string key, long fallback)
        {
            object v;
            if (o == null || !o.TryGetValue(key, out v) || v == null) return fallback;
            // Parsed numbers are double; the ones the program sets itself (a count + 1, NowMs) are long or int.
            if (v is long) return (long)v;
            if (v is int) return (int)v;
            if (!(v is double)) return fallback;
            double d = (double)v;
            return d >= long.MinValue && d <= long.MaxValue ? (long)d : fallback;
        }

        public static bool Has(Dictionary<string, object> o, string key)
        {
            return o != null && o.ContainsKey(key) && o[key] != null;
        }

        public static Dictionary<string, object> Obj(Dictionary<string, object> o, string key)
        {
            object v;
            return o != null && o.TryGetValue(key, out v) ? v as Dictionary<string, object> : null;
        }

        // ------------------------------------------------------------ writing

        public static string Write(object value)
        {
            StringBuilder sb = new StringBuilder();
            WriteValue(sb, value, null, 0);
            return sb.ToString();
        }

        /// <summary>Indented by two spaces, ending with a newline (the shared files).</summary>
        public static string WritePretty(object value)
        {
            StringBuilder sb = new StringBuilder();
            WriteValue(sb, value, "  ", 0);
            sb.Append('\n');
            return sb.ToString();
        }

        static void NewLine(StringBuilder sb, string indent, int depth)
        {
            if (indent == null) return;
            sb.Append('\n');
            for (int k = 0; k < depth; k++) sb.Append(indent);
        }

        static void WriteValue(StringBuilder sb, object v, string indent, int depth)
        {
            if (v == null) { sb.Append("null"); return; }
            if (v is string) { WriteString(sb, (string)v); return; }
            if (v is bool) { sb.Append((bool)v ? "true" : "false"); return; }
            if (v is int || v is long || v is uint || v is short || v is ulong) { sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture)); return; }
            if (v is double || v is float)
            {
                double d = Convert.ToDouble(v, CultureInfo.InvariantCulture);
                if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append("null"); return; }
                if (d == Math.Floor(d) && Math.Abs(d) < 9e15) sb.Append(((long)d).ToString(CultureInfo.InvariantCulture));
                else sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            IDictionary dict = v as IDictionary;
            if (dict != null)
            {
                sb.Append('{');
                bool first = true;
                foreach (DictionaryEntry e in dict)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    NewLine(sb, indent, depth + 1);
                    WriteString(sb, Convert.ToString(e.Key, CultureInfo.InvariantCulture));
                    sb.Append(indent == null ? ":" : ": ");
                    WriteValue(sb, e.Value, indent, depth + 1);
                }
                if (!first) NewLine(sb, indent, depth);
                sb.Append('}');
                return;
            }
            IEnumerable list = v as IEnumerable;
            if (list != null)
            {
                sb.Append('[');
                bool first = true;
                foreach (object item in list)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    NewLine(sb, indent, depth + 1);
                    WriteValue(sb, item, indent, depth + 1);
                }
                if (!first) NewLine(sb, indent, depth);
                sb.Append(']');
                return;
            }
            WriteString(sb, Convert.ToString(v, CultureInfo.InvariantCulture));
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }

    /// <summary>A JSON object built in order (the lines and files keep their keys' order).</summary>
    public class JObj : System.Collections.Specialized.OrderedDictionary
    {
        public JObj Set(string key, object value)
        {
            this[key] = value;
            return this;
        }
    }
}
