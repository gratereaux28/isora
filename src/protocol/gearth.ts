import { translate, messageRef } from '../i18n';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import info from '../../package.json';
import type { MessageInfo } from '../shared';
import {
  Framer,
  Reader,
  Writer,
  encodeIntercept,
  frame,
  parseIntercept,
  type Intercept,
} from './packet';

// Wire layout uses an MIT-licensed reference; see LICENSE.
export class GEarth extends EventEmitter {
  private socket?: net.Socket;
  gameConnected = false;
  messages: MessageInfo[] = [];
  intercept?: (packet: Intercept) => void;
  constructor(private args: { file?: string; cookie?: string } = {}) {
    super();
  }
  connect(host: string, port: number): Promise<void> {
    if (this.socket)
      throw new Error(
        messageRef('messages.theExtensionIsAlreadyConnectedOrConnecting'),
      );
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
      throw new Error(messageRef('messages.useGEarthSLocalAddress'));
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error(messageRef('errors.invalidPort'));
    const socket = (this.socket = new net.Socket());
    const decoder = new Framer();
    this.emit('status', 'connecting');
    socket.setNoDelay(true);
    socket.on('data', (chunk) => {
      try {
        for (const data of decoder.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        ))
          this.handle(data);
      } catch (error) {
        this.emit(
          'notice',
          messageRef('messages.protocolError', {
            v0: (error as Error).message,
          }),
        );
        socket.destroy();
      }
    });
    socket.on('error', (e) => this.emit('notice', `G-Earth: ${e.message}`));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.gameConnected = false;
      this.messages = [];
      this.emit('gameEnd', { reason: 'gearth-socket-closed' });
      this.emit('status', 'disconnected');
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          socket.destroy(new Error(messageRef('messages.connectionTimedOut'))),
        5000,
      );
      socket.once('error', reject);
      socket.once('close', () => {
        clearTimeout(timer);
        reject(new Error(messageRef('messages.connectionClosed')));
      });
      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.removeListener('error', reject);
        this.emit('status', 'connected');
        resolve();
      });
    });
  }
  disconnect() {
    this.socket?.destroy();
  }
  private write(header: number, body: Buffer = Buffer.alloc(0)) {
    if (!this.socket || this.socket.destroyed)
      throw new Error(messageRef('messages.connectToGEarthFirst'));
    if (this.socket.writableLength > 16 * 1024 * 1024) {
      this.socket.destroy();
      throw new Error(
        messageRef('messages.theConnectionIsNotProcessingPackets'),
      );
    }
    this.socket.write(frame(header, body));
  }
  private handle(data: Buffer) {
    const r = new Reader(data);
    const header = r.short();
    const body = r.take(data.length - 2);
    switch (header) {
      case 1:
        this.emit('activate');
        break;
      case 2:
        this.write(
          1,
          new Writer()
            .string(info.productName)
            .string(info.author.name)
            .string(info.version)
            .string(translate('extension.description', 'en'))
            .bool(true)
            .bool(!!this.args.file)
            .string(this.args.file ?? '')
            .string(this.args.cookie ?? '')
            .bool(true)
            .bool(!!this.args.file && !!this.args.cookie)
            .buffer(),
        );
        break;
      case 3: {
        // Always return an intercept, even when a parser/feature fails, so Habbo is never left waiting.
        let response = body;
        try {
          const p = parseIntercept(body);
          this.intercept?.(p);
          response = encodeIntercept(p);
        } catch (error) {
          this.emit(
            'notice',
            messageRef('messages.packetPreserved', {
              error: (error as Error).message,
            }),
          );
        }
        this.write(2, response);
        break;
      }
      case 5: {
        const p = new Reader(body);
        const host = p.string(),
          port = p.int(),
          version = p.string();
        p.string();
        const client = p.string();
        this.messages = [];
        const n = p.count();
        for (let i = 0; i < n; i++) {
          const id = p.int(),
            hash = p.string(),
            name = p.string();
          p.string();
          const direction = p.bool() ? 'out' : 'in';
          p.string();
          this.messages.push({ id, hash, name, direction });
        }
        this.gameConnected = ['FLASH', 'NITRO'].includes(client.toUpperCase());
        this.emit('game', { host, port, version, client });
        if (!this.gameConnected)
          this.emit(
            'notice',
            messageRef('messages.clientIsNotSupportedSelectFlashNitro', {
              v0: client,
            }),
          );
        break;
      }
      case 6:
        this.gameConnected = false;
        this.messages = [];
        this.emit('gameEnd', { reason: 'game-disconnected' });
        break;
      case 7:
        this.emit(
          'notice',
          messageRef('messages.extensionRegisteredEnterHabboThroughGEarth'),
        );
        break;
    }
  }
  resolve(direction: 'in' | 'out', names: string[]): MessageInfo | undefined {
    const normalized = names.map(normalize);
    return this.messages.find(
      (m) =>
        m.direction === direction && normalized.includes(normalize(m.name)),
    );
  }
  send(direction: 'in' | 'out', header: number, body: Buffer) {
    if (!this.gameConnected)
      throw new Error(messageRef('errors.habboMustBeConnected'));
    const packet = frame(header, body);
    this.write(
      4,
      new Writer()
        .bool(direction === 'out')
        .int(packet.length)
        .raw(packet)
        .int(0)
        .buffer(),
    );
    this.emit('sent', { direction, header, body });
  }
}
export function normalize(name: string) {
  return name
    .replace(/(Message)?(Composer|Parser|Event)$/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}
