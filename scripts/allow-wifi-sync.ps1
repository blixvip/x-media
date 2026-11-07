# Run once from an elevated PowerShell window. Allows only the sync listener,
# from this computer's local subnet; the main web app remains loopback-only.
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bundled = Join-Path $project '.data\runtime\node.exe'
$node = if (Test-Path -LiteralPath $bundled) { $bundled } else { (Get-Command node.exe -ErrorAction Stop).Source }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as administrator, then run this script again.' }
$name = 'XMedia-WifiSync-4331'
$existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if ($existing) { Set-NetFirewallRule -Name $name -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort 4331 -RemoteAddress LocalSubnet -Program $node | Out-Null }
else { New-NetFirewallRule -Name $name -DisplayName 'X Media Wi-Fi sync (local subnet)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4331 -RemoteAddress LocalSubnet -Profile Any -Program $node | Out-Null }
Write-Output 'X Media sync is allowed from your local subnet on TCP 4331.'
