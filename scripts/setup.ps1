# One-time install of the Kokoro voice on Windows: a private venv plus the int8 model (~120 MB).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Data = if ($env:READ_ALOUD_HOME) { $env:READ_ALOUD_HOME } else { Join-Path $env:LOCALAPPDATA 'read-aloud' }
$Models = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0'

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Output 'uv is required: winget install --id astral-sh.uv  (https://docs.astral.sh/uv/getting-started/installation/)'
    exit 1
}

New-Item -ItemType Directory -Force -Path $Data | Out-Null
$Py = Join-Path $Data 'venv\Scripts\python.exe'

if (-not (Test-Path $Py)) {
    uv venv --python 3.13 (Join-Path $Data 'venv')
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
uv pip install --python $Py 'kokoro-onnx==0.6.1'
if ($LASTEXITCODE -ne 0) { exit 1 }

function Get-Model($Remote, $Local) {
    $Target = Join-Path $Data $Local
    if (-not (Test-Path $Target)) {
        Invoke-WebRequest -UseBasicParsing -Uri "$Models/$Remote" -OutFile "$Target.part"
        Move-Item "$Target.part" $Target
    }
}
Get-Model 'kokoro-v1.0.int8.onnx' 'kokoro.onnx'
Get-Model 'voices-v1.0.bin' 'voices.bin'

Write-Output "Kokoro voice installed in $Data"
