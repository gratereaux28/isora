import { messageRef } from './i18n';
import { Reader, Writer, type Intercept } from './protocol/packet';
import type { Model } from './model';
export function readStuff(r: Reader): number[] | undefined {
  const flags = r.int(),
    type = flags & 255;
  let values: number[] | undefined;
  switch (type) {
    case 0:
      r.string();
      break;
    case 1:
      for (let i = 0, n = r.count(); i < n; i++) {
        r.string();
        r.string();
      }
      break;
    case 2:
      for (let i = 0, n = r.count(); i < n; i++) r.string();
      break;
    case 3:
      r.string();
      r.int();
      break;
    case 4:
      break;
    case 5:
      values = [];
      for (let i = 0, n = r.count(); i < n; i++) values.push(r.int());
      break;
    case 6:
      r.string();
      r.int();
      r.int();
      for (let i = 0, n = r.count(); i < n; i++) {
        r.int();
        for (let j = 0, m = r.count(); j < m; j++) r.string();
      }
      return;
    case 7:
      r.string();
      r.int();
      r.int();
      break;
    default:
      throw new Error(messageRef('errors.unsupportedStuffData', { type }));
  }
  if (flags & 256) {
    r.int();
    r.int();
  }
  return values;
}
function avatarEnd(r: Reader) {
  r.int();
  const type = r.int();
  if (type === 1) {
    r.string();
    r.int();
    r.int();
    r.string();
    r.string();
    r.int();
    r.bool();
  } else if (type === 2) {
    r.int();
    r.int();
    r.string();
    r.int();
    for (let i = 0; i < 6; i++) r.bool();
    r.int();
    r.string();
  } else if (type === 4) {
    r.string();
    r.int();
    r.string();
    for (let i = 0, n = r.count(); i < n; i++) r.short();
  } else if (type !== 3)
    throw new Error(messageRef('errors.unsupportedAvatarType'));
}
export class FloorTransform {
  active = false;
  private rows: string[] = [];
  private pending?: Buffer;
  private generation = 0;
  reset(active: boolean) {
    this.generation++;
    this.active = active;
    this.rows = [];
    this.pending = undefined;
  }
  offset(x: number, y: number) {
    const ch = this.rows[y]?.[x];
    return ch && /^[0-9a-wyz]$/i.test(ch) ? parseInt(ch, 36) : 0;
  }
  private z(value: string, x: number, y: number) {
    const n = Number(value);
    if (!Number.isFinite(n))
      throw new Error(messageRef('errors.invalidHeight'));
    return String(n - (this.active ? this.offset(x, y) : 0));
  }
  private status(value: string, x: number, y: number, shift = 0) {
    return value
      .replace(
        /\bmv (-?\d+),(-?\d+),(-?[\d.]+)/g,
        (_m, a, b, c) =>
          `mv ${Number(a) + shift},${Number(b) + shift},${Number(this.z(c, Number(a), Number(b))) + shift}`,
      )
      .replace(
        /\b(sit|lay) (-?[\d.]+)/g,
        (_m, type, h) =>
          `${type} ${Number(h) - (this.active ? this.offset(x, y) : 0)}`,
      );
  }
  private avatar(r: Reader, ghost?: number) {
    const start = r.position;
    r.int();
    r.string();
    r.string();
    r.string();
    const indexPos = r.position,
      index = r.int(),
      x = r.int(),
      y = r.int(),
      z = r.string(),
      tail = r.position;
    avatarEnd(r);
    const shift = ghost === undefined ? 0 : 32;
    return new Writer()
      .raw(r.data.subarray(start, indexPos))
      .int(ghost ?? index)
      .int(x + shift)
      .int(y + shift)
      .string(String(Number(this.z(z, x, y)) + shift))
      .raw(r.data.subarray(tail, r.position))
      .buffer();
  }
  avatars(body: Buffer) {
    const r = new Reader(body),
      n = r.count(),
      w = new Writer().int(n);
    for (let i = 0; i < n; i++) w.raw(this.avatar(r));
    return w.buffer();
  }
  ghostAvatar(raw: Buffer, index: number) {
    return this.avatar(new Reader(raw), index);
  }
  ghostUpdate(
    v: {
      x: number;
      y: number;
      z: string;
      head: number;
      direction: number;
      status: string;
    },
    index: number,
  ) {
    return new Writer()
      .int(index)
      .int(v.x + 32)
      .int(v.y + 32)
      .string(String(Number(this.z(v.z, v.x, v.y)) + 32))
      .int(v.head)
      .int(v.direction)
      .string(this.status(v.status, v.x, v.y, 32))
      .buffer();
  }
  object(raw: Buffer) {
    if (!this.active) return raw;
    const r = new Reader(raw);
    r.int();
    r.int();
    const x = r.int(),
      y = r.int();
    r.int();
    const start = r.position,
      z = r.string();
    return Buffer.concat([
      raw.subarray(0, start),
      new Writer().string(this.z(z, x, y)).buffer(),
      raw.subarray(r.position),
    ]);
  }
  private heightmap(raw: Buffer) {
    const r = new Reader(raw),
      width = r.int(),
      n = r.count(),
      w = new Writer().int(width).int(n);
    if (width < 1 || n % width)
      throw new Error(messageRef('errors.invalidHeightMap'));
    for (let i = 0; i < n; i++) {
      const value = r.short();
      w.short(
        (value & 0xc000) === 0
          ? Math.max(
              0,
              (value & 0x3fff) -
                this.offset(i % width, Math.floor(i / width)) * 256,
            )
          : value,
      );
    }
    return w.buffer();
  }
  transform(p: Intercept, name: string, model: Model) {
    if (!this.active) return;
    if (name === 'heightmap') {
      if (!this.rows.length) {
        this.pending = Buffer.from(p.body);
        p.blocked = true;
        return;
      }
      p.body = this.heightmap(p.body);
      p.modified = true;
    } else if (name === 'floorheightmap') {
      const r = new Reader(p.body),
        legacy = r.bool(),
        wall = r.int(),
        map = r.string();
      this.rows = map.split(/\r\n|\r|\n/);
      p.body = new Writer()
        .bool(legacy)
        .int(wall)
        .string(map.replace(/[0-9a-wyz]/gi, '0'))
        .raw(r.take(r.data.length - r.position))
        .buffer();
      p.modified = true;
      if (this.pending) {
        const msg = model.earth.resolve('in', ['HeightMap']);
        const body = this.heightmap(this.pending);
        const generation = this.generation;
        this.pending = undefined;
        if (msg)
          queueMicrotask(() => {
            if (model.earth.gameConnected && generation === this.generation) {
              try {
                model.earth.send('in', msg.id, body);
              } catch (e) {
                model.notice((e as Error).message);
              }
            }
          });
      }
    } else if (name === 'heightmapupdate') {
      const r = new Reader(p.body),
        n = r.take(1)[0],
        w = new Writer().raw(Buffer.from([n]));
      for (let i = 0; i < n; i++) {
        const x = r.take(1)[0],
          y = r.take(1)[0],
          v = r.short();
        w.raw(Buffer.from([x, y])).short(
          (v & 0xc000) === 0
            ? Math.max(0, (v & 0x3fff) - this.offset(x, y) * 256)
            : v,
        );
      }
      p.body = w.buffer();
      p.modified = true;
    } else if (name === 'users') {
      p.body = this.avatars(p.body);
      p.modified = true;
    } else if (name === 'userupdate') {
      const r = new Reader(p.body),
        n = r.count(),
        w = new Writer().int(n);
      for (let i = 0; i < n; i++) {
        const index = r.int(),
          x = r.int(),
          y = r.int(),
          z = r.string(),
          head = r.int(),
          dir = r.int(),
          status = r.string();
        w.int(index)
          .int(x)
          .int(y)
          .string(this.z(z, x, y))
          .int(head)
          .int(dir)
          .string(this.status(status, x, y));
      }
      p.body = w.buffer();
      p.modified = true;
    } else if (['objects', 'objectadd', 'objectupdate'].includes(name)) {
      const r = new Reader(p.body),
        w = new Writer();
      if (name === 'objects') {
        const owners = r.count();
        w.int(owners);
        for (let i = 0; i < owners; i++) w.int(r.int()).string(r.string());
      }
      const n = name === 'objects' ? r.count() : 1;
      if (name === 'objects') w.int(n);
      for (let i = 0; i < n; i++) {
        const start = r.position;
        r.int();
        const kind = r.int();
        r.int();
        r.int();
        r.int();
        r.string();
        r.string();
        r.int();
        readStuff(r);
        r.int();
        r.int();
        r.int();
        if (kind < 0) r.string();
        w.raw(this.object(r.data.subarray(start, r.position)));
      }
      if (name === 'objectadd') w.string(r.string());
      p.body = w.raw(r.take(r.data.length - r.position)).buffer();
      p.modified = true;
    } else if (name === 'slideobjectbundle') {
      const r = new Reader(p.body),
        fx = r.int(),
        fy = r.int(),
        tx = r.int(),
        ty = r.int(),
        n = r.count(),
        w = new Writer().int(fx).int(fy).int(tx).int(ty).int(n);
      for (let i = 0; i < n; i++)
        w.int(r.int())
          .string(this.z(r.string(), fx, fy))
          .string(this.z(r.string(), tx, ty));
      w.int(r.int());
      if (r.position < r.data.length) {
        const type = r.int();
        w.int(type);
        if (type === 1 || type === 2)
          w.int(r.int())
            .string(this.z(r.string(), fx, fy))
            .string(this.z(r.string(), tx, ty));
      }
      p.body = w.raw(r.take(r.data.length - r.position)).buffer();
      p.modified = true;
    }
  }
}
