import { useI18n } from './LocaleProvider';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin,
  UserRound,
  ExternalLink,
  Globe,
  Copy,
  Shirt,
  Hash,
} from 'lucide-react';
import type { Snapshot, UserAction, UserRef } from './shared';
import { hotelDomain } from './user-actions';

export interface UserMenuTarget {
  ref: UserRef;
  x: number;
  y: number;
  profilesOnly?: boolean;
}
export function UserMenu({
  target,
  state,
  close,
  run,
  openProfile,
}: {
  target: UserMenuTarget;
  state: Snapshot;
  close: () => void;
  run: (action: UserAction, ref: UserRef, success: string) => void;
  openProfile: (ref: UserRef) => void;
}) {
  const { t } = useI18n();
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!;
    const previous = document.activeElement as HTMLElement | null;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(target.x, innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(target.y, innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) close();
    };
    const dismiss = () => close();
    const scroll = (event: Event) => {
      if (event.target instanceof Node && element.contains(event.target))
        return;
      close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', scroll, true);
      if (element.contains(document.activeElement))
        previous?.focus({ preventScroll: true });
    };
  }, [target, close]);
  const ref = target.ref;
  const sameHotel = state.session?.host === ref.hotel;
  const avatar =
    sameHotel && state.room.id === ref.roomId
      ? state.avatars.find(
          (a) =>
            a.id === ref.id &&
            a.type === ref.type &&
            a.name === ref.name &&
            (ref.index === undefined || a.index === ref.index),
        )
      : undefined;
  const human = ref.type === 1 && ref.id > 0;
  const online = state.gameConnected && sameHotel;
  const web = human && Boolean(hotelDomain(ref.hotel));
  const items: {
    action: UserAction | 'isora';
    label: string;
    icon: typeof Copy;
    enabled: boolean;
    success?: string;
    separator?: boolean;
  }[] = [
    {
      action: 'isora',
      label: t('messages.openProfileInIsora'),
      icon: UserRound,
      enabled: online && human,
    },
    {
      action: 'find',
      label: t('messages.findUser'),
      icon: MapPin,
      enabled: online && Boolean(avatar),
    },
    {
      action: 'profile',
      label: t('messages.openProfileInHabbo'),
      icon: UserRound,
      enabled: online && human,
    },
    {
      action: 'web',
      label: t('messages.openProfileOnHabboWebsite'),
      icon: Globe,
      enabled: web,
    },
    {
      action: 'widgets',
      label: t('messages.openProfileOnHabbowidgets'),
      icon: ExternalLink,
      enabled: web,
    },
    {
      action: 'name',
      label: t('messages.copyName'),
      icon: Copy,
      enabled: true,
      separator: true,
    },
    { action: 'id', label: t('messages.copyId'), icon: Hash, enabled: true },
    {
      action: 'motto',
      label: t('messages.copyMotto'),
      icon: Copy,
      enabled: Boolean(avatar),
    },
    {
      action: 'figure',
      label: t('messages.copyOutfit'),
      icon: Copy,
      enabled: human && Boolean(avatar?.figure),
    },
    {
      action: 'save',
      label: t('messages.saveOutfitToWardrobe'),
      icon: Shirt,
      enabled: human && Boolean(avatar?.figure),
      separator: true,
      success: t('messages.outfitAddedToWardrobe'),
    },
  ];
  return createPortal(
    <div
      ref={menu}
      className="user-menu"
      role="menu"
      aria-label={t('messages.of', {
        v0: target.profilesOnly ? t('messages.profiles') : t('common.actions'),
        v1: ref.name,
      })}
      style={{ left: target.x, top: target.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          close();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const buttons = [
          ...menu.current!.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      <div className="user-menu-title">
        {ref.name}
        <small>#{ref.id}</small>
      </div>
      {items
        .filter(
          (item) =>
            !target.profilesOnly ||
            ['isora', 'profile', 'web', 'widgets'].includes(item.action),
        )
        .map(({ action, label, icon: Icon, enabled, success, separator }) => (
          <button
            key={action}
            role="menuitem"
            className={separator ? 'menu-separator' : ''}
            disabled={!enabled}
            onClick={() => {
              close();
              if (action === 'isora') {
                openProfile(ref);
                return;
              }
              run(
                action,
                ref,
                success ??
                  (['name', 'id', 'motto', 'figure'].includes(action)
                    ? t('messages.copiedToClipboard')
                    : ''),
              );
            }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
    </div>,
    document.body,
  );
}
