# Sauvegarde du journal sans supprimer l’historique

Avant mise en service : dans la console de l’onglet EMMA déjà ouvert, exécuter `exporterSauvegardeEmma()` et conserver le fichier JSON téléchargé. Cela capture DB, y compris les changements en mémoire non encore sauvegardés. Ne pas publier ce fichier privé dans GitHub. Ne pas recharger cet onglet avant cet export.

Le nouveau chargement lit journal_v2 si présent, sinon le journal historique. Toutes les données du journal, y compris historique, faitAujourdhui, planning, zones et recoveryLots, sont conservées sans filtrage. La sauvegarde écrit des fragments immuables dans modules/journal_v2_<version>_<index>, puis publie l’index modules/journal_v2 dans une transaction après confirmation de toutes les écritures. Le document historique modules/journal reste intact. Les générations précédentes restent présentes ; aucune purge n’est ajoutée.

Un chargement incomplet, un fragment altéré ou un conflit de version bloque la sauvegarde. Les échecs ne sont pas transformés en journal vide. Les fonctions de vérification des réalisations et de rattrapage daté lisent et écrivent via ce même stockage.

Limites : tests réalisés sur un stockage simulé, pas sur les données personnelles ni les règles Firestore déployées. Les règles doivent autoriser ces documents modules pour le propriétaire, comme les autres modules, sans ouvrir l’accès public. Si elles les refusent, la migration échoue sans changer l’ancienne copie. Une ancienne fenêtre EMMA ne comprend pas journal_v2 : exporter les modifications de toutes les fenêtres avant déploiement, puis utiliser uniquement la nouvelle version. Ne pas revenir simplement à l’ancien code après de nouvelles sauvegardes : la copie historique est conservée mais devient ancienne. Chaque sauvegarde conserve une génération supplémentaire ; prévoir ultérieurement une politique de rétention explicite après vérification des sauvegardes.

Validation : `node --test tests/journal-storage.cjs` et `node tests/dated-recovery.cjs`. Les tests vérifient un journal de plus de 1 Mo, les coches conservées, les interruptions, les fragments absents ou altérés et les conflits entre fenêtres.
