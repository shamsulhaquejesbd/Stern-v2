-- ============================================================================
-- Ensec ERP: Create All 90 Missing Tables for Supabase Project gelfhddiibxkcpyekaau
-- Safe & idempotent: skips existing users/HR/payroll/overtime/settings tables.
-- ============================================================================

-- 2. WAREHOUSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  district TEXT DEFAULT 'Dhaka',
  incharge_name TEXT,
  incharge_phone TEXT,
  phone TEXT,
  email TEXT,
  manager_name TEXT,
  description TEXT,
  is_factory_plant BOOLEAN DEFAULT FALSE,
  type TEXT DEFAULT 'Central Hub',
  capacity_packs INT DEFAULT 5000,
  current_stock_packs INT DEFAULT 0,
  capacity_units INT DEFAULT 5000,
  current_stock_units INT DEFAULT 0,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script for warehouses
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_factory_plant BOOLEAN DEFAULT FALSE;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Central Hub';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS capacity_packs INT DEFAULT 5000;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS current_stock_packs INT DEFAULT 0;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS capacity_units INT DEFAULT 5000;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS current_stock_units INT DEFAULT 0;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 3. DISTRIBUTORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.distributors (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT,
  proprietor_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  district TEXT DEFAULT 'Dhaka',
  region TEXT DEFAULT 'Dhaka Division',
  area TEXT,
  territory TEXT DEFAULT 'Central Market',
  db_point TEXT,
  market_hierarchy TEXT,
  departments TEXT[] DEFAULT '{}',
  address TEXT,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  credit_limit_bdt NUMERIC(12, 2) DEFAULT 500000.00,
  current_balance_bdt NUMERIC(12, 2) DEFAULT 0.00,
  current_outstanding_bdt NUMERIC(12, 2) DEFAULT 0.00,
  opening_balance_bdt NUMERIC(12, 2) DEFAULT 0.00,
  payment_terms_days INT DEFAULT 30,
  assigned_salesperson_id TEXT,
  assigned_salesperson_name TEXT,
  assigned_rep_id TEXT,
  assigned_rep_name TEXT,
  customer_category_id TEXT,
  customer_category_name TEXT,
  discontinue_date DATE,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graceful column migrations for existing instances of distributors table
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS proprietor_name TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS district TEXT DEFAULT 'Dhaka';
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS db_point TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS market_hierarchy TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS current_outstanding_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS opening_balance_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 30;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS assigned_salesperson_id TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS assigned_salesperson_name TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS assigned_rep_id TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS assigned_rep_name TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS customer_category_id TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS customer_category_name TEXT;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS discontinue_date DATE;
ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_distributors_code ON public.distributors(code);
CREATE INDEX IF NOT EXISTS idx_distributors_status ON public.distributors(status);

-- ============================================================================
-- 4. CUSTOMERS & RETAILERS DIRECTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  channel TEXT DEFAULT 'Distributor Sales', -- 'Distributor Sales' | 'Direct Sales'
  customer_type TEXT DEFAULT 'Retailer', -- 'Retailer' | 'Dealer' | 'Corporate Customer' | 'Workshop' | 'Project Customer'
  pricing_tier TEXT DEFAULT 'Dealer / Retailer Channel',
  assigned_distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  assigned_distributor_name TEXT,
  assigned_salesperson_id TEXT,
  assigned_salesperson_name TEXT,
  assigned_rep_id TEXT,
  assigned_rep_name TEXT,
  customer_category_id TEXT,
  customer_category_name TEXT,
  district TEXT DEFAULT 'Dhaka',
  area TEXT,
  market TEXT,
  territory TEXT DEFAULT 'Mirpur',
  market_hierarchy TEXT,
  address TEXT,
  custom_product_prices_json JSONB DEFAULT '{}'::jsonb,
  communication_notes_json JSONB DEFAULT '[]'::jsonb,
  notes_json JSONB DEFAULT '[]'::jsonb,
  credit_limit_bdt NUMERIC(12, 2) DEFAULT 50000.00,
  outstanding_balance_bdt NUMERIC(12, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'Active',
  gps_coordinates TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script for customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS market TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS market_hierarchy TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS assigned_salesperson_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS assigned_salesperson_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS assigned_rep_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS assigned_rep_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_category_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_category_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS custom_product_prices_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS communication_notes_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);

-- ============================================================================
-- 5. FINISHED PRODUCTS TABLE (Lithium Battery Packs & SKUs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  brand TEXT DEFAULT 'Ensec Lithium BD',
  category TEXT DEFAULT 'Electric Vehicle (EV) Batteries',
  
  -- Electrical & Battery Ratings
  nominal_voltage NUMERIC(6, 2) DEFAULT 51.20,
  capacity_ah NUMERIC(6, 2) DEFAULT 86.00,
  energy_wh NUMERIC(10, 2) DEFAULT 4403.20,
  battery_type TEXT DEFAULT 'LiFePO4',
  chemistry TEXT DEFAULT 'Lifepo4',

  -- Detailed Engineering & Technical Specifications
  normal_voltage TEXT DEFAULT '51.2V',
  rated_capacity TEXT DEFAULT '51.2V86Ah',
  cycle_life TEXT DEFAULT '>4000',
  typical_capacity_kwh TEXT DEFAULT '4.40KWH',
  max_charge_current TEXT DEFAULT '50A',
  standard_charging TEXT DEFAULT 'CC/CV, 0.5C, 58.4V.',
  max_discharge_current TEXT DEFAULT '120A/150A/200A',
  weight_kg TEXT DEFAULT '40KG (±)2%',
  dimension_cm TEXT DEFAULT '50*36*26',
  operating_temperature TEXT DEFAULT '0-60°C',
  mileage_km TEXT DEFAULT '80-90KM with Full Charge.',

  -- 5-Channel Pricing Architecture (BDT)
  trade_price_bdt NUMERIC(12, 2) DEFAULT 0.00,
  distributor_price_bdt NUMERIC(12, 2) DEFAULT 85000.00,
  dealer_price_bdt NUMERIC(12, 2) DEFAULT 89000.00,
  corporate_price_bdt NUMERIC(12, 2) DEFAULT 92000.00,
  project_price_bdt NUMERIC(12, 2) DEFAULT 88000.00,
  retail_price_bdt NUMERIC(12, 2) DEFAULT 98000.00,
  mrp_bdt NUMERIC(12, 2) DEFAULT 98000.00,
  assembly_cost_estimate_bdt NUMERIC(12, 2) DEFAULT 4500.00,
  category_prices JSONB DEFAULT '{}'::jsonb,

  -- Commercial & Manufacturing Parameters
  warranty_months INT DEFAULT 36,
  stock_quantity INT DEFAULT 0,
  unit TEXT DEFAULT 'Units',
  bom JSONB DEFAULT '[]'::jsonb,
  image_url TEXT,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script (adds missing specification columns to existing tables)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS battery_type TEXT DEFAULT 'LiFePO4';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS chemistry TEXT DEFAULT 'Lifepo4';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS normal_voltage TEXT DEFAULT '51.2V';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rated_capacity TEXT DEFAULT '51.2V86Ah';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cycle_life TEXT DEFAULT '>4000';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS typical_capacity_kwh TEXT DEFAULT '4.40KWH';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_charge_current TEXT DEFAULT '50A';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS standard_charging TEXT DEFAULT 'CC/CV, 0.5C, 58.4V.';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_discharge_current TEXT DEFAULT '120A/150A/200A';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_kg TEXT DEFAULT '40KG (±)2%';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dimension_cm TEXT DEFAULT '50*36*26';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS operating_temperature TEXT DEFAULT '0-60°C';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mileage_km TEXT DEFAULT '80-90KM with Full Charge.';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS distributor_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dealer_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS corporate_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS project_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS retail_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS assembly_cost_estimate_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_prices JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS customer_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS minimum_selling_price_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_cid INT DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_kushtia_plant INT DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_dhaka_hubs INT DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pcs_per_carton INT DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bom JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Units';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 5.1 RAW MATERIAL CLASSIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.raw_material_classifications (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'CLS-CELL', 'CLS-ELEC', 'CLS-MECH'
  name TEXT NOT NULL, -- 'Active Electrochemical Cells', 'Power Electronics & Control', etc.
  description TEXT,
  color_tag TEXT DEFAULT 'amber',
  status TEXT DEFAULT 'Active', -- 'Active' | 'Inactive'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. RAW MATERIAL CATEGORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.raw_material_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'RMC-CELL', 'RMC-BMS', 'RMC-CASE'
  name TEXT NOT NULL, -- 'Cell', 'BMS', 'Casing', 'Wire & Busbar', 'Connector', 'PCB', 'Insulation & Pack'
  parent_classification TEXT, -- 'Active Electrochemical Cells', 'Power Electronics & Control', etc.
  description TEXT,
  status TEXT DEFAULT 'Active', -- 'Active' | 'Inactive'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. RAW MATERIALS TABLE (Kushtia Factory Inventory & SCM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'RM-CELL-105', 'RM-BMS-48V'
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Cell' | 'BMS' | 'Casing' | 'Connector' | 'Wire & Busbar' | 'PCB' | 'Insulation & Pack'
  category_id BIGINT REFERENCES public.raw_material_categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'Pieces', -- 'Pieces' | 'Units' | 'Sets' | 'Kits' | 'Sheets'
  stock_kushtia INT DEFAULT 0,
  reorder_level INT DEFAULT 0,
  last_purchase_unit_cost_bdt NUMERIC(12, 2) DEFAULT 0.00,
  standard_cost_bdt NUMERIC(12, 2) DEFAULT 0.00,
  type TEXT DEFAULT 'Local', -- 'Local' | 'Import'
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script for raw_materials
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES public.raw_material_categories(id) ON DELETE SET NULL;
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Local';

-- Auto-link category_id for existing raw materials if null
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raw_material_categories') THEN
    UPDATE public.raw_materials rm
    SET category_id = rmc.id
    FROM public.raw_material_categories rmc
    WHERE rm.category_id IS NULL AND LOWER(TRIM(rm.category)) = LOWER(TRIM(rmc.name));
  END IF;
END $$;

-- ============================================================================
-- 8. SALES ORDERS TABLE (Captured via Mobile App or Portal)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  salesperson_id TEXT,
  salesperson_name TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_name TEXT,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gross_amount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  discount_amount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  tax_vat_bdt NUMERIC(12, 2) DEFAULT 0.00,
  net_amount_bdt NUMERIC(12, 2) NOT NULL,
  paid_amount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  due_amount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'Pending Delivery', -- 'Pending Delivery' | 'Delivered' | 'Partially Delivered' | 'Cancelled'
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of items: [{ productId, productName, quantity, unitPriceBDT, lineTotal }]
  applied_offer_code TEXT,
  cancellation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script for sales orders workflow attributes
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'Distributor Sales';
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS distributor_name TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS sub_total_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS discount_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS vat_rate_percent NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Unpaid';
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash';
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS do_number TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS do_generated_at TIMESTAMPTZ;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS do_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS do_accepted_by TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS challan_number TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS bill_number TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS delivery_status TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON public.sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON public.sales_orders(status);

-- ============================================================================
-- 9. TADA CLAIMS TABLE (Field Travel & Daily Allowances)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tada_claims (
  id BIGSERIAL PRIMARY KEY,
  ff_code TEXT NOT NULL,
  ff_name TEXT NOT NULL,
  ff_id TEXT,
  rep_id TEXT,
  employee_id TEXT,
  tran_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE DEFAULT CURRENT_DATE,
  distributor_name TEXT,
  route_name TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  from_location TEXT,
  to_location TEXT,
  mode TEXT DEFAULT 'Bus', -- 'Bus' | 'Rickshaw' | 'Motorcycle' | 'CNG' | 'Train' | 'Own DA'
  transport_mode TEXT,
  distance_km NUMERIC(6, 2) DEFAULT 0.0,
  distance NUMERIC(8, 2) DEFAULT 0.0,
  fare_amount_bdt NUMERIC(10, 2) DEFAULT 0.00,
  da_amount_bdt NUMERIC(10, 2) DEFAULT 0.00,
  hotel_amount_bdt NUMERIC(10, 2) DEFAULT 0.00,
  misc_amount_bdt NUMERIC(10, 2) DEFAULT 0.00,
  amount NUMERIC(10, 2) DEFAULT 0.00,
  total_amount_bdt NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'Pending_HOS_Approval', -- 'Pending_HOS_Approval' | 'Approved' | 'Rejected'
  approver_id TEXT,
  approver_name TEXT DEFAULT 'Mohammad Faruk (HOS)',
  approved_at TIMESTAMPTZ,
  remarks TEXT,
  last_modified TEXT,
  receipt_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script for tada_claims
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS ff_id TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS rep_id TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS from_location TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS to_location TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS transport_mode TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS distance NUMERIC(8, 2) DEFAULT 0.0;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS approver_id TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS last_modified TEXT;
ALTER TABLE public.tada_claims ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 10. WARRANTY & RMA TICKETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.warranty_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  ticket_seq TEXT,
  serial_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  customer_type TEXT DEFAULT 'End Customer',
  ownership_type TEXT DEFAULT 'Individual Owner',
  dealer_name TEXT,
  dealer_or_distributor_name TEXT,
  distributor_name TEXT,
  collection_point TEXT,
  address TEXT,
  district TEXT DEFAULT 'Dhaka',
  battery_brand TEXT DEFAULT 'Ensec Lithium BD',
  battery_model TEXT NOT NULL,
  battery_type TEXT DEFAULT 'LiFePO4',
  capacity_ah NUMERIC(6, 2),
  nominal_voltage NUMERIC(6, 2),
  purchase_date DATE,
  complaint_date DATE DEFAULT CURRENT_DATE,
  complaint_received_by TEXT,
  complaint_channel TEXT DEFAULT 'Hotline Call',
  defect_category TEXT NOT NULL, -- 'BMS Cutoff / No Voltage Output' | 'Cell Voltage Imbalance' | 'Capacity Drop / Low Mileage' | 'Charging Failure' | 'Connector / Cable Damage'
  problem_category TEXT,
  reported_fault TEXT,
  detailed_description TEXT,
  is_battery_working TEXT DEFAULT 'No / Dead',
  urgency TEXT DEFAULT 'Normal', -- 'Normal' | 'High' | 'Urgent'
  status TEXT DEFAULT 'Complaint Registered', -- 'Complaint Registered' | 'Battery Received' | 'Technical Inspection' | 'In Repair' | 'Quality Control Passed' | 'Delivered'
  prior_repairs_count INT DEFAULT 0,
  notes TEXT,
  assigned_technician TEXT,
  resolution_type TEXT, -- 'Repaired' | 'Cell Replaced' | 'BMS Replaced' | 'Full Unit Replacement'
  is_received_at_factory BOOLEAN DEFAULT FALSE,
  receiving_id TEXT,
  received_date DATE,
  receiving_receipt_number TEXT,
  inspection_id TEXT,
  inspected_by TEXT,
  inspection_date DATE,
  is_safety_hold BOOLEAN DEFAULT FALSE,
  safety_hold_reason TEXT,
  job_card_id TEXT,
  job_card_number TEXT,
  warranty_decision TEXT,
  estimated_cost_bdt NUMERIC(12, 2) DEFAULT 0.00,
  invoice_id TEXT,
  invoice_number TEXT,
  invoice_total_bdt NUMERIC(12, 2) DEFAULT 0.00,
  amount_paid_bdt NUMERIC(12, 2) DEFAULT 0.00,
  payment_status TEXT DEFAULT 'Pending',
  qc_status TEXT,
  dispatch_id TEXT,
  dispatch_date DATE,
  delivered_by TEXT,
  delivery_dispatch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script for warranty_tickets
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS ticket_seq TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'End Customer';
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS ownership_type TEXT DEFAULT 'Individual Owner';
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS dealer_or_distributor_name TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS distributor_name TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS collection_point TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS district TEXT DEFAULT 'Dhaka';
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS capacity_ah NUMERIC(6, 2);
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS nominal_voltage NUMERIC(6, 2);
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS complaint_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS complaint_received_by TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS complaint_channel TEXT DEFAULT 'Hotline Call';
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS problem_category TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS reported_fault TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS is_received_at_factory BOOLEAN DEFAULT FALSE;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS receiving_id TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS received_date DATE;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS receiving_receipt_number TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS inspection_id TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS inspected_by TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS inspection_date DATE;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS is_safety_hold BOOLEAN DEFAULT FALSE;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS safety_hold_reason TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS job_card_id TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS job_card_number TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS warranty_decision TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS estimated_cost_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS invoice_total_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS amount_paid_bdt NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending';
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS qc_status TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS dispatch_id TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS dispatch_date DATE;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS delivered_by TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS delivery_dispatch_id TEXT;
ALTER TABLE public.warranty_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 11. ATTENDANCE & PUNCH LOGS TABLE
-- ============================================================================

-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cash_book_entries (
  id BIGSERIAL PRIMARY KEY,
  voucher_no TEXT UNIQUE NOT NULL,
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_type TEXT NOT NULL, -- 'Head Office Cash' | 'Factory Cash' | 'City Bank PLC' | 'Eastern Bank PLC'
  transaction_category TEXT NOT NULL, -- 'Customer Payment' | 'Distributor Payment' | 'Field Force Expense' | 'Transport Expense' | 'Bank Transfer'
  description TEXT NOT NULL,
  reference TEXT,
  cash_in_bdt NUMERIC(12, 2) DEFAULT 0.00,
  cash_out_bdt NUMERIC(12, 2) DEFAULT 0.00,
  running_balance_bdt NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 13. INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON public.sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON public.sales_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_tada_claims_code ON public.tada_claims(ff_code);
CREATE INDEX IF NOT EXISTS idx_tada_claims_date ON public.tada_claims(tran_date);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_number ON public.warranty_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_serial ON public.warranty_tickets(serial_number);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON public.attendance_logs(punch_date);
CREATE INDEX IF NOT EXISTS idx_raw_material_categories_code ON public.raw_material_categories(code);
CREATE INDEX IF NOT EXISTS idx_raw_materials_code ON public.raw_materials(code);
CREATE INDEX IF NOT EXISTS idx_raw_materials_category ON public.raw_materials(category);

-- ============================================================================
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tada_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_book_entries ENABLE ROW LEVEL SECURITY;

-- Allow read & write access for authenticated users & anon API key
DO $$
BEGIN
  -- Users policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Customers policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Distributors policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'distributors' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.distributors FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Warehouses policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'warehouses' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.warehouses FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Products policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.products FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Raw Material Classifications policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'raw_material_classifications' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.raw_material_classifications FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Raw Material Categories policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'raw_material_categories' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.raw_material_categories FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Raw Materials policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'raw_materials' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.raw_materials FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Sales Orders policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sales_orders' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.sales_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- TADA Claims policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tada_claims' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.tada_claims FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Warranty Tickets policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'warranty_tickets' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.warranty_tickets FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Attendance policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance_logs' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.attendance_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Cash Book policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_book_entries' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.cash_book_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

--- ============================================================================
--- 14.1 SUPABASE REALTIME REPLICATION (Instant UI & Dashboard Updates)
--- ============================================================================
-- Enables live CDC streaming so Supabase Dashboard Table Editor and clients
-- see new and modified rows immediately without manual page refresh.
DO $$
BEGIN
  -- Set replica identity to FULL for comprehensive payload delivery
  ALTER TABLE public.raw_material_classifications REPLICA IDENTITY FULL;
  ALTER TABLE public.raw_material_categories REPLICA IDENTITY FULL;
  ALTER TABLE public.raw_materials REPLICA IDENTITY FULL;
  ALTER TABLE public.products REPLICA IDENTITY FULL;
  ALTER TABLE public.distributors REPLICA IDENTITY FULL;
  ALTER TABLE public.warehouses REPLICA IDENTITY FULL;

  -- Add tables to the supabase_realtime publication
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_material_classifications;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_material_categories;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_materials;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.distributors;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouses;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.product_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'CAT-TEL', 'CAT-SOL', 'CAT-EV'
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Active', -- 'Active' | 'Inactive'
  product_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 16. PRODUCT BRANDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_brands (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'BRD-ENSEC', 'BRD-OPTIMUM', 'BRD-VOLTMAX'
  name TEXT NOT NULL,
  origin TEXT DEFAULT 'Bangladesh (Kushtia Assembly Plant)',
  category TEXT DEFAULT '',
  tagline TEXT,
  status TEXT DEFAULT 'Active', -- 'Active' | 'Inactive'
  product_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure category column exists if product_brands table was created previously
ALTER TABLE public.product_brands ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';

-- ============================================================================
-- 17. CUSTOMER CATEGORIES TABLE (Pricing & Channel Tiers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customer_categories (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'CCAT-DIST-WHOLESALE', 'CCAT-DEALER-RETAIL'
  name TEXT NOT NULL,
  description TEXT,
  target_audience TEXT DEFAULT 'Both', -- 'Distributor' | 'Customer' | 'Both'
  discount_percentage NUMERIC(5, 2) DEFAULT 0.00,
  price_markup_percentage NUMERIC(5, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'Active', -- 'Active' | 'Inactive'
  customer_count INT DEFAULT 0,
  distributor_count INT DEFAULT 0,
  product_price_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 18. ORG HIERARCHY TABLE (Company -> BU -> Division -> Region -> Area -> Territory)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_hierarchy (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT UNIQUE NOT NULL, -- e.g. 'org-1', 'org-2'
  code TEXT UNIQUE NOT NULL, -- e.g. 'ENSEC-HQ', 'BU-LIBAT', 'DIV-SALES'
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Company' | 'Business Unit' | 'Division' | 'Region' | 'Area' | 'Territory'
  parent_id TEXT REFERENCES public.org_hierarchy(node_id) ON DELETE SET NULL,
  head_person TEXT,
  phone TEXT,
  tagged_distributor_ids TEXT[] DEFAULT '{}',
  tagged_customer_ids TEXT[] DEFAULT '{}',
  tagged_field_force_ids TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 19. DEPARTMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'DEP-1', 'DEP-2'
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  division TEXT,
  head_of_department TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  description TEXT,
  member_count INT DEFAULT 0,
  status TEXT DEFAULT 'Active', -- 'Active' | 'Inactive'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 20. BANKS LIST TABLE (Cash & Bank Accounts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.banks (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'Bank-13', 'Bank-12'
  name TEXT NOT NULL,
  native_name TEXT,
  account_no TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  routing_number TEXT,
  swift_code TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 21. UNITS OF MEASUREMENT TABLE (UOM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.units_of_measurement (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'UOM-001', 'UOM-002'
  name TEXT NOT NULL, -- 'Pieces', 'Complete Set', 'Battery Module'
  symbol TEXT NOT NULL, -- 'pcs', 'set', 'mod'
  native_name TEXT, -- 'পিস', 'সেট'
  applicable_to TEXT NOT NULL DEFAULT 'Both', -- 'Finish Product' | 'Raw Material' | 'Both'
  category TEXT DEFAULT 'Discrete Count', -- 'Discrete Count' | 'Electrical Assembly' | 'Packaging & Container'
  is_base_unit BOOLEAN DEFAULT FALSE,
  allow_decimals BOOLEAN DEFAULT FALSE,
  decimal_places INT DEFAULT 0,
  standard_packaging_rate NUMERIC(10, 2) DEFAULT 1.00,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 22. FIELD FORCE TABLE (Sales Officers, Supervisors, Delivery Personnel)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.field_force_reps (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'FF-DHK-01', 'MEL00445'
  name TEXT NOT NULL,
  native_name TEXT,
  pin TEXT,
  phone TEXT NOT NULL,
  designation TEXT NOT NULL,
  field_force_type TEXT DEFAULT 'Capture', -- 'Capture' | 'CaptureAndApprove' | 'Order Booker' | 'Delivery Man' | 'Supervisor'
  department TEXT,
  departments TEXT[] DEFAULT '{}',
  region TEXT,
  area TEXT,
  territory TEXT,
  market_hierarchy TEXT,
  distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  distributor_name TEXT,
  monthly_target_bdt NUMERIC(12, 2) DEFAULT 0.00,
  monthly_achieved_bdt NUMERIC(12, 2) DEFAULT 0.00,
  basic_salary_bdt NUMERIC(10, 2) DEFAULT 0.00,
  conveyance_bdt NUMERIC(10, 2) DEFAULT 0.00,
  ta_da_bdt NUMERIC(10, 2) DEFAULT 0.00,
  mobile_allowance_bdt NUMERIC(10, 2) DEFAULT 0.00,
  current_location JSONB DEFAULT '{}'::jsonb,
  joining_date DATE,
  discontinue_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 23. OFFERS & PROMOTIONS ENGINE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.offers_promotions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g. 'OFF-001', 'STX-BLN-01'
  title TEXT NOT NULL,
  discount_title TEXT,
  discount_native_title TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  discount_for TEXT DEFAULT 'All', -- 'Distributor' | 'Retailer' | 'Wholesaler' | 'Corporate' | 'Dealer' | 'All'
  department TEXT,
  discount_on TEXT DEFAULT 'LineItem', -- 'LineItem' | 'InvoiceSubtotal' | 'Category' | 'Brand'
  eligible_for TEXT DEFAULT 'Product', -- 'Product' | 'CustomerTier' | 'Region' | 'All'
  priority INT DEFAULT 1,
  when_condition TEXT DEFAULT 'Quantity', -- 'Quantity' | 'OrderValue' | 'PaymentMode'
  greater_than_or_equal_to NUMERIC(12, 2) DEFAULT 1,
  condition_value NUMERIC(12, 2) DEFAULT 1,
  provide_benefit TEXT DEFAULT 'PercentageDiscount', -- 'PercentageDiscount' | 'FixedAmount' | 'FreeSameProduct' | 'FreeChosenProduct'
  discount_amount NUMERIC(12, 2) DEFAULT 0.00,
  discount_percentage NUMERIC(5, 2) DEFAULT 0.00,
  flat_discount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  free_product_qty INT DEFAULT 0,
  free_product_id TEXT,
  free_product_name TEXT,
  allow_discount_for TEXT DEFAULT 'FullQuantity',
  apply_in_multiples BOOLEAN DEFAULT TRUE,
  discount_limitation TEXT DEFAULT 'Unlimited',
  limit_times INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 24. INDEXES FOR NEW MASTER DATA TABLES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_product_categories_code ON public.product_categories(code);
CREATE INDEX IF NOT EXISTS idx_product_brands_code ON public.product_brands(code);
CREATE INDEX IF NOT EXISTS idx_customer_categories_code ON public.customer_categories(code);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_code ON public.org_hierarchy(code);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent ON public.org_hierarchy(parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_code ON public.departments(code);
CREATE INDEX IF NOT EXISTS idx_banks_code ON public.banks(code);
CREATE INDEX IF NOT EXISTS idx_units_code ON public.units_of_measurement(code);
CREATE INDEX IF NOT EXISTS idx_field_force_code ON public.field_force_reps(code);
CREATE INDEX IF NOT EXISTS idx_field_force_phone ON public.field_force_reps(phone);
CREATE INDEX IF NOT EXISTS idx_offers_promotions_code ON public.offers_promotions(code);
CREATE INDEX IF NOT EXISTS idx_offers_promotions_dates ON public.offers_promotions(start_date, end_date);

-- ============================================================================
-- 25. ROW LEVEL SECURITY (RLS) FOR NEW TABLES
-- ============================================================================
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measurement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_force_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers_promotions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Product Categories policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_categories' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.product_categories FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Product Brands policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_brands' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.product_brands FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Customer Categories policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_categories' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.customer_categories FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Org Hierarchy policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'org_hierarchy' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.org_hierarchy FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Departments policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.departments FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Banks policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'banks' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.banks FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Units of Measurement policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'units_of_measurement' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.units_of_measurement FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Field Force Reps policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'field_force_reps' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.field_force_reps FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Offers Promotions policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'offers_promotions' AND policyname = 'Allow public access') THEN
    CREATE POLICY "Allow public access" ON public.offers_promotions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 26. INITIAL SEED DATA FOR NEW TABLES
-- ============================================================================

-- 1. Product Categories Seeds

CREATE TABLE IF NOT EXISTS public.stock_cid_receipts (
  id BIGSERIAL PRIMARY KEY,
  voucher_id TEXT UNIQUE, -- e.g. 'CID-MRR-2026-0045'
  mrr_number TEXT UNIQUE NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type TEXT NOT NULL DEFAULT 'Kushtia Manufacturing Plant', -- 'Kushtia Manufacturing Plant' | 'Optimum JV Joint Venture Plant' | 'Factory Assembly Line 1 (LiFePO4 ESS)' | 'Factory Assembly Line 2 (EV 60V / 72V)' | 'Subcontractor / Direct Production Lot' | 'Returned Finished Goods (Factory Re-certified)'
  source_location TEXT DEFAULT 'Kushtia Factory - Main Plant Bay 3',
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  target_warehouse_name TEXT NOT NULL DEFAULT 'Dhaka Central Warehouse (Tejgaon)',
  challan_number TEXT,
  gate_pass_number TEXT,
  truck_number TEXT,
  carrier_vehicle_no TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  received_by TEXT NOT NULL DEFAULT 'Warehouse In-charge',
  qc_inspector TEXT DEFAULT 'Engr. Sohidul Islam (Lead QC)',
  qc_status TEXT NOT NULL DEFAULT 'QC Passed & Stamped', -- 'QC Passed & Stamped' | 'Conditionally Accepted' | 'Pending QC Inspection' | 'QC Failed'
  status TEXT NOT NULL DEFAULT 'Received & Stocked', -- 'Pending Verification' | 'Verified & Posted' | 'Rejected' | 'Received & Stocked'
  total_items INT DEFAULT 0,
  total_quantity NUMERIC(12, 2) DEFAULT 0,
  total_amount_bdt NUMERIC(14, 2) DEFAULT 0,
  general_remarks TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 28. STOCK CID RECEIPT ITEMS (LINE ITEMS FOR STOCK RECEIVE PRODUCT SECTION)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_cid_receipt_items (
  id BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT REFERENCES public.stock_cid_receipts(id) ON DELETE CASCADE,
  mrr_number TEXT NOT NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  batch_number TEXT NOT NULL,
  serial_range TEXT,
  received_qty NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cost_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  rack_location TEXT DEFAULT 'Row A - Shelf 01',
  package_condition TEXT DEFAULT 'Factory Sealed',
  line_remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 29. WAREHOUSE PHYSICAL STOCK BALANCES (REAL-TIME INVENTORY TRACKING)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_inventory (
  id BIGSERIAL PRIMARY KEY,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE CASCADE,
  warehouse_code TEXT,
  warehouse_name TEXT,
  product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  batch_number TEXT NOT NULL DEFAULT 'GEN-BATCH',
  rack_location TEXT DEFAULT 'Bay-1 / Shelf-A',
  quantity_on_hand NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity_reserved NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity_available NUMERIC(12, 2) GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_valuation_bdt NUMERIC(14, 2) GENERATED ALWAYS AS (quantity_on_hand * unit_cost_bdt) STORED,
  last_mrr_number TEXT,
  last_received_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_wh_product_batch UNIQUE(warehouse_id, product_id, batch_number)
);

-- ============================================================================
-- 30. STOCK OPENING RECORDS (CREATE & UPLOAD OPENING STOCK)
-- Matches StockModule Tabs "Create Opening Stock" and "Upload Opening Stock"
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_opening_records (
  id BIGSERIAL PRIMARY KEY,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_name TEXT,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_code TEXT,
  product_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  batch_number TEXT NOT NULL DEFAULT 'OPN-2026',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cost_bdt NUMERIC(14, 2) DEFAULT 0,
  rack_location TEXT,
  source_method TEXT DEFAULT 'Manual', -- 'Manual' | 'CSV Upload' | 'Excel Upload'
  entry_date DATE DEFAULT CURRENT_DATE,
  entered_by TEXT DEFAULT 'System Admin',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 31. STOCK ISSUES & STOCK ISSUE ITEMS (ISSUED TAB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_issues (
  id BIGSERIAL PRIMARY KEY,
  issue_number TEXT UNIQUE NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT,
  issued_to TEXT NOT NULL, -- e.g. 'Mousumi Network Ltd' or 'Chittagong Depot'
  recipient_name TEXT,
  issue_type TEXT DEFAULT 'Delivery to Distributor', -- 'Delivery to Distributor' | 'Inter-Warehouse Dispatch' | 'Production Scrap / Rework' | 'Corporate Direct'
  gate_pass_number TEXT,
  driver_vehicle TEXT,
  reference_no TEXT,
  reason TEXT,
  total_quantity NUMERIC(12, 2) DEFAULT 0,
  total_value_bdt NUMERIC(14, 2) DEFAULT 0,
  status TEXT DEFAULT 'Dispatched', -- 'Pending Dispatch' | 'Dispatched' | 'Delivered' | 'Cancelled'
  issued_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_issue_items (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT REFERENCES public.stock_issues(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_cost_bdt NUMERIC(12, 2) DEFAULT 0,
  total_bdt NUMERIC(14, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 32. STOCK PRIMARY RETURNS (PRIMARY RETURN TAB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_primary_returns (
  id BIGSERIAL PRIMARY KEY,
  return_number TEXT UNIQUE NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  distributor_name TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price_bdt NUMERIC(12, 2) DEFAULT 0,
  total_value_bdt NUMERIC(14, 2) DEFAULT 0,
  reason TEXT NOT NULL, -- 'Slow Moving Stock Swap' | 'Customer Order Cancellation' | 'Transit Box Denting'
  qc_status TEXT DEFAULT 'Pending QC Inspection',
  status TEXT DEFAULT 'Returned & Restocked',
  received_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 33. STOCK DAMAGE RETURNS (DAMAGE RETURN TAB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_damage_returns (
  id BIGSERIAL PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT,
  distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  distributor_name TEXT,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  damage_type TEXT NOT NULL, -- 'Enclosure Crack' | 'BMS Voltage Deviation' | 'Water Immersion' | 'Cell Puffing'
  severity TEXT DEFAULT 'Major', -- 'Minor' | 'Major' | 'Critical / Unusable'
  reported_by TEXT,
  action_taken TEXT DEFAULT 'Factory Rework Return', -- 'Factory Rework Return' | 'Scrap / Salvage' | 'Credit Note Issued'
  salvage_value_bdt NUMERIC(12, 2) DEFAULT 0,
  status TEXT DEFAULT 'Investigating',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 34. STOCK TRANSFERS (STOCK TRANSFER TAB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  transfer_number TEXT UNIQUE NOT NULL,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  source_warehouse_name TEXT NOT NULL,
  destination_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  destination_warehouse_name TEXT NOT NULL,
  challan_number TEXT,
  vehicle_number TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  total_items INT DEFAULT 1,
  total_quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  total_value_bdt NUMERIC(14, 2) DEFAULT 0,
  status TEXT DEFAULT 'In Transit', -- 'Initiated' | 'In Transit' | 'Received at Destination' | 'Rejected / Returned'
  dispatched_by TEXT,
  received_by TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id BIGSERIAL PRIMARY KEY,
  transfer_id BIGINT REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_cost_bdt NUMERIC(12, 2) DEFAULT 0,
  total_bdt NUMERIC(14, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 35. STOCK ADJUSTMENTS (STOCK ADJUSTMENT TAB - AUDIT RECONCILIATION)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id BIGSERIAL PRIMARY KEY,
  reference_no TEXT UNIQUE NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT NOT NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE RESTRICT,
  product_code TEXT,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  adjustment_type TEXT NOT NULL, -- 'Physical Count Variance' | 'Damaged in Warehouse' | 'Sample / Marketing Demo' | 'Write-off'
  previous_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adjustment_qty NUMERIC(12, 2) NOT NULL DEFAULT 0, -- can be positive or negative
  new_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cost_variance_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  adjusted_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 36. REQUISITIONS & INDENTS (REQUISITIONS SECTION FROM SCREENSHOTS)
-- Matches RequisitionModule: Create Requisition, List, Approvals, Delivery Confirmation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.requisitions (
  id BIGSERIAL PRIMARY KEY,
  requisition_no TEXT UNIQUE NOT NULL,
  requisition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_by TEXT NOT NULL,
  requisition_for TEXT DEFAULT 'Dealer', -- 'Dealer' | 'Distributor' | 'Factory Store' | 'Internal Department'
  dealer_or_distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  dealer_name TEXT NOT NULL,
  branch_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  target_depot TEXT DEFAULT 'Dhaka Central Depot',
  field_force_code TEXT,
  field_force_name TEXT,
  department_code TEXT DEFAULT 'DEP-1',
  department_name TEXT DEFAULT 'MOUSUMI NETWORK LTD',
  status TEXT NOT NULL DEFAULT 'Pending Approval', -- 'Pending Approval' | 'Approved by Factory' | 'Issued by Accounts' | 'Received at Warehouse' | 'Rejected'
  total_qty NUMERIC(12, 2) DEFAULT 0,
  total_amount_bdt NUMERIC(14, 2) DEFAULT 0,
  challan_no TEXT,
  deposit_notes TEXT,
  factory_notes TEXT,
  factory_reviewed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.requisition_items (
  id BIGSERIAL PRIMARY KEY,
  requisition_id BIGINT REFERENCES public.requisitions(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  required_qty NUMERIC(12, 2) NOT NULL DEFAULT 1,
  approved_qty NUMERIC(12, 2) DEFAULT 0,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5, 2) DEFAULT 0,
  free_qty NUMERIC(12, 2) DEFAULT 0,
  total_cost_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 37. RETAILER FIELD ORDERS & DELIVERIES (MOBILE SALES PORTAL SCREENSHOTS)
-- Matches MobileSalesPortal Screenshots: Order Capture, Confirmation, Partial, Cancellation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.retailer_orders (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  retailer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  retailer_code TEXT,
  retailer_name TEXT NOT NULL,
  distributor_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  distributor_name TEXT NOT NULL,
  field_rep_id BIGINT REFERENCES public.field_force_reps(id) ON DELETE SET NULL,
  field_rep_code TEXT,
  field_rep_name TEXT NOT NULL,
  market_hierarchy TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Full Delivery' | 'Partial Delivery' | 'Cancelled'
  total_items INT DEFAULT 0,
  gross_amount_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount_bdt NUMERIC(14, 2) DEFAULT 0,
  net_payable_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  collected_cash_bdt NUMERIC(14, 2) DEFAULT 0,
  due_balance_bdt NUMERIC(14, 2) DEFAULT 0,
  payment_method TEXT DEFAULT 'Cash on Delivery', -- 'Cash on Delivery' | 'MFS (bKash/Nagad)' | 'Bank Transfer' | 'Credit 30 Days'
  gps_latitude NUMERIC(10, 7),
  gps_longitude NUMERIC(10, 7),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.retailer_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.retailer_orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  ordered_qty NUMERIC(12, 2) NOT NULL DEFAULT 1,
  delivered_qty NUMERIC(12, 2) DEFAULT 0,
  unit_price_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_bdt NUMERIC(12, 2) DEFAULT 0,
  total_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retailer Order Delivery Actions (Full Confirmation or Partial Delivery)
CREATE TABLE IF NOT EXISTS public.retailer_delivery_actions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.retailer_orders(id) ON DELETE CASCADE,
  order_no TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'Full Confirmation' | 'Partial Delivery'
  delivered_qty NUMERIC(12, 2) NOT NULL,
  undelivered_qty NUMERIC(12, 2) DEFAULT 0,
  cash_received_bdt NUMERIC(14, 2) DEFAULT 0,
  receipt_voucher_no TEXT,
  confirmed_by TEXT NOT NULL,
  remarks TEXT,
  confirmed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retailer Order Cancellation Reasons (Matching Screenshot 2 Screen 3)
CREATE TABLE IF NOT EXISTS public.retailer_cancellations (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.retailer_orders(id) ON DELETE CASCADE,
  order_no TEXT NOT NULL,
  cancellation_reason TEXT NOT NULL, -- 'Shop Closed / Owner Not Present' | 'Insufficient Cash / Funds' | 'Customer Changed Mind' | 'Duplicate Order Placed' | 'Wrong Product Ordered' | 'Pricing / Discount Dispute'
  cancelled_by TEXT NOT NULL,
  notes TEXT,
  cancelled_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 38. DISTRIBUTOR MARKET HIERARCHY BEATS (ORG HIERARCHY PAGE INTEGRATION)
-- Links directly to Org Hierarchy nodes and assigned Distributors
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.market_hierarchies (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'Beat', -- 'Beat' | 'Market Hierarchy' | 'DB Point' | 'Territory' | 'Area' | 'Region'
  parent_code TEXT,
  division TEXT DEFAULT 'Dhaka Division',
  region TEXT DEFAULT 'Dhaka Region',
  area TEXT,
  territory TEXT,
  db_point TEXT,
  head_person TEXT,
  phone TEXT,
  assigned_distributor_ids BIGINT[] DEFAULT '{}',
  assigned_distributor_codes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 39. PERFORMANCE INDEXES FOR STOCK & SCREENSHOT TABLES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_cid_mrr ON public.stock_cid_receipts(mrr_number);
CREATE INDEX IF NOT EXISTS idx_stock_cid_wh ON public.stock_cid_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_cid_date ON public.stock_cid_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_stock_cid_items_receipt ON public.stock_cid_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_stock_cid_items_prod ON public.stock_cid_receipt_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_inv_wh ON public.stock_inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_inv_prod ON public.stock_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_issues_no ON public.stock_issues(issue_number);
CREATE INDEX IF NOT EXISTS idx_stock_primary_ret_no ON public.stock_primary_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_no ON public.stock_transfers(transfer_number);
CREATE INDEX IF NOT EXISTS idx_stock_adj_ref ON public.stock_adjustments(reference_no);
CREATE INDEX IF NOT EXISTS idx_requisitions_no ON public.requisitions(requisition_no);
CREATE INDEX IF NOT EXISTS idx_requisition_items_req ON public.requisition_items(requisition_id);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_no ON public.retailer_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_ret ON public.retailer_orders(retailer_id);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_dist ON public.retailer_orders(distributor_id);
CREATE INDEX IF NOT EXISTS idx_market_hierarchies_code ON public.market_hierarchies(code);

-- ============================================================================
-- 40. ROW LEVEL SECURITY (RLS) FOR ALL NEW TABLES (SAFE DYNAMIC EXECUTION)
-- Only enables RLS on tables that exist in the public schema to avoid 42P01 errors
-- ============================================================================
DO $$ 
DECLARE
  tbl text;
  target_tables text[] := ARRAY[
    'stock_cid_receipts',
    'stock_cid_receipt_items',
    'stock_inventory',
    'stock_opening_records',
    'stock_issues',
    'stock_issue_items',
    'stock_primary_returns',
    'stock_damage_returns',
    'stock_transfers',
    'stock_transfer_items',
    'stock_adjustments',
    'requisitions',
    'requisition_items',
    'retailer_orders',
    'retailer_order_items',
    'retailer_delivery_actions',
    'retailer_cancellations',
    'market_hierarchies'
  ];
BEGIN
  FOR tbl IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = ANY(target_tables)
  LOOP
    -- Safely enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    
    -- Authenticated full access policy
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access on %I" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow authenticated full access on %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    
    -- Public anon full access policy for client frontend
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access on %I" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow anon full access on %I" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 41. INITIAL PRODUCTION SEEDS FOR STOCK & MASTER DATA
-- Note: CID Received Stock starts with 0 test/sample data for clean production use.
-- If you previously inserted test CID receipts, run:
-- TRUNCATE TABLE public.stock_cid_receipt_items, public.stock_cid_receipts CASCADE;
-- ============================================================================


-- 3. Seed Market Hierarchy Beats (Matching Org Hierarchy Integration)
INSERT INTO public.market_hierarchies (
  code,
  name,
  full_name,
  node_type,
  parent_code,
  division,
  region,
  area,
  territory,
  db_point,
  head_person,
  phone,
  is_active
)
VALUES
  ('BEAT-MIRPUR-01', 'Mirpur-10 Main Market Beat', 'Dhaka Division > Dhaka Region > Dhaka North > Mirpur > Mirpur-10 Main Market Beat', 'Beat', 'TERR-MIRPUR', 'Dhaka Division', 'Dhaka Region', 'Dhaka North Area', 'Mirpur Territory', 'DB Point Mirpur', 'Zubair Ahmed', '+880 1714-554433', TRUE),
  ('BEAT-PALLABI-02', 'Pallabi & Purobi Auto Electric Hub', 'Dhaka Division > Dhaka Region > Dhaka North > Mirpur > Pallabi Auto Electric Hub', 'Beat', 'TERR-MIRPUR', 'Dhaka Division', 'Dhaka Region', 'Dhaka North Area', 'Mirpur Territory', 'DB Point Pallabi', 'Fazleh Rabbi', '+880 1719-887766', TRUE),
  ('BEAT-AGRABAD-01', 'Agrabad Commercial Beat', 'Chittagong Division > Chittagong Region > Chittagong South > Agrabad Commercial Beat', 'Beat', 'REG-CTG', 'Chittagong Division', 'Chittagong Region', 'Chittagong South', 'Agrabad Territory', 'DB Point Agrabad', 'Tanvir Ahmed Chowdhury', '+880 1819-223344', TRUE),
  ('BEAT-KST-01', 'Kushtia Sadar & Poradah Market Beat', 'Khulna Division > Khulna Region > Kushtia > Kushtia Sadar & Poradah Market Beat', 'Beat', 'REG-KHU', 'Khulna Division', 'Khulna Region', 'Kushtia Area', 'Kushtia Sadar', 'DB Point Kushtia Plant', 'Mijanur Rahman', '+880 1712-998877', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Requisitions and items ready for production usage (no sample data)

-- ============================================================================
-- 19. CRM AGREEMENTS & INSTITUTIONAL LEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.crm_agreements (
  id BIGSERIAL PRIMARY KEY,
  deal_code TEXT UNIQUE NOT NULL, -- Unique deal code e.g. 'CRM-01', 'CRM-2026-0001'
  client_name TEXT NOT NULL,      -- Project / Lead Title (e.g. Grameenphone Tower Energy Rollout)
  company_name TEXT NOT NULL,     -- Institutional Customer (e.g. Grameenphone Limited)
  contact_person TEXT,            -- Primary Contact Name
  phone TEXT NOT NULL,            -- Direct Contact Phone
  email TEXT,                     -- Contact Email
  address TEXT,                   -- Customer / Site Address
  channel TEXT DEFAULT 'Direct Corporate', -- 'Direct Corporate' | 'Tender / Institutional' | 'Govt & Semi-Govt' | 'Distributor Network'
  stage TEXT NOT NULL DEFAULT 'Lead', -- 'Lead' | 'Contacted' | 'Proposal Sent' | 'Agreement Signed' | 'Lost'
  expected_volume_units INT DEFAULT NULL,
  estimated_value_bdt NUMERIC(15, 2) DEFAULT NULL,
  deal_value_bdt NUMERIC(15, 2) DEFAULT NULL,
  contract_term_months INT DEFAULT NULL,
  salesperson_id TEXT,
  salesperson_name TEXT NOT NULL DEFAULT 'Tanvir Hossain',
  last_contact_date DATE DEFAULT CURRENT_DATE,
  expected_closing_date DATE,
  communication_notes JSONB DEFAULT '[]'::jsonb, -- Array of { date, author, note }
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'Active',                  -- 'Active' | 'Archived' | 'Suspended'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table was partially created
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS deal_code TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'Direct Corporate';
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Lead';
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS expected_volume_units INT DEFAULT NULL;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS estimated_value_bdt NUMERIC(15, 2) DEFAULT NULL;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS deal_value_bdt NUMERIC(15, 2) DEFAULT NULL;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS contract_term_months INT DEFAULT NULL;
ALTER TABLE public.crm_agreements ALTER COLUMN expected_volume_units DROP DEFAULT;
ALTER TABLE public.crm_agreements ALTER COLUMN estimated_value_bdt DROP DEFAULT;
ALTER TABLE public.crm_agreements ALTER COLUMN deal_value_bdt DROP DEFAULT;
ALTER TABLE public.crm_agreements ALTER COLUMN contract_term_months DROP DEFAULT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS salesperson_id TEXT;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS salesperson_name TEXT DEFAULT 'Tanvir Hossain';
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS last_contact_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS expected_closing_date DATE;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS communication_notes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE public.crm_agreements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_crm_agreements_deal_code ON public.crm_agreements(deal_code);
CREATE INDEX IF NOT EXISTS idx_crm_agreements_company_name ON public.crm_agreements(company_name);
CREATE INDEX IF NOT EXISTS idx_crm_agreements_stage ON public.crm_agreements(stage);
CREATE INDEX IF NOT EXISTS idx_crm_agreements_salesperson ON public.crm_agreements(salesperson_name);
CREATE INDEX IF NOT EXISTS idx_crm_agreements_last_contact_date ON public.crm_agreements(last_contact_date);
CREATE INDEX IF NOT EXISTS idx_crm_agreements_created_at ON public.crm_agreements(created_at);

-- Row Level Security (RLS) Policies
ALTER TABLE public.crm_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to crm_agreements" ON public.crm_agreements;
CREATE POLICY "Allow public read access to crm_agreements"
  ON public.crm_agreements FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public insert to crm_agreements" ON public.crm_agreements;
CREATE POLICY "Allow public insert to crm_agreements"
  ON public.crm_agreements FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update to crm_agreements" ON public.crm_agreements;
CREATE POLICY "Allow public update to crm_agreements"
  ON public.crm_agreements FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete to crm_agreements" ON public.crm_agreements;
CREATE POLICY "Allow public delete to crm_agreements"
  ON public.crm_agreements FOR DELETE
  USING (true);

-- Seed Initial Sample CRM Lead Agreements
INSERT INTO public.crm_agreements (
  deal_code, client_name, company_name, contact_person, phone, channel, stage,
  expected_volume_units, estimated_value_bdt, contract_term_months, salesperson_name,
  last_contact_date, communication_notes
)
VALUES
  (
    'CRM-01',
    'Grameenphone Ltd. (Tower Energy Procurement)',
    'Grameenphone Limited',
    'Brigadier General (Retd) Tariqul Islam',
    '+880 1700-112233',
    'Direct Corporate',
    'Agreement Signed',
    500,
    57500000.00,
    24,
    'Tanvir Hossain',
    '2026-10-15',
    '[{"date":"2026-09-10","author":"Tanvir Hossain","note":"Technical evaluation of ET-48100 48V 100Ah battery bank passed GP laboratory bench test."},{"date":"2026-09-25","author":"Super Admin","note":"Commercial terms finalized: 60-month warranty and 45-day payment credit cycle."},{"date":"2026-10-15","author":"Tanvir Hossain","note":"Master Service Agreement signed. Initial rollout batch of 50 units scheduled for Dhaka hub."}]'::jsonb
  ),
  (
    'CRM-02',
    'Summit Towers Bangladesh (National BTS Backup)',
    'Summit Communications Ltd.',
    'Engr. Zahidul Hassan (Head of Procurement)',
    '+880 1819-445566',
    'Direct Corporate',
    'Proposal Sent',
    200,
    23000000.00,
    12,
    'Tanvir Hossain',
    '2026-10-22',
    '[{"date":"2026-10-12","author":"Tanvir Hossain","note":"Presentation delivered at Summit Tower Tejgaon HQ. High interest in 51.2V 100Ah rack-mounted solutions."},{"date":"2026-10-22","author":"Tanvir Hossain","note":"Formal quotation submitted: BDT 115,000 per unit for 200 units with 48-month warranty."}]'::jsonb
  ),
  (
    'CRM-03',
    'Banglalink Regional BTS Expansion',
    'Banglalink Digital Communications',
    'Mustafa Kamal (Infrastructure Lead)',
    '+880 1911-223344',
    'Direct Corporate',
    'Proposal Sent',
    350,
    42000000.00,
    24,
    'Tanvir Hossain',
    '2026-10-25',
    '[{"date":"2026-10-25","author":"Tanvir Hossain","note":"Commercial proposal for 350 telecom lithium packs submitted."}]'::jsonb
  ),
  (
    'CRM-04',
    'Robi Axiata Microgrid Storage',
    'Robi Axiata Limited',
    'Ashraf Ali (Renewable Power Manager)',
    '+880 1819-998877',
    'Direct Corporate',
    'Contacted',
    200,
    24000000.00,
    12,
    'Zubair Ahmed',
    '2026-10-20',
    '[{"date":"2026-10-20","author":"Zubair Ahmed","note":"Initial technical meeting completed for solar microgrid backup in Chittagong Hill Tracts."}]'::jsonb
  ),
  (
    'CRM-05',
    'Walton Hi-Tech AGV & Electric Fleet Energy',
    'Walton Hi-Tech Industries PLC',
    'Md. Faruk Hossain (Director Logistics)',
    '+880 1677-889900',
    'Direct Corporate',
    'Contacted',
    150,
    17250000.00,
    12,
    'Tanvir Hossain',
    '2026-10-18',
    '[{"date":"2026-10-18","author":"Tanvir Hossain","note":"Factory visit conducted at Chandra complex. Walton team tested sample 48V EV pack with positive feedback."}]'::jsonb
  )
ON CONFLICT (deal_code) DO NOTHING;



-- ============================================================================
-- 15. INSTALLMENT & RECEIVABLES MANAGEMENT WITH AUTOMATED SMS & COLLECTION
-- ============================================================================

-- 1. Installment Plans Table
CREATE TABLE IF NOT EXISTS public.installment_plans (
  id TEXT PRIMARY KEY,
  agreement_no TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_district TEXT DEFAULT 'Dhaka',
  distributor_id TEXT,
  distributor_name TEXT,
  sales_order_id TEXT,
  invoice_reference TEXT,
  product_id TEXT,
  product_name TEXT NOT NULL,
  product_model TEXT,
  quantity INTEGER DEFAULT 1,
  total_product_price_bdt NUMERIC(15, 2) NOT NULL,
  down_payment_bdt NUMERIC(15, 2) DEFAULT 0,
  financed_amount_bdt NUMERIC(15, 2) NOT NULL,
  duration_months INTEGER NOT NULL,
  interest_rate_percent NUMERIC(5, 2) DEFAULT 0,
  total_interest_bdt NUMERIC(15, 2) DEFAULT 0,
  total_payable_bdt NUMERIC(15, 2) NOT NULL,
  monthly_installment_bdt NUMERIC(15, 2) NOT NULL,
  start_date DATE NOT NULL,
  first_due_date DATE NOT NULL,
  payment_frequency TEXT DEFAULT 'Monthly',
  status TEXT DEFAULT 'Active', -- 'Active', 'Settled', 'Overdue', 'Defaulted', 'Cancelled'
  total_paid_bdt NUMERIC(15, 2) DEFAULT 0,
  total_outstanding_bdt NUMERIC(15, 2) NOT NULL,
  paid_installments_count INTEGER DEFAULT 0,
  remaining_installments_count INTEGER NOT NULL,
  overdue_installments_count INTEGER DEFAULT 0,
  overdue_amount_bdt NUMERIC(15, 2) DEFAULT 0,
  guarantor_name TEXT,
  guarantor_phone TEXT,
  guarantor_nid TEXT,
  guarantor_address TEXT,
  remarks TEXT,
  assigned_officer_id TEXT,
  assigned_officer_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Installment Schedules Table
CREATE TABLE IF NOT EXISTS public.installment_schedules (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  agreement_no TEXT NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  due_amount_bdt NUMERIC(15, 2) NOT NULL,
  principal_amount_bdt NUMERIC(15, 2) NOT NULL,
  interest_amount_bdt NUMERIC(15, 2) DEFAULT 0,
  paid_amount_bdt NUMERIC(15, 2) DEFAULT 0,
  remaining_amount_bdt NUMERIC(15, 2) NOT NULL,
  status TEXT DEFAULT 'Upcoming', -- 'Paid', 'Partial', 'Upcoming', 'Due Today', 'Overdue'
  payment_date DATE,
  overdue_days INTEGER DEFAULT 0,
  late_fee_bdt NUMERIC(15, 2) DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  last_reminder_rule_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Installment Payments Table
CREATE TABLE IF NOT EXISTS public.installment_payments (
  id TEXT PRIMARY KEY,
  payment_receipt_no TEXT UNIQUE NOT NULL,
  plan_id TEXT NOT NULL REFERENCES public.installment_plans(id),
  agreement_no TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  amount_bdt NUMERIC(15, 2) NOT NULL,
  payment_type TEXT DEFAULT 'Full Installment', -- 'Full Installment', 'Partial', 'Advance', 'Multiple Installments', 'Early Settlement'
  payment_method TEXT DEFAULT 'Bank Transfer', -- 'Cash', 'Bank Transfer', 'Cheque', 'bKash', 'Nagad'
  bank_account_id TEXT,
  bank_account_name TEXT,
  transaction_reference TEXT NOT NULL,
  payment_date DATE NOT NULL,
  received_by_id TEXT,
  received_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Installment Payment Allocations Table
CREATE TABLE IF NOT EXISTS public.installment_payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES public.installment_payments(id) ON DELETE CASCADE,
  schedule_id TEXT NOT NULL REFERENCES public.installment_schedules(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  allocated_amount_bdt NUMERIC(15, 2) NOT NULL,
  principal_portion_bdt NUMERIC(15, 2) NOT NULL,
  interest_portion_bdt NUMERIC(15, 2) DEFAULT 0,
  is_fully_cleared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Installment Notifications Table
CREATE TABLE IF NOT EXISTS public.installment_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL, -- 'upcoming_due', 'overdue', 'followup_due', 'commitment_missed', 'payment_received', 'escalation'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  reference_id TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Installment Settings Table
CREATE TABLE IF NOT EXISTS public.installment_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  default_duration_months INTEGER DEFAULT 12,
  grace_period_days INTEGER DEFAULT 3,
  late_fee_type TEXT DEFAULT 'Flat',
  late_fee_amount NUMERIC(10, 2) DEFAULT 0,
  early_settlement_rebate_pct NUMERIC(5, 2) DEFAULT 5.0,
  auto_sms_enabled BOOLEAN DEFAULT TRUE,
  allow_partial_payments BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Installment Audit Logs Table
CREATE TABLE IF NOT EXISTS public.installment_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  plan_id TEXT,
  agreement_no TEXT,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Collection Assignments Table
CREATE TABLE IF NOT EXISTS public.collection_assignments (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  agreement_no TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  assigned_to_id TEXT NOT NULL,
  assigned_to_name TEXT NOT NULL,
  assigned_to_role TEXT NOT NULL,
  assigned_by_id TEXT,
  assigned_by_name TEXT,
  assignment_date DATE NOT NULL,
  target_date DATE NOT NULL,
  target_amount_bdt NUMERIC(15, 2) NOT NULL,
  escalation_level TEXT DEFAULT 'Level 1 (Officer)',
  status TEXT DEFAULT 'Active', -- 'Active', 'Completed', 'Reassigned'
  priority TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High', 'Critical'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Collection Follow-ups Table
CREATE TABLE IF NOT EXISTS public.collection_followups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  agreement_no TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  activity_type TEXT NOT NULL, -- 'Phone Call', 'SMS Sent', 'WhatsApp Contact', 'Customer Visit', 'Payment Commitment', 'Payment Received', 'Customer Unreachable', 'Dispute/Complaint'
  follow_up_date DATE NOT NULL,
  next_follow_up_date DATE,
  committed_amount_bdt NUMERIC(15, 2),
  committed_payment_date DATE,
  notes TEXT NOT NULL,
  performed_by_id TEXT NOT NULL,
  performed_by_name TEXT NOT NULL,
  status TEXT DEFAULT 'Pending', -- 'Pending', 'Completed', 'Broken Commitment', 'Rescheduled'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Collection Escalations Rules Table
CREATE TABLE IF NOT EXISTS public.collection_escalations (
  id TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  name TEXT NOT NULL,
  min_overdue_days INTEGER NOT NULL,
  max_overdue_days INTEGER NOT NULL,
  escalate_to_role TEXT NOT NULL,
  action_required TEXT NOT NULL,
  auto_notification BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. SMS Templates Table
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id TEXT PRIMARY KEY,
  template_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  available_variables JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Active',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. SMS Automation Rules Table
CREATE TABLE IF NOT EXISTS public.sms_automation_rules (
  id TEXT PRIMARY KEY,
  rule_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_days INTEGER NOT NULL,
  template_id TEXT REFERENCES public.sms_templates(id),
  enabled BOOLEAN DEFAULT TRUE,
  channel TEXT DEFAULT 'SMS',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. SMS Sending Logs Table
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id TEXT PRIMARY KEY,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  message TEXT NOT NULL,
  template_code TEXT,
  rule_id TEXT,
  plan_id TEXT,
  agreement_no TEXT,
  status TEXT DEFAULT 'Sent', -- 'Delivered', 'Sent', 'Failed', 'Pending'
  gateway_response TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  retry_count INTEGER DEFAULT 0
);

-- 14. SMS Gateway Settings Table
CREATE TABLE IF NOT EXISTS public.sms_gateway_settings (
  id TEXT PRIMARY KEY DEFAULT 'primary_gateway',
  provider TEXT DEFAULT 'greenweb',
  api_url TEXT DEFAULT 'https://api.greenweb.com.bd/api.php',
  api_key TEXT DEFAULT '',
  sender_id TEXT DEFAULT 'ENSEC_BD',
  client_id TEXT DEFAULT 'ENSEC-CORP',
  is_configured BOOLEAN DEFAULT FALSE,
  last_tested_at TIMESTAMPTZ,
  test_status TEXT DEFAULT 'Untested',
  daily_limit INTEGER DEFAULT 1000,
  sent_today INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_installment_plans_status ON public.installment_plans(status);
CREATE INDEX IF NOT EXISTS idx_installment_plans_customer ON public.installment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_installment_schedules_plan ON public.installment_schedules(plan_id);
CREATE INDEX IF NOT EXISTS idx_installment_schedules_due_date ON public.installment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_installment_schedules_status ON public.installment_schedules(status);
CREATE INDEX IF NOT EXISTS idx_installment_payments_plan ON public.installment_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_collection_assignments_assigned ON public.collection_assignments(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_collection_followups_plan ON public.collection_followups(plan_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone ON public.sms_logs(recipient_phone);

-- RLS Enablement & Open Access Policies for ERP Operation
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_gateway_settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Create permissive policies for all installment tables
  EXECUTE 'CREATE POLICY "Allow public all installment_plans" ON public.installment_plans FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all installment_schedules" ON public.installment_schedules FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all installment_payments" ON public.installment_payments FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all installment_payment_allocations" ON public.installment_payment_allocations FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all installment_notifications" ON public.installment_notifications FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all installment_settings" ON public.installment_settings FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all installment_audit_logs" ON public.installment_audit_logs FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all collection_assignments" ON public.collection_assignments FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all collection_followups" ON public.collection_followups FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all collection_escalations" ON public.collection_escalations FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all sms_templates" ON public.sms_templates FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all sms_automation_rules" ON public.sms_automation_rules FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all sms_logs" ON public.sms_logs FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "Allow public all sms_gateway_settings" ON public.sms_gateway_settings FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================================================
-- 30. RAW MATERIAL RECEIPT & BATCH INVENTORY SCHEMA (ENSEC ERP v29 UPGRADE)
-- ============================================================================

-- Raw Material Receipts (Goods Received Note - GRN)
CREATE TABLE IF NOT EXISTS public.raw_material_receipts (
  id BIGSERIAL PRIMARY KEY,
  grn_number TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'Local', -- 'Local' | 'Import'
  po_reference TEXT,
  supplier_id BIGINT REFERENCES public.distributors(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT NOT NULL,
  receive_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_reference TEXT,
  remarks TEXT,
  total_ordered_qty NUMERIC(14, 4) DEFAULT 0,
  total_received_qty NUMERIC(14, 4) DEFAULT 0,
  total_gross_value NUMERIC(16, 2) DEFAULT 0.00,
  total_discount NUMERIC(16, 2) DEFAULT 0.00,
  total_additional_costs NUMERIC(16, 2) DEFAULT 0.00,
  total_purchase_value NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'Verified & Posted',
  received_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw Material Receipt Line Items
CREATE TABLE IF NOT EXISTS public.raw_material_receipt_items (
  id BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT NOT NULL REFERENCES public.raw_material_receipts(id) ON DELETE CASCADE,
  material_id BIGINT REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pieces',
  ordered_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  received_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_purchase_rate NUMERIC(16, 4) NOT NULL DEFAULT 0.00,
  discount NUMERIC(16, 2) DEFAULT 0.00,
  additional_costs NUMERIC(16, 2) DEFAULT 0.00,
  total_purchase_value NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  batch_number TEXT NOT NULL,
  batch_barcode TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Batches (Unique Purchase Batch with Immutable Unit Rate & Barcode)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_number TEXT UNIQUE NOT NULL,
  batch_barcode TEXT UNIQUE NOT NULL,
  material_id BIGINT REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pieces',
  supplier_id BIGINT,
  supplier_name TEXT NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unit_purchase_rate NUMERIC(16, 4) NOT NULL DEFAULT 0.00, -- Immutable original rate
  received_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  issued_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  available_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Depleted', 'Quarantined'
  grn_ref TEXT,
  po_ref TEXT,
  invoice_ref TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_batch_non_negative_stock CHECK (available_qty >= 0)
);

-- Inventory Movement History (Audit Trail for Receipts, Issues, Adjustments, Consumptions)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  material_id BIGINT REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  batch_barcode TEXT,
  movement_type TEXT NOT NULL, -- 'RECEIPT', 'ISSUE', 'PRODUCTION_CONSUMPTION', 'ADJUSTMENT', 'RETURN'
  quantity NUMERIC(14, 4) NOT NULL,
  unit_cost_bdt NUMERIC(16, 4) NOT NULL DEFAULT 0.00,
  total_value_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  reference_no TEXT NOT NULL, -- GRN Number or Production Order Number
  source_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  source_warehouse_name TEXT,
  target_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  target_warehouse_name TEXT,
  performed_by TEXT NOT NULL,
  balance_after NUMERIC(14, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bill of Materials Master (BOM)
CREATE TABLE IF NOT EXISTS public.bill_of_materials (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Draft', 'Archived'
  expected_batch_wastage_percent NUMERIC(6, 2) DEFAULT 0.50,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe Alter Table migration script (adds missing rich JSON & versioning columns to bill_of_materials)
ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS product_model TEXT;
ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS revision_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.bill_of_materials ADD COLUMN IF NOT EXISTS change_notes TEXT;

-- BOM Line Items
CREATE TABLE IF NOT EXISTS public.bom_items (
  id BIGSERIAL PRIMARY KEY,
  bom_id BIGINT NOT NULL REFERENCES public.bill_of_materials(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pieces',
  required_qty NUMERIC(14, 4) NOT NULL DEFAULT 1,
  expected_wastage_percent NUMERIC(6, 2) DEFAULT 0.00,
  unit_cost_bdt NUMERIC(16, 4) DEFAULT 0.00,
  total_item_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Material Issues to Factory Production Orders
CREATE TABLE IF NOT EXISTS public.material_issues (
  id BIGSERIAL PRIMARY KEY,
  issue_number TEXT UNIQUE NOT NULL,
  production_order_id TEXT NOT NULL,
  production_order_number TEXT NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Manufacturing & Assembly',
  status TEXT NOT NULL DEFAULT 'Issued',
  total_issued_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_material_cost_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Material Issue Line Items (Linking exact Batch consumed)
CREATE TABLE IF NOT EXISTS public.material_issue_items (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES public.material_issues(id) ON DELETE CASCADE,
  material_id BIGINT REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  batch_barcode TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pieces',
  requested_qty NUMERIC(14, 4) NOT NULL,
  issued_qty NUMERIC(14, 4) NOT NULL,
  unit_cost_bdt NUMERIC(16, 4) NOT NULL,
  total_material_cost_bdt NUMERIC(16, 2) NOT NULL,
  is_fifo_override BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Consumption Records (Material cost trace by batch)
CREATE TABLE IF NOT EXISTS public.production_consumption (
  id BIGSERIAL PRIMARY KEY,
  production_order_id TEXT NOT NULL,
  production_order_number TEXT NOT NULL,
  material_id BIGINT REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  material_code TEXT NOT NULL,
  material_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  batch_barcode TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL,
  unit_cost_bdt NUMERIC(16, 4) NOT NULL,
  total_cost_bdt NUMERIC(16, 2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  issued_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Costs (Automatic Production Costing Engine)
CREATE TABLE IF NOT EXISTS public.production_costs (
  id BIGSERIAL PRIMARY KEY,
  production_order_id TEXT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  model TEXT,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_qty NUMERIC(14, 4) NOT NULL,
  actual_good_qty NUMERIC(14, 4) NOT NULL,
  rejected_qty NUMERIC(14, 4) DEFAULT 0,
  raw_material_cost_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  direct_labour_cost_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  factory_overhead_cost_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  other_production_costs_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  wastage_cost_bdt NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  total_production_cost_bdt NUMERIC(16, 2) NOT NULL,
  unit_production_cost_bdt NUMERIC(16, 4) NOT NULL,
  costing_method TEXT NOT NULL DEFAULT 'FIFO', -- 'FIFO' or 'WEIGHTED_AVERAGE'
  production_batch_number TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'Calculated', -- 'Calculated', 'Finalized', 'TransferredToFG'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Finished Goods Receipts from Factory Production
CREATE TABLE IF NOT EXISTS public.finished_goods_receipts (
  id BIGSERIAL PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  production_order_id TEXT NOT NULL,
  production_order_number TEXT NOT NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE RESTRICT,
  product_code TEXT,
  product_name TEXT NOT NULL,
  model TEXT,
  produced_qty NUMERIC(14, 4) NOT NULL,
  accepted_qty NUMERIC(14, 4) NOT NULL,
  rejected_qty NUMERIC(14, 4) DEFAULT 0,
  total_production_cost_bdt NUMERIC(16, 2) NOT NULL,
  unit_production_cost_bdt NUMERIC(16, 4) NOT NULL,
  production_batch_number TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  warehouse_name TEXT NOT NULL,
  receive_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by TEXT NOT NULL,
  valuation_total_bdt NUMERIC(16, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received & Stocked',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lightning fast queries and barcode scans
CREATE INDEX IF NOT EXISTS idx_batches_barcode ON public.inventory_batches(batch_barcode);
CREATE INDEX IF NOT EXISTS idx_batches_material ON public.inventory_batches(material_id, available_qty);
CREATE INDEX IF NOT EXISTS idx_batches_fifo ON public.inventory_batches(material_id, purchase_date, id);
CREATE INDEX IF NOT EXISTS idx_movements_material ON public.inventory_movements(material_id, date);
CREATE INDEX IF NOT EXISTS idx_movements_batch ON public.inventory_movements(batch_number);
CREATE INDEX IF NOT EXISTS idx_rm_receipts_grn ON public.raw_material_receipts(grn_number);
CREATE INDEX IF NOT EXISTS idx_material_issues_po ON public.material_issues(production_order_id);
CREATE INDEX IF NOT EXISTS idx_bom_product ON public.bill_of_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_production_costs_po ON public.production_costs(production_order_id);
CREATE INDEX IF NOT EXISTS idx_fg_receipts_po ON public.finished_goods_receipts(production_order_id);

-- ============================================================================
-- 46. PROCUREMENT & SUPPLY CHAIN MANAGEMENT (SCM)
-- ============================================================================

-- Suppliers & Vendors Directory
CREATE TABLE IF NOT EXISTS public.suppliers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT DEFAULT 'Bangladesh',
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  category TEXT,
  payment_terms TEXT DEFAULT '30 Days LC',
  lead_time_days INT DEFAULT 45,
  status TEXT DEFAULT 'Active',
  balance_bdt NUMERIC(14, 2) DEFAULT 0.00,
  materials_supplied_json JSONB DEFAULT '[]'::jsonb,
  rating NUMERIC(3, 1) DEFAULT 4.5,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- International Import Purchase Orders & Joint Venture Costing
CREATE TABLE IF NOT EXISTS public.import_orders (
  id BIGSERIAL PRIMARY KEY,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id BIGINT REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  lc_number TEXT,
  commercial_invoice_no TEXT,
  bl_number TEXT,
  order_date DATE DEFAULT CURRENT_DATE,
  date DATE DEFAULT CURRENT_DATE,
  container_number TEXT,
  shipping_line TEXT,
  eta_chittagong_port DATE,
  status TEXT DEFAULT 'LC Opened',
  fob_usd NUMERIC(14, 2) DEFAULT 0.00,
  exchange_rate_bdt NUMERIC(10, 4) DEFAULT 120.0000,
  custom_duty_tax_bdt NUMERIC(14, 2) DEFAULT 0.00,
  clearing_freight_bdt NUMERIC(14, 2) DEFAULT 0.00,
  total_landed_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  ensec_share_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  ensec_share_percent NUMERIC(5, 2) DEFAULT 50.00,
  ensec_contribution_bdt NUMERIC(16, 2) DEFAULT 0.00,
  optimum_share_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  optimum_share_percent NUMERIC(5, 2) DEFAULT 50.00,
  optimum_contribution_bdt NUMERIC(16, 2) DEFAULT 0.00,
  items_json JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import Order Line Items
CREATE TABLE IF NOT EXISTS public.import_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES public.import_orders(id) ON DELETE CASCADE,
  order_po_number TEXT,
  material_id BIGINT REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  material_code TEXT,
  material_name TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL,
  unit TEXT DEFAULT 'KG',
  unit_price_usd NUMERIC(12, 4) DEFAULT 0.0000,
  total_usd NUMERIC(14, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 47. MANUFACTURING PRODUCTION ORDERS & JOINT VENTURE STATEMENTS
-- ============================================================================

-- Production Batch Work Orders
CREATE TABLE IF NOT EXISTS public.production_orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  model TEXT,
  batch_number TEXT NOT NULL,
  planned_qty NUMERIC(12, 2) NOT NULL,
  completed_qty NUMERIC(12, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'Planned',
  start_date DATE DEFAULT CURRENT_DATE,
  target_date DATE,
  manufacturing_date DATE,
  date DATE DEFAULT CURRENT_DATE,
  shift_manager TEXT,
  notes TEXT,
  raw_material_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  conversion_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  total_production_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  cost_per_unit_bdt NUMERIC(14, 4) DEFAULT 0.0000,
  wastage_percent NUMERIC(5, 2) DEFAULT 0.00,
  scrap_kg NUMERIC(10, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optimum Joint Venture Running Financial Statement
CREATE TABLE IF NOT EXISTS public.optimum_statement (
  id BIGSERIAL PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL,
  type TEXT,
  reference TEXT,
  debit_ensec_bdt NUMERIC(14, 2) DEFAULT 0.00,
  credit_optimum_bdt NUMERIC(14, 2) DEFAULT 0.00,
  running_balance_bdt NUMERIC(14, 2) DEFAULT 0.00,
  debit_bdt NUMERIC(14, 2) DEFAULT 0.00,
  credit_bdt NUMERIC(14, 2) DEFAULT 0.00,
  balance_bdt NUMERIC(14, 2) DEFAULT 0.00,
  notes TEXT,
  description TEXT,
  status TEXT DEFAULT 'Verified',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 48. MULTI-WAREHOUSE STOCK LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id BIGSERIAL PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_name TEXT,
  reference_doc TEXT,
  reference_no TEXT,
  transaction_type TEXT NOT NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  in_qty NUMERIC(12, 2) DEFAULT 0.00,
  qty_in NUMERIC(12, 2) DEFAULT 0.00,
  out_qty NUMERIC(12, 2) DEFAULT 0.00,
  qty_out NUMERIC(12, 2) DEFAULT 0.00,
  balance_qty NUMERIC(12, 2) DEFAULT 0.00,
  unit_cost_bdt NUMERIC(14, 4) DEFAULT 0.00,
  total_cost_bdt NUMERIC(16, 2) DEFAULT 0.00,
  batch_number TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 49. FIELD FORCE GPS VISITS & ROUTE ACTIVITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.visit_logs (
  id BIGSERIAL PRIMARY KEY,
  rep_id TEXT NOT NULL,
  rep_name TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE,
  time TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  visit_type TEXT DEFAULT 'Scheduled Visit',
  purpose TEXT,
  is_productive BOOLEAN DEFAULT FALSE,
  check_in_location TEXT,
  notes TEXT,
  feedback TEXT,
  order_booked_amount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  order_placed_bdt NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 50. FINANCIAL SETTLEMENTS & GENERAL PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  tran_no TEXT UNIQUE NOT NULL,
  tran_date DATE DEFAULT CURRENT_DATE,
  sales_order_id TEXT,
  distributor_id TEXT,
  distributor_name TEXT,
  customer_id TEXT,
  customer_name TEXT,
  requested_by TEXT,
  requested_by_id TEXT,
  payment_method TEXT DEFAULT 'Cash',
  payment_mode TEXT,
  bank_id TEXT,
  bank_name TEXT,
  department_id TEXT,
  department_name TEXT,
  department TEXT,
  out_account_name TEXT,
  amount_bdt NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  payment_amount NUMERIC(14, 2) DEFAULT 0.00,
  approved_amount NUMERIC(14, 2) DEFAULT 0.00,
  instrument_number TEXT,
  cheque_no_receipt_no TEXT,
  invoice_no TEXT,
  payment_date DATE,
  status TEXT DEFAULT 'Submitted',
  approved_by TEXT,
  approved_date TIMESTAMPTZ,
  remarks TEXT,
  description TEXT,
  document_image TEXT,
  creation_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cash_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL, -- 'Cash' | 'Bank'
  name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  branch_name TEXT,
  routing_number TEXT,
  currency TEXT DEFAULT 'BDT',
  current_balance_bdt NUMERIC(14, 2) DEFAULT 0.00,
  opening_balance_bdt NUMERIC(14, 2) DEFAULT 0.00,
  opening_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'Active',
  is_default BOOLEAN DEFAULT FALSE,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_bank_transactions (
  id BIGSERIAL PRIMARY KEY,
  voucher_no TEXT UNIQUE NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  type TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  target_account_id TEXT,
  target_account_name TEXT,
  category TEXT NOT NULL,
  party_name TEXT,
  service_ref TEXT,
  invoice_no TEXT,
  sales_order_id TEXT,
  reference_no TEXT,
  description TEXT,
  debit NUMERIC(14, 2) DEFAULT 0.00,
  credit NUMERIC(14, 2) DEFAULT 0.00,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  running_balance NUMERIC(14, 2) DEFAULT 0.00,
  attachment_url TEXT,
  attachment_name TEXT,
  remarks TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'Posted',
  is_contra BOOLEAN DEFAULT FALSE,
  reversal_of_id TEXT,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.opening_balance_configs (
  id BIGSERIAL PRIMARY KEY,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  opening_date DATE DEFAULT CURRENT_DATE,
  initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  remarks TEXT,
  configured_by TEXT,
  configured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_income_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 54. WARRANTY RMA & BATTERY SERVICE CENTER OPERATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.battery_receiving_records (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT,
  ticket_number TEXT,
  receiving_date DATE DEFAULT CURRENT_DATE,
  receiving_receipt_number TEXT UNIQUE NOT NULL,
  battery_brand TEXT DEFAULT 'Ensec Lithium BD',
  serial_number TEXT NOT NULL,
  customer_name TEXT,
  delivery_method TEXT,
  courier_tracking TEXT,
  received_by TEXT,
  physical_condition TEXT,
  notes TEXT,
  battery_model TEXT,
  initial_voltage NUMERIC(6, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.technical_inspections (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT,
  ticket_number TEXT,
  serial_number TEXT,
  technician_name TEXT NOT NULL,
  inspection_date DATE DEFAULT CURRENT_DATE,
  is_safety_hold BOOLEAN DEFAULT FALSE,
  safety_hold_reason TEXT,
  voltage_reading NUMERIC(6, 2),
  tested_voltage NUMERIC(6, 2),
  internal_resistance NUMERIC(8, 2),
  tested_internal_resistance NUMERIC(8, 2),
  cell_condition TEXT,
  bms_condition TEXT,
  bms_diagnostic_result TEXT,
  root_cause_description TEXT,
  recommended_action TEXT,
  findings TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_job_cards (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT,
  ticket_number TEXT,
  job_card_number TEXT UNIQUE NOT NULL,
  technician_id TEXT,
  technician_name TEXT NOT NULL,
  assigned_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'In Progress',
  work_description TEXT,
  parts_replaced_json JSONB DEFAULT '[]'::jsonb,
  labor_hours NUMERIC(6, 2) DEFAULT 0.00,
  labor_cost_bdt NUMERIC(10, 2) DEFAULT 0.00,
  total_service_cost_bdt NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.service_invoices (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT,
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE DEFAULT CURRENT_DATE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  subtotal_bdt NUMERIC(12, 2) DEFAULT 0.00,
  discount_bdt NUMERIC(12, 2) DEFAULT 0.00,
  vat_bdt NUMERIC(12, 2) DEFAULT 0.00,
  total_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paid_bdt NUMERIC(12, 2) DEFAULT 0.00,
  due_bdt NUMERIC(12, 2) DEFAULT 0.00,
  payment_status TEXT DEFAULT 'Unpaid',
  payment_method TEXT DEFAULT 'Cash',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_id TEXT,
  ticket_id TEXT,
  receipt_no TEXT UNIQUE NOT NULL,
  payment_date DATE DEFAULT CURRENT_DATE,
  amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_method TEXT DEFAULT 'Cash',
  transaction_reference TEXT,
  received_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.warranty_delivery_dispatches (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT,
  ticket_number TEXT,
  dispatch_number TEXT UNIQUE NOT NULL,
  dispatch_date DATE DEFAULT CURRENT_DATE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  delivery_address TEXT,
  courier_name TEXT,
  tracking_number TEXT,
  dispatched_by TEXT,
  status TEXT DEFAULT 'Dispatched',
  received_confirmation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 55. GLOBAL ROW-LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- ============================================================================

DO $$
DECLARE
  tbl text;
  all_tables text[] := ARRAY[
    'users', 'warehouses', 'distributors', 'customers', 'products',
    'raw_material_classifications', 'raw_material_categories', 'raw_materials',
    'sales_orders', 'tada_claims', 'warranty_tickets', 'attendance_logs',
    'cash_book_entries', 'product_categories', 'product_brands',
    'customer_categories', 'org_hierarchy', 'departments', 'banks',
    'units_of_measurement', 'field_force_reps', 'offers_promotions',
    'stock_cid_receipts', 'stock_cid_receipt_items', 'stock_inventory',
    'stock_opening_records', 'stock_issues', 'stock_issue_items',
    'stock_primary_returns', 'stock_damage_returns', 'stock_transfers',
    'stock_transfer_items', 'stock_adjustments', 'requisitions',
    'requisition_items', 'retailer_orders', 'retailer_order_items',
    'retailer_delivery_actions', 'retailer_cancellations', 'market_hierarchies',
    'crm_agreements', 'installment_plans', 'installment_schedules',
    'installment_payments', 'installment_payment_allocations',
    'installment_notifications', 'installment_settings', 'installment_audit_logs',
    'collection_assignments', 'collection_followups', 'collection_escalations',
    'sms_templates', 'sms_automation_rules', 'sms_logs', 'sms_gateway_settings',
    'raw_material_receipts', 'raw_material_receipt_items', 'inventory_batches',
    'inventory_movements', 'bill_of_materials', 'bom_items', 'material_issues',
    'material_issue_items', 'production_consumption', 'production_costs',
    'finished_goods_receipts', 'suppliers', 'import_orders', 'import_order_items',
    'production_orders', 'optimum_statement', 'stock_ledger', 'visit_logs',
    'payments', 'payroll_records', 'audit_logs', 'cash_bank_accounts',
    'cash_bank_transactions', 'opening_balance_configs', 'expense_categories',
    'service_income_categories', 'battery_receiving_records', 'technical_inspections',
    'service_job_cards', 'service_invoices', 'service_payments', 'warranty_delivery_dispatches'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'Allow public access'
      ) THEN
        EXECUTE format('CREATE POLICY "Allow public access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 56. DATABASE PERMISSIONS & SUPABASE REALTIME REPLICATION
-- ============================================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- 41. MANUFACTURING EXPENSE MANAGEMENT & PRODUCTION COST ALLOCATION
-- Supports Factory Overhead & Business Expenses posting and batch allocation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id TEXT PRIMARY KEY,
  voucher_number TEXT UNIQUE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  cost_center TEXT NOT NULL,
  department TEXT NOT NULL,
  factory_warehouse TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  allocated_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unallocated_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  bank_account_id TEXT,
  bank_account_name TEXT,
  description TEXT NOT NULL,
  supporting_document TEXT,
  approval_status TEXT NOT NULL DEFAULT 'Approved',
  is_factory_expense BOOLEAN NOT NULL DEFAULT false,
  is_direct_cost BOOLEAN NOT NULL DEFAULT false,
  production_batch_ref TEXT,
  posted_by TEXT NOT NULL,
  approved_by TEXT,
  accounting_entries JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.production_cost_allocations (
  id TEXT PRIMARY KEY,
  allocation_number TEXT UNIQUE NOT NULL,
  expense_entry_id TEXT NOT NULL REFERENCES public.expense_entries(id) ON DELETE CASCADE,
  expense_voucher_number TEXT NOT NULL,
  expense_category TEXT NOT NULL,
  expense_subcategory TEXT NOT NULL,
  total_expense_amount NUMERIC(14, 2) NOT NULL,
  allocated_amount NUMERIC(14, 2) NOT NULL,
  allocation_method TEXT NOT NULL,
  allocation_basis_value NUMERIC(12, 2) NOT NULL,
  production_order_id TEXT NOT NULL,
  production_batch_number TEXT NOT NULL,
  product_model TEXT NOT NULL,
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  allocated_by TEXT NOT NULL,
  accounting_journal JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_entries_voucher ON public.expense_entries(voucher_number);
CREATE INDEX IF NOT EXISTS idx_expense_entries_date ON public.expense_entries(date);
CREATE INDEX IF NOT EXISTS idx_expense_entries_category ON public.expense_entries(category);
CREATE INDEX IF NOT EXISTS idx_expense_entries_factory ON public.expense_entries(is_factory_expense);
CREATE INDEX IF NOT EXISTS idx_prod_alloc_batch ON public.production_cost_allocations(production_batch_number);
CREATE INDEX IF NOT EXISTS idx_prod_alloc_exp ON public.production_cost_allocations(expense_entry_id);

GRANT ALL ON public.expense_entries TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.production_cost_allocations TO postgres, anon, authenticated, service_role;

-- Row Level Security (RLS) Policies for Expense Entries and Cost Allocations
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON public.expense_entries;
CREATE POLICY "Allow public access" ON public.expense_entries FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.production_cost_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON public.production_cost_allocations;
CREATE POLICY "Allow public access" ON public.production_cost_allocations FOR ALL USING (true) WITH CHECK (true);


-- Enable Supabase Realtime Replication publication for reactive front-end sync
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE
        public.users,
        public.warehouses,
        public.distributors,
        public.customers,
        public.products,
        public.raw_materials,
        public.sales_orders,
        public.warranty_tickets,
        public.stock_inventory,
        public.stock_cid_receipts,
        public.crm_agreements,
        public.installment_plans,
        public.installment_schedules,
        public.installment_payments,
        public.cash_bank_transactions,
        public.cash_bank_accounts,
        public.production_orders,
        public.expense_entries,
        public.production_cost_allocations;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- 48. CENTRAL EMPLOYEE & COMPREHENSIVE PAYROLL MANAGEMENT
-- ============================================================================

-- Add Central Employee Extended Columns to field_force_reps
ALTER TABLE IF EXISTS public.field_force_reps
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS employee_category TEXT DEFAULT 'Office Employee',
  ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Full Time',
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS present_address TEXT,
  ADD COLUMN IF NOT EXISTS permanent_address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS reporting_manager_id TEXT,
  ADD COLUMN IF NOT EXISTS reporting_manager_name TEXT,
  ADD COLUMN IF NOT EXISTS branch_workplace TEXT DEFAULT 'Head Office - Gulshan, Dhaka',
  ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT 'City Bank PLC',
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch TEXT DEFAULT 'Gulshan Avenue',
  ADD COLUMN IF NOT EXISTS routing_number TEXT,
  ADD COLUMN IF NOT EXISTS mobile_banking_provider TEXT DEFAULT 'bKash',
  ADD COLUMN IF NOT EXISTS mobile_banking_number TEXT,
  ADD COLUMN IF NOT EXISTS national_id TEXT,
  ADD COLUMN IF NOT EXISTS resignation_date DATE,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS parent_code TEXT,
  ADD COLUMN IF NOT EXISTS invoice_within_days INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS tada_approver_id TEXT,
  ADD COLUMN IF NOT EXISTS tada_approver_name TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS action_type TEXT;


-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  classification TEXT NOT NULL,
  parent_id TEXT REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  level INT NOT NULL DEFAULT 1,
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_contra BOOLEAN NOT NULL DEFAULT FALSE,
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('Debit', 'Credit')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  linked_cash_bank_account_id TEXT,
  description TEXT,
  created_by TEXT DEFAULT 'System',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.financial_years (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  closing_voucher_id TEXT,
  retained_earnings_transferred_bdt NUMERIC(16, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id TEXT PRIMARY KEY,
  financial_year_id TEXT NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_number INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed', 'Locked')),
  closed_by TEXT,
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.accounting_vouchers (
  id TEXT PRIMARY KEY,
  voucher_no TEXT NOT NULL UNIQUE,
  voucher_type TEXT NOT NULL,
  voucher_date DATE NOT NULL,
  financial_year_id TEXT,
  period_id TEXT,
  reference_no TEXT,
  description TEXT NOT NULL,
  total_debit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  total_credit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Posted', 'Reversed')),
  source_module TEXT,
  source_id TEXT,
  party_type TEXT,
  party_id TEXT,
  party_name TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  prepared_by TEXT NOT NULL,
  prepared_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  posted_by TEXT,
  posted_at TIMESTAMPTZ,
  reversed_by TEXT,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  reversal_of_voucher_id TEXT,
  reversed_by_voucher_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounting_voucher_lines (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES public.accounting_vouchers(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  account_id TEXT NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  description TEXT,
  debit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  credit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  party_type TEXT,
  party_id TEXT,
  party_name TEXT,
  cost_center TEXT
);

CREATE TABLE IF NOT EXISTS public.general_ledger_entries (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES public.accounting_vouchers(id) ON DELETE CASCADE,
  voucher_no TEXT NOT NULL,
  voucher_type TEXT NOT NULL,
  entry_date DATE NOT NULL,
  financial_year_id TEXT,
  period_id TEXT,
  account_id TEXT NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_category TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_no TEXT,
  debit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  credit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  source_module TEXT,
  source_id TEXT,
  party_name TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_opening_balances (
  id TEXT PRIMARY KEY,
  financial_year_id TEXT NOT NULL,
  effective_date DATE NOT NULL,
  reference_no TEXT,
  description TEXT NOT NULL,
  voucher_id TEXT,
  total_debit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  total_credit NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
  lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  posted_by TEXT NOT NULL,
  posted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounting_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  company_legal_name TEXT NOT NULL DEFAULT 'Ensec Lithium Battery BD Ltd.',
  base_currency TEXT NOT NULL DEFAULT 'BDT',
  allow_negative_cash_bank BOOLEAN NOT NULL DEFAULT FALSE,
  auto_sync_erp_transactions BOOLEAN NOT NULL DEFAULT TRUE,
  require_voucher_approval BOOLEAN NOT NULL DEFAULT FALSE,
  enforce_period_locking BOOLEAN NOT NULL DEFAULT TRUE,
  default_vat_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  voucher_no TEXT,
  details TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_voucher_source_unique
  ON public.accounting_vouchers(source_module, source_id)
  WHERE source_module IS NOT NULL AND source_id IS NOT NULL AND status <> 'Reversed';

CREATE INDEX IF NOT EXISTS idx_coa_parent ON public.chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_coa_category ON public.chart_of_accounts(category);
CREATE INDEX IF NOT EXISTS idx_gl_account_date ON public.general_ledger_entries(account_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_gl_date ON public.general_ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_gl_voucher ON public.general_ledger_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date_status ON public.accounting_vouchers(voucher_date, status);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "Allow public all chart_of_accounts" ON public.chart_of_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all financial_years" ON public.financial_years;
CREATE POLICY "Allow public all financial_years" ON public.financial_years FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all accounting_periods" ON public.accounting_periods;
CREATE POLICY "Allow public all accounting_periods" ON public.accounting_periods FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all accounting_vouchers" ON public.accounting_vouchers;
CREATE POLICY "Allow public all accounting_vouchers" ON public.accounting_vouchers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all accounting_voucher_lines" ON public.accounting_voucher_lines;
CREATE POLICY "Allow public all accounting_voucher_lines" ON public.accounting_voucher_lines FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all general_ledger_entries" ON public.general_ledger_entries;
CREATE POLICY "Allow public all general_ledger_entries" ON public.general_ledger_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all account_opening_balances" ON public.account_opening_balances;
CREATE POLICY "Allow public all account_opening_balances" ON public.account_opening_balances FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all accounting_settings" ON public.accounting_settings;
CREATE POLICY "Allow public all accounting_settings" ON public.accounting_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all account_audit_logs" ON public.account_audit_logs;
CREATE POLICY "Allow public all account_audit_logs" ON public.account_audit_logs FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.chart_of_accounts TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.financial_years TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.accounting_periods TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.accounting_vouchers TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.accounting_voucher_lines TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.general_ledger_entries TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.account_opening_balances TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.accounting_settings TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.account_audit_logs TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- CENTRALIZED SYSTEM SETTINGS & BRANDING CONFIGURATION

NOTIFY pgrst, 'reload schema';