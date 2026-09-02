[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet('Chrome', 'Edge', 'Both')]
  [string]$Browser = 'Both'
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.jeffrey.type_transfer.bridge'
$registryTargets = @()
if ($Browser -in @('Chrome', 'Both')) {
  $registryTargets += 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $hostName
}
if ($Browser -in @('Edge', 'Both')) {
  $registryTargets += 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\' + $hostName
}

foreach ($registryPath in $registryTargets) {
  if ((Test-Path -LiteralPath $registryPath) -and
      $PSCmdlet.ShouldProcess($registryPath, '移除 Native Messaging 宿主注册')) {
    Remove-Item -LiteralPath $registryPath
  }
}

Write-Output "已移除 Native Messaging 注册：$Browser"
