param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$Employer,
  [Parameter(Mandatory=$true)][string]$BoardSlug,
  [ValidateSet('greenhouse','lever','ashby')][Parameter(Mandatory=$true)][string]$Provider,
  [switch]$TermsReviewed
)
$ErrorActionPreference='Stop'
if (-not $TermsReviewed) { throw 'Confirme que revisou as condicoes de uso da fonte usando -TermsReviewed.' }
if (-not $env:BERN_ADMIN_KEY) { throw 'Defina BERN_ADMIN_KEY.' }
$body=@{provider=$Provider;board_slug=$BoardSlug;employer=$Employer;terms_reviewed=$true} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/admin/add-source" -Method POST -ContentType 'application/json' -Headers @{'X-Admin-Key'=$env:BERN_ADMIN_KEY} -Body $body
