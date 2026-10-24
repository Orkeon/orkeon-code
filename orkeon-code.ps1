#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Start the Orkeon Code REPL on a project (Windows / PowerShell twin of ./orkeon-code).

.EXAMPLE
  .\orkeon-code.ps1                              # the current directory is the project
  .\orkeon-code.ps1 -Workspace C:\src\app
  .\orkeon-code.ps1 -Mode docker -Settings .\config\appsettings.local.json

.NOTES
  Modes: tool (orkeon-repl on PATH, from the full Orkeon release .zip (the .msi has no orkeon-repl), the
  Debian package or the dotnet tool, or $env:ORKEON_REPL) and docker
  (ghcr.io/orkeon/orkeon-runners:<.orkeon-version>). The source mode is only in the
  bash launcher. Settings, API key, model and $env:ORKEON_CODE_AUDIO_DIR (speech-to-text, tool mode):
  see the header of ./orkeon-code.
#>
[CmdletBinding()]
param(
  [ValidateSet('', 'docker', 'tool')] [string] $Mode = $env:ORKEON_CODE_MODE,
  [string] $Workspace = (Get-Location).Path,
  [string] $Settings = $env:ORKEON_CODE_SETTINGS,
  [switch] $Version,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]] $Extra = @()
)
$ErrorActionPreference = 'Stop'

# The variables set below for the REPL are put back as they were when the script ends, so that none of them stays
# in the PowerShell session that ran it.
$savedEnv = @{}
foreach ($name in @('ORKEON_Llm__Model', 'Orkeon__Security__PermissionGate__Enabled', 'ORKEON_ESBUILD_PATH',
                    'ORKEON_ALLOW_EXTERNAL_MOUNTS', 'WHISPER_AUDIO_DIR', 'WHISPER_OUT_DIR',
                    'ORKEON_MCP__Servers__whisper__Transport', 'ORKEON_MCP__Servers__whisper__Command',
                    'ORKEON_MCP__Servers__whisper__Args__0', 'ORKEON_MCP__Servers__whisper__Args__1',
                    'ORKEON_MCP__Servers__whisper__Args__2', 'ORKEON_MCP__Servers__whisper__Args__3',
                    'ORKEON_MCP__Servers__whisper__Args__4', 'ORKEON_MCP__Servers__whisper__Args__5',
                    'ORKEON_MCP__Servers__whisper__Args__6', 'ORKEON_MCP__Servers__whisper__Args__7',
                    'ORKEON_MCP__Servers__whisper__Args__8', 'ORKEON_MCP__Servers__whisper__Args__9',
                    'ORKEON_MCP__Servers__whisper__Args__10', 'ORKEON_MCP__Servers__whisper__Args__11',
                    'WHISPER_MICROPHONE', 'WHISPER_SPEAKER')) {
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

  $Workspace = (Resolve-Path $Workspace).Path
  # %APPDATA% on Windows; pwsh elsewhere has none, and reads ~/.config as ./orkeon-code does.
  $configHome = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME '.config' }
  $userSettings = Join-Path $configHome 'orkeon-code/appsettings.json'
  if (-not $Settings) {
    $candidates = if ($IsClone) { @((Join-Path $Root 'config/appsettings.local.json'), $userSettings) } else { @($userSettings) }
    $Settings = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  }
  if (-not $Settings -or -not (Test-Path $Settings)) {
    if ($IsClone) { throw 'No settings file. Copy config/appsettings.example.json to config/appsettings.local.json, or pass -Settings.' }
    throw "No settings file. Copy $(Join-Path $Root 'config/appsettings.example.json') to $userSettings, or pass -Settings."
  }
  $Settings = (Resolve-Path $Settings).Path

  $settingsText = Get-Content $Settings -Raw
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
  Write-Host "  settings : $Settings"
  if ($audio) {
    $model = if ($env:WHISPER_MODEL) { $env:WHISPER_MODEL } elseif ($sttBackend -eq 'openai') { 'whisper-1' } else { 'small' }
    $gpu = if ("$env:WHISPER_DEVICE".Trim() -eq 'cuda') { ' on the GPU' } else { '' }
    $mic = if ($env:ORKEON_CODE_VOICE -eq '1') { ', microphone and speaker on' } else { '' }
    Write-Host "  audio    : $audio -> /audio (transcripts: $(Join-Path $State 'transcripts'), model $model$gpu$mic)"
  }

  function Get-ReplArgs($commands, $crews, $settings, $workspace, $output, $tmp) {
    @('--runner=scripted-commands', '--commands-dir', $commands, '--crews-dir', $crews, '--settings', $settings,
      '--mount', "${workspace}:/workspace:rw", '--mount', "${output}:/output:rw", '--mount', "${tmp}:/tmp:rw")
  }

  if ($Mode -eq 'docker') {
    # Everything under the working directory /work. The image is multi-arch (linux/amd64, linux/arm64).
    $envArgs = @('-e', 'ORKEON_RUNNER=repl', '-e', 'HOME=/tmp', '-e', 'DOTNET_CLI_HOME=/tmp',
                 '-e', "Orkeon__Security__PermissionGate__Enabled=$env:Orkeon__Security__PermissionGate__Enabled")
    foreach ($v in @('ORKEON_Llm__ApiKey', 'ORKEON_Llm__Model', $keyVar)) {
      if ($v -and [Environment]::GetEnvironmentVariable($v)) { $envArgs += @('-e', $v) }
    }
    $replArgs = Get-ReplArgs '/work/agent/commands' '/work/agent/crews' '/work/settings.json' `
                             '/work/project' '/work/state/output' '/work/state/tmp'
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
  $replArgs = Get-ReplArgs (Join-Path $Root 'src/commands') (Join-Path $Root 'src/crews') $Settings `
                           $Workspace (Join-Path $State 'output') (Join-Path $State 'tmp')
  # The REPL runs from the project. It reads its --commands-dir and --crews-dir wherever they are, and
  # a --mount outside its working directory (/output and /tmp, in the state directory) under
  # ORKEON_ALLOW_EXTERNAL_MOUNTS (Orkeon GAP-49). The three roots are distinct, and none is one the REPL
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
