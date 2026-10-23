# Cria/atualiza conta diretamente no D1 remoto com senha solicitada localmente e PBKDF2-SHA256.
# Execute apenas no computador do responsável pela conta Cloudflare.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$Email,
 [Parameter(Mandatory=$true)][string]$Nome,
 [Parameter(Mandatory=$true)][ValidateSet('admin','recruiter','candidate')][string]$Perfil
)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$TempFile=Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName()+'.sql')
Push-Location $Root
try{
 if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js não encontrado.'}
 if(-not (Test-Path 'node_modules/.bin/wrangler')){throw 'Rode Configurar-Cloudflare.ps1 primeiro.'}
 $Secure=Read-Host 'Nova senha forte, mínimo 12 caracteres' -AsSecureString
 $Ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
 try{$Plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)}
 if($Plain.Length -lt 12){throw 'Senha curta demais.'}
 $Payload=@{password=$Plain}|ConvertTo-Json -Compress
 $Plain=$null
 $Sql=$Payload | & node (Join-Path $Root 'scripts/gerar-sql-acesso.mjs') --email $Email --name $Nome --role $Perfil
 $Payload=$null
 if($LASTEXITCODE -ne 0){throw 'Não foi possível gerar credenciais seguras.'}
 [IO.File]::WriteAllText($TempFile,($Sql -join "`n"),[Text.UTF8Encoding]::new($false))
 $Sql=$null
 & npx wrangler d1 execute DB --remote --file $TempFile --yes
 if($LASTEXITCODE -ne 0){throw 'Falha ao registrar conta no D1.'}
 Write-Host "Conta $Email salva no D1 remoto como $Perfil. Nenhuma senha padrão foi criada." -ForegroundColor Green
}finally{
 if(Test-Path $TempFile){Remove-Item -LiteralPath $TempFile -Force -ErrorAction SilentlyContinue}
 Pop-Location
}
