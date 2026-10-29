import {
  generalDefaults,
  type GeneralSettings,
  type GeneralSnapshot,
} from './general-options';
import type { LanguageChoice } from './i18n';
export type Direction = 'in' | 'out';
export interface MessageInfo {
  id: number;
  name: string;
  direction: Direction;
  hash: string;
}
export interface Outfit {
  id: string;
  name: string;
  figure: string;
  gender: string;
}
export interface Settings extends GeneralSettings {
  language: LanguageChoice;
  sidebarCollapsed: boolean;
  host: string;
  port: number;
  noWalk: boolean;
  noTurn: boolean;
  noTyping: boolean;
  alwaysShout: boolean;
  muteChat: boolean;
  muteWhispers: boolean;
  preventUse: boolean;
  blockTrade: boolean;
  commands: boolean;
  capturePackets: boolean;
}
export const defaults: Settings = {
  ...generalDefaults,
  language: 'auto',
  sidebarCollapsed: false,
  host: '127.0.0.1',
  port: 9092,
  noWalk: false,
  noTurn: false,
  noTyping: false,
  alwaysShout: false,
  muteChat: false,
  muteWhispers: false,
  preventUse: false,
  blockTrade: false,
  commands: true,
  capturePackets: true,
};
export interface Avatar {
  id: number;
  index: number;
  name: string;
  motto: string;
  figure: string;
  gender: string;
  x: number;
  y: number;
  type: number;
}
export interface ChatEntry {
  id: number;
  time: string;
  user: string;
  text: string;
  kind: string;
}
export interface PacketEntry {
  id: number;
  time: string;
  direction: Direction;
  header: number;
  name: string;
  size: number;
  hex: string;
  blocked: boolean;
  modified: boolean;
}
export interface InventoryItem {
  id: number;
  itemId: number;
  type: string;
  kind: number;
  tradeable: boolean;
}
export interface VisitorRecord {
  id: number;
  type: number;
  name: string;
  count: number;
  entered: string;
  left?: string;
  lastSeen: string;
  presence: 'present' | 'left' | 'unknown';
}
export interface RoomIdentity {
  hotel: string;
  roomId: number;
}
export interface Snapshot {
  furniHighlight: number | null;
  furniCatalog: {
    status: 'idle' | 'loading' | 'ready' | 'cached' | 'error' | 'unsupported';
    hotel: string;
    count: number;
    updated?: string;
    error?: string;
  };
  profileHistory: ProfileRecord[];
  general: GeneralSnapshot;
  furni: {
    name?: string;
    identifier?: string;
    description?: string;
    id: number;
    kind: number;
    x: number;
    y: number;
    z: string;
    direction: number;
    ownerId: number;
    ownerName: string;
    hidden: boolean;
    linkId?: number;
  }[];
  status: 'disconnected' | 'connecting' | 'connected';
  gameConnected: boolean;
  session: {
    host: string;
    port: number;
    version: string;
    client: string;
  } | null;
  settings: Settings;
  outfits: Outfit[];
  messages: MessageInfo[];
  room: { id: number; name: string };
  self: { id: number; name: string; figure: string; gender: string } | null;
  avatars: Avatar[];
  visitors: VisitorRecord[];
  chat: ChatEntry[];
  packets: PacketEntry[];
  inventory: InventoryItem[];
  received: number;
  sent: number;
  blocked: number;
  notices: { time: string; text: string }[];
}
export interface SendRequest {
  direction: Direction;
  header: number | string;
  fields: {
    type: 'int' | 'short' | 'string' | 'bool' | 'hex';
    value: unknown;
  }[];
}
export interface Bridge {
  lookupProfile(query: ProfileQuery): Promise<ProfileRecord>;
  editProfileHistory(action: 'remove' | 'clear', key?: string): Promise<void>;
  profileAction(key: string, action: ProfileAction): Promise<void>;
  userAction(action: UserAction, ref: UserRef): Promise<void>;
  snapshot(): Promise<Snapshot>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  settings(value: Partial<Settings>): Promise<void>;
  action(name: string, value?: unknown): Promise<void>;
  send(value: SendRequest): Promise<void>;
  export(kind: 'chat' | 'packets' | 'wardrobe'): Promise<boolean>;
  importWardrobe(): Promise<void>;
  subscribe(callback: (state: Snapshot) => void): () => void;
}
export interface ProfileQuery {
  hotel: string;
  id?: number;
  name?: string;
}
export type ProfileAction = 'game' | 'web' | 'widgets' | 'motto' | 'figure';
export interface HabboProfile {
  id: number;
  name: string;
  figure: string;
  motto: string;
  created: string;
  activityPoints: number;
  friends: number;
  isFriend: boolean;
  requestSent: boolean;
  online: boolean;
  lastLogin: number;
  level: number | null;
  starGems: number | null;
  groups: {
    id: number;
    name: string;
    badge: string;
    primary: string;
    secondary: string;
    favorite: boolean;
    ownerId: number;
    forum: boolean;
  }[];
  badges: { slot: number; code: string }[] | null;
  relationships:
    | {
        type: number;
        count: number;
        id: number;
        name: string;
        figure: string;
      }[]
    | null;
}
export interface ProfileRecord {
  key: string;
  hotel: string;
  firstSearched: string;
  lastSearched: string;
  count: number;
  profile: HabboProfile;
}
export interface UserRef extends RoomIdentity {
  id: number;
  type: number;
  name: string;
  index?: number;
}
export type UserAction =
  | 'find'
  | 'profile'
  | 'web'
  | 'widgets'
  | 'name'
  | 'id'
  | 'motto'
  | 'figure'
  | 'save';
declare global {
  interface Window {
    isora: Bridge;
  }
}
