import type { MessageKey } from './i18n';
import { useI18n } from './LocaleProvider';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  Users,
  MessageSquare,
  Package,
  MousePointer2,
  DoorOpen,
  Hand,
  Palette,
  CircleHelp,
  SlidersHorizontal,
} from 'lucide-react';
import type { Settings, Snapshot } from './shared';
type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];
type Option = [BooleanKey, MessageKey, MessageKey, ('in' | 'out')?, string[]?];
const groups: {
  title: MessageKey;
  icon: typeof Activity;
  options: Option[];
}[] = [
  {
    title: 'general.groups.activityRoom',
    icon: Activity,
    options: [
      [
        'antiIdle',
        'general.options.antiIdle.label',
        'general.options.antiIdle.description',
        'out',
        ['Expression', 'AvatarExpression'],
      ],
      [
        'antiIdleOut',
        'general.options.antiIdleOut.label',
        'general.options.antiIdleOut.description',
        'out',
        ['Expression', 'AvatarExpression'],
      ],
      [
        'blockTrade',
        'general.options.blockTrade.label',
        'general.options.blockTrade.description',
        'out',
        ['CloseTrading', 'TradingClose'],
      ],
      [
        'flattenFloor',
        'general.options.flattenFloor.label',
        'general.options.flattenFloor.description',
        'in',
        ['FloorHeightMap'],
      ],
      [
        'selfOverlay',
        'general.options.selfOverlay.label',
        'general.options.selfOverlay.description',
        'in',
        ['AvatarEffect'],
      ],
      [
        'hideAvatars',
        'general.options.hideAvatars.label',
        'general.options.hideAvatars.description',
        'in',
        ['Users'],
      ],
    ],
  },
  {
    title: 'general.groups.movement',
    icon: Users,
    options: [
      [
        'noWalk',
        'general.options.noWalk.label',
        'general.options.noWalk.description',
        'out',
        ['MoveAvatar', 'Move'],
      ],
      [
        'turnOnClick',
        'general.options.turnOnClick.label',
        'general.options.turnOnClick.description',
        'out',
        ['LookTo'],
      ],
      [
        'noTurn',
        'general.options.noTurn.label',
        'general.options.noTurn.description',
        'out',
        ['LookTo'],
      ],
      [
        'turnOnReselect',
        'general.options.turnOnReselect.label',
        'general.options.turnOnReselect.description',
        'out',
        ['GetSelectedBadges'],
      ],
      [
        'clickThrough',
        'general.options.clickThrough.label',
        'general.options.clickThrough.description',
        'in',
        ['YouArePlayingGame'],
      ],
    ],
  },
  {
    title: 'navigation.chat',
    icon: MessageSquare,
    options: [
      [
        'noTyping',
        'general.options.noTyping.label',
        'general.options.noTyping.description',
        'out',
        ['StartTyping', 'TypingStart'],
      ],
      [
        'alwaysShout',
        'general.options.alwaysShout.label',
        'general.options.alwaysShout.description',
        'out',
        ['Shout'],
      ],
      [
        'showRespecter',
        'general.options.showRespecter.label',
        'general.options.showRespecter.description',
        'in',
        ['RespectNotification'],
      ],
      [
        'showRespectTotal',
        'general.options.showRespectTotal.label',
        'general.options.showRespectTotal.description',
        'in',
        ['RespectNotification'],
      ],
    ],
  },
  {
    title: 'general.groups.conversationFilters',
    icon: SlidersHorizontal,
    options: [
      [
        'muteAll',
        'general.options.muteAll.label',
        'general.options.muteAll.description',
      ],
      [
        'muteChat',
        'general.options.muteChat.label',
        'general.options.muteChat.description',
        'in',
        ['Chat', 'Shout'],
      ],
      [
        'muteWhispers',
        'general.options.muteWhispers.label',
        'general.options.muteWhispers.description',
        'in',
        ['Whisper'],
      ],
      [
        'muteBots',
        'general.options.muteBots.label',
        'general.options.muteBots.description',
        'in',
        ['Users'],
      ],
      [
        'mutePets',
        'general.options.mutePets.label',
        'general.options.mutePets.description',
        'in',
        ['Users'],
      ],
      [
        'mutePetCommands',
        'general.options.mutePetCommands.label',
        'general.options.mutePetCommands.description',
      ],
      [
        'muteWired',
        'general.options.muteWired.label',
        'general.options.muteWired.description',
        'in',
        ['Chat', 'Whisper'],
      ],
      [
        'muteRespects',
        'general.options.muteRespects.label',
        'general.options.muteRespects.description',
        'in',
        ['RespectNotification'],
      ],
      [
        'muteScratches',
        'general.options.muteScratches.label',
        'general.options.muteScratches.description',
        'in',
        ['PetRespectNotification'],
      ],
    ],
  },
  {
    title: 'general.groups.clickModeration',
    icon: MousePointer2,
    options: [
      [
        'clickTo',
        'general.options.clickTo.label',
        'general.options.clickTo.description',
        'out',
        ['GetSelectedBadges'],
      ],
      [
        'excludeFriends',
        'general.options.excludeFriends.label',
        'general.options.excludeFriends.description',
        'in',
        ['FriendListFragment'],
      ],
    ],
  },
  {
    title: 'general.groups.roomEntry',
    icon: DoorOpen,
    options: [
      [
        'rememberPasswords',
        'general.options.rememberPasswords.label',
        'general.options.rememberPasswords.description',
        'out',
        ['OpenFlatConnection'],
      ],
      [
        'acceptFriends',
        'general.options.acceptFriends.label',
        'general.options.acceptFriends.description',
        'out',
        ['LetUserIn'],
      ],
    ],
  },
  {
    title: 'general.groups.furniture',
    icon: Package,
    options: [
      [
        'preventUse',
        'general.options.preventUse.label',
        'general.options.preventUse.description',
        'out',
        ['UseFurniture', 'UseStuff'],
      ],
      [
        'pickInfo',
        'general.options.pickInfo.label',
        'general.options.pickInfo.description',
        'out',
        ['PickupObject'],
      ],
      [
        'pickMarket',
        'general.options.pickMarket.label',
        'general.options.pickMarket.description',
        'out',
        ['GetMarketplaceItemStats'],
      ],
      [
        'pickHide',
        'general.options.pickHide.label',
        'general.options.pickHide.description',
        'out',
        ['PickupObject'],
      ],
      [
        'pickTele',
        'general.options.pickTele.label',
        'general.options.pickTele.description',
        'in',
        ['ObjectDataUpdate'],
      ],
    ],
  },
  {
    title: 'general.groups.handItems',
    icon: Hand,
    options: [
      [
        'dropHandItem',
        'general.options.dropHandItem.label',
        'general.options.dropHandItem.description',
        'out',
        ['DropCarryItem'],
      ],
      [
        'returnHandItem',
        'general.options.returnHandItem.label',
        'general.options.returnHandItem.description',
        'out',
        ['PassCarryItem'],
      ],
      [
        'maintainDirection',
        'general.options.maintainDirection.label',
        'general.options.maintainDirection.description',
        'out',
        ['LookTo'],
      ],
    ],
  },
  {
    title: 'general.groups.other',
    icon: Palette,
    options: [
      [
        'blockHcGift',
        'general.options.blockHcGift.label',
        'general.options.blockHcGift.description',
        'in',
        ['ClubGiftNotification'],
      ],
      [
        'tonerActive',
        'general.options.tonerActive.label',
        'general.options.tonerActive.description',
        'out',
        ['UseFurniture', 'UseStuff'],
      ],
    ],
  },
];
export function GeneralPanel({
  state,
  save,
  action,
}: {
  state: Snapshot;
  save: (value: Partial<Settings>) => void;
  action: (name: string, value?: unknown) => void;
}) {
  const { language, t } = useI18n();
  const s = state.settings;
  const [commands, setCommands] = useState(s.petCommands);
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = grid.current!;
    const cards = [...element.querySelectorAll<HTMLElement>('.general-group')];
    let frame = 0;
    const arrange = () => {
      const columns = element.clientWidth >= 760 ? 2 : 1;
      element.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      const rows = [1, 1];
      cards.forEach((card, index) => {
        const column = index % columns;
        card.style.gridColumn = String(column + 1);
        const height = Math.ceil(card.getBoundingClientRect().height);
        card.style.gridRow = `${rows[column]} / span ${Math.max(1, height)}`;
        rows[column] += height + 12;
      });
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(arrange);
    });
    arrange();
    observer.observe(element);
    cards.forEach((card) => observer.observe(card));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const disabled = (key: BooleanKey) =>
    (key === 'antiIdleOut' && s.antiIdle) ||
    (key === 'turnOnClick' && !s.noWalk) ||
    (key === 'turnOnReselect' && !s.noTurn) ||
    (key === 'tonerActive' && !s.tonerId);
  return (
    <>
      <div className="heartbeat-strip">
        <Activity size={18} />
        <div>
          <b>
            {state.general.antiIdleRunning
              ? t('messages.antiAfkScheduled')
              : s.antiIdle || s.antiIdleOut
                ? t('messages.antiAfkWaitingForConnectionOrExpression')
                : t('messages.antiAfkDisabled')}
          </b>
          <small>
            {state.general.nextAntiIdle
              ? t('messages.nextCycle', {
                  v0: new Date(state.general.nextAntiIdle).toLocaleTimeString(
                    language,
                  ),
                })
              : t(
                  'messages.expression0Every60SecondsStopsWhenDisabledOrDisconnected',
                )}
            {state.general.lastAntiIdle &&
              t('general.heartbeat.lastSent', {
                v0: new Date(state.general.lastAntiIdle).toLocaleTimeString(
                  language,
                ),
              })}
          </small>
        </div>
      </div>
      <div className="card-grid general-grid" ref={grid}>
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <details className="card general-group" key={group.title} open>
              <summary>
                <Icon size={17} />
                <b>{t(group.title)}</b>
                <span>
                  {group.options.filter(([key]) => s[key]).length}/
                  {group.options.length}
                </span>
              </summary>
              {group.options.map(([key, title, description, dir, names]) => {
                const identified =
                  !names ||
                  state.messages.some(
                    (m) =>
                      m.direction === (dir ?? 'out') &&
                      names.some(
                        (n) =>
                          m.name
                            .replace(/(Message)?(Composer|Parser|Event)$/i, '')
                            .toLowerCase() === n.toLowerCase(),
                      ),
                  );
                return (
                  <label
                    className={`toggle-row ${disabled(key) ? 'unavailable' : ''}`}
                    key={key}
                    title={t(description)}
                  >
                    <span>
                      <span className="option-name">
                        <b>{t(title)}</b>
                        <span
                          className="option-hint"
                          title={t(description)}
                          aria-hidden="true"
                        >
                          <CircleHelp size={12} />
                        </span>
                      </span>
                      <small className="option-description">
                        {t(description)}
                      </small>
                      {state.gameConnected && s[key] && !identified && (
                        <small className="warning">
                          {t('messages.messageNotYetIdentifiedInThisSession')}
                        </small>
                      )}
                    </span>
                    <input
                      aria-label={t(title)}
                      type="checkbox"
                      role="switch"
                      checked={s[key]}
                      disabled={Boolean(disabled(key))}
                      onChange={(e) => save({ [key]: e.target.checked })}
                    />
                    <i />
                  </label>
                );
              })}
              {group.title === 'general.groups.conversationFilters' && (
                <div className="form-panel compact">
                  <label>
                    {t('messages.petCommandsSeparatedBy')}
                    <textarea
                      rows={3}
                      value={commands}
                      onChange={(e) => setCommands(e.target.value)}
                    />
                  </label>
                  <button
                    className="button subtle"
                    onClick={() => save({ petCommands: commands })}
                  >
                    {t('messages.saveCommands')}
                  </button>
                </div>
              )}
              {group.title === 'general.groups.clickModeration' && (
                <div className="form-panel compact">
                  <div className="form-row">
                    <label>
                      {t('messages.clickToAction')}
                      <select
                        value={s.clickAction}
                        onChange={(e) =>
                          save({
                            clickAction: e.target
                              .value as Settings['clickAction'],
                          })
                        }
                      >
                        <option value="mute">{t('messages.mute')}</option>
                        <option value="kick">{t('messages.kick')}</option>
                        <option value="ban">{t('messages.ban')}</option>
                        <option value="bounce">
                          {t('messages.bounceBanAndUnban')}
                        </option>
                      </select>
                    </label>
                    <label>
                      {t('messages.muteDurationMinutes')}
                      <input
                        type="number"
                        min={0}
                        max={30000}
                        value={s.muteMinutes}
                        onChange={(e) =>
                          save({ muteMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    {t('messages.banDuration')}
                    <select
                      value={s.banDuration}
                      onChange={(e) =>
                        save({
                          banDuration: e.target
                            .value as Settings['banDuration'],
                        })
                      }
                    >
                      <option value="hour">{t('messages.oneHour')}</option>
                      <option value="day">{t('messages.oneDay')}</option>
                      <option value="perm">{t('messages.permanent')}</option>
                    </select>
                  </label>
                  <p>
                    {'' + t('messages.friendsLoaded') + ' '}
                    {state.general.friends}
                    {t('messages.ifYouJustConnectedLoadYourListToExcludeThem')}
                  </p>
                  <button
                    className="button subtle"
                    disabled={!state.gameConnected}
                    onClick={() => action('loadFriends')}
                  >
                    {t('messages.loadFriends')}
                  </button>
                </div>
              )}
              {group.title === 'general.groups.roomEntry' && (
                <div className="form-panel compact">
                  <p>
                    {state.general.passwords}
                    {' ' +
                      t('messages.passwordsSavedNeverShownInThePacketLog') +
                      ''}
                  </p>
                  <button
                    className="button subtle"
                    disabled={!state.general.passwords}
                    onClick={() => action('clearPasswords')}
                  >
                    {t('messages.forgetPasswords')}
                  </button>
                </div>
              )}
              {group.title === 'general.groups.furniture' && (
                <div className="form-panel compact">
                  <p>
                    {t(
                      'messages.enabledActionsRunTogetherCtrlClickIsInterceptedAsPickupobjectThe',
                    )}
                  </p>
                  {state.general.selectedFurni && (
                    <p>
                      {t('messages.lastFurniture')}
                      {state.general.selectedFurni.id} ·{' '}
                      {state.general.selectedFurni.type === 'floor'
                        ? t('messages.floor')
                        : t('messages.wall')}{' '}
                      {'' + t('messages.type3') + ' '}
                      {state.general.selectedFurni.kind} ·{' '}
                      {state.general.selectedFurni.owner} ·{' '}
                      {state.general.selectedFurni.location}
                    </p>
                  )}
                  {state.general.market && (
                    <p>
                      {'' + t('messages.marketplaceAverage') + ' '}
                      {state.general.market.average}
                      {'c · '} {state.general.market.offers}
                      {' ' + t('messages.offers') + ' '}{' '}
                      {state.general.market.sold}
                      {' ' + t('messages.salesIn') + ' '}{' '}
                      {state.general.market.days}
                      {' ' + t('messages.days') + ''}
                    </p>
                  )}
                  <button
                    className="button subtle"
                    disabled={!state.gameConnected}
                    onClick={() => action('restoreWalls')}
                  >
                    {t('messages.showHiddenWallFurniture')}
                  </button>
                </div>
              )}
              {group.title === 'general.groups.other' && (
                <div className="form-panel compact">
                  <label>
                    {t('messages.roomTonerFurniture')}
                    <select
                      value={s.tonerId}
                      onChange={(e) =>
                        save({ tonerId: Number(e.target.value) })
                      }
                    >
                      <option value={0}>{t('messages.selectAToner')}</option>
                      {state.general.tonerCandidates.map((f) => (
                        <option key={f.id} value={f.id}>
                          #{f.id}
                          {'' + t('messages.type3') + ' '}
                          {f.kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('messages.tonerColor')}
                    <input
                      type="color"
                      value={s.tonerColor}
                      onChange={(e) => save({ tonerColor: e.target.value })}
                    />
                  </label>
                  <p>
                    {t(
                      'messages.candidatesWithCompatibleColorDataAreListedSelectTheRoomS',
                    )}
                  </p>
                </div>
              )}
            </details>
          );
        })}
      </div>
      <div className="bottom-tip">
        <CircleHelp size={16} />
        <span>
          {t(
            'messages.optionsApplyToYourSessionFlatteningTakesEffectWhenYouRe',
          )}
        </span>
      </div>
    </>
  );
}
