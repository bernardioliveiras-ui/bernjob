# Ramon Recruit - provisionar esquema v0.4 no D1 remoto via endpoint de SQL/--command.
# NAO usa d1 execute --file nem endpoint de importacao.
# Requer migrations/0001_initial.sql do projeto e conta Cloudflare autenticada.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado.' }
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'npx nao encontrado.' }
  if (-not (Test-Path '.\migrations\0001_initial.sql')) { throw 'Nao achei migrations/0001_initial.sql na raiz do projeto.' }
  $Config=Get-Content '.\wrangler.jsonc' -Raw -Encoding UTF8 | ConvertFrom-Json
  $Bindings=@($Config.d1_databases | Where-Object { $_.binding -eq 'DB' })
  if($Bindings.Count -ne 1){ throw 'Binding DB inexistente ou duplicado.' }
  $Db=$Bindings[0]
  if ($Db.database_name -ne 'ramon-recruit-eu') {throw 'Nome do banco diferente de ramon-recruit-eu. Cancelado.'}
  if ($Db.database_id -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$') {throw 'database_id invalido no wrangler.jsonc.'}
  Write-Host "BANCO REMOTO: $($Db.database_name) / $($Db.database_id)" -ForegroundColor Yellow
  Write-Host "Worker configurado: $($Config.name)" -ForegroundColor Yellow
  Write-Host 'AVISO: este comando cria as tabelas de recrutamento neste D1, sem apagar tabelas existentes.' -ForegroundColor Yellow
  $Confirmacao=Read-Host 'Confirme que o banco pertence ao Ramon. Digite RAMON'
  if($Confirmacao -cne 'RAMON'){throw 'Cancelado pelo usuario.'}
  Write-Host 'Testando acesso de consulta ao banco remoto...' -ForegroundColor Cyan
  & npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
  if($LASTEXITCODE -ne 0){throw 'Falha ao consultar D1 remoto. Confira conexao e conta.'}
  $Json = & node '.\scripts\ler-migracao-para-comandos.mjs'
  if($LASTEXITCODE -ne 0){throw 'Nao foi possivel analisar a migracao local.'}
  $Statements = @($Json | ConvertFrom-Json)
  Write-Host "Aplicando $($Statements.Count) comandos idempotentes sem importacao..." -ForegroundColor Cyan
  $N=0
  foreach($Sql in $Statements){
    $N++
    Write-Host "Executando DDL $N / $($Statements.Count)..." -ForegroundColor DarkCyan
    & npx wrangler d1 execute DB --remote --command $Sql
    if($LASTEXITCODE -ne 0){throw "Falha no comando DDL $N. Veja a mensagem original do Wrangler logo acima. Nada sera apagado automaticamente."}
  }
  Write-Host 'Verificando tabelas criadas...' -ForegroundColor Cyan
  & npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','jobs','candidates','applications','request_limits') ORDER BY name;"
  if($LASTEXITCODE -ne 0){throw 'Falha na verificacao final de tabelas.'}
  Write-Host 'Concluido. Confirme que as seis tabelas aparecem antes de criar o admin.' -ForegroundColor Green
} finally {Pop-Location}
