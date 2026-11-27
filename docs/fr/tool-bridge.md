# Le pont d'outils : le navigateur de votre machine pour une session en Docker

En mode docker, les agents tournent dans un conteneur, sans navigateur ni écran. Le pont d'outils d'Orkeon (Orkeon #445)
exécute plutôt les outils choisis sur votre machine : `orkeon bridge serve` écoute sur votre boucle locale, et le
runtime du conteneur lui envoie les appels des outils que ses réglages nomment. L'outil garde son nom, son schéma et
ses classes d'accès : l'agent voit `browser` comme avant, et la barrière de permissions du conteneur juge chaque appel
comme avant ([Permissions](permissions.md)). Cette page met les deux côtés en place pour Orkeon Code. Le guide
d'Orkeon,
[Orkeon in a container, the browser on the desktop](https://github.com/Orkeon/orkeon/blob/main/docs/guides/tool-bridge.md),
couvre le protocole, les limites et https.

Les modes outil et source n'en ont pas besoin : le runtime tourne sur votre machine et pilote lui-même le navigateur de votre machine.

## Ce qu'il faut

- Les deux côtés au même commit d'Orkeon : le pont refuse un outil dont le contrat diffère. Le pont est arrivé avec
  Orkeon `1.4.0`, l'outil `browser` deux commits plus tard, avec l'épingle de `.orkeon-version` : la release `1.4.0`
  n'a l'outil que sous son ancien nom `firefox`, qu'Orkeon Code n'offre plus. Tant qu'aucune release ne porte
  `browser`, les deux côtés se construisent à l'épingle, comme plus bas :
  - dans le conteneur, une image construite à l'épingle ;
  - sur votre machine, la CLI `orkeon` construite au même commit.
- Sur votre machine, le navigateur du moteur que le pont pilote : Firefox par défaut ;
  `Orkeon:Tools:Browser:Engine` dans les réglages du pont choisit Chrome, Edge, Brave ou Safari à la place.

Une fois qu'une release porte `browser`, son image `ghcr.io/orkeon/orkeon:latest` et sa CLI `orkeon` (le paquet
Debian, une archive de release ou le `.msi`) suffisent. D'ici là, construisez les deux côtés depuis un checkout
d'Orkeon à l'épingle
(`git -C ~/src/orkeon checkout "$(cat .orkeon-version)"`, lancé depuis ce checkout-ci), puis nommez l'image par
`ORKEON_CODE_IMAGE=orkeon-local:pin` et servez avec
`dotnet ~/src/orkeon/src/scripting/Orkeon.Scripting.Cli/bin/Debug/net10.0/orkeon.dll` à la place d'`orkeon` :

```bash
cd ~/src/orkeon
docker build -f Dockerfile.runners -t orkeon-local:pin .        # the image, as the release builds it
dotnet build src/scripting/Orkeon.Scripting.Cli -c Debug        # the CLI that serves the bridge
```

## 1. Un jeton, des deux côtés

Le jeton n'est jamais écrit dans un fichier. Choisissez-en un de 16 caractères ou plus et exportez-le dans le shell
qui lance le pont et dans celui qui lance Orkeon Code :

```bash
export ORKEON_BRIDGE_TOKEN="$(openssl rand -hex 32)"
```

`Orkeon:Tools:Bridge:TokenEnvVar` nomme une autre variable si celle-ci ne vous convient pas ; le lanceur lit aussi
cette clé.

## 2. Le pont, sur votre machine

Dans un dossier à lui, un `appsettings.json` qui sert `browser` :

```json
{ "Orkeon": { "Bridge": { "Allow": ["browser"] } } }
```

Puis, depuis ce dossier :

```bash
orkeon bridge serve
```

```text
orkeon bridge serve: listening on http://127.0.0.1:7410/
orkeon bridge serve: serving browser
orkeon bridge serve: Ctrl+C stops it.
```

Le navigateur tourne avec les réglages du pont : `Orkeon:Tools:Browser` (`Engine`, `Headless`, les profils) va dans ce fichier, pas
dans celui d'Orkeon Code. Les appels qu'un agent fait pendant son tour partagent un même navigateur. Le code d'un crew
qui appelle lui-même `browser`, hors du tour du modèle, reçoit un navigateur neuf à chaque appel (un `read` après
`navigate` voit `about:blank`), sauf si `"Lifetime": "Host"` garde le navigateur ouvert jusqu'à `close`.

## 3. Orkeon Code, dans le conteneur

Fusionnez [`config/appsettings.bridge.example.json`](../../config/appsettings.bridge.example.json) dans vos réglages :

```json
{ "Orkeon": { "Tools": { "Bridge": { "Address": "http://127.0.0.1:7410/", "Allow": ["browser"] } } } }
```

Puis lancez Orkeon Code en mode docker, le jeton exporté :

```bash
./orkeon-code --mode docker
```

Quand les réglages nomment `Orkeon:Tools:Bridge:Address` et au moins un outil dans `Allow`, le lanceur (le REPL
comme `orkeon-code run`) :

- passe au conteneur la variable du jeton par son nom (`-e ORKEON_BRIDGE_TOKEN`), jamais sa valeur ;
- refuse de démarrer quand la variable n'est pas définie ou fait moins de 16 caractères, et dit laquelle ;
- lance le conteneur sur le réseau de l'hôte (`--network host`) quand l'adresse est sur la boucle locale
  (`localhost`, `127.x`, `[::1]`) : la boucle locale du conteneur est alors celle de votre machine, seul moyen pour
  un moteur Linux d'y joindre le pont.

Le lanceur lit les réglages comme du JSON strict. Le runtime accepte aussi les commentaires et les virgules finales ;
le lanceur refuse un tel fichier quand il nomme un pont, plutôt que de lancer un conteneur sans son jeton.

Au démarrage, le runtime écrit `Tool bridge: Orkeon:Tools:Bridge selects browser`. Un pont injoignable arrête le
démarrage : `the tool bridge at http://127.0.0.1:7410/ cannot be reached (Connection refused …)`.

### Docker Desktop (Windows, macOS)

`host.docker.internal` joint l'écoute du pont sur la boucle locale ; le lanceur n'ajoute alors pas `--network host`.
L'écoute ne répond qu'à l'hôte que son préfixe nomme. Le runtime envoie de lui-même `127.0.0.1:7410`, ce qui convient
à macOS ; sous Windows le préfixe de l'écoute est `http://localhost:7410/`, réglez donc `HostHeader` sur
`localhost:7410` :

```json
{ "Orkeon": { "Tools": { "Bridge": { "Address": "http://host.docker.internal:7410/", "HostHeader": "localhost:7410", "Allow": ["browser"] } } } }
```

En http, le jeton et les appels traversent en clair le réseau virtuel de Docker, et le runtime le signale au
démarrage.

## Ce qui a été vérifié

Sous Linux avec un moteur Docker (29.10), une image et une CLI construites depuis Orkeon `5dc2ff3`, l'épingle de ce jour-là :

- `orkeon-code run` avec un crew qui appelle l'outil de navigateur, sous le nom qu'il avait alors : la page s'ouvre
  dans le Firefox de la machine, et la capture
  enregistrée dans `/output` arrive dans le dossier de sortie de la session ;
- le REPL en mode docker démarre avec le pont et sort sur `/exit` ;
- pont arrêté, le démarrage est refusé avec le message du runtime ; sans jeton, le lanceur refuse avant que le
  conteneur ne démarre.

Non vérifié : Docker Desktop, Windows (`orkeon-code.ps1` n'est vérifié que par son texte), un pont en https, et
l'outil `browser` de l'épingle à travers le pont.
