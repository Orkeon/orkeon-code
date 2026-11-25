# Chat: reading and posting in Microsoft Teams

Orkeon's chat tools (Orkeon #446) let the agent read a channel or a chat, search messages, look a person up, post,
edit, delete, react and read the transcript of a meeting. The tools are named after what they do (`chat_read`,
`chat_send`…); Microsoft Teams is their first provider. You decide what the agent may reach: an account, its rights
and the places it may read and post in are written in the settings, never chosen by the agent. Orkeon's own guide,
[Chat tools](https://github.com/Orkeon/orkeon/blob/main/docs/guides/chat.md), covers the registration of the
application in Microsoft Entra, the scopes, every setting and every error. This page sets the family up for Orkeon
Code.

> [!WARNING]
> Orkeon states that the family was tested against a scripted Microsoft Graph and never run on a real Microsoft 365
> tenant. Orkeon Code had no tenant either: what is checked here is the catalogue, the permission rules and the
> listing of the accounts, which makes no request. Report what differs on your tenant.

## What you need

- A runtime at the pin of `.orkeon-version`: the source mode with `ORKEON_SOURCE` at that commit. The release
  `1.4.0`, which the tool and docker modes run, has no chat tool.
- A Microsoft Entra application for an account that signs in as you or as an application; none for a webhook.

## Three kinds of account

| Account | What it does | What it needs |
|---|---|---|
| A user (`Provider: Teams`) | Reads and posts as you, within its rights and places | An Entra application, one sign-in in a terminal |
| An application (`Auth:Method: ClientCredentials`) | Reads the places you name, posts nothing | An Entra application with application permissions, a certificate, a federated token or a secret named by a variable |
| A webhook (`Provider: TeamsWebhook`) | Posts into the one place its address leads to | A Workflows webhook in Teams, its address in a variable |

## 1. Declare an account

`config/appsettings.chat.example.json` holds one account of each kind. Merge its `Orkeon` section into
`config/appsettings.local.json` and keep what you use:

```json
"me": {
  "Provider": "Teams",
  "Rights": "Read, Send",
  "Auth": { "ClientId": "<application id>", "Tenant": "<tenant id>" },
  "Read": { "AllowedPlaces": ["team:Engineering", "user:*@example.com"] },
  "Send": { "AllowedPlaces": ["team:Engineering/channel:Releases"], "MaxPerHour": 20 }
}
```

- `Rights` is mandatory: any of `Read`, `Send`, `Edit`, `Delete`, `React`, `Meetings`.
- An empty `Read:AllowedPlaces` reads nowhere, an empty `Send:AllowedPlaces` posts nowhere.
- Reading a channel needs a permission a tenant administrator grants, declared in `Auth:AdminGranted`; a chat does
  not.
- No secret goes in the file: a webhook address, a certificate path or a client secret is the name of an environment
  variable, set before Orkeon Code starts.

## 2. Sign in, for a user account

Once, in a terminal, with the `orkeon` CLI of the same commit and the settings file the session reads:

```bash
orkeon chat login me --settings config/appsettings.local.json
```

- The command opens your browser; `--device-code` gives a code to type on another device instead.
- `orkeon chat check me --settings config/appsettings.local.json` says, right by right, what is missing.
- The tokens are kept in the `credentials` folder beside your per-user Orkeon settings, out of the project and out
  of reach of the agent's file tools. The session reads them there.
- A session never signs in. A token refused later makes the tools answer `SignInRequired` with the command to run.
- `orkeon chat logout me` deletes the tokens; Microsoft offers no revocation, so an administrator removes the
  application's access in the Entra admin center.

## 3. In a session

The ten tools enter the agent's catalogue when one account at least is declared; with none, the session is what it
was. `/chat` lists the declared accounts, the default one marked, with their provider, their rights and whether each
is ready; an account not ready shows what the runtime says it lacks: a variable to set, the sign-in to run in a
terminal. `/permissions` lists the tools with the rest.

| Tool | Does | The gate |
|---|---|---|
| `chat_accounts`, `chat_list`, `chat_read`, `chat_search`, `chat_members`, `chat_meetings` | Read | Runs without a question in `default`, `acceptEdits` and `bypassPermissions`; not offered in `plan` and `dontAsk` |
| `chat_send`, `chat_edit`, `chat_delete`, `chat_react` | Write | Asks in `default` and in `acceptEdits`; runs in `bypassPermissions`; not offered in `plan` and `dontAsk` |

- A post is asked every time: accepting edits does not accept messages. An allow rule opens what you choose, a deny
  rule closes it in every mode:

```text
/permissions add allow chat_send(place:team:Engineering/channel:Releases)
/permissions add deny chat_delete
```

- Only the main agent has the tools: the explorers it spawns and the other crews do not.
- A message read from Teams is text written by someone else. The runtime screens it and the agent is told to treat
  it as data; neither is a guarantee. The boundary is yours: the rights and the two lists of places. Do not give
  `Send` and a wide `Read` to a session you do not watch.

## Limits

- Not run on a real tenant, by Orkeon nor here.
- No file is uploaded or downloaded, and the content of an adaptive card is not read.
- `Send:MaxPerHour` is counted per process: each session starts from zero.
- Docker mode: the image of the last release has no chat tool, and the launcher passes neither the variables an
  account names nor a folder for the tokens yet.
- Talking to Orkeon Code from Teams (a bot) is `orkeon-host`'s channel, which Orkeon Code does not run.
