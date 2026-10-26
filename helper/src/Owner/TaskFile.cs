// The task file of an installation (update\<X>\task.json, format 1 – src/shared/task.ts is the same in TypeScript).
// Fields this program does not know are kept when it writes the file.
using System;
using System.Collections.Generic;
using System.IO;

namespace RegulatedDay
{
    public class TaskFile
    {
        public const int Format = 1;
        public readonly string Path;
        public Dictionary<string, object> Data;

        TaskFile(string path, Dictionary<string, object> data)
        {
            Path = path;
            Data = data;
        }

        /// <summary>The task; null = no file. Throws on an unreadable file or an unknown format.</summary>
        public static TaskFile Load(string path)
        {
            string text = SharedFile.Read(path);
            return text == null ? null : FromText(path, text);
        }

        /// <summary>The task from its text (the self-test uses it without a file).</summary>
        public static TaskFile FromText(string path, string text)
        {
            Dictionary<string, object> o = Json.ParseObject(text);
            if (Json.Long(o, "format", -1) != Format) throw new InvalidDataException("nieznany format pliku zadania");
            if (Json.Str(o, "version") == null || Json.Str(o, "state") == null) throw new InvalidDataException("plik zadania bez wersji albo stanu");
            return new TaskFile(path, o);
        }

        public string Dir { get { return System.IO.Path.GetDirectoryName(Path); } }
        public string Version { get { return Json.Str(Data, "version"); } }
        public string AttemptId { get { return Json.Str(Data, "attemptId") ?? ""; } }
        public string State { get { return Json.Str(Data, "state"); } }
        public string Trigger { get { return Json.Str(Data, "trigger") ?? "exit"; } }
        public string Start { get { return Json.Str(Data, "start") ?? "none"; } }
        public string Url { get { return Json.Str(Data, "url"); } }
        public bool Autostart { get { return Json.Bool(Data, "autostart", false); } }
        public string Guid { get { return Json.Str(Data, "guid") ?? ""; } }
        public string UninstallKey { get { return Json.Str(Data, "uninstallKey") ?? Install.UninstallKey(Guid); } }
        public string InstallDir { get { return Json.Str(Data, "installDir") ?? ""; } }
        public string AppExe { get { return Json.Str(Data, "appExe") ?? ""; } }
        public string Installer { get { return System.IO.Path.Combine(Dir, Json.Str(Data, "installer") ?? "Regulated-Day-Setup.exe"); } }
        public string ManifestPath { get { return System.IO.Path.Combine(Dir, Json.Str(Data, "manifest") ?? "Regulated-Day-manifest.json"); } }
        public long Attempts { get { return Json.Long(Data, "attempts", 0); } }
        public long Starts { get { return Json.Long(Data, "starts", 0); } }
        public bool InstallerStarted { get { return Json.Has(Data, "installerStartedAt"); } }

        public void Set(string key, object value)
        {
            Data[key] = value;
        }

        /// <summary>Writes the task (updatedAt now); RD_TEST_TASK_WRITE_FAIL=1 makes the write fail (CI).</summary>
        public void Save()
        {
            if (Environment.GetEnvironmentVariable("RD_TEST_TASK_WRITE_FAIL") == "1") throw new IOException("RD_TEST_TASK_WRITE_FAIL: zapis pliku zadania nie udał się");
            Data["updatedAt"] = Native.NowMs();
            SharedFile.Write(Path, Json.WritePretty(Data));
        }

        public void Reload()
        {
            TaskFile again = Load(Path);
            if (again != null) Data = again.Data;
        }

        /// <summary>A new attempt („Spróbuj ponownie”): the same release, counters from zero, a new id.</summary>
        public void NewAttempt()
        {
            Data["attemptId"] = System.Guid.NewGuid().ToString("N").Substring(0, 16);
            Data["attempts"] = 0L;
            Data["starts"] = 0L;
            Data["cleanEnd"] = true;
            Data["installerStartedAt"] = null;
            Data["state"] = "scheduled";
            Data["message"] = null;
        }
    }
}
