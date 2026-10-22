param([Parameter(Mandatory=$true)][string]$BaseUrl)
$ErrorActionPreference='Stop'
if (-not $env:BERN_ADMIN_KEY) { throw 'Defina BERN_ADMIN_KEY.' }
Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/admin/stats" -Headers @{'X-Admin-Key'=$env:BERN_ADMIN_KEY} | ConvertTo-Json -Depth 10
