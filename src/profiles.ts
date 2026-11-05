import { messageRef } from './i18n';
import type { Model } from './model';
import type { HabboProfile, ProfileQuery, ProfileRecord } from './shared';
import { normalize } from './protocol/gearth';
import { Reader, Writer, type Intercept } from './protocol/packet';
import { PublicProfiles, type PublicProfile } from './public-profiles';

const profileIn = ['extendedprofile', 'userprofile'];
const byId = ['GetExtendedProfile', 'GetUserProfile', 'UserProfile'];
const byName = [
  'GetExtendedProfileByName',
  'GetUserProfileByName',
  'UserProfileByName',
];
const badgesIn = ['userbadges', 'usercurrentbadges'];
const relationshipsIn = ['relationshipstatusinfo', 'userrelationships'];
const matches = (query: ProfileQuery, profile: { id: number; name: string }) =>
  query.id !== undefined
    ? query.id === profile.id
    : query.name!.toLowerCase() === profile.name.toLowerCase();
export const profileKey = (hotel: string, id: number | string) =>
  JSON.stringify([hotel.toLowerCase(), id]);
export function parseProfile(body: Buffer): HabboProfile {
  const r = new Reader(body);
  const p: HabboProfile = {
    id: r.int(),
    name: r.string(),
    figure: r.string(),
    motto: r.string(),
    created: r.string(),
    activityPoints: r.int(),
    friends: r.int(),
    isFriend: r.bool(),
    requestSent: r.bool(),
    online: r.bool(),
    groups: [],
    lastLogin: 0,
    level: null,
    starGems: null,
    badges: null,
    relationships: null,
  };
  const groups = r.count();
  if (groups > 2000) throw new Error(messageRef('errors.tooManyProfileGroups'));
  for (let i = 0; i < groups; i++)
    p.groups.push({
      id: r.int(),
      name: r.string(),
      badge: r.string(),
      primary: r.string(),
      secondary: r.string(),
      favorite: r.bool(),
      ownerId: r.int(),
      forum: r.bool(),
    });
  p.lastLogin = r.int();
  p.displayInClient = r.bool();
  if (r.data.length - r.position >= 15) {
    r.bool();
    p.level = r.int();
    r.int();
    p.starGems = r.int();
    r.bool();
    r.bool();
  }
  // A suppressed client window alone does not mean the profile is private:
  // Isora also requests ordinary profiles with that flag disabled.
  p.limited =
    !p.displayInClient &&
    (p.friends! < 0 || p.activityPoints! < 0 || !p.created);
  if (p.limited) {
    if (p.friends! < 0) p.friends = null;
    if (p.activityPoints! < 0) p.activityPoints = null;
    if (p.level !== null && p.level < 0) p.level = null;
    if (p.starGems !== null && p.starGems < 0) p.starGems = null;
    p.lastLogin = -1;
  }
  if (
    p.id < 1 ||
    !p.name ||
    p.name.length > 100 ||
    (p.friends !== null && p.friends < 0) ||
    (p.activityPoints !== null && p.activityPoints < 0)
  )
    throw new Error(messageRef('errors.invalidProfileReceived'));
  return p;
}
interface Pending {
  query: ProfileQuery;
  profile?: HabboProfile;
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: ProfileRecord) => void;
  reject: (error: Error) => void;
  wantBadges: boolean;
  wantRelationships: boolean;
  wantPublic: boolean;
  abort: AbortController;
  publicInfo?: PublicProfile;
}
interface ApiPending {
  query: ProfileQuery;
  abort: AbortController;
  reject: (error: Error) => void;
}
export class Profiles {
  private sending = false;
  private pending?: Pending;
  private apiPending?: ApiPending;
  private own: { query: ProfileQuery; until: number }[] = [];
  private client: { query: ProfileQuery; until: number }[] = [];
  constructor(
    private model: Model,
    private publicProfiles = new PublicProfiles(),
  ) {}
  lookup(
    query: ProfileQuery,
    publicInfo?: PublicProfile,
  ): Promise<ProfileRecord> {
    if (
      !query ||
      typeof query.hotel !== 'string' ||
      (query.preferApi !== undefined && typeof query.preferApi !== 'boolean') ||
      (query.id === undefined) === (query.name === undefined) ||
      (query.id !== undefined &&
        (!Number.isInteger(query.id) ||
          query.id < 1 ||
          query.id > 2147483647)) ||
      (query.name !== undefined &&
        (typeof query.name !== 'string' ||
          !query.name.trim() ||
          query.name.trim().length > 100 ||
          [...query.name].some((character) => character.charCodeAt(0) < 32)))
    )
      return Promise.reject(
        new Error(messageRef('messages.enterAValidUsername')),
      );
    if (
      !this.model.state.gameConnected ||
      query.hotel !== this.model.state.session?.host
    )
      return Promise.reject(
        new Error(
          messageRef('messages.connectHabboToTheSameHotelToQueryThisProfile'),
        ),
      );
    if (this.pending || this.apiPending)
      return Promise.reject(
        new Error(messageRef('errors.profileQueryInProgress')),
      );
    if (query.preferApi) return this.lookupApi(query);
    if (!this.model.earth.resolve('in', ['ExtendedProfile', 'UserProfile']))
      return Promise.reject(
        new Error(
          messageRef('messages.gEarthHasNotIdentifiedTheProfileResponse'),
        ),
      );
    const request = this.model.earth.resolve(
      'out',
      query.id !== undefined ? byId : byName,
    );
    if (!request)
      return Promise.reject(
        new Error(
          messageRef(
            'messages.gEarthHasNotIdentifiedProfileSearchForThisSession',
          ),
        ),
      );
    const clean: ProfileQuery = {
      hotel: query.hotel,
      ...(query.id !== undefined
        ? { id: query.id }
        : { name: query.name!.trim() }),
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            messageRef(
              'errors.noProfileReceivedCheckTheNameAndTheUserSAvailability',
            ),
          ),
        8000,
      );
      this.pending = {
        query: clean,
        resolve,
        reject,
        timer,
        wantBadges: false,
        wantRelationships: false,
        wantPublic: false,
        abort: new AbortController(),
        publicInfo,
      };
      this.own = this.own.filter((v) => v.until > Date.now()).slice(-19);
      this.own.push({ query: clean, until: Date.now() + 60000 });
      try {
        this.sending = true;
        this.model.earth.send(
          'out',
          request.id,
          query.id !== undefined
            ? new Writer().int(query.id).bool(false).buffer()
            : new Writer().string(clean.name!).buffer(),
        );
      } catch (error) {
        this.fail((error as Error).message);
      } finally {
        this.sending = false;
      }
    });
  }
  private lookupApi(query: ProfileQuery): Promise<ProfileRecord> {
    const name =
      query.name?.trim() ??
      this.model.state.avatars.find((a) => a.id === query.id)?.name ??
      this.model.state.visitors.find((v) => v.id === query.id)?.name ??
      this.model.state.profileHistory.find(
        (r) => r.hotel === query.hotel && r.profile.id === query.id,
      )?.profile.name;
    if (!name)
      return Promise.reject(
        new Error(messageRef('messages.enterAValidUsername')),
      );
    return new Promise((resolve, reject) => {
      const active: ApiPending = {
        query,
        abort: new AbortController(),
        reject,
      };
      this.apiPending = active;
      void (async () => {
        try {
          const info = await this.publicProfiles.load(
            query.hotel,
            name,
            active.abort.signal,
          );
          if (this.apiPending !== active) return;
          if (info.privateProfile === false) {
            this.apiPending = undefined;
            resolve(
              await this.lookup(
                {
                  hotel: query.hotel,
                  ...(query.id ? { id: query.id } : { name }),
                },
                info,
              ),
            );
            return;
          }
          const known =
            this.model.state.avatars.find(
              (a) =>
                a.type === 1 && a.name.toLowerCase() === name.toLowerCase(),
            ) ??
            this.model.state.visitors.find(
              (v) => v.name.toLowerCase() === name.toLowerCase(),
            );
          const id = query.id ?? known?.id ?? 0;
          if (!id && !info.uniqueId)
            throw new Error(messageRef('errors.invalidPublicProfile'));
          const profile: HabboProfile = {
            id,
            ...(info.uniqueId ? { uniqueId: info.uniqueId } : {}),
            apiOnly: true,
            onlineKnown: info.online !== undefined,
            name: info.name,
            figure: info.figure ?? '',
            motto: info.motto ?? '',
            created: info.created ?? '',
            activityPoints: info.activityPoints ?? null,
            friends: null,
            isFriend: false,
            requestSent: false,
            online: info.online ?? false,
            lastLogin: info.lastLogin ?? -1,
            level: info.level ?? null,
            starGems: info.starGems ?? null,
            groups: [],
            badges: info.badges ?? null,
            relationships: null,
            limited: true,
            ...(info.privateProfile !== undefined
              ? { privateProfile: info.privateProfile }
              : {}),
          };
          const record = this.saveProfile(profile, query.hotel);
          this.apiPending = undefined;
          resolve(record);
        } catch (error) {
          if (this.apiPending !== active && active.abort.signal.aborted) return;
          if (this.apiPending === active) this.apiPending = undefined;
          reject(error as Error);
        }
      })();
    });
  }
  private failApi(message: string) {
    const active = this.apiPending;
    if (!active) return;
    this.apiPending = undefined;
    active.abort.abort();
    active.reject(new Error(message));
  }
  private fail(message: string) {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.abort.abort();
    pending.reject(new Error(message));
  }
  sessionEnded() {
    this.failApi(
      messageRef('messages.theHabboConnectionChangedBeforeTheQueryFinished'),
    );
    this.fail(
      messageRef('messages.theHabboConnectionChangedBeforeTheQueryFinished'),
    );
    this.own = [];
    this.client = [];
  }
  edit(action: 'remove' | 'clear', key?: string) {
    if (action === 'clear') {
      this.failApi(messageRef('messages.profileQueryCanceled'));
      this.fail(messageRef('messages.profileQueryCanceled'));
      this.model.state.profileHistory = [];
    } else if (action === 'remove' && typeof key === 'string')
      this.model.state.profileHistory = this.model.state.profileHistory.filter(
        (r) => r.key !== key,
      );
    else throw new Error(messageRef('errors.invalidHistoryAction'));
    this.model.emit('profileHistory');
    this.model.changed();
  }
  record(key: string) {
    if (typeof key !== 'string')
      throw new Error(messageRef('errors.invalidProfile'));
    const record = this.model.state.profileHistory.find((r) => r.key === key);
    if (!record)
      throw new Error(
        messageRef('messages.thisProfileIsNoLongerInYourHistory'),
      );
    return record;
  }
  openInGame(record: ProfileRecord) {
    if (record.profile.id > 0) this.model.action('profile', record.profile.id);
    else
      this.model.sendNames(
        byName,
        new Writer().string(record.profile.name).buffer(),
      );
  }
  observeSent(packet: Pick<Intercept, 'direction' | 'header' | 'body'>) {
    if (this.sending || packet.direction !== 'out') return;
    const name =
      this.model.earth.messages.find(
        (m) => m.direction === 'out' && m.id === packet.header,
      )?.name ?? '';
    this.handle(
      { ...packet, sequence: 0, blocked: false, modified: false, format: 0 },
      normalize(name),
    );
  }
  handle(packet: Intercept, name: string) {
    const hotel = this.model.state.session?.host;
    if (!hotel) return;
    if (packet.direction === 'out') {
      if (packet.blocked) return;
      const reader = new Reader(packet.body);
      let query: ProfileQuery | undefined;
      if (byId.some((v) => normalize(v) === name)) {
        const id = reader.int();
        reader.bool();
        query = { hotel, id };
      } else if (byName.some((v) => normalize(v) === name))
        query = { hotel, name: reader.string() };
      if (query) {
        this.client = this.client
          .filter((v) => v.until > Date.now())
          .slice(-19);
        this.client.push({ query, until: Date.now() + 8000 });
      }
      return;
    }
    if (profileIn.includes(name)) {
      const identity = new Reader(packet.body);
      const target = { id: identity.int(), name: identity.string() };
      const own = this.own.find(
        (v) =>
          v.until > Date.now() &&
          v.query.hotel === hotel &&
          matches(v.query, target),
      );
      const client = this.client.find(
        (v) =>
          v.until > Date.now() &&
          v.query.hotel === hotel &&
          matches(v.query, target),
      );
      if (own && !client) packet.blocked = true;
      if (client) this.client = this.client.filter((v) => v !== client);
      const profile = parseProfile(packet.body);
      const pending = this.pending;
      if (
        !pending ||
        pending.profile ||
        pending.query.hotel !== hotel ||
        !matches(pending.query, profile)
      )
        return;
      pending.profile = profile;
      if (pending.publicInfo?.uniqueId)
        profile.uniqueId = pending.publicInfo.uniqueId;
      clearTimeout(pending.timer);
      pending.wantPublic = profile.limited === true;
      pending.timer = setTimeout(
        () => this.finish(),
        pending.wantPublic ? 3500 : 1500,
      );
      const badges = this.model.earth.resolve('out', [
        'GetSelectedBadges',
        'UserCurrentBadges',
      ]);
      const relationships = this.model.earth.resolve('out', [
        'GetRelationshipStatusInfo',
        'UserRelationships',
      ]);
      pending.wantBadges =
        !!badges &&
        !!this.model.earth.resolve('in', ['UserBadges', 'UserCurrentBadges']);
      pending.wantRelationships =
        !!relationships &&
        !!this.model.earth.resolve('in', [
          'RelationshipStatusInfo',
          'UserRelationships',
        ]);
      // Queue injections after the intercept acknowledgment, so the game is never left waiting.
      queueMicrotask(() => {
        if (this.pending !== pending) return;
        try {
          if (pending.wantBadges)
            this.model.earth.send(
              'out',
              badges!.id,
              new Writer().int(profile.id).buffer(),
            );
          if (pending.wantRelationships)
            this.model.earth.send(
              'out',
              relationships!.id,
              new Writer().int(profile.id).buffer(),
            );
          if (pending.wantPublic) void this.enrich(pending);
          this.finishIfReady();
        } catch (error) {
          this.model.notice((error as Error).message);
          pending.wantBadges = false;
          pending.wantRelationships = false;
          if (pending.wantPublic) void this.enrich(pending);
          this.finishIfReady();
        }
      });
      return;
    }
    const pending = this.pending;
    if (
      !pending?.profile ||
      pending.query.hotel !== hotel ||
      (!badgesIn.includes(name) && !relationshipsIn.includes(name))
    )
      return;
    const reader = new Reader(packet.body);
    if (reader.int() !== pending.profile.id) return;
    const count = reader.count();
    if (badgesIn.includes(name)) {
      if (count > 50)
        throw new Error(messageRef('errors.tooManyProfileBadges'));
      const badges: NonNullable<HabboProfile['badges']> = [];
      for (let i = 0; i < count; i++)
        badges.push({ slot: reader.int(), code: reader.string() });
      pending.profile.badges = badges.sort((a, b) => a.slot - b.slot);
      pending.wantBadges = false;
    } else {
      if (count > 10)
        throw new Error(messageRef('errors.tooManyProfileRelationships'));
      const relationships: NonNullable<HabboProfile['relationships']> = [];
      for (let i = 0; i < count; i++)
        relationships.push({
          type: reader.int(),
          count: reader.int(),
          id: reader.int(),
          name: reader.string(),
          figure: reader.string(),
        });
      pending.profile.relationships = relationships;
      pending.wantRelationships = false;
    }
    this.finishIfReady();
  }
  private async enrich(pending: Pending) {
    try {
      const extra = await this.publicProfiles.load(
        pending.query.hotel,
        pending.profile!.name,
        pending.abort.signal,
      );
      if (this.pending !== pending) return;
      Object.assign(pending.profile!, {
        ...(extra.motto !== undefined ? { motto: extra.motto } : {}),
        ...(extra.created ? { created: extra.created } : {}),
        ...(extra.figure ? { figure: extra.figure } : {}),
        ...(extra.activityPoints !== undefined
          ? { activityPoints: extra.activityPoints }
          : {}),
        ...(extra.privateProfile !== undefined
          ? { privateProfile: extra.privateProfile }
          : {}),
      });
    } catch {
      if (this.pending !== pending) return;
      this.model.notice(messageRef('profiles.publicDataUnavailable'));
    }
    if (this.pending !== pending) return;
    pending.wantPublic = false;
    this.finishIfReady();
  }
  private finishIfReady() {
    const pending = this.pending;
    if (
      pending?.profile &&
      !pending.wantBadges &&
      !pending.wantRelationships &&
      !pending.wantPublic
    )
      this.finish();
  }
  private finish() {
    const pending = this.pending;
    if (!pending?.profile) return;
    try {
      const record = this.saveProfile(pending.profile, pending.query.hotel);
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.abort.abort();
      pending.resolve(record);
    } catch (error) {
      this.fail((error as Error).message);
    }
  }
  private saveProfile(profile: HabboProfile, hotel: string): ProfileRecord {
    const key = profileKey(hotel, profile.id || profile.uniqueId!);
    const previous = this.model.state.profileHistory.find(
      (r) =>
        r.hotel === hotel &&
        (r.key === key ||
          (!!profile.uniqueId && r.profile.uniqueId === profile.uniqueId)),
    );
    if (!previous && this.model.state.profileHistory.length >= 10000) {
      throw new Error(
        messageRef('messages.historyIsFullDeleteRecordsToSaveMoreProfiles'),
      );
    }
    const now = new Date().toISOString();
    const record: ProfileRecord = {
      key,
      hotel,
      firstSearched: previous?.firstSearched ?? now,
      lastSearched: now,
      count: (previous?.count ?? 0) + 1,
      profile,
    };
    this.model.state.profileHistory = [
      record,
      ...this.model.state.profileHistory.filter(
        (r) => r.key !== key && r !== previous,
      ),
    ];
    this.model.emit('profileHistory');
    this.model.changed();
    return structuredClone(record);
  }
}
