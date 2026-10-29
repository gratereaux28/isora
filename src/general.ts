import { formatMessage } from './i18n';
import { messageRef } from './i18n';
import type { Model } from './model';
import type { Settings, Avatar } from './shared';
import { generalInitial } from './general-options';
import { Reader, Writer, type Intercept } from './protocol/packet';
import { normalize } from './protocol/gearth';
import { FloorTransform } from './room-transform';

const GHOST = -183;
type RespectActor = Pick<Avatar, 'id' | 'index' | 'name'>;
interface PendingRespect {
  user: RespectActor;
  total: number;
  from?: RespectActor;
  time: number;
}
const vectors = [
  [-1000, -10000],
  [1000, -10000],
  [10000, -1000],
  [10000, 1000],
  [1000, 10000],
  [-1000, 10000],
  [-10000, 1000],
  [-10000, -1000],
];
export class General {
  readonly floor = new FloorTransform();
  private heartbeat?: ReturnType<typeof setInterval>;
  private delayed = new Set<ReturnType<typeof setTimeout>>();
  private epoch = 0;
  private avatarRaw = new Map<number, Buffer>();
  private wallRaw = new Map<number, Buffer>();
  private friends = new Map<number, string>();
  private friendParts = new Map<number, Map<number, string>>();
  private friendRequestUntil = 0;
  private passwords = new Map<string, string>();
  private roomRequest?: {
    id: number;
    password: string;
    time: number;
    hotel: string;
  };
  private lastLook?: { x: number; y: number };
  private selected = { id: -1, time: 0 };
  private selfIdle = false;
  private respectGestures: { user: RespectActor; time: number }[] = [];
  private pendingRespects: PendingRespect[] = [];
  private tonerValues = new Map<number, number[]>();
  private lastDirection = 0;
  private latestHand = 0;
  private realRights = false;
  private fakeRights = false;
  private sessionGeneration = 0;
  constructor(private model: Model) {}
  private get s() {
    return this.model.state.settings;
  }
  private get state() {
    return this.model.state.general;
  }
  private get self() {
    return this.model.state.avatars.find(
      (a) => a.id === this.model.state.self?.id,
    );
  }
  private hotel() {
    return this.model.state.session?.host ?? '';
  }
  private passwordKey(hotel: string, room: number) {
    return `${hotel}:${room}`;
  }
  captureAvatar(avatar: Avatar, raw: Buffer) {
    this.avatarRaw.set(avatar.index, raw);
  }
  exportPasswords() {
    return Object.fromEntries(this.passwords);
  }
  importPasswords(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(messageRef('errors.invalidPasswords'));
    const entries = Object.entries(value);
    if (
      entries.length > 5000 ||
      entries.some(
        ([k, v]) => k.length > 300 || typeof v !== 'string' || v.length > 1024,
      )
    )
      throw new Error(messageRef('errors.invalidPasswords'));
    this.passwords = new Map(entries as [string, string][]);
    this.state.passwords = this.passwords.size;
  }
  clearPasswords() {
    this.passwords.clear();
    this.state.passwords = 0;
    this.model.emit('passwords');
    this.model.changed();
  }
  private savePasswords() {
    this.state.passwords = this.passwords.size;
    this.model.emit('passwords');
  }
  private later(fn: () => void, delay = 0) {
    const epoch = this.epoch;
    const run = () => {
      if (epoch !== this.epoch || !this.model.earth.gameConnected) return;
      try {
        fn();
      } catch (e) {
        this.model.notice((e as Error).message);
      }
    };
    if (!delay) {
      queueMicrotask(run);
      return;
    }
    const timer = setTimeout(() => {
      this.delayed.delete(timer);
      run();
    }, delay);
    timer.unref();
    this.delayed.add(timer);
  }
  private out(names: string[], body: Buffer = Buffer.alloc(0)) {
    this.model.sendNames(names, body);
  }
  private incoming(names: string[], body: Buffer) {
    const msg = this.model.earth.resolve('in', names);
    if (!msg)
      throw new Error(
        messageRef('messages.messageNotIdentified', { v0: names[0] }),
      );
    this.model.earth.send('in', msg.id, body);
  }
  private has(direction: 'in' | 'out', names: string[]) {
    return !!this.model.earth.resolve(direction, names);
  }
  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.state.antiIdleRunning = false;
    this.state.nextAntiIdle = null;
  }
  syncHeartbeat() {
    const active =
      this.model.earth.gameConnected &&
      (this.s.antiIdle || this.s.antiIdleOut) &&
      this.has('out', ['Expression', 'AvatarExpression']);
    if (!active) {
      this.stopHeartbeat();
      return;
    }
    if (this.heartbeat) return;
    this.state.antiIdleRunning = true;
    this.state.nextAntiIdle = new Date(Date.now() + 60000).toISOString();
    this.heartbeat = setInterval(() => {
      if (
        !this.model.earth.gameConnected ||
        !(this.s.antiIdle || this.s.antiIdleOut)
      ) {
        this.stopHeartbeat();
        return;
      }
      try {
        if (this.s.antiIdle || this.selfIdle) {
          this.out(
            ['Expression', 'AvatarExpression'],
            new Writer().int(this.s.antiIdle ? 0 : 5).buffer(),
          );
          this.state.lastAntiIdle = new Date().toISOString();
        }
      } catch (e) {
        this.model.notice(`Anti-AFK: ${(e as Error).message}`);
        this.stopHeartbeat();
        return;
      }
      this.state.nextAntiIdle = new Date(Date.now() + 60000).toISOString();
      this.model.changed();
    }, 60000);
    this.heartbeat.unref();
  }
  sessionStarted() {
    this.sessionGeneration++;
    this.friends.clear();
    this.friendParts.clear();
    this.state.friends = 0;
    this.state.friendsLoaded = false;
    this.syncHeartbeat();
    this.later(() => {
      if (this.has('out', ['InfoRetrieve'])) this.out(['InfoRetrieve']);
    });
  }
  sessionEnded() {
    this.friendRequestUntil = 0;
    this.sessionGeneration++;
    this.stopHeartbeat();
    this.resetRoom();
    this.friends.clear();
    this.friendParts.clear();
    this.state.friends = 0;
    this.state.friendsLoaded = false;
    this.roomRequest = undefined;
  }
  dispose() {
    this.sessionEnded();
  }
  resetRoom() {
    this.epoch++;
    for (const t of this.delayed) clearTimeout(t);
    this.delayed.clear();
    this.avatarRaw.clear();
    this.wallRaw.clear();
    this.tonerValues.clear();
    this.floor.reset(this.s.flattenFloor);
    this.selfIdle = false;
    this.lastLook = undefined;
    this.selected = { id: -1, time: 0 };
    this.respectGestures = [];
    this.pendingRespects = [];
    this.realRights = false;
    this.fakeRights = false;
    Object.assign(this.state, {
      ...structuredClone(generalInitial),
      passwords: this.passwords.size,
      friends: this.friends.size,
      friendsLoaded: this.state.friendsLoaded,
      antiIdleRunning: !!this.heartbeat,
      nextAntiIdle: this.state.nextAntiIdle,
      lastAntiIdle: this.state.lastAntiIdle,
    });
  }
  settingsChanged(before: Settings) {
    this.syncHeartbeat();
    if (
      (this.s.antiIdle || this.s.antiIdleOut) &&
      !this.has('out', ['Expression', 'AvatarExpression']) &&
      this.model.earth.gameConnected
    )
      this.model.notice(
        messageRef('messages.antiAfkPendingGEarthHasNotIdentifiedExpression'),
      );
    if (!this.model.earth.gameConnected) return;
    if (
      ['pickInfo', 'pickMarket', 'pickHide', 'pickTele'].some(
        (key) =>
          before[key as keyof Settings] !== this.s[key as keyof Settings],
      )
    )
      this.later(() => this.applyPickRights());
    if (before.hideAvatars !== this.s.hideAvatars)
      this.later(() => this.applyAvatarVisibility());
    if (before.selfOverlay !== this.s.selfOverlay)
      this.later(() => this.overlay());
    if (before.clickThrough !== this.s.clickThrough)
      this.later(() =>
        this.incoming(
          ['YouArePlayingGame'],
          new Writer().bool(this.s.clickThrough).buffer(),
        ),
      );
    if (!before.blockTrade && this.s.blockTrade)
      this.later(() => {
        if (this.has('out', ['CloseTrading', 'TradingClose']))
          this.out(['CloseTrading', 'TradingClose']);
      });
    if (
      before.tonerId !== this.s.tonerId ||
      before.tonerColor !== this.s.tonerColor ||
      before.tonerActive !== this.s.tonerActive
    )
      this.later(() => this.updateToner(before));
  }
  private applyPickRights() {
    const enabled =
      this.s.pickInfo ||
      this.s.pickMarket ||
      this.s.pickHide ||
      this.s.pickTele;
    const id = this.model.state.room.id;
    if (!id || this.realRights) return;
    if (enabled && !this.fakeRights) {
      this.incoming(['YouAreController'], new Writer().int(id).int(4).buffer());
      this.fakeRights = true;
    } else if (!enabled && this.fakeRights) {
      this.incoming(['YouAreNotController'], new Writer().int(id).buffer());
      this.fakeRights = false;
    }
  }
  private applyAvatarVisibility() {
    if (this.s.hideAvatars) {
      for (const avatar of this.model.state.avatars)
        this.incoming(
          ['UserRemove'],
          new Writer().string(String(avatar.index)).buffer(),
        );
      if (this.state.overlayActive)
        this.incoming(
          ['UserRemove'],
          new Writer().string(String(GHOST)).buffer(),
        );
      this.state.overlayActive = false;
    } else {
      const raws = this.model.state.avatars
        .map((a) => this.avatarRaw.get(a.index))
        .filter((b): b is Buffer => !!b);
      if (raws.length)
        this.incoming(
          ['Users'],
          this.floor.avatars(
            new Writer().int(raws.length).raw(Buffer.concat(raws)).buffer(),
          ),
        );
      this.overlay();
    }
  }
  private overlay() {
    if (!this.s.selfOverlay || this.s.hideAvatars) {
      if (this.state.overlayActive)
        this.incoming(
          ['UserRemove'],
          new Writer().string(String(GHOST)).buffer(),
        );
      this.state.overlayActive = false;
      return;
    }
    const self = this.self;
    if (!self) return;
    const raw = this.avatarRaw.get(self.index);
    if (!raw) return;
    const ghost = this.floor.ghostAvatar(raw, GHOST);
    this.incoming(['Users'], new Writer().int(1).raw(ghost).buffer());
    this.incoming(
      ['AvatarEffect'],
      new Writer().int(GHOST).int(13).int(0).buffer(),
    );
    this.state.overlayActive = true;
    this.model.changed();
  }
  private turn(direction: number) {
    const [x, y] = vectors[((direction % 8) + 8) % 8];
    this.out(['LookTo'], new Writer().int(x).int(y).buffer());
  }
  private moderate(id: number) {
    const user = this.model.state.avatars.find(
      (a) => a.id === id && a.type === 1,
    );
    if (
      !user ||
      user.id === this.model.state.self?.id ||
      !this.model.state.room.id
    )
      return;
    if (!this.model.state.self) {
      this.model.notice(messageRef('messages.loadProfileBeforeClickTo'));
      return;
    }
    if (this.s.excludeFriends && !this.state.friendsLoaded) {
      this.model.notice(messageRef('messages.clickToWaitingForFriends'));
      return;
    }
    if (this.s.excludeFriends && this.friends.has(id)) return;
    const room = this.model.state.room.id;
    switch (this.s.clickAction) {
      case 'mute':
        this.out(
          ['MuteUser'],
          new Writer().int(id).int(room).int(this.s.muteMinutes).buffer(),
        );
        break;
      case 'kick':
        this.out(['KickUser'], new Writer().int(id).buffer());
        break;
      case 'ban':
        this.out(
          ['BanUserWithDuration'],
          new Writer()
            .int(id)
            .int(room)
            .string(
              `RWUAM_BAN_USER_${this.s.banDuration === 'perm' ? 'PERM' : this.s.banDuration.toUpperCase()}`,
            )
            .buffer(),
        );
        break;
      case 'bounce':
        if (!this.has('out', ['UnbanUserFromRoom']))
          throw new Error(messageRef('errors.bounceUnbanUnavailable'));
        this.out(
          ['BanUserWithDuration'],
          new Writer().int(id).int(room).string('RWUAM_BAN_USER_HOUR').buffer(),
        );
        // Capture room/id; do not cancel the unban when the user leaves the room.
        {
          const generation = this.sessionGeneration;
          const timer = setTimeout(() => {
            if (
              this.model.earth.gameConnected &&
              this.hotel() === hotel &&
              this.sessionGeneration === generation
            ) {
              try {
                this.out(
                  ['UnbanUserFromRoom'],
                  new Writer().int(id).int(room).buffer(),
                );
              } catch (e) {
                this.model.notice(
                  messageRef('errors.couldNotUnbanInRoom', {
                    v0: id,
                    v1: room,
                    v2: (e as Error).message,
                  }),
                );
              }
            } else
              this.model.notice(
                messageRef('messages.bounceInterruptedCheckTheBanForInRoom', {
                  v0: id,
                  v1: room,
                }),
              );
          }, 100);
          const hotel = this.hotel();
          timer.unref();
        }
        break;
    }
    this.model.notice(
      messageRef('messages.clickToTheServerWillCheckYourPermissions', {
        v0: this.s.clickAction,
        v1: user.name,
      }),
    );
  }
  private readFriend(r: Reader) {
    const id = r.int(),
      name = r.string();
    r.int();
    r.bool();
    r.bool();
    r.string();
    r.int();
    r.string();
    r.string();
    r.string();
    r.bool();
    r.bool();
    r.bool();
    r.short();
    return { id, name };
  }
  private handleFriends(name: string, r: Reader) {
    if (name === 'friendlistfragment') {
      const total = r.count(),
        part = r.int(),
        entries = new Map<number, string>();
      if (part < 0 || part >= total)
        throw new Error(messageRef('errors.invalidFriendsFragment'));
      for (let i = 0, n = r.count(); i < n; i++) {
        const f = this.readFriend(r);
        entries.set(f.id, f.name);
      }
      this.friendParts.set(part, entries);
      if (this.friendParts.size === total) {
        this.friends = new Map(
          [...this.friendParts.values()].flatMap((m) => [...m]),
        );
        this.friendParts.clear();
        this.state.friendsLoaded = true;
        this.friendRequestUntil = 0;
      }
    } else {
      for (let i = 0, n = r.count(); i < n; i++) {
        r.int();
        r.string();
      }
      for (let i = 0, n = r.count(); i < n; i++) {
        const type = r.int();
        if (type === -1) this.friends.delete(r.int());
        else if (type === 0 || type === 1) {
          const f = this.readFriend(r);
          this.friends.set(f.id, f.name);
        } else throw new Error(messageRef('errors.invalidFriendsUpdate'));
      }
    }
    this.state.friends = this.friends.size;
  }
  handle(p: Intercept) {
    const name = normalize(
      this.model.earth.messages.find(
        (m) => m.id === p.header && m.direction === p.direction,
      )?.name ?? '',
    );
    const r = new Reader(p.body);
    const s = this.s;
    if (p.direction === 'out') {
      if ((name === 'messengerinit' || name === 'getfriendlist') && !p.blocked)
        this.friendRequestUntil = 0;
      if (name === 'lookto' || name === 'looktoavatar') {
        this.lastLook = { x: r.int(), y: r.int() };
      }
      if (
        (name === 'moveavatar' || name === 'move') &&
        s.noWalk &&
        s.turnOnClick
      ) {
        const x = r.int(),
          y = r.int();
        this.later(() =>
          this.out(['LookTo'], new Writer().int(x).int(y).buffer()),
        );
      }
      if (name === 'getselectedbadges') {
        const id = r.int();
        const repeated =
          this.selected.id === id && Date.now() - this.selected.time < 1500;
        this.selected = { id, time: Date.now() };
        if (s.noTurn && s.turnOnReselect && repeated && this.lastLook) {
          const look = { ...this.lastLook };
          this.later(() =>
            this.out(['LookTo'], new Writer().int(look.x).int(look.y).buffer()),
          );
        }
        if (s.clickTo) this.later(() => this.moderate(id));
      }
      if (name === 'openflatconnection' || name === 'openconnection') {
        const id = r.int(),
          password = r.string();
        this.roomRequest = {
          id,
          password,
          time: Date.now(),
          hotel: this.hotel(),
        };
        if (s.rememberPasswords && !password) {
          const stored = this.passwords.get(this.passwordKey(this.hotel(), id));
          if (stored) {
            p.body = Buffer.concat([
              new Writer().int(id).string(stored).buffer(),
              r.take(r.data.length - r.position),
            ]);
            p.modified = true;
          }
        }
      }
      if (
        name === 'pickupobject' &&
        (s.pickInfo || s.pickMarket || s.pickHide || s.pickTele)
      ) {
        p.blocked = true;
        const type = r.int(),
          id = r.int();
        this.later(() => this.pick(type, id));
      }
      return;
    }
    if (name === 'friendlistfragment' && this.friendRequestUntil > Date.now())
      p.blocked = true;
    if (name === 'friendlistfragment' || name === 'friendlistupdate')
      this.handleFriends(name, r);
    if (name === 'roomready') {
      if (
        s.rememberPasswords &&
        this.roomRequest &&
        this.roomRequest.id === this.model.state.room.id &&
        this.roomRequest.password &&
        Date.now() - this.roomRequest.time < 30000
      ) {
        const request = this.roomRequest;
        this.passwords.set(
          this.passwordKey(request.hotel, request.id),
          request.password,
        );
        this.savePasswords();
      }
      this.roomRequest = undefined;
    }
    if (
      name === 'errorreport' &&
      r.int() === -100002 &&
      this.roomRequest &&
      s.rememberPasswords
    ) {
      this.passwords.delete(
        this.passwordKey(this.roomRequest.hotel, this.roomRequest.id),
      );
      this.savePasswords();
      this.model.notice(
        messageRef('messages.theRejectedRoomPasswordWasRemoved'),
      );
    }
    if (name === 'getguestroomresult' && s.rememberPasswords)
      this.rewriteRoomEntry(p);
    if (name === 'doorbell' && s.acceptFriends) {
      const username = r.string();
      if (
        [...this.friends.values()].some(
          (n) => n.toLowerCase() === username.toLowerCase(),
        )
      ) {
        p.blocked = true;
        this.later(() =>
          this.out(
            ['LetUserIn'],
            new Writer().string(username).bool(true).buffer(),
          ),
        );
      }
    }
    if (name === 'roomentryinfo') this.later(() => this.applyPickRights());
    if (name === 'youarecontroller') {
      r.int();
      this.realRights = r.int() > 0;
      this.fakeRights = false;
    }
    if (name === 'youarenotcontroller') {
      this.realRights = false;
      this.fakeRights = false;
      this.later(() => this.applyPickRights());
    }
    if (name === 'roomentryinfo' && s.clickThrough)
      this.later(() =>
        this.incoming(['YouArePlayingGame'], new Writer().bool(true).buffer()),
      );
    if (name.startsWith('trading') && s.blockTrade) {
      p.blocked = true;
      if (name === 'tradingopen')
        this.later(() => this.out(['CloseTrading', 'TradingClose']));
    }
    if (['chat', 'shout', 'whisper'].includes(name)) {
      const index = r.int(),
        text = r.string(),
        avatar = this.model.state.avatars.find((a) => a.index === index);
      let bubble = -1;
      if (r.data.length - r.position >= 8) {
        r.int();
        bubble = r.int();
      }
      if (
        s.muteAll ||
        (s.mutePets && avatar?.type === 2) ||
        (s.muteBots && [3, 4].includes(avatar?.type ?? 0)) ||
        (s.muteWired && bubble === 34)
      )
        p.blocked = true;
      if (s.mutePetCommands) {
        const space = text.indexOf(' ');
        if (space > 0) {
          const pet = text.slice(0, space),
            command = text
              .slice(space + 1)
              .trim()
              .toLowerCase();
          if (
            (pet.toLowerCase() === 'bobba' ||
              this.model.state.avatars.some(
                (a) =>
                  a.type === 2 && a.name.toLowerCase() === pet.toLowerCase(),
              )) &&
            s.petCommands.toLowerCase().split('|').includes(command)
          )
            p.blocked = true;
        }
      }
    }
    if (name === 'expression' || name === 'avatarexpression') {
      const index = r.int(),
        action = r.int();
      if (action === 7) this.captureRespect(index);
    }
    if (name === 'respectnotification') {
      this.respectNotification(p, r);
    }
    if (name === 'petrespectnotification' && (s.muteScratches || s.muteAll))
      p.blocked = true;
    if (name === 'clubgiftnotification' && s.blockHcGift) p.blocked = true;
    if (name === 'sleep' || name === 'useridle') {
      const index = r.int(),
        idle = r.bool();
      if (index === this.self?.index) this.selfIdle = idle;
    }
    if (name === 'handitemreceived') {
      const fromIndex = r.int();
      const from = this.model.state.avatars.find((a) => a.index === fromIndex);
      const direction = this.lastDirection;
      if (s.returnHandItem && from) {
        p.blocked = true;
        this.later(() =>
          this.out(['PassCarryItem'], new Writer().int(from.id).buffer()),
        );
      } else if (s.dropHandItem) {
        p.blocked = true;
        this.later(() => this.out(['DropCarryItem']));
      }
      if (s.maintainDirection) {
        const serial = ++this.latestHand;
        this.later(() => {
          if (serial === this.latestHand) this.turn(direction + 4);
        }, 1000);
        this.later(() => {
          if (serial === this.latestHand) this.turn(direction);
        }, 1100);
      }
    }
    if (['items', 'itemadd', 'itemupdate', 'itemremove'].includes(name))
      this.wallItems(p, name);
    if (name === 'marketplaceitemstats') this.market(r);
    if (name === 'objectdataupdate') this.tonerData(r);
    if (name === 'userremove') this.avatarRaw.delete(Number(r.string()));
    if (name === 'users' && s.hideAvatars) p.blocked = true;
    if (name === 'users' || name === 'userobject' || name === 'userchange')
      this.later(() => {
        if (s.selfOverlay && !this.state.overlayActive) this.overlay();
      });
    if (name === 'userchange' && this.state.overlayActive) {
      const index = r.int();
      if (index === this.self?.index || index === -1) {
        const body = Buffer.concat([
          new Writer().int(GHOST).buffer(),
          r.take(r.data.length - r.position),
        ]);
        this.later(() => this.incoming(['UserChange'], body));
      }
    }
    if (name === 'userchange') this.refreshAvatarAppearance(p.body);
    if (name === 'userupdate') this.updates(p);
    this.floor.transform(p, name, this.model);
    this.state.flattenActive = this.floor.active;
  }
  whisper(index: number, text: string, bubbleStyle: 0 | 1 = 0) {
    this.incoming(
      ['Whisper'],
      // Style 0 retains the avatar, name and clickable room identity. Style 1 hides them.
      new Writer()
        .int(index)
        .string(formatMessage(text, this.model.language))
        .int(0)
        .int(bubbleStyle)
        .int(0)
        .int(0)
        .buffer(),
    );
  }
  loadFriends() {
    if (this.friendRequestUntil > Date.now())
      throw new Error(messageRef('errors.friendsAlreadyLoading'));
    if (!this.model.state.gameConnected)
      throw new Error(messageRef('messages.connectHabboToLoadYourFriends'));
    this.friendParts.clear();
    this.friendRequestUntil = Date.now() + 5000;
    try {
      this.out(['MessengerInit', 'GetFriendList']);
    } catch (e) {
      this.friendRequestUntil = 0;
      throw e;
    }
  }
  private captureRespect(index: number) {
    const avatar = this.model.state.avatars.find(
      (a) => a.index === index && a.type === 1,
    );
    if (!avatar) return;
    const user: RespectActor = {
      id: avatar.id,
      index: avatar.index,
      name: avatar.name,
    };
    const now = Date.now();
    const pending = this.pendingRespects.filter(
      (p) => !p.from && now - p.time <= 150,
    );
    if (pending.length === 1) {
      if (pending[0].user.id !== user.id) pending[0].from = user;
    } else if (pending.length > 1) return;
    else {
      this.respectGestures = this.respectGestures.filter(
        (g) => now - g.time < 500,
      );
      this.respectGestures.push({ user, time: now });
      this.respectGestures = this.respectGestures.slice(-32);
    }
  }
  private respectNotification(p: Intercept, r: Reader) {
    const id = r.int(),
      total = r.int(),
      now = Date.now();
    if (total < 0) return;
    const candidates = this.respectGestures.filter((g) => now - g.time < 500);
    // RespectNotification contains the recipient and total, never the giver.
    // Only attribute an unambiguous recent thumbs-up; never reuse it for another notification.
    this.respectGestures = [];
    const from =
      candidates.length === 1 && candidates[0].user.id !== id
        ? candidates[0].user
        : undefined;
    if (this.s.muteRespects || this.s.muteAll) {
      p.blocked = true;
      return;
    }
    if (p.blocked || (!this.s.showRespecter && !this.s.showRespectTotal))
      return;
    const avatar = this.model.state.avatars.find(
      (a) => a.id === id && a.type === 1,
    );
    if (!avatar || !this.has('in', ['Whisper'])) return;
    p.blocked = true;
    if (this.pendingRespects.length >= 32) this.pendingRespects.shift();
    const pending: PendingRespect = {
      user: { id: avatar.id, index: avatar.index, name: avatar.name },
      total,
      from,
      time: now,
    };
    this.pendingRespects.push(pending);
    // Some clients deliver the gesture immediately after the notification.
    this.later(() => this.finishRespect(pending), from ? 0 : 150);
  }
  private finishRespect(pending: PendingRespect) {
    const index = this.pendingRespects.indexOf(pending);
    if (index < 0) return;
    this.pendingRespects.splice(index, 1);
    if (
      this.s.muteAll ||
      this.s.muteRespects ||
      (!this.s.showRespecter && !this.s.showRespectTotal)
    )
      return;
    const user = this.model.state.avatars.find(
      (a) =>
        a.id === pending.user.id &&
        a.index === pending.user.index &&
        a.name === pending.user.name &&
        a.type === 1,
    );
    if (!user) return;
    let text = this.model.t('respect.recipient', {
      recipient: user.name,
    });
    if (this.s.showRespecter)
      text += this.model.t('respect.giver', {
        giver: pending.from?.name ?? this.model.t('respect.unknownGiver'),
      });
    if (this.s.showRespectTotal) text += ` (${pending.total})`;
    this.whisper(user.index, text, 1);
  }
  private refreshAvatarAppearance(body: Buffer) {
    const r = new Reader(body),
      packetIndex = r.int(),
      figure = r.string(),
      gender = r.string(),
      motto = r.string();
    const index = packetIndex === -1 ? this.self?.index : packetIndex;
    if (index === undefined) return;
    const raw = this.avatarRaw.get(index);
    if (!raw) return;
    const a = new Reader(raw),
      id = a.int(),
      name = a.string();
    a.string();
    a.string();
    const common = a.position;
    a.int();
    a.int();
    a.int();
    a.string();
    a.int();
    const type = a.int();
    if (type !== 1) return;
    const genderStart = a.position;
    a.string();
    this.avatarRaw.set(
      index,
      new Writer()
        .int(id)
        .string(name)
        .string(motto)
        .string(figure)
        .raw(raw.subarray(common, genderStart))
        .string(gender)
        .raw(raw.subarray(a.position))
        .buffer(),
    );
  }
  private rewriteRoomEntry(p: Intercept) {
    const r = new Reader(p.body);
    r.bool();
    const id = r.int();
    r.string();
    r.int();
    r.string();
    const access = r.int();
    r.int();
    r.int();
    r.string();
    r.int();
    r.int();
    r.int();
    r.int();
    for (let i = 0, n = r.count(); i < n; i++) r.string();
    const flags = r.int();
    if (flags & 1) r.string();
    if (flags & 2) {
      r.int();
      r.string();
      r.string();
    }
    if (flags & 4) {
      r.string();
      r.string();
      r.int();
    }
    r.bool();
    r.bool();
    if (
      access === 2 &&
      this.passwords.has(this.passwordKey(this.hotel(), id))
    ) {
      p.body = Buffer.from(p.body);
      p.body[r.position] = 1;
      p.modified = true;
    }
  }
  private updates(p: Intercept) {
    const r = new Reader(p.body);
    const w = new Writer();
    const ghost: Buffer[] = [];
    const count = r.count();
    for (let i = 0; i < count; i++) {
      const start = r.position,
        index = r.int(),
        x = r.int(),
        y = r.int(),
        z = r.string(),
        head = r.int(),
        direction = r.int(),
        status = r.string();
      const avatar = this.model.state.avatars.find((a) => a.index === index);
      if (avatar) Object.assign(avatar, { x, y });
      const raw = this.avatarRaw.get(index);
      if (raw) {
        const a = new Reader(raw);
        a.int();
        a.string();
        a.string();
        a.string();
        const prefix = a.position;
        a.int();
        a.int();
        a.int();
        a.string();
        a.int();
        this.avatarRaw.set(
          index,
          new Writer()
            .raw(raw.subarray(0, prefix))
            .int(index)
            .int(x)
            .int(y)
            .string(z)
            .int(direction)
            .raw(raw.subarray(a.position))
            .buffer(),
        );
      }
      const self = index === this.self?.index;
      if (self) this.lastDirection = direction;
      w.raw(r.data.subarray(start, r.position));
      if (
        self &&
        this.state.overlayActive &&
        this.s.selfOverlay &&
        !this.s.hideAvatars
      )
        ghost.push(
          this.floor.ghostUpdate({ x, y, z, head, direction, status }, GHOST),
        );
    }
    if (ghost.length) {
      p.body = new Writer()
        .int(count + ghost.length)
        .raw(w.buffer())
        .raw(Buffer.concat(ghost))
        .buffer();
      p.modified = true;
    }
  }
  private wallItems(p: Intercept, name: string) {
    const r = new Reader(p.body);
    if (name === 'itemremove') {
      const id = Number(r.string());
      this.wallRaw.delete(id);
      this.state.wallItems = this.state.wallItems.filter((f) => f.id !== id);
      return;
    }
    const owners = new Map<number, string>(),
      list = name === 'items';
    if (list)
      for (let i = 0, n = r.count(); i < n; i++)
        owners.set(r.int(), r.string());
    const count = list ? r.count() : 1;
    const entries: typeof this.state.wallItems = [];
    const raws = new Map<number, Buffer>();
    for (let i = 0; i < count; i++) {
      const start = r.position,
        id = Number(r.string()),
        kind = r.int(),
        location = r.string();
      r.string();
      r.int();
      r.int();
      const ownerId = r.int(),
        end = r.position;
      const owner =
        name === 'itemadd'
          ? r.string()
          : (owners.get(ownerId) ??
            this.state.wallItems.find((f) => f.id === id)?.owner ??
            String(ownerId));
      entries.push({ id, kind, owner, location, hidden: false });
      raws.set(id, Buffer.from(r.data.subarray(start, end)));
    }
    if (list) {
      this.state.wallItems = entries;
      this.wallRaw = raws;
    } else
      for (const f of entries) {
        const index = this.state.wallItems.findIndex((e) => e.id === f.id);
        if (index >= 0) {
          f.hidden = this.state.wallItems[index].hidden;
          this.state.wallItems[index] = f;
        } else this.state.wallItems.push(f);
        this.wallRaw.set(f.id, raws.get(f.id)!);
        if (f.hidden) p.blocked = true;
      }
  }
  pick(type: number, id: number) {
    const floor =
        type === 2
          ? this.model.state.furni.find((f) => f.id === id)
          : undefined,
      wall =
        type === 1 ? this.state.wallItems.find((f) => f.id === id) : undefined;
    if (!floor && !wall)
      throw new Error(
        messageRef('messages.thatFurnitureIsNotLoadedReEnterTheRoom'),
      );
    const item = floor ?? wall!;
    this.state.selectedFurni = {
      id,
      type: floor ? 'floor' : 'wall',
      kind: item.kind,
      owner: floor ? floor.ownerName : wall!.owner,
      location: floor ? `${floor.x}, ${floor.y}, ${floor.z}` : wall!.location,
      linkId: floor?.linkId,
    };
    if (this.s.pickInfo)
      this.model.notice(
        messageRef('messages.furnitureType2', {
          v0: id,
          v1: item.kind,
          v2: this.state.selectedFurni.location,
          v3: this.state.selectedFurni.owner,
        }),
      );
    if (this.s.pickMarket)
      this.out(
        ['GetMarketplaceItemStats'],
        new Writer()
          .int(floor ? 1 : 2)
          .int(item.kind)
          .buffer(),
      );
    if (this.s.pickHide) {
      if (floor) {
        if (!floor.hidden) this.model.action('hideFurni', id);
      } else if (!wall!.hidden) {
        this.incoming(
          ['ItemRemove'],
          new Writer().string(String(id)).int(0).buffer(),
        );
        wall!.hidden = true;
      }
    }
    if (this.s.pickTele && floor) {
      const link = this.model.state.furni.find((f) => f.id === floor.linkId);
      if (link) {
        this.model.notice(
          messageRef('messages.linkedTeleporter', {
            id: link.id,
            x: link.x,
            y: link.y,
          }),
        );
        this.incoming(
          ['ObjectDataUpdate'],
          new Writer().string(String(link.id)).int(0).string('1').buffer(),
        );
        this.later(
          () =>
            this.incoming(
              ['ObjectAdd'],
              new Writer()
                .raw(this.floor.object(this.model.getFloorRaw(link.id)!))
                .string(link.ownerName)
                .buffer(),
            ),
          1000,
        );
      } else
        this.model.notice(
          messageRef('messages.theLinkedTeleporterIsNotInThisRoom'),
        );
    }
    this.model.changed();
  }
  restoreWalls() {
    for (const wall of this.state.wallItems) {
      if (wall.hidden) {
        const raw = this.wallRaw.get(wall.id);
        if (raw)
          this.incoming(
            ['ItemAdd'],
            new Writer().raw(raw).string(wall.owner).buffer(),
          );
        wall.hidden = false;
      }
    }
    this.model.changed();
  }
  private market(r: Reader) {
    const average = r.int(),
      offers = r.int(),
      days = r.int();
    let sold = 0;
    for (let i = 0, n = r.count(); i < n; i++) {
      r.int();
      r.int();
      sold += r.int();
    }
    const type = r.int(),
      kind = r.int();
    this.state.market = { average, offers, days, sold, type, kind };
    this.model.notice(
      messageRef('messages.marketplaceTypeAverageCOffersSalesInDays', {
        v0: kind,
        v1: average,
        v2: offers,
        v3: sold,
        v4: days,
      }),
    );
  }
  captureToner(id: number, kind: number, values?: number[]) {
    if (
      values &&
      values.length === 4 &&
      [0, 1].includes(values[0]) &&
      values.slice(1).every((v) => v >= 0 && v <= 255)
    )
      this.tonerValues.set(id, values);
    else this.tonerValues.delete(id);
    this.state.tonerCandidates = [...this.tonerValues].map(([id, values]) => ({
      id,
      kind: this.model.state.furni.find((f) => f.id === id)?.kind ?? kind,
      values,
    }));
  }
  private tonerData(r: Reader) {
    const id = Number(r.string()),
      type = r.int();
    if ((type & 255) === 5) {
      const values = [];
      for (let i = 0, n = r.count(); i < n; i++) values.push(r.int());
      this.captureToner(
        id,
        this.model.state.furni.find((f) => f.id === id)?.kind ?? 0,
        values,
      );
    }
  }
  private updateToner(before: Settings) {
    const id = this.s.tonerId;
    if (!id) return;
    const current = this.tonerValues.get(id);
    if (!current) throw new Error(messageRef('errors.selectLoadedToner'));
    if (
      before.tonerId !== id &&
      before.tonerActive === this.s.tonerActive &&
      before.tonerColor === this.s.tonerColor
    ) {
      this.s.tonerActive = current[0] !== 0;
      this.s.tonerColor = hslToRgb(current[1], current[2], current[3]);
      this.model.emit('persist');
      this.model.changed();
      return;
    }
    if (
      (before.tonerId === id && before.tonerColor !== this.s.tonerColor) ||
      before.tonerId !== id
    ) {
      const [h, s, l] = rgbToHsl(this.s.tonerColor);
      this.out(
        ['SetRoomBackgroundColorData'],
        new Writer().int(id).int(h).int(s).int(l).buffer(),
      );
    }
    if (
      (before.tonerActive !== this.s.tonerActive || before.tonerId !== id) &&
      (current[0] !== 0) !== this.s.tonerActive
    )
      this.out(
        ['UseFurniture', 'UseStuff'],
        new Writer().int(id).int(0).buffer(),
      );
  }
}
function hslToRgb(h: number, s: number, l: number) {
  h /= 255;
  s /= 255;
  l /= 255;
  const a = s * Math.min(l, 1 - l);
  return (
    '#' +
    [0, 8, 4]
      .map((n) => {
        const k = (n + h * 12) % 12,
          c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}
function rgbToHsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
      (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    ),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h =
      max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l].map((v) => Math.round(v * 255));
}
