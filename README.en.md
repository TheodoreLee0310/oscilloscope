# ShiBoQI · 智波助梦

[简体中文](README.md) · **English** · [繁體中文](README.zh-TW.md)

An oscilloscope simulation project for electronics education, with a **native HarmonyOS application** as its main development focus. ArkTS, ArkUI and Canvas provide dual-channel waveforms, triggering and parameter controls, together with local drafts, offline experiment records and server synchronization. The browser, ArkWeb and Electron versions also offer 3D CRT demonstrations, VR waveform exploration and other teaching features.

> **Development status (2026-11-05): new work goes to `deve`.** Manual push and pull synchronization is implemented and covered by computer-side logic checks. These synchronization changes still require HarmonyOS compilation and device acceptance by contributors before a mainline merge is considered. Existing HAP packages may not contain the latest source changes.

## Choose a version

| Version | Location | Purpose and scope |
| --- | --- | --- |
| Native HarmonyOS (main development focus) | [`harmonyos-native/`](harmonyos-native/) | ArkTS / ArkUI; Canvas oscilloscope, accounts, automatic drafts, offline records and manual synchronization |
| HarmonyOS ArkWeb | [`harmonyos/`](harmonyos/) | An ArkTS container for the Web interface, including 3D CRT, VR exploration, maps and guided tours |
| Browser | [`src/`](src/), [`public/`](public/) | Waveform and 3D teaching features on a computer; a backend enables account-based experiment storage |
| Electron desktop | [`electron-main.js`](electron-main.js) | Packages the Web interface; local pages support guest use, while account features use backend-served pages |

The native application currently has no 3D CRT, VR exploration or maps. Feature coverage and validation status differ between the two HarmonyOS projects.

## Implemented features

### Oscilloscope and teaching tools

- Native dual channels support sine, square, triangle, sawtooth, pulse and noise signals, with frequency, amplitude, phase, time base, vertical scale and position controls.
- Native display modes include dual trace, addition and Lissajous figures, with trigger level and edge controls, grids, glow and on-screen readings.
- Web / ArkWeb additionally provide calibration, waveform image recognition, 3D CRT structure and electron-beam demonstrations, VR waveform exploration, local knowledge-base Q&A and guided tours. Maps require network access and the relevant service configuration.

### Native data management

- **Accounts and sessions:** registration, sign-in and sign-out, with session persistence through Asset Store. An expired session still permits local work; server access requires signing in again.
- **Automatic drafts:** changed parameters are saved periodically, with restore or delete offered after restart. Default parameters do not overwrite a draft while that choice is pending.
- **Offline records:** create, edit, restore and delete records locally. Drafts and saved experiments are stored separately.
- **Account isolation:** storage is partitioned by normalized server address and user ID, with a separate guest partition. Moving guest records into an account requires explicit confirmation.
- **Online experiment management:** edit titles and notes, search and paginate. Export server experiments to sandbox files; preview an import before confirming its upload to the server. This import/export flow requires a valid account and backend connection.
- **Manual synchronization:** a button pushes local changes, then pulls server changes and deletions in pages after successful processing. Conflicts preserve a local copy, uploaded on the next manual synchronization. Background synchronization is not implemented.

Native experiment parameters use **v2**; Web / ArkWeb use **v1**. Accounts are shared, but experiment formats cannot be restored interchangeably. Native import and pull skip v1 records without automatic parameter conversion.

## Quick start: browser preview

Use **Node.js 22.13 or later** and npm. The backend uses Node.js built-in SQLite and needs no separate database service. Run these commands from the repository root:

```bash
git clone --branch deve https://github.com/TheodoreLee0310/oscilloscope.git
cd oscilloscope
npm install
npm run dev:full
```

Open the [development page](http://localhost:8081/login.html). The Web development server defaults to port `8081`, the backend to `3000`, and `/api` requests are proxied to the backend. Register and sign in, or choose guest mode. Web guests cannot save experiments to the server.

To use the built Web application:

```bash
npm run build
npm run server
```

Open the [backend-served page](http://127.0.0.1:3000/login.html). `docs/` contains generated Web output. Edit `src/`, `public/` or `scripts/` and rebuild when changing the interface.

## Develop the native HarmonyOS application

1. Open the repository's `harmonyos-native/` directory in DevEco Studio.
2. Sync project dependencies. The project currently targets HarmonyOS `5.0.0(12)` and requires the corresponding SDK.
3. For account and synchronization development, start `npm run server` on a computer or server and enter a device-accessible server address on the app's sign-in page.
4. Contributors should complete compilation, device installation and interaction checks, then report results with the tested commit ID.

On a device, `127.0.0.1` refers to the device itself. To connect to a computer over a local network, bind the backend to an accessible interface and use the computer's LAN IP in the app. Windows PowerShell example:

```powershell
$env:SBQ_HOST = '0.0.0.0'
npm run server
```

Example app server address: `http://192.168.1.10:3000`. Replace it with the actual computer IP and allow the corresponding firewall port. Use HTTPS for public deployments.

Native build command for contributors:

```bash
npm run harmonyos:native:build
```

The script locates DevEco Studio; set `DEVECO_HOME` for a custom installation directory. Signing is not configured in the default project. **Signing uses certificates to identify the publisher and verify the application package.** See the [device acceptance guide](harmonyos-native/DEVICE_ACCEPTANCE.md) for installation prerequisites. A successful build and successful device acceptance are separate results.

The supplementary ArkWeb version uses a separate project and this build sequence:

```bash
npm run build:harmonyos
npm run harmonyos:build
```

The first command builds and copies Web resources; the second packages the ArkWeb HAP. See the [ArkWeb project guide](harmonyos/README.md) for details.

## Storage and backend configuration

| Data | Location and behavior |
| --- | --- |
| Native session | System Asset Store; ordinary settings such as the server address use preferences |
| Native drafts and offline records | JSON files under the app's `filesDir`, with atomic replacement, format versions and ownership checks |
| Local file problems | Corrupt content is quarantined; foreign ownership or unsupported legacy formats leave the original file intact, without automatic migration into the current account |
| Accounts and server experiments | `server/data/oscilloscope.sqlite` by default; databases are excluded from Git |
| Native export files | The app sandbox's `files/exports/`; system file-picker integration remains unfinished |

Passwords use salted scrypt hashes, and the server stores session token digests. Sessions last 7 days by default. Experiments save parameter snapshots, excluding original images, map locations, Q&A conversations and 3D scenes.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `SBQ_HOST` | `127.0.0.1` | Backend bind address |
| `SBQ_API_PORT` | `3000` | Backend port, also read by the development proxy |
| `SBQ_DB_PATH` | `server/data/oscilloscope.sqlite` | Database file path |

Starting the backend runs schema migrations. Back up a real database before upgrading it. For the default database:

```bash
node server/backup-db.js
```

For a custom path, use `node server/backup-db.js <source.sqlite> [backup.sqlite]`. The script creates a consistent SQLite snapshot. Version checks, idempotency, conflicts and deletion tombstones are described in the [synchronization and migration guide](server/SYNC_PROTOCOL.md); API configuration is covered in the [backend guide](server/README.md).

Full account functionality requires a running backend and persistent database storage. Static hosting such as GitHub Pages can serve the static experience but cannot run this project's account and experiment API.

## Source map

```text
harmonyos-native/           Main ArkTS / ArkUI native project
  entry/src/main/ets/
    pages/                 Sign-in, oscilloscope and record interfaces
    model/                 Waveform mathematics, sampling and triggering
    view/                  Canvas rendering and controls
    service/               Sessions, local storage, drafts, experiments and sync
harmonyos/                 Supplementary ArkWeb project
src/                       Web interface and 3D scenes
public/                    HTML templates and static assets
scripts/                   Web waveforms, calibration and knowledge-base logic
server/                    HTTP API, SQLite, migrations and logic tests
shared/                    Experiment formats and validation
packaging/                 Web, Electron and HarmonyOS build tools
docs/                      Generated Web output
NEXT_TASKS.md              Follow-up tasks and progress history
```

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev:full` | Start the backend and Web development server together |
| `npm run dev` / `npm run server` | Start the Web development server / backend separately |
| `npm run build` | Build Web output into `docs/` |
| `npm run harmonyos:native:build` | Build the native HarmonyOS project |
| `npm run build:harmonyos` / `npm run harmonyos:build` | Prepare Web resources, then package the ArkWeb project |
| `npm run electron` | Open existing Web output with Electron |
| `npm run dist` | Build and package the desktop app for the current platform |
| `npm test` | Run platform, map and backend / native service logic tests |
| `npm run test:user-data` / `npm run test:smoke` | Check Web account flows / run the Electron smoke check |

## Limitations and contributions

- `deve` is the current development and contributor-validation branch. Start new contributions from it and target `deve` in pull requests. Mainline merges await validation results.
- Computer-side service tests use type-stripped ArkTS source, platform substitutes and temporary SQLite databases. They do not replace DevEco compilation or HarmonyOS device tests. See the [contributor validation checklist](harmonyos-native/CONTRIBUTOR_TESTING.md) for the current synchronization changes.
- Background synchronization, cursor renegotiation after database replacement or rollback, password changes and session management remain pending. Email / SMS password recovery has no delivery service yet.
- System file selection, keyboard behavior, small-screen layouts, touch input and real network transitions still need device validation. Include the branch, commit ID, device / OS version and reproduction steps in reports.
- Do not commit databases, account tokens, signing certificates or private keys. See the [task list](NEXT_TASKS.md); the latest entries at the end take precedence over earlier plans.

These three README files provide Simplified Chinese, English and Traditional Chinese project documentation. The application interface is currently primarily in Simplified Chinese; detailed engineering guides are also currently in Simplified Chinese.
