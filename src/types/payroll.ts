/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Employee & Comprehensive Payroll Management Types
 * Bridges Field Force Reps as Central Employee Entities with 
 * Salary Structure, Attendance, Leaves, Advances, Loans, Overtime, Bonuses, and Payroll Runs.
 */

export type EmployeeCategory = 
  | 'Office Employee'
  | 'Field Employee'
  | 'Factory Employee'
  | 'Production'
  | 'Warehouse Employee'
  | 'Management Employee'
  | 'Other Employee';

export type EmploymentType = 
  | 'Permanent'
  | 'Contractual'
  | 'Probationary'
  | 'Intern'
  | 'Part-time'
  | 'Full Time';

export type EmploymentStatus = 
  | 'Active'
  | 'On Leave'
  | 'Suspended'
  | 'Resigned'
  | 'Terminated';

export type AttendanceStatus = 
  | 'Present'
  | 'Absent'
  | 'Late'
  | 'Early Leave'
  | 'Half Day'
  | 'Half-Day'
  | 'Weekly Off'
  | 'Public Holiday'
  | 'Paid Leave'
  | 'Unpaid Leave'
  | 'Holiday'
  | 'Leave';

export type LeaveType = 
  | 'Annual Leave'
  | 'Casual Leave'
  | 'Sick Leave'
  | 'Maternity Leave'
  | 'Unpaid Leave'
  | 'Other Leave';

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export type AdvanceLoanType = 'Salary Advance' | 'Employee Loan';
export type AdvanceLoanStatus = 'Pending Approval' | 'Approved' | 'Disbursed' | 'In Repayment' | 'Completed' | 'Rejected';

export type BonusType = 'Festival Bonus' | 'Performance Bonus' | 'Special Bonus' | 'Sales Incentive' | 'Other Bonus';
export type BonusCalculationMethod = 'Basic Percentage' | 'Fixed Amount' | 'Custom Amount';

export type PayrollRunStatus = 'Draft' | 'Under Review' | 'Accounts Approved' | 'Finalized' | 'Locked' | 'Disbursed' | 'Paid';
export type SalaryPaymentMethod = 'Cash' | 'Bank Transfer' | 'Mobile Financial Services' | 'Cheque' | 'Other' | 'bKash' | 'Nagad';
export type SalaryPaymentStatus = 'Pending' | 'Partially Paid' | 'Paid' | 'Unpaid';

// --------------------------------------------------------------------------
// 1. Employee Salary Structure
// --------------------------------------------------------------------------
export interface SalaryComponent {
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  amountBDT: number;
  isPercentage: boolean;
  percentageBasis?: 'BASIC' | 'GROSS';
  percentageValue?: number;
  isTaxable?: boolean;
}

export interface EmployeeSalaryStructure {
  id: string;
  fieldForceId?: string; // References FieldForceRep.id
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  designation: string;
  department: string;
  employeeCategory?: EmployeeCategory;
  effectiveFrom: string;
  
  // Earnings
  basicSalaryBDT: number;
  houseRentBDT: number;
  medicalAllowanceBDT: number;
  conveyanceAllowanceBDT: number;
  foodAllowanceBDT?: number;
  mobileAllowanceBDT: number;
  specialAllowanceBDT?: number;
  otherAllowancesBDT: number;
  grossSalaryBDT: number;

  // Fixed Deductions
  providentFundBDT?: number;
  taxDeductionBDT?: number;
  otherFixedDeductionBDT?: number;

  // Revision Audit
  revisionReason?: string;
  revisedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  history?: Array<{
    effectiveDate: string;
    grossSalaryBDT: number;
    basicSalaryBDT: number;
    reason: string;
    changedBy: string;
    changedAt: string;
  }>;
}

export interface SalaryStructuresDbStatus {
  synced: boolean;
  status: 'synced' | 'rls_blocked' | 'table_missing' | 'error' | 'not_configured' | 'unknown';
  error?: string | null;
  sqlFix?: string | null;
}

export const SALARY_STRUCTURES_TABLE_SQL = `-- Run this in your Supabase SQL Editor to enable saving Employee Salary Structures:
CREATE TABLE IF NOT EXISTS public.employee_salary_structures (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  basic_salary_bdt NUMERIC(14, 2) NOT NULL DEFAULT 30000.00,
  house_rent_bdt NUMERIC(14, 2) NOT NULL DEFAULT 15000.00,
  medical_allowance_bdt NUMERIC(14, 2) NOT NULL DEFAULT 3000.00,
  conveyance_allowance_bdt NUMERIC(14, 2) NOT NULL DEFAULT 4000.00,
  mobile_allowance_bdt NUMERIC(14, 2) NOT NULL DEFAULT 2000.00,
  special_allowance_bdt NUMERIC(14, 2) DEFAULT 0.00,
  other_allowances_bdt NUMERIC(14, 2) DEFAULT 0.00,
  gross_salary_bdt NUMERIC(14, 2) NOT NULL DEFAULT 54000.00,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  history_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.employee_salary_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all employee_salary_structures" ON public.employee_salary_structures;
CREATE POLICY "Allow public all employee_salary_structures" ON public.employee_salary_structures FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.employee_salary_structures TO postgres, anon, authenticated, service_role;`;

// --------------------------------------------------------------------------
// 1B. Office Locations (GPS Geofencing Setup)
// --------------------------------------------------------------------------
export interface OfficeLocation {
  id: string;
  code?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number; // Default: 200
  status: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
}

// --------------------------------------------------------------------------
// 2. Attendance Records & GPS Geofence Validation
// --------------------------------------------------------------------------
export type GPSValidationStatus = 'Accepted' | 'Rejected' | 'Manual' | 'QR Scan';

export interface AttendanceRecord {
  id: string;
  userId?: string;
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  employeeCategory?: EmployeeCategory;
  department?: string;
  designation?: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  inTime?: string;
  outTime?: string;
  checkInTime?: string; // HH:mm
  checkOutTime?: string; // HH:mm
  workHours?: number;
  overtimeHours?: number;
  isLate?: boolean;
  lateMinutes?: number;
  lateDurationMinutes?: number;
  isEarlyLeave?: boolean;
  earlyMinutes?: number;
  remarks?: string;
  recordedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  scanMethod?: 'QR' | 'GPS' | 'Manual';
  lastScanAt?: string;
  scanCount?: number;

  // GPS Geofencing Fields
  assignedOfficeId?: string;
  assignedOfficeName?: string;
  officeLatitude?: number;
  officeLongitude?: number;
  allowedRadiusMeters?: number;

  checkInLatitude?: number;
  checkInLongitude?: number;
  checkInDistanceMeters?: number;
  checkInGpsAccuracyMeters?: number;
  checkInLocationText?: string;

  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkOutDistanceMeters?: number;
  checkOutGpsAccuracyMeters?: number;
  checkOutLocationText?: string;

  gpsValidationStatus?: GPSValidationStatus;
  validationReason?: string;
}

export interface RejectedAttendanceAttempt {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName: string;
  department?: string;
  designation?: string;
  assignedOfficeId?: string;
  assignedOfficeName?: string;
  officeLatitude?: number;
  officeLongitude?: number;
  allowedRadiusMeters: number;
  attemptType: 'Check In' | 'Check Out';
  attendanceDate: string; // YYYY-MM-DD
  attemptTime: string; // HH:mm:ss
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  gpsAccuracyMeters?: number;
  gpsValidationStatus: 'Rejected';
  rejectionReason: string;
  deviceInfo?: string;
  createdAt: string;
}

// --------------------------------------------------------------------------
// 3. Leave Applications & Quotas
// --------------------------------------------------------------------------
export interface LeaveRecord {
  id: string;
  leaveApplicationNo?: string;
  userId?: string;
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  department?: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays?: number;
  daysCount?: number;
  reason: string;
  status: LeaveStatus;
  appliedDate?: string;
  appliedAt?: string;
  approvedBy?: string;
  approvalDate?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

export interface LeaveBalance {
  annualLeave: number;
  annualUsed: number;
  casualLeave: number;
  casualUsed: number;
  sickLeave: number;
  sickUsed: number;
  maternityLeave: number;
  maternityUsed: number;
  unpaidLeaveUsed: number;
}

// --------------------------------------------------------------------------
// 4. Employee Advances & Loans
// --------------------------------------------------------------------------
export interface LoanInstallmentSchedule {
  installmentNumber: number;
  monthYear: string; // e.g. "2026-11"
  installmentAmountBDT?: number;
  amountBDT?: number;
  paidAmountBDT?: number;
  isDeducted?: boolean;
  deductionDate?: string;
  paidDate?: string;
  payrollRunId?: string;
  deductedInPayrollId?: string;
  status: 'Pending' | 'Deducted' | 'Skipped' | 'Early Settled' | 'Scheduled';
}

export interface AdvanceLoanRecord {
  id: string;
  referenceNo?: string; // e.g. "LN-2026-001"
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  department?: string;
  employeeCategory?: EmployeeCategory;
  loanType?: AdvanceLoanType;
  type?: AdvanceLoanType;
  requestedAmountBDT?: number;
  principalAmountBDT?: number;
  approvedAmountBDT?: number;
  requestDate?: string;
  appliedDate?: string;
  status: AdvanceLoanStatus | 'Pending' | 'Active' | 'Closed' | 'Settled';
  disbursementDate?: string;
  approvalDate?: string;
  disbursementAccount?: string;
  repaymentStartMonth?: string; // "YYYY-MM"
  deductionStartMonthYear?: string;
  installmentDurationMonths?: number;
  repaymentTenureMonths?: number;
  monthlyInstallmentBDT?: number;
  monthlyDeductionBDT?: number;
  totalPaidBDT?: number;
  repaidAmountBDT?: number;
  remainingBalanceBDT?: number;
  remainingAmountBDT?: number;
  purpose?: string;
  remarks?: string;
  approvedBy?: string;
  schedule: LoanInstallmentSchedule[];
}

// --------------------------------------------------------------------------
// 5. Overtime Records
// --------------------------------------------------------------------------
export interface OvertimeRecord {
  id: string;
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  department?: string;
  overtimeDate?: string;
  date?: string;
  monthYear?: string;
  hours: number;
  hourlyRateBDT?: number;
  ratePerHourBDT?: number;
  totalAmountBDT: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvalDate?: string;
  reason?: string;
}

// --------------------------------------------------------------------------
// 6. Bonus & Incentives
// --------------------------------------------------------------------------
export interface BonusRecord {
  id: string;
  bonusTitle?: string;
  bonusType?: BonusType;
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  department?: string;
  type?: BonusType;
  calculationMethod?: BonusCalculationMethod;
  percentageOfBasic?: number;
  amountBDT: number;
  effectiveMonth?: string; // "YYYY-MM"
  monthYear?: string;
  status: 'Pending' | 'Approved' | 'Paid';
  approvedBy?: string;
  remarks?: string;
}

// --------------------------------------------------------------------------
// 7. Monthly Payroll Run & Salary Sheet Item
// --------------------------------------------------------------------------
export interface MonthlySalarySheetItem {
  id: string;
  payrollRunId: string;
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  department: string;
  designation: string;
  employeeCategory: EmployeeCategory;
  monthYear?: string; // "YYYY-MM"
  bankAccountNo?: string;
  bankName?: string;
  
  // Working days summary
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  unpaidLeaveDays?: number;
  lateDays?: number;
  holidays?: number;
  overtimeHours: number;

  // Earnings Breakdown
  basicSalaryBDT: number;
  houseRentBDT: number;
  medicalAllowanceBDT: number;
  conveyanceAllowanceBDT: number;
  foodAllowanceBDT?: number;
  mobileAllowanceBDT: number;
  specialAllowanceBDT?: number;
  otherAllowancesBDT: number;
  overtimeAmountBDT: number;
  salesIncentiveBDT: number;
  bonusAmountBDT?: number;
  festivalBonusBDT?: number;
  performanceBonusBDT?: number;
  grossSalaryBDT?: number;
  totalGrossEarningsBDT?: number;

  // Deductions Breakdown
  absentDeductionBDT?: number;
  attendanceDeductionBDT?: number;
  lateDeductionBDT?: number;
  advanceDeductionBDT?: number;
  loanInstallmentBDT?: number;
  advanceLoanDeductionBDT?: number;
  providentFundBDT?: number;
  providentFundDeductionBDT?: number;
  taxDeductionBDT: number;
  otherDeductionsBDT: number;
  totalDeductionsBDT: number;

  // Net Output
  netPayableBDT?: number;
  netSalaryBDT?: number;
  paidAmountBDT?: number;
  paymentStatus: SalaryPaymentStatus | 'Unpaid';
  paymentMethod?: SalaryPaymentMethod;
  paymentDate?: string;
  transactionRef?: string;
  bankAccountInfo?: string;
}

export interface MonthlyPayrollRun {
  id: string;
  payrollMonth?: string; // "YYYY-MM"
  monthYear?: string;
  runDate?: string;
  totalEmployees: number;
  officeEmployeesCount?: number;
  fieldEmployeesCount?: number;
  factoryEmployeesCount?: number;
  warehouseEmployeesCount?: number;
  totalGrossSalaryBDT?: number;
  totalGrossBDT?: number;
  totalAllowancesBDT?: number;
  totalOvertimeBDT: number;
  totalBonusesBDT?: number;
  totalBonusBDT?: number;
  totalDeductionsBDT: number;
  totalNetPayableBDT?: number;
  totalNetBDT?: number;
  totalLoanDeductionsBDT?: number;
  totalPFDeductionsBDT?: number;
  totalTaxDeductionsBDT?: number;
  totalPaidBDT?: number;
  status: PayrollRunStatus | 'Paid';
  approvedBy?: string;
  approvalDate?: string;
  finalizedBy?: string;
  finalizedDate?: string;
  processedAt?: string;
  processedBy?: string;
  finalizedAt?: string;
  accountingJournalEntries?: Array<{
    accountCode: string;
    accountName: string;
    debitBDT: number;
    creditBDT: number;
  }>;
  items: MonthlySalarySheetItem[];
}

// --------------------------------------------------------------------------
// 8. Salary Payment Recording
// --------------------------------------------------------------------------
export interface SalaryPaymentRecord {
  id: string;
  payrollRunId: string;
  salarySheetItemId?: string;
  fieldForceId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName: string;
  department?: string;
  monthYear: string;
  netPayableBDT?: number;
  paidAmountBDT?: number;
  amountBDT?: number;
  paymentDate: string;
  paymentMethod: SalaryPaymentMethod;
  bankAccountId?: string;
  bankAccountName?: string;
  transactionReference: string;
  paymentStatus?: SalaryPaymentStatus;
  status?: string;
  notes?: string;
  remarks?: string;
  disbursedBy: string;
}

// --------------------------------------------------------------------------
// 9. Configurable Payroll Settings
// --------------------------------------------------------------------------
export interface OvertimePurposeOption {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PayrollSettings {
  workingDaysPerMonth?: number;
  standardWorkHoursPerDay?: number;
  standardWorkingDaysPerMonth?: number;
  standardDailyHours?: number;
  overtimeHourlyMultiplier?: number; // e.g. 1.5x basic hourly
  overtimeConfig?: {
    hourlyRateMultiplier: number;
  };
  overtimePurposes?: OvertimePurposeOption[];
  lateGracePeriodMinutes?: number;
  shiftStartTime?: string; // e.g. '09:00'
  shiftEndTime?: string;   // e.g. '18:00'
  maxGpsAccuracyMeters?: number; // e.g. 100
  lateDaysForOneDayAbsent?: number; // e.g. 3 late days = 1 day absent deduction
  annualLeaveQuota?: number;
  casualLeaveQuota?: number;
  sickLeaveQuota?: number;
  maternityLeaveDays?: number;
  leaveQuotas?: {
    annualLeave: number;
    casualLeave: number;
    sickLeave: number;
    maternityLeave: number;
  };
  deductionRules?: {
    absentDayDeductionMultiplier?: number;
    lateDeductionRules?: string;
    latePenaltyEnabled?: boolean;
    incomeTaxEnabled?: boolean;
    providentFundEnabled?: boolean;
    pfEmployeeContributionPercent?: number;
    pfEmployerContributionPercent?: number;
  };
  pfEmployeeContributionPercent?: number;
  salaryComponents?: {
    houseRentPercent?: number;
    medicalAllowancePercent?: number;
  };
  companyName?: string;
  companyAddress?: string;
  defaultBankAccountId?: string;
  autoPostAccountingJournal?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PayrollSettingsDbStatus {
  synced: boolean;
  status: 'synced' | 'rls_blocked' | 'table_missing' | 'column_missing' | 'error' | 'not_configured' | 'unknown';
  error?: string | null;
  sqlFix?: string | null;
}

export const PAYROLL_SETTINGS_TABLE_SQL = `-- Run this in your Supabase SQL Editor to enable saving Corporate Payroll Configuration & Statutory Rules:
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  standard_working_days_per_month INT DEFAULT 26,
  standard_daily_hours INT DEFAULT 8,
  overtime_config JSONB DEFAULT '{"hourlyRateMultiplier": 1.5}'::jsonb,
  leave_quotas JSONB DEFAULT '{"annualLeave": 14, "casualLeave": 10, "sickLeave": 14, "maternityLeave": 112}'::jsonb,
  deduction_rules JSONB DEFAULT '{"absentDayDeductionMultiplier": 1.0, "lateDeductionRules": "3 late marks equal 1 day deduction", "latePenaltyEnabled": true, "incomeTaxEnabled": true, "providentFundEnabled": true, "pfEmployeeContributionPercent": 10, "pfEmployerContributionPercent": 10}'::jsonb,
  salary_components JSONB DEFAULT '{"houseRentPercent": 50, "medicalAllowancePercent": 10}'::jsonb,
  pf_employee_contribution_percent NUMERIC(5, 2) DEFAULT 10,
  shift_start_time TEXT DEFAULT '09:00',
  shift_end_time TEXT DEFAULT '18:00',
  late_grace_period_minutes INT DEFAULT 15,
  max_gps_accuracy_meters INT DEFAULT 100,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS standard_working_days_per_month INT DEFAULT 26;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS standard_daily_hours INT DEFAULT 8;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS overtime_config JSONB DEFAULT '{"hourlyRateMultiplier": 1.5}'::jsonb;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS leave_quotas JSONB DEFAULT '{"annualLeave": 14, "casualLeave": 10, "sickLeave": 14, "maternityLeave": 112}'::jsonb;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS deduction_rules JSONB DEFAULT '{"absentDayDeductionMultiplier": 1.0, "lateDeductionRules": "3 late marks equal 1 day deduction", "latePenaltyEnabled": true, "incomeTaxEnabled": true, "providentFundEnabled": true, "pfEmployeeContributionPercent": 10, "pfEmployerContributionPercent": 10}'::jsonb;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS salary_components JSONB DEFAULT '{"houseRentPercent": 50, "medicalAllowancePercent": 10}'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payroll_settings'
      AND column_name = 'pf_employee_contribution_percent'
  ) THEN
    ALTER TABLE public.payroll_settings ADD COLUMN pf_employee_contribution_percent NUMERIC(5, 2) DEFAULT 10;
    UPDATE public.payroll_settings
    SET pf_employee_contribution_percent = COALESCE(
      NULLIF(deduction_rules->>'pfEmployeeContributionPercent', '')::numeric,
      10
    )
    WHERE deduction_rules ? 'pfEmployeeContributionPercent';
  END IF;
END $$;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS shift_start_time TEXT DEFAULT '09:00';
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS shift_end_time TEXT DEFAULT '18:00';
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS late_grace_period_minutes INT DEFAULT 15;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS max_gps_accuracy_meters INT DEFAULT 100;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS overtime_purposes JSONB;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all payroll_settings" ON public.payroll_settings;
CREATE POLICY "Allow public all payroll_settings" ON public.payroll_settings FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.payroll_settings TO postgres, anon, authenticated, service_role;`;

export interface AttendanceDbStatus {
  synced: boolean;
  status: 'synced' | 'rls_blocked' | 'table_missing' | 'error' | 'not_configured' | 'unknown';
  error?: string | null;
  sqlFix?: string | null;
}

export const EMPLOYEE_ATTENDANCES_TABLE_SQL = `-- Run this in your Supabase SQL Editor to enable saving Daily Attendance Check In & Check Out directly to employee_attendances:
CREATE TABLE IF NOT EXISTS public.employee_attendances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_code TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL,
  department TEXT,
  designation TEXT,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Present',
  in_time TEXT,
  out_time TEXT,
  overtime_hours NUMERIC(5, 2) DEFAULT 0.00,
  work_hours NUMERIC(5, 2) DEFAULT 0.00,
  late_duration_minutes INT DEFAULT 0,
  gps_validation_status TEXT DEFAULT 'Manual',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_emp_date UNIQUE (employee_id, date)
);

ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS assigned_office_id TEXT;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS assigned_office_name TEXT;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS office_latitude NUMERIC(10, 7);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS office_longitude NUMERIC(10, 7);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS allowed_radius_meters INT DEFAULT 200;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_in_latitude NUMERIC(10, 7);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_in_longitude NUMERIC(10, 7);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_in_distance_meters NUMERIC(10, 2);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_in_gps_accuracy_meters NUMERIC(10, 2);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_in_location_text TEXT;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_out_latitude NUMERIC(10, 7);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_out_longitude NUMERIC(10, 7);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_out_distance_meters NUMERIC(10, 2);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_out_gps_accuracy_meters NUMERIC(10, 2);
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS check_out_location_text TEXT;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS work_hours NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS late_duration_minutes INT DEFAULT 0;
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS gps_validation_status TEXT DEFAULT 'Manual';
ALTER TABLE public.employee_attendances ADD COLUMN IF NOT EXISTS validation_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_emp_date' AND conrelid = 'public.employee_attendances'::regclass
  ) THEN
    ALTER TABLE public.employee_attendances ADD CONSTRAINT uq_emp_date UNIQUE (employee_id, date);
  END IF;
END $$;

ALTER TABLE public.employee_attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all employee_attendances" ON public.employee_attendances;
CREATE POLICY "Allow public all employee_attendances" ON public.employee_attendances FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.employee_attendances TO postgres, anon, authenticated, service_role;`;

export interface AdvanceLoansDbStatus {
  synced: boolean;
  status: 'synced' | 'rls_blocked' | 'table_missing' | 'error' | 'not_configured' | 'unknown';
  error?: string | null;
  sqlFix?: string | null;
}

export const EMPLOYEE_ADVANCES_LOANS_TABLE_SQL = `-- Run this in your Supabase SQL Editor to enable saving Employee Advances & Loans directly to employee_advances_loans:
CREATE TABLE IF NOT EXISTS public.employee_advances_loans (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_code TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL,
  loan_type TEXT NOT NULL DEFAULT 'Employee Loan',
  principal_amount_bdt NUMERIC(14, 2) NOT NULL,
  repayment_tenure_months INT NOT NULL DEFAULT 6,
  monthly_deduction_bdt NUMERIC(14, 2) NOT NULL,
  deduction_start_month_year TEXT NOT NULL,
  repaid_amount_bdt NUMERIC(14, 2) DEFAULT 0.00,
  remaining_amount_bdt NUMERIC(14, 2) NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by TEXT,
  approval_date DATE,
  remarks TEXT,
  schedule_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_loans_empid ON public.employee_advances_loans(employee_id);

ALTER TABLE public.employee_advances_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all employee_advances_loans" ON public.employee_advances_loans;
CREATE POLICY "Allow public all employee_advances_loans" ON public.employee_advances_loans FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.employee_advances_loans TO postgres, anon, authenticated, service_role;`;


