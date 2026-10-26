// rd-guard.exe – the guard (spec „Instalacja, aktualizacje i log”): the owner of an installation at the start of Windows
// (its Run entry), and modes that answer one JSON line for the steps Node without native modules cannot do – an
// exception in a mode answers {"ok": false} and never starts a new guard. The app never reads the text of system tools.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;

[assembly: AssemblyTitle("Regulated Day – aktualizacja (strażnik)")]
[assembly: AssemblyProduct("Regulated Day")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace RegulatedDay
{
    public static class GuardMain
    {
        static string Arg(string[] args, string name)
        {
            for (int i = 0; i + 1 < args.Length; i++) if (args[i] == name) return args[i + 1];
            return null;
        }

        static bool Has(string[] args, string name)
        {
            return Array.IndexOf(args, name) >= 0;
        }

        static void Line(JObj o)
        {
            TextWriter w = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
            w.Write(Json.Write(o));
            w.Write('\n');
            w.Flush();
        }

        [STAThread]
        public static int Main(string[] args)
        {
            Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
            Thread.CurrentThread.CurrentUICulture = CultureInfo.InvariantCulture;
            CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
            CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;
            Native.PerMonitorDpi();
            // No error window, no Windows error report (the owner restarts itself; a mode answers {"ok": false}).
            Native.SetErrorMode(0x0002 | 0x0001);
            bool mode = Has(args, "--run-entry") || Has(args, "--query") || Has(args, "--kill") || Has(args, "--selftest") || Has(args, "--stress-write");
            if (mode)
            {
                try
                {
                    Line(Mode(args));
                }
                catch (Exception e)
                {
                    Line(new JObj().Set("ok", false).Set("error", e.GetType().Name + ": " + e.Message));
                }
                return 0;
            }
            string exe = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
            OwnerArgs oa = OwnerArgs.Parse(args, Path.Combine(Path.GetDirectoryName(exe), "task.json"));
            return new Owner("guard", oa).Run();
        }

        static JObj Mode(string[] args)
        {
            string exe = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
            string entry = Arg(args, "--run-entry");
            if (entry == "set")
            {
                RunEntry.Set(exe);
                return new JObj().Set("ok", true).Set("value", RunEntry.Value());
            }
            if (entry == "remove")
            {
                RunEntry.Remove();
                return new JObj().Set("ok", true).Set("present", RunEntry.Value() != null);
            }
            if (entry == "query")
            {
                bool? approved = RunEntry.Approved(RunEntry.Name);
                return new JObj().Set("ok", true).Set("value", RunEntry.Value()).Set("approved", approved.HasValue ? (object)approved.Value : null);
            }
            string query = Arg(args, "--query");
            if (query == "autostart")
            {
                string name = Arg(args, "--name") ?? "Regulated Day";
                string value;
                using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run"))
                    value = k == null ? null : k.GetValue(name) as string;
                bool? approved = RunEntry.Approved(name);
                return new JObj().Set("ok", true).Set("present", value != null).Set("value", value).Set("approved", approved.HasValue ? (object)approved.Value : null);
            }
            if (query == "power")
            {
                bool? ms = PowerCaps.ModernStandby(), mains = PowerCaps.OnMains(), saver = PowerCaps.BatterySaver();
                return new JObj().Set("ok", true)
                    .Set("modernStandby", ms.HasValue ? (object)ms.Value : null)
                    .Set("onMains", mains.HasValue ? (object)mains.Value : null)
                    .Set("batterySaver", saver.HasValue ? (object)saver.Value : null);
            }
            if (query == "process")
            {
                int pid = int.Parse(Arg(args, "--pid"), CultureInfo.InvariantCulture);
                string name = ProcessInfo.ImageName(pid);
                if (name == null || !ProcessInfo.Alive(pid, null, 0)) throw new InvalidOperationException("brak procesu " + pid);
                return new JObj().Set("ok", true).Set("pid", pid).Set("name", name).Set("startMs", ProcessInfo.StartMs(pid));
            }
            if (query == "installed")
            {
                string guid = Arg(args, "--guid") ?? "";
                return new JObj().Set("ok", true).Set("displayVersion", Install.DisplayVersion(Install.UninstallKey(guid))).Set("installLocation", Install.InstallLocation(guid));
            }
            if (Has(args, "--kill"))
            {
                // A hung owner: closed only when its program and start time are the ones expected (never a reused id).
                int pid = int.Parse(Arg(args, "--pid"), CultureInfo.InvariantCulture);
                long start = long.Parse(Arg(args, "--start") ?? "0", CultureInfo.InvariantCulture);
                string name = ProcessInfo.ImageName(pid);
                bool known = name != null && (string.Equals(name, "rd-guard.exe", StringComparison.OrdinalIgnoreCase) || string.Equals(name, "rd-install.exe", StringComparison.OrdinalIgnoreCase));
                if (!known || !ProcessInfo.Alive(pid, name, start)) return new JObj().Set("ok", true).Set("killed", false).Set("name", name);
                IntPtr h = Native.OpenProcess(Native.PROCESS_TERMINATE, false, pid);
                bool killed = h != IntPtr.Zero && Native.TerminateProcess(h, 1);
                if (h != IntPtr.Zero) Native.CloseHandle(h);
                return new JObj().Set("ok", true).Set("killed", killed).Set("name", name);
            }
            if (Has(args, "--stress-write"))
            {
                // CI: the task file written N times while Node writes and reads it (spec: 10 000 parallel writes and reads
                // without a single missing file); answers the writes whose retries ran out and the unreadable reads.
                string path = Arg(args, "--stress-write");
                int count = int.Parse(Arg(args, "--count") ?? "1000", CultureInfo.InvariantCulture);
                int failed = 0, unreadable = 0, missing = 0;
                for (int i = 0; i < count; i++)
                {
                    try { SharedFile.Write(path, Json.WritePretty(new JObj().Set("format", 1).Set("version", "0.0.0").Set("state", "scheduled").Set("writer", "cs").Set("i", i))); }
                    catch (Exception) { failed++; }
                    try
                    {
                        string text = SharedFile.Read(path);
                        if (text == null) missing++;
                        else Json.ParseObject(text);
                    }
                    catch (Exception) { unreadable++; }
                }
                return new JObj().Set("ok", true).Set("writes", count).Set("failed", failed).Set("unreadable", unreadable).Set("missing", missing);
            }
            if (Has(args, "--selftest"))
            {
                JObj r = SelfTestOwner.Run();
                r.Set("ok", true);
                return r;
            }
            throw new ArgumentException("nieznany tryb");
        }
    }

    public static class SelfTestOwner
    {
        public static JObj Run()
        {
            JObj r = new JObj();
            r.Set("powerCapabilities", PowerCaps.Layout());
            bool? ms = PowerCaps.ModernStandby();
            r.Set("modernStandby", ms.HasValue ? (object)ms.Value : null);
            r.Set("culture", CultureInfo.CurrentCulture.Name);
            r.Set("now", Native.NowMs());
            // A count the owner sets reads back at once: the limit of 4 starts is checked right after the write.
            TaskFile t = TaskFile.FromText("selftest", "{\"format\": 1, \"version\": \"0.0.1\", \"state\": \"scheduled\", \"starts\": 3}");
            t.Set("starts", t.Starts + 1);
            r.Set("startsAfterSet", t.Starts);
            return r;
        }
    }
}
