$gitPath = Get-Command git -ErrorAction SilentlyContinue
if ($gitPath) {
    Write-Host "Git found in path: $($gitPath.Path)"
    $gitDir = Split-Path $gitPath.Path
    $possibleBash = Join-Path (Split-Path $gitDir) "bin\bash.exe"
    if (Test-Path $possibleBash) { Write-Host "Found bash at: $possibleBash" }
    $possibleBash2 = Join-Path (Split-Path $gitDir) "usr\bin\bash.exe"
    if (Test-Path $possibleBash2) { Write-Host "Found bash at: $possibleBash2" }
} else {
    Write-Host "Git not found in PATH"
}

# Check registry
$regPaths = @(
    "HKLM:\SOFTWARE\GitForWindows",
    "HKCU:\SOFTWARE\GitForWindows",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1"
)
foreach ($reg in $regPaths) {
    if (Test-Path $reg) {
        $val = Get-ItemProperty -Path $reg -Name InstallPath -ErrorAction SilentlyContinue
        if ($val) { Write-Host "Registry $reg InstallPath: $($val.InstallPath)" }
        $val2 = Get-ItemProperty -Path $reg -Name InstallLocation -ErrorAction SilentlyContinue
        if ($val2) { Write-Host "Registry $reg InstallLocation: $($val2.InstallLocation)" }
    }
}

# Check AppData local programs
$appdataGit = "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
if (Test-Path $appdataGit) { Write-Host "Found AppData Git bash: $appdataGit" }
