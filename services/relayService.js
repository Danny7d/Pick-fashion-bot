const { getDatabase } = require('../database/db');
const logger = require('../utils/logger');

class RelayService {
  // Resolved lazily so the connection is opened by the entry point's
  // initDatabase() call, not at require time.
  get db() {
    return getDatabase();
  }

  formatCustomerTag(username, name, customerId) {
    if (username && username !== 'No username') {
      return `@${username}`;
    }

    if (name) {
      return `${name} (${customerId})`;
    }

    return `${customerId}`;
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
      // Validate that adminGroupId is actually a group/supergroup/channel
      let chatInfo = null;
      try {
        chatInfo = await bot.getChat(adminGroupId);
      } catch (err) {
        logger.warn(`Could not get chat info for adminGroupId=${adminGroupId}: ${err.message}`);
        return { success: false, error: `Invalid adminGroupId: ${adminGroupId}` };
      }

      logger.info(`Admin chat info: id=${chatInfo.id} type=${chatInfo.type} title=${chatInfo.title || ''} username=${chatInfo.username || ''}`);

      if (!chatInfo || (chatInfo.type !== 'group' && chatInfo.type !== 'supergroup' && chatInfo.type !== 'channel')) {
        logger.warn(`Configured adminGroupId (${adminGroupId}) is not a group/supergroup/channel (type=${chatInfo?.type})`);
        return { success: false, error: `Configured adminGroupId (${adminGroupId}) is not a group/supergroup/channel` };
      }

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
   * Forward website order or support intent to the admin group
   * @param {object} bot - Telegram bot instance
   * @param {object} payload - Website payload
   * @param {number} adminGroupId - Admin group ID
   * @returns {object} Result with admin message ID
   */
  async forwardWebsiteOrder(bot, payload, adminGroupId) {
    try {
      const customerId = Number(payload.customerId);
      const username = payload.username || payload.customerUsername || 'No username';
      const name = payload.customerName || payload.name || 'Customer';
      const lines = [
        '🛒 New website purchase request',
        `👤 Customer: ${this.formatCustomerTag(username, name, customerId)}`,
        `🆔 User ID: ${customerId}`
      ];

      if (payload.productName) {
        lines.push(`📦 Product: ${payload.productName}`);
      }

      if (payload.productId) {
        lines.push(`🏷️ Product ID: ${payload.productId}`);
      }

      if (payload.size) {
        lines.push(`📏 Size: ${payload.size}`);
      }

      if (payload.color) {
        lines.push(`🎨 Color: ${payload.color}`);
      }

      if (payload.quantity) {
        lines.push(`🔢 Quantity: ${payload.quantity}`);
      }

      if (payload.price) {
        lines.push(`💰 Price: ${payload.price}`);
      }

      if (payload.productUrl) {
        lines.push(`🔗 Product URL: ${payload.productUrl}`);
      }

      if (payload.note) {
        lines.push(`📝 Note: ${payload.note}`);
      }

      lines.push('');
      lines.push('Reply to this message to contact the customer.');

      const sent = await bot.sendMessage(adminGroupId, lines.join('\n'));
      this.storeMapping(sent.message_id, customerId, username);

      logger.info(`Forwarded website order for customer ${customerId} to admin group (msg_id: ${sent.message_id})`);
      return { success: true, adminMessageId: sent.message_id };
    } catch (error) {
      logger.error(`Error forwarding website order: ${error.message}`);
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
  /**
   * Extract order details from the original customer message
   * Parses product name, price, order id from the forwarded message
   * @param {object} originalMsg - The original message replied to
   * @returns {object} Extracted order data
   */
  extractOrderData(originalMsg) {
    const text = originalMsg.text || originalMsg.caption || '';
    
    // Extract the actual customer message (after "💬 Message:")
    const messageContent = text.includes('💬 Message:') ? text.split('💬 Message:')[1] : text;
    
    // Try to extract product name from various formats:
    // 1. From "🛒 Order Inquiry: Product Name"
    // 2. From "📦 Product Name"
    // 3. From "Item: Product Name"
    const productMatch = messageContent.match(/(?:🛒 Order Inquiry:|📦|Item:)[\s]*([^\n$]+)/) || 
                        messageContent.match(/^([^\n]+)/); // First line as fallback
    
    // Try to extract price/order id
    const priceMatch = messageContent.match(/💰[\s]*Price?:?[\s]*\$?([0-9.]+)/);
    const orderIdMatch = text.match(/Order ID:[\s`]*([a-f0-9-]+)/) || text.match(/🆔 Order ID:[\s`]*([a-f0-9-]+)/);
    
    return {
      productName: productMatch ? productMatch[1].trim() : 'Product',
      price: priceMatch ? priceMatch[1] : '',
      orderId: orderIdMatch ? orderIdMatch[1].slice(0, 8) : 'ORD' + Math.random().toString(36).substring(2, 8).toUpperCase()
    };
  }

  async handleAdminReply(bot, msg, adminGroupId) {
    // Check if message is a reply
    if (!msg.reply_to_message) {
      return { success: false, error: 'Not a reply' };
    }

    const repliedMessageId = msg.reply_to_message.message_id;
    const adminMessageText = msg.text ? msg.text.toLowerCase().trim() : '';
    
    // Get customer mapping
    const mapping = this.getMapping(repliedMessageId);
    
    if (!mapping) {
      logger.warn(`No mapping found for admin message ${repliedMessageId}`);
      return { success: false, error: 'Original customer message not found' };
    }

    // Check if admin said "confirm"
    if (adminMessageText === 'confirm' || adminMessageText.startsWith('confirm')) {
      // Extract order data from the original message
      const orderData = this.extractOrderData(msg.reply_to_message);
      
      logger.info(`Admin confirmed order: product=${orderData.productName}, orderId=${orderData.orderId}`);
      
      // Format and send confirmation message
      let confirmationMessage = 
        `✅ GOOD NEWS!\n\n` +
        `Your order has been CONFIRMED!\n\n` +
        `📦 ${orderData.productName}\n` +
        `🆔 Order #${orderData.orderId}\n\n`;
      
      if (orderData.price) {
        confirmationMessage += `💰 $${orderData.price}\n\n`;
      }
      
      confirmationMessage += `We'll contact you soon to arrange pickup.`;
      
      try {
        await bot.sendMessage(mapping.customer_id, confirmationMessage);
        logger.info(`Sent order confirmation to customer ${mapping.customer_id}`);
        
        // Notify admin
        await bot.sendMessage(msg.chat.id, `✅ Order confirmation sent to @${mapping.customer_username || 'customer'}`);
        return { success: true };
      } catch (error) {
        logger.error(`Error sending confirmation: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
    
    // For any other message, forward as normal chat
    const result = await this.sendReplyToCustomer(bot, msg, mapping.customer_id);
    
    if (result.success) {
      // Notify admin that reply was sent
      try {
        await bot.sendMessage(msg.chat.id, `✅ Message sent to @${mapping.customer_username || 'customer'}`);
      } catch (error) {
        logger.error(`Error notifying admin: ${error.message}`);
      }
    }

    return result;
  }
}

module.exports = new RelayService();
