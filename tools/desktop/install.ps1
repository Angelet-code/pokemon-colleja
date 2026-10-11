<#
  Crea el acceso directo «Pokemon Colleja» en el escritorio (npm run desktop:install).
  El icono se dibuja a partir del favicon de la web y se guarda en storage/.desktop/colleja.ico.
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$DataDir = Join-Path $Root 'storage\.desktop'
New-Item -ItemType Directory -Force $DataDir | Out-Null

# --- Icono (mismo dibujo que apps/web/public/favicon.svg, en 256 px) ---------------------------
$size = 256
$k = $size / 32
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ([float]($x * $k)), ([float]($y * $k)) }
$g.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(11, 12, 14))),
  [System.Drawing.PointF[]]@((P 7 1), (P 31 1), (P 31 25), (P 25 31), (P 1 31), (P 1 7)))
$g.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(212, 255, 58))),
  [System.Drawing.PointF[]]@((P 9 24), (P 21 8), (P 26 8), (P 14 24)))
$g.Dispose()
$png = New-Object System.IO.MemoryStream
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$bytes = $png.ToArray()

# ICO con una sola imagen PNG (válido desde Windows Vista).
$icon = Join-Path $DataDir 'colleja.ico'
$out = New-Object System.IO.BinaryWriter ([System.IO.File]::Create($icon))
$out.Write([uint16]0); $out.Write([uint16]1); $out.Write([uint16]1)
$out.Write([byte]0); $out.Write([byte]0); $out.Write([byte]0); $out.Write([byte]0)
$out.Write([uint16]1); $out.Write([uint16]32); $out.Write([uint32]$bytes.Length); $out.Write([uint32]22)
$out.Write($bytes)
$out.Close()

# --- Acceso directo --------------------------------------------------------------------------
$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop 'Pokemon Colleja.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$shortcut.Arguments = '"' + (Join-Path $PSScriptRoot 'launch.vbs') + '"'
$shortcut.WorkingDirectory = $Root
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'Simulador de combates de Pokémon Champions'
$shortcut.Save()

Write-Host "Acceso directo creado: $link"
