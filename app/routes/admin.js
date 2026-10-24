const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/database');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2026!';
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'medschedule_secure_secret_token_key_2026!';

// Helper: Ký và kiểm tra token an toàn bằng HMAC-SHA256 (Node crypto)
function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Token hết hạn
    }
    return payload;
  } catch (err) {
    return null;
  }
}

// Middleware xác thực quyền Quản trị viên (Admin Hardening)
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Yêu cầu đăng nhập tài khoản Quản trị viên để truy cập.',
    });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      message: 'Phiên làm việc đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
    });
  }

  req.adminUser = payload;
  next();
}

// -----------------------------------------------------------------------------
// AUTHENTICATION ROUTES (Đăng nhập / Đăng xuất / Xác thực token)
// -----------------------------------------------------------------------------

// POST /api/admin/login - Đăng nhập Quản trị viên
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp cả tên đăng nhập và mật khẩu.',
      });
    }

    if (username.trim() !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      if (req.app.locals.logger) {
        req.app.locals.logger.warn('ADMIN_LOGIN_FAILED', {
          action: 'LOGIN_FAILURE',
          attempted_username: username,
          ip: req.ip || req.headers['x-forwarded-for'],
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác!',
      });
    }

    const payload = {
      username: ADMIN_USERNAME,
      role: 'admin',
      fullName: 'Nguyễn Minh Ngọc',
      iat: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000, // Hiệu lực 24 giờ
    };

    const token = signToken(payload);

    if (req.app.locals.logger) {
      req.app.locals.logger.info('ADMIN_LOGIN_SUCCESS', {
        action: 'LOGIN_SUCCESS',
        username: ADMIN_USERNAME,
        ip: req.ip || req.headers['x-forwarded-for'],
      });
    }

    res.json({
      success: true,
      message: 'Đăng nhập thành công vào bảng điều khiển quản trị!',
      token,
      user: {
        username: ADMIN_USERNAME,
        role: 'admin',
        fullName: 'Nguyễn Minh Ngọc',
        studentId: 'DTC245200817',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi đăng nhập.' });
  }
});

// GET /api/admin/verify - Kiểm tra phiên đăng nhập
router.get('/verify', requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    authenticated: true,
    user: req.adminUser,
  });
});

// POST /api/admin/logout - Đăng xuất
router.post('/logout', (req, res) => {
  if (req.app.locals.logger) {
    req.app.locals.logger.info('ADMIN_LOGOUT', { action: 'LOGOUT' });
  }
  res.json({
    success: true,
    message: 'Đã đăng xuất an toàn khỏi hệ thống.',
  });
});

// -----------------------------------------------------------------------------
// PROTECTED APPOINTMENT MANAGEMENT ROUTES
// -----------------------------------------------------------------------------

// GET /api/admin/appointments - Lấy danh sách lịch hẹn có bộ lọc
router.get('/appointments', requireAdminAuth, async (req, res, next) => {
  try {
    const { status, search, date } = req.query;
    let queryText = `
      SELECT a.id, a.booking_code, a.customer_name, a.customer_phone, a.customer_email,
             TO_CHAR(a.appointment_date, 'YYYY-MM-DD') as appointment_date, 
             a.appointment_time, a.notes, a.status, a.created_at,
             s.name as service_name, s.price, s.category
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      queryText += ` AND a.status = $${params.length}`;
    }

    if (date) {
      params.push(date);
      queryText += ` AND a.appointment_date = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (a.booking_code ILIKE $${params.length} OR a.customer_name ILIKE $${params.length} OR a.customer_phone ILIKE $${params.length})`;
    }

    queryText += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT 150`;

    const { res: result } = await db.query(queryText, params);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/appointments - Tạo lịch hẹn trực tiếp tại quầy (Walk-in)
router.post('/appointments', requireAdminAuth, async (req, res, next) => {
  try {
    const { service_id, customer_name, customer_phone, customer_email, appointment_date, appointment_time, notes, status } = req.body;

    if (!service_id || !customer_name || !customer_phone || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: dịch vụ, tên bệnh nhân, số điện thoại, ngày và giờ hẹn.',
      });
    }

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let bookingCode = 'APT-';
    for (let i = 0; i < 6; i++) {
      codeChar = chars.charAt(Math.floor(Math.random() * chars.length));
      bookingCode += codeChar;
    }

    const { res: insertRes } = await db.query(
      `INSERT INTO appointments 
       (booking_code, service_id, customer_name, customer_phone, customer_email, appointment_date, appointment_time, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, booking_code, service_id, customer_name, customer_phone, 
                 TO_CHAR(appointment_date, 'YYYY-MM-DD') as appointment_date, 
                 appointment_time, notes, status, created_at`,
      [bookingCode, service_id, customer_name.trim(), customer_phone.trim(), customer_email || null, appointment_date, appointment_time, notes || 'Đặt trực tiếp tại quầy', status || 'confirmed']
    );

    if (req.app.locals.logger) {
      req.app.locals.logger.info('APPOINTMENT_CREATED_BY_ADMIN', {
        action: 'ADMIN_CREATE',
        booking_code: bookingCode,
        admin: req.adminUser.username,
      });
    }

    res.status(201).json({
      success: true,
      message: `Tạo lịch hẹn thành công với mã ${bookingCode}!`,
      data: insertRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/appointments/:id/status - Cập nhật trạng thái lịch hẹn
router.patch('/appointments/:id/status', requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Cho phép: ${validStatuses.join(', ')}`,
      });
    }

    const { res: updateRes } = await db.query(
      `UPDATE appointments SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING id, booking_code, status, customer_name, customer_phone`,
      [status, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn' });
    }

    const updated = updateRes.rows[0];

    if (req.app.locals.logger) {
      req.app.locals.logger.info('APPOINTMENT_STATUS_UPDATED', {
        action: 'UPDATE_STATUS',
        id,
        booking_code: updated.booking_code,
        new_status: status,
        updated_by: req.adminUser.username,
      });
    }

    res.json({
      success: true,
      message: `Đã cập nhật trạng thái lịch hẹn ${updated.booking_code} thành "${status}".`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/appointments/:id - Xóa lịch hẹn
router.delete('/appointments/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { res: delRes } = await db.query(
      `DELETE FROM appointments WHERE id = $1 RETURNING id, booking_code, customer_name`,
      [id]
    );

    if (delRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn cần xóa' });
    }

    if (req.app.locals.logger) {
      req.app.locals.logger.warn('APPOINTMENT_DELETED', {
        action: 'DELETE_APPOINTMENT',
        id,
        booking_code: delRes.rows[0].booking_code,
        deleted_by: req.adminUser.username,
      });
    }

    res.json({
      success: true,
      message: `Đã xóa lịch hẹn ${delRes.rows[0].booking_code} thành công.`,
      data: delRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/stats - Thống kê tổng quan cho Dashboard
router.get('/stats', requireAdminAuth, async (req, res, next) => {
  try {
    // 1. Thống kê theo trạng thái
    const { res: statusStats } = await db.query(`
      SELECT 
        COUNT(*) as total_appointments,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count
      FROM appointments
    `);

    // 2. Thống kê theo dịch vụ
    const { res: serviceStats } = await db.query(`
      SELECT s.name, COUNT(a.id) as count, COALESCE(SUM(s.price), 0) as estimated_revenue
      FROM services s
      LEFT JOIN appointments a ON s.id = a.service_id AND a.status IN ('confirmed', 'completed')
      GROUP BY s.id, s.name
      ORDER BY count DESC
    `);

    // 3. Doanh thu ước tính
    const { res: revenueRes } = await db.query(`
      SELECT COALESCE(SUM(s.price), 0) as total_revenue
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.status IN ('confirmed', 'completed')
    `);

    res.json({
      success: true,
      overview: statusStats.rows[0],
      totalRevenue: Number(revenueRes.rows[0].total_revenue),
      byService: serviceStats.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
