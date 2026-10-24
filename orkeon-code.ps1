#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Start the Orkeon Code REPL on a project (Windows / PowerShell twin of ./orkeon-code).

.EXAMPLE
  .\orkeon-code.ps1                              # the current directory is the project
  .\orkeon-code.ps1 -Workspace C:\src\app
  .\orkeon-code.ps1 -Mode docker -Settings .\config\appsettings.local.json
  .\orkeon-code.ps1 -Trust                       # this run only, without asking (nothing stored)
  .\orkeon-code.ps1 trust list | add <path> | remove <path> | check <path> [--trust]
  .\orkeon-code.ps1 setup                        # write %USERPROFILE%\.orkeon-code\appsettings.json (never the key)

.NOTES
  Modes: tool (orkeon-repl on PATH, from the full Orkeon release .zip (the .msi has no orkeon-repl), the
  Debian package or the dotnet tool, or $env:ORKEON_REPL) and docker
  (ghcr.io/orkeon/orkeon-runners:<.orkeon-version>). The source mode is only in the
  bash launcher. Folder trust, settings, API key, model and $env:ORKEON_CODE_AUDIO_DIR (speech-to-text,
  tool mode): see the header of ./orkeon-code.
#>
# No positional binding: a bare word (trust, setup, a REPL argument) lands in $Extra, never in -Mode.
[CmdletBinding(PositionalBinding = $false)]
param(
  [ValidateSet('', 'docker', 'tool')] [string] $Mode = $env:ORKEON_CODE_MODE,
  [string] $Workspace = (Get-Location).Path,
  [string] $Settings = $env:ORKEON_CODE_SETTINGS,
  [switch] $Version,
  [switch] $Trust,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]] $Extra = @()
)
$ErrorActionPreference = 'Stop'

# A subcommand of ./orkeon-code (trust, setup) is the first argument, and takes the rest as its own.
$Sub = $null
$SubArgs = @()
if ($Extra.Count -gt 0 -and $Extra[0] -cin @('trust', 'setup')) {
  $Sub = $Extra[0]
  $SubArgs = @($Extra | Select-Object -Skip 1)
  $Extra = @()
}

# The long options of ./orkeon-code, as a .cmd wrapper passes them (%*): --settings x, --settings=x, --workspace,
# --mode, --version and --trust bind the parameters above; a -- left in the arguments is dropped, and what follows
# it goes to the REPL as is.
$rest = @()
for ($i = 0; $i -lt $Extra.Count; $i++) {
  $a = $Extra[$i]
  if ($a -eq '--') {
    if ($i + 1 -lt $Extra.Count) { $rest += $Extra[($i + 1)..($Extra.Count - 1)] }
    break
  }
  $name = $a; $value = $null
  if ($a -match '^(--(?:settings|workspace|mode))=(.*)$') { $name = $Matches[1]; $value = $Matches[2] }
  if ($name -eq '--version') { $Version = [switch] $true }
  elseif ($name -eq '--trust') { $Trust = [switch] $true }
  elseif ($name -in @('--settings', '--workspace', '--mode')) {
    if ($null -eq $value) {
      if ($i + 1 -ge $Extra.Count) { throw "$name needs a value." }
      $i++; $value = $Extra[$i]
    }
    if ($name -eq '--settings') { $Settings = $value }
    elseif ($name -eq '--workspace') { $Workspace = $value }
    else { $Mode = $value }
  } else { $rest += $a }
}
$Extra = $rest

# ── Folder trust (as ./orkeon-code: the same store, the same layout, the same answers) ──
# Windows compares paths without case; elsewhere as they are.
$onWindows = [Environment]::OSVersion.Platform -eq 'Win32NT'

function Get-TrustFile { Join-Path $CodeHome 'trusted-folders.json' }

# The stored folders, as { Path; TrustedAt }; throws, naming the file, on a store it cannot read. The layout is
# the one Write-TrustStore gives, checked line by line as ./orkeon-code's awk does (no ConvertFrom-Json: pwsh 7 would
# turn the dates into DateTime, and would take a layout the bash launcher refuses).
function Get-TrustEntries {
  $file = Get-TrustFile
  if (-not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -eq 0) { return }
  $bad = "$file is not a trust store this launcher wrote: nothing is trusted, and the file is kept as it is. " +
         'Fix it, or move it away and trust your folders again (orkeon-code trust add <path>).'
  $str = '"((?:[^"\\\x00-\x1f]|\\["\\/])*)"'
  $entry = '^[ \t]*\{[ \t]*"path"[ \t]*:[ \t]*' + $str + '[ \t]*,[ \t]*"trustedAt"[ \t]*:[ \t]*' + $str + '[ \t]*\}[ \t]*(,?)[ \t]*$'
  $unescape = { param($v) [regex]::Replace($v, '\\(["\\/])', '$1') }
  $lines = @([System.IO.File]::ReadAllLines($file) | ForEach-Object { $_ -replace "`r$", '' } | Where-Object { $_ -notmatch '^[ \t]*$' })
  $out = @()
  $step = 0; $comma = $false
  foreach ($line in $lines) {
    switch ($step) {
      0 { if ($line -cnotmatch '^[ \t]*\{[ \t]*$') { throw $bad }; $step = 1 }
      1 { if ($line -cnotmatch '^[ \t]*"version"[ \t]*:[ \t]*1[ \t]*,[ \t]*$') { throw $bad }; $step = 2 }
      2 {
        if ($line -cmatch '^[ \t]*"folders"[ \t]*:[ \t]*\[[ \t]*\][ \t]*$') { $step = 4 }
        elseif ($line -cmatch '^[ \t]*"folders"[ \t]*:[ \t]*\[[ \t]*$') { $step = 3 }
        else { throw $bad }
      }
      3 {
        if ($line -cmatch '^[ \t]*\][ \t]*$') { if ($out.Count -gt 0 -and $comma) { throw $bad }; $step = 4 }
        else {
          if ($out.Count -gt 0 -and -not $comma) { throw $bad }
          $m = [regex]::Match($line, $entry)
          if (-not $m.Success -or -not $m.Groups[1].Value) { throw $bad }
          $out += [pscustomobject]@{ Path = (& $unescape $m.Groups[1].Value); TrustedAt = (& $unescape $m.Groups[2].Value) }
          $comma = $m.Groups[3].Value -eq ','
        }
      }
      4 { if ($line -cnotmatch '^[ \t]*\}[ \t]*$') { throw $bad }; $step = 5 }
      default { throw $bad }
    }
  }
  if ($step -ne 5) { throw $bad }
  $out
}

# Readable and writable by the user alone where modes exist: SetUnixFileMode from .NET 7 (PowerShell 7.3), else chmod.
function Set-OwnerOnly([string] $path, [string] $mode) {
  if ($onWindows) { return }
  try { [System.IO.File]::SetUnixFileMode($path, $(if ($mode -eq '700') { 'UserRead, UserWrite, UserExecute' } else { 'UserRead, UserWrite' })) }
  catch { & chmod $mode -- $path 2>$null }
}

# Writes the store in ./orkeon-code's layout, one folder per line: a temporary file, then a rename.
function Write-TrustStore($entries) {
  $file = Get-TrustFile
  if (-not (Test-Path -LiteralPath $CodeHome)) { New-Item -ItemType Directory -Force -Path $CodeHome | Out-Null; Set-OwnerOnly $CodeHome '700' }
  $escape = { param($s) ($s -replace '\\', '\\') -replace '"', '\"' }
  $lines = @($entries | ForEach-Object { '    { "path": "' + (& $escape $_.Path) + '", "trustedAt": "' + (& $escape $_.TrustedAt) + '" }' })
  $folders = if ($lines.Count -eq 0) { "  `"folders`": []`n" } else { "  `"folders`": [`n" + ($lines -join ",`n") + "`n  ]`n" }
  $tmp = "$file.tmp.$PID"
  [System.IO.File]::WriteAllText($tmp, "{`n  `"version`": 1,`n$folders}`n")
  Set-OwnerOnly $tmp '600'
  Move-Item -LiteralPath $tmp -Destination $file -Force
}

# The folder, full and with every link on its path resolved (bash's `pwd -P`), or $null when it is not a folder
# or a link on its path cannot be resolved.
function Get-CanonicalDir([string] $path) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (-not $item -or -not $item.PSIsContainer) { return $null }
  $full = $item.FullName
  if (-not $onWindows) {
    $real = & sh -c 'cd -- "$1" && pwd -P' sh $full 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $real) { return $null }
    return "$real"
  }
  # Windows: each component in turn; a link (symbolic link, junction) replaces the path up to it by its target.
  for ($n = 0; $n -lt 40; $n++) {
    $full = [System.IO.Path]::GetFullPath($full)
    $root = [System.IO.Path]::GetPathRoot($full)
    $parts = @($full.Substring($root.Length).Split([char[]] @('\', '/'), [StringSplitOptions]::RemoveEmptyEntries))
    $cur = $root
    $changed = $false
    for ($i = 0; $i -lt $parts.Count; $i++) {
      $cur = Join-Path $cur $parts[$i]
      $link = Get-Item -LiteralPath $cur -Force -ErrorAction SilentlyContinue
      if ($link -and $link.LinkType) {
        $target = "$(@($link.Target)[0])" -replace '^\\\\\?\\', ''
        if (-not $target) { return $null }
        if (-not [System.IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path $cur -Parent) $target }
        $full = if ($i + 1 -lt $parts.Count) { Join-Path $target ($parts[($i + 1)..($parts.Count - 1)] -join '\') } else { $target }
        $changed = $true
        break
      }
    }
    if (-not $changed) {
      if ($full.Length -gt $root.Length) { $full = $full.TrimEnd('\', '/') }
      return $full
    }
  }
  $null
}

# The stored folder that covers <folder> (itself or an ancestor), or $null.
function Get-TrustedBy([string] $folder) {
  $cmp = if ($onWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
  $sep = [string] [System.IO.Path]::DirectorySeparatorChar
  foreach ($e in @(Get-TrustEntries)) {
    if ([string]::Equals($e.Path, $folder, $cmp)) { return $e.Path }
    $prefix = if ($e.Path.EndsWith($sep)) { $e.Path } else { $e.Path + $sep }  # a root (/, C:\) ends with one already
    if ($folder.StartsWith($prefix, $cmp)) { return $e.Path }
  }
  $null
}

function Add-TrustedFolder([string] $folder) {
  if ($folder -match '[\x00-\x1f]') { throw "A folder whose path holds a control character cannot be trusted: $folder" }
  $entries = @(Get-TrustEntries)
  Write-TrustStore ($entries + [pscustomobject]@{ Path = $folder; TrustedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ') })
}

# Returns when <folder> may start: trusted, -Trust or CI, or trusted now in a terminal; exits otherwise
# (<declined> on a decline, 3 without a terminal). Nothing of the folder is read here.
function Confirm-Trusted([string] $folder, [bool] $given, [int] $declined) {
  if ($given -or ($env:ORKEON_CODE_TRUST -eq '1' -and $env:CI -ceq 'true')) { return }
  if (Get-TrustedBy $folder) { return }
  if ([Console]::IsInputRedirected) {
    [Console]::Error.WriteLine("orkeon-code: $folder is not a trusted folder, and there is no terminal to ask in. Trust it once with " +
                               "'orkeon-code trust add $folder', or pass --trust for this run only.")
    exit 3
  }
  [Console]::Error.WriteLine('orkeon-code: do you trust the files in this folder?')
  [Console]::Error.WriteLine("  $folder")
  [Console]::Error.WriteLine('  The agent reads its AGENTS.md, .orkeon/config.json and .orkeon/repo.yaml, may run the commands')
  [Console]::Error.WriteLine("  .orkeon/repo.yaml names, and git runs the folder's hooks through the shell.")
  if ([System.IO.Path]::GetPathRoot($folder) -eq $folder -or $folder -eq (Get-CanonicalDir $HOME)) {
    [Console]::Error.WriteLine('  This trusts every folder below it.')
  }
  [Console]::Error.Write('[y] trust  [n] quit: ')
  $answer = [Console]::In.ReadLine()
  if ("$answer".Trim().ToLowerInvariant() -in @('y', 'yes')) {
    Add-TrustedFolder $folder
    [Console]::Error.WriteLine("orkeon-code: trusted $folder (orkeon-code trust remove $folder takes it back).")
  } else {
    [Console]::Error.WriteLine('orkeon-code: not trusted, nothing started.')
    exit $declined
  }
}

# ── Settings: setup (as ./orkeon-code setup; the key is never asked) ──
# One line asked on the terminal: the answer, trimmed, or <default> when empty; $null at the end of input.
function Read-Answer([string] $question, [string] $default) {
  [Console]::Error.Write($question)
  $answer = [Console]::In.ReadLine()
  if ($null -eq $answer) { return $null }
  $answer = $answer.Trim()
  if ($answer) { $answer } else { $default }
}

# Writes <target> from one of the examples, with the model and the name of the key's variable; $false when the
# user stops or keeps the existing file.
function Invoke-Setup([string] $target) {
  if ([Console]::IsInputRedirected) { throw "setup asks its questions in a terminal: run 'orkeon-code setup' in one." }
  if (Test-Path -LiteralPath $target) {
    $answer = Read-Answer "orkeon-code: $target exists. Replace it? [y/N] " 'n'
    if ("$answer".ToLowerInvariant() -notin @('y', 'yes')) { [Console]::Error.WriteLine("orkeon-code: $target kept."); return $false }
  }
  [Console]::Error.WriteLine("orkeon-code setup: the settings go to $target. The API key never does: only the name of the")
  [Console]::Error.WriteLine('environment variable that holds it.')
  [Console]::Error.WriteLine('  [1] a hosted, OpenAI-compatible endpoint (config/appsettings.example.json: DeepSeek)')
  [Console]::Error.WriteLine('  [2] Ollama on this machine, no key (config/appsettings.ollama.example.json)')
  while ($true) {
    $answer = Read-Answer 'Provider [1]: ' '1'
    if ($null -eq $answer) { return $false }
    if ($answer -eq '1') { $example = Join-Path $Root 'config/appsettings.example.json'; break }
    if ($answer -eq '2') { $example = Join-Path $Root 'config/appsettings.ollama.example.json'; break }
    [Console]::Error.WriteLine('orkeon-code: answer 1 or 2.')
  }
  $settings = Get-Content -LiteralPath $example -Raw -Encoding UTF8 | ConvertFrom-Json
  $defaultVar = $settings.Llm.ApiKeyEnvVar
  while ($true) {
    $model = Read-Answer "Model [$($settings.Llm.Model)]: " $settings.Llm.Model
    if ($null -eq $model) { return $false }
    # Never said back, and refused when it looks like a key: a key pasted at the wrong question.
    if ($model -cmatch '^[A-Za-z0-9._:/@+-]+$' -and $model -cnotmatch '^sk-' -and $model -cnotmatch '^[A-Za-z0-9_-]{32,}$') { break }
    [Console]::Error.WriteLine('orkeon-code: that is not a model id (letters, digits and . _ : / @ + -, not a key).')
  }
  $var = $null
  if ($defaultVar) {
    while ($true) {
      $var = Read-Answer "Name of the environment variable that holds the API key [$defaultVar]: " $defaultVar
      if ($null -eq $var) { return $false }
      if ($var -cmatch '^[A-Z_][A-Z0-9_]{0,63}$') { break }
      # Never said back: what was typed may be the key itself.
      [Console]::Error.WriteLine('orkeon-code: that is not a variable name (capitals, digits and _). Type the name of the variable, never the key.')
    }
    $settings.Llm.ApiKeyEnvVar = $var
  }
  $settings.Llm.Model = $model
  $settings._comment = 'Written by orkeon-code setup. The API key never goes in this file: ApiKeyEnvVar names the environment ' +
                       'variable that holds it, and ORKEON_Llm__ApiKey, when set, wins over everything. Every key is explained in docs/configuration.md.'
  if (-not (Test-Path -LiteralPath $CodeHome)) { New-Item -ItemType Directory -Force -Path $CodeHome | Out-Null; Set-OwnerOnly $CodeHome '700' }
  $tmp = "$target.tmp.$PID"
  [System.IO.File]::WriteAllText($tmp, ($settings | ConvertTo-Json -Depth 20) + "`n")
  Set-OwnerOnly $tmp '600'
  Move-Item -LiteralPath $tmp -Destination $target -Force
  [Console]::Error.WriteLine("orkeon-code: wrote $target (model $model).")
  if ($var) { [Console]::Error.WriteLine("orkeon-code: set the key before you start: `$env:$var = '<your key>'") }
  $true
}

# The variables set below for the REPL are put back as they were when the script ends, so that none of them stays
# in the PowerShell session that ran it.
$savedEnv = @{}
foreach ($name in @('ORKEON_Llm__Model', 'Orkeon__Security__PermissionGate__Enabled', 'Orkeon__Cli__Session__StartScript',
                    'ORKEON_ESBUILD_PATH',
                    'ORKEON_ALLOW_EXTERNAL_MOUNTS', 'WHISPER_AUDIO_DIR', 'WHISPER_OUT_DIR',
                    'ORKEON_MCP__Servers__whisper__Transport', 'ORKEON_MCP__Servers__whisper__Command',
                    'ORKEON_MCP__Servers__whisper__Args__0', 'ORKEON_MCP__Servers__whisper__Args__1',
                    'ORKEON_MCP__Servers__whisper__Args__2', 'ORKEON_MCP__Servers__whisper__Args__3',
                    'ORKEON_MCP__Servers__whisper__Args__4', 'ORKEON_MCP__Servers__whisper__Args__5',
                    'ORKEON_MCP__Servers__whisper__Args__6', 'ORKEON_MCP__Servers__whisper__Args__7',
                    'ORKEON_MCP__Servers__whisper__Args__8', 'ORKEON_MCP__Servers__whisper__Args__9',
                    'ORKEON_MCP__Servers__whisper__Args__10', 'ORKEON_MCP__Servers__whisper__Args__11',
                    'WHISPER_MICROPHONE', 'WHISPER_SPEAKER', 'UV_PROJECT_ENVIRONMENT')) {
  $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
  $Root = $PSScriptRoot
  $OrkeonVersion = (Get-Content (Join-Path $Root '.orkeon-version') -Raw).Trim()
  $Image = if ($env:ORKEON_CODE_IMAGE) { $env:ORKEON_CODE_IMAGE } else { "ghcr.io/orkeon/orkeon-runners:$OrkeonVersion" }
  $codeVersion = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
  # A clone (a .git, or the tests of an unpacked source archive) or an install, whose folder is never written to:
  # an install's state goes under ORKEON_CODE_HOME (%USERPROFILE%\.orkeon-code).
  $IsClone = Test-Path (Join-Path $Root '.git')
  if (-not $IsClone) { $IsClone = Test-Path (Join-Path $Root 'tests') -PathType Container }
  $CodeHome = if ($env:ORKEON_CODE_HOME) { $env:ORKEON_CODE_HOME } else { Join-Path $HOME '.orkeon-code' }
  # Where the settings are looked for: %APPDATA% on Windows; elsewhere the XDG base the runtime uses (an absolute
  # XDG_CONFIG_HOME, else ~/.config), as ./orkeon-code does.
  $configBase = if ($env:APPDATA) { $env:APPDATA }
                elseif ($env:XDG_CONFIG_HOME -and [System.IO.Path]::IsPathRooted($env:XDG_CONFIG_HOME)) { $env:XDG_CONFIG_HOME }
                else { Join-Path $HOME '.config' }
  $homeSettings = Join-Path $CodeHome 'appsettings.json'
  $legacySettings = Join-Path $configBase 'orkeon-code/appsettings.json'
  # What `orkeon init` writes and the REPL reads when no --settings is given (RunnerSettings.GetGlobalSettingsPath).
  $runtimeSettings = Join-Path $configBase 'Orkeon/appsettings.json'

  if ($Sub -eq 'setup') { if (Invoke-Setup $homeSettings) { exit 0 } else { exit 1 } }
  if ($Sub -eq 'trust') {
    $verb = if ($SubArgs.Count -gt 0) { $SubArgs[0] } else { '' }
    $arg = if ($SubArgs.Count -gt 1) { $SubArgs[1] } else { $null }
    $usage = 'usage: orkeon-code trust list | add <path> | remove <path> | check <path> [--trust]'
    switch -CaseSensitive ($verb) {
      'list' {
        foreach ($e in @(Get-TrustEntries)) { Write-Output "$($e.Path)  (trusted $($e.TrustedAt))" }
        exit 0
      }
      'add' {
        if (-not $arg) { throw 'trust add needs a folder.' }
        $folder = Get-CanonicalDir $arg
        if (-not $folder) { throw "Not a folder: $arg" }
        $by = Get-TrustedBy $folder
        if ($by -eq $folder) { Write-Output "orkeon-code: $folder is already trusted."; exit 0 }
        if ($by) { Write-Output "orkeon-code: $folder is already trusted, through $by."; exit 0 }
        Add-TrustedFolder $folder
        Write-Output "orkeon-code: trusted $folder."
        exit 0
      }
      'remove' {
        if (-not $arg) { throw 'trust remove needs a folder.' }
        $target = Get-CanonicalDir $arg
        if (-not $target) { $target = if ($arg.Length -gt [System.IO.Path]::GetPathRoot($arg).Length) { $arg.TrimEnd('\', '/') } else { $arg } }
        $cmp = if ($onWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
        $entries = @(Get-TrustEntries)
        $kept = @($entries | Where-Object { -not [string]::Equals($_.Path, $target, $cmp) })
        if ($kept.Count -eq $entries.Count) {
          $by = Get-TrustedBy $target
          if ($by) { throw "$target is not in the store: it is trusted through $by." }
          throw "$target is not a trusted folder."
        }
        Write-TrustStore $kept
        Write-Output "orkeon-code: $target is no longer trusted."
        exit 0
      }
      'check' {
        # 0: it may start; 3: refused, no terminal; 4: declined in the terminal.
        if (-not $arg) { throw 'trust check needs a folder.' }
        $folder = Get-CanonicalDir $arg
        if (-not $folder) { throw "Not a folder: $arg" }
        Confirm-Trusted $folder ($Trust.IsPresent -or (($SubArgs.Count -gt 2) -and $SubArgs[2] -eq '--trust')) 4
        exit 0
      }
      default { throw $usage }
    }
  }

  if ($Version -or ($Extra -contains '--version')) {
    # The Orkeon found, said without starting anything: the REPL has no --version flag, and docker pulls nothing.
    $replName = if ($env:ORKEON_REPL) { ($env:ORKEON_REPL -split ' ')[0] } else { 'orkeon-repl' }
    $replFound = Get-Command $replName -ErrorAction SilentlyContinue | Select-Object -First 1
    $found = if ($replFound -and $replFound.Source) {
      $replPath = (Get-Item -LiteralPath $replFound.Source).FullName
      $target = (Get-Item -LiteralPath $replPath).Target
      if ($target) { $replPath = [IO.Path]::GetFullPath((Join-Path (Split-Path $replPath -Parent) "$target")) }
      # An Orkeon release archive installs bin/orkeon-repl beside its VERSION file.
      $versionFile = Join-Path (Split-Path (Split-Path $replPath -Parent) -Parent) 'VERSION'
      if (Test-Path -LiteralPath $versionFile) { "$((Get-Content -LiteralPath $versionFile -Raw).Trim()) ($replName, $versionFile)" }
      else { "unknown ($replPath)" }
    } elseif (Get-Command docker -ErrorAction SilentlyContinue) { "image $Image (docker mode, not pulled)" }
    else { 'none (see docs/getting-started.md)' }
    $kind = if ($IsClone) { 'clone' } else { 'install' }
    Write-Output "orkeon-code $codeVersion ($kind`: $Root)"
    Write-Output "Orkeon $OrkeonVersion expected, found: $found"
    exit 0
  }

  # Full, its link resolved: the folder checked, stored and mounted is the same one.
  $given = $Workspace
  $Workspace = Get-CanonicalDir $Workspace
  if (-not $Workspace) { throw "Workspace not found: $given" }
  # Before anything of the project is read or mounted.
  Confirm-Trusted $Workspace $Trust.IsPresent 0

  # $runtimeOwn: Orkeon's own file, which the REPL reads itself when no --settings is passed.
  $runtimeOwn = $false
  if (-not $Settings) {
    $candidates = @($homeSettings, $legacySettings)
    if ($IsClone) { $candidates = @((Join-Path $Root 'config/appsettings.local.json')) + $candidates }
    $Settings = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $Settings -and (Test-Path -LiteralPath $runtimeSettings)) { $Settings = $runtimeSettings; $runtimeOwn = $true }
    if ($Settings -eq $legacySettings) { Write-Warning "$legacySettings is the old place of the settings: move it to $homeSettings." }
    if (-not $Settings -and -not [Console]::IsInputRedirected) {
      [Console]::Error.WriteLine('orkeon-code: no settings file yet.')
      if (Invoke-Setup $homeSettings) { $Settings = $homeSettings }
    }
  }
  if (-not $Settings -or -not (Test-Path $Settings)) {
    if ($IsClone) { throw "No settings file. Run 'orkeon-code setup' in a terminal, copy config/appsettings.example.json to config/appsettings.local.json, or pass -Settings." }
    throw "No settings file. Run 'orkeon-code setup' in a terminal, copy $(Join-Path $Root 'config/appsettings.example.json') to $homeSettings, or pass -Settings."
  }
  $Settings = (Resolve-Path $Settings).Path

  $settingsText = Get-Content $Settings -Raw -Encoding UTF8  # Windows PowerShell 5.1 reads ANSI otherwise
  $keyVar = if ($settingsText -match '"ApiKeyEnvVar"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"') { $Matches[1] } else { $null }
  if ($settingsText -notmatch '"Llm"') {
    Write-Warning "$Settings has no `"Llm`" section: every turn would be empty."
  } elseif (-not $env:ORKEON_Llm__ApiKey -and $keyVar -and -not [Environment]::GetEnvironmentVariable($keyVar)) {
    Write-Warning "No API key: set `$env:$keyVar (named by Llm:ApiKeyEnvVar) or `$env:ORKEON_Llm__ApiKey."
  }
  if ($env:ORKEON_CODE_MODEL) { $env:ORKEON_Llm__Model = $env:ORKEON_CODE_MODEL }
  # The host's permission gate checks every tool call against the session's rules (/permissions), then the
  # mode, and asks you when the mode says so; off, no call is checked. On by default here; a settings file
  # can still turn it off.
  if (-not $env:Orkeon__Security__PermissionGate__Enabled) { $env:Orkeon__Security__PermissionGate__Enabled = 'true' }

  if (-not $Mode) {
    if ($env:ORKEON_REPL -or (Get-Command orkeon-repl -ErrorAction SilentlyContinue)) { $Mode = 'tool' }
    elseif (Get-Command docker -ErrorAction SilentlyContinue) { $Mode = 'docker' }
    else { throw 'No Orkeon runtime found: install Docker or the orkeon-repl tool (docs/getting-started.md).' }
  }

  # One state folder for every project until each project gets its own.
  $State = if ($env:ORKEON_CODE_STATE) { $env:ORKEON_CODE_STATE }
           elseif ($IsClone) { Join-Path $Root '.crew-output' } else { Join-Path $CodeHome 'state' }
  New-Item -ItemType Directory -Force -Path (Join-Path $State 'output'), (Join-Path $State 'tmp') | Out-Null
  $State = (Resolve-Path $State).Path

  # The session's start script (scripts/session-start.ork.ts), copied fresh into the agent's /tmp at every start:
  # the runtime runs it once at the REPL's start, through its script host, and puts what it prints before the
  # first free-text turn.
  $startDir = Join-Path $State 'tmp/orkeon-code'
  New-Item -ItemType Directory -Force -Path $startDir | Out-Null
  Copy-Item -Force (Join-Path $Root 'scripts/session-start.ork.ts') (Join-Path $startDir 'session-start.ork.ts')
  if ($null -eq [Environment]::GetEnvironmentVariable('Orkeon__Cli__Session__StartScript')) {
    $env:Orkeon__Cli__Session__StartScript = '/tmp/orkeon-code/session-start.ork.ts'
  }

  # Speech-to-text (optional): $env:ORKEON_CODE_AUDIO_DIR names the folder of audio and video files. The
  # Whisper MCP server (mcp/whisper), started by the REPL over stdio, reads it and writes into
  # <state>/transcripts, which the agents see as /audio and /transcripts. It is declared through the
  # environment (ORKEON_MCP__Servers__whisper__*), so no settings file names this checkout; a settings file,
  # or the environment, that declares a "whisper" server keeps it, and this block stays out.
  $audio = $null
  $audioArgs = @()
  if ($env:ORKEON_CODE_AUDIO_DIR) {
    $uv = Get-Command uv -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Mode -eq 'docker') {
      Write-Warning 'ORKEON_CODE_AUDIO_DIR is ignored in docker mode: the Whisper server runs in tool mode (mcp/whisper/README.md).'
    } elseif ($settingsText -match '"whisper"\s*:') {
      Write-Warning "$Settings declares a `"whisper`" MCP server: ORKEON_CODE_AUDIO_DIR is ignored, the settings file wins."
    } elseif (Get-ChildItem env: | Where-Object { $_.Name -like 'ORKEON_MCP__Servers__whisper__*' }) {
      Write-Warning 'the environment declares a "whisper" MCP server (ORKEON_MCP__Servers__whisper__*): ORKEON_CODE_AUDIO_DIR is ignored, that declaration wins.'
    } elseif (-not $uv) {
      Write-Warning "ORKEON_CODE_AUDIO_DIR is set but uv is not on PATH: speech-to-text is off (mcp/whisper/README.md, 'Install')."
    } else {
      if (-not (Test-Path -LiteralPath $env:ORKEON_CODE_AUDIO_DIR -PathType Container)) {
        throw "ORKEON_CODE_AUDIO_DIR=$($env:ORKEON_CODE_AUDIO_DIR) is not a folder."
      }
      $audio = (Resolve-Path -LiteralPath $env:ORKEON_CODE_AUDIO_DIR).Path
      $transcripts = Join-Path $State 'transcripts'
      New-Item -ItemType Directory -Force -Path $transcripts | Out-Null
      $env:WHISPER_AUDIO_DIR = $audio
      $env:WHISPER_OUT_DIR = $transcripts
      $env:ORKEON_MCP__Servers__whisper__Transport = 'Stdio'
      $env:ORKEON_MCP__Servers__whisper__Command = $uv.Source
      $whisperArgs = @('run', '--project', (Join-Path $Root 'mcp/whisper'))
      # An install's folder is never written to: uv keeps the server's environment under ORKEON_CODE_HOME and
      # reads uv.lock as shipped.
      if (-not $IsClone) {
        $whisperArgs += @('--frozen')
        if (-not $env:UV_PROJECT_ENVIRONMENT) { $env:UV_PROJECT_ENVIRONMENT = Join-Path $CodeHome 'whisper\.venv' }
      }
      # The values are read as the server reads them: case and spaces aside.
      $ttsBackend = "$env:TTS_BACKEND".Trim().ToLowerInvariant()
      $sttBackend = "$env:WHISPER_BACKEND".Trim().ToLowerInvariant()
      if ($env:ORKEON_CODE_VOICE -eq '1') {
        # The microphone (/voice) and the speaker (/say, voice.reply): the `voice` extra (sounddevice),
        # WHISPER_MICROPHONE and WHISPER_SPEAKER.
        $whisperArgs += @('--extra', 'voice')
        $env:WHISPER_MICROPHONE = '1'
        $env:WHISPER_SPEAKER = '1'
      }
      # Piper, the default speech backend, is the `tts` extra: it writes what it would say without the speaker too.
      if ($ttsBackend -in @('', 'piper')) { $whisperArgs += @('--extra', 'tts') }
      # A backend on OpenAI's API or a compatible server needs the `openai` extra, once.
      if (@($ttsBackend, $sttBackend) | Where-Object { $_ -in @('openai', 'http') }) { $whisperArgs += @('--extra', 'openai') }
      # WHISPER_DEVICE=cuda: the cuBLAS and cuDNN wheels, which the server preloads.
      if ("$env:WHISPER_DEVICE".Trim() -eq 'cuda') { $whisperArgs += @('--extra', 'cuda') }
      $whisperArgs += (Join-Path $Root 'mcp/whisper/whisper_mcp.py')
      # Args__0 to Args__11, each saved above and put back when the script ends.
      for ($i = 0; $i -lt $whisperArgs.Count; $i++) {
        [Environment]::SetEnvironmentVariable("ORKEON_MCP__Servers__whisper__Args__$i", $whisperArgs[$i])
      }
      $audioArgs = @('--mount', "${audio}:/audio:ro", '--mount', "${transcripts}:/transcripts:ro")
    }
  }

  Write-Host "orkeon-code on Orkeon $OrkeonVersion ($Mode)"
  Write-Host "  project  : $Workspace -> /workspace"
  if ($runtimeOwn) { Write-Host "  settings : $Settings (Orkeon's own, read by the REPL)" } else { Write-Host "  settings : $Settings" }
  if ($audio) {
    $model = if ($env:WHISPER_MODEL) { $env:WHISPER_MODEL } elseif ($sttBackend -eq 'openai') { 'whisper-1' } else { 'small' }
    $gpu = if ("$env:WHISPER_DEVICE".Trim() -eq 'cuda') { ' on the GPU' } else { '' }
    $mic = if ($env:ORKEON_CODE_VOICE -eq '1') { ', microphone and speaker on' } else { '' }
    Write-Host "  audio    : $audio -> /audio (transcripts: $(Join-Path $State 'transcripts'), model $model$gpu$mic)"
  }

  # The user's orkeonCode block, handed to the scripts as a read-only file: they read no settings and no
  # environment (V-04). Written afresh at each start; no block leaves the folder empty, and no user setting applies.
  $userConfigDir = Join-Path $State 'user-config'
  New-Item -ItemType Directory -Force -Path $userConfigDir | Out-Null
  $userConfigFile = Join-Path $userConfigDir 'config.json'
  Remove-Item $userConfigFile -Force -ErrorAction SilentlyContinue
  try {
    # The key case for case, as ./orkeon-code reads it (a property name is matched without case otherwise).
    $block = (($settingsText | ConvertFrom-Json -ErrorAction Stop).PSObject.Properties |
              Where-Object { $_.Name -ceq 'orkeonCode' } | Select-Object -First 1).Value
    if ($block -is [System.Management.Automation.PSCustomObject]) {
      [System.IO.File]::WriteAllText($userConfigFile, ($block | ConvertTo-Json -Depth 10) + "`n")
    }
  } catch {
    Write-Warning "The orkeonCode block of $Settings could not be read: no user setting applies."
  }

  # An empty <settings> passes none: the REPL then reads Orkeon's own file.
  function Get-ReplArgs($commands, $crews, $settings, $workspace, $output, $tmp, $userConfig) {
    @('--runner=scripted-commands', '--commands-dir', $commands, '--crews-dir', $crews)
    if ($settings) { @('--settings', $settings) }
    @('--mount', "${workspace}:/workspace:rw", '--mount', "${output}:/output:rw", '--mount', "${tmp}:/tmp:rw",
      '--mount', "${userConfig}:/user-config:ro")
  }

  if ($Mode -eq 'docker') {
    # Everything under the working directory /work. The image is multi-arch (linux/amd64, linux/arm64).
    $envArgs = @('-e', 'ORKEON_RUNNER=repl', '-e', 'HOME=/tmp', '-e', 'DOTNET_CLI_HOME=/tmp',
                 '-e', "Orkeon__Security__PermissionGate__Enabled=$env:Orkeon__Security__PermissionGate__Enabled",
                 '-e', "Orkeon__Cli__Session__StartScript=$env:Orkeon__Cli__Session__StartScript")
    foreach ($v in @('ORKEON_Llm__ApiKey', 'ORKEON_Llm__Model', $keyVar)) {
      if ($v -and [Environment]::GetEnvironmentVariable($v)) { $envArgs += @('-e', $v) }
    }
    $replArgs = Get-ReplArgs '/work/agent/commands' '/work/agent/crews' '/work/settings.json' `
                             '/work/project' '/work/state/output' '/work/state/tmp' '/work/state/user-config'
    & docker run --rm -it @envArgs -w /work `
      -v "${Workspace}:/work/project" -v "$(Join-Path $Root 'src'):/work/agent:ro" `
      -v "${Settings}:/work/settings.json:ro" -v "${State}:/work/state" `
      $Image @replArgs @Extra
    exit $LASTEXITCODE
  }

  # tool mode: a release-archive install carries its own esbuild (libexec\esbuild-bin, used by
  # its orkeon-repl wrapper), and so does the Debian package (/usr/bin/orkeon-repl, a script that
  # points the runtime at /usr/lib/orkeon/esbuild-bin); otherwise esbuild comes from this
  # checkout's node_modules.
  $repl = @(if ($env:ORKEON_REPL) { $env:ORKEON_REPL -split ' ' } else { 'orkeon-repl' })  # @(): one word stays an array
  $replCmd = Get-Command $repl[0] -ErrorAction SilentlyContinue
  if (-not $replCmd) { throw "$($repl[0]) not found (docs/getting-started.md, 'Tool mode')." }
  $bundled = $false
  if ($replCmd.Source) {
    $installRoot = Split-Path (Split-Path $replCmd.Source -Parent) -Parent
    $bundled = (Test-Path (Join-Path $installRoot 'libexec/esbuild-bin/esbuild.exe')) -or
               (Test-Path (Join-Path $installRoot 'libexec/esbuild-bin/esbuild'))
    # A launcher script that sets ORKEON_ESBUILD_PATH itself (the Debian package's).
    $firstLine = Get-Content $replCmd.Source -TotalCount 1 -ErrorAction SilentlyContinue
    if (-not $bundled -and "$firstLine".StartsWith('#!') -and
        (Select-String -Path $replCmd.Source -Pattern 'ORKEON_ESBUILD_PATH' -SimpleMatch -Quiet)) { $bundled = $true }
  }
  if (-not $bundled -and -not $env:ORKEON_ESBUILD_PATH -and -not (Get-Command esbuild -ErrorAction SilentlyContinue)) {
    $found = Get-ChildItem (Join-Path $Root 'node_modules/@esbuild') -Recurse -Include 'esbuild.exe', 'esbuild' -File -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if (-not $found -and $IsClone) { throw "esbuild not found: run 'npm ci' in $Root, or set ORKEON_ESBUILD_PATH." }
    if (-not $found) { throw 'esbuild not found: install Orkeon from its package or archive (it carries esbuild), or set ORKEON_ESBUILD_PATH.' }
    $env:ORKEON_ESBUILD_PATH = $found.FullName
  }
  $replArgs = Get-ReplArgs (Join-Path $Root 'src/commands') (Join-Path $Root 'src/crews') $(if ($runtimeOwn) { '' } else { $Settings }) `
                           $Workspace (Join-Path $State 'output') (Join-Path $State 'tmp') $userConfigDir
  # The REPL runs from the project. It reads its --commands-dir and --crews-dir wherever they are, and
  # a --mount outside its working directory (/output, /tmp and /user-config, in the state directory) under
  # ORKEON_ALLOW_EXTERNAL_MOUNTS (Orkeon GAP-49). The four roots are distinct, and none is one the REPL
  # keeps (/sandbox, /credentials, /cli-commands..., /crews...).
  $env:ORKEON_ALLOW_EXTERNAL_MOUNTS = '1'
  Push-Location $Workspace
  try {
    $exe = $repl[0]
    $rest = @($repl | Select-Object -Skip 1)  # @(): a single argument stays an array (an if statement would unroll it)
    & $exe @rest @replArgs @audioArgs @Extra
    exit $LASTEXITCODE
  } finally { Pop-Location }
} finally {
  # A variable that was not set is removed: $null passed to SetEnvironmentVariable from PowerShell
  # arrives as '', which would leave it set, and empty, for the next run.
  foreach ($name in $savedEnv.Keys) {
    if ($null -eq $savedEnv[$name]) { Remove-Item "env:$name" -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name]) }
  }
}
