const relayService = require('../services/relayService');
const adminService = require('../services/adminService');
const rateLimiter = require('../utils/rateLimiter');
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

  // Throttle customers so nobody can flood the admin group
  const rate = rateLimiter.checkMessage(chatId);

  if (!rate.allowed) {
    logger.warn(`Rate limited customer ${chatId} (${rate.reason}, ${rate.retryAfterSeconds}s)`);

    if (rate.shouldWarn) {
      try {
        await bot.sendMessage(
          chatId,
          `You're sending messages a bit too quickly. Please wait about ${rate.retryAfterSeconds}s and try again.`
        );
      } catch (error) {
        logger.warn(`Could not send rate-limit notice to ${chatId}: ${error.message}`);
      }
    }

    return;
  }

  logger.info(`Incoming message from customer ${chatId}`);

  // Forward to admin group
  const result = await relayService.forwardToAdminGroup(bot, msg, config.ADMIN_GROUP_ID);

  if (result.success) {
    logger.info(`Message forwarded to admin group successfully`);
  } else {
    logger.error(`Failed to forward message: ${result.error}`);

    // Tell the customer something went wrong instead of going silent
    try {
      await bot.sendMessage(
        chatId,
        "Sorry, something went wrong and your message didn't reach our team. Please try again in a moment, or email us at pickfashionzr@gmail.com."
      );
    } catch (error) {
      logger.warn(`Could not send failure notice to ${chatId}: ${error.message}`);
    }
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
 * Handle support requests coming from the website backend
 * Sends an acknowledgement to the customer and a mapped message to the admin group
 */
async function handleWebsiteSupportRequest(bot, payload, config) {
  const customerId = Number(payload.customerId);

  try {
    const customerLines = [
      'Thanks for your order request from Pick-Fashion.',
      payload.productName ? `Item: ${payload.productName}` : null,
      'Our team will contact you here shortly.'
    ].filter(Boolean);

    await bot.sendMessage(customerId, customerLines.join('\n'));
  } catch (error) {
    logger.warn(`Could not send website acknowledgement to customer ${customerId}: ${error.message}`);
  }

  return relayService.forwardWebsiteOrder(bot, payload, config.ADMIN_GROUP_ID);
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
  handleStart,
  handleWebsiteSupportRequest
};
