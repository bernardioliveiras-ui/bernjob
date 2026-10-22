# Provisione usuários no Bern Global sem gerar senha no navegador.
param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$Name,
  [Parameter(Mandatory=$true)][string]$Email,
  [ValidateSet('candidate','lawyer','company','admin')][string]$Role='candidate'
)
$ErrorActionPreference='Stop'
if (-not $env:BERN_ADMIN_KEY) { throw 'Defina a variável de ambiente BERN_ADMIN_KEY no PowerShell (mesmo valor do segredo ADMIN_KEY do Worker).' }
$bytes=[byte[]]::new(24)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password=[Convert]::ToBase64String($bytes).TrimEnd('=') -replace '\+','-' -replace '/','_'
$headers=@{'X-Admin-Key'=$env:BERN_ADMIN_KEY}
$payload=@{name=$Name;email=$Email;role=$Role;password=$password} | ConvertTo-Json -Compress
$result=Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/admin/provision" -Method POST -ContentType 'application/json' -Headers $headers -Body $payload
Write-Host "Conta criada: $($result.email) / $($result.role)"
Write-Host "SENHA PROVISORIA (mostrada uma vez): $password" -ForegroundColor Yellow
Write-Host 'Compartilhe por canal seguro. O usuario devera trocar a senha no primeiro acesso.'
