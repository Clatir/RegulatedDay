// rd-helper.exe (spec „Pomocnik”): a child process of the app with its working folder in the app data. It reads its
// paths as the first JSON line, talks in JSON lines (UTF-8) and says it is alive every 2 s.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;

[assembly: AssemblyTitle("Regulated Day – pomocnik")]
[assembly: AssemblyProduct("Regulated Day")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace RegulatedDay
{
    public static class HelperMain
    {
        static readonly object OutGate = new object();
        static TextWriter stdout;
        static Watcher watcher;
        static readonly PowerRequests power = new PowerRequests();
        static string identity = "Regulated Day";
        static string aumid = "app.regulatedday.desktop";

        static void Send(JObj o)
        {
            string line = Json.Write(o);
            lock (OutGate)
            {
                try
                {
                    stdout.Write(line);
                    stdout.Write('\n');
                    stdout.Flush();
                }
                catch (IOException)
                {
                    // The app is gone: nothing to talk to.
                    Environment.Exit(0);
                }
            }
        }

        static void Reply(Dictionary<string, object> m, JObj o)
        {
            if (!Json.Has(m, "id")) return;
            o.Set("re", Json.Long(m, "id", 0));
            if (!o.Contains("ok")) o.Set("ok", true);
            Send(o);
        }

        public static int Main(string[] args)
        {
            Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
            Thread.CurrentThread.CurrentUICulture = CultureInfo.InvariantCulture;
            CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
            CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;
            Native.PerMonitorDpi();
            UTF8Encoding utf8 = new UTF8Encoding(false);
            stdout = new StreamWriter(Console.OpenStandardOutput(), utf8);
            TextReader stdin = new StreamReader(Console.OpenStandardInput(), utf8);
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
            {
                Log.Error("nieobsłużony wyjątek: " + e.ExceptionObject);
                Environment.Exit(3);
            };
            string first = stdin.ReadLine();
            if (first == null) return 2;
            Dictionary<string, object> init = Json.ParseObject(first);
            identity = Json.Str(init, "identity") ?? identity;
            aumid = Json.Str(init, "aumid") ?? aumid;
            string logs = Json.Str(init, "logs") ?? Path.Combine(Environment.CurrentDirectory, "logs");
            Log.Init(Path.Combine(logs, "helper.log"));
            Log.Info("start (" + identity + ", pid " + System.Diagnostics.Process.GetCurrentProcess().Id + ")");
            watcher = new Watcher(Send);
            watcher.Start();
            Timer alive = new Timer(delegate(object s) { Send(new JObj().Set("type", "alive")); }, null, 2000, 2000);
            Send(new JObj().Set("type", "hello").Set("version", "1").Set("pid", System.Diagnostics.Process.GetCurrentProcess().Id));
            string line;
            while ((line = stdin.ReadLine()) != null)
            {
                Dictionary<string, object> m;
                try { m = Json.ParseObject(line); }
                catch (FormatException) { Log.Warn("nieczytelna linia: " + line); continue; }
                try
                {
                    if (!Handle(m)) break;
                }
                catch (Exception e)
                {
                    Log.Error("polecenie " + Json.Str(m, "cmd") + ": " + e);
                    if (Json.Has(m, "id")) Reply(m, new JObj().Set("ok", false).Set("error", e.Message));
                }
            }
            GC.KeepAlive(alive);
            power.Dispose();
            Log.Info("koniec");
            return 0;
        }

        static IntPtr Hwnd(Dictionary<string, object> m)
        {
            long v;
            string s = Json.Str(m, "hwnd");
            return s != null && long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out v) ? new IntPtr(v) : IntPtr.Zero;
        }

        /// <summary>One command; false = quit.</summary>
        static bool Handle(Dictionary<string, object> m)
        {
            string cmd = Json.Str(m, "cmd");
            switch (cmd)
            {
                case "quit":
                    return false;
                case "bar.watch":
                    {
                        IntPtr h = Hwnd(m);
                        watcher.Post(delegate() { watcher.Bar.Watch(h); });
                        return true;
                    }
                case "bar.unwatch":
                    watcher.Post(delegate() { watcher.Bar.Unwatch(); });
                    return true;
                case "bar.retry":
                    watcher.Post(delegate() { watcher.Bar.Retry(true, "przycisk"); });
                    return true;
                case "foreground.watch":
                    return true;
                case "notificationState":
                    {
                        int raw;
                        string state = NotificationState.Read(out raw);
                        Reply(m, new JObj().Set("state", state).Set("raw", raw));
                        return true;
                    }
                case "toastSetting":
                    Reply(m, new JObj().Set("setting", ToastSetting.Read(Json.Str(m, "aumid") ?? aumid)));
                    return true;
                case "power":
                    power.Set(Json.Bool(m, "display", false), Json.Bool(m, "system", false), Json.Bool(m, "execution", false), Json.Str(m, "reason"));
                    {
                        JObj st = power.State();
                        st.Set("type", "power").Set("event", "requests");
                        Send(st);
                        Reply(m, power.State());
                    }
                    return true;
                case "session.start":
                    Reply(m, LogonSession.Start(identity, Json.Str(m, "runId") ?? ""));
                    return true;
                case "oneDrive":
                    Reply(m, new JObj().Set("running", OneDrive.Running()));
                    return true;
                case "attributes":
                    {
                        JObj attrs = new JObj();
                        List<object> paths = m.ContainsKey("paths") ? m["paths"] as List<object> : null;
                        if (paths != null) foreach (object p in paths) if (p is string) attrs.Set((string)p, Attributes.Of((string)p));
                        Reply(m, new JObj().Set("attributes", attrs));
                        return true;
                    }
                case "powerState":
                    {
                        bool? ms = PowerCaps.ModernStandby();
                        bool? mains = PowerCaps.OnMains();
                        bool? saver = PowerCaps.BatterySaver();
                        Reply(m, new JObj().Set("modernStandby", ms.HasValue ? (object)ms.Value : null).Set("onMains", mains.HasValue ? (object)mains.Value : null).Set("batterySaver", saver.HasValue ? (object)saver.Value : null));
                        return true;
                    }
                case "installLocation":
                    Reply(m, Install.CheckLocation(Json.Str(m, "guid"), Json.Str(m, "exe")));
                    return true;
                case "selftest":
                    Reply(m, SelfTest.Run(identity, aumid));
                    return true;
                default:
                    Reply(m, new JObj().Set("ok", false).Set("error", "nieznane polecenie " + cmd));
                    return true;
            }
        }
    }
}
