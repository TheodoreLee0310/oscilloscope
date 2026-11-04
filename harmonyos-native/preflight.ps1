# 设备验收前置预检
#
# 在接入设备之前，先确认"产物本身"没问题：打包内容完整、权限与设备类型正确、
# 是否已签名。这样真机一旦就绪，失败原因就不会混在打包问题里。
#
# 用法：.\preflight.ps1 [-HapPath <路径>]

param([string]$HapPath = '')

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$outDir = Join-Path $root 'entry\build\default\outputs\default'

if ([string]::IsNullOrWhiteSpace($HapPath)) {
  $signed = Get-ChildItem $outDir -Filter '*signed*.hap' -ErrorAction SilentlyContinue | Select-Object -First 1
  $any = Get-ChildItem $outDir -Filter '*.hap' -ErrorAction SilentlyContinue | Select-Object -First 1
  $HapPath = if ($signed) { $signed.FullName } elseif ($any) { $any.FullName } else { '' }
}

$results = @()
function Check([string]$name, [bool]$ok, [string]$detail) {
  $script:results += [pscustomobject]@{ 项目 = $name; 结果 = if ($ok) { 'PASS' } else { 'FAIL' }; 说明 = $detail }
}

# 1. 产物存在
if ([string]::IsNullOrWhiteSpace($HapPath) -or -not (Test-Path $HapPath)) {
  Check 'HAP 产物' $false '未找到 HAP，请先运行 npm run harmonyos:native:build'
} else {
  $hap = Get-Item $HapPath
  Check 'HAP 产物' ($hap.Length -gt 0) ("{0}（{1:N2} MB）" -f $hap.Name, ($hap.Length / 1MB))
}

# 2. 打包内容
$entries = @()
if ($hap) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($hap.FullName)
  $entries = $zip.Entries | ForEach-Object { $_.FullName }
  $required = @('module.json', 'resources.index', 'ets/modules.abc', 'resources/base/profile/main_pages.json')
  $missing = $required | Where-Object { $entries -notcontains $_ }
  Check '必需打包条目' ($missing.Count -eq 0) $(if ($missing.Count -eq 0) { "共 $($entries.Count) 个条目" } else { "缺少：$($missing -join ', ')" })

  # 3. 页面清单
  $pageEntry = $zip.Entries | Where-Object { $_.FullName -eq 'resources/base/profile/main_pages.json' }
  if ($pageEntry) {
    $reader = New-Object System.IO.StreamReader($pageEntry.Open())
    $pagesText = $reader.ReadToEnd(); $reader.Close()
    $hasIndex = $pagesText -match 'pages/Index'
    Check '主页面已打包' $hasIndex $(if ($hasIndex) { 'main_pages.json 含 pages/Index' } else { 'main_pages.json 缺少 pages/Index' })
  }

  # 4. 设备类型与权限（包内 module.json 是纯 JSON）
  $moduleEntry = $zip.Entries | Where-Object { $_.FullName -eq 'module.json' }
  if ($moduleEntry) {
    $reader = New-Object System.IO.StreamReader($moduleEntry.Open())
    $moduleText = $reader.ReadToEnd(); $reader.Close()
    try {
      $module = $moduleText | ConvertFrom-Json
      $types = @($module.module.deviceTypes)
      $typeOk = ($types -contains 'phone') -or ($types -contains 'tablet') -or ($types -contains '2in1')
      Check '设备类型' $typeOk ("deviceTypes = " + ($types -join ', '))

      $perms = @($module.module.requestPermissions | ForEach-Object { $_.name })
      $netOk = $perms -contains 'ohos.permission.INTERNET'
      Check '网络权限' $netOk $(if ($netOk) { '已声明 INTERNET' } else { "未声明，实际：" + ($perms -join ', ') })
    } catch {
      Check '包内 module.json' $false "解析失败：$($_.Exception.Message)"
    }
  }
  $zip.Dispose()
}

# 5. 签名（决定能否安装到真机）
$profilePath = Join-Path $root 'build-profile.json5'
$signingEmpty = $true
if (Test-Path $profilePath) {
  $profileText = Get-Content $profilePath -Raw
  $signingEmpty = $profileText -match '"signingConfigs"\s*:\s*\[\s*\]'
}
Check '签名配置' (-not $signingEmpty) $(if ($signingEmpty) { 'signingConfigs 为空：产物未签名，设备会拒绝安装' } else { '已配置签名' })

$isSignedHap = $hap -and ($hap.Name -match 'signed\.hap$') -and ($hap.Name -notmatch 'unsigned')
Check '已签名产物' ([bool]$isSignedHap) $(if ($isSignedHap) { $hap.Name } else { '当前只有 unsigned HAP' })

# 6. 应用标识
$appPath = Join-Path $root 'AppScope\app.json5'
if (Test-Path $appPath) {
  $appText = Get-Content $appPath -Raw
  $bundle = [regex]::Match($appText, '"bundleName"\s*:\s*"([^"]+)"').Groups[1].Value
  $version = [regex]::Match($appText, '"versionName"\s*:\s*"([^"]+)"').Groups[1].Value
  Check '应用标识' (-not [string]::IsNullOrWhiteSpace($bundle)) ("$bundle / $version")
}

Write-Host ("{0,-12} {1,-6} {2}" -f '项目', '结果', '说明')
Write-Host ("{0,-12} {1,-6} {2}" -f '----', '--', '--')
foreach ($r in $results) {
  $color = if ($r.结果 -eq 'PASS') { 'Green' } else { 'Red' }
  Write-Host ("{0,-12} {1,-6} {2}" -f $r.项目, $r.结果, $r.说明) -ForegroundColor $color
}

$failed = @($results | Where-Object { $_.结果 -eq 'FAIL' })
Write-Host ''
if ($failed.Count -eq 0) {
  Write-Host '预检通过：可以进入设备安装与验收。' -ForegroundColor Green
  exit 0
} else {
  Write-Host ("预检未通过（{0} 项）：" -f $failed.Count) -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host ("  - {0}：{1}" -f $_.项目, $_.说明) -ForegroundColor Yellow }
  Write-Host ''
  Write-Host '说明：签名与设备相关项需要在 DevEco 登录华为账号后配置，详见 DEVICE_ACCEPTANCE.md。'
  exit 1
}
