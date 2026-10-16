# Pick Fashion Support Bot

An admin-relay support bot for Pick Fashion. Customers message the bot on
Telegram (or submit a request from the website), the bot forwards the request
into a private admin group, and admins reply straight from that group — the
reply is routed back to the right customer automatically.

> Looking for the admin command reference, schema and troubleshooting? See
> [SUPPORT_README.md](SUPPORT_README.md). This file is the overview and setup guide.

## How it works

```
Website  ──POST /api/support-request──┐
                                     ├──► forward to ADMIN_GROUP_ID ──► admin replies ──► customer
Customer ──── Telegram DM ───────────┘
```

1. A customer DMs the bot (or the website posts a request to `/api/support-request`).
2. The bot posts the request into the private admin group, tagged with the
   customer's `@username` and numeric ID.
3. The admin **replies to that message** in Telegram.
4. The bot looks up which customer that admin message belongs to, and delivers
   the reply to them. Replying with `confirm` sends an order-confirmation
   template instead of a plain relay.

Photos, videos, voice messages and documents are relayed in both directions.

## Commands

Customer-facing:

| Command  | Description                                            |
| -------- | ------------------------------------------------------ |
| `/start` | Welcome message ("our team will reply soon")           |

Admin (owner-only unless noted):

| Command                          | Description                          |
| -------------------------------- | ------------------------------------ |
| `/addadmin <user_id> [role]`     | Add an admin — owner only            |
| `/removeadmin <user_id>`         | Remove an admin — owner only         |
| `/setrole <user_id> <role>`      | Change a role — owner only           |
| `/admins`                        | List admins — any authorized admin   |

Roles are `owner`, `admin`, `support`.

## Setup

### 1. Create the bot

Talk to [@BotFather](https://t.me/BotFather), create a bot, and copy its token.

### 2. Disable privacy mode

Bots in groups only see messages that mention them unless privacy mode is off.
Send `/setprivacy` to BotFather, pick your bot, and choose **Disable**.

### 3. Collect your IDs

- **Your own ID** — message [@userinfobot](https://t.me/userinfobot).
- **Admin group ID** — create a private group, add the bot, then send a message
  in the group and check the bot log or a `getUpdates` call for the negative
  chat ID (group IDs start with `-`).

### 4. Environment file

```bash
cp .env.example .env
```

Then fill in `.env`:

```
BOT_TOKEN=123456:your-bot-token
OWNER_ID=your-telegram-user-id
ADMIN_GROUP_ID=-1001234567890
PORT=3000
```

`.env` is gitignored — never commit it, and never paste a real token into a
README, an issue, or a chat. The config module refuses to start if any of
`BOT_TOKEN`, `OWNER_ID` or `ADMIN_GROUP_ID` is missing.

### 5. Install and run

```bash
npm install
npm start        # production
npm run dev      # auto-restart on file changes
```

Expected startup output:

```
🤖 Pick Fashion Support Bot is starting...
👑 Owner ID: 123456789
👥 Admin Group ID: -1001234567890
🌐 Web server running on port 3000
✅ Support bot is ready!
```

### 6. Add admins

As the owner, DM the bot:

```
/addadmin 123456789 support
/addadmin 987654321 admin
```

The owner (`OWNER_ID`) is always authorized without being in the database.
Database-backed admins are what gate who may reply inside the admin group.

## HTTP endpoints

The bot runs a small Express server alongside long-polling, mainly so hosting
platforms that expect an open port stay happy.

| Method | Path                    | Purpose                                              |
| ------ | ----------------------- | ---------------------------------------------------- |
| `GET`  | `/`                     | Keep-alive / liveness string                          |
| `GET`  | `/health`               | JSON health check                                     |
| `POST` | `/api/support-request`  | Website order or support request → admin group        |

`POST /api/support-request` accepts a flexible body; these fields are recognised:

```jsonc
{
  "customerId": 123456789,        // required — also accepts customerTelegramId, telegramId, chatId, userId
  "username": "customer123",      // optional
  "customerName": "John",         // optional
  "productName": "Baseball Ball", // required if no note
  "productId": "abc123",
  "quantity": 1,
  "size": "M",
  "color": "black",
  "price": "8.99",
  "productUrl": "https://…",
  "note": "Hi, is this in stock?"
}
```

The customer must have started a chat with the bot at least once, or Telegram
will not let the bot message them.

## Storage

Everything lives in a single SQLite file at `database/support_bot.db`, created
on first run and covered by the schema in `database/schema.sql`. Two tables:

- `admins` — who is allowed to act as an admin, and with what role.
- `message_mapping` — admin-group message ID → customer chat ID, which is how
  replies are routed back.

There is **no** Supabase or other external database in this bot.

`.db`, `.db-wal` and `.db-shm` files are gitignored: they contain real customer
IDs and should never be committed.

## Rate limiting

Customer messages are throttled in memory (15 per minute per customer, with a
short minimum gap between messages) so the admin group cannot be flooded. The
customer is told once per window when they are being throttled.

## Running 24/7

```bash
# PM2 on a VPS
npm install -g pm2
pm2 start bot-support.js --name "pick-fashion-support"
pm2 save
pm2 startup
```

On Railway / Render / Fly, set `BOT_TOKEN`, `OWNER_ID`, `ADMIN_GROUP_ID` as
environment variables and point the start command at `npm start`. Note that
`better-sqlite3` is a native module, so the host needs build tools available
during install, and the filesystem must persist between restarts if you want
the admin list and message mappings to survive.

## Troubleshooting

**Bot doesn't see group replies** — privacy mode is still enabled. Redo step 2.

**"Missing required environment variables"** — `.env` is absent, incomplete, or
being loaded from a different working directory. Start the bot from the repo root.

**Customer never gets the reply** — they may have blocked the bot. The log
records `bot was blocked by the user` or `user is deactivated` for these.

**"Configured adminGroupId is not a group/supergroup/channel"** — `ADMIN_GROUP_ID`
is a user ID, not a group. Group IDs are negative; supergroups usually look like
`-100…`.

**Bot replies land in the wrong chat** — confirm no other process is polling the
same token. Two pollers on one token will steal each other's updates.

**Logs** — everything goes to stdout and to `logs/bot.log`.

## Security notes

- The bot token belongs only in `.env`. Leaked tokens must be revoked with
  `/revoke` in BotFather — regenerating is the only fix.
- The admin group must stay private: anyone in it who is also in the `admins`
  table can message every customer.
- Only the owner can grant admin rights.

## Support

Issues? Contact: pickfashionzr@gmail.com or @Rutha_5
