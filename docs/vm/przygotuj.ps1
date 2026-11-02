# przygotuj.ps1 - jednorazowe przygotowanie maszyny RD-test do odbioru (docs/odbior-vm.md, czesc 1, krok 8).
#
# Uruchom w maszynie, w zwyklym PowerShell (nie musi byc administrator):
#   irm https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/vm/przygotuj.ps1 | iex
#
# Co robi:
#   1. foldery C:\RD-raport, C:\RD-test (pusty), C:\RD-eksport, C:\RD-skrypty,
#   2. pobiera instalator 0.10.1 do Pobranych (curl.exe - plik bez znacznika "z internetu", wiec bez SmartScreen;
#      --ssl-revoke-best-effort: przy przestawionym zegarze serwer odwolan certyfikatow bywa "offline")
#      i sprawdza jego SHA-256 z wydania,
#   3. zapisuje skrypty do C:\RD-skrypty - Cowork uruchamia je dwuklikiem w Eksploratorze
#      (w PowerShell nie moze pisac); zegar przestawia sam: data w C:\RD-raport\zegar.txt + zegar.cmd,
#   4. kladzie na pulpicie ikone "Ustaw zegar" - dla Ciebie, zapasowo (gdy zegar.cmd zawiedzie).
# Mozna uruchomic ponownie - nadpisuje skrypty, niczego nie kasuje.
#
# Tylko znaki ASCII: Windows PowerShell 5.1 czyta pliki .ps1 bez BOM jako ANSI.

& {
$ErrorActionPreference = 'Stop'

$Skrypty   = 'C:\RD-skrypty'
$Wersja0   = '0.10.1'
$Sha0      = 'efb8ad0909f42b2133822c6afa02fd7ba53aced7e4ab22110fb8d5f602d54541'
$Url0      = "https://github.com/Clatir/RegulatedDay/releases/download/v$Wersja0/Regulated-Day-Setup.exe"
$Pobrane   = Join-Path $env:USERPROFILE 'Downloads'
$Stan      = @{ Bledy = 0 }

function Info([string]$m) { Write-Host ('  ' + $m) }
function Blad([string]$m) { Write-Host ('  BLAD: ' + $m) -ForegroundColor Red; $Stan.Bledy++ }

Write-Host ''
Write-Host 'Regulated Day - przygotowanie maszyny do odbioru' -ForegroundColor Cyan

# --- 1. Foldery -------------------------------------------------------------------------------
Write-Host '1. Foldery'
foreach ($f in @('C:\RD-raport', 'C:\RD-test', 'C:\RD-eksport', $Skrypty)) {
    try {
        if (-not (Test-Path $f)) { New-Item -ItemType Directory -Path $f | Out-Null; Info "utworzony $f" }
        else { Info "jest $f" }
    } catch { Blad "nie moge utworzyc $f - $($_.Exception.Message)" }
}
if ((Test-Path 'C:\RD-test') -and (Get-ChildItem 'C:\RD-test' -Force | Select-Object -First 1)) {
    Write-Host '  UWAGA: C:\RD-test nie jest pusty - przed Dniem 1 musi byc pusty (po Dniu 1 to normalne)' -ForegroundColor Yellow
}

# --- 2. Instalator 0.10.1 ---------------------------------------------------------------------
Write-Host "2. Instalator $Wersja0"
$plik0 = Join-Path $Pobrane "Regulated-Day-Setup-$Wersja0.exe"
try {
    if (-not (Test-Path $plik0)) {
        $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
        if (-not $curl) { throw 'brak curl.exe' }
        & $curl.Source -L --fail --silent --show-error --ssl-revoke-best-effort -o $plik0 $Url0
        if ($LASTEXITCODE -ne 0) { throw "curl.exe zakonczyl sie kodem $LASTEXITCODE" }
    }
    $hash = (Get-FileHash -Algorithm SHA256 -Path $plik0).Hash.ToLower()
    if ($hash -eq $Sha0) { Info "$plik0 - SHA-256 zgodny z wydaniem" }
    else { Blad "SHA-256 pliku $plik0 inny niz w wydaniu ($hash) - usun plik i uruchom skrypt jeszcze raz" }
} catch { Blad "pobieranie instalatora - $($_.Exception.Message)" }

# --- 3. Skrypty dla Cowork --------------------------------------------------------------------
Write-Host "3. Skrypty w $Skrypty"

# Wspolny poczatek kazdego skryptu: dziennik C:\RD-raport\skrypty.log i podniesienie uprawnien.
$Wspolne = @'
$ErrorActionPreference = 'Continue'
$LogPlik = 'C:\RD-raport\skrypty.log'
function Log([string]$m) {
    # skrypty.log trafia do publicznego repozytorium (docs/vm/skrypty.txt) - bez nazwy konta Windows.
    if ($env:USERPROFILE) { $m = $m.Replace($env:USERPROFILE, '%USERPROFILE%') }
    $l = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' | ' + $Nazwa + ' | ' + $m
    Write-Host $l
    try { Add-Content -Path $LogPlik -Value $l -Encoding UTF8 -ErrorAction Stop } catch { Write-Host "  (nie zapisano do $LogPlik)" }
}
function JakoAdmin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        try { Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $Ja + '"')) -ErrorAction Stop }
        catch {
            Log ('BLAD podniesienia uprawnien: ' + $_.Exception.Message)
            if ($ZegarWynik) { try { Set-Content -Path $ZegarWynik -Value ('BLAD podniesienia uprawnien: ' + $_.Exception.Message) -Encoding UTF8 } catch {} }
            Start-Sleep -Seconds 15
        }
        exit
    }
}
$host.UI.RawUI.WindowTitle = 'RD-skrypty: ' + $Nazwa
'@

function Zapisz([string]$nazwa, [string]$tresc) {
    Set-Content -Path (Join-Path $Skrypty $nazwa) -Value $tresc -Encoding ASCII
}

# Skrypt .ps1 z naglowkiem (param musi byc pierwszy), nazwa do dziennika, wspolny poczatek i cialo.
function Skrypt([string]$plik, [string]$nazwa, [string]$cialo, [string]$param = '') {
    $tresc = ''
    if ($param) { $tresc += $param + "`r`n" }
    $tresc += "`$Nazwa = '$nazwa'`r`n"
    $tresc += "`$Ja = `$MyInvocation.MyCommand.Path`r`n"
    $tresc += $Wspolne + "`r`n" + $cialo
    Zapisz $plik $tresc
}

# Plik .cmd do dwukliku: uruchamia .ps1 z tego samego folderu.
function Cmd([string]$plik, [string]$ps1, [string]$argumenty = '') {
    $tresc = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0$ps1`" $argumenty`r`n"
    Zapisz $plik $tresc
}

try {

# koniec-dnia: polecenie z czesci 3 instrukcji. Argument: numer dnia (bez - dzien dodatkowy z data).
Skrypt 'koniec-dnia.ps1' 'koniec-dnia' -param 'param([string]$N = '''')' -cialo @'
if (-not $N) { $N = 'dodatkowy-' + (Get-Date -Format 'yyyy-MM-dd') }
$cel = "C:\RD-raport\logi\dzien-$N"
New-Item -ItemType Directory -Force $cel, 'C:\RD-raport\zrzuty' | Out-Null
$logi = Join-Path $env:APPDATA 'Regulated Day\logs'
try {
    Copy-Item (Join-Path $logi '*') "$cel\" -Recurse -Force -ErrorAction Stop
    Log ("logi aplikacji -> $cel (" + @(Get-ChildItem $cel).Count + ' plikow)')
} catch { Log ("BLAD kopii logow: " + $_.Exception.Message) }
$zrz = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Screenshots'
if (Test-Path $zrz) {
    try {
        Copy-Item (Join-Path $zrz '*') 'C:\RD-raport\zrzuty\' -Force -ErrorAction Stop
        Log ('zrzuty -> C:\RD-raport\zrzuty (' + @(Get-ChildItem 'C:\RD-raport\zrzuty').Count + ' plikow)')
    } catch { Log ("BLAD kopii zrzutow: " + $_.Exception.Message) }
} else { Log "brak folderu $zrz (zadnych zrzutow)" }
if (Test-Path 'Z:\') {
    Log 'kopiuje C:\RD-raport na Z:\'
    try { Copy-Item 'C:\RD-raport\*' 'Z:\' -Recurse -Force -ErrorAction Stop; Log 'skopiowano na Z:\' }
    catch { Log ("BLAD kopii na Z: " + $_.Exception.Message) }
} else { Log 'BLAD: brak dysku Z: (folder wspoldzielony VirtualBox)' }
Start-Sleep -Seconds 20
'@
foreach ($n in 1..6) { Cmd "koniec-dnia-$n.cmd" 'koniec-dnia.ps1' "$n" }
Cmd 'koniec-dnia-dodatkowy.cmd' 'koniec-dnia.ps1'

# powercfg: E4a.5 - "powercfg /requests" jako administrator; wynik do C:\RD-raport\powercfg-*.txt.
Skrypt 'powercfg.ps1' 'powercfg' -cialo @'
JakoAdmin
$plik = 'C:\RD-raport\powercfg-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'
$wynik = (& powercfg.exe /requests 2>&1 | Out-String)
Set-Content -Path $plik -Value $wynik -Encoding UTF8
Write-Host $wynik
Log "powercfg /requests -> $plik"
Start-Sleep -Seconds 30
'@
Cmd 'powercfg.cmd' 'powercfg.ps1'

# blokada: E8i.1 - blokada.json otwarty bez wspoldzielenia; okno czeka na blokada-zdejmij.cmd (Dzien 6).
Skrypt 'blokada-zaloz.ps1' 'blokada' -cialo @'
$plik  = 'C:\RD-test\blokada.json'
$flaga = 'C:\RD-skrypty\zdejmij-blokade.flag'
Remove-Item $flaga -Force -ErrorAction SilentlyContinue
try {
    Set-Content $plik '{}' -ErrorAction Stop
    $h = [System.IO.File]::Open($plik, 'Open', 'Read', 'None')
} catch { Log ('BLAD zalozenia blokady: ' + $_.Exception.Message); Start-Sleep -Seconds 30; exit }
Log "zalozona: $plik otwarty bez wspoldzielenia"
Write-Host ''
Write-Host 'NIE ZAMYKAJ TEGO OKNA. Blokade zdejmuje blokada-zdejmij.cmd (Dzien 6).' -ForegroundColor Yellow
while (-not (Test-Path $flaga)) { Start-Sleep -Seconds 2 }
$h.Close()
Remove-Item $plik -Force -ErrorAction SilentlyContinue
Remove-Item $flaga -Force -ErrorAction SilentlyContinue
Log 'zdjeta: plik zamkniety, blokada.json usuniety'
Start-Sleep -Seconds 20
'@
Cmd 'blokada-zaloz.cmd' 'blokada-zaloz.ps1'

Skrypt 'blokada-zdejmij.ps1' 'blokada' -cialo @'
New-Item -ItemType File -Force 'C:\RD-skrypty\zdejmij-blokade.flag' | Out-Null
Log 'znak do zdjecia blokady - okno blokady zamknie plik w ciagu 2 s'
Start-Sleep -Seconds 10
'@
Cmd 'blokada-zdejmij.cmd' 'blokada-zdejmij.ps1'

# folder-ukryj / folder-przywroc: E8b.1, E8i.2, E8e.2 - nazwa C:\RD-test na chwile zmieniona.
Skrypt 'folder-ukryj.ps1' 'folder' -cialo @'
try {
    Rename-Item -Path 'C:\RD-test' -NewName 'RD-test-ukryty' -ErrorAction Stop
    Log 'C:\RD-test -> C:\RD-test-ukryty'
} catch { Log ('BLAD zmiany nazwy: ' + $_.Exception.Message) }
Start-Sleep -Seconds 15
'@
Cmd 'folder-ukryj.cmd' 'folder-ukryj.ps1'

Skrypt 'folder-przywroc.ps1' 'folder' -cialo @'
if (Test-Path 'C:\RD-test') { Log 'UWAGA: C:\RD-test juz istnieje (aplikacja zalozyla nowy?) - nie przywracam' }
else {
    try {
        Rename-Item -Path 'C:\RD-test-ukryty' -NewName 'RD-test' -ErrorAction Stop
        Log 'C:\RD-test-ukryty -> C:\RD-test'
    } catch { Log ('BLAD przywrocenia nazwy: ' + $_.Exception.Message) }
}
Start-Sleep -Seconds 15
'@
Cmd 'folder-przywroc.cmd' 'folder-przywroc.ps1'

# eksport-kopiuj: E6d.1 - pliki eksportu z C:\RD-eksport do raportu.
Skrypt 'eksport-kopiuj.ps1' 'eksport' -cialo @'
New-Item -ItemType Directory -Force 'C:\RD-raport\eksport' | Out-Null
try {
    Copy-Item 'C:\RD-eksport\*' 'C:\RD-raport\eksport\' -Force -ErrorAction Stop
    $nazwy = (Get-ChildItem 'C:\RD-raport\eksport' | ForEach-Object { $_.Name }) -join ', '
    Log "C:\RD-eksport -> C:\RD-raport\eksport: $nazwy"
} catch { Log ('BLAD kopii eksportu: ' + $_.Exception.Message) }
Start-Sleep -Seconds 15
'@
Cmd 'eksport-kopiuj.cmd' 'eksport-kopiuj.ps1'

# pelny-ekran-start / -stop: E8j.2, E8f.2 cz. 3 - Edge na pelnym ekranie (kiosk) i wyjscie z niego.
Skrypt 'pelny-ekran-start.ps1' 'pelny-ekran' -cialo @'
$edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe' }
$profil = 'C:\RD-skrypty\kiosk-profil'
Start-Process -FilePath $edge -ArgumentList @('--kiosk', 'https://www.youtube.com/', '--edge-kiosk-type=fullscreen', '--no-first-run', ('--user-data-dir=' + $profil))
Log 'start: Edge na pelnym ekranie (kiosk, YouTube)'
'@
Cmd 'pelny-ekran-start.cmd' 'pelny-ekran-start.ps1'

Skrypt 'pelny-ekran-stop.ps1' 'pelny-ekran' -cialo @'
$p = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*kiosk-profil*' })
foreach ($x in $p) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
Log ('stop: zamkniety Edge z pelnego ekranu (' + $p.Count + ' procesow)')
Start-Sleep -Seconds 10
'@
Cmd 'pelny-ekran-stop.cmd' 'pelny-ekran-stop.ps1'

# e6d3-foldery: E6d.3 - foldery do odmow i pusty folder docelowy (okno wyboru folderu nie ma dla Cowork "Nowy folder").
Skrypt 'e6d3-foldery.ps1' 'e6d3' -cialo @'
try {
    New-Item -ItemType Directory -Force 'C:\RD-test-zplikiem' -ErrorAction Stop | Out-Null
    Set-Content 'C:\RD-test-zplikiem\plik.txt' 'plik do odmowy E6d.3' -ErrorAction Stop
    New-Item -ItemType Directory -Force 'C:\RD-test\folder-wewnatrz' -ErrorAction Stop | Out-Null
    if (-not (Test-Path 'C:\RD-test-2')) { New-Item -ItemType Directory 'C:\RD-test-2' -ErrorAction Stop | Out-Null }
    if (Get-ChildItem 'C:\RD-test-2' -Force | Select-Object -First 1) { Log 'UWAGA: C:\RD-test-2 nie jest pusty' }
    Log 'gotowe: C:\RD-test-zplikiem (z plikiem), C:\RD-test\folder-wewnatrz, C:\RD-test-2 (pusty)'
} catch { Log ('BLAD: ' + $_.Exception.Message) }
Start-Sleep -Seconds 15
'@
Cmd 'e6d3-foldery.cmd' 'e6d3-foldery.ps1'

# pobierz-najnowszy: E4a.13 cz. 1 - instalator najnowszego wydania do recznego uruchomienia.
Skrypt 'pobierz-najnowszy.ps1' 'pobierz' -cialo @'
$plik = Join-Path $env:USERPROFILE 'Downloads\Regulated-Day-Setup-najnowszy.exe'
& curl.exe -L --fail --silent --show-error --ssl-revoke-best-effort -o $plik 'https://github.com/Clatir/RegulatedDay/releases/latest/download/Regulated-Day-Setup.exe'
if ($LASTEXITCODE -eq 0) { Log ("pobrano $plik (" + (Get-Item $plik).Length + ' B)') }
else { Log "BLAD: curl.exe zakonczyl sie kodem $LASTEXITCODE" }
Start-Sleep -Seconds 15
'@
Cmd 'pobierz-najnowszy.cmd' 'pobierz-najnowszy.ps1'

# main-log: otwiera main.log w Notatniku (to samo co Ustawienia -> "Otworz logi" -> main.log).
Zapisz 'main-log.cmd' "@echo off`r`nstart `"`" notepad.exe `"%APPDATA%\Regulated Day\logs\main.log`"`r`n"

# Wspolne dla zegar.ps1 i ustaw-zegar.ps1: wynik w C:\RD-raport\zegar-wynik.txt i zmiana zegara z jej granicami
# (tylko do przodu, najwyzej 10 dni, sprawdzenie po zmianie).
$Zegar = @'
$ZegarWynik = 'C:\RD-raport\zegar-wynik.txt'
$ZegarProcesy = @('Regulated Day', 'rd-install')
function Wynik([string]$m) {
    Log $m
    try { Set-Content -Path $ZegarWynik -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' | ' + $m) -Encoding UTF8 -ErrorAction Stop }
    catch { Log ('BLAD zapisu ' + $ZegarWynik + ': ' + $_.Exception.Message) }
}
function Koniec([string]$m) { Wynik $m; Start-Sleep -Seconds 10; exit }
function CzytajDate([string]$t) {
    $d = [datetime]::MinValue
    $formaty = [string[]]@('yyyy-MM-dd HH:mm', 'yyyy-MM-dd H:mm')
    if ([datetime]::TryParseExact($t, $formaty, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$d)) { return $d }
    return $null
}
function SprawdzCzasAutomatyczny {
    try {
        $typ = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters' -Name Type -ErrorAction Stop).Type
        if ($typ -ne 'NoSync') { Log ('UWAGA: "Ustaw czas automatycznie" wyglada na wlaczone (Type=' + $typ + ') - zegar moze wrocic') }
    } catch {}
}
function CzekajNaZamkniecie([int]$sek) {
    $t0 = Get-Date
    while ((Get-Process -Name $ZegarProcesy -ErrorAction SilentlyContinue) -and (((Get-Date) - $t0).TotalSeconds -lt $sek)) { Start-Sleep -Seconds 2 }
    return (-not (Get-Process -Name $ZegarProcesy -ErrorAction SilentlyContinue))
}
# Opis bledu albo $null; po udanej zmianie "OK zegar: ... -> ..." w wyniku i w skrypty.log.
function ZmienZegar([datetime]$d) {
    $przed = Get-Date
    $teraz = $przed.ToString('yyyy-MM-dd HH:mm')
    if ($d -le $przed) { return ('odmowa - zegar tylko do przodu (teraz ' + $teraz + ')') }
    if ($d -gt $przed.AddDays(10)) { return ('odmowa - wiecej niz 10 dni do przodu (teraz ' + $teraz + ')') }
    try { Set-Date -Date $d -ErrorAction Stop | Out-Null } catch { return ('Set-Date - ' + $_.Exception.Message) }
    $po = Get-Date
    if ([math]::Abs(($po - $d).TotalMinutes) -gt 2) {
        return ('po zmianie zegar pokazuje ' + $po.ToString('yyyy-MM-dd HH:mm') + ' zamiast ' + $d.ToString('yyyy-MM-dd HH:mm'))
    }
    Wynik ('OK zegar: ' + $teraz + ' -> ' + $po.ToString('yyyy-MM-dd HH:mm'))
    return $null
}
'@

# zegar: Cowork przestawia zegar sam, bez pisania w PowerShell. Zapisuje w C:\RD-raport\zegar.txt
# pierwsza linie "RRRR-MM-DD GG:MM" (druga przy-aplikacji, gdy Regulated Day ma zostac wlaczony)
# i uruchamia zegar.cmd dwuklikiem. Wynik w zegar-wynik.txt: "W TOKU", potem "OK zegar: ... -> ..." albo "BLAD: ...".
# zegar.txt znika dopiero po udanej zmianie (po bledzie mozna od razu uruchomic jeszcze raz).
Skrypt 'zegar.ps1' 'zegar' -cialo ($Zegar + @'
$plik = 'C:\RD-raport\zegar.txt'
try { Set-Content -Path $ZegarWynik -Value 'W TOKU' -Encoding UTF8 -ErrorAction Stop } catch {}
JakoAdmin
$jeden = New-Object System.Threading.Mutex($false, 'Global\RD-zegar')
$mam = $false
try { $mam = $jeden.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $mam = $true }
if (-not $mam) { Log 'inny zegar.cmd jeszcze dziala - to uruchomienie konczy sie bez zmian'; Start-Sleep -Seconds 5; exit }
try { Set-Content -Path $ZegarWynik -Value 'W TOKU' -Encoding UTF8 -ErrorAction Stop } catch {}
SprawdzCzasAutomatyczny
if (-not (Test-Path $plik)) { Koniec 'BLAD: brak C:\RD-raport\zegar.txt (pierwsza linia: RRRR-MM-DD GG:MM)' }
# Cudzyslowy (takze polskie) i polpauza zamiast lacznika - tak, jak ktos mogl przepisac je z instrukcji.
$znaki = [char[]]@([char]0x22, [char]0x27, [char]0x60, [char]0x201C, [char]0x201D, [char]0x201E)
$linie = @(Get-Content -Path $plik -Encoding UTF8 | ForEach-Object { $_.Replace([string][char]0x2013, '-').Trim().Trim($znaki).Trim() } | Where-Object { $_ })
if ($linie.Count -eq 0) { Koniec 'BLAD: zegar.txt jest pusty' }
$d = CzytajDate $linie[0]
if (-not $d) { Koniec ('BLAD: zly format "' + $linie[0] + '" - ma byc RRRR-MM-DD GG:MM') }
if (Get-Process -Name $ZegarProcesy -ErrorAction SilentlyContinue) {
    if ($linie -contains 'przy-aplikacji') { Log 'UWAGA: zegar zmieniany przy dzialajacym procesie Regulated Day (przy-aplikacji)' }
    else {
        Log 'Regulated Day dziala - czekam do 2 min na zamkniecie'
        if (-not (CzekajNaZamkniecie 120)) { Koniec 'BLAD: Regulated Day dziala - zegar bez zmian (druga linia przy-aplikacji pozwala zmienic mimo to)' }
    }
}
$blad = ZmienZegar $d
if ($blad) { Koniec ('BLAD: ' + $blad) }
Remove-Item $plik -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 10
'@)
Cmd 'zegar.cmd' 'zegar.ps1'

# ustaw-zegar: dla Ciebie, zapasowo (ikona na pulpicie), te same granice co zegar.cmd. Czeka na zamkniecie aplikacji.
Skrypt 'ustaw-zegar.ps1' 'zegar-uzytkownik' -cialo ($Zegar + @'
JakoAdmin
Write-Host ''
Write-Host ('Teraz: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm, dddd'))
SprawdzCzasAutomatyczny
if (Get-Process -Name $ZegarProcesy -ErrorAction SilentlyContinue) {
    Write-Host 'Regulated Day dziala. Zamknij go: ikona w zasobniku (^) -> prawy przycisk -> Zakoncz. Czekam do 2 min...' -ForegroundColor Yellow
    if (-not (CzekajNaZamkniecie 120)) {
        $odp = Read-Host 'Regulated Day nadal dziala. Zmienic zegar mimo to? (t/n)'
        if ($odp -ne 't') { Log 'anulowano: Regulated Day dziala'; Start-Sleep -Seconds 5; exit }
        Log 'UWAGA: zegar zmieniany przy dzialajacym procesie Regulated Day'
    }
}
while ($true) {
    $txt = Read-Host 'Nowa data i godzina, np. 2026-11-06 07:30 (sam Enter = anuluj)'
    if (-not $txt) { Log 'anulowano'; exit }
    $d = CzytajDate $txt.Trim()
    if (-not $d) { Write-Host 'Zly format - wpisz RRRR-MM-DD GG:MM.' -ForegroundColor Red; continue }
    $blad = ZmienZegar $d
    if (-not $blad) { break }
    Write-Host ('Odmowa: ' + $blad) -ForegroundColor Red
}
Write-Host ''
Write-Host 'Gotowe. Zatwierdz zgody Cowork, jesli wygasly, i kliknij "Gotowe" w jego pytaniu.' -ForegroundColor Green
Start-Sleep -Seconds 10
'@)
Cmd 'ustaw-zegar.cmd' 'ustaw-zegar.ps1'

# Spis dla Cowork.
Zapisz 'CZYTAJ.txt' @'
C:\RD-skrypty - skrypty do odbioru w maszynie (docs/odbior-vm.md). Cowork uruchamia je dwuklikiem w Eksploratorze.
Kazdy dopisuje wynik do C:\RD-raport\skrypty.log (data | skrypt | wynik).

koniec-dnia-N.cmd           koniec dnia N (czesc 3): logi, zrzuty, kopia na Z:  (dni dodatkowe: koniec-dnia-dodatkowy.cmd)
powercfg.cmd                E4a.5: powercfg /requests jako administrator -> C:\RD-raport\powercfg-*.txt
blokada-zaloz.cmd           E8i.1 cz. 1 (Dzien 5, 11:55): blokada.json zablokowany; okno zostaje otwarte do Dnia 6
blokada-zdejmij.cmd         E8i.1 cz. 2 (Dzien 6): zdejmuje blokade i usuwa blokada.json
folder-ukryj.cmd            E8b.1, E8i.2, E8e.2: C:\RD-test -> C:\RD-test-ukryty
folder-przywroc.cmd         ... i z powrotem
eksport-kopiuj.cmd          E6d.1: C:\RD-eksport -> C:\RD-raport\eksport
pelny-ekran-start.cmd       E8j.2, E8f.2 cz. 3: Edge na pelnym ekranie (YouTube)
pelny-ekran-stop.cmd        ... wyjscie z pelnego ekranu
e6d3-foldery.cmd            E6d.3: C:\RD-test-zplikiem, C:\RD-test\folder-wewnatrz (odmowy), C:\RD-test-2 (pusty)
pobierz-najnowszy.cmd       E4a.13 cz. 1: najnowszy instalator do Pobranych
main-log.cmd                main.log w Notatniku
zegar.cmd                   zegar do przodu: najpierw C:\RD-raport\zegar.txt (linia 1: RRRR-MM-DD GG:MM,
                            linia 2 przy-aplikacji, gdy aplikacja dziala); wynik w C:\RD-raport\zegar-wynik.txt
ustaw-zegar.cmd             TYLKO UZYTKOWNIK (ikona "Ustaw zegar" na pulpicie): zapasowo, gdy zegar.cmd zawiedzie
'@

    Info ('zapisane: ' + ((Get-ChildItem $Skrypty | ForEach-Object { $_.Name }) -join ', '))
} catch { Blad "zapis skryptow - $($_.Exception.Message)" }

# --- 4. Ikona "Ustaw zegar" na pulpicie --------------------------------------------------------
Write-Host '4. Ikona "Ustaw zegar" na pulpicie'
try {
    $ws  = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Ustaw zegar.lnk'))
    $lnk.TargetPath       = Join-Path $Skrypty 'ustaw-zegar.cmd'
    $lnk.WorkingDirectory = $Skrypty
    $lnk.Description      = 'Regulated Day - odbior: zegar do przodu (uzytkownik, zapasowo)'
    $lnk.Save()
    Info 'gotowa'
} catch { Blad "ikona na pulpicie - $($_.Exception.Message)" }

# --- 5. Sprawdzenia bez zmian w Windows --------------------------------------------------------
Write-Host '5. Sprawdzenia'
if (Test-Path 'Z:\') { Info 'dysk Z: jest (folder wspoldzielony)' } else { Blad 'brak dysku Z: - sprawdz folder wspoldzielony RD-raport (czesc 1, krok 5)' }
try {
    $typ = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters' -Name Type -ErrorAction Stop).Type
    if ($typ -eq 'NoSync') { Info 'czas automatyczny wylaczony' } else { Blad "czas automatyczny wyglada na wlaczony (Type=$typ) - czesc 1, krok 3" }
} catch { Info 'nie odczytalem ustawienia czasu automatycznego' }

Write-Host ''
if ($Stan.Bledy -eq 0) { Write-Host 'GOTOWE - teraz migawka "czysta" (czesc 1, krok 9).' -ForegroundColor Green }
else { Write-Host ('Koniec z bledami: ' + $Stan.Bledy + ' - popraw i uruchom skrypt jeszcze raz.') -ForegroundColor Red }
}
