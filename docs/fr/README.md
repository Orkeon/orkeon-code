# Documentation

La documentation d'Orkeon Code, publiée en site consultable à <https://orkeon.github.io/orkeon-code/>.
Commencez par [Premiers pas](getting-started.md) ; le [README](../../README.fr.md) fait la visite. Les mêmes
pages existent [en anglais](../README.md).

## Utiliser

| | |
|---|---|
| [Premiers pas](getting-started.md) | Modes docker, tool et source, première session |
| [Tutoriel WSL](wsl-tutorial.md) | La voix et un modèle local sous WSL2, sur le GPU, pas à pas |
| [Permissions](permissions.md) | Modes, règles, ce que l'agent peut toucher |
| [Hooks](hooks.md) | Vos commandes autour des appels d'outils du modèle dans les étapes dev |
| [Mémoire partagée](shared-memory.md) | Décisions, structures, méthodes et erreurs admises que les agents rappellent |
| [Voix](speech.md) | Transcrire un fichier, dicter une requête, lire une réponse à voix haute |
| [Modèles de décision](decision-models.md) | Ce qu'Orkeon Code demande à un modèle de décision : élaguer un long tour, router un crew, suggérer des skills, avec ce qui a été mesuré |
| [Modèles de décision en local](decision-models-local.md) | Kev sur cette machine et Liquid, pas à pas, avec des profils de décision à essayer |
| [Exécutions autonomes et embarquées](headless.md) | Tours sans opérateur, lancement en un coup, planificateurs et CI, votre application |

## Référence

| | |
|---|---|
| [Configuration](configuration.md) | Fournisseurs LLM, fichier de settings, variables d'environnement |
| [Commandes](commands.md) | La liste complète (générée) |
| [Référence des permissions](permissions-reference.md) | L'ordre des contrôles, ce que lit une règle, chaque règle des jeux des étapes dev |

## Étendre et contribuer

| | |
|---|---|
| [Étendre](extending.md) | Commandes, crews, outils, prompts, modes, vos propres dossiers, les limites |
| [Architecture](architecture.md) | Couches, ports, points d'entrée, le VFS, les crews |
| [Le déroulement d'un tour](turn.md) | La boucle, l'assemblage du prompt, le routage, la suggestion de skills, la compaction |
| [Les prompts des crews](crew-prompts.md) | Le comportement d'après lequel le prompt de chaque crew est écrit |
| [Recettes](recipes.md) | Ajouter une commande, un crew, un outil, un mode, un bloc de prompt, une clé de configuration, un port |
| [Développement](development.md) | Tests, vérifications, typings, montée de version d'Orkeon, release |
| [Feuille de route](roadmap.md) | Ce qui manque et ce qui vient |

## Décisions

Les décisions sont consignées en ADR, en anglais. L'[index des décisions](../adr/README.md) les présente en deux
groupes : les décisions de conception, et les déplacements de l'épingle, dont chacun dit ce qu'un runtime Orkeon
plus récent change pour Orkeon Code.
