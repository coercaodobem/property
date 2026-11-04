param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('G12-02', 'G12-03', 'G12-04', 'G12-05')]
  [string] $CaseId,

  [Parameter(Mandatory = $true)]
  [string] $OutputDir
)

$ErrorActionPreference = 'Stop'
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
