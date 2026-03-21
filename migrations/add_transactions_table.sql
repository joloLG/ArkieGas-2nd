-- Migration: Add Transactions and Payment Tracking System
-- This file adds the new transaction tracking functionality to existing database

-- Transactions table to track all sales transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'payment')),
  reference_id UUID, -- References sale_id for payments, or null for initial sales
  customer_name TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  selling_price DECIMAL(10,2) NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'full_loan', 'partial_loan')),
  payment_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  remaining_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  excess_payment DECIMAL(10,2) NOT NULL DEFAULT 0,
  profit DECIMAL(10,2) NOT NULL DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Incoming payments table for tracking partial/full loan payments
CREATE TABLE IF NOT EXISTS incoming_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  payment_amount DECIMAL(10,2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_name);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_incoming_payments_transaction ON incoming_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_incoming_payments_customer ON incoming_payments(customer_name);

-- Row Level Security (RLS) for new tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for new tables
DROP POLICY IF EXISTS "Allow authenticated users to manage transactions" ON transactions;
CREATE POLICY "Allow authenticated users to manage transactions" ON transactions
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to manage incoming_payments" ON incoming_payments;
CREATE POLICY "Allow authenticated users to manage incoming_payments" ON incoming_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- Function to calculate profit for full cash payment
CREATE OR REPLACE FUNCTION calculate_cash_profit(selling_price DECIMAL, base_price DECIMAL, quantity INTEGER)
RETURNS DECIMAL AS $$
BEGIN
  RETURN (selling_price - base_price) * quantity;
END;
$$ LANGUAGE plpgsql;

-- Function to handle partial payment with excess payment calculation
CREATE OR REPLACE FUNCTION process_partial_payment(
  transaction_id UUID,
  payment_amount DECIMAL,
  remaining_balance DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  excess_amount DECIMAL := 0;
  new_remaining_balance DECIMAL := remaining_balance;
BEGIN
  -- Calculate new remaining balance
  new_remaining_balance := remaining_balance - payment_amount;
  
  -- Check for overpayment
  IF new_remaining_balance < 0 THEN
    excess_amount := ABS(new_remaining_balance);
    new_remaining_balance := 0;
  END IF;
  
  -- Update the transaction
  UPDATE transactions 
  SET 
    remaining_balance = new_remaining_balance,
    excess_payment = excess_payment + excess_amount,
    profit = profit + excess_amount
  WHERE id = transaction_id;
  
  RETURN excess_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to create transaction record
CREATE OR REPLACE FUNCTION create_transaction(
  p_transaction_type TEXT,
  p_reference_id UUID,
  p_customer_name TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_selling_price DECIMAL,
  p_base_price DECIMAL,
  p_payment_method TEXT,
  p_payment_value DECIMAL
)
RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
  calculated_profit DECIMAL := 0;
  remaining_balance DECIMAL := 0;
  total_amount DECIMAL := p_selling_price * p_quantity;
BEGIN
  -- Calculate profit based on payment method
  IF p_payment_method = 'cash' THEN
    calculated_profit := calculate_cash_profit(p_selling_price, p_base_price, p_quantity);
  ELSIF p_payment_method = 'partial_loan' THEN
    calculated_profit := calculate_cash_profit(p_selling_price, p_base_price, p_quantity);
    remaining_balance := total_amount - p_payment_value;
  ELSIF p_payment_method = 'full_loan' THEN
    remaining_balance := total_amount;
  END IF;
  
  -- Insert transaction
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id, quantity,
    selling_price, base_price, payment_method, payment_value,
    remaining_balance, profit
  ) VALUES (
    p_transaction_type, p_reference_id, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, p_payment_method, p_payment_value,
    remaining_balance, calculated_profit
  ) RETURNING id INTO transaction_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Update existing sales records to have proper profit calculations for cash sales
UPDATE sales 
SET profit = (selling_price - (SELECT base_price FROM products WHERE products.id = sales.product_id)) * quantity
WHERE payment_method = 'cash' AND profit = 0;
