// Force WebSocket polyfill before any imports
global.WebSocket = require("ws");

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");

// Initialize bot
const TOKEN =
  process.env.BOT_TOKEN || "8668555573:AAHfVVSqZBISbFfl0a6Zlwx40tvThmiKOrE";
const bot = new TelegramBot(TOKEN, { polling: true });

// Initialize Supabase (service role for admin operations)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      enabled: false,
    },
    auth: { persistSession: false },
  },
);

// Admin Telegram ID (your personal account)
// Get this by messaging @userinfobot on Telegram
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID; // e.g., '123456789'

console.log("🤖 Pick Fashion Bot is running...");

// Escape for Markdown (legacy mode)
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/[*_`[\]]/g, "\\$&");
}

// Escape for MarkdownV2 mode (stricter escaping)
function escapeMarkdownV2(text) {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

// ============================================================================
// COMMANDS
// ============================================================================

// Main menu keyboard
const mainMenuKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "📦 My Orders", callback_data: "show_orders" }],
      [
        { text: "❓ Help", callback_data: "show_help" },
        { text: "📞 Contact", callback_data: "show_contact" },
      ],
      [{ text: "🛍️ Browse Products", url: "https://pick-fashion.vercel.app/" }],
    ],
  },
};

// /start - Welcome message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "Customer";

  bot.sendMessage(
    chatId,
    `👋 Hello ${escapeMarkdown(name)}!\n\n` +
      `Welcome to *Pick Fashion* 🛍️\n\n` +
      `To place an order:\n` +
      `1. Browse products on our website\n` +
      `2. Click "Buy on Telegram"\n` +
      `3. Send the pre-filled message here`,
    { parse_mode: "Markdown", ...mainMenuKeyboard },
  );
});

// Handle button clicks
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Answer the callback to remove loading state
  bot.answerCallbackQuery(query.id);

  switch (data) {
    case "show_orders":
      showOrders(chatId, query.from.username);
      break;
    case "show_help":
      showHelp(chatId);
      break;
    case "show_contact":
      showContact(chatId);
      break;
    case "back_to_menu":
      bot.sendMessage(chatId, `👋 Welcome back!\n\nChoose an option:`, {
        parse_mode: "Markdown",
        ...mainMenuKeyboard,
      });
      break;
  }
});

// Help function
function showHelp(chatId) {
  const backButton = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "← Back to Menu", callback_data: "back_to_menu" }],
      ],
    },
  };

  bot.sendMessage(
    chatId,
    `❓ *How to Order*\n\n` +
      `1. Visit our website\n` +
      `2. Find a product you like\n` +
      `3. Click "Buy on Telegram"\n` +
      `4. The product details will be sent here automatically\n` +
      `5. We will contact you to arrange pickup\n\n` +
      `*Payment:* Cash on pickup or Telebirr`,
    { parse_mode: "Markdown", ...backButton },
  );
}

// /help command
bot.onText(/\/help/, (msg) => {
  showHelp(msg.chat.id);
});

// Contact function
function showContact(chatId) {
  const backButton = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "← Back to Menu", callback_data: "back_to_menu" }],
      ],
    },
  };

  bot.sendMessage(
    chatId,
    `📞 *Contact Us*\n\n` +
      `📱 Phone: +251 913 950 321\n` +
      `💬 Telegram: @Rutha_5\n` +
      `📧 Email: pickfashionzr@gmail.com\n\n` +
      `🕐 Working Hours: 9AM - 6PM (Mon-Sat)\n\n` +
      `_Reply to this chat and we'll respond shortly!_`,
    { parse_mode: "Markdown", ...backButton },
  );
}

// /contact command
bot.onText(/\/contact/, (msg) => {
  showContact(msg.chat.id);
});

// Show orders function
async function showOrders(chatId, telegramHandle) {
  const backButton = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "← Back to Menu", callback_data: "back_to_menu" }],
      ],
    },
  };

  if (!telegramHandle) {
    bot.sendMessage(
      chatId,
      "⚠️ Please set a Telegram username in your settings to track orders.\n" +
        "Settings → Edit Profile → Username",
      backButton,
    );
    return;
  }

  try {
    // Find orders by telegram handle
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("telegram_handle", telegramHandle)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!orders || orders.length === 0) {
      bot.sendMessage(
        chatId,
        "📭 No orders found.\n" +
          "Visit our website to place your first order!",
        backButton,
      );
      return;
    }

    let message = "📦 YOUR ORDERS\n\n";
    orders.forEach((order, index) => {
      const statusEmoji =
        {
          pending_manual: "⏳",
          confirmed: "✅",
          delivered: "📬",
          cancelled: "❌",
        }[order.status] || "❓";

      message += `${index + 1}. ${statusEmoji} ${order.product_name || "Product"}\n`;
      message += `   💰 $${order.total_amount} | Status: ${order.status}\n`;
      message += `   🆔 Order #${order.id.slice(0, 8)}\n\n`;
    });

    bot.sendMessage(chatId, message, backButton);
  } catch (err) {
    console.error("Error fetching orders:", err);
    bot.sendMessage(
      chatId,
      "❌ Error loading orders. Please try again later.",
      backButton,
    );
  }
}

// /orders command
bot.onText(/\/orders/, async (msg) => {
  await showOrders(msg.chat.id, msg.from.username);
});

// ============================================================================
// HANDLE INCOMING MESSAGES (Order Inquiries)
// ============================================================================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from.username;
  const name = msg.from.first_name || "Customer";

  // Skip commands
  if (text && text.startsWith("/")) return;

  // Check if message contains order inquiry
  if (text && text.includes("🛒 Order Inquiry:")) {
    try {
      // Parse order from message
      const orderData = parseOrderMessage(text, username, name);

      // Store in Supabase
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          product_id: orderData.productId || "unknown",
          product_name: orderData.productName,
          product_image: null,
          quantity: 1,
          unit_price: orderData.price,
          total_amount: orderData.price,
          phone_number: "To be collected",
          telegram_handle: username || "unknown",
          chat_id: chatId, // Store chat_id for admin messaging
          status: "pending_manual",
        })
        .select()
        .single();

      if (error) throw error;

      // Reply to customer (plain text to avoid parsing errors)
      bot.sendMessage(
        chatId,
        `✅ Order Received!\n\n` +
          `📦 ${orderData.productName || "Product"}\n` +
          `💰 $${orderData.price}\n\n` +
          `🆔 Order ID: ${order.id.slice(0, 8)}\n\n` +
          `Thank you ${name || "there"}! We will contact you soon to arrange pickup.\n\n` +
          `Type /orders to check your order status.`,
      );

      // Notify admin (plain text)
      if (ADMIN_ID) {
        bot.sendMessage(
          ADMIN_ID,
          `🔔 NEW ORDER\n\n` +
            `From: @${username || "no_username"} (${name || "Customer"})\n` +
            `Product: ${orderData.productName || "Unknown"}\n` +
            `Price: $${orderData.price}\n` +
            `Order ID: ${order.id}\n\n` +
            `Reply "confirm" to confirm this order.`,
        );
      }
    } catch (err) {
      console.error("Error processing order:", err);
      bot.sendMessage(
        chatId,
        "❌ Sorry, there was an error processing your order.\n" +
          "Please try again or contact us at @Rutha_5",
      );
    }
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseOrderMessage(text, username, customerName) {
  // Parse the order message format:
  // 🛒 Order Inquiry: Product Name
  // 💰 Price: $25.00
  // 📍 View: https://...

  const lines = text.split("\n");

  // Extract product name (after the emoji and colon)
  const productLine = lines.find((l) => l.includes("🛒 Order Inquiry:"));
  const productName = productLine
    ? productLine.replace("🛒 Order Inquiry:", "").trim()
    : "Unknown Product";

  // Extract price
  const priceLine = lines.find((l) => l.includes("💰 Price:"));
  const priceMatch = priceLine ? priceLine.match(/\$([\d.]+)/) : null;
  const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

  // Extract product ID from URL if present
  const urlLine = lines.find((l) => l.includes("📍 View:"));
  const urlMatch = urlLine ? urlLine.match(/\/product\/(\d+)/) : null;
  const productId = urlMatch ? urlMatch[1] : null;

  return {
    productName,
    price,
    productId,
    username,
    customerName,
  };
}
// ADMIN COMMANDS (Reply to confirm orders)
// ============================================================================

// Admin command: /reply <order_id> <message>
bot.onText(/\/reply\s+(\S+)\s+(.+)/, async (msg, match) => {
  if (!ADMIN_ID || msg.chat.id.toString() !== ADMIN_ID) return;

  const orderId = match[1];
  const replyMessage = match[2];

  try {
    // Get order with chat_id
    const { data: order, error } = await supabase
      .from("orders")
      .select("chat_id, product_name, telegram_handle")
      .eq("id", orderId)
      .single();

    if (error) {
      bot.sendMessage(msg.chat.id, `❌ Order not found: ${orderId}`);
      return;
    }

    if (!order.chat_id) {
      bot.sendMessage(
        msg.chat.id,
        `❌ No chat_id stored for this order. Cannot message customer.`,
      );
      return;
    }

    // Send message to customer
    bot.sendMessage(
      order.chat_id,
      `📨 *Message from Pick Fashion*\n\n` +
        `${replyMessage}\n\n` +
        `_Order: ${escapeMarkdown(order.product_name || "Product")}_`,
      { parse_mode: "Markdown" },
    );

    bot.sendMessage(
      msg.chat.id,
      `✅ Message sent to @${order.telegram_handle || "customer"}!`,
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

// Admin command: /message <chat_id> <message> (direct message by chat_id)
bot.onText(/\/message\s+(\d+)\s+(.+)/, async (msg, match) => {
  if (!ADMIN_ID || msg.chat.id.toString() !== ADMIN_ID) return;

  const targetChatId = match[1];
  const messageText = match[2];

  try {
    bot.sendMessage(
      targetChatId,
      `Message from Pick Fashion\n\n${messageText}`,
    );
    bot.sendMessage(msg.chat.id, `✅ Message sent!`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

// When admin replies to an order notification
bot.on("message", async (msg) => {
  if (!ADMIN_ID || msg.chat.id.toString() !== ADMIN_ID) return;
  if (msg.text && msg.text.startsWith("/")) return;

  const text = msg.text.toLowerCase();
  const replyTo = msg.reply_to_message;

  // Check if this is a reply to an order notification
  if (replyTo && replyTo.text && replyTo.text.includes("Order ID:")) {
    const orderIdMatch = replyTo.text.match(/Order ID: ([a-f0-9-]+)/);
    if (!orderIdMatch) return;

    const orderId = orderIdMatch[1];

    // Confirm order
    if (
      text.includes("confirm") ||
      text.includes("yes") ||
      text.includes("✅")
    ) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({
            status: "confirmed",
            admin_notes: msg.text,
          })
          .eq("id", orderId);

        if (error) throw error;

        bot.sendMessage(
          msg.chat.id,
          `✅ Order ${orderId.slice(0, 8)} confirmed!`,
        );

        // Notify customer
        const { data: order } = await supabase
          .from("orders")
          .select("chat_id, product_name")
          .eq("id", orderId)
          .single();

        if (order && order.chat_id) {
          bot.sendMessage(
            order.chat_id,
            `✅ GOOD NEWS!\n\n` +
              `Your order has been CONFIRMED!\n\n` +
              `📦 ${order.product_name || "Product"}\n` +
              `🆔 Order #${orderId.slice(0, 8)}\n\n` +
              `We'll contact you soon to arrange pickup.`,
          );
        }
      } catch (err) {
        bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
      }
    }

    // Reply to customer (just send the message text)
    else {
      try {
        const { data: order } = await supabase
          .from("orders")
          .select("chat_id, product_name")
          .eq("id", orderId)
          .single();

        if (order && order.chat_id) {
          bot.sendMessage(
            order.chat_id,
            `📨 Message from Pick Fashion\n\n` +
              `${msg.text}\n\n` +
              `Order: ${order.product_name || "Product"}`,
          );
          bot.sendMessage(msg.chat.id, `✅ Reply sent to customer!`);
        }
      } catch (err) {
        bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
      }
    }
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code, error.message);
});

bot.on("error", (error) => {
  console.error("Bot error:", error);
});

// ============================================================================
// WEB SERVER FOR RENDER KEEP-ALIVE
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Pick Fashion Bot is alive!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bot: "active",
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log("✅ Bot is ready to receive orders!");
  console.log("📞 Admin ID:", ADMIN_ID || "Not set (get it from @userinfobot)");
});
