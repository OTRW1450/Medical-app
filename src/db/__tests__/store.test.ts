import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { changePasscode, lock, setupPasscode, unlock } from '../keys';
import { attachments, encryptLegacyRows, loadPatientData, store } from '../store';
import { exportPatient, importBackup, importData } from '../backup';
import { buildDemo } from '../demo';

const PASS = 'purple elephant ladder';

async function rawDump() {
  const out: unknown[] = [];
  for (const t of db.tables) out.push(...(await t.toArray()));
  // Render ArrayBuffers as text to search for leaked plaintext.
  return JSON.stringify(out, (_k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? new TextDecoder().decode(v as ArrayBuffer) : v));
}

beforeEach(async () => {
  lock();
  await db.delete();
  await db.open();
});

describe('encrypted store', () => {
  it('stores nothing readable on disk', async () => {
    await setupPasscode(PASS);
    const pid = await importData(buildDemo(0));
    await attachments.put({ id: 'a1', patientId: pid, name: 'mri-report.pdf', mime: 'application/pdf', size: 11, blob: new Blob(['SECRET-SCAN']), addedAt: 0 });
    const dump = await rawDump();
    for (const word of ['Fibromyalgia', 'Demo patient', 'CRP', 'Ibuprofen', 'sacroiliac', 'mri-report', 'SECRET-SCAN', '2016-02-18', 'prolonged sitting'])
      expect(dump).not.toContain(word);
    const data = await loadPatientData(pid);
    expect(data!.events.some((e) => e.title === 'Fibromyalgia')).toBe(true);
    expect(await (await attachments.get('a1'))!.blob.text()).toBe('SECRET-SCAN');
  });

  it('rejects a wrong passcode and survives a passcode change', async () => {
    await setupPasscode(PASS);
    await store.put('patients', { id: 'p1', name: 'Jo', createdAt: 0 });
    lock();
    await expect(unlock('wrong passcode')).rejects.toThrow('Wrong passcode');
    await unlock(PASS);
    await changePasscode(PASS, 'new longer passphrase');
    lock();
    await expect(unlock(PASS)).rejects.toThrow();
    await unlock('new longer passphrase');
    expect((await store.get('patients', 'p1'))!.name).toBe('Jo');
  });

  it('refuses reads while locked', async () => {
    await setupPasscode(PASS);
    await store.put('patients', { id: 'p1', name: 'Jo', createdAt: 0 });
    lock();
    await expect(store.allPatients()).rejects.toThrow('Locked');
  });

  it('encrypts rows left over from the unencrypted version', async () => {
    await db.patients.put({ id: 'old', name: 'Legacy Name', createdAt: 0 } as never);
    await db.events.put({ id: 'e1', patientId: 'old', title: 'Old secret diagnosis' } as never);
    await setupPasscode(PASS);
    expect(await encryptLegacyRows()).toBe(2);
    expect(await rawDump()).not.toContain('Legacy Name');
    expect((await store.get('events', 'e1') as { title: string }).title).toBe('Old secret diagnosis');
  });

  it('round-trips an encrypted backup', async () => {
    await setupPasscode(PASS);
    const pid = await importData(buildDemo(0));
    const text = await (await exportPatient(pid, 'backup pass 123')).text();
    expect(text).not.toContain('Fibromyalgia');
    await expect(importBackup(text, 'nope nope nope')).rejects.toThrow('Wrong passphrase');
    const pid2 = await importBackup(text, 'backup pass 123');
    const a = await loadPatientData(pid);
    const b = await loadPatientData(pid2);
    expect(b!.events.length).toBe(a!.events.length);
    expect(b!.labs.length).toBe(a!.labs.length);
  });
});
