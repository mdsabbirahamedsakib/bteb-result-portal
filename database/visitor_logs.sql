-- BTEB Result & Education Portal - Visitor Logs MySQL Schema
-- Optional backend schema for PHP/MySQL shared hosting (cPanel, Apache, VPS).
-- When hosted on static platforms (GitHub Pages / Cloudflare Pages / Netlify),
-- the portal runs automatically using client-side storage without requiring MySQL.

CREATE TABLE IF NOT EXISTS visitor_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    visit_date DATE NOT NULL,
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visit_date (visit_date),
    INDEX idx_ip_visit_date (ip_address, visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
