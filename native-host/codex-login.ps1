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
$codexPath = $config.cliPaths.codex
if ([string]::IsNullOrWhiteSpace($codexPath) -or
    -not (Test-Path -LiteralPath $codexPath -PathType Leaf)) {
  throw '注册时未找到 Codex CLI，或 CLI 路径已变更。请安装 Codex CLI 后重新运行 Native Messaging 注册命令。'
}

$arguments = @('login')
if ($Status) { $arguments += 'status' }
& $codexPath @arguments
exit $LASTEXITCODE
