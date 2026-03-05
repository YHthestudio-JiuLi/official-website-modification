# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YHthestudio is a bilingual (Chinese/English) e-commerce web application with a forum feature. It uses a modern frontend architecture with Vue.js 3 and a dual-stack backend with Node.js/Express for the API server and Python/FastAPI for database operations.

## Development Commands

```bash
# Install dependencies
npm install

# Start Python DB backend (required first)
npm run py

# Start Vue frontend development server (in another terminal)
npm run dev

# Start API server (in another terminal)
npm start

# Build Vue frontend for production
npm run build
```

## Architecture

### Frontend (Vue.js 3)
- **Framework**: Vue 3 + Vite
- **State Management**: Pinia
- **Routing**: Vue Router
- **Internationalization**: Vue I18n
- **HTTP Client**: Axios
- **Location**: `src/` directory

### Backend (Dual-Stack Design)
- **API Server** (`api-server.js`): Express REST API server handling HTTP routes, sessions, and JSON responses. Runs on port 3000 by default.
- **Python Backend** (`py_backend/main.py`): FastAPI service handling all database operations via RPC. Runs on port 5100 by default.

The Node.js server communicates with the Python backend through HTTP RPC calls defined in `database.js`. All database operations go through `dbOperations` object.

### Key Files
- `api-server.js` - Main Express API server with all REST endpoints
- `database.js` - RPC client for Python backend communication
- `py_backend/main.py` - FastAPI server with SQLite database and RPC endpoints
- `translate.js` - Chinese-to-English translation utilities for product content
- `src/` - Vue.js frontend source code
  - `views/` - Page components (user/ and admin/)
  - `components/` - Reusable components
  - `stores/` - Pinia state management
  - `router/` - Vue Router configuration
  - `i18n/` - Internationalization files

### Database Schema (SQLite)
Tables: `users`, `products`, `orders`, `forum_posts`, `forum_replies`, `contact_messages`, `payment_settings`

The Python backend (`py_backend/main.py`) contains the schema definitions and auto-initializes the database on startup with default admin user and sample data.

## API Endpoints

### User API
- `GET /api/auth/me` - Get current user
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/products` - Get product list
- `GET /api/products/:id` - Get product detail
- `POST /api/orders` - Create order
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order detail
- `POST /api/orders/:id/confirm` - Confirm payment
- `GET /api/forum/posts` - Get forum posts
- `GET /api/forum/posts/:id` - Get post detail
- `POST /api/forum/posts` - Create post
- `GET /api/forum/posts/:id/replies` - Get post replies
- `POST /api/forum/posts/:id/replies` - Reply to post
- `DELETE /api/forum/replies/:id` - Delete reply

### Admin API
- `POST /api/admin/auth/login` - Admin login
- `POST /api/admin/auth/logout` - Admin logout
- `GET /api/admin/auth/me` - Get current admin
- `GET /api/admin/stats` - Get dashboard statistics
- `GET/POST/PUT/DELETE /api/admin/users` - User management
- `GET/POST/PUT/DELETE /api/admin/products` - Product management
- `GET/POST/PUT/DELETE /api/admin/posts` - Forum management
- `GET/PUT/DELETE /api/admin/orders` - Order management
- `GET/PUT /api/admin/payment-settings` - Payment settings

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

1. Build the Vue frontend:
```bash
npm run build
```

2. The built files will be in `dist/`

3. Configure your web server (Nginx/Apache) to:
   - Serve static files from `dist/`
   - Proxy `/api` requests to the Node.js server

PM2 configuration example for running the API server:
```bash
pm2 start api-server.js --name yh-api
```

## Key Patterns

### Adding a new API endpoint
1. Add the route handler in `api-server.js`
2. Use existing `dbOperations` methods or add new ones in `database.js`

### Adding a new Vue page
1. Create component in `src/views/user/` or `src/views/admin/`
2. Add route in `src/router/index.js`
3. Add store if needed in `src/stores/`

### Session Management
- User sessions: `req.session.user` for logged-in users
- Admin sessions: `req.session.admin` for admin panel access
- Session middleware handles CORS credentials for Vue frontend

### Translation Flow
Product content stored in Chinese is translated to English via `translate.js` utilities before returning JSON responses. The `translateProduct()` and `translateProducts()` functions handle automatic translation.

## CORS Configuration

The API server is configured to accept requests from:
- `http://localhost:5173` (Vue dev server)
- `http://127.0.0.1:5173`

Credentials (cookies) are enabled for session management.