[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId,

  [ValidateSet('Chrome', 'Edge', 'Both')]
  [string]$Browser = 'Both',

  [switch]$SkipRegistration
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$hostName = 'com.jeffrey.type_transfer.bridge'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$sourcePath = Join-Path $scriptRoot 'JeffreyTypeTransfer.NativeHost.cs'
$binPath = Join-Path $scriptRoot 'bin'
$executablePath = Join-Path $binPath 'JeffreyTypeTransfer.NativeHost.exe'
$configPath = Join-Path $binPath 'host-config.json'
$manifestPath = Join-Path $binPath "$hostName.json"
$serverPath = Join-Path $projectRoot 'bridge\server.mjs'

if (-not (Test-Path -LiteralPath $sourcePath)) { throw "缺少 Native Messaging 宿主源码：$sourcePath" }
if (-not (Test-Path -LiteralPath $serverPath)) { throw "缺少桥接服务：$serverPath" }

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compilerPath = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compilerPath) { throw '未找到 Windows .NET Framework C# 编译器，无法生成本机宿主。' }

function Resolve-ApplicationPath([string]$Name) {
  $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -eq $command) { return $null }
  return $command.Source
}

New-Item -ItemType Directory -Force -Path $binPath | Out-Null
& $compilerPath /nologo /target:exe /platform:anycpu "/out:$executablePath" /reference:System.Runtime.Serialization.dll $sourcePath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $executablePath)) {
  throw 'Native Messaging 宿主编译失败。'
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$config = [ordered]@{
  nodePath = $nodeCommand.Source
  projectRoot = $projectRoot
  cliPaths = [ordered]@{
    codex = Resolve-ApplicationPath 'codex'
    claude = Resolve-ApplicationPath 'claude'
    agy = Resolve-ApplicationPath 'agy'
    qwen = Resolve-ApplicationPath 'qwen'
    ollama = Resolve-ApplicationPath 'ollama'
  }
} | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($configPath, $config, $utf8NoBom)

$manifest = [ordered]@{
  name = $hostName
  description = 'Jeffrey Type Transfer loopback bridge launcher'
  path = $executablePath
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8NoBom)

$registryTargets = @()
if ($Browser -in @('Chrome', 'Both')) {
  $registryTargets += 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $hostName
}
if ($Browser -in @('Edge', 'Both')) {
  $registryTargets += 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\' + $hostName
}

if (-not $SkipRegistration) {
  foreach ($registryPath in $registryTargets) {
    if ($PSCmdlet.ShouldProcess($registryPath, '注册 Native Messaging 宿主')) {
      New-Item -Path $registryPath -Force | Out-Null
      Set-Item -Path $registryPath -Value $manifestPath
      $registeredManifest = (Get-Item -LiteralPath $registryPath).GetValue('')
      if ($registeredManifest -ne $manifestPath) {
        throw "Native Messaging 注册校验失败：$registryPath"
      }
    }
  }
}

if ($SkipRegistration) {
  Write-Output "Native Messaging 宿主已生成：$hostName"
} else {
  Write-Output "Native Messaging 已注册：$hostName"
}
Write-Output "扩展 ID：$ExtensionId"
Write-Output "浏览器：$Browser"
if ($SkipRegistration) {
  Write-Output '已跳过注册表写入（测试模式）。'
} else {
  Write-Output '请在扩展管理页重新加载 Jeffrey Type Transfer，然后点击“一键启动”。'
}
