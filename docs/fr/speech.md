# Voix

Orkeon Code entend et parle par le serveur MCP de la voix que ce dépôt livre : `/transcribe` transforme un fichier
audio ou vidéo en texte, `/voice` dicte une requête, et `/say` lit une réponse à voix haute. Cette page installe les
trois et liste leurs commandes. Les autres réglages sont dans [Configuration](configuration.md) ; une installation
complète sous WSL2, sur le GPU, est dans le [tutoriel WSL](wsl-tutorial.md).

## Transcription de la parole

`mcp/whisper/` contient un serveur MCP qui transcrit les fichiers audio et vidéo avec
[faster-whisper](https://github.com/SYSTRAN/faster-whisper), sur cette machine par défaut. Il lui faut
[uv](https://docs.astral.sh/uv/), rien d'autre : pas de `ffmpeg`, pas de paquet Python installé à la main. En modes
tool et source, une variable l'active :

```bash
export ORKEON_CODE_AUDIO_DIR=~/audio      # the folder of audio and video files
./orkeon-code
```

Le lanceur monte alors ce dossier sur `/audio` (lecture seule) et `<state>/transcripts` sur `/transcripts` (lecture
seule, `.crew-output/transcripts` par défaut), et déclare le serveur au REPL par l'environnement
(`ORKEON_MCP__Servers__whisper__*`), de sorte qu'aucun fichier de settings ne nomme ce checkout. La bannière affiche
une ligne `audio`. Le dossier tient de vrais fichiers : un lien qui pointe hors de lui est refusé par les outils de
fichiers.

`/transcribe` est la voie directe : l'appel est celui de la commande, il n'a donc besoin d'aucun réglage et la garde
ne demande rien.

| Commande | Ce qu'elle fait |
|---|---|
| `/transcribe --list` | Les fichiers audio et vidéo sous `/audio` |
| `/transcribe daily.m4a --lang fr` | Affiche la transcription, ou l'endroit où elle a été écrite quand elle est longue |
| `/transcribe daily.m4a --prompt "Orkeon, Jint, MCP"` | Orthographie ces mots correctement : noms de modules, acronymes, personnes |
| `/transcribe daily.m4a --then "list the tasks I mention"` | Exécute l'instruction sur la transcription, comme `/assistant` le ferait ; un préfixe `plan:` choisit le mode |
| `/transcribe "team review.mp4"` | Un nom qui contient un espace, entre guillemets |

`--then` vient en dernier et prend le reste de la ligne telle que saisie ; `--lang` s'écrit aussi `--language`. La
transcription tourne dans un crew, le temps qu'il faut : un `/transcribe` à la fois, et le REPL prend d'autres
commandes entre-temps. Avec `--then`, elle est faite au début du tour et compte dans les 30 minutes du tour. Le modèle
peut aussi appeler les outils lui-même, dans une requête telle que
`transcris /audio/daily.m4a et liste les tâches que je mentionne`, une fois qu'ils lui sont proposés :

| Étape | Commande |
|---|---|
| Vérifier la connexion, sans modèle | `/debug-tool-call whisper_info` |
| Proposer les outils à l'assistant | `/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read` |

| Variable | Effet |
|---|---|
| `ORKEON_CODE_AUDIO_DIR` | Active la transcription de la parole : le dossier monté sur `/audio` |
| `WHISPER_MODEL` | Le modèle : `tiny`, `base`, `small` (défaut), `medium`, `large-v3`, `turbo` |
| `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE_TYPE=float16` | Un GPU NVIDIA : le lanceur ajoute l'extra `cuda` du serveur, seul le pilote est nécessaire ([GPU](../../mcp/whisper/README.md#settings)) |
| `WHISPER_BACKEND`, `WHISPER_BASE_URL`, ... | Un autre backend : [mcp/whisper/README.md](../../mcp/whisper/README.md#settings) |

- `read` convient à ces trois outils avec le backend local par défaut : ils lisent `/audio` et n'écrivent que sous
  `/transcripts`, hors du projet.
- Avec `WHISPER_BACKEND=openai`, l'audio quitte la machine : marquez `transcribe_audio` `write`, ou laissez-le de
  côté et utilisez `/transcribe`.
- Le serveur marque `transcribe_audio`, `list_audio` et `whisper_info` en lecture seule (`readOnlyHint`), ce que la
  garde de permission lit une fois le serveur déclaré de confiance (`TrustAnnotations: true`, exporté par les
  lanceurs en `ORKEON_MCP__Servers__whisper__TrustAnnotations` et posé dans les exemples de settings) : ils s'exécutent sans question dans tous les modes qui les offrent, `dontAsk` compris.
- `record_and_transcribe`, `speak` et `stop_speaking` ne portent aucune annotation, donc la garde vous demande en
  `default` et en `acceptEdits` et les refuse en `plan` et en `dontAsk`
  ([Permissions](permissions.md#outils-supplémentaires)).

- Une transcription courte revient en ligne.
- Une longue est écrite dans `/transcripts/<name>.txt`, avec ses horodatages dans `<name>.segments.json` et, au-delà
  de 30 000 caractères, en parties `<name>.part-NN.txt` que `file_read` lit une à la fois.
- La première transcription avec un modèle le télécharge (462 Mo pour `small`) : `bash scripts/whisper-mcp-smoke.sh`
  avec `WHISPER_MODEL=small` le fait à l'avance.
- Un enregistrement de 45 minutes prend environ 7 minutes avec `small` sur un CPU, moins de 2 minutes sur le GPU
  d'un portable, où `turbo` est le meilleur modèle.
- Le runtime termine par une erreur d'outil un appel du serveur qui dépasse `MCP:Servers:whisper:CallTimeout` (60 s
  par défaut), bien que le serveur finisse et écrive la transcription : les lanceurs exportent
  `ORKEON_MCP__Servers__whisper__CallTimeout=00:15:00` et les exemples de settings posent les mêmes 15 minutes, qui
  couvrent une dictée à son plus long (`/voice --max 600`) et un long fichier sur CPU.
- Un fichier de settings à vous qui déclare le serveur a besoin de la clé aussi, sinon une dictée au-delà de 60 s
  échoue.

## Dictée

`/voice` dicte une requête au lieu de la taper. Le microphone et le haut-parleur restent fermés tant que le lanceur ne
tourne pas aussi avec `ORKEON_CODE_VOICE=1` : le serveur reçoit alors l'extra `voice` (sounddevice, qui a besoin de
PortAudio sous Linux : `libportaudio2`), et peut enregistrer et jouer ([synthèse vocale](#synthèse-vocale)). Modes
tool et source seulement.

```bash
export ORKEON_CODE_AUDIO_DIR=~/audio ORKEON_CODE_VOICE=1
./orkeon-code                                 # the banner's audio line says "microphone and speaker on"
```

| Commande | Ce qu'elle fait |
|---|---|
| `/voice` | Enregistre jusqu'à 2 s de silence (60 s au plus), puis affiche le texte ; rien n'est envoyé |
| `/voice send` | Envoie le texte affiché à l'assistant, comme `/assistant` le ferait : un `plan:` en tête, en minuscules tel que saisi, choisit le mode |
| `/voice --go` | Enregistre et envoie d'un coup, pour les mains occupées, sous le mode de la session (`/mode plan` d'abord : aucun préfixe dicté n'est lu) |
| `/voice --lang fr --prompt "Orkeon, Jint"` | La langue, et les mots à bien orthographier, comme pour `/transcribe` |
| `/voice --max 30 --silence 1.5` | L'enregistrement le plus long (1 à 600 s), le silence qui l'arrête (0,5 à 10 s) |

L'enregistrement s'arrête après le silence une fois la parole entendue, après 10 s sans parole, ou au maximum. Le
dernier enregistrement est conservé en `<state>/transcripts/dictation.wav`, son texte en `dictation.txt` (ce que
`/voice send` envoie) ; chaque enregistrement les vide d'abord, de sorte qu'un enregistrement qui échoue ne laisse
rien à envoyer, et il interrompt une lecture à voix haute encore en cours, que le microphone entendrait.
`record_and_transcribe` est pour `/voice` : ne le listez jamais dans `tools.extra`, ce qui laisserait le modèle ouvrir
le microphone. Une pièce bruyante peut demander un `WHISPER_SILENCE_RMS` plus élevé (`0.01` par défaut) pour que le
silence soit entendu.

## Synthèse vocale

`/say` lit à voix haute, par le même serveur : un texte, ou sans rien la dernière réponse de l'assistant. Le serveur
lit les mots, pas le Markdown : les blocs de code et les tableaux sont sautés, les liens gardent leur texte, et une
réponse longue est coupée à la dernière fin de phrase dans la seconde moitié de `TTS_MAX_CHARS` (1 200
caractères), sinon à la limite elle-même ; un texte où il n'y a rien d'autre à lire n'est pas lu. Il synthétise
avec [Piper](https://github.com/OHF-Voice/piper1-gpl) sur le CPU, où une phrase commence à être jouée environ 4 s
après l'appel, et joue en arrière-plan pendant que le REPL prend la commande suivante.

| Commande | Ce qu'elle fait |
|---|---|
| `/say Bonjour à tous` | Lit le texte |
| `/say` | Lit la dernière réponse de l'assistant |
| `/say --voice en_US-lessac-medium <text>` | Une autre [voix Piper](https://huggingface.co/rhasspy/piper-voices), récupérée au premier usage |
| `/say --stop` | Coupe la lecture |

`/config set voice.reply on` lit chaque réponse à voix haute : `/assistant` et le texte libre, `/summary`,
`/transcribe --then`, `/voice send` et `--go`. Avec `/voice --go`, c'est une conversation parlée : la requête est
dictée, la réponse lue en retour. La réponse s'affiche quand sa lecture commence, une fois synthétisée (quelques
secondes avec Piper, moins d'une avec Kokoro) ; `/say --stop` la coupe, `/config set voice.reply off` arrête la
lecture.
Un tour dont la lecture échoue garde sa réponse, avec un avertissement, et `voice.reply on` sans le serveur de parole
avertit à chaque tour.

La voix est `fr_FR-siwis-medium` sauf si `TTS_VOICE` en nomme une autre ; la première lecture la télécharge (environ
60 Mo). Deux autres backends font de même : `TTS_BACKEND=openai` (l'API de parole d'OpenAI ; le texte quitte la
machine) et `TTS_BACKEND=http`, un serveur compatible tel que [speaches](https://speaches.ai) servant Kokoro sur un
GPU, une meilleure voix ([mcp/whisper/README.md](../../mcp/whisper/README.md#speech-output)).
Chaque lecture est conservée en `<state>/transcripts/speech.wav`, écrasée par la suivante. Le lanceur donne au
serveur l'extra `tts` de Piper quoi que dise `ORKEON_CODE_VOICE` : sans lui, le serveur écrit ce fichier et dit
n'avoir rien joué. Piper est sous GPL-3.0 : le serveur l'exécute dans un processus séparé, depuis un extra
optionnel, et ne l'importe jamais.

- Un fichier de settings qui déclare un serveur `whisper` l'emporte : le lanceur laisse `ORKEON_CODE_AUDIO_DIR` de
  côté, et `ORKEON_CODE_VOICE` avec, et le dit.
  [config/appsettings.whisper.example.json](../../config/appsettings.whisper.example.json) est cette déclaration,
  pour un backend ou des dossiers à vous.
  - Elle porte alors tout : pour `/say`, `--extra` et `tts` dans ses `Args`, pour `/voice`, `--extra` et `voice`
    aussi, avec `WHISPER_MICROPHONE` et `WHISPER_SPEAKER` à `1` dans son `Env`.
  - Sans eux, `/say` répond que Piper n'est pas installé et `/voice` que le microphone est fermé.
  - Ses deux dossiers doivent exister avant le démarrage du REPL : le lanceur crée `<state>/transcripts` lui-même,
    une déclaration à la main ne crée rien.
    [config/appsettings.ollama-whisper.example.json](../../config/appsettings.ollama-whisper.example.json) est toute
    la machine en un fichier : cette déclaration sur un GPU NVIDIA avec Piper, le microphone et le haut-parleur, et
    la section `Llm` de l'exemple Ollama.
- Un environnement qui en déclare déjà un (`ORKEON_MCP__Servers__whisper__*`, la déclaration HTTP du mode docker par
  exemple) l'emporte de la même façon, avec le même avertissement.
- Sans uv sur le `PATH`, le lanceur avertit et démarre sans le serveur.
- Le REPL donne 30 s à un serveur pour démarrer et répondre, et le premier `uv run` de `mcp/whisper` résout
  d'abord son environnement : une à deux minutes, 2,5 Go de plus avec l'extra `cuda`. Lancez
  `bash scripts/whisper-mcp-smoke.sh` une fois avant, avec le `WHISPER_DEVICE` que le REPL utilisera ; sinon le
  premier REPL démarre sans le serveur (`MCP server 'whisper' could not be connected: no answer within 30 s`), et
  les suivants aussi tant que l'environnement n'est pas résolu.
- En mode docker, un serveur `Stdio` tourne dans le conteneur, qui n'a ni uv ni le modèle : la variable y est ignorée,
  avec un avertissement. Le serveur peut tourner sur la machine hôte en HTTP à la place, pour des fichiers transcrits en moins
  de 100 s ([mcp/whisper/README.md](../../mcp/whisper/README.md#docker-mode-the-server-on-the-host)).
