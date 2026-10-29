import { messageRef } from '../i18n';
export const MAX_FRAME = 8 * 1024 * 1024;
export class Reader {
  position = 0;
  constructor(public data: Buffer) {}
  take(n: number): Buffer {
    if (!Number.isInteger(n) || n < 0 || this.position + n > this.data.length)
      throw new Error(messageRef('messages.incompletePacketOrInvalidLength'));
    const b = this.data.subarray(this.position, this.position + n);
    this.position += n;
    return b;
  }
  int() {
    return this.take(4).readInt32BE();
  }
  short() {
    return this.take(2).readUInt16BE();
  }
  bool() {
    return this.take(1)[0] !== 0;
  }
  string() {
    return this.take(this.short()).toString('utf8');
  }
  count() {
    const n = this.int();
    if (n < 0 || n > 100000) throw new Error(messageRef('errors.invalidCount'));
    return n;
  }
}
export class Writer {
  private chunks: Buffer[] = [];
  raw(b: Buffer) {
    this.chunks.push(b);
    return this;
  }
  int(n: number) {
    if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647)
      throw new Error(messageRef('errors.invalid32BitInteger'));
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return this.raw(b);
  }
  short(n: number) {
    if (!Number.isInteger(n) || n < 0 || n > 65535)
      throw new Error(messageRef('errors.invalidShort'));
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    return this.raw(b);
  }
  bool(n: boolean) {
    return this.raw(Buffer.from([n ? 1 : 0]));
  }
  string(s: string) {
    const b = Buffer.from(s, 'utf8');
    return this.short(b.length).raw(b);
  }
  buffer() {
    return Buffer.concat(this.chunks);
  }
}
export function frame(header: number, body: Buffer = Buffer.alloc(0)) {
  return new Writer()
    .int(body.length + 2)
    .short(header)
    .raw(body)
    .buffer();
}
export class Framer {
  private pending = Buffer.alloc(0);
  push(chunk: Buffer): Buffer[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const frames: Buffer[] = [];
    while (this.pending.length >= 4) {
      const n = this.pending.readInt32BE();
      if (n < 2 || n > MAX_FRAME)
        throw new Error(messageRef('errors.invalidFrameLength'));
      if (this.pending.length < n + 4) break;
      frames.push(this.pending.subarray(4, n + 4));
      this.pending = this.pending.subarray(n + 4);
    }
    return frames;
  }
}
export interface Intercept {
  direction: 'in' | 'out';
  sequence: number;
  blocked: boolean;
  modified: boolean;
  header: number;
  body: Buffer;
  format: number;
}
export function parseIntercept(body: Buffer): Intercept {
  const r = new Reader(body);
  const data = r.take(r.int());
  const format = r.position < body.length ? r.int() : 0;
  const tabs: number[] = [];
  for (let i = 0; i < data.length && tabs.length < 3; i++)
    if (data[i] === 9) tabs.push(i);
  if (tabs.length !== 3)
    throw new Error(messageRef('messages.interceptHasNoDelimiters'));
  const destination = data.subarray(tabs[1] + 1, tabs[2]).toString('ascii');
  if (!['TOCLIENT', 'TOSERVER'].includes(destination))
    throw new Error(messageRef('errors.invalidDestination'));
  const sequence = Number(
    data.subarray(tabs[0] + 1, tabs[1]).toString('ascii'),
  );
  if (!Number.isSafeInteger(sequence))
    throw new Error(messageRef('errors.invalidSequence'));
  if (format !== 0)
    throw new Error(messageRef('messages.onlyTheFlashNitroFormatIsSupported'));
  const packet = new Reader(data.subarray(tabs[2] + 2));
  const size = packet.int();
  if (size !== packet.data.length - 4 || size < 2)
    throw new Error(messageRef('errors.invalidHabboPacket'));
  return {
    direction: destination === 'TOSERVER' ? 'out' : 'in',
    sequence,
    blocked: data[0] === 49,
    modified: data[tabs[2] + 1] === 49,
    header: packet.short(),
    body: packet.take(size - 2),
    format,
  };
}
export function encodeIntercept(p: Intercept) {
  const prefix = Buffer.from(
    `${p.blocked ? 1 : 0}\t${p.sequence}\t${p.direction === 'out' ? 'TOSERVER' : 'TOCLIENT'}\t${p.modified ? 1 : 0}`,
    'ascii',
  );
  const data = Buffer.concat([prefix, frame(p.header, p.body)]);
  return new Writer().int(data.length).raw(data).int(p.format).buffer();
}
export function parseHex(value: string) {
  const hex = value.replace(/\s+/g, '');
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex))
    throw new Error(messageRef('errors.invalidHexadecimalUsePairsOfDigits'));
  return Buffer.from(hex, 'hex');
}
