import { messageRef } from './i18n';
import fs from 'node:fs';
import path from 'node:path';
import { profileKey } from './profiles';
import type { ProfileRecord } from './shared';
const text = (v: unknown, limit = 2000) =>
  typeof v === 'string' && v.length <= limit;
const integer = (v: unknown) => Number.isSafeInteger(v);
const date = (v: unknown) =>
  text(v, 40) && Number.isFinite(Date.parse(v as string));
export function validateProfiles(value: any): ProfileRecord[] {
  if (
    value?.version !== 1 ||
    !Array.isArray(value.records) ||
    value.records.length > 10000
  )
    throw new Error(messageRef('errors.invalidProfileHistory'));
  const seen = new Set<string>();
  for (const r of value.records) {
    const p = r?.profile;
    if (
      !p ||
      !text(r.hotel, 253) ||
      !r.hotel ||
      !integer(p.id) ||
      p.id < 1 ||
      !text(p.name, 100) ||
      !p.name ||
      r.key !== profileKey(r.hotel, p.id) ||
      seen.has(r.key) ||
      !date(r.firstSearched) ||
      !date(r.lastSearched) ||
      !integer(r.count) ||
      r.count < 1 ||
      !text(p.figure) ||
      !text(p.motto) ||
      !text(p.created, 100) ||
      !integer(p.activityPoints) ||
      !integer(p.friends) ||
      p.friends < 0 ||
      !integer(p.lastLogin) ||
      [p.isFriend, p.requestSent, p.online].some(
        (v) => typeof v !== 'boolean',
      ) ||
      (p.level !== null && !integer(p.level)) ||
      (p.starGems !== null && !integer(p.starGems)) ||
      !Array.isArray(p.groups) ||
      p.groups.length > 2000 ||
      p.groups.some(
        (g: any) =>
          !g ||
          !integer(g.id) ||
          !integer(g.ownerId) ||
          !text(g.name) ||
          !text(g.badge) ||
          !text(g.primary, 100) ||
          !text(g.secondary, 100) ||
          typeof g.favorite !== 'boolean' ||
          typeof g.forum !== 'boolean',
      ) ||
      !(
        p.badges === null ||
        (Array.isArray(p.badges) &&
          p.badges.length <= 50 &&
          p.badges.every((b: any) => b && integer(b.slot) && text(b.code, 400)))
      ) ||
      !(
        p.relationships === null ||
        (Array.isArray(p.relationships) &&
          p.relationships.length <= 10 &&
          p.relationships.every(
            (v: any) =>
              v &&
              integer(v.type) &&
              integer(v.count) &&
              integer(v.id) &&
              text(v.name, 100) &&
              text(v.figure),
          ))
      )
    )
      throw new Error(messageRef('errors.invalidRecordInProfileHistory'));
    seen.add(r.key);
  }
  return structuredClone(value.records).sort(
    (a: ProfileRecord, b: ProfileRecord) =>
      b.lastSearched.localeCompare(a.lastSearched),
  );
}
export class ProfileStore {
  private writable = true;
  private lastGood?: string;
  constructor(readonly file: string) {}
  load(): { records: ProfileRecord[]; warning?: string } {
    let found = false;
    for (const candidate of [this.file, `${this.file}.bak`]) {
      if (!fs.existsSync(candidate)) continue;
      found = true;
      try {
        if (fs.statSync(candidate).size > 64 * 1024 * 1024)
          throw new Error(messageRef('errors.historyTooLarge'));
        const records = validateProfiles(
          JSON.parse(fs.readFileSync(candidate, 'utf8')),
        );
        this.lastGood = JSON.stringify({ version: 1, records });
        return {
          records,
          ...(candidate === this.file
            ? {}
            : {
                warning: messageRef(
                  'messages.theProfileHistoryBackupWasRecovered',
                ),
              }),
        };
      } catch {
        /* Try the backup; never overwrite unreadable originals. */
      }
    }
    this.writable = !found;
    return {
      records: [],
      ...(found
        ? {
            warning: messageRef(
              'errors.couldNotReadProfileHistoryOriginalFilesArePreservedQueriesWill',
            ),
          }
        : {}),
    };
  }
  save(records: ProfileRecord[]) {
    if (!this.writable)
      throw new Error(
        messageRef('messages.profileHistoryIsDamagedItWillNotBeOverwritten'),
      );
    const raw = JSON.stringify({
      version: 1,
      records: validateProfiles({ version: 1, records }),
    });
    if (Buffer.byteLength(raw) > 64 * 1024 * 1024)
      throw new Error(messageRef('messages.profileHistoryExceeds64Mb'));
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (this.lastGood) this.atomic(`${this.file}.bak`, this.lastGood);
    this.atomic(this.file, raw);
    this.lastGood = raw;
    // The backup also reflects explicit deletions and clears.
    this.atomic(`${this.file}.bak`, raw);
  }
  private atomic(file: string, raw: string) {
    const temporary = `${file}.${process.pid}.tmp`,
      fd = fs.openSync(temporary, 'w');
    try {
      fs.writeFileSync(fd, raw, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
  }
}
