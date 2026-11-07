param([int]$Port = 4330, [switch]$Open, [switch]$Supervise)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$url = "http://127.0.0.1:$Port"
try {
    $page = Invoke-WebRequest -UseBasicParsing -Uri "$url/posts" -TimeoutSec 3
    $existingPosts = Invoke-RestMethod -Uri "$url/api/posts" -TimeoutSec 3
    if ($page.StatusCode -eq 200 -and $page.Content -match 'X Media' -and $null -ne $existingPosts.accounts) {
        if ($Open) { Start-Process $url }
        exit 0
    }
} catch { }
$bundledNode = Join-Path $project '.data\runtime\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node.exe -ErrorAction Stop).Source }
$next = Join-Path $project 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath (Join-Path $project '.next\BUILD_ID'))) { throw 'Build X Media first with npm run build.' }
$logs = Join-Path $project '.data'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$env:X_MEDIA_URL = $url
$env:MEME_LEGACY_REDIRECT_PORT = '8321'
$env:MEME_DISCORD_ENABLED = '0'
$process = Start-Process -FilePath $node -ArgumentList @('--env-file-if-exists=.env', '--env-file-if-exists=.env.local', "`"$next`"", 'start', '--hostname', '127.0.0.1', '--port', $Port) -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'x-media.out.log') -RedirectStandardError (Join-Path $logs 'x-media.err.log')
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if ($process.HasExited) { throw "X Media stopped. See $logs\x-media.err.log" }
    try {
        $posts = Invoke-RestMethod -Uri "$url/api/posts" -TimeoutSec 2
        if ($null -ne $posts.accounts) {
            if ($Open) { Start-Process $url }
            Write-Output "X Media is ready at $url (PID $($process.Id))."
            if ($Supervise) { $process.WaitForExit(); exit $process.ExitCode }
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}
throw "X Media did not become ready. See $logs\x-media.err.log"
