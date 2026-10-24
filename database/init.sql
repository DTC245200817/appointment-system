-- ==============================================================================
-- DATABASE INITIALIZATION SCRIPT - APPOINTMENT SYSTEM (POSTGRESQL 16)
-- Đề bài 40: Hệ thống Đặt lịch hẹn
-- Tuân thủ Tiêu chí 2 (Database) và Tiêu chí 6 (Hardening - Least Privilege)
-- ==============================================================================

-- 1. TẠO NGƯỜI DÙNG ỨNG DỤNG VỚI NGUYÊN TẮC TỐI THIỂU QUYỀN (LEAST PRIVILEGE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'appointment_user') THEN
        CREATE ROLE appointment_user WITH LOGIN PASSWORD 'SecureAppPass_2026!' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

-- 2. TẠO BẢNG DỊCH VỤ (SERVICES)
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Tổng quát',
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 30,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    icon VARCHAR(50) DEFAULT 'calendar-check',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TẠO BẢNG LỊCH HẸN (APPOINTMENTS)
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    booking_code VARCHAR(20) UNIQUE NOT NULL,
    service_id INT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(150),
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(10) NOT NULL,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TẠO INDEXES ĐỂ TỐI ƯU HIỆU NĂNG TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_appointments_code ON appointments(booking_code);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(customer_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- 5. PHÂN QUYỀN GIỚI HẠN CHO appointment_user (HARDENING)
GRANT CONNECT ON DATABASE appointment_db TO appointment_user;
GRANT USAGE ON SCHEMA public TO appointment_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE services TO appointment_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE appointments TO appointment_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appointment_user;

-- Thiết lập mặc định cho các bảng/sequences tạo mới trong tương lai
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appointment_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO appointment_user;

-- 6. CHÈN DỮ LIỆU MẪU DỊCH VỤ (SEED DATA)
INSERT INTO services (name, category, description, duration_minutes, price, icon) VALUES
('Khám Sức Khỏe Tổng Quát', 'Đa khoa', 'Kiểm tra toàn diện các chỉ số sinh hóa, huyết áp, tầm soát sức khỏe tổng thể.', 45, 500000, 'stethoscope'),
('Khám & Tư Vấn Chuyên Khoa Tim Mạch', 'Chuyên khoa', 'Khám lâm sàng, điện tâm đồ và siêu âm Doppler tim bởi bác sĩ chuyên khoa.', 30, 450000, 'heart-pulse'),
('Chăm Sóc & Thẩm Mỹ Răng Miệng', 'Nha khoa', 'Lấy cao răng siêu âm, đánh bóng men răng, khám và tư vấn điều trị răng.', 30, 300000, 'smile'),
('Xét Nghiệm Máu & Sinh Hóa Cơ Bản', 'Xét nghiệm', 'Đo đường huyết, chức năng gan, thận, mỡ máu và công thức máu toàn phần.', 20, 350000, 'droplet'),
('Khám & Tư Vấn Nhi Khoa', 'Nhi khoa', 'Theo dõi sự phát triển thể chất, tư vấn tiêm chủng và dinh dưỡng cho trẻ nhỏ.', 30, 400000, 'baby'),
('Tầm Soát & Khám Mắt Kỹ Thuật Cao', 'Mắt', 'Đo khúc xạ thị lực bằng máy tự động, soi đáy mắt, phát hiện tật khúc xạ.', 25, 250000, 'eye')
ON CONFLICT DO NOTHING;

-- 7. CHÈN DỮ LIỆU MẪU LỊCH HẸN (DEMO APPOINTMENTS)
INSERT INTO appointments (booking_code, service_id, customer_name, customer_phone, customer_email, appointment_date, appointment_time, notes, status) VALUES
('APT-829104', 1, 'Nguyễn Văn An', '0912345678', 'an.nguyen@gmail.com', CURRENT_DATE + INTERVAL '1 day', '08:30', 'Khám định kỳ hàng năm', 'confirmed'),
('APT-194820', 2, 'Trần Thị Mai', '0987654321', 'mai.tran@gmail.com', CURRENT_DATE + INTERVAL '1 day', '09:30', 'Có hiện tượng đau thắt ngực nhẹ khi vận động', 'pending'),
('APT-746201', 3, 'Lê Hoàng Long', '0903112233', 'long.le@gmail.com', CURRENT_DATE + INTERVAL '2 day', '14:00', 'Đặt lịch lấy cao răng và kiểm tra răng số 8', 'confirmed'),
('APT-519382', 4, 'Phạm Quỳnh Anh', '0978998877', 'quynhanh@gmail.com', CURRENT_DATE - INTERVAL '1 day', '10:00', 'Xét nghiệm đường huyết lúc đói', 'completed'),
('APT-392019', 5, 'Vũ Đình Trọng', '0933221100', 'trong.vu@gmail.com', CURRENT_DATE - INTERVAL '2 day', '15:30', 'Khám ho kéo dài cho bé 3 tuổi', 'cancelled')
ON CONFLICT (booking_code) DO NOTHING;
