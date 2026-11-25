# Chat : lire et poster dans Microsoft Teams

Les outils de chat d'Orkeon (Orkeon #446) permettent à l'agent de lire un canal ou une conversation, de chercher des
messages, de trouver une personne, de poster, modifier, supprimer, réagir et de lire la transcription d'une réunion.
Les outils portent le nom de ce qu'ils font (`chat_read`, `chat_send`…) ; Microsoft Teams est leur premier
fournisseur. C'est vous qui décidez de ce que l'agent atteint : un compte, ses droits et les lieux où il lit et poste
sont écrits dans les réglages, jamais choisis par l'agent. Le guide d'Orkeon,
[Chat tools](https://github.com/Orkeon/orkeon/blob/main/docs/guides/chat.md), couvre l'enregistrement de
l'application dans Microsoft Entra, les scopes, chaque réglage et chaque erreur. Cette page met la famille en place
pour Orkeon Code.

> [!WARNING]
> Orkeon indique que la famille a été testée contre un Microsoft Graph scénarisé et n'a jamais tourné sur un vrai
> tenant Microsoft 365. Orkeon Code n'avait pas de tenant non plus : ce qui est vérifié ici est le catalogue, les
> règles de permission et la liste des comptes, qui ne fait aucune requête. Signalez ce qui diffère sur votre tenant.

## Ce qu'il faut

- Un runtime à l'épingle de `.orkeon-version` : le mode source avec `ORKEON_SOURCE` à ce commit. La release
  `1.4.0`, qu'exécutent les modes tool et docker, n'a aucun outil de chat.
- Une application Microsoft Entra pour un compte qui se connecte en votre nom ou comme application ; aucune pour un
  webhook.

## Trois sortes de compte

| Compte | Ce qu'il fait | Ce qu'il lui faut |
|---|---|---|
| Un utilisateur (`Provider: Teams`) | Lit et poste en votre nom, dans ses droits et ses lieux | Une application Entra, une connexion dans un terminal |
| Une application (`Auth:Method: ClientCredentials`) | Lit les lieux que vous nommez, ne poste rien | Une application Entra avec des permissions d'application, un certificat, un jeton fédéré ou un secret nommé par une variable |
| Un webhook (`Provider: TeamsWebhook`) | Poste dans le seul lieu où mène son adresse | Un webhook Workflows dans Teams, son adresse dans une variable |

## 1. Déclarer un compte

`config/appsettings.chat.example.json` contient un compte de chaque sorte. Fusionnez sa section `Orkeon` dans
`config/appsettings.local.json` et gardez ce qui vous sert :

```json
"me": {
  "Provider": "Teams",
  "Rights": "Read, Send",
  "Auth": { "ClientId": "<application id>", "Tenant": "<tenant id>" },
  "Read": { "AllowedPlaces": ["team:Engineering", "user:*@example.com"] },
  "Send": { "AllowedPlaces": ["team:Engineering/channel:Releases"], "MaxPerHour": 20 }
}
```

- `Rights` est obligatoire : parmi `Read`, `Send`, `Edit`, `Delete`, `React`, `Meetings`.
- Un `Read:AllowedPlaces` vide ne lit nulle part, un `Send:AllowedPlaces` vide ne poste nulle part.
- Lire un canal demande une permission qu'un administrateur du tenant accorde, déclarée dans `Auth:AdminGranted` ;
  une conversation n'en demande pas.
- Aucun secret ne va dans le fichier : une adresse de webhook, un chemin de certificat ou un secret client est le nom
  d'une variable d'environnement, définie avant le démarrage d'Orkeon Code.

## 2. Se connecter, pour un compte utilisateur

Une fois, dans un terminal, avec le CLI `orkeon` du même commit et le fichier de réglages que lit la session :

```bash
orkeon chat login me --settings config/appsettings.local.json
```

- La commande ouvre votre navigateur ; `--device-code` donne à la place un code à saisir sur un autre appareil.
- `orkeon chat check me --settings config/appsettings.local.json` dit, droit par droit, ce qui manque.
- Les jetons sont gardés dans le dossier `credentials` à côté de vos réglages Orkeon par utilisateur, hors du projet
  et hors de portée des outils de fichiers de l'agent. La session les lit là.
- Une session ne se connecte jamais. Un jeton refusé plus tard fait répondre aux outils `SignInRequired` avec la
  commande à lancer.
- `orkeon chat logout me` supprime les jetons ; Microsoft n'offre pas de révocation, un administrateur retire donc
  l'accès de l'application dans le centre d'administration Entra.

## 3. Dans une session

Les dix outils entrent dans le catalogue de l'agent dès qu'un compte au moins est déclaré ; sans compte, la session
reste ce qu'elle était. `/chat` liste les comptes déclarés, celui par défaut marqué, avec leur fournisseur, leurs
droits et s'ils sont prêts ; un compte qui n'est pas prêt montre ce que le runtime dit lui manquer : une variable à
définir, la connexion à lancer dans un terminal. `/permissions` liste les outils avec le reste.

| Outil | Fait | La barrière |
|---|---|---|
| `chat_accounts`, `chat_list`, `chat_read`, `chat_search`, `chat_members`, `chat_meetings` | Lit | S'exécute sans question en `default`, `acceptEdits` et `bypassPermissions` ; non offert en `plan` et `dontAsk` |
| `chat_send`, `chat_edit`, `chat_delete`, `chat_react` | Écrit | Demande en `default` et en `acceptEdits` ; s'exécute en `bypassPermissions` ; non offert en `plan` et `dontAsk` |

- Un envoi est demandé à chaque fois : accepter les éditions n'accepte pas les messages. Une règle allow ouvre ce que
  vous choisissez, une règle deny le ferme dans tous les modes :

```text
/permissions add allow chat_send(place:team:Engineering/channel:Releases)
/permissions add deny chat_delete
```

- Seul l'agent principal a les outils : les explorateurs qu'il lance et les autres crews ne les ont pas.
- Un message lu dans Teams est un texte écrit par quelqu'un d'autre. Le runtime le filtre et l'agent a pour consigne
  de le traiter comme une donnée ; ni l'un ni l'autre n'est une garantie. La frontière est la vôtre : les droits et
  les deux listes de lieux. Ne donnez pas `Send` et un `Read` large à une session que vous ne surveillez pas.

## Limites

- Jamais exécuté sur un vrai tenant, ni par Orkeon ni ici.
- Aucun fichier n'est envoyé ni téléchargé, et le contenu d'une carte adaptative n'est pas lu.
- `Send:MaxPerHour` est compté par processus : chaque session repart de zéro.
- Mode docker : l'image de la dernière release n'a aucun outil de chat, et le lanceur ne passe encore ni les
  variables qu'un compte nomme ni un dossier pour les jetons.
- Parler à Orkeon Code depuis Teams (un bot) est le canal d'`orkeon-host`, qu'Orkeon Code n'exécute pas.
