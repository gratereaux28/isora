import { messageRef } from './i18n';
import { formatMessage, type Language } from './i18n';
import { useI18n } from './LocaleProvider';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  Search,
  Trash2,
  UserRound,
  X,
  RefreshCw,
  ExternalLink,
  Copy,
} from 'lucide-react';
import type {
  ProfileAction,
  ProfileQuery,
  ProfileRecord,
  Snapshot,
} from './shared';
import { hotelDomain } from './user-actions';
const date = (value: string, language: Language) =>
  new Date(value).toLocaleString(language);
const lastVisit = (seconds: number) =>
  seconds < 0
    ? messageRef('common.unavailable')
    : seconds < 60
      ? messageRef('messages.lessThanAMinuteAgo')
      : seconds < 3600
        ? messageRef('messages.minAgo', { v0: Math.floor(seconds / 60) })
        : seconds < 86400
          ? messageRef('messages.hAgo', { v0: Math.floor(seconds / 3600) })
          : messageRef('messages.daysAgo', { v0: Math.floor(seconds / 86400) });
export function ProfilePanel({
  state,
  open,
  run,
}: {
  state: Snapshot;
  open: (value: ProfileQuery | ProfileRecord) => void;
  run: (fn: () => Promise<unknown>, success?: string) => void;
}) {
  const { language, t } = useI18n();
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const rows = state.profileHistory.filter((r) =>
    `${r.profile.name} ${r.profile.id} ${r.hotel}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <>
      <section className="card profile-search-card">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && state.session)
              open({ hotel: state.session.host, name: name.trim() });
          }}
        >
          <label htmlFor="profile-name">{t('messages.habboUsername')}</label>
          <div className="profile-search-row">
            <input
              id="profile-name"
              placeholder={t('messages.enterTheExactName')}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
            <button
              className="button primary"
              disabled={!state.gameConnected || !name.trim()}
            >
              <Search size={14} />
              {t('messages.findProfile')}
            </button>
          </div>
          <p className="muted">
            {state.gameConnected
              ? t('messages.searchOnTheyDoNotNeedToBeInYourRoom', {
                  v0: state.session?.host,
                })
              : t(
                  'messages.connectHabboToSearchYouCanViewSavedProfilesOffline',
                )}
          </p>
        </form>
      </section>
      <section className="card full-card">
        <div className="toolbar">
          <div className="search">
            <Search size={15} />
            <input
              aria-label={t('messages.filterUserHistory')}
              placeholder={t('messages.filterHistory')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span className="muted">
            {state.profileHistory.length}{' '}
            {state.profileHistory.length === 1
              ? t('messages.savedProfile')
              : t('messages.savedProfiles')}
          </span>
          <button
            className="button subtle"
            disabled={!state.profileHistory.length}
            onClick={() =>
              run(
                () => window.isora.editProfileHistory('clear'),
                t('messages.userHistoryCleared'),
              )
            }
          >
            <Trash2 size={14} />
            {t('messages.clearHistory')}
          </button>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table data-testid="profile-history-table">
              <thead>
                <tr>
                  <th>{t('common.user')}</th>
                  <th>{t('common.hotel')}</th>
                  <th>{t('messages.searches')}</th>
                  <th aria-sort="descending">{t('messages.lastSearch')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record) => (
                  <tr key={record.key}>
                    <td>
                      <button
                        className="profile-name-button"
                        onClick={() => open(record)}
                        aria-label={t('profile.viewUser', {
                          v0: record.profile.name,
                        })}
                      >
                        {record.profile.name}
                      </button>
                      <small className="profile-id muted">
                        #{record.profile.id}
                      </small>
                    </td>
                    <td className="muted">
                      {hotelDomain(record.hotel)
                        ? `Habbo ${hotelDomain(record.hotel)}`
                        : record.hotel}
                    </td>
                    <td className="mono">{record.count}</td>
                    <td>
                      <time dateTime={record.lastSearched}>
                        {date(record.lastSearched, language)}
                      </time>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        title={t('messages.deleteRecord')}
                        aria-label={t('messages.deleteRecordOf', {
                          v0: record.profile.name,
                        })}
                        onClick={() =>
                          run(
                            () =>
                              window.isora.editProfileHistory(
                                'remove',
                                record.key,
                              ),
                            t('messages.recordDeleted'),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon">
              <UserRound size={25} />
            </div>
            <h3>
              {state.profileHistory.length
                ? t('messages.noMatches')
                : t('messages.yourSearchesWillAppearHere')}
            </h3>
            <p>
              {t(
                'messages.historyKeepsTheReceivedInformationHotelAndSearchDate',
              )}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
export function ProfileDialog({
  record,
  loading,
  error,
  title,
  state,
  close,
  refresh,
  run,
}: {
  record?: ProfileRecord;
  loading: boolean;
  error: string;
  title: string;
  state: Snapshot;
  close: () => void;
  refresh: () => void;
  run: (fn: () => Promise<unknown>, success?: string) => void;
}) {
  const { language, t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const profile = record?.profile;
  const ready =
    !!record && state.gameConnected && state.session?.host === record.hotel;
  const action = (type: ProfileAction) =>
    record &&
    run(
      () => window.isora.profileAction(record.key, type),
      ['motto', 'figure'].includes(type) ? t('messages.copiedToClipboard') : '',
    );
  return (
    <dialog
      ref={dialog}
      className="profile-dialog"
      aria-labelledby="profile-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
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
          close();
      }}
    >
      <div className="modal-title">
        <h2 id="profile-dialog-title">
          {'' + t('profile.titlePrefix') + ' '}
          {profile?.name ?? title}
        </h2>
        <button
          autoFocus
          className="icon-button"
          aria-label={t('messages.closeProfile')}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="profile-dialog-content">
        {loading && (
          <p role="status" className="profile-loading">
            {t('messages.requestingProfileFromHabbo')}
          </p>
        )}
        {error && (
          <div className="alert error" role="alert">
            {formatMessage(error, language)}
          </div>
        )}
        {profile && record && (
          <>
            <div className="profile-summary">
              <div className="profile-avatar">
                <img
                  key={profile.figure}
                  src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${encodeURIComponent(profile.figure)}&size=l&direction=2&head_direction=3`}
                  alt={t('messages.avatarOf', { v0: profile.name })}
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              </div>
              <div>
                <div className="profile-heading">
                  <h3>{profile.name}</h3>
                  <span className={profile.online ? 'green-text' : 'muted'}>
                    {profile.online
                      ? t('profile.online')
                      : t('messages.offline')}
                  </span>
                </div>
                <p className="profile-motto">
                  {profile.motto || t('messages.noMotto')}
                </p>
                <p className="muted mono">
                  #{profile.id} · {record.hotel}
                </p>
                <p className="muted">
                  {profile.isFriend
                    ? t('messages.onYourFriendsList')
                    : profile.requestSent
                      ? t('messages.friendRequestSent')
                      : t('messages.notOnYourFriendsList')}
                </p>
                <div className="profile-copy-actions">
                  <button
                    className="button subtle small"
                    onClick={() => action('motto')}
                  >
                    <Copy size={12} />
                    {t('messages.copyMotto')}
                  </button>
                  <button
                    className="button subtle small"
                    onClick={() => action('figure')}
                  >
                    <Copy size={12} />
                    {t('messages.copyOutfit')}
                  </button>
                </div>
              </div>
            </div>
            <div className="profile-facts">
              {[
                [
                  t('messages.registered'),
                  profile.created || t('common.unavailable'),
                ],
                [
                  t('messages.achievementScore'),
                  profile.activityPoints.toLocaleString(language),
                ],
                [
                  t('messages.friends'),
                  profile.friends.toLocaleString(language),
                ],
                [
                  t('messages.lastAccess'),
                  profile.online
                    ? t('messages.onlineWhenQueried')
                    : formatMessage(lastVisit(profile.lastLogin), language),
                ],
                [t('messages.level'), profile.level ?? t('common.unavailable')],
                [
                  t('messages.starGems'),
                  profile.starGems ?? t('common.unavailable'),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <section className="profile-section">
              <h3>{t('messages.equippedBadges')}</h3>
              {profile.badges === null ? (
                <p className="muted">
                  {t('messages.informationNotReceivedInThisQuery')}
                </p>
              ) : profile.badges.length ? (
                <div className="profile-badges">
                  {profile.badges.map((b) => (
                    <div key={`${b.slot}:${b.code}`} title={b.code}>
                      <img
                        src={`https://images.habbo.com/c_images/album1584/${encodeURIComponent(b.code)}.gif`}
                        alt={b.code}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <small>{b.code}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{t('messages.noBadgesEquipped')}</p>
              )}
            </section>
            <section className="profile-section">
              <h3>{t('messages.relationships')}</h3>
              {profile.relationships === null ? (
                <p className="muted">
                  {t('messages.informationNotReceivedInThisQuery')}
                </p>
              ) : profile.relationships.length ? (
                <div className="profile-relationships">
                  {profile.relationships.map((r) => (
                    <div key={r.type}>
                      <b>
                        {(
                          {
                            1: t('messages.hearts'),
                            2: t('messages.smiles'),
                            3: t('messages.skulls'),
                          } as Record<number, string>
                        )[r.type] ??
                          t('messages.relationship', { v0: r.type })}{' '}
                        <span>{r.count}</span>
                      </b>
                      <span>{r.name || t('messages.noFeaturedUser')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{t('messages.noVisibleRelationships')}</p>
              )}
            </section>
            <section className="profile-section">
              <h3>
                {'' + t('messages.groups') + ' '}
                <span className="muted">({profile.groups.length})</span>
              </h3>
              {profile.groups.length ? (
                <div className="profile-groups">
                  {profile.groups.map((g) => (
                    <div key={g.id}>
                      <img
                        src={`https://www.habbo.com/habbo-imaging/badge/${encodeURIComponent(g.badge)}.gif`}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span>
                        <b>
                          {g.name}
                          {g.favorite ? ' ★' : ''}
                        </b>
                        <small className="muted">
                          #{g.id}
                          {g.forum ? ' · Foro' : ''}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{t('messages.noVisibleGroups')}</p>
              )}
            </section>
            <div className="profile-snapshot-note">
              {'' + t('messages.informationSavedOn') + ' '}
              {date(record.lastSearched, language)}
              {t('messages.statusReflectsThatQuery')}
            </div>
            <div className="profile-footer">
              <button
                className="button subtle small"
                disabled={!ready || loading}
                onClick={refresh}
              >
                <RefreshCw size={13} />
                {t('messages.refreshProfile')}
              </button>
              <button
                className="button subtle small"
                disabled={!ready}
                onClick={() => action('game')}
              >
                {t('messages.openInHabbo')}
              </button>
              <button
                className="button subtle small"
                disabled={!hotelDomain(record.hotel)}
                onClick={() => action('web')}
              >
                <ExternalLink size={13} />
                {t('messages.habboWebsite')}
              </button>
              <button
                className="button subtle small"
                disabled={!hotelDomain(record.hotel)}
                onClick={() => action('widgets')}
              >
                {t('messages.habbowidgets')}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
