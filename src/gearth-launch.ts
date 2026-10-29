import { messageRef } from './i18n';
export function readGEarthLaunch(argv: string[]) {
  const read = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith('-') || argv.lastIndexOf(flag) !== index)
      throw new Error(messageRef('errors.invalidGEarthLaunchArguments'));
    return value;
  };
  const rawPort = read('-p'),
    file = read('-f'),
    cookie = read('-c');
  const port = rawPort === undefined ? undefined : Number(rawPort);
  if (
    rawPort !== undefined &&
    (!/^\d+$/.test(rawPort) ||
      !Number.isInteger(port) ||
      port! < 1 ||
      port! > 65535)
  )
    throw new Error(messageRef('errors.theReceivedPortIsInvalid'));
  if ((file || cookie) && (!file || !cookie || port === undefined))
    throw new Error(messageRef('errors.invalidGEarthLaunchArguments'));
  return {
    port,
    file,
    cookie,
    managed: !!file && !!cookie && port !== undefined,
  };
}
