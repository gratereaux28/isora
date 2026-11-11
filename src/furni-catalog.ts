import { messageRef } from './i18n';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hotelDomain } from './user-actions';
export interface FurniInfo {
  placement?: 'floor' | 'wall';
  kind: number;
  name: string;
  identifier: string;
  description: string;
}
export interface CatalogResult {
  hotel: string;
  updated: string;
  entries: FurniInfo[];
  source: 'network' | 'cache';
  warning?: string;
}
const MAX_BYTES = 32 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
export function furniDataURL(hotel: string) {
  const domain = hotelDomain(hotel);
  if (!domain)
    throw new Error(
      messageRef('messages.theFurnitureCatalogForThisHotelIsNotRecognized'),
    );
  return `https://www.habbo.${domain}/gamedata/furnidata_json/1`;
}
export function parseFurniData(value: any): FurniInfo[] {
  const floor = value?.roomitemtypes?.furnitype;
  const wall = value?.wallitemtypes?.furnitype ?? [];
  if (
    !Array.isArray(floor) ||
    !Array.isArray(wall) ||
    floor.length + wall.length === 0 ||
    floor.length + wall.length > 200000
  )
    throw new Error(messageRef('errors.invalidFurnitureCatalog'));
  const entries = new Map<string, FurniInfo>();
  for (const [placement, rows] of [
    ['floor', floor],
    ['wall', wall],
  ] as const)
    for (const row of rows) {
      if (
        !Number.isInteger(row?.id) ||
        row.id < 0 ||
        typeof row.classname !== 'string' ||
        !row.classname ||
        row.classname.length > 500 ||
        (row.name != null &&
          (typeof row.name !== 'string' || row.name.length > 2000)) ||
        (row.description != null &&
          (typeof row.description !== 'string' ||
            row.description.length > 10000))
      )
        throw new Error(messageRef('errors.invalidFurnitureCatalogEntry'));
      entries.set(`${placement}:${row.id}`, {
        placement,
        kind: row.id,
        name: row.name?.trim() || row.classname,
        identifier: row.classname,
        description: row.description ?? '',
      });
    }
  return [...entries.values()];
}
function cachedCatalog(value: any, hotel: string): CatalogResult {
  if (
    ![1, 2].includes(value?.version) ||
    value.hotel !== hotel ||
    !Number.isFinite(Date.parse(value.updated)) ||
    !Array.isArray(value.entries)
  )
    throw new Error(messageRef('errors.invalidFurnitureCache'));
  if (
    value.entries.some(
      (entry: FurniInfo) =>
        entry.placement !== undefined &&
        !['floor', 'wall'].includes(entry.placement),
    )
  )
    throw new Error(messageRef('errors.invalidFurnitureCache'));
  const rows = (placement: 'floor' | 'wall') =>
    value.entries
      .filter((r: FurniInfo) => (r?.placement ?? 'floor') === placement)
      .map((r: FurniInfo) => ({
        id: r?.kind,
        name: r?.name,
        classname: r?.identifier,
        description: r?.description,
      }));
  const entries = parseFurniData({
    roomitemtypes: { furnitype: rows('floor') },
    wallitemtypes: { furnitype: rows('wall') },
  });
  return { hotel, updated: value.updated, entries, source: 'cache' };
}
export class FurniCatalog {
  private pending = new Map<string, Promise<CatalogResult>>();
  constructor(
    private options: {
      directory: string;
      fetcher: (url: string, init: RequestInit) => Promise<Response>;
      timeoutMs?: number;
      url?: (hotel: string) => string;
    },
  ) {}
  load(
    hotel: string,
    force = false,
    onCache?: (cached: CatalogResult) => void,
  ): Promise<CatalogResult> {
    if (!hotelDomain(hotel))
      return Promise.reject(
        new Error(
          messageRef('messages.theFurnitureCatalogForThisHotelIsNotRecognized'),
        ),
      );
    const previous = this.pending.get(hotel);
    if (previous) return previous;
    const promise = this.read(hotel, force, onCache).finally(() =>
      this.pending.delete(hotel),
    );
    this.pending.set(hotel, promise);
    return promise;
  }
  private async read(
    hotel: string,
    force: boolean,
    onCache?: (cached: CatalogResult) => void,
  ): Promise<CatalogResult> {
    const file = path.join(
      this.options.directory,
      `${hotelDomain(hotel)!.replaceAll('.', '_')}.json`,
    );
    let cached: CatalogResult | undefined;
    let upgrade = false;
    try {
      if ((await fs.stat(file)).size <= MAX_BYTES) {
        const value = JSON.parse(await fs.readFile(file, 'utf8'));
        cached = cachedCatalog(value, hotel);
        upgrade = value.version === 1;
      }
    } catch {
      /* A missing or damaged cache never prevents a fresh download. */
    }
    if (
      cached &&
      !force &&
      !upgrade &&
      Date.now() - Date.parse(cached.updated) < TTL
    )
      return cached;
    if (cached) onCache?.(cached);
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(),
      this.options.timeoutMs ?? 30000,
    );
    try {
      const response = await this.options.fetcher(
        this.options.url?.(hotel) ?? furniDataURL(hotel),
        { signal: abort.signal, credentials: 'omit' },
      );
      if (!response.ok)
        throw new Error(
          messageRef('messages.habboReturnedHttp', { v0: response.status }),
        );
      if (
        !response.body ||
        Number(response.headers.get('content-length')) > MAX_BYTES
      )
        throw new Error(
          messageRef('messages.theCatalogExceedsTheDownloadLimit'),
        );
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new Error(
            messageRef('messages.theCatalogExceedsTheDownloadLimit'),
          );
        }
        chunks.push(chunk.value);
      }
      const entries = parseFurniData(
        JSON.parse(Buffer.concat(chunks).toString('utf8')),
      );
      const result: CatalogResult = {
        hotel,
        entries,
        source: 'network',
        updated: new Date().toISOString(),
      };
      try {
        await fs.mkdir(this.options.directory, { recursive: true });
        const temporary = `${file}.tmp`;
        await fs.writeFile(
          temporary,
          JSON.stringify({
            version: 2,
            hotel,
            updated: result.updated,
            entries,
          }),
          'utf8',
        );
        await fs.rename(temporary, file);
      } catch {
        result.warning = messageRef(
          'messages.namesAreLoadedButTheCacheCouldNotBeSaved',
        );
      }
      return result;
    } catch (error) {
      const message = abort.signal.aborted
        ? messageRef('messages.theFurnitureNameDownloadTimedOut')
        : (error as Error).message;
      if (cached)
        return {
          ...cached,
          warning: messageRef('messages.theSavedCatalogIsKept', {
            v0: message,
          }),
        };
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
