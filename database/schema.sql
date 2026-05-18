-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'support')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message mapping table for relay system
CREATE TABLE IF NOT EXISTS message_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_group_message_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
CREATE INDEX IF NOT EXISTS idx_message_mapping_admin_msg_id ON message_mapping(admin_group_message_id);
CREATE INDEX IF NOT EXISTS idx_message_mapping_customer_id ON message_mapping(customer_id);
