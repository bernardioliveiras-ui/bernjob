# Confere que o binding local aponta para o mesmo D1 que existe na conta autenticada.
# Corrige a validacao antiga que aceitava somente o nome ramon-recruit-eu.
function Assert-RamonD1 {
    param([Parameter(Mandatory=$true)][object]$Config)
    $Entries = @($Config.d1_databases | Where-Object { $_.binding -eq 'DB' })
    if ($Entries.Count -ne 1) { throw 'Binding DB ausente ou duplicado no wrangler.jsonc.' }
    $Db = $Entries[0]
    $ExpectedId = '5815cc53-5a3d-4666-a231-0c5b318eb03b'
    if ($Db.database_id -ne $ExpectedId) {
        throw "UUID inesperado no wrangler.jsonc: $($Db.database_id). Este hotfix foi feito especificamente para o banco $ExpectedId. Nao execute ate confirmar o projeto."
    }
    if ($Db.database_name -notin @('ramon', 'ramon-recruit-eu')) {
        throw "Nome local inesperado: $($Db.database_name). Banco nao sera alterado."
    }
    if ($Db.database_id -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$') {
        throw 'database_id invalido no wrangler.jsonc.'
    }
    Write-Host 'Conferindo nome e UUID na conta Cloudflare autenticada...' -ForegroundColor Cyan
    $Raw = & npx wrangler d1 list --json
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel listar os bancos do D1. Verifique a autenticacao com npx wrangler whoami.' }
    try {
        $Listing = (($Raw -join "`n") | ConvertFrom-Json)
    } catch {
        throw 'A lista JSON retornada pelo Wrangler nao pode ser interpretada. Execute npx wrangler d1 list e confira o banco manualmente.'
    }
    $Items = @($Listing)
    if ($null -ne $Listing.databases) { $Items = @($Listing.databases) }
    $Found = @($Items | Where-Object { $_.uuid -eq $Db.database_id -or $_.id -eq $Db.database_id })
    if ($Found.Count -ne 1) {
        throw "UUID $($Db.database_id) nao encontrado na conta Cloudflare. Interrompido."
    }
    if ($Found[0].name -ne $Db.database_name) {
        throw "Nome no D1 ($($Found[0].name)) difere do wrangler.jsonc ($($Db.database_name)). Interrompido."
    }
    Write-Host "D1 conferido: $($Db.database_name) / $($Db.database_id)" -ForegroundColor Green
    return $Db
}
