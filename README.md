# Mon entraînement — V.13

Cette version reste entièrement hébergée sur GitHub Pages, sans serveur ni base de données distante.

## Changements importants

- **Passage à minuit corrigé** : une séance active garde sa `programDate` et son identifiant jusqu’à sa fin.
- **Reprise après fermeture ou rechargement** : les chronos sont recalculés à partir d’horodatages absolus.
- **Cardio robuste** : la phase et le cycle en cours sont retrouvés à partir de l’heure de départ, même si JavaScript a été suspendu.
- **Audio iOS** : l’`AudioContext` est déverrouillé immédiatement par le clic sur Débuter, avant le préchargement des MP3.
- **Reprise audio** : après une fermeture ou une suspension iOS, un bouton permet de réactiver l’audio et d’annoncer la phase courante.
- **IndexedDB** : stockage principal structuré, avec copie de secours dans `localStorage` et migration automatique des anciennes données.
- **Service worker** : interface, données, images et fichiers audio déjà entendus sont disponibles hors ligne.
- **Import GP1 / export GX1** : conservés; l’export contient aussi la séance active et la version 13.
- **Version affichée** : `V.13` apparaît discrètement en bas à droite.
- **Structure modulaire** : `js/`, `storage/`, `data/`, `images/` et `speech/` restent séparés.

## Fichiers à conserver sur GitHub

Le ZIP ne contient toujours pas tes enregistrements. Conserve :

- `speech/commun/`
- `speech/exercices/`
- `cloche.wav` ou `speech/commun/cloche.wav`
- `IconeCoureur.png` si tu veux ton pictogramme historique; un SVG de secours est inclus.

## Limite importante

GitHub Pages n’a pas de serveur. Les horodatages utilisent donc l’horloge de l’iPhone. La séance résiste à minuit et aux fermetures, mais une modification manuelle importante de l’heure du téléphone peut affecter le calcul.
