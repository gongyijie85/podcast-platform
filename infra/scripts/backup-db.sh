#!/usr/bin/env bash
# backup-db.sh: 备份 PostgreSQL 数据库到 backups/ 目录。
# 用法：
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./infra/scripts/backup-db.sh
#   或先 export DATABASE_URL，再运行脚本。
set -euo pipefail

# 读取环境变量
DATABASE_URL="${DATABASE_URL:-}"

# 检查 DATABASE_URL 是否设置
if [ -z "$DATABASE_URL" ]; then
  echo "错误：未设置环境变量 DATABASE_URL。" >&2
  echo "示例：export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/podcast'" >&2
  exit 1
fi

# 检查 pg_dump 是否可用
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "错误：找不到 pg_dump 命令。" >&2
  echo "请安装 PostgreSQL 客户端工具：" >&2
  echo "  - Debian/Ubuntu: apt-get install postgresql-client" >&2
  echo "  - macOS: brew install libpq 或 brew install postgresql" >&2
  echo "  - Windows: 使用 infra/scripts/backup-db.ps1" >&2
  exit 1
fi

# 确定输出目录（脚本所在目录 ../../backups）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../../backups"
mkdir -p "$BACKUP_DIR"

# 生成带时间戳的文件名（北京时间/上海时间）
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/podcast_backup_${TIMESTAMP}.sql"

echo "==> 开始备份数据库"
echo "    输出文件: ${BACKUP_FILE}"

# 执行备份
pg_dump "$DATABASE_URL" --verbose --file="$BACKUP_FILE"

# 显示结果
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "==> 备份完成: ${BACKUP_FILE} (${FILE_SIZE})"
