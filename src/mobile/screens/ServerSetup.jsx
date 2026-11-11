import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../ui/ConfirmProvider';
import { Btn } from '../../components/author/ui';
import { useEnv } from '../env';
import { FormField } from '../ui';
import { probeServer, setServer } from '../platform/config.js';

// Relier l'application à un site. L'adresse est saisie ici — jamais déduite.
// Elle est vérifiée (GET /api/health, sans identifiant) AVANT de basculer :
// changer d'adresse relance la coquille sous la nouvelle origine.

export function ServerSetup() {
  const { config, linked } = useEnv();
  const confirm = useConfirm();
  const [url, setUrl] = useState(config.serverUrl || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (!config.native) {
    return (
      <div className="am-screen am-narrow">
        <header className="am-head"><Link to="/" className="au-btn is-ghost is-small" aria-label="Retour">←</Link><h1>Site relié</h1></header>
        <p className="au-muted am-lead">Dans un navigateur, l&apos;atelier est relié au site qui le sert : <strong>{config.serverUrl}</strong>.</p>
      </div>
    );
  }

  const check = async (e) => {
    e?.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    setResult(null);
    try { setResult(await probeServer(url.trim())); }
    catch (err) { setResult({ ok: false, message: String(err.message || err) }); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (linked && result.url !== config.serverUrl) {
      const ok = await confirm({
        title: 'Changer de site ?',
        message: 'Ce qui n\'a pas encore été envoyé à l\'ancien site reste gardé sur l\'appareil, rattaché à ce site : tu le retrouveras en y revenant. Tes captures locales, elles, te suivent.',
        confirmLabel: 'Changer',
      });
      if (!ok) return;
    }
    setBusy(true);
    try { await setServer(result.url); }
    catch (err) { setResult({ ok: false, message: String(err.message || err) }); setBusy(false); }
  };

  const unlink = async () => {
    const ok = await confirm({
      title: 'Ne plus relier de site ?',
      message: 'L\'application reviendra à l\'atelier local (capture et enregistrement). Rien n\'est effacé sur l\'appareil.',
      confirmLabel: 'Délier',
    });
    if (ok) { setBusy(true); try { await setServer(''); } catch { setBusy(false); } }
  };

  return (
    <div className="am-screen am-narrow">
      <header className="am-head"><Link to="/" className="au-btn is-ghost is-small" aria-label="Retour">←</Link><h1>{linked ? 'Site relié' : 'Relier mon site'}</h1></header>
      <p className="au-muted am-lead">
        Indique l&apos;adresse de ton site pour retrouver ici les mêmes projets que dans l&apos;atelier web.
        {config.allowCleartext ? ' (Version de développement : http:// accepté.)' : ' Connexion chiffrée (https) uniquement.'}
      </p>
      <form className="am-form" onSubmit={check}>
        <FormField label="Adresse du site">
          <input className="au-input" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="https://mon-site.fr" value={url} onChange={(e) => { setUrl(e.target.value); setResult(null); }} />
        </FormField>
        <Btn type="submit" disabled={busy || !url.trim()} style={{ width: '100%' }}>{busy && !result ? 'Vérification…' : 'Vérifier l\'adresse'}</Btn>
      </form>
      {result && !result.ok && <div className="au-error" role="alert">{result.message || 'Adresse refusée.'}</div>}
      {result?.ok && (
        <div className="au-card am-ok" role="status">
          <div className="au-card-title">✓ Le site répond</div>
          <p className="au-muted" style={{ margin: '0 0 10px' }}>{result.url}</p>
          {result.url === config.serverUrl && linked
            ? <p className="au-faint" style={{ margin: 0 }}>C&apos;est déjà le site relié.</p>
            : <Btn variant="primary" onClick={apply} disabled={busy} style={{ width: '100%' }}>Utiliser ce site</Btn>}
        </div>
      )}
      {linked && <Btn variant="ghost" size="small" onClick={unlink} disabled={busy}>Ne plus relier de site</Btn>}
    </div>
  );
}
