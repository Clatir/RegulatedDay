# procesy.ps1 - E4a.13 cz. 1: ktore procesy Regulated Day teraz dzialaja (odbior w maszynie, docs/odbior-vm.md).
#
# Te same dane, ktore instalator dopisuje do %APPDATA%\Regulated Day\logs\installer-check.log, gdy aplikacji nie da sie
# zamknac: nazwa, PID, rodzic (z nazwa), czas startu (UTC) i wiersz polecenia kazdego procesu spod folderu instalacji,
# a do tego procesy "Regulated Day*", "rd-*" i instalatora spoza niego (straznik i pomocnik instalacji z update\<X>).
#
# Uruchom w maszynie, w zwyklym PowerShell (nie musi byc administrator):
#   irm https://raw.githubusercontent.com/Clatir/RegulatedDay/main/docs/vm/procesy.ps1 | iex
# albo: powershell.exe -NoProfile -ExecutionPolicy Bypass -File procesy.ps1 [folder instalacji] [plik wyniku]
# Wynik: na ekranie, w C:\RD-raport\procesy-RRRRMMDD-GGMMSS.txt (gdy jest C:\RD-raport) i wiersz w skrypty.log.
# Sciezka profilu jest zapisana jako %USERPROFILE% (raport trafia do publicznego repozytorium).
#
# Tylko znaki ASCII: Windows PowerShell 5.1 czyta pliki .ps1 bez BOM jako ANSI.

& {
$ErrorActionPreference = 'Stop'
$Folder = ''
$Wynik = ''
if ($args.Count -gt 0) { $Folder = [string]$args[0] }
if ($args.Count -gt 1) { $Wynik = [string]$args[1] }

# Folder instalacji: podany, z rejestru instalatora (nsis.guid) albo domyslny.
$Skad = 'podany'
if (-not $Folder) {
    $Skad = 'z rejestru'
    $k = Get-ItemProperty 'HKCU:\Software\E2A45BEE-EF15-48BC-9498-F12E5B866145' -ErrorAction SilentlyContinue
    if ($k -and $k.InstallLocation) { $Folder = [string]$k.InstallLocation }
    else { $Skad = 'domyslny'; $Folder = Join-Path $env:LOCALAPPDATA 'Programs\regulated-day' }
}
$d = $Folder.TrimEnd('\') + '\'

$c = [Globalization.CultureInfo]::InvariantCulture
$f = 'yyyy-MM-ddTHH:mm:ss.fffZ'
$all = @(Get-CimInstance Win32_Process)
$by = @{}
foreach ($p in $all) { $by[[int]$p.ProcessId] = $p }

# Jeden wiersz w formacie installer-check.log.
function Linia($p) {
    $t = ''
    if ($p.CreationDate) { $t = $p.CreationDate.ToUniversalTime().ToString($f, $c) }
    $r = [string]$p.ParentProcessId
    $q = $by[[int]$p.ParentProcessId]
    # Rodzic z nazwa tylko, gdy jest starszy od procesu (PID mogl przejsc na inny proces).
    if ($q -and $q.CreationDate -le $p.CreationDate) { $r += ' ' + $q.Name }
    return '  ' + $p.Name + ' | pid ' + $p.ProcessId + ' | rodzic ' + $r + ' | start ' + $t + ' | ' + $p.CommandLine
}

$pod = @($all | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) })
$pidy = @{}
foreach ($p in $pod) { $pidy[[int]$p.ProcessId] = $true }
# Kopia deinstalatora NSIS w %TEMP% to Un_A.exe (starsze NSIS: Au_.exe).
$nazwy = @('Regulated Day*', 'rd-*', 'Regulated-Day-Setup*', 'Uninstall Regulated Day*', 'Un_A.exe', 'Au_.exe')
$inne = @($all | Where-Object {
    $n = $_.Name
    (-not $pidy.ContainsKey([int]$_.ProcessId)) -and (@($nazwy | Where-Object { $n -like $_ }).Count -gt 0)
})

$l = @()
$l += [DateTime]::UtcNow.ToString($f, $c) + ' procesy.ps1: folder instalacji ' + $d + ' (' + $Skad + ')'
$l += 'procesy spod folderu instalacji (' + $pod.Count + '):'
foreach ($p in $pod) { $l += Linia $p }
$l += 'procesy Regulated Day, rd-* i instalatora poza nim (' + $inne.Count + '):'
foreach ($p in $inne) { $l += Linia $p }
# Bez nazwy konta (jak installer-check.log): profil - takze w formie 8.3, dowolna wielkosc liter - jako %USERPROFILE%,
# folder o nazwie konta (albo profilu) jako %USERNAME%.
$profil = @($env:USERPROFILE)
try { $profil += (New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:USERPROFILE).ShortPath } catch { }
$profil = @($profil | Where-Object { $_ })
$konto = @(@($env:USERNAME) + @($profil | ForEach-Object { Split-Path $_ -Leaf }) | Where-Object { $_ })
function BezKonta([string]$s) {
    foreach ($v in $profil) { $s = [regex]::Replace($s, [regex]::Escape($v), '%USERPROFILE%', 'IgnoreCase') }
    foreach ($v in $konto) { $s = [regex]::Replace($s, '(?<=[\\/])' + [regex]::Escape($v) + '(?=[\\/\x22 ]|$)', '%USERNAME%', 'IgnoreCase, Multiline') }
    return $s
}
$tekst = BezKonta (($l -join [char]10) + [char]10)
Write-Host $tekst

if (-not $Wynik -and (Test-Path 'C:\RD-raport')) { $Wynik = 'C:\RD-raport\procesy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt' }
if ($Wynik) {
    [IO.File]::WriteAllText($Wynik, $tekst, (New-Object Text.UTF8Encoding $false))
    Write-Host ('zapisane: ' + (BezKonta $Wynik))
    if (Test-Path 'C:\RD-raport') {
        $wpis = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' | procesy | ' + $pod.Count + ' spod folderu instalacji, ' + $inne.Count + ' poza nim -> ' + (BezKonta $Wynik)
        try { Add-Content -Path 'C:\RD-raport\skrypty.log' -Value $wpis -Encoding UTF8 -ErrorAction Stop } catch { Write-Host '  (nie zapisano do C:\RD-raport\skrypty.log)' }
    }
}
} @args
