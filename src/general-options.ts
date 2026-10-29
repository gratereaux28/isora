export interface GeneralSettings {
  antiIdle: boolean;
  antiIdleOut: boolean;
  turnOnReselect: boolean;
  turnOnClick: boolean;
  clickThrough: boolean;
  clickTo: boolean;
  clickAction: 'mute' | 'kick' | 'ban' | 'bounce';
  muteMinutes: number;
  banDuration: 'hour' | 'day' | 'perm';
  excludeFriends: boolean;
  rememberPasswords: boolean;
  acceptFriends: boolean;
  flattenFloor: boolean;
  selfOverlay: boolean;
  hideAvatars: boolean;
  muteAll: boolean;
  muteBots: boolean;
  mutePets: boolean;
  mutePetCommands: boolean;
  petCommands: string;
  muteWired: boolean;
  muteRespects: boolean;
  muteScratches: boolean;
  showRespecter: boolean;
  showRespectTotal: boolean;
  pickInfo: boolean;
  pickMarket: boolean;
  pickHide: boolean;
  pickTele: boolean;
  dropHandItem: boolean;
  returnHandItem: boolean;
  maintainDirection: boolean;
  blockHcGift: boolean;
  tonerId: number;
  tonerActive: boolean;
  tonerColor: string;
}
export const generalDefaults: GeneralSettings = {
  antiIdle: false,
  antiIdleOut: false,
  turnOnReselect: false,
  turnOnClick: false,
  clickThrough: false,
  clickTo: false,
  clickAction: 'mute',
  muteMinutes: 60,
  banDuration: 'hour',
  excludeFriends: true,
  rememberPasswords: false,
  acceptFriends: false,
  flattenFloor: false,
  selfOverlay: false,
  hideAvatars: false,
  muteAll: false,
  muteBots: false,
  mutePets: false,
  mutePetCommands: false,
  petCommands:
    'sit|sienta|siéntate|sientate|down|tumba|túmbate|tumbate|here|ven|heel|junto|follow|sígueme|sigueme|stay|quieto|stand|levanta|jump|salta|speak|habla|play|juega|dead|muerto|roll|rueda|beg|pide|eat|come|drink|bebe',
  muteWired: false,
  muteRespects: false,
  muteScratches: false,
  showRespecter: true,
  showRespectTotal: true,
  pickInfo: false,
  pickMarket: false,
  pickHide: false,
  pickTele: false,
  dropHandItem: false,
  returnHandItem: false,
  maintainDirection: false,
  blockHcGift: false,
  tonerId: 0,
  tonerActive: false,
  tonerColor: '#8a74d6',
};
export interface GeneralSnapshot {
  antiIdleRunning: boolean;
  nextAntiIdle: string | null;
  lastAntiIdle: string | null;
  friends: number;
  friendsLoaded: boolean;
  passwords: number;
  flattenActive: boolean;
  overlayActive: boolean;
  wallItems: {
    id: number;
    kind: number;
    owner: string;
    location: string;
    hidden: boolean;
  }[];
  selectedFurni: {
    id: number;
    type: 'floor' | 'wall';
    kind: number;
    owner: string;
    location: string;
    linkId?: number;
  } | null;
  market: {
    kind: number;
    type: number;
    average: number;
    offers: number;
    days: number;
    sold: number;
  } | null;
  tonerCandidates: { id: number; kind: number; values: number[] }[];
}
export const generalInitial: GeneralSnapshot = {
  antiIdleRunning: false,
  nextAntiIdle: null,
  lastAntiIdle: null,
  friends: 0,
  friendsLoaded: false,
  passwords: 0,
  flattenActive: false,
  overlayActive: false,
  wallItems: [],
  selectedFurni: null,
  market: null,
  tonerCandidates: [],
};
