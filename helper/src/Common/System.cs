// What Windows says about this session (spec „Pomocnik”): the state of notifications, the app's notification setting
// (ToastNotifier.Setting, through WinRT without its metadata), the logon session, the power requests, OneDrive and the
// attributes of files kept on the device. Every reading has an answer for „nie wiadomo” instead of a crash.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace RegulatedDay
{
    public static class NotificationState
    {
        /// <summary>SHQueryUserNotificationState in words; „app” (a Store app) counts only over the whole monitor.</summary>
        public static string Read(out int raw)
        {
            raw = 0;
            int state;
            if (Native.SHQueryUserNotificationState(out state) != 0) return "unknown";
            raw = state;
            switch (state)
            {
                case 1: return "notPresent";
                case 2: return "busy";
                case 3: return "d3dFullscreen";
                case 4: return "presentation";
                case 5: return "accepts";
                case 6: return "quietTime";
                case 7: return Foreground.CoversMonitor(Native.GetForegroundWindow()) ? "app" : "accepts";
                default: return "unknown";
            }
        }
    }

    public static class Foreground
    {
        /// <summary>The window covers the whole monitor it is on (PerMonitorV2: both rectangles in the same units).</summary>
        public static bool CoversMonitor(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero) return false;
            string cls = Native.ClassOf(hwnd);
            if (WindowOrder.IsDesktopClass(cls) || cls == "Shell_TrayWnd") return false;
            RECT r;
            if (!Native.GetWindowRect(hwnd, out r)) return false;
            IntPtr mon = Native.MonitorFromWindow(hwnd, Native.MONITOR_DEFAULTTONEAREST);
            MONITORINFO mi = new MONITORINFO();
            mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
            if (!Native.GetMonitorInfo(mon, ref mi)) return false;
            return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
        }

        public static string ProcessName(IntPtr hwnd)
        {
            uint pid;
            Native.GetWindowThreadProcessId(hwnd, out pid);
            return ProcessInfo.ImageName((int)pid);
        }

        /// <summary>The shell's windows a change of the foreground to does not close the panel: the taskbar, the hidden icons' arrow, the notifications.</summary>
        public static bool IsShell(IntPtr hwnd, string cls, string process)
        {
            if (cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" || cls == "NotifyIconOverflowWindow" || cls == "TopLevelWindowForOverflowXamlIsland" || cls == "XamlExplorerHostIslandWindow") return true;
            if (cls == "Windows.UI.Core.CoreWindow" && string.Equals(process, "ShellExperienceHost.exe", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
    }

    public static class ProcessInfo
    {
        /// <summary>The file name of a process's program ("Regulated Day.exe"); null = no such process.</summary>
        public static string ImageName(int pid)
        {
            string path = ImagePath(pid);
            return path == null ? null : Path.GetFileName(path);
        }

        public static string ImagePath(int pid)
        {
            IntPtr h = Native.OpenProcess(Native.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return null;
            try
            {
                System.Text.StringBuilder sb = new System.Text.StringBuilder(1024);
                int size = sb.Capacity;
                return Native.QueryFullProcessImageName(h, 0, sb, ref size) ? sb.ToString(0, size) : null;
            }
            finally { Native.CloseHandle(h); }
        }

        /// <summary>The start of a process in ms UTC; 0 = no such process.</summary>
        public static long StartMs(int pid)
        {
            IntPtr h = Native.OpenProcess(Native.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return 0;
            try
            {
                long c, e, k, u;
                if (!Native.GetProcessTimes(h, out c, out e, out k, out u)) return 0;
                return (c - 116444736000000000L) / 10000;
            }
            finally { Native.CloseHandle(h); }
        }

        /// <summary>A process runs with this id, this program and this start (never a reused id).</summary>
        public static bool Alive(int pid, string imageName, long startMs)
        {
            IntPtr h = Native.OpenProcess(Native.PROCESS_QUERY_LIMITED_INFORMATION | Native.SYNCHRONIZE, false, pid);
            if (h == IntPtr.Zero) return false;
            try
            {
                if (Native.WaitForSingleObject(h, 0) == Native.WAIT_OBJECT_0) return false;
            }
            finally { Native.CloseHandle(h); }
            if (imageName != null && !string.Equals(ImageName(pid), imageName, StringComparison.OrdinalIgnoreCase)) return false;
            if (startMs > 0 && Math.Abs(StartMs(pid) - startMs) > 1000) return false;
            return true;
        }
    }

    /// <summary>The logon session (spec „Terminy”): its LogonId and a volatile key that vanishes at logoff and restart.</summary>
    public static class LogonSession
    {
        public static string LogonId()
        {
            IntPtr token;
            if (!Native.OpenProcessToken(Native.GetCurrentProcess(), 0x0008, out token)) return null;
            try
            {
                TOKEN_STATISTICS s;
                int ret;
                if (!Native.GetTokenInformation(token, 10, out s, Marshal.SizeOf(typeof(TOKEN_STATISTICS)), out ret)) return null;
                return s.AuthenticationId.HighPart.ToString("x8", System.Globalization.CultureInfo.InvariantCulture) + s.AuthenticationId.LowPart.ToString("x8", System.Globalization.CultureInfo.InvariantCulture);
            }
            finally { Native.CloseHandle(token); }
        }

        /// <summary>
        /// The run of the app starts: answers what the volatile key held (the previous run in this logon session, if any)
        /// and writes this run there.
        /// </summary>
        public static JObj Start(string identity, string runId)
        {
            JObj r = new JObj();
            string logon = LogonId();
            r.Set("logonId", logon);
            using (RegistryKey parent = Registry.CurrentUser.CreateSubKey("Software\\RegulatedDay"))
            {
                using (RegistryKey old = parent.OpenSubKey(identity))
                {
                    r.Set("existed", old != null);
                    r.Set("prevRunId", old == null ? null : old.GetValue("RunId") as string);
                    r.Set("prevLogonId", old == null ? null : old.GetValue("LogonId") as string);
                }
                using (RegistryKey key = parent.CreateSubKey(identity, RegistryKeyPermissionCheck.ReadWriteSubTree, RegistryOptions.Volatile))
                {
                    key.SetValue("RunId", runId);
                    if (logon != null) key.SetValue("LogonId", logon);
                }
            }
            return r;
        }
    }

    /// <summary>The power requests (spec „Bloki” – the lock of sleep, D184 – the screen of a recording computer).</summary>
    public class PowerRequests : IDisposable
    {
        IntPtr handle = IntPtr.Zero;
        bool display, system, execution;

        public void Set(bool wantDisplay, bool wantSystem, bool wantExecution, string reason)
        {
            if (handle == IntPtr.Zero && (wantDisplay || wantSystem || wantExecution))
            {
                REASON_CONTEXT ctx = new REASON_CONTEXT();
                ctx.Version = Native.POWER_REQUEST_CONTEXT_VERSION;
                ctx.Flags = Native.POWER_REQUEST_CONTEXT_SIMPLE_STRING;
                ctx.SimpleReasonString = string.IsNullOrEmpty(reason) ? "Regulated Day" : reason;
                handle = Native.PowerCreateRequest(ref ctx);
                if (handle == new IntPtr(-1)) handle = IntPtr.Zero;
            }
            if (handle == IntPtr.Zero) return;
            Apply(Native.PowerRequestDisplayRequired, ref display, wantDisplay);
            Apply(Native.PowerRequestSystemRequired, ref system, wantSystem);
            Apply(Native.PowerRequestExecutionRequired, ref execution, wantExecution);
        }

        void Apply(int type, ref bool now, bool want)
        {
            if (now == want) return;
            if (want ? Native.PowerSetRequest(handle, type) : Native.PowerClearRequest(handle, type)) now = want;
            else Log.Warn("żądanie zasilania " + type + (want ? " – ustawienie" : " – zwolnienie") + " nie udało się, błąd " + Marshal.GetLastWin32Error());
        }

        public JObj State()
        {
            return new JObj().Set("display", display).Set("system", system).Set("execution", execution);
        }

        /// <summary>Some request is held now.</summary>
        public bool Any
        {
            get { return display || system || execution; }
        }

        public void Dispose()
        {
            if (handle == IntPtr.Zero) return;
            Set(false, false, false, null);
            Native.CloseHandle(handle);
            handle = IntPtr.Zero;
        }
    }

    public static class OneDrive
    {
        /// <summary>OneDrive runs in this session (by the process's name; never the text of a system tool).</summary>
        public static bool Running()
        {
            int mine;
            Native.ProcessIdToSessionId(Process.GetCurrentProcess().Id, out mine);
            foreach (Process p in Process.GetProcessesByName("OneDrive"))
            {
                try { if (p.SessionId == mine) return true; }
                catch { }
                finally { p.Dispose(); }
            }
            return false;
        }
    }

    public static class Attributes
    {
        /// <summary>The raw attributes of a path (PINNED 0x80000, UNPINNED 0x100000, RECALL_ON_DATA_ACCESS 0x400000) without reading it; -1 = none.</summary>
        public static long Of(string path)
        {
            try { return (long)(int)File.GetAttributes(path); }
            catch { return -1; }
        }
    }

    /// <summary>
    /// The app's notification setting in Windows (ToastNotifier.Setting) through WinRT's COM interfaces – no metadata
    /// needed, so the same code builds with csc.exe and with Roslyn on Linux. An exception answers „unknown”, never a crash.
    /// </summary>
    public static class ToastSetting
    {
        [ComImport, Guid("50ac103f-d235-4598-bbef-98fe4d1a3ad4"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
        interface IToastNotificationManagerStatics
        {
            IntPtr CreateToastNotifier();
            IToastNotifier CreateToastNotifierWithId(IntPtr applicationId);
            IntPtr GetTemplateContent(int type);
        }

        [ComImport, Guid("75927b93-03f3-41ec-91d3-6e5bac1b38e7"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
        interface IToastNotifier
        {
            void Show(IntPtr notification);
            void Hide(IntPtr notification);
            int get_Setting();
        }

        [DllImport("combase.dll", PreserveSig = false)]
        static extern void RoGetActivationFactory(IntPtr activatableClassId, [In] ref Guid iid, [MarshalAs(UnmanagedType.IInspectable)] out object factory);

        [DllImport("combase.dll", PreserveSig = false)]
        static extern void WindowsCreateString([MarshalAs(UnmanagedType.LPWStr)] string source, int length, out IntPtr hstring);

        [DllImport("combase.dll", PreserveSig = false)]
        static extern void WindowsDeleteString(IntPtr hstring);

        public static string Read(string aumid)
        {
            IntPtr cls = IntPtr.Zero, id = IntPtr.Zero;
            try
            {
                const string name = "Windows.UI.Notifications.ToastNotificationManager";
                WindowsCreateString(name, name.Length, out cls);
                Guid iid = typeof(IToastNotificationManagerStatics).GUID;
                object factory;
                RoGetActivationFactory(cls, ref iid, out factory);
                IToastNotificationManagerStatics statics = (IToastNotificationManagerStatics)factory;
                WindowsCreateString(aumid, aumid.Length, out id);
                IToastNotifier notifier = statics.CreateToastNotifierWithId(id);
                switch (notifier.get_Setting())
                {
                    case 0: return "enabled";
                    case 1: return "disabledForApplication";
                    case 2: return "disabledForUser";
                    case 3: return "disabledByGroupPolicy";
                    case 4: return "disabledByManifest";
                    default: return "unknown";
                }
            }
            catch (Exception e)
            {
                Log.Warn("ToastNotifier.Setting: " + e.GetType().Name + " " + e.Message);
                return "unknown";
            }
            finally
            {
                if (cls != IntPtr.Zero) WindowsDeleteString(cls);
                if (id != IntPtr.Zero) WindowsDeleteString(id);
            }
        }
    }

    public static class PowerCaps
    {
        /// <summary>Modern standby (AoAc) from SYSTEM_POWER_CAPABILITIES; null = not known.</summary>
        public static bool? ModernStandby()
        {
            SYSTEM_POWER_CAPABILITIES caps;
            uint status = Native.CallNtPowerInformation(Native.SystemPowerCapabilities, IntPtr.Zero, 0, out caps, Marshal.SizeOf(typeof(SYSTEM_POWER_CAPABILITIES)));
            if (status != 0) return null;
            return caps.AoAc;
        }

        public static JObj Layout()
        {
            return new JObj()
                .Set("size", Marshal.SizeOf(typeof(SYSTEM_POWER_CAPABILITIES)))
                .Set("aoAcOffset", Marshal.OffsetOf(typeof(SYSTEM_POWER_CAPABILITIES), "AoAc").ToInt32())
                .Set("batteryScaleOffset", Marshal.OffsetOf(typeof(SYSTEM_POWER_CAPABILITIES), "BatteryScale").ToInt32())
                .Set("acOnLineWakeOffset", Marshal.OffsetOf(typeof(SYSTEM_POWER_CAPABILITIES), "AcOnLineWake").ToInt32());
        }

        /// <summary>On mains power: true, on battery: false, null = not known.</summary>
        public static bool? OnMains()
        {
            SYSTEM_POWER_STATUS s;
            if (!Native.GetSystemPowerStatus(out s)) return null;
            if (s.ACLineStatus == 1) return true;
            if (s.ACLineStatus == 0) return false;
            return null;
        }

        /// <summary>The battery saver is on (SystemStatusFlag bit 1); null = not known.</summary>
        public static bool? BatterySaver()
        {
            SYSTEM_POWER_STATUS s;
            if (!Native.GetSystemPowerStatus(out s)) return null;
            return (s.SystemStatusFlag & 1) != 0;
        }
    }
}
