param([Parameter(Mandatory=$true)][string]$Email)
$ErrorActionPreference='Stop'
trap { Write-Host $_.Exception.Message -ForegroundColor Red; Read-Host 'Pressione Enter para fechar'; exit 1 }
$first=Read-Host 'Digite a senha administrativa (oculta)' -AsSecureString
$second=Read-Host 'Confirme a senha (oculta)' -AsSecureString
$firstPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
$secondPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
try {
  $firstText=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
  $secondText=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
  if($firstText -cne $secondText){throw 'As senhas não coincidem.'}
  if($firstText.Length -lt 12){throw 'A senha deve ter ao menos 12 caracteres.'}
  $env:ADMIN_EMAIL=$Email
  $env:ADMIN_PASSWORD=$firstText
  $env:ADMIN_NAME='Ian JM'
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  $tsx=Join-Path $PSScriptRoot '..\node_modules\.bin\tsx.cmd'
  & $tsx (Join-Path $PSScriptRoot 'bootstrap-admin.ts')
  if($LASTEXITCODE -ne 0){throw "Bootstrap falhou com código $LASTEXITCODE."}
  Write-Host 'Conta criada com sucesso. Somente o hash bcrypt foi armazenado.' -ForegroundColor Green
} finally {
  Remove-Item Env:ADMIN_PASSWORD,Env:ADMIN_EMAIL,Env:ADMIN_NAME -ErrorAction SilentlyContinue
  $firstText=$null;$secondText=$null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
}
Read-Host 'Pressione Enter para fechar'
