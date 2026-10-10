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

## GLOW 2.0

La suite compte désormais 63 scénarios. Les nouveaux contrôles couvrent les quantités réellement préparées et les portions consommées, le refus des analyses invalides, les quantités d’huile, les durées textuelles sans NaN, les intervalles Sport de 10/15/20/30 minutes et le matériel autorisé. Le cas burger/frites, veau aux olives, pancakes et Jambes 10 min + Posture 20 min utilise des valeurs nutritionnelles simulées : bilan de 30 minutes, recommandation Fessiers le lendemain en forme, Posture si courbaturée. Ces valeurs ne sont pas une mesure de la journée réelle.

Parcours GLOW 2 vérifiés dans la preview isolée sur mobile et desktop : Nutrition, plaisir du soir avec ajout d’ingrédient, analyse, sauvegarde puis actualisation, Sport, objectif Haut du corps et cartes illustrées avec remplacement. Firebase et IA restent simulés ; aucune donnée personnelle de production n’est modifiée par cette validation.

## Planning automatique

Le Journal s’organise à l’ouverture, à la reprise de l’application et pendant son utilisation. Le sport est réservé avant les tâches, avec une ou deux zones selon l’historique et 10 minutes si le matin est serré. Les mails peuvent se placer le matin ; les autres tâches Formation occupent les trous de travail. La maison reste hors de la plage des clientes et des trajets. Les soins dus se placent le soir. Les rendez-vous, réalisations et déplacements manuels sont protégés. Les tâches restantes sont visibles et conservent leurs informations dans la réserve.

73 scénarios automatisés passent : contraintes horaires, priorité sport, durée courte, idempotence, retards, conservation des tâches en réserve, refus du jour, attentes Formation, blocage avant chargement et reprise d’une sauvegarde non confirmée. Les anciens conflits avec les rappels repas ne déplacent plus les rendez-vous, même sans verrou explicite.

Preview avec clientes et Formation fictives : `QA_AUTO=1 PORT=8768 npm --prefix tests run preview`. Vérification mobile (390 px) et desktop, rechargement et séance GLOW combinée. Les rendez-vous fictifs restent à 09:00–10:00 et 11:00–18:00 après sauvegarde. Firebase est simulé ; les données personnelles de production n’ont pas été modifiées pendant les tests.

## Jauges Sport et retards

79 scénarios automatisés passent. Les cinq jauges et les recommandations partagent la semaine du lundi au dimanche ; la récupération conserve les séances des jours précédents, même avant le lundi. Les séances combinées sont ventilées par zone, les copies d'une même réalisation sont dédupliquées. La rotation garde un mouvement repère et privilégie les autres mouvements les moins récemment réalisés, avec ordre stable au rafraîchissement.

Les tâches automatiques remplissent les créneaux compatibles sans les anciens plafonds en minutes. Les copies en retard passent avant les tâches du jour de la même famille ; sport, rendez-vous, horaires travail/maison, soins du soir et pauses de cinq minutes restent respectés.

Preview : `QA_AUTO=1 QA_SPORT=1 PORT=8775 npm --prefix tests run preview`. Le cas fictif Jambes 10 min + Posture 20 min affiche respectivement 10/20 et 20/40 min, et une seule séance de 30 minutes. Les cinq jauges et l'historique ont été contrôlés à 1280 et 390 px, sans débordement horizontal. Aucun compte Firebase réel n'est utilisé.

## Certificat de réalisation et repas des 7 derniers jours

82 scénarios passent. Le certificat est proposé pour toutes les formations configurées, à partir de la date de fin. Son formulaire reprend le nom, les dates, les heures et l'intitulé ; les compétences et la mention de certification sont modifiables avant téléchargement. Le modèle dérivé du PDF fourni conserve le logo, les mentions fixes, le pied de page et la signature ; les anciennes croix et le texte propre à une formation sont supprimés du contenu PDF. Les sorties Débutante CPF et Browlift ont été rendues et inspectées. Le générateur refuse les dates incohérentes, durées invalides et textes trop longs. Le mail de fin propose le PDF personnalisé, sans règle de kit et sans marquer l'envoi automatiquement.

Nutrition propose aujourd'hui et les six jours précédents, y compris le dimanche précédent un lundi. Les repas passés sont sauvegardés dans la journée Nutrition de l'historique GLOW ; les autres champs d'archive, séances Sport et données du jour restent conservés. L'ajout et la correction partagent les contrôles de portions/ingrédients et l'analyse existante. Les sauvegardes non confirmées restent réessayables. L'historique plus ancien reste consultable.

Preview isolée : `QA_AUTO=1 PORT=8781 npm --prefix tests run preview`. Saisie puis correction d'un pancake pour hier, rechargement avec récupération des 60 g de farine, formulaire certificat et téléchargement avec progression du suivi, mail de fin et pièce jointe proposée. Vérification mobile/desktop. Le SDK PDF-Lib local est servi uniquement dans cette preview ; Firebase et l'analyse IA sont simulés.

## Correction des quantités lors d'un changement de repas

85 tests passent. Une assiette déjà mangée peut être renseignée directement avec ses ingrédients préremplis, sans génération obligatoire d'une recette IA. Le cas poisson blanc/haricots verts/pommes de terre vérifie ce parcours. Les anciens formats « 1 portion », « 200 g », nombres à virgule et fractions sont séparés en valeur numérique/unité ; les quantités inconnues restent à compléter. Lorsqu'une archive contient uniquement les quantités mangées, la préparation est reconstituée selon le ratio de portions, sans changer l'archive à l'ouverture. Les erreurs désignent la ligne concernée et le champ manquant. Les recettes générées utilisent la même normalisation et gardent le contrôle de l'huile.
