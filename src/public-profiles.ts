import { messageRef } from './i18n';
import { hotelDomain } from './user-actions';

export interface PublicProfile {
  name: string;
  uniqueId?: string;
  figure?: string;
  motto?: string;
  created?: string;
  activityPoints?: number;
  privateProfile?: boolean;
  online?: boolean;
  lastLogin?: number;
  level?: number;
  starGems?: number;
  badges?: { slot: number; code: string }[];
}
export function publicProfileURL(hotel: string, name: string): string {
  const domain = hotelDomain(hotel);
  if (!domain)
    throw new Error(
      messageRef('messages.theOfficialHotelForThisLinkIsNotRecognized'),
    );
  const url = new URL(`https://www.habbo.${domain}/api/public/users`);
  url.searchParams.set('name', name);
  return url.href;
}
export function parsePublicProfile(
  value: unknown,
  name: string,
): PublicProfile {
  if (!value || typeof value !== 'object')
    throw new Error(messageRef('errors.invalidPublicProfile'));
  const data = value as Record<string, unknown>;
  if (
    typeof data.name !== 'string' ||
    data.name.toLowerCase() !== name.toLowerCase()
  )
    throw new Error(messageRef('errors.invalidPublicProfile'));
  const result: PublicProfile = { name: data.name };
  if (
    typeof data.uniqueId === 'string' &&
    /^hh[a-z0-9-]{1,128}$/i.test(data.uniqueId)
  )
    result.uniqueId = data.uniqueId;
  if (typeof data.figureString === 'string' && data.figureString.length <= 2000)
    result.figure = data.figureString;
  if (typeof data.motto === 'string' && data.motto.length <= 2000)
    result.motto = data.motto;
  if (
    typeof data.memberSince === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(data.memberSince) &&
    Number.isFinite(Date.parse(data.memberSince))
  )
    result.created = data.memberSince
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('-');
  if (
    Number.isSafeInteger(data.achievementScore) &&
    (data.achievementScore as number) >= 0
  )
    result.activityPoints = data.achievementScore as number;
  if (typeof data.profileVisible === 'boolean')
    result.privateProfile = !data.profileVisible;
  if (typeof data.online === 'boolean') result.online = data.online;
  if (
    typeof data.lastAccessTime === 'string' &&
    Number.isFinite(Date.parse(data.lastAccessTime))
  )
    result.lastLogin = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(data.lastAccessTime)) / 1000),
    );
  for (const [field, key] of [
    ['currentLevel', 'level'],
    ['starGemCount', 'starGems'],
  ] as const)
    if (Number.isSafeInteger(data[field]) && (data[field] as number) >= 0)
      result[key] = data[field] as number;
  if (
    Array.isArray(data.selectedBadges) &&
    data.selectedBadges.length <= 50 &&
    data.selectedBadges.every(
      (b) => b && typeof b.code === 'string' && b.code.length <= 400,
    )
  )
    result.badges = data.selectedBadges.map((b, index) => ({
      slot: index + 1,
      code: b.code,
    }));
  return result;
}
export class PublicProfiles {
  constructor(
    private options: {
      fetcher: typeof fetch;
      timeoutMs?: number;
      url?: (hotel: string, name: string) => string;
    } = { fetcher: fetch },
  ) {}
  async load(
    hotel: string,
    name: string,
    signal: AbortSignal,
  ): Promise<PublicProfile> {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(),
      this.options.timeoutMs ?? 2500,
    );
    const combined = AbortSignal.any([signal, timeout.signal]);
    try {
      const response = await this.options.fetcher(
        this.options.url?.(hotel, name) ?? publicProfileURL(hotel, name),
        {
          signal: combined,
          credentials: 'omit',
          redirect: 'error',
        },
      );
      if (!response.ok)
        throw new Error(
          messageRef('messages.habboReturnedHttp', { v0: response.status }),
        );
      const limit = 64 * 1024;
      if (
        !response.body ||
        Number(response.headers.get('content-length')) > limit
      )
        throw new Error(messageRef('errors.invalidPublicProfile'));
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > limit) {
          await reader.cancel();
          throw new Error(messageRef('errors.invalidPublicProfile'));
        }
        chunks.push(chunk.value);
      }
      return parsePublicProfile(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
        name,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
