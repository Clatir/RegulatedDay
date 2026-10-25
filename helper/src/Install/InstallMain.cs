// rd-install.exe – the install helper (spec „Instalacja, aktualizacje i log”): the owner of an installation at the exit,
// „Zainstaluj teraz” and at night. Started by the app as a detached process before it quits; it waits for the app's
// process to end, then owns the installation like the guard does (Owner), with its progress window.
using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Threading;

[assembly: AssemblyTitle("Regulated Day – aktualizacja")]
[assembly: AssemblyProduct("Regulated Day")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace RegulatedDay
{
    public static class InstallMain
    {
        [STAThread]
        public static int Main(string[] args)
        {
            Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
            Thread.CurrentThread.CurrentUICulture = CultureInfo.InvariantCulture;
            CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
            CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.InvariantCulture;
            Native.PerMonitorDpi();
            Native.SetErrorMode(0x0002 | 0x0001);
            string exe = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
            OwnerArgs oa = OwnerArgs.Parse(args, Path.Combine(Path.GetDirectoryName(exe), "task.json"));
            return new Owner("install", oa).Run();
        }
    }
}
