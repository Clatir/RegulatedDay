// The order of windows (spec „Widget”): the desktop bar – and at night the install helper's progress window – lies right
// above the highest window of the desktop (Progman, or WorkerW with the desktop's icons), never at the very bottom
// (under the desktop it would never show). Confirmed is a window under which lie all top-level windows of the desktop
// (Progman, WorkerW and the one holding SHELLDLL_DefView), and under which lies no other visible, not cloaked by the
// system, not minimized window that overlaps it. Windows under the highest desktop window never count as overlapping.
using System;
using System.Collections.Generic;
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
                w.Desktop = IsDesktopClass(w.Class) || Native.FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;
                Native.GetWindowRect(h, out w.Rect);
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
            detail = null;
            if (!ShellPresent()) { detail = "brak okna powłoki"; return OrderState.NoShell; }
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
                IntPtr fg = Native.GetForegroundWindow();
                string fgClass = fg == IntPtr.Zero ? "" : Native.ClassOf(fg);
                if (IsDesktopClass(fgClass))
                {
                    for (int i = topDesk + 1; i < snap.Count; i++)
                    {
                        WindowInfo w = snap[i];
                        if (!w.Desktop && w.Hwnd != hwnd && w.Visible && !w.Cloaked && !w.Iconic && !w.Rect.Empty) { detail = "pokazany pulpit"; return OrderState.DesktopShown; }
                    }
                }
                detail = "okno pulpitu (" + snap[topDesk].Class + ") nad paskiem";
                return OrderState.Wrong;
            }
            // Every desktop window under it.
            for (int i = 0; i < me; i++)
                if (snap[i].Desktop) { detail = "okno pulpitu nad paskiem"; return OrderState.Wrong; }
            RECT mine = snap[me].Rect;
            for (int i = me + 1; i < topDesk; i++)
            {
                WindowInfo w = snap[i];
                if (w.Visible && !w.Cloaked && !w.Iconic && !w.Rect.Empty && w.Rect.Overlaps(mine))
                {
                    detail = "pod paskiem leży okno " + w.Class;
                    return OrderState.Wrong;
                }
            }
            return OrderState.Confirmed;
        }

        /// <summary>
        /// Lays `hwnd` right above the highest desktop window: SetWindowPos called synchronously (never
        /// SWP_ASYNCWINDOWPOS), in a thread of its own limited to 2 s – the window's own thread may be busy. False: not laid.
        /// </summary>
        public static bool LayAboveDesktop(IntPtr hwnd, out string detail)
        {
            detail = null;
            List<WindowInfo> snap = Snapshot();
            int topDesk = -1;
            for (int i = 0; i < snap.Count; i++)
                if (snap[i].Desktop && snap[i].Hwnd != hwnd) { topDesk = i; break; }
            if (topDesk < 0) { detail = "brak okna pulpitu"; return false; }
            // The window above the desktop (not this one): this one goes right under it, i.e. right over the desktop.
            IntPtr after = Native.HWND_TOP;
            for (int i = topDesk - 1; i >= 0; i--)
            {
                if (snap[i].Hwnd == hwnd) continue;
                after = snap[i].Topmost ? Native.HWND_TOP : snap[i].Hwnd;
                break;
            }
            bool ok = false;
            int error = 0;
            IntPtr insertAfter = after;
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
    }
}
