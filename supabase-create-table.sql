-- 创建个人流水账单表
CREATE TABLE personal_transactions (
  id SERIAL PRIMARY KEY,
  time TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  original_category TEXT NOT NULL,
  custom_category TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引，提高查询性能
CREATE INDEX idx_personal_transactions_time ON personal_transactions(time);
CREATE INDEX idx_personal_transactions_custom_category ON personal_transactions(custom_category);
