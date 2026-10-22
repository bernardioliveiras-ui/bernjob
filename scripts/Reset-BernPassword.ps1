# Reset administrativo: use apenas depois de verificar a identidade do titular.
param([Parameter(Mandatory=$true)][string]$BaseUrl,[Parameter(Mandatory=$true)][string]$Email)
$ErrorActionPreference='Stop'
if (-not $env:BERN_ADMIN_KEY) { throw 'Defina BERN_ADMIN_KEY antes de usar.' }
$bytes=[byte[]]::new(24)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password=[Convert]::ToBase64String($bytes).TrimEnd('=') -replace '\+','-' -replace '/','_'
$headers=@{'X-Admin-Key'=$env:BERN_ADMIN_KEY}
$payload=@{email=$Email;password=$password} | ConvertTo-Json -Compress
$result=Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/admin/reset-password" -Method POST -ContentType 'application/json' -Headers $headers -Body $payload
Write-Host "Senha provisoria para $Email : $password" -ForegroundColor Yellow
Write-Host 'Entregue por canal seguro; usuario trocara no primeiro acesso.'
