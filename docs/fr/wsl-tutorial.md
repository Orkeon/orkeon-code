# Tutoriel : la voix et un modèle local sous WSL2, sur le GPU

Ce tutoriel installe Orkeon Code sous WSL2 (Windows 11) et y branche, sur la carte graphique de la machine, la
transcription de la parole (Whisper), la synthèse vocale (Piper, puis Kokoro en option) et un modèle de langue local
(Qwen par Ollama) : rien ne quitte la machine. Il a été déroulé en octobre 2026 sur un portable Windows 11 avec une
NVIDIA GeForce RTX 3070 Ti Laptop (8 Go de mémoire vidéo) ; les durées et les tailles citées viennent de là.

**Tout se tape dans un terminal WSL** (Ubuntu ou Debian), jamais dans PowerShell, sauf les lignes marquées
*PowerShell*. Les blocs se copient tels quels, un par étape, et chaque étape dit ce que vous devez voir.

## 0. Le parcours

| Étape | Quoi | Vérifié par |
|---|---|---|
| 1 | Repartir propre : retirer un essai précédent | plus rien ne répond |
| 2 | L'audio de WSL (WSLg) : haut-parleurs et micro de Windows vus de Linux | vous vous entendez |
| 3 | Orkeon depuis son paquet apt | `orkeon --version` |
| 4 | Orkeon Code dans le home WSL, ses réglages, `uv` | `/doctor` dans le REPL |
| 5 | Le serveur vocal seul : Whisper sur CPU puis sur le GPU, Piper | le script smoke |
| 6 | Dans le REPL : `/transcribe`, `/say`, `/voice`, la conversation vocale | vous entendez la réponse |
| 7 | Option : la voix Kokoro sur le GPU (speaches, Docker) | `/say` avec une meilleure voix |
| 8 | Option : le modèle de langue en local, `qwen3.5:2b` par Ollama sur le même GPU | `/doctor`, `ollama ps` |

Les briques : **Whisper** (modèle de reconnaissance de la parole d'OpenAI, poids ouverts), que le serveur
`mcp/whisper` d'Orkeon Code fait tourner par `faster-whisper` ; **Piper**, un moteur de synthèse vocale léger, sur
CPU ; le tout exposé au REPL comme un serveur MCP que le lanceur `orkeon-code` déclare lui-même ; **Ollama**, qui sert
un modèle de langue sur le GPU, qu'Orkeon reconnaît à son port.

## 1. Repartir propre

Si la distribution a déjà vu un essai d'Orkeon ou de la voix, retirez ce qui prendrait la place : le paquet apt
`orkeon` et sa source, une installation depuis une archive de release (`~/.local/lib/orkeon`,
`~/.local/bin/orkeon-repl`), l'environnement du serveur vocal d'un clone précédent, un conteneur `speaches`. Chaque
ligne ne fait rien quand il n'y a rien à retirer. Les paquets Python posés à la main par pip (`faster-whisper`,
`piper-tts`, `sounddevice`) se retirent par `pip uninstall` ; les modèles téléchargés, les images Docker et
`~/.config/Orkeon` restent : la section 10 s'en charge.

```bash
sudo rm -f /etc/apt/sources.list.d/orkeon.sources /etc/apt/sources.list.d/orkeon.list && (dpkg -s orkeon >/dev/null 2>&1 && sudo apt-get purge -y orkeon orkeon-archive-keyring || true) && sudo rm -f /usr/share/keyrings/orkeon-archive-keyring.gpg && sudo apt-get update -qq
```

```bash
rm -rf ~/.local/lib/orkeon ~/.local/bin/orkeon-repl ~/.local/bin/orkeon ~/orkeon-code/mcp/whisper/.venv; docker rm -f speaches 2>/dev/null; command -v orkeon orkeon-repl || echo clean
```

Attendu : `clean`.

## 2. L'audio de WSL

Sous Windows 11, WSLg fournit à chaque distribution un serveur PulseAudio relié à la carte son de Windows
(`/mnt/wslg/PulseServer`, variable `PULSE_SERVER` déjà posée). Le serveur vocal enregistre et joue par PortAudio,
qui sous Linux parle ALSA : il faut router ALSA vers PulseAudio (`~/.asoundrc` et le greffon `libasound2-plugins`).

Si WSL n'a pas été mis à jour depuis longtemps (*PowerShell*, une fois) :

```powershell
wsl --update
```

```powershell
wsl --shutdown
```

Puis, dans WSL (`curl` et `git` aussi, qu'une image nue n'a pas) :

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates git pulseaudio-utils libportaudio2 libasound2-plugins
```

```bash
printf 'pcm.!default { type pulse }\nctl.!default { type pulse }\n' > ~/.asoundrc
```

```bash
pactl info | grep -E "Server String|Default Sink|Default Source"
```

Attendu : `Server String: unix:/mnt/wslg/PulseServer`, `Default Sink: RDPSink`, `Default Source: RDPSource`.

**Les haut-parleurs** : la phrase française de 5 s livrée avec le serveur (elle parle de « dérive »), prise sur
GitHub puisque le dépôt n'est pas encore cloné :

```bash
curl -fsSL -o /tmp/fr-5s.wav https://raw.githubusercontent.com/Orkeon/orkeon-code/main/mcp/whisper/samples/fr-5s.wav && paplay /tmp/fr-5s.wav
```

**Le micro** : 20 secondes de dictée (lisez un paragraphe à voix haute ; `Ctrl+C` arrête plus tôt), réécoutées
aussitôt. Ce fichier sert à l'étape 6 :

```bash
mkdir -p ~/audio && timeout 20 parecord --channels=1 --rate=16000 --file-format=wav ~/audio/note.wav ; paplay ~/audio/note.wav
```

> **Le micro n'enregistre que du silence** : Windows → Paramètres → Confidentialité et sécurité → Microphone →
> « Autoriser les applications de bureau à accéder à votre microphone » (WSLg passe par le client Bureau à
> distance, `msrdc.exe`). Puis `wsl --shutdown` (*PowerShell*) et rouvrez le terminal WSL. Vérifiez aussi le micro
> par défaut dans les paramètres son de Windows.

## 3. Orkeon depuis son paquet apt

Le canal `rc` porte la dernière release d'Orkeon, `1.0.0-rc.6`, une release candidate : Orkeon Code est vérifié
contre un commit du `main` d'Orkeon (`.orkeon-version`), et le mode tool exécute cette release en retard sur l'épingle
([Premiers pas](getting-started.md)). Le canal `dev` publie un paquet par commit de `main` validé par la CI, versionné
`1.0.0~rc.6.dev.<n>` (`n` est le numéro de l'exécution CI), les trois derniers builds seulement : il sert à suivre
`main` en avance sur l'épinglage, pas à ce tutoriel. Le paquet installe
`/usr/bin/orkeon-repl` (le REPL, avec son `esbuild` : aucun .NET ni npm à installer) et `orkeon` (la CLI). Systèmes
pris en charge : Debian 12 et 13, Ubuntu 22.04, 24.04 et 26.04 (`cat /etc/os-release` le dit).

Le bloc est celui du guide d'Orkeon
([Install with apt](https://github.com/Orkeon/orkeon/blob/main/docs/guides/install-with-apt.md)), avec la seule
différence que sa table des canaux prescrit pour une release candidate : `Suites: raw/apt/rc/` au lieu de `stable`. La clé est
vérifiée par son SHA-256 avant d'être confiée à apt, pour cette source seulement (`Signed-By`).

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
```

```bash
curl -fsSL -o /tmp/orkeon-archive-keyring.gpg https://github.com/Orkeon/orkeon/raw/apt/orkeon-archive-keyring.gpg
```

```bash
echo "0cc5e804e1ee49c50ec5b23145ee7ee65d4834a08b8dc38914674249dfcc6a21  /tmp/orkeon-archive-keyring.gpg" | sha256sum --check
```

Attendu : `/tmp/orkeon-archive-keyring.gpg: OK`. Sinon, ne continuez pas.

```bash
sudo install -m 0644 /tmp/orkeon-archive-keyring.gpg /usr/share/keyrings/orkeon-archive-keyring.gpg
```

```bash
sudo tee /etc/apt/sources.list.d/orkeon.sources > /dev/null <<'EOF'
Types: deb
URIs: https://github.com/Orkeon/orkeon/
Suites: raw/apt/rc/
Include: orkeon orkeon-archive-keyring
Signed-By: /usr/share/keyrings/orkeon-archive-keyring.gpg
EOF
```

```bash
sudo apt-get update && sudo apt-get install -y orkeon orkeon-archive-keyring
```

```bash
orkeon --version && command -v orkeon-repl
```

Attendu : `1.0.0-rc.6` (ou la forme que `orkeon` affiche pour `1.0.0~rc.6`) et `/usr/bin/orkeon-repl`. Plus tard, la
release candidate suivante se prend par `sudo apt update && sudo apt upgrade` ; `apt list -a orkeon` liste celles du
canal, et `/status` dit si celle qui tourne est le commit de `.orkeon-version`.

## 4. Orkeon Code dans le home WSL

Un checkout sur le disque Windows (`/mnt/c/...`) est lisible de WSL, mais y faire tourner le REPL et y créer le
`.venv` du serveur vocal serait lent (système de fichiers 9p) et fragile (droits, liens symboliques). Le dépôt se
clone depuis GitHub dans le home WSL, sur ext4 (un clone déjà là est mis à jour à la place) :

```bash
if [ -d ~/orkeon-code/.git ]; then git -C ~/orkeon-code pull --ff-only; else git clone https://github.com/Orkeon/orkeon-code ~/orkeon-code; fi && cd ~/orkeon-code && git log --oneline -1
```

Attendu : le dernier commit de `main`.

Les réglages et la clé du modèle de langue (l'exemple vise DeepSeek ; tout point d'accès compatible OpenAI, ou un
autre fournisseur qu'Orkeon connaît, se règle dans la section `Llm` : [Configuration](configuration.md)). La clé
reste dans une variable d'environnement, jamais dans un fichier :

```bash
cp config/appsettings.example.json config/appsettings.local.json
```

```bash
export DEEPSEEK_API_KEY=...
```

`uv`, qui résout et lance le serveur vocal (Python 3.11 ou plus ; `uv` en télécharge un si la distribution n'en
a pas) :

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.local/bin/env && uv --version
```

Premier REPL, sans la voix, sur le dépôt d'exemple jetable (`--demo`), en mode `tool` (le `orkeon-repl` du paquet) :

```bash
./orkeon-code --mode tool --demo
```

Le bandeau affiche `orkeon-code <version> on Orkeon 5fe53ac (tool)` (`5fe53ac` est l'épingle de `.orkeon-version`,
pas la version du paquet), le projet et le fichier de réglages. Dans le REPL :

| Commande | Attendu |
|---|---|
| `/doctor` | La configuration LLM, les outils et les montages verts ; `toolchain: node` et `toolchain: dotnet` peuvent rester rouges (section 9), sans effet en mode `tool` ; `version` avertit : le paquet est la dernière release, pas l'épingle |
| `/permissions` | L'état de la garde : `on` (un `main` d'Orkeon récent ; `unknown` voudrait dire un build trop vieux) |
| `plan: que fait ce projet ?` | Une réponse du modèle (sinon : la clé n'arrive pas, le lanceur l'a dit au démarrage) |
| `/exit` | Sortie |

## 5. Le serveur vocal seul

Deux prérequis de la section 4, que le script ne vérifie pas lui-même :

- **Depuis `~/orkeon-code`, pas depuis un checkout sur `/mnt/c/...`.** Le script se place dans le checkout où il vit :
  lancé depuis le disque Windows, il crée `mcp/whisper/.venv` et ses roues CUDA (2,5 Go) à travers le système de
  fichiers 9p : lent, et fragile. Le clone ext4 du home WSL est là pour ça.
- **`uv` sur le `PATH`.** Sans lui le script s'arrête sur `whisper-mcp-smoke: uv not found. Install it: curl …`.
  L'installeur de la section 4 pose `uv` dans `~/.local/bin` et ajoute ce dossier au `PATH` des *nouveaux*
  terminaux ; un terminal ouvert avant veut `source ~/.local/bin/env`. Et la section 10 retire `uv` : après un
  grand nettoyage, la section 4 est à refaire.

Le script smoke lance le serveur comme Orkeon le fait, par stdio, liste ses six outils, transcrit `fr-5s.wav`
et, avec `--tts`, fait écrire une phrase à Piper (haut-parleur éteint) que le même serveur retranscrit. La
première exécution résout l'environnement Python dans `mcp/whisper/.venv` (une à deux minutes), télécharge le
modèle (`small` : 462 Mo) et la voix française de Piper (`fr_FR-siwis-medium`, 63 Mo, dans `~/.cache/orkeon-code/piper`).
C'est pour cela que le smoke passe avant le premier REPL : Orkeon donne 30 s à un serveur MCP pour répondre, et
un premier `uv run` lancé par le REPL les dépasse (section 9).

**Sur le CPU** :

```bash
WHISPER_MODEL=small bash scripts/whisper-mcp-smoke.sh --tts
```

Attendu : `handshake + list_tools: … s, tools: list_audio, record_and_transcribe, speak, stop_speaking,
transcribe_audio, whisper_info`, le rapport de `whisper_info`, la transcription contenant « dérive », puis la phrase
de Piper retranscrite (« synthèse vocale » avec `small`). Ordre de grandeur de `small` sur CPU : 6 × le temps réel.

**Sur le GPU.** Sous WSL, aucun pilote NVIDIA ne s'installe dans Linux : celui de Windows suffit, et l'extra `cuda`
du serveur apporte cuBLAS et cuDNN en roues Python (environ 2,5 Go au premier appel), que le serveur précharge
lui-même : ni CUDA Toolkit, ni `LD_LIBRARY_PATH`. `turbo` (`large-v3-turbo`, 1,6 Go à télécharger) est le meilleur
modèle sur un GPU de 8 Go : il écrit juste les noms propres que `small` déforme (`small` tient en 1,3 Go de mémoire
vidéo).

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
```

Attendu : le nom de la carte et sa mémoire, par exemple `NVIDIA GeForce RTX 3070 Ti Laptop GPU, 8192 MiB`.

```bash
WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 WHISPER_MODEL=turbo bash scripts/whisper-mcp-smoke.sh --tts
```

Attendu : la même sortie que sur le CPU, `whisper_info` disant `cuda` et `float16`, et le premier passage qui
télécharge plusieurs Go (roues CUDA, `turbo`, la voix Piper) : quelques minutes. Mesuré sur ce GPU, pour un
enregistrement de 45 minutes : `small` en 95 s (28 × le temps réel), `turbo` en 106 s, contre 7 min 14 s pour
`small` sur un CPU de 20 cœurs.

## 6. Dans le REPL : transcrire, lire à voix haute, dicter

Cinq variables suffisent au lanceur : il monte `~/audio` sur `/audio`, écrit les transcriptions dans
`.crew-output/transcripts` (vues comme `/transcripts`), déclare le serveur au REPL avec les extras `tts`, `voice`
et `cuda`, et ouvre le micro et le haut-parleur (`ORKEON_CODE_VOICE=1`).

```bash
export ORKEON_CODE_AUDIO_DIR=~/audio ORKEON_CODE_VOICE=1 WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 WHISPER_MODEL=turbo
```

```bash
./orkeon-code --mode tool --demo
```

Le bandeau gagne une ligne : `audio    : /home/<vous>/audio -> /audio (transcripts: …/.crew-output/transcripts,
model turbo on the GPU, microphone and speaker on)`. Si elle manque, le lanceur a dit pourquoi juste avant
(`uv` absent du `PATH`, par exemple : `source ~/.local/bin/env`).

**Transcription** (la note de l'étape 2) :

| Commande | Attendu |
|---|---|
| `/debug-tool-call whisper_info` | Le backend `local`, `turbo` sur `cuda`, `model_cached: True`, micro et haut-parleur `on` |
| `/transcribe --list` | `/audio/note.wav` |
| `/transcribe note.wav --lang fr` | Le texte de votre note ; `--prompt "Orkeon, MCP, WSL"` épelle juste les noms que vous citez |
| `/transcribe note.wav --then "résume cette note en une phrase"` | Le modèle répond sur la transcription (clé nécessaire) |

Une transcription courte revient en ligne ; une longue est écrite sous `/transcripts/<nom>.txt` (et en parties
`.part-NN.txt` au-delà de 30 000 caractères) que l'assistant lit par `file_read`. Une seule transcription à la fois ;
le REPL reste disponible pendant qu'elle tourne.

**Synthèse vocale** (Piper, sur CPU : une phrase démarre environ 4 s après la commande, le REPL rend la main
aussitôt) :

| Commande | Attendu |
|---|---|
| `/say Bonjour, la synthèse vocale fonctionne.` | La phrase dans les haut-parleurs ; une ligne `reading aloud: N characters, X s` |
| `/say` | La dernière réponse de l'assistant, lue : le Markdown nettoyé (blocs de code et tableaux sautés) |
| `/say --stop` | Coupe la lecture |
| `/say --voice en_US-lessac-medium Hello there` | Une autre voix Piper, téléchargée au premier usage |

**Dictée** (le serveur enregistre jusqu'à 2 s de silence, 60 s au plus ; rien n'est envoyé sans ordre) :

| Commande | Attendu |
|---|---|
| `/voice --lang fr` | Parlez ; à l'arrêt, `🎙 <votre phrase>` puis `send it: /voice send · …` |
| `/voice send` | La phrase part à l'assistant comme une requête tapée |
| `/config set voice.reply on` | Chaque réponse est désormais lue à voix haute |
| `/voice --go` | Enregistre et envoie d'un coup : la conversation vocale complète, requête dictée, réponse lue |
| `/config set voice.reply off` puis `/exit` | Retour au silence, sortie |

Mesuré sur cette machine : une réponse de 236 caractères lue en 14 s ; `/voice` coupe une lecture en cours avant
d'ouvrir le micro, pour ne pas l'enregistrer. Dans une pièce bruyante, `/voice` ne s'arrête pas seul : exportez
`WHISPER_SILENCE_RMS=0.02` (ou `0.05`) avant de relancer.

## 7. Option : la voix Kokoro sur le GPU (speaches)

Piper suffit, mais [speaches](https://github.com/speaches-ai/speaches) sert la voix Kokoro, plus naturelle, par la
même API que celle d'OpenAI, sur le GPU : la synthèse d'une phrase prend 0,6 s au lieu de 4,5. Il faut Docker dans
WSL avec le GPU : Docker Desktop (intégration WSL activée pour votre distribution) le fournit sans rien d'autre.
Aucune clé ne part vers ce serveur (le serveur vocal n'en envoie que si `TTS_API_KEY_VAR` en nomme une).

```bash
docker run -d --name speaches --gpus all -p 127.0.0.1:8000:8000 -v speaches-hf:/home/ubuntu/.cache/huggingface ghcr.io/speaches-ai/speaches:latest-cuda
```

```bash
curl -X POST http://localhost:8000/v1/models/speaches-ai/Kokoro-82M-v1.0-ONNX
```

Attendu : le téléchargement du modèle (26 s mesurées), une fois.

```bash
export TTS_BACKEND=http TTS_BASE_URL=http://localhost:8000/v1 TTS_MODEL=speaches-ai/Kokoro-82M-v1.0-ONNX TTS_VOICE=ff_siwis
```

```bash
./orkeon-code --mode tool --demo
```

Puis `/say Bonjour, ceci est Kokoro sur la carte graphique.` : la voix `ff_siwis` (le français de Kokoro) presque
sans délai. Le lanceur a ajouté de lui-même l'extra `openai` au serveur. Pour revenir à Piper : `unset TTS_BACKEND
TTS_BASE_URL TTS_MODEL TTS_VOICE`. Arrêter le serveur : `docker stop speaches`.

## 8. Option : Qwen en local avec Ollama

Le modèle de langue des sections 4 à 6 est distant (DeepSeek, une clé). [Ollama](https://ollama.com) en fait tourner
un sur le GPU, sans clé et sans que rien ne quitte la machine ; Orkeon le reconnaît à son port (`11434`) et lui parle
en natif (`/api/chat`, appels d'outils compris). Ce tutoriel prend **`qwen3.5:2b`** : 2,7 Go, fenêtre de 256K,
outils, raisonnement et vision, qui tient à côté de Whisper `turbo` dans les 8 Go de la carte (environ 3 Go chargé).
Le plus petit Qwen de la bibliothèque, `qwen2.5:0.5b` (398 Mo), vérifie la plomberie (Orkeon ↔ Ollama, les appels
d'outils natifs, le GPU partagé) mais pas grand-chose d'autre ; `qwen3:8b` (5,2 Go), avec lequel Orkeon Code a été
validé, ne tient plus à côté de `turbo` (section 9). Un autre Qwen, ce sont les mêmes commandes avec son nom : le
tableau dit lesquels tiennent. Les Qwen de la bibliothèque Ollama en octobre 2026 (taille du tag par défaut, fenêtre
annoncée ; tous savent appeler des outils, `qwen3` et au-delà raisonnent, `qwen3.5` et au-delà voient les images) :

| Modèle | Mo | Fenêtre | À côté de `turbo` (8 Go) |
|---|---|---|---|
| `qwen2.5:0.5b` | 398 | 32K | oui, le plus petit |
| `qwen3:0.6b` | 523 | 40K | oui |
| `qwen2.5:1.5b` | 986 | 32K | oui |
| `qwen3.5:0.8b` | 1 200 | 256K | oui |
| `qwen3:1.7b` | 1 400 | 40K | oui |
| `qwen2.5:3b` | 1 900 | 32K | oui |
| `qwen3:4b` | 2 500 | 256K | oui |
| `qwen3.5:2b` | 2 700 | 256K | oui, le choix de ce tutoriel |
| `qwen3.5:4b` | 3 300 | 256K | oui |
| `qwen2.5:7b` | 4 700 | 32K | juste |
| `qwen3:8b` | 5 200 | 40K | déborde sur le CPU |
| `qwen3.5:9b` | 6 600 | 256K | non |
| `qwen2.5:14b`, `qwen3:14b` | 9 000, 9 300 | 32K, 40K | non |
| `qwen3.8:27b`, `qwen3.6:27b`, `qwen3.5:27b` | 18 000, 18 000, 17 000 | 256K | non |
| `qwen3:30b`, `qwen3-coder:30b` | 19 000 | 256K | non |
| `qwen2.5:32b`, `qwen3:32b` | 20 000 | 32K, 40K | non |
| `qwen3.5:35b`, `qwen3.6:35b` | 22 000, 23 000 | 256K | non |
| `qwen2.5:72b`, `qwen3.5:122b`, `qwen3:235b`, `qwen3-coder:480b` | 47 000, 81 000, 142 000, 290 000 | 32K ou 256K | non |

`qwen2.5-coder` existe aux mêmes tailles que `qwen2.5` (0.5b à 32b, 32K), entraîné pour le code.

**Ollama dans la distribution.** Pas d'autre pilote que celui de Windows : l'installeur reconnaît WSL2 et saute
l'installation du pilote NVIDIA. Ollama déjà installé (`ollama --version` répond) : l'installeur le met à jour, rien
d'autre.

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Attendu : `>>> Installing ollama to /usr/local`, la création de l'utilisateur et du service
(`>>> Enabling and starting ollama service...`), `>>> Nvidia GPU detected.`, puis
`>>> The Ollama API is now available at 127.0.0.1:11434.` et `>>> Install complete.`. Un
`WARNING: systemd is not running` veut dire une distribution sans systemd : activez-le (`[boot]` `systemd=true` dans
`/etc/wsl.conf`, puis `wsl --shutdown` côté Windows), ou lancez `ollama serve &` dans ce terminal à chaque session.

**La fenêtre de contexte.** Ollama sert chaque modèle avec 4 096 tokens par défaut, et Orkeon ne l'élargit pas par
requête (il n'envoie pas `num_ctx`). Le prompt système d'Orkeon Code en fait déjà environ 2 250, avant les schémas des
outils et la conversation : au-delà de la fenêtre, Ollama tronque le début du prompt sans erreur, et le modèle perd
ses consignes et ses outils. Le service reçoit donc 16 384 tokens, par un drop-in systemd :

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d && printf '[Service]\nEnvironment="OLLAMA_CONTEXT_LENGTH=16384"\n' | sudo tee /etc/systemd/system/ollama.service.d/context.conf >/dev/null && sudo systemctl daemon-reload && sudo systemctl restart ollama && systemctl show ollama -p Environment
```

Attendu : une ligne `Environment=…` qui contient `OLLAMA_CONTEXT_LENGTH=16384` (sans systemd :
`OLLAMA_CONTEXT_LENGTH=16384 ollama serve &` à la place).

**Le modèle** :

```bash
ollama pull qwen3.5:2b && ollama run qwen3.5:2b "Answer in one word: what is the capital of France?" && ollama ps
```

Attendu : le téléchargement (2,7 Go, une fois), `Paris` après quelques lignes de réflexion (`qwen3.5` raisonne avant
de répondre), puis une ligne `qwen3.5:2b … 100% GPU` (le modèle reste chargé 5 minutes après le dernier appel).
`100% CPU`, ou un partage `xx%/yy% CPU/GPU`, voudrait dire que le pilote n'est pas vu (section 9).

**Les réglages d'Orkeon Code.** Deux exemples tout prêts dans le dépôt, pour un second fichier à côté de celui de
la section 4 (un `.local.json` reste hors git) :

- [config/appsettings.ollama-whisper.example.json](../../config/appsettings.ollama-whisper.example.json), **la voie
  validée** : `appsettings.example.json` dont la section `Llm` vise Ollama (`qwen3.5:2b` sur
  `http://localhost:11434`, pas de clé puisque Orkeon n'en demande pas à Ollama, température 0,6, la recommandation de
  Qwen pour son mode raisonnement, `qwen3.5:4b` et `qwen3.5:0.8b` dans `AvailableModels`), plus le serveur vocal
  déclaré dans le fichier : `turbo` sur `cuda`, Piper, micro et haut-parleur. Quatre chemins `/home/me/...` à
  remplacer par les vôtres ; le checkout est `~/orkeon-code`. Les deux dossiers du serveur doivent exister : rien ne
  les crée à votre place.
- [config/appsettings.ollama.example.json](../../config/appsettings.ollama.example.json), la même section `Llm`
  seule : le serveur vocal reste alors déclaré par le lanceur depuis les variables de la section 6.

Avec le premier, une ligne copie, remplace les chemins, crée les dossiers et vérifie :

```bash
cd ~/orkeon-code && cp config/appsettings.ollama-whisper.example.json config/appsettings.ollama.local.json && sed -i "s#/home/me#$HOME#g" config/appsettings.ollama.local.json && mkdir -p ~/audio ~/transcripts && grep -o "$HOME/orkeon-code/mcp/whisper" config/appsettings.ollama.local.json | wc -l
```

Attendu : `2` (les deux chemins du serveur, `--project` et le script, pointent votre clone).

Puis l'environnement du serveur, résolu une fois hors du REPL : exactement la commande que le fichier déclare,
l'entrée fermée pour que le serveur s'arrête seul une fois démarré. Orkeon donne 30 s à un serveur MCP pour
répondre ; ce premier `uv run` télécharge les roues CUDA (cuBLAS 554 Mo, cuDNN 731 Mo) et les dépasse de loin :
lancé par le REPL, le serveur manquerait à chaque démarrage (`no registered tool 'whisper_info'`).

```bash
cd ~/orkeon-code && time (WHISPER_AUDIO_DIR=$HOME/audio WHISPER_OUT_DIR=$HOME/transcripts WHISPER_MODEL=turbo WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 WHISPER_MICROPHONE=1 WHISPER_SPEAKER=1 ~/.local/bin/uv run --project ~/orkeon-code/mcp/whisper --extra voice --extra tts --extra cuda ~/orkeon-code/mcp/whisper/whisper_mcp.py < /dev/null)
```

Attendu la première fois : `Preparing packages`, les deux roues NVIDIA qui se téléchargent, puis l'arrêt silencieux et
un `real` de plusieurs minutes ; relancée, elle revient en quelques secondes sans rien imprimer. Le smoke de la
section 5, lancé dans ce clone, prépare le même environnement et télécharge `turbo` en plus.

**Dans le REPL.** Les variables de la section 6 ne servent plus, le fichier porte tout ; encore exportées, le
lanceur dit `declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored, the settings file wins`, sans
conséquence.

```bash
./orkeon-code --mode tool --demo --settings config/appsettings.ollama.local.json
```

Le lanceur ne réclame aucune clé (la section `Llm` ne nomme pas d'`ApiKeyEnvVar`).

| Commande | Attendu |
|---|---|
| `/doctor` | `llm: model configured ✅ qwen3.5:2b`, le catalogue des trois Qwen, `/audio(ro)` et `/transcripts(ro)` parmi les montages ; `toolchain: node` ou `dotnet` rouges (section 9), sans effet ici |
| `/debug-tool-call whisper_info` | `audio: /audio -> /home/<vous>/audio`, `microphone: on (WHISPER_MICROPHONE=1)`, `speaker: on (WHISPER_SPEAKER=1)`, `backend: local`, `model: turbo`, `device: cuda`, `compute_type: float16`, `model_cached: True` une fois le smoke GPU de la section 5 passé, `False` sinon, `tts_backend: piper`, `tts_voice: fr_FR-siwis-medium` |
| `plan: que fait ce projet ?` | Une réponse du modèle local, courte ; dans un autre terminal, `ollama ps` montre le modèle chargé et `nvidia-smi` Ollama et le serveur vocal côte à côte (`turbo` : environ 2 Go, Qwen : environ 3 Go) |
| `/transcribe note.wav --then "résume cette note en une phrase"` | Le premier appel télécharge `turbo` (1,6 Go) si la section 5 ne l'a pas fait ; puis la transcription par Whisper, le résumé par Qwen, sur le même GPU : rien n'a quitté la machine |
| `/model` | `qwen3.5:4b` et `qwen3.5:0.8b` aussi ; un `ollama pull <nom>` avant de basculer sur un autre |
| `/exit` | Sortie |

Une réponse qui se fait attendre, c'est la réflexion de `qwen3.5` : `"Thinking": {"Enabled": false}` dans la
section `Llm` la coupe, au prix d'appels d'outils moins sûrs. Pour revenir à DeepSeek : relancez sans `--settings`.
Arrêter Ollama : `sudo systemctl stop ollama` (il redémarre avec la distribution ; `sudo systemctl disable ollama`
pour l'en empêcher).

## 9. Dépannage

| Symptôme | Piste |
|---|---|
| `pactl: Connection failure` ou `Server String` qui n'est pas `/mnt/wslg/PulseServer` | `echo $PULSE_SERVER` vide : `export PULSE_SERVER=unix:/mnt/wslg/PulseServer` ; un démon `pulseaudio` installé dans la distribution par un essai passé prend la place de celui de WSLg : `sudo apt-get purge pulseaudio` ; sinon `wsl --update` puis `wsl --shutdown` |
| `paplay` ne donne rien, sans erreur | La sortie par défaut de Windows ; `pactl list short sinks` doit montrer `RDPSink` |
| Le micro enregistre du silence | La confidentialité Windows (étape 2) ; `pactl list short sources` doit montrer `RDPSource` |
| `apt-get update` : `NO_PUBKEY` | La clé manque ou n'est pas au bon format : refaire les trois lignes de la clé (étape 3) |
| `apt-get update` : `Conflicting distribution` | La ligne `Suites:` a été modifiée au-delà du nom du canal |
| `apt-get install orkeon` : `Unable to locate package orkeon` | La source n'est pas sur `raw/apt/rc/` (`stable` ne porte que les versions finales, et il n'y en a pas encore) |
| `/doctor` : `toolchain: node ❌`, ou `toolchain: dotnet ❌ 10.0.2xx [/usr/share/dotnet/sdk]` | Le mode `tool` n'a besoin ni de l'un ni de l'autre : le paquet embarque son esbuild, et rien n'appelle `dotnet`. Pour les passer au vert quand même : node à la version de `.nvmrc` (nodesource ou nvm) ; pour dotnet, le `global.json` du dépôt demande le SDK `10.0.300` ou une bande supérieure (`latestFeature`) et la distribution a une bande plus ancienne : `sudo apt-get install --only-upgrade dotnet-sdk-10.0` (le dépôt apt de Microsoft, `/usr/share/dotnet`) |
| Pas de ligne `audio` dans le bandeau | Le lanceur a dit pourquoi : `uv` absent du `PATH`, un serveur `whisper` déjà déclaré dans les réglages ou l'environnement, mode docker |
| `whisper-mcp-smoke: uv not found. Install it: …` | L'étape 4 n'a pas été faite, ou la section 10 est passée par là, ou le terminal date d'avant l'installation : `source ~/.local/bin/env` ; sinon `curl -LsSf https://astral.sh/uv/install.sh \| sh && source ~/.local/bin/env` |
| `MCP server 'whisper' could not be connected: no answer within 30 s` au démarrage, puis `no registered tool 'whisper_info'` | Orkeon donne 30 s au serveur pour répondre ; le premier `uv run` du clone résout l'environnement (roues CUDA, minutes). Préparez l'environnement hors du REPL : le smoke (section 5), ou la commande déclarée lancée une fois à la main avec `< /dev/null` (section 8) ; relancez ensuite |
| `MCP server 'whisper' could not be connected: …` avec un chemin | Un chemin du fichier de réglages est faux : `Command` (`~/.local/bin/uv`), `--project` et le script (`~/orkeon-code/mcp/whisper`), les deux dossiers en double dans `Mounts` et `Env` |
| `fail: … Failed to start MCP server process` | `uv` n'est pas sur le `PATH` du REPL : `source ~/.local/bin/env` puis relancer |
| `Library libcublas.so.12 is not found` | `WHISPER_DEVICE=cuda` sans l'extra `cuda` : le lanceur et le smoke l'ajoutent seuls sur `WHISPER_DEVICE=cuda` ; un serveur déclaré à la main veut `--extra cuda` |
| `CUDA driver version is insufficient`, ou `nvidia-smi` absent dans WSL | Mettre à jour le pilote NVIDIA côté **Windows** ; `wsl --update` |
| `no microphone access (PortAudio library not found)` | `libportaudio2` manque, ou le serveur tourne sans l'extra `voice` (`ORKEON_CODE_VOICE=1`) |
| `the microphone is off` / `not played: the speaker is off` | `ORKEON_CODE_VOICE=1` n'était pas exporté au lancement |
| `/voice` ne s'arrête qu'au maximum | La pièce dépasse `WHISPER_SILENCE_RMS` : `0.02`, `0.05` |
| `Piper is not installed` | Le serveur tourne sans l'extra `tts` (le lanceur l'ajoute dès que Piper est le moteur) |
| Le premier appel semble bloqué | Le modèle se télécharge ; `whisper_info` dit `model_cached: False` tant qu'il n'est pas sur le disque |
| `Error: Timeout of 00:00:10 reached` sur `/debug-tool-call transcribe_audio` | La limite de Jint sur une commande synchrone, pas le serveur : utiliser `/transcribe`, qui attend dans un crew |
| Whisper invente du texte sur du silence | Hallucination connue ; le filtre `vad_filter` est actif par défaut ; nommer la langue (`--lang fr`) |
| `connection refused` sur `localhost:11434`, ou `/doctor` ne joint pas le modèle | Le service Ollama ne tourne pas : `sudo systemctl start ollama` (`systemctl status ollama`) ; sans systemd, `ollama serve &` |
| Le modèle local ignore ses consignes ou ses outils ; `journalctl -u ollama \| grep truncat` montre `truncating input prompt` | La fenêtre de 4 096 tokens par défaut : `systemctl show ollama -p Environment` doit contenir `OLLAMA_CONTEXT_LENGTH=16384` (section 8) |
| `ollama ps` : `100% CPU` | Le pilote Windows n'est pas vu d'Ollama : `nvidia-smi` dans WSL, `journalctl -u ollama \| grep -i cuda` ; mettre à jour le pilote côté Windows, `wsl --shutdown` |
| Un Qwen de 8 milliards (`qwen3:8b`, 5,2 Go) en plus de `turbo` sur le GPU | Ensemble ils approchent les 8 Go : le modèle de langue déborde sur le CPU (`ollama ps` : `xx%/yy% CPU/GPU`) ; prendre `small` pour Whisper, ou un Qwen plus petit (section 8) |

## 10. Tout retirer

Dans l'ordre : les deux blocs de l'étape 1 (le paquet et sa source, l'installation locale, le `.venv`, le
conteneur), puis ce qu'ils gardent.

```bash
rm -rf ~/orkeon-code ~/audio ~/transcripts ~/.asoundrc ~/.config/Orkeon ~/.cache/orkeon-code ~/.cache/huggingface/hub/models--Systran--faster-whisper-* ~/.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo
```

```bash
rm -rf ~/.cache/uv ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/env
```

```bash
sudo apt-get purge -y pulseaudio-utils libportaudio2 libasound2-plugins
```

```bash
docker rmi ghcr.io/speaches-ai/speaches:latest-cuda ; docker volume rm speaches-hf
```

Attendu, après les deux derniers : `Removing …` pour les trois paquets, puis `Untagged: …` et `speaches-hf`
(ou `No such image` / `No such volume` si l'étape 7 n'a pas été faite).

Ollama (étape 8), avec ses modèles (`/usr/share/ollama`) ; le fichier de réglages est parti avec `~/orkeon-code` :

```bash
sudo systemctl stop ollama ; sudo systemctl disable ollama ; sudo rm -rf /etc/systemd/system/ollama.service /etc/systemd/system/ollama.service.d /usr/local/lib/ollama /usr/local/bin/ollama /usr/share/ollama ~/.ollama ; sudo userdel ollama ; sudo groupdel ollama ; sudo systemctl daemon-reload
```

Attendu : `Removed … ollama.service` au `disable`, puis rien ; `ollama --version` répond désormais `command not found`.

## 11. Ce que ce tutoriel ne vérifie pas

- L'API d'OpenAI (`WHISPER_BACKEND=openai`, `TTS_BACKEND=openai`) : l'audio ou le texte quittent la machine, et il
  faut une clé `OPENAI_API_KEY` ; rien ici n'en a besoin.
- Le mode docker du lanceur : le serveur vocal y tourne sur l'hôte, en HTTP, sans micro
  ([mcp/whisper/README.md](../../mcp/whisper/README.md#docker-mode-the-server-on-the-host)). Le mode `tool` de ce
  tutoriel est le plus simple et le seul où `/voice` et `/say` ont le micro et le haut-parleur.
- Ollama installé côté Windows plutôt que dans la distribution : de WSL, `localhost:11434` ne le joint qu'avec le
  réseau en miroir (`networkingMode=mirrored` dans `.wslconfig`) ou un `OLLAMA_HOST=0.0.0.0` côté Windows et
  l'adresse de l'hôte dans `BaseUrl` ; l'étape 8 installe Ollama dans la distribution, où il voit le GPU par le
  même pilote.
- Le lanceur PowerShell (`orkeon-code.ps1`), Windows natif : il n'a pas de mode source, et WSL avec le lanceur bash,
  comme ici, est la voie documentée.
