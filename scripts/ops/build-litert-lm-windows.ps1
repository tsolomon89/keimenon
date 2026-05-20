$ErrorActionPreference = "Stop"

Write-Host "[Build] Starting Windows build for LiteRT-LM..."

$VendorDir = Resolve-Path "vendor\litert-lm" -ErrorAction SilentlyContinue
if (-not $VendorDir) {
    Write-Error "[Error] vendor\litert-lm directory not found. Please run 'npm run litert:fetch' first."
    exit 1
}
$VendorDir = $VendorDir.Path

# 1. Check Bazel availability
$BazelCmd = "bazel"
$BazelPath = Get-Command "bazel" -ErrorAction SilentlyContinue
if (-not $BazelPath) {
    Write-Host "[Check] Global bazel not found, checking for npx @bazel/bazelisk..."
    $NpxPath = Get-Command "npx" -ErrorAction SilentlyContinue
    if ($NpxPath) {
        $BazelCmd = @("npx", "--package=@bazel/bazelisk", "bazel")
        Write-Host "[Check] Using npx @bazel/bazelisk fallback."
    } else {
        Write-Error "[Error] Neither bazel nor npx found in PATH. Please install Bazelisk or Bazel."
        exit 1
    }
} else {
    Write-Host "[Check] Bazel is available globally: $($BazelPath.Path)"
}

# Set BAZEL_SH to Git Bash to prevent Bazel from invoking broken WSL bash.exe
$GitBashFound = $null

# 1. Search relative to git.exe in Path
$GitPath = Get-Command git -ErrorAction SilentlyContinue
if ($GitPath) {
    $GitDir = Split-Path $GitPath.Path
    $RelBash1 = Join-Path (Split-Path $GitDir) "bin\bash.exe"
    $RelBash2 = Join-Path (Split-Path $GitDir) "usr\bin\bash.exe"
    if (Test-Path $RelBash1) {
        $GitBashFound = $RelBash1
    } elseif (Test-Path $RelBash2) {
        $GitBashFound = $RelBash2
    }
}

# 2. Search registry keys if not found
if (-not $GitBashFound) {
    $RegPaths = @(
        "HKLM:\SOFTWARE\GitForWindows",
        "HKCU:\SOFTWARE\GitForWindows",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1"
    )
    foreach ($Reg in $RegPaths) {
        if (Test-Path $Reg) {
            $InstallPathVal = Get-ItemProperty -Path $Reg -Name InstallPath -ErrorAction SilentlyContinue
            if ($InstallPathVal -and $InstallPathVal.InstallPath) {
                $Path1 = Join-Path $InstallPathVal.InstallPath "bin\bash.exe"
                $Path2 = Join-Path $InstallPathVal.InstallPath "usr\bin\bash.exe"
                if (Test-Path $Path1) { $GitBashFound = $Path1; break }
                if (Test-Path $Path2) { $GitBashFound = $Path2; break }
            }
            $InstallLocVal = Get-ItemProperty -Path $Reg -Name InstallLocation -ErrorAction SilentlyContinue
            if ($InstallLocVal -and $InstallLocVal.InstallLocation) {
                $Path1 = Join-Path $InstallLocVal.InstallLocation "bin\bash.exe"
                $Path2 = Join-Path $InstallLocVal.InstallLocation "usr\bin\bash.exe"
                if (Test-Path $Path1) { $GitBashFound = $Path1; break }
                if (Test-Path $Path2) { $GitBashFound = $Path2; break }
            }
        }
    }
}

# 3. Check standard paths if still not found
if (-not $GitBashFound) {
    $GitBashPaths = @(
        "C:\Development\Git\bin\bash.exe",
        "C:\Development\Git\usr\bin\bash.exe",
        "C:\Program Files\Git\bin\bash.exe",
        "C:\Program Files\Git\usr\bin\bash.exe",
        "${env:ProgramFiles}\Git\bin\bash.exe",
        "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
        "${env:LOCALAPPDATA}\Programs\Git\bin\bash.exe",
        "C:\Git\bin\bash.exe"
    )
    foreach ($Path in $GitBashPaths) {
        if (Test-Path $Path) {
            $GitBashFound = $Path
            break
        }
    }
}

# 4. Fallback: check if bash is in PATH and not in System32
if (-not $GitBashFound) {
    $BashPath = Get-Command "bash" -ErrorAction SilentlyContinue
    if ($BashPath -and $BashPath.Path -notlike "*System32*") {
        $GitBashFound = $BashPath.Path
    }
}

if ($GitBashFound) {
    $env:BAZEL_SH = $GitBashFound
    Write-Host "[Check] Setting BAZEL_SH to Git Bash: $GitBashFound"
} else {
    Write-Warning "[Warning] Git Bash not found. Bazel may fail if it invokes WSL bash."
}

# 2. Check Visual Studio Build Tools availability
$VsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $VsWhere) {
    $VsPath = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $VsPath) {
        Write-Error "[Error] Visual Studio Build Tools with C++ workload not found."
        exit 1
    }
    Write-Host "[Check] Visual Studio Build Tools found at $VsPath"
} else {
    Write-Host "[Warning] vswhere.exe not found, assuming MSVC is in PATH or Bazel handles it."
}

# 3. Build command
Write-Host "[Build] Executing Bazel build..."
Push-Location $VendorDir
try {
    # Bazel command to build the engine orchestration and C API
    # Using '...' to build all available runtime targets and explicitly building //c:engine
    if ($BazelCmd -is [array]) {
        & $BazelCmd[0] $BazelCmd[1] $BazelCmd[2] build -c opt //c:engine --config=windows --copt=/Zc:nrvo- --shell_executable="$GitBashFound"
    } else {
        & $BazelCmd build -c opt //c:engine --config=windows --copt=/Zc:nrvo- --shell_executable="$GitBashFound"
    }
} catch {
    Write-Error "[Error] Bazel build failed."
    Pop-Location
    exit 1
}
Pop-Location

# 4. Collect outputs
$BindingNativeDir = "packages\litert-node-bindings\native\win32-x64"
$DesktopResDir = "apps\desktop\resources\native\win32-x64"

New-Item -ItemType Directory -Force "$BindingNativeDir\include" | Out-Null
New-Item -ItemType Directory -Force "$BindingNativeDir\lib" | Out-Null
New-Item -ItemType Directory -Force "$BindingNativeDir\bin" | Out-Null
New-Item -ItemType Directory -Force "$DesktopResDir" | Out-Null

Write-Host "[Stage] Copying build artifacts..."
# Expected Bazel outputs
$BazelBinDir = "$VendorDir\bazel-bin"

# We expect libLiteRt.dll from either prebuilt or bazel-bin
$PrebuiltDir = "$VendorDir\prebuilt\windows_x86_64"

if (Test-Path "$PrebuiltDir\libLiteRt.dll") {
    Copy-Item "$PrebuiltDir\libLiteRt.dll" "$BindingNativeDir\bin\" -Force
    Copy-Item "$PrebuiltDir\libLiteRt.dll" "$DesktopResDir\" -Force
    Write-Host "[Stage] Copied libLiteRt.dll from prebuilt directory."
} else {
    Write-Warning "[Warning] libLiteRt.dll not found in $PrebuiltDir. Native runtime will lack dependencies."
}

if (Test-Path "$PrebuiltDir\libLiteRtWebGpuAccelerator.dll") {
    Copy-Item "$PrebuiltDir\libLiteRtWebGpuAccelerator.dll" "$BindingNativeDir\bin\" -Force
    Copy-Item "$PrebuiltDir\libLiteRtWebGpuAccelerator.dll" "$DesktopResDir\" -Force
}

# Locate MSVC lib.exe
$LibExe = $null
if ($VsPath) {
    $LibExePath = Get-ChildItem -Path "$VsPath\VC\Tools\MSVC" -Recurse -Filter "lib.exe" | Where-Object { $_.FullName -like "*Hostx64\x64*" -and $_.FullName -notlike "*onecore*" } | Select-Object -First 1
    if ($LibExePath) {
        $LibExe = $LibExePath.FullName
        Write-Host "[Stage] Found MSVC lib.exe at: $LibExe"
    }
}
if (-not $LibExe) {
    $LibExePath = Get-Command "lib.exe" -ErrorAction SilentlyContinue
    if ($LibExePath) {
        $LibExe = $LibExePath.Path
        Write-Host "[Stage] Found lib.exe in PATH: $LibExe"
    }
}

# Collect and merge static libraries for linking
Write-Host "[Stage] Finding all compiled static libraries and object files..."

# Resolve physical paths of the bazel-bin and bazel-out directory junctions/symlinks
$SearchPaths = @()
foreach ($P in @("$VendorDir\bazel-bin", "$VendorDir\bazel-out")) {
    if (Test-Path $P) {
        $Item = Get-Item $P
        if ($Item.LinkType -and $Item.Target) {
            $Target = [string]$Item.Target
            $Target = $Target.Trim("{}")
            if (Test-Path $Target) {
                $SearchPaths += $Target
            } else {
                $SearchPaths += $P
            }
        } else {
            $SearchPaths += $P
        }
    }
}

Write-Host "[Stage] Searching under resolved physical paths: $SearchPaths"

$LibFiles = Get-ChildItem -Path $SearchPaths -Recurse -Include *.lib,*.a,*.lo.lib -ErrorAction SilentlyContinue | Where-Object {
    $_.FullName -notlike "*prebuilt*" -and 
    $_.Name -ne "litert_lm_engine.lib" -and
    $_.FullName -notlike "*exec*" -and
    $_.FullName -notlike "*host*" -and
    $_.FullName -notlike "*runfiles*"
}

$ObjFiles = Get-ChildItem -Path $SearchPaths -Recurse -Include *.obj -ErrorAction SilentlyContinue | Where-Object {
    $_.FullName -notlike "*prebuilt*" -and 
    $_.FullName -notlike "*exec*" -and
    $_.FullName -notlike "*host*" -and
    $_.FullName -notlike "*runfiles*" -and
    ($_.FullName -like "*_objs/engine*" -or $_.FullName -like "*/c/_objs/*" -or $_.FullName -like "*\c\_objs\*")
}

$AllInputs = @()
if ($LibFiles) { $AllInputs += $LibFiles }
if ($ObjFiles) { $AllInputs += $ObjFiles }

if ($AllInputs.Count -gt 0) {
    $UniqueLibs = @{}
    foreach ($L in $AllInputs) {
        if (-not $UniqueLibs.ContainsKey($L.Name) -or $L.LastWriteTime -gt $UniqueLibs[$L.Name].LastWriteTime) {
            $UniqueLibs[$L.Name] = $L
        }
    }
    $FatLibPath = "$BindingNativeDir\lib\litert_lm_engine.lib"
    
    if ($LibExe) {
        Write-Host "[Stage] Merging $($UniqueLibs.Count) libraries and object files into litert_lm_engine.lib..."
        $RspPath = Join-Path $BindingNativeDir "libs.rsp"
        $RspLines = @("/OUT:$FatLibPath")
        foreach ($L in $UniqueLibs.Values) {
            $RspLines += "`"$($L.FullName)`""
        }
        [System.IO.File]::WriteAllLines($RspPath, $RspLines)
        
        Write-Host "[Stage] Invoking $LibExe @$RspPath"
        & $LibExe "@$RspPath"
        
        if (Test-Path $RspPath) {
            Remove-Item $RspPath -Force
        }
        
        if (Test-Path $FatLibPath) {
            Write-Host "[Stage] Successfully created fat static library: $FatLibPath"
        } else {
            Write-Error "[Error] Merging libraries failed."
        }
    } else {
        Write-Warning "[Warning] lib.exe not found. Copying all individually instead."
        foreach ($L in $UniqueLibs.Values) {
            Copy-Item $L.FullName "$BindingNativeDir\lib\" -Force
        }
    }
} else {
    Write-Warning "[Warning] No libraries or object files found in bazel-bin/bazel-out. Linkage may fail."
}

# Collect runtime headers
$HeadersSource = "$VendorDir\runtime"
$HeadersDest = "$BindingNativeDir\include"
if (Test-Path $HeadersSource) {
    Get-ChildItem -Path $HeadersSource -Recurse -Filter "*.h" | ForEach-Object {
        $RelPath = $_.FullName.Substring($HeadersSource.Length + 1)
        $TargetDir = Split-Path -Path "$HeadersDest\$RelPath" -Parent
        if (-not (Test-Path $TargetDir)) {
            New-Item -ItemType Directory -Force $TargetDir | Out-Null
        }
        Copy-Item $_.FullName "$HeadersDest\$RelPath" -Force
    }
    Write-Host "[Stage] Copied runtime headers."
}

# Collect C API headers
$CHeadersSource = "$VendorDir\c"
$CHeadersDest = "$BindingNativeDir\include\c"
if (Test-Path $CHeadersSource) {
    New-Item -ItemType Directory -Force $CHeadersDest | Out-Null
    Get-ChildItem -Path $CHeadersSource -Filter "*.h" | ForEach-Object {
        Copy-Item $_.FullName "$CHeadersDest\" -Force
    }
    Write-Host "[Stage] Copied C API headers."
}

Write-Host "[Build] LiteRT-LM Windows build complete."
