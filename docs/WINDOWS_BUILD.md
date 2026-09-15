# Produrre `spira-setup.exe`

## Opzione consigliata: GitHub Actions

1. Crea un repository GitHub e carica questa cartella.
2. Apri **Actions** → **Build Windows installer** → **Run workflow**.
3. Alla fine scarica l'artefatto `spira-windows-installer`.

Il workflow usa un runner Windows ufficiale e produce l'installer NSIS. Non
pubblica né firma nulla automaticamente.

## Sul tuo PC Windows

Installa Node.js LTS, Rust stable con il target MSVC e i **Desktop development
with C++** build tools di Visual Studio. Poi, da PowerShell nella cartella del
progetto:

```powershell
npm ci
npm run tauri build
```

L'output è in:

```text
src-tauri\target\release\bundle\nsis\spira_0.1.0_x64-setup.exe
```

Windows 11 include normalmente WebView2. L'installer NSIS creato da Tauri
gestisce il bootstrapper quando necessario.

## Da WSL: possibile ma sconsigliato

Tauri documenta il cross-build NSIS come ultima scelta. Richiede almeno NSIS,
LLVM/LLD, target `x86_64-pc-windows-msvc` e `cargo-xwin`:

```sh
sudo apt install nsis lld llvm clang
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc
```

Usa invece GitHub Actions o Windows per build/test affidabili.
