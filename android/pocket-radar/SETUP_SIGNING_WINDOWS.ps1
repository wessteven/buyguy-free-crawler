# One-time setup, run locally on a trusted Windows PC with Java JDK installed.
# Generates a PRIVATE long-lived Android release key. NEVER commit/email/share it.
$ErrorActionPreference = "Stop"
$folder = Join-Path $HOME "Documents\PocketRadarSigning"
$path = Join-Path $folder "pocket-radar-release.p12"
$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
    Write-Host "Java JDK not found. Install Java 17 JDK, e.g. via: winget install EclipseAdoptium.Temurin.17.JDK"
    throw "keytool command not available"
}
New-Item -ItemType Directory -Path $folder -Force | Out-Null
if (Test-Path $path) {
    throw "Existing private signing key found at $path. Never overwrite it. Back it up securely."
}
Write-Host "Create a strong password and KEEP it. Keytool will ask you to enter it twice."
Write-Host "The same password will be used to unlock the PKCS12 key for future updates."
& $keytool.Source -genkeypair -alias pocket-radar -keyalg RSA -keysize 3072 -validity 12000 -storetype PKCS12 -keystore $path -dname "CN=Pocket Radar, OU=Private Android Widget"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $path)) {
    throw "Key generation failed; do not set GitHub secrets"
}
[Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) | Set-Clipboard
Write-Host ""
Write-Host "PRIVATE KEY SAVED LOCALLY: $path"
Write-Host "The base64 of that key is now in your clipboard."
Write-Host ""
Write-Host "Open: https://github.com/wessteven/buyguy-free-crawler/settings/secrets/actions"
Write-Host "Create the first REPOSITORY secret: POCKET_RADAR_KEYSTORE_BASE64"
Write-Host "Paste the clipboard into its value field; save."
Write-Host "Create the second REPOSITORY secret: POCKET_RADAR_SIGNING_PASSWORD"
Write-Host "Use the exact password you just entered with keytool; save."
Write-Host ""
Write-Host "After adding the secrets, clear your clipboard and back up the .p12 file securely offline."
Write-Host "Do not share the private key, its base64, or password with ChatGPT."
Write-Host "The signed-update workflow will use the secrets to generate update-compatible APKs."
