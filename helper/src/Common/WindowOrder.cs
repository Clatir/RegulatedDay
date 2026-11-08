// The order of windows (spec „Widget”, D229, D341): the desktop bar – and at night the install helper's progress window –
// lies right above the highest window of the desktop, never at the very bottom (under the desktop it would never show),
// and never above a shown window of another program that overlaps it. Desktop windows: Progman, the one holding
// SHELLDLL_DefView (the icons) and a WorkerW that shows (visible, not cloaked, with an area) – Explorer keeps hidden
// WorkerW windows anywhere in the order, also at its very top (G4: taken for the desktop, one laid the bar over Edge on
// full screen). Confirmed is a window under which lie all desktop windows and no other shown (visible, not cloaked by
// the system, not minimized) window that overlaps it; windows under a shown desktop window covering the whole bar never
// count – they never show there.
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;

namespace RegulatedDay
{
    public class WindowInfo
    {
        public IntPtr Hwnd;
        public string Class;
        public bool Visible;
        public bool Cloaked;
        public bool Iconic;
        public bool Topmost;
        /// <summary>It holds SHELLDLL_DefView (the desktop's icons).</summary>
        public bool DefView;
        public bool Desktop;
        public RECT Rect;
    }

    public enum OrderState
    {
        /// <summary>The window lies right where it should.</summary>
        Confirmed,
        /// <summary>It needs laying again.</summary>
        Wrong,
        /// <summary>„Pokaż pulpit”: the desktop lies over the windows and has the foreground – nothing is touched.</summary>
        DesktopShown,
        /// <summary>No shell window (Explorer restarting): wait, nothing counts.</summary>
        NoShell,
        /// <summary>The window is not there.</summary>
        Gone
    }

    public static class WindowOrder
    {
        public static bool IsDesktopClass(string cls)
        {
            return cls == "Progman" || cls == "WorkerW";
        }

        /// <summary>Progman, the window of the icons, or a WorkerW that shows (a hidden one of Explorer is no desktop).</summary>
        public static bool IsDesktopWindow(WindowInfo w)
        {
            if (w.DefView || w.Class == "Progman") return true;
            return w.Class == "WorkerW" && w.Visible && !w.Cloaked && !w.Rect.Empty;
        }

        /// <summary>The window shows: visible, not cloaked by the system, not minimized, with an area.</summary>
        static bool Shows(WindowInfo w)
        {
            return w.Visible && !w.Cloaked && !w.Iconic && !w.Rect.Empty;
        }

        /// <summary>
        /// The highest desktop window (not `hwnd`) that shows over the whole of `mine`: the windows under it never show
        /// there. -1: none.
        /// </summary>
        static int CoveringDesktop(IntPtr hwnd, List<WindowInfo> snap, RECT mine)
        {
            for (int i = 0; i < snap.Count; i++)
            {
                WindowInfo w = snap[i];
                if (w.Hwnd != hwnd && w.Desktop && w.Visible && !w.Cloaked && w.Rect.Contains(mine)) return i;
            }
            return -1;
        }

        /// <summary>
        /// The window at `i` (not `hwnd`, not of the desktop) shows over a part of `mine` – it is not under the desktop
        /// window covering the whole of it (`covering`) – so `hwnd` must lie under it.
        /// </summary>
        static bool ShowsOver(IntPtr hwnd, List<WindowInfo> snap, int i, RECT mine, int covering)
        {
            WindowInfo w = snap[i];
            if (w.Hwnd == hwnd || w.Desktop || !Shows(w) || !w.Rect.Overlaps(mine)) return false;
            return covering < 0 || covering > i;
        }

        /// <summary>The top-level windows, from the top of the order down.</summary>
        public static List<WindowInfo> Snapshot()
        {
            List<WindowInfo> list = new List<WindowInfo>();
            EnumWindowsProc cb = delegate(IntPtr h, IntPtr l)
            {
                WindowInfo w = new WindowInfo();
                w.Hwnd = h;
                w.Class = Native.ClassOf(h);
                w.Visible = Native.IsWindowVisible(h);
                w.Cloaked = w.Visible && Native.IsCloaked(h);
                w.Iconic = Native.IsIconic(h);
                w.Topmost = Native.IsTopmost(h);
                w.DefView = Native.FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;
                Native.GetWindowRect(h, out w.Rect);
                w.Desktop = IsDesktopWindow(w);
                list.Add(w);
                return true;
            };
            Native.EnumWindows(cb, IntPtr.Zero);
            GC.KeepAlive(cb);
            return list;
        }

        public static bool ShellPresent()
        {
            return Native.GetShellWindow() != IntPtr.Zero || Native.FindWindow("Progman", null) != IntPtr.Zero;
        }

        /// <summary>Where `hwnd` stands against the desktop, from a snapshot; `detail` says why it is wrong.</summary>
        public static OrderState Check(IntPtr hwnd, List<WindowInfo> snap, out string detail)
        {
            IntPtr fg = Native.GetForegroundWindow();
            return Check(hwnd, snap, ShellPresent(), fg == IntPtr.Zero ? "" : Native.ClassOf(fg), out detail);
        }

        /// <summary>The same from what was read: whether a shell window is there and the foreground window's class.</summary>
        public static OrderState Check(IntPtr hwnd, List<WindowInfo> snap, bool shell, string fgClass, out string detail)
        {
            detail = null;
            if (!shell) { detail = "brak okna powłoki"; return OrderState.NoShell; }
            int me = -1, topDesk = -1;
            for (int i = 0; i < snap.Count; i++)
            {
                if (snap[i].Hwnd == hwnd) me = i;
                else if (snap[i].Desktop && topDesk < 0) topDesk = i;
            }
            if (me < 0) { detail = "okna nie ma"; return OrderState.Gone; }
            if (topDesk < 0) { detail = "brak okna pulpitu"; return OrderState.NoShell; }
            if (topDesk < me)
            {
                // „Pokaż pulpit”: a desktop window has the foreground and lies over visible windows from outside the desktop.
                if (IsDesktopClass(fgClass))
                {
                    for (int i = topDesk + 1; i < snap.Count; i++)
                    {
                        WindowInfo w = snap[i];
                        if (!w.Desktop && w.Hwnd != hwnd && Shows(w)) { detail = "pokazany pulpit"; return OrderState.DesktopShown; }
                    }
                }
                detail = "okno pulpitu (" + snap[topDesk].Class + ") nad paskiem";
                return OrderState.Wrong;
            }
            // Every desktop window under it.
            for (int i = 0; i < me; i++)
                if (snap[i].Desktop) { detail = "okno pulpitu nad paskiem"; return OrderState.Wrong; }
            // No window of another program that shows over its place under it – also under a desktop window that leaves
            // a part of the bar open.
            RECT mine = snap[me].Rect;
            int covering = CoveringDesktop(hwnd, snap, mine);
            for (int i = me + 1; i < snap.Count; i++)
            {
                if (ShowsOver(hwnd, snap, i, mine, covering))
                {
                    detail = "pod paskiem leży okno " + snap[i].Class;
                    return OrderState.Wrong;
                }
            }
            return OrderState.Confirmed;
        }

        /// <summary>
        /// The window `hwnd` is to be laid right under (`after`; HWND_TOP – the top of the windows not on top), from a
        /// snapshot: right over the highest desktop window, but never over a window of another program that shows over
        /// its place – under a desktop window leaving a part of it open, it goes under the lowest such window (the check
        /// then says „wrong” and the tries end with „failed”). False: there is no desktop window.
        /// </summary>
        public static bool PlaceAfter(IntPtr hwnd, List<WindowInfo> snap, out IntPtr after, out string detail)
        {
            detail = null;
            after = Native.HWND_TOP;
            int topDesk = -1, me = -1;
            for (int i = 0; i < snap.Count; i++)
            {
                if (snap[i].Hwnd == hwnd) me = i;
                else if (snap[i].Desktop && topDesk < 0) topDesk = i;
            }
            if (topDesk < 0) { detail = "brak okna pulpitu"; return false; }
            if (me >= 0)
            {
                RECT mine = snap[me].Rect;
                int covering = CoveringDesktop(hwnd, snap, mine);
                for (int i = snap.Count - 1; i > topDesk; i--)
                {
                    if (!ShowsOver(hwnd, snap, i, mine, covering)) continue;
                    after = snap[i].Hwnd;
                    return true;
                }
            }
            // The window above the desktop (not this one): this one goes right under it, i.e. right over the desktop.
            for (int i = topDesk - 1; i >= 0; i--)
            {
                if (snap[i].Hwnd == hwnd) continue;
                after = snap[i].Topmost ? Native.HWND_TOP : snap[i].Hwnd;
                break;
            }
            return true;
        }

        /// <summary>
        /// Lays `hwnd` right above the highest desktop window: SetWindowPos called synchronously (never
        /// SWP_ASYNCWINDOWPOS), in a thread of its own limited to 2 s – the window's own thread may be busy. False: not laid.
        /// </summary>
        public static bool LayAboveDesktop(IntPtr hwnd, out string detail)
        {
            IntPtr insertAfter;
            if (!PlaceAfter(hwnd, Snapshot(), out insertAfter, out detail)) return false;
            bool ok = false;
            int error = 0;
            Thread t = new Thread(delegate()
            {
                ok = Native.SetWindowPos(hwnd, insertAfter, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_NOOWNERZORDER);
                if (!ok) error = System.Runtime.InteropServices.Marshal.GetLastWin32Error();
            });
            t.IsBackground = true;
            t.Start();
            if (!t.Join(2000)) { detail = "SetWindowPos nie skończyło się w 2 s"; return false; }
            if (!ok) detail = "SetWindowPos: błąd " + error;
            return ok;
        }

        /// <summary>
        /// The top `count` windows of a snapshot for the log after a failure – class, program, the title's start, what of
        /// it shows, the rectangle – and where `hwnd` and the highest desktop window stand.
        /// </summary>
        public static string Describe(IntPtr hwnd, List<WindowInfo> snap, int count)
        {
            int me = -1, topDesk = -1;
            for (int i = 0; i < snap.Count; i++)
            {
                if (snap[i].Hwnd == hwnd) me = i;
                else if (snap[i].Desktop && topDesk < 0) topDesk = i;
            }
            StringBuilder b = new StringBuilder();
            b.Append(Math.Min(count, snap.Count)).Append(" górnych okien z ").Append(snap.Count).Append(" (pasek #").Append(me).Append(", najwyższe okno pulpitu #").Append(topDesk);
            if (topDesk >= 0) b.Append(' ').Append(snap[topDesk].Class);
            b.Append("):");
            for (int i = 0; i < snap.Count && i < count; i++)
            {
                WindowInfo w = snap[i];
                b.Append(i == 0 ? " #" : " | #").Append(i).Append(' ').Append(w.Class);
                string program = Foreground.ProcessName(w.Hwnd);
                if (program != null) b.Append(' ').Append(program);
                b.Append(" \"").Append(Short(Native.TitleOf(w.Hwnd), 20)).Append("\" ").Append(w.Visible ? "widoczne" : "ukryte");
                if (w.Cloaked) b.Append(", ukryte przez system");
                if (w.Iconic) b.Append(", zminimalizowane");
                if (w.Topmost) b.Append(", na wierzchu");
                if (w.Desktop) b.Append(", pulpit");
                if (w.Hwnd == hwnd) b.Append(", pasek");
                b.Append(' ').Append(w.Rect.ToString());
            }
            return b.ToString();
        }

        /// <summary>The start of a title: no control characters or quotes, at most `max` characters.</summary>
        static string Short(string s, int max)
        {
            StringBuilder b = new StringBuilder();
            foreach (char c in s ?? "")
            {
                if (b.Length >= max) { b.Append('…'); break; }
                b.Append(c < ' ' || c == '"' ? ' ' : c);
            }
            return b.ToString();
        }
    }
}
