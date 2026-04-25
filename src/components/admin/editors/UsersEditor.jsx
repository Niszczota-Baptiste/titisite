import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { humanizeError } from '../../../utils/errors';
import { ACC, ACC_RGB, Button, Field, Input } from '../ui';

const ROLES = [['member', 'Membre'], ['admin', 'Admin']];

export function UsersEditor() {
  const { user: currentUser } = useAuth();
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
    if (!window.confirm(`Supprimer définitivement ${u.email} ?`)) return;
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

function UserForm({ user, onSaved, onCancel }) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState(user?.name || '');
  const [role, setRole] = useState(user?.role || 'member');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      if (isEdit) {
        const payload = { name, role };
        if (password) payload.password = password;
        await api.updateUser(user.id, payload);
      } else {
        if (!email || !password) { setErr('Email et mot de passe requis'); setSaving(false); return; }
        await api.createUser({ email, name, role, password });
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
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : (isEdit ? 'Mettre à jour' : 'Créer')}</Button>
      </div>
    </form>
  );
}

const humanize = humanizeError;
