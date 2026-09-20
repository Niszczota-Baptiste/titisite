// Only these controlled messages leave the server; never forward SDK/API bodies or keys.
export function appleDiagnosticError(error, stage) {
  let message;
  if (error.reason === 'configuration_missing') message = 'Renseigne le Team ID, le Key ID et le fichier .p8 dans les réglages Apple.';
  else if (error.status === 429) message = 'Apple limite les requêtes. Attends avant de relancer le test ou la connexion.';
  else if (error.reason === 'network_error') message = 'Le serveur du site ne parvient pas à joindre Apple. Réessaie plus tard.';
  else if (stage === 'apple_catalog' && error.status === 401) message = 'Apple refuse la clé pour le catalogue (401). Vérifie le Team ID, le Key ID et le fichier .p8 correspondant, ainsi que leur validité.';
  else if (stage === 'apple_catalog' && error.status === 403) message = 'Apple refuse l’accès au catalogue (403). Vérifie que la clé Media Services est liée au Media ID avec MusicKit activé.';
  else if (stage === 'apple_account') message = 'L’autorisation du navigateur a été reçue, mais le serveur n’a pas pu valider l’accès au compte Apple ou à sa playlist liée. La connexion précédente est conservée. Relance le test de configuration puis reconnecte le compte.';
  else if (stage === 'apple_configuration') message = 'Impossible de préparer la clé Apple. Vérifie le Team ID, le Key ID et le fichier .p8 dans tes réglages.';
  else message = 'Le test du catalogue Apple n’a pas abouti. Réessaie plus tard.';
  return { error: message, stage, ...(Number.isInteger(error.status) ? { serviceStatus: error.status } : {}) };
}
