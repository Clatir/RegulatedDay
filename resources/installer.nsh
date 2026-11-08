; The installer's own steps (spec „Instalacja, aktualizacje i log”), included by electron-builder (nsis.include).
; One click, only for this user, without choosing a folder (oneClick, perMachine: false, a fixed nsis.guid) – it never asks
; „for me or for everyone” or for administrator rights. All times are milliseconds UTC from GetSystemTimeAsFileTime,
; counted in 64 bits – never the local time.

!include "LogicLib.nsh"
; electron-builder declares these only without customCheckAppRunning – this file brings its own.
!include "getProcessInfo.nsh"
Var pid
; PowerShell for the steps of the close: "?" not known yet, "1" = a step of ours answered with its own code, "0" = it did
; not (every step by tasklist and taskkill then). electron-builder's IS_POWERSHELL_AVAILABLE is not asked: on CI (the
; installer started from a process of pwsh 7) it said „none” while PowerShell worked.
Var rdPs
; PSModulePath of the installer, given back after each PowerShell step (which runs with Windows PowerShell's own paths).
Var rdModules

!define RD_APPDATA "$APPDATA\Regulated Day"
!define RD_GUARD_EXE "rd-guard.exe"
!define RD_GUARD_RUN "Regulated Day Guard"
!define RD_PROTOCOL "regulatedday"

; $0 = now in ms UTC (64-bit arithmetic of the System plug-in).
!macro rdNowMs
  System::Call 'kernel32::GetSystemTimeAsFileTime(*l .r0)'
  System::Int64Op $0 - 116444736000000000
  Pop $0
  System::Int64Op $0 / 10000
  Pop $0
!macroend

; „zamknięte przez instalator”: written only when the app is found running, right before it is closed; the app counts it
; only when its time falls in the last window of its life marker (spec „Terminy”).
!macro rdWriteClosedMarker
  Push $0
  Push $1
  CreateDirectory "${RD_APPDATA}"
  !insertmacro rdNowMs
  FileOpen $1 "${RD_APPDATA}\closed-by-installer.json" w
  ${if} $1 != ""
    FileWrite $1 '{"format":1,"at":$0,"version":"${VERSION}"}$\n'
    FileClose $1
  ${endIf}
  Pop $1
  Pop $0
!macroend

!macro customInit
  ; CI: an installer slowed down (RD_TEST_INSTALLER_SLEEP_MS) must still install to the end.
  ReadEnvStr $0 RD_TEST_INSTALLER_SLEEP_MS
  ${if} $0 != ""
    Sleep $0
  ${endIf}
!macroend

; How long the app has to end by its own way out once it is asked to (E4a.13); the kill comes only after it. Longer than
; that way out (QUIT_BUDGET_MS in src/main/installerClose.ts: a slow data folder, the helper, the record of
; closing); the close ends as soon as the processes do.
!define RD_CLOSE_WAIT_MS 15000
; Only other processes of the installation (a helper, crashpad – the app itself gone, as after its exit before a silent
; update): nobody is asked to end, a moment for them to go by themselves before the kill.
!define RD_LEFT_WAIT_MS 2000

; The PowerShell of the search, the close, the kill and the list (tests/unit/installer-close.test.ts runs it). Its text has
; only single quotes and no backticks – it goes into a backtick string and a command line – and every $ is $$ (one $ for
; NSIS). The values come from the environment (rdSetupEnv), never pasted into the text: an apostrophe in a folder cannot
; break it. $$u: every process under the installation (the folder with its backslash) but this installer – an uninstaller
; run in place (_?=) is under it too.
!define RD_PS_UNDER "$$d = $$env:RD_SETUP_INSTDIR.TrimEnd('\') + '\'; \
  $$all = @(Get-CimInstance Win32_Process -ErrorAction Stop); \
  $$u = @($$all | Where-Object { $$_.ProcessId -ne [int]$$env:RD_SETUP_SELF -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase) });"
; Find: exit 0 = the app's main process (no --type=) is there, 3 = only other processes (a helper, crashpad), 1 = none,
; 2 = the search failed (never „none”). electron-builder's FIND_PROCESS misses a single process – a lone CimInstance has
; no .Count in Windows PowerShell 5.1 – so the last one left read as „closed” and was never killed nor listed; @(…)
; counts it.
!define RD_PS_FIND "try { ${RD_PS_UNDER} \
  $$m = @($$u | Where-Object { $$_.ExecutablePath -ieq ($$d + $$env:RD_SETUP_EXE) -and $$_.CommandLine -notlike '* --type=*' }); \
  if ($$m.Count -gt 0) { exit 0 } elseif ($$u.Count -gt 0) { exit 3 } else { exit 1 } \
} catch { exit 2 }"
; Close: taskkill without /F – a WM_CLOSE to a window of the app's main process (not its --type= children, which end with
; it); its hidden windows end the app by its own way out (T396: the data folder, the helper, „aplikacja zamknięta”).
; taskkill sends one WM_CLOSE to one window only – the topmost: a shown main window hides to the tray then (your close of
; it), an old version's window of sound just goes – so the app is asked again every 3 s while it runs (its name checked:
; never another process that took its PID). Up to RD_SETUP_WAIT_MS for every process; exit 0 = none is left, 1 = some
; is, 2 = the step failed.
!define RD_PS_CLOSE "try { ${RD_PS_UNDER} \
  $$w = [Diagnostics.Stopwatch]::StartNew(); $$e = $$d + $$env:RD_SETUP_EXE; $$t = [int]$$env:RD_SETUP_WAIT_MS; \
  $$k = [IO.Path]::GetFileNameWithoutExtension($$env:RD_SETUP_EXE); \
  $$m = @($$u | Where-Object { $$_.ExecutablePath -ieq $$e -and $$_.CommandLine -notlike '* --type=*' } | ForEach-Object { Get-Process -Id $$_.ProcessId -ErrorAction SilentlyContinue }); \
  $$ask = { foreach ($$x in $$m) { if ($$x -and -not $$x.HasExited -and $$x.ProcessName -ieq $$k) { & ($$env:SystemRoot + '\System32\taskkill.exe') /PID $$x.Id | Out-Null } } }; \
  & $$ask; \
  foreach ($$p in $$u) { \
    $$h = Get-Process -Id $$p.ProcessId -ErrorAction SilentlyContinue; \
    while ($$h -and -not $$h.HasExited) { \
      $$l = $$t - $$w.ElapsedMilliseconds; if ($$l -lt 1) { exit 1 }; \
      if ($$h.WaitForExit([int][Math]::Min($$l, 3000))) { break }; \
      & $$ask \
    } \
  }; \
  exit 0 \
} catch { exit 2 }"
; Kill: what is left after the close, as electron-builder's KILL_PROCESS … 1 (Stop-Process -Force), never this installer.
!define RD_PS_KILL "try { ${RD_PS_UNDER} foreach ($$p in $$u) { Stop-Process -Id $$p.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0 } catch { exit 1 }"
; List: every process left – name, PID, parent (with its name when it is older than the child), start and command line –
; appended to RD_SETUP_LOG (UTF-8 without BOM). Without the account (D279: the list may go to the public repository): the
; profile – also its 8.3 form, in any case – as %USERPROFILE%, a folder named as the account (or its profile) as %USERNAME%.
!define RD_PS_LIST "try { ${RD_PS_UNDER} \
  $$c = [Globalization.CultureInfo]::InvariantCulture; $$f = 'yyyy-MM-ddTHH:mm:ss.fffZ'; \
  $$by = @{}; foreach ($$p in $$all) { $$by[[int]$$p.ProcessId] = $$p }; \
  $$s = [DateTime]::UtcNow.ToString($$f, $$c) + ' WARN instalator ' + $$env:RD_SETUP_VERSION + ': procesy spod ' + $$d + ', które nie dały się zamknąć:' + [char]10; \
  foreach ($$p in $$u) { \
    $$t = ''; if ($$p.CreationDate) { $$t = $$p.CreationDate.ToUniversalTime().ToString($$f, $$c) }; \
    $$r = [string]$$p.ParentProcessId; $$q = $$by[[int]$$p.ParentProcessId]; if ($$q -and $$q.CreationDate -le $$p.CreationDate) { $$r += ' ' + $$q.Name }; \
    $$s += '  ' + $$p.Name + ' | pid ' + $$p.ProcessId + ' | rodzic ' + $$r + ' | start ' + $$t + ' | ' + $$p.CommandLine + [char]10 \
  }; \
  $$h = @($$env:USERPROFILE); try { $$h += (New-Object -ComObject Scripting.FileSystemObject).GetFolder($$env:USERPROFILE).ShortPath } catch { }; \
  foreach ($$v in @($$h | Where-Object { $$_ })) { $$s = [regex]::Replace($$s, [regex]::Escape($$v), '%USERPROFILE%', 'IgnoreCase') }; \
  $$n = @($$env:USERNAME) + @($$h | Where-Object { $$_ } | ForEach-Object { Split-Path $$_ -Leaf }); \
  foreach ($$v in @($$n | Where-Object { $$_ })) { $$s = [regex]::Replace($$s, '(?<=[\\/])' + [regex]::Escape($$v) + '(?=[\\/\x22 ]|$$)', '%USERNAME%', 'IgnoreCase, Multiline') }; \
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($$env:RD_SETUP_LOG)); \
  [IO.File]::AppendAllText($$env:RD_SETUP_LOG, $$s, (New-Object Text.UTF8Encoding $$false)); \
  exit 0 \
} catch { exit 1 }"

!macro rdSetupEnv
  ; Windows PowerShell with its own module paths (as started from Explorer), never those of a PowerShell 7 it came from.
  ReadEnvStr $rdModules PSModulePath
  System::Call 'kernel32::SetEnvironmentVariable(t "PSModulePath", p 0)'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_INSTDIR", t "$INSTDIR")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_SELF", t "$pid")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_EXE", t "${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_LOG", t "${RD_APPDATA}\logs\installer-check.log")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_VERSION", t "${VERSION}")'
!macroend

; The app the installer starts at its end never inherits them.
!macro rdClearEnv
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_INSTDIR", p 0)'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_SELF", p 0)'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_EXE", p 0)'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_WAIT_MS", p 0)'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_LOG", p 0)'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_VERSION", p 0)'
  ${if} $rdModules != ""
    System::Call 'kernel32::SetEnvironmentVariable(t "PSModulePath", t "$rdModules")'
  ${endIf}
!macroend

; _RETURN (in place of electron-builder's FIND_PROCESS, see RD_PS_FIND): "0" = the app's main process runs, "3" = only
; other processes of the installation, "1" = none (compared as exact text, S==; LogicLib's == is StrCmp without case,
; = is IntCmp). Every PowerShell step ends within 60 s ("timeout" otherwise). An unsure answer – 2 = the search failed,
; "timeout", "error"; before, every result but 0 read as „none” – is asked of tasklist (the app's name, as FIND_PROCESS
; without PowerShell); unsure again, or found there, counts as the main process running – never files copied under a
; running app. The first unsure answer turns PowerShell off for the rest ($rdPs "0"); a sure one turns it on ("1").
!macro rdFindProcess _RETURN
  StrCpy ${_RETURN} 2
  ${if} $rdPs S!= "0"
    !insertmacro rdSetupEnv
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_FIND}"`
    Pop ${_RETURN}
    !insertmacro rdClearEnv
  ${endIf}
  ${if} ${_RETURN} S!= "0"
  ${andIf} ${_RETURN} S!= "1"
  ${andIf} ${_RETURN} S!= "3"
    ${if} $rdPs S== "?"
      StrCpy $rdPs 0
    ${endIf}
    nsExec::Exec /TIMEOUT=60000 `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop ${_RETURN}
    ${if} ${_RETURN} S!= "1"
      StrCpy ${_RETURN} 0
    ${endIf}
  ${else}
    StrCpy $rdPs 1
  ${endIf}
!macroend

; The app is asked to end and given _WAIT ms (electron-builder's KILL_PROCESS … 0 is Stop-Process – TerminateProcess –
; whenever PowerShell is there: no close of the app's own). Gone sooner, nothing waits longer. _RETURN: "0" = every
; process of the installation ended (nothing to search for again), anything else = some may be left.
!macro rdCloseApp _WAIT _RETURN
  ${if} $rdPs S== "1"
    !insertmacro rdSetupEnv
    System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_WAIT_MS", t "${_WAIT}")'
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_CLOSE}"`
    Pop ${_RETURN}
    !insertmacro rdClearEnv
  ${else}
    ; Without PowerShell: the app's name (its children get the same – those without a window refuse), asked again every
    ; 3 s like RD_PS_CLOSE.
    Push $R2
    Push $R4
    nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
    Pop ${_RETURN}
    StrCpy $R2 0
    ${do}
      !insertmacro rdFindProcess ${_RETURN}
      ${if} ${_RETURN} S== "1"
      ${orIf} $R2 >= ${_WAIT}
        ${exitDo}
      ${endIf}
      Sleep 250
      IntOp $R2 $R2 + 250
      IntOp $R4 $R2 % 3000
      ${if} $R4 = 0
        nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
        Pop $R4
      ${endIf}
    ${loop}
    ${if} ${_RETURN} S== "1"
      StrCpy ${_RETURN} 0
    ${else}
      StrCpy ${_RETURN} 1
    ${endIf}
    Pop $R4
    Pop $R2
  ${endIf}
!macroend

; The kill of what is left (RD_PS_KILL); without PowerShell taskkill /F by the app's name, never this installer.
!macro rdKillProcess
  Push $0
  ${if} $rdPs S== "1"
    !insertmacro rdSetupEnv
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_KILL}"`
    Pop $0
    !insertmacro rdClearEnv
  ${else}
    nsExec::Exec /TIMEOUT=60000 `"$CmdPath" /C taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
    Pop $0
  ${endIf}
  Pop $0
!macroend

; Before „appCannotBeClosed”: which process is left, into logs\installer-check.log (docs/vm/procesy.ps1 lists the same).
!macro rdListProcesses
  Push $0
  Push $1
  ${if} $rdPs S== "1"
    !insertmacro rdSetupEnv
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_LIST}"`
    Pop $0
    !insertmacro rdClearEnv
  ${else}
    ; Without PowerShell only tasklist: the app's name and PIDs (no parent, no command line).
    CreateDirectory "${RD_APPDATA}\logs"
    !insertmacro rdNowMs
    FileOpen $1 "${RD_APPDATA}\logs\installer-check.log" a
    ${if} $1 != ""
      FileSeek $1 0 END
      FileWrite $1 "$0 ms UTC WARN instalator ${VERSION}: procesy ${APP_EXECUTABLE_FILENAME}, ktore nie daly sie zamknac (tasklist):$\n"
      FileClose $1
    ${endIf}
    nsExec::Exec /TIMEOUT=60000 `"$CmdPath" /C tasklist /FO CSV /NH /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" >> "${RD_APPDATA}\logs\installer-check.log"`
    Pop $0
  ${endIf}
  Pop $1
  Pop $0
!macroend

!macro customCheckAppRunning
  StrCpy $rdPs "?"
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      Sleep 300
    ${endIf}
    !insertmacro rdFindProcess $R0
    ${if} $R0 S!= "1"
      ${ifNot} ${isUpdated}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK rdStopApp
        Quit
      ${endIf}
      rdStopApp:
      ; „Zamknięte przez instalator” and the app's whole way out only for the app itself: a lone helper or crashpad (left
      ; by a crash, or still going after the app's exit before a silent update) stays a crash and gets a moment only.
      ${if} $R0 S== "0"
        !insertmacro rdWriteClosedMarker
        StrCpy $R3 ${RD_CLOSE_WAIT_MS}
      ${else}
        StrCpy $R3 ${RD_LEFT_WAIT_MS}
      ${endIf}
      DetailPrint "$(appClosing)"
      ; First asked, as „Zakończ” would end it; killed only what is left after $R3 ms (E4a.13).
      !insertmacro rdCloseApp $R3 $R0
      ${if} $R0 S== "0"
        Goto rdNotRunning
      ${endIf}
      StrCpy $R1 0
      rdWaitLoop:
        IntOp $R1 $R1 + 1
        !insertmacro rdFindProcess $R0
        ${if} $R0 S!= "1"
          !insertmacro rdKillProcess
          !insertmacro rdFindProcess $R0
          ${if} $R0 S!= "1"
            Sleep 2000
          ${else}
            Goto rdNotRunning
          ${endIf}
        ${else}
          Goto rdNotRunning
        ${endIf}
        ${if} $R1 > 1
          !insertmacro rdListProcesses
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY rdWaitLoop
          Quit
        ${else}
          Goto rdWaitLoop
        ${endIf}
      rdNotRunning:
    ${endIf}
  ${endIf}
!macroend

; The result of the old version's uninstall, as electron-builder's own check – except its message box has a default for
; the silent mode: without /SD a silent installer showed it and waited for a click (a file locked before the uninstall
; hung the installer until the owner's 10 min). The code 2 stays: the owner counts it as an attempt.
!macro customUnInstallCheck
  IfErrors 0 +3
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDOK
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endIf}
!macroend

!macro customInstall
  ; The installation's marker: only the installed exe is the production identity (T384).
  FileOpen $0 "$INSTDIR\resources\rd-installed" w
  ${if} $0 != ""
    FileWrite $0 "${VERSION}$\n"
    FileClose $0
  ${endIf}
  ; The app's address: a notification's click opens the icon's panel, also after a restart (spec „Powiadomienia”).
  WriteRegStr HKCU "Software\Classes\${RD_PROTOCOL}" "" "URL:Regulated Day"
  WriteRegStr HKCU "Software\Classes\${RD_PROTOCOL}" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\${RD_PROTOCOL}\DefaultIcon" "" '"$appExe",0'
  WriteRegStr HKCU "Software\Classes\${RD_PROTOCOL}\shell\open\command" "" '"$appExe" "%1"'
!macroend

!ifdef BUILD_UNINSTALLER
; $R7 = the path a LocalServer32 value names: the text in quotes when it has them, otherwise the whole value.
Function un.rdServerPath
  Exch $R7
  Push $R8
  Push $R9
  StrCpy $R8 $R7 1
  ${if} $R8 == '"'
    StrCpy $R7 $R7 "" 1
    StrCpy $R9 0
    rdQuoteLoop:
      StrCpy $R8 $R7 1 $R9
      ${if} $R8 == ""
        Goto rdQuoteDone
      ${endIf}
      ${if} $R8 == '"'
        StrCpy $R7 $R7 $R9
        Goto rdQuoteDone
      ${endIf}
      IntOp $R9 $R9 + 1
      Goto rdQuoteLoop
    rdQuoteDone:
  ${endIf}
  Pop $R9
  Pop $R8
  Exch $R7
FunctionEnd
!endif

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; The guard never installs an app removed by hand: closed by its program's name, its entries and the update folder gone.
    nsExec::Exec '"$SYSDIR\cmd.exe" /C taskkill /F /IM "${RD_GUARD_EXE}" /FI "USERNAME eq %USERNAME%"'
    Pop $0
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${RD_GUARD_RUN}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${RD_GUARD_RUN}"
    RMDir /r "${RD_APPDATA}\update"
    DeleteRegKey HKCU "Software\Classes\${RD_PROTOCOL}"
    ; The toast activator's keys Electron wrote: every CLSID of the user whose LocalServer32 names Regulated Day.exe in
    ; this installation – gathered first, removed after (removing while enumerating would skip keys). The settings of
    ; notifications Windows keeps are your choices and stay (D72).
    StrCpy $R5 ""
    StrCpy $R0 0
    rdClsidLoop:
      EnumRegKey $R1 HKCU "Software\Classes\CLSID" $R0
      StrCmp $R1 "" rdClsidDone
      ReadRegStr $R2 HKCU "Software\Classes\CLSID\$R1\LocalServer32" ""
      ${if} $R2 != ""
        Push $R2
        Call un.rdServerPath
        Pop $R3
        ; StrCmp ignores the letters' case.
        StrCmp $R3 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 rdClsidNext
        StrCpy $R5 "$R5$R1|"
      ${endIf}
      rdClsidNext:
      IntOp $R0 $R0 + 1
      Goto rdClsidLoop
    rdClsidDone:
    rdClsidDelete:
      StrCmp $R5 "" rdClsidEnd
      StrCpy $R6 0
      rdSplit:
        StrCpy $R4 $R5 1 $R6
        StrCmp $R4 "|" rdSplitFound
        IntOp $R6 $R6 + 1
        Goto rdSplit
      rdSplitFound:
        StrCpy $R4 $R5 $R6
        IntOp $R6 $R6 + 1
        StrCpy $R5 $R5 "" $R6
        DeleteRegKey HKCU "Software\Classes\CLSID\$R4"
        Goto rdClsidDelete
    rdClsidEnd:
    Delete "$INSTDIR\resources\rd-installed"
  ${endIf}
  ; An update leaves the marker to electron-builder's atomic move of the files: it goes with them and comes back with them
  ; when the uninstall fails (a busy file) – the old version then starts as the production app, never without it (T407).
!macroend
