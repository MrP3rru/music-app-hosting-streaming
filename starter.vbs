Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c """ & dir & "\starter.bat""", 0
Set WshShell = Nothing
Set fso = Nothing
