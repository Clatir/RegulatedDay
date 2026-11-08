// The desktop bar's place under the windows (spec „Widget”, D270): checked after window events (gathered in 200 ms),
// every 1 s and after Explorer restarts; laid again only when the check fails, at most 3 times in 10 s (no shell window –
// Explorer restarting – waits and counts nothing). Then „failed”: the app hides the bar with its message, the helper logs
// the top windows, and tries again by itself every 5 min (D341) and when the shell's window changes, the screens change,
// the screen is unlocked, the computer wakes and at the next showing – at most once in 5 min; the button „Pokaż pasek”
// works always.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace RegulatedDay
{
    /// <summary>
    /// What the keeper reads of the windows, does to them and writes down: the real ones and the helper's log, or the
    /// self-test's made-up ones and a list (never the log the real keeper writes into at the same time).
    /// </summary>
    public interface IWindowDesk
    {
        /// <summary>Milliseconds of a monotonic clock.</summary>
        long Now();
        List<WindowInfo> Snapshot();
        OrderState Check(IntPtr hwnd, List<WindowInfo> snap, out string detail);
        /// <summary>Lays the window by the snapshot the check just found wrong.</summary>
        bool Lay(IntPtr hwnd, List<WindowInfo> snap, out string detail);
        /// <summary>The program of a window (its file name), for the log; null – unknown.</summary>
        string Program(IntPtr hwnd);
        void Note(bool warn, string message);
    }

    public class RealDesk : IWindowDesk
    {
        // 64 bits: Environment.TickCount turns negative after 24.9 days of uptime and the 5 min would never pass.
        public long Now() { return (long)Native.GetTickCount64(); }
        public List<WindowInfo> Snapshot() { return WindowOrder.Snapshot(); }
        public OrderState Check(IntPtr hwnd, List<WindowInfo> snap, out string detail) { return WindowOrder.Check(hwnd, snap, out detail); }
        public bool Lay(IntPtr hwnd, List<WindowInfo> snap, out string detail) { return WindowOrder.LayAboveDesktop(hwnd, snap, out detail); }
        public string Program(IntPtr hwnd) { return Foreground.ProcessName(hwnd); }

        public void Note(bool warn, string message)
        {
            if (warn) Log.Warn(message);
            else Log.Info(message);
        }
    }

    public class BarKeeper
    {
        const long WINDOW_MS = 10000;
        const int MAX_ATTEMPTS = 3;
        const long AUTO_RETRY_MS = 5 * 60 * 1000;

        readonly Action<JObj> send;
        readonly IWindowDesk desk;
        readonly long retryMs;
        IntPtr hwnd = IntPtr.Zero;
        bool watching;
        bool failed;
        readonly List<long> attempts = new List<long>();
        long lastAutoRetry = long.MinValue / 2;
        string lastState;
        /// <summary>The windows written down in this run of failures (null: none yet – the next failure writes them).</summary>
        string lastWindows;

        public BarKeeper(Action<JObj> send) : this(send, new RealDesk(), RetryInterval())
        {
        }

        /// <summary>The retries' 5 min; shorter only for the tests (RD_TEST_BAR_RETRY_MS, at least 1 s).</summary>
        static long RetryInterval()
        {
            long ms;
            string s = Environment.GetEnvironmentVariable("RD_TEST_BAR_RETRY_MS");
            return s != null && long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out ms) && ms >= 1000 ? ms : AUTO_RETRY_MS;
        }

        public BarKeeper(Action<JObj> send, IWindowDesk desk, long retryMs)
        {
            this.send = send;
            this.desk = desk;
            this.retryMs = retryMs;
        }

        long Now() { return desk.Now(); }

        void Emit(string state, string detail, bool force)
        {
            if (!force && state == lastState) return;
            lastState = state;
            send(new JObj().Set("type", "bar").Set("hwnd", hwnd.ToInt64().ToString(System.Globalization.CultureInfo.InvariantCulture)).Set("state", state).Set("detail", detail));
        }

        /// <summary>The bar is to be shown (or its place changed): check it now and say where it stands.</summary>
        public void Watch(IntPtr h)
        {
            bool fresh = !watching || h != hwnd;
            hwnd = h;
            watching = true;
            // A new showing after a failure: once in 5 min.
            if (failed && fresh) Retry(false, "ponowne pokazanie");
            Check(true);
        }

        public void Unwatch()
        {
            watching = false;
            lastState = null;
        }

        /// <summary>The check of every second; after a failure, 5 min after it (or the last retry) a retry by itself (D341).</summary>
        public void Tick()
        {
            if (watching && failed && Now() - lastAutoRetry >= retryMs) Retry(false, "co 5 min");
            else Check(false);
        }

        /// <summary>A trigger to try again after a failure; `force` – the button, always.</summary>
        public void Retry(bool force, string why)
        {
            if (!watching) return;
            if (!failed) { Check(false); return; }
            long now = Now();
            if (!force && now - lastAutoRetry < retryMs) return;
            lastAutoRetry = now;
            failed = false;
            attempts.Clear();
            desk.Note(false, "pasek: ponowna próba (" + why + ")");
            Check(true);
        }

        public void Check(bool force)
        {
            if (!watching || hwnd == IntPtr.Zero) return;
            string detail;
            List<WindowInfo> snap = desk.Snapshot();
            OrderState state = desk.Check(hwnd, snap, out detail);
            switch (state)
            {
                case OrderState.Confirmed:
                    if (failed) { failed = false; attempts.Clear(); }
                    lastWindows = null;
                    Emit("confirmed", null, force);
                    return;
                case OrderState.DesktopShown:
                    Emit("desktop-shown", detail, force);
                    return;
                case OrderState.NoShell:
                    Emit("no-shell", detail, force);
                    return;
                case OrderState.Gone:
                    Emit("gone", detail, force);
                    return;
            }
            if (failed)
            {
                Emit("failed", detail, force);
                return;
            }
            long now = Now();
            attempts.RemoveAll(delegate(long t) { return now - t > WINDOW_MS; });
            if (attempts.Count >= MAX_ATTEMPTS)
            {
                failed = true;
                lastAutoRetry = now;
                desk.Note(true, "pasek: nie udało się położyć pod oknami po " + MAX_ATTEMPTS + " próbach – " + detail);
                // What holds it: the cause of a failure on a computer is read from these – once per run of failures, again
                // only when they differ (the retries every 5 min never fill the log).
                try
                {
                    string windows = WindowOrder.Describe(hwnd, snap, 8, desk.Program);
                    if (windows != lastWindows) desk.Note(false, "pasek: " + windows);
                    lastWindows = windows;
                }
                catch (Exception e) { desk.Note(true, "pasek: okna od góry – " + e.Message); }
                Emit("failed", detail, true);
                return;
            }
            attempts.Add(now);
            string why;
            bool laid = desk.Lay(hwnd, snap, out why);
            Emit("placing", detail + (laid ? "" : "; " + why), true);
            // Checked again right away: a confirmation needs the snapshot, never the call's answer alone.
            OrderState after = desk.Check(hwnd, desk.Snapshot(), out detail);
            if (after != OrderState.Confirmed) return;
            lastWindows = null;
            Emit("confirmed", null, true);
        }
    }
}
