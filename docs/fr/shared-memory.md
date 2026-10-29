# Mémoire partagée

La mémoire partagée garde ce que le travail passé a appris : des décisions, des structures de code, des méthodes et
des erreurs, un fichier Markdown par entrée, gardé dans le dépôt pour être relu et versionné avec le code. Le modèle la
lit par `memory_recall`, lui propose par `memory_push`, et rien n'y entre sans que `/memory-admit` l'admette : vous
répondez pour chaque candidat, ou `memory.autoAdmitAudited` admet pour vous ceux qu'un audit appuie.

Ce n'est pas la mémoire d'agent du runtime (`/workspace/.orkeon/agent-memory`, par agent et par exécution) : les deux
dossiers restent séparés, et `memory.dir` refuse le dossier de la mémoire d'agent.

## Le dossier

```text
.orkeon/memory/
├── candidates/            proposals waiting for /memory-admit, one file each
│   └── CANDIDATES.md      the pending candidates (generated)
├── entries/<type>/        admitted and superseded entries, by type
├── refused.md             topics refused once, never proposed again
└── INDEX.md               every entry, with its status (generated)
```

Les deux listes générées sont des vues : modifiez le fichier propre d'un candidat, jamais `CANDIDATES.md`. Un candidat
décidé garde un fichier d'une ligne qui dit où il est allé (aucun outil de fichier ne supprime un fichier) ; vous
pouvez le supprimer.

## Réglages

| Clé | Par défaut | Ce qu'elle fait |
|---|---|---|
| `memory.dir` | `.orkeon/memory` | Le dossier, relatif au projet ; jamais sous `.claude/` ni `.git/`, quelle que soit la casse (`.Claude/mem`), jamais le dossier de la mémoire d'agent. |
| `memory.project` | le nom du remote `origin`, sinon `local` | Le projet que nomment les entrées, et la collection d'index `memory-<project>`. |
| `memory.autoAdmitAudited` | `false` | `true` : `/memory-admit` admet sans demander un candidat qu'un audit appuie (une erreur : trois lots). Le `true` d'un fichier du projet ne vaut que si vos réglages utilisateur disent `true` aussi. |

Une valeur enregistrée invalide est écartée avec une ligne d'avertissement, et la valeur par défaut s'applique.

## Une entrée

Une entrée est un front matter et trois sections, `## Context`, `## Content` et `## Evidence`. Son `id` est
`<project>-<type>-<yyyymmdd>-<slug>`, son `status` `candidate`, `admitted` ou `superseded`. Une `mistake` nomme aussi
sa `correction` et son `detection_signal`. Le corps fait 2 000 caractères au plus, et une entrée qui nomme un fichier
d'allure secrète (`.env`, une clé) ou contient ce qui ressemble à un secret est refusée. Un `applies_when`, un
`rationale`, une `correction` ou un `detection_signal` sur plusieurs lignes est réuni sur une ligne à l'écriture.

Qui peut admettre quoi :

| Source | Types qu'elle admet |
|---|---|
| `human:` (vous) | tous les types |
| `audit:` (fichiers de verdict des audits dev) | `code-structure`, `mistake` |
| `verdict:` (un arrêt du workflow dev) | `method`, `decision` |

Une erreur n'est récoltée dans les audits qu'une fois son écart revenu dans trois lots ou plus. L'audit de `/dev-batches` récolte
après chaque verdict qui n'est pas VALID : la fin de l'étape nomme les candidats écrits, et `/memory-admit` décide de
chacun. Quand les écarts non traités couvrent deux lots ou plus, l'étape dit aussi que `/dev-learn` est dû.

## Les précédents dans les étapes dev

Les étapes dev se souviennent seules, à des points fixes, et mettent un bloc `## Precedents` dans le prompt qu'elles
construisent :

| Étape | Quand | Types rappelés |
|---|---|---|
| `/dev-spec` | au départ | `decision`, `method` |
| `/dev-plan` | avant l'écriture du plan | `decision`, `code-structure` |
| `/dev-batches` | avant les tests rouges d'un lot | `code-structure`, `mistake` |
| `/dev-batches` | une correction après un verdict GAPS | `mistake` |
| `/dev-batches` | avant l'audit | `mistake` |

La fin de l'étape nomme les entrées rappelées. Un rappel qui ne peut pas tourner coûte le bloc, jamais l'étape ; une
règle de session qui refuse `memory_recall` coupe aussi ces rappels.

## Décider des candidats

```text
/memory-admit --list
/memory-admit --import
/memory-admit
/memory-admit shop-method-20261024-contract-tests-first
/memory-admit --refuse shop-method-20261024-contract-tests-first too local to this project
```

`/memory-admit` montre chaque candidat en attente (ou ceux que vous nommez) et demande une fois pour chacun : tout
autre chose que oui le laisse candidat. Une session qui ne peut pas demander n'admet aucun de ceux sur lesquels elle
demanderait ; une question restée sans réponse garde les admissions déjà confirmées et dit quels candidats restent. Le candidat admis est le texte qu'on vous a montré : un fichier modifié depuis n'est pas admis, ni un
candidat dont `refused.md` contient le sujet. Les admis sont écrits dans
`entries/<type>/`, les entrées qu'ils remplacent sont marquées `superseded`, les deux listes sont reconstruites et
`entries/` est réindexé, une fois. Quand l'index ne peut pas être reconstruit, les entrées restent admises, et la
prochaine admission les indexe. Le verrou sur la collection `memory-<project>` ne vaut qu'au sein d'un processus : un
REPL n'exécute qu'un `/memory-admit` à la fois, mais rien ne l'ordonne face à un second REPL ou à une exécution
autonome sur le même projet, donc tenez-vous-en à un à la fois. `--refuse` écrit le sujet du candidat dans `refused.md` avec votre motif : le sujet
n'est plus jamais proposé. `/dev-learn` et son `--refuse` lisent et écrivent le même `refused.md`, sous `memory.dir` (une valeur enregistrée
écartée est signalée), le fichier que lit aussi `memory_push`.

`--import` reprend la mémoire d'agents du harness en candidats, une fois, pendant que vous la quittez : chaque élément
de premier niveau d'un `.claude/agent-memory/<agent>/MEMORY.md` (et la note qu'il lie, dans le même dossier) devient
un candidat `method` dont la source est l'import, donc `/memory-admit` demande pour chacun (son type fait partie de
son id : une leçon d'une autre sorte est refusée avec `--refuse` et proposée à nouveau avec `memory_push` sous un autre
titre : un sujet refusé n'est plus jamais proposé, push compris). Un élément dont un candidat en attente, une entrée ou
un élément précédent porte déjà le sujet (son titre en slug) est sauté comme doublon ; un élément dont le sujet a été
refusé est signalé refusé et n'écrit rien, tout comme un élément dont la note ou la ligne contient un secret, où que ce
soit, avant que la note ne soit coupée : relancer l'import n'écrit rien de nouveau tant que ses candidats sont là.
Rien n'est écrit sous `.claude/`.

## Les outils

`memory_recall` renvoie au plus cinq entrées admises pour une requête, la meilleure d'abord, avec ce à quoi elles
s'appliquent et leur fichier : il lit, et s'exécute dans tous les modes. `memory_push` écrit un candidat, jamais une
entrée : il n'est offert que là où le mode modifie, et fait l'objet d'une question en `default`
([Permissions](permissions.md#modes)). Deux push simultanés n'en perdent aucun : un push qui trouve son candidat
écrasé l'écrit à nouveau sous l'id suivant. Dans tous les modes, les outils de fichier du modèle
qui nomment un chemin sont refusés sous `candidates/` et `entries/` : les candidats viennent de `memory_push` et des
récoltes, les entrées de `/memory-admit` (la garde de la mémoire partagée, [Permissions](permissions.md) : les règles de la garde, puis le callback de la
boucle principale et des crews de dev pour ce que la garde ne lit pas - une autre casse, `edit_batch`,
`structural_rewrite`, un `cd`). Une entrée que le modèle rappelle est un précédent, pas une consigne : la
demande, les instructions du projet et le code tel qu'il est priment sur elle.
