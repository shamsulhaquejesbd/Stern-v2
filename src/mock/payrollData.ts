/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Central Employee & Complete Payroll Baseline Configuration
 * All test/sample arrays cleared; live records load from runtime & Supabase.
 */

import {
  EmployeeSalaryStructure,
  LeaveRecord,
  AdvanceLoanRecord,
  OvertimeRecord,
  BonusRecord,
  MonthlyPayrollRun,
  OvertimePurposeOption,
  PayrollSettings,
} from '../types/payroll';
import { FieldForceRep } from '../types/erp';

export const INITIAL_CENTRAL_EMPLOYEES: FieldForceRep[] = [];

export const INITIAL_SALARY_STRUCTURES: EmployeeSalaryStructure[] = [];

export const INITIAL_ADVANCE_LOANS: AdvanceLoanRecord[] = [];

export const INITIAL_LEAVE_RECORDS: LeaveRecord[] = [];

export const INITIAL_OVERTIME_RECORDS: OvertimeRecord[] = [];

export const INITIAL_BONUS_RECORDS: BonusRecord[] = [];

export const DEFAULT_OVERTIME_PURPOSES: OvertimePurposeOption[] = [
  { id: 'otp-super-vasmol-kesh-kala', name: 'Super Vasmol Kesh Kala', isActive: true },
  { id: 'otp-vasmol-kali-mehendi', name: 'Vasmol Kali Mehendi', isActive: true },
  { id: 'otp-hair-oil-serum', name: 'Hair Oil & Serum', isActive: true },
  { id: 'otp-developer', name: 'Developer', isActive: true },
  { id: 'otp-shampoo-cream-hair-color', name: 'Shampoo & Cream Hair Color', isActive: true },
  { id: 'otp-security-reason-production', name: 'Security Reason Production Work', isActive: true },
  { id: 'otp-urgent-dispatch', name: 'Urgent Dispatch', isActive: true },
  { id: 'otp-factory-maintenance', name: 'Factory Maintenance', isActive: true },
  { id: 'otp-additional-assembly', name: 'Additional Assembly', isActive: true },
  { id: 'otp-emergency-work', name: 'Emergency Work', isActive: true },
];

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  workingDaysPerMonth: 26,
  standardWorkingDaysPerMonth: 26,
  standardWorkHoursPerDay: 8,
  standardDailyHours: 8,
  overtimeHourlyMultiplier: 1.5,
  overtimeConfig: {
    hourlyRateMultiplier: 1.5,
  },
  overtimePurposes: DEFAULT_OVERTIME_PURPOSES,
  lateGracePeriodMinutes: 15,
  lateDaysForOneDayAbsent: 3,
  annualLeaveQuota: 14,
  casualLeaveQuota: 10,
  sickLeaveQuota: 14,
  maternityLeaveDays: 112,
  leaveQuotas: {
    annualLeave: 14,
    casualLeave: 10,
    sickLeave: 14,
    maternityLeave: 112,
  },
  deductionRules: {
    absentDayDeductionMultiplier: 1,
    lateDeductionRules: '3 late days = 1 day basic salary deduction',
    latePenaltyEnabled: true,
    incomeTaxEnabled: true,
    providentFundEnabled: true,
    pfEmployeeContributionPercent: 10,
    pfEmployerContributionPercent: 10,
  },
  salaryComponents: {
    houseRentPercent: 50,
    medicalAllowancePercent: 10,
  },
  companyName: '',
  companyAddress: '',
  defaultBankAccountId: '',
  autoPostAccountingJournal: true,
};

export const INITIAL_MONTHLY_PAYROLL_RUNS: MonthlyPayrollRun[] = [];
