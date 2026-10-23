# Ramon Recruit: inicializa D1 remoto e cria PRIMEIRO admin com senha digitada localmente.
# Nao cria banco novo, nao altera Worker, nao publica, nao mexe em dados existentes.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Nome
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js/npm nao encontrados.' }
  $Config = Get-Content -LiteralPath (Join-Path $Root 'wrangler.jsonc') -Raw | ConvertFrom-Json
  $Dbs = @($Config.d1_databases | Where-Object { $_.binding -eq 'DB' })
  if ($Dbs.Count -ne 1) { throw 'Binding DB ausente ou duplicado.' }
  $Db = $Dbs[0]
  if ($Db.database_id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') {
    throw 'UUID do D1 invalido. Preencha primeiro o database_id REAL no wrangler.jsonc.'
  }
  if ($Db.database_name -ne 'ramon-recruit-eu') { throw 'Banco nao esperado. Interrompendo por seguranca.' }
  Write-Host ''
  Write-Host 'CONFIRA COM ATENCAO O DESTINO:' -ForegroundColor Yellow
  Write-Host "Worker configurado: $($Config.name)"
  Write-Host "Banco D1 remoto: $($Db.database_name)"
  Write-Host "UUID D1: $($Db.database_id)"
  Write-Host "Admin a criar/atualizar: $Email ($Nome)"
  Write-Host ''
  Write-Host 'Este comando APLICA migracoes no D1 REMOTO e pode redefinir credenciais caso o email ja exista.' -ForegroundColor Yellow
  $Confirmacao = Read-Host 'Digite RAMON para confirmar que o banco eh exclusivo deste projeto'
  if ($Confirmacao -cne 'RAMON') { throw 'Operacao cancelada pelo usuario.' }
  & npx wrangler whoami
  if ($LASTEXITCODE -ne 0) { throw 'Execute npx wrangler login antes.' }
  Write-Host 'Aplicando migracoes no D1 REMOTO...' -ForegroundColor Cyan
  & npx wrangler d1 migrations apply DB --remote
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao aplicar migracoes. Consulte a saida do Wrangler.' }
  Write-Host 'Verificando a tabela users no D1 remoto...' -ForegroundColor Cyan
  & npx wrangler d1 execute DB --remote --command 'SELECT COUNT(*) AS total FROM users;'
  if ($LASTEXITCODE -ne 0) { throw 'Tabela users ainda nao acessivel. Nao foi criada conta.' }
  Write-Host 'Criando o administrador. A senha sera solicitada sem exibicao.' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'Criar-Acesso-Cloudflare.ps1') -Email $Email -Nome $Nome -Perfil admin
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Falha ao criar administrador.' }
  Write-Host 'Concluido. Teste o login com seu email e a senha digitada agora.' -ForegroundColor Green
  Write-Host 'A senha nao foi enviada para o GitHub nem gravada em arquivos do projeto.'
} finally {
  Pop-Location
}
