# Captures the whole virtual screen (all monitors) to a PNG. Used by test/windows.cjs so the CI
# artifacts show what the real desktop looked like after the wallpaper and layer were applied.
param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$screen=[System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap=New-Object System.Drawing.Bitmap($screen.Width,$screen.Height)
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Left,$screen.Top,0,0,$bitmap.Size)
$graphics.Dispose()
$bitmap.Save($Path,[System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
ConvertTo-Json -Compress -InputObject ([ordered]@{ path=$Path; width=$screen.Width; height=$screen.Height })
