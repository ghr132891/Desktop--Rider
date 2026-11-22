# Captures the whole virtual screen (all monitors) to a PNG. Used by test/windows.cjs so the CI
# artifacts show what the real desktop looked like after the wallpaper and layer were applied.
param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
# PowerShell's manifest is system-DPI-aware; use physical virtual-screen coordinates even
# when the primary monitor or scale differs from the display hosting this process.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScreenshotDpi {
 [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 public static void Physical(){if(SetThreadDpiAwarenessContext(new IntPtr(-4))==IntPtr.Zero)throw new Exception("Cannot select physical screenshot coordinates: "+Marshal.GetLastWin32Error());}
}
'@
[ScreenshotDpi]::Physical()
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$screen=[System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap=New-Object System.Drawing.Bitmap($screen.Width,$screen.Height)
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Left,$screen.Top,0,0,$bitmap.Size)
$graphics.Dispose()
$bitmap.Save($Path,[System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
ConvertTo-Json -Compress -InputObject ([ordered]@{ path=$Path; left=$screen.Left; top=$screen.Top; width=$screen.Width; height=$screen.Height })
