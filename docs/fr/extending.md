# Étendre Orkeon Code

Tout ce que l'agent dit et fait côté TypeScript est un fichier source de ce dépôt : une commande est un fichier, un
crew un dossier, un prompt une chaîne avec son test sous `tests/`, un mode de permission une ligne d'une table. Pas d'étape
de build de votre côté : le runtime bundle les sources avec esbuild et les exécute dans Jint au démarrage du REPL, et
un changement est donc actif au prochain démarrage. Cette page liste les points d'extension, ce que chacun touche, et
où sont les limites. Les couches, les ports et les recettes pas à pas sont dans
[Architecture](architecture.md#recettes) ; les règles de code dans [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Une commande

Un fichier `src/commands/<group>/<name>.cmd.ts`, `<group>` l'un des dossiers fonctionnels (`session`, `settings`,
`status`, `project`, `git`, `dev`, `memory`, `speech`). Le chargeur prend chaque `*.cmd.ts` sous le dossier ; le nom est en kebab-case et unique, et
le fichier n'exporte rien. Une commande synchrone répond tout de suite avec `defineCommand` ; une commande asynchrone
lance un crew avec `defineAsyncCommand` et affiche le résultat quand le crew se termine
([Architecture](architecture.md#dune-commande-à-un-crew)). Une commande atteint le runtime par les adaptateurs de
`src/shared/infrastructure/orkeon/wiring.ts`, jamais par les globales :

```ts
/// <reference path="./.orkeon/orkeon-cli.d.ts" />
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "which-mode",
  description: "Say which permission mode the next request runs in, and why.",
  handler: async (_args, ctx) => {
    const { mode, via } = await session.resolveEffectiveSessionMode();
    return ctx.continue(`${mode} (${via})`);
  },
});
```

La logique qui mérite un test va dans `src/commands/_lib/<group>/<name>.ts`, le dossier de sa commande,
sous la forme `run<Name>(tokens, deps)`, ses deps un `Pick<>` des ports qu'elle lit, testée sur les fakes de `tests/support/doubles/`. Trois autres endroits bougent avec
une nouvelle commande, et `npm run check` nomme celui que vous avez oublié : `tests/repository/command-surface.test.ts` épingle
le nombre de commandes, `src/commands/_lib/status/meta.ts` l'énonce dans les notes de release, et `npm run docs:commands`
régénère [docs/fr/commands.md](commands.md). La recette : [Ajouter une commande](architecture.md#ajouter-une-commande).

## Un crew

Un dossier `src/crews/<name>/` avec un `crew.ork.ts` dans la forme procédurale : les agents avec les noms d'outils
dont ils ont besoin, un agent dont le `.body()` appelle le cas d'usage, `publishCrew(...)` à la fin. Le cas d'usage
est `application/run-<name>.ts` (`run<Name>(input, deps)`), ses règles pures dans `domain/`, chacune avec son
`*.test.ts` sous `tests/crews/<name>/` ; le test du cas d'usage tourne sur les fakes. La commande qui le lance le nomme,
`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<name>", input)`, et `input` arrive au crew comme
`inputs()`. Les imports sont relatifs et portent leur extension `.ts`, parce que le runtime bundle chaque point
d'entrée à partir des fichiers tels qu'ils sont écrits.

- `advisor` est le modèle le plus petit : un agent, un `ctx.llm.complete`, pas d'outil.
- `code-review` est le modèle d'un crew séquentiel qui lit `inputs()` et lance des outils.
- `main-loop` est le modèle d'une boucle : `ctx.llm.act` fait tourner le cycle modèle ⇄ outils sur le catalogue de
  l'agent, sous `.budget(...)`.

Un dossier qui commence par `_` est une sonde de développement, jamais listée aux utilisateurs. Lancez n'importe quel
crew seul avec `bash scripts/run-crew.sh src/crews/<name>/crew.ork.ts --inputs '{...}'`
([Exécutions autonomes et embarquées](headless.md)) ; la vérification de bundle (`npm run bundle:check`) prouve qu'il
bundle avec les options du runtime et sans aucune API Node. La recette :
[Ajouter un crew](architecture.md#ajouter-un-crew).

## Vos propres crews et commandes, hors du checkout

Le REPL accepte `--crews-dir` et `--commands-dir` plusieurs fois, et le lanceur transmet ce qu'il ne reconnaît
pas :

```bash
./orkeon-code -- --crews-dir ~/my-crews --commands-dir ~/my-commands
```

Un crew nommé `x` est `<dir>/x/crew.ork.ts` ; le premier dossier qui l'a gagne, et ceux du checkout passent en
premier. Le runtime monte chaque dossier en lecture seule (`/crews`, `/crews-1`, ... ; `/cli-commands`,
`/cli-commands-1`, ...). Un crew hors du checkout importe le code partagé par un chemin relatif vers le checkout. Cela
fonctionne en modes tool et source ; en mode docker, le conteneur ne voit que le `src` du checkout et le projet, et
les fichiers vont donc dans le checkout.

## Un outil

**En TypeScript, dans un crew.** `toolBuilder()` déclare un nom, une description, un schéma JSON et un `execute` qui
s'exécute dans le script ; `.withAutonomousTool(tool)` sur l'agent le confie au modèle, et `ctx.llm.act` le propose
comme un outil intégré. Le catalogue de permissions de `main-loop` liste les outils de l'hôte par leur nom et ignore
tout d'un outil construit : décidez dans le crew, d'après le mode, de l'attacher ou non.

```ts
const wordCount = toolBuilder<{ text: string }, { words: number }>()
  .name("word_count")
  .description("Count the words of a text.")
  .withSchema({ type: "object", properties: { text: { type: "string" } }, required: ["text"] })
  .execute((input) => ({ words: input.text.trim().split(/\s+/).length }))
  .build();
```

**Un outil du runtime.** Vérifiez le nom que l'hôte enregistre (`/debug-tool-call list`), puis ajoutez-le à sa classe
dans `src/shared/domain/agent-policy/permission.ts` (`READ_TOOLS`, `NETWORK_READ_TOOLS`, ou les classes d'édition et
de shell) : la table des politiques de mode décide quels modes le confient au modèle. Quand du code applicatif
l'appelle, l'appel passe par un port et un adaptateur de `src/shared/infrastructure/orkeon/`. La recette :
[Ajouter un outil](architecture.md#ajouter-un-outil).

**Sur l'hôte.** L'outil shell exécute les commandes de sa liste blanche : `Orkeon:Tools:Shell:ExtraAllowedCommands`
ajoute les outils de build de vos projets, `AllowInterpreters` ouvre `node`, `dotnet`, `npm`...
([Configuration](configuration.md)). Un outil écrit en C# est un plugin Orkeon (un assembly qui implémente
`IOrkeonPlugin`) ; un outil servi par un serveur MCP ne demande aucun code. Le REPL connecte les serveurs de
`MCP:Servers` et charge les plugins de `Plugins`, et leurs outils rejoignent le catalogue de l'assistant dès que la clé
de session `tools.extra` les nomme avec leur classe (`<name>:read|write`)
([Configuration](configuration.md#outils-supplémentaires--serveurs-mcp-et-plugins)).

## Prompts et comportement

Chaque prompt est écrit d'après une spécification de comportement,
[Architecture](architecture.md#lassemblage-du-prompt), dans les mots propres de ce projet
([ADR 0003](../adr/0003-prompts-from-a-behaviour-specification.md), en anglais) : changez d'abord la spécification,
puis le texte, puis les phrases-marqueurs que son test épingle. `node scripts/render-prompts.mjs <dir>` écrit chaque
prompt tel que le modèle le lit, et un changement se relit donc comme le diff de deux rendus.

- **La boucle principale.** `src/crews/main-loop/domain/prompt-assembly.ts` construit l'en-tête statique (règles de
  comportement, outils et ce qu'ils savent faire, guide de recherche, fichier d'instructions du projet) et le corps
  utilisateur (préférences, skills, mémoire, hooks, environnement, historique, jauge, requête) : une fonction de
  rendu `build<Name>Block` par bloc, un champ de `PromptParts`, une place dans l'ordre fixe d'`assemblePrompt`.
  L'entrée d'un bloc est lue dans `application/context-gather.ts`, par les ports, et passée dans
  `application/turn-prompt.ts` ; les réglages qu'une session fixe (`/effort`, `/passes`, `/fast`, `/proactive`,
  `/output-style`, `answer.language`) voyagent de la même façon.
- **Compaction et mémoire.** `src/shared/domain/compaction.ts` tient les prompts de résumé et d'extraction de mémoire
  et les marqueurs que le modèle relit ensuite dans son historique ; `src/shared/application/compaction/` les exécute.
- **Les crews.** Les prompts de chaque crew sont à côté de son cas d'usage (`application/prompts.ts`, ou son module de
  domaine) et ont leurs propres tests.

`npm run check:provenance` refuse les marqueurs du matériau d'un autre produit, et `tests/repository/prompt-contract.test.ts`
vérifie chaque prompt rendu. La recette : [Ajouter un bloc de prompt](architecture.md#ajouter-un-bloc-de-prompt).

## Modes de permission

Un mode s'énonce une fois : une entrée de `PERMISSION_MODES` (`src/shared/domain/permission-modes.ts`) et une ligne de
`MODE_POLICIES` (`src/shared/domain/agent-policy/mode-policy.ts`) : lecture seule ou non, et les classes d'outils
qu'il propose, les classes étant les listes d'`agent-policy/permission.ts`. Déplacez un outil d'une classe à une autre
et chaque mode suit ; le contrôle de types refuse un mode sans sa ligne ; les tests épinglent la promesse de
lecture seule de `plan` et de `dontAsk`. Les cinq noms de modes sont aussi connus de la garde de l'hôte, qui traite un
nom inconnu comme `default` (fail-closed) : changer ce qu'un mode propose est un changement TypeScript, ajouter un
sixième mode est aussi un changement du runtime. Les règles de la session, sur un outil ou sur ses arguments
(`/permissions add allow shell_command command=npm test*`), sont celles de la garde de l'hôte et ne demandent aucun
code. La recette : [Ajouter un mode de permission](architecture.md#ajouter-un-mode-de-permission).

## Modèles et settings

Tout point d'accès compatible OpenAI, choisi dans le fichier de settings (`Llm:BaseUrl`, `Llm:Model`) ; `/model`
bascule parmi `Llm:AvailableModels` sans relancer ; les variables d'environnement `ORKEON_*` l'emportent sur n'importe
quelle clé ([Configuration](configuration.md)). Une nouvelle clé de session est une ligne de l'espace de clés déclaré
([Ajouter une clé de configuration](architecture.md#ajouter-une-clé-de-configuration)).

## Les limites

- Les scripts s'exécutent dans Jint, sur un seul thread, sans API Node ni timers : `src/` n'importe rien de `node:*`
  (la vérification de bundle le refuse), et une commande ne fait jamais elle-même un long travail, elle le confie à un
  crew.
- Le code applicatif ne touche jamais le runtime : il reçoit des ports, et `tests/repository/architecture.test.ts` fait échouer
  tout import, et tout usage d'une globale du runtime, qui casse la règle de dépendance.
- `.tools([...])` nomme des outils de l'hôte, et un nom inconnu fait échouer chaque appel `act` de l'agent avant que
  le modèle soit sollicité : un outil qui manque au runtime ne peut pas être ajouté d'ici. `/debug-tool-call list`
  montre ce que l'hôte propose.
- Un résultat d'outil arrive au modèle tronqué à 4000 caractères, avec une coupe plus large pour certains outils
  (`Orkeon:Tools:ResultLimits`, [Configuration](configuration.md)).
- Les hooks déclarés (`/hooks`) s'exécutent autour des appels d'outils des étapes dev, pas dans `/assistant`, et aucun
  hook `stop` ne s'exécute ([Hooks](hooks.md)). Les agents sauvegardés (`/agents`) sont stockés, pas exécutés : la
  délégation qui les utiliserait est sur la [Feuille de route](roadmap.md).
