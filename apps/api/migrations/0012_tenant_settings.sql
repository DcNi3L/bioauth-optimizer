-- Настройки тенанта (#v3.4): брендинг страницы входа и параметры входа, как Branding и Authentication в Auth0.
-- Одна строка: первичный ключ — константа true.
CREATE TABLE tenant_settings (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  product_name       text NOT NULL DEFAULT 'BioAuth' CHECK (length(product_name) BETWEEN 1 AND 40),
  accent_color       text CHECK (accent_color ~ '^#[0-9a-f]{6}$'),
  logo_url           text CHECK (logo_url ~ '^https://' AND length(logo_url) <= 500),
  login_title        text CHECK (length(login_title) <= 80),
  login_subtitle     text CHECK (length(login_subtitle) <= 200),
  support_url        text CHECK (support_url ~ '^(https?://|mailto:)' AND length(support_url) <= 500),
  privacy_url        text CHECK (privacy_url ~ '^https?://' AND length(privacy_url) <= 500),
  terms_url          text CHECK (terms_url ~ '^https?://' AND length(terms_url) <= 500),
  allow_signup       boolean NOT NULL DEFAULT true,
  allow_cross_device boolean NOT NULL DEFAULT true,
  updated_at         timestamptz,
  updated_by         uuid REFERENCES app_user (id) ON DELETE SET NULL
);
INSERT INTO tenant_settings DEFAULT VALUES;
