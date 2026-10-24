const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/services - Lấy danh sách dịch vụ đang hoạt động
router.get('/', async (req, res, next) => {
  try {
    const { res: result } = await db.query(
      'SELECT id, name, category, description, duration_minutes, price, icon FROM services WHERE is_active = TRUE ORDER BY id ASC'
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/services/:id - Chi tiết dịch vụ
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { res: result } = await db.query(
      'SELECT id, name, category, description, duration_minutes, price, icon FROM services WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
