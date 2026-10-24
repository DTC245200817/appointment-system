// ==============================================================================
// MEDSCHEDULE APPOINTMENT SYSTEM - CLIENT APPLICATION LOGIC
// ==============================================================================

const state = {
  currentStep: 1,
  services: [],
  filteredServices: [],
  selectedCategory: 'all',
  selectedService: null,
  selectedDate: '',
  selectedSlot: '',
  customer: {
    name: '',
    phone: '',
    email: '',
    gender: 'male',
    notes: '',
  },
  lastBookingCode: '',
};

document.addEventListener('DOMContentLoaded', () => {
  checkSystemHealth();
  initDatePicker();
  loadServices();
});

// 1. KIỂM TRA SỨC KHỎE HỆ THỐNG
async function checkSystemHealth() {
  const statusEl = document.getElementById('systemHealthText');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.status === 'UP') {
      statusEl.textContent = 'Hệ thống trực tuyến 24/7';
    } else {
      statusEl.textContent = 'Bảo trì dữ liệu';
    }
  } catch (err) {
    statusEl.textContent = 'Đang ngoại tuyến';
  }
}

// 2. CHUYỂN ĐỔI TAB CHÍNH (ĐẶT LỊCH / TRA CỨU)
function switchMainTab(tab) {
  const tabBook = document.getElementById('btnTabBook');
  const tabLookup = document.getElementById('btnTabLookup');
  const bookSec = document.getElementById('bookingSection');
  const lookupSec = document.getElementById('lookupSection');

  if (tab === 'book') {
    tabBook.classList.add('active');
    tabLookup.classList.remove('active');
    bookSec.classList.add('active');
    lookupSec.classList.remove('active');
  } else {
    tabLookup.classList.add('active');
    tabBook.classList.remove('active');
    lookupSec.classList.add('active');
    bookSec.classList.remove('active');
  }
}

// 3. TẢI VÀ LỌC DỊCH VỤ (BƯỚC 1)
async function loadServices() {
  const grid = document.getElementById('servicesGrid');
  try {
    const res = await fetch('/api/services');
    const json = await res.json();
    if (!json.success || !json.data || json.data.length === 0) {
      grid.innerHTML = '<p class="text-muted" style="text-align:center; grid-column: 1/-1;">Chưa có dịch vụ nào trong hệ thống.</p>';
      return;
    }

    state.services = json.data;
    state.filteredServices = [...state.services];
    renderServices();
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--rose-light); text-align:center; grid-column: 1/-1;"><i class="fa-solid fa-triangle-exclamation"></i> Không thể kết nối đến máy chủ lấy danh sách dịch vụ.</p>';
  }
}

function filterServices(category) {
  state.selectedCategory = category;
  document.querySelectorAll('.category-chip').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(category) || (category === 'all' && btn.textContent.includes('Tất cả')));
  });

  if (category === 'all') {
    state.filteredServices = [...state.services];
  } else {
    state.filteredServices = state.services.filter(s => s.category.toLowerCase().includes(category.toLowerCase()));
  }
  renderServices();
}

function renderServices() {
  const grid = document.getElementById('servicesGrid');
  if (state.filteredServices.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted); text-align:center; grid-column: 1/-1; padding:2rem;">Không tìm thấy dịch vụ nào trong chuyên khoa này.</p>';
    return;
  }

  grid.innerHTML = state.filteredServices.map(s => {
    const isSelected = state.selectedService && state.selectedService.id === s.id;
    return `
      <div class="service-card ${isSelected ? 'selected' : ''}" id="srvCard_${s.id}" onclick="selectService(${s.id})">
        <div class="service-card-header">
          <div class="service-icon-box"><i class="fa-solid fa-${s.icon || 'stethoscope'}"></i></div>
          <span class="service-category-tag">${escapeHtml(s.category)}</span>
        </div>
        <h3 class="service-title">${escapeHtml(s.name)}</h3>
        <p class="service-desc">${escapeHtml(s.description || 'Dịch vụ khám tiêu chuẩn tại phòng khám')}</p>
        <div class="service-footer">
          <span class="service-price">${formatCurrency(s.price)}</span>
          <span class="service-duration"><i class="fa-regular fa-clock"></i> ${s.duration_minutes} phút</span>
        </div>
      </div>
    `;
  }).join('');
}

function selectService(serviceId) {
  state.selectedService = state.services.find(s => s.id === serviceId);
  document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
  const card = document.getElementById(`srvCard_${serviceId}`);
  if (card) card.classList.add('selected');

  document.getElementById('btnNextToStep2').removeAttribute('disabled');

  // Cập nhật thông tin tóm tắt ở bước 2
  document.getElementById('summaryServiceName').textContent = state.selectedService.name;
  document.getElementById('summaryServicePrice').textContent = formatCurrency(state.selectedService.price);
}

// 4. BƯỚC 2: CHỌN NGÀY VÀ KHUNG GIỜ
function initDatePicker() {
  const dateInput = document.getElementById('appointmentDateInput');
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const minDate = `${yyyy}-${mm}-${dd}`;

  dateInput.min = minDate;
  dateInput.value = minDate;
  state.selectedDate = minDate;
}

function selectDateShortcut(type) {
  const today = new Date();
  let target = new Date(today);

  document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));

  if (type === 'today') {
    document.getElementById('btnDateToday').classList.add('active');
  } else if (type === 'tomorrow') {
    target.setDate(today.getDate() + 1);
    document.getElementById('btnDateTomorrow').classList.add('active');
  } else if (type === 'dayAfter') {
    target.setDate(today.getDate() + 2);
    document.getElementById('btnDateDayAfter').classList.add('active');
  }

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  document.getElementById('appointmentDateInput').value = dateStr;
  state.selectedDate = dateStr;
  loadAvailableSlots(dateStr);
}

function onDateChanged() {
  document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
  state.selectedDate = document.getElementById('appointmentDateInput').value;
  loadAvailableSlots(state.selectedDate);
}

async function loadAvailableSlots(date) {
  const morningGrid = document.getElementById('morningSlotsGrid');
  const afternoonGrid = document.getElementById('afternoonSlotsGrid');

  morningGrid.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:1rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang kiểm tra lịch trống...</div>';
  afternoonGrid.innerHTML = '';
  document.getElementById('btnNextToStep3').setAttribute('disabled', 'true');
  state.selectedSlot = '';

  try {
    const res = await fetch(`/api/appointments/available-slots?date=${encodeURIComponent(date)}`);
    const json = await res.json();

    if (!json.success || !json.slots) {
      morningGrid.innerHTML = '<p style="color:var(--rose-light);">Không tải được khung giờ.</p>';
      return;
    }

    const morning = json.slots.filter(s => parseInt(s.time.split(':')[0]) < 12);
    const afternoon = json.slots.filter(s => parseInt(s.time.split(':')[0]) >= 12);

    morningGrid.innerHTML = morning.map(renderSlotChip).join('');
    afternoonGrid.innerHTML = afternoon.map(renderSlotChip).join('');
  } catch (err) {
    morningGrid.innerHTML = '<p style="color:var(--rose-light);">Lỗi kết nối khi tải khung giờ.</p>';
  }
}

function renderSlotChip(slot) {
  const isSelected = state.selectedSlot === slot.time;
  const disabledClass = slot.available ? '' : 'disabled';
  const statusText = slot.available ? 'Còn chỗ' : 'Kín lịch';

  return `
    <div class="slot-chip ${disabledClass} ${isSelected ? 'selected' : ''}" 
         onclick="${slot.available ? `selectSlot('${slot.time}')` : ''}"
         title="${slot.available ? 'Bấm để chọn khung giờ ' + slot.time : 'Khung giờ này đã được đặt'}">
      <span class="slot-time">${slot.time}</span>
      <span class="slot-status">${statusText}</span>
    </div>
  `;
}

function selectSlot(time) {
  state.selectedSlot = time;
  document.querySelectorAll('.slot-chip').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  document.getElementById('btnNextToStep3').removeAttribute('disabled');
}

// 5. BƯỚC 3: THÔNG TIN KHÁCH HÀNG
function selectGender(gender) {
  state.customer.gender = gender;
  document.querySelectorAll('.gender-option').forEach(el => el.classList.remove('active'));
  if (gender === 'male') document.getElementById('genderMale').classList.add('active');
  if (gender === 'female') document.getElementById('genderFemale').classList.add('active');
  if (gender === 'other') document.getElementById('genderOther').classList.add('active');
}

// 6. ĐIỀU HƯỚNG CÁC BƯỚC (STEPPER)
function goToStep(step) {
  if (step === 2 && !state.selectedService) {
    showToast('Vui lòng chọn một dịch vụ khám trước khi tiếp tục.', 'error');
    return;
  }
  if (step === 3 && (!state.selectedDate || !state.selectedSlot)) {
    showToast('Vui lòng chọn ngày và khung giờ khám còn trống.', 'error');
    return;
  }
  if (step === 4) {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const notes = document.getElementById('custNotes').value.trim();

    if (!name || !phone) {
      showToast('Vui lòng nhập họ tên và số điện thoại liên hệ.', 'error');
      return;
    }

    const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      showToast('Số điện thoại không hợp lệ. Vui lòng nhập đúng số ĐT Việt Nam.', 'error');
      return;
    }

    state.customer.name = name;
    state.customer.phone = phone;
    state.customer.email = email;
    state.customer.notes = notes;

    // Hiển thị thông tin lên phiếu xem trước (Bước 4)
    populateReviewStep();
  }

  // Cập nhật giao diện Stepper
  for (let i = 1; i <= 4; i++) {
    const indicator = document.getElementById(`stepIndicator${i}`);
    const panel = document.getElementById(`stepPanel${i}`);
    const line = document.getElementById(`stepLine${i - 1}`);

    if (i === step) {
      indicator.classList.add('active');
      indicator.classList.remove('completed');
      panel.classList.add('active');
    } else if (i < step) {
      indicator.classList.remove('active');
      indicator.classList.add('completed');
      panel.classList.remove('active');
    } else {
      indicator.classList.remove('active');
      indicator.classList.remove('completed');
      panel.classList.remove('active');
    }

    if (line) {
      if (i < step) {
        line.classList.add('completed');
      } else {
        line.classList.remove('completed');
      }
    }
  }

  state.currentStep = step;
  window.scrollTo({ top: 380, behavior: 'smooth' });

  if (step === 2 && (!state.selectedSlot || !state.selectedDate)) {
    loadAvailableSlots(state.selectedDate || document.getElementById('appointmentDateInput').value);
  }
}

function populateReviewStep() {
  document.getElementById('reviewService').textContent = state.selectedService.name;
  document.getElementById('reviewPrice').textContent = formatCurrency(state.selectedService.price);
  document.getElementById('reviewDate').textContent = formatDate(state.selectedDate);
  document.getElementById('reviewTime').textContent = state.selectedSlot;
  document.getElementById('reviewName').textContent = state.customer.name;
  document.getElementById('reviewPhone').textContent = state.customer.phone;

  if (state.customer.email) {
    document.getElementById('reviewEmailRow').style.display = 'flex';
    document.getElementById('reviewEmail').textContent = state.customer.email;
  } else {
    document.getElementById('reviewEmailRow').style.display = 'none';
  }

  if (state.customer.notes) {
    document.getElementById('reviewNotesRow').style.display = 'flex';
    document.getElementById('reviewNotes').textContent = state.customer.notes;
  } else {
    document.getElementById('reviewNotesRow').style.display = 'none';
  }
}

// 7. GỬI ĐẶT LỊCH HẸN (POST /api/appointments)
async function submitBooking() {
  const chk = document.getElementById('chkAgreement');
  if (!chk.checked) {
    showToast('Vui lòng đồng ý với cam kết đến đúng giờ.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitBooking');
  submitBtn.setAttribute('disabled', 'true');
  submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang xử lý đặt hẹn...';

  try {
    const payload = {
      service_id: state.selectedService.id,
      customer_name: state.customer.name,
      customer_phone: state.customer.phone,
      customer_email: state.customer.email,
      appointment_date: state.selectedDate,
      appointment_time: state.selectedSlot,
      notes: state.customer.notes,
    };

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Đặt lịch hẹn không thành công. Vui lòng thử lại.', 'error');
      submitBtn.removeAttribute('disabled');
      submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Xác Nhận Đặt Lịch Hẹn Ngay';
      return;
    }

    state.lastBookingCode = data.data.booking_code;
    document.getElementById('successBookingCode').textContent = state.lastBookingCode;
    document.getElementById('successModal').classList.add('active');
  } catch (err) {
    showToast('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng!', 'error');
    submitBtn.removeAttribute('disabled');
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Xác Nhận Đặt Lịch Hẹn Ngay';
  }
}

function copyBookingCode() {
  if (!state.lastBookingCode) return;
  navigator.clipboard.writeText(state.lastBookingCode);
  showToast(`Đã sao chép mã đặt lịch ${state.lastBookingCode} vào bộ nhớ tạm!`, 'success');
}

function closeSuccessModalAndReset() {
  document.getElementById('successModal').classList.remove('active');
  // Reset trạng thái
  state.selectedService = null;
  state.selectedSlot = '';
  document.getElementById('customerForm').reset();
  goToStep(1);
  loadServices();
}

// 8. TRA CỨU LỊCH HẸN
async function executeLookup() {
  const kw = document.getElementById('lookupInput').value.trim();
  const area = document.getElementById('lookupResultsArea');

  if (!kw) {
    showToast('Vui lòng nhập mã hẹn hoặc số điện thoại để tra cứu.', 'error');
    return;
  }

  area.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i><p style="margin-top:0.8rem;">Đang tìm kiếm thông tin...</p></div>';

  try {
    const res = await fetch(`/api/appointments/lookup?keyword=${encodeURIComponent(kw)}`);
    const json = await res.json();

    if (!json.success || !json.data || json.data.length === 0) {
      area.innerHTML = `
        <div style="text-align:center; padding:2.5rem; background:#f8fafc; border-radius:var(--radius-md); border:1px dashed #cbd5e1;">
          <i class="fa-regular fa-face-frown fa-3x" style="color:#94a3b8; margin-bottom:1rem;"></i>
          <h4 style="color:#0f172a; font-weight:800; margin-bottom:0.4rem;">Không Tìm Thấy Lịch Hẹn</h4>
          <p style="color:#64748b; font-size:0.9rem;">Không có cuộc hẹn nào khớp với mã hoặc số điện thoại "<strong>${escapeHtml(kw)}</strong>".</p>
        </div>
      `;
      return;
    }

    area.innerHTML = json.data.map(apt => `
      <div class="appointment-record-card" style="background:#ffffff; border:1px solid #e2e8f0; box-shadow:var(--shadow-sm); border-radius:var(--radius-md); padding:1.4rem; margin-bottom:1rem;">
        <div class="record-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid #f1f5f9;">
          <span class="apt-code-badge"><i class="fa-solid fa-ticket"></i> ${escapeHtml(apt.booking_code)}</span>
          ${getStatusBadge(apt.status)}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1.2rem;">
          <div>
            <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Dịch Vụ Khám</span>
            <h4 style="color:#0f172a; font-size:1.05rem; font-weight:800; margin-top:0.2rem;">${escapeHtml(apt.service_name)}</h4>
            <span style="color:#0284c7; font-weight:700; font-size:0.95rem;">${formatCurrency(apt.price)}</span>
          </div>
          <div>
            <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Thời Gian Hẹn</span>
            <div style="color:#0f172a; font-weight:700; font-size:1rem; margin-top:0.2rem;">${formatDate(apt.appointment_date)}</div>
            <span style="color:#0284c7; font-weight:600;"><i class="fa-regular fa-clock"></i> ${apt.appointment_time}</span>
          </div>
          <div>
            <span style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:700;">Bệnh Nhân</span>
            <div style="color:#0f172a; font-weight:700; font-size:1rem; margin-top:0.2rem;">${escapeHtml(apt.customer_name)}</div>
            <small style="color:#64748b;"><i class="fa-solid fa-phone"></i> ${escapeHtml(apt.customer_phone)}</small>
          </div>
        </div>
        ${apt.notes ? `<div style="font-size:0.86rem; color:#334155; background:#f8fafc; border:1px solid #e2e8f0; padding:0.7rem 1rem; border-radius:var(--radius-xs); margin-bottom:1rem;"><i class="fa-solid fa-notes-medical" style="color:#0284c7;"></i> <strong>Ghi chú:</strong> ${escapeHtml(apt.notes)}</div>` : ''}
        <div style="display:flex; justify-content:flex-end; gap:0.6rem; border-top:1px solid var(--border-subtle); padding-top:0.8rem;">
          ${apt.status !== 'cancelled' && apt.status !== 'completed' ? `
            <button class="btn btn-danger" style="padding:0.4rem 1rem; font-size:0.82rem;" onclick="cancelAppointment(${apt.id}, '${apt.booking_code}')">
              <i class="fa-solid fa-ban"></i> Hủy Lịch Hẹn
            </button>
          ` : ''}
          <button class="btn btn-secondary" style="padding:0.4rem 1rem; font-size:0.82rem;" onclick="window.print()">
            <i class="fa-solid fa-print"></i> In Phiếu
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    area.innerHTML = '<p style="color:var(--rose-light); text-align:center;">Lỗi hệ thống khi tìm kiếm lịch hẹn.</p>';
  }
}

async function cancelAppointment(id, bookingCode) {
  if (!confirm(`Bạn có chắc chắn muốn hủy lịch hẹn mã ${bookingCode}?`)) return;

  try {
    const res = await fetch(`/api/appointments/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_code: bookingCode }),
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Đã hủy lịch hẹn ${bookingCode} thành công.`, 'success');
      executeLookup();
    } else {
      showToast(data.message || 'Không thể hủy lịch hẹn này.', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi hủy lịch hẹn.', 'error');
  }
}

// 9. TIỆN ÍCH CHUNG
function getStatusBadge(status) {
  switch (status) {
    case 'pending':
      return '<span class="status-pill pending"><span class="dot"></span> Chờ Tiếp Nhận</span>';
    case 'confirmed':
      return '<span class="status-pill confirmed"><i class="fa-solid fa-circle-check"></i> Đã Xác Nhận</span>';
    case 'completed':
      return '<span class="status-pill completed"><i class="fa-solid fa-circle-check"></i> Đã Khám Xong</span>';
    case 'cancelled':
      return '<span class="status-pill cancelled"><i class="fa-solid fa-circle-xmark"></i> Đã Hủy</span>';
    default:
      return `<span class="status-pill">${status}</span>`;
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

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
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
