# EMMA OS personnel et site LIMAGECILS séparé

Le lien EMMA OS reste `https://emmacaulinech-lab.github.io/emma/`. LIMAGECILS utilise son site existant `https://emmacaulinech-lab.github.io/limagecils-facturation/`, avec Facturation Franchise, Facturation clientes et Formations. Les pages métier sont hébergées dans le dépôt LIMAGECILS ; aucune iframe EMMA n'y est utilisée.

## EMMA OS

`index.html` charge l'interface partagée (`app-shell.html`), les styles (`app.css`) et le code (`app-core.js`). L'extraction du gros fichier conserve la portée et l'ordre de ses déclarations via `app-loader.js`. Les dépendances du planning sur les helpers Formations restent chargées pour compatibilité, mais les interfaces et les iframes métiers ne sont plus montées. Les anciens appels `goModule` redirigent vers les pages du site LIMAGECILS. L'ancienne entrée locale `limagecils.html` redirige vers ce site.

La sauvegarde globale EMMA ne réécrit plus le document Formations. `formation-sync.js` conserve la validation des étapes depuis le Journal par une transaction ciblée sur la version courante. Le détail des élèves, les autres étapes et les autres modifications LIMAGECILS sont ainsi préservés.

## MA COMPTA

La société garde ses calculs et son historique. Le panneau Micro-entreprise en préparation enregistre uniquement une date envisagée, une périodicité, des activités et des notes dans `users/{uid}/modules/microPreparation`. Aucune activation, aucun taux présélectionné et aucun transfert d'encaissements. Le fonctionnement complet de la future micro reste à définir avec Emma.

## Validation et limites

`node tests/workspace-split.cjs`, `node tests/journal-storage.cjs` et `node tests/dated-recovery.cjs` passent. La suite de séparation vérifie la recomposition du script, le chargement, le DOM et l'isolation du brouillon. Les lecteurs des tests historiques sont adaptés avec `tests/read-app.cjs`.

Le dépôt LIMAGECILS a sa propre suite `tests/standalone.cjs`. La prévisualisation HTTP locale est bloquée par l'environnement ; les parcours authentifiés, les PDF et les suites nécessitant les dépendances externes restent à vérifier. Les modèles PDF et images de kits conservent leurs URL actuelles dans EMMA : ne pas les supprimer.

Publier les deux modifications de façon coordonnée et fermer les anciennes fenêtres EMMA avant utilisation de la nouvelle version pour éviter l'exécution de l'ancien code de sauvegarde encore présent en mémoire. Aucun changement des données de production n'a été fait pendant la préparation.

## Connexion explicite

EMMA ne traite plus une session Firebase restaurée comme une ouverture autorisée. La persistance est limitée à l’onglet et l’authentification précédente est effacée à l’ouverture. L’utilisateur valide ses identifiants à chaque ouverture/rechargement ; l’autoremplissage reste possible. Les données ne se chargent qu’après réussite du formulaire. Le départ de la page, le retour arrière et l’ouverture de LIMAGECILS dans un autre onglet masquent les vues et révoquent la validation en mémoire. Aucun indicateur permanent d’accès n’est stocké. `tests/explicit-login.cjs` couvre ces scénarios, ainsi que l’absence de sauvegarde de clé API après un échec.
