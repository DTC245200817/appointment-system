# ==============================================================================
# DOCKERFILE - APPOINTMENT SYSTEM (NODE.JS EXPRESS)
# Tuân thủ Tiêu chí 6: Hardening (Non-root user, multi-stage, bảo mật container)
# ==============================================================================

FROM node:20-alpine AS base

# Cài đặt wget cho healthcheck và tạo thư mục
RUN apk add --no-cache wget tzdata
ENV TZ=Asia/Ho_Chi_Minh

WORKDIR /app

# Hardening: Tạo non-root user và group riêng biệt (UID/GID 1001)
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy file định nghĩa phụ thuộc
COPY package*.json ./

# Cài đặt dependencies (sạch sẽ, tối ưu)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy toàn bộ mã nguồn ứng dụng
COPY --chown=appuser:appgroup . .

# Tạo thư mục log và phân quyền cho appuser
RUN mkdir -p /var/log/app && \
    chown -R appuser:appgroup /var/log/app /app

# Hardening: Chuyển sang non-root user (Không chạy quyền root trong container)
USER appuser

# Biến môi trường mặc định
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_DIR=/var/log/app

EXPOSE 3000

# Container Healthcheck
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
