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

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      Sleep 300
    ${endIf}
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${ifNot} ${isUpdated}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK rdStopApp
        Quit
      ${endIf}
      rdStopApp:
      !insertmacro rdWriteClosedMarker
      DetailPrint "$(appClosing)"
      ; A hidden window of the app quits on this close (it is not a click of its close button).
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      Sleep 300
      StrCpy $R1 0
      rdWaitLoop:
        IntOp $R1 $R1 + 1
        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          Sleep 1000
          !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
          !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
          ${if} $R0 == 0
            Sleep 2000
          ${else}
            Goto rdNotRunning
          ${endIf}
        ${else}
          Goto rdNotRunning
        ${endIf}
        ${if} $R1 > 1
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY rdWaitLoop
          Quit
        ${else}
          Goto rdWaitLoop
        ${endIf}
      rdNotRunning:
    ${endIf}
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
  ${endIf}
  Delete "$INSTDIR\resources\rd-installed"
!macroend
