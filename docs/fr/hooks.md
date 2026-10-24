# Hooks

Un hook est une commande à vous qui s'exécute autour des appels d'outils que fait le modèle. `/hooks` les garde dans
la session :

```text
/hooks add pre-tool node .orkeon/hooks/pre.mjs {tool} {path}
/hooks add post-tool node .orkeon/hooks/post.mjs {tool} {path}
/hooks list
/hooks remove 2
```

Ils durent jusqu'à `/clear` ou la fin du REPL, comme les [règles de permission](permissions.md#règles).

## Où ils s'exécutent

Les étapes dev `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-verify` et `/dev-batches` remettent
le registre à leur crew, comme `/tasks repair` à l'agent qu'il relance. Pour chaque appel d'outil que le modèle fait dans ce crew, une fois que la [garde de l'hôte](permissions.md) l'a permis :

1. le callback du crew contrôle à nouveau l'appel avec les jeux de règles de l'étape (et, pour un rôle d'un lot, avec
   ses racines) ; un appel qu'ils refusent n'exécute aucun hook ;
2. chaque hook `pre-tool` s'exécute, dans l'ordre de `/hooks list` ; le premier qui sort avec un code autre que 0,
   dure plus de 60 secondes ou ne peut pas s'exécuter refuse l'appel : le modèle lit le numéro du hook, sa commande,
   son code de sortie et la première ligne qu'il a affichée (sa sortie d'erreur d'abord), et l'appel ne s'exécute pas ;
3. l'appel s'exécute ;
4. chaque hook `post-tool` s'exécute, dans l'ordre. Celui qui échoue ajoute une ligne au résultat que lit le modèle
   (`[post-tool hook #2 (node .orkeon/hooks/post.mjs file_write src/x.ts) exited 1: …]`) ; quand tous sortent avec 0,
   le résultat reste tel quel. Un résultat qui n'est pas du texte parvient alors au modèle en JSON compact, sur une ligne.

Le temps d'exécution d'un hook compte dans le budget de temps de l'étape, à chaque appel : gardez les hooks courts.

Un appel que la garde refuse, une règle deny de la session comprise, n'atteint jamais les hooks. L'assistant
(`/assistant`) ne les exécute pas encore, et rien n'exécute un hook `stop` : `/hooks` les garde pour plus tard. Sous
`orkeon run`, un crew reçoit les mêmes hooks de son entrée `hooks`
(`--inputs '{"hooks":[{"event":"pre-tool","command":"…"}]}'`).

## Ce qu'est une commande de hook

Orkeon Code exécute un hook avec l'outil shell, depuis son propre code, dans `/workspace` : la garde ne le contrôle
pas, et la commande est un programme et ses arguments, tels que l'outil les lit. `;`, `&&`, `||`, `|`, `&`, `<`, `>`,
`>>`, `$(` et les backticks sont refusés, par l'outil et par `/hooks add`, et aucune variable n'est développée. Mettez
les étapes dans un script et nommez le script :

```js
// .orkeon/hooks/pre.mjs <tool> <path>: log every call, refuse writes under generated/ (relative or absolute).
import { appendFileSync } from "node:fs";
const [tool, path] = process.argv.slice(2);
appendFileSync(".orkeon/hooks/calls.log", `${new Date().toISOString()} ${tool} ${path}\n`);
if (path.startsWith("generated/") || path.startsWith("/workspace/generated/")) {
  console.error("generated/ is rebuilt, not edited");
  process.exit(2);
}
```

Trois mots sont remplacés dans la commande avant qu'elle s'exécute :

| Mot | Remplacé par |
|---|---|
| `{tool}` | le nom de l'outil que le modèle a appelé, `file_write` |
| `{event}` | `pre-tool` ou `post-tool` |
| `{path}` | l'argument `path` de l'appel, tel que le modèle l'a écrit, quand il ne contient que des lettres, des chiffres et `._/@+=,:-` et ne commence pas par `-` ; `-` sinon ou sans lui |

Le programme doit être un de ceux que l'outil shell exécute : `node`, `npm`, `dotnet` et `find` sous
`Orkeon:Tools:Shell:AllowInterpreters`, que les settings d'exemple activent, et tout autre sous
`Orkeon:Tools:Shell:ExtraAllowedCommands` (`"bash"` pour un script shell ; [Configuration](configuration.md)). Un hook
qui ne peut pas s'exécuter refuse chaque appel de l'étape : lancez-le d'abord une fois à la main
(`node .orkeon/hooks/pre.mjs file_read README.md`).

## Ce qu'un hook ne fait pas

Il ne peut pas permettre un appel que la garde ou les jeux de règles refusent, ni changer l'entrée de l'appel. Il ne
peut pas vous demander : une approbation demandée au milieu d'un tour de crew peut rester sans réponse, donc un hook
décide seul. Il ne voit pas les appels qu'une commande ou un crew fait depuis son propre code (les commandes git de
`/dev-verify`, son build et ses tests), ni les appels internes d'un outil qu'Orkeon Code définit, qui contrôlent leurs
propres chemins.
