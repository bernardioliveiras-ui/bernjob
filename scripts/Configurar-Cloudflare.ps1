# Instala dependências, cria D1 com jurisdição EU, vincula o UUID, aplica migração e publica Worker.
# Pré-requisito: executar `npx wrangler login` manualmente após `npm install`.
[CmdletBinding()]
param([switch]$UsarBancoExistente)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
 if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 22+ é obrigatório.'}
 if(-not (Get-Command npm -ErrorAction SilentlyContinue)){throw 'npm não encontrado.'}
 if(-not (Test-Path 'node_modules/.bin/wrangler')) {
  & npm install
  if($LASTEXITCODE -ne 0){throw 'Falha em npm install'}
 }
 & npx wrangler whoami
 if($LASTEXITCODE -ne 0){throw 'Faça login: npx wrangler login'}
 $DbName='ramon-recruit-eu'
 $DbJson=& npx wrangler d1 list --json
 if($LASTEXITCODE -ne 0){throw 'Não foi possível listar bancos D1'}
 $DbList=@(($DbJson -join "`n" | ConvertFrom-Json))
 $Found=@($DbList | Where-Object {$_.name -eq $DbName})
 if($Found.Count -gt 0 -and -not $UsarBancoExistente){throw "Já existe '$DbName'. Use -UsarBancoExistente SOMENTE se confirmou que foi criado com --jurisdiction eu."}
 if($Found.Count -eq 0){
  Write-Host 'Criando banco D1 sob jurisdição EU...' -ForegroundColor Cyan
  & npx wrangler d1 create $DbName --jurisdiction eu
  if($LASTEXITCODE -ne 0){throw 'Falha na criação do D1 europeu.'}
  $DbJson=& npx wrangler d1 list --json
  if($LASTEXITCODE -ne 0){throw 'Não foi possível conferir o banco criado'}
  $DbList=@(($DbJson -join "`n" | ConvertFrom-Json))
  $Found=@($DbList | Where-Object {$_.name -eq $DbName})
 }
 if($Found.Count -ne 1 -or -not $Found[0].uuid){throw 'Banco não encontrado ou UUID não retornado.'}
 $Uuid=[string]$Found[0].uuid
 if($Uuid -notmatch '^[0-9a-fA-F-]{36}$'){throw 'UUID inesperado. Abortando.'}
 $Config=Join-Path $Root 'wrangler.jsonc'
 $ConfigObject=Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
 if(-not $ConfigObject.d1_databases -or $ConfigObject.d1_databases[0].binding -ne 'DB'){throw 'Binding DB não encontrado no arquivo.'}
 $ConfigObject.d1_databases[0].database_id=$Uuid
 [IO.File]::WriteAllText($Config,($ConfigObject|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
 Write-Host "D1 vinculado: $DbName / $Uuid" -ForegroundColor Green
 Write-Host 'Aplicando migração REMOTA...'
 & npx wrangler d1 migrations apply DB --remote
 if($LASTEXITCODE -ne 0){throw 'Falha ao migrar D1 remoto.'}
 Write-Host 'Publicando Worker em modo STAGING, sem receber candidaturas reais...'
 & npx wrangler deploy
 if($LASTEXITCODE -ne 0){throw 'Falha ao publicar Worker.'}
 Write-Host 'Worker publicado. Próximo passo: Criar-Acesso-Cloudflare.ps1' -ForegroundColor Green
}finally{Pop-Location}
