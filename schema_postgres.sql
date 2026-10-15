-- SECOND IN: database demo marketplace preloved

CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);
CREATE TABLE IF NOT EXISTS products (
 id BIGSERIAL PRIMARY KEY,
 seller_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 category TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price > 0),
 condition TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 image_url TEXT NOT NULL DEFAULT '',
 badge TEXT NOT NULL DEFAULT '',
 stock INTEGER NOT NULL DEFAULT 1 CHECK(stock IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);
CREATE TABLE IF NOT EXISTS cart_items (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,product_id)
);
CREATE TABLE IF NOT EXISTS wishlists (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,product_id)
);
CREATE TABLE IF NOT EXISTS orders (
 id BIGSERIAL PRIMARY KEY,
 buyer_id INTEGER NOT NULL REFERENCES users(id),
 total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'Menunggu konfirmasi',
 created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);
CREATE TABLE IF NOT EXISTS order_items (
 order_id INTEGER NOT NULL REFERENCES orders(id),
 product_id INTEGER NOT NULL REFERENCES products(id),
 item_name TEXT NOT NULL,
 price INTEGER NOT NULL,
 PRIMARY KEY(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id BIGSERIAL PRIMARY KEY,
 product_id INTEGER NOT NULL REFERENCES products(id),
 buyer_id INTEGER NOT NULL REFERENCES users(id),
 sender_id INTEGER NOT NULL REFERENCES users(id),
 body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(product_id,buyer_id,id);
