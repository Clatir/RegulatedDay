---
paths:
  - "src/main/update/**"
  - "src/shared/update*.ts"
  - "helper/**"
  - "resources/installer.nsh"
  - "scripts/manifest.cjs"
  - "tests/update/**"
---

# Aktualizacje, strażnik, pomocnik instalacji (E0)

Źródło prawdy: specyfikacja, rozdział „Instalacja, aktualizacje i log” (Grep „guard.lock”, „plik zadania”) i „Pomocnik”.
Poniżej formaty i podział ról, żeby nie czytać całości przy każdej zmianie.

## Programy (helper/src, C# 5, csc.exe; Linux: Roslyn net472)
- `rd-helper.exe` – pomocnik w tle (proces potomny aplikacji, linie JSON, `alive` co 2 s). Kolejność okien (BarKeeper),
  pierwszy plan, stan powiadomień, ToastNotifier.Setting (WinRT przez COM, bez winmd), sesja (klucz ulotny
  `HKCU\Software\RegulatedDay\<tożsamość>` z RunId i LogonId), żądania zasilania, OneDrive, atrybuty plików.
- `rd-guard.exe` – strażnik: właściciel zadania przy starcie Windows (wpis Run „Regulated Day Guard”) i tryby z jednym
  wierszem JSON (`--query …`, `--run-entry set|remove`, `--process …`); wyjątek w trybie = `{"ok": false}`.
- `rd-install.exe` – pomocnik instalacji: właściciel zadania przy wyjściu, „Zainstaluj teraz” i w nocy; okno postępu.
- Wspólny kod właściciela: `helper/src/Owner`. Czasy: ms UTC (`Native.NowMs`), czuwanie: `AwakeClock` (tyknięcia 1 s,
  przerwa > 5 s się nie liczy). Kultura niezmienna. Pliki wspólne: `SharedFile` (tymczasowy + rename POSIX / MoveFileEx).

## Pliki w danych aplikacji (`%APPDATA%\Regulated Day`)
- `update\<X>\download\` – pobrane wydanie (instalator, manifest); nie jest usuwane przed instalacją.
- `update\<X>\` – kopie `rd-*.exe`, instalatora i manifestu (przez nazwę tymczasową), `task.json`, `guard.lock`,
  `handover.jsonl` (jednej próby: właściciel usuwa go po starcie aplikacji, nowa próba na starcie).
- `launched.json` – „uruchomiono wersję X” (wersja, attemptId) poza update; liczy się tylko z attemptId bieżącej próby.
- `closed-by-installer.json` – znacznik skryptu NSIS (czas ms UTC); `plan-blocks.json` – bloki sesji i zajęć na 7 dni.

## task.json (format 1; nieznane pola zachowywane)
`version`, `attemptId`, `state` (`scheduled` | `installing` | `postponed` | `done` | `failed` | `fi`), `trigger`
(`exit` | `now` | `night` | `logon`), `start` (`visible` | `hidden` | `none`), `url`, `autostart`, `guid`,
`uninstallKey`, `installDir`, `appExe`, `installer`, `manifest`, `attempts` (starty instalatora), `starts` (starty
właściciela bez czystego końca), `cleanEnd`, `installerStartedAt`, `installerPid` (ścieżka FI), `createdAt`, `updatedAt`.
- „Zainstalowano X”: DisplayVersion z `HKCU\…\Uninstall\<guid>` > X albo = X przy zgodnych rozmiarach (SHA-256 raz).
- Brak wpisu deinstalacji = brak instalacji. O sukcesie nigdy nie decyduje kod wyjścia instalatora.

## guard.lock
Trzymany przez właściciela do zapisu, inni tylko czytają. Treść: rola, pid, czas startu procesu, licznik sygnału
(rośnie tylko przy postępie kroku; kroki mają terminy: instalator 10 min czuwania, inne 60 s). Żywy = licznik zmienił się
między dwoma odczytami w odstępie 6 s; zawieszony = plik zajęty i licznik stoi 30 s (odczyty co 10 s).

## Ścieżki
- Wyjście / „Zainstaluj teraz” / noc: aplikacja kopiuje programy, pisze zadanie i wpis Run strażnika, zapis zamknięcia,
  startuje `rd-install.exe` odłączony i kończy się; właściciel czeka na koniec jej procesu.
- Start Windows: strażnik z Run; plik planu z sesją lub zajęciami w ciągu 30 min → `postponed`.
- Noc (E4a, D162, T469, T516): `shared/nightInstall.ts` (warunki nocy i reguła kolejnych komputerów z obecności:
  `versions`, `installing`; wstrzymują tylko stany powiadomień gry, prezentacji, zajętości i aplikacji na cały ekran –
  „notPresent” to sama blokada; nowoczesne czuwanie – od razu) + `main/update/night.ts` (co minutę i przy blokadzie,
  wersja z `automaticReady`) → `install('night', 'hidden')`. Wyjście i logowanie w sesji albo zajęciach (`planBlocking`
  z `plan-blocks.json`, ten sam warunek co strażnik) – bez instalacji. Pusty plan przy starcie tylko bez folderu danych.
- Bez pomocnika (niedostępny): ścieżka FI – instalator odłączony `--updated /S` (+`--force-run` tylko przy „teraz”),
  stan `fi` z `installerPid`, okno stanu w PowerShell (WPF bez aktywacji).
- Start aplikacji (`src/main/update/startup.ts`): przed blokadą jednej kopii, bez pomocnika, czyta tylko task.json – po
  każdym czekaniu na blokadę i przed zapisem „nieudane” od nowa (`unchanged`, A5-04); licznik `starts` ≥ 4 przy wolnej
  blokadzie – „nieudane” od razu. Pliki zadania i `versions.json` tylko przez `writeSyncAtomic`.

## Pułapki
- Instalator electron-buildera w trybie cichym po 5 próbach podmiany zablokowanego pliku kończy się sukcesem – zawsze
  porównanie z manifestem. Kod 2 w 5 s nie jest próbą tylko przy istniejącym mutexie instalatora (nazwa = nsis.guid).
- Manifest powstaje w `afterSign` (rcedit i podpis zmieniają exe, elevate.exe dochodzi później).
- Szablon NSIS pokazuje „uninstallFailed” bez `/SD` – cichy instalator czekał na kliknięcie; własny `customUnInstallCheck`.
  Przy `--updated` znacznik `rd-installed` przenosi atomicRMDir razem z plikami (T407).
- Kliknięcie aktywnego okna nie podnosi go nad okno pokazane bez aktywacji – okna właściciela kładzie pod kliknięte hak
  myszy (T408). W `fs` Electrona `app.asar` to folder 0 B – rozmiary z `process.noAsar`.
- Testy: „close” Playwrighta czeka na wszystkie kopie potoków aplikacji, a odłączony właściciel je dziedziczy – czekaj na
  koniec procesu (`processEnd`). Okno właściciela klikaj kursorem: Invoke z UI Automation to BM_CLICK, a nieaktywne okno
  go ignoruje.
- Żadne okno pomocnika, strażnika ani skryptu nie pokazuje się pierwszy raz przez SW_SHOW / SW_SHOWNORMAL /
  SW_SHOWDEFAULT (Node startuje procesy ze STARTF_USESHOWWINDOW): `ShowWithoutActivation` (SW_SHOWNOACTIVATE).
- Narzędzia Claude Code na komputerze użytkownika działają poza pulpitem: kolejność okien, powłoka, OneDrive
  i powiadomienia sprawdza tylko CI na Windows.
