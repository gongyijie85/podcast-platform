# backup-db.ps1: 备份 PostgreSQL 数据库到 backups/ 目录（Windows PowerShell 版）。
# 用法：
#   $env:DATABASE_URL = "postgresql://user:pass@host:5432/db"
#   .\infra\scripts\backup-db.ps1
# 或先设置系统环境变量，再运行脚本。

# 读取环境变量
$DatabaseUrl = $env:DATABASE_URL

# 检查 DATABASE_URL 是否设置
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    Write-Error "错误：未设置环境变量 DATABASE_URL。"
    Write-Host "示例：`$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/podcast'"
    exit 1
}

# 检查 pg_dump 是否可用
$PgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $PgDump) {
    Write-Error "错误：找不到 pg_dump 命令。"
    Write-Host "请安装 PostgreSQL 客户端工具："
    Write-Host "  - Windows: 从 https://www.postgresql.org/download/windows/ 下载安装，"
    Write-Host "    并把安装目录下的 bin 文件夹添加到系统 PATH。"
    Write-Host "  - 或者使用 WSL/Docker 运行 infra/scripts/backup-db.sh"
    exit 1
}

# 确定输出目录（脚本所在目录 ../../backups）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackupDir = Join-Path (Split-Path -Parent (Split-Path -Parent $ScriptDir)) "backups"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# 生成带时间戳的文件名（本地时间）
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "podcast_backup_${Timestamp}.sql"

Write-Host "==> 开始备份数据库"
Write-Host "    输出文件: $BackupFile"

# 执行备份
& pg_dump $DatabaseUrl --verbose --file="$BackupFile"

if ($LASTEXITCODE -ne 0) {
    Write-Error "备份失败，pg_dump 返回代码: $LASTEXITCODE"
    exit $LASTEXITCODE
}

# 显示结果
$FileSize = (Get-Item $BackupFile).Length
$FileSizeReadable = if ($FileSize -gt 1MB) { "{0:N2} MB" -f ($FileSize / 1MB) } else { "{0:N2} KB" -f ($FileSize / 1KB) }
Write-Host "==> 备份完成: $BackupFile ($FileSizeReadable)"
