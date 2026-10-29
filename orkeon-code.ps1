#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Start the Orkeon Code REPL on a project (Windows / PowerShell twin of ./orkeon-code).

.EXAMPLE
  .\orkeon-code.ps1                              # the current directory is the project
  .\orkeon-code.ps1 -Workspace C:\src\app
  .\orkeon-code.ps1 -Mode docker -Settings .\config\appsettings.local.json
  .\orkeon-code.ps1 -Trust                       # this run only, without asking (nothing stored)
  .\orkeon-code.ps1 -Continue                    # the last session of this project (--continue, -c)
  .\orkeon-code.ps1 --resume [<n> | <id>]        # list the saved sessions of this project and pick one
  .\orkeon-code.ps1 trust list | add <path> | remove <path> | check <path> [--trust]
  .\orkeon-code.ps1 setup                        # write %USERPROFILE%\.orkeon-code\appsettings.json (never the key)

.NOTES
  Modes: tool (orkeon-repl on PATH, from the full Orkeon release .zip (the .msi has no orkeon-repl), the
  Debian package or the dotnet tool, or $env:ORKEON_REPL) and docker
  (ghcr.io/orkeon/orkeon-runners:latest, the last release, not the pin). The source mode is only in the
  bash launcher. Folder trust, per-project state, sessions, settings, API key, model and $env:ORKEON_CODE_AUDIO_DIR (speech-to-text,
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
  [switch] $Continue,
  [switch] $Resume,
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

$resumeChoice = ''
$Help = $false
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
  elseif ($name -cin @('-h', '--help')) { $Help = $true }
  elseif ($name -eq '--demo') { throw '--demo is only in the bash launcher (./orkeon-code --demo): it builds its fixture with scripts/setup-fixture.sh.' }
  elseif ($name -eq '--trust') { $Trust = [switch] $true }
  elseif ($name -cin @('--continue', '-c')) { $Continue = [switch] $true }
  elseif ($name -match '^--resume(=(.*))?$') {
    $Resume = [switch] $true
    if ($Matches[1]) { $resumeChoice = $Matches[2] }
    elseif ($i + 1 -lt $Extra.Count -and -not $Extra[$i + 1].StartsWith('-')) { $i++; $resumeChoice = $Extra[$i] }
  }
  elseif ($name -in @('--settings', '--workspace', '--mode')) {
    if ($null -eq $value) {
      if ($i + 1 -ge $Extra.Count) { throw "$name needs a value." }
      $i++; $value = $Extra[$i]
    }
    if ($name -eq '--settings') { $Settings = $value }
    elseif ($name -eq '--workspace') { $Workspace = $value }
    elseif ($value -notin @('docker', 'tool')) {
      # Checked before the assignment: -Mode's ValidateSet would refuse it with its own message.
      throw "Unknown mode '$value' (--mode): docker or tool. The source mode is only in the bash launcher."
    }
    else { $Mode = $value }
  } else { $rest += $a }
}
$Extra = $rest
# -h / --help: this file's help, as ./orkeon-code prints its header.
if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }
# ValidateSet does not check its default ($env:ORKEON_CODE_MODE): an unknown mode is refused
# here rather than run as another one (./orkeon-code's source mode is not in this launcher).
if (-not $Sub -and $Mode -and $Mode -notin @('docker', 'tool')) {
  throw "Unknown mode '$Mode' (-Mode, --mode or `$env:ORKEON_CODE_MODE): docker or tool. The source mode is only in the bash launcher."
}

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

# ── Per-project state and sessions (as ./orkeon-code) ──
# The runtime's folder name for a project (ProjectKey.Slug, Orkeon.Infrastructure/Session/ProjectKey.cs): the last
# segment, each UTF-16 unit an ASCII letter or digit lowercased, else '-', then '-' and the first 12 hex of the
# SHA-256 of the whole path, in UTF-8.
function Get-ProjectSlug([string] $path) {
  $name = ($path.TrimEnd('/', '\') -split '[/\\]')[-1]
  $out = -join @(foreach ($c in $name.ToCharArray()) {
    $n = [int] $c
    if (($n -ge 48 -and $n -le 57) -or ($n -ge 65 -and $n -le 90) -or ($n -ge 97 -and $n -le 122)) { [char]::ToLowerInvariant($c) } else { '-' }
  })
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($path)) } finally { $sha.Dispose() }
  "$out-" + (-join @($bytes | ForEach-Object { $_.ToString('x2') })).Substring(0, 12)
}

# A string field of a JSON file as stored (its escapes unread), or $null.
function Get-JsonField([string] $file, [string] $field) {
  $text = Get-Content -LiteralPath $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  if ($text -match ('"' + $field + '"\s*:\s*"((?:[^"\\]|\\.)*)"')) { $Matches[1] } else { $null }
}

# Removes from history/ every file of the session $rawId (as stored, never the file name), before its new file lands
# there: a session /resume loaded in place goes on under its id, so its new file replaces the one it was loaded
# from, under its own name (no collision suffix). Nothing for an empty id.
function Remove-HistoryDuplicates([string] $history, [string] $rawId) {
  if (-not $rawId) { return }
  foreach ($other in @(Get-ChildItem -LiteralPath $history -File -Filter '*.json' -ErrorAction SilentlyContinue)) {
    if ("$(Get-JsonField $other.FullName 'SessionId')" -eq $rawId) { Remove-Item -LiteralPath $other.FullName -Force }
  }
}

# Moves every session file the runtime saved into history/, under <UTC time>-<session id>.json: the last.json of
# sessions/ and the archives /resume left beside it (<stamp>-archived.json, moved first so last.json is the newest),
# unless $sideOnly, and always those of side/<pid>/ (a start beside an open one, now ended). A session without a
# message (a start and a quit) is dropped, so it never pushes a real one out of the history; a session that goes on
# under the id of one already in the history replaces it there (Remove-HistoryDuplicates).
function Move-SessionsToHistory([string] $sessions, [string] $history, [string] $side, [bool] $sideOnly) {
  $folders = @()
  if (-not $sideOnly) { $folders += @(Get-ChildItem -LiteralPath $sessions -Directory -ErrorAction SilentlyContinue) }
  foreach ($pidDir in @(Get-ChildItem -LiteralPath $side -Directory -ErrorAction SilentlyContinue)) {
    $folders += @(Get-ChildItem -LiteralPath $pidDir.FullName -Directory -ErrorAction SilentlyContinue)
  }
  $files = @($folders | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -File -Filter '*.json' -ErrorAction SilentlyContinue })
  $ordered = @($files | Where-Object { $_.Name -ne 'last.json' }) + @($files | Where-Object { $_.Name -eq 'last.json' })
  foreach ($file in $ordered) {
    $last = $file.FullName
    if ((Get-Content -LiteralPath $last -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) -match '"Messages"\s*:\s*\[\s*\]') {
      Remove-Item -LiteralPath $last -Force; continue
    }
    $rawId = "$(Get-JsonField $last 'SessionId')"
    $id = $rawId -replace '[^A-Za-z0-9._-]', '_'
    if (-not $id) { $id = 'session' }
    Remove-HistoryDuplicates $history $rawId
    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'", [System.Globalization.CultureInfo]::InvariantCulture)
    $target = Join-Path $history "$stamp-$id.json"; $n = 2
    while (Test-Path -LiteralPath $target) { $target = Join-Path $history "$stamp-$id-$n.json"; $n++ }
    Move-Item -LiteralPath $last -Destination $target -Force
  }
  Get-ChildItem -LiteralPath $side -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
}

# The history, newest first.
function Get-HistoryFiles([string] $history) {
  @(Get-ChildItem -LiteralPath $history -File -Filter '*.json' -ErrorAction SilentlyContinue |
    Sort-Object -Property Name -Descending -CaseSensitive)
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
                    'Orkeon__Cli__Session__Persist', 'ORKEON_Orkeon__Cli__Session__SessionsDirectory',
                    'ORKEON_ESBUILD_PATH',
                    'ORKEON_ALLOW_EXTERNAL_MOUNTS', 'WHISPER_AUDIO_DIR', 'WHISPER_OUT_DIR',
                    'ORKEON_MCP__Servers__whisper__Transport', 'ORKEON_MCP__Servers__whisper__Command',
                    'ORKEON_MCP__Servers__whisper__TrustAnnotations',
                    'ORKEON_MCP__Servers__whisper__Args__0', 'ORKEON_MCP__Servers__whisper__Args__1',
                    'ORKEON_MCP__Servers__whisper__Args__2', 'ORKEON_MCP__Servers__whisper__Args__3',
                    'ORKEON_MCP__Servers__whisper__Args__4', 'ORKEON_MCP__Servers__whisper__Args__5',
                    'ORKEON_MCP__Servers__whisper__Args__6', 'ORKEON_MCP__Servers__whisper__Args__7',
                    'ORKEON_MCP__Servers__whisper__Args__8', 'ORKEON_MCP__Servers__whisper__Args__9',
                    'ORKEON_MCP__Servers__whisper__Args__10', 'ORKEON_MCP__Servers__whisper__Args__11',
                    'ORKEON_MCP__Servers__whisper__Args__12',
                    'WHISPER_MICROPHONE', 'WHISPER_SPEAKER', 'UV_PROJECT_ENVIRONMENT')) {
  $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
  $Root = $PSScriptRoot
  # The pin is a commit of Orkeon's main (.orkeon-version, ADR 0013): the tool and docker modes run a release.
  $OrkeonRef = (Get-Content (Join-Path $Root '.orkeon-version') -Raw).Trim()
  $OrkeonPin = $OrkeonRef.Substring(0, 7)
  $Image = if ($env:ORKEON_CODE_IMAGE) { $env:ORKEON_CODE_IMAGE } else { 'ghcr.io/orkeon/orkeon-runners:latest' }
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
    # A mode forced by -Mode or ORKEON_CODE_MODE names its runtime; otherwise the auto-detection order speaks.
    $found = if ($Mode -eq 'docker') { "image $Image (docker mode, not pulled)" }
    elseif ($replFound -and $replFound.Source) {
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
    Write-Output "Orkeon $OrkeonPin expected, found: $found"
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

  if ($Continue -and $Resume) { throw '--continue and --resume do not go together: one brings the last session back, the other the one you pick.' }

  if (-not $Mode) {
    if ($env:ORKEON_REPL -or (Get-Command orkeon-repl -ErrorAction SilentlyContinue)) { $Mode = 'tool' }
    elseif (Get-Command docker -ErrorAction SilentlyContinue) { $Mode = 'docker' }
    else { throw 'No Orkeon runtime found: install Docker or the orkeon-repl tool (docs/getting-started.md).' }
  }

  # An install keeps one folder per project, ~/.orkeon-code/projects/<slug>; a clone's .crew-output and an
  # ORKEON_CODE_STATE may serve several projects, so their per-project part goes under projects/<slug>. Either way
  # $projectState lies inside $State, which docker mode mounts on /work/state.
  $slug = Get-ProjectSlug $Workspace
  $projectRel = "projects/$slug"
  if ($env:ORKEON_CODE_STATE) { $State = $env:ORKEON_CODE_STATE }
  elseif ($IsClone) { $State = Join-Path $Root '.crew-output' }
  else { $State = Join-Path $CodeHome $projectRel; $projectRel = '' }
  New-Item -ItemType Directory -Force -Path (Join-Path $State 'output'), (Join-Path $State 'tmp') | Out-Null
  $State = (Resolve-Path $State).Path
  $projectState = if ($projectRel) { Join-Path $State $projectRel } else { $State }
  # The runtime saves the session in <SessionsDirectory>/<its slug of the project>/last.json when the REPL ends, and
  # reloads it at the next start. The folder is the /sessions mount, outside the project; the launcher keeps its own
  # files beside it: history/ and project.json.
  $sessions = Join-Path $projectState 'sessions'
  $history = Join-Path $projectState 'history'
  New-Item -ItemType Directory -Force -Path $sessions, $history | Out-Null
  $runtimeSlug = if ($Mode -eq 'docker') { Get-ProjectSlug '/work/project' } else { $slug }
  $projectFile = Join-Path $projectState 'project.json'
  $now = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [System.Globalization.CultureInfo]::InvariantCulture)
  $firstSeen = Get-JsonField $projectFile 'firstSeen'
  if (-not $firstSeen) { $firstSeen = $now }
  $escapedPath = ($Workspace -replace '\\', '\\') -replace '"', '\"'
  [System.IO.File]::WriteAllText("$projectFile.tmp.$PID",
    "{`n  `"path`": `"$escapedPath`",`n  `"slug`": `"$slug`",`n  `"runtimeSlug`": `"$runtimeSlug`",`n" +
    "  `"firstSeen`": `"$firstSeen`",`n  `"lastSeen`": `"$now`"`n}`n")
  Move-Item -LiteralPath "$projectFile.tmp.$PID" -Destination $projectFile -Force

  # The starts open on this project, one pid a line (a launcher waits for its REPL). Another one still running: its
  # session is left where it is, and this one is kept beside it, in side/<pid>/, archived at the next start that
  # finds none open.
  $lock = Join-Path $projectState '.lock'
  $side = Join-Path $projectState 'side'
  $other = $null
  $livePids = @()
  foreach ($line in @(Get-Content -LiteralPath $lock -ErrorAction SilentlyContinue)) {
    $otherPid = "$line".Trim()
    if ($otherPid -match '^[0-9]{1,9}$' -and [int] $otherPid -ne $PID -and (Get-Process -Id ([int] $otherPid) -ErrorAction SilentlyContinue)) {
      if (-not $other) { $other = $otherPid }
      $livePids += $otherPid
    }
  }
  # Left when the REPL ends, as ./orkeon-code leaves it: a pid that no longer runs is a stale lock.
  [System.IO.File]::WriteAllText($lock, ((@($livePids) + "$PID") -join "`n") + "`n")
  $sessionsMount = $sessions
  $sessionsSub = 'sessions'

  # Fresh unless --continue (the runtime reloads the last itself) or --resume (the chosen one is put back).
  $sessionNote = 'fresh; --continue brings the last back, --resume lists them'
  if ($other) {
    Write-Warning "another session is open on this project (pid $other): it is left as it is, and this one is kept beside it, in the history from the next start."
    $sessionNote = 'beside the open one'
    $sessionsMount = Join-Path $side "$PID"
    $sessionsSub = "side/$PID"
    New-Item -ItemType Directory -Force -Path $sessionsMount | Out-Null
  } elseif ($Continue) { $sessionNote = 'continued'; Move-SessionsToHistory $sessions $history $side $true }
  else { Move-SessionsToHistory $sessions $history $side $false }
  $keep = 50
  if ($null -ne $env:ORKEON_CODE_SESSIONS_KEEP) {
    if ($env:ORKEON_CODE_SESSIONS_KEEP -match '^[0-9]{1,4}$' -and [int] $env:ORKEON_CODE_SESSIONS_KEEP -gt 0) { $keep = [int] $env:ORKEON_CODE_SESSIONS_KEEP }
    else { Write-Warning "ORKEON_CODE_SESSIONS_KEEP=$($env:ORKEON_CODE_SESSIONS_KEEP) is not a whole number from 1 to 9999: 50 sessions are kept." }
  }
  Get-HistoryFiles $history | Select-Object -Skip $keep | Remove-Item -Force

  if ($Resume) {
    $files = @(Get-HistoryFiles $history)
    if ($files.Count -eq 0) { throw "No saved session for $Workspace yet (they are kept in $history)." }
    if (-not $resumeChoice) {
      [Console]::Error.WriteLine("orkeon-code: sessions of $Workspace, newest first:")
      for ($i = 0; $i -lt $files.Count; $i++) {
        $saved = try { Get-Content -LiteralPath $files[$i].FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $null }
        $title = if ($saved -and $saved.Title) { $saved.Title } else { '(untitled)' }
        $count = if ($saved -and $saved.Messages) { @($saved.Messages).Count } else { 0 }
        $stem = $files[$i].BaseName
        [Console]::Error.WriteLine(('{0,3}  {1}  {2}  ({3} messages)  {4}' -f ($i + 1), $stem.Substring(0, [Math]::Min(16, $stem.Length)), $title, $count, $(if ($stem.Length -gt 17) { $stem.Substring(17) } else { '' })))
      }
      if ([Console]::IsInputRedirected) {
        [Console]::Error.WriteLine('orkeon-code: no terminal to choose in: pass --resume <number or id>.')
        exit 2
      }
      $resumeChoice = Read-Answer 'Session to resume [1]: ' '1'
      if ($null -eq $resumeChoice) { $resumeChoice = '1' }
    }
    $chosen = $null
    # A number of the list first (up to four digits), else the start of an id.
    if ($resumeChoice -match '^[1-9][0-9]{0,3}$' -and [int] $resumeChoice -le $files.Count) { $chosen = $files[[int] $resumeChoice - 1] }
    if (-not $chosen -and $resumeChoice) {
      $matching = @($files | Where-Object { $_.BaseName.Length -gt 17 -and $_.BaseName.Substring(17).StartsWith($resumeChoice, [StringComparison]::Ordinal) })
      if ($matching.Count -gt 1) { throw "More than one session starts with '$resumeChoice': give more of its id." }
      if ($matching.Count -eq 1) { $chosen = $matching[0] }
    }
    if (-not $chosen) { throw "No saved session '$resumeChoice' (orkeon-code --resume lists them)." }
    if ($other) { throw "Another session is open on this project (pid $other): end it before you resume one." }
    # The chosen session lives in one place: back in sessions/, the history losing it (the last one was archived above).
    $target = Join-Path $sessions $runtimeSlug
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Move-Item -LiteralPath $chosen.FullName -Destination (Join-Path $target 'last.json') -Force
    $sessionNote = "resumed $($chosen.BaseName.Substring([Math]::Min(17, $chosen.BaseName.Length)))"
  }

  # The session's start script (scripts/session-start.ork.ts), copied fresh into the agent's /tmp at every start:
  # the runtime runs it once at the REPL's start, through its script host, and puts what it prints before the
  # first free-text turn.
  $startDir = Join-Path $State 'tmp/orkeon-code'
  New-Item -ItemType Directory -Force -Path $startDir | Out-Null
  Copy-Item -Force (Join-Path $Root 'scripts/session-start.ork.ts') (Join-Path $startDir 'session-start.ork.ts')
  if ($null -eq [Environment]::GetEnvironmentVariable('Orkeon__Cli__Session__StartScript')) {
    $env:Orkeon__Cli__Session__StartScript = '/tmp/orkeon-code/session-start.ork.ts'
  }
  # The session persists (the runtime's default in the REPL, said here; a settings file may still turn it off), in
  # /sessions: the prefixed form wins over the settings file, since the archiving above reads that folder alone.
  if (-not $env:Orkeon__Cli__Session__Persist) { $env:Orkeon__Cli__Session__Persist = 'true' }
  $env:ORKEON_Orkeon__Cli__Session__SessionsDirectory = '/sessions'

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
      # The gate reads the server's annotations (readOnlyHint) only when the server is trusted (Orkeon #223).
      $env:ORKEON_MCP__Servers__whisper__TrustAnnotations = 'true'
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
      # Args__0 to Args__12 (13 at most: run, --project, the folder, --frozen, four --extra pairs, the script), each
      # saved above and put back when the script ends.
      for ($i = 0; $i -lt $whisperArgs.Count; $i++) {
        [Environment]::SetEnvironmentVariable("ORKEON_MCP__Servers__whisper__Args__$i", $whisperArgs[$i])
      }
      $audioArgs = @('--mount', "${audio}:/audio:ro", '--mount', "${transcripts}:/transcripts:ro")
    }
  }

  Write-Host "orkeon-code on Orkeon $OrkeonPin ($Mode)"
  Write-Host "  project  : $Workspace -> /workspace"
  if ($runtimeOwn) { Write-Host "  settings : $Settings (Orkeon's own, read by the REPL)" } else { Write-Host "  settings : $Settings" }
  Write-Host "  sessions : $sessionsMount ($sessionNote)"
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

  # An empty <settings> passes none: the REPL then reads Orkeon's own file. <projectState> as the REPL sees it: its
  # sessions/ on /sessions, its history/ on /session-history (read-only, for /resume).
  function Get-ReplArgs($commands, $crews, $settings, $workspace, $output, $tmp, $userConfig, $projectState) {
    @('--runner=scripted-commands', '--commands-dir', $commands, '--crews-dir', $crews)
    if ($settings) { @('--settings', $settings) }
    @('--mount', "${workspace}:/workspace:rw", '--mount', "${output}:/output:rw", '--mount', "${tmp}:/tmp:rw",
      '--mount', "${userConfig}:/user-config:ro",
      '--mount', "${projectState}/${sessionsSub}:/sessions:rw", '--mount', "${projectState}/history:/session-history:ro")
  }

  # The exchange log (--llm-log) would land in ./llm-logs, the project: a bare --llm-log among the REPL's arguments
  # is sent to <projectState>/llm-logs instead; an explicit --llm-log-path is passed as given.
  function Get-LlmLogArgs($projectState) {
    # An explicit --llm-log-path wins: a bare --llm-log beside it is dropped (the runtime keeps the last path it reads).
    $named = @($Extra | Where-Object { "$_" -ceq '--llm-log-path' -or "$_".StartsWith('--llm-log-path=', [StringComparison]::Ordinal) }).Count -gt 0
    foreach ($a in $Extra) { if ($a -ceq '--llm-log') { if (-not $named) { '--llm-log-path'; "$projectState/llm-logs" } } else { $a } }
  }

  if ($Mode -eq 'docker') {
    # Everything under the working directory /work. The image is multi-arch (linux/amd64, linux/arm64).
    $envArgs = @('-e', 'ORKEON_RUNNER=repl', '-e', 'HOME=/tmp', '-e', 'DOTNET_CLI_HOME=/tmp',
                 '-e', "Orkeon__Security__PermissionGate__Enabled=$env:Orkeon__Security__PermissionGate__Enabled",
                 '-e', "Orkeon__Cli__Session__StartScript=$env:Orkeon__Cli__Session__StartScript",
                 '-e', "Orkeon__Cli__Session__Persist=$env:Orkeon__Cli__Session__Persist",
                 '-e', 'ORKEON_Orkeon__Cli__Session__SessionsDirectory=/sessions')
    # The github tool's token (Orkeon #222): GITHUB_TOKEN, GH_TOKEN, or the variable Orkeon__Tools__GitHub__TokenVariable
    # names, each handed over only when set, with the setting itself so the runtime reads the same variable.
    $tokenVar = [Environment]::GetEnvironmentVariable('Orkeon__Tools__GitHub__TokenVariable')
    foreach ($v in @('ORKEON_Llm__ApiKey', 'ORKEON_Llm__Model', $keyVar, 'GITHUB_TOKEN', 'GH_TOKEN', 'Orkeon__Tools__GitHub__TokenVariable', $tokenVar)) {
      if ($v -and [Environment]::GetEnvironmentVariable($v)) { $envArgs += @('-e', $v) }
    }
    $inState = if ($projectRel) { "/work/state/$projectRel" } else { '/work/state' }
    $replArgs = Get-ReplArgs '/work/agent/commands' '/work/agent/crews' '/work/settings.json' `
                             '/work/project' '/work/state/output' '/work/state/tmp' '/work/state/user-config' $inState
    $Extra = @(Get-LlmLogArgs $inState)
    # -t only on a terminal, as ./orkeon-code: with stdin or stdout redirected docker refuses it ("not a TTY").
    $ttyArgs = if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { @('-i') } else { @('-it') }
    # Files the agent writes in the project belong to the caller, not to root (Linux; Docker Desktop maps them itself).
    $userArgs = @()
    if ($IsLinux) { $userArgs = @('--user', "$(& id -u):$(& id -g)") }
    & docker run --rm @ttyArgs @userArgs @envArgs -w /work `
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
                           $Workspace (Join-Path $State 'output') (Join-Path $State 'tmp') $userConfigDir $projectState
  $Extra = @(Get-LlmLogArgs $projectState)
  # The REPL runs from the project. It reads its --commands-dir and --crews-dir wherever they are, and
  # a --mount outside its working directory (/output, /tmp, /user-config, /sessions and /session-history, in the
  # state directory, and an --llm-log-path there) under ORKEON_ALLOW_EXTERNAL_MOUNTS (Orkeon GAP-49). The six roots
  # are distinct, and none is one the REPL keeps (/sandbox, /credentials, /llm-logs, /cli-commands..., /crews...).
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
