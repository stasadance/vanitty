# Installs the latest Vanitty release on Windows.
#
#   irm https://vanitty.dev/install.ps1 | iex
#
# Runs the per-user setup.exe silently, so no admin prompt. Uninstall from
# Settings > Apps. $env:VANITTY_VERSION = "26.10.0" installs a specific version.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repo = "stasadance/vanitty"
if ($env:VANITTY_VERSION) {
    $api = "https://api.github.com/repos/$repo/releases/tags/v$($env:VANITTY_VERSION.TrimStart('v'))"
} else {
    $api = "https://api.github.com/repos/$repo/releases/latest"
}

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
    Write-Warning "Only x64 builds are published; Vanitty runs under emulation on Windows on Arm."
}

$release = Invoke-RestMethod -Uri $api -Headers @{ Accept = "application/vnd.github+json" }
$asset = $release.assets | Where-Object { $_.name -like "*-setup.exe" } | Select-Object -First 1
if (-not $asset) { throw "No setup.exe in $($release.html_url)" }

$file = Join-Path ([IO.Path]::GetTempPath()) $asset.name
Write-Host "Downloading $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing

try {
    if ($asset.digest) {
        $expected = $asset.digest -replace "^sha256:", ""
        $actual = (Get-FileHash -Algorithm SHA256 $file).Hash
        if ($actual -ne $expected) { throw "Checksum mismatch for $($asset.name)" }
    }
    Write-Host "Installing Vanitty $($release.tag_name)"
    $proc = Start-Process -FilePath $file -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) { throw "Installer exited with code $($proc.ExitCode)" }
    Write-Host "Installed Vanitty. Find it in the Start menu."
} finally {
    Remove-Item $file -Force -ErrorAction SilentlyContinue
}
