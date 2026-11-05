import { messageRef } from './i18n';
import { hotelDomain } from './user-actions';

export interface PublicProfile {
  name: string;
  figure?: string;
  motto?: string;
  created?: string;
  activityPoints?: number;
  privateProfile?: boolean;
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
