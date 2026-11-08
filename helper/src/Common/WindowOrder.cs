// The order of windows (spec „Widget”, D229, D341): the desktop bar – and at night the install helper's progress window –
// lies right above the highest window of the desktop, never at the very bottom (under the desktop it would never show),
// and never above a shown window of another program that overlaps it. Desktop windows: Progman, a WorkerW holding
// SHELLDLL_DefView (the icons) and a WorkerW that shows (visible, not cloaked, with an area) – Explorer keeps hidden
// WorkerW windows anywhere in the order, also at its very top (G4: taken for the desktop, one laid the bar over Edge on
// full screen), and an old file dialog (#32770) holds SHELLDLL_DefView too. Of them count for the bar Progman, the
// window of the icons (their rectangles may be stale after a change of the screens) and those overlapping it. Confirmed
// is a window under which lie all desktop windows that count and no other shown (visible, not cloaked by the system, not
// minimized) window overlapping it, down to the lowest desktop window that counts – under it nothing ever counts. The
// windows under a desktop window covering the whole bar do not count either („Pokaż pulpit” raises the desktop), unless
// the foreground – not of the desktop's class – lies under that desktop window: then it is see-through.
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

        /// <summary>
        /// Progman, or a WorkerW with the icons or one that shows (a hidden one of Explorer is no desktop; a window of
        /// another class holding SHELLDLL_DefView – an old file dialog – is a window of its program).
        /// </summary>
        public static bool IsDesktopWindow(WindowInfo w)
        {
            if (w.Class == "Progman") return true;
            if (w.Class != "WorkerW") return false;
            return w.DefView || (w.Visible && !w.Cloaked && !w.Rect.Empty);
        }

        /// <summary>Where a window and the desktop windows that count for it stand in a snapshot (-1: none).</summary>
        struct Places
        {
            public int Me, Top, Bottom;
            public RECT Mine;
        }

        /// <summary>
        /// A desktop window counts for a window over `mine` when it is the desktop itself – Progman or the window of the
        /// icons, whose rectangles may be stale after a change of the screens – or overlaps it (a small WorkerW elsewhere
        /// never holds the bar).
        /// </summary>
        static bool Counts(WindowInfo w, RECT mine)
        {
            return w.Desktop && (w.Class == "Progman" || w.DefView || w.Rect.Overlaps(mine));
        }

        /// <summary>`hwnd` (Me, its rectangle) and the highest and the lowest desktop window counting for it.</summary>
        static Places Find(IntPtr hwnd, List<WindowInfo> snap)
        {
            Places p = new Places();
            p.Me = p.Top = p.Bottom = -1;
            for (int i = 0; i < snap.Count; i++)
                if (snap[i].Hwnd == hwnd) { p.Me = i; p.Mine = snap[i].Rect; break; }
            for (int i = 0; i < snap.Count; i++)
            {
                if (i == p.Me || !Counts(snap[i], p.Mine)) continue;
                if (p.Top < 0) p.Top = i;
                p.Bottom = i;
            }
            return p;
        }

        /// <summary>The window shows: visible, not cloaked by the system, not minimized, with an area.</summary>
        static bool Shows(WindowInfo w)
        {
            return w.Visible && !w.Cloaked && !w.Iconic && !w.Rect.Empty;
        }

        /// <summary>
        /// The highest desktop window (not `hwnd`) over the whole of `mine` – the windows under it do not show there
        /// („Pokaż pulpit”: Win+D raises the desktop; the foreground then is the desktop, or a window over it – the
        /// taskbar, Start, a program started then). -1: none such, or the foreground (not of the desktop's class) lies under
        /// it – then that desktop window is see-through (G4: a WorkerW over Edge on full screen) and hides nothing.
        /// </summary>
        static int CoveringDesktop(IntPtr hwnd, List<WindowInfo> snap, RECT mine, IntPtr fg)
        {
            int covering = -1;
            for (int i = 0; i < snap.Count && covering < 0; i++)
            {
                WindowInfo w = snap[i];
                if (w.Hwnd != hwnd && w.Desktop && w.Visible && !w.Cloaked && w.Rect.Contains(mine)) covering = i;
            }
            if (covering < 0) return -1;
            // The foreground under it (an ordinary window under a see-through WorkerW): it shows – nothing is hidden.
            int f = IndexIn(snap, fg);
            if (f > covering && !IsDesktopClass(snap[f].Class)) return -1;
            return covering;
        }

        static int IndexIn(List<WindowInfo> snap, IntPtr h)
        {
            if (h == IntPtr.Zero) return -1;
            for (int i = 0; i < snap.Count; i++) if (snap[i].Hwnd == h) return i;
            return -1;
        }

        /// <summary>The class of a window of the snapshot; "" – not in it.</summary>
        static string ClassIn(List<WindowInfo> snap, IntPtr h)
        {
            int i = IndexIn(snap, h);
            return i < 0 ? "" : snap[i].Class;
        }

        /// <summary>
        /// The window at `i` (not `hwnd`, not of the desktop) shows over a part of `mine` – it is not under the desktop
        /// window covering the whole of it (`covering`, CoveringDesktop) – so `hwnd` must lie under it.
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
            return Check(hwnd, snap, ShellPresent(), Native.GetForegroundWindow(), out detail);
        }

        /// <summary>
        /// The same from what was read: whether a shell window is there and the foreground window (found in the snapshot –
        /// its class and its place; Zero or not in it: none).
        /// </summary>
        public static OrderState Check(IntPtr hwnd, List<WindowInfo> snap, bool shell, IntPtr fg, out string detail)
        {
            string fgClass = ClassIn(snap, fg);
            detail = null;
            if (!shell) { detail = "brak okna powłoki"; return OrderState.NoShell; }
            Places p = Find(hwnd, snap);
            if (p.Me < 0) { detail = "okna nie ma"; return OrderState.Gone; }
            if (p.Top < 0) { detail = "brak okna pulpitu"; return OrderState.NoShell; }
            if (p.Top < p.Me)
            {
                // „Pokaż pulpit”: a desktop window has the foreground and lies over visible windows from outside the desktop.
                if (IsDesktopClass(fgClass))
                {
                    for (int i = p.Top + 1; i < snap.Count; i++)
                    {
                        WindowInfo w = snap[i];
                        if (!w.Desktop && w.Hwnd != hwnd && Shows(w)) { detail = "pokazany pulpit"; return OrderState.DesktopShown; }
                    }
                }
                detail = "okno pulpitu (" + snap[p.Top].Class + ") nad paskiem";
                return OrderState.Wrong;
            }
            // Every desktop window counting for it lies under it (Top is the highest); no window that shows over its place
            // under it, down to the lowest desktop window.
            int covering = CoveringDesktop(hwnd, snap, p.Mine, fg);
            for (int i = p.Me + 1; i < p.Bottom; i++)
            {
                if (ShowsOver(hwnd, snap, i, p.Mine, covering))
                {
                    detail = "pod paskiem leży okno " + snap[i].Class;
                    return OrderState.Wrong;
                }
            }
            return OrderState.Confirmed;
        }

        /// <summary>
        /// The window `hwnd` is to be laid right under (`after`; HWND_TOP – the top of the windows not on top), from a
        /// snapshot with the window `fg` in front: right over the highest desktop window counting for it, but
        /// never over a window that shows over its place – with such a window between the desktop windows (under a
        /// see-through or partial one), it goes right under the lowest of them, and with a desktop window still over it
        /// the check says „wrong” and the tries end with „failed”. False: there is no desktop window.
        /// </summary>
        public static bool PlaceAfter(IntPtr hwnd, List<WindowInfo> snap, IntPtr fg, out IntPtr after, out string detail)
        {
            detail = null;
            after = Native.HWND_TOP;
            Places p = Find(hwnd, snap);
            if (p.Top < 0) { detail = "brak okna pulpitu"; return false; }
            if (p.Me >= 0)
            {
                int covering = CoveringDesktop(hwnd, snap, p.Mine, fg);
                for (int i = p.Bottom - 1; i > p.Top; i--)
                {
                    if (!ShowsOver(hwnd, snap, i, p.Mine, covering)) continue;
                    after = snap[i].Hwnd;
                    return true;
                }
            }
            // The window above the desktop (not this one): this one goes right under it, i.e. right over the desktop.
            int topDesk = p.Top;
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
            return LayAboveDesktop(hwnd, Snapshot(), out detail);
        }

        /// <summary>The same by a snapshot just read (the one the check found wrong).</summary>
        public static bool LayAboveDesktop(IntPtr hwnd, List<WindowInfo> snap, out string detail)
        {
            IntPtr insertAfter;
            if (!PlaceAfter(hwnd, snap, Native.GetForegroundWindow(), out insertAfter, out detail)) return false;
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
        /// The top `count` windows of a snapshot for the log after a failure – class, program (`programOf`), what of it
        /// shows, the rectangle; never a title (logs go into reports, D279) – and where `hwnd` and the highest and the
        /// lowest desktop window counting for it stand.
        /// </summary>
        public static string Describe(IntPtr hwnd, List<WindowInfo> snap, int count, Func<IntPtr, string> programOf)
        {
            Places p = Find(hwnd, snap);
            StringBuilder b = new StringBuilder();
            b.Append(Math.Min(count, snap.Count)).Append(" górnych okien (pasek #").Append(p.Me).Append(", najwyższe okno pulpitu #").Append(p.Top);
            if (p.Top >= 0) b.Append(' ').Append(snap[p.Top].Class).Append(", najniższe #").Append(p.Bottom);
            b.Append("):");
            for (int i = 0; i < snap.Count && i < count; i++)
            {
                WindowInfo w = snap[i];
                b.Append(i == 0 ? " #" : " | #").Append(i).Append(' ').Append(w.Class);
                string program = programOf(w.Hwnd);
                if (program != null) b.Append(' ').Append(program);
                b.Append(' ').Append(w.Visible ? "widoczne" : "ukryte");
                if (w.Cloaked) b.Append(", ukryte przez system");
                if (w.Iconic) b.Append(", zminimalizowane");
                if (w.Topmost) b.Append(", na wierzchu");
                if (w.DefView) b.Append(", z ikonami");
                if (w.Desktop) b.Append(", pulpit");
                if (w.Hwnd == hwnd) b.Append(", pasek");
                b.Append(' ').Append(w.Rect.ToString());
            }
            return b.ToString();
        }
    }
}
