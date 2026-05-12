# Pick Fashion Telegram Bot

Functional Telegram bot that receives orders from the website and stores them in Supabase.

## What It Does

1. **Customer clicks "Buy" on website** → Sends message to bot
2. **Bot receives order** → Stores in Supabase database
3. **Bot replies to customer** → Confirms order with ID
4. **Bot notifies admin** → Sends order details to you
5. **Admin confirms via reply** → Updates order status

## Commands

| Command    | Description      |
| ---------- | ---------------- |
| `/start`   | Welcome message  |
| `/orders`  | View your orders |
| `/help`    | How to order     |
| `/contact` | Contact info     |

## Setup Instructions

### Step 1: Get Your Admin Telegram ID

1. Open Telegram
2. Message @userinfobot
3. It will reply with your ID: `123456789`
4. Save this number

### Step 2: Create Environment File

```bash
cd bot
cp .env
```

Edit `.env`:

```
BOT_TOKEN=your-telegram-bot-token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_TELEGRAM_ID=your-admin-telegram-id
```

Get `SUPABASE_SERVICE_ROLE_KEY` from:

- Supabase Dashboard → Settings → API → service_role key

### Step 3: Install & Run

```bash
# Install dependencies
npm install

# Run the bot
npm start

# Or with auto-restart on changes
npm run dev
```

You should see:

```
🤖 Pick Fashion Bot is running...
✅ Bot is ready to receive orders!
📞 Admin ID: 123456789
```

## Testing the Bot

### Method 1: From Website

1. Start the bot: `npm start`
2. Open your website
3. Go to any product
4. Click "Buy Now"
5. Click "Open Telegram"
6. Send the message
7. Bot should reply with order confirmation!

### Method 2: Direct Message

Send this to your bot:

```
🛒 Order Inquiry: Test Product
💰 Price: $25.00
📍 View: https://your-site.com/product/123

Hi! I want to buy this product.
```

## Admin Workflow

### Receiving Orders

When a customer places an order, you'll get a message:

```
🔔 New Order!

From: @customer_username (John)
Product: Baseball Ball
Price: $8.99
Order ID: abc12345-...

Reply to this chat to confirm the order.
```

### Confirming Orders

**Reply to the notification message** with:

- `confirm` or `yes` or `✅`

Bot will:

1. Update order status in Supabase
2. Reply "Order confirmed!"

## Database Integration

The bot automatically creates orders in your Supabase `orders` table:

```
orders:
  - id (auto-generated)
  - product_name: "Baseball Ball"
  - total_amount: 8.99
  - telegram_handle: "customer123"
  - status: "pending_manual"
  - created_at: timestamp
```

## Running 24/7 (Production)

### Option 1: VPS/Cloud Server

```bash
# Using PM2
npm install -g pm2
pm2 start bot.js --name "pick-fashion-bot"
pm2 save
pm2 startup
```

### Option 2: Railway/Render/Heroku

1. Push code to GitHub
2. Connect to Railway/Render
3. Set environment variables
4. Deploy

### Option 3: Local Computer (Testing)

Just keep terminal open with `npm start`

## Troubleshooting

### Bot not responding?

```bash
# Check if token is valid
curl https://api.telegram.org/bot8668555573:AAHfVVSqZBISbFfl0a6Zlwx40tvThmiKOrE/getMe
```

Should return your bot info.

### Orders not saving?

- Check SUPABASE_SERVICE_ROLE_KEY is correct
- Check database RLS policies
- Check bot logs for errors

### Admin notifications not working?

- Verify ADMIN_TELEGRAM_ID is correct
- Make sure you've messaged the bot at least once
- Check if bot can message you (not blocked)

## Files

```
bot/
├── bot.js              # Main bot code
├── package.json        # Dependencies
├── .env.example        # Environment template
└── README.md           # This file
```

## Customization

### Change Welcome Message

Edit the `/start` handler in `bot.js`:

```javascript
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(chatId, "Your custom message here");
});
```

### Add More Commands

Add new handlers:

```javascript
bot.onText(/\/mycustom/, (msg) => {
  bot.sendMessage(msg.chat.id, "Custom response");
});
```

## Security Notes

- ✅ Service role key only used server-side
- ✅ BOT_TOKEN never exposed in frontend
- ✅ Admin ID restricts who can confirm orders
- ✅ Orders tied to telegram username

## Support

Issues? Contact: pickfashionzr@gmail.com or @Rutha_5
