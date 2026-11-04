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

function Test-LocalRoutePrefix {
  param([string] $DestinationPrefix, [int] $Family)

  try {
    $parts = $DestinationPrefix -split '/', 2
    $address = [System.Net.IPAddress]::Parse($parts[0])
    $expectedFamily = if ($Family -eq 4) {
      [System.Net.Sockets.AddressFamily]::InterNetwork
    } else {
      [System.Net.Sockets.AddressFamily]::InterNetworkV6
    }
    if ($address.AddressFamily -ne $expectedFamily) { return $false }
    $maxBits = if ($Family -eq 4) { 32 } else { 128 }
    $prefixLength = if ($parts.Length -gt 1) { [int] $parts[1] } else { $maxBits }
    if ($prefixLength -lt 0 -or $prefixLength -gt $maxBits) { return $false }
    $ranges = if ($Family -eq 4) {
      @(
        [pscustomobject]@{ Address = '10.0.0.0'; Prefix = 8 },
        [pscustomobject]@{ Address = '172.16.0.0'; Prefix = 12 },
        [pscustomobject]@{ Address = '192.168.0.0'; Prefix = 16 },
        [pscustomobject]@{ Address = '127.0.0.0'; Prefix = 8 },
        [pscustomobject]@{ Address = '169.254.0.0'; Prefix = 16 },
        [pscustomobject]@{ Address = '100.64.0.0'; Prefix = 10 },
        [pscustomobject]@{ Address = '224.0.0.0'; Prefix = 4 },
        [pscustomobject]@{ Address = '240.0.0.0'; Prefix = 4 }
      )
    } else {
      @(
        [pscustomobject]@{ Address = '::1'; Prefix = 128 },
        [pscustomobject]@{ Address = 'fe80::'; Prefix = 10 },
        [pscustomobject]@{ Address = 'fc00::'; Prefix = 7 },
        [pscustomobject]@{ Address = 'ff00::'; Prefix = 8 }
      )
    }
    $addressBytes = $address.GetAddressBytes()
    foreach ($range in $ranges) {
      if ($prefixLength -lt $range.Prefix) { continue }
      $rangeBytes = ([System.Net.IPAddress]::Parse($range.Address)).GetAddressBytes()
      $matches = $true
      for ($bit = 0; $bit -lt $range.Prefix; $bit++) {
        $byteIndex = [int] [Math]::Floor($bit / 8)
        $bitShift = 7 - ($bit % 8)
        $addressBit = ([int] $addressBytes[$byteIndex] -shr $bitShift) -band 1
        $rangeBit = ([int] $rangeBytes[$byteIndex] -shr $bitShift) -band 1
        if ($addressBit -ne $rangeBit) { $matches = $false; break }
      }
      if ($matches) { return $true }
    }
  } catch {
    return $false
  }
  return $false
}

$routes4 = @(Get-NetRoute -PolicyStore ActiveStore -AddressFamily IPv4 -ErrorAction Stop |
  Where-Object { -not (Test-LocalRoutePrefix $_.DestinationPrefix 4) })
$routes6 = @(Get-NetRoute -PolicyStore ActiveStore -AddressFamily IPv6 -ErrorAction Stop |
  Where-Object { -not (Test-LocalRoutePrefix $_.DestinationPrefix 6) })
$removedRoutes4 = @()
$removedRoutes6 = @()
$exitCode = 1
$routesRemoved = $false

try {
  foreach ($route in $routes4) {
    Remove-NetRoute -DestinationPrefix $route.DestinationPrefix -InterfaceIndex $route.InterfaceIndex `
      -NextHop $route.NextHop -Confirm:$false -ErrorAction Stop | Out-Null
    $removedRoutes4 += $route
    $routesRemoved = $true
  }
  foreach ($route in $routes6) {
    Remove-NetRoute -DestinationPrefix $route.DestinationPrefix -InterfaceIndex $route.InterfaceIndex `
      -NextHop $route.NextHop -Confirm:$false -ErrorAction Stop | Out-Null
    $removedRoutes6 += $route
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
    foreach ($route in @($removedRoutes4) + @($removedRoutes6)) {
      try {
        New-NetRoute -DestinationPrefix $route.DestinationPrefix -InterfaceIndex $route.InterfaceIndex `
          -NextHop $route.NextHop -RouteMetric $route.RouteMetric -PolicyStore ActiveStore -ErrorAction Stop | Out-Null
      } catch {
        [Console]::Error.WriteLine('Failed to restore one or more runner routes.')
        if ($exitCode -eq 0) { $exitCode = 1 }
      }
    }
  }
}

exit $exitCode
