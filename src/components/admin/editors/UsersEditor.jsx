import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { ACC, ACC_RGB, Button, Field, Input } from '../ui';

const ROLES = [['member', 'Membre'], ['admin', 'Admin']];

export function UsersEditor() {
  const { user: currentUser } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // user object or 'new'
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setUsers(await api.users()); setErr(null); }
    catch (e) { setErr(humanize(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (u) => {
    if (u.id === currentUser?.id) return;
    const ok = await confirm({
      title: 'Supprimer ce compte',
      message: `${u.email} sera supprimé définitivement et ne pourra plus se connecter.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteUser(u.id); await load(); }
    catch (e) { setErr(humanize(e)); }
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>
          Utilisateurs
        </h2>
        <Button onClick={() => setEditing('new')} disabled={editing !== null}>+ Ajouter</Button>
      </div>

      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
          fontFamily: "'Inter',sans-serif", fontSize: 13,
        }}>
          {err}
        </div>
      )}

      <SelfPasswordPanel />

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editing === 'new' && (
            <UserForm
              onSaved={() => { setEditing(null); load(); }}
              onCancel={() => setEditing(null)}
            />
          )}
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div key={u.id}>
                {editing?.id === u.id ? (
                  <UserForm
                    user={u}
                    currentUser={currentUser}
                    onSaved={() => { setEditing(null); load(); }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div style={{
                    background: 'rgba(14,9,28,0.72)',
                    border: `1px solid ${isSelf ? `rgba(${ACC_RGB},0.35)` : 'rgba(80,50,130,0.24)'}`,
                    borderRadius: 12, padding: 16,
                    display: 'flex', gap: 14, alignItems: 'center',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: u.role === 'admin' ? `rgba(${ACC_RGB},0.14)` : 'rgba(80,50,130,0.18)',
                      border: `1px solid ${u.role === 'admin' ? ACC : 'rgba(80,50,130,0.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: u.role === 'admin' ? ACC : 'rgba(180,170,200,0.75)',
                      fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14,
                      flexShrink: 0,
                    }}>
                      {(u.name || u.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{
                          fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600,
                          color: '#ede8f8',
                        }}>
                          {u.name || u.email}
                        </span>
                        {isSelf && (
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 3,
                            background: `rgba(${ACC_RGB},0.12)`, color: ACC,
                            letterSpacing: '0.5px', fontWeight: 600,
                          }}>Vous</span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: "'Inter',sans-serif", fontSize: 12,
                        color: 'rgba(180,170,200,0.6)', marginTop: 2,
                      }}>
                        {u.email}
                        <span style={{
                          fontSize: 10, marginLeft: 10, padding: '1px 6px', borderRadius: 3,
                          background: u.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
                          color: u.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
                          textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600,
                        }}>
                          {u.role}
                        </span>
                        {u.role !== 'admin' && u.can_view_stairs === 1 && (
                          <span
                            title="Accès à la section Escaliers"
                            style={{
                              fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 3,
                              background: 'rgba(123,227,168,0.12)', color: '#7be3a8',
                              letterSpacing: '0.5px', fontWeight: 600,
                            }}
                          >
                            🪜 ESCALIERS
                          </span>
                        )}
                        {u.role !== 'admin' && (u.can_view_quests === 1 || u.can_edit_quests === 1) && (
                          <span
                            title={u.can_edit_quests === 1 ? 'Éditeur des quêtes' : 'Lecture des quêtes'}
                            style={{
                              fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 3,
                              background: 'rgba(232,200,106,0.12)', color: '#e8c86a',
                              letterSpacing: '0.5px', fontWeight: 600,
                            }}
                          >
                            📜 QUÊTES{u.can_edit_quests === 1 ? '+' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" onClick={() => setEditing(u)}>Éditer</Button>
                      <Button variant="danger" onClick={() => remove(u)} disabled={isSelf}>
                        Supprimer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserForm({ user, currentUser, onSaved, onCancel }) {
  const isEdit = !!user;
  const isSelf = isEdit && user.id === currentUser?.id;
  // The admin route refuses to change another admin's password, and self
  // password changes go through /me/password — so the password field is only
  // useful when an admin resets a *member*'s credentials.
  const canResetPassword = isEdit ? (!isSelf && user.role !== 'admin') : true;
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState(user?.name || '');
  const [role, setRole] = useState(user?.role || 'member');
  const [password, setPassword] = useState('');
  const [canViewStairs, setCanViewStairs] = useState(user?.can_view_stairs === 1);
  const [canViewQuests, setCanViewQuests] = useState(user?.can_view_quests === 1);
  const [canEditQuests, setCanEditQuests] = useState(user?.can_edit_quests === 1);
  const [canViewVault, setCanViewVault] = useState(user?.can_view_vault === 1);
  const [canViewLore, setCanViewLore] = useState(user?.can_view_lore === 1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Admins always have access to /stairs regardless of the column, so the
  // checkbox is hidden for admin accounts to avoid implying it does anything.
  const showStairsToggle = role !== 'admin';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      if (isEdit) {
        const payload = { name, role, canViewStairs, canViewQuests, canEditQuests, canViewVault, canViewLore };
        if (password && canResetPassword) payload.password = password;
        await api.updateUser(user.id, payload);
      } else {
        if (!email || !password) { setErr('Email et mot de passe requis'); setSaving(false); return; }
        await api.createUser({ email, name, role, password, canViewStairs, canViewQuests, canEditQuests, canViewVault, canViewLore });
      }
      onSaved();
    } catch (ex) {
      setErr(humanize(ex));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        background: 'rgba(14,9,28,0.72)',
        border: `1px solid rgba(${ACC_RGB},0.4)`,
        borderRadius: 12, padding: 18,
      }}
    >
      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#ff8a9b',
          fontSize: 12, fontFamily: "'Inter',sans-serif",
        }}>
          {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 10 }}>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            required
          />
        </Field>
        <Field label="Nom">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
        <Field label="Rôle">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              width: '100%', background: 'rgba(14,8,32,0.72)',
              border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
              padding: '10px 12px', color: '#ede8f8',
              fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
            }}
          >
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {canResetPassword ? (
          <Field label={isEdit ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={isEdit ? 'Laisser vide pour ne pas changer' : undefined}
              required={!isEdit}
            />
          </Field>
        ) : (
          <Field label="Mot de passe">
            <div style={{
              fontFamily: "'Inter',sans-serif", fontSize: 12,
              color: 'rgba(180,170,200,0.7)', padding: '10px 0',
            }}>
              {isSelf
                ? 'Utilise le panneau « Mon mot de passe » plus haut.'
                : 'La réinitialisation d’un autre admin n’est pas autorisée.'}
            </div>
          </Field>
        )}
      </div>

      {showStairsToggle && (
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 14,
          cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13,
          color: '#ede8f8',
        }}>
          <input
            type="checkbox"
            checked={canViewStairs}
            onChange={(e) => setCanViewStairs(e.target.checked)}
            style={{ accentColor: ACC, width: 16, height: 16 }}
          />
          <span>
            Accès à la section <strong>🪜 Escaliers</strong>
            <span style={{ color: 'rgba(180,170,200,0.55)', fontSize: 11, marginLeft: 6 }}>
              (lecture + ajout/édition/suppression)
            </span>
          </span>
        </label>
      )}

      {showStairsToggle && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <label style={questToggle}>
            <input
              type="checkbox"
              checked={canViewQuests || canEditQuests}
              onChange={(e) => setCanViewQuests(e.target.checked)}
              disabled={canEditQuests}
              style={{ accentColor: ACC, width: 16, height: 16 }}
            />
            <span>Accès au <strong>📜 Journal de quêtes</strong> (lecture)</span>
          </label>
          <label style={questToggle}>
            <input
              type="checkbox"
              checked={canEditQuests}
              onChange={(e) => { setCanEditQuests(e.target.checked); if (e.target.checked) setCanViewQuests(true); }}
              style={{ accentColor: ACC, width: 16, height: 16 }}
            />
            <span>Peut <strong>éditer</strong> les quêtes/factions/chaînes
              <span style={{ color: 'rgba(180,170,200,0.55)', fontSize: 11, marginLeft: 6 }}>(implique la lecture)</span>
            </span>
          </label>
          <label style={questToggle}>
            <input
              type="checkbox"
              checked={canViewVault}
              onChange={(e) => setCanViewVault(e.target.checked)}
              style={{ accentColor: ACC, width: 16, height: 16 }}
            />
            <span>Accès à l'atelier <strong>🗝️ Salle des coffres</strong>
              <span style={{ color: 'rgba(180,170,200,0.55)', fontSize: 11, marginLeft: 6 }}>
                (ses plans + ceux partagés avec lui)
              </span>
            </span>
          </label>
          <label style={questToggle}>
            <input
              type="checkbox"
              checked={canViewLore}
              onChange={(e) => setCanViewLore(e.target.checked)}
              style={{ accentColor: ACC, width: 16, height: 16 }}
            />
            <span>Accès au <strong>🔍 Lore Nostra</strong>
              <span style={{ color: 'rgba(180,170,200,0.55)', fontSize: 11, marginLeft: 6 }}>
                (enquête collaborative — lecture et écriture)
              </span>
            </span>
          </label>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : (isEdit ? 'Mettre à jour' : 'Créer')}</Button>
      </div>
    </form>
  );
}

const questToggle = {
  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
  fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#ede8f8',
};

function SelfPasswordPanel() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  const reset = () => {
    setCurrent(''); setNext(''); setConfirmPwd(''); setErr(null); setOk(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setOk(false);
    if (next !== confirmPwd) { setErr('La confirmation ne correspond pas.'); return; }
    setSaving(true);
    try {
      await api.changeMyPassword(current, next);
      setOk(true);
      setCurrent(''); setNext(''); setConfirmPwd('');
    } catch (ex) {
      setErr(humanize(ex));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(14,9,28,0.55)',
      border: `1px solid rgba(${ACC_RGB},0.25)`,
      borderRadius: 12, padding: 14, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
            color: '#ede8f8',
          }}>
            Mon mot de passe
          </div>
          <div style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12,
            color: 'rgba(180,170,200,0.6)', marginTop: 2,
          }}>
            Le seul moyen de modifier ton propre mot de passe — confirmation requise.
          </div>
        </div>
        <Button variant="ghost" onClick={() => { setOpen((v) => !v); reset(); }}>
          {open ? 'Fermer' : 'Modifier'}
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          {err && (
            <div style={{
              background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#ff8a9b',
              fontSize: 12, fontFamily: "'Inter',sans-serif",
            }}>{err}</div>
          )}
          {ok && (
            <div style={{
              background: 'rgba(120,220,160,0.08)', border: '1px solid rgba(120,220,160,0.3)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#9be9b6',
              fontSize: 12, fontFamily: "'Inter',sans-serif",
            }}>Mot de passe mis à jour. Tes autres sessions ont été déconnectées.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Mot de passe actuel">
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nouveau mot de passe">
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirmation">
              <Input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <Button type="submit" disabled={saving}>{saving ? '…' : 'Mettre à jour'}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

const MESSAGES = {
  email_taken:                       'Cet email est déjà utilisé.',
  last_admin:                        'Impossible : il doit rester au moins un admin.',
  cannot_delete_self:                'Impossible de supprimer ton propre compte.',
  invalid_role:                      'Rôle invalide.',
  missing_fields:                    'Email et mot de passe requis.',
  password_too_short:                'Mot de passe trop court (12 caractères minimum).',
  password_too_weak:                 'Mot de passe trop courant — choisis-en un autre.',
  password_unchanged:                'Le nouveau mot de passe doit être différent.',
  invalid_current_password:          'Mot de passe actuel incorrect.',
  use_self_service_password:         'Modifie ton propre mot de passe via le panneau « Mon mot de passe ».',
  cannot_change_other_admin_password:'Impossible de réinitialiser le mot de passe d’un autre admin.',
  forbidden:                         "Tu n'as pas les droits pour cette action.",
  not_found:                         'Utilisateur introuvable.',
};
function humanize(err) {
  const key = err?.body?.error || err?.message;
  return MESSAGES[key] || err?.message || 'Erreur inconnue.';
}
