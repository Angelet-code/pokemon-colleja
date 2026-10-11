<#
  Lanzador de escritorio (Windows): lo abre el acceso directo «Pokemon Colleja» vía launch.vbs.

  1. Busca Node (PATH o %LOCALAPPDATA%\nodejs-portable\node-v*).
  2. Recompila la web si apps/web/dist falta o es más antigua que el código.
  3. Arranca el servidor (http://127.0.0.1:3001) sin consola, salvo que ya esté en marcha.
  4. Abre la app en una ventana propia de Edge/Chrome (modo --app) y, al cerrarla,
     apaga el servidor si lo arrancó este lanzador.

  Registro del servidor: storage/.desktop/server.log
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Port = if ($env:SERVER_PORT) { [int]$env:SERVER_PORT } else { 3001 }
$Url = "http://127.0.0.1:$Port"
$DataDir = Join-Path $Root 'storage\.desktop'
New-Item -ItemType Directory -Force $DataDir | Out-Null

function Fail([string]$Message) {
  [System.Windows.Forms.MessageBox]::Show($Message, 'Pokemon Colleja', 'OK', 'Error') | Out-Null
  exit 1
}

function Test-Server {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $client.Dispose() }
}

# --- Node ------------------------------------------------------------------------------------
$Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $Node) {
  $Node = Get-ChildItem "$env:LOCALAPPDATA\nodejs-portable\node-v*\node.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Directory.Name -replace '^node-v([\d.]+).*$', '$1') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Node) { Fail "No encuentro Node.js (>= 24). Instálalo o añádelo al PATH." }
$NodeDir = Split-Path $Node
$env:Path = "$NodeDir;$env:Path"

$ServerProcess = $null
if (-not (Test-Server)) {
  # --- Build de la web si hace falta -----------------------------------------------------------
  $WebDir = Join-Path $Root 'apps\web'
  $DistIndex = Join-Path $WebDir 'dist\index.html'
  $needsBuild = -not (Test-Path $DistIndex)
  if (-not $needsBuild) {
    $builtAt = (Get-Item $DistIndex).LastWriteTime
    $newer = Get-ChildItem (Join-Path $WebDir 'src'), (Join-Path $WebDir 'public'), (Join-Path $WebDir 'index.html') -Recurse -File |
      Where-Object { $_.LastWriteTime -gt $builtAt } | Select-Object -First 1
    $needsBuild = [bool]$newer
  }
  if ($needsBuild) {
    $buildLog = Join-Path $DataDir 'build.log'
    $build = Start-Process (Join-Path $NodeDir 'npm.cmd') -ArgumentList 'run', 'build' -WorkingDirectory $Root `
      -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $buildLog -RedirectStandardError "$buildLog.err"
    if ($build.ExitCode -ne 0) { Fail "Falló la compilación de la web. Mira $buildLog" }
  }

  # --- Servidor --------------------------------------------------------------------------------
  $serverLog = Join-Path $DataDir 'server.log'
  $ServerProcess = Start-Process $Node -ArgumentList '--import', 'tsx', 'apps/server/src/main.ts' `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err"

  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-Server)) {
    if ($ServerProcess.HasExited) { Fail "El servidor no arrancó. Mira $serverLog.err" }
    if ((Get-Date) -gt $deadline) { $ServerProcess.Kill(); Fail "El servidor tarda demasiado en arrancar. Mira $serverLog" }
    Start-Sleep -Milliseconds 300
  }
}

# --- Ventana de la app -----------------------------------------------------------------------
$Browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($Browser) {
  # Perfil propio: la ventana es un proceso aparte y sabemos cuándo se cierra.
  $profileDir = Join-Path $DataDir 'browser'
  $window = Start-Process $Browser -PassThru -ArgumentList "--app=$Url", "--user-data-dir=`"$profileDir`"",
    '--no-first-run', '--no-default-browser-check', '--window-size=1400,900'
  $window.WaitForExit()
  # Si ya había una ventana abierta, Edge le pasa la petición y sale enseguida: esperamos a esa.
  while (Get-CimInstance Win32_Process -Filter "Name='$(Split-Path $Browser -Leaf)'" |
      Where-Object { $_.CommandLine -like "*$profileDir*" }) {
    Start-Sleep -Seconds 2
  }
  if ($ServerProcess -and -not $ServerProcess.HasExited) { Stop-Process -Id $ServerProcess.Id -Force }
} else {
  # Sin Edge ni Chrome: navegador por defecto y el servidor sigue en marcha.
  Start-Process $Url
}
