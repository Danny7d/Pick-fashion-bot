const adminService = require('../services/adminService');
const logger = require('../utils/logger');

/**
 * Handle /addadmin command
 * Only OWNER can use this command
 */
function handleAddAdmin(bot, msg, match, config) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if user is owner
  if (!adminService.isOwner(userId, config.OWNER_ID)) {
    bot.sendMessage(chatId, '❌ Only the owner can add admins.');
    logger.warn(`User ${userId} attempted to add admin without permission`);
    return;
  }
  
  const targetUserId = match[1];
  
  // Validate user ID
  if (!targetUserId || isNaN(targetUserId)) {
    bot.sendMessage(chatId, '❌ Invalid user ID. Usage: /addadmin <user_id>');
    return;
  }
  
  const role = match[2] || 'support';
  
  const result = adminService.addAdmin(parseInt(targetUserId), role);
  
  if (result.success) {
    bot.sendMessage(chatId, `✅ ${result.message}`);
    logger.info(`Owner ${userId} added admin ${targetUserId} with role ${role}`);
  } else {
    bot.sendMessage(chatId, `❌ ${result.error}`);
    logger.error(`Failed to add admin: ${result.error}`);
  }
}

/**
 * Handle /removeadmin command
 * Only OWNER can use this command
 */
function handleRemoveAdmin(bot, msg, match, config) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if user is owner
  if (!adminService.isOwner(userId, config.OWNER_ID)) {
    bot.sendMessage(chatId, '❌ Only the owner can remove admins.');
    logger.warn(`User ${userId} attempted to remove admin without permission`);
    return;
  }
  
  const targetUserId = match[1];
  
  // Validate user ID
  if (!targetUserId || isNaN(targetUserId)) {
    bot.sendMessage(chatId, '❌ Invalid user ID. Usage: /removeadmin <user_id>');
    return;
  }
  
  // Prevent removing owner
  if (parseInt(targetUserId) === config.OWNER_ID) {
    bot.sendMessage(chatId, '❌ Cannot remove the owner.');
    return;
  }
  
  const result = adminService.removeAdmin(parseInt(targetUserId));
  
  if (result.success) {
    bot.sendMessage(chatId, `✅ ${result.message}`);
    logger.info(`Owner ${userId} removed admin ${targetUserId}`);
  } else {
    bot.sendMessage(chatId, `❌ ${result.error}`);
    logger.error(`Failed to remove admin: ${result.error}`);
  }
}

/**
 * Handle /admins command
 * Lists all admins with roles
 */
function handleListAdmins(bot, msg, config) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if user is authorized
  if (!adminService.isAuthorized(userId, config.OWNER_ID)) {
    bot.sendMessage(chatId, '❌ You are not authorized to view admins.');
    logger.warn(`User ${userId} attempted to view admins without permission`);
    return;
  }
  
  const admins = adminService.getAllAdmins();
  
  if (admins.length === 0) {
    bot.sendMessage(chatId, '📋 No admins found in database.');
    return;
  }
  
  let message = '📋 *Admin List*\n\n';
  
  // Add owner
  message += `👑 Owner: ${config.OWNER_ID}\n\n`;
  
  // Add other admins
  admins.forEach((admin, index) => {
    const roleEmoji = {
      owner: '👑',
      admin: '🔧',
      support: '💬'
    }[admin.role] || '❓';
    
    message += `${index + 1}. ${roleEmoji} User ID: ${admin.user_id}\n`;
    message += `   Role: ${admin.role}\n`;
    message += `   Added: ${new Date(admin.created_at).toLocaleDateString()}\n\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  logger.info(`User ${userId} viewed admin list`);
}

/**
 * Handle /setrole command
 * Only OWNER can use this command
 */
function handleSetRole(bot, msg, match, config) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if user is owner
  if (!adminService.isOwner(userId, config.OWNER_ID)) {
    bot.sendMessage(chatId, '❌ Only the owner can change roles.');
    logger.warn(`User ${userId} attempted to change role without permission`);
    return;
  }
  
  const targetUserId = match[1];
  const newRole = match[2];
  
  // Validate user ID
  if (!targetUserId || isNaN(targetUserId)) {
    bot.sendMessage(chatId, '❌ Invalid user ID. Usage: /setrole <user_id> <role>');
    return;
  }
  
  // Validate role
  if (!newRole || !['owner', 'admin', 'support'].includes(newRole)) {
    bot.sendMessage(chatId, '❌ Invalid role. Must be: owner, admin, or support');
    return;
  }
  
  // Prevent changing owner role
  if (parseInt(targetUserId) === config.OWNER_ID) {
    bot.sendMessage(chatId, '❌ Cannot change the owner\'s role.');
    return;
  }
  
  const result = adminService.updateRole(parseInt(targetUserId), newRole);
  
  if (result.success) {
    bot.sendMessage(chatId, `✅ ${result.message}`);
    logger.info(`Owner ${userId} changed role of ${targetUserId} to ${newRole}`);
  } else {
    bot.sendMessage(chatId, `❌ ${result.error}`);
    logger.error(`Failed to change role: ${result.error}`);
  }
}

module.exports = {
  handleAddAdmin,
  handleRemoveAdmin,
  handleListAdmins,
  handleSetRole
};
