#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Install Orkeon Code (Windows) from its runnable archive, no administrator rights (twin of install.sh).

.DESCRIPTION
  Puts the program in <Prefix>\<version>\ and writes <Prefix>\bin\orkeon-code.cmd, which starts that version's
  orkeon-code.ps1 on the PowerShell that ships with Windows, under an execution policy that holds for that one
  command (as Orkeon's own wrappers do): cmd.exe and PowerShell both find `orkeon-code`. The files come from, the
  first that applies: -Archive (a .zip, checked against the SHA256SUMS beside it when there is one); the extracted
  archive this script sits in; else the archive of the release this script was published with, downloaded with its
  SHA256SUMS and checked. Run twice, it changes nothing. -Uninstall removes the versions this script installed in
  <Prefix> and its own bin\orkeon-code.cmd, nothing else there, and never %USERPROFILE%\.orkeon-code (your
  settings, trust decisions and state). The installed copy (<Prefix>\<version>\scripts\install.ps1) knows its
  own <Prefix>.

.EXAMPLE
  .\install.ps1
  .\install.ps1 -Archive .\orkeon-code-0.1.0.zip
  .\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string] $Prefix = (Join-Path $env:LOCALAPPDATA 'Programs\orkeon-code'),
  [string] $Archive = '',
  [switch] $Uninstall
)
$ErrorActionPreference = 'Stop'

# Stamped by the release (scripts/build-install-archive.sh) in the copy it publishes alone.
$ReleaseVersion = ''
$Repository = 'https://github.com/Orkeon/orkeon-code'

function Test-Sum([string] $file, [string] $sums) {
  $name = Split-Path $file -Leaf
  $line = Get-Content $sums | Where-Object { ($_ -split '\s+', 2)[1] -in @($name, "*$name") } | Select-Object -First 1
  if (-not $line) { throw "$name is not listed in ${sums}: checksum not verified." }
  $expected = ($line -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "checksum mismatch for $file (SHA256SUMS says $expected)." }
}

# The installed copy (<Prefix>\<version>\scripts\install.ps1) knows its own prefix.
if (-not $PSBoundParameters.ContainsKey('Prefix')) {
  $selfPrefix = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  if ((Test-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'orkeon-code.ps1')) -and
      (Test-Path (Join-Path $selfPrefix 'bin\orkeon-code.cmd'))) { $Prefix = $selfPrefix }
}
$Prefix = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Prefix)
$bin = Join-Path $Prefix 'bin'
$cmd = Join-Path $bin 'orkeon-code.cmd'
$marker = 'written by install.ps1'

if ($Uninstall) {
  # Only what this script put there: the version folders (a launcher and the package.json of orkeon-code, never a
  # git clone: no .git), their staging copies and its own .cmd; the folders are removed when that leaves them empty.
  if (Test-Path -LiteralPath $Prefix) {
    Get-ChildItem -LiteralPath $Prefix -Directory -Force | Where-Object {
      -not (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) -and
      (Test-Path (Join-Path $_.FullName 'orkeon-code.ps1')) -and (Test-Path (Join-Path $_.FullName 'package.json')) -and
      ((Get-Content (Join-Path $_.FullName 'package.json') -Raw | ConvertFrom-Json).name -eq 'orkeon-code')
    } | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
    if ((Test-Path -LiteralPath $cmd) -and ([IO.File]::ReadAllText($cmd).Contains($marker))) { Remove-Item -LiteralPath $cmd -Force }
    foreach ($dir in @($bin, $Prefix)) {
      if ((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force)) { Remove-Item -LiteralPath $dir -Force }
    }
  }
  $codeHome = if ($env:ORKEON_CODE_HOME) { $env:ORKEON_CODE_HOME } else { Join-Path $HOME '.orkeon-code' }
  Write-Host "Orkeon Code removed from $Prefix. Your settings and state in $codeHome are kept."
  exit 0
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("orkeon-code-install-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $here = Split-Path $PSScriptRoot -Parent
  $src = $null
  if ($Archive) {
    if (-not (Test-Path -LiteralPath $Archive -PathType Leaf)) { throw "archive not found: $Archive" }
    $sums = Join-Path (Split-Path (Resolve-Path -LiteralPath $Archive).Path -Parent) 'SHA256SUMS'
    if (Test-Path -LiteralPath $sums) { Test-Sum (Resolve-Path -LiteralPath $Archive).Path $sums }
    else { Write-Warning "no SHA256SUMS beside $Archive, checksum not verified." }
    Expand-Archive -LiteralPath $Archive -DestinationPath $work
  } elseif ((Test-Path (Join-Path $here 'orkeon-code.ps1')) -and (Test-Path (Join-Path $here 'package.json')) -and
            (Test-Path (Join-Path $here '.orkeon-version'))) {
    if ((Resolve-Path $here).Path.StartsWith((Join-Path $Prefix ''), [StringComparison]::OrdinalIgnoreCase)) {
      throw "this is the installed copy in ${Prefix}: run install.ps1 from an extracted archive, or pass -Archive or -Uninstall."
    }
    if ((Test-Path (Join-Path $here '.git')) -or (Test-Path (Join-Path $here 'tests'))) {
      throw "$here is a checkout: run .\orkeon-code.ps1 from it, or install a release archive (-Archive)."
    }
    $src = $here
  } else {
    if (-not $ReleaseVersion) { throw 'no archive: pass -Archive, or run the install.ps1 published with a release.' }
    $name = "orkeon-code-$ReleaseVersion.zip"
    $base = "$Repository/releases/download/v$ReleaseVersion"
    Write-Host "Downloading $base/$name"
    Invoke-WebRequest -Uri "$base/$name" -OutFile (Join-Path $work $name) -UseBasicParsing
    Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile (Join-Path $work 'SHA256SUMS') -UseBasicParsing
    Test-Sum (Join-Path $work $name) (Join-Path $work 'SHA256SUMS')
    Expand-Archive -LiteralPath (Join-Path $work $name) -DestinationPath $work
  }
  if (-not $src) {
    # The archive holds one folder, orkeon-code-<version>\.
    $found = Get-ChildItem -LiteralPath $work -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'orkeon-code.ps1') } |
             Select-Object -First 1
    if (-not $found) { throw 'the archive holds no orkeon-code-<version>\orkeon-code.ps1 launcher.' }
    $src = $found.FullName
  }
  $version = (Get-Content (Join-Path $src 'package.json') -Raw | ConvertFrom-Json).version
  if (-not $version) { throw "no version in $src\package.json." }

  $target = Join-Path $Prefix $version
  New-Item -ItemType Directory -Force -Path $Prefix, $bin | Out-Null
  $same = $false
  if (Test-Path -LiteralPath $target) {
    $hash = { param($dir) Get-ChildItem -LiteralPath $dir -Recurse -File | Sort-Object FullName |
              ForEach-Object { $_.FullName.Substring($dir.Length) + ' ' + (Get-FileHash -LiteralPath $_.FullName).Hash } }
    $same = -not (Compare-Object @(& $hash $src) @(& $hash $target))
  }
  if ($same) {
    Write-Host "Orkeon Code $version already installed in $target."
  } else {
    $staging = Join-Path $Prefix ".$version.new"
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    Copy-Item -LiteralPath $src -Destination $staging -Recurse
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Move-Item -LiteralPath $staging -Destination $target
    Write-Host "Orkeon Code $version installed in $target."
  }

  # The command: a .cmd only, so PowerShell never finds a .ps1 here that its execution policy would refuse. It
  # names the launcher relative to itself (%~dp0), so the file stays ASCII whatever the profile path holds, and
  # orkeon-code.ps1 takes the long options (--settings x) as typed.
  if ((Test-Path -LiteralPath $cmd) -and -not ([IO.File]::ReadAllText($cmd).Contains($marker))) {
    throw "$cmd was not written by install.ps1: move it away, or choose another -Prefix."
  }
  $wrapper = "@echo off`r`nrem Orkeon Code $version, $marker.`r`n" +
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0..\$version\orkeon-code.ps1`" %*`r`n" +
    "exit /b %errorlevel%`r`n"
  $current = if (Test-Path -LiteralPath $cmd) { [IO.File]::ReadAllText($cmd) } else { $null }
  if ($current -ne $wrapper) { [IO.File]::WriteAllText($cmd, $wrapper, [Text.Encoding]::ASCII) }

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (($userPath -split ';') -contains $bin)) {
    Write-Host "$bin is not on your PATH. Add it once (a new terminal then finds orkeon-code):"
    Write-Host "  [Environment]::SetEnvironmentVariable('Path', `"$bin;`" + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')"
  }
  $first = Get-Command orkeon-code -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($first -and $first.Source -ne $cmd) {
    Write-Warning "$($first.Source) comes first on your PATH, before $cmd ('orkeon-code --version' says which runs)."
  }
  Write-Host 'Run: orkeon-code --version'
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
