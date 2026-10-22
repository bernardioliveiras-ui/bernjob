# Importa uma lista curada de quadros de vagas, depois de revisada a origem de cada empresa.
param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$CsvPath
)
$ErrorActionPreference='Stop'
if (-not (Test-Path $CsvPath)) { throw 'CSV nao encontrado.' }
if (-not $env:BERN_ADMIN_KEY) { throw 'Defina BERN_ADMIN_KEY.' }
$rows=Import-Csv -Path $CsvPath -Encoding utf8
$ok=0
foreach ($row in $rows) {
  if ($row.TermsReviewed -ne 'true') { Write-Warning "Ignorando $($row.Employer): termos nao revisados."; continue }
  $body=@{employer=$row.Employer;provider=$row.Provider;board_slug=$row.BoardSlug;terms_reviewed=$true} | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/admin/add-source" -Method POST -ContentType 'application/json' -Headers @{'X-Admin-Key'=$env:BERN_ADMIN_KEY} -Body $body | Out-Null
    $ok++
    Write-Host "Fonte cadastrada: $($row.Employer)"
  } catch { Write-Warning "Falha em $($row.Employer): $($_.Exception.Message)" }
}
Write-Host "Total de quadros cadastrados: $ok"
