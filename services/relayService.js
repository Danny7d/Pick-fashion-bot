const { getDatabase } = require('../database/db');
const logger = require('../utils/logger');

class RelayService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Forward customer message to admin group
   * @param {object} bot - Telegram bot instance
   * @param {object} msg - Customer message
   * @param {number} adminGroupId - Admin group ID
   * @returns {object} Result with admin message ID
   */
  async forwardToAdminGroup(bot, msg, adminGroupId) {
    try {
      const customerId = msg.chat.id;
      const username = msg.from.username || 'No username';
      const userId = msg.from.id;
      const name = msg.from.first_name || 'Customer';

      // Format metadata message
      const metadata = `👤 Customer: @${username}\n🆔 User ID: ${userId}\n💬 Message:`;

      let adminMessageId;

      // Handle different message types
      if (msg.photo) {
        // Photo message
        const photo = msg.photo[msg.photo.length - 1]; // Get largest photo
        const caption = msg.caption || '';
        const fullCaption = `${metadata}\n${caption}`;
        
        const sent = await bot.sendPhoto(adminGroupId, photo.file_id, {
          caption: fullCaption
        });
        adminMessageId = sent.message_id;
      } else if (msg.video) {
        // Video message
        const caption = msg.caption || '';
        const fullCaption = `${metadata}\n${caption}`;
        
        const sent = await bot.sendVideo(adminGroupId, msg.video.file_id, {
          caption: fullCaption
        });
        adminMessageId = sent.message_id;
      } else if (msg.voice) {
        // Voice message
        const sent = await bot.sendVoice(adminGroupId, msg.voice.file_id, {
          caption: metadata
        });
        adminMessageId = sent.message_id;
      } else if (msg.document) {
        // Document message
        const caption = msg.caption || '';
        const fullCaption = `${metadata}\n${caption}`;
        
        const sent = await bot.sendDocument(adminGroupId, msg.document.file_id, {
          caption: fullCaption
        });
        adminMessageId = sent.message_id;
      } else if (msg.text) {
        // Text message
        const fullMessage = `${metadata}\n${msg.text}`;
        
        const sent = await bot.sendMessage(adminGroupId, fullMessage);
        adminMessageId = sent.message_id;
      } else {
        return { success: false, error: 'Unsupported message type' };
      }

      // Store mapping in database
      this.storeMapping(adminMessageId, customerId, username);

      logger.info(`Forwarded message from customer ${customerId} to admin group (msg_id: ${adminMessageId})`);
      
      return { success: true, adminMessageId };
    } catch (error) {
      logger.error(`Error forwarding to admin group: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Store message mapping in database
   * @param {number} adminMessageId - Admin group message ID
   * @param {number} customerId - Customer chat ID
   * @param {string} username - Customer username
   */
  storeMapping(adminMessageId, customerId, username) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO message_mapping (admin_group_message_id, customer_id, customer_username)
        VALUES (?, ?, ?)
      `);
      
      stmt.run(adminMessageId, customerId, username);
    } catch (error) {
      logger.error(`Error storing message mapping: ${error.message}`);
    }
  }

  /**
   * Get customer ID from admin group message ID
   * @param {number} adminMessageId - Admin group message ID
   * @returns {object|null} Mapping data or null
   */
  getMapping(adminMessageId) {
    try {
      const stmt = this.db.prepare(`
        SELECT customer_id, customer_username FROM message_mapping 
        WHERE admin_group_message_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      return stmt.get(adminMessageId);
    } catch (error) {
      logger.error(`Error getting message mapping: ${error.message}`);
      return null;
    }
  }

  /**
   * Send admin reply back to customer
   * @param {object} bot - Telegram bot instance
   * @param {object} adminMsg - Admin message
   * @param {number} customerId - Customer chat ID
   * @returns {object} Result
   */
  async sendReplyToCustomer(bot, adminMsg, customerId) {
    try {
      // Send typing indicator
      await bot.sendChatAction(customerId, 'typing');

      let sent;

      // Handle different message types
      if (adminMsg.photo) {
        const photo = adminMsg.photo[adminMsg.photo.length - 1];
        const caption = adminMsg.caption || '';
        sent = await bot.sendPhoto(customerId, photo.file_id, { caption });
      } else if (adminMsg.video) {
        const caption = adminMsg.caption || '';
        sent = await bot.sendVideo(customerId, adminMsg.video.file_id, { caption });
      } else if (adminMsg.voice) {
        sent = await bot.sendVoice(customerId, adminMsg.voice.file_id);
      } else if (adminMsg.document) {
        const caption = adminMsg.caption || '';
        sent = await bot.sendDocument(customerId, adminMsg.document.file_id, { caption });
      } else if (adminMsg.text) {
        sent = await bot.sendMessage(customerId, adminMsg.text);
      } else {
        return { success: false, error: 'Unsupported message type' };
      }

      logger.info(`Sent reply from admin to customer ${customerId}`);
      return { success: true };
    } catch (error) {
      if (error.response && error.response.body && error.response.body.description) {
        const errorDesc = error.response.body.description;
        if (errorDesc.includes('bot was blocked by the user')) {
          logger.warn(`Customer ${customerId} has blocked the bot`);
          return { success: false, error: 'User blocked the bot' };
        } else if (errorDesc.includes('user is deactivated')) {
          logger.warn(`Customer ${customerId} account is deactivated`);
          return { success: false, error: 'User account deactivated' };
        }
      }
      logger.error(`Error sending reply to customer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle admin reply in admin group
   * @param {object} bot - Telegram bot instance
   * @param {object} msg - Admin message
   * @param {number} adminGroupId - Admin group ID
   * @returns {object} Result
   */
  async handleAdminReply(bot, msg, adminGroupId) {
    // Check if message is a reply
    if (!msg.reply_to_message) {
      return { success: false, error: 'Not a reply' };
    }

    const repliedMessageId = msg.reply_to_message.message_id;
    
    // Get customer mapping
    const mapping = this.getMapping(repliedMessageId);
    
    if (!mapping) {
      logger.warn(`No mapping found for admin message ${repliedMessageId}`);
      return { success: false, error: 'Original customer message not found' };
    }

    // Send reply to customer
    const result = await this.sendReplyToCustomer(bot, msg, mapping.customer_id);
    
    if (result.success) {
      // Notify admin that reply was sent
      try {
        await bot.sendMessage(msg.chat.id, `✅ Reply sent to @${mapping.customer_username || 'customer'}`);
      } catch (error) {
        logger.error(`Error notifying admin: ${error.message}`);
      }
    }

    return result;
  }
}

module.exports = new RelayService();
