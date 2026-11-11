import { createContext, useContext } from 'react';

// Environnement de l'application : configuration (site relié, natif ou non),
// thème, et session.
//
// `session.status` :
//   'local'     aucun site relié — capture et enregistrement sur l'appareil ;
//   'loading'   vérification de la session en cours ;
//   'signedOut' site relié, personne de connecté (ou session expirée) ;
//   'denied'    connecté, mais ce compte n'a pas accès à l'atelier ;
//   'ready'     connecté, atelier ouvert.

export const EnvCtx = createContext(null);

export function useEnv() {
  const ctx = useContext(EnvCtx);
  if (!ctx) throw new Error('useEnv doit être utilisé dans <MobileRoot>');
  return ctx;
}

// Clé du compte pour ce qui est gardé sur l'appareil : le même identifiant sur
// deux sites différents ne désigne pas la même personne.
export function ownerKey(config, user) {
  return user?.id && config?.serverUrl ? `${config.serverUrl}|${user.id}` : null;
}
