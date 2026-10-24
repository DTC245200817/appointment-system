// ==============================================================================
// MEDSCHEDULE ADMIN PORTAL - CLIENT APPLICATION LOGIC
// ==============================================================================

const adminState = {
  token: localStorage.getItem('admin_token') || '',
  currentFilterStatus: 'all',
  appointments: [],
  services: [],
  currentUser: null,
};

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  startLiveClock();
});

// 1. QUẢN LÝ XÁC THỰC (AUTHENTICATION & SESSION)
async function initAdminAuth() {
  const loginSec = document.getElementById('adminLoginSection');
  const dashSec = document.getElementById('adminDashboardSection');

  if (!adminState.token) {
    loginSec.style.display = 'flex';
    dashSec.style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/admin/verify', {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      adminState.currentUser = data.user;
      loginSec.style.display = 'none';
      dashSec.style.display = 'flex';

      if (data.user && data.user.fullName) {
        document.getElementById('adminProfileName').textContent = `${data.user.fullName} (Admin)`;
      }

      loadAdminData();
      loadServicesForWalkin();
      // Tự động làm mới mỗi 25 giây
      setInterval(loadAdminData, 25000);
    } else {
      adminState.token = '';
      localStorage.removeItem('admin_token');
      loginSec.style.display = 'flex';
      dashSec.style.display = 'none';
    }
  } catch (err) {
    adminState.token = '';
    localStorage.removeItem('admin_token');
    loginSec.style.display = 'flex';
    dashSec.style.display = 'none';
  }
}

// Điền nhanh thông tin Demo cho giảng viên / giám khảo
function autoFillDemoCredentials() {
  document.getElementById('adminUser').value = 'admin';
  document.getElementById('adminPass').value = 'Admin@2026!';
  showAdminToast('Đã tự động điền tài khoản & mật khẩu Demo!', 'info');
}

function togglePasswordVisibility() {
  const passInput = document.getElementById('adminPass');
  const icon = document.getElementById('togglePassIcon');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    passInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

async function submitAdminLogin() {
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value;
  const btn = document.getElementById('btnLoginSubmit');

  if (!user || !pass) {
    showAdminToast('Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.', 'error');
    return;
  }

  btn.setAttribute('disabled', 'true');
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang xác thực...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });

    const data = await res.json();
    btn.removeAttribute('disabled');
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';

    if (res.ok && data.success && data.token) {
      adminState.token = data.token;
      localStorage.setItem('admin_token', data.token);
      showAdminToast('Đăng nhập thành công! Đang mở bảng điều khiển...', 'success');

      document.getElementById('adminLoginSection').style.display = 'none';
      document.getElementById('adminDashboardSection').style.display = 'flex';

      loadAdminData();
      loadServicesForWalkin();
    } else {
      showAdminToast(data.message || 'Tài khoản hoặc mật khẩu không đúng!', 'error');
    }
  } catch (err) {
    btn.removeAttribute('disabled');
    btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';
    showAdminToast('Lỗi kết nối máy chủ khi đăng nhập.', 'error');
  }
}

async function adminLogout() {
  if (!confirm('Bạn có chắc chắn muốn đăng xuất khỏi cổng quản trị?')) return;

  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });
  } catch (err) {}

  adminState.token = '';
  localStorage.removeItem('admin_token');
  showAdminToast('Đã đăng xuất an toàn khỏi hệ thống.', 'info');
  document.getElementById('adminDashboardSection').style.display = 'none';
  document.getElementById('adminLoginSection').style.display = 'flex';
}

// 2. TẢI DỮ LIỆU TỔNG QUAN
async function loadAdminData() {
  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshIcon) refreshIcon.classList.add('fa-spin');

  await Promise.all([loadStats(), loadAppointments()]);

  if (refreshIcon) {
    setTimeout(() => refreshIcon.classList.remove('fa-spin'), 600);
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });

    if (res.status === 401) {
      adminLogout();
      return;
    }

    const json = await res.json();
    if (!json.success) return;

    const ov = json.overview || {};
    document.getElementById('kpiTotal').textContent = ov.total_appointments || 0;
    document.getElementById('kpiPending').textContent = ov.pending_count || 0;
    document.getElementById('kpiConfirmed').textContent = ov.confirmed_count || 0;
    document.getElementById('kpiCompleted').textContent = ov.completed_count || 0;
    document.getElementById('kpiRevenue').textContent = formatCurrency(json.totalRevenue || 0);

    // Cập nhật số đếm trên các filter pills
    document.getElementById('countAll').textContent = ov.total_appointments || 0;
    document.getElementById('countPending').textContent = ov.pending_count || 0;
    document.getElementById('countConfirmed').textContent = ov.confirmed_count || 0;
    document.getElementById('countCompleted').textContent = ov.completed_count || 0;
    document.getElementById('countCancelled').textContent = ov.cancelled_count || 0;
  } catch (err) {
    console.error('Lỗi khi tải thống kê:', err);
  }
}

function setFilterStatus(status) {
  adminState.currentFilterStatus = status;
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
  loadAppointments();
}

async function loadAppointments() {
  const status = adminState.currentFilterStatus;
  const date = document.getElementById('adminFilterDate').value;
  const search = document.getElementById('adminSearchInput').value.trim();
  const tbody = document.getElementById('adminTableBody');

  try {
    let url = `/api/admin/appointments?status=${encodeURIComponent(status)}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });

    if (res.status === 401) {
      adminLogout();
      return;
    }

    const json = await res.json();

    if (!json.success || !json.data || json.data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3rem 0; color: var(--text-muted);">
            <i class="fa-regular fa-folder-open fa-2x" style="opacity:0.3; margin-bottom: 0.8rem;"></i>
            <p>Không tìm thấy lịch hẹn nào theo điều kiện tìm kiếm/lọc.</p>
          </td>
        </tr>
      `;
      adminState.appointments = [];
      return;
    }

    adminState.appointments = json.data;
    renderAppointmentsTable(json.data);
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--rose-light); padding: 2rem;">
          <i class="fa-solid fa-triangle-exclamation"></i> Lỗi máy chủ khi tải danh sách lịch hẹn.
        </td>
      </tr>
    `;
  }
}

function renderAppointmentsTable(data) {
  const tbody = document.getElementById('adminTableBody');
  const todayStr = getTodayString();

  tbody.innerHTML = data.map(apt => {
    const isToday = apt.appointment_date === todayStr;
    const isPast = apt.appointment_date < todayStr;
    let dateBadge = '';
    if (isToday) {
      dateBadge = '<span style="font-size:0.7rem; padding:0.12rem 0.45rem; border-radius:999px; background:#ecfdf5; color:#059669; font-weight:700; border:1px solid #a7f3d0; white-space:nowrap; display:inline-block;">Hôm nay</span>';
    } else if (isPast) {
      dateBadge = '<span style="font-size:0.7rem; padding:0.12rem 0.45rem; border-radius:999px; background:#f1f5f9; color:#64748b; font-weight:600; border:1px solid #cbd5e1; white-space:nowrap; display:inline-block;">Đã qua</span>';
    }

    const patientInitial = apt.customer_name ? apt.customer_name.trim().charAt(0).toUpperCase() : 'B';

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span class="apt-code-badge">${escapeHtml(apt.booking_code)}</span>
            <button class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;" onclick="navigator.clipboard.writeText('${apt.booking_code}'); showAdminToast('Đã copy mã ${apt.booking_code}', 'info');" title="Sao chép mã">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </td>
        <td>
          <div class="patient-cell">
            <div class="patient-avatar">${patientInitial}</div>
            <div class="patient-info">
              <strong>${escapeHtml(apt.customer_name)}</strong>
              <small><i class="fa-solid fa-phone"></i> ${escapeHtml(apt.customer_phone)}</small>
            </div>
          </div>
        </td>
        <td>
          <strong style="color:var(--text-main); font-size:0.92rem;">${escapeHtml(apt.service_name)}</strong>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.25rem;">
            <span style="font-size:0.72rem; padding:0.15rem 0.5rem; border-radius:var(--radius-full); background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; font-weight:600;">${escapeHtml(apt.category || 'Khám')}</span>
            <span style="color:#0284c7; font-weight:700; font-size:0.88rem;">${formatCurrency(apt.price)}</span>
          </div>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:0.2rem;">
            <div style="display:flex; align-items:center; gap:0.4rem; white-space:nowrap;">
              <span style="font-weight:700; color:#0f172a; font-size:0.92rem;">${formatDate(apt.appointment_date)}</span>
              ${dateBadge}
            </div>
            <div style="font-size:0.84rem; color:#0284c7; font-weight:600; display:inline-flex; align-items:center; gap:0.35rem;">
              <i class="fa-regular fa-clock"></i> ${apt.appointment_time}
            </div>
          </div>
        </td>
        <td style="white-space: nowrap; min-width: 140px;">
          ${getStatusBadge(apt.status)}
        </td>
        <td style="max-width:200px;">
          <div style="font-size:0.84rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(apt.notes || '—')}">
            ${escapeHtml(apt.notes || '—')}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="table-actions" style="justify-content: flex-end;">
            ${apt.status === 'pending' ? `
              <button class="action-btn btn-approve" onclick="updateAppointmentStatus(${apt.id}, 'confirmed')" title="Phê duyệt lịch hẹn">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
            ${apt.status === 'confirmed' ? `
              <button class="action-btn btn-complete" onclick="updateAppointmentStatus(${apt.id}, 'completed')" title="Đánh dấu đã khám xong">
                <i class="fa-solid fa-user-check"></i>
              </button>
            ` : ''}
            ${apt.status !== 'cancelled' && apt.status !== 'completed' ? `
              <button class="action-btn btn-cancel" onclick="updateAppointmentStatus(${apt.id}, 'cancelled')" title="Hủy lịch hẹn">
                <i class="fa-solid fa-ban"></i>
              </button>
            ` : ''}
            <button class="action-btn btn-view" onclick="viewAppointmentDetail(${apt.id})" title="Xem hồ sơ chi tiết">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="action-btn btn-delete" onclick="deleteAppointment(${apt.id}, '${apt.booking_code}')" title="Xóa lịch hẹn">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 3. THAO TÁC CẬP NHẬT TRẠNG THÁI & XÓA
async function updateAppointmentStatus(id, newStatus) {
  const statusLabels = {
    confirmed: 'phê duyệt',
    completed: 'hoàn thành',
    cancelled: 'hủy'
  };

  const confirmMsg = `Bạn có chắc muốn ${statusLabels[newStatus] || newStatus} lịch hẹn này?`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/admin/appointments/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showAdminToast(data.message || 'Cập nhật trạng thái thành công!', 'success');
      loadAdminData();
    } else {
      showAdminToast(data.message || 'Không thể cập nhật trạng thái.', 'error');
    }
  } catch (err) {
    showAdminToast('Lỗi máy chủ khi cập nhật trạng thái.', 'error');
  }
}

async function deleteAppointment(id, code) {
  if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn lịch hẹn ${code}?`)) return;

  try {
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminState.token}` }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showAdminToast(data.message || `Đã xóa lịch hẹn ${code}!`, 'success');
      loadAdminData();
    } else {
      showAdminToast(data.message || 'Không thể xóa lịch hẹn.', 'error');
    }
  } catch (err) {
    showAdminToast('Lỗi kết nối máy chủ khi xóa lịch.', 'error');
  }
}

// 4. XEM CHI TIẾT LỊCH HẸN
function viewAppointmentDetail(id) {
  const apt = adminState.appointments.find(a => a.id === id);
  if (!apt) return;

  const modalBody = document.getElementById('detailModalBody');
  const modalFooter = document.getElementById('detailModalFooter');

  modalBody.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:1.4rem; margin-bottom:1.5rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding-bottom:0.8rem; border-bottom:1px solid #e2e8f0;">
        <span class="apt-code-badge" style="font-size:1rem;"><i class="fa-solid fa-ticket"></i> ${escapeHtml(apt.booking_code)}</span>
        ${getStatusBadge(apt.status)}
      </div>

      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:1.2rem;">
        <div>
          <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Họ và Tên Bệnh Nhân:</span>
          <h4 style="color:#0f172a; font-size:1.15rem; font-weight:800; margin-top:0.2rem;">${escapeHtml(apt.customer_name)}</h4>
        </div>
        <div>
          <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Số Điện Thoại:</span>
          <div style="color:#0284c7; font-weight:700; font-size:1.05rem; margin-top:0.2rem;">
            <i class="fa-solid fa-phone"></i> ${escapeHtml(apt.customer_phone)}
          </div>
        </div>
        <div>
          <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Dịch Vụ Khám:</span>
          <div style="color:#0f172a; font-weight:700; font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(apt.service_name)}</div>
          <span style="color:#0284c7; font-weight:700; font-size:0.9rem;">${formatCurrency(apt.price)}</span>
        </div>
        <div>
          <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Thời Gian Hẹn:</span>
          <div style="color:#0f172a; font-weight:700; font-size:0.95rem; margin-top:0.2rem;">${formatDate(apt.appointment_date)}</div>
          <span style="color:#0284c7; font-weight:600;"><i class="fa-regular fa-clock"></i> ${apt.appointment_time}</span>
        </div>
        <div style="grid-column: 1 / -1;">
          <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Email:</span>
          <div style="color:#334155; font-weight:500;">${escapeHtml(apt.customer_email || 'Chưa cung cấp')}</div>
        </div>
      </div>
    </div>

    <div style="margin-bottom:1rem;">
      <label style="font-size:0.8rem; color:#475569; text-transform:uppercase; font-weight:700;">Ghi Chú Triệu Chứng / Bệnh Án:</label>
      <div style="margin-top:0.4rem; padding:0.9rem 1.1rem; background:#f8fafc; border-radius:var(--radius-sm); border:1px solid #e2e8f0; color:#1e293b; font-size:0.92rem; line-height:1.5;">
        ${escapeHtml(apt.notes || 'Không có ghi chú thêm.')}
      </div>
    </div>
  `;

  modalFooter.innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('detailModal')">Đóng</button>
    ${apt.status === 'pending' ? `<button class="btn btn-success" onclick="closeModal('detailModal'); updateAppointmentStatus(${apt.id}, 'confirmed')"><i class="fa-solid fa-check"></i> Phê Duyệt Ngay</button>` : ''}
    ${apt.status === 'confirmed' ? `<button class="btn btn-primary" onclick="closeModal('detailModal'); updateAppointmentStatus(${apt.id}, 'completed')"><i class="fa-solid fa-user-check"></i> Hoàn Thành Khám</button>` : ''}
    <button class="btn btn-secondary" onclick="window.print()"><i class="fa-solid fa-print"></i> In Hồ Sơ</button>
  `;

  openModal('detailModal');
}

// 5. TIẾP NHẬN ĐẶT LỊCH TẠI QUẦY (WALK-IN)
async function loadServicesForWalkin() {
  const select = document.getElementById('walkinServiceSelect');
  try {
    const res = await fetch('/api/services');
    const json = await res.json();
    if (json.success && json.data) {
      adminState.services = json.data;
      select.innerHTML = '<option value="">-- Chọn dịch vụ khám --</option>' + json.data.map(s => `
        <option value="${s.id}">${escapeHtml(s.name)} - ${formatCurrency(s.price)}</option>
      `).join('');
    }
  } catch (err) {}
}

function openNewAppointmentModal() {
  document.getElementById('newWalkinForm').reset();
  document.getElementById('walkinDate').value = getTodayString();
  openModal('newAppointmentModal');
}

async function submitWalkinAppointment() {
  const srvId = document.getElementById('walkinServiceSelect').value;
  const name = document.getElementById('walkinName').value.trim();
  const phone = document.getElementById('walkinPhone').value.trim();
  const date = document.getElementById('walkinDate').value;
  const time = document.getElementById('walkinTime').value;
  const notes = document.getElementById('walkinNotes').value.trim();
  const btn = document.getElementById('btnSubmitWalkin');

  if (!srvId || !name || !phone || !date || !time) {
    showAdminToast('Vui lòng điền đầy đủ các thông tin bắt buộc.', 'error');
    return;
  }

  btn.setAttribute('disabled', 'true');
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang lưu...';

  try {
    const res = await fetch('/api/admin/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminState.token}`
      },
      body: JSON.stringify({
        service_id: srvId,
        customer_name: name,
        customer_phone: phone,
        appointment_date: date,
        appointment_time: time,
        notes: notes || 'Tiếp nhận trực tiếp tại quầy',
        status: 'confirmed'
      })
    });

    const data = await res.json();
    btn.removeAttribute('disabled');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Lưu & Phê Duyệt Ngay';

    if (res.ok && data.success) {
      showAdminToast(data.message || 'Tiếp nhận lịch hẹn tại quầy thành công!', 'success');
      closeModal('newAppointmentModal');
      loadAdminData();
    } else {
      showAdminToast(data.message || 'Lỗi khi tạo lịch hẹn.', 'error');
    }
  } catch (err) {
    btn.removeAttribute('disabled');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Lưu & Phê Duyệt Ngay';
    showAdminToast('Lỗi máy chủ khi tạo lịch hẹn.', 'error');
  }
}

// 6. XUẤT FILE CSV
function exportToCSV() {
  if (adminState.appointments.length === 0) {
    showAdminToast('Không có dữ liệu lịch hẹn để xuất file.', 'error');
    return;
  }

  const headers = ['Mã Đặt Lịch', 'Họ Tên Khách Hàng', 'Số Điện Thoại', 'Email', 'Dịch Vụ Khám', 'Chi Phí (VND)', 'Ngày Hẹn', 'Giờ Hẹn', 'Trạng Thái', 'Ghi Chú'];
  const rows = adminState.appointments.map(a => [
    `"${a.booking_code}"`,
    `"${a.customer_name}"`,
    `"${a.customer_phone}"`,
    `"${a.customer_email || ''}"`,
    `"${a.service_name}"`,
    `"${a.price}"`,
    `"${a.appointment_date}"`,
    `"${a.appointment_time}"`,
    `"${a.status}"`,
    `"${(a.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Bao_Cao_Lich_Hen_${getTodayString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showAdminToast('Đã xuất danh sách lịch hẹn ra file CSV thành công!', 'success');
}

// 7. TIỆN ÍCH HỆ THỐNG
function toggleDevOpsPanel() {
  const content = document.getElementById('devopsPanelContent');
  const icon = document.getElementById('devopsToggleIcon');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.classList.remove('fa-chevron-right');
    icon.classList.add('fa-chevron-down');
  } else {
    content.style.display = 'none';
    icon.classList.remove('fa-chevron-down');
    icon.classList.add('fa-chevron-right');
  }
}

function startLiveClock() {
  const clockEl = document.getElementById('adminLiveClock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    clockEl.textContent = `${hh}:${mm}:${ss} • ${dd}/${MM}/${yyyy}`;
  }

  update();
  setInterval(update, 1000);
}

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
}

function getStatusBadge(status) {
  switch (status) {
    case 'pending':
      return '<span class="status-pill pending" style="white-space:nowrap;"><span class="dot"></span> Chờ Duyệt</span>';
    case 'confirmed':
      return '<span class="status-pill confirmed" style="white-space:nowrap;"><i class="fa-solid fa-circle-check"></i> Đã Duyệt</span>';
    case 'completed':
      return '<span class="status-pill completed" style="white-space:nowrap;"><i class="fa-solid fa-user-check"></i> Khám Xong</span>';
    case 'cancelled':
      return '<span class="status-pill cancelled" style="white-space:nowrap;"><i class="fa-solid fa-ban"></i> Đã Hủy</span>';
    default:
      return `<span class="status-pill" style="white-space:nowrap;">${status}</span>`;
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showAdminToast(message, type = 'info') {
  const container = document.getElementById('adminToastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-circle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
