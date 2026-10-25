// The helper's self-test (spec „Testy”: CI runs it on a real Windows): what it reads of this session, and the layout of
// SYSTEM_POWER_CAPABILITIES – the CI machines report modern standby off, so only the layout can be checked there.
using System;
using System.IO;

namespace RegulatedDay
{
    public static class SelfTest
    {
        public static JObj Run(string identity, string aumid)
        {
            JObj r = new JObj();
            int raw;
            r.Set("notificationState", NotificationState.Read(out raw));
            r.Set("notificationRaw", raw);
            r.Set("toastSetting", ToastSetting.Read(aumid));
            r.Set("logonId", LogonSession.LogonId());
            bool? ms = PowerCaps.ModernStandby();
            r.Set("modernStandby", ms.HasValue ? (object)ms.Value : null);
            r.Set("powerCapabilities", PowerCaps.Layout());
            r.Set("oneDrive", OneDrive.Running());
            r.Set("shell", WindowOrder.ShellPresent());
            r.Set("culture", System.Globalization.CultureInfo.CurrentCulture.Name);
            r.Set("framework", Environment.Version.ToString());
            r.Set("cwd", Environment.CurrentDirectory);
            r.Set("identity", identity);
            return r;
        }
    }
}
