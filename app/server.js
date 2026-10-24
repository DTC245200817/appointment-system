const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const client = require('prom-client');
require('dotenv').config();

const db = require('./config/database');
const servicesRouter = require('./routes/services');
const appointmentsRouter = require('./routes/appointments');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CẤU HÌNH LOGGING TẬP TRUNG (WINSTON -> STDOUT & FILE CHO PROMTAIL/LOKI)
const logDir = process.env.LOG_DIR || (fs.existsSync('/var/log/app') ? '/var/log/app' : path.join(__dirname, '../logs/app'));
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'appointment-app', environment: process.env.NODE_ENV || 'production' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 2 ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});
app.locals.logger = logger;

// 2. CẤU HÌNH HỆ THỐNG GIÁM SÁT PROMETHEUS METRICS (prom-client)
const register = new client.Registry();
register.setDefaultLabels({
  app: 'appointment-system',
  version: '1.0.0',
});

// Thu thập metrics mặc định của Node.js (CPU, Memory Heap/RSS, Event Loop)
client.collectDefaultMetrics({ register });

// Metrics tùy biến đo lường HTTP Requests
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Tong so luong HTTP requests da nhan',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestCounter);

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thoi gian xu ly HTTP request tinh bang giay',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});
register.registerMetric(httpRequestDuration);

// Metrics nghiệp vụ Đặt lịch hẹn
const appointmentBookingsTotal = new client.Counter({
  name: 'appointment_bookings_total',
  help: 'Tong so lich hen da duoc dat',
  labelNames: ['service', 'status'],
});
register.registerMetric(appointmentBookingsTotal);

// Metrics giám sát Database PostgreSQL (Tuân thủ Tiêu chí 4: Giám sát Container, Web server và Database)
const dbConnectionStatus = new client.Gauge({
  name: 'db_connection_status',
  help: 'Trang thai ket noi PostgreSQL Database (1: OK, 0: Mat ket noi)',
});
dbConnectionStatus.set(1);
register.registerMetric(dbConnectionStatus);

const dbQueriesTotal = new client.Counter({
  name: 'db_queries_total',
  help: 'Tong so luong truy van Database da thuc hien',
  labelNames: ['table_target', 'status'],
});
register.registerMetric(dbQueriesTotal);

app.locals.metrics = {
  httpRequestCounter,
  httpRequestDuration,
  appointmentBookingsTotal,
  dbConnectionStatus,
  dbQueriesTotal,
};

// 3. MIDDLEWARES
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware đo thời gian và log HTTP request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationSec = (Date.now() - start) / 1000;
    const route = req.baseUrl || req.path || 'unknown';

    // Đừng track metrics cho /metrics chính nó để tránh noise
    if (req.path !== '/metrics') {
      httpRequestCounter.inc({
        method: req.method,
        route,
        status_code: res.statusCode,
      });

      httpRequestDuration.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode,
        },
        durationSec
      );

      logger.info('HTTP_REQUEST', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: Math.round(durationSec * 1000),
        ip: req.ip || req.headers['x-forwarded-for'],
      });
    }
  });
  next();
});

// Phục vụ giao diện tĩnh
app.use(express.static(path.join(__dirname, 'public')));

// 4. API ROUTES
app.use('/api/services', servicesRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/admin', adminRouter);

// Endpoint Health Check cho Docker & Prometheus
app.get('/api/health', async (req, res) => {
  try {
    const { res: dbRes } = await db.query('SELECT NOW() as now, current_database()');
    dbConnectionStatus.set(1);
    dbQueriesTotal.inc({ table_target: 'healthcheck', status: 'success' });
    res.json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        status: 'CONNECTED',
        db_name: dbRes.rows[0].current_database,
        server_time: dbRes.rows[0].now,
      },
    });
  } catch (err) {
    dbConnectionStatus.set(0);
    dbQueriesTotal.inc({ table_target: 'healthcheck', status: 'error' });
    logger.error('Healthcheck failed: Database unreachable', { error: err.message });
    res.status(503).json({
      status: 'DOWN',
      database: 'DISCONNECTED',
      error: err.message,
    });
  }
});

// Endpoint Prometheus Scrape Metrics
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Route xem trang quản trị
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
  });
});

// 5. KHỞI CHẠY SERVER
async function startServer() {
  try {
    logger.info('Đang kiểm tra kết nối PostgreSQL Database...');
    const connInfo = await db.testConnection(15, 3000);
    logger.info('Kết nối PostgreSQL thành công!', { info: connInfo.info });

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Appointment System Web App đang chạy tại port ${PORT}`);
      logger.info(`-> Healthcheck: http://localhost:${PORT}/api/health`);
      logger.info(`-> Metrics:     http://localhost:${PORT}/metrics`);
    });
  } catch (err) {
    logger.error('Không thể kết nối đến PostgreSQL sau nhiều lần thử:', { error: err.message });
    // Vẫn mở server để hiển thị thông báo lỗi trên UI/healthcheck thay vì crash
    app.listen(PORT, '0.0.0.0', () => {
      logger.warn(`Server khởi động ở chế độ hạn chế (chưa có DB) tại port ${PORT}`);
    });
  }
}

startServer();
