import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { eraseEverything, hasPasscode, isUnlocked, lock, MIN_PASSCODE, setupPasscode, subscribeLock, unlock } from '../db/keys';
import { encryptLegacyRows } from '../db/store';
import { Icon } from '../components/Icons';
import { Field } from '../components/ui';

export const AUTOLOCK_KEY = 'pain-chronicle:autolock-minutes';
export const AUTOLOCK_OPTIONS = [1, 5, 15, 60, 0];
export function autoLockMinutes(): number {
  const v = Number(localStorage.getItem(AUTOLOCK_KEY) ?? 5);
  return Number.isFinite(v) ? v : 5;
}

export function strength(p: string): { label: string; ok: boolean } {
  if (p.length < MIN_PASSCODE) return { label: `At least ${MIN_PASSCODE} characters`, ok: false };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(p)).length;
  const words = p.trim().split(/\s+/).length;
  if (p.length >= 16 || words >= 4) return { label: 'Strong', ok: true };
  if (p.length >= 12 || classes >= 3) return { label: 'Good', ok: true };
  return { label: 'OK – longer is safer (a short phrase of 3–4 words is ideal)', ok: true };
}

export function LockGate({ children }: { children: ReactNode }) {
  const unlocked = useSyncExternalStore(subscribeLock, isUnlocked);
  const [hasPc, setHasPc] = useState<boolean | null>(null);
  useEffect(() => {
    hasPasscode().then(setHasPc);
  }, [unlocked]);

  // Auto-lock after inactivity, and when the app has been in the background too long.
  useEffect(() => {
    if (!unlocked) return;
    const mins = autoLockMinutes();
    if (!mins) return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    const check = () => Date.now() - last > mins * 60_000 && lock();
    const onVis = () => (document.visibilityState === 'visible' ? check() : undefined);
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(check, 15_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [unlocked]);

  if (unlocked) return <>{children}</>;
  if (hasPc === null) return null;
  return hasPc ? <Unlock /> : <Setup />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 520, margin: '8vh auto', padding: 16 }}>
      <div className="row" style={{ gap: 10, marginBottom: 16 }}>
        <Icon.logo />
        <h1 style={{ margin: 0 }}>Pain Chronicle</h1>
      </div>
      <div className="card">{children}</div>
    </div>
  );
}

function Setup() {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const s = strength(p1);
  const ok = s.ok && p1 === p2 && ack;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setErr('');
    try {
      setBusy('Setting up encryption…');
      await setupPasscode(p1);
      setBusy('Encrypting existing records…');
      await encryptLegacyRows();
    } catch (x) {
      setErr((x as Error).message);
      setBusy('');
    }
  };
  return (
    <Shell>
      <h2>🔒 Choose a passcode</h2>
      <p className="muted">
        Every record, note, lab result and attached file is <b>encrypted on this device</b> with a key that only this passcode unlocks. Without it, the stored data is unreadable – even to someone who copies the device’s storage.
      </p>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <Field label="Passcode" hint={p1 ? `Strength: ${s.label}` : 'A short phrase of 3–4 words is easy to remember and hard to guess'}>
          <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus />
        </Field>
        <Field label="Repeat passcode" hint={p2 && p1 !== p2 ? 'Does not match' : undefined}>
          <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
        </Field>
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I understand that if I forget this passcode, <b>nobody can recover my records</b> – only an encrypted backup I exported can restore them.</span>
        </label>
        {err && <div className="banner warn">{err}</div>}
        <button className="primary" type="submit" disabled={!ok || !!busy}>{busy || 'Set passcode & continue'}</button>
      </form>
    </Shell>
  );
}

function Unlock() {
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await unlock(p);
      await encryptLegacyRows();
    } catch (x) {
      setErr((x as Error).message);
      setP('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h2>🔒 Locked</h2>
      <p className="muted">Enter your passcode to open your records.</p>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} autoFocus aria-label="Passcode" />
        {err && <div className="banner warn">{err}</div>}
        <button className="primary" type="submit" disabled={!p || busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </form>
      <button className="ghost small" style={{ marginTop: 12 }} onClick={() => setForgot(!forgot)}>Forgot passcode?</button>
      {forgot && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          <p>The passcode can’t be reset – that is what keeps the records safe. Your options:</p>
          <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
            <li>Keep trying variations you might have used.</li>
            <li>If you have an <b>encrypted backup</b> (and remember <i>its</i> passphrase), erase this device’s data, set a new passcode, then import the backup under <i>Data &amp; privacy</i>.</li>
          </ul>
          <button className="danger small" onClick={() => prompt('This permanently deletes ALL records on this device. Type ERASE to confirm.') === 'ERASE' && eraseEverything()}>
            Erase all data on this device…
          </button>
        </div>
      )}
    </Shell>
  );
}
