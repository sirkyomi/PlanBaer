# PlanBär

PlanBär ist ein lokaler Schichtplaner für Kindergartenleitungen unter Windows 11. Team, Verträge, Dienstpläne, Ist-Zeiten, Abwesenheiten, Stundenkonto und Statistiken bleiben ohne Anmeldung oder Telemetrie auf dem Rechner.

## Entwicklung

Voraussetzungen: Node.js 24 und pnpm 10.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Prüfen und bauen:

```powershell
pnpm build
pnpm dist:win
```

Der NSIS-Installer wird unter `dist/PlanBaer-Setup-<version>.exe` erzeugt. Er installiert ohne Administratorrechte und lässt Nutzerdaten bei der Deinstallation bestehen.

## Daten und Sicherheit

- SQLite-Datenbank, lokale verschlüsselte Sicherungen und Protokolle liegen in `%APPDATA%\planbaer`.
- Portable `.planbaer-backup`-Dateien verwenden Scrypt und AES-256-GCM.
- Der Renderer hat keinen Node-Zugriff. Alle schreibenden Aufrufe laufen über eine validierte, typisierte IPC-Schnittstelle.
- Der kostenlose Build ist nicht signiert; Windows kann deshalb „Unbekannter Herausgeber“ anzeigen.

## Updates und Releases

Vor einem öffentlichen Release muss in `package.json` der Platzhalter `planbaer-app` durch den tatsächlichen GitHub-Benutzer oder die Organisation ersetzt werden. Tags im Format `v*` starten den Windows-Build. Für ein separates öffentliches Release-Repository benötigt der Workflow ein GitHub-Token mit Schreibzugriff auf `planbaer-releases`.

## Unterstützte Umgebung

Offiziell unterstützt: Windows 11 22H2 oder neuer, Gebietsschema `de-DE`, Standardwoche Montag bis Freitag. Die Anwendung ist für System-, Hell- und Dunkelmodus, Hochkontrast, reduzierte Bewegung und 200-%-Skalierung ausgelegt.
