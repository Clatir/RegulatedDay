; The installer's own steps (spec „Instalacja, aktualizacje i log”), included by electron-builder (nsis.include).
; One click, only for this user, without choosing a folder (oneClick, perMachine: false, a fixed nsis.guid) – it never asks
; „for me or for everyone” or for administrator rights. All times are milliseconds UTC from GetSystemTimeAsFileTime,
; counted in 64 bits – never the local time.

!include "LogicLib.nsh"
; electron-builder declares these only without customCheckAppRunning – this file brings its own.
!include "getProcessInfo.nsh"
Var pid

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

; How long the app has to end by its own way out once it is asked to (E4a.13); the kill comes only after it.
!define RD_CLOSE_WAIT_MS 5000

; The PowerShell of the search, the close, the kill and the list (tests/unit/installer-close.test.ts runs it). Its text has
; only single quotes and no backticks – it goes into a backtick string and a command line – and every $ is $$ (one $ for
; NSIS). The values come from the environment (rdSetupEnv), never pasted into the text: an apostrophe in a folder cannot
; break it. $$u: every process under the installation (the folder with its backslash) but this installer – an uninstaller
; run in place (_?=) is under it too.
!define RD_PS_UNDER "$$d = $$env:RD_SETUP_INSTDIR.TrimEnd('\') + '\'; \
  $$all = @(Get-CimInstance Win32_Process -ErrorAction Stop); \
  $$u = @($$all | Where-Object { $$_.ProcessId -ne [int]$$env:RD_SETUP_SELF -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase) });"
; Find: exit 0 = some process is there. electron-builder's FIND_PROCESS misses a single one – a lone CimInstance has no
; .Count in Windows PowerShell 5.1 – so the last process left (a helper, a main process that does not end) read as
; „closed” and was never killed nor listed; @(…) counts it.
!define RD_PS_FIND "try { ${RD_PS_UNDER} if ($$u.Count -gt 0) { exit 0 } else { exit 1 } } catch { exit 2 }"
; Close: taskkill without /F – a WM_CLOSE to the windows of the app's main process (not its --type= children, which end
; with it); its hidden windows end the app by its own way out (T396: the data folder, the helper, „aplikacja zamknięta”).
; Then up to RD_SETUP_WAIT_MS for every process; exit 0 = none is left.
!define RD_PS_CLOSE "try { ${RD_PS_UNDER} \
  $$w = [Diagnostics.Stopwatch]::StartNew(); $$e = $$d + $$env:RD_SETUP_EXE; \
  foreach ($$p in $$u) { if ($$p.ExecutablePath -ieq $$e -and $$p.CommandLine -notlike '* --type=*') { & ($$env:SystemRoot + '\System32\taskkill.exe') /PID $$p.ProcessId | Out-Null } }; \
  foreach ($$p in $$u) { \
    $$h = Get-Process -Id $$p.ProcessId -ErrorAction SilentlyContinue; \
    if ($$h) { $$l = [int]$$env:RD_SETUP_WAIT_MS - $$w.ElapsedMilliseconds; if ($$l -lt 1 -or -not $$h.WaitForExit([int]$$l)) { exit 1 } } \
  }; \
  exit 0 \
} catch { exit 1 }"
; Kill: what is left after the close, as electron-builder's KILL_PROCESS … 1 (Stop-Process -Force), never this installer.
!define RD_PS_KILL "try { ${RD_PS_UNDER} foreach ($$p in $$u) { Stop-Process -Id $$p.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0 } catch { exit 1 }"
; List: every process left – name, PID, parent (with its name when it is older than the child), start and command line –
; appended to RD_SETUP_LOG (UTF-8 without BOM), the profile's path as %USERPROFILE%.
!define RD_PS_LIST "try { ${RD_PS_UNDER} \
  $$c = [Globalization.CultureInfo]::InvariantCulture; $$f = 'yyyy-MM-ddTHH:mm:ss.fffZ'; \
  $$by = @{}; foreach ($$p in $$all) { $$by[[int]$$p.ProcessId] = $$p }; \
  $$s = [DateTime]::UtcNow.ToString($$f, $$c) + ' WARN instalator ' + $$env:RD_SETUP_VERSION + ': procesy spod ' + $$d + ', które nie dały się zamknąć:' + [char]10; \
  foreach ($$p in $$u) { \
    $$t = ''; if ($$p.CreationDate) { $$t = $$p.CreationDate.ToUniversalTime().ToString($$f, $$c) }; \
    $$r = [string]$$p.ParentProcessId; $$q = $$by[[int]$$p.ParentProcessId]; if ($$q -and $$q.CreationDate -le $$p.CreationDate) { $$r += ' ' + $$q.Name }; \
    $$s += '  ' + $$p.Name + ' | pid ' + $$p.ProcessId + ' | rodzic ' + $$r + ' | start ' + $$t + ' | ' + $$p.CommandLine + [char]10 \
  }; \
  if ($$env:USERPROFILE) { $$s = $$s.Replace($$env:USERPROFILE, '%USERPROFILE%') }; \
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($$env:RD_SETUP_LOG)); \
  [IO.File]::AppendAllText($$env:RD_SETUP_LOG, $$s, (New-Object Text.UTF8Encoding $$false)); \
  exit 0 \
} catch { exit 1 }"

!macro rdSetupEnv
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_INSTDIR", t "$INSTDIR")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_SELF", t "$pid")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_EXE", t "${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "RD_SETUP_WAIT_MS", t "${RD_CLOSE_WAIT_MS}")'
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
!macroend

; _RETURN = 0 when a process runs under the installation (in place of electron-builder's FIND_PROCESS, see RD_PS_FIND);
; every PowerShell step ends within 60 s ("timeout" otherwise). Without PowerShell the same tasklist as FIND_PROCESS.
!macro rdFindProcess _RETURN
  ${if} $IsPowerShellAvailable == 0
    !insertmacro rdSetupEnv
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_FIND}"`
    Pop ${_RETURN}
    !insertmacro rdClearEnv
  ${else}
    nsExec::Exec `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop ${_RETURN}
  ${endIf}
!macroend

; The app is asked to end and given RD_CLOSE_WAIT_MS (electron-builder's KILL_PROCESS … 0 is Stop-Process – TerminateProcess –
; whenever PowerShell is there: no close of the app's own). Gone sooner, nothing waits longer.
!macro rdCloseApp
  Push $0
  Push $R2
  ${if} $IsPowerShellAvailable == 0
    !insertmacro rdSetupEnv
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_CLOSE}"`
    Pop $0
    !insertmacro rdClearEnv
  ${else}
    nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
    Pop $0
    StrCpy $R2 0
    ${do}
      !insertmacro rdFindProcess $0
      ${if} $0 != 0
      ${orIf} $R2 >= ${RD_CLOSE_WAIT_MS}
        ${exitDo}
      ${endIf}
      Sleep 250
      IntOp $R2 $R2 + 250
    ${loop}
  ${endIf}
  Pop $R2
  Pop $0
!macroend

; The kill of what is left (RD_PS_KILL); without PowerShell electron-builder's taskkill /F, which skips this installer too.
!macro rdKillProcess
  ${if} $IsPowerShellAvailable == 0
    Push $0
    !insertmacro rdSetupEnv
    nsExec::Exec /TIMEOUT=60000 `"$PowerShellPath" -NoProfile -NonInteractive -C "${RD_PS_KILL}"`
    Pop $0
    !insertmacro rdClearEnv
    Pop $0
  ${else}
    !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
  ${endIf}
!macroend

; Before „appCannotBeClosed”: which process is left, into logs\installer-check.log (docs/vm/procesy.ps1 lists the same).
!macro rdListProcesses
  Push $0
  Push $1
  ${if} $IsPowerShellAvailable == 0
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
  !insertmacro IS_POWERSHELL_AVAILABLE
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      Sleep 300
    ${endIf}
    !insertmacro rdFindProcess $R0
    ${if} $R0 == 0
      ${ifNot} ${isUpdated}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK rdStopApp
        Quit
      ${endIf}
      rdStopApp:
      !insertmacro rdWriteClosedMarker
      DetailPrint "$(appClosing)"
      ; First asked, as „Zakończ” would end it; killed only what is left after RD_CLOSE_WAIT_MS (E4a.13).
      !insertmacro rdCloseApp
      StrCpy $R1 0
      rdWaitLoop:
        IntOp $R1 $R1 + 1
        !insertmacro rdFindProcess $R0
        ${if} $R0 == 0
          !insertmacro rdKillProcess
          !insertmacro rdFindProcess $R0
          ${if} $R0 == 0
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
