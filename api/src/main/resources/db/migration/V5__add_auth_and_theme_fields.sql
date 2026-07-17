-- V5: Add auth and theme fields to users table
ALTER TABLE users
ADD COLUMN email VARCHAR(255) UNIQUE,
ADD COLUMN password_hash VARCHAR(255),
ADD COLUMN theme_mode VARCHAR(20),
ADD COLUMN theme_color VARCHAR(20);
