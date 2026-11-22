# Desktop Rider native bridge for Windows 10 / 11. Called by lib/native.js with
#   bridge.ps1 -Command monitors
#   bridge.ps1 -Command set-wallpaper -MonitorId <id> -Path <png>
#   bridge.ps1 -Command attach-layer -Hwnd <n> -Left <x> -Top <y> -Width <w> -Height <h>
#   bridge.ps1 -Command detach-layer -Hwnd <n>
#   bridge.ps1 -Command get-wallpaper -MonitorId <id>      (verification: current wallpaper file)
#   bridge.ps1 -Command layer-info -Hwnd <n>               (verification: parent class, visibility, screen rect)
#   bridge.ps1 -Command covering -Hwnd <n> -Left <x> -Top <y> -Width <w> -Height <h>   (is the desktop on this monitor hidden by a window?)
#   bridge.ps1 -Command watch -Hwnd <n> -Left <x> -Top <y> -Width <w> -Height <h>      (same, one JSON line per change, every second, until killed)
#   bridge.ps1 -Command media                                  (system media session: what QQ音乐 / 网易云音乐 / … is playing, position)
#   bridge.ps1 -Command watch-media                            (same, one JSON line per change, polls every 250 ms, until killed)
# Prints one JSON document on stdout; any failure goes to stderr with exit code 1.
# Needs only Windows PowerShell 5.1 (present on every Win10/11) — the C# below is
# compiled in memory by Add-Type, no SDK required.
# Keep UTF-8 BOM: Windows PowerShell 5.1 otherwise decodes Chinese C# strings using the system ANSI code page.
param(
  [Parameter(Mandatory=$true)][ValidateSet('monitors','set-wallpaper','attach-layer','detach-layer','get-wallpaper','layer-info','covering','watch','media','watch-media')][string]$Command,
  [string]$MonitorId,[string]$Path,[long]$Hwnd=0,[int]$Left=0,[int]$Top=0,[int]$Width=0,[int]$Height=0
)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace DesktopRider {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
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
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint command);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder name, int max);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint color, byte alpha, uint flags);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr hWnd, out uint color, out byte alpha, out uint flags);
    [DllImport("kernel32.dll", EntryPoint = "SetLastError")] static extern void ClearLastError(uint error);
    [DllImport("user32.dll", SetLastError = true)] static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool SetProp(IntPtr hWnd, string name, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetProp(IntPtr hWnd, string name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr RemoveProp(IntPtr hWnd, string name);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int value, int size);
    static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040, SWP_FRAMECHANGED = 0x0020;
    const string OriginalStyle = "DesktopRider.OriginalStyle", SavedStyle = "DesktopRider.SavedStyle";
    const string OriginalExtendedStyle = "DesktopRider.OriginalExtendedStyle", SavedExtendedStyle = "DesktopRider.SavedExtendedStyle";
    static void WindowStyle(IntPtr h, IntPtr value, int index = -16) {
      ClearLastError(0);
      if (SetWindowLongPtr(h, index, value) == IntPtr.Zero && Marshal.GetLastWin32Error() != 0)
        throw new Exception("SetWindowLongPtr failed: " + Marshal.GetLastWin32Error());
    }
    // powershell.exe is system-DPI-aware by manifest, so the process context cannot be changed any
    // more; the thread context can (Win10 1607+) and keeps our geometry calls in physical pixels.
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
    // between wallpaper and icons on 0x052C; Windows 11 24H2 instead keeps both the icon view
    // and the wallpaper WorkerW as children of Progman. Our window must sit BETWEEN those children.
    public static IntPtr WallpaperHost(out string mode) {
      IntPtr progman = FindWindow("Progman", null); IntPtr result;
      // Request the raised desktop once, matching the 24H2-compatible shell handshake.
      // Do not immediately release it again with (0xD, 0).
      SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out result);
      IntPtr workerw = IntPtr.Zero;
      EnumWindows((top, lp) => { if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) workerw = FindWindowEx(IntPtr.Zero, top, "WorkerW", null); return true; }, IntPtr.Zero);
      if (workerw != IntPtr.Zero) { mode = "workerw"; return workerw; }
      mode = "progman"; return progman;
    }
    public static string Attach(long hwnd, int left, int top, int width, int height) {
      IntPtr h = new IntPtr(hwnd); if (!IsWindow(h)) throw new Exception("window handle is not valid");
      string mode; IntPtr host = WallpaperHost(out mode); if (host == IntPtr.Zero) throw new Exception("desktop host window not found");
      IntPtr style = GetWindowLongPtr(h, -16), exStyle = GetWindowLongPtr(h, -20), previousParent = IntPtr.Zero; bool parentChanged = false;
      bool alreadySaved = GetProp(h, SavedStyle) != IntPtr.Zero;
      bool alreadyExtendedSaved = GetProp(h, SavedExtendedStyle) != IntPtr.Zero;
      uint oldColor, oldFlags; byte oldAlpha;
      bool hadAttributes = GetLayeredWindowAttributes(h, out oldColor, out oldAlpha, out oldFlags);
      try {
        // SetParent does not set WS_CHILD / clear WS_POPUP. Store the pre-attach style on the
        // window itself: attach and detach run in separate PowerShell processes.
        if (!alreadySaved) {
          if (!SetProp(h, OriginalStyle, style) || !SetProp(h, SavedStyle, new IntPtr(1)))
            throw new Exception("SetProp failed: " + Marshal.GetLastWin32Error());
        }
        if (!alreadyExtendedSaved) {
          if (!SetProp(h, OriginalExtendedStyle, exStyle) || !SetProp(h, SavedExtendedStyle, new IntPtr(1)))
            throw new Exception("SetProp extended style failed: " + Marshal.GetLastWin32Error());
        }
        WindowStyle(h, new IntPtr((style.ToInt64() & ~0x80000000L) | 0x40000000L));
        ClearLastError(0); previousParent = SetParent(h, host);
        int error = Marshal.GetLastWin32Error();
        // NULL is also a valid previous parent for a top-level window.
        if (previousParent == IntPtr.Zero && error != 0) throw new Exception("SetParent failed: " + error);
        parentChanged = true;
        // Chromium can paint correctly while its reparented layered HWND remains absent from
        // the desktop composition. Initialise only our child window's global opacity; retain
        // per-pixel transparency and all existing extended styles (including click-through).
        long attachedExStyle = GetWindowLongPtr(h, -20).ToInt64();
        if ((attachedExStyle & 0x80000L) == 0) WindowStyle(h, new IntPtr(attachedExStyle | 0x80000L), -20);
        if (!SetLayeredWindowAttributes(h, 0, 255, 2))
          throw new Exception("SetLayeredWindowAttributes failed: " + Marshal.GetLastWin32Error());
        var point = new POINT { X = left, Y = top };
        if (!ScreenToClient(host, ref point)) throw new Exception("ScreenToClient failed: " + Marshal.GetLastWin32Error());
        // HWND_BOTTOM under Progman puts a visible window BEHIND the system wallpaper on
        // 24H2+. Keep icons above our surface without moving/hiding any Explorer window.
        IntPtr icons = mode == "progman" ? FindWindowEx(host, IntPtr.Zero, "SHELLDLL_DefView", null) : IntPtr.Zero;
        IntPtr after = icons != IntPtr.Zero ? icons : HWND_BOTTOM;
        if (!SetWindowPos(h, after, point.X, point.Y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED))
          throw new Exception("SetWindowPos failed: " + Marshal.GetLastWin32Error());
      } catch {
        if (parentChanged) SetParent(h, previousParent);
        try { WindowStyle(h, style); } catch { } // Preserve the attachment error if the HWND was destroyed meanwhile.
        try { WindowStyle(h, exStyle, -20); if (hadAttributes) SetLayeredWindowAttributes(h, oldColor, oldAlpha, oldFlags); } catch { }
        if (!alreadySaved) { RemoveProp(h, OriginalStyle); RemoveProp(h, SavedStyle); }
        if (!alreadyExtendedSaved) { RemoveProp(h, OriginalExtendedStyle); RemoveProp(h, SavedExtendedStyle); }
        throw;
      }
      return mode;
    }
    public static void Detach(long hwnd) {
      IntPtr h = new IntPtr(hwnd); if (!IsWindow(h)) return;
      ShowWindow(h, 0); ClearLastError(0);
      if (SetParent(h, IntPtr.Zero) == IntPtr.Zero && Marshal.GetLastWin32Error() != 0)
        throw new Exception("SetParent detach failed: " + Marshal.GetLastWin32Error());
      if (GetProp(h, SavedStyle) != IntPtr.Zero) {
        // Keep it hidden while restoring the original top-level style.
        WindowStyle(h, new IntPtr(GetProp(h, OriginalStyle).ToInt64() & ~0x10000000L));
        RemoveProp(h, OriginalStyle); RemoveProp(h, SavedStyle);
        SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | SWP_NOACTIVATE | SWP_FRAMECHANGED);
      }
      if (GetProp(h, SavedExtendedStyle) != IntPtr.Zero) {
        WindowStyle(h, GetProp(h, OriginalExtendedStyle), -20);
        RemoveProp(h, OriginalExtendedStyle); RemoveProp(h, SavedExtendedStyle);
      }
    }
    public static string GetWallpaper(string id) { var w = (IDesktopWallpaper)new DesktopWallpaperClass(); return w.GetWallpaper(id) ?? ""; }
    // Is the desktop of the monitor (L,T,W,H) hidden? True when some visible, non-minimised, non-cloaked top-level
    // window that is not the shell, not click-through (WS_EX_TRANSPARENT overlays) and not `exclude` is maximised on
    // that monitor or spans it entirely. Returns "hwnd|class|zoomed|left|top|right|bottom" of that window, else "".
    public static string Covering(long exclude, int L, int T, int W, int H) {
      string found = "";
      EnumWindows((h, l) => {
        if (h.ToInt64() == exclude || !IsWindowVisible(h) || IsIconic(h)) return true;
        int cloaked = 0; try { DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch { } if (cloaked != 0) return true;
        long ex = GetWindowLongPtr(h, -20).ToInt64(); if ((ex & 0x20) != 0) return true;
        var name = new System.Text.StringBuilder(256); GetClassName(h, name, 256); string cls = name.ToString();
        if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" || cls == "Windows.UI.Core.CoreWindow" || cls == "XamlExplorerHostIslandWindow") return true;
        RECT rc; GetWindowRect(h, out rc); if (rc.Right - rc.Left < 2 || rc.Bottom - rc.Top < 2) return true;
        bool onMonitor = rc.Left < L + W && rc.Right > L && rc.Top < T + H && rc.Bottom > T;
        bool contains = rc.Left <= L && rc.Top <= T && rc.Right >= L + W && rc.Bottom >= T + H;
        bool zoomed = IsZoomed(h);
        if ((zoomed && onMonitor) || contains) { found = h.ToInt64() + "|" + cls + "|" + (zoomed ? 1 : 0) + "|" + rc.Left + "|" + rc.Top + "|" + rc.Right + "|" + rc.Bottom; return false; }
        return true; }, IntPtr.Zero);
      return found;
    }
    // "parentClass|visible|left|top|right|bottom|iconIndex|layerIndex|wallpaperIndex|isChild|isLayered|effectiveAlpha|alphaFlags";
    // sibling indexes are top-to-bottom (-1 if absent), so tests can detect a layer hidden UNDER wallpaper.
    public static string LayerInfo(long hwnd) {
      IntPtr h = new IntPtr(hwnd); if (!IsWindow(h)) return "";
      // GetAncestor(GA_PARENT), not GetParent: the latter returns NULL for an overlapped window even after SetParent.
      IntPtr parent = GetAncestor(h, 1); var name = new System.Text.StringBuilder(256); if (parent != IntPtr.Zero) GetClassName(parent, name, 256);
      RECT rc; GetWindowRect(h, out rc);
      int icons = -1, layer = -1, wallpaper = -1, index = 0;
      if (name.ToString() == "Progman") {
        var seen = new HashSet<IntPtr>();
        for (IntPtr child = GetWindow(parent, 5); child != IntPtr.Zero && seen.Add(child); child = GetWindow(child, 2)) { // GW_CHILD, GW_HWNDNEXT
          var cls = new System.Text.StringBuilder(256); GetClassName(child, cls, 256);
          if (child == h) layer = index;
          if (cls.ToString() == "SHELLDLL_DefView") icons = index;
          if (cls.ToString() == "WorkerW" && IsWindowVisible(child) && wallpaper == -1) wallpaper = index;
          index++;
        }
      }
      uint color, flags; byte alpha; bool attributes = GetLayeredWindowAttributes(h, out color, out alpha, out flags);
      return name + "|" + (IsWindowVisible(h) ? 1 : 0) + "|" + rc.Left + "|" + rc.Top + "|" + rc.Right + "|" + rc.Bottom + "|" + icons + "|" + layer + "|" + wallpaper + "|" + ((GetWindowLongPtr(h, -16).ToInt64() & 0x40000000L) != 0 ? 1 : 0) + "|" + ((GetWindowLongPtr(h, -20).ToInt64() & 0x80000L) != 0 ? 1 : 0) + "|" + (attributes && (flags & 2) != 0 ? (int)alpha : -1) + "|" + (attributes ? (long)flags : -1);
    }
  }
}
'@
[DesktopRider.Api]::DpiAware()
# System Media Transport Controls (what the volume flyout shows): title / artist / status / position of the session
# that is playing, else the system's current one. WinRT from Windows PowerShell 5.1 needs the AsTask bridge below.
$script:mediaReady = $false
$script:mediaManager = $null
function Get-Media {
  try {
    if (-not $script:mediaReady) {
      Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
      $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
      $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
      $script:mediaReady = $true
    }
    $await = { param($op, $type) $t = $script:asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
    # Reusing the manager avoids another WinRT async acquisition on every position/status poll.
    if (-not $script:mediaManager) { $script:mediaManager = & $await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
    $mgr = $script:mediaManager
    $sessions = @($mgr.GetSessions())
    if ($sessions.Count -eq 0) { return [ordered]@{ sessions=0; playing=$false } }
    $s = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 4 } | Select-Object -First 1
    if (-not $s) { $s = $mgr.GetCurrentSession() }
    if (-not $s) { $s = $sessions[0] }
    $props = & $await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $tl = $s.GetTimelineProperties(); $pb = $s.GetPlaybackInfo()
    # Keep the original status: QQMusic may report Changing while its controls clearly offer Pause, not Play.
    return [ordered]@{ sessions=$sessions.Count; playing=($pb.PlaybackStatus -eq 4); status=[string]$pb.PlaybackStatus; app=[string]$s.SourceAppUserModelId; title=[string]$props.Title; artist=[string]$props.Artist; album=[string]$props.AlbumTitle; position=[math]::Round($tl.Position.TotalSeconds, 2); duration=[math]::Round($tl.EndTime.TotalSeconds, 2); updated=$tl.LastUpdatedTime.ToUnixTimeMilliseconds(); controls=[ordered]@{ playEnabled=[bool]$pb.Controls.IsPlayEnabled; pauseEnabled=[bool]$pb.Controls.IsPauseEnabled; toggleEnabled=[bool]$pb.Controls.IsPlayPauseToggleEnabled } }
  } catch { $script:mediaManager = $null; return [ordered]@{ sessions=0; playing=$false; error=$_.Exception.Message } }
}
function Get-Covering { param([long]$Exclude,[int]$L,[int]$T,[int]$W,[int]$H)
  $info = [DesktopRider.Api]::Covering($Exclude, $L, $T, $W, $H)
  if (-not $info) { return [ordered]@{ covered=$false } }
  $p = $info.Split('|')
  return [ordered]@{ covered=$true; hwnd=[long]$p[0]; class=$p[1]; zoomed=($p[2] -eq '1'); left=[int]$p[3]; top=[int]$p[4]; width=([int]$p[5]-[int]$p[3]); height=([int]$p[6]-[int]$p[4]) }
}
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
  'covering' {
    ConvertTo-Json -Compress -InputObject (Get-Covering -Exclude $Hwnd -L $Left -T $Top -W $Width -H $Height)
  }
  'watch' {
    # One PowerShell process stays alive per layer window; lib/native.js reads a JSON line whenever the state changes.
    $last = $null
    while ($true) {
      $json = ConvertTo-Json -Compress -InputObject (Get-Covering -Exclude $Hwnd -L $Left -T $Top -W $Width -H $Height)
      if ($json -ne $last) { [Console]::Out.WriteLine($json); [Console]::Out.Flush(); $last = $json }
      Start-Sleep -Milliseconds 1000
    }
  }
  'media' {
    ConvertTo-Json -Compress -InputObject (Get-Media)
  }
  'watch-media' {
    $last = $null
    while ($true) {
      $json = ConvertTo-Json -Compress -InputObject (Get-Media)
      if ($json -ne $last) { [Console]::Out.WriteLine($json); [Console]::Out.Flush(); $last = $json }
      Start-Sleep -Milliseconds 250
    }
  }
  'layer-info' {
    if ($Hwnd -eq 0) { throw 'layer-info needs -Hwnd' }
    $info=[DesktopRider.Api]::LayerInfo($Hwnd)
    if (-not $info) { ConvertTo-Json -Compress -InputObject ([ordered]@{ valid=$false }) }
    else { $p=$info.Split('|'); $l=[int]$p[2]; $t=[int]$p[3]; $r=[int]$p[4]; $b=[int]$p[5]
      $icons=[int]$p[6]; $layer=[int]$p[7]; $wallpaper=[int]$p[8]
      $belowIcons=$null; if ($icons -ge 0) { $belowIcons=($layer -gt $icons) }
      $aboveWallpaper=$null; if ($wallpaper -ge 0) { $aboveWallpaper=($layer -ge 0 -and $layer -lt $wallpaper) }
      $effectiveAlpha=$null; if ([int]$p[11] -ge 0) { $effectiveAlpha=[int]$p[11] }
      $alphaFlags=$null; if ([long]$p[12] -ge 0) { $alphaFlags=[long]$p[12] }
      ConvertTo-Json -Compress -InputObject ([ordered]@{ valid=$true; parentClass=$p[0]; visible=($p[1] -eq '1'); left=$l; top=$t; width=($r-$l); height=($b-$t); belowIcons=$belowIcons; aboveWallpaper=$aboveWallpaper; childWindow=($p[9] -eq '1'); layeredWindow=($p[10] -eq '1'); effectiveAlpha=$effectiveAlpha; alphaFlags=$alphaFlags }) }
  }
}
