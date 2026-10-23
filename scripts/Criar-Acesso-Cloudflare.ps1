# Ramon Recruit - cria/atualiza conta D1 remota com PBKDF2-SHA256.
# Variante para evitar o endpoint /import que falhou com erro 10000 na conta atual.
# A senha entra por STDIN no Node, e so o HASH segue para o D1.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Email,
 [Parameter(Mandatory=$true)][string]$Nome,
 [Parameter(Mandatory=$true)][ValidateSet('admin','recruiter','candidate')][string]$Perfil
)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
 if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js nao encontrado.'}
 if(-not (Get-Command npx -ErrorAction SilentlyContinue)){throw 'npx nao encontrado.'}
 $Config=Get-Content '.\wrangler.jsonc' -Raw -Encoding UTF8 | ConvertFrom-Json
 $Dbs=@($Config.d1_databases|Where-Object {$_.binding -eq 'DB'})
 if($Dbs.Count -ne 1 -or $Dbs[0].database_name -ne 'ramon-recruit-eu' -or $Dbs[0].database_id -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$'){
  throw 'O D1 vinculado nao e um ramon-recruit-eu valido. Cancelado.'
 }
 Write-Host "Banco D1: $($Dbs[0].database_name) / $($Dbs[0].database_id)" -ForegroundColor Yellow
 Write-Host "Conta a criar ou ATUALIZAR: $Email | $Perfil" -ForegroundColor Yellow
 $Confirmacao=Read-Host 'Digite RAMON para confirmar que a conta sera criada/atualizada nesse banco'
 if($Confirmacao -cne 'RAMON'){throw 'Cancelado pelo usuario.'}
 # Confirmar esquema antes de solicitar senha. Se faltar tabela, falhar cedo.
 & npx wrangler d1 execute DB --remote --command 'SELECT COUNT(*) AS total FROM users;'
 if($LASTEXITCODE -ne 0){throw 'A tabela users nao esta pronta. Execute Inicializar-D1-Sem-Importacao.ps1 primeiro.'}
 $Secure=Read-Host 'Senha nova (minimo 12 caracteres)' -AsSecureString
 $Ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
 try{$Plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)}
 if($Plain.Length -lt 12){throw 'Senha com menos de 12 caracteres.'}
 $Payload=@{password=$Plain}|ConvertTo-Json -Compress
 $Plain=$null
 $Sql = $Payload | & node '.\scripts\gerar-sql-acesso.mjs' --email $Email --name $Nome --role $Perfil
 $Payload=$null
 if($LASTEXITCODE -ne 0){throw 'Erro ao gerar hash da senha. Nenhum registro foi enviado ao D1.'}
 $Command=($Sql -join "`n").Trim()
 $Sql=$null
 if(-not $Command.StartsWith('INSERT INTO users(')){throw 'Comando SQL inesperado. Abortando.'}
 # --command usa o endpoint de consulta, que foi confirmado funcionando nesta conta.
 # O comando contem SOMENTE hash com salt, NUNCA a senha em texto puro.
 & npx wrangler d1 execute DB --remote --command $Command
 if($LASTEXITCODE -ne 0){throw 'Falha ao cadastrar usuario. Consulte a mensagem original do Wrangler acima.'}
 $Command=$null
 Write-Host "Conta cadastrada/atualizada: $Email ($Perfil)" -ForegroundColor Green
 Write-Host 'Teste o login no Worker somente depois de confirmar o usuario.' -ForegroundColor Green
} finally {Pop-Location}
