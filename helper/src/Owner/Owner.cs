// The owner of an installation (spec „Instalacja, aktualizacje i log”): the guard at the start of Windows, the install
// helper at the exit, „Zainstaluj teraz” and at night. It holds a named mutex and guard.lock to its end, so at most one
// runs; an abandoned mutex (an owner that died) counts as free. Every start counts in the task file right after taking
// the mutex; only the mark of a clean end, written right before a normal exit, sets the count back to zero. Before each
// step it reads the task file and the uninstall entry again: X or newer installed by any way – „zakończono”; not started
// and a session or a class now or within 30 min (the plan file) – „odłożono”; started and unfinished, or files not
// agreeing with the manifest – X installed again („Naprawiam instalację…”); after two failed attempts it stops.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace RegulatedDay
{
    public class OwnerArgs
    {
        public string TaskPath;
        public int WaitPid;
        public int AfterPid;
        public long AfterStart;
        public bool Autostart;
        public bool Hidden;

        public static OwnerArgs Parse(string[] args, string defaultTask)
        {
            OwnerArgs a = new OwnerArgs();
            a.TaskPath = defaultTask;
            for (int i = 0; i < args.Length; i++)
            {
                string k = args[i];
                string v = i + 1 < args.Length ? args[i + 1] : null;
                if (k == "--task" && v != null) { a.TaskPath = v; i++; }
                else if (k == "--wait-pid" && v != null) { int.TryParse(v, out a.WaitPid); i++; }
                else if (k == "--after" && v != null)
                {
                    string[] p = v.Split(':');
                    int.TryParse(p[0], out a.AfterPid);
                    if (p.Length > 1) long.TryParse(p[1], out a.AfterStart);
                    i++;
                }
                else if (k == "--autostart") a.Autostart = true;
                else if (k == "--hidden") a.Hidden = true;
            }
            return a;
        }
    }

    public class Owner
    {
        public const string AppExeName = "Regulated Day.exe";
        public const int MaxAttempts = 2;
        public const int MaxStarts = 4;
        const long InstallerLimitMs = 10 * 60 * 1000;
        const long StepLimitMs = 60 * 1000;
        const long ConfirmLimitMs = 180 * 1000;

        public readonly string Role;
        readonly OwnerArgs args;
        readonly string exePath;
        readonly AwakeClock awake = new AwakeClock();
        readonly PowerRequests power = new PowerRequests();
        public TaskFile Task;
        public OwnerUi Ui;
        Mutex mutex;
        FileStream lockStream;
        long counter;
        string step = "start";
        long stepStart;
        long stepLimit = StepLimitMs;
        readonly object lockGate = new object();
        Timer heartbeat;
        InstallerJob job;
        bool counterWritten;
        volatile bool runAnyway;
        string userData;

        public Owner(string role, OwnerArgs args)
        {
            Role = role;
            this.args = args;
            exePath = Process.GetCurrentProcess().MainModule.FileName;
        }

        string TaskDir { get { return Path.GetDirectoryName(Path.GetFullPath(args.TaskPath)); } }

        public bool StartedByHand { get { return !args.Autostart && !args.Hidden && args.WaitPid == 0 && args.AfterPid == 0; } }

        // ------------------------------------------------------------ the run

        public int Run()
        {
            userData = Path.GetFullPath(Path.Combine(TaskDir, "..", ".."));
            Log.Init(Path.Combine(userData, "logs", Role + ".log"));
            Log.Info("start " + Role + " (pid " + Process.GetCurrentProcess().Id + ", " + string.Join(" ", Environment.GetCommandLineArgs(), 1, Environment.GetCommandLineArgs().Length - 1) + ")");
            try
            {
                return RunOwner();
            }
            catch (Exception e)
            {
                Crash(e);
                return 3;
            }
        }

        int RunOwner()
        {
            if (args.AfterPid > 0) WaitForEnd(args.AfterPid, args.AfterStart, 60000, "poprzedni właściciel");
            if (args.WaitPid > 0) WaitForEnd(args.WaitPid, 0, 120000, "aplikacja");
            if (!TakeMutex())
            {
                HandOverToLiveOwner();
                return 0;
            }
            Task = TaskFile.Load(args.TaskPath);
            if (Task == null)
            {
                Log.Info("brak pliku zadania – koniec");
                StartAppIfComplete(null, false);
                return 0;
            }
            try
            {
                Task.Set("starts", Task.Starts + 1);
                Task.Set("cleanEnd", false);
                Task.Save();
                counterWritten = true;
            }
            catch (Exception e)
            {
                // Without the count the starts cannot be told apart: no installation, and no new owner after a crash.
                Log.Error("zapis licznika startów nie udał się: " + e.Message);
                StartAppIfComplete(Task, false);
                return 0;
            }
            TakeLock();
            // CI: a hung owner – the lock held, the signal standing still (the app closes it after 30 s).
            if (Environment.GetEnvironmentVariable("RD_TEST_OWNER_HANG") == "1" && args.AfterPid == 0)
            {
                Log.Warn("RD_TEST_OWNER_HANG: zawieszam się");
                Thread.Sleep(Timeout.Infinite);
            }
            heartbeat = new Timer(delegate(object s) { TickSignal(); }, null, 1000, 1000);
            power.Set(false, true, true, "Regulated Day: instalacja aktualizacji");
            Ui = new OwnerUi(this);
            if (Task.Starts >= MaxStarts)
            {
                GiveUpAfterStarts();
                return 0;
            }
            // After the count: a start that throws every time still reaches the limit of 4 starts.
            Test("start");
            Loop();
            return 0;
        }

        /// <summary>
        /// Test hooks of CI (RD_TEST_OWNER_THROW=&lt;step&gt;): an exception at that step of the first owner only (the one
        /// started after it, with --after, goes on); „every-start” – at every start.
        /// </summary>
        void Test(string where)
        {
            string at = Environment.GetEnvironmentVariable("RD_TEST_OWNER_THROW");
            if (at == "every-start" && where == "start") throw new InvalidOperationException("RD_TEST_OWNER_THROW: every-start");
            if (at == where && args.AfterPid == 0) throw new InvalidOperationException("RD_TEST_OWNER_THROW: " + where);
        }

        void Loop()
        {
            long uncountedUntil = awake.AwakeMs + InstallerLimitMs;
            while (true)
            {
                Step("sprawdzenie", StepLimitMs);
                Task.Reload();
                string state = Task.State;
                if (state == "done") { Finish(false); return; }
                if (state == "failed")
                {
                    Log.Info("zadanie już nieudane – koniec");
                    StartAppIfComplete(Task, false);
                    CleanEnd();
                    Release();
                    return;
                }
                bool repair = Task.InstallerStarted;
                string installed = Installed(true);
                if (installed == "yes") { AfterInstalled(); return; }
                if (!repair && !runAnyway && (Task.Trigger == "logon" || args.Autostart) && Plan.WaitAtLogon(userData))
                {
                    Postpone();
                    return;
                }
                if (Task.Attempts >= MaxAttempts)
                {
                    FailAfterAttempts();
                    return;
                }
                if (!File.Exists(Task.Installer))
                {
                    Log.Error("brak instalatora " + Task.Installer);
                    Fail("Brak pliku instalatora.", true);
                    return;
                }
                Ui.Progress(repair ? "Naprawiam instalację…" : "Instaluję " + Task.Version + "…", Task.Trigger == "night");
                Step("mutex instalatora", StepLimitMs);
                WaitInstallerMutex();
                Test("beforeInstaller");
                Task.Set("attempts", Task.Attempts + 1);
                Task.Set("installerStartedAt", Native.NowMs());
                Task.Set("state", "installing");
                Task.Save();
                Step("instalator", InstallerLimitMs);
                long started = awake.AwakeMs;
                long startedWall = Environment.TickCount;
                uint code = RunInstaller();
                long took = unchecked(Environment.TickCount - startedWall);
                // Code 2 within 5 s is no attempt only while the installer's mutex exists right then (another installer
                // runs); the old uninstaller gives code 2 too for a busy file. Such retries for at most 10 min awake.
                if (code == 2 && took < 5000 && InstallerMutex.Exists(Task.Guid) && awake.AwakeMs < uncountedUntil)
                {
                    Log.Info("instalator: kod 2 przy istniejącym mutexie – nie liczę próby");
                    Task.Set("attempts", Math.Max(0, Task.Attempts - 1));
                    Task.Save();
                    Thread.Sleep(2000);
                    continue;
                }
                Log.Info("instalator zakończył się kodem " + code + " po " + ((awake.AwakeMs - started) / 1000) + " s czuwania");
            }
        }

        // ------------------------------------------------------------ the steps

        /// <summary>The signal of life rises only while the current step makes progress (each step has its time limit).</summary>
        void Step(string name, long limitMs)
        {
            step = name;
            stepStart = awake.AwakeMs;
            stepLimit = limitMs;
            Beat();
        }

        public void Beat()
        {
            lock (lockGate)
            {
                counter++;
                WriteLock();
            }
        }

        void TickSignal()
        {
            if (awake.AwakeMs - stepStart <= stepLimit) Beat();
        }

        bool TakeMutex()
        {
            mutex = new Mutex(false, "Local\\RegulatedDay.Owner." + (Task != null ? Task.Guid : "E2A45BEE-EF15-48BC-9498-F12E5B866145"));
            try
            {
                return mutex.WaitOne(0);
            }
            catch (AbandonedMutexException)
            {
                Log.Warn("porzucony mutex właściciela (poprzedni zginął) – przejmuję");
                return true;
            }
        }

        void TakeLock()
        {
            string path = Path.Combine(TaskDir, "guard.lock");
            lockStream = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.Read);
            lockStream.SetLength(0);
            Beat();
        }

        void WriteLock()
        {
            if (lockStream == null) return;
            JObj o = new JObj().Set("role", Role).Set("pid", Process.GetCurrentProcess().Id).Set("startMs", ProcessInfo.StartMs(Process.GetCurrentProcess().Id)).Set("counter", counter).Set("step", step);
            byte[] bytes = new UTF8Encoding(false).GetBytes(Json.Write(o).PadRight(200) + "\n");
            try
            {
                lockStream.Position = 0;
                lockStream.Write(bytes, 0, bytes.Length);
                lockStream.SetLength(bytes.Length);
                lockStream.Flush(true);
            }
            catch (IOException e) { Log.Warn("guard.lock: " + e.Message); }
        }

        void WaitForEnd(int pid, long startMs, int ms, string what)
        {
            Stopwatch sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < ms && ProcessInfo.Alive(pid, null, startMs)) Thread.Sleep(200);
            Log.Info(what + " (pid " + pid + ")" + (ProcessInfo.Alive(pid, null, startMs) ? " wciąż działa po " + ms / 1000 + " s" : " zakończona"));
        }

        void WaitInstallerMutex()
        {
            for (int i = 0; i < 30 && InstallerMutex.Exists(Task.Guid); i++)
            {
                Beat();
                Thread.Sleep(2000);
            }
        }

        uint RunInstaller()
        {
            job = new InstallerJob();
            try
            {
                job.Start(Task.Installer, "--updated /S", TaskDir);
                Log.Info("instalator wystartował (pid " + job.Pid + ")");
                long until = awake.AwakeMs + InstallerLimitMs;
                long throwAt = awake.AwakeMs + 3000;
                while (!job.Wait(1000))
                {
                    if (awake.AwakeMs > throwAt) Test("duringInstaller");
                    if (runAnyway) { Log.Info("„Uruchom mimo to”: przerywam instalator"); job.Kill(); job.Wait(10000); break; }
                    if (awake.AwakeMs > until) { Log.Warn("instalator przerwany po 10 min czuwania"); job.Kill(); job.Wait(10000); break; }
                }
                return job.ExitCode;
            }
            finally
            {
                job.Dispose();
                job = null;
            }
        }

        /// <summary>„yes” – X or newer; „partial” – an entry but files not agreeing; „no” – not installed.</summary>
        string Installed(bool hashes)
        {
            string shown = Install.DisplayVersion(Task.UninstallKey);
            if (shown == null) return "no";
            int cmp = Install.Compare(shown, Task.Version);
            if (cmp > 0) return "yes";
            if (cmp < 0) return "no";
            Manifest m = Manifest.Load(Task.ManifestPath);
            if (m == null) { Log.Warn("brak manifestu " + Task.ManifestPath); return "partial"; }
            string bad;
            if (!m.SizesMatch(Task.InstallDir, out bad)) { Log.Info("pliki niezgodne z manifestem (rozmiar): " + bad); return "partial"; }
            if (!hashes) return "yes";
            Step("SHA-256", StepLimitMs);
            if (!m.HashesMatch(Task.InstallDir, Beat, out bad)) { Log.Info("pliki niezgodne z manifestem (SHA-256): " + bad); return "partial"; }
            return "yes";
        }

        /// <summary>
        /// The app can start: its exe is there with an installation – the old version left whole (DisplayVersion below X), or
        /// X with its files agreeing with the manifest. No uninstall entry (the old version removed, X not in) is not complete.
        /// </summary>
        bool FilesComplete()
        {
            if (Task == null || !File.Exists(Task.AppExe)) return false;
            string shown = Install.DisplayVersion(Task.UninstallKey);
            if (shown == null) return false;
            return Install.Compare(shown, Task.Version) != 0 || Installed(false) == "yes";
        }

        // ------------------------------------------------------------ the ends

        void AfterInstalled()
        {
            string shown = Install.DisplayVersion(Task.UninstallKey) ?? Task.Version;
            if (Install.Compare(shown, Task.Version) > 0)
            {
                // A newer version is there already, by any way (installed by hand): the task ends, nothing is reinstalled.
                Log.Info("zainstalowano " + shown + " (nowsza niż " + Task.Version + ") – kończę zadanie");
                StartAppIfComplete(Task, false);
                Finish(false);
                return;
            }
            Log.Info("zainstalowano " + Task.Version);
            Step("start aplikacji", ConfirmLimitMs + StepLimitMs);
            bool started = StartAppIfComplete(Task, true);
            bool confirmed = !started || WaitLaunched();
            Finish(!confirmed);
        }

        /// <summary>„zakończono”: the task done, the guard's entry and the task file gone, a clean end.</summary>
        void Finish(bool startNotConfirmed)
        {
            Task.Set("state", "done");
            Task.Save();
            RunEntry.Remove();
            if (startNotConfirmed)
            {
                Log.Warn("nowa wersja nie potwierdziła startu w 180 s czuwania");
                Ui.StartByHand(Task.AppExe);
            }
            CleanEnd();
            try { File.Delete(Task.Path); } catch (Exception e) { Log.Warn("plik zadania: " + e.Message); }
            Release();
        }

        void Postpone()
        {
            Log.Info("sesja albo zajęcia teraz lub w ciągu 30 min – odkładam instalację");
            Task.Set("state", "postponed");
            Task.Save();
            if (Environment.GetEnvironmentVariable("RD_TEST_DIE_AFTER_POSTPONE") == "1")
            {
                Log.Warn("RD_TEST_DIE_AFTER_POSTPONE: koniec procesu zaraz po „odłożono”");
                Native.TerminateProcess(Native.GetCurrentProcess(), 9);
            }
            StartAppIfComplete(Task, false);
            CleanEnd();
            Release();
        }

        void FailAfterAttempts()
        {
            Log.Warn("dwie nieudane próby instalacji " + Task.Version + " – przestaję");
            // The window „nie udała się” always; the app starts too when its files are complete (it shows the banner).
            Fail("Aktualizacja do " + Task.Version + " nie udała się.", true, FilesComplete());
        }

        void GiveUpAfterStarts()
        {
            Log.Warn("licznik startów " + Task.Starts + " – nie instaluję");
            bool broken = Task.InstallerStarted && Installed(false) != "yes";
            Fail("Aktualizacja do " + Task.Version + " nie udała się.", broken);
        }

        /// <summary>„nieudane”: the entry removed; the app started (it shows the banner) and/or the window „nie udała się”.</summary>
        void Fail(string message, bool showWindow, bool startApp = true)
        {
            Task.Set("state", "failed");
            Task.Set("message", message);
            Task.Save();
            RunEntry.Remove();
            if (startApp && (!showWindow || FilesComplete())) StartAppIfComplete(Task, false);
            CleanEnd();
            if (showWindow) Ui.Failed(Task.Version);
            Release();
        }

        public void CleanEnd()
        {
            if (Task == null || !counterWritten) return;
            try
            {
                Task.Reload();
                Task.Set("starts", 0L);
                Task.Set("cleanEnd", true);
                Task.Save();
            }
            catch (Exception e) { Log.Warn("znacznik czystego końca: " + e.Message); }
        }

        void Release()
        {
            if (Ui != null) Ui.Close();
            power.Dispose();
            if (heartbeat != null) heartbeat.Dispose();
            if (lockStream != null) { lockStream.Dispose(); lockStream = null; }
            try { File.Delete(Path.Combine(TaskDir, "guard.lock")); } catch { }
            if (mutex != null) { try { mutex.ReleaseMutex(); } catch { } mutex.Dispose(); mutex = null; }
        }

        /// <summary>Another owner lives: this start is handed over to it (a guard from the autostart: hidden).</summary>
        void HandOverToLiveOwner()
        {
            Log.Info("inny właściciel działa – przekazuję start");
            JObj line = new JObj().Set("at", Native.NowMs()).Set("hidden", !StartedByHand).Set("url", null);
            try { File.AppendAllText(Path.Combine(TaskDir, "handover.jsonl"), Json.Write(line) + "\n", new UTF8Encoding(false)); } catch (Exception e) { Log.Warn("handover: " + e.Message); }
        }

        // ------------------------------------------------------------ starting the app

        /// <summary>
        /// Every branch ends with the app started, when it does not run and its files are complete – unless the guard started
        /// from the autostart while the app's autostart is off. The starts handed over meanwhile: visible before hidden.
        /// </summary>
        public bool StartAppIfComplete(TaskFile task, bool updated)
        {
            string exe = task != null ? task.AppExe : null;
            if (string.IsNullOrEmpty(exe) || !File.Exists(exe)) { Log.Warn("aplikacji nie ma (" + exe + ") – nie uruchamiam"); return false; }
            if (AppRuns(exe)) { Log.Info("aplikacja już działa"); return false; }
            string start = task.Start;
            string url = task.Url;
            if (Role == "guard") start = StartedByHand ? "visible" : "hidden";
            MergeHandovers(ref start, ref url);
            if (args.Autostart && !task.Autostart && start == "hidden" && url == null) { Log.Info("autostart aplikacji wyłączony – nie uruchamiam"); return false; }
            if (start == "none" && url == null) { Log.Info("bez startu aplikacji (wyjście)"); return false; }
            List<string> a = new List<string>();
            if (updated) a.Add("--updated");
            if (start == "hidden") a.Add("--hidden");
            if (url != null) a.Add(url);
            string line = "";
            foreach (string s in a) line += (line.Length > 0 ? " " : "") + Launch.Quote(s);
            int pid = Launch.Detached(exe, line, Path.GetDirectoryName(exe));
            Log.Info("aplikacja uruchomiona (pid " + pid + ", " + line + ")");
            return true;
        }

        void MergeHandovers(ref string start, ref string url)
        {
            string text = null;
            try { text = SharedFile.Read(Path.Combine(TaskDir, "handover.jsonl")); } catch { }
            if (text == null) return;
            foreach (string raw in text.Split('\n'))
            {
                if (raw.Trim().Length == 0) continue;
                try
                {
                    Dictionary<string, object> h = Json.ParseObject(raw);
                    if (!Json.Bool(h, "hidden", true)) start = "visible";
                    else if (start == "none") start = "hidden";
                    if (Json.Str(h, "url") != null) url = Json.Str(h, "url");
                }
                catch (FormatException) { }
            }
        }

        static bool AppRuns(string exe)
        {
            foreach (Process p in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(exe)))
            {
                try
                {
                    string path = ProcessInfo.ImagePath(p.Id);
                    if (path != null && string.Equals(Path.GetFullPath(path), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase)) return true;
                }
                finally { p.Dispose(); }
            }
            return false;
        }

        /// <summary>„uruchomiono wersję X” with this attempt's id, within 180 s awake.</summary>
        bool WaitLaunched()
        {
            string file = Path.Combine(userData, "launched.json");
            long until = awake.AwakeMs + ConfirmLimitMs;
            while (awake.AwakeMs < until)
            {
                try
                {
                    string text = SharedFile.Read(file);
                    if (text != null)
                    {
                        Dictionary<string, object> o = Json.ParseObject(text);
                        if (Json.Str(o, "version") == Task.Version && Json.Str(o, "attemptId") == Task.AttemptId) { Log.Info("nowa wersja potwierdziła start"); return true; }
                    }
                }
                catch (Exception) { }
                Thread.Sleep(500);
            }
            return false;
        }

        /// <summary>„Uruchom mimo to”: the installer stops, the files are made complete by the manifest, then the app starts.</summary>
        public void RunAnyway()
        {
            runAnyway = true;
        }

        // ------------------------------------------------------------ an exception

        /// <summary>
        /// An unhandled exception of the owner: the log, the job closed (the installer ends with it), the locks released, a new
        /// owner with the same task and --after (this process's id and start), detached and outside the job, and this process
        /// ends by TerminateProcess – no error window, no Windows error report. No new owner after a failed write of the count.
        /// </summary>
        void Crash(Exception e)
        {
            Log.Error("nieobsłużony wyjątek właściciela: " + e);
            try { if (job != null) job.Dispose(); } catch { }
            try { if (lockStream != null) lockStream.Dispose(); } catch { }
            try { if (mutex != null) { mutex.ReleaseMutex(); mutex.Dispose(); } } catch { }
            if (counterWritten)
            {
                try
                {
                    int pid = Process.GetCurrentProcess().Id;
                    string a = "--task " + Launch.Quote(Path.GetFullPath(args.TaskPath)) + " --after " + pid + ":" + ProcessInfo.StartMs(pid) + (args.Autostart ? " --autostart" : "");
                    int child = Launch.Detached(exePath, a, Path.GetDirectoryName(exePath));
                    Log.Info("nowy właściciel uruchomiony (pid " + child + ")");
                }
                catch (Exception e2) { Log.Error("nowy właściciel nie wystartował: " + e2.Message); }
            }
            Native.SetErrorMode(0x0002 | 0x0001);
            Native.TerminateProcess(Native.GetCurrentProcess(), 3);
        }
    }

    /// <summary>The local plan of sessions and classes for the next 7 logical days (the app writes plan-blocks.json).</summary>
    public static class Plan
    {
        /// <summary>covered: the file covers now; blocking: a session or a class runs now or starts within 30 min.</summary>
        public static void Read(string userData, out bool covered, out bool blocking)
        {
            covered = false;
            blocking = false;
            string text;
            try { text = SharedFile.Read(Path.Combine(userData, "plan-blocks.json")); }
            catch (Exception) { return; }
            if (text == null) return;
            Dictionary<string, object> o;
            try { o = Json.ParseObject(text); } catch (FormatException) { return; }
            long now = Native.NowMs();
            covered = now >= Json.Long(o, "from", long.MaxValue) && now < Json.Long(o, "to", 0);
            List<object> blocks = o.ContainsKey("blocks") ? o["blocks"] as List<object> : null;
            if (blocks == null) return;
            foreach (object b in blocks)
            {
                Dictionary<string, object> bo = b as Dictionary<string, object>;
                if (bo == null) continue;
                long start = Json.Long(bo, "start", 0), end = Json.Long(bo, "end", 0);
                if (now >= start - 30 * 60 * 1000 && now < end) blocking = true;
            }
        }

        /// <summary>At the start of Windows: no installation when the file does not cover now, or a session or a class runs or starts within 30 min.</summary>
        public static bool WaitAtLogon(string userData)
        {
            bool covered, blocking;
            Read(userData, out covered, out blocking);
            if (!covered) Log.Info("plik planu nie obejmuje tej chwili – przy logowaniu nie instaluję");
            if (blocking) Log.Info("sesja albo zajęcia teraz albo w ciągu 30 min");
            return !covered || blocking;
        }

        /// <summary>The guard's windows stay only an icon during a session or a class and 30 min before it.</summary>
        public static bool QuietNow(string userData)
        {
            bool covered, blocking;
            Read(userData, out covered, out blocking);
            return blocking;
        }
    }

    /// <summary>The guard's Run entry (written and removed by the guard, directly in the registry, StartupApproved untouched).</summary>
    public static class RunEntry
    {
        public const string Name = "Regulated Day Guard";
        const string Key = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

        public static void Set(string guardExe)
        {
            using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(Key))
                k.SetValue(Name, Launch.Quote(guardExe) + " --autostart");
        }

        public static void Remove()
        {
            try
            {
                using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Key, true))
                    if (k != null && k.GetValue(Name) != null) k.DeleteValue(Name, false);
            }
            catch (Exception e) { Log.Warn("wpis Run strażnika: " + e.Message); }
        }

        public static string Value()
        {
            using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Key))
                return k == null ? null : k.GetValue(Name) as string;
        }

        /// <summary>The entry switched off in Task Manager (StartupApproved\Run, first byte odd = off).</summary>
        public static bool? Approved(string name)
        {
            using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"))
            {
                byte[] v = k == null ? null : k.GetValue(name) as byte[];
                if (v == null || v.Length == 0) return null;
                return (v[0] & 1) == 0;
            }
        }
    }
}
