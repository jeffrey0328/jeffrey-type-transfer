[CmdletBinding()]
param(
    [int]$Port = 47321
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BridgeRoot = $PSScriptRoot
$TokenPath = Join-Path $BridgeRoot '.bridge-token'
$AllowedExtensionPath = Join-Path $BridgeRoot '.bridge-extension-id'
$SchemaPath = Join-Path $BridgeRoot 'response-schema.json'
$MaxBodyBytes = 18MB
$MaxPromptLength = 100000
$ExecutionTimeoutMs = 180000
$ListenerPrefix = "http://127.0.0.1:$Port/"
$RecommendedModels = @(
    @{ id = ''; label = '使用 Codex CLI 默认模型' },
    @{ id = 'gpt-5.6-sol'; label = 'GPT-5.6 Sol' },
    @{ id = 'gpt-5.6-terra'; label = 'GPT-5.6 Terra' },
    @{ id = 'gpt-5.6-luna'; label = 'GPT-5.6 Luna' },
    @{ id = 'gpt-5.5'; label = 'GPT-5.5' },
    @{ id = 'gpt-5.4'; label = 'GPT-5.4' }
)

function Get-BridgeToken {
    if (Test-Path -LiteralPath $TokenPath) {
        $existing = [System.IO.File]::ReadAllText($TokenPath).Trim()
        if ($existing -match '^[A-Za-z0-9_-]{32,}$') { return $existing }
        throw '桥接令牌文件格式无效。请删除 native-bridge\.bridge-token 后重新启动。'
    }
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [System.IO.File]::WriteAllText($TokenPath, $token, (New-Object System.Text.UTF8Encoding($false)))
    return $token
}

function Get-CodexPath {
    $executable = Get-Command codex.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($executable) { return [string]$executable.Source }
    $command = Get-Command codex -ErrorAction SilentlyContinue
    if ($command -and $command.Source -match '\.(exe|ps1|cmd)$') { return [string]$command.Source }
    return $null
}

function Quote-ProcessArgument([string]$Value) {
    if ($Value -notmatch '[\s"]') { return $Value }
    return '"' + (($Value -replace '(\\*)"', '$1$1\\"') -replace '(\\*)$', '$1$1') + '"'
}

function Invoke-CodexProcess {
    param(
        [string]$CodexPath,
        [string[]]$Arguments,
        [string]$InputText,
        [int]$TimeoutMs = 15000
    )
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $launchArguments = @($Arguments)
    if ($CodexPath -match '\.ps1$') {
        $startInfo.FileName = 'powershell.exe'
        $launchArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CodexPath) + $launchArguments
    } elseif ($CodexPath -match '\.cmd$') {
        $startInfo.FileName = 'cmd.exe'
        $launchArguments = @('/d', '/s', '/c', $CodexPath) + $launchArguments
    } else {
        $startInfo.FileName = $CodexPath
    }
    $startInfo.Arguments = (($launchArguments | ForEach-Object { Quote-ProcessArgument ([string]$_) }) -join ' ')
    $startInfo.WorkingDirectory = $BridgeRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw '无法启动 Codex CLI。' }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if ($null -ne $InputText) { $process.StandardInput.Write($InputText) }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit($TimeoutMs)) {
            try { $process.Kill() } catch { }
            $process.WaitForExit()
            return @{ TimedOut = $true; ExitCode = -1; StdOut = $stdoutTask.GetAwaiter().GetResult(); StdErr = $stderrTask.GetAwaiter().GetResult() }
        }
        return @{ TimedOut = $false; ExitCode = $process.ExitCode; StdOut = $stdoutTask.GetAwaiter().GetResult(); StdErr = $stderrTask.GetAwaiter().GetResult() }
    } finally {
        if (-not $process.HasExited) { try { $process.Kill() } catch { } }
        $process.Dispose()
    }
}

function Get-Health {
    $codex = Get-CodexPath
    if (-not $codex) { return @{ ok = $true; codexInstalled = $false; loggedIn = $false; codexVersion = '' } }
    $version = Invoke-CodexProcess -CodexPath $codex -Arguments @('--version') -InputText $null -TimeoutMs 10000
    $login = Invoke-CodexProcess -CodexPath $codex -Arguments @('login', 'status') -InputText $null -TimeoutMs 10000
    return @{ ok = $true; codexInstalled = ($version.ExitCode -eq 0); loggedIn = ($login.ExitCode -eq 0); codexVersion = if ($version.ExitCode -eq 0) { $version.StdOut.Trim() } else { '' } }
}

function Test-AllowedOrigin([string]$Origin) {
    if ([string]::IsNullOrEmpty($Origin)) { return $true }
    return $Origin -match '^chrome-extension://[a-p]{32}$' -or $Origin -match '^edge-extension://[a-p]{32}$'
}

function Get-ExtensionIdFromOrigin([string]$Origin) {
    if ($Origin -match '^(?:chrome|edge)-extension://([a-p]{32})$') { return $Matches[1] }
    return $null
}

function Get-BootstrapToken($Request, [string]$Token) {
    # This one-time bootstrap route is intentionally exempt from Bearer auth so a
    # freshly loaded extension can obtain its first token. It binds permanently
    # to the browser-provided extension origin before returning any secret.
    $extensionId = Get-ExtensionIdFromOrigin ([string]$Request.Headers['Origin'])
    $requestedId = [string]$Request.Headers['X-Bridge-Extension-Id']
    if (-not $extensionId -or $requestedId -ne $extensionId) { throw '只能从已加载的浏览器扩展获取桥接令牌。' }
    if (Test-Path -LiteralPath $AllowedExtensionPath) {
        $allowedId = [System.IO.File]::ReadAllText($AllowedExtensionPath).Trim()
        if ($allowedId -ne $extensionId) { throw '桥接已绑定到另一个扩展 ID。' }
    } else {
        [System.IO.File]::WriteAllText($AllowedExtensionPath, $extensionId, (New-Object System.Text.UTF8Encoding($false)))
    }
    return $Token
}

function Add-CorsHeaders($Response, [string]$Origin) {
    if (-not [string]::IsNullOrEmpty($Origin)) {
        $Response.Headers['Access-Control-Allow-Origin'] = $Origin
        $Response.Headers['Vary'] = 'Origin'
    }
    $Response.Headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Bridge-Extension-Id'
    $Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $Response.Headers['Access-Control-Max-Age'] = '600'
}

function Send-Json($Response, [int]$StatusCode, $Payload) {
    $json = $Payload | ConvertTo-Json -Compress -Depth 8
    $data = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = 'application/json; charset=utf-8'
    $Response.ContentLength64 = $data.Length
    try { $Response.OutputStream.Write($data, 0, $data.Length) } finally { $Response.OutputStream.Close() }
}

function Test-Authorization($Request, [string]$Token) {
    $header = [string]$Request.Headers['Authorization']
    if (-not $header.StartsWith('Bearer ')) { return $false }
    $candidate = $header.Substring(7)
    $left = [System.Text.Encoding]::UTF8.GetBytes($candidate)
    $right = [System.Text.Encoding]::UTF8.GetBytes($Token)
    if ($left.Length -ne $right.Length) { return $false }
    # PowerShell 5 runs on .NET Framework, which does not expose CryptographicOperations.
    $difference = 0
    for ($index = 0; $index -lt $left.Length; $index += 1) { $difference = $difference -bor ($left[$index] -bxor $right[$index]) }
    return $difference -eq 0
}

function Read-RequestJson($Request) {
    if ($Request.ContentLength64 -gt $MaxBodyBytes) { throw '请求体超过允许大小。' }
    $memory = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 8192
    try {
        while (($read = $Request.InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if (($memory.Length + $read) -gt $MaxBodyBytes) { throw '请求体超过允许大小。' }
            $memory.Write($buffer, 0, $read)
        }
        $raw = [System.Text.Encoding]::UTF8.GetString($memory.ToArray())
        return $raw | ConvertFrom-Json
    } catch {
        if ($_.Exception.Message -match '超过允许大小') { throw }
        throw '请求 JSON 无效。'
    } finally { $memory.Dispose() }
}

function Get-ScreenshotBytes([string]$DataUrl) {
    if ([string]::IsNullOrEmpty($DataUrl)) { return $null }
    if ($DataUrl -notmatch '^data:image/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$') { throw '截图必须是 PNG 或 JPEG Data URL。' }
    try { $bytes = [Convert]::FromBase64String($Matches[2]) } catch { throw '截图 Base64 无效。' }
    if ($bytes.Length -lt 4) { throw '截图文件无效。' }
    $isPng = $bytes.Length -ge 8 -and $bytes[0] -eq 137 -and $bytes[1] -eq 80 -and $bytes[2] -eq 78 -and $bytes[3] -eq 71
    $isJpeg = $bytes[0] -eq 255 -and $bytes[1] -eq 216 -and $bytes[2] -eq 255
    if ((($Matches[1] -eq 'png') -and -not $isPng) -or (($Matches[1] -eq 'jpeg') -and -not $isJpeg)) { throw '截图内容与声明格式不一致。' }
    return @{ Bytes = $bytes; Extension = if ($isPng) { 'png' } else { 'jpg' } }
}

function Test-Decision($Decision) {
    if ($null -eq $Decision -or @($Decision.PSObject.Properties).Count -ne 2) { return $false }
    if ($null -eq $Decision.PSObject.Properties['action'] -or $null -eq $Decision.PSObject.Properties['translation']) { return $false }
    return $Decision.action -eq 'replace_text' -and $Decision.translation -is [string] -and $Decision.translation.Trim().Length -gt 0
}

function Invoke-Execution($Payload) {
    if ($null -eq $Payload -or $Payload.prompt -isnot [string] -or [string]::IsNullOrWhiteSpace($Payload.prompt)) { throw 'prompt 必须是非空字符串。' }
    if ($Payload.prompt.Length -gt $MaxPromptLength) { throw 'prompt 超过允许长度。' }
    $model = if ($Payload.PSObject.Properties['model'] -and $null -ne $Payload.model) { [string]$Payload.model } else { '' }
    if ($model -and $model -notmatch '^[A-Za-z0-9._:/@-]{1,120}$') { throw '模型名称格式无效。' }
    $screenshot = if ($Payload.PSObject.Properties['screenshot'] -and $null -ne $Payload.screenshot) { Get-ScreenshotBytes ([string]$Payload.screenshot) } else { $null }
    $codex = Get-CodexPath
    if (-not $codex) { throw '未找到 Codex CLI。' }
    $login = Invoke-CodexProcess -CodexPath $codex -Arguments @('login', 'status') -InputText $null -TimeoutMs 10000
    if ($login.ExitCode -ne 0) { throw 'Codex CLI 尚未登录。请运行 start-bridge.cmd 完成设备登录。' }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('jeffrey-codex-bridge-' + [Guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($tempDir) | Out-Null
    try {
        $resultPath = Join-Path $tempDir 'result.json'
        $args = @('exec', '--ignore-user-config', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--output-schema', $SchemaPath, '--output-last-message', $resultPath)
        if ($screenshot) {
            $imagePath = Join-Path $tempDir ('input.' + $screenshot.Extension)
            [System.IO.File]::WriteAllBytes($imagePath, $screenshot.Bytes)
            $args += @('--image', $imagePath)
        }
        if ($model) { $args += @('--model', $model) }
        $args += '-'
        $run = Invoke-CodexProcess -CodexPath $codex -Arguments $args -InputText $Payload.prompt -TimeoutMs $ExecutionTimeoutMs
        if ($run.TimedOut) { return @{ TimedOut = $true } }
        if ($run.ExitCode -ne 0) { throw 'Codex 未能完成本次请求。请检查登录状态和模型设置。' }
        if (-not (Test-Path -LiteralPath $resultPath)) { throw 'Codex 没有生成结构化结果。' }
        try { $decision = [System.IO.File]::ReadAllText($resultPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } catch { throw 'Codex 返回的 JSON 无效。' }
        if (-not (Test-Decision $decision)) { throw 'Codex 返回结果不符合决定结构。' }
        return @{ TimedOut = $false; Decision = @{ action = [string]$decision.action; translation = [string]$decision.translation } }
    } finally {
        if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

$Token = Get-BridgeToken
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($ListenerPrefix)
try {
    $listener.Start()
} catch {
    throw "无法监听 $ListenerPrefix。可能已有桥接正在运行，或端口不可用。"
}
Write-Host "Codex 本机桥接已启动：$ListenerPrefix（按 Ctrl+C 停止）"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request; $response = $context.Response
        try {
            $origin = [string]$request.Headers['Origin']
            if (-not (Test-AllowedOrigin $origin)) { Send-Json $response 403 @{ error = '不允许的请求来源。' }; continue }
            Add-CorsHeaders $response $origin
            if ($request.HttpMethod -eq 'OPTIONS') { $response.StatusCode = 204; $response.OutputStream.Close(); continue }
            if ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/bootstrap-token') {
                try { Send-Json $response 200 @{ ok = $true; token = (Get-BootstrapToken $request $Token) } }
                catch { Send-Json $response 403 @{ error = [string]$_.Exception.Message } }
                continue
            }
            if (-not (Test-Authorization $request $Token)) { Send-Json $response 401 @{ error = '未授权。' }; continue }
            if ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/health') { Send-Json $response 200 (Get-Health); continue }
            if ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/models') {
                $health = Get-Health
                if (-not $health.codexInstalled) { Send-Json $response 503 @{ error = '未找到 Codex CLI。' }; continue }
                if (-not $health.loggedIn) { Send-Json $response 503 @{ error = 'Codex CLI 尚未登录。请运行 start-bridge.cmd 完成设备登录。' }; continue }
                Send-Json $response 200 @{ ok = $true; models = $RecommendedModels; source = 'bridge-recommendations' }
                continue
            }
            if ($request.HttpMethod -eq 'POST' -and $request.Url.AbsolutePath -eq '/execute') {
                if (-not $request.ContentType -or -not $request.ContentType.ToLowerInvariant().StartsWith('application/json')) { Send-Json $response 415 @{ error = 'Content-Type 必须为 application/json。' }; continue }
                $result = Invoke-Execution (Read-RequestJson $request)
                if ($result.TimedOut) { Send-Json $response 504 @{ error = 'Codex 执行超时，已停止本次请求。' } } else { Send-Json $response 200 @{ ok = $true; decision = $result.Decision } }
                continue
            }
            Send-Json $response 404 @{ error = '未找到该接口。' }
        } catch {
            $message = [string]$_.Exception.Message
            if ($message -match 'Codex CLI|未找到 Codex') { Send-Json $response 503 @{ error = $message } }
            elseif ($message -match '登录') { Send-Json $response 503 @{ error = $message } }
            elseif ($message -match '请求体|prompt|截图|模型|Content-Type|JSON') { Send-Json $response 400 @{ error = $message } }
            else { Send-Json $response 500 @{ error = '桥接处理请求失败。' } }
        } finally {
            try { $request.InputStream.Close() } catch { }
            try { $response.Close() } catch { }
        }
    }
} finally { $listener.Close() }
