// The self-test of the desktop bar's place (spec „Widget”, D229, D341): the rules of WindowOrder on made-up snapshots of
// the order of windows, and the keeper's tries on a made-up clock, writing into a list. Each case answering otherwise is
// named in the answer (an empty list – all hold); CI runs it in the helper's self-test, any Windows can run it without a
// desktop. Made-up handles never reach Win32: what they would answer depends on the machine.
using System;
using System.Collections.Generic;

namespace RegulatedDay
{
    public static class SelfTestWindows
    {
        const long BAR = 3;
        const string APP = "Chrome_WidgetWin_1";
        const string PROGRAM = "zmyślony.exe";
        static readonly RECT Screen = R(0, 0, 1920, 1080);
        static readonly RECT BarRect = R(10, 1000, 610, 1060);
        /// <summary>A maximized window: it overlaps the bar.</summary>
        static readonly RECT Cover = R(0, 0, 1920, 1040);
        /// <summary>A small window over a part of the bar.</summary>
        static readonly RECT Small = R(0, 990, 300, 1070);
        /// <summary>A window away from the bar.</summary>
        static readonly RECT Away = R(1000, 0, 1900, 500);
        /// <summary>A screen that is no more (a stale rectangle of Progman after a change of the screens).</summary>
        static readonly RECT Stale = R(1920, 0, 3840, 1080);

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
        /// windows not on top), with the window `fg` of the snapshot in the foreground (0: none).
        /// </summary>
        static void Case(List<object> wrong, string name, List<WindowInfo> snap, long fg, OrderState state, long under)
        {
            string detail;
            OrderState got = WindowOrder.Check(new IntPtr(BAR), snap, true, new IntPtr(fg), out detail);
            if (got != state) wrong.Add(name + ": " + got + " zamiast " + state + (detail == null ? "" : " (" + detail + ")"));
            IntPtr after;
            long placed = WindowOrder.PlaceAfter(new IntPtr(BAR), snap, new IntPtr(fg), out after, out detail) ? after.ToInt64() : -1;
            if (placed != under) wrong.Add(name + ": pod oknem " + placed + " zamiast " + under);
        }

        static void Orders(List<object> wrong)
        {
            // Explorer's hidden WorkerW at the top (the VM's „WorkerW nad paskiem” over Edge on full screen): not a desktop window.
            Case(wrong, "ukryte WorkerW na szczycie", L(W(1, "WorkerW", "", Screen), Window(2), Bar(), Progman("vd")), 2, OrderState.Confirmed, 2);
            Case(wrong, "WorkerW ukryte przez system na szczycie", L(W(1, "WorkerW", "vc", Screen), Window(2), Bar(), Progman("vd")), 2, OrderState.Confirmed, 2);
            Case(wrong, "WorkerW bez powierzchni na szczycie", L(W(1, "WorkerW", "v", R(0, 0, 0, 0)), Window(2), Bar(), Progman("vd")), 2, OrderState.Confirmed, 2);
            // A wallpaper program: the icons in a WorkerW, a WorkerW of the wallpaper under it, Progman at the bottom.
            Case(wrong, "tapeta: WorkerW z ikonami i WorkerW tapety", L(Window(2), Bar(), W(5, "WorkerW", "vd", Screen), W(6, "WorkerW", "v", Screen), Progman("v")), 2, OrderState.Confirmed, 2);
            Case(wrong, "zwykłe okno pod paskiem", L(Bar(), Window(2), Progman("vd")), 2, OrderState.Wrong, 2);
            Case(wrong, "okno pod pulpitem się nie liczy", L(Window(2), Bar(), Progman("vd"), Window(8)), 2, OrderState.Confirmed, 2);
            // Under the lowest desktop window nothing counts – also when Progman's rectangle is stale (a screen gone).
            Case(wrong, "nieaktualny prostokąt Progman i okno zaparkowane pod nim", L(Window(2), Bar(), W(4, "Progman", "vd", Stale), Window(8)), 2, OrderState.Confirmed, 2);
            Case(wrong, "zminimalizowane okno pod paskiem", L(Bar(), W(2, APP, "vm", Cover), Progman("vd")), 0, OrderState.Confirmed, 2);
            Case(wrong, "okno obok paska pod nim", L(Bar(), W(10, APP, "v", Away), Progman("vd")), 10, OrderState.Confirmed, 10);
            Case(wrong, "pasek zadań na wierzchu", L(W(9, "Shell_TrayWnd", "vt", R(0, 1040, 1920, 1080)), Bar(), Progman("vd")), 9, OrderState.Confirmed, 0);
            Case(wrong, "pasek zadań na wierzchu i okno", L(W(9, "Shell_TrayWnd", "vt", R(0, 1040, 1920, 1080)), Window(2), Bar(), Progman("vd")), 2, OrderState.Confirmed, 2);
            // An old file dialog holds SHELLDLL_DefView too: a window of its program, never the desktop.
            Case(wrong, "okno pliku #32770 z SHELLDLL_DefView nad paskiem", L(W(20, "#32770", "vd", Cover), Bar(), Progman("vd")), 20, OrderState.Confirmed, 20);
            Case(wrong, "pasek nad oknem pliku #32770 z SHELLDLL_DefView", L(Bar(), W(20, "#32770", "vd", Cover), Progman("vd")), 20, OrderState.Wrong, 20);
            // „Pokaż pulpit” (a desktop window in front): a desktop window over the whole bar hides the windows under it.
            Case(wrong, "pokazany pulpit", L(W(5, "WorkerW", "vd", Screen), Window(2), Bar(), Progman("v")), 5, OrderState.DesktopShown, 0);
            Case(wrong, "widoczne WorkerW na szczycie, pulpit na pierwszym planie", L(W(6, "WorkerW", "v", Screen), Window(2), Bar(), Progman("vd")), 6, OrderState.DesktopShown, 0);
            Case(wrong, "pasek nad widocznym WorkerW nad oknem, pulpit na pierwszym planie", L(Bar(), W(6, "WorkerW", "v", Screen), Window(2), Progman("vd")), 6, OrderState.Confirmed, 0);
            // „Pokaż pulpit” with the foreground over the raised desktop – the taskbar, Start, a program started then: the
            // windows under the desktop still hide; the bar goes over the desktop as before.
            WindowInfo tray = W(9, "Shell_TrayWnd", "vt", R(0, 1040, 1920, 1080));
            Case(wrong, "pokazany pulpit, pierwszy plan na pasku zadań, pasek pod pulpitem", L(tray, W(5, "WorkerW", "vd", Screen), Window(2), Bar(), Progman("v")), 9, OrderState.Wrong, 0);
            Case(wrong, "pokazany pulpit, pierwszy plan na pasku zadań, pasek nad pulpitem", L(tray, Bar(), W(5, "WorkerW", "vd", Screen), Window(2), Progman("v")), 9, OrderState.Confirmed, 0);
            Case(wrong, "pokazany pulpit, nowe okno nad nim na pierwszym planie, pasek pod pulpitem", L(tray, Window(12), W(5, "WorkerW", "vd", Screen), Window(2), Bar(), Progman("v")), 12, OrderState.Wrong, 12);
            Case(wrong, "pokazany pulpit, nowe okno nad nim na pierwszym planie, pasek nad pulpitem", L(tray, Window(12), Bar(), W(5, "WorkerW", "vd", Screen), Window(2), Progman("v")), 12, OrderState.Confirmed, 12);
            // The foreground under the desktop window (a see-through WorkerW over Edge on full screen): no desktop window
            // hides anything – the bar never over a window that shows over it; with a desktop window still over it the
            // tries end with „failed”.
            Case(wrong, "pulpit nad oknami przy zwykłym pierwszym planie", L(W(5, "WorkerW", "vd", Screen), Window(2), Bar(), Progman("v")), 2, OrderState.Wrong, 2);
            Case(wrong, "widoczne WorkerW na szczycie, zwykły pierwszy plan", L(W(6, "WorkerW", "v", Screen), Window(2), Bar(), Progman("vd")), 2, OrderState.Wrong, 2);
            Case(wrong, "pasek nad widocznym WorkerW nad oknem, zwykły pierwszy plan", L(Bar(), W(6, "WorkerW", "v", Screen), Window(2), Progman("vd")), 2, OrderState.Wrong, 2);
            // A visible WorkerW over a part of the bar counts; one away from the bar does not.
            Case(wrong, "małe WorkerW nad oknem na pasku", L(W(7, "WorkerW", "v", Small), Window(2), Bar(), Progman("vd")), 2, OrderState.Wrong, 2);
            Case(wrong, "pasek nad oknem pod małym WorkerW", L(Bar(), W(7, "WorkerW", "v", Small), Window(2), Progman("vd")), 2, OrderState.Wrong, 2);
            Case(wrong, "małe WorkerW daleko od paska nad oknem", L(W(7, "WorkerW", "v", Away), Window(2), Bar(), Progman("vd")), 2, OrderState.Confirmed, 2);
            Case(wrong, "małe WorkerW daleko od paska na szczycie", L(W(7, "WorkerW", "v", Away), Bar(), Progman("vd")), 0, OrderState.Confirmed, 7);
            Case(wrong, "brak okna pulpitu", L(Window(2), Bar()), 2, OrderState.NoShell, -1);
            Case(wrong, "okna paska nie ma", L(Window(2), Progman("vd")), 2, OrderState.Gone, 2);
            string detail;
            if (WindowOrder.Check(new IntPtr(BAR), L(Window(2), Bar(), Progman("vd")), false, new IntPtr(2), out detail) != OrderState.NoShell) wrong.Add("brak powłoki: nie no-shell");
        }

        /// <summary>The order on a made-up clock: wrong until laid (`AfterLay` then), every laying counted, notes kept.</summary>
        class FakeDesk : IWindowDesk
        {
            public long Clock;
            public OrderState State = OrderState.Wrong;
            public OrderState AfterLay = OrderState.Wrong;
            public int Lays;
            /// <summary>Another window under the bar (the windows to log differ).</summary>
            public bool Other;
            public readonly List<string> Notes = new List<string>();
            public long Now() { return Clock; }
            public List<WindowInfo> Snapshot() { return Other ? L(Bar(), Window(11), Window(2), Progman("vd")) : L(Bar(), Window(2), Progman("vd")); }
            public OrderState Check(IntPtr hwnd, List<WindowInfo> snap, out string detail)
            {
                detail = State == OrderState.Wrong ? "pod paskiem leży okno " + APP : null;
                return State;
            }
            public bool Lay(IntPtr hwnd, List<WindowInfo> snap, out string detail)
            {
                detail = null;
                Lays++;
                State = AfterLay;
                return true;
            }
            public string Program(IntPtr hwnd) { return PROGRAM; }
            public void Note(bool warn, string message) { Notes.Add(message); }

            public int Count(string part)
            {
                int n = 0;
                foreach (string s in Notes) if (s.IndexOf(part, StringComparison.Ordinal) >= 0) n++;
                return n;
            }
        }

        /// <summary>
        /// D341: after „failed” the keeper tries again by itself every 5 min (events at most once in 5 min); the windows
        /// holding the bar are written down once per run of failures, again only when they differ.
        /// </summary>
        static void Retries(List<object> wrong)
        {
            const long FIVE_MIN = 5 * 60 * 1000;
            const string WINDOWS = "górnych okien";
            List<string> states = new List<string>();
            FakeDesk d = new FakeDesk();
            BarKeeper k = new BarKeeper(delegate(JObj o) { states.Add((string)o["state"]); }, d, FIVE_MIN);
            Func<string> last = delegate() { return states.Count > 0 ? states[states.Count - 1] : ""; };
            // Ticks of a second until „failed”.
            Action failAgain = delegate()
            {
                for (int i = 0; i < 10 && last() != "failed"; i++)
                {
                    d.Clock += 1000;
                    k.Tick();
                }
            };
            d.Clock = 1000;
            k.Watch(new IntPtr(BAR));
            failAgain();
            if (last() != "failed" || d.Lays != 3) { wrong.Add("ponowienie: po 3 próbach " + last() + ", położeń " + d.Lays); return; }
            if (d.Count(WINDOWS) != 1) wrong.Add("okna do logu: po pierwszym „failed” " + d.Count(WINDOWS) + " wpisów zamiast 1");
            long failedAt = d.Clock;
            // An event within the 5 min tries nothing; the order still wrong, the check of every second lays nothing.
            k.Retry(false, "zmiana ekranów");
            d.Clock = failedAt + FIVE_MIN - 1;
            k.Tick();
            if (d.Lays != 3) wrong.Add("ponowienie: przed upływem 5 min (położeń " + d.Lays + ")");
            // 5 min after: a retry by itself; the same windows still hold it – „failed” again, the windows not written again.
            d.Clock = failedAt + FIVE_MIN;
            k.Tick();
            if (d.Lays != 4 || d.Count("ponowna próba (co 5 min)") != 1) { wrong.Add("ponowienie: po 5 min położeń " + d.Lays + ", wpisów ponowienia " + d.Count("ponowna próba (co 5 min)")); return; }
            failAgain();
            if (last() != "failed") { wrong.Add("ponowienie: brak drugiej porażki"); return; }
            if (d.Count(WINDOWS) != 1) wrong.Add("okna do logu: te same okna wpisane znowu (" + d.Count(WINDOWS) + " wpisów)");
            // Other windows: the next failure writes them.
            d.Other = true;
            d.Clock += FIVE_MIN;
            k.Tick();
            failAgain();
            if (d.Count(WINDOWS) != 2) wrong.Add("okna do logu: inne okna niewpisane (" + d.Count(WINDOWS) + " wpisów zamiast 2)");
            // It holds at last, 5 min after the failure.
            failedAt = d.Clock;
            int lays = d.Lays;
            d.AfterLay = OrderState.Confirmed;
            d.Clock = failedAt + FIVE_MIN - 1;
            k.Tick();
            if (d.Lays != lays) wrong.Add("ponowienie: trzeci raz przed upływem 5 min");
            d.Clock = failedAt + FIVE_MIN;
            k.Tick();
            if (d.Lays != lays + 1 || last() != "confirmed") { wrong.Add("ponowienie: po 5 min " + last() + ", położeń " + (d.Lays - lays)); return; }
            // A new run of failures writes its windows again, the same ones too; then again a retry 5 min after it.
            d.State = OrderState.Wrong;
            d.AfterLay = OrderState.Wrong;
            failAgain();
            if (last() != "failed") { wrong.Add("ponowienie: brak porażki po potwierdzeniu"); return; }
            if (d.Count(WINDOWS) != 3) wrong.Add("okna do logu: nowy ciąg porażek bez wpisu (" + d.Count(WINDOWS) + " wpisów zamiast 3)");
            failedAt = d.Clock;
            lays = d.Lays;
            d.Clock = failedAt + FIVE_MIN - 1;
            k.Tick();
            if (d.Lays != lays) wrong.Add("ponowienie: po potwierdzeniu przed upływem 5 min");
            d.Clock = failedAt + FIVE_MIN;
            k.Tick();
            if (d.Lays != lays + 1) wrong.Add("ponowienie: po potwierdzeniu po 5 min (położeń " + (d.Lays - lays) + ")");
        }

        /// <summary>The log after a failure: the 8 top windows only, no titles, the hidden WorkerW said to be hidden, both places.</summary>
        static void Described(List<object> wrong)
        {
            List<WindowInfo> snap = L(W(1, "WorkerW", "", Screen), Window(2), Bar(), Progman("vd"));
            for (long h = 11; h <= 16; h++) snap.Add(Window(h));
            string s = WindowOrder.Describe(new IntPtr(BAR), snap, 8, delegate(IntPtr h) { return PROGRAM; });
            string[] parts = new string[] { "8 górnych okien (pasek #2, najwyższe okno pulpitu #3 Progman", "#0 WorkerW " + PROGRAM + " ukryte 0,0,1920,1080", ", pasek ", "#7 " };
            foreach (string p in parts) if (s.IndexOf(p, StringComparison.Ordinal) < 0) { wrong.Add("okna do logu bez „" + p + "”: " + s); return; }
            if (s.IndexOf("#8 ", StringComparison.Ordinal) >= 0) wrong.Add("okna do logu: więcej niż 8: " + s);
            if (s.IndexOf('"') >= 0) wrong.Add("okna do logu z tytułami: " + s);
        }

        public static List<object> Wrong()
        {
            List<object> wrong = new List<object>();
            Orders(wrong);
            Retries(wrong);
            Described(wrong);
            return wrong;
        }
    }
}
