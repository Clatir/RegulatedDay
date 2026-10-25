/**
 * Win32 for the Windows E2E tests (the tests may use any tool; the app never reads tools' text): the top-level windows
 * in z-order, the cursor moved by SendInput (a real move – tooltips and hover need it), the foreground window. Runs a
 * small C# through PowerShell's Add-Type; each call answers JSON.
 */
import { spawnSync } from 'node:child_process'

const CS = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class RdWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; public int pad1, pad2; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
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
      sb.Append("{\\"hwnd\\":\\"" + h.ToInt64() + "\\",\\"pid\\":" + pid + ",\\"visible\\":" + (IsWindowVisible(h) ? "true" : "false") + ",\\"cls\\":\\"" + c.ToString().Replace("\\\\", "/").Replace("\\"", "'") + "\\",\\"title\\":\\"" + t.ToString().Replace("\\\\", "/").Replace("\\"", "'") + "\\",\\"rect\\":[" + r.L + "," + r.T + "," + r.R + "," + r.B + "]}");
      return true;
    }, IntPtr.Zero);
    return sb.Append("]").ToString();
  }
  public static string Foreground() { return GetForegroundWindow().ToInt64().ToString(); }
  /** A real move of the cursor to (x, y) in physical pixels (absolute SendInput over the virtual screen). */
  public static void Move(int x, int y) {
    SetProcessDPIAware();
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77), vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);
    var i = new INPUT(); i.type = 0;
    i.mi.dx = (int)((x - vx) * 65535.0 / (vw - 1)); i.mi.dy = (int)((y - vy) * 65535.0 / (vh - 1));
    i.mi.flags = 0x0001 | 0x8000 | 0x4000;
    SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Click(int x, int y) {
    Move(x, y);
    var down = new INPUT(); down.type = 0; down.mi.flags = 0x0002;
    var up = new INPUT(); up.type = 0; up.mi.flags = 0x0004;
    SendInput(2, new INPUT[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
  }
}
`

function ps(call: string): string {
  const script = `Add-Type -TypeDefinition @'\n${CS}\n'@ -Language CSharp; ${call}`
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
/** Moves the cursor along points (physical px), staying `dwellMs` on each; one PowerShell for the whole walk. */
export function hover(points: Array<[number, number]>, dwellMs: number): void {
  ps(points.map(([x, y]) => `[RdWin]::Move(${Math.round(x)}, ${Math.round(y)}); Start-Sleep -Milliseconds ${dwellMs}`).join('; '))
}
export function click(x: number, y: number): void {
  ps(`[RdWin]::Click(${Math.round(x)}, ${Math.round(y)})`)
}
