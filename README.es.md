<p align="center">
  <img src="assets/devbuddy-banner-dark.svg" alt="DevBuddy Agent" width="100%">
</p>

# DevBuddy Agent 🔥

<p align="center">
  <a href="https://github.com/Gautam-Shah-14/DevBuddy/blob/main/LICENSE"><img src="https://img.shields.io/badge/Licencia-MIT-green?style=for-the-badge" alt="Licencia: MIT"></a>
  <a href="https://github.com/Gautam-Shah-14/DevBuddy"><img src="https://img.shields.io/badge/Creado%20por-TokenBurners-blueviolet?style=for-the-badge" alt="Creado por TokenBurners"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/Lang-English-blue?style=for-the-badge" alt="English"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/Lang-中文-red?style=for-the-badge" alt="中文"></a>
  <a href="README.ur-pk.md"><img src="https://img.shields.io/badge/Lang-اردو-green?style=for-the-badge" alt="اردو"></a>
</p>

**DevBuddy es un agente de IA local-first con mejora continua, creado por TokenBurners**,
construido sobre [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous
Research, licencia MIT). Crea habilidades a partir de la experiencia, las mejora durante el
uso, se impulsa a sí mismo a persistir el conocimiento, busca en sus propias conversaciones
pasadas y construye un modelo cada vez más profundo de quién eres a lo largo de las
sesiones. Funciona completamente en tu propia máquina contra tu propio Ollama local — sin
claves API, sin llamadas a la nube requeridas — o contra OpenAI/Anthropic/cualquier endpoint
compatible con OpenAI si lo prefieres.

Cambia de proveedor/modelo con `devbuddy model` — sin cambios de código, sin dependencias.

<table>
<tr><td><b>Una interfaz de terminal real</b></td><td>TUI completa con edición multilínea, autocompletado de comandos, historial de conversaciones, interrupción y redirección, y salida de herramientas en streaming.</td></tr>
<tr><td><b>Vive donde tú vives</b></td><td>Telegram, Discord, Slack, WhatsApp, Signal y CLI — todo desde un único proceso gateway. Transcripción de notas de voz, continuidad de conversación entre plataformas.</td></tr>
<tr><td><b>Un bucle de aprendizaje cerrado</b></td><td>Memoria curada por el agente con recordatorios periódicos. Creación autónoma de habilidades tras tareas complejas. Las habilidades mejoran solas durante el uso. Búsqueda FTS5 de sesiones con resumen por LLM para recuperación entre sesiones. Compatible con el estándar abierto de <a href="https://agentskills.io">agentskills.io</a>.</td></tr>
<tr><td><b>Automatizaciones programadas</b></td><td>Planificador cron integrado con entrega a cualquier plataforma. Informes diarios, copias de seguridad nocturnas, auditorías semanales — todo en lenguaje natural, ejecutándose de forma autónoma.</td></tr>
<tr><td><b>Delega y paraleliza</b></td><td>Lanza subagentes aislados para flujos de trabajo paralelos. Escribe scripts de Python que llaman a herramientas vía RPC, convirtiendo pipelines de múltiples pasos en turnos de coste cero de contexto.</td></tr>
<tr><td><b>Local-first por defecto</b></td><td>Sin Docker, sin servidor, sin clave API para empezar — `devbuddy` habla directamente con tu Ollama local. Docker y otros seis backends de terminal (SSH, Singularity, Modal, Daytona, Vercel Sandbox) están disponibles para ejecución aislada/remota cuando los quieras, nunca obligatorios.</td></tr>
</table>

---

## Instalación rápida

> **Docker es opcional, no obligatorio.** `devbuddy` es un script de consola de Python puro
> — funciona directamente en tu máquina contra tu propio Ollama local (u OpenAI/Anthropic/
> cualquier proveedor) sin ningún contenedor. `docker-compose.yml` en este repositorio solo
> levanta los servicios de *gateway* y *dashboard* (el puente de mensajería siempre activo y
> la interfaz web) para quien quiera tenerlo corriendo como servicio en segundo plano
> accesible desde Telegram, Discord, etc. Si solo quieres chatear desde una terminal, omite
> Docker por completo.

Este repositorio todavía no tiene un instalador alojado — ejecútalo desde el código fuente:

```bash
git clone https://github.com/Gautam-Shah-14/DevBuddy.git && cd DevBuddy
source ./activate      # provisiona y activa un entorno local de Python/Node (sin Docker)
devbuddy                # empieza a chatear — usa tu Ollama local por defecto
```

`source ./activate` necesita Python 3.14 (la versión real del proyecto — versiones
anteriores no resuelven sus dependencias en absoluto) y Node.js; consulta `AGENTS.md` para
el flujo de trabajo del gestor de herramientas PM (activación, uso diario, cambios de
dependencias, ejecución de pruebas).

### Windows / Android

Los instaladores alojados de un solo clic (`install.sh` / `install.ps1`, el repositorio APT
de Termux) apuntaban al dominio propio de Nous Research y no aplican todavía a este fork.
Windows nativo y Termux/Android funcionan por la misma ruta desde el código fuente de
arriba; simplemente no hay un instalador empaquetado de un solo comando para ellos aquí
todavía.

---

## Primeros pasos

```bash
devbuddy              # CLI interactiva — inicia una conversación
devbuddy model        # Elige tu proveedor y modelo LLM
devbuddy tools        # Configura qué herramientas están habilitadas
devbuddy config set   # Establece valores de configuración individuales
devbuddy config get   # Imprime valores de configuración individuales
devbuddy gateway      # Inicia el gateway de mensajería (Telegram, Discord, etc.)
devbuddy setup        # Ejecuta el asistente de configuración completo
devbuddy claw migrate # Migra desde OpenClaw (si vienes de OpenClaw)
devbuddy update       # Actualiza a la última versión
devbuddy doctor       # Diagnostica cualquier problema
```

### Ubicación de datos y configuración

Todo el estado local — `config.yaml`, secretos `.env`, la base de datos de sesión,
habilidades, logs, perfiles con nombre — vive en `~/.devbuddy` (`%LOCALAPPDATA%\devbuddy` en
Windows nativo). Esto se controla en un único lugar del código
(`devbuddy_constants._get_platform_default_hermes_home()`); la variable de entorno
`HERMES_HOME` sigue funcionando igual que siempre si quieres que los datos se guarden en
otro lugar (otra unidad, una carpeta sincronizada, un volumen de contenedor, etc.):

```bash
export HERMES_HOME=/ruta/a/tus/datos   # opcional; por defecto ~/.devbuddy
devbuddy doctor                          # confirma desde dónde está leyendo/escribiendo
```

`devbuddy doctor` y `devbuddy profile list` imprimen ambos la ruta activa si quieres
confirmar dónde aterrizaron realmente las cosas.

---

## Referencia rápida: CLI vs Mensajería

DevBuddy tiene dos puntos de entrada: inicia la interfaz de terminal con `devbuddy`, o
ejecuta el gateway y habla con él desde Telegram, Discord, Slack, WhatsApp, Signal o Email.
Una vez en una conversación, muchos comandos de barra son compartidos entre ambas interfaces.

| Acción                              | CLI                                           | Plataformas de mensajería                                                         |
| ----------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Empezar a chatear                   | `devbuddy`                                    | Ejecuta `devbuddy gateway setup` + `devbuddy gateway start`, luego envía un mensaje al bot |
| Nueva conversación                  | `/new` o `/reset`                             | `/new` o `/reset`                                                                 |
| Cambiar modelo                      | `/model [proveedor:modelo]`                   | `/model [proveedor:modelo]`                                                       |
| Establecer personalidad             | `/personality [nombre]`                       | `/personality [nombre]`                                                           |
| Reintentar o deshacer último turno  | `/retry`, `/undo`                             | `/retry`, `/undo`                                                                 |
| Comprimir contexto / ver uso        | `/compress`, `/usage`, `/insights [--days N]` | `/compress`, `/usage`, `/insights [days]`                                         |
| Explorar habilidades                | `/skills` o `/<nombre-habilidad>`             | `/<nombre-habilidad>`                                                             |
| Interrumpir trabajo actual          | `Ctrl+C` o enviar un nuevo mensaje            | `/stop` o enviar un nuevo mensaje                                                 |
| Estado específico de plataforma     | `/platforms`                                  | `/status`, `/sethome`                                                             |

---

## Documentación

Este fork todavía no tiene su propio sitio de documentación. La
[documentación de Hermes Agent](https://hermes-agent.nousresearch.com/docs/) sigue siendo la
mejor referencia para la mayoría de funciones (uso de CLI, configuración, gateway de
mensajería, herramientas/toolsets, habilidades, memoria, MCP, cron) — el núcleo del agente,
la CLI y el gateway de este fork siguen siendo Hermes Agent por debajo, solo renombrado y
apuntando a `~/.devbuddy` por defecto en lugar de `~/.hermes`. `AGENTS.md` en este
repositorio es la referencia autoritativa para la estructura y convenciones propias de este
fork.

---

## Migración desde OpenClaw

Si vienes de OpenClaw, DevBuddy puede importar automáticamente tu configuración, memorias,
habilidades y claves API.

**Durante la configuración inicial:** El asistente de configuración (`devbuddy setup`)
detecta automáticamente `~/.openclaw` y ofrece migrar antes de que comience la
configuración.

**En cualquier momento después de instalar:**

```bash
devbuddy claw migrate              # Migración interactiva (preset completo)
devbuddy claw migrate --dry-run    # Vista previa de qué se migraría
devbuddy claw migrate --preset user-data   # Migrar sin secretos
devbuddy claw migrate --overwrite  # Sobreescribir conflictos existentes
```

Qué se importa:

- **SOUL.md** — archivo de personalidad
- **Memorias** — entradas de MEMORY.md y USER.md
- **Habilidades** — habilidades creadas por el usuario → `~/.devbuddy/skills/openclaw-imports/`
- **Lista de comandos permitidos** — patrones de aprobación
- **Configuración de mensajería** — configuración de plataformas, usuarios permitidos, directorio de trabajo
- **Claves API** — secretos en lista de permitidos (Telegram, OpenRouter, OpenAI, Anthropic, ElevenLabs)
- **Assets de TTS** — archivos de audio del espacio de trabajo
- **Instrucciones del espacio de trabajo** — AGENTS.md (con `--workspace-target`)

Consulta `devbuddy claw migrate --help` para todas las opciones, o usa la habilidad
`openclaw-migration` para una migración guiada interactiva por el agente con vistas previas
de dry-run.

---

## Sobre este fork

Esta es una dirección de reescritura desde cero para el proyecto DevBuddy (antes una CLI
independiente en TypeScript): en lugar de seguir ampliando esa base de código más pequeña,
ahora está construido sobre la propia plataforma de agente de Hermes Agent (mucho más
grande, licencia MIT), rebautizado y apuntando a `~/.devbuddy` por defecto. No toda la marca
de Hermes se ha eliminado de cada rincón del código todavía — comentarios, algunos
identificadores por defecto de integraciones de terceros, y el sitio de documentación de
Hermes todavía dicen "Hermes" en algunos lugares. La estructura de módulos
(`devbuddy_cli/`, `devbuddy_constants.py`, `devbuddy_state*.py`, etc.), el comando de CLI
`devbuddy`, la ruta de datos por defecto, y el banner/skin de inicio están genuinamente
renombrados y probados.

Este es software de desarrollo cerrado — actualmente no acepta contribuciones externas.

---

## Licencia

MIT — ver [LICENSE](LICENSE). Construido sobre [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(MIT, Nous Research). Este fork está hecho por TokenBurners.
