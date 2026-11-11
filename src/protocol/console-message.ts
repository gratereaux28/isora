import { Reader } from './packet';

export interface ConsoleMessage {
  sender: number;
  name?: string;
  text: string;
  messageId?: string;
}
export function parseConsoleMessage(body: Buffer): ConsoleMessage {
  const reader = new Reader(body);
  const message: ConsoleMessage = {
    sender: reader.int(),
    text: reader.string(),
  };
  // Nitro's optional extraData is metadata, not a unique message ID. Only the
  // extended Flash layout adds confirmation/sender fields after that string.
  // Incomplete optional fields must not discard an otherwise readable message.
  try {
    if (reader.data.length - reader.position < 4) return message;
    reader.int(); // Seconds since sent.
    if (reader.data.length - reader.position < 2) return message;
    const extra = reader.string();
    if (reader.data.length - reader.position < 10) return message;
    reader.int(); // Confirmation ID.
    const sender = reader.int();
    const name = reader.string();
    if (sender > 0 && name.length <= 100) {
      message.sender = sender;
      message.name = name || undefined;
      message.messageId = extra || undefined;
    }
  } catch {
    // Preserve the mandatory sender/text prefix for other trailer revisions.
  }
  return message;
}
