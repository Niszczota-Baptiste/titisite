const MESSAGES = {
  // Auth
  missing_token:      'Session expirée, veuillez vous reconnecter.',
  revoked_token:      'Session révoquée, veuillez vous reconnecter.',
  invalid_token:      'Session invalide, veuillez vous reconnecter.',
  not_authenticated:  'Vous devez être connecté pour effectuer cette action.',
  forbidden:          "Vous n'avez pas les droits pour cette action.",
  server_misconfigured: 'Erreur de configuration serveur.',

  // Rate limiting
  rate_limited:       'Trop de requêtes, veuillez patienter.',
  too_many_attempts:  'Trop de tentatives de connexion, réessayez dans une minute.',

  // Users
  email_taken:        'Cet email est déjà utilisé.',
  last_admin:         'Impossible : il doit rester au moins un administrateur.',
  cannot_delete_self: 'Impossible de supprimer votre propre compte.',
  invalid_role:       'Rôle invalide.',
  missing_fields:     'Email et mot de passe requis.',
  user_not_found:     'Utilisateur introuvable.',
  not_found:          'Ressource introuvable.',

  // Files / uploads
  file_too_large:     'Fichier trop volumineux.',
  mime_not_allowed:   'Type de fichier non autorisé.',
  extension_not_allowed: 'Extension de fichier non autorisée.',
  file_or_url_required: 'Un fichier ou une URL est requis.',
  invalid_external_url: 'URL externe invalide (doit commencer par http:// ou https://).',
  no_file:            'Aucun fichier associé à cette entrée.',
  file_missing:       'Fichier introuvable sur le serveur.',
  download_failed:    'Échec du téléchargement.',

  // Features / comments
  missing_title:      'Le titre est obligatoire.',
  missing_body:       'Le message ne peut pas être vide.',
  invalid_target_type:'Type de cible invalide.',
  missing_version:    'La version est obligatoire.',

  // Generic
  network_error:      'Erreur réseau — vérifiez votre connexion.',
  aborted:            'Requête annulée.',
  internal_error:     'Erreur interne du serveur.',
  csrf_invalid:       'Erreur de sécurité, veuillez recharger la page.',
};

export function humanizeError(err) {
  const key = err?.body?.error || err?.message;
  return MESSAGES[key] ?? err?.message ?? 'Une erreur inattendue est survenue.';
}
