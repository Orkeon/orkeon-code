> 🇬🇧 [English version](README.md)

# Orkeon Code

[![CI](https://github.com/Orkeon/orkeon-code/actions/workflows/ci.yml/badge.svg)](https://github.com/Orkeon/orkeon-code/actions/workflows/ci.yml)
[![Licence : MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Documentation](https://img.shields.io/badge/documentation-orkeon.github.io-blue.svg)](https://orkeon.github.io/orkeon-code/)

<p align="center">
  <img src="docs/assets/kama-surfer-docker.jpg" alt="Mascotte d'Orkeon Code — un caméléon qui surfe sur une vague" width="320">
</p>

**Un assistant de code agentique en TypeScript sur le runtime [Orkeon](https://github.com/Orkeon/orkeon).**
Travaillez avec lui dans le terminal sous le mode de permission de votre choix, laissez-le mener une tâche jusqu'au
bout tout seul, ou lancez ses crews depuis un script, un planificateur ou votre propre application. Il lit, cherche,
modifie et exécute le code de votre projet par appels d'outils, et tout ce qu'il peut toucher est déclaré : un projet
monté, un shell sous liste blanche, un catalogue d'outils réduit selon le mode. Chaque commande, chaque crew et
chaque prompt est un fichier source : modifiez-le, ou ajoutez le vôtre.

> **Statut : alpha.** La boucle, les crews et les modes de permission fonctionnent de bout en bout sur de vrais LLM.
> Attendez-vous à des aspérités et à des changements cassants avant la 1.0.

## Ce qu'il fait

- **`/assistant`** : la boucle interactive. Le modèle explore le code avec les outils de recherche et d'intelligence
  de code (recherche hybride, source d'un symbole, graphes d'appels, analyse d'impact), modifie des fichiers et lance
  des commandes, tour après tour, sous un budget d'exécution. Le texte libre saisi sans `/` initial y est envoyé.
- **Modes de permission** : `plan` (lecture seule), `default` (vous demande avant une modification, une commande ou
  un appel réseau), `acceptEdits` (modifie sans demander), `dontAsk`, `bypassPermissions`, choisis par requête
  (`plan: explique le flux d'authentification`) ou pour la session (`/mode`), plus des règles autoriser/refuser sur un
  outil ou sur ses arguments (`allow shell_command command=npm test*`). Le runtime Orkeon les applique et pose les
  questions.
- **Des outils de serveurs MCP et de plugins** : les outils qu'Orkeon connecte (`MCP:Servers`, `Plugins`) rejoignent
  le catalogue de l'assistant dès que `tools.extra` les nomme
  ([Configuration](docs/fr/configuration.md#outils-supplémentaires--serveurs-mcp-et-plugins)).
- **La transcription de la parole** : un serveur MCP Whisper est livré dans `mcp/whisper/` ; `ORKEON_CODE_AUDIO_DIR`
  l'active, et l'assistant transcrit notes vocales, réunions et vidéos d'écran sur votre machine ; `/voice` dicte une
  requête et `/say` lit à voix haute ([Configuration](docs/fr/configuration.md#transcription-de-la-parole)).
- **Des crews pour les tâches récurrentes** : `/init` (décrire le projet pour l'agent), `/commit` (un commit
  conventionnel tiré du diff), `/review` (revue de code multi-angles ; `--lens security` pour le seul angle sécurité), `/analyze`
  (analyse déterministe du code), `/compact` et `/summary` (gestion du contexte), `/init-verifiers`, `/advisor`.
- **Un workflow dev, étape par étape** : `/dev-spec` écrit la spec ou la fiche de changement,
  `/dev-plan` la découpe en lots qu'un relecteur en lecture seule questionne, `/dev-batches` exécute les lots d'un
  plan l'un après l'autre, chacun en test d'abord (tests rouges, puis le moindre code, puis un audit en lecture seule)
  et clos par un commit (`<code> F<n>` un lot, `<code> F<n> --audit` son audit seul), `/dev-status` dit où en
  est un travail et `/dev-learn` propose des règles à partir des écarts récurrents des audits. Chaque étape s'exécute
  sous des règles de refus que son crew vérifie à nouveau
  ([Permissions](docs/fr/permissions.md#jeux-de-règles-des-étapes-dev)).
- **Une mémoire partagée** : décisions, structures, méthodes et erreurs que les étapes retrouvent, admises seulement
  par `/memory admit` ([Mémoire partagée](docs/fr/shared-memory.md)).
- **Gestion du contexte** : compaction automatique avec disjoncteur, `/compact` qui tronque d'abord, restauration des
  fichiers après compaction, paliers de pression du contexte, mémoire durable typée (`/memory`).
- **48 commandes slash** au total : [docs/fr/commands.md](docs/fr/commands.md).

## Démarrage rapide

Il faut le runtime Orkeon `1.0.0-rc.6` (publié le 2026-10-28) et une clé d'API pour un fournisseur LLM pris en charge
par Orkeon (tout point d'accès compatible OpenAI, Anthropic...). Chacun de ces trois fait tourner Orkeon Code :

- **`orkeon-repl`**, du paquet Debian/Ubuntu `orkeon` (amd64 et arm64 ; une release candidate est publiée sur le canal
  apt `rc`, le canal `stable` par défaut ne porte que les versions finales) ou de
  l'[archive de release d'Orkeon](https://github.com/Orkeon/orkeon/releases) de votre plateforme (Linux x64 et arm64,
  macOS x64 et arm64, `.zip` Windows x64), autonome : aucun .NET à installer ;
- **Docker** : l'image `orkeon-runners` (amd64 et arm64), rien d'autre à installer, **dès que son tag `1.0.0-rc.6`
  sera publié** : le registre s'arrête à rc.5 pour l'instant, et le smoke runtime de la CI construit le REPL depuis
  les sources d'Orkeon tant qu'il ne trouve pas l'image ;
- **un checkout d'Orkeon** : `ORKEON_SOURCE=<checkout> ./orkeon-code --mode source`.

**Windows** : `orkeon-code.ps1` n'a ni mode source ni `--demo` (`-Mode` accepte `docker` ou `tool`) : le mode tool sur
le `orkeon-<version>-win-x64.zip` de la release est celui de Windows ; la voie que ce projet pratique est WSL avec le
lanceur bash ([tutoriel](docs/fr/wsl-tutorial.md)).

Orkeon Code lui-même s'installe depuis une release (`install.sh`, `install.ps1`) ou depuis npm (`npm install -g
orkeon-code@next`), ou tourne depuis un clone comme ci-dessous. Détails : [Premiers pas](docs/fr/getting-started.md).

```bash
git clone https://github.com/Orkeon/orkeon-code.git ~/orkeon-code
cd ~/orkeon-code
cp config/appsettings.example.json config/appsettings.local.json   # choisir le modèle et le point d'accès
export DEEPSEEK_API_KEY=...                                        # la variable nommée par Llm:ApiKeyEnvVar

./orkeon-code --demo              # l'essayer sur un dépôt d'exemple jetable
cd ~/src/mon-projet && ~/orkeon-code/orkeon-code                   # ou sur votre projet
```

Puis, dans le REPL (*Read–Eval–Print Loop* : la boucle interactive lire-évaluer-afficher) :

```text
/init                                         décrire le projet (écrit AGENTS.md)
plan: comment la configuration est-elle chargée ?   question en lecture seule
acceptEdits: valide les entrées de parseArgs et ajoute un test
/diff
/commit
/review
```

## Fonctionnement

```text
 vous ──▶ /commande ──▶ *.cmd.ts (src/commands) ──script-host──▶ crew.ork.ts (src/crews)
                                                                     │  ctx.llm.act() : boucle LLM ⇄ outils
                                                                     ▼
                                    runtime Orkeon (.NET) : outils, garde de permission, VFS, fournisseurs LLM
                                                                     │
                                                          /workspace = votre projet
```

Orkeon Code est la couche TypeScript : les commandes slash, les crews et la logique de domaine partagée. Le runtime
[Orkeon](https://github.com/Orkeon/orkeon) les exécute (Jint), fournit les outils, applique la garde de permission et
confine tout accès fichier au projet monté. La version du runtime est épinglée dans [`.orkeon-version`](.orkeon-version).
Détails : [Architecture](docs/fr/architecture.md).

## Interactif, autonome, embarqué

Le REPL est une façon de lancer les crews, pas la seule.

- **Interactif** : `./orkeon-code` sur votre projet. `plan:` pour demander, `acceptEdits:` pour le laisser modifier,
  `/mode` pour la session ; en mode `default`, le runtime vous demande avant une modification, une commande ou un
  appel réseau.
- **Autonome** : en `bypassPermissions`, la boucle mène une tâche jusqu'au bout sans poser de question, sous un budget
  (200 appels d'outils, 30 minutes, 400k tokens) et la garde de l'hôte. `scripts/run-crew.sh` lance le même crew en un
  coup depuis un shell, une ligne de cron ou un job de CI, et imprime son résultat en JSON.
- **Embarqué** : une application lance l'outil `orkeon` (nuget.org) ou l'image `orkeon-runners` sur un crew et lit le
  JSON ; le démon `orkeon-host` d'Orkeon peut héberger les crews derrière un canal de chat ou un point d'accès A2A.
  L'intégration .NET en processus attend que la couche de scripting soit publiée en paquet.

Détails et limites : [Exécutions autonomes et embarquées](docs/fr/headless.md).

## Faites-en le vôtre

Une commande est un fichier dans `src/commands`, un crew un dossier dans `src/crews`, un outil un `toolBuilder()`
dans un crew, un prompt une chaîne avec son test, et les modes de permission une table de noms d'outils. Pas d'étape
de build : le runtime bundle le TypeScript et l'exécute au prochain démarrage. Vos propres crews et commandes peuvent
vivre hors du checkout (`--crews-dir`, `--commands-dir`), et les outils des serveurs MCP et des plugins rejoignent le
catalogue dès que `tools.extra` les nomme, sans une ligne de code. Ce qui bouge à chaque changement, et les limites :
[Étendre Orkeon Code](docs/fr/extending.md).

## Documentation

La documentation est publiée en français et en anglais, en site consultable, avec recherche :
<https://orkeon.github.io/orkeon-code/>. Les pages ci-dessous sont les françaises ; les mêmes existent
[en anglais](docs/README.md), et les décisions (ADR) ne sont écrites qu'en anglais.

| | |
|---|---|
| [Premiers pas](docs/fr/getting-started.md) | Modes docker, tool et source, première session |
| [Tutoriel WSL](docs/fr/wsl-tutorial.md) | La voix et un modèle local sous WSL2, sur le GPU, pas à pas |
| [Configuration](docs/fr/configuration.md) | Fournisseurs LLM, fichier de settings, variables d'environnement |
| [Permissions](docs/fr/permissions.md) | Modes, règles, ce que l'agent peut toucher |
| [Hooks](docs/fr/hooks.md) | Vos commandes autour des appels d'outils du modèle dans les étapes dev |
| [Mémoire partagée](docs/fr/shared-memory.md) | Décisions, structures, méthodes et erreurs admises que les agents rappellent |
| [Commandes](docs/fr/commands.md) | La liste complète (générée) |
| [Architecture](docs/fr/architecture.md) | Couches, ports, crews, la boucle, l'assemblage du prompt, recettes |
| [Exécutions autonomes et embarquées](docs/fr/headless.md) | Tours sans opérateur, lancement en un coup, planificateurs et CI, votre application |
| [Étendre](docs/fr/extending.md) | Commandes, crews, outils, prompts, modes, vos propres dossiers, les limites |
| [Développement](docs/fr/development.md) | Tests, vérifications, typings, montée de version d'Orkeon, release |
| [Feuille de route](docs/fr/roadmap.md) | Ce qui manque et ce qui vient |

## Contribuer

Issues et pull requests sont bienvenues : lisez d'abord [CONTRIBUTING.md](CONTRIBUTING.md). Un problème du runtime
lui-même (outils, VFS, fournisseurs, hôte REPL) relève d'[Orkeon/orkeon](https://github.com/Orkeon/orkeon/issues). Les
signalements de sécurité suivent [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE.md) © 2026 Orkeon Contributors.
