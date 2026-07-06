# 说明文件：backend 镜像已统一使用根目录的 Dockerfile
#
# 权威版本：podcast-platform/backend/Dockerfile
# 该文件用于 Render 生产部署，也是 docker-compose.yml 中 backend 服务的构建来源。
#
# 如果你之前引用过 infra/docker/backend.Dockerfile，请改为：
#   dockerfile: backend/Dockerfile
#   context: .
#
# 保留本目录仅作为历史兼容，避免旧文档/脚本中的路径失效。
