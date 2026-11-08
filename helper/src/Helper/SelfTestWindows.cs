// The self-test of the desktop bar's place (spec „Widget”, D229, D341): the rules of WindowOrder on made-up snapshots of
// the order of windows, and the keeper's tries on a made-up clock. Each case answering otherwise is named in the answer
// (an empty list – all hold); CI runs it in the helper's self-test, any Windows can run it without a desktop.
using System;
using System.Collections.Generic;

namespace RegulatedDay
{
    public static class SelfTestWindows
    {
        const long BAR = 3;
        const string APP = "Chrome_WidgetWin_1";
        static readonly RECT Screen = R(0, 0, 1920, 1080);
        static readonly RECT BarRect = R(10, 1000, 610, 1060);
        /// <summary>A maximized window: it overlaps the bar.</summary>
        static readonly RECT Cover = R(0, 0, 1920, 1040);
        /// <summary>A small window over a part of the bar.</summary>
        static readonly RECT Small = R(0, 990, 300, 1070);
        /// <summary>A window away from the bar.</summary>
        static readonly RECT Away = R(1000, 0, 1900, 500);

        static RECT R(int left, int top, int right, int bottom)
        {
            RECT r = new RECT();
            r.Left = left;
            r.Top = top;
            r.Right = right;
            r.Bottom = bottom;
            return r;
        }

        /// <summary>A window of a made-up snapshot; `flags`: v visible, c cloaked, m minimized, t on top, d holds SHELLDLL_DefView.</summary>
        static WindowInfo W(long h, string cls, string flags, RECT r)
        {
            WindowInfo w = new WindowInfo();
            w.Hwnd = new IntPtr(h);
            w.Class = cls;
            w.Visible = flags.IndexOf('v') >= 0;
            w.Cloaked = flags.IndexOf('c') >= 0;
            w.Iconic = flags.IndexOf('m') >= 0;
            w.Topmost = flags.IndexOf('t') >= 0;
            w.DefView = flags.IndexOf('d') >= 0;
            w.Rect = r;
            w.Desktop = WindowOrder.IsDesktopWindow(w);
            return w;
        }

        static WindowInfo Bar() { return W(BAR, APP, "v", BarRect); }
        static WindowInfo Window(long h) { return W(h, APP, "v", Cover); }
        static WindowInfo Progman(string flags) { return W(4, "Progman", flags, Screen); }

        static List<WindowInfo> L(params WindowInfo[] windows) { return new List<WindowInfo>(windows); }

        /// <summary>
        /// One snapshot: what the check says and which window the bar is laid right under (-1: not laid, 0: the top of the
        /// windows not on top).
        /// </summary>
        static void Case(List<object> wrong, string name, List<WindowInfo> snap, string fgClass, OrderState state, long under)
        {
            string detail;
            OrderState got = WindowOrder.Check(new IntPtr(BAR), snap, true, fgClass, out detail);
            if (got != state) wrong.Add(name + ": " + got + " zamiast " + state + (detail == null ? "" : " (" + detail + ")"));
            IntPtr after;
            long placed = WindowOrder.PlaceAfter(new IntPtr(BAR), snap, out after, out detail) ? after.ToInt64() : -1;
            if (placed != under) wrong.Add(name + ": pod oknem " + placed + " zamiast " + under);
        }

        static void Orders(List<object> wrong)
        {
            // Explorer's hidden WorkerW at the top (the VM's „WorkerW nad paskiem” over Edge on full screen): not a desktop window.
            Case(wrong, "ukryte WorkerW na szczycie", L(W(1, "WorkerW", "", Screen), Window(2), Bar(), Progman("vd")), APP, OrderState.Confirmed, 2);
            Case(wrong, "WorkerW ukryte przez system na szczycie", L(W(1, "WorkerW", "vc", Screen), Window(2), Bar(), Progman("vd")), APP, OrderState.Confirmed, 2);
            Case(wrong, "WorkerW bez powierzchni na szczycie", L(W(1, "WorkerW", "v", R(0, 0, 0, 0)), Window(2), Bar(), Progman("vd")), APP, OrderState.Confirmed, 2);
            // A wallpaper program: the icons in a WorkerW, a WorkerW of the wallpaper under it, Progman at the bottom.
            Case(wrong, "tapeta: WorkerW z ikonami i WorkerW tapety", L(Window(2), Bar(), W(5, "WorkerW", "vd", Screen), W(6, "WorkerW", "v", Screen), Progman("v")), APP, OrderState.Confirmed, 2);
            Case(wrong, "zwykłe okno pod paskiem", L(Bar(), Window(2), Progman("vd")), APP, OrderState.Wrong, 2);
            Case(wrong, "okno pod pulpitem się nie liczy", L(Window(2), Bar(), Progman("vd"), Window(8)), APP, OrderState.Confirmed, 2);
            Case(wrong, "zminimalizowane okno pod paskiem", L(Bar(), W(2, APP, "vm", Cover), Progman("vd")), APP, OrderState.Confirmed, 2);
            Case(wrong, "okno obok paska pod nim", L(Bar(), W(10, APP, "v", Away), Progman("vd")), APP, OrderState.Confirmed, 10);
            Case(wrong, "pasek zadań na wierzchu", L(W(9, "Shell_TrayWnd", "vt", R(0, 1040, 1920, 1080)), Bar(), Progman("vd")), APP, OrderState.Confirmed, 0);
            Case(wrong, "pasek zadań na wierzchu i okno", L(W(9, "Shell_TrayWnd", "vt", R(0, 1040, 1920, 1080)), Window(2), Bar(), Progman("vd")), APP, OrderState.Confirmed, 2);
            // „Pokaż pulpit” and a desktop over the windows with an ordinary foreground: the desktop covers them all.
            Case(wrong, "pokazany pulpit", L(W(5, "WorkerW", "vd", Screen), Window(2), Bar(), Progman("v")), "WorkerW", OrderState.DesktopShown, 0);
            Case(wrong, "pulpit nad oknami przy zwykłym pierwszym planie", L(W(5, "WorkerW", "vd", Screen), Window(2), Bar(), Progman("v")), APP, OrderState.Wrong, 0);
            // A visible WorkerW covering only a part of the bar: the windows under it still show – the bar never above them.
            Case(wrong, "małe WorkerW nad oknem na pasku", L(W(7, "WorkerW", "v", Small), Window(2), Bar(), Progman("vd")), APP, OrderState.Wrong, 2);
            Case(wrong, "pasek nad oknem pod małym WorkerW", L(Bar(), W(7, "WorkerW", "v", Small), Window(2), Progman("vd")), APP, OrderState.Wrong, 2);
            Case(wrong, "brak okna pulpitu", L(Window(2), Bar()), APP, OrderState.NoShell, -1);
            Case(wrong, "okna paska nie ma", L(Window(2), Progman("vd")), APP, OrderState.Gone, 2);
            string detail;
            if (WindowOrder.Check(new IntPtr(BAR), L(Window(2), Bar(), Progman("vd")), false, APP, out detail) != OrderState.NoShell) wrong.Add("brak powłoki: nie no-shell");
        }

        /// <summary>The order on a made-up clock: wrong until laid (`AfterLay` then), every laying counted.</summary>
        class FakeDesk : IWindowDesk
        {
            public long Clock;
            public OrderState State = OrderState.Wrong;
            public OrderState AfterLay = OrderState.Wrong;
            public int Lays;
            public long Now() { return Clock; }
            public List<WindowInfo> Snapshot() { return L(Bar(), Window(2), Progman("vd")); }
            public OrderState Check(IntPtr hwnd, List<WindowInfo> snap, out string detail)
            {
                detail = State == OrderState.Wrong ? "pod paskiem leży okno " + APP : null;
                return State;
            }
            public bool Lay(IntPtr hwnd, out string detail)
            {
                detail = null;
                Lays++;
                State = AfterLay;
                return true;
            }
        }

        /// <summary>D341: after „failed” the keeper tries again by itself every 5 min (events at most once in 5 min).</summary>
        static void Retries(List<object> wrong)
        {
            const long FIVE_MIN = 5 * 60 * 1000;
            List<string> states = new List<string>();
            FakeDesk d = new FakeDesk();
            BarKeeper k = new BarKeeper(delegate(JObj o) { states.Add((string)o["state"]); }, d, FIVE_MIN);
            d.Clock = 1000;
            k.Watch(new IntPtr(BAR));
            d.Clock = 2000;
            k.Tick();
            d.Clock = 3000;
            k.Tick();
            d.Clock = 4000;
            k.Tick();
            string last = states.Count > 0 ? states[states.Count - 1] : "";
            if (last != "failed" || d.Lays != 3) { wrong.Add("ponowienie: po 3 próbach " + last + ", położeń " + d.Lays); return; }
            // An event within the 5 min tries nothing; the order still wrong, the check of every second lays nothing.
            k.Retry(false, "zmiana ekranów");
            d.Clock = 4000 + FIVE_MIN - 1;
            k.Tick();
            if (d.Lays != 3) wrong.Add("ponowienie: przed upływem 5 min (położeń " + d.Lays + ")");
            // 5 min after the failure it lays again by itself – and the order holds now.
            d.AfterLay = OrderState.Confirmed;
            d.Clock = 4000 + FIVE_MIN;
            k.Tick();
            last = states.Count > 0 ? states[states.Count - 1] : "";
            if (d.Lays != 4 || last != "confirmed") { wrong.Add("ponowienie: po 5 min " + last + ", położeń " + d.Lays); return; }
            // Wrong again for good: the next failure, then again 5 min after it.
            d.State = OrderState.Wrong;
            d.AfterLay = OrderState.Wrong;
            for (int i = 0; i < 10 && states[states.Count - 1] != "failed"; i++)
            {
                d.Clock += 1000;
                k.Tick();
            }
            if (states[states.Count - 1] != "failed") { wrong.Add("ponowienie: brak drugiej porażki"); return; }
            long failedAt = d.Clock;
            int lays = d.Lays;
            d.Clock = failedAt + FIVE_MIN - 1;
            k.Tick();
            if (d.Lays != lays) wrong.Add("ponowienie: drugi raz przed upływem 5 min");
            d.Clock = failedAt + FIVE_MIN;
            k.Tick();
            if (d.Lays != lays + 1) wrong.Add("ponowienie: drugi raz po 5 min (położeń " + (d.Lays - lays) + ")");
        }

        /// <summary>The log after a failure: the 8 top windows only, the hidden WorkerW said to be hidden, both places.</summary>
        static void Described(List<object> wrong)
        {
            List<WindowInfo> snap = L(W(1, "WorkerW", "", Screen), Window(2), Bar(), Progman("vd"));
            for (long h = 11; h <= 16; h++) snap.Add(Window(h));
            string s = WindowOrder.Describe(new IntPtr(BAR), snap, 8);
            string[] parts = new string[] { "8 górnych okien z 10", "pasek #2", "najwyższe okno pulpitu #3 Progman", "#0 WorkerW \"\" ukryte 0,0,1920,1080", ", pasek ", "#7 " };
            foreach (string p in parts) if (s.IndexOf(p, StringComparison.Ordinal) < 0) { wrong.Add("okna do logu bez „" + p + "”: " + s); return; }
            if (s.IndexOf("#8 ", StringComparison.Ordinal) >= 0) wrong.Add("okna do logu: więcej niż 8: " + s);
        }

        public static List<object> Wrong()
        {
            List<object> wrong = new List<object>();
            Orders(wrong);
            // The made-up keeper writes its lines into the helper's log like the real one.
            Log.Info("samotest: zmyślony pasek – wpisy „pasek:” do końca samotestu to nie prawdziwy pasek");
            try { Retries(wrong); }
            finally { Log.Info("samotest: koniec zmyślonego paska"); }
            Described(wrong);
            return wrong;
        }
    }
}
