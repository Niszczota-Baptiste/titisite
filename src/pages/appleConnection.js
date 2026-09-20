export async function withDeadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message), { needsReload: true })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function authorizeApple({ music, save, isActive = () => true, progress = () => {}, timeoutMs = 120000 }) {
  progress('Connexion Apple : termine la validation dans la fenêtre Apple…');
  let token;
  try {
    // Keep authorize() within the click gesture; do not await a network test first.
    token = await withDeadline(music.authorize(), timeoutMs,
      'Apple n’a pas terminé l’autorisation après deux minutes. Ferme la fenêtre Apple puis recharge cette page avant de réessayer.');
  } catch (error) {
    if (error?.needsReload) throw error;
    // MusicKit errors can contain sensitive internals. Do not display their raw message.
    throw new Error('L’autorisation du compte n’a pas abouti dans MusicKit. Lance « Tester la configuration Apple » : si le catalogue est accessible, vérifie que ce compte peut écouter sur music.apple.com, puis réessaie en autorisant la fenêtre Apple.');
  }
  if (!isActive()) throw new Error('Connexion interrompue : la page ou la session a changé.');
  if (typeof token !== 'string' || token.length < 20 || token.length > 12000) throw new Error('Apple n’a pas transmis d’autorisation utilisable. Teste la configuration puis réessaie.');
  progress('Autorisation reçue. Validation du compte sur le serveur…');
  // A late SDK result after timeout never reaches this save.
  await save(token);
  if (isActive()) progress('Compte Apple Music validé et connecté.');
}
