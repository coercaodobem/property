param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('G12-02', 'G12-03', 'G12-04', 'G12-05')]
  [string] $CaseId,

  [Parameter(Mandatory = $true)]
  [string] $OutputDir
)

$ErrorActionPreference = 'Stop'
$proxyNames = @('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'WSS_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy', 'wss_proxy')
$strippedProxyNames = @()
foreach ($name in $proxyNames) {
  if (Test-Path "Env:$name") {
    $strippedProxyNames += $name
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}
$env:PROPERTY_LAB_STRIPPED_PROXY_VARIABLES = $strippedProxyNames -join ' '
$routes4 = @(Get-NetRoute -PolicyStore ActiveStore -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
$routes6 = @(Get-NetRoute -PolicyStore ActiveStore -AddressFamily IPv6 -DestinationPrefix '::/0' -ErrorAction SilentlyContinue)
$exitCode = 1
$routesRemoved = $false

try {
  foreach ($route in @($routes4) + @($routes6)) {
    Remove-NetRoute -DestinationPrefix $route.DestinationPrefix -InterfaceIndex $route.InterfaceIndex `
      -NextHop $route.NextHop -Confirm:$false -ErrorAction Stop | Out-Null
    $routesRemoved = $true
  }

  node property/tests/platform/platform-browser-smoke.mjs --preflight --case $CaseId --output $OutputDir
  if ($LASTEXITCODE -ne 0) { throw 'Native platform browser preflight failed.' }
  node property/tests/platform/platform-browser-smoke.mjs --case $CaseId --output $OutputDir
  $exitCode = $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  $exitCode = 1
} finally {
  if ($routesRemoved) {
    foreach ($route in @($routes4) + @($routes6)) {
      try {
        New-NetRoute -DestinationPrefix $route.DestinationPrefix -InterfaceIndex $route.InterfaceIndex `
          -NextHop $route.NextHop -RouteMetric $route.RouteMetric -PolicyStore ActiveStore -ErrorAction Stop | Out-Null
      } catch {
        [Console]::Error.WriteLine('Failed to restore a runner default route.')
        if ($exitCode -eq 0) { $exitCode = 1 }
      }
    }
  }
}

exit $exitCode
