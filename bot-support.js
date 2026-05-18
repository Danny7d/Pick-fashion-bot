// Force WebSocket polyfill before any imports
global.WebSocket = require("ws");

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

// Import modules
const config = require("./config");
const { initDatabase } = require("./database/db");
const logger = require("./utils/logger");
const adminCommands = require("./handlers/adminCommands");
const messageHandlers = require("./handlers/messageHandlers");

// Validate configuration
try {
  config.validate();
} catch (error) {
  console.error("Configuration error:", error.message);
  process.exit(1);
}

// Initialize database
initDatabase();

// Initialize bot
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

logger.info("🤖 Pick Fashion Support Bot is starting...");
logger.info(`👑 Owner ID: ${config.OWNER_ID}`);
logger.info(`👥 Admin Group ID: ${config.ADMIN_GROUP_ID}`);

// Log bot identity and resolved ids to help diagnose routing issues
bot.getMe().then((me) => {
  logger.info(`Bot identity: @${me.username} (id=${me.id})`);
}).catch((err) => {
  logger.warn(`Could not fetch bot identity: ${err.message}`);
});

// ============================================================================
// ADMIN COMMANDS
// ============================================================================

// /addadmin <user_id> [role] - Only OWNER
bot.onText(/\/addadmin\s+(\d+)(?:\s+(\w+))?/, (msg, match) => {
  adminCommands.handleAddAdmin(bot, msg, match, config);
});

// /removeadmin <user_id> - Only OWNER
bot.onText(/\/removeadmin\s+(\d+)/, (msg, match) => {
  adminCommands.handleRemoveAdmin(bot, msg, match, config);
});

// /admins - List all admins
bot.onText(/\/admins/, (msg) => {
  adminCommands.handleListAdmins(bot, msg, config);
});

// /setrole <user_id> <role> - Only OWNER
bot.onText(/\/setrole\s+(\d+)\s+(\w+)/, (msg, match) => {
  adminCommands.handleSetRole(bot, msg, match, config);
});

// ============================================================================
// CUSTOMER COMMANDS
// ============================================================================

// /start - Welcome message
bot.onText(/\/start/, (msg) => {
  messageHandlers.handleStart(bot, msg);
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

// Handle all messages
bot.on("message", async (msg) => {
  // Handle admin group messages (replies to customers)
  await messageHandlers.handleAdminGroupMessage(bot, msg, config);
  
  // Handle customer messages (forward to admin group)
  await messageHandlers.handleCustomerMessage(bot, msg, config);
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

bot.on("polling_error", (error) => {
  logger.error(`Polling error: ${error.code} - ${error.message}`);
});

bot.on("error", (error) => {
  logger.error(`Bot error: ${error.message}`);
});

// ============================================================================
// WEB SERVER FOR KEEP-ALIVE
// ============================================================================

const app = express();
const PORT = config.PORT;

app.use(express.json());

function normalizeWebsitePayload(body) {
  const customerId = Number(
    body.customerId ||
    body.customerTelegramId ||
    body.telegramId ||
    body.chatId ||
    body.userId
  );

  return {
    customerId,
    username: body.username || body.customerUsername || body.telegramUsername || null,
    customerName: body.customerName || body.name || null,
    productId: body.productId || body.itemId || body.id || null,
    productName: body.productName || body.itemName || body.title || null,
    quantity: body.quantity || 1,
    size: body.size || null,
    color: body.color || null,
    price: body.price || body.amount || null,
    productUrl: body.productUrl || body.url || null,
    note: body.note || body.message || body.details || null
  };
}

app.get("/", (req, res) => {
  res.send("🤖 Pick Fashion Support Bot is alive!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bot: "support-relay",
    version: "1.0.0"
  });
});

app.post("/api/support-request", async (req, res) => {
  const payload = normalizeWebsitePayload(req.body || {});

  if (!payload.customerId || Number.isNaN(payload.customerId)) {
    return res.status(400).json({
      success: false,
      error: "Missing valid customerId/customerTelegramId"
    });
  }

  if (!payload.productName && !payload.note) {
    return res.status(400).json({
      success: false,
      error: "Missing productName or note"
    });
  }

  try {
    const adminResult = await messageHandlers.handleWebsiteSupportRequest(
      bot,
      payload,
      config
    );

    if (!adminResult.success) {
      return res.status(500).json(adminResult);
    }

    return res.json({
      success: true,
      message: "Support request forwarded",
      adminMessageId: adminResult.adminMessageId
    });
  } catch (error) {
    logger.error(`Website support request failed: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  logger.info(`🌐 Web server running on port ${PORT}`);
  logger.info("✅ Support bot is ready!");
  logger.info("📝 Make sure BotFather privacy mode is disabled (/setprivacy → Disable)");
});
