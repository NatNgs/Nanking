/**
 * Point d'entrée unique pour les migrations de base de données. Appelée au
 * lancement du serveur, avant l'ouverture de la connexion SQLite (voir
 * server.js) : chaque migration nécessaire doit s'exécuter sur le fichier
 * brut avant que sqliteDb.js n'applique son schéma courant.
 *
 * Actuellement sans effet : aucune migration n'est requise depuis la base
 * SQLite à jour. Quand une migration deviendra nécessaire (changement de
 * schéma sur une base existante), l'ajouter ici et l'appeler depuis cette
 * fonction, dans l'ordre chronologique des versions de schéma.
 */
function tryToMigrate() {
}

export { tryToMigrate }
