import appInfo from '../package.json';
import { I18nProvider } from './LocaleProvider';
import {
  resolveLanguage,
  translator,
  formatMessage,
  type Language,
  type MessageKey,
} from './i18n';
import { GeneralPanel } from './GeneralPanel';
import { ProfilePanel, ProfileDialog } from './ProfilePanel';
import { UserMenu, type UserMenuTarget } from './UserMenu';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  SlidersHorizontal,
  MessageSquare,
  Users,
  Shirt,
  Package,
  Radio,
  Settings2,
  ArrowUpRight,
  ArrowDownLeft,
  Plug,
  Unplug,
  Search,
  Download,
  Upload,
  Plus,
  Trash2,
  Send,
  ChevronRight,
  Activity,
  Check,
  X,
  Terminal,
  CircleHelp,
  Layers,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Info,
} from 'lucide-react';
import type {
  Snapshot,
  Settings,
  SendRequest,
  UserRef,
  ProfileRecord,
  ProfileQuery,
} from './shared';
import './index.css';
import logoURL from '../assets/isora.svg?url';

const nav: {
  id: string;
  label: MessageKey;
  icon: typeof Layers;
  caption: MessageKey;
}[] = [
  {
    id: 'general',
    label: 'navigation.general',
    icon: SlidersHorizontal,
    caption: 'navigation.generalDescription',
  },
  {
    id: 'chat',
    label: 'navigation.chat',
    icon: MessageSquare,
    caption: 'navigation.chatDescription',
  },
  {
    id: 'room',
    label: 'navigation.room',
    icon: Users,
    caption: 'navigation.roomDescription',
  },
  {
    id: 'inventory',
    label: 'navigation.inventory',
    icon: Package,
    caption: 'navigation.inventoryDescription',
  },
  {
    id: 'profiles',
    label: 'navigation.profiles',
    icon: Search,
    caption: 'navigation.profilesDescription',
  },
  {
    id: 'wardrobe',
    label: 'navigation.wardrobe',
    icon: Shirt,
    caption: 'navigation.wardrobeDescription',
  },
  {
    id: 'packets',
    label: 'navigation.packets',
    icon: Radio,
    caption: 'navigation.packetsDescription',
  },
  {
    id: 'settings',
    label: 'navigation.settings',
    icon: Settings2,
    caption: 'navigation.settingsDescription',
  },
  {
    id: 'info',
    label: 'navigation.info',
    icon: Info,
    caption: 'navigation.infoDescription',
  },
];
const time = (value: string, language: Language) =>
  new Date(value).toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const avatarURL = (figure: string) =>
  `https://www.habbo.com/habbo-imaging/avatarimage?figure=${encodeURIComponent(figure)}&direction=2&head_direction=3&size=m&gesture=sml`;
const filterText = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function AvatarImage({ figure, name }: { figure: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed || !figure ? (
    <span className="avatar-fallback">{name.slice(0, 2).toUpperCase()}</span>
  ) : (
    <img
      className="avatar"
      src={avatarURL(figure)}
      alt={name}
      onError={() => setFailed(true)}
    />
  );
}
function Empty({
  icon: Icon = Layers,
  title,
  children,
}: {
  icon?: typeof Layers;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function App() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia('(max-width: 900px)').matches,
  );
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const outfitDialog = useRef<HTMLDialogElement>(null);
  const chatLog = useRef<HTMLDivElement>(null);
  const [profileView, setProfileView] = useState<{
    record?: ProfileRecord;
    loading: boolean;
    error: string;
    title: string;
  }>();
  const profileSequence = useRef(0);
  const [state, setState] = useState<Snapshot>();
  const language = resolveLanguage(
    state?.settings.language,
    state?.gameConnected ? state.session?.host : undefined,
  );
  const t = translator(language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const [userMenu, setUserMenu] = useState<UserMenuTarget>();
  const closeUserMenu = useCallback(() => setUserMenu(undefined), []);
  const [page, setPage] = useState('general');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [roomTab, setRoomTab] = useState('users');
  const [chatFilter, setChatFilter] = useState('all');
  const lastChatId = state?.chat.at(-1)?.id;
  useLayoutEffect(() => {
    if (page !== 'chat' || !chatLog.current) return;
    chatLog.current.scrollTop = chatLog.current.scrollHeight;
    chatLog.current.lastElementChild?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [page, lastChatId, chatFilter, query]);
  const [outfitForm, setOutfitForm] = useState(false);
  useLayoutEffect(() => {
    if (!outfitForm) return;
    const element = outfitDialog.current!;
    element.showModal();
    return () => element.close();
  }, [outfitForm]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const change = () => {
      setNarrow(media.matches);
      setMobileNavigation(false);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!narrow || !mobileNavigation) return;
    const element = sidebar.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const buttons = () => [
      ...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ];
    buttons()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavigation(false);
      }
      if (event.key !== 'Tab') return;
      const focusable = buttons(),
        first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      navigationToggle.current?.focus({ preventScroll: true });
    };
  }, [narrow, mobileNavigation]);
  const [outfit, setOutfit] = useState({ name: '', figure: '', gender: 'M' });
  const [packetSelected, setPacketSelected] = useState<number>();
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [header, setHeader] = useState('');
  const [fields, setFields] = useState(() =>
    JSON.stringify(
      [
        { type: 'string', value: t('composer.sampleText') },
        { type: 'int', value: 0 },
        { type: 'int', value: -1 },
      ],
      null,
      2,
    ),
  );
  const [packetTab, setPacketTab] = useState('log');
  const [map, setMap] = useState('');
  const [port, setPort] = useState('9092');
  const [host, setHost] = useState('127.0.0.1');
  const run = async (fn: () => Promise<unknown>, success = '') => {
    try {
      setError('');
      await fn();
      if (success) setNotice(success);
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          '',
        ),
      );
    }
  };
  useEffect(() => {
    let alive = true;
    const off = window.isora.subscribe((s) => {
      if (alive) setState(s);
    });
    window.isora
      .snapshot()
      .then((s) => {
        if (alive) {
          setState(s);
          setPort(String(s.settings.port));
          setHost(s.settings.host);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    closeUserMenu();
  }, [page, roomTab, state?.room.id, state?.session?.host, closeUserMenu]);
  if (!state)
    return (
      <div className="loading">
        {'' + t('messages.startingIsora') + ' '}
        {error}
      </div>
    );
  const s = state;
  const active = nav.find((n) => n.id === page)!;
  const action = (name: string, value?: unknown, success?: string) =>
    run(() => window.isora.action(name, value), success);
  const set = (key: keyof Settings, value: boolean) => {
    setState((current) =>
      current
        ? { ...current, settings: { ...current.settings, [key]: value } }
        : current,
    );
    return run(async () => {
      try {
        await window.isora.settings({ [key]: value });
      } finally {
        setState(await window.isora.snapshot());
      }
    });
  };
  const connected = s.status === 'connected';
  const ready = s.gameConnected;
  const openProfile = (value: ProfileQuery | ProfileRecord) => {
    const sequence = ++profileSequence.current;
    if ('key' in value) {
      setProfileView({
        record: value,
        loading: false,
        error: '',
        title: value.profile.name,
      });
      return;
    }
    const previous = profileView?.record;
    const record =
      previous &&
      previous.hotel === value.hotel &&
      previous.profile.id === value.id
        ? previous
        : undefined;
    setProfileView({
      record,
      loading: true,
      error: '',
      title: value.name ?? `#${value.id}`,
    });
    window.isora
      .lookupProfile(value)
      .then((record) => {
        if (profileSequence.current === sequence)
          setProfileView({
            record,
            loading: false,
            error: '',
            title: record.profile.name,
          });
      })
      .catch((e: Error) => {
        if (profileSequence.current === sequence)
          setProfileView({
            record,
            loading: false,
            error: e.message.replace(
              /^Error invoking remote method '[^']+': (Error: )?/,
              '',
            ),
            title: value.name ?? `#${value.id}`,
          });
      });
  };
  const switchPage = (id: string) => {
    setMobileNavigation(false);
    window.scrollTo(0, 0);
    setPage(id);
    setQuery('');
  };
  const toggle = (
    key: keyof Settings,
    title: string,
    description: string,
    names: string[],
    dir: 'in' | 'out' = 'out',
  ) => {
    const available =
      !ready ||
      s.messages.some(
        (m) =>
          m.direction === dir &&
          names.some(
            (n) =>
              m.name
                .toLowerCase()
                .replace(/(message)?(composer|event|parser)$/i, '') ===
              n.toLowerCase(),
          ),
      );
    return (
      <label
        className={`toggle-row ${ready && !available ? 'unavailable' : ''}`}
        key={key}
      >
        <span>
          <b>{title}</b>
          <small>{description}</small>
          {ready && !available && (
            <small className="warning">
              {t('messages.messageNotIdentifiedInThisSession')}
            </small>
          )}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={Boolean(s.settings[key])}
          onChange={(e) => set(key, e.target.checked)}
        />
        <i />
      </label>
    );
  };
  const card = (
    title: string,
    icon: typeof Layers,
    content: React.ReactNode,
  ) => {
    const Icon = icon;
    return (
      <section className="card">
        <h2>
          <Icon size={17} />
          {title}
        </h2>
        {content}
      </section>
    );
  };
  const search = (placeholder: string) => (
    <div className="search">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          className="icon-button"
          aria-label={t('messages.clearSearch')}
          onClick={() => setQuery('')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
  const userRef = (user: {
    id: number;
    type: number;
    name: string;
    index?: number;
  }): UserRef => ({
    hotel: s.session?.host ?? '',
    roomId: s.room.id,
    id: user.id,
    type: user.type,
    name: user.name,
    index: user.index,
  });
  const contextHandlers = (ref: UserRef, profilesOnly = false) => ({
    tabIndex: 0,
    'aria-haspopup': 'menu' as const,
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.focus();
      setUserMenu({ ref, x: event.clientX, y: event.clientY, profilesOnly });
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (
        event.key === 'ContextMenu' ||
        (event.shiftKey && event.key === 'F10')
      ) {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        setUserMenu({
          ref,
          x: bounds.left + 30,
          y: bounds.bottom,
          profilesOnly,
        });
      }
    },
  });
  return (
    <I18nProvider language={language}>
      <div
        className={`app-shell ${s.settings.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavigation ? 'navigation-open' : ''}`}
      >
        {userMenu && (
          <UserMenu
            target={userMenu}
            state={s}
            close={closeUserMenu}
            openProfile={(ref) => openProfile({ hotel: ref.hotel, id: ref.id })}
            run={(name, ref, success) =>
              void run(() => window.isora.userAction(name, ref), success)
            }
          />
        )}
        {profileView && (
          <ProfileDialog
            record={
              s.profileHistory.find((r) => r.key === profileView.record?.key) ??
              profileView.record
            }
            loading={profileView.loading}
            error={profileView.error}
            title={profileView.title}
            state={s}
            run={run}
            close={() => {
              profileSequence.current++;
              setProfileView(undefined);
            }}
            refresh={() => {
              if (profileView.record)
                openProfile({
                  hotel: profileView.record.hotel,
                  id: profileView.record.profile.id,
                });
            }}
          />
        )}
        {narrow && mobileNavigation && (
          <button
            className="navigation-backdrop"
            tabIndex={-1}
            aria-label={t('messages.closeNavigation')}
            onClick={() => setMobileNavigation(false)}
          />
        )}
        <aside
          id="isora-navigation"
          className="sidebar"
          ref={sidebar}
          aria-hidden={narrow && !mobileNavigation}
          inert={narrow && !mobileNavigation}
        >
          {narrow && (
            <button
              className="icon-button mobile-navigation-close"
              aria-label={t('messages.closeNavigation')}
              onClick={() => setMobileNavigation(false)}
            >
              <X size={18} />
            </button>
          )}
          <div className="brand">
            <div className="brand-symbol">
              <span />
              <span />
              <span />
              <span />
            </div>
            <span>
              isora
              <span className="brand-dot">.</span>
            </span>
            <small>{t('messages.habboTools')}</small>
          </div>
          <div className="workspace-label">{t('messages.yourSpace')}</div>
          <nav aria-label={t('messages.isoraSections')}>
            {nav
              .filter((n) => n.id !== 'settings' && n.id !== 'info')
              .map((n) => {
                const Icon = n.icon;
                const count =
                  n.id === 'room'
                    ? s.avatars.length
                    : n.id === 'wardrobe'
                      ? s.outfits.length
                      : undefined;
                return (
                  <button
                    key={n.id}
                    aria-label={t(n.label)}
                    title={t(n.label)}
                    className={page === n.id ? 'nav-item active' : 'nav-item'}
                    onClick={() => switchPage(n.id)}
                  >
                    <Icon size={19} />
                    <span>{t(n.label)}</span>
                    {count ? <em>{count}</em> : null}
                    {page === n.id && <span className="nav-dot" />}
                  </button>
                );
              })}
          </nav>
          <div className="sidebar-bottom">
            <button
              className={page === 'settings' ? 'nav-item active' : 'nav-item'}
              aria-label={t('navigation.settings')}
              title={t('navigation.settings')}
              onClick={() => switchPage('settings')}
            >
              <Settings2 size={19} />
              <span>{t('navigation.settings')}</span>
            </button>
            <button
              className={page === 'info' ? 'nav-item active' : 'nav-item'}
              aria-label="Info"
              title="Info"
              onClick={() => switchPage('info')}
            >
              <Info size={19} />
              <span>Info</span>
            </button>
            <div className="session-card">
              <div>
                <span className={`status-dot ${connected ? 'green' : ''}`} />
                <b>
                  {ready
                    ? t('messages.habboConnected')
                    : connected
                      ? t('messages.waitingForHabbo')
                      : t('connection.disconnected')}
                </b>
              </div>
              <small>
                {connected
                  ? `${s.session?.client ?? 'G-Earth'} · ${s.session?.host ?? t('messages.extensionRegistered')}`
                  : t('messages.connectGEarthToGetStarted')}
              </small>
              <span className="session-version">
                {'' + t('messages.flashNitro') + ' '}
                <span>{`v${appInfo.version}`}</span>
              </span>
            </div>
          </div>
        </aside>
        <main inert={narrow && mobileNavigation}>
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button sidebar-toggle"
                ref={navigationToggle}
                aria-label={
                  narrow
                    ? t('messages.openNavigation')
                    : s.settings.sidebarCollapsed
                      ? t('messages.expandMenu')
                      : t('messages.collapseMenu')
                }
                title={
                  narrow
                    ? t('messages.openNavigation')
                    : s.settings.sidebarCollapsed
                      ? t('messages.expandMenu')
                      : t('messages.collapseMenu')
                }
                aria-controls="isora-navigation"
                aria-expanded={
                  narrow ? mobileNavigation : !s.settings.sidebarCollapsed
                }
                onClick={() => {
                  const compact =
                    window.matchMedia('(max-width: 900px)').matches;
                  if (compact !== narrow) {
                    setNarrow(compact);
                    setMobileNavigation(false);
                    return;
                  }
                  if (compact) setMobileNavigation(true);
                  else
                    void set('sidebarCollapsed', !s.settings.sidebarCollapsed);
                }}
              >
                {narrow ? (
                  <Menu size={18} />
                ) : s.settings.sidebarCollapsed ? (
                  <PanelLeftOpen size={18} />
                ) : (
                  <PanelLeftClose size={18} />
                )}
              </button>
              <span className="breadcrumb-root">{t('messages.extension')}</span>{' '}
              <ChevronRight className="breadcrumb-separator" size={13} />
              <span className="breadcrumb-current">{t(active.label)}</span>
            </div>
            <div className="connection-target">
              <span className={`status-dot ${connected ? 'green' : ''}`} />
              <span>
                {s.settings.host}:{s.settings.port}
              </span>
              <button
                className={
                  connected ? 'button subtle small' : 'button primary small'
                }
                disabled={s.status === 'connecting'}
                onClick={() =>
                  run(() =>
                    connected
                      ? window.isora.disconnect()
                      : window.isora.connect(),
                  )
                }
              >
                {connected ? <Unplug size={14} /> : <Plug size={14} />}
                {s.status === 'connecting'
                  ? t('connection.connecting')
                  : connected
                    ? t('connection.disconnect')
                    : t('connection.connect')}
              </button>
            </div>
          </header>
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">{t('messages.habboCompanion')}</div>
                <h1>{t(active.label)}</h1>
                <p>{t(active.caption)}</p>
              </div>
              <span className="platform-pill">
                <span className="tiny-square" />
                {t('messages.flashNitro2')}
              </span>
            </div>
            {error && (
              <div className="alert error" role="alert">
                <CircleHelp size={17} />
                <span>{formatMessage(error, language)}</span>
                <button
                  className="icon-button"
                  aria-label={t('messages.dismissError')}
                  onClick={() => setError('')}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="toast" role="status">
                <Check size={17} />
                {formatMessage(notice, language)}
              </div>
            )}
            {!connected && page === 'general' && (
              <div className="welcome-banner">
                <div className="banner-icon">
                  <Plug size={23} />
                </div>
                <div>
                  <b>{t('messages.itStartsWithAConnection')}</b>
                  <p>
                    {t(
                      'messages.openGEarthEnableExtensionsAndConnectThenLogIntoHabbo',
                    )}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => switchPage('settings')}
                >
                  {'' + t('messages.configure') + ' '}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
            {connected && !ready && (
              <div className="alert">
                <Activity size={17} />
                <span>
                  {t(
                    'messages.gEarthConnectedWaitingForAHabboFlashNitroSession',
                  )}
                </span>
              </div>
            )}
            {ready && !s.messages.some((m) => m.name) && (
              <div className="alert">
                <CircleHelp size={17} />
                <span>
                  {t(
                    'messages.gEarthHasNotProvidedMessageNamesImportYourVersionS',
                  )}
                </span>
              </div>
            )}
            {page === 'general' && (
              <>
                <div className="stats-grid">
                  <div className="stat">
                    <span>
                      <ArrowDownLeft size={16} />
                      {t('messages.packetsReceived')}
                    </span>
                    <b>{s.received.toLocaleString()}</b>
                    <small>{t('messages.duringThisAppSession')}</small>
                  </div>
                  <div className="stat">
                    <span>
                      <ArrowUpRight size={16} />
                      {t('messages.packetsSent')}
                    </span>
                    <b>{s.sent.toLocaleString()}</b>
                    <small>{t('messages.fromTheExtension')}</small>
                  </div>
                  <div className="stat">
                    <span>
                      <Users size={16} />
                      {t('messages.avatarsInRoom')}
                    </span>
                    <b>
                      {s.avatars.length}
                      <em>
                        {s.room.id
                          ? t('room.title', { v0: s.room.id })
                          : t('messages.noActiveRoom')}
                      </em>
                    </b>
                    <small>{t('messages.usersPetsAndBots')}</small>
                  </div>
                </div>
                <div className="section-label">
                  {t('messages.customizeYourSession')}{' '}
                  <span>{t('messages.changesAreSavedAutomatically')}</span>
                </div>
                <GeneralPanel
                  state={s}
                  save={(value) => {
                    setState((current) =>
                      current
                        ? {
                            ...current,
                            settings: { ...current.settings, ...value },
                          }
                        : current,
                    );
                    void run(async () => {
                      try {
                        await window.isora.settings(value);
                      } finally {
                        setState(await window.isora.snapshot());
                      }
                    });
                  }}
                  action={action}
                />
                <div className="bottom-tip">
                  <Terminal size={17} />
                  <span>
                    {'' + t('messages.shortcutsFromHabbo') + ' '}
                    <code>{'/x'}</code>
                    {' ' + t('messages.open') + ''} <code>{'/saveoutfit'}</code>
                    {' ' + t('messages.saveLook') + ' '}
                    <code>{'/goto ID'}</code> {t('messages.goToRoom')}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => switchPage('settings')}
                  >
                    {'' + t('messages.viewCommands') + ' '}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </>
            )}
            {page === 'profiles' && (
              <ProfilePanel state={s} open={openProfile} run={run} />
            )}
            {page === 'chat' && (
              <section className="card full-card">
                <div className="toolbar">
                  {search(t('messages.searchUserOrMessage'))}
                  <select
                    aria-label={t('messages.messageType')}
                    value={chatFilter}
                    onChange={(e) => setChatFilter(e.target.value)}
                  >
                    <option value="all">{t('messages.allMessages')}</option>
                    <option value="chat">{t('navigation.chat')}</option>
                    <option value="shout">{t('messages.shouts')}</option>
                    <option value="whisper">{t('messages.whispers')}</option>
                    <option value="entry">
                      {t('messages.arrivalsAndDepartures')}
                    </option>
                  </select>
                  <button
                    className="button subtle"
                    onClick={() =>
                      run(async () => {
                        if (await window.isora.export('chat'))
                          setNotice(t('messages.logExported'));
                      })
                    }
                  >
                    <Download size={15} />
                    {t('messages.export')}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t('messages.clearChatLog')}
                    onClick={() => action('clearChat')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {s.chat.length === 0 ? (
                  <Empty
                    icon={MessageSquare}
                    title={t('messages.conversationsWillAppearHere')}
                  >
                    {t(
                      'messages.enterARoomWithTheExtensionConnectedSearchAndExportYour',
                    )}
                  </Empty>
                ) : (
                  <div className="chat-log" ref={chatLog}>
                    {s.chat
                      .filter(
                        (c) =>
                          (chatFilter === 'all' || c.kind === chatFilter) &&
                          `${c.user} ${c.text}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((c) => (
                        <div key={c.id} className={`chat-line ${c.kind}`}>
                          <time>{time(c.time, language)}</time>
                          <span className="chat-type">
                            {c.kind === 'whisper'
                              ? t('messages.whisper')
                              : c.kind === 'shout'
                                ? t('messages.shout')
                                : c.kind === 'entry'
                                  ? t('messages.room')
                                  : t('messages.chat')}
                          </span>
                          <b>
                            {c.kind === 'system'
                              ? formatMessage(c.user, language)
                              : c.user}
                          </b>
                          <span>
                            {c.kind === 'system' || c.kind === 'entry'
                              ? formatMessage(c.text, language)
                              : c.text}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="card-footer">
                  {s.chat.length}
                  {' ' + t('messages.messagesUpTo3000InMemory') + ''}
                  <span>{t('messages.theLogIsClearedWhenTheAppCloses')}</span>
                </div>
              </section>
            )}
            {page === 'room' && (
              <>
                <div className="room-summary">
                  <div className="room-symbol">
                    <Layers size={25} />
                  </div>
                  <div>
                    <h2>
                      {s.room.id
                        ? t('room.title', { v0: s.room.id })
                        : t('messages.noActiveRoom2')}
                    </h2>
                    <p>
                      {s.room.name
                        ? t('messages.model', { v0: s.room.name })
                        : t('messages.enterARoomToLoadItsUsers')}
                    </p>
                  </div>
                  <span className="platform-pill">
                    {s.avatars.length}
                    {' ' + t('messages.avatars') + ''}
                  </span>
                </div>
                <section className="card full-card">
                  <div className="tabs">
                    <button
                      className={roomTab === 'users' ? 'selected' : ''}
                      onClick={() => setRoomTab('users')}
                    >
                      {'' + t('messages.users') + ' '}
                      <span>{s.avatars.length}</span>
                    </button>
                    <button
                      className={roomTab === 'visitors' ? 'selected' : ''}
                      onClick={() => setRoomTab('visitors')}
                    >
                      {'' + t('messages.visitors') + ' '}
                      <span>{s.visitors.length}</span>
                    </button>
                    <button
                      className={roomTab === 'furni' ? 'selected' : ''}
                      onClick={() => setRoomTab('furni')}
                    >
                      {'' + t('messages.floorFurniture') + ' '}
                      <span>{s.furni.length}</span>
                    </button>
                  </div>
                  <div className="toolbar">
                    {search(
                      roomTab === 'furni'
                        ? t('messages.searchNameIdTypeOrOwner')
                        : t('messages.searchUser'),
                    )}
                    <small>
                      {roomTab === 'visitors'
                        ? t('messages.currentRoomOnlyClearedWhenYouChangeRooms')
                        : t('messages.updatesWhenYouEnterOrLeaveTheRoom')}
                    </small>
                  </div>
                  {roomTab === 'furni' && (
                    <div className="furni-catalog-bar">
                      <small
                        className={s.furniCatalog.error ? 'warning' : 'muted'}
                      >
                        {s.furniCatalog.status === 'loading'
                          ? t('messages.loadingFurnitureNames')
                          : s.furniCatalog.count
                            ? t('messages.furnitureTypesIdentified', {
                                v0: s.furniCatalog.count.toLocaleString(
                                  language,
                                ),
                              })
                            : t('messages.furnitureNamesUnavailable')}
                        {s.furniCatalog.error &&
                          ` · ${formatMessage(s.furniCatalog.error, language)}`}
                      </small>
                      <button
                        className="button subtle small"
                        disabled={
                          !ready ||
                          s.furniCatalog.status === 'loading' ||
                          s.furniCatalog.status === 'unsupported'
                        }
                        onClick={() => action('refreshFurniNames')}
                      >
                        {t('messages.updateNames')}
                      </button>
                    </div>
                  )}
                  {roomTab === 'furni' ? (
                    s.furni.length === 0 ? (
                      <Empty
                        icon={Package}
                        title={t('messages.roomFurnitureWillAppearHere')}
                      >
                        {t(
                          'messages.reEnterTheRoomToLoadItsFloorFurnitureYouCan',
                        )}
                      </Empty>
                    ) : (
                      <div className="table-scroll">
                        <table data-testid="room-furni-table">
                          <thead>
                            <tr>
                              <th>{t('common.name')}</th>
                              <th>{t('messages.id')}</th>
                              <th>{t('messages.type')}</th>
                              <th>{t('messages.owner')}</th>
                              <th>{t('messages.position')}</th>
                              <th>{t('common.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.furni
                              .filter((f) =>
                                filterText(
                                  `${f.name ?? ''} ${f.identifier ?? ''} ${f.id} ${f.kind} ${f.ownerName}`,
                                ).includes(filterText(query)),
                              )
                              .map((f) => (
                                <tr key={f.id}>
                                  <td title={f.description}>
                                    <b className="furni-name">
                                      {f.name ||
                                        t('messages.furnitureType', {
                                          v0: f.kind,
                                        })}
                                    </b>
                                    <small className="furni-identifier muted">
                                      {f.identifier ||
                                        t('messages.namePending')}
                                    </small>
                                  </td>
                                  <td className="mono">
                                    {f.id}
                                    {f.hidden && (
                                      <small className="muted">
                                        {' ' + t('messages.hidden') + ''}
                                      </small>
                                    )}
                                  </td>
                                  <td className="mono">{f.kind}</td>
                                  <td>{f.ownerName || f.ownerId}</td>
                                  <td className="mono">
                                    {f.x}, {f.y}, {f.z}
                                  </td>
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        className="button subtle small"
                                        aria-label={t(
                                          'messages.findFurniture',
                                          {
                                            v0: f.id,
                                          },
                                        )}
                                        title={t(
                                          'messages.makesItMoveUpAndDownFor4SecondsOnlyIn',
                                        )}
                                        disabled={
                                          !ready ||
                                          f.hidden ||
                                          s.furniHighlight === f.id
                                        }
                                        onClick={() =>
                                          action('findFurni', f.id)
                                        }
                                      >
                                        {s.furniHighlight === f.id
                                          ? t('messages.highlighting')
                                          : t('messages.find')}
                                      </button>
                                      <button
                                        className="button subtle small"
                                        disabled={!ready}
                                        onClick={() =>
                                          action('hideFurni', f.id)
                                        }
                                      >
                                        {f.hidden
                                          ? t('messages.show')
                                          : t('messages.hide')}
                                      </button>
                                      <button
                                        className="button subtle small"
                                        disabled={!ready}
                                        onClick={() => action('useFurni', f.id)}
                                      >
                                        {t('messages.use')}
                                      </button>
                                      <button
                                        className="button subtle small"
                                        disabled={!ready}
                                        onClick={() =>
                                          action('rotateFurni', f.id)
                                        }
                                      >
                                        {t('messages.rotate')}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : roomTab === 'users' ? (
                    s.avatars.length === 0 ? (
                      <Empty
                        icon={Users}
                        title={t('messages.yourNextRoomIsWaiting')}
                      >
                        {t('messages.ifYouWereAlreadyInARoomReEnterItTo')}
                      </Empty>
                    ) : (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('common.user')}</th>
                              <th>{t('messages.motto')}</th>
                              <th>{t('messages.id')}</th>
                              <th>{t('messages.entryPosition')}</th>
                              <th>{t('common.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.avatars
                              .filter((a) =>
                                `${a.name} ${a.id}`
                                  .toLowerCase()
                                  .includes(query.toLowerCase()),
                              )
                              .map((a) => (
                                <tr
                                  key={a.index}
                                  {...contextHandlers(userRef(a))}
                                >
                                  <td>
                                    <div className="user-cell">
                                      <AvatarImage
                                        figure={a.figure}
                                        name={a.name}
                                      />
                                      <span>
                                        <b>{a.name}</b>
                                        <small>
                                          {a.type === 1
                                            ? t('common.user')
                                            : a.type === 2
                                              ? t('messages.pet')
                                              : t('messages.bot')}
                                        </small>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="muted">{a.motto || '—'}</td>
                                  <td className="mono">{a.id}</td>
                                  <td className="mono">
                                    {a.x}, {a.y}
                                  </td>
                                  <td>
                                    <button
                                      className="icon-button"
                                      title={t('messages.userActions')}
                                      aria-label={t('messages.actionsFor', {
                                        v0: a.name,
                                      })}
                                      aria-haspopup="menu"
                                      onClick={(event) => {
                                        const bounds =
                                          event.currentTarget.getBoundingClientRect();
                                        setUserMenu({
                                          ref: userRef(a),
                                          x: bounds.right,
                                          y: bounds.bottom,
                                        });
                                      }}
                                    >
                                      <MoreHorizontal size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : s.visitors.length === 0 ? (
                    <Empty
                      icon={Users}
                      title={t('messages.noVisitorsRecorded')}
                    >
                      {t(
                        'messages.enterARoomToRecordItsVisitorsTheListIsCleared',
                      )}
                    </Empty>
                  ) : (
                    <div
                      className="table-scroll"
                      role="region"
                      aria-label={t('messages.visitorList')}
                      tabIndex={0}
                    >
                      <table data-testid="visitors-table">
                        <thead>
                          <tr>
                            <th>{t('common.user')}</th>
                            <th>{t('messages.visits')}</th>
                            <th>{t('messages.departure')}</th>
                            <th
                              aria-sort="descending"
                              title={t('messages.mostRecentFirst')}
                            >
                              {'' + t('messages.lastArrival') + ' '}
                              <span aria-hidden="true">↓</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.visitors
                            .filter((v) =>
                              v.name
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                            )
                            .map((v) => (
                              <tr
                                key={`${v.type}:${v.id}:${v.id > 0 ? '' : v.name}`}
                                {...contextHandlers(userRef(v), true)}
                              >
                                <td>
                                  <div className="visitor-user">
                                    <span>{v.name}</span>
                                    <button
                                      className="icon-button"
                                      title={t('messages.openProfile')}
                                      aria-label={t('messages.profilesOf', {
                                        v0: v.name,
                                      })}
                                      aria-haspopup="menu"
                                      disabled={v.type !== 1 || v.id <= 0}
                                      onClick={(event) => {
                                        const bounds =
                                          event.currentTarget.getBoundingClientRect();
                                        setUserMenu({
                                          ref: userRef(v),
                                          x: bounds.right,
                                          y: bounds.bottom,
                                          profilesOnly: true,
                                        });
                                      }}
                                    >
                                      <MoreHorizontal size={16} />
                                    </button>
                                  </div>
                                </td>
                                <td className="mono">
                                  <span className="visit-count">{v.count}</span>
                                </td>
                                <td>
                                  {v.presence === 'left' && v.left ? (
                                    time(v.left, language)
                                  ) : v.presence === 'present' ? (
                                    <span className="green-text">
                                      {t('messages.inTheRoom')}
                                    </span>
                                  ) : (
                                    <span
                                      className="muted"
                                      title={t(
                                        'messages.departureWasNotObservedRoomObservationWasInterrupted',
                                      )}
                                    >
                                      {t('messages.notObserved')}
                                    </span>
                                  )}
                                </td>
                                <td className="mono">
                                  <time
                                    dateTime={v.entered}
                                    title={new Date(v.entered).toLocaleString(
                                      language,
                                    )}
                                  >
                                    {time(v.entered, language)}
                                  </time>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
            {page === 'inventory' && (
              <section className="card full-card">
                <div className="toolbar">
                  {search(t('messages.searchFurnitureIdOrType'))}
                  <button
                    className="button primary"
                    disabled={!ready}
                    onClick={() =>
                      action(
                        'inventory',
                        undefined,
                        t('messages.inventoryRequested'),
                      )
                    }
                  >
                    <Package size={15} />
                    {t('messages.loadInventory')}
                  </button>
                </div>
                {s.inventory.length === 0 ? (
                  <Empty
                    icon={Package}
                    title={t('messages.yourInventoryInDetail')}
                  >
                    {t(
                      'messages.connectHabboEnterARoomAndClickLoadInventoryFurnitureIs',
                    )}
                  </Empty>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('messages.inventoryId')}</th>
                          <th>{t('messages.furnitureId')}</th>
                          <th>{t('messages.type2')}</th>
                          <th>{t('messages.type')}</th>
                          <th>{t('messages.tradeable')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.inventory
                          .filter((i) =>
                            `${i.itemId} ${i.id} ${i.kind}`.includes(query),
                          )
                          .map((i) => (
                            <tr key={i.itemId}>
                              <td className="mono">{i.itemId}</td>
                              <td className="mono">{i.id}</td>
                              <td>
                                {i.type === 'S'
                                  ? t('messages.floor2')
                                  : t('messages.wall2')}
                              </td>
                              <td className="mono">{i.kind}</td>
                              <td>
                                {i.tradeable
                                  ? t('messages.yes')
                                  : t('messages.no')}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="card-footer">
                  {s.inventory.length}
                  {' ' + t('messages.items') + ''}
                  <span>{t('messages.flashNitroInventoryData')}</span>
                </div>
              </section>
            )}
            {page === 'wardrobe' && (
              <>
                <div className="wardrobe-toolbar">
                  {search(t('messages.searchOutfit'))}
                  <button
                    className="button subtle"
                    onClick={() => run(() => window.isora.importWardrobe())}
                  >
                    <Upload size={15} />
                    {t('messages.import')}
                  </button>
                  <button
                    className="button subtle"
                    onClick={() => run(() => window.isora.export('wardrobe'))}
                  >
                    <Download size={15} />
                    {t('messages.export')}
                  </button>
                  <button
                    className="button subtle"
                    disabled={!ready}
                    onClick={() =>
                      action(
                        s.self ? 'saveSelf' : 'self',
                        undefined,
                        s.self
                          ? t('messages.currentLookSaved')
                          : t('messages.profileRequested'),
                      )
                    }
                  >
                    <Shirt size={15} />
                    {s.self ? t('messages.myLook') : t('messages.loadProfile')}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setOutfitForm(true)}
                  >
                    <Plus size={16} />
                    {t('messages.addOutfit')}
                  </button>
                </div>
                {s.outfits.length === 0 ? (
                  <section className="card">
                    <Empty
                      icon={Shirt}
                      title={t('messages.yourStyleStartsHere')}
                    >
                      {t('messages.saveYourCurrentLookCopyAUserSLookFromRoom')}
                    </Empty>
                  </section>
                ) : (
                  <div className="outfits">
                    {s.outfits
                      .filter((o) =>
                        o.name.toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((o) => (
                        <article className="outfit" key={o.id}>
                          <button
                            className="outfit-delete icon-button"
                            aria-label={`Eliminar ${o.name}`}
                            onClick={() => action('deleteOutfit', o.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                          <div className="outfit-preview">
                            <AvatarImage figure={o.figure} name={o.name} />
                          </div>
                          <b>{o.name}</b>
                          <small>
                            {o.gender === 'F'
                              ? t('messages.female')
                              : o.gender === 'M'
                                ? t('messages.male')
                                : t('messages.unisex')}
                          </small>
                          <button
                            className="button subtle"
                            disabled={!ready}
                            onClick={() =>
                              action(
                                'wearOutfit',
                                o.id,
                                t('messages.lookChangeSent'),
                              )
                            }
                          >
                            {'' + t('messages.wearOutfit') + ' '}
                            <ArrowUpRight size={14} />
                          </button>
                        </article>
                      ))}
                  </div>
                )}
                <div className="bottom-tip">
                  <CircleHelp size={16} />
                  {t(
                    'messages.previewsUseHabboSImagingServiceYourOutfitsRemainAvailableOffline',
                  )}
                </div>
              </>
            )}
            {page === 'packets' && (
              <section className="card full-card">
                <div className="tabs">
                  {[
                    ['log', t('messages.log')],
                    ['compose', t('messages.composer')],
                    ['map', t('messages.messageMap')],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={packetTab === id ? 'selected' : ''}
                      onClick={() => setPacketTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {packetTab === 'log' && (
                  <>
                    <div className="toolbar">
                      {search(t('messages.searchNameHeaderOrDirection'))}
                      <button
                        className="button subtle"
                        onClick={() =>
                          set('capturePackets', !s.settings.capturePackets)
                        }
                      >
                        <Activity size={15} />
                        {s.settings.capturePackets
                          ? t('messages.pauseCapture')
                          : t('messages.resumeCapture')}
                      </button>
                      <button
                        className="button subtle"
                        onClick={() =>
                          run(() => window.isora.export('packets'))
                        }
                      >
                        <Download size={15} />
                        {t('messages.export')}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t('messages.clearPackets')}
                        onClick={() => action('clearPackets')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {s.packets.length === 0 ? (
                      <Empty
                        icon={Radio}
                        title={t('messages.listeningWhenYouConnect')}
                      >
                        {t(
                          'messages.incomingAndOutgoingPacketsTheirHeadersAndHexadecimalContentWillAppear',
                        )}
                      </Empty>
                    ) : (
                      <div className="table-scroll packet-table">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('messages.time')}</th>
                              <th>{t('messages.direction')}</th>
                              <th>{t('messages.header')}</th>
                              <th>{t('messages.message')}</th>
                              <th>{t('messages.size')}</th>
                              <th>{t('messages.status')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.packets
                              .filter((p) =>
                                `${p.name} ${p.header} ${p.direction}`
                                  .toLowerCase()
                                  .includes(query.toLowerCase()),
                              )
                              .map((p) => (
                                <tr
                                  key={p.id}
                                  className={
                                    packetSelected === p.id
                                      ? 'selected-row'
                                      : ''
                                  }
                                  onClick={() => setPacketSelected(p.id)}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter')
                                      setPacketSelected(p.id);
                                  }}
                                >
                                  <td className="mono muted">
                                    {time(p.time, language)}
                                  </td>
                                  <td>
                                    <span
                                      className={`direction ${p.direction}`}
                                    >
                                      {p.direction === 'in' ? (
                                        <ArrowDownLeft size={13} />
                                      ) : (
                                        <ArrowUpRight size={13} />
                                      )}
                                      {p.direction === 'in'
                                        ? t('messages.incoming')
                                        : t('messages.outgoing')}
                                    </span>
                                  </td>
                                  <td className="mono">{p.header}</td>
                                  <td>
                                    {p.name || t('messages.unidentified')}
                                  </td>
                                  <td className="mono muted">
                                    {p.size}
                                    {t('messages.b')}
                                  </td>
                                  <td>
                                    {p.blocked ? (
                                      <span className="warning">
                                        {t('messages.blocked')}
                                      </span>
                                    ) : p.modified ? (
                                      t('messages.modified')
                                    ) : (
                                      t('messages.original')
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {s.packets.find((p) => p.id === packetSelected) && (
                      <div className="hex-detail">
                        <b>{t('messages.contentHexadecimal')}</b>
                        <code>
                          {s.packets
                            .find((p) => p.id === packetSelected)!
                            .hex.match(/.{1,2}/g)
                            ?.join(' ') || t('messages.emptyPacketContent')}
                        </code>
                        <small>
                          {t('messages.upTo4096BytesOfContentPerPacket')}
                        </small>
                      </div>
                    )}
                    <div className="card-footer">
                      {s.packets.length}
                      {' ' + t('messages.packetsInMemoryUpTo500') + ''}
                      <span>
                        {s.blocked}
                        {' ' + t('messages.blocked2') + ''}
                      </span>
                    </div>
                  </>
                )}
                {packetTab === 'compose' && (
                  <div className="form-panel">
                    <h2>{t('messages.buildAPacket')}</h2>
                    <p>
                      {t(
                        'messages.enterAHeaderFromThisSessionOrAMessageNameIdentified',
                      )}
                    </p>
                    <div className="form-row">
                      <label>
                        {t('messages.destination')}
                        <select
                          value={direction}
                          onChange={(e) =>
                            setDirection(e.target.value as 'in' | 'out')
                          }
                        >
                          <option value="out">
                            {t('messages.serverOutgoing')}
                          </option>
                          <option value="in">
                            {t('messages.clientIncoming')}
                          </option>
                        </select>
                      </label>
                      <label>
                        {t('messages.headerOrName')}
                        <input
                          placeholder={t('messages.chatOrANumericId')}
                          value={header}
                          onChange={(e) => setHeader(e.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      {t('messages.fieldsJson')}
                      <textarea
                        className="code-input"
                        rows={10}
                        value={fields}
                        onChange={(e) => setFields(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <p className="muted">
                      {t(
                        'messages.typesIntShortStringBoolAndHexContentIsEncodedIn',
                      )}
                    </p>
                    <button
                      className="button primary"
                      disabled={!ready || !header.trim()}
                      onClick={() =>
                        run(
                          () =>
                            window.isora.send({
                              direction,
                              header: /^\d+$/.test(header)
                                ? Number(header)
                                : header,
                              fields: JSON.parse(
                                fields,
                              ) as SendRequest['fields'],
                            }),
                          t('messages.packetSent'),
                        )
                      }
                    >
                      <Send size={15} />
                      {t('messages.sendOnce')}
                    </button>
                  </div>
                )}
                {packetTab === 'map' && (
                  <div className="form-panel">
                    <h2>{t('messages.messagesInThisSession')}</h2>
                    <p>
                      {'' + t('messages.gEarthProvided') + ' '}
                      {s.messages.length}
                      {' ' +
                        t(
                          'messages.messagesIfNamesAreMissingImportTheIdsForYourVersion',
                        ) +
                        ''}
                    </p>
                    <label>
                      {t('messages.customMapJson')}
                      <textarea
                        className="code-input"
                        rows={7}
                        placeholder={
                          '[\n  { "id": 123, "direction": "in", "name": "Chat" }\n]'
                        }
                        value={map}
                        onChange={(e) => setMap(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={!ready || !map}
                      onClick={() =>
                        run(
                          () => window.isora.action('mapping', JSON.parse(map)),
                          t('messages.messageMapLoaded'),
                        )
                      }
                    >
                      {t('messages.useThisMap')}
                    </button>
                    <div className="mapping-list">
                      {s.messages.slice(0, 300).map((m, i) => (
                        <div key={i}>
                          <span className="mono">
                            {m.direction.toUpperCase()} · {m.id}
                          </span>
                          <span>{m.name || t('messages.unidentified')}</span>
                        </div>
                      ))}
                    </div>
                    {s.messages.length > 300 && (
                      <small>{t('messages.showingTheFirst300Messages')}</small>
                    )}
                  </div>
                )}
              </section>
            )}
            {page === 'info' && (
              <section className="card about-card">
                <div className="about-brand">
                  <img src={logoURL} alt="Isora" />
                  <div>
                    <h2>Isora</h2>
                    <p>{t('navigation.infoDescription')}</p>
                  </div>
                </div>
                <p>
                  {t(
                    'messages.aGEarthExtensionForHabboFlashNitroCustomizeYourSession',
                  )}
                </p>
                <dl className="about-facts">
                  <div>
                    <dt>{t('messages.version')}</dt>
                    <dd>{appInfo.version}</dd>
                  </div>
                  <div>
                    <dt>{t('messages.compatibility')}</dt>
                    <dd>Habbo Flash / Nitro · G-Earth</dd>
                  </div>
                  <div>
                    <dt>{t('messages.languages')}</dt>
                    <dd>{t('messages.spanishAndEnglish')}</dd>
                  </div>
                </dl>
                <small className="muted">
                  {t('messages.anIndependentAppNotAffiliatedWithHabboOrSulake')}
                </small>
              </section>
            )}
            {page === 'settings' && (
              <div className="card-grid settings-grid">
                <section className="card language-settings">
                  <h2>{t('settings.language.label')}</h2>
                  <div className="form-panel">
                    <label htmlFor="language-choice">
                      {t('settings.language.label')}
                    </label>
                    <select
                      id="language-choice"
                      value={s.settings.language}
                      onChange={(event) => {
                        const choice = event.target
                          .value as Settings['language'];
                        void run(async () => {
                          await window.isora.settings({ language: choice });
                          setState(await window.isora.snapshot());
                        });
                      }}
                    >
                      <option value="auto">
                        {t('settings.language.automatic')}
                      </option>
                      <option value="es">
                        {t('settings.language.spanish')}
                      </option>
                      <option value="en">
                        {t('settings.language.english')}
                      </option>
                    </select>
                    <p className="muted">
                      {t(
                        'messages.automaticSpanishOnHabboEsAndEnglishOnOtherHotels',
                      )}{' '}
                      {t('messages.yourManualChoiceIsKeptWhenYouChangeHotels')}
                    </p>
                  </div>
                </section>
                {card(
                  t('messages.gEarthConnection'),
                  Plug,
                  <div className="form-panel compact">
                    <p>
                      {t(
                        'messages.enableExtensionConnectionsInGEarthTheAppConnectsOverTcp',
                      )}
                    </p>
                    <label>
                      {t('messages.localAddress')}
                      <select
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                      >
                        <option>127.0.0.1</option>
                        <option>{t('messages.localhost')}</option>
                        <option>::1</option>
                      </select>
                    </label>
                    <label>
                      {t('messages.port')}
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={s.status !== 'disconnected'}
                      onClick={() =>
                        run(
                          () =>
                            window.isora.settings({ host, port: Number(port) }),
                          t('messages.connectionSaved'),
                        )
                      }
                    >
                      {t('messages.saveConnection')}
                    </button>
                    <small>
                      {t('messages.changesApplyToTheNextConnection')}
                    </small>
                  </div>,
                )}
                {card(
                  t('messages.preferences'),
                  Settings2,
                  <>
                    {toggle(
                      'commands',
                      t('messages.chatCommands'),
                      t('messages.interceptSupportedCommandsBeforeSendingThem'),
                      [t('navigation.chat')],
                    )}
                    {toggle(
                      'capturePackets',
                      t('messages.capturePackets'),
                      t('messages.keepsTheLast500PacketsInMemory'),
                      [],
                    )}
                    <div className="setting-note">
                      <b>{t('messages.localStorage')}</b>
                      <p>
                        {t(
                          'messages.yourWardrobeSettingsAndSavedProfilesAreStoredOnThisComputer',
                        )}
                      </p>
                    </div>
                  </>,
                )}
                <section className="card">
                  <h2>
                    <Terminal size={17} />
                    {t('messages.availableCommands')}
                  </h2>
                  <div className="commands">
                    {[
                      ['/x', t('messages.openTheApp')],
                      ['/saveoutfit', t('messages.saveYourCurrentLook')],
                      ['/goto ID', t('messages.enterARoom')],
                      ['/reload', t('messages.reEnterTheRoom')],
                      ['/exit', t('messages.leaveTheRoom')],
                      [
                        t('commands.mottoExample'),
                        t('messages.changeYourMotto'),
                      ],
                      ['/clear', t('messages.clearTheExtensionSChatLog')],
                    ].map(([cmd, desc]) => (
                      <div key={cmd}>
                        <code>{cmd}</code>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <h2>
                    <Activity size={17} />
                    {t('messages.extensionActivity')}
                  </h2>
                  <div className="activity-log">
                    {s.notices.length ? (
                      s.notices.map((n, i) => (
                        <div key={i}>
                          <time>{time(n.time, language)}</time>
                          <span>{formatMessage(n.text, language)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        {t(
                          'messages.connectionAndDiagnosticEventsWillAppearHere',
                        )}
                      </p>
                    )}
                  </div>
                </section>
              </div>
            )}
            <footer className="page-footer">
              <span>
                {'' + t('messages.isora') + ' '}
                <span className="muted">/</span>
                {t('messages.anIndependentCompanion')}
              </span>
              <span>
                {'' + t('messages.madeForYourNextRoom') + ' '}
                <span className="footer-square" />
              </span>
            </footer>
          </div>
        </main>
        {outfitForm && (
          <dialog
            ref={outfitDialog}
            className="modal outfit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outfit-title"
            onCancel={(e) => {
              e.preventDefault();
              setOutfitForm(false);
            }}
            onClick={(e) => {
              const bounds = e.currentTarget.getBoundingClientRect();
              if (
                e.target === e.currentTarget &&
                (e.clientX < bounds.left ||
                  e.clientX > bounds.right ||
                  e.clientY < bounds.top ||
                  e.clientY > bounds.bottom)
              )
                setOutfitForm(false);
            }}
          >
            <div className="modal-title">
              <h2 id="outfit-title">{t('messages.newOutfit')}</h2>
              <button
                className="icon-button"
                aria-label={t('messages.close')}
                onClick={() => setOutfitForm(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await window.isora.action('saveOutfit', outfit);
                  setOutfitForm(false);
                  setOutfit({ name: '', figure: '', gender: 'M' });
                }, t('messages.outfitSaved'));
              }}
            >
              <label>
                {t('common.name')}
                <input
                  autoFocus
                  required
                  maxLength={80}
                  placeholder={t('messages.myFavoriteLook')}
                  value={outfit.name}
                  onChange={(e) =>
                    setOutfit({ ...outfit, name: e.target.value })
                  }
                />
              </label>
              <label>
                {t('messages.figure')}
                <input
                  required
                  placeholder="hd-180-1.ch-210-66.lg-270-82"
                  value={outfit.figure}
                  onChange={(e) =>
                    setOutfit({ ...outfit, figure: e.target.value })
                  }
                />
              </label>
              <label>
                {t('messages.gender')}
                <select
                  value={outfit.gender}
                  onChange={(e) =>
                    setOutfit({ ...outfit, gender: e.target.value })
                  }
                >
                  <option value="M">{t('messages.male')}</option>
                  <option value="F">{t('messages.female')}</option>
                  <option value="U">{t('messages.unisex')}</option>
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => setOutfitForm(false)}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="button primary">
                  <Plus size={15} />
                  {t('messages.saveOutfit')}
                </button>
              </div>
            </form>
          </dialog>
        )}
      </div>
    </I18nProvider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
