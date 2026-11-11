# Recettes

Les étapes des changements courants d'Orkeon Code, chacune avec les fichiers à toucher et les vérifications qui
doivent rester vertes. Les couches et la règle qui les lie sont dans [Architecture](architecture.md) ; ce à quoi
sert chaque point d'extension, dans [Étendre](extending.md).

## Ajouter une commande

1. Écrire `src/commands/<group>/<name>.cmd.ts` sur le modèle ci-dessus, `<group>` le dossier fonctionnel dont elle relève : un seul `name: "<literal>"` en kebab case, une
   `description` statique, pas d'`export` de premier niveau.
2. Mettre la logique qui vaut un test dans `src/commands/_lib/<group>/<name>.ts`, le même `<group>` que la
   commande, sous la forme `run<Name>(tokens, deps)` rendant une `CommandView`, ses deps un `Pick<>` des ports et
   services qu'elle lit ; la tester dans `tests/commands/_lib/<group>/<name>.test.ts`, au-dessus des fakes.
   Un utilitaire que plusieurs groupes partagent se place à la racine de `_lib/` ; un groupe n'importe jamais un autre.
3. Augmenter `EXPECTED_COMMAND_COUNT` dans `tests/repository/command-surface.test.ts` et le nombre de commandes de
   `RELEASE_NOTES` dans `src/commands/_lib/status/messages.ts` (épinglé par `tests/commands/_lib/status/messages.test.ts`), puis lancer
   `npm run docs:commands`.

## Ajouter un crew

1. Créer `src/crews/<name>/crew.ork.ts` sur le modèle ci-dessus : les deux lignes d'en-tête (`// @orkeon-script 1.0`,
   puis la référence à `../.orkeon/orkeon.d.ts`), les agents avec les noms des outils dont ils ont besoin,
   `publishCrew(...)`.
2. Mettre le cas d'usage dans `application/run-<name>.ts` (`run<Name>(input, deps)`), ses règles pures dans
   `domain/`, chacun avec son `*.test.ts` ; le test du cas d'usage tourne au-dessus des fakes.
3. Le lancer depuis une commande async (`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<name>",
   input)`), et le nommer dans `RELEASE_NOTES`
   (`tests/commands/_lib/status/messages.test.ts` vérifie que chaque dossier de crew y est nommé). Un dossier commençant par `_` est
   une sonde de développement (`probe.ork.ts`), jamais listée aux utilisateurs.

## Ajouter un outil

1. Vérifier le nom que le runtime enregistre (`/debug-tool-call list`) : un nom inconnu dans `.tools([...])` fait
   échouer chaque appel `act` de l'agent. Un outil d'un serveur MCP ou d'un plugin ne demande aucun code :
   l'utilisateur le liste dans `tools.extra` (`shared/domain/agent-policy/extra-tools.ts`), et la commande qui lance
   l'offre si l'hôte l'enregistre.
2. Pour la boucle principale, l'ajouter à sa classe dans `src/shared/domain/agent-policy/permission.ts` (`READ_TOOLS`,
   `NETWORK_READ_TOOLS`, ou les classes d'édition et de shell) : la table des politiques de mode décide quels modes le
   remettent au modèle. Mettre à jour `permission.test.ts`, et `docs/permissions.md` quand la surface d'un mode
   change. Un autre crew le nomme dans son propre `.tools([...])`.
3. Quand le code applicatif appelle l'outil lui-même, il passe par un port : son entrée et son résultat sont typés par
   les typings générés (`crews/.orkeon/orkeon.d.ts`, `OrkeonTools` ; `orkeon/runtime-tools.ts` ne garde une forme
   locale plus stricte que lorsque l'adaptateur en veut une), ajouter l'appel à un adaptateur (ou à un nouveau port,
   ci-dessous) qui lit le résultat par `tool-results.ts`, tester l'adaptateur au-dessus de `FakeTools`.

## Ajouter un mode de permission

Un mode s'énonce une fois : une entrée de `PERMISSION_MODES` (`src/shared/domain/permission-modes.ts`, et
`MODE_CYCLE` quand un `/mode` nu doit passer par lui sur une console sans panneau) et une ligne de `MODE_POLICIES`
(`src/shared/domain/agent-policy/mode-policy.ts`) :

| Mode | `readOnly` | `toolClasses` |
|---|---|---|
| `default` | non | read, network, edit, shell, extra |
| `acceptEdits` | non | read, network, edit, shell, extra |
| `bypassPermissions` | non | read, network, edit, shell, extra |
| `plan` | oui | read |
| `dontAsk` | oui | read |

`extra` désigne les outils supplémentaires de classe `write` ; un outil supplémentaire de classe `read` rejoint `read`.
`MODE_POLICIES` est typé par la liste des modes, donc le contrôle de types refuse un mode sans sa ligne. Le
catalogue de la boucle principale et sa note de permission, le refus de `/commit` dans un mode en lecture seule et
l'annonce de `/mode` lisent la ligne ; `/mode` et les valeurs permises de `permissions.fallback` lisent la liste. La
garde de permission de l'hôte doit aussi connaître le mode (Orkeon classe un mode inconnu comme fermé par défaut).
Mettre à jour `mode-policy.test.ts` et `docs/permissions.md`.

## Ajouter un bloc de prompt

1. Écrire sa fonction de rendu dans `src/crews/main-loop/domain/prompt-assembly.ts` (`build<Name>Block`), rendant
   une chaîne vide quand il n'y a rien à dire, pour qu'une session qui ne s'en sert pas garde un prompt identique à
   l'octet près.
2. Lui donner un champ de `ContextParts` et sa place dans l'ordre fixe d'`assembleContext` ; un bloc de l'en-tête
   statique ne doit contenir aucune donnée propre au tour, sinon le cache du fournisseur se rompt.
3. Lire son entrée dans `application/context-gather.ts` (par les ports) et la passer dans
   `application/prompts.ts` ; tester la fonction de rendu dans `prompt-assembly.test.ts` et le tour au-dessus des
   fakes.
4. Spécifier le comportement d'abord, dans « L'assemblage du prompt » ci-dessus, puis en écrire le texte dans les mots
   propres de ce projet (CONTRIBUTING, « Original work only ») ; épingler une phrase-marqueur de chaque règle dans le
   test, et lancer `node scripts/render-prompts.mjs` avant et après pour lire le changement comme le modèle le lira.

## Ajouter une clé de configuration

1. La déclarer dans `CONFIG_KEYS` (`src/shared/domain/config-schema.ts`) : clé, description, valeurs permises, le
   consommateur. Une clé que rien ne lit ne doit pas pouvoir être réglée.
2. Le consommateur prend `Pick<ConfigStore, "readValue">` en dépendance (câblée avec `orkeonConfigStore()`) et lit
   `(await config.readValue(key)).value`, en se repliant sur sa valeur par défaut quand la valeur est absente ou
   illisible.
3. `/config keys` la liste avec ses valeurs permises et les commandes qui la lisent, et `/config get` montre sa
   description tant qu'elle n'est pas réglée ; la nommer dans `docs/configuration.md` (« Session settings ») quand
   les utilisateurs doivent la connaître.

## Ajouter un port

1. Déclarer l'interface dans `src/shared/application/ports/<concern>.ts` (une préoccupation nouvelle est un
   nouveau fichier), nommée d'après le besoin, avec son contrat d'échec (quels appels lèvent, lesquels sont au
   mieux), et ajouter son nom à la ligne `export type` de ce fichier dans `ports.ts`, que nomme chaque importeur.
2. Écrire l'adaptateur `src/shared/infrastructure/orkeon/<port>.ts` : `create<Port>(runtimeObject)`, les entrées
   d'outils déclarées dans `runtime-tools.ts`, les résultats lus par `tool-results.ts`. Le lier dans `wiring.ts` quand
   il lit la globale `tools` ; sinon le point d'entrée le construit à partir de son contexte.
3. Écrire `tests/support/doubles/fake-<port>.ts`, une classe `Fake<Port>` qui implémente le port avec des champs simples à
   configurer et à inspecter, et le test de l'adaptateur au-dessus du substitut du runtime.
4. Un port arrive avec son premier appelant de production, jamais avant lui.
