import { messageRef } from './i18n';
import { resolveLanguage, translate, type MessageKey } from './i18n';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { General } from './general';
import { Profiles } from './profiles';
import { FurniHighlight } from './furni-highlight';
import type { FurniInfo } from './furni-catalog';
import { generalInitial } from './general-options';
import { readStuff } from './room-transform';
import { GEarth, normalize } from './protocol/gearth';
import { Reader, Writer, parseHex, type Intercept } from './protocol/packet';
import { RoomVisitors, sameRoom } from './room-visitors';
import {
  defaults,
  type Snapshot,
  type Settings,
  type Outfit,
  type SendRequest,
  type Avatar,
  type InventoryItem,
  type RoomIdentity,
} from './shared';

const aliases = {
  users: ['Users', 'RoomUsers'],
  remove: ['UserRemove', 'RemoveUser'],
  chat: ['Chat'],
  shout: ['Shout'],
  whisper: ['Whisper'],
  self: ['UserObject', 'UserData'],
  room: ['RoomReady'],
  close: ['CloseConnection'],
  figure: ['UserChange'],
  inventory: ['FurniList', 'FurnitureList'],
};
export class Model extends EventEmitter {
  readonly furniHighlight: FurniHighlight;
  private furniInfo = new Map<number, FurniInfo>();
  readonly profiles: Profiles;
  readonly general: General;
  readonly visitors = new RoomVisitors();
  state: Snapshot;
  private serial = 0;
  private inventoryParts = new Map<number, InventoryItem[]>();
  private floorRaw = new Map<number, Buffer>();
  private activeRoom: RoomIdentity | null = null;
  private pendingRoom: RoomIdentity | null = null;
  private requestedAt = 0;
  constructor(
    public earth: GEarth,
    saved?: {
      settings?: Partial<Settings>;
      outfits?: Outfit[];
    },
  ) {
    super();
    this.state = {
      furniHighlight: null,
      furniCatalog: { status: 'idle', hotel: '', count: 0 },
      profileHistory: [],
      general: structuredClone(generalInitial),
      status: 'disconnected',
      gameConnected: false,
      session: null,
      settings: { ...defaults, ...saved?.settings },
      outfits: saved?.outfits ?? [],
      messages: [],
      room: { id: 0, name: '' },
      self: null,
      avatars: [],
      visitors: [],
      chat: [],
      packets: [],
      inventory: [],
      furni: [],
      received: 0,
      sent: 0,
      blocked: 0,
      notices: [],
    };
    this.general = new General(this);
    this.furniHighlight = new FurniHighlight(this);
    this.profiles = new Profiles(this);
    earth.on('status', (status) => {
      this.state.status = status;
      this.changed();
    });
    earth.on('notice', (text) => this.notice(text));
    earth.on('game', (session) => {
      const previous = this.state.session;
      if (
        this.state.gameConnected &&
        previous &&
        previous.host === session.host &&
        previous.port === session.port &&
        previous.client === session.client &&
        previous.version === session.version
      ) {
        this.state.messages = earth.messages;
        this.general.syncHeartbeat();
        this.traceRoom(
          'metadata-refresh',
          messageRef(
            'messages.repeatedSessionMetadataTheActiveRoomIsPreserved',
          ),
        );
        return;
      }
      this.general.sessionEnded();
      this.profiles.sessionEnded();
      this.resetGame(
        'session-start',
        messageRef('messages.newHabboSessionConfirmed'),
      );
      this.state.session = session;
      this.state.gameConnected = earth.gameConnected;
      this.state.messages = earth.messages;
      this.furniInfo.clear();
      this.state.furniCatalog = {
        status: 'idle',
        hotel: session.host,
        count: 0,
      };
      if (earth.gameConnected)
        this.emit('furniCatalogRequest', session.host, false);
      this.general.sessionStarted();
      this.notice(
        messageRef('messages.sessionMessages', {
          v0: session.client,
          v1: session.version,
          v2: earth.messages.length,
        }),
      );
    });
    earth.on('gameEnd', (event?: { reason?: string }) => {
      this.profiles.sessionEnded();
      this.general.sessionEnded();
      const reason = event?.reason ?? 'game-disconnected';
      this.resetGame(
        reason,
        reason === 'gearth-socket-closed'
          ? messageRef(
              'messages.theTcpConnectionToGEarthClosedRoomObservationEnded',
            )
          : messageRef(
              'messages.gEarthReportedThatHabboDisconnectedRoomObservationEnded',
            ),
      );
      this.state.gameConnected = false;
      this.state.session = null;
      this.state.messages = [];
      this.changed();
    });
    earth.on('sent', (p) => {
      try {
        this.profiles.observeSent(p);
      } catch (e) {
        this.notice(
          messageRef('messages.profileError', { error: (e as Error).message }),
        );
      }
      this.state.sent++;
      if (
        p.direction === 'out' &&
        ['openconnection', 'openflatconnection'].includes(
          normalize(this.name(p)),
        )
      ) {
        try {
          this.requestRoom(new Reader(p.body).int());
        } catch (e) {
          this.notice((e as Error).message);
        }
      }
      this.record({
        ...p,
        sequence: 0,
        blocked: false,
        modified: false,
        format: 0,
      });
    });
    earth.intercept = (packet) => this.intercept(packet);
  }
  get language() {
    return resolveLanguage(
      this.state.settings.language,
      this.state.gameConnected ? this.state.session?.host : undefined,
    );
  }
  t(message: MessageKey, values?: Record<string, unknown>) {
    return translate(message, this.language, values);
  }
  changed() {
    this.emit('change');
  }
  notice(text: string) {
    this.state.notices.unshift({ time: new Date().toISOString(), text });
    this.state.notices.length = Math.min(this.state.notices.length, 60);
    this.changed();
  }
  getFloorRaw(id: number) {
    return this.floorRaw.get(id);
  }
  applyFurniCatalog(hotel: string, entries: FurniInfo[]) {
    if (!this.state.gameConnected || this.state.session?.host !== hotel) return;
    this.furniInfo = new Map(entries.map((entry) => [entry.kind, entry]));
    for (const f of this.state.furni) {
      const entry = this.furniInfo.get(f.kind);
      f.name = entry?.name;
      f.identifier = entry?.identifier;
      f.description = entry?.description;
    }
    this.changed();
  }
  private publishVisitors() {
    this.state.visitors = this.visitors.snapshot();
  }
  private traceRoom(reason: string, detail: string) {
    this.notice(`[${reason}] ${detail}`);
  }
  private resetRoom(preserveVisitors = false) {
    this.furniHighlight?.stop(false);
    if (preserveVisitors) this.visitors.pause();
    else this.visitors.clear();
    this.activeRoom = null;
    this.state.room = { id: 0, name: '' };
    this.state.avatars = [];
    this.state.furni = [];
    this.floorRaw.clear();
    this.general?.resetRoom();
    this.publishVisitors();
  }
  private resetGame(reason: string, detail: string) {
    this.resetRoom();
    this.pendingRoom = null;
    this.state.self = null;
    this.state.inventory = [];
    this.inventoryParts.clear();
    this.traceRoom(reason, detail);
  }
  private requestRoom(id: number) {
    if (!Number.isInteger(id) || id < 1)
      throw new Error(messageRef('errors.invalidRoomId'));
    const hotel = this.state.session?.host.trim().toLowerCase();
    if (!hotel) return;
    const target = { hotel, roomId: id };
    if (sameRoom(this.pendingRoom, target)) {
      this.requestedAt = Date.now();
      return;
    }
    this.pendingRoom = target;
    this.requestedAt = Date.now();
    this.traceRoom(
      'entry-request',
      messageRef('messages.entryRequestedForRoomTheCurrentRoomIsKeptUntilThe', {
        v0: id,
      }),
    );
  }
  private confirmRoom(id: number, name: string) {
    if (!Number.isInteger(id) || id < 1)
      throw new Error(messageRef('errors.invalidRoomIdInRoomready'));
    const hotel = this.state.session?.host.trim().toLowerCase();
    const target = hotel ? { hotel, roomId: id } : null;
    const reenter =
      sameRoom(this.activeRoom, target) &&
      sameRoom(this.pendingRoom, target) &&
      Date.now() - this.requestedAt >= 0 &&
      Date.now() - this.requestedAt < 30000;
    if (sameRoom(this.activeRoom, target) && !reenter) {
      this.state.room.name = name;
      if (sameRoom(this.pendingRoom, target)) this.pendingRoom = null;
      this.traceRoom(
        'room-ready-duplicate',
        messageRef(
          'messages.repeatedRoomreadyForRoomUsersFurnitureAndVisitorsArePreserved',
          { v0: id },
        ),
      );
      return;
    }
    const previous = this.activeRoom;
    this.resetRoom(reenter);
    this.activeRoom = target;
    this.pendingRoom = null;
    this.state.room = { id, name };
    this.log(
      messageRef('navigation.room'),
      messageRef('messages.youEnteredRoom', { v0: id, v1: name }),
      'system',
    );
    this.traceRoom(
      reenter ? 'room-reentered' : 'room-entered',
      messageRef('messages.forRoom', {
        v0: reenter
          ? messageRef('messages.requestedReEntryConfirmed')
          : messageRef('messages.entryConfirmed'),
        v1: id,
        v2: previous
          ? messageRef('messages.activeDataFromRoomIsReplaced', {
              v0: previous.roomId,
            })
          : '',
        v3: reenter
          ? messageRef('messages.theCurrentRoomSVisitorListIsKept')
          : messageRef('messages.aNewVisitorListIsStarted'),
      }),
    );
  }
  shutdown() {
    if (!this.activeRoom) return;
    this.resetRoom();
    this.pendingRoom = null;
    this.traceRoom(
      'application-closed',
      messageRef('messages.isoraClosedTheRoomSVisitorListIsCleared'),
    );
  }
  private log(user: string, text: string, kind: string) {
    this.state.chat.push({
      id: ++this.serial,
      time: new Date().toISOString(),
      user,
      text,
      kind,
    });
    if (this.state.chat.length > 3000)
      this.state.chat.splice(0, this.state.chat.length - 3000);
  }
  private name(p: Intercept) {
    return (
      this.earth.messages.find(
        (m) => m.direction === p.direction && m.id === p.header,
      )?.name ?? ''
    );
  }
  private record(p: Intercept) {
    if (this.state.settings.capturePackets) {
      this.state.packets.unshift({
        id: ++this.serial,
        time: new Date().toISOString(),
        direction: p.direction,
        header: p.header,
        name: this.name(p),
        size: p.body.length + 6,
        hex:
          p.direction === 'out' &&
          ['openflatconnection', 'openconnection'].includes(
            normalize(this.name(p)),
          )
            ? ''
            : p.body.subarray(0, 4096).toString('hex'),
        blocked: p.blocked,
        modified: p.modified,
      });
      if (this.state.packets.length > 500) this.state.packets.length = 500;
    }
    this.changed();
  }
  private intercept(p: Intercept) {
    this.state.received++;
    const name = normalize(this.name(p));
    const s = this.state.settings;
    const is = (names: string[]) => names.some((n) => normalize(n) === name);
    if (p.format !== 0) return;
    try {
      this.profiles.handle(p, name);
    } catch (e) {
      this.notice(
        messageRef('messages.profileError', { error: (e as Error).message }),
      );
    }
    if (p.direction === 'in') {
      try {
        this.parseIncoming(p, name);
      } catch (error) {
        this.notice(
          messageRef('errors.couldNotRead', {
            v0: this.name(p) || p.header,
            v1: (error as Error).message,
          }),
        );
      }
      if (s.muteChat && is([...aliases.chat, ...aliases.shout]))
        p.blocked = true;
      if (s.muteWhispers && is(aliases.whisper)) p.blocked = true;
    } else {
      if (s.noWalk && is(['MoveAvatar', 'Move'])) p.blocked = true;
      if (s.noTurn && is(['LookTo', 'LookToAvatar'])) p.blocked = true;
      if (
        s.noTyping &&
        is(['StartTyping', 'CancelTyping', 'TypingStart', 'TypingStop'])
      )
        p.blocked = true;
      if (
        s.preventUse &&
        is(['UseFurniture', 'UseWallItem', 'UseItem', 'UseStuff'])
      )
        p.blocked = true;
      if (is([...aliases.chat, ...aliases.shout])) {
        try {
          const text = new Reader(p.body).string();
          if (
            s.commands &&
            /^\/(x|isora|clear|goto|exit|motto|reload|saveoutfit)(\s|$)/i.test(
              text,
            )
          ) {
            p.blocked = true;
            queueMicrotask(() => {
              try {
                this.command(text);
              } catch (e) {
                this.notice((e as Error).message);
              }
            });
          } else if (s.alwaysShout && is(aliases.chat)) {
            const shout = this.earth.resolve('out', aliases.shout);
            if (shout) {
              p.header = shout.id;
              p.modified = true;
            }
          }
        } catch (e) {
          this.notice((e as Error).message);
        }
      }
      if (is(['OpenConnection', 'OpenFlatConnection'])) {
        try {
          const id = new Reader(p.body).int();
          if (!p.blocked) this.requestRoom(id);
        } catch {
          /* Keep the packet unchanged. */
        }
      }
    }
    try {
      this.general.handle(p);
    } catch (e) {
      this.notice(
        messageRef('messages.general', {
          v0: this.name(p) || p.header,
          v1: (e as Error).message,
        }),
      );
    }
    if (s.blockTrade && name.startsWith('trading')) p.blocked = true;
    if (p.blocked) this.state.blocked++;
    this.record(p);
  }
  private parseIncoming(p: Intercept, name: string) {
    const r = new Reader(p.body);
    const is = (names: string[]) => names.some((n) => normalize(n) === name);
    if (is(['Objects', 'ObjectAdd', 'ObjectUpdate', 'ObjectRemove'])) {
      if (is(['ObjectRemove'])) {
        const id = Number(r.string());
        this.state.furni = this.state.furni.filter((f) => f.id !== id);
        this.floorRaw.delete(id);
        return;
      }
      const owners = new Map<number, string>();
      const list = is(['Objects']);
      if (list)
        for (let i = 0, n = r.count(); i < n; i++)
          owners.set(r.int(), r.string());
      const count = list ? r.count() : 1;
      const entries: Snapshot['furni'] = [];
      const raws = new Map<number, Buffer>();
      for (let i = 0; i < count; i++) {
        const start = r.position;
        const id = r.int(),
          kind = r.int(),
          x = r.int(),
          y = r.int(),
          direction = r.int(),
          z = r.string();
        r.string();
        const linkId = r.int();
        const values = readStuff(r);
        r.int();
        r.int();
        const ownerId = r.int();
        if (kind < 0) r.string();
        const raw = r.data.subarray(start, r.position);
        let ownerName =
          owners.get(ownerId) ??
          this.state.furni.find((f) => f.ownerId === ownerId)?.ownerName ??
          '';
        if (is(['ObjectAdd'])) ownerName = r.string();
        entries.push({
          ...this.furniInfo.get(kind),
          id,
          kind,
          x,
          y,
          z,
          direction,
          ownerId,
          ownerName,
          hidden: false,
          linkId,
        });
        this.general.captureToner(id, kind, values);
        raws.set(id, Buffer.from(raw));
      }
      if (list) {
        this.state.furni = entries;
        this.floorRaw = raws;
      } else
        for (const f of entries) {
          const previous = this.state.furni.findIndex(
            (item) => item.id === f.id,
          );
          if (previous >= 0) {
            f.hidden = this.state.furni[previous].hidden;
            this.state.furni[previous] = f;
          } else this.state.furni.push(f);
          this.floorRaw.set(f.id, raws.get(f.id)!);
          if (f.hidden) p.blocked = true;
        }
      return;
    }
    if (is(aliases.self)) {
      const id = r.int(),
        username = r.string(),
        figure = r.string(),
        gender = r.string();
      this.state.self = { id, name: username, figure, gender };
      return;
    }
    if (is(aliases.room)) {
      const model = r.string(),
        id = r.int();
      this.confirmRoom(id, model);
      return;
    }
    if (is(aliases.close)) {
      this.resetRoom();
      this.pendingRoom = null;
      this.traceRoom(
        'room-closed',
        messageRef(
          'messages.closeconnectionConfirmedLeavingTheRoomRoomDataAndVisitorsAreCleared',
        ),
      );
      return;
    }
    if (
      is(['RoomEntryError']) ||
      (is(['ErrorReport']) &&
        r.data.length >= 4 &&
        r.data.readInt32BE(0) === -100002)
    ) {
      this.pendingRoom = null;
      const code = r.data.length >= 4 ? r.int() : null;
      this.traceRoom(
        'entry-error',
        messageRef('messages.entryErrorCurrentRoomDataIsPreserved', {
          v0: code === null ? '' : ` (${code})`,
        }),
      );
      return;
    }
    if (is(aliases.users)) {
      const avatars: Avatar[] = [];
      for (let i = 0, n = r.count(); i < n; i++) {
        const start = r.position;
        const id = r.int(),
          username = r.string(),
          motto = r.string(),
          figure = r.string(),
          index = r.int(),
          x = r.int(),
          y = r.int();
        r.string();
        r.int();
        const type = r.int();
        let gender = 'M';
        if (type === 1) {
          gender = r.string();
          r.int();
          r.int();
          r.string();
          r.string();
          r.int();
          r.bool();
        } else if (type === 2) {
          r.int();
          r.int();
          r.string();
          r.int();
          for (let j = 0; j < 6; j++) r.bool();
          r.int();
          r.string();
        } else if (type === 4) {
          gender = r.string();
          r.int();
          r.string();
          for (let j = 0, count = r.count(); j < count; j++) r.short();
        } else if (type !== 3)
          throw new Error(messageRef('errors.unknownAvatarType', { v0: type }));
        avatars.push({
          id,
          index,
          name: username,
          motto,
          figure,
          gender,
          x,
          y,
          type,
        });
        this.general.captureAvatar(
          avatars[avatars.length - 1],
          Buffer.from(r.data.subarray(start, r.position)),
        );
      }
      for (const avatar of avatars) {
        const existing = this.state.avatars.findIndex(
          (a) => a.index === avatar.index,
        );
        if (
          existing >= 0 &&
          this.state.avatars[existing].id === avatar.id &&
          this.state.avatars[existing].type === avatar.type
        ) {
          this.state.avatars[existing] = avatar;
          if (this.activeRoom) this.visitors.observe(avatar);
        } else {
          if (existing >= 0) {
            const previous = this.state.avatars[existing];
            if (this.activeRoom) this.visitors.leave(previous);
            this.state.avatars[existing] = avatar;
          } else this.state.avatars.push(avatar);
          if (this.activeRoom) this.visitors.observe(avatar);
          this.log(avatar.name, messageRef('messages.enteredTheRoom'), 'entry');
        }
      }
      if (this.activeRoom) this.publishVisitors();
      return;
    }
    if (is(aliases.remove)) {
      const index = Number(r.string()),
        avatar = this.state.avatars.find((a) => a.index === index);
      if (avatar) {
        this.log(avatar.name, messageRef('messages.leftTheRoom'), 'entry');
        if (this.activeRoom) {
          this.visitors.leave(avatar);
          this.publishVisitors();
        }
      }
      this.state.avatars = this.state.avatars.filter((a) => a.index !== index);
      return;
    }
    if (is([...aliases.chat, ...aliases.shout, ...aliases.whisper])) {
      const index = r.int(),
        text = r.string();
      const avatar = this.state.avatars.find((a) => a.index === index);
      this.log(
        avatar?.name ?? `#${index}`,
        text,
        is(aliases.whisper) ? 'whisper' : is(aliases.shout) ? 'shout' : 'chat',
      );
      return;
    }
    if (is(aliases.figure)) {
      const index = r.int(),
        figure = r.string(),
        gender = r.string(),
        motto = r.string();
      const avatar = this.state.avatars.find((a) => a.index === index);
      if (avatar) {
        Object.assign(avatar, { figure, gender, motto });
        if (avatar.id === this.state.self?.id)
          Object.assign(this.state.self, { figure, gender });
      } else if (index === -1 && this.state.self)
        Object.assign(this.state.self, { figure, gender });
      return;
    }
    if (is(aliases.inventory)) {
      const total = r.count(),
        part = r.int(),
        count = r.count();
      const items: InventoryItem[] = [];
      if (total < 1 || part < 0 || part >= total)
        throw new Error(messageRef('errors.invalidInventoryFragment'));
      for (let i = 0; i < count; i++) {
        const itemId = r.int(),
          type = r.string(),
          id = r.int(),
          kind = r.int();
        r.int();
        readStuff(r);
        r.bool();
        const tradeable = r.bool();
        r.bool();
        r.bool();
        r.int();
        r.bool();
        r.int();
        if (type.toUpperCase() === 'S') {
          r.string();
          r.int();
        }
        items.push({ itemId, type, id, kind, tradeable });
      }
      this.inventoryParts.set(part, items);
      if (this.inventoryParts.size === total) {
        this.state.inventory = [...this.inventoryParts.values()].flat();
        this.inventoryParts.clear();
      }
    }
  }
  saveSettings(value: Partial<Settings>) {
    if (!value || typeof value !== 'object')
      throw new Error(messageRef('errors.invalidSettings'));
    for (const [key, val] of Object.entries(value)) {
      if (!Object.hasOwn(defaults, key))
        throw new Error(messageRef('errors.unknownSetting'));
      if (typeof val !== typeof defaults[key as keyof Settings])
        throw new Error(messageRef('errors.invalidSettingType'));
    }
    const settings = { ...this.state.settings, ...value };
    if (!['auto', 'es', 'en'].includes(settings.language))
      throw new Error(messageRef('errors.invalidLanguage'));
    if (
      !['localhost', '127.0.0.1', '::1'].includes(settings.host) ||
      !Number.isInteger(settings.port) ||
      settings.port < 1 ||
      settings.port > 65535
    )
      throw new Error(messageRef('errors.invalidAddressOrPort'));
    if (
      !['mute', 'kick', 'ban', 'bounce'].includes(settings.clickAction) ||
      !['hour', 'day', 'perm'].includes(settings.banDuration) ||
      !Number.isInteger(settings.muteMinutes) ||
      settings.muteMinutes < 0 ||
      settings.muteMinutes > 30000 ||
      !Number.isInteger(settings.tonerId) ||
      settings.tonerId < 0 ||
      settings.tonerId > 2147483647 ||
      !/^#[0-9a-f]{6}$/i.test(settings.tonerColor) ||
      settings.petCommands.length > 10000
    )
      throw new Error(messageRef('errors.invalidGeneralOptions'));
    const before = this.state.settings;
    this.state.settings = settings;
    this.general.settingsChanged(before);
    this.emit('persist');
    this.changed();
  }
  sendNames(names: string[], body: Buffer = Buffer.alloc(0)) {
    const message = this.earth.resolve('out', names);
    if (!message)
      throw new Error(
        messageRef(
          'messages.gEarthHasNotIdentifiedEnableMessageNamesOrImportA',
          { v0: names[0] },
        ),
      );
    this.earth.send('out', message.id, body);
  }
  send(request: SendRequest) {
    if (
      !request ||
      !['in', 'out'].includes(request.direction) ||
      !Array.isArray(request.fields) ||
      request.fields.length > 200
    )
      throw new Error(messageRef('errors.invalidSendRequest'));
    const header =
      typeof request.header === 'number'
        ? request.header
        : this.earth.resolve(request.direction, [String(request.header)])?.id;
    if (
      header === undefined ||
      !Number.isInteger(header) ||
      header < 0 ||
      header > 65535
    )
      throw new Error(messageRef('errors.unknownOrInvalidHeader'));
    const w = new Writer();
    for (const field of request.fields) {
      switch (field.type) {
        case 'int':
          w.int(Number(field.value));
          break;
        case 'short':
          w.short(Number(field.value));
          break;
        case 'string':
          w.string(String(field.value));
          break;
        case 'bool':
          if (typeof field.value !== 'boolean')
            throw new Error(
              messageRef('messages.theBoolFieldMustBeTrueOrFalse'),
            );
          w.bool(field.value);
          break;
        case 'hex':
          w.raw(parseHex(String(field.value)));
          break;
        default:
          throw new Error(messageRef('errors.unknownFieldType'));
      }
    }
    const body = w.buffer();
    if (body.length > 65536)
      throw new Error(messageRef('errors.packetTooLarge'));
    this.earth.send(request.direction, header, body);
  }
  addOutfit(value: unknown) {
    const o = value as Outfit;
    if (
      !o ||
      typeof o.figure !== 'string' ||
      !/^[a-z0-9.-]{1,2048}$/i.test(o.figure) ||
      !['M', 'F', 'U'].includes(String(o.gender).toUpperCase()) ||
      typeof o.name !== 'string' ||
      !o.name.trim() ||
      o.name.length > 80
    )
      throw new Error(
        messageRef('messages.enterAValidNameGenderAndFigureCode'),
      );
    if (this.state.outfits.length >= 1000)
      throw new Error(messageRef('messages.limitOf1000Outfits'));
    this.state.outfits.push({
      id: randomUUID(),
      name: o.name.trim(),
      gender: o.gender.toUpperCase(),
      figure: o.figure,
    });
    this.emit('persist');
    this.changed();
  }
  action(name: string, value?: unknown) {
    switch (name) {
      case 'findFurni':
        this.furniHighlight.start(Number(value));
        break;
      case 'refreshFurniNames':
        if (!this.state.gameConnected || !this.state.session)
          throw new Error(
            messageRef('messages.connectHabboToLoadFurnitureNames'),
          );
        this.emit('furniCatalogRequest', this.state.session.host, true);
        break;
      case 'clearPasswords':
        this.general.clearPasswords();
        break;
      case 'restoreWalls':
        this.general.restoreWalls();
        break;
      case 'loadFriends':
        this.general.loadFriends();
        break;
      case 'self':
        this.sendNames(['InfoRetrieve', 'GetUserData']);
        break;
      case 'hideFurni': {
        const f = this.state.furni.find((f) => f.id === value);
        const raw = this.floorRaw.get(Number(value));
        if (!f || !raw)
          throw new Error(
            messageRef('messages.theFurnitureIsNoLongerAvailable'),
          );
        const message = this.earth.resolve('in', [
          f.hidden ? 'ObjectAdd' : 'ObjectRemove',
        ]);
        if (!message)
          throw new Error(
            messageRef(
              'messages.gEarthHasNotIdentifiedTheHideShowFurnitureMessage',
            ),
          );
        const body = f.hidden
          ? Buffer.concat([raw, new Writer().string(f.ownerName).buffer()])
          : new Writer()
              .string(String(f.id))
              .bool(false)
              .int(0)
              .int(0)
              .buffer();
        this.earth.send(
          'in',
          message.id,
          f.hidden
            ? Buffer.concat([
                this.general.floor.object(raw),
                new Writer().string(f.ownerName).buffer(),
              ])
            : body,
        );
        f.hidden = !f.hidden;
        break;
      }
      case 'useFurni':
        this.sendNames(
          ['UseFurniture', 'UseStuff'],
          new Writer().int(Number(value)).int(0).buffer(),
        );
        break;
      case 'rotateFurni': {
        const f = this.state.furni.find((f) => f.id === value);
        if (!f) throw new Error(messageRef('messages.furnitureNotFound'));
        this.sendNames(
          ['MoveObject'],
          new Writer()
            .int(f.id)
            .int(f.x)
            .int(f.y)
            .int((f.direction + 2) % 8)
            .buffer(),
        );
        break;
      }
      case 'clearChat':
        this.state.chat = [];
        break;
      case 'clearPackets':
        this.state.packets = [];
        break;
      case 'saveOutfit':
        this.addOutfit(value);
        break;
      case 'saveSelf':
        if (!this.state.self)
          throw new Error(
            messageRef('messages.yourProfileHasNotBeenReceivedYet'),
          );
        this.addOutfit({
          ...this.state.self,
          name: this.t('wardrobe.defaultName', {
            v0: this.state.outfits.length + 1,
          }),
        });
        break;
      case 'deleteOutfit':
        this.state.outfits = this.state.outfits.filter((o) => o.id !== value);
        this.emit('persist');
        break;
      case 'wearOutfit': {
        const o = this.state.outfits.find((o) => o.id === value);
        if (!o) throw new Error(messageRef('errors.unknownOutfit'));
        this.sendNames(
          ['UpdateFigureData', 'UpdateAvatar', 'ChangeLooks'],
          new Writer().string(o.gender).string(o.figure).buffer(),
        );
        break;
      }
      case 'inventory':
        this.inventoryParts.clear();
        this.sendNames(['RequestFurniInventory', 'GetFurnitureInventory']);
        break;
      case 'profile':
        this.sendNames(
          ['GetExtendedProfile', 'GetUserProfile'],
          new Writer().int(Number(value)).bool(true).buffer(),
        );
        break;
      case 'motto':
        this.sendNames(
          ['ChangeMotto'],
          new Writer().string(String(value).slice(0, 254)).buffer(),
        );
        break;
      case 'goto':
        this.sendNames(
          ['OpenFlatConnection', 'OpenConnection'],
          new Writer().int(Number(value)).string('').buffer(),
        );
        break;
      case 'exit':
        this.sendNames(['Quit', 'QuitRoom']);
        break;
      case 'mapping': {
        if (!this.state.gameConnected)
          throw new Error(messageRef('messages.connectHabboBeforeLoadingAMap'));
        if (!Array.isArray(value) || value.length > 10000)
          throw new Error(messageRef('messages.theMapMustBeAJsonArray'));
        const entries = value as Snapshot['messages'];
        if (
          entries.some(
            (m) =>
              !Number.isInteger(m.id) ||
              m.id < 0 ||
              m.id > 65535 ||
              !['in', 'out'].includes(m.direction) ||
              typeof m.name !== 'string' ||
              m.name.length > 200,
          )
        )
          throw new Error(messageRef('errors.invalidMap'));
        this.earth.messages = entries.map((m) => ({ ...m, hash: '' }));
        this.state.messages = this.earth.messages;
        this.general.syncHeartbeat();
        this.notice(
          messageRef('messages.mapLoadedMessagesForThisSession', {
            v0: entries.length,
          }),
        );
        break;
      }
      default:
        throw new Error(messageRef('errors.unknownAction'));
    }
    this.changed();
  }
  private command(text: string) {
    const [command, ...args] = text.slice(1).split(' ');
    const arg = args.join(' ');
    switch (command.toLowerCase()) {
      case 'x':
      case 'isora':
        this.earth.emit('activate');
        break;
      case 'clear':
        this.action('clearChat');
        break;
      case 'goto':
        this.action('goto', Number(arg));
        break;
      case 'exit':
        this.action('exit');
        break;
      case 'motto':
        this.action('motto', arg);
        break;
      case 'reload':
        if (!this.state.room.id)
          throw new Error(messageRef('messages.noCurrentRoom'));
        this.action('goto', this.state.room.id);
        break;
      case 'saveoutfit':
        this.action('saveSelf');
        break;
    }
  }
}
