# Validation Nutrition V2

```sh
npm --prefix tests ci
npm --prefix tests test
npm --prefix tests run preview
```

La suite comprend 35 scénarios avec Firestore et les réponses IA simulés. Elle parse le JavaScript du fichier HTML réel, puis teste ses fonctions existantes et nouvelles. Les erreurs attendues (réseau, document invalide, exclusions) sont contrôlées par des assertions.

La preview sur `http://127.0.0.1:8765` exécute le fichier HTML complet avec une configuration de test ajoutée uniquement à la réponse du serveur local. Les SDK Firebase sont remplacés et la politique de sécurité bloque les connexions externes. Elle utilise des données fictives du 5 octobre 2026 et des réponses IA fixes. Aucune authentification réelle n'est nécessaire.

Scénarios visuels vérifiés dans le navigateur : bibliothèque et recherche, ajout manuel, analyse d'un plat et correction de sa fiche, recette enregistrée et adaptation pour les restes, changement vers un préparé, actualisation des courses, provenance des achats, choix du Journal, refresh, dashboard et raccourcis. Affichage contrôlé sur desktop et mobile.

Les tests simulés ne prouvent ni la qualité des réponses du modèle réel, ni les permissions ou la persistance du compte Firebase de production. Avant fusion/déploiement, vérifier sur une session authentifiée : export de sécurité, lecture des documents existants, modification Nutrition, confirmation de sauvegarde et refresh. Contrôler les tailles réelles et les journaux d'écriture. Les autres modules doivent également faire l'objet d'un parcours utilisateur sur les données réelles.
