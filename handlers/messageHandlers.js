const relayService = require('../services/relayService');
const adminService = require('../services/adminService');
const logger = require('../utils/logger');

/**
 * Handle customer messages
 * Forwards to admin group if not a command
 */
async function handleCustomerMessage(bot, msg, config) {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip commands
  if (text && text.startsWith('/')) {
    return;
  }
  
  // Skip messages from admin group (they're handled separately)
  if (chatId === config.ADMIN_GROUP_ID) {
    return;
  }
  
  logger.info(`Incoming message from customer ${chatId}`);
  
  // Forward to admin group
  const result = await relayService.forwardToAdminGroup(bot, msg, config.ADMIN_GROUP_ID);
  
  if (result.success) {
    logger.info(`Message forwarded to admin group successfully`);
  } else {
    logger.error(`Failed to forward message: ${result.error}`);
  }
}

/**
 * Handle admin group messages
 * Processes replies to customer messages
 */
async function handleAdminGroupMessage(bot, msg, config) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Only process messages from admin group
  if (chatId !== config.ADMIN_GROUP_ID) {
    return;
  }
  
  // Skip commands
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }
  
  // Check if sender is authorized (admin or owner)
  if (!adminService.isAuthorized(userId, config.OWNER_ID)) {
    logger.warn(`Unauthorized user ${userId} sent message in admin group`);
    return;
  }
  
  logger.info(`Admin message in group from user ${userId}`);
  
  // Handle reply to customer message
  const result = await relayService.handleAdminReply(bot, msg, config.ADMIN_GROUP_ID);
  
  if (result.success) {
    logger.info(`Admin reply sent to customer successfully`);
  } else if (result.error === 'Not a reply') {
    // Not a reply - just log it
    logger.info(`Admin message is not a reply, ignoring`);
  } else {
    logger.error(`Failed to handle admin reply: ${result.error}`);
  }
}

/**
 * Handle /start command
 * Sends welcome message to customer
 */
function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Customer';
  
  const welcomeMessage = `Thanks for contacting Pick-Fashion. Our team will reply soon.`;
  
  bot.sendMessage(chatId, welcomeMessage);
  
  logger.info(`User ${chatId} started the bot`);
}

module.exports = {
  handleCustomerMessage,
  handleAdminGroupMessage,
  handleStart
};
