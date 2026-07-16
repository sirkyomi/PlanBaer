# PlanBär

PlanBär ist eine lokale Desktop-Anwendung zur Schichtplanung für Kindertagesstätten. Mitarbeitende, Dienstpläne, Abwesenheiten und Stundenkonten werden direkt auf dem Windows-Rechner verwaltet – ohne Benutzerkonto, Cloud-Zwang oder Telemetrie.

[![CI](https://github.com/sirkyomi/PlanBaer/actions/workflows/ci.yml/badge.svg)](https://github.com/sirkyomi/PlanBaer/actions/workflows/ci.yml)

## Funktionen

- Mitarbeitende mit Vertragszeiträumen, Wochenstunden und individuellen Tagesprofilen verwalten
- Wochenweise Dienstpläne mit mehreren Schichtsegmenten pro Tag erstellen
- Anpassbare Schichtvorlagen mit eigenen Zeiten, Pausen und Farben verwenden
- Urlaub, Krankheit und Fortbildungen erfassen
- Plan- und Ist-Zeiten sowie Pausen dokumentieren
- Wochen abschließen und Überstunden im Stundenkonto fortschreiben
- Korrekturbuchungen und statistische Auswertungen erstellen
- Dienstpläne drucken oder als PDF exportieren
- Team- und Statistikdaten als CSV importieren beziehungsweise exportieren
- Gesetzliche Feiertage nach Bundesland und eigene Schließtage berücksichtigen
- Passwortgeschützte Backups erstellen und wiederherstellen
- System-, Hell- und Dunkelmodus verwenden

## Installation

Fertige Windows-Installer werden auf der [Releases-Seite](https://github.com/sirkyomi/PlanBaer/releases) veröffentlicht.

Der Installer ist derzeit nicht digital signiert. Windows kann deshalb den Hinweis „Unbekannter Herausgeber“ anzeigen. In diesem Fall lässt sich die Installation über „Weitere Informationen“ und „Trotzdem ausführen“ fortsetzen.

Offiziell unterstützt wird Windows 11 ab Version 22H2. Die Oberfläche ist für das deutsche Gebietsschema und eine Arbeitswoche von Montag bis Freitag ausgelegt.

## Lokale Entwicklung

Benötigt werden:

- Node.js 24
- pnpm 10 oder neuer
- Windows für das Erstellen des NSIS-Installers

Repository klonen und Abhängigkeiten installieren:

```powershell
git clone https://github.com/sirkyomi/PlanBaer.git
cd PlanBaer
pnpm install --frozen-lockfile
```

Anwendung im Entwicklungsmodus starten:

```powershell
pnpm dev
```

Tests, Typprüfung und Produktions-Build ausführen:

```powershell
pnpm build
```

Windows-Installer erzeugen:

```powershell
pnpm dist:win
```

Der Installer wird anschließend unter `dist/PlanBaer-Setup-<version>.exe` abgelegt.

## Verfügbare Befehle

| Befehl | Beschreibung |
| --- | --- |
| `pnpm dev` | Startet Vite und die Electron-Anwendung im Entwicklungsmodus |
| `pnpm typecheck` | Prüft den TypeScript-Code |
| `pnpm test` | Führt die Tests einmalig aus |
| `pnpm test:watch` | Startet die Tests im Beobachtungsmodus |
| `pnpm build` | Führt Typprüfung, Tests und den Electron-Build aus |
| `pnpm dist:win` | Erstellt einen lokalen Windows-Installer |
| `pnpm release` | Baut und veröffentlicht ein konfiguriertes GitHub-Release |

## Daten und Datenschutz

PlanBär speichert seine Daten standardmäßig im lokalen Electron-Anwendungsverzeichnis unter `%APPDATA%\planbaer`.

- Die Anwendungsdaten liegen in einer SQLite-Datenbank.
- Portable `.planbaer-backup`-Dateien werden mit Scrypt und AES-256-GCM verschlüsselt.
- Zusätzlich hält die Anwendung bis zu sieben über Windows geschützte lokale Sicherungen vor.
- Der Renderer besitzt keinen direkten Node.js-Zugriff. Schreibende Aktionen laufen über eine typisierte und validierte IPC-Schnittstelle.
- Beim Zurücksetzen der Datenbank bleiben Einrichtung, Adresse, Bundesland und Darstellung erhalten.

Backups sollten regelmäßig auf einem vom Rechner getrennten Datenträger gespeichert werden. Ohne das gewählte Backup-Passwort kann ein verschlüsseltes Backup nicht wiederhergestellt werden.

## Technik

- Electron und electron-vite
- React und TypeScript
- SQLite über `node:sqlite`
- Zod zur Eingabevalidierung
- Vitest für automatisierte Tests
- electron-builder für Windows-Installer und GitHub-Releases

## Releases

Die GitHub-Actions-Pipeline prüft Pushes auf `main` und Pull Requests. Tags im Format `v*` lösen zusätzlich den Windows-Installer und die Veröffentlichung eines Releases aus.

Für Veröffentlichungen verwendet die Pipeline automatisch das von GitHub Actions bereitgestellte `GITHUB_TOKEN`. Ein persönlicher Access-Token oder ein zusätzliches Repository-Secret ist nicht erforderlich. Ein Release wird beispielsweise so vorbereitet:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

Vor dem Taggen muss die Version in `package.json` zum Tag passen.

## Mitwirken

Fehlerberichte und konkrete Verbesserungsvorschläge sind über [GitHub Issues](https://github.com/sirkyomi/PlanBaer/issues) willkommen. Bitte beschreibe bei Fehlern möglichst die verwendete Windows-Version, die Schritte zum Reproduzieren und das erwartete Verhalten.

Pull Requests sollten vor dem Einreichen lokal mit `pnpm build` geprüft werden.

## Lizenz

Für dieses Projekt ist derzeit keine Open-Source-Lizenz hinterlegt. Der öffentlich einsehbare Quellcode darf daher nicht automatisch als frei nutzbar, veränderbar oder weiterverteilbar angenommen werden.
