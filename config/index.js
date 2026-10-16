require('dotenv').config();

const config = {
  // Bot configuration
  BOT_TOKEN: process.env.BOT_TOKEN,
  
  // Admin configuration
  OWNER_ID: process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null,
  ADMIN_GROUP_ID: process.env.ADMIN_GROUP_ID ? parseInt(process.env.ADMIN_GROUP_ID) : null,
  
  // Server configuration
  PORT: process.env.PORT || 3000,
  
  // Validate required config
  validate() {
    const required = ['BOT_TOKEN', 'OWNER_ID', 'ADMIN_GROUP_ID'];
    const missing = required.filter(key => !this[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    return true;
  }
};

module.exports = config;
