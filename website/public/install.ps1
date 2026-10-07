# Installs the latest Vanitty release on Windows.
#
#   irm https://vanitty.dev/install.ps1 | iex
#
# Runs the per-user setup.exe silently, so no admin prompt. Uninstall from
# Settings > Apps. $env:VANITTY_VERSION = "26.10.0" installs a specific version.
# $env:NO_COLOR = 1 turns off colors.

# Everything runs inside a function so `iex` leaves no variables or
# preference changes behind in the caller's session.
function Install-Vanitty {
    $ErrorActionPreference = "Stop"
    # Invoke-WebRequest's own progress bar slows downloads to a crawl on
    # Windows PowerShell 5.1.
    $ProgressPreference = "SilentlyContinue"
    $repo = "stasadance/vanitty"
    $color = -not $env:NO_COLOR

    function Write-Line([string]$Mark, [string]$Text, [string]$Color) {
        Write-Host "  " -NoNewline
        if ($color) { Write-Host $Mark -ForegroundColor $Color -NoNewline } else { Write-Host $Mark -NoNewline }
        Write-Host " $Text"
    }
    function Step([string]$Text) { Write-Line ([char]0x221A) $Text Green }
    function Note([string]$Text) { Write-Line "!" $Text Yellow }
    function Fail([string]$Text) {
        Write-Host ""
        Write-Line "x" $Text Red
        Write-Host ""
    }

    Write-Host ""
    Write-Host "  " -NoNewline
    if ($color) { Write-Host ">_" -ForegroundColor Magenta -NoNewline } else { Write-Host ">_" -NoNewline }
    Write-Host " Vanitty installer"
    Write-Host ""

    # Without VANITTY_VERSION, look at the newest few releases, so a release
    # whose files are still being built falls back to the one before.
    if ($env:VANITTY_VERSION) {
        $api = "https://api.github.com/repos/$repo/releases/tags/v$($env:VANITTY_VERSION.TrimStart('v'))"
    } else {
        $api = "https://api.github.com/repos/$repo/releases?per_page=10"
    }
    try {
        # Unwrap the array, which Windows PowerShell 5.1 returns as one object.
        $releases = @(Invoke-RestMethod -Uri $api -Headers @{ Accept = "application/vnd.github+json" } | ForEach-Object { $_ })
    } catch {
        return Fail "Couldn't find the release at $api"
    }
    if (-not $env:VANITTY_VERSION) { $releases = @($releases | Where-Object { -not $_.prerelease }) }
    $release = $null
    $asset = $null
    foreach ($candidate in $releases) {
        $asset = $candidate.assets | Where-Object { $_.name -like "*-setup.exe" } | Select-Object -First 1
        if ($asset) { $release = $candidate; break }
    }
    if (-not $asset) { return Fail "No release has a setup.exe yet. See https://github.com/$repo/releases" }
    $version = $release.tag_name.TrimStart("v")
    $newest = $releases[0].tag_name.TrimStart("v")
    if ($newest -ne $version) { Note "Vanitty $newest is still being built, so installing $version instead." }

    Step "Found Vanitty $version for Windows x64"
    if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
        Note "This PC isn't x64. Vanitty will run under emulation."
    }

    $file = Join-Path ([IO.Path]::GetTempPath()) $asset.name
    $mb = [math]::Round($asset.size / 1MB)
    Write-Line ([char]0x2193) "Downloading $($asset.name) ($mb MB)" Magenta
    try {
        # curl.exe ships with Windows 10 and later and draws a progress bar.
        $curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue
        if ($curl) {
            & $curl.Source "-#fL" --retry 3 -o $file $asset.browser_download_url
            if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
        } else {
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing
        }
    } catch {
        Remove-Item $file -Force -ErrorAction SilentlyContinue
        return Fail "Download failed: $($asset.browser_download_url)"
    }

    try {
        if ($asset.digest) {
            $expected = $asset.digest -replace "^sha256:", ""
            if ((Get-FileHash -Algorithm SHA256 $file).Hash -ne $expected) {
                return Fail "Checksum mismatch for $($asset.name). The download may be corrupted; try again."
            }
            Step "Verified the SHA-256 checksum"
        }
        $proc = Start-Process -FilePath $file -ArgumentList "/S" -Wait -PassThru
        if ($proc.ExitCode -ne 0) { return Fail "The installer exited with code $($proc.ExitCode)" }
        Step "Installed Vanitty and added it to the Start menu"
    } finally {
        Remove-Item $file -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "  " -NoNewline
    if ($color) { Write-Host "Vanitty $version is installed." -ForegroundColor Green -NoNewline } else { Write-Host "Vanitty $version is installed." -NoNewline }
    Write-Host " Open it from the Start menu."
    Write-Host "  It updates itself in the background. Docs: https://vanitty.dev/docs/"
    Write-Host ""
}

Install-Vanitty
