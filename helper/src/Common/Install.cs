// The installation as Windows records it (spec „Instalacja, aktualizacje i log”): the user's uninstall entry of the fixed
// nsis.guid (DisplayVersion; no entry = no installation) and the manifest of the release – the files of win-unpacked with
// their sizes and SHA-256 (SHA256Cng). „Zainstalowano X”: DisplayVersion higher than X, or equal to X with the files
// agreeing with the manifest. Files the installer adds by itself (the uninstaller, its icon, resources\package-type, the
// marker) are not in the manifest and are never compared.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using Microsoft.Win32;

namespace RegulatedDay
{
    public class ManifestFile
    {
        public string Path;
        public long Size;
        public string Sha256;
    }

    public class Manifest
    {
        public string Version;
        public string Electron;
        public List<ManifestFile> Files = new List<ManifestFile>();

        public static Manifest Load(string path)
        {
            string text = SharedFile.Read(path);
            if (text == null) return null;
            Dictionary<string, object> o = Json.ParseObject(text);
            Manifest m = new Manifest();
            m.Version = Json.Str(o, "version");
            m.Electron = Json.Str(o, "electron");
            List<object> files = o.ContainsKey("files") ? o["files"] as List<object> : null;
            if (files != null)
                foreach (object f in files)
                {
                    Dictionary<string, object> fo = f as Dictionary<string, object>;
                    if (fo == null) continue;
                    ManifestFile mf = new ManifestFile();
                    mf.Path = Json.Str(fo, "path");
                    mf.Size = Json.Long(fo, "size", -1);
                    mf.Sha256 = Json.Str(fo, "sha256");
                    if (mf.Path != null) m.Files.Add(mf);
                }
            return m;
        }

        /// <summary>Every file of the manifest is there with its size; `firstBad` names the first that is not.</summary>
        public bool SizesMatch(string dir, out string firstBad)
        {
            firstBad = null;
            foreach (ManifestFile f in Files)
            {
                FileInfo fi = new FileInfo(System.IO.Path.Combine(dir, f.Path.Replace('/', '\\')));
                if (!fi.Exists || fi.Length != f.Size) { firstBad = f.Path; return false; }
            }
            return true;
        }

        /// <summary>Every file's SHA-256 agrees; `beat` is called every 32 MB read (the guard's signal of life).</summary>
        public bool HashesMatch(string dir, Action beat, out string firstBad)
        {
            firstBad = null;
            byte[] buf = new byte[1024 * 1024];
            long sinceBeat = 0;
            foreach (ManifestFile f in Files)
            {
                string path = System.IO.Path.Combine(dir, f.Path.Replace('/', '\\'));
                try
                {
                    using (SHA256Cng sha = new SHA256Cng())
                    using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    {
                        int n;
                        while ((n = fs.Read(buf, 0, buf.Length)) > 0)
                        {
                            sha.TransformBlock(buf, 0, n, null, 0);
                            sinceBeat += n;
                            if (sinceBeat >= 32L * 1024 * 1024)
                            {
                                sinceBeat = 0;
                                if (beat != null) beat();
                            }
                        }
                        sha.TransformFinalBlock(buf, 0, 0);
                        string hex = BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
                        if (hex != (f.Sha256 ?? "").ToLowerInvariant()) { firstBad = f.Path; return false; }
                    }
                }
                catch (IOException) { firstBad = f.Path; return false; }
                catch (UnauthorizedAccessException) { firstBad = f.Path; return false; }
            }
            return true;
        }
    }

    public static class Install
    {
        public static string UninstallKey(string guid)
        {
            return "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + guid;
        }

        /// <summary>DisplayVersion of the user's uninstall entry; null = no installation.</summary>
        public static string DisplayVersion(string uninstallKey)
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(uninstallKey))
                return k == null ? null : k.GetValue("DisplayVersion") as string;
        }

        /// <summary>InstallLocation of the entry of nsis.guid (HKCU\Software\&lt;guid&gt;).</summary>
        public static string InstallLocation(string guid)
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey("Software\\" + guid))
                return k == null ? null : k.GetValue("InstallLocation") as string;
        }

        public static JObj CheckLocation(string guid, string exe)
        {
            string loc = guid == null ? null : InstallLocation(guid);
            bool matches = loc != null && exe != null && string.Equals(System.IO.Path.GetFullPath(loc).TrimEnd('\\'), System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(exe)).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
            if (loc != null && !matches) Log.Warn("ścieżka programu " + exe + " inna niż InstallLocation " + loc);
            return new JObj().Set("installLocation", loc).Set("matches", matches);
        }

        /// <summary>Semantic versions „1.2.3” compared (a pre-release below its release).</summary>
        public static int Compare(string a, string b)
        {
            int[] x = Parts(a), y = Parts(b);
            for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i].CompareTo(y[i]);
            bool pa = a.IndexOf('-') >= 0, pb = b.IndexOf('-') >= 0;
            if (pa == pb) return string.CompareOrdinal(a, b);
            return pa ? -1 : 1;
        }

        static int[] Parts(string v)
        {
            string core = (v ?? "0.0.0").TrimStart('v').Split('-', '+')[0];
            string[] p = core.Split('.');
            int[] r = new int[3];
            for (int i = 0; i < 3 && i < p.Length; i++) int.TryParse(p[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out r[i]);
            return r;
        }
    }
}
