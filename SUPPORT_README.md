# Pick Fashion Support Bot - Admin Relay System

An admin-controlled Telegram support relay system for the Pick Fashion bot that enables seamless customer support through a private admin group.

## Features

### Admin System
- **Database-based admin management** using SQLite
- **Role-based access control**: owner, admin, support
- **Owner-only commands** for adding/removing admins and changing roles

### Admin Commands
- `/addadmin <user_id> [role]` - Add a new admin (owner only)
- `/removeadmin <user_id>` - Remove an admin (owner only)
- `/admins` - List all admins with roles
- `/setrole <user_id> <role>` - Change admin role (owner only)

### Support Relay System
- **Customer messages** are automatically forwarded to the admin group with metadata
- **Admin replies** in the group are routed back to the correct customer
- **Multi-format support**: text, images, videos, voice messages, documents
- **Message mapping** stored in database for tracking

### Security
- Only authorized admins can reply in the admin group
- Owner ID stored in environment variables
- Privacy mode must be disabled in BotFather

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Required variables:
- `BOT_TOKEN` - Your Telegram bot token from BotFather
- `OWNER_ID` - Your Telegram user ID (get from @userinfobot)
- `ADMIN_GROUP_ID` - Your private admin group ID (provided: -3802530197)
- `SUPABASE_URL` - Supabase URL (for existing orders integration)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `PORT` - Server port (default: 3000)

### 2. BotFather Settings

**Important**: Disable privacy mode for the bot:

1. Open BotFather
2. Select your bot
3. Send `/setprivacy`
4. Choose "Disable"

This allows the bot to receive all messages, including those from non-contacts.

### 3. Install Dependencies

```bash
npm install
```

### 4. Initialize the Owner

The owner is defined in `.env` via `OWNER_ID`. This user has full control over the admin system.

### 5. Add Admins

As the owner, use the bot to add admins:

```
/addadmin 123456789 support
/addadmin 987654321 admin
```

## Running the Bot

### Production
```bash
npm run start:support
```

### Development (with auto-reload)
```bash
npm run dev:support
```

## How It Works

### Customer Flow
1. Customer sends `/start` to the bot
2. Bot replies: "Thanks for contacting Pick-Fashion. Our team will reply soon."
3. Customer sends any message (text, image, video, etc.)
4. Bot forwards message to admin group with metadata:
   ```
   👤 Customer: @username
   🆔 User ID: 123456789
   💬 Message: [content]
   ```
5. Message mapping is stored in database

### Admin Flow
1. Admin sees customer message in private group
2. Admin replies to the message (using Telegram's reply feature)
3. Bot detects the reply and finds the original customer
4. Bot sends the reply back to the customer
5. Bot confirms to admin: "✅ Reply sent to @customer"

## Architecture

```
Pick-fashion-bot/
├── bot-support.js          # Main bot entry point
├── config/
│   └── index.js           # Environment configuration
├── database/
│   ├── schema.sql         # Database schema
│   ├── db.js              # SQLite connection
│   └── support_bot.db     # SQLite database (auto-created)
├── handlers/
│   ├── adminCommands.js   # Admin command handlers
│   └── messageHandlers.js # Message handlers
├── services/
│   ├── adminService.js    # Admin management
│   └── relayService.js    # Message relay logic
├── utils/
│   └── logger.js          # Logging utility
└── logs/
    └── bot.log            # Bot logs (auto-created)
```

## Database Schema

### admins table
- `id` - Primary key
- `user_id` - Telegram user ID (unique)
- `role` - Role (owner|admin|support)
- `created_at` - Timestamp

### message_mapping table
- `id` - Primary key
- `admin_group_message_id` - Message ID in admin group
- `customer_id` - Customer chat ID
- `customer_username` - Customer username
- `created_at` - Timestamp

## Logging

All activities are logged to `logs/bot.log`:
- Incoming customer messages
- Forwarded messages to admin group
- Admin replies
- Errors and warnings

## Security Notes

- **Never share** your `.env` file or bot token
- **Only the owner** can add/remove admins
- **Admin group must be private** to prevent unauthorized access
- **Disable privacy mode** in BotFather for the bot to work properly

## Troubleshooting

### Bot not receiving messages
- Check that privacy mode is disabled in BotFather
- Verify the bot is running
- Check logs for errors

### Admin replies not reaching customers
- Verify admin is in the database
- Check that the reply is to the correct forwarded message
- Check logs for errors

### Database errors
- Ensure `database/` directory is writable
- Check that SQLite is properly installed
- Verify database file permissions

## Integration with Existing Bot

This support system is separate from the existing order bot (`bot.js` and `bot-enhanced.js`). You can run both bots simultaneously if needed, or replace the existing bot with this support-focused version.

The support bot focuses on customer support relay, while the existing bots handle order management.
