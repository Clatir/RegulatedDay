/**
 * Win32 for the Windows E2E tests (the tests may use any tool; the app never reads tools' text): the top-level windows
 * in z-order, the window at a point, the windows covering one minimized (CI's console may lie over the desktop bar), the
 * cursor moved by SendInput (a real move – tooltips and hover need it), the foreground window. Runs a small C# through
 * PowerShell's Add-Type; each call answers JSON.
 */
import { spawnSync } from 'node:child_process'

const CS = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class RdWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  // Exactly Win32's INPUT (40 B on x64, 28 B on x86): MOUSEINPUT is the union's largest member. Any other size and
  // SendInput refuses the call (ERROR_INVALID_PARAMETER) – no move, no click.
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int cmd);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  /** A JSON string's content: quotes, backslashes and control characters escaped (titles stay as they are). */
  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (var ch in s) {
      if (ch == '"' || ch == '\\\\') { b.Append('\\\\'); b.Append(ch); }
      else if (ch < ' ') b.Append("\\\\u" + ((int)ch).ToString("x4"));
      else b.Append(ch);
    }
    return b.ToString();
  }
  public static string Windows() {
    SetProcessDPIAware();
    var sb = new StringBuilder("[");
    bool first = true;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      RECT r; GetWindowRect(h, out r);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      if (!first) sb.Append(","); first = false;
      sb.Append("{\\"hwnd\\":\\"" + h.ToInt64() + "\\",\\"pid\\":" + pid + ",\\"visible\\":" + (IsWindowVisible(h) ? "true" : "false") + ",\\"cls\\":\\"" + Esc(c.ToString()) + "\\",\\"title\\":\\"" + Esc(t.ToString()) + "\\",\\"rect\\":[" + r.L + "," + r.T + "," + r.R + "," + r.B + "]}");
      return true;
    }, IntPtr.Zero);
    return sb.Append("]").ToString();
  }
  public static string Foreground() { return GetForegroundWindow().ToInt64().ToString(); }
  /** The top-level window at (x, y) in physical pixels. */
  public static string At(int x, int y) {
    SetProcessDPIAware();
    POINT p; p.X = x; p.Y = y;
    return GetAncestor(WindowFromPoint(p), 2).ToInt64().ToString();
  }
  /**
   * Minimizes without activation (SW_SHOWMINNOACTIVE) every shown window above \`target\` in the z-order that overlaps it
   * and can be minimized – never the taskbar or the desktop. Answers the classes minimized and those left.
   */
  public static string Uncover(long target) {
    SetProcessDPIAware();
    IntPtr t = new IntPtr(target);
    RECT tr; GetWindowRect(t, out tr);
    var sb = new StringBuilder("[");
    bool first = true;
    EnumWindows((h, l) => {
      if (h == t) return false;
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      RECT r; GetWindowRect(h, out r);
      if (r.R <= tr.L || r.L >= tr.R || r.B <= tr.T || r.T >= tr.B) return true;
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      string cls = c.ToString();
      if (cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" || cls == "Progman" || cls == "WorkerW") return true;
      bool minimizable = (GetWindowLong(h, -16) & 0x00020000) != 0;
      if (minimizable) ShowWindowAsync(h, 7);
      if (!first) sb.Append(","); first = false;
      sb.Append("\\"" + (minimizable ? "zminimalizowane " : "zostawione ") + Esc(cls) + "\\"");
      return true;
    }, IntPtr.Zero);
    return sb.Append("]").ToString();
  }
  static void Send(INPUT[] inputs) {
    uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent != inputs.Length) throw new Exception("SendInput: sent " + sent + " of " + inputs.Length + ", error " + Marshal.GetLastWin32Error());
  }
  /** A real move of the cursor to (x, y) in physical pixels (absolute SendInput over the virtual screen); throws unless it is there. */
  public static void Move(int x, int y) {
    SetProcessDPIAware();
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77), vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);
    var i = new INPUT(); i.type = 0;
    i.mi.dx = (int)Math.Round((x - vx) * 65535.0 / (vw - 1)); i.mi.dy = (int)Math.Round((y - vy) * 65535.0 / (vh - 1));
    i.mi.flags = 0x0001 | 0x8000 | 0x4000;
    Send(new INPUT[] { i });
    POINT p = new POINT();
    for (int t = 0; t < 50; t++) {
      GetCursorPos(out p);
      if (Math.Abs(p.X - x) <= 2 && Math.Abs(p.Y - y) <= 2) return;
      System.Threading.Thread.Sleep(10);
    }
    throw new Exception("cursor at (" + p.X + ", " + p.Y + ") instead of (" + x + ", " + y + ")");
  }
  public static void Click(int x, int y) {
    Move(x, y);
    var down = new INPUT(); down.type = 0; down.mi.flags = 0x0002;
    var up = new INPUT(); up.type = 0; up.mi.flags = 0x0004;
    Send(new INPUT[] { down, up });
  }
  /** A real drag: the left button down at (x1, y1), the cursor in \`steps\` moves to (x2, y2) \`stepMs\` apart, up there. */
  public static void Drag(int x1, int y1, int x2, int y2, int steps, int stepMs) {
    Move(x1, y1);
    var down = new INPUT(); down.type = 0; down.mi.flags = 0x0002;
    var up = new INPUT(); up.type = 0; up.mi.flags = 0x0004;
    Send(new INPUT[] { down });
    System.Threading.Thread.Sleep(stepMs);
    for (int i = 1; i <= steps; i++) {
      Move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
      System.Threading.Thread.Sleep(stepMs);
    }
    Send(new INPUT[] { up });
  }
}
`

/** UTF-8 output: PowerShell 5.1 writes the OEM code page otherwise („Regulated Day – aktualizacja” loses its „–”). */
const UTF8_OUT = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; '

/**
 * The start of a PowerShell script with [RdWin] loaded (also for the tests' own scripts that wait and then click); an
 * error – a refused SendInput – ends it with exit code 1 instead of letting it go on.
 */
export const RDWIN_PRELUDE = `$ErrorActionPreference = 'Stop'; ${UTF8_OUT}Add-Type -TypeDefinition @'\n${CS}\n'@ -Language CSharp`

function ps(call: string): string {
  const script = `${RDWIN_PRELUDE}; ${call}`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60_000 })
  if (r.status !== 0) throw new Error(`Win32: ${r.stderr}`)
  return (r.stdout ?? '').trim()
}

export interface TopWindow {
  hwnd: string
  pid: number
  visible: boolean
  cls: string
  title: string
  rect: [number, number, number, number]
}

/** Every top-level window, from the top of the z-order down. */
export const topWindows = (): TopWindow[] => JSON.parse(ps('[RdWin]::Windows()')) as TopWindow[]
export const foreground = (): string => ps('[RdWin]::Foreground()')
/** The top-level window at each point (physical px); one PowerShell for all. */
export const windowsAt = (points: Array<[number, number]>): string[] =>
  ps(points.map(([x, y]) => `[RdWin]::At(${Math.round(x)}, ${Math.round(y)})`).join('; '))
    .split(/\r?\n/)
    .map((s) => s.trim())
/** The windows covering `hwnd` minimized without activation (the taskbar and the desktop never); what was done. */
export const uncover = (hwnd: string): string[] => JSON.parse(ps(`[RdWin]::Uncover(${hwnd})`)) as string[]
/** Moves the cursor along points (physical px), staying `dwellMs` on each; one PowerShell for the whole walk. */
export function hover(points: Array<[number, number]>, dwellMs: number): void {
  ps(points.map(([x, y]) => `[RdWin]::Move(${Math.round(x)}, ${Math.round(y)}); Start-Sleep -Milliseconds ${dwellMs}`).join('; '))
}
export function click(x: number, y: number): void {
  ps(`[RdWin]::Click(${Math.round(x)}, ${Math.round(y)})`)
}
/** A real drag with the left button (physical px): down at `from`, `steps` moves `stepMs` apart, up at `to`. */
export function drag(from: [number, number], to: [number, number], steps = 24, stepMs = 25): void {
  ps(`[RdWin]::Drag(${Math.round(from[0])}, ${Math.round(from[1])}, ${Math.round(to[0])}, ${Math.round(to[1])}, ${steps}, ${stepMs})`)
}

/** The rectangle of a taskbar button found by UI Automation by a word of its name; null = no such button. */
export function taskbarButton(word: string): { x: number; y: number; width: number; height: number; name: string } | null {
  const script = `${UTF8_OUT}
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cls = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd')
$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cls)
if (-not $tray) { 'null'; exit }
$btn = [System.Windows.Automation.ControlType]::Button
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $btn)
$found = $null
foreach ($b in $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) { if ($b.Current.Name -like '*${word}*') { $found = $b; break } }
if (-not $found) { 'null'; exit }
$r = $found.Current.BoundingRectangle
@{ x = $r.X; y = $r.Y; width = $r.Width; height = $r.Height; name = $found.Current.Name } | ConvertTo-Json -Compress`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60_000 })
  const out = (r.stdout ?? '').trim()
  return out && out !== 'null' ? (JSON.parse(out) as { x: number; y: number; width: number; height: number; name: string }) : null
}
