-- ============================================================
-- Warranties Table Schema
-- Supabase Project: https://zebmqkgyomrkfrvoeszt.supabase.co
-- ============================================================

-- Create the warranties table
CREATE TABLE IF NOT EXISTS warranties (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_name  TEXT NOT NULL,
    brand         TEXT,
    order_id      TEXT,
    purchase_date DATE,
    image_url     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS on the warranties table
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own warranties
CREATE POLICY "Users can view their own warranties"
    ON warranties
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can INSERT warranties for themselves only
CREATE POLICY "Users can insert their own warranties"
    ON warranties
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can UPDATE their own warranties
CREATE POLICY "Users can update their own warranties"
    ON warranties
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own warranties
CREATE POLICY "Users can delete their own warranties"
    ON warranties
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- Auto-update updated_at on row changes
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON warranties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
