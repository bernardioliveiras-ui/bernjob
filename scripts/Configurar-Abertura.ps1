# Desbloqueia candidaturas somente depois de testes de segurança, política de privacidade e proteções antiabuso.
[CmdletBinding()]
param([ValidateSet('true','false')][string]$Habilitar='false')
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$Config=Join-Path $Root 'wrangler.jsonc'
$Object=Get-Content $Config -Raw | ConvertFrom-Json
$Object.vars.PUBLIC_APPLICATIONS_ENABLED=$Habilitar
[IO.File]::WriteAllText($Config,($Object|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
Write-Host "PUBLIC_APPLICATIONS_ENABLED=$Habilitar. Aplique com: npx wrangler deploy"
