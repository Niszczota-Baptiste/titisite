import { useState } from 'react';
import { Button, Input } from '../components/admin/ui';
import { api } from '../api/client';

export function PlaylistOnboarding({ setup, busy, act }) {
  const [provider, setProvider] = useState('apple'), [code, setCode] = useState('');
  return <section className="pc-service pc-onboarding">
    <h2>{setup.canInitialize ? 'Activer votre playlist' : 'Rejoindre la playlist'}</h2>
    {setup.canInitialize ? <>
      <p>Choisis ton service, puis invite ton ami. Chacun configure et connecte son propre compte depuis sa session du site. Aucun réglage à faire sur le VPS.</p>
      <label htmlFor="pc-own-service">Mon service musical</label>
      <select id="pc-own-service" value={provider} onChange={e => setProvider(e.target.value)}><option value="apple">Apple Music</option><option value="spotify">Spotify Premium</option></select>
      <Button disabled={busy} onClick={() => act(() => api.playlist.setup(provider), 'Playlist activée. Ouvre Réglages pour connecter ton service et inviter ton ami.')}>Activer Playlist Commune</Button>
    </> : setup.joinAvailable ? <form onSubmit={e => { e.preventDefault(); void act(() => api.playlist.join(code.trim()), 'Tu as rejoint la playlist. Ouvre Réglages pour connecter ton service.'); }}>
      <p>Demande le code privé à l’autre membre. Tu rejoindras la seconde place avec ton compte habituel du site.</p>
      <label htmlFor="pc-invitation">Code d’invitation</label>
      <Input id="pc-invitation" required autoComplete="off" value={code} onChange={e => setCode(e.target.value)} maxLength={48} />
      <Button type="submit" disabled={busy || !code.trim()}>Rejoindre</Button>
    </form> : <p>Cette playlist est privée. Si elle n’est pas encore activée, un administrateur doit l’activer depuis son compte. Une fois les deux places occupées, aucun autre compte ne peut y accéder.</p>}
  </section>;
}

export function PlaylistInvitation({ busy, act }) {
  const [invitation, setInvitation] = useState(null);
  return <aside className="pc-service pc-invitation"><h3>Inviter ton ami</h3>
    <p>Il ouvre <strong>/playlist</strong> avec son propre compte du site et saisit ce code. Il gérera lui-même sa connexion musicale.</p>
    <Button variant="ghost" disabled={busy} onClick={() => act(async () => { setInvitation(await api.playlist.invite()); })}>{invitation ? 'Remplacer le code' : 'Créer un code privé'}</Button>
    {invitation && <><label htmlFor="pc-invite-code">Code à partager avec ton ami uniquement</label><Input id="pc-invite-code" readOnly value={invitation.code} onFocus={e => e.target.select()} /><p>Valable 24 heures et une seule fois. Créer un nouveau code invalide le précédent.</p></>}
  </aside>;
}

export function ServiceCredentials({ provider, configured, connected, callback, busy, act }) {
  const [clientId, setClientId] = useState(''), [teamId, setTeamId] = useState(''), [keyId, setKeyId] = useState('');
  const [privateKey, setPrivateKey] = useState(''), [fileError, setFileError] = useState('');
  const spotify = provider === 'spotify';
  async function readKey(e) {
    setPrivateKey(''); setFileError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12000 || !file.name.toLowerCase().endsWith('.p8')) { setFileError('Choisis le fichier MusicKit .p8 (12 Ko maximum).'); return; }
    try { setPrivateKey(await file.text()); } catch { setFileError('Impossible de lire ce fichier.'); }
  }
  return <details className="pc-credentials" open={!configured}>
    <summary>{configured ? 'Modifier mes clés et consulter le guide' : 'Configurer mon service — où trouver les clés ?'}</summary>
    {spotify ? <>
      <ol><li>Avec ton compte Spotify Premium, ouvre le <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Dashboard Spotify</a> et crée une application utilisant Web API.</li>
        <li>Dans ses réglages, ajoute exactement cette adresse de retour :</li></ol>
      <code className="pc-callback">{callback}</code>
      <p>Copie le <strong>Client ID</strong> de cette application ci-dessous. En mode développement, vérifie que ton compte figure dans les utilisateurs autorisés. Aucun Client Secret n’est demandé.</p>
      <a href="https://developer.spotify.com/documentation/web-api/concepts/apps" target="_blank" rel="noreferrer">Guide officiel Spotify</a>
    </> : <>
      <p>Une clé MusicKit est différente de ton abonnement Apple Music : sa création nécessite l’accès au programme Apple Developer.</p>
      <ol><li>Dans <a href="https://developer.apple.com/account/resources/identifiers/list" target="_blank" rel="noreferrer">Certificates, Identifiers &amp; Profiles</a>, crée un identifiant Media Services pour MusicKit.</li>
        <li>Dans Keys, crée une clé MusicKit associée à cet identifiant et télécharge le fichier <strong>.p8</strong>. Apple ne permet de le télécharger qu’une fois : conserve-le.</li>
        <li>Copie le <strong>Key ID</strong> affiché sur la fiche de la clé, puis ton <strong>Team ID</strong> depuis les informations d’adhésion de ton compte développeur.</li></ol>
      <a href="https://developer.apple.com/help/account/capabilities/create-a-media-identifier-and-private-key/" target="_blank" rel="noreferrer">Guide officiel Apple pour créer la clé MusicKit</a>
    </>}
    <form className="pc-credentials-form" onSubmit={e => { e.preventDefault(); void act(async () => {
      await api.playlist.settings(provider, spotify ? { clientId: clientId.trim() } : { teamId: teamId.trim(), keyId: keyId.trim(), privateKey });
      setPrivateKey(''); setClientId(''); setTeamId(''); setKeyId('');
      e.target.reset();
    }, 'Clés enregistrées. Tu peux maintenant connecter ton compte.'); }}>
      {spotify ? <label>Client ID Spotify<Input required value={clientId} onChange={e => setClientId(e.target.value)} autoComplete="off" maxLength={32} disabled={connected} /></label> : <>
        <label>Team ID Apple<Input required value={teamId} onChange={e => setTeamId(e.target.value)} autoComplete="off" maxLength={10} /></label>
        <label>Key ID MusicKit<Input required value={keyId} onChange={e => setKeyId(e.target.value)} autoComplete="off" maxLength={10} /></label>
        <label>Fichier privé MusicKit (.p8)<Input type="file" accept=".p8" onChange={readKey} required /></label>
      </>}
      {fileError && <p role="alert">{fileError}</p>}
      {spotify && connected && <p>Déconnecte Spotify ci-dessous avant de remplacer le Client ID.</p>}
      <Button type="submit" disabled={busy || (spotify ? connected || !clientId.trim() : !privateKey || !teamId || !keyId)}>Enregistrer mes clés</Button>
      <small>Les clés sont chiffrées sur le serveur et ne sont jamais affichées à l’autre membre. La clé de chiffrement du site est générée automatiquement.</small>
    </form>
  </details>;
}
