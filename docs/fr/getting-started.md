# Premiers pas

<p align="center">
  <img src="../assets/kama-surfer-docker.jpg" alt="Mascotte d'Orkeon Code — un caméléon qui surfe sur une vague" width="200">
</p>

Orkeon Code est un ensemble de commandes et de crews en TypeScript ; le REPL
d'[Orkeon](https://github.com/Orkeon/orkeon) (*Read–Eval–Print Loop* : la console interactive) les exécute.
Le lanceur `orkeon-code` (et `orkeon-code.ps1` sous Windows) trouve un runtime, monte votre projet et démarre le
REPL. Il lui faut trois choses : un runtime, un fichier de settings et une clé d'API.

## 1. Installer

**Depuis une release** (Linux, macOS, WSL) : `install.sh`, publié avec chaque
[release](https://github.com/Orkeon/orkeon-code/releases), télécharge l'archive de cette release, la vérifie avec son
`SHA256SUMS` et l'installe dans `~/.local/lib/orkeon-code/<version>`, la commande `orkeon-code` dans `~/.local/bin` ;
ni `sudo`, ni clone, ni `npm ci`.

```bash
v=0.1.0                                                          # the release to install
curl -fLO "https://github.com/Orkeon/orkeon-code/releases/download/v$v/install.sh"
bash install.sh                                                  # or: bash install.sh --prefix /opt/tools
orkeon-code --version
```

`install.sh --archive orkeon-code-<version>.tar.gz` installe une archive déjà téléchargée (vérifiée avec le
`SHA256SUMS` posé à côté, quand il y en a un). Relancé, il ne change rien ; une nouvelle release va dans son propre dossier et devient
`current`. `bash ~/.local/lib/orkeon-code/current/scripts/install.sh --uninstall` retire le programme et la commande,
jamais `~/.orkeon-code/`, où une installation garde ce qui est à vous : son état (`state/`) et le dépôt de démo
(`demo/`) ; `ORKEON_CODE_HOME` désigne un autre dossier. Sous Windows, `install.ps1` fait de même dans
`%LOCALAPPDATA%\Programs\orkeon-code` et écrit `bin\orkeon-code.cmd`, que `cmd.exe` et PowerShell trouvent tous deux.

**Depuis npm** (Linux, macOS, Windows ; Node 22 ou plus récent) : le paquet porte les mêmes fichiers que l'archive de
la release, et esbuild avec eux.

```bash
npm install -g orkeon-code@next                                  # a prerelease; orkeon-code once 1.0 is out
orkeon-code --version
```

`npm update -g orkeon-code` et `npm uninstall -g orkeon-code` laissent eux aussi `~/.orkeon-code/` intact. En mode
Docker sous macOS, le programme doit se trouver dans un dossier que Docker Desktop partage avec ses conteneurs
(`/Users` par défaut) : un préfixe npm sous `/opt/homebrew` ou `/usr/local` n'en est pas un ; ajoutez-le dans
Settings > Resources > File sharing, ou utilisez `install.sh`.

`orkeon-code --version` affiche la version d'Orkeon Code, d'où il s'exécute (`install:` ou `clone:`), la version
d'Orkeon attendue et celle trouvée, sans rien démarrer.

**Depuis les sources**, pour modifier Orkeon Code ou suivre `main` :

```bash
git clone https://github.com/Orkeon/orkeon-code.git ~/orkeon-code
```

Si vous le souhaitez, mettez le lanceur dans votre `PATH` : `ln -s ~/orkeon-code/orkeon-code ~/.local/bin/orkeon-code`.
Un clone garde son état dans `.crew-output/` et sa démo dans `fixtures/`, et lit d'abord `config/appsettings.local.json`.

## 2. Settings et clé

```bash
cd ~/orkeon-code
cp config/appsettings.example.json config/appsettings.local.json
export DEEPSEEK_API_KEY=...
```

L'exemple vise DeepSeek ; tout point d'accès compatible OpenAI, ou un autre fournisseur pris en charge par Orkeon
(Anthropic compris), fonctionne en changeant `Llm:BaseUrl`, `Llm:Model` et `Llm:ApiKeyEnvVar`
([Configuration](configuration.md)). Le lanceur cherche aussi `~/.config/orkeon-code/appsettings.json` (une installation ne lit que celui-là : copiez-y l'exemple de `~/.local/lib/orkeon-code/current/config/`), ou prend
`--settings FILE`. Un modèle sur cette machine à la place, sans clé : `config/appsettings.ollama.example.json`, sur
Ollama ([Configuration](configuration.md#le-llm)).

## 3. Choisir un runtime

**Windows** : `orkeon-code.ps1` n'a ni mode source ni `--demo` (`-Mode` n'accepte que `docker` ou `tool`) ; tant que
`1.0.0-rc.6` n'est pas tagué, rien n'y tourne donc nativement. Utilisez WSL avec le lanceur bash d'ici là.

Orkeon Code exige Orkeon `1.0.0-rc.6`, la version de `.orkeon-version`. **Tant que cette version n'est pas taguée et
publiée, seul le [mode source](#mode-source--un-checkout-dorkeon) fonctionne** : le mode tool a besoin de ses paquets
et le mode docker de son image, et le smoke runtime de la CI, qui tire cette image, échoue d'ici là.
L'état de la garde de l'hôte (`/permissions`) et les outils intégrés typés demandent le `main` d'Orkeon après
Orkeon/orkeon#130 : sur `1.0.0-rc.6`, l'état de la garde se lit « unknown » et rien d'autre ne change.

Le lanceur prend le premier mode disponible, dans cet ordre, sauf si `--mode` en décide autrement.

### Mode tool : `orkeon-repl` installé

Le REPL est `orkeon-repl` (`Orkeon.ConsoleApp`), à la version de `.orkeon-version`. Le paquet Debian et les
archives de release le livrent autonome, avec son propre esbuild : aucun .NET à installer.

**Debian et Ubuntu** (amd64, arm64) : le paquet `orkeon` installe `/usr/bin/orkeon-repl`. Ajoutez la source apt
d'Orkeon une fois, comme le décrit [Install with apt](https://github.com/Orkeon/orkeon/blob/main/docs/guides/install-with-apt.md),
puis `sudo apt install orkeon`. Une version candidate telle que `1.0.0-rc.6` est publiée sur le canal `rc`
(`Suites: raw/apt/rc/`), pas sur `stable`.

**Autres systèmes** : l'**archive complète** de la [release d'Orkeon](https://github.com/Orkeon/orkeon/releases) pour
votre plateforme : `orkeon-<version>-linux-x64.tar.gz`, `-linux-arm64`, `-osx-x64`, `-osx-arm64`, ou, sous Windows,
`orkeon-<version>-win-x64.zip` (la seule archive Windows qui porte `orkeon-repl` : le `.msi` est la CLI `orkeon` et
Orkeon Studio, sans `orkeon-repl` ni `install.ps1`). Vérifiez-la avec le `SHA256SUMS` de la release, extrayez-la et
lancez `./install.sh` (`install.ps1` sous Windows) : il installe dans `~/.local/lib/orkeon` et lie `orkeon-repl` dans
`~/.local/bin`, sans `sudo`.

```bash
v=$(cat .orkeon-version); rid=linux-x64            # or linux-arm64, osx-x64, osx-arm64
curl -fLO "https://github.com/Orkeon/orkeon/releases/download/v$v/orkeon-$v-$rid.tar.gz"
curl -fLO "https://github.com/Orkeon/orkeon/releases/download/v$v/SHA256SUMS"
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf "orkeon-$v-$rid.tar.gz" && (cd "orkeon-$v-$rid" && ./install.sh)
```

Les archives `orkeon-cli-*` et le `.msi` (somme de contrôle dans `SHA256SUMS.msi`) ne portent que la CLI `orkeon`, pas
`orkeon-repl`.

Alternatives : l'outil .NET `Orkeon.ConsoleApp` depuis GitHub Packages (un token GitHub avec `read:packages` est
requis bien que le paquet soit public), ou `ORKEON_REPL` positionnée sur n'importe quelle ligne de commande qui
démarre le REPL. Aucun des deux ne livre esbuild : lancez `npm ci` une fois dans le checkout et le lanceur utilise
celui que npm a installé (`ORKEON_ESBUILD_PATH` le remplace).

### Mode docker : rien à installer sauf Docker

Le lanceur exécute `ghcr.io/orkeon/orkeon-runners:<.orkeon-version>`, qui porte le REPL et esbuild ; l'image est
construite pour `linux/amd64` et `linux/arm64`, et Docker tire celle de votre machine. Le projet est monté dans le
conteneur ; sous Linux, le conteneur tourne avec votre uid, si bien que les fichiers que l'agent écrit vous
appartiennent. L'outil shell tourne dans le conteneur.

### Mode source : un checkout d'Orkeon

`ORKEON_SOURCE=~/src/orkeon ./orkeon-code --mode source` construit `src/apps/Orkeon.ConsoleApp` dans ce checkout
(`dotnet build --no-restore`, sous le `global.json` du checkout), puis exécute la
`bin/Debug/net10.0/Orkeon.ConsoleApp.dll` construite, depuis votre projet, avec `dotnet <dll>`, qui ne lit aucun
`global.json` : un projet dont le `global.json` épingle un autre SDK fonctionne quand même. Il faut le SDK .NET 10, la
solution Orkeon restaurée une fois (`dotnet restore Orkeon.sln` dans le checkout), et esbuild : `npm ci` une fois dans
ce checkout, ou `ORKEON_ESBUILD_PATH`.

## 4. Première session

```bash
orkeon-code --demo                   # a throwaway sample repository (fixtures/ in a clone, ~/.orkeon-code/demo once installed)
cd ~/src/my-project && orkeon-code   # the current directory is the project
orkeon-code --workspace ~/src/other  # or name it
```

La bannière affiche le projet, les settings et le mode. Dans le REPL :

| Essayez | Ce qui se passe |
|---|---|
| `/doctor` | Vérifie la configuration du LLM, les outils et les montages |
| `/init` | Analyse le projet et écrit `AGENTS.md`, les instructions que l'agent lit à chaque tour (un `CLAUDE.md` existant y est fusionné, et reste lu quand il n'y a pas d'`AGENTS.md`) |
| `plan: où sont définies les routes HTTP ?` | Une question en lecture seule |
| `renomme parseArgs en parseCliArgs` | En mode `default`, le REPL demande avant chaque modification : `[y] once / [s] session / [n] no` |
| `/mode acceptEdits` puis `ajoute un test pour parseCliArgs` | Les modifications passent sans demander pour la session ; une commande demande toujours |
| `/diff`, `/commit`, `/review` | Les flux de travail git sur le projet |
| `/context`, `/compact`, `/cost` | La fenêtre de contexte et la session |
| `/exit` | Quitter |

Le texte saisi sans `/` initial est envoyé à `/assistant`. La liste complète : [Commandes](commands.md).

## 5. Optionnel : la transcription de la parole

Pour confier à l'assistant une note vocale, une réunion enregistrée ou un enregistrement d'écran commenté à la
voix, en mode tool ou source :

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh                # uv, once
mkdir -p ~/audio                                                # the folder of your audio and video files
WHISPER_MODEL=small bash scripts/whisper-mcp-smoke.sh --tts    # resolves the server's environment, Piper included, downloads the model, checks a 5 s sample
export ORKEON_CODE_AUDIO_DIR=~/audio
./orkeon-code --mode tool --workspace ~/src/my-project          # or --mode source; the banner shows an "audio" line
```

puis, dans le REPL : `/transcribe --list`, puis `/transcribe daily.m4a --then "list the tasks I mention"`. Avec
`ORKEON_CODE_VOICE=1` exportée aussi, `/voice` dicte une requête et `/say` lit la dernière réponse à voix haute.
Détails, modèles, backends et comment le modèle appelle les outils lui-même :
[Configuration](configuration.md#transcription-de-la-parole).

## Ce que l'agent écrit dans votre projet

Outre les changements que vous demandez : `AGENTS.md` (`/init`), `.orkeon/config.json` (`/config`),
`.orkeon/agents.json` (`/agents`) et `.git/ORKEON_COMMITMSG` (`/commit` y écrit le message pour `git commit -F` ;
git ne le suit pas). Ajoutez `.orkeon/` au `.gitignore` du projet si vous ne voulez pas les partager. Les
transcriptions vont dans le dossier d'état (`.crew-output/transcripts` dans un clone, `~/.orkeon-code/state/transcripts` une fois installé), jamais dans le projet. La
conversation, le mode de session (`/mode`) et les règles de permission sont gardés en mémoire et finissent avec le
REPL.

## Dépannage

- **Toutes les réponses sont vides** : le fichier de settings n'a pas de section `Llm`, ou aucune clé n'atteint le
  runtime. Le lanceur avertit des deux au démarrage.
- **Le tour attend sur `approve <tool>? [y] once / [s] session / [n] no`** : le mode vous interroge sur cet appel ;
  répondez sur la ligne suivante. `acceptEdits:` ou `/mode acceptEdits` arrête les questions sur les modifications,
  et une règle d'autorisation celles sur les appels qu'elle couvre ([Permissions](permissions.md)).
- **Toutes les commandes shell échouent avec une erreur de confinement** : les settings mettent
  `Orkeon:Tools:Shell:Confinement:Mode` à `Bubblewrap`, et `bwrap` manque ou ne peut pas créer ses espaces de noms
  (un autre OS, un conteneur). Installez bubblewrap, ou remettez le mode à `None` ([SECURITY.md](../../SECURITY.md)).
- **Pas de ligne `audio` dans la bannière, ou `no registered tool 'transcribe_audio'`** : le lanceur dit pourquoi au
  démarrage (uv absent, un serveur `whisper` dans le fichier de settings, mode docker). Un serveur qui ne peut pas
  démarrer coûte une ligne `fail:` qui le nomme ; `bash scripts/whisper-mcp-smoke.sh` le lance seul
  ([mcp/whisper/README.md](../../mcp/whisper/README.md#troubleshooting)).
  `MCP server 'whisper' could not be connected: no answer within 30 s` veut dire que le script smoke ci-dessus a
  été sauté : le premier `uv run` résout l'environnement du serveur en quelques minutes, et le REPL attend 30 s.
- **Une commande manque** : le chargeur garde au plus `Orkeon:Cli:ScriptCommands:MaxScripts` commandes (200 par
  défaut). `bash scripts/smoke-runtime.sh` vérifie que chaque commande se charge.
- **Le REPL refuse un montage et quitte au démarrage** : il refuse un montage sur `/sandbox`, `/credentials`,
  `/cli-commands...` ou `/crews...`, et une racine montée deux fois. Le lanceur ne monte que `/workspace`, `/output`
  et `/tmp`, et démarre le REPL depuis le projet avec `ORKEON_ALLOW_EXTERNAL_MOUNTS=1` : vérifiez les arguments
  `--mount` passés après `--` et les `Orkeon:FileSystem:Mounts` du fichier de settings.
