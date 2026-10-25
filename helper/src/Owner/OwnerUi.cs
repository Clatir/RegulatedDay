// The windows of the owner of an installation (spec „Instalacja, aktualizacje i log”, D229, D257). They never take the
// focus: shown without activation (SW_SHOWNOACTIVATE through ShowWithoutActivation, never WS_EX_NOACTIVATE, so a click of
// the window or its taskbar button raises it), with a taskbar button, never always on top. The install helper's progress
// window is created only after the app's process ended; at night the install helper lays it under the windows first.
// The guard shows its icon in the tray („Trwa aktualizacja do X od 03:12 · Uruchom mimo to”) and a small window only
// when the start was made by hand – never from the autostart, and never during a session or a class or 30 min before.
using System;
using System.Diagnostics;
using System.Drawing;
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
            if (marshal == null) return;
            try { marshal.BeginInvoke(a); } catch (Exception e) { Log.Warn("okna: " + e.Message); }
        }

        void DoAndWait(Action a)
        {
            if (marshal == null) return;
            try { marshal.Invoke(a); } catch (Exception e) { Log.Warn("okna: " + e.Message); }
        }

        string Version { get { return owner.Task != null ? owner.Task.Version : "?"; } }

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
                    progress.Show();
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
                progress.Show();
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
                f.Show();
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
                f.Show();
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
