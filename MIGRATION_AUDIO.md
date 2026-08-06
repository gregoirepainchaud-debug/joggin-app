# Migration audio vers la structure modulaire

## À déplacer de `speech/` vers `speech/exercices/`

- pompes.mp3
- accroupissements.mp3
- extensions.mp3
- dorsales.mp3
- sol.mp3
- fentes.mp3
- arriere.mp3
- jambe.mp3
- repulsions.mp3
- chaises.mp3
- ponts.mp3
- fessiers.mp3
- planche.mp3

Les mots de liaison `au.mp3`, `par.mp3` et `entre.mp3` restent dans `speech/commun/`.

## Nouveaux fichiers à générer avec Chantal

Dans `speech/exercices/` :

- traction.mp3 — prononcer « traction »
- tractions.mp3 — prononcer « tractions »
- supination.mp3 — prononcer « supination »
- pronation.mp3 — prononcer « pronation »

Dans `speech/commun/` :

- en.mp3 — prononcer « en »

Les annonces seront :

- « quatre tractions en supination, circuit un de deux »
- « quatre tractions en pronation, circuit un de deux »
- « une traction en supination » lorsque le programme demande une seule répétition

## Migration graduelle

La version 11 essaie d’abord les nouveaux dossiers, puis l’ancien dossier `speech/`. Tu peux donc déplacer les fichiers progressivement sans casser immédiatement les annonces existantes.
