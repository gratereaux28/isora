import { messageRef } from './i18n';
import type { Model } from './model';
import { Reader, Writer } from './protocol/packet';
export function raiseFurni(raw: Buffer, height: number): Buffer {
  const r = new Reader(raw);
  for (let i = 0; i < 5; i++) r.int();
  const position = r.position,
    z = Number(r.string());
  if (!Number.isFinite(z) || !Number.isFinite(height))
    throw new Error(messageRef('errors.invalidFurnitureHeight'));
  return Buffer.concat([
    raw.subarray(0, position),
    new Writer().string((z + height).toFixed(3)).buffer(),
    raw.subarray(r.position),
  ]);
}
export class FurniHighlight {
  private timer?: ReturnType<typeof setInterval>;
  private target?: {
    id: number;
    kind: number;
    owner: number;
    hotel: string;
    room: number;
  };
  constructor(private model: Model) {}
  start(id: number) {
    const f = this.model.state.furni.find((v) => v.id === id);
    if (
      !this.model.state.gameConnected ||
      !this.model.earth.gameConnected ||
      !this.model.state.session
    )
      throw new Error(messageRef('messages.connectHabboToFindFurniture'));
    if (!Number.isInteger(id) || !f || !this.model.getFloorRaw(id))
      throw new Error(messageRef('messages.theFurnitureIsNoLongerInTheRoom'));
    if (f.hidden)
      throw new Error(messageRef('errors.showFurnitureBeforeHighlighting'));
    if (!this.model.earth.resolve('in', ['ObjectUpdate']))
      throw new Error(
        messageRef(
          'messages.gEarthHasNotIdentifiedObjectupdateToHighlightFurniture',
        ),
      );
    this.stop();
    this.target = {
      id,
      kind: f.kind,
      owner: f.ownerId,
      hotel: this.model.state.session.host,
      room: this.model.state.room.id,
    };
    this.model.state.furniHighlight = id;
    this.model.changed();
    const started = Date.now();
    this.timer = setInterval(() => {
      try {
        if (!this.current()) {
          this.stop(false);
          return;
        }
        const elapsed = Date.now() - started;
        if (elapsed >= 4000) {
          this.stop();
          return;
        }
        const height =
          (1.5 * (1 - Math.cos((2 * Math.PI * elapsed) / 1000))) / 2;
        this.send(raiseFurni(this.displayRaw()!, height));
      } catch (error) {
        this.stop(false);
        this.model.notice(
          messageRef('errors.couldNotHighlightFurniture', {
            v0: (error as Error).message,
          }),
        );
      }
    }, 80);
    this.timer.unref();
  }
  private current() {
    const t = this.target;
    return (
      t &&
      this.model.state.gameConnected &&
      this.model.earth.gameConnected &&
      this.model.state.session?.host === t.hotel &&
      this.model.state.room.id === t.room &&
      this.model.state.furni.some(
        (f) =>
          f.id === t.id &&
          f.kind === t.kind &&
          f.ownerId === t.owner &&
          !f.hidden,
      ) &&
      !!this.model.getFloorRaw(t.id)
    );
  }
  private displayRaw() {
    if (!this.current() || !this.target) return undefined;
    return this.model.general.floor.object(
      this.model.getFloorRaw(this.target.id)!,
    );
  }
  private send(raw: Buffer) {
    const message = this.model.earth.resolve('in', ['ObjectUpdate']);
    if (!message)
      throw new Error(messageRef('messages.objectupdateIsNotIdentified'));
    this.model.earth.send('in', message.id, raw);
  }
  stop(restore = true) {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const raw = restore ? this.displayRaw() : undefined;
    this.target = undefined;
    if (this.model.state.furniHighlight !== null) {
      this.model.state.furniHighlight = null;
      this.model.changed();
    }
    if (raw)
      try {
        this.send(raw);
      } catch (e) {
        this.model.notice(
          messageRef('errors.couldNotRestoreFurnitureAfterHighlighting', {
            v0: (e as Error).message,
          }),
        );
      }
  }
}
