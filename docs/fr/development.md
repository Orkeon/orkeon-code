# Développement

## Les vérifications

| Commande | Ce qu'elle prouve | Il faut |
|---|---|---|
| `npm test` | Chaque `*.test.ts` sous `src/` et `tests/` passe (`node --test`, suppression native des types), la règle de dépendance de `tests/architecture.test.ts` comprise | Node 24 |
| `npm run typecheck` | Tout le projet passe le contrôle de types (`scripts/typecheck.mjs`, `tsc` sur `tsconfig.json`, une ligne par erreur) | `npm ci` |
| `npm run bundle:check` | Chaque commande et chaque crew se bundle avec les options esbuild du runtime, sans aucune API Node | `npm ci` |
| `npm run check:provenance` | Aucun marqueur du matériau d'un autre produit dans les sources (`scripts/provenance-markers.json`) ; `-- --strict` exige aussi que la baseline soit vide, comme le fait la CI | Node |
| `npm run docs:commands -- --check` | `docs/commands.md` et `docs/fr/commands.md` correspondent aux commandes | Node |
| `npm run check` | Tout ce qui précède | `npm ci` |
| `bash scripts/smoke-runtime.sh [--mode ...]` | Le vrai REPL charge chaque commande (`N loaded, 0 skipped, 0 conflicts`) | un runtime |
| `bash scripts/check-file-modes.sh` | Les scripts sont commités exécutables | git |
| `node scripts/render-prompts.mjs <dir>` | Écrit chaque prompt tel que le modèle le lit (`tests/support/prompt-catalogue.ts`), pour relire un changement de prompt comme un `diff -r` de deux rendus ; `tests/prompt-contract.test.ts` contrôle le même catalogue | Node 24 |

La CI (`.github/workflows/ci.yml`) lance, en étapes séparées à chaque pull request et à chaque push sur `main`, les
tests, le contrôle de types, la vérification de bundle, la garde de provenance, les deux pages des commandes à jour
et les modes de fichiers (soit `npm run check` plus les modes de fichiers). `runtime-smoke.yml` lance le smoke sur
l'image épinglée chaque lundi, à la demande (`workflow_dispatch`), et sur une pull request qui touche
`.orkeon-version`, `orkeon-code`, `scripts/smoke-runtime.sh` ou `src/commands/**`. Tant qu'Orkeon `1.0.0-rc.6` n'est
pas publié, cette image n'existe pas et le job échoue : lancez le smoke en mode source à la place,
`ORKEON_SOURCE=<chemin d'un checkout d'Orkeon> bash scripts/smoke-runtime.sh --mode source`.

## Lancer un crew seul

```bash
bash scripts/run-crew.sh src/crews/git-commit/crew.ork.ts
ORKEON_CODE_WORKSPACE=~/src/app bash scripts/run-crew.sh src/crews/project-init/crew.ork.ts
bash scripts/run-crew.sh src/crews/_probe-codeintel/probe.ork.ts     # the code-intelligence probe
```

Le script utilise l'outil `orkeon` (`Orkeon.Scripting.Cli`, nuget.org, épinglé dans `.config/dotnet-tools.json` ; le
SDK .NET qui le restaure et le lance est épinglé par `global.json`, comme celui d'Orkeon : `10.0.300` avec
`rollForward: latestFeature`) ou l'image `orkeon-runners`, sur la fixture de démonstration sauf si
`ORKEON_CODE_WORKSPACE` en décide autrement. Les deux sont la release épinglée : tant que `1.0.0-rc.6` n'est pas
publiée, le script ne peut pas tourner. Cet outil lit ses limites de script dans `Orkeon:Scripting:Limits`, pas dans
le `Orkeon:Cli:ScriptCommands:Limits` du REPL
([Configuration](configuration.md#les-settings-dont-orkeon-code-dépend)).

L'exécution est sans opérateur : personne ne répond aux questions de la garde de permission, et il n'y a pas de règles
de session. Avec la garde active, comme la règlent les settings d'exemple, un appel pour lequel le mode poserait la
question est refusé à la place (le modèle lit `DENIED: …`) : `main-loop` lancé sans mode tourne en `default`, donc ses
écritures, ses commandes et ses lectures réseau sont refusées. Donnez-lui un mode pour les laisser passer, par exemple
`--inputs '{"prompt":"…","permissionMode":"bypassPermissions"}'`, sur un projet que vous pouvez vous permettre de
modifier. La même commande lancée sans opérateur, depuis un planificateur, un job de CI ou une application :
[Exécutions autonomes et embarquées](headless.md).

## Typings

`src/crews/.orkeon/orkeon.d.ts` et `src/commands/.orkeon/orkeon-cli.d.ts` décrivent l'API du runtime. Ils sont
générés par `orkeon typings` depuis la version épinglée : `npm run typings`, jamais édités à la main. Pour une
version pas encore publiée, `ORKEON_SOURCE=<chemin d'un checkout d'Orkeon> npm run typings` les génère depuis ce
checkout, la même variable que lit le mode source du lanceur.

## Montée de version d'Orkeon

La version du runtime vit en quatre endroits qui doivent concorder (`tests/version.test.ts` contrôle les deux
premiers) :

1. `.orkeon-version` : le tag de l'image et la version que le lanceur annonce ;
2. `.config/dotnet-tools.json` : `orkeon.scripting.cli` ;
3. `package.json` : `esbuild`, épinglé à la version avec laquelle le runtime bundle
   (`tools/scripting-esbuild/package-lock.json` dans Orkeon/orkeon à ce tag) ;
4. `global.json` : le SDK .NET, le même épinglage que le `global.json` d'Orkeon à ce tag (`tests/version.test.ts`
   le contrôle).

Puis `npm ci && npm run typings && npm run check && bash scripts/smoke-runtime.sh`, et une session réelle sur la
fixture de démonstration (`/init`, `/assistant`, `/commit`, `/review`) avant de fusionner. Dependabot ne touche pas à
esbuild pour cette raison.

## Publier une release

1. Déplacez les entrées `[Unreleased]` de `CHANGELOG.md` sous `## [x.y.z] - YYYY-MM-DD`.
2. Montez `version` dans `package.json` et `CLI_VERSION` dans `src/commands/_lib/meta.ts` (le test les garde
   égaux), ainsi que les notes de release dans ce même fichier.
3. Fusionnez, puis taguez `vx.y.z` sur `main` et poussez le tag : `release.yml` vérifie que le tag correspond, lance
   les vérifications et la garde de provenance stricte, et publie la GitHub Release avec les archives des sources,
   `SHA256SUMS` et une attestation de provenance du build (`gh attestation verify <file> --repo Orkeon/orkeon-code`).

Une version avec un suffixe (`-alpha.1`, `-rc.1`) est publiée en pré-release.
