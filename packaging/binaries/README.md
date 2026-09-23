Place manually downloaded packaging binaries here when you use local packaging mode.

Current supported file:
- `winCodeSign-2.6.0.7z`

Optional additional files for a fully local Windows build:
- `nsis-3.0.4.1.7z`
- other `electron-builder` binary archives if you want to avoid GitHub fallback completely

Usage:
1. Download `winCodeSign-2.6.0.7z`.
2. Put it in this directory.
3. Run `npm run electron:build-win:local` or `npm run electron:build-all:local`.
4. If a required archive is not present here, the local helper will fall back to the official GitHub release URL.
