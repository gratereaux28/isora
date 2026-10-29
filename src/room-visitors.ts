import type { Avatar, RoomIdentity, VisitorRecord } from './shared';

export function sameRoom(a: RoomIdentity | null, b: RoomIdentity | null) {
  return (
    !!a &&
    !!b &&
    a.hotel.trim().toLowerCase() === b.hotel.trim().toLowerCase() &&
    a.roomId === b.roomId
  );
}
function visitorKey(v: Pick<Avatar, 'id' | 'type' | 'name'>) {
  return JSON.stringify([v.type, v.id, v.id > 0 ? '' : v.name]);
}
export class RoomVisitors {
  private records = new Map<string, VisitorRecord>();
  clear() {
    this.records.clear();
  }
  observe(avatar: Avatar) {
    const key = visitorKey(avatar),
      previous = this.records.get(key);
    const now = new Date().toISOString();
    const newVisit = !previous || previous.presence === 'left';
    this.records.delete(key);
    this.records.set(key, {
      id: avatar.id,
      type: avatar.type,
      name: avatar.name,
      count: (previous?.count ?? 0) + (newVisit ? 1 : 0),
      entered: newVisit ? now : previous!.entered,
      lastSeen: now,
      presence: 'present',
    });
  }
  leave(avatar: Avatar) {
    const record = this.records.get(visitorKey(avatar));
    if (!record || record.presence !== 'present') return;
    record.presence = 'left';
    record.left = record.lastSeen = new Date().toISOString();
  }
  pause() {
    for (const record of this.records.values())
      if (record.presence === 'present') record.presence = 'unknown';
  }
  snapshot() {
    return structuredClone(
      [...this.records.values()]
        .reverse()
        .sort((a, b) => b.entered.localeCompare(a.entered)),
    );
  }
}
