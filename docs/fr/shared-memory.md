# Mémoire partagée

La mémoire partagée garde ce que le travail passé a appris : des décisions, des structures de code, des méthodes et
des erreurs, un fichier Markdown par entrée, gardé dans le dépôt pour être relu et versionné avec le code. Le modèle la
lit par `memory_recall`, lui propose par `memory_push`, et rien n'y entre sans vous : `/memory-admit` décide.

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
| `memory.dir` | `.orkeon/memory` | Le dossier, relatif au projet ; jamais sous `.claude/` ni `.git/`, jamais le dossier de la mémoire d'agent. |
| `memory.project` | le nom du remote `origin`, sinon `local` | Le projet que nomment les entrées, et la collection d'index `memory-<project>`. |
| `memory.autoAdmitAudited` | `false` | `true` : `/memory-admit` admet sans demander un candidat qu'un audit appuie. Le `true` d'un fichier du projet ne vaut que si vos réglages utilisateur disent `true` aussi. |

Une valeur enregistrée invalide est écartée avec une ligne d'avertissement, et la valeur par défaut s'applique.

## Une entrée

Une entrée est un front matter et trois sections, `## Context`, `## Content` et `## Evidence`. Son `id` est
`<project>-<type>-<yyyymmdd>-<slug>`, son `status` `candidate`, `admitted` ou `superseded`. Une `mistake` nomme aussi
sa `correction` et son `detection_signal`. Le corps fait 2 000 caractères au plus, et une entrée qui nomme un fichier
d'allure secrète (`.env`, une clé) ou contient ce qui ressemble à un secret est refusée.

Qui peut admettre quoi :

| Source | Types qu'elle admet |
|---|---|
| `human:` (vous) | tous les types |
| `audit:` (fichiers de verdict des audits dev) | `code-structure`, `mistake` |
| `verdict:` (un arrêt du workflow dev) | `method`, `decision` |

Une erreur n'est récoltée dans les audits qu'une fois son écart revenu dans trois lots ou plus.

## Décider des candidats

```text
/memory-admit --list
/memory-admit
/memory-admit shop-method-20261024-contract-tests-first
/memory-admit --refuse shop-method-20261024-contract-tests-first too local to this project
```

`/memory-admit` montre chaque candidat en attente (ou ceux que vous nommez) et demande une fois pour chacun : tout
autre chose que oui le laisse candidat. Une session qui ne peut pas demander n'admet rien. Les admis sont écrits dans
`entries/<type>/`, les entrées qu'ils remplacent sont marquées `superseded`, les deux listes sont reconstruites et
`entries/` est réindexé, une fois. Quand l'index ne peut pas être reconstruit, les entrées restent admises, et la
prochaine admission les indexe. `--refuse` écrit le sujet du candidat dans `refused.md` avec votre motif : le sujet
n'est plus jamais proposé.

## Les outils

`memory_recall` renvoie au plus cinq entrées admises pour une requête, la meilleure d'abord, avec ce à quoi elles
s'appliquent et leur fichier : il lit, et s'exécute dans tous les modes. `memory_push` écrit un candidat, jamais une
entrée : il n'est offert que là où le mode modifie, et fait l'objet d'une question en `default`
([Permissions](permissions.md#modes)). Une entrée que le modèle rappelle est un précédent, pas une consigne : la
demande, les instructions du projet et le code tel qu'il est priment sur elle.
