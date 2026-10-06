import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { authStatus, signIn, signOut, changePassword } from '../api/client';
import type { Session } from '../api/client';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  useEffect(() => {
    void authStatus().then(setSession).catch(() => setError('Start the StarView backend to sign in.'));
    const expired = () => { setSession(null); void authStatus().then(setSession).catch(() => setError('Could not reach StarView.')); };
    window.addEventListener('starview-session-expired', expired);
    return () => window.removeEventListener('starview-session-expired', expired);
  }, []);
  if (!session && !error) return <main className="auth-screen"><section className="auth-card"><div className="auth-brand">✳ StarView</div><p role="status">Opening your private workspace…</p></section></main>;
  if (!session?.authenticated) return <main className="auth-screen"><section className="auth-card"><div className="auth-brand">✳ StarView</div><span className="eyebrow">Your private workspace</span><h1>{session?.setup_required ? 'Make yourself at home' : 'Welcome back'}</h1><p>{session?.setup_required ? 'Create the account that protects access to files on this computer.' : 'Sign in to your local account to continue.'}</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { setSession(await signIn(name, password, !!session?.setup_required)); setPassword(''); } catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in'); } finally { setBusy(false); } }}><label>Your name<input autoComplete="username" required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label>Password<input type="password" autoComplete={session?.setup_required ? 'new-password' : 'current-password'} minLength={session?.setup_required ? 12 : 1} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{session?.setup_required && <small>At least 12 characters. Use a unique password.</small>}{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy || !session}>{busy ? 'Opening…' : session?.setup_required ? 'Create local account' : 'Sign in'}</button></form>{!session&&error&&<button onClick={()=>{setError('');void authStatus().then(setSession).catch(()=>setError('Start the StarView backend to sign in.'));}}>Retry connection</button>}<small>Files stay on this computer. Cloud accounts connect separately.</small></section></main>;
  return <><div className="account-bar"><span>Local workspace · {session.name}</span><button onClick={()=>setSettings(!settings)}>Account</button><button onClick={async()=>{if (!window.confirm('Sign out? Save any unsaved document changes first.')) return; await signOut(); setSession(await authStatus()); setSettings(false);}}>Sign out</button></div>{children}{settings && <div className="modal-backdrop"><section className="folder-browser" role="dialog" aria-modal="true" aria-labelledby="account-title"><h2 id="account-title">Your local account</h2><p>Changing your password signs out other sessions.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{setSession(await changePassword(current,next));setCurrent('');setNext('');setSettings(false);}catch(error){setError(error instanceof Error ? error.message : 'Could not change password');}finally{setBusy(false);}}}><label>Current password<input required type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>New password<input required type="password" autoComplete="new-password" minLength={12} maxLength={256} value={next} onChange={e=>setNext(e.target.value)}/></label>{error && <p className="error" role="alert">{error}</p>}<div className="browser-actions"><button type="button" onClick={()=>{setSettings(false);setError('');}}>Close</button><button className="primary" disabled={busy}>Change password</button></div></form></section></div>}</>;
}
