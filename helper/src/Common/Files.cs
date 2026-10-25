// The files shared by the app, the helper, the guard and the install helper (spec „Instalacja, aktualizacje i log”):
// written through a temporary file and a rename with POSIX semantics (MoveFileEx with replacing and write-through where
// the system lacks it, retried up to 2 s – a plain replace fails while someone reads the file), opened for reading with
// sharing of writing and deleting; a reader retries a busy file 3 times within 1 s, and a missing file means none.
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace RegulatedDay
{
    public static class SharedFile
    {
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

        /// <summary>The text of a shared file; null = none. A busy file is read again 3 times within 1 s, then throws.</summary>
        public static string Read(string path)
        {
            for (int attempt = 0; ; attempt++)
            {
                try
                {
                    using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (StreamReader r = new StreamReader(fs, Utf8, true))
                        return r.ReadToEnd();
                }
                catch (FileNotFoundException) { return null; }
                catch (DirectoryNotFoundException) { return null; }
                catch (IOException)
                {
                    if (attempt >= 3) throw;
                    Thread.Sleep(250);
                }
                catch (UnauthorizedAccessException)
                {
                    if (attempt >= 3) throw;
                    Thread.Sleep(250);
                }
            }
        }

        /// <summary>Writes the text atomically: a temporary file beside it, flushed to the disk, renamed over the target.</summary>
        public static void Write(string path, string text)
        {
            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            string tmp = Path.Combine(dir ?? ".", "." + Path.GetFileName(path) + ".tmp-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            byte[] bytes = Utf8.GetBytes(text);
            using (FileStream fs = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                fs.Write(bytes, 0, bytes.Length);
                fs.Flush(true);
            }
            try
            {
                Replace(tmp, path);
            }
            catch
            {
                try { File.Delete(tmp); } catch { }
                throw;
            }
        }

        static void Replace(string tmp, string path)
        {
            DateTime until = DateTime.UtcNow.AddSeconds(2);
            while (true)
            {
                if (PosixRename(tmp, path)) return;
                if (Native.MoveFileEx(tmp, path, Native.MOVEFILE_REPLACE_EXISTING | Native.MOVEFILE_WRITE_THROUGH)) return;
                int err = Marshal.GetLastWin32Error();
                if (DateTime.UtcNow > until) throw new Win32Exception(err, "Nie udało się zamienić pliku " + path);
                Thread.Sleep(50);
            }
        }

        /// <summary>The rename with POSIX semantics (Windows 10 1709+): it succeeds while readers keep the target open.</summary>
        static bool PosixRename(string from, string to)
        {
            try
            {
                using (Microsoft.Win32.SafeHandles.SafeFileHandle fs = Native.CreateFile(from, Native.DELETE_ACCESS | Native.SYNCHRONIZE_ACCESS, 7, IntPtr.Zero, 3, 0, IntPtr.Zero))
                {
                    if (fs.IsInvalid) return false;
                    byte[] name = Encoding.Unicode.GetBytes(to);
                    int size = Marshal.SizeOf(typeof(FILE_RENAME_INFO_EX)) + name.Length + 2;
                    IntPtr buf = Marshal.AllocHGlobal(size);
                    try
                    {
                        for (int k = 0; k < size; k++) Marshal.WriteByte(buf, k, 0);
                        FILE_RENAME_INFO_EX info = new FILE_RENAME_INFO_EX();
                        info.Flags = Native.FILE_RENAME_FLAG_REPLACE_IF_EXISTS | Native.FILE_RENAME_FLAG_POSIX_SEMANTICS;
                        info.RootDirectory = IntPtr.Zero;
                        info.FileNameLength = (uint)name.Length;
                        Marshal.StructureToPtr(info, buf, false);
                        Marshal.Copy(name, 0, IntPtr.Add(buf, Marshal.OffsetOf(typeof(FILE_RENAME_INFO_EX), "FileNameLength").ToInt32() + 4), name.Length);
                        return Native.SetFileInformationByHandle(fs, Native.FileRenameInfoEx, buf, (uint)size);
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(buf);
                    }
                }
            }
            catch (IOException) { return false; }
            catch (UnauthorizedAccessException) { return false; }
        }
    }

    /// <summary>A plain log file of a program (helper.log, guard.log, install.log): UTC times, invariant culture, never throws.</summary>
    public static class Log
    {
        static string file;
        static readonly object Gate = new object();

        public static void Init(string path)
        {
            file = path;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                FileInfo fi = new FileInfo(path);
                if (fi.Exists && fi.Length > 1024 * 1024) File.Copy(path, Path.ChangeExtension(path, ".old.log"), true);
                if (fi.Exists && fi.Length > 1024 * 1024) File.WriteAllText(path, "");
            }
            catch { }
        }

        public static void Line(string level, string message)
        {
            if (file == null) return;
            string line = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture) + " " + level + " " + message + "\n";
            lock (Gate)
            {
                for (int i = 0; i < 20; i++)
                {
                    try { File.AppendAllText(file, line, new UTF8Encoding(false)); return; }
                    catch { Thread.Sleep(50); }
                }
            }
        }

        public static void Info(string m) { Line("INFO", m); }
        public static void Warn(string m) { Line("WARN", m); }
        public static void Error(string m) { Line("ERROR", m); }
    }

    /// <summary>
    /// The time the computer was awake (spec: one way in the helper, the guard and the install helper): a sum of ticks every
    /// 1 s in which a gap over 5 s does not count – QueryUnbiasedInterruptTime counts modern standby too (T318).
    /// </summary>
    public class AwakeClock
    {
        long awakeMs;
        ulong last;
        readonly Timer timer;
        readonly object gate = new object();

        public AwakeClock()
        {
            // GetTickCount64 runs on through sleep: a gap over 5 s between two ticks is time asleep, never counted.
            last = Native.GetTickCount64();
            timer = new Timer(Tick, null, 1000, 1000);
        }

        void Tick(object state)
        {
            lock (gate)
            {
                ulong now = Native.GetTickCount64();
                ulong gap = now - last;
                last = now;
                if (gap <= 5000) awakeMs += (long)gap;
            }
        }

        public long AwakeMs
        {
            get { lock (gate) return awakeMs; }
        }
    }
}
