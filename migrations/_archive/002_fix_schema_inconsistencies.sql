-- Migration: 002_fix_schema_inconsistencies.sql
-- Description: Fixes schema inconsistencies between migration 001 and production database
-- Date: 2025-12-28
-- Author: System Migration

-- ============================================================================
-- SECTION 1: Fix users table structure
-- ============================================================================

-- Drop existing users table if it has inconsistencies
DROP TABLE IF EXISTS users CASCADE;

-- Recreate users table with correct structure
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- ============================================================================
-- SECTION 2: Fix org_nodes table structure
-- ============================================================================

-- Drop existing org_nodes table if it exists
DROP TABLE IF EXISTS org_nodes CASCADE;

-- Recreate org_nodes table with correct structure
CREATE TABLE org_nodes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    parent_id INTEGER REFERENCES org_nodes(id) ON DELETE CASCADE,
    node_type VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 0,
    path VARCHAR(500),
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for org_nodes table
CREATE INDEX idx_org_nodes_parent_id ON org_nodes(parent_id);
CREATE INDEX idx_org_nodes_code ON org_nodes(code);
CREATE INDEX idx_org_nodes_node_type ON org_nodes(node_type);
CREATE INDEX idx_org_nodes_manager_id ON org_nodes(manager_id);
CREATE INDEX idx_org_nodes_is_active ON org_nodes(is_active);

-- ============================================================================
-- SECTION 3: Fix teams table structure
-- ============================================================================

-- Drop existing teams table if it exists
DROP TABLE IF EXISTS teams CASCADE;

-- Recreate teams table with correct structure
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    org_node_id INTEGER REFERENCES org_nodes(id) ON DELETE CASCADE,
    team_leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for teams table
CREATE INDEX idx_teams_org_node_id ON teams(org_node_id);
CREATE INDEX idx_teams_team_leader_id ON teams(team_leader_id);
CREATE INDEX idx_teams_code ON teams(code);
CREATE INDEX idx_teams_is_active ON teams(is_active);

-- ============================================================================
-- SECTION 4: Add customers table
-- ============================================================================

-- Drop existing customers table if it exists
DROP TABLE IF EXISTS customers CASCADE;

-- Create customers table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    mobile VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Iran',
    national_id VARCHAR(20),
    customer_type VARCHAR(50) DEFAULT 'individual',
    industry_id INTEGER,
    credit_limit DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for customers table
CREATE INDEX idx_customers_customer_code ON customers(customer_code);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_mobile ON customers(mobile);
CREATE INDEX idx_customers_assigned_user_id ON customers(assigned_user_id);
CREATE INDEX idx_customers_customer_type ON customers(customer_type);
CREATE INDEX idx_customers_is_active ON customers(is_active);

-- ============================================================================
-- SECTION 5: Fix customer_industries table structure
-- ============================================================================

-- Drop existing customer_industries table if it exists
DROP TABLE IF EXISTS customer_industries CASCADE;

-- Recreate customer_industries table with correct structure
CREATE TABLE customer_industries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50) UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for customer_industries table
CREATE INDEX idx_customer_industries_code ON customer_industries(code);
CREATE INDEX idx_customer_industries_is_active ON customer_industries(is_active);

-- Add foreign key constraint to customers table
ALTER TABLE customers 
ADD CONSTRAINT fk_customers_industry 
FOREIGN KEY (industry_id) REFERENCES customer_industries(id) ON DELETE SET NULL;

-- ============================================================================
-- SECTION 6: Rebuild voice_logs table
-- ============================================================================

-- Drop existing voice_logs table if it exists
DROP TABLE IF EXISTS voice_logs CASCADE;

-- Recreate voice_logs table with correct structure
CREATE TABLE voice_logs (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    phone_number VARCHAR(20) NOT NULL,
    call_direction VARCHAR(20) CHECK (call_direction IN ('inbound', 'outbound')),
    call_duration INTEGER DEFAULT 0,
    call_status VARCHAR(50),
    recording_url TEXT,
    transcript TEXT,
    sentiment_score DECIMAL(5,2),
    call_started_at TIMESTAMP,
    call_ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for voice_logs table
CREATE INDEX idx_voice_logs_call_id ON voice_logs(call_id);
CREATE INDEX idx_voice_logs_customer_id ON voice_logs(customer_id);
CREATE INDEX idx_voice_logs_user_id ON voice_logs(user_id);
CREATE INDEX idx_voice_logs_phone_number ON voice_logs(phone_number);
CREATE INDEX idx_voice_logs_call_direction ON voice_logs(call_direction);
CREATE INDEX idx_voice_logs_call_started_at ON voice_logs(call_started_at);

-- ============================================================================
-- SECTION 7: Add voice_enrollment table
-- ============================================================================

-- Drop existing voice_enrollment table if it exists
DROP TABLE IF EXISTS voice_enrollment CASCADE;

-- Create voice_enrollment table
CREATE TABLE voice_enrollment (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    voice_sample_url TEXT,
    enrollment_status VARCHAR(50) DEFAULT 'pending',
    voice_signature TEXT,
    confidence_score DECIMAL(5,2),
    enrollment_date TIMESTAMP,
    last_verified_at TIMESTAMP,
    verification_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for voice_enrollment table
CREATE INDEX idx_voice_enrollment_customer_id ON voice_enrollment(customer_id);
CREATE INDEX idx_voice_enrollment_user_id ON voice_enrollment(user_id);
CREATE INDEX idx_voice_enrollment_status ON voice_enrollment(enrollment_status);
CREATE INDEX idx_voice_enrollment_is_active ON voice_enrollment(is_active);

-- ============================================================================
-- SECTION 8: Fix credit_sale_requests table structure
-- ============================================================================

-- Drop existing credit_sale_requests table if it exists
DROP TABLE IF EXISTS credit_sale_requests CASCADE;

-- Recreate credit_sale_requests table with correct structure
CREATE TABLE credit_sale_requests (
    id SERIAL PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IRR',
    request_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    payment_terms TEXT,
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for credit_sale_requests table
CREATE INDEX idx_credit_sale_requests_request_number ON credit_sale_requests(request_number);
CREATE INDEX idx_credit_sale_requests_customer_id ON credit_sale_requests(customer_id);
CREATE INDEX idx_credit_sale_requests_requested_by ON credit_sale_requests(requested_by);
CREATE INDEX idx_credit_sale_requests_status ON credit_sale_requests(status);
CREATE INDEX idx_credit_sale_requests_due_date ON credit_sale_requests(due_date);

-- ============================================================================
-- SECTION 9: Fix credit_settlement_requests table structure
-- ============================================================================

-- Drop existing credit_settlement_requests table if it exists
DROP TABLE IF EXISTS credit_settlement_requests CASCADE;

-- Recreate credit_settlement_requests table with correct structure
CREATE TABLE credit_settlement_requests (
    id SERIAL PRIMARY KEY,
    settlement_number VARCHAR(50) UNIQUE NOT NULL,
    credit_sale_request_id INTEGER REFERENCES credit_sale_requests(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    settlement_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IRR',
    payment_method VARCHAR(50),
    transaction_reference VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    settlement_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for credit_settlement_requests table
CREATE INDEX idx_credit_settlement_requests_settlement_number ON credit_settlement_requests(settlement_number);
CREATE INDEX idx_credit_settlement_requests_credit_sale_id ON credit_settlement_requests(credit_sale_request_id);
CREATE INDEX idx_credit_settlement_requests_customer_id ON credit_settlement_requests(customer_id);
CREATE INDEX idx_credit_settlement_requests_requested_by ON credit_settlement_requests(requested_by);
CREATE INDEX idx_credit_settlement_requests_status ON credit_settlement_requests(status);
CREATE INDEX idx_credit_settlement_requests_settlement_date ON credit_settlement_requests(settlement_date);

-- ============================================================================
-- SECTION 10: Create trigger functions for updated_at timestamps
-- ============================================================================

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_nodes_updated_at BEFORE UPDATE ON org_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_industries_updated_at BEFORE UPDATE ON customer_industries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_logs_updated_at BEFORE UPDATE ON voice_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_enrollment_updated_at BEFORE UPDATE ON voice_enrollment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_sale_requests_updated_at BEFORE UPDATE ON credit_sale_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_settlement_requests_updated_at BEFORE UPDATE ON credit_settlement_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 11: Insert default/seed data
-- ============================================================================

-- Insert default customer industries
INSERT INTO customer_industries (name, code, description) VALUES
    ('Technology', 'TECH', 'Technology and IT services'),
    ('Manufacturing', 'MANUF', 'Manufacturing and production'),
    ('Retail', 'RETAIL', 'Retail and e-commerce'),
    ('Healthcare', 'HEALTH', 'Healthcare and medical services'),
    ('Finance', 'FINANCE', 'Financial services and banking'),
    ('Education', 'EDU', 'Education and training'),
    ('Real Estate', 'REALESTATE', 'Real estate and property'),
    ('Other', 'OTHER', 'Other industries')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SECTION 12: Grant permissions (adjust as needed)
-- ============================================================================

-- Grant appropriate permissions to application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================================
-- Migration completed successfully
-- ============================================================================

COMMENT ON TABLE users IS 'Users table with authentication and profile information';
COMMENT ON TABLE org_nodes IS 'Organizational hierarchy nodes';
COMMENT ON TABLE teams IS 'Teams within organizational structure';
COMMENT ON TABLE customers IS 'Customer information and profiles';
COMMENT ON TABLE customer_industries IS 'Industry categories for customers';
COMMENT ON TABLE voice_logs IS 'Voice call logs and recordings';
COMMENT ON TABLE voice_enrollment IS 'Voice biometric enrollment data';
COMMENT ON TABLE credit_sale_requests IS 'Credit sale requests and approvals';
COMMENT ON TABLE credit_settlement_requests IS 'Credit settlement and payment requests';
