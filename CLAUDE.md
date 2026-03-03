# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YHthestudio is a bilingual (Chinese/English) e-commerce web application with a forum feature. It uses a dual-stack architecture with Node.js/Express for the web server and Python/FastAPI for database operations.

## Development Commands

```bash
# Install dependencies
npm install

# Start Python DB backend (required first)
npm run py

# Start Node.js server (in another terminal)
npm start

# Development mode with hot reload
npm run dev

# View database contents
npm run view-db

# Initialize database (ensure Python backend is running)
node init-db.js
```

## Architecture

### Dual-Stack Design
- **Node.js Server** (`server.js`): Express web server handling HTTP routes, sessions, and EJS template rendering. Runs on port 3000 by default.
- **Python Backend** (`py_backend/main.py`): FastAPI service handling all database operations via RPC. Runs on port 5100 by default.

The Node.js server communicates with the Python backend through HTTP RPC calls defined in `database.js`. All database operations go through `dbOperations` object.

### Key Files
- `server.js` - Main Express application with all routes
- `database.js` - RPC client for Python backend communication
- `py_backend/main.py` - FastAPI server with SQLite database and RPC endpoints
- `i18n.js` - Internationalization middleware
- `translate.js` - Chinese-to-English translation utilities for product content

### Database Schema (SQLite)
Tables: `users`, `products`, `orders`, `forum_posts`, `forum_replies`, `contact_messages`, `payment_settings`

The Python backend (`py_backend/main.py`) contains the schema definitions and auto-initializes the database on startup with default admin user and sample data.

### Views Structure
- `views/` - User-facing pages (index, login, register, products, forum, orders, payment)
- `views/admin/` - Admin panel pages (dashboard, users, products, posts, orders, payment-settings)
- `views/partials/` - Shared template partials

## Default Credentials

Admin account created on first init:
- Username: `admin`
- Password: `admin123`

## Environment Variables

- `PORT` - Node.js server port (default: 3000)
- `HOST` - Node.js server host (default: 0.0.0.0)
- `PY_DB_URL` - Python backend URL (default: http://127.0.0.1:5100)
- `YH_DB_PATH` - SQLite database path (default: data/yhthestudio.db)

## Production Deployment

PM2 configuration is provided in `ecosystem.config.js`:
```bash
pm2 start ecosystem.config.js
```

Nginx reverse proxy configuration example in `nginx.conf.example`.

## Key Patterns

### Adding a new RPC operation
1. Add the operation handler in `py_backend/main.py` inside `dispatch()` function
2. Add the corresponding method in `database.js` under `dbOperations`

### Session Management
- User sessions: `req.session.user` for logged-in users
- Admin sessions: `req.session.admin` for admin panel access
- Admin middleware: `requireAdmin` function validates admin access

### Translation Flow
Product content stored in Chinese is translated to English via `translate.js` utilities before rendering. The `translateProduct()` and `translateProducts()` functions handle automatic translation.