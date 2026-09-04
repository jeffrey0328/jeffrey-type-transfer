[CmdletBinding()]
param(
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptRoot 'bin\host-config.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw '尚未生成本机桥接配置，请先运行界面中的 Native Messaging 注册命令。'
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

function Find-CodexPath([string]$ConfiguredPath) {
  if (-not [string]::IsNullOrWhiteSpace($ConfiguredPath) -and
      (Test-Path -LiteralPath $ConfiguredPath -PathType Leaf)) {
    return $ConfiguredPath
  }

  $command = Get-Command codex -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $command) { return $command.Source }

  $desktopBin = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
  if (Test-Path -LiteralPath $desktopBin -PathType Container) {
    $desktopCodex = Get-ChildItem -LiteralPath $desktopBin -Filter 'codex.exe' -File -Recurse -Depth 1 |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($null -ne $desktopCodex) { return $desktopCodex.FullName }
  }

  foreach ($candidate in @(
    (Join-Path $env:APPDATA 'npm\codex.exe'),
    (Join-Path $env:APPDATA 'npm\codex.cmd')
  )) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }

  return $null
}

$configuredCodexPath = if ($null -ne $config.cliPaths) { [string]$config.cliPaths.codex } else { $null }
$codexPath = Find-CodexPath $configuredCodexPath
if ([string]::IsNullOrWhiteSpace($codexPath)) {
  throw '未找到 Codex CLI。请先安装 Codex CLI，然后重试；桌面版更新后无需重新注册 Native Messaging。'
}

$configuredCodexHome = if ($config.PSObject.Properties.Name -contains 'codexHome') {
  [string]$config.codexHome
} else {
  Join-Path $env:USERPROFILE '.codex'
}
if (-not [string]::IsNullOrWhiteSpace($configuredCodexHome)) {
  $env:CODEX_HOME = [System.IO.Path]::GetFullPath($configuredCodexHome)
}

$arguments = @('login')
if ($Status) { $arguments += 'status' }
& $codexPath @arguments
exit $LASTEXITCODE
