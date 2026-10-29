import { messageRef } from './i18n';
import type { Model } from './model';
import type { UserAction, UserRef, Avatar } from './shared';

const hotels: Record<string, string> = {
  us: 'com',
  es: 'es',
  br: 'com.br',
  tr: 'com.tr',
  de: 'de',
  fr: 'fr',
  fi: 'fi',
  it: 'it',
  nl: 'nl',
};
export function hotelDomain(host: string): string | undefined {
  const game = /^game-(us|es|br|tr|de|fr|fi|it|nl)\.habbo\.com$/i.exec(host);
  if (game) return hotels[game[1].toLowerCase()];
  return Object.values(hotels).find(
    (domain) =>
      host.toLowerCase() === `www.habbo.${domain}` ||
      host.toLowerCase() === `habbo.${domain}`,
  );
}
export function profileURL(
  host: string,
  name: string,
  widgets = false,
): string {
  const domain = hotelDomain(host);
  if (!domain)
    throw new Error(
      messageRef('messages.theOfficialHotelForThisLinkIsNotRecognized'),
    );
  if (!name || name.length > 100)
    throw new Error(messageRef('errors.invalidUsername'));
  // Escape dots as well: a name of ".." must never become a path segment traversal.
  const encoded = encodeURIComponent(name).replace(/\./g, '%2E');
  if (name === '.' || name === '..')
    throw new Error(messageRef('errors.profileLinkUnavailable'));
  return widgets
    ? `https://www.habbowidgets.com/habinfo/${domain}/${encoded}`
    : `https://www.habbo.${domain}/profile/${encoded}`;
}
export function performUserAction(
  model: Model,
  action: UserAction,
  ref: UserRef,
): { copy?: string; url?: string } {
  if (
    !ref ||
    typeof ref.hotel !== 'string' ||
    typeof ref.name !== 'string' ||
    !Number.isInteger(ref.roomId) ||
    !Number.isInteger(ref.id) ||
    !Number.isInteger(ref.type) ||
    (ref.index !== undefined && !Number.isInteger(ref.index))
  )
    throw new Error(messageRef('errors.invalidUser'));
  const activeRoom =
    model.state.session?.host === ref.hotel &&
    model.state.room.id === ref.roomId;
  const avatar = activeRoom
    ? model.state.avatars.find(
        (a) =>
          a.id === ref.id &&
          a.type === ref.type &&
          a.name === ref.name &&
          (ref.index === undefined || a.index === ref.index),
      )
    : undefined;
  const visitor =
    activeRoom && ref.index === undefined
      ? model.state.visitors.find(
          (v) => v.id === ref.id && v.type === ref.type && v.name === ref.name,
        )
      : undefined;
  const user = avatar ?? visitor;
  if (!user)
    throw new Error(
      messageRef('messages.theUserIsNoLongerAvailableRefreshYourSelection'),
    );
  const current = (): Avatar => {
    if (!avatar)
      throw new Error(messageRef('messages.theUserMustBeInTheCurrentRoom'));
    return avatar;
  };
  const human = () => {
    if (user.type !== 1 || user.id <= 0)
      throw new Error(messageRef('messages.thisActionRequiresAHabboUser'));
  };
  switch (action) {
    case 'name':
      return { copy: user.name };
    case 'id':
      return { copy: String(user.id) };
    case 'motto':
      return { copy: current().motto };
    case 'figure':
      human();
      return { copy: current().figure };
    case 'web':
    case 'widgets':
      human();
      return { url: profileURL(ref.hotel, user.name, action === 'widgets') };
    case 'save': {
      human();
      const a = current();
      model.action('saveOutfit', {
        name: a.name,
        figure: a.figure,
        gender: a.gender,
      });
      break;
    }
    case 'find': {
      if (!model.state.gameConnected)
        throw new Error(messageRef('messages.connectHabboBeforeFindingAUser'));
      const a = current();
      model.general.whisper(a.index, model.t('users.findWhisper'));
      break;
    }
    case 'profile':
      human();
      if (!model.state.gameConnected || model.state.session?.host !== ref.hotel)
        throw new Error(
          messageRef('messages.connectToTheSameHotelToOpenThisProfileInHabbo'),
        );
      model.action('profile', user.id);
      break;
    default:
      throw new Error(messageRef('errors.invalidUserAction'));
  }
  return {};
}
