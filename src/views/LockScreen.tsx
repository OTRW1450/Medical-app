import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import {
  eraseEverything, hasPasscode, hasRecoveryKey, isPlausibleRecoveryCode, isUnlocked, lock, lockoutRemainingMs, MIN_PASSCODE,
  normalizeRecoveryCode, notifyUnlocked, recoverWithKey, setupPasscode, subscribeLock, unlock,
} from '../db/keys';
import { download } from '../db/backup';
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
  // A freshly issued recovery key must be shown (and saved) before the app opens.
  const [newCode, setNewCode] = useState<{ code: string; reason: 'setup' | 'recovered' } | null>(null);
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

  if (newCode)
    return (
      <Shell>
        <RecoveryKeyCard
          code={newCode.code}
          intro={
            newCode.reason === 'setup'
              ? 'If you ever forget your passcode, this recovery key is the only way back in. It is shown only once.'
              : 'Your new passcode is set. The recovery key you just used has been retired – here is your NEW one. The old one no longer works.'
          }
          onDone={() => {
            setNewCode(null);
            notifyUnlocked();
          }}
        />
      </Shell>
    );
  if (unlocked) return <>{children}</>;
  if (hasPc === null) return null;
  return hasPc ? <Unlock onRecovered={(code) => setNewCode({ code, reason: 'recovered' })} /> : <Setup onCreated={(code) => setNewCode({ code, reason: 'setup' })} />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 560, margin: '8vh auto', padding: 16 }}>
      <div className="row no-print" style={{ gap: 10, marginBottom: 16 }}>
        <Icon.logo />
        <h1 style={{ margin: 0 }}>Pain Chronicle</h1>
      </div>
      <div className="card">{children}</div>
    </div>
  );
}

/** Shows a recovery key with print / download / copy, and makes the user confirm they saved it. */
export function RecoveryKeyCard({ code, intro, onDone, doneLabel = 'I’ve saved it – continue' }: { code: string; intro: string; onDone: () => void; doneLabel?: string }) {
  const [check, setCheck] = useState('');
  const [copied, setCopied] = useState(false);
  const last = code.slice(-4);
  const confirmed = normalizeRecoveryCode(check) === normalizeRecoveryCode(last);
  const text = `Pain Chronicle – recovery key\n\n${code}\n\nCreated ${new Date().toLocaleDateString()}.\nUse this only if you forget your passcode (Lock screen → Forgot passcode?).\nAnyone with this key AND your device can open your records – keep it private, away from the device.\n`;
  return (
    <div className="recovery-card">
      <h2>🗝️ Your recovery key</h2>
      <p className="muted no-print">{intro}</p>
      <div className="recovery-code" aria-label={`Recovery key ${code}`}>
        {[0, 4].map((i) => <div key={i}>{code.split('-').slice(i, i + 4).join('-')}</div>)}
      </div>
      <p className="print-only" style={{ fontSize: 12 }}>Pain Chronicle recovery key · created {new Date().toLocaleDateString()} · Use only if the passcode is forgotten. Keep private and away from the device.</p>
      <div className="row no-print" style={{ margin: '10px 0' }}>
        <button onClick={() => window.print()}>🖨 Print</button>
        <button onClick={() => download(new Blob([text], { type: 'text/plain' }), 'pain-chronicle-recovery-key.txt')}>⬇ Download</button>
        <button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); }}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <ul className="muted no-print" style={{ paddingLeft: 18, fontSize: 14 }}>
        <li><b>Best:</b> print it or write it down and keep it somewhere safe at home (with passports or important papers).</li>
        <li>A password manager is also good. Avoid keeping it as a photo or file on this same device – if the device is stolen, the key would be too.</li>
        <li>Treat it like your passcode: anyone with this key and your device can open the records.</li>
      </ul>
      <div className="no-print">
        <Field label={`To confirm you saved it, type the last group (${'•'.repeat(4)})`}>
          <input value={check} onChange={(e) => setCheck(e.target.value)} autoComplete="off" spellCheck={false} style={{ fontFamily: 'ui-monospace, monospace', width: 120, textTransform: 'uppercase' }} />
        </Field>
        <button className="primary" style={{ marginTop: 10 }} disabled={!confirmed} onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  );
}

function Setup({ onCreated }: { onCreated: (code: string) => void }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const s = strength(p1);
  const ok = s.ok && p1 === p2;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setErr('');
    try {
      setBusy('Setting up encryption…');
      const code = await setupPasscode(p1);
      setBusy('Encrypting existing records…');
      await encryptLegacyRows();
      onCreated(code);
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
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>Next you’ll get a <b>recovery key</b> to save – it lets you back in if you forget the passcode.</p>
        {err && <div className="banner warn">{err}</div>}
        <button className="primary" type="submit" disabled={!ok || !!busy}>{busy || 'Set passcode & continue'}</button>
      </form>
    </Shell>
  );
}

function useLockout() {
  const [ms, setMs] = useState(0);
  const refresh = () => lockoutRemainingMs().then(setMs);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, []);
  return { ms, refresh };
}

function Unlock({ onRecovered }: { onRecovered: (code: string) => void }) {
  const [mode, setMode] = useState<'passcode' | 'recover'>('passcode');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const lockout = useLockout();
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
      lockout.refresh();
    } finally {
      setBusy(false);
    }
  };
  if (mode === 'recover') return <Recover onBack={() => setMode('passcode')} onRecovered={onRecovered} />;
  const waiting = lockout.ms > 0;
  return (
    <Shell>
      <h2>🔒 Locked</h2>
      <p className="muted">Enter your passcode to open your records.</p>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        <input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} autoFocus aria-label="Passcode" />
        {waiting ? <div className="banner warn">Too many wrong attempts. Try again in {Math.ceil(lockout.ms / 1000)} s.</div> : err && <div className="banner warn">{err}</div>}
        <button className="primary" type="submit" disabled={!p || busy || waiting}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </form>
      <button className="ghost small" style={{ marginTop: 12 }} onClick={() => setMode('recover')}>Forgot passcode?</button>
    </Shell>
  );
}

function Recover({ onBack, onRecovered }: { onBack: () => void; onRecovered: (code: string) => void }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const lockout = useLockout();
  useEffect(() => {
    hasRecoveryKey().then(setHasKey);
  }, []);
  const s = strength(p1);
  const ok = isPlausibleRecoveryCode(code) && s.ok && p1 === p2 && lockout.ms === 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      const fresh = await recoverWithKey(code, p1);
      onRecovered(fresh);
    } catch (x) {
      setErr((x as Error).message);
      lockout.refresh();
      setBusy(false);
    }
  };
  const n = normalizeRecoveryCode(code).length;
  return (
    <Shell>
      <h2>Forgot passcode</h2>
      {hasKey === false ? (
        <>
          <p>No recovery key was created on this device, so the passcode can’t be reset. This is deliberate – there is no server and no “back door”, which is what keeps the records private.</p>
          <p className="muted">Options:</p>
          <ul className="muted" style={{ paddingLeft: 18 }}>
            <li>Keep trying passcodes you might have used.</li>
            <li>If you have an <b>encrypted backup</b> file (and remember <i>its</i> passphrase): erase this device’s data, set a new passcode, then import the backup under <i>Data &amp; privacy</i>.</li>
          </ul>
          <EraseButton />
        </>
      ) : (
        <>
          <p className="muted">Enter the recovery key you saved when you set up the app, then choose a new passcode. Your records stay exactly as they are.</p>
          <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
            <Field label="Recovery key" hint={code ? `${n} of 32 characters${n === 32 ? ' ✓' : ''} – dashes and spaces don’t matter` : 'Looks like XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'}>
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} autoFocus style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', letterSpacing: 1 }} />
            </Field>
            <Field label="New passcode" hint={p1 ? `Strength: ${s.label}` : undefined}>
              <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
            </Field>
            <Field label="Repeat new passcode" hint={p2 && p1 !== p2 ? 'Does not match' : undefined}>
              <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
            </Field>
            {lockout.ms > 0 ? <div className="banner warn">Too many wrong attempts. Try again in {Math.ceil(lockout.ms / 1000)} s.</div> : err && <div className="banner warn">{err}</div>}
            <button className="primary" type="submit" disabled={!ok || busy}>{busy ? 'Checking…' : 'Reset passcode'}</button>
          </form>
          <details style={{ marginTop: 14 }}>
            <summary className="muted" style={{ fontSize: 13.5 }}>Lost the recovery key too?</summary>
            <p className="muted" style={{ fontSize: 14 }}>Then the records on this device can’t be opened by anyone. If you have an encrypted backup, you can erase this device, start again and import it.</p>
            <EraseButton />
          </details>
        </>
      )}
      <button className="ghost small" style={{ marginTop: 12 }} onClick={onBack}>← Back to passcode</button>
    </Shell>
  );
}

function EraseButton() {
  return (
    <button className="danger small" onClick={() => prompt('This permanently deletes ALL records on this device. Type ERASE to confirm.') === 'ERASE' && eraseEverything()}>
      Erase all data on this device…
    </button>
  );
}
