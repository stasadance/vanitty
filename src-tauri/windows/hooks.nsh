; Puts the install folder on the user's PATH so `vanitty` works in a shell.
; NSIS strings stop at 1024 characters, so a PATH near that is left alone
; rather than cut short.

!include LogicLib.nsh
!include WinMessages.nsh
!include WordFunc.nsh

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  ClearErrors
  ReadRegStr $0 HKCU "Environment" "Path"
  StrLen $1 "$0;$INSTDIR"
  ${IfNot} ${Errors}
  ${AndIf} $1 < 1000
    ${WordAdd} "$0" ";" "+$INSTDIR" $0
    WriteRegExpandStr HKCU "Environment" "Path" "$0"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=500
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    Push $0
    Push $1
    ClearErrors
    ReadRegStr $0 HKCU "Environment" "Path"
    StrLen $1 "$0"
    ${IfNot} ${Errors}
    ${AndIf} $1 < 1000
      ${un.WordAdd} "$0" ";" "-$INSTDIR" $0
      WriteRegExpandStr HKCU "Environment" "Path" "$0"
      SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=500
    ${EndIf}
    Pop $1
    Pop $0
  ${EndIf}
!macroend
