# .env 와 .env.example 의 키 집합을 비교한다. 값은 출력하지 않는다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/env-check.ps1 [-EnvFile <path>] [-ExampleFile <path>]
# 종료 코드: 0 = 일치, 1 = 불일치, 2 = 파일 없음
# 파일은 UTF-8(BOM 없음)이다. Windows PowerShell 5.1이 BOM 없는 파일을 ANSI로 읽으므로
# 출력 문구의 한글은 \uXXXX 이스케이프로 두고 실행 시 복원한다.
param(
    [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.env'),
    [string]$ExampleFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.env.example')
)

$ErrorActionPreference = 'Stop'

function T([string]$s) { return [regex]::Unescape($s) }
$MsgNoFile = T '파일 없음'                          # 파일 없음
$MsgOnlyExample = T 'example에만 있음:'               # example에만 있음:
$MsgOnlyEnv = T 'env에만 있음:'                       # env에만 있음:
$MsgOk = T '키 집합 일치 (불일치 0)'  # 키 집합 일치 (불일치 0)

foreach ($f in @($EnvFile, $ExampleFile)) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
        Write-Output "${MsgNoFile}: $f"
        exit 2
    }
}

# 주석·빈 줄을 제외하고 KEY= 형태의 키 이름만 추출
function Get-EnvKeys([string]$Path) {
    $pattern = '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*='
    $keys = foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        $m = [regex]::Match($line, $pattern)
        if ($m.Success) { $m.Groups[1].Value }
    }
    return @($keys | Sort-Object -Unique)
}

$envKeys = Get-EnvKeys $EnvFile
$exampleKeys = Get-EnvKeys $ExampleFile

$onlyExample = @($exampleKeys | Where-Object { $envKeys -notcontains $_ })
$onlyEnv = @($envKeys | Where-Object { $exampleKeys -notcontains $_ })

$status = 0
if ($onlyExample.Count -gt 0) {
    Write-Output $MsgOnlyExample
    $onlyExample | ForEach-Object { Write-Output "  - $_" }
    $status = 1
}
if ($onlyEnv.Count -gt 0) {
    Write-Output $MsgOnlyEnv
    $onlyEnv | ForEach-Object { Write-Output "  - $_" }
    $status = 1
}
if ($status -eq 0) {
    Write-Output $MsgOk
}
exit $status
