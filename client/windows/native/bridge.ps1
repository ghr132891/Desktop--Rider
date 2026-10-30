# Desktop Rider native bridge for Windows 10 / 11. Called by lib/native.js with
#   bridge.ps1 -Command monitors
#   bridge.ps1 -Command set-wallpaper -MonitorId <id> -Path <png>
#   bridge.ps1 -Command attach-layer -Hwnd <n> -Left <x> -Top <y> -Width <w> -Height <h>
#   bridge.ps1 -Command detach-layer -Hwnd <n>
#   bridge.ps1 -Command get-wallpaper -MonitorId <id>      (verification: current wallpaper file)
#   bridge.ps1 -Command layer-info -Hwnd <n>               (verification: parent class, visibility, screen rect)
# Prints one JSON document on stdout; any failure goes to stderr with exit code 1.
# Needs only Windows PowerShell 5.1 (present on every Win10/11) — the C# below is
# compiled in memory by Add-Type, no SDK required.
param(
  [Parameter(Mandatory=$true)][ValidateSet('monitors','set-wallpaper','attach-layer','detach-layer','get-wallpaper','layer-info')][string]$Command,
  [string]$MonitorId,[string]$Path,[long]$Hwnd=0,[int]$Left=0,[int]$Top=0,[int]$Width=0,[int]$Height=0
)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace DesktopRider {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  // Only the leading part of IDesktopWallpaper; vtable order must match the SDK (shobjidl_core.h).
  [ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IDesktopWallpaper {
    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
    uint GetMonitorDevicePathCount();
    RECT GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    void SetBackgroundColor(uint color);
    uint GetBackgroundColor();
    void SetPosition(int position);
    int GetPosition();
  }
  [ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")] public class DesktopWallpaperClass { }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct DISPLAY_DEVICE { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString; public uint StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName; public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public uint dmFields;
    public int dmPositionX, dmPositionY; public uint dmDisplayOrientation, dmDisplayFixedOutput; public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName; public ushort dmLogPixels; public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency, dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight; }
  public static class Api {
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string device, uint index, ref DISPLAY_DEVICE dd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE dm);
    [DllImport("user32.dll")] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder name, int max);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    // powershell.exe is system-DPI-aware by manifest, so the process context cannot be changed any
    // more; the thread context can (Win10 1607+) and makes SetWindowPos / GetSystemMetrics physical.
    public static void DpiAware() { try { if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero) SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } }
    // Physical geometry per device interface path, from the display mode itself — never DPI-virtualised.
    static Dictionary<string, int[]> Modes() {
      var map = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase);
      for (uint i = 0; ; i++) {
        var adapter = new DISPLAY_DEVICE(); adapter.cb = Marshal.SizeOf(adapter); if (!EnumDisplayDevices(null, i, ref adapter, 0)) break;
        if ((adapter.StateFlags & 1) == 0) continue; // DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
        var monitor = new DISPLAY_DEVICE(); monitor.cb = Marshal.SizeOf(monitor); if (!EnumDisplayDevices(adapter.DeviceName, 0, ref monitor, 1)) continue; // EDD_GET_DEVICE_INTERFACE_NAME
        var dm = new DEVMODE(); dm.dmSize = (ushort)Marshal.SizeOf(dm); if (!EnumDisplaySettings(adapter.DeviceName, -1, ref dm)) continue; // ENUM_CURRENT_SETTINGS
        if (dm.dmPelsWidth > 0 && dm.dmPelsHeight > 0) map[monitor.DeviceID] = new[] { dm.dmPositionX, dm.dmPositionY, dm.dmPositionX + (int)dm.dmPelsWidth, dm.dmPositionY + (int)dm.dmPelsHeight };
      }
      return map;
    }
    // "id|left|top|right|bottom" per attached monitor, in physical virtual-screen pixels, in IDesktopWallpaper order.
    public static List<string> Monitors() {
      var w = (IDesktopWallpaper)new DesktopWallpaperClass(); var list = new List<string>(); var modes = Modes(); uint n = w.GetMonitorDevicePathCount();
      for (uint i = 0; i < n; i++) {
        string id = w.GetMonitorDevicePathAt(i); int[] r;
        if (!modes.TryGetValue(id, out r)) { try { RECT rc = w.GetMonitorRECT(id); r = new[] { rc.Left, rc.Top, rc.Right, rc.Bottom }; } catch { continue; } } // detached monitors keep an id but no rect
        if (r[2] > r[0] && r[3] > r[1]) list.Add(id + "|" + r[0] + "|" + r[1] + "|" + r[2] + "|" + r[3]);
      }
      return list;
    }
    public static void SetWallpaper(string id, string path) { var w = (IDesktopWallpaper)new DesktopWallpaperClass(); w.SetPosition(4); w.SetWallpaper(id, path); } // 4 = FILL; the file already matches the monitor
    // The window that hosts the desktop wallpaper, behind the icons. Explorer spawns a WorkerW
    // between wallpaper and icons on 0x052C; Windows 11 24H2 keeps the icon view inside Progman,
    // where the Progman itself (bottom of its z-order) is the right parent.
    public static IntPtr WallpaperHost(out string mode) {
      IntPtr progman = FindWindow("Progman", null); IntPtr result;
      SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out result);
      SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), IntPtr.Zero, 0, 1000, out result);
      IntPtr workerw = IntPtr.Zero;
      EnumWindows((top, lp) => { if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) workerw = FindWindowEx(IntPtr.Zero, top, "WorkerW", null); return true; }, IntPtr.Zero);
      if (workerw != IntPtr.Zero) { mode = "workerw"; return workerw; }
      mode = "progman"; return progman;
    }
    public static string Attach(long hwnd, int left, int top, int width, int height) {
      IntPtr h = new IntPtr(hwnd); if (!IsWindow(h)) throw new Exception("window handle is not valid");
      string mode; IntPtr host = WallpaperHost(out mode); if (host == IntPtr.Zero) throw new Exception("desktop host window not found");
      // Verified on the CI runners: works from an elevated (high-integrity) process too, so no special hint for error 5.
      if (SetParent(h, host) == IntPtr.Zero) { int code = Marshal.GetLastWin32Error(); throw new Exception("SetParent 失败（Win32 错误 " + code + "），桌面层窗口无法挂到资源管理器的桌面之下"); }
      int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77); // child coordinates are relative to the virtual screen origin
      SetWindowPos(h, HWND_BOTTOM, left - vx, top - vy, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
      return mode;
    }
    public static void Detach(long hwnd) { IntPtr h = new IntPtr(hwnd); if (IsWindow(h)) { ShowWindow(h, 0); SetParent(h, IntPtr.Zero); } }
    public static string GetWallpaper(string id) { var w = (IDesktopWallpaper)new DesktopWallpaperClass(); return w.GetWallpaper(id) ?? ""; }
    // "parentClass|visible|left|top|right|bottom" in physical screen pixels, or "" when the handle is gone.
    public static string LayerInfo(long hwnd) {
      IntPtr h = new IntPtr(hwnd); if (!IsWindow(h)) return "";
      // GetAncestor(GA_PARENT), not GetParent: the latter returns NULL for an overlapped window even after SetParent.
      IntPtr parent = GetAncestor(h, 1); var name = new System.Text.StringBuilder(256); if (parent != IntPtr.Zero) GetClassName(parent, name, 256);
      RECT rc; GetWindowRect(h, out rc);
      return name + "|" + (IsWindowVisible(h) ? 1 : 0) + "|" + rc.Left + "|" + rc.Top + "|" + rc.Right + "|" + rc.Bottom;
    }
  }
}
'@
[DesktopRider.Api]::DpiAware()
switch ($Command) {
  'monitors' {
    $out=@(); $i=0
    foreach ($line in [DesktopRider.Api]::Monitors()) { $p=$line.Split('|'); $l=[int]$p[1]; $t=[int]$p[2]; $r=[int]$p[3]; $b=[int]$p[4]
      $out+=[ordered]@{ id=$p[0]; index=$i; left=$l; top=$t; width=($r-$l); height=($b-$t); primary=($l -le 0 -and $t -le 0 -and $r -gt 0 -and $b -gt 0) }; $i++ }
    ConvertTo-Json -Compress -InputObject @($out)
  }
  'set-wallpaper' {
    if (-not $MonitorId -or -not $Path) { throw 'set-wallpaper needs -MonitorId and -Path' }
    if (-not (Test-Path -LiteralPath $Path)) { throw "file not found: $Path" }
    [DesktopRider.Api]::SetWallpaper($MonitorId, (Resolve-Path -LiteralPath $Path).Path)
    ConvertTo-Json -Compress -InputObject ([ordered]@{ ok=$true })
  }
  'attach-layer' {
    if ($Hwnd -eq 0 -or $Width -le 0 -or $Height -le 0) { throw 'attach-layer needs -Hwnd, -Width and -Height' }
    $mode=[DesktopRider.Api]::Attach($Hwnd, $Left, $Top, $Width, $Height)
    ConvertTo-Json -Compress -InputObject ([ordered]@{ ok=$true; host=$mode })
  }
  'detach-layer' {
    if ($Hwnd -eq 0) { throw 'detach-layer needs -Hwnd' }
    [DesktopRider.Api]::Detach($Hwnd)
    ConvertTo-Json -Compress -InputObject ([ordered]@{ ok=$true })
  }
  'get-wallpaper' {
    if (-not $MonitorId) { throw 'get-wallpaper needs -MonitorId' }
    ConvertTo-Json -Compress -InputObject ([ordered]@{ path=[DesktopRider.Api]::GetWallpaper($MonitorId) })
  }
  'layer-info' {
    if ($Hwnd -eq 0) { throw 'layer-info needs -Hwnd' }
    $info=[DesktopRider.Api]::LayerInfo($Hwnd)
    if (-not $info) { ConvertTo-Json -Compress -InputObject ([ordered]@{ valid=$false }) }
    else { $p=$info.Split('|'); $l=[int]$p[2]; $t=[int]$p[3]; $r=[int]$p[4]; $b=[int]$p[5]
      ConvertTo-Json -Compress -InputObject ([ordered]@{ valid=$true; parentClass=$p[0]; visible=($p[1] -eq '1'); left=$l; top=$t; width=($r-$l); height=($b-$t) }) }
  }
}
