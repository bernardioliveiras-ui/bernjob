param([Parameter(Mandatory=$true)][string]$BaseUrl)
$ErrorActionPreference='Stop'
if (-not $env:BERN_ADMIN_KEY) { throw 'Defina BERN_ADMIN_KEY.' }
Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/admin/jobbot/run" -Method POST -ContentType 'application/json' -Headers @{'X-Admin-Key'=$env:BERN_ADMIN_KEY} -Body '{}'
