// The helper's thread with a message loop (spec „Widget”): the hooks of window events (their callback kept in a static
// field – collected by the garbage collector, the helper would crash), a hidden top-level window for the broadcasts
// (Explorer restarted, the screens changed, power and the lock of the session), and the timers of the bar's checks.
using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Forms;

namespace RegulatedDay
{
    public class Watcher
    {
        const uint WM_DISPLAYCHANGE = 0x007E, WM_POWERBROADCAST = 0x0218, WM_WTSSESSION_CHANGE = 0x02B1;
        const int PBT_APMSUSPEND = 0x4, PBT_APMRESUMEAUTOMATIC = 0x12, PBT_POWERSETTINGCHANGE = 0x8013;
        static readonly Guid GUID_POWER_SAVING_STATUS = new Guid("e00958c0-c213-4ace-ac77-fecced2eeea5");
        static readonly Guid GUID_ENERGY_SAVER_STATUS = new Guid("550e8400-e29b-41d4-a716-446655440000");
        static readonly Guid GUID_ACDC_POWER_SOURCE = new Guid("5d3e9a59-e9d5-4b00-a6bd-ff34ff516548");
        // Thread timers (no window): Windows chooses their ids.
        UIntPtr checkTimer = UIntPtr.Zero, soonTimer = UIntPtr.Zero;

        // Kept in static fields: a delegate passed to Windows and collected afterwards crashes the process.
        static WinEventDelegate eventCallback;
        static readonly List<IntPtr> hooks = new List<IntPtr>();

        readonly Action<JObj> send;
        readonly Queue<Action> queue = new Queue<Action>();
        uint threadId;
        MessageWindow window;
        public BarKeeper Bar;

        public Watcher(Action<JObj> send)
        {
            this.send = send;
        }

        public void Start()
        {
            ManualResetEvent ready = new ManualResetEvent(false);
            Thread t = new Thread(delegate() { Run(ready); });
            t.IsBackground = true;
            t.Name = "watcher";
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            ready.WaitOne(5000);
        }

        /// <summary>Runs `a` on the watcher's thread.</summary>
        public void Post(Action a)
        {
            lock (queue) queue.Enqueue(a);
            Native.PostThreadMessage(threadId, Native.WM_USER, IntPtr.Zero, IntPtr.Zero);
        }

        void Run(ManualResetEvent ready)
        {
            threadId = Native.GetCurrentThreadId();
            Bar = new BarKeeper(send);
            window = new MessageWindow(this);
            eventCallback = OnEvent;
            uint flags = Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS;
            hooks.Add(Native.SetWinEventHook(Native.EVENT_SYSTEM_FOREGROUND, Native.EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, eventCallback, 0, 0, flags));
            hooks.Add(Native.SetWinEventHook(Native.EVENT_SYSTEM_MOVESIZEEND, Native.EVENT_SYSTEM_MOVESIZEEND, IntPtr.Zero, eventCallback, 0, 0, flags));
            hooks.Add(Native.SetWinEventHook(Native.EVENT_SYSTEM_MINIMIZESTART, Native.EVENT_SYSTEM_MINIMIZEEND, IntPtr.Zero, eventCallback, 0, 0, flags));
            hooks.Add(Native.SetWinEventHook(Native.EVENT_OBJECT_SHOW, Native.EVENT_OBJECT_HIDE, IntPtr.Zero, eventCallback, 0, 0, flags));
            hooks.Add(Native.SetWinEventHook(Native.EVENT_OBJECT_CLOAKED, Native.EVENT_OBJECT_UNCLOAKED, IntPtr.Zero, eventCallback, 0, 0, flags));
            checkTimer = Native.SetTimer(IntPtr.Zero, UIntPtr.Zero, 1000, IntPtr.Zero);
            ready.Set();
            MSG msg;
            while (Native.GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
            {
                if (msg.hwnd == IntPtr.Zero && msg.message == Native.WM_USER)
                {
                    Drain();
                    continue;
                }
                if (msg.hwnd == IntPtr.Zero && msg.message == Native.WM_TIMER)
                {
                    OnTimer(new UIntPtr((ulong)msg.wParam.ToInt64()));
                    continue;
                }
                Native.TranslateMessage(ref msg);
                Native.DispatchMessage(ref msg);
            }
        }

        void Drain()
        {
            while (true)
            {
                Action a;
                lock (queue)
                {
                    if (queue.Count == 0) return;
                    a = queue.Dequeue();
                }
                try { a(); }
                catch (Exception e) { Log.Error("watcher: " + e); }
            }
        }

        void OnTimer(UIntPtr id)
        {
            if (id == checkTimer) Bar.Check(false);
            else if (id == soonTimer)
            {
                Native.KillTimer(IntPtr.Zero, soonTimer);
                soonTimer = UIntPtr.Zero;
                Bar.Check(false);
            }
        }

        /// <summary>Window events are gathered for 200 ms, then the bar is checked once.</summary>
        void CheckSoon()
        {
            if (soonTimer != UIntPtr.Zero) return;
            soonTimer = Native.SetTimer(IntPtr.Zero, UIntPtr.Zero, 200, IntPtr.Zero);
        }

        void OnEvent(IntPtr hook, uint type, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
        {
            if (idObject != Native.OBJID_WINDOW || idChild != 0) return;
            if (type == Native.EVENT_SYSTEM_FOREGROUND)
            {
                try
                {
                    string cls = Native.ClassOf(hwnd);
                    string process = Foreground.ProcessName(hwnd);
                    send(new JObj()
                        .Set("type", "foreground")
                        .Set("hwnd", hwnd.ToInt64().ToString(System.Globalization.CultureInfo.InvariantCulture))
                        .Set("cls", cls)
                        .Set("process", process)
                        .Set("shell", Foreground.IsShell(hwnd, cls, process))
                        .Set("fullscreen", Foreground.CoversMonitor(hwnd)));
                }
                catch (Exception e) { Log.Warn("foreground: " + e.Message); }
            }
            CheckSoon();
        }

        internal void OnWindowMessage(uint msg, IntPtr wParam, IntPtr lParam, uint taskbarCreated)
        {
            if (msg == taskbarCreated)
            {
                send(new JObj().Set("type", "shell"));
                Bar.Retry(false, "Eksplorator uruchomiony ponownie");
            }
            else if (msg == WM_DISPLAYCHANGE)
            {
                send(new JObj().Set("type", "display"));
                Bar.Retry(false, "zmiana ekranów");
            }
            else if (msg == WM_WTSSESSION_CHANGE)
            {
                int what = wParam.ToInt32();
                send(new JObj().Set("type", "session").Set("event", what == 7 ? "lock" : what == 8 ? "unlock" : what.ToString(System.Globalization.CultureInfo.InvariantCulture)));
                if (what == 8) Bar.Retry(false, "odblokowanie ekranu");
            }
            else if (msg == WM_POWERBROADCAST)
            {
                int what = wParam.ToInt32();
                if (what == PBT_APMRESUMEAUTOMATIC)
                {
                    send(new JObj().Set("type", "power").Set("event", "resume"));
                    Bar.Retry(false, "wybudzenie");
                }
                else if (what == PBT_APMSUSPEND) send(new JObj().Set("type", "power").Set("event", "suspend"));
                else if (what == PBT_POWERSETTINGCHANGE && lParam != IntPtr.Zero)
                {
                    POWERBROADCAST_SETTING s = (POWERBROADCAST_SETTING)System.Runtime.InteropServices.Marshal.PtrToStructure(lParam, typeof(POWERBROADCAST_SETTING));
                    string which = s.PowerSetting == GUID_POWER_SAVING_STATUS ? "powerSaving" : s.PowerSetting == GUID_ENERGY_SAVER_STATUS ? "energySaver" : s.PowerSetting == GUID_ACDC_POWER_SOURCE ? "acdc" : null;
                    if (which != null) send(new JObj().Set("type", "power").Set("event", which).Set("value", (long)s.Data));
                }
            }
        }

        internal void Register(IntPtr hwnd)
        {
            Guid g = GUID_POWER_SAVING_STATUS;
            if (Native.RegisterPowerSettingNotification(hwnd, ref g, 0) == IntPtr.Zero) Log.Warn("GUID_POWER_SAVING_STATUS: rejestracja nie udała się");
            g = GUID_ACDC_POWER_SOURCE;
            Native.RegisterPowerSettingNotification(hwnd, ref g, 0);
            // Windows 11 24H2: the energy saver; on an older Windows the registration fails – not a crash.
            g = GUID_ENERGY_SAVER_STATUS;
            if (Native.RegisterPowerSettingNotification(hwnd, ref g, 0) == IntPtr.Zero) Log.Info("GUID_ENERGY_SAVER_STATUS niedostępny (starszy Windows)");
            if (!Native.WTSRegisterSessionNotification(hwnd, 0)) Log.Warn("WTSRegisterSessionNotification nie udało się");
        }

        /// <summary>A hidden top-level window: message-only windows get no broadcasts (TaskbarCreated, WM_DISPLAYCHANGE).</summary>
        class MessageWindow : NativeWindow
        {
            readonly Watcher owner;
            readonly uint taskbarCreated;

            public MessageWindow(Watcher owner)
            {
                this.owner = owner;
                taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
                CreateParams cp = new CreateParams();
                cp.Caption = "Regulated Day helper";
                cp.ExStyle = Native.WS_EX_TOOLWINDOW;
                cp.Style = unchecked((int)0x80000000); // WS_POPUP, never visible
                CreateHandle(cp);
                owner.Register(Handle);
            }

            protected override void WndProc(ref Message m)
            {
                try { owner.OnWindowMessage((uint)m.Msg, m.WParam, m.LParam, taskbarCreated); }
                catch (Exception e) { Log.Error("okno pomocnika: " + e); }
                base.WndProc(ref m);
            }
        }
    }
}
