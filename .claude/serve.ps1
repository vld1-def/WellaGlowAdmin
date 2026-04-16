$root = Split-Path -Parent $PSScriptRoot
$port = 4200
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server running at http://localhost:$port"
while ($true) {
    $ctx = $listener.GetContext()
    $localPath = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ($localPath -eq '') { $localPath = 'admin-staff.html' }
    $file = Join-Path $root $localPath
    if (Test-Path $file -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.json' { 'application/json' }
            default { 'application/octet-stream' }
        }
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
