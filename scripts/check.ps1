# Prints whether the Kokoro voice is installed (Windows twin of `speak.sh --check`).
$Data = if ($env:READ_ALOUD_HOME) { $env:READ_ALOUD_HOME } else { Join-Path $env:LOCALAPPDATA 'read-aloud' }
$Ready = (Test-Path (Join-Path $Data 'venv\Scripts\python.exe')) -and
    (Test-Path (Join-Path $Data 'kokoro.onnx')) -and
    (Test-Path (Join-Path $Data 'voices.bin'))

if ($Ready) { Write-Output "Kokoro voice ready ($Data)" }
else { Write-Output 'Kokoro not installed. Run /read-aloud setup.' }
