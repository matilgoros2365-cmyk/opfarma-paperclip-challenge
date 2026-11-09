# Arranca el servidor de Paperclip con el token de suscripción de Claude.
#
# Por qué existe este script, y no dos comandos sueltos:
#
#   1. El token se pega en un prompt, así no hay que pelear con comillas ni
#      reemplazar un placeholder en una línea ya escrita.
#   2. `claude setup-token` imprime el token partido por el ancho de la
#      terminal, y al copiarlo suele colarse un espacio o un salto de línea.
#      Acá se limpia solo antes de usarlo.
#   3. El token queda sólo en la memoria de esta sesión de PowerShell. No se
#      escribe en ningún archivo ni queda en el historial de comandos.
#
# Uso:  .\scripts\start-paperclip.ps1
# Cortar el servidor: Ctrl-C

$ErrorActionPreference = 'Stop'

# Pararse en la raíz del proyecto, sin importar desde dónde se llame.
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

Write-Host ''
Write-Host 'Credencial del modelo.' -ForegroundColor Cyan
Write-Host ''
Write-Host '  ENTER vacio  ->  usar el login guardado de `claude auth login`  (recomendado)' -ForegroundColor Green
Write-Host '  sk-ant-oat...->  token de suscripcion' -ForegroundColor DarkGray
Write-Host '  sk-ant-...   ->  clave de API' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Ojo: el adapter claude_local prefiere el login guardado. Una credencial' -ForegroundColor DarkGray
Write-Host 'en el entorno le gana a ese login y puede hacer fallar el probe.' -ForegroundColor DarkGray
Write-Host ''

# Se reintenta en vez de salir al primer vacio: si el script se lanza de forma
# automatizada, el Enter que envia el lanzador se lo come el primer Read-Host y
# la lectura vuelve vacia sin que nadie haya tipeado nada.
$token = ''
$usarLoginGuardado = $false
for ($intento = 1; $intento -le 5; $intento++) {
    $crudo = Read-Host 'Credencial (ENTER = login guardado)'
    $limpio = ($crudo -replace '\s', '').Trim()

    if ([string]::IsNullOrWhiteSpace($limpio)) {
        # El primer Read-Host se come el Enter que manda un lanzador
        # automatizado; a partir del segundo, un vacio es una eleccion real.
        if ($intento -eq 1) {
            Write-Host 'Presiona ENTER otra vez para usar el login guardado, o pega una credencial.' -ForegroundColor DarkGray
            continue
        }
        $usarLoginGuardado = $true
        break
    }

    if (-not $limpio.StartsWith('sk-ant-')) {
        Write-Host "Eso no arranca con 'sk-ant-'. Copia desde el principio del token." -ForegroundColor Red
        continue
    }

    if ($limpio.Length -lt 80) {
        Write-Host "Llegaron sólo $($limpio.Length) caracteres: quedo cortado (deberian ser ~108)." -ForegroundColor Red
        continue
    }

    $token = $limpio
    break
}

if (-not $usarLoginGuardado -and [string]::IsNullOrWhiteSpace($token)) {
    Write-Host 'No se recibio una credencial valida. Volve a correr el script.' -ForegroundColor Red
    exit 1
}

# El prefijo dice que variable corresponde. Una API key en la variable del
# token de suscripcion (o al reves) falla con un error que no nombra la causa,
# asi que conviene no dejarselo elegir a nadie.
# Se decide por el marcador 'oat' (OAuth), que es el unico inequivoco. Todo lo
# demas -sk-ant-api..., sk-ant-usr...- es una clave de API. Hacerlo al reves
# (asumir OAuth por defecto) manda una API key a la variable equivocada y
# Anthropic responde con un error que no nombra la causa.
if ($usarLoginGuardado) {
    # Las dos variables se limpian a proposito: el adapter avisa que cualquiera
    # de ellas "le gana" al login guardado, y con la clave equivocada el probe
    # falla con un exitCode 1 que no nombra la causa.
    Remove-Item Env:\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\CLAUDE_CODE_OAUTH_TOKEN -ErrorAction SilentlyContinue
    $cual = 'login guardado de claude auth login (sin credencial en el entorno)'
} elseif ($token -like 'sk-ant-oat*') {
    $env:CLAUDE_CODE_OAUTH_TOKEN = $token
    Remove-Item Env:\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
    $cual = 'CLAUDE_CODE_OAUTH_TOKEN (token de suscripcion)'
} else {
    $env:ANTHROPIC_API_KEY = $token
    Remove-Item Env:\CLAUDE_CODE_OAUTH_TOKEN -ErrorAction SilentlyContinue
    $cual = 'ANTHROPIC_API_KEY (clave de API, se cobra por uso)'
}

Write-Host ''
if ($usarLoginGuardado) {
    Write-Host "Autenticacion: $cual" -ForegroundColor Green
} else {
    Write-Host "Credencial recibida: $($token.Length) caracteres." -ForegroundColor Green
    Write-Host "Va en $cual" -ForegroundColor Green
}
Write-Host ''

# Subir el detalle del log: el probe del adapter sólo reporta "exitCode 1" y no
# dice qué comando corrió. Con esto aparece el detalle en consola.
if ($env:PAPERCLIP_DEBUG -eq '1') {
    $env:LOG_LEVEL = 'debug'
    $env:PAPERCLIP_LOG_LEVEL = 'debug'
    $env:DEBUG = 'paperclip*'
    Write-Host 'Logs en modo debug.' -ForegroundColor DarkGray
}

& '.\node_modules\.bin\paperclipai.cmd' run
