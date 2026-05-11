// Force WebSocket polyfill before any imports
global.WebSocket = require("ws");

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      enabled: false,
    },
    auth: {
      persistSession: false,
    },
  },
);

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

const userSessions = new Map(); // Store user state

// /order command - Start ordering process
bot.onText(/\/order/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;

  if (!username) {
    bot.sendMessage(
      chatId,
      "⚠️ Please set a Telegram username first!\n" +
        "Go to Settings → Edit Profile → Username",
    );
    return;
  }

  userSessions.set(chatId, { step: "awaiting_product", data: {} });

  bot.sendMessage(
    chatId,
    "🛍️ *New Order*\n\n" +
      "Step 1 of 4: What product would you like to order?\n\n" +
      "You can:\n" +
      "• Type the product name\n" +
      "• Send a screenshot from our website\n" +
      '• Type "browse" to see popular products',
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🌐 Visit Website",
              url: "https://pick-fashion.vercel.app",
            },
          ],
        ],
      },
    },
  );
});

// Handle conversation flow
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from.username;

  // Skip commands
  if (text && text.startsWith("/")) return;

  const session = userSessions.get(chatId);
  if (!session) {
    // No active session - check if it's an order inquiry from website
    if (text && text.includes("🛒 Order Inquiry:")) {
      handleWebsiteOrder(msg);
    }
    return;
  }

  // Step-by-step ordering
  switch (session.step) {
    case "awaiting_product":
      session.data.product = text;
      session.step = "awaiting_quantity";
      bot.sendMessage(
        chatId,
        "✅ Product noted\n\n" +
          "Step 2 of 4: How many would you like?\n" +
          "(Type a number, default is 1)",
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "1", callback_data: "qty_1" },
                { text: "2", callback_data: "qty_2" },
                { text: "3", callback_data: "qty_3" },
              ],
            ],
          },
        },
      );
      break;

    case "awaiting_quantity":
      const qty = parseInt(text) || 1;
      session.data.quantity = qty;
      session.step = "awaiting_phone";
      bot.sendMessage(
        chatId,
        `✅ Quantity: ${qty}\n\n` +
          "Step 3 of 4: What is your phone number?\n" +
          "Format: +251 9XX XXX XXX",
      );
      break;

    case "awaiting_phone":
      session.data.phone = text;
      session.step = "awaiting_location";
      bot.sendMessage(
        chatId,
        "✅ Phone saved\n\n" +
          "Step 4 of 4: Where should we deliver?\n" +
          "Please send your location or type your address:",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📍 Send Location", request_location: true }],
            ],
          },
        },
      );
      break;

    case "awaiting_location":
      session.data.location = text || "Location shared via map";

      // Calculate total (you can fetch actual price from Supabase)
      const total = session.data.quantity * 25; // Example price

      // Save order
      try {
        const { data: order, error } = await supabase
          .from("orders")
          .insert({
            product_name: session.data.product,
            quantity: session.data.quantity,
            unit_price: 25,
            total_amount: total,
            phone_number: session.data.phone,
            telegram_handle: username,
            location: session.data.location,
            status: "pending_manual",
          })
          .select()
          .single();

        if (error) throw error;

        // Clear session
        userSessions.delete(chatId);

        // Confirm to customer
        bot.sendMessage(
          chatId,
          `✅ *Order Placed Successfully!*\n\n` +
            `📦 ${session.data.product}\n` +
            `📊 Quantity: ${session.data.quantity}\n` +
            `💰 Total: $${total}\n` +
            `📱 ${session.data.phone}\n` +
            `📍 ${session.data.location}\n\n` +
            `🆔 Order ID: \`${order.id.slice(0, 8)}\`\n\n` +
            `We'll contact you soon to confirm your order.`,
          { parse_mode: "Markdown" },
        );

        // Notify admin
        notifyAdmin(order, msg.from);
      } catch (err) {
        console.error("Order error:", err);
        bot.sendMessage(chatId, "❌ Error saving order. Please try again.");
      }
      break;
  }
});

// Handle location sharing
bot.on("location", (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions.get(chatId);

  if (session && session.step === "awaiting_location") {
    const { latitude, longitude } = msg.location;
    session.data.location = `📍 ${latitude}, ${longitude}`;
    session.data.location_lat = latitude;
    session.data.location_lng = longitude;

    bot.sendMessage(chatId, "✅ Location received!");

    // Trigger the next step manually
    bot.emit("message", { ...msg, text: session.data.location });
  }
});

// Handle quantity buttons
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("qty_")) {
    const qty = parseInt(data.split("_")[1]);
    bot.emit("message", { ...query.message, text: qty.toString() });
    bot.answerCallbackQuery(query.id);
  }
});

// ============================================================================
// FEATURE 2: ENHANCED WEBSITE ORDER HANDLING
// ============================================================================

async function handleWebsiteOrder(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from.username;
  const name = msg.from.first_name;

  try {
    const orderData = parseOrderMessage(text);

    // Check if user has pending orders
    const { data: pendingOrders } = await supabase
      .from("orders")
      .select("*")
      .eq("telegram_handle", username)
      .eq("status", "pending_manual");

    if (pendingOrders && pendingOrders.length > 0) {
      bot.sendMessage(
        chatId,
        `⏳ You have ${pendingOrders.length} pending order(s).\n` +
          `Type /orders to check status or wait for confirmation.`,
      );
    }

    // Save the order
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        product_id: orderData.productId,
        product_name: orderData.productName,
        product_image: null,
        quantity: 1,
        unit_price: orderData.price,
        total_amount: orderData.price,
        phone_number: "Pending collection",
        telegram_handle: username || "unknown",
        status: "pending_manual",
        source: "website",
      })
      .select()
      .single();

    if (error) throw error;

    // Enhanced reply with next steps
    bot.sendMessage(
      chatId,
      `✅ *Order Received!*\n\n` +
        `🆔 Order #\`${order.id.slice(0, 8)}\`\n` +
        `📦 ${orderData.productName}\n` +
        `💰 $${orderData.price}\n\n` +
        `*What's Next?*\n` +
        `1️⃣ We'll review your order\n` +
        `2️⃣ Contact you for order details\n` +
        `3️⃣ Arrange payment (Cash/Telebirr)\n` +
        `4️⃣ Prepare your order\n\n` +
        `⏱️ Typical processing: 24-48 hours\n\n` +
        `Need to add more details? Reply here or type /order`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 View My Orders", callback_data: "view_orders" }],
            [
              {
                text: "❌ Cancel This Order",
                callback_data: `cancel_${order.id}`,
              },
            ],
          ],
        },
      },
    );

    // Notify admin with action buttons
    if (ADMIN_ID) {
      bot.sendMessage(
        ADMIN_ID,
        `🔔 *New Website Order*\n\n` +
          `From: @${username || "no_username"} (${name})\n` +
          `Product: ${orderData.productName}\n` +
          `Price: $${orderData.price}\n` +
          `Order ID: \`${order.id}\`\n\n` +
          `Actions:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Confirm Order",
                  callback_data: `admin_confirm_${order.id}`,
                },
                {
                  text: "💬 Message Customer",
                  url: `https://t.me/${username}`,
                },
              ],
              [
                {
                  text: "📦 Mark Delivered",
                  callback_data: `admin_deliver_${order.id}`,
                },
              ],
            ],
          },
        },
      );
    }
  } catch (err) {
    console.error("Error:", err);
    bot.sendMessage(chatId, "❌ Sorry, something went wrong.");
  }
}

// ============================================================================
// FEATURE 3: ADMIN QUICK ACTIONS
// ============================================================================

bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  // Admin actions
  if (data.startsWith("admin_confirm_")) {
    const orderId = data.replace("admin_confirm_", "");

    try {
      await supabase
        .from("orders")
        .update({ status: "confirmed", confirmed_at: new Date() })
        .eq("id", orderId);

      bot.answerCallbackQuery(query.id, { text: "✅ Order confirmed!" });
      bot.editMessageText(query.message.text + "\n\n✅ CONFIRMED", {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: "❌ Error" });
    }
  }

  if (data.startsWith("admin_deliver_")) {
    const orderId = data.replace("admin_deliver_", "");

    try {
      await supabase
        .from("orders")
        .update({ status: "delivered", delivered_at: new Date() })
        .eq("id", orderId);

      bot.answerCallbackQuery(query.id, { text: "📦 Marked as delivered!" });
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: "❌ Error" });
    }
  }

  // Customer actions
  if (data === "view_orders") {
    bot.emitText(new RegExp("/orders"), query.message);
    bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith("cancel_")) {
    const orderId = data.replace("cancel_", "");
    // Handle cancellation
    bot.answerCallbackQuery(query.id, { text: "Contact @Rutha_5 to cancel" });
  }
});

// ============================================================================
// FEATURE 4: BROADCAST (Admin only)
// ============================================================================

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) {
    bot.sendMessage(msg.chat.id, "❌ Admin only");
    return;
  }

  const message = match[1];

  // Get all unique telegram handles from orders
  const { data: orders } = await supabase
    .from("orders")
    .select("telegram_handle")
    .not("telegram_handle", "is", null);

  const uniqueUsers = [...new Set(orders.map((o) => o.telegram_handle))];

  let sent = 0;
  for (const username of uniqueUsers) {
    try {
      await bot.sendMessage(
        `@${username}`,
        `📢 *Announcement from Pick Fashion*\n\n${message}`,
        { parse_mode: "Markdown" },
      );
      sent++;
    } catch (err) {
      console.log(`Failed to message @${username}`);
    }
  }

  bot.sendMessage(ADMIN_ID, `✅ Broadcast sent to ${sent} users`);
});

// ============================================================================
// FEATURE 5: DAILY SUMMARY FOR ADMIN
// ============================================================================

async function sendDailySummary() {
  if (!ADMIN_ID) return;

  const today = new Date().toISOString().split("T")[0];

  const { data: stats } = await supabase
    .from("orders")
    .select("status", { count: "exact" })
    .gte("created_at", today);

  const { data: revenue } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("status", "confirmed")
    .gte("created_at", today);

  const totalRevenue =
    revenue?.reduce((sum, o) => sum + o.total_amount, 0) || 0;

  bot.sendMessage(
    ADMIN_ID,
    `📊 *Daily Summary*\n\n` +
      `📦 Today's Orders: ${stats?.length || 0}\n` +
      `💰 Revenue: $${totalRevenue}\n\n` +
      `Pending confirmations need attention!`,
    { parse_mode: "Markdown" },
  );
}

// Send summary every day at 9 AM
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 9 && now.getMinutes() === 0) {
    sendDailySummary();
  }
}, 60000); // Check every minute

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseOrderMessage(text) {
  const lines = text.split("\n");
  const productLine = lines.find((l) => l.includes("🛒"));
  const priceLine = lines.find((l) => l.includes("💰"));
  const urlLine = lines.find((l) => l.includes("📍"));

  return {
    productName: productLine
      ? productLine.replace("🛒 Order Inquiry:", "").trim()
      : "Unknown",
    price: priceLine ? parseFloat(priceLine.match(/\$([\d.]+)/)?.[1]) || 0 : 0,
    productId: urlLine ? urlLine.match(/\/product\/(\d+)/)?.[1] : null,
  };
}

function notifyAdmin(order, user) {
  if (!ADMIN_ID) return;

  bot.sendMessage(
    ADMIN_ID,
    `🔔 *New Order* #${order.id.slice(0, 8)}\n\n` +
      `From: @${user.username || "unknown"}\n` +
      `Product: ${order.product_name}\n` +
      `Amount: $${order.total_amount}\n\n` +
      `Reply "confirm ${order.id.slice(0, 8)}" to accept`,
    { parse_mode: "Markdown" },
  );
}

// ============================================================================
// WEB SERVER FOR RENDER KEEP-ALIVE
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Pick Fashion Enhanced Bot is alive!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bot: "enhanced",
    version: "active",
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log("🤖 Enhanced Bot is running...");
});
