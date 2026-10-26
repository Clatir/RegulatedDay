// The windows of the owner of an installation (spec „Instalacja, aktualizacje i log”, D229, D257). They never take the
// focus: shown without activation (SW_SHOWNOACTIVATE through ShowWithoutActivation, never WS_EX_NOACTIVATE, so a click of
// the window or its taskbar button raises it), with a taskbar button, never always on top. The install helper's progress
// window is created only after the app's process ended; at night the install helper lays it under the windows first.
// The guard shows its icon in the tray („Trwa aktualizacja do X od 03:12 · Uruchom mimo to”) and a small window only
// when the start was made by hand – never from the autostart, and never during a session or a class or 30 min before.
// A press of a mouse button in another window lays the shown windows right under it (T408): Windows raises a clicked
// window only when it was not active, and the window active under ours – the one Windows activated after the app ended –
// would stay under it after its click.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace RegulatedDay
{
    public class OwnerForm : Form
    {
        public readonly Label Text1 = new Label();
        public readonly FlowLayoutPanel Buttons = new FlowLayoutPanel();

        public OwnerForm(string title)
        {
            Text = title;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            ShowInTaskbar = true;
            TopMost = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(440, 120);
            BackColor = Color.FromArgb(0x2B, 0x23, 0x2E);
            ForeColor = Color.FromArgb(0xEE, 0xE3, 0xD6);
            Font = new Font("Segoe UI", 10f);
            Text1.Dock = DockStyle.Fill;
            Text1.Padding = new Padding(16, 12, 16, 4);
            Buttons.Dock = DockStyle.Bottom;
            Buttons.Height = 44;
            Buttons.FlowDirection = FlowDirection.RightToLeft;
            Buttons.Padding = new Padding(8);
            Controls.Add(Text1);
            Controls.Add(Buttons);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        }

        /// <summary>Shown first by SW_SHOWNOACTIVATE (never SW_SHOW / SW_SHOWNORMAL / SW_SHOWDEFAULT – Node's STARTUPINFO).</summary>
        protected override bool ShowWithoutActivation { get { return true; } }

        public Button AddButton(string text, Action click)
        {
            Button b = new Button();
            b.Text = text;
            b.AutoSize = true;
            b.FlatStyle = FlatStyle.Flat;
            b.ForeColor = Color.FromArgb(0xF2, 0xB6, 0x6D);
            b.Click += delegate { click(); };
            Buttons.Controls.Add(b);
            return b;
        }
    }

    public class OwnerUi
    {
        public const string WindowTitle = "Regulated Day – aktualizacja";
        readonly Owner owner;
        Control marshal;
        OwnerForm progress;
        NotifyIcon icon;
        readonly ManualResetEvent ready = new ManualResetEvent(false);
        readonly DateTime since = DateTime.Now;
        /// <summary>The owner's windows shown now (the windows' thread only).</summary>
        readonly List<OwnerForm> shown = new List<OwnerForm>();
        IntPtr mouseHook = IntPtr.Zero;
        LowLevelMouseProc mouseProc;

        public OwnerUi(Owner owner)
        {
            this.owner = owner;
            Thread t = new Thread(Run);
            t.SetApartmentState(ApartmentState.STA);
            t.IsBackground = true;
            t.Name = "okna";
            t.Start();
            ready.WaitOne(10000);
        }

        void Run()
        {
            Application.EnableVisualStyles();
            marshal = new Control();
            marshal.CreateControl();
            IntPtr h = marshal.Handle;
            GC.KeepAlive(h);
            ready.Set();
            Application.Run();
        }

        void Do(Action a)
        {
            if (marshal == null) { Log.Warn("okna: wątek okien nie wystartował"); return; }
            try { marshal.BeginInvoke(Guarded(a)); } catch (Exception e) { Log.Warn("okna: " + e.Message); }
        }

        void DoAndWait(Action a)
        {
            if (marshal == null) { Log.Warn("okna: wątek okien nie wystartował"); return; }
            try { marshal.Invoke(Guarded(a)); } catch (Exception e) { Log.Warn("okna: " + e.Message); }
        }

        /// <summary>An exception on the windows' thread goes to the log (never WinForms' error window, never lost).</summary>
        static MethodInvoker Guarded(Action a)
        {
            return delegate
            {
                try { a(); } catch (Exception e) { Log.Warn("okna: " + e); }
            };
        }

        string Version { get { return owner.Task != null ? owner.Task.Version : "?"; } }

        /// <summary>Shows a window of the owner without activation; the mouse hook works while any of them is shown.</summary>
        void ShowTracked(OwnerForm f)
        {
            shown.Add(f);
            f.FormClosed += delegate
            {
                shown.Remove(f);
                if (shown.Count == 0 && mouseHook != IntPtr.Zero)
                {
                    Native.UnhookWindowsHookEx(mouseHook);
                    mouseHook = IntPtr.Zero;
                }
            };
            if (mouseHook == IntPtr.Zero)
            {
                // Kept in a field: the hook calls it for as long as it is set.
                mouseProc = OnMouse;
                mouseHook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, mouseProc, Native.GetModuleHandle(null), 0);
                if (mouseHook == IntPtr.Zero) Log.Warn("hak myszy nie ustawiony (błąd " + Marshal.GetLastWin32Error() + ") – kliknięte okno nie zasłoni okna aktualizacji");
            }
            f.Show();
        }

        /// <summary>Only reads where a button was pressed; the rest is done after the press reached its window.</summary>
        IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                long m = wParam.ToInt64();
                if (m == Native.WM_LBUTTONDOWN || m == Native.WM_RBUTTONDOWN || m == Native.WM_MBUTTONDOWN)
                {
                    POINT pt = ((MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT))).pt;
                    Do(delegate { LowerUnder(pt); });
                }
            }
            return Native.CallNextHookEx(mouseHook, code, wParam, lParam);
        }

        /// <summary>
        /// The shown windows lying above the window pressed at `pt` go right under it – never under the taskbar, the desktop
        /// or an always-on-top window (ours would become one), and nothing moves when one of ours is pressed.
        /// </summary>
        void LowerUnder(POINT pt)
        {
            IntPtr target = Native.GetAncestor(Native.WindowFromPoint(pt), Native.GA_ROOT);
            if (target == IntPtr.Zero || Native.IsTopmost(target)) return;
            string cls = Native.ClassOf(target);
            if (WindowOrder.IsDesktopClass(cls) || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return;
            foreach (OwnerForm f in shown) if (f.Handle == target) return;
            foreach (OwnerForm f in shown.ToArray())
            {
                if (!Above(f.Handle, target)) continue;
                if (Native.SetWindowPos(f.Handle, target, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_NOOWNERZORDER))
                    Log.Info("okno aktualizacji pod kliknięte okno " + cls);
                else
                    Log.Warn("okno aktualizacji pod kliknięte okno: błąd " + Marshal.GetLastWin32Error());
            }
        }

        /// <summary>`h` lies above `other` in the z-order.</summary>
        static bool Above(IntPtr h, IntPtr other)
        {
            for (IntPtr w = Native.GetWindow(h, Native.GW_HWNDNEXT); w != IntPtr.Zero; w = Native.GetWindow(w, Native.GW_HWNDNEXT))
                if (w == other) return true;
            return false;
        }

        /// <summary>The progress of the installation (the install helper's window; the guard's icon and, by hand, its window).</summary>
        public void Progress(string text, bool night)
        {
            Do(delegate()
            {
                if (owner.Role == "guard")
                {
                    EnsureIcon();
                    icon.Text = Trim("Trwa aktualizacja do " + Version + " od " + since.ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture));
                    if (owner.StartedByHand && !Plan.QuietNow(System.IO.Path.GetFullPath(System.IO.Path.Combine(owner.Task.Dir, "..", "..")))) ShowStatus(text);
                    return;
                }
                if (progress == null)
                {
                    progress = new OwnerForm(WindowTitle);
                    IntPtr h = progress.Handle;
                    if (night)
                    {
                        string why;
                        if (!WindowOrder.LayAboveDesktop(h, out why)) Log.Warn("okno postępu: nie udało się położyć pod oknami – " + why);
                    }
                    ShowTracked(progress);
                    Log.Info("okno postępu: " + (Native.IsWindowVisible(h) ? "widoczne" : "niewidoczne") + " (hwnd " + h.ToInt64() + ")");
                }
                progress.Text1.Text = text;
            });
        }

        void ShowStatus(string text)
        {
            if (progress == null)
            {
                progress = new OwnerForm(WindowTitle);
                progress.AddButton("Uruchom mimo to", delegate { owner.RunAnyway(); });
                ShowTracked(progress);
                Log.Info("okno stanu: " + (Native.IsWindowVisible(progress.Handle) ? "widoczne" : "niewidoczne"));
            }
            progress.Text1.Text = "Trwa aktualizacja do " + Version + " od " + since.ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture) + ". " + text;
        }

        static string Trim(string s)
        {
            return s.Length > 63 ? s.Substring(0, 63) : s;
        }

        void EnsureIcon()
        {
            if (icon != null) return;
            icon = new NotifyIcon();
            icon.Icon = WithDot();
            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Uruchom mimo to", delegate { owner.RunAnyway(); });
            icon.ContextMenu = menu;
            icon.MouseClick += delegate(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) ShowStatus("Kliknij „Uruchom mimo to”, żeby nie czekać."); };
            icon.Visible = true;
        }

        /// <summary>The app's icon with a dot (something stands): the guard's icon in the tray.</summary>
        static Icon WithDot()
        {
            Bitmap bmp = new Bitmap(16, 16);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                try { using (Icon app = Icon.ExtractAssociatedIcon(Application.ExecutablePath)) g.DrawIcon(app, new Rectangle(0, 0, 16, 16)); } catch { }
                g.FillEllipse(new SolidBrush(Color.FromArgb(0x21, 0x1B, 0x23)), 9, 0, 7, 7);
                g.FillEllipse(new SolidBrush(Color.FromArgb(0xEE, 0xE3, 0xD6)), 10, 1, 5, 5);
            }
            return Icon.FromHandle(bmp.GetHicon());
        }

        /// <summary>„Aktualizacja do X nie udała się · Spróbuj ponownie · Pobierz”: waits until the window is closed.</summary>
        public void Failed(string version)
        {
            ManualResetEvent closed = new ManualResetEvent(false);
            DoAndWait(delegate()
            {
                if (progress != null) { progress.Close(); progress = null; }
                OwnerForm f = new OwnerForm(WindowTitle);
                f.Text1.Text = "Aktualizacja do " + version + " nie udała się.";
                f.AddButton("Pobierz", delegate
                {
                    try { Process.Start("https://github.com/Clatir/RegulatedDay/releases/latest"); } catch (Exception e) { Log.Warn("Pobierz: " + e.Message); }
                    f.Close();
                });
                f.AddButton("Spróbuj ponownie", delegate
                {
                    Retry();
                    f.Close();
                });
                f.FormClosed += delegate { closed.Set(); };
                ShowTracked(f);
            });
            if (Environment.GetEnvironmentVariable("RD_TEST_NO_WAIT_WINDOWS") == "1") return;
            closed.WaitOne(TimeSpan.FromHours(12));
        }

        /// <summary>„Spróbuj ponownie”: a new task file with the counters from zero, and a new owner for it.</summary>
        void Retry()
        {
            try
            {
                owner.Task.Reload();
                owner.Task.NewAttempt();
                owner.Task.Save();
                RunEntry.Set(System.IO.Path.Combine(owner.Task.Dir, "rd-guard.exe"));
                string exe = System.IO.Path.Combine(owner.Task.Dir, owner.Role == "guard" ? "rd-guard.exe" : "rd-install.exe");
                Launch.Detached(exe, "--task " + Launch.Quote(owner.Task.Path), owner.Task.Dir);
                Log.Info("„Spróbuj ponownie”: nowa próba " + owner.Task.AttemptId);
            }
            catch (Exception e) { Log.Error("„Spróbuj ponownie” nie udało się: " + e.Message); }
        }

        /// <summary>The new version did not confirm its start: „Uruchom ręcznie”.</summary>
        public void StartByHand(string exe)
        {
            ManualResetEvent closed = new ManualResetEvent(false);
            DoAndWait(delegate()
            {
                if (progress != null) { progress.Close(); progress = null; }
                OwnerForm f = new OwnerForm(WindowTitle);
                f.Text1.Text = "Nowa wersja nie uruchomiła się sama.";
                f.AddButton("Uruchom ręcznie", delegate
                {
                    try { Launch.Detached(exe, "", System.IO.Path.GetDirectoryName(exe)); } catch (Exception e) { Log.Warn("Uruchom ręcznie: " + e.Message); }
                    f.Close();
                });
                f.FormClosed += delegate { closed.Set(); };
                ShowTracked(f);
            });
            if (Environment.GetEnvironmentVariable("RD_TEST_NO_WAIT_WINDOWS") == "1") return;
            closed.WaitOne(TimeSpan.FromHours(12));
        }

        public void Close()
        {
            DoAndWait(delegate()
            {
                if (progress != null) { progress.Close(); progress = null; }
                if (icon != null) { icon.Visible = false; icon.Dispose(); icon = null; }
            });
        }
    }
}
