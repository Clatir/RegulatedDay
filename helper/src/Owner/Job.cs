// Starting processes for the owner of an installation (spec „Instalacja, aktualizacje i log”): the installer starts
// suspended (CREATE_SUSPENDED), joins the owner's job object (KILL_ON_JOB_CLOSE – closing the job ends the installer and
// the old uninstaller it runs) and only then goes on. The app is started outside that job, so it never inherits it.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace RegulatedDay
{
    public class InstallerJob : IDisposable
    {
        IntPtr job = IntPtr.Zero;
        public int Pid;
        IntPtr process = IntPtr.Zero;
        bool inJob;

        public InstallerJob()
        {
            job = Native.CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) return;
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = Native.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if (!Native.SetInformationJobObject(job, Native.JobObjectExtendedLimitInformation, ref info, Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
                Log.Warn("obiekt zadania: SetInformationJobObject nie udało się, błąd " + Marshal.GetLastWin32Error());
        }

        /// <summary>Starts the installer suspended, puts it in the job, resumes it.</summary>
        public void Start(string exe, string args, string dir)
        {
            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
            PROCESS_INFORMATION pi;
            StringBuilder cmd = new StringBuilder("\"" + exe + "\" " + args);
            if (!Native.CreateProcess(exe, cmd, IntPtr.Zero, IntPtr.Zero, false, Native.CREATE_SUSPENDED | Native.CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, dir, ref si, out pi))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcess " + exe);
            process = pi.hProcess;
            Pid = pi.dwProcessId;
            inJob = job != IntPtr.Zero && Native.AssignProcessToJobObject(job, pi.hProcess);
            if (!inJob) Log.Warn("instalator poza obiektem zadania (błąd " + Marshal.GetLastWin32Error() + ") – przerwanie zamknie drzewo procesów po identyfikatorze");
            Native.ResumeThread(pi.hThread);
            Native.CloseHandle(pi.hThread);
        }

        /// <summary>Waits up to `ms` (real time) for the installer's end; true = ended.</summary>
        public bool Wait(int ms)
        {
            return process != IntPtr.Zero && Native.WaitForSingleObject(process, (uint)ms) == Native.WAIT_OBJECT_0;
        }

        public uint ExitCode
        {
            get
            {
                uint code;
                return process != IntPtr.Zero && Native.GetExitCodeProcess(process, out code) ? code : uint.MaxValue;
            }
        }

        /// <summary>Ends the installer and everything it started (the job; without it the tree by the process id).</summary>
        public void Kill()
        {
            if (inJob) Native.TerminateJobObject(job, 1);
            else if (Pid != 0)
            {
                ProcessStartInfo psi = new ProcessStartInfo(System.IO.Path.Combine(Environment.SystemDirectory, "taskkill.exe"), "/F /T /PID " + Pid);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                try { using (Process p = Process.Start(psi)) p.WaitForExit(10000); } catch (Exception e) { Log.Warn("taskkill: " + e.Message); }
            }
        }

        public void Dispose()
        {
            if (process != IntPtr.Zero) Native.CloseHandle(process);
            process = IntPtr.Zero;
            // KILL_ON_JOB_CLOSE: closing the job ends what is still in it.
            if (job != IntPtr.Zero) Native.CloseHandle(job);
            job = IntPtr.Zero;
        }
    }

    public static class Launch
    {
        /// <summary>Starts a program detached (a new process group, no console), outside every job of the owner.</summary>
        public static int Detached(string exe, string args, string dir)
        {
            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
            PROCESS_INFORMATION pi;
            StringBuilder cmd = new StringBuilder("\"" + exe + "\"" + (string.IsNullOrEmpty(args) ? "" : " " + args));
            uint flags = Native.CREATE_NEW_PROCESS_GROUP | Native.CREATE_UNICODE_ENVIRONMENT;
            if (!Native.CreateProcess(exe, cmd, IntPtr.Zero, IntPtr.Zero, false, flags | Native.CREATE_BREAKAWAY_FROM_JOB, IntPtr.Zero, dir, ref si, out pi)
                && !Native.CreateProcess(exe, cmd, IntPtr.Zero, IntPtr.Zero, false, flags, IntPtr.Zero, dir, ref si, out pi))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcess " + exe);
            Native.CloseHandle(pi.hThread);
            Native.CloseHandle(pi.hProcess);
            return pi.dwProcessId;
        }

        /// <summary>Quotes an argument for a command line (Windows rules for backslashes before quotes).</summary>
        public static string Quote(string a)
        {
            if (a.Length > 0 && a.IndexOfAny(new char[] { ' ', '\t', '"' }) < 0) return a;
            StringBuilder sb = new StringBuilder("\"");
            int slashes = 0;
            foreach (char c in a)
            {
                if (c == '\\') { slashes++; continue; }
                if (c == '"') sb.Append('\\', slashes * 2 + 1);
                else sb.Append('\\', slashes);
                slashes = 0;
                sb.Append(c);
            }
            sb.Append('\\', slashes * 2);
            sb.Append('"');
            return sb.ToString();
        }
    }

    public static class InstallerMutex
    {
        /// <summary>The installer's mutex (named by nsis.guid) exists – only opened and closed, never created or waited on.</summary>
        public static bool Exists(string guid)
        {
            IntPtr h = Native.OpenMutex(Native.SYNCHRONIZE_ACCESS, false, guid);
            if (h == IntPtr.Zero) return false;
            Native.CloseHandle(h);
            return true;
        }
    }
}
