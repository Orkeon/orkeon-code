# Configuration

Orkeon Code n'a pas de format de configuration qui lui soit propre : le fichier de settings est un fichier de settings
du runtime Orkeon, que le REPL lit par `--settings`. Partez de
[`config/appsettings.example.json`](../../config/appsettings.example.json).

## D'où viennent les settings

1. `--settings FILE` sur le lanceur ;
2. `ORKEON_CODE_SETTINGS` ;
3. `config/appsettings.local.json` dans le checkout (ignoré par git), dans un clone seulement : une installation ne le
   lit jamais ;
4. `~/.orkeon-code/appsettings.json` (`%USERPROFILE%\.orkeon-code\appsettings.json` sous Windows ; `ORKEON_CODE_HOME`
   déplace le dossier) ;
5. `~/.config/orkeon-code/appsettings.json` (`%APPDATA%\orkeon-code\appsettings.json` sous Windows), l'ancien
   emplacement : encore lu, avec un avertissement qui nomme le nouveau ;
6. le fichier d'Orkeon, `~/.config/Orkeon/appsettings.json` (`%APPDATA%\Orkeon\appsettings.json` sous Windows), celui
   qu'écrit `orkeon init`. Le lanceur ne passe alors aucun `--settings` : le REPL le lit lui-même (le mode docker le
   monte, le conteneur n'ayant pas votre dossier personnel). Un `XDG_CONFIG_HOME` absolu remplace `~/.config` en 5 et 6.

Sans aucun d'eux et avec un terminal, `orkeon-code setup` se lance : il demande le fournisseur (l'exemple DeepSeek ou
celui d'Ollama), le modèle et le **nom** de la variable d'environnement qui tient la clé, jamais la clé ; il écrit
`~/.orkeon-code/appsettings.json`, lisible par vous seul, et dit quelle variable exporter. `orkeon-code setup` le
relance à tout moment, et demande avant de remplacer un fichier existant. Sans terminal, le lanceur s'arrête et nomme
ces choix.

Le bloc `orkeonCode` de ce fichier porte vos propres réglages de session, que le `.orkeon/config.json` d'un projet ne
peut pas élargir ([ce qu'un fichier du projet peut régler](permissions.md#ce-quun-fichier-du-projet-peut-régler)). Le
lanceur copie le bloc seul, jamais la section `Llm`, dans `<state>/user-config/config.json` à chaque démarrage et le
remet à la session en lecture seule, sur `/user-config`, dans tous les modes.

Les variables d'environnement préfixées `ORKEON_` l'emportent sur le fichier (`__` sépare les sections) :
`ORKEON_Llm__Model`, `ORKEON_Llm__ApiKey`. `ORKEON_CODE_MODEL` est un raccourci du lanceur pour `ORKEON_Llm__Model`.

## Le LLM

| Clé | Signification |
|---|---|
| `Llm:Model` | Identifiant du modèle envoyé au point d'accès |
| `Llm:BaseUrl` | Point d'accès compatible OpenAI (`https://api.deepseek.com`, `https://api.openai.com/v1`, un serveur local...) |
| `Llm:ApiKeyEnvVar` | Nom de la variable d'environnement qui porte la clé. La clé elle-même ne va jamais dans le fichier |
| `Llm:AvailableModels` | Les modèles que `/model` propose, pour en changer sans relancer |
| `Llm:Temperature`, `Llm:MaxTokens`, `Llm:TimeoutSeconds` | Réglages de génération |
| `Llm:MaxRateLimitWait` | La plus longue fenêtre de limite de débit qu'un appel attend avant d'échouer, `00:05:00` par défaut. Un 429, ou un 529 avec un en-tête de réinitialisation, attend que la fenêtre annoncée par le fournisseur se rouvre au lieu de faire échouer le tour ; une fenêtre plus longue fait échouer l'appel aussitôt avec `LlmRateLimitException`, l'attente dans son message. `00:00:00` n'attend rien |
| `Llm:Profiles:<name>:MaxRateLimitWait` | La même borne pour un profil nommé de l'hôte, `00:05:00` par défaut |
| `Llm:Thinking:Enabled` | Mode raisonnement, pour les fournisseurs qui en ont un |

Orkeon reconnaît les fournisseurs natifs d'après le point d'accès et le modèle (OpenAI, Anthropic, Gemini, Mistral,
DeepSeek, Z.AI, Moonshot, serveurs locaux...) : la liste et leurs options sont dans la
[documentation des fournisseurs LLM d'Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/llm-providers.md).
Une option qu'un fournisseur ne peut pas honorer produit un avertissement, jamais un abandon silencieux.

**Cache du prompt.** Un fournisseur qui met le prompt en cache (DeepSeek et OpenAI d'eux-mêmes, Anthropic avec
`cache_control`) rapporte les jetons lus dans son cache et écrits dedans ; Orkeon les garde par modèle et `/usage`, `/stats` et
`/context` en montrent la somme dans `cacheRead` et `cacheWrite` (`0` d'un fournisseur qui ne rapporte aucun cache, `-` d'un hôte qui ne rapporte aucun chiffre). La durée de
vie du cache est une option d'appel d'Orkeon, `orkeon:cache_ttl` (`5m` ou `1h`, d'après le réglage de cache d'un
agent) : Anthropic l'honore, les fournisseurs compatibles OpenAI et Ollama journalisent qu'ils ne le peuvent pas.
Orkeon Code n'en fixe aucune, chaque fournisseur garde donc sa durée par défaut.

Un modèle sur cette machine : [`config/appsettings.ollama.example.json`](../../config/appsettings.ollama.example.json)
est l'exemple sur [Ollama](https://ollama.com) servant `qwen3.5:2b` (`ollama pull qwen3.5:2b` d'abord), sans clé et
sans que rien ne quitte la machine ; Orkeon reconnaît Ollama à son port, 11434. Ollama sert chaque modèle avec une
fenêtre de 4 096 tokens sauf si son environnement en décide autrement, et Orkeon ne l'élargit pas par requête : le
prompt système d'un tour fait environ 2 250 tokens avant les schémas d'outils et la conversation, donc réglez
`OLLAMA_CONTEXT_LENGTH=16384` sur le service Ollama, sinon le modèle perd en silence ses consignes et ses outils.

L'agent appelle des outils à travers chaque fournisseur : la boucle d'outils du runtime (`ctx.llm.act`) lit les appels
d'outils des formats Anthropic et OpenAI, exécute les appels de lecture d'un tour du modèle jusqu'à
`MaxParallelToolCalls` à la fois et les autres l'un après l'autre, chaque appel à travers la garde de permission, et renvoie les résultats dans le protocole d'outils du
fournisseur. Un résultat d'outil parvient au modèle coupé à 4000 caractères, 32 000 pour `file_read`.

## Les settings dont Orkeon Code dépend

| Clé | Pourquoi |
|---|---|
| `Orkeon:Security:PermissionGate:Enabled` = `true` | L'hôte confronte chaque appel d'outil du modèle aux règles de `/permissions` et au mode, et vous demande quand le mode le dit ([ce que la garde ne voit pas](permissions.md)). Le lanceur l'active sauf si le fichier de settings dit le contraire ; sans elle, aucun appel n'est contrôlé et les modes ne font que façonner le catalogue |
| `Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout` | Limite de temps réel de chaque moteur de script d'`orkeon-repl` : celui d'une commande, et celui d'un crew, donc d'un tour d'`/assistant`. Elle s'arrête pendant qu'un appel d'outil attend votre réponse. 5 minutes par défaut ; un tour qui indexe un grand dépôt en demande plus : l'exemple met 30 minutes. Un `/dev-verify full` peut prendre environ une heure (build 900 s, suite entière 900 s, trois validations de 300 s chacune, plus le temps du modèle) : mettez-y 60 minutes ou plus |
| `Orkeon:Cli:ScriptCommands:Limits:MemoryLimitBytes` | Limite de mémoire de ces moteurs : 64 Mo par défaut, l'exemple met 2 Gio |
| `Orkeon:Scripting:Limits:ExecutionTimeout`, `Orkeon:Scripting:Limits:MemoryLimitBytes` | Les mêmes limites pour `orkeon run`, l'outil avec lequel `scripts/run-crew.sh` lance un crew (30 secondes et 100 Mo par défaut ; l'exemple met 30 minutes et 2 Gio). `orkeon-repl` ne les lit pas |
| `Orkeon:Tools:Shell:AllowInterpreters` | Laisse `shell_command` lancer des interpréteurs (`node`, `dotnet`, `npm`...), nécessaire pour construire et tester la plupart des projets |
| `Orkeon:Tools:Shell:ExtraAllowedCommands` | Commandes ajoutées à la liste blanche du shell (`make`, `cargo`...) |
| `Orkeon:Tools:Shell:Confinement:Mode` | `Auto` (défaut : bubblewrap sous Linux, Seatbelt sous macOS, AppContainer sous Windows, aucun dans un conteneur), `None`, `Bubblewrap`, `Seatbelt` ou `AppContainer`. Confinée, chaque commande shell s'exécute sous `bwrap` (Linux, modes tool et source), réseau coupé sauf `Confinement:AllowNetwork`, les programmes hors des répertoires système à lister dans `Confinement:ReadOnlyPaths`. Une commande échoue quand elle ne peut pas être confinée. Les exemples mettent `None` ; un fichier de settings sans la clé confine, hors d'un conteneur. `/dev-batches --concurrency` au-delà de 1 fonctionne sous Bubblewrap avec un runtime qui monte le répertoire git d'un worktree lié (Orkeon/orkeon#191) ; avec un plus ancien, git échoue dans le worktree d'un lot, et l'exécution se refuse en une ligne. Confiné, le push de clôture n'atteint aucun remote (pas de réseau, `HOME=/tmp`, donc aucun identifiant) : l'exécution reste ouverte avec la commande `git push`. Poussez-la depuis un terminal, puis le `/dev-batches` suivant clôt l'exécution sans pousser de nouveau. Voir [SECURITY.md](../../SECURITY.md) |
| `Orkeon:Tools:ResultLimits:Limits:<tool>` | La coupe du résultat d'un outil, en caractères : 4000, `file_read` 32000, `node_read` 256000, `shell_command` 10000. Un résultat coupé finit par `[... truncated, N chars omitted. …]` ; `/dev-verify` lit cette mention |
| `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` | Les appels de lecture d'un même tour du modèle qui tournent en même temps : 4 |
| `Orkeon:Cli:ConsoleStreaming:Enabled` | Affiche la réponse au fil de sa génération. L'exemple l'active ; la réponse peut être imprimée deux fois : à désactiver pour un run sans surveillance ([problèmes connus](roadmap.md#problèmes-connus)). Avec `/dev-batches --concurrency` au-dessus de 1, la réponse diffusée de chaque lot arrive ligne par ligne : sur la console plain préfixée de son ticket (`[t2] `), seule la réponse au premier plan au fil de l'eau (Orkeon #211) ; dans la TUI sur l'écran propre du lot, sans le préfixe (Orkeon #217) |
| `Orkeon:Cli:ScriptCommands:MaxScripts` | Commandes que le chargeur garde : 200 par défaut, au-dessus de la surface de commandes de ce projet |
| `RateLimiting:*` | Limites de débit des requêtes vers le fournisseur |

**Combien de temps un tour peut durer.** Deux limites bornent un tour d'`/assistant`, et la première atteinte y met
fin :

- l'`ExecutionTimeout` du moteur de script ci-dessus, qui s'arrête pendant qu'une question vous attend ;
- le budget propre du crew de la boucle principale, écrit dans son code (`src/crews/main-loop/crew.ork.ts`) : 200
  appels d'outils, 1,5M tokens (le prompt et la complétion de chaque appel du tour, sommés : un tour repaie tout son
  contexte à chaque appel) et 30 minutes de temps réel. Cette horloge est celle d'Orkeon et, comme celle du
  moteur, elle s'arrête pendant que la garde attend votre réponse : seul le travail du modèle compte, et une question
  laissée sans réponse ne met pas fin au tour.

`Orkeon:Cli:ScriptHost:RunCrewTimeout` (10 minutes par défaut) ne borne qu'un crew qu'une commande attend
(`runCrew`) ; Orkeon Code lance chaque crew avec `runCrewAsync`, qu'il ne borne pas, donc l'exemple l'omet.

## Réglages de session

Dans le REPL, `/config` liste, lit et écrit les clés de session (rangées dans le `.orkeon/config.json` du projet),
par exemple `permissions.fallback` (le mode utilisé quand ni un préfixe ni `/mode` n'en a choisi un), `tools.extra`
(ci-dessous), `voice.reply` ([synthèse vocale](#synthèse-vocale)), `answer.language` (la langue dans laquelle
l'assistant répond, `/config set answer.language French`, sauf si une requête est écrite dans une autre),
`compaction.trigger` (le nombre de tokens auquel la compaction automatique se déclenche,
`/config set compaction.trigger 90k` ; omis, la fenêtre moins la place dont un tour a besoin), `dev.workDir` (le
dossier de travail que lisent et écrivent les étapes dev, `/dev-status` et `/dev-learn` compris, relatif au checkout, `/config set dev.workDir backstage/tasks` ; omis, le
`layout.work` du pack du dépôt, sinon `workbench` ; `/commit` le lit aussi, et laisse le dossier de travail hors d'un
commit sauf si un chemin qu'il contient est nommé), `dev.prAuto` (`true` ou `false`, omis = `false` : `/commit` et
la clôture d'une étape dev préparent la pull request comme le fait `--pr` sans qu'on le demande, son corps sous
`<work>/pr-<slug>/PR.md`, puis l'ouvrent avec l'outil `github` du runtime quand l'hôte le propose et que la session le
permet, sinon affichent la commande `gh pr create` à taper et disent pourquoi),
`memory.dir` (le dossier de la [mémoire partagée](shared-memory.md), relatif au projet, `/config set memory.dir
docs/memory` ; omis, `.orkeon/memory` ; jamais sous `.claude/` ni `.git/`, jamais le `.orkeon/agent-memory` de la
mémoire d'agent), `memory.project` (le projet que nomment les entrées et la collection d'index `memory-<project>`, un
nom kebab-case ; omis, le nom du remote `origin`, sinon `local`), `memory.autoAdmitAudited` (`true` ou `false`, omis
= `false` : `/memory-admit` admet sans demander un candidat qu'un audit appuie), `review.lenses` (les angles de `/review`, séparés par des virgules parmi `correctness`,
`security` et `style` ; omis, les trois), `advisor.model` (le modèle du second avis d'`/advisor` ; omis, celui de la
session, ce qui en fait une auto-revue), `commit.requireConfirm` (`false` laisse `/commit` s'exécuter sans sa
confirmation ; omis = `true`) ou `spinnerVerbs`. `/config keys` les liste toutes.
`/model`, `/effort`, `/passes`, `/fast`, `/proactive` et `/output-style` changent la façon dont les prochains tours
s'exécutent. `/effort` règle aussi la réflexion du fournisseur : le niveau enregistré est envoyé comme `effort` de
l'act par `/assistant`, chaque étape dev (`/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-verify`,
`/dev-batches`) et les agents qu'elles lancent, et rien n'est envoyé tant qu'aucun niveau n'est enregistré.

`permissions.fallback`, `tools.extra`, `memory.autoAdmitAudited` et `dev.prAuto` réglés dans le fichier du projet sont restreints par le bloc `orkeonCode` des
réglages de l'utilisateur (un `true` du projet sur un `false` ou une absence chez l'utilisateur est écarté, avec un avertissement) : `/config set` écrit une telle valeur, puis dit, sous "persisted", qu'elle est ignorée et
où va votre propre réglage, et la ligne `settings: project file` de `/doctor` la nomme. `/config set --session` n'est pas restreint.

Au démarrage du REPL, le runtime exécute une fois le fichier que nomme sa clé `Orkeon:Cli:Session:StartScript`, et
place ce qu'il imprime avant la première requête que vous tapez. Le lanceur la règle sur
`/tmp/orkeon-code/session-start.ork.ts`, une copie de `scripts/session-start.ork.ts` faite à chaque démarrage : il nomme les
fichiers d'état des lots de dev qu'une compaction a écrits ces 7 derniers jours (`.orkeon/dev/<code>/state-F<n>.md`,
avec la première étape ouverte) et les lots que le journal d'événements de Code laisse ouverts. Il n'imprime rien
quand il n'y en a pas. Réglez `Orkeon__Cli__Session__StartScript` sur un autre chemin virtuel pour exécuter le vôtre
ou, sous Linux et macOS, sur une valeur vide pour n'en exécuter aucun. Faites-en un `.ork.ts`, que le runtime exécute
par son hôte de scripts : tout autre fichier passe à `sh` par `shell_command`, ce qui échoue ici (les fichiers `.sh`
sont refusés, `sh` n'est pas parmi les commandes du shell, et en modes tool et source le shell lit le `/tmp` de
l'hôte). `sh scripts/session-start.sh <projet>` imprime les mêmes lignes dans un terminal.

Le pack du dépôt (`.orkeon/repo.yaml`, sinon celui du harness) peut aussi donner `tests.trait_pattern`, une clé
d'Orkeon Code que le harness ignore : la façon dont un test nomme l'id de fiche qu'il couvre, que la porte de
`/dev-verify` cherche sous les racines de test. C'est une ligne qui contient `<id>` exactement une fois et `<name>` une
fois au plus ; `<name>` tient la place de `tests.rule_trait`, qu'il exige alors. 80 caractères au plus, ni tabulation
ni apostrophe droite ; une suite d'espaces correspond à un nombre quelconque d'espaces. Sans elle, `tests.rule_trait`
seul donne le motif par défaut `[Trait("<name>", "<id>")]`. Un dépôt Node, dont les tests portent alors
`// rule: BR-01` :

```yaml
tests:
  rule_trait: rule
  trait_pattern: "// <name>: <id>"
```

Il peut aussi donner `layout.test_files`, une autre clé que le harness ignore : les fichiers de test posés à côté du
code, en motifs de la porte (`*` correspond à toute suite de caractères, `/` compris). `/dev-implement` tient un chemin
pour un fichier de test quand il est sous `layout.tests` ou correspond à un motif : l'implémenteur ne peut pas
l'écrire, l'auteur des tests le peut, et une exécution exige l'une des deux clés. Un dépôt Node dont les tests sont à
côté du code :

```yaml
layout:
  domain: src
  test_files: ["src/*.test.ts"]
```

`layout.tests` ne nomme jamais une racine de sources (`tests: src` à côté de `domain: src`) : les deux rôles seraient
refusés dans ce dossier, et la lecture du pack le signale comme un problème (⚠ au début de `/dev-implement` et
`/dev-batches`).

## Outils supplémentaires : serveurs MCP et plugins

Le REPL connecte les serveurs MCP des settings `MCP:Servers` d'Orkeon et charge les plugins de sa section `Plugins`
([documentation MCP d'Orkeon](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/mcp.md)) ; leurs outils
rejoignent ceux de l'hôte. L'assistant en utilise un dès que la clé de session `tools.extra` le nomme :

| Clé | Valeur |
|---|---|
| `tools.extra` | Entrées séparées par des virgules ou des espaces, chacune `<name>` ou `<name>:<read\|write>`. Sans classe, un outil est une écriture. Omise : aucun outil supplémentaire |

La classe décide quels modes proposent l'outil : `read` dans tous les modes, `write` dans `default`, `acceptEdits` et
`bypassPermissions` seulement. Ne marquez `read` qu'un outil qui ne change rien et n'envoie rien hors de la machine.
La [garde de permission](permissions.md#outils-supplémentaires) décide toujours de chaque appel. `/config set` refuse
une entrée qui n'est pas dans la notation, qui nomme un outil intégré, ou qui nomme un outil deux fois.

Par exemple, le serveur de parole que ce dépôt livre ([ci-dessous](#transcription-de-la-parole)) enregistre six
outils, dont trois ont leur place dans la liste : `transcribe_audio`, `list_audio` et `whisper_info`. Les trois
autres, `record_and_transcribe`, `speak` et `stop_speaking`, servent `/voice` et `/say` et en restent à l'écart. Une
fois le serveur connecté :

```text
/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read
```

Un nom est comparé aux noms que l'hôte enregistre, sans distinction de casse comme Orkeon les compare, et le tour
utilise la graphie enregistrée : le `get-file-contents` d'un serveur MCP se liste `get-file-contents` (en n'importe
quelle casse), pas `get_file_contents` ; `/debug-tool-call list` montre les noms enregistrés. `/permissions` montre
les outils supplémentaires, ceux que l'hôte n'enregistre pas, et les entrées qu'il ignore ; chaque tour avertit d'un
outil listé que l'hôte n'enregistre pas, et le laisse de côté. En mode docker, la commande d'un serveur `Stdio`
s'exécute dans le conteneur.

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
une ligne `audio`.

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

`read` convient à ces trois outils avec le backend local par défaut : ils lisent `/audio` et n'écrivent que sous
`/transcripts`, hors du projet. Avec `WHISPER_BACKEND=openai`, l'audio quitte la machine : marquez `transcribe_audio`
`write`, ou laissez-le de côté et utilisez `/transcribe`. La garde de permission demande toujours confirmation de
chaque appel du modèle en `default` et `acceptEdits`, puisqu'un outil MCP ne déclare aucun accès à Orkeon
([Permissions](permissions.md#outils-supplémentaires)).

Une transcription courte revient en ligne ; une longue est écrite dans `/transcripts/<name>.txt`, avec ses
horodatages dans `<name>.segments.json` et, au-delà de 30 000 caractères, en parties `<name>.part-NN.txt` que
`file_read` lit une à la fois. La première transcription avec un modèle le télécharge (462 Mo pour `small`) :
`bash scripts/whisper-mcp-smoke.sh` avec `WHISPER_MODEL=small` le fait à l'avance. Un enregistrement de 45 minutes
prend environ 7 minutes avec `small` sur un CPU, moins de 2 minutes sur le GPU d'un portable, où `turbo` est le
meilleur modèle.

### Dictée

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

### Synthèse vocale

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
  [config/appsettings.whisper.example.json](../../config/appsettings.whisper.example.json) est cette déclaration, pour
  un backend ou des dossiers à vous ; elle porte alors tout : pour `/say`, `--extra` et `tts` dans ses `Args`, pour
  `/voice`, `--extra` et `voice` aussi, avec `WHISPER_MICROPHONE` et `WHISPER_SPEAKER` à `1` dans son `Env`. Sans
  eux, `/say` répond que Piper n'est pas installé et `/voice` que le microphone est fermé.
  Ses deux dossiers doivent exister avant le démarrage du REPL : le lanceur crée `<state>/transcripts` lui-même,
  une déclaration à la main ne crée rien.
  [config/appsettings.ollama-whisper.example.json](../../config/appsettings.ollama-whisper.example.json) est toute la
  machine en un fichier : cette déclaration sur un GPU NVIDIA avec Piper, le microphone et le haut-parleur, et la
  section `Llm` de l'exemple Ollama.
- Un environnement qui en déclare déjà un (`ORKEON_MCP__Servers__whisper__*`, la déclaration HTTP du mode docker par
  exemple) l'emporte de la même façon, avec le même avertissement.
- Sans uv sur le `PATH`, le lanceur avertit et démarre sans le serveur.
- Le REPL donne 30 s à un serveur pour démarrer et répondre, et le premier `uv run` de `mcp/whisper` résout
  d'abord son environnement : une à deux minutes, 2,5 Go de plus avec l'extra `cuda`. Lancez
  `bash scripts/whisper-mcp-smoke.sh` une fois avant, avec le `WHISPER_DEVICE` que le REPL utilisera ; sinon le
  premier REPL démarre sans le serveur (`MCP server 'whisper' could not be connected: no answer within 30 s`), et
  les suivants aussi tant que l'environnement n'est pas résolu.
- En mode docker, un serveur `Stdio` tourne dans le conteneur, qui n'a ni uv ni le modèle : la variable y est ignorée,
  avec un avertissement. Le serveur peut tourner sur l'hôte en HTTP à la place, pour des fichiers transcrits en moins
  de 100 s ([mcp/whisper/README.md](../../mcp/whisper/README.md#docker-mode-the-server-on-the-host)).

## Sessions

Le REPL enregistre la conversation après chaque tour et quand il finit (`Orkeon:Cli:Session:Persist`, `true` dans les
settings d'exemple), et le lanceur la garde hors du projet : dans `~/.orkeon-code/projects/<projet>/` une fois installé,
`.crew-output/projects/<projet>/` dans un clone, `<ORKEON_CODE_STATE>/projects/<projet>/` quand cette variable est
définie. `<projet>` est le nom du dossier et un court hash de son chemin, si bien que deux projets du même nom ne le
partagent jamais ; `project.json` y nomme le chemin. Plus rien n'est écrit sous `.orkeon/sessions` du projet
(`/doctor` avertit quand un démarrage plus ancien y a laissé des sessions).

| Démarrage | Ce qu'il ramène |
|---|---|
| `orkeon-code` | Une session neuve : la dernière passe d'abord dans `history/` du projet |
| `orkeon-code --continue` (`-c`) | La session que vous avez quittée |
| `orkeon-code --resume` | Les sessions gardées, la plus récente d'abord (date, titre, messages, id), puis demande laquelle |
| `orkeon-code --resume <numéro ou id>` | Celle-là, sans demander (un début d'id qui désigne une seule session suffit) |

Sans terminal, `--resume` seul affiche la liste et sort avec le code 2. Les 50 sessions gardées les plus récentes
restent (`ORKEON_CODE_SESSIONS_KEEP`, de 1 à 9999) ; une session sans message n'est pas gardée. Un second démarrage
pendant qu'une session est ouverte sur le même projet avertit, laisse l'ouverte en paix et garde la sienne à côté,
dans l'historique dès le démarrage suivant. Dans le REPL, `/resume`
liste les sessions gardées (le lanceur monte `history/` en lecture seule sur `/session-history`) ; un REPL ne peut
pas changer sa propre conversation : quittez, puis démarrez `orkeon-code --resume <id>`. L'historique de l'éditeur
de ligne (la flèche du haut) n'est pas gardé.

`--llm-log` parmi les arguments du REPL écrit le journal LLM dans `<état du projet>/llm-logs`, jamais dans le
projet ; `--llm-log-path <dossier>` est passé tel quel et l'emporte sur un `--llm-log` seul.

## L'environnement du lanceur

| Variable | Effet |
|---|---|
| `ORKEON_CODE_MODE` | `docker`, `tool` ou `source` |
| `ORKEON_CODE_SETTINGS` | Fichier de settings |
| `ORKEON_CODE_MODEL` | Modèle pour cette exécution |
| `ORKEON_CODE_AUDIO_DIR` | Dossier des fichiers audio et vidéo : active la [transcription de la parole](#transcription-de-la-parole) (modes tool et source) |
| `ORKEON_CODE_VOICE` | `1` : ouvre le microphone à [`/voice`](#dictée) et le haut-parleur à [`/say`](#synthèse-vocale) (avec `ORKEON_CODE_AUDIO_DIR`) |
| `ORKEON_CODE_STATE` | Où vivent `/output`, `/tmp`, `/user-config` et les transcriptions (défaut `.crew-output/` dans un clone, `<home>/projects/<projet>` dans une installation) ; les [sessions](#sessions) vont sous son `projects/<projet>/` |
| `ORKEON_CODE_SESSIONS_KEEP` | Combien de [sessions](#sessions) gardées un projet conserve (défaut 50) |
| `ORKEON_CODE_HOME` | Le dossier propre d'une installation : son `appsettings.json`, son `trusted-folders.json`, son état et son dépôt de démo (défaut `~/.orkeon-code`). Un clone y lit aussi son `appsettings.json` et son `trusted-folders.json` |
| `ORKEON_CODE_IMAGE` | Une autre image du runtime (mode docker) |
| `ORKEON_REPL` | La ligne de commande qui démarre le REPL (mode tool) |
| `ORKEON_SOURCE` | Checkout d'Orkeon (mode source) |
| `ORKEON_ESBUILD_PATH` | Binaire esbuild (modes tool et source) |
| `ORKEON_CODE_TRUST` | `1` : démarre un dossier sans confiance sans terminal, seulement quand `CI=true`, sans rien enregistrer ([Dossiers de confiance](permissions.md#dossiers-de-confiance)) |

Le lanceur exporte aussi `Orkeon__Security__PermissionGate__Enabled=true` et `Orkeon__Cli__Session__Persist=true` sauf
s'ils sont déjà définis (le fichier de settings l'emporte encore sur eux), `ORKEON_Orkeon__Cli__Session__SessionsDirectory=/sessions`
(qui l'emporte sur lui), et, en modes tool et source, `ORKEON_ALLOW_EXTERNAL_MOUNTS=1`, pour que le REPL,
démarré depuis le projet, accepte les montages `/output`, `/tmp`, `/user-config`, `/sessions` et `/session-history` du répertoire d'état. `/permissions` dit si la
garde est active.
