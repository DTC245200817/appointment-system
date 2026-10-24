const express = require('express');
const router = express.Router();
const db = require('../config/database');

const ALL_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
  '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
];

// Sinh mã đặt lịch ngẫu nhiên dạng APT-XXXXXX
function generateBookingCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = 'APT-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET /api/appointments/available-slots?date=YYYY-MM-DD
router.get('/available-slots', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Tham số date là bắt buộc (YYYY-MM-DD)' });
    }

    const { res: result } = await db.query(
      `SELECT appointment_time FROM appointments 
       WHERE appointment_date = $1 AND status IN ('pending', 'confirmed')`,
      [date]
    );

    const bookedSlots = new Set(result.rows.map(r => r.appointment_time));
    const slotStatus = ALL_SLOTS.map(time => ({
      time,
      available: !bookedSlots.has(time),
    }));

    res.json({
      success: true,
      date,
      slots: slotStatus,
      totalSlots: ALL_SLOTS.length,
      availableSlotsCount: slotStatus.filter(s => s.available).length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments - Đặt lịch hẹn mới
router.post('/', async (req, res, next) => {
  try {
    const { service_id, customer_name, customer_phone, customer_email, appointment_date, appointment_time, notes } = req.body;

    if (!service_id || !customer_name || !customer_phone || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ các thông tin bắt buộc: dịch vụ, họ tên, số điện thoại, ngày hẹn và khung giờ.',
      });
    }

    // Validate định dạng số điện thoại Việt Nam
    const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
    if (!phoneRegex.test(customer_phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Số điện thoại không hợp lệ. Vui lòng nhập đúng số điện thoại (ví dụ: 0912345678).',
      });
    }

    // Kiểm tra dịch vụ có tồn tại không
    const { res: serviceRes } = await db.query('SELECT id, name, price FROM services WHERE id = $1 AND is_active = TRUE', [service_id]);
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dịch vụ được chọn không tồn tại hoặc đã ngừng hoạt động' });
    }
    const serviceInfo = serviceRes.rows[0];

    // Kiểm tra trùng slot giờ
    const { res: conflictRes } = await db.query(
      `SELECT id FROM appointments 
       WHERE appointment_date = $1 AND appointment_time = $2 AND status IN ('pending', 'confirmed')`,
      [appointment_date, appointment_time]
    );

    if (conflictRes.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Khung giờ ${appointment_time} ngày ${appointment_date} đã có người đặt trước. Vui lòng chọn khung giờ khác.`,
      });
    }

    // Tạo mã đặt lịch duy nhất
    let bookingCode;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      bookingCode = generateBookingCode();
      const check = await db.query('SELECT id FROM appointments WHERE booking_code = $1', [bookingCode]);
      if (check.res.rows.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    // Thêm vào database
    const insertQuery = `
      INSERT INTO appointments 
      (booking_code, service_id, customer_name, customer_phone, customer_email, appointment_date, appointment_time, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING id, booking_code, service_id, customer_name, customer_phone, customer_email, 
                TO_CHAR(appointment_date, 'YYYY-MM-DD') as appointment_date, 
                appointment_time, notes, status, created_at
    `;
    const { res: insertRes } = await db.query(insertQuery, [
      bookingCode,
      service_id,
      customer_name.trim(),
      customer_phone.trim(),
      customer_email ? customer_email.trim() : null,
      appointment_date,
      appointment_time,
      notes ? notes.trim() : null,
    ]);

    const createdAppointment = insertRes.rows[0];
    createdAppointment.service_name = serviceInfo.name;
    createdAppointment.price = serviceInfo.price;

    // Log sự kiện cho Promtail/Loki
    if (req.app.locals.logger) {
      req.app.locals.logger.info('APPOINTMENT_CREATED', {
        action: 'CREATE_APPOINTMENT',
        booking_code: bookingCode,
        service: serviceInfo.name,
        customer_phone: customer_phone.trim(),
        appointment_date,
        appointment_time,
      });
    }

    // Tăng metrics Prometheus
    if (req.app.locals.metrics && req.app.locals.metrics.appointmentBookingsTotal) {
      req.app.locals.metrics.appointmentBookingsTotal.inc({
        service: serviceInfo.name,
        status: 'pending',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Đặt lịch hẹn thành công! Mã tra cứu của bạn là ' + bookingCode,
      data: createdAppointment,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/lookup?keyword=...
router.get('/lookup', async (req, res, next) => {
  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã đặt lịch hoặc số điện thoại để tra cứu' });
    }

    const trimmed = keyword.trim().toUpperCase();
    const { res: result } = await db.query(
      `SELECT a.id, a.booking_code, a.customer_name, a.customer_phone, a.customer_email,
              TO_CHAR(a.appointment_date, 'YYYY-MM-DD') as appointment_date, 
              a.appointment_time, a.notes, a.status, a.created_at,
              s.name as service_name, s.price, s.duration_minutes
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.booking_code = $1 OR a.customer_phone = $2
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [trimmed, keyword.trim()]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/appointments/:id/cancel - Khách hàng hủy lịch
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { booking_code } = req.body;

    const { res: existing } = await db.query('SELECT id, status, booking_code FROM appointments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn' });
    }

    if (booking_code && existing.rows[0].booking_code !== booking_code) {
      return res.status(403).json({ success: false, message: 'Mã đặt lịch không trùng khớp' });
    }

    if (existing.rows[0].status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Lịch hẹn này đã bị hủy trước đó' });
    }

    if (existing.rows[0].status === 'completed') {
      return res.status(400).json({ success: false, message: 'Lịch hẹn đã hoàn thành, không thể hủy' });
    }

    const { res: updateRes } = await db.query(
      `UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 RETURNING id, booking_code, status`,
      [id]
    );

    if (req.app.locals.logger) {
      req.app.locals.logger.warn('APPOINTMENT_CANCELLED', {
        action: 'CANCEL_APPOINTMENT',
        booking_code: existing.rows[0].booking_code,
        id,
      });
    }

    res.json({
      success: true,
      message: 'Hủy lịch hẹn thành công',
      data: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
