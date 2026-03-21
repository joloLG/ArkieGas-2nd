-- Database Schema for Gasul Inventory Sales System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  min_alert INTEGER NOT NULL DEFAULT 10,
  stocks INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales table
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'full_loan', 'partial_loan')),
  payment_value DECIMAL(10,2),
  profit DECIMAL(10,2) DEFAULT 0,
  returned_empty BOOLEAN DEFAULT false,
  empty_quantity_not_returned INTEGER DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Loans table
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  selling_price DECIMAL(10,2) NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  loan_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Empty tanks unreturned table
CREATE TABLE empty_tanks_unreturned (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shop empty tanks table (returned and in shop)
CREATE TABLE shop_empty_tanks (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0
);

-- Transactions table to track all sales transactions
CREATE TABLE transactions (
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
CREATE TABLE incoming_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  payment_amount DECIMAL(10,2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_sales_date ON sales(date);
CREATE INDEX idx_sales_customer ON sales(customer_name);
CREATE INDEX idx_loans_customer ON loans(customer_name);
CREATE INDEX idx_empty_tanks_customer ON empty_tanks_unreturned(customer_name);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_customer ON transactions(customer_name);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_incoming_payments_transaction ON incoming_payments(transaction_id);
CREATE INDEX idx_incoming_payments_customer ON incoming_payments(customer_name);

-- Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE empty_tanks_unreturned ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_empty_tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users)
CREATE POLICY "Allow authenticated users to manage products" ON products
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage sales" ON sales
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage loans" ON loans
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage empty_tanks_unreturned" ON empty_tanks_unreturned
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage shop_empty_tanks" ON shop_empty_tanks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage transactions" ON transactions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage incoming_payments" ON incoming_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for products updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate profit (for loans when fully paid)
CREATE OR REPLACE FUNCTION calculate_loan_profit(loan_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  loan_record RECORD;
  total_profit DECIMAL;
BEGIN
  SELECT * INTO loan_record FROM loans WHERE id = loan_id;
  IF loan_record.paid_amount >= loan_record.loan_amount THEN
    total_profit := (loan_record.selling_price - loan_record.base_price) * (SELECT quantity FROM sales WHERE customer_name = loan_record.customer_name AND product_id = loan_record.product_id LIMIT 1);
    RETURN total_profit;
  END IF;
  RETURN 0;
END;
$$ LANGUAGE plpgsql;

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

-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- Storage policies for product images
CREATE POLICY "Allow authenticated users to upload product images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow public to view product images" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "Allow authenticated users to update product images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete product images" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Function to send low stock notification (placeholder, actual sending via API)
CREATE OR REPLACE FUNCTION notify_low_stock(product_id UUID)
RETURNS VOID AS $$
BEGIN
  -- This would be called from the app, but here as placeholder
  -- In production, integrate with email service
  RAISE NOTICE 'Low stock alert for product %', product_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to notify on low stock (when stocks <= min_alert)
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stocks <= NEW.min_alert THEN
    PERFORM notify_low_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER low_stock_trigger AFTER UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION check_low_stock();
