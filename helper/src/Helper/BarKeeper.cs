// The desktop bar's place under the windows (spec „Widget”, D270): checked after window events (gathered in 200 ms),
// every 1 s and after Explorer restarts; laid again only when the check fails, at most 3 times in 10 s (no shell window –
// Explorer restarting – waits and counts nothing). Then „failed”: the app hides the bar with its message, and the helper
// tries again by itself when the shell's window changes, the screens change, the screen is unlocked, the computer wakes
// and at the next showing – at most once in 5 min; the button „Pokaż pasek” works always.
using System;
using System.Collections.Generic;

namespace RegulatedDay
{
    public class BarKeeper
    {
        const long WINDOW_MS = 10000;
        const int MAX_ATTEMPTS = 3;
        const long AUTO_RETRY_MS = 5 * 60 * 1000;

        readonly Action<JObj> send;
        IntPtr hwnd = IntPtr.Zero;
        bool watching;
        bool failed;
        readonly List<long> attempts = new List<long>();
        long lastAutoRetry = long.MinValue / 2;
        string lastState;

        public BarKeeper(Action<JObj> send)
        {
            this.send = send;
        }

        static long Now() { return Environment.TickCount; }

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

        /// <summary>A trigger to try again after a failure; `force` – the button, always.</summary>
        public void Retry(bool force, string why)
        {
            if (!watching) return;
            if (!failed) { Check(false); return; }
            long now = Now();
            if (!force && now - lastAutoRetry < AUTO_RETRY_MS) return;
            lastAutoRetry = now;
            failed = false;
            attempts.Clear();
            Log.Info("pasek: ponowna próba (" + why + ")");
            Check(true);
        }

        public void Check(bool force)
        {
            if (!watching || hwnd == IntPtr.Zero) return;
            string detail;
            OrderState state = WindowOrder.Check(hwnd, WindowOrder.Snapshot(), out detail);
            switch (state)
            {
                case OrderState.Confirmed:
                    if (failed) { failed = false; attempts.Clear(); }
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
                Log.Warn("pasek: nie udało się położyć pod oknami po " + MAX_ATTEMPTS + " próbach – " + detail);
                Emit("failed", detail, true);
                return;
            }
            attempts.Add(now);
            string why;
            bool laid = WindowOrder.LayAboveDesktop(hwnd, out why);
            Emit("placing", detail + (laid ? "" : "; " + why), true);
            // Checked again right away: a confirmation needs the snapshot, never the call's answer alone.
            OrderState after = WindowOrder.Check(hwnd, WindowOrder.Snapshot(), out detail);
            if (after == OrderState.Confirmed) Emit("confirmed", null, true);
        }
    }
}
