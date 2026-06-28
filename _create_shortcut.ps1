# Script PowerShell pour creer le raccourci Kheops 2
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $scriptDir "Demarrer_Kheops2.bat"

# Raccourci dans le dossier du projet
$projectShortcut = Join-Path $scriptDir "Kheops 2.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($projectShortcut)
$sc.TargetPath = $batPath
$sc.WorkingDirectory = $scriptDir
$sc.Description = "Demarrer Kheops 2"
$sc.WindowStyle = 1
$sc.Save()
Write-Host "Raccourci cree: $projectShortcut"

# Raccourci sur le Bureau
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Kheops 2.lnk"
$sc2 = $ws.CreateShortcut($desktopShortcut)
$sc2.TargetPath = $batPath
$sc2.WorkingDirectory = $scriptDir
$sc2.Description = "Demarrer Kheops 2"
$sc2.WindowStyle = 1
$sc2.Save()
Write-Host "Raccourci cree: $desktopShortcut"
