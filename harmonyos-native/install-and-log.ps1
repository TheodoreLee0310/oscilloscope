# 安装 HAP 到设备并抓日志
#
# 用法：
#   .\install-and-log.ps1                       # 自动找 signed，找不到就用 unsigned 并提示
#   .\install-and-log.ps1 -HapPath .\entry\build\default\outputs\default\entry-default-signed.hap
#   .\install-and-log.ps1 -Uninstall
#
# 前置：已连接设备（hdc list targets 能看到），且 HAP 已签名。

param(
  [string]$HapPath = '',
  [string]$BundleName = 'com.example.oscilloscope',
  [string]$AbilityName = 'EntryAbility',
  [switch]$Uninstall,
  [switch]$NoLog
)

$ErrorActionPreference = 'Stop'

$hdc = 'D:\huawei-devp\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
if (-not (Test-Path $hdc)) {
  $candidate = Get-ChildItem 'D:\huawei-devp' -Filter 'hdc.exe' -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $candidate) { throw "找不到 hdc.exe，请在脚本里改路径" }
  $hdc = $candidate.FullName
}

Write-Host "=== 1/4 检查设备 ===" -ForegroundColor Cyan
$targets = & $hdc list targets 2>&1
Write-Host ($targets -join "`n")
if (($targets -join '') -match '\[Empty\]') {
  throw '没有可用设备：先连接真机（USB 调试）或启动模拟器'
}

if ($Uninstall) {
  Write-Host "=== 卸载 $BundleName ===" -ForegroundColor Cyan
  & $hdc uninstall $BundleName
  exit 0
}

Write-Host "=== 2/4 定位 HAP ===" -ForegroundColor Cyan
if ([string]::IsNullOrWhiteSpace($HapPath)) {
  $dir = Join-Path $PSScriptRoot 'entry\build\default\outputs\default'
  $signed = Get-ChildItem $dir -Filter '*signed*.hap' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($signed) {
    $HapPath = $signed.FullName
  } else {
    $unsigned = Get-ChildItem $dir -Filter '*.hap' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $unsigned) { throw "没有找到 HAP，请先运行 npm run harmonyos:native:build" }
    $HapPath = $unsigned.FullName
    Write-Warning "只找到未签名 HAP：$($unsigned.Name)。设备通常会拒绝安装，请先配置签名。"
  }
}
$hap = Get-Item $HapPath
Write-Host ("{0}（{1:N2} MB）" -f $hap.FullName, ($hap.Length / 1MB))

Write-Host "=== 3/4 安装 ===" -ForegroundColor Cyan
& $hdc install -r $hap.FullName
if ($LASTEXITCODE -ne 0) {
  throw '安装失败：常见原因是未签名、Profile 不含本机 UDID、或系统版本低于 targetSdkVersion'
}

Write-Host "=== 4/4 启动 ===" -ForegroundColor Cyan
& $hdc shell aa start -a $AbilityName -b $BundleName

if (-not $NoLog) {
  Write-Host "=== 日志（Ctrl+C 退出）===" -ForegroundColor Cyan
  & $hdc shell hilog | Select-String -Pattern 'oscilloscope|jsapp|ArkTS'
}
