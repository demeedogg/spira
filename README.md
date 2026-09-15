# spira

Companion respiratorio minimalista per Windows 11. La finestra trasparente è il
solo elemento visivo dell'esercizio; l'help è accessibile con `?` o `F1`.

## Sviluppo

```sh
npm install
npm run tauri dev
```

Istruzioni complete: [docs/WINDOWS_BUILD.md](docs/WINDOWS_BUILD.md).

Per produrre l'installer Windows eseguire il comando su Windows:

```powershell
npm run tauri build
```

WSL non può creare o testare il bundle Windows in modo affidabile. Il check
nativo Linux richiede le librerie GTK/WebKit, che non sono necessarie per il
target Windows iniziale.

## Stato MVP

Implementati: finestra frameless/topmost, animazione, countdown, preset 1–5,
narici alternate, pause/stop, help, audio, preferenze locali, tray, avvio
automatico e toast Windows con `Avvia` / `Rimanda 15 min` / `Ignora`.
