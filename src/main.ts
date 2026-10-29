import { formatMessage } from './i18n';
import { messageRef } from './i18n';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  shell,
  clipboard,
  net,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { GEarth } from './protocol/gearth';
import { Model } from './model';
import { ProfileStore } from './profile-store';
import { FurniCatalog } from './furni-catalog';
import { hotelDomain } from './user-actions';
import { profileURL } from './user-actions';
import { performUserAction } from './user-actions';
import type { Outfit, Settings } from './shared';
import { readGEarthLaunch } from './gearth-launch';

if (started) app.quit();
if (process.platform === 'win32')
  app.setAppUserModelId('com.squirrel.isora.Isora');
if (!app.isPackaged && process.env.ISORA_TEST_DATA)
  app.setPath('userData', process.env.ISORA_TEST_DATA);
let window: BrowserWindow | null = null;
let model: Model;
let settingsFile: string;
let managedExtension = false;
let quitRequested = false;
let displayRequested = true;
function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: '#101116',
    title: 'Isora',
    icon: path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'assets',
      process.platform === 'win32' ? 'isora.ico' : 'isora.png',
    ),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const current = window;
  window.once('ready-to-show', () => {
    if (displayRequested && !quitRequested && !current.isDestroyed())
      current.show();
  });
  window.on('close', (event) => {
    if (managedExtension && !quitRequested) {
      event.preventDefault();
      displayRequested = false;
      current.hide();
    }
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  window.on('closed', () => {
    window = null;
  });
}
function persist() {
  const temporary = `${settingsFile}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify(
      {
        version: 2,
        settings: model.state.settings,
        outfits: model.state.outfits,
      },
      null,
      2,
    ),
  );
  fs.renameSync(temporary, settingsFile);
}
app.whenReady().then(() => {
  let launch: ReturnType<typeof readGEarthLaunch>;
  try {
    launch = readGEarthLaunch(process.argv);
  } catch (error) {
    dialog.showErrorBox('Isora', formatMessage((error as Error).message, 'en'));
    app.quit();
    return;
  }
  managedExtension = launch.managed;
  displayRequested = !managedExtension;
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  let saved: {
    version?: number;
    settings?: Partial<Settings>;
    outfits?: Outfit[];
  } = {};
  let loadWarning = '';
  try {
    if (fs.existsSync(settingsFile))
      saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    loadWarning = messageRef('errors.couldNotReadSavedSettings');
  }
  if ((saved.version ?? 1) < 2 && saved.settings)
    saved.settings = {
      ...saved.settings,
      showRespecter: true,
      showRespectTotal: true,
    };
  const earth = new GEarth({ file: launch.file, cookie: launch.cookie });
  let managedClosed = false;
  earth.on('status', (status) => {
    if (launch.managed && status === 'disconnected' && !managedClosed) {
      managedClosed = true;
      app.quit();
    }
  });
  model = new Model(earth);
  for (const name of ['room-history.json', 'room-history.json.bak']) {
    try {
      fs.rmSync(path.join(app.getPath('userData'), name), { force: true });
    } catch (e) {
      model.notice(
        messageRef('errors.couldNotDeleteOldVisitorHistory', {
          v0: (e as Error).message,
        }),
      );
    }
  }
  const catalog = new FurniCatalog({
    directory: path.join(app.getPath('userData'), 'furnidata'),
    fetcher: (url, init) => net.fetch(url, init),
    ...(!app.isPackaged &&
    process.env.ISORA_TEST_DATA &&
    process.env.ISORA_TEST_FURNIDATA_URL
      ? {
          url: () => {
            const url = new URL(process.env.ISORA_TEST_FURNIDATA_URL!);
            if (
              !['127.0.0.1', 'localhost'].includes(url.hostname) ||
              url.protocol !== 'http:'
            )
              throw new Error(messageRef('errors.invalidTestUrl'));
            return url.href;
          },
        }
      : {}),
  });
  let catalogGeneration = 0;
  model.on('furniCatalogRequest', (hotel: string, force: boolean) => {
    const generation = ++catalogGeneration;
    const current = () =>
      generation === catalogGeneration &&
      model.state.gameConnected &&
      model.state.session?.host === hotel;
    if (!hotelDomain(hotel)) {
      model.state.furniCatalog = {
        status: 'unsupported',
        hotel,
        count: 0,
        error: messageRef(
          'messages.theFurnitureCatalogForThisHotelIsNotRecognized',
        ),
      };
      model.changed();
      return;
    }
    model.state.furniCatalog = {
      ...model.state.furniCatalog,
      status: 'loading',
      hotel,
      error: undefined,
    };
    model.changed();
    catalog
      .load(hotel, force, (cached) => {
        if (!current()) return;
        model.applyFurniCatalog(hotel, cached.entries);
        model.state.furniCatalog = {
          status: 'loading',
          hotel,
          count: cached.entries.length,
          updated: cached.updated,
        };
        model.changed();
      })
      .then((result) => {
        if (!current()) return;
        model.applyFurniCatalog(hotel, result.entries);
        model.state.furniCatalog = {
          status: result.source === 'network' ? 'ready' : 'cached',
          hotel,
          count: result.entries.length,
          updated: result.updated,
          error: result.warning,
        };
        model.changed();
      })
      .catch((e: Error) => {
        if (!current()) return;
        model.state.furniCatalog = {
          status: 'error',
          hotel,
          count: 0,
          error: e.message,
        };
        model.changed();
      });
  });
  const profileStore = new ProfileStore(
    path.join(app.getPath('userData'), 'profile-history.json'),
  );
  const savedProfiles = profileStore.load();
  model.state.profileHistory = savedProfiles.records;
  model.on('profileHistory', () => {
    try {
      profileStore.save(model.state.profileHistory);
    } catch (e) {
      model.notice(
        messageRef('errors.couldNotSaveProfileHistory', {
          v0: (e as Error).message,
        }),
      );
    }
  });
  const passwordsFile = path.join(
    app.getPath('userData'),
    'room-passwords.bin',
  );
  try {
    if (fs.existsSync(passwordsFile))
      model.general.importPasswords(
        JSON.parse(safeStorage.decryptString(fs.readFileSync(passwordsFile))),
      );
  } catch {
    loadWarning = messageRef('errors.couldNotDecryptSavedRoomPasswords');
  }
  model.on('passwords', () => {
    try {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error(messageRef('messages.localEncryptionIsUnavailable'));
      const temp = `${passwordsFile}.tmp`;
      fs.writeFileSync(
        temp,
        safeStorage.encryptString(
          JSON.stringify(model.general.exportPasswords()),
        ),
      );
      fs.renameSync(temp, passwordsFile);
    } catch (e) {
      model.notice(
        messageRef('errors.couldNotSavePasswords', {
          v0: (e as Error).message,
        }),
      );
    }
  });
  try {
    if (saved.settings) model.saveSettings(saved.settings);
    if (Array.isArray(saved.outfits))
      for (const outfit of saved.outfits) model.addOutfit(outfit);
  } catch {
    loadWarning = messageRef('messages.someSavedSettingsWereInvalid');
  }
  if (launch.port !== undefined) {
    try {
      model.saveSettings({ host: '127.0.0.1', port: launch.port });
    } catch {
      loadWarning = messageRef('errors.theReceivedPortIsInvalid');
    }
  }
  model.on('persist', () => {
    try {
      persist();
    } catch (e) {
      model.notice(
        messageRef('errors.couldNotSave', { v0: (e as Error).message }),
      );
    }
  });
  let update: ReturnType<typeof setTimeout> | undefined;
  model.on('change', () => {
    if (!update)
      update = setTimeout(() => {
        update = undefined;
        if (window && !window.isDestroyed())
          window.webContents.send('isora:state', model.state);
      }, 150);
  });
  earth.on('activate', () => {
    displayRequested = true;
    if (!window) createWindow();
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  const handle = (channel: string, fn: (...args: any[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error(messageRef('errors.invalidIpcOrigin'));
      return fn(...args);
    });
  handle('isora:snapshot', () => model.state);
  handle('isora:lookupProfile', (query) => model.profiles.lookup(query));
  handle('isora:editProfileHistory', (action, key) =>
    model.profiles.edit(action, key),
  );
  handle('isora:profileAction', async (key, action) => {
    const record = model.profiles.record(key);
    if (action === 'game') {
      if (
        !model.state.gameConnected ||
        model.state.session?.host !== record.hotel
      )
        throw new Error(
          messageRef('messages.connectHabboToTheSameHotelToOpenThisProfile'),
        );
      model.action('profile', record.profile.id);
    } else if (action === 'web' || action === 'widgets')
      await shell.openExternal(
        profileURL(record.hotel, record.profile.name, action === 'widgets'),
      );
    else if (action === 'motto') clipboard.writeText(record.profile.motto);
    else if (action === 'figure') clipboard.writeText(record.profile.figure);
    else throw new Error(messageRef('errors.invalidProfileAction'));
  });
  handle('isora:connect', () =>
    earth.connect(model.state.settings.host, model.state.settings.port),
  );
  handle('isora:disconnect', () => {
    model.furniHighlight.stop();
    earth.disconnect();
  });
  handle('isora:settings', (value) => {
    if (value?.rememberPasswords && !safeStorage.isEncryptionAvailable())
      throw new Error(
        messageRef('messages.localEncryptionIsUnavailableForSavingPasswords'),
      );
    model.saveSettings(value);
  });
  handle('isora:action', (name, value) => model.action(name, value));
  handle('isora:userAction', async (action, ref) => {
    const effect = performUserAction(model, action, ref);
    if (effect.copy !== undefined) clipboard.writeText(effect.copy);
    if (effect.url) await shell.openExternal(effect.url);
  });
  handle('isora:send', (value) => model.send(value));
  handle('isora:export', async (kind) => {
    if (!['chat', 'packets', 'wardrobe'].includes(kind))
      throw new Error(messageRef('errors.invalidExport'));
    const value =
      kind === 'chat'
        ? model.state.chat.map((entry) => ({
            ...entry,
            user:
              entry.kind === 'system'
                ? formatMessage(entry.user, model.language)
                : entry.user,
            text:
              entry.kind === 'system' || entry.kind === 'entry'
                ? formatMessage(entry.text, model.language)
                : entry.text,
          }))
        : kind === 'packets'
          ? model.state.packets
          : model.state.outfits;
    const { canceled, filePath } = await dialog.showSaveDialog(window!, {
      defaultPath: `isora-${kind}-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return false;
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(value, null, 2),
      'utf8',
    );
    return true;
  });
  handle('isora:importWardrobe', async () => {
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile'],
      filters: [
        { name: model.t('messages.wardrobeJson'), extensions: ['json'] },
      ],
    });
    if (result.canceled) return;
    const file = result.filePaths[0];
    if ((await fs.promises.stat(file)).size > 2 * 1024 * 1024)
      throw new Error(messageRef('messages.theFileExceeds2Mb'));
    const value = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (
      !Array.isArray(value) ||
      value.length + model.state.outfits.length > 1000
    )
      throw new Error(messageRef('errors.invalidFormatOrMoreThan1000Outfits'));
    const validator = new Model(new GEarth());
    for (const outfit of value) validator.addOutfit(outfit);
    for (const outfit of value) model.addOutfit(outfit);
  });
  createWindow();
  if (savedProfiles.warning) model.notice(savedProfiles.warning);
  if (loadWarning) model.notice(loadWarning);
  app.on('activate', () => {
    if (!window) createWindow();
  });
  if (launch.port !== undefined)
    earth
      .connect(model.state.settings.host, model.state.settings.port)
      .catch((e) => model.notice(e.message));
});
app.on('before-quit', () => {
  quitRequested = true;
  model?.furniHighlight.stop();
  model?.profiles.sessionEnded();
  model?.shutdown();
  model?.general.dispose();
  model?.earth.disconnect();
});
app.on('window-all-closed', () => {
  if (!managedExtension && process.platform !== 'darwin') app.quit();
});
