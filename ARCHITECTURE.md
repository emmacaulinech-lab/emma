# EMMA OS et LIMAGECILS

Deux entrées sur la même origine : `index.html` pour EMMA OS et `limagecils.html` pour les formations et les deux facturations. Les anciens appels `goModule('formations')`, `goModule('facturation')` et `goModule('facturation-perso')` redirigent depuis EMMA vers la bonne page LIMAGECILS. Les liens profonds attendent le chargement authentifié.

## Fichiers

- `app.css` : styles extraits.
- `app-shell.html` : interface partagée et éléments historiques nécessaires à l'initialisation.
- `app-core.js` : logique commune et personnelle, sans le bloc principal des formations.
- `modules/limagecils-formations.js` : logique formations, élèves, kits, documents et mails.
- `modules/limagecils.html` : interfaces formations et deux facturations.
- `workspace-navigation.js` : navigation des deux espaces.
- `micro-preparation.js` : brouillon indépendant de préparation micro.
- `app-loader.js` : charge les ressources puis reconstitue le script historique avant son exécution. Cette étape conserve exactement ses déclarations, leur portée et leur ordre. Les correctifs existants s'exécutent ensuite dans leur ordre initial.

Cette première séparation ne rend pas les applications indépendantes : elles partagent encore l'authentification, la sauvegarde, l'initialisation et les dépendances formations du planning. Le code commun et celui des formations sont chargés dans les deux espaces pour préserver ces dépendances. Pas de duplication du gros script et pas de migration de données. Un découplage complet nécessiterait d'isoler ensuite ces services et de valider les scénarios authentifiés.

## Préparation micro

La société reste active, sans modification des calculs, de la TVA ou des écritures historiques. Le panneau ajouté à MA COMPTA prépare la date envisagée, la périodicité, les activités et des notes. Il ne peut pas activer la micro ni importer des encaissements.

Le brouillon est enregistré uniquement dans `users/{uid}/modules/microPreparation`, champ `preparation`, avec `statut: preparation`. Il ne passe pas par `saveAll` et n'écrit pas dans `comptabilite`, `formations` ou les sauvegardes historiques. Aucun taux social, fiscal ou régime de TVA n'est fixé. Vérifier les droits Firestore pour ce document lors du parcours authentifié ; un refus laisse le formulaire réessayable.

La future comptabilité micro devra avoir son propre stockage d'encaissements, dépenses et déclarations ; les règles de calcul et la date de bascule restent à définir avec Emma. Conserver les exports de la société et son historique consultable.

## Validation

`node tests/workspace-split.cjs` vérifie l'identité SHA-256 du script historique reconstitué, la syntaxe, les deux entrées, les identifiants principaux du DOM, l'ordre du chargeur, l'échec réseau avant exécution et l'isolation du brouillon micro. `tests/read-app.cjs` fournit aux tests historiques une vue HTML recomposée pour conserver leurs extractions de fonctions.

Contrôles exécutés : suite de séparation, sept tests de sauvegarde Journal et récupération datée. Les suites qui dépendent d'acorn, jsdom et pdf-lib n'ont pas été exécutées dans l'environnement de modification, où ces dépendances ne sont pas disponibles. La prévisualisation HTTP locale est bloquée par les permissions de l'environnement.

Avant mise en production : tester sur session authentifiée les deux pages, l'aller-retour EMMA/LIMAGECILS, les liens profonds, les élèves et documents, les deux iframes, le brouillon micro (sauvegarde puis rechargement), l'accès société inchangé et la déconnexion. Déployer tous les nouveaux fichiers ensemble. Les URL des deux outils de facturation restent inchangées.
