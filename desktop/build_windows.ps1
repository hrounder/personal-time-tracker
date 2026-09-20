param(
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"
$DesktopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $DesktopDir
$BuildRoot = Join-Path $RepoRoot ".build-desktop"
$ReleaseRoot = Join-Path $RepoRoot "release"
$ProductDir = Join-Path $ReleaseRoot "PersonalTimeTracker"
$ZipPath = Join-Path $ReleaseRoot "personal-time-tracker-windows-portable-v0.5.0.zip"
$VenvPython = Join-Path $BuildRoot "venv\Scripts\python.exe"
$IconPath = Join-Path $BuildRoot "time-tracker.ico"

function Assert-ChildPath([string]$PathToCheck) {
  $repo = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\') + '\'
  $target = [IO.Path]::GetFullPath($PathToCheck)
  if (-not $target.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝操作项目目录之外的路径：$target"
  }
}

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令执行失败（退出代码 $LASTEXITCODE）：$Executable $($Arguments -join ' ')"
  }
}

Assert-ChildPath $BuildRoot
Assert-ChildPath $ProductDir
Assert-ChildPath $ZipPath

if (Test-Path -LiteralPath $BuildRoot) {
  Remove-Item -LiteralPath $BuildRoot -Recurse -Force
}
if (Test-Path -LiteralPath $ProductDir) {
  Remove-Item -LiteralPath $ProductDir -Recurse -Force
}
if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null

$env:PYTHONNOUSERSITE = "1"
$env:PYTHONUSERBASE = Join-Path $BuildRoot "userbase"
$env:PYINSTALLER_CONFIG_DIR = Join-Path $BuildRoot "pyinstaller-cache"
$env:PIP_CACHE_DIR = Join-Path $BuildRoot "pip-cache"

try {
  Invoke-Checked $PythonExe @("-m", "venv", (Join-Path $BuildRoot "venv"))
  Invoke-Checked $VenvPython @(
    "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir",
    "-r", (Join-Path $DesktopDir "requirements-build.txt")
  )
  Invoke-Checked $VenvPython @((Join-Path $DesktopDir "create_icon.py"), $IconPath)

  Invoke-Checked $VenvPython @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--windowed",
    "--name", "PersonalTimeTracker",
    "--contents-directory", "app",
    "--paths", $RepoRoot,
    "--add-data", "$RepoRoot\src;src",
    "--icon", $IconPath,
    "--version-file", (Join-Path $DesktopDir "version_info.txt"),
    "--distpath", $ReleaseRoot,
    "--workpath", (Join-Path $BuildRoot "work"),
    "--specpath", $BuildRoot,
    (Join-Path $DesktopDir "desktop_launcher.py")
  )

  foreach ($folder in @("data", "config", "backups")) {
    New-Item -ItemType Directory -Path (Join-Path $ProductDir $folder) -Force | Out-Null
  }
  Copy-Item -LiteralPath (Join-Path $DesktopDir "PORTABLE_README.txt") -Destination (Join-Path $ProductDir "README.txt")
  Compress-Archive -LiteralPath $ProductDir -DestinationPath $ZipPath -CompressionLevel Optimal

  Write-Host "绿色版已生成：$ProductDir"
  Write-Host "压缩包已生成：$ZipPath"
}
finally {
  if (Test-Path -LiteralPath $BuildRoot) {
    Remove-Item -LiteralPath $BuildRoot -Recurse -Force
  }
}
