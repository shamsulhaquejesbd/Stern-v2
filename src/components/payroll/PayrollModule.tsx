/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Enterprise Corporate Payroll Management System
 * Complete 13-Section Architecture with Double-Entry Accounting Integration
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  DollarSign,
  Plus,
  Search,
  CheckCircle,
  CheckCircle2,
  Clock,
  Users,
  Download,
  Calendar,
  Building,
  Building2,
  FileText,
  Printer,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Check,
  X,
  Edit2,
  Trash2,
  Eye,
  Settings,
  ShieldCheck,
  Layers,
  PieChart,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Filter,
  Briefcase,
  Smartphone,
  Tag,
  Lock,
  RotateCcw,
  Receipt,
  Percent,
  ChevronDown,
  Info,
  Gift,
  HelpCircle,
  UserCheck,
  MapPin,
  Navigation,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  History,
  Database,
  Copy,
  RefreshCw,
  ExternalLink,
  QrCode,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useERP } from '../../context/ERPContext.tsx';
import { getSupabaseUrl } from '../../lib/supabase.ts';
import {
  DEFAULT_GRACE_PERIOD_MINUTES,
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  DEFAULT_SHIFT_END_TIME,
  DEFAULT_SHIFT_START_TIME,
  calculateNetWorkingHours,
  calculateShiftAttendanceStatus,
  formatLateDuration,
  formatTime12Hour,
} from '../../lib/geofence.ts';
import {
  EmployeeCategory,
  EmploymentType,
  EmploymentStatus,
  AttendanceStatus,
  LeaveType,
  EmployeeSalaryStructure,
  AttendanceRecord,
  RejectedAttendanceAttempt,
  LeaveRecord,
  AdvanceLoanRecord,
  OvertimeRecord,
  BonusRecord,
  MonthlySalarySheetItem,
  MonthlyPayrollRun,
  SalaryPaymentRecord,
  OvertimePurposeOption,
  PayrollSettings,
  SALARY_STRUCTURES_TABLE_SQL,
  PAYROLL_SETTINGS_TABLE_SQL,
  EMPLOYEE_ATTENDANCES_TABLE_SQL,
  EMPLOYEE_ADVANCES_LOANS_TABLE_SQL,
} from '../../types/payroll.ts';
import { DEFAULT_OVERTIME_PURPOSES } from '../../mock/payrollData.ts';
import { FieldForceRep } from '../../types/erp.ts';
import {
  findLinkedUserForEmployee,
  resolveGeofenceConfigFromUser,
} from '../../lib/fieldForceAuth.ts';
import { EmployeeAttendanceCardModal } from './EmployeeAttendanceCardModal.tsx';
import { DailyWagesBillFactory } from './DailyWagesBillFactory.tsx';
import { Time12HourInput } from '../common/Time12HourInput.tsx';
import { QrAttendanceScannerModal } from './QrAttendanceScannerModal.tsx';
import {
  PayrollTab,
  PAYROLL_SUBPAGE_DEFS,
  resolvePayrollPagePermissions,
  getFirstPermittedPayrollTab,
  parsePayrollTabFromRoute,
  payrollTabToPathname,
} from '../../lib/payrollPermissions.ts';

interface PayrollModuleProps {
  initialRouteTab?: PayrollTab | null;
  isExplicitSubRoute?: boolean;
  onSyncRouteTab?: (tab: PayrollTab) => void;
}

export const PayrollModule: React.FC<PayrollModuleProps> = ({
  initialRouteTab = null,
  isExplicitSubRoute = false,
  onSyncRouteTab,
}) => {
  const {
    currentUser,
    currentEmployeeProfile,
    systemSettings,
    users,
    fieldForceReps,
    refreshFieldForce,
    departments,
    officeLocations,
    salaryStructures,
    salaryStructuresDbStatus,
    refreshSalaryStructures,
    syncSalaryStructuresToSupabase,
    attendanceRecords,
    attendanceDbStatus,
    syncAttendanceToSupabase,
    rejectedAttendanceAttempts,
    leaveRecords,
    advanceLoans,
    advanceLoansDbStatus,
    syncAdvanceLoansToSupabase,
    bonusRecords,
    monthlyPayrollRuns,
    salaryPaymentRecords,
    payrollSettings,
    addSalaryStructure,
    updateSalaryStructure,
    markAttendance,
    bulkMarkAttendance,
    getEmployeeAttendanceSummary,
    applyLeave,
    approveLeave,
    rejectLeave,
    getEmployeeLeaveBalance,
    applyAdvanceLoan,
    approveAdvanceLoan,
    earlySettleAdvanceLoan,
    addBonusRecord,
    approveBonusRecord,
    generateMonthlySalaryRun,
    finalizeMonthlyPayrollRun,
    deleteMonthlyPayrollRun,
    recordSalaryPayment,
    payrollSettingsDbStatus,
    syncPayrollSettingsToSupabase,
    updatePayrollSettings,
    hasPageAccess,
    hasPageAction,
  } = useERP();

  // Granular User & Permission flags for Payroll & Human Resources ('payroll')
  const payrollPagePerms = useMemo(
    () => resolvePayrollPagePermissions(currentUser),
    [currentUser]
  );
  const firstPermittedTab = useMemo(
    () => getFirstPermittedPayrollTab(currentUser),
    [currentUser]
  );
  const canViewPayroll =
    hasPageAccess('payroll') && payrollPagePerms.view && firstPermittedTab !== null;
  const canCreatePayroll = hasPageAction('payroll', 'create_payroll');
  const canApprovePayroll = hasPageAction('payroll', 'approve_payroll');
  const canApproveLeave = hasPageAction('payroll', 'approve_leave');
  const canApproveAdvanceLoan = hasPageAction('payroll', 'approve_advance_loan');
  const canDisbursePayroll = hasPageAction('payroll', 'disburse');
  const canEditSalaryStructure = hasPageAction('payroll', 'edit_salary_structure');
  const canExportPayroll = hasPageAction('payroll', 'export');
  const canConfigurePayrollRules = canCreatePayroll || canApprovePayroll;
  const canManageOvertimePurposes =
    canConfigurePayrollRules || hasPageAction('overtime-management', 'configure_policy');
  const canAccessOvertimeHub = hasPageAccess('overtime-management');
  const canManageAllLeaves =
    currentUser?.role === 'Super Admin' ||
    canCreatePayroll ||
    canApproveLeave ||
    canApprovePayroll;
  const canSelectAnyLeaveEmployee =
    currentUser?.role === 'Super Admin' || canCreatePayroll;
  const canApplyLeave = canSelectAnyLeaveEmployee || payrollPagePerms.leaves;
  const isReadOnlyPayrollUser =
    !canCreatePayroll &&
    !canApprovePayroll &&
    !canApproveLeave &&
    !canApproveAdvanceLoan &&
    !canDisbursePayroll &&
    !canEditSalaryStructure &&
    !canExportPayroll &&
    !payrollPagePerms.leaves;

  const urlRouteInfo =
    typeof window !== 'undefined'
      ? parsePayrollTabFromRoute(
          window.location.pathname,
          window.location.search,
          window.location.hash
        )
      : { tab: null, isExplicit: false };
  const requestedExplicitTab =
    initialRouteTab || (urlRouteInfo.isExplicit ? urlRouteInfo.tab : null);
  const hasExplicitTabRequest = Boolean(isExplicitSubRoute || urlRouteInfo.isExplicit);
  const isUnknownExplicitTab = hasExplicitTabRequest && !requestedExplicitTab;

  // Active top-level Tab
  const [activeTab, setActiveTab] = useState<PayrollTab>(
    () => requestedExplicitTab || firstPermittedTab || 'dashboard'
  );

  useEffect(() => {
    if (initialRouteTab) {
      setActiveTab(initialRouteTab);
      return;
    }
    if (!hasExplicitTabRequest && firstPermittedTab && !payrollPagePerms[activeTab]) {
      setActiveTab(firstPermittedTab);
    }
  }, [initialRouteTab, hasExplicitTabRequest, firstPermittedTab, payrollPagePerms, activeTab]);

  useEffect(() => {
    if (!isUnknownExplicitTab && activeTab === 'salary_structure' && payrollPagePerms.salary_structure) {
      void Promise.allSettled([
        refreshFieldForce?.(),
        refreshSalaryStructures(),
      ]);
    }
  }, [activeTab, isUnknownExplicitTab, payrollPagePerms.salary_structure]);

  const handleSelectTab = (tab: PayrollTab) => {
    if (!payrollPagePerms[tab]) return;
    setActiveTab(tab);
    if (onSyncRouteTab) {
      onSyncRouteTab(tab);
    } else if (typeof window !== 'undefined') {
      const nextPath = payrollTabToPathname(tab);
      if (window.location.pathname !== nextPath) {
        window.history.replaceState({ module: `payroll-${tab}` }, '', nextPath);
      }
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthIso = todayIso.slice(0, 7);

  // Month-Year selection across the module
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(currentMonthIso);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('All');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Attendance Report & GPS Audit Filter States
  const currentMonthStartIso = `${currentMonthIso}-01`;
  const [attSubView, setAttSubView] = useState<'report' | 'daily_grid' | 'daily_wages_bill'>('report');
  const [attPeriodMode, setAttPeriodMode] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [attDateFrom, setAttDateFrom] = useState<string>(currentMonthStartIso);
  const [attDateTo, setAttDateTo] = useState<string>(todayIso);
  const [attSearchQuery, setAttSearchQuery] = useState<string>('');
  const [attDeptFilter, setAttDeptFilter] = useState<string>('All');
  const [attActionTypeFilter, setAttActionTypeFilter] = useState<string>('All');
  const [attOfficeFilter, setAttOfficeFilter] = useState<string>('All');
  const [attStatusFilter, setAttStatusFilter] = useState<string>('All');
  const [historyEmployee, setHistoryEmployee] = useState<FieldForceRep | null>(null);
  const [attendanceCardModal, setAttendanceCardModal] = useState<{
    isOpen: boolean;
    employeeId?: string;
    monthYear?: string;
    autoDownloadPdf?: boolean;
  }>({ isOpen: false });
  const [dailyGridDrafts, setDailyGridDrafts] = useState<
    Record<string, { inTime: string; outTime: string }>
  >({});
  const [savingAttendanceRowId, setSavingAttendanceRowId] = useState<string | null>(null);
  const [isBulkSavingAttendance, setIsBulkSavingAttendance] = useState<boolean>(false);
  const [isSyncingAttendance, setIsSyncingAttendance] = useState<boolean>(false);
  const [copiedAttendanceSql, setCopiedAttendanceSql] = useState<boolean>(false);
  const [attendanceFeedback, setAttendanceFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    sqlFix?: string;
  } | null>(null);
  const [hasUnsavedSettingsChanges, setHasUnsavedSettingsChanges] = useState<boolean>(false);
  const [isSavingPayrollSettings, setIsSavingPayrollSettings] = useState<boolean>(false);
  const [isSyncingPayrollSettings, setIsSyncingPayrollSettings] = useState<boolean>(false);
  const [copiedSettingsSql, setCopiedSettingsSql] = useState<boolean>(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    sqlFix?: string;
  } | null>(null);
  const [newPurposeName, setNewPurposeName] = useState<string>('');
  const [editingPurposeId, setEditingPurposeId] = useState<string | null>(null);
  const [editingPurposeName, setEditingPurposeName] = useState<string>('');
  const [isSavingPurposes, setIsSavingPurposes] = useState<boolean>(false);
  const [purposeFeedback, setPurposeFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    standardWorkingDaysPerMonth: String(payrollSettings?.standardWorkingDaysPerMonth ?? 26),
    standardDailyHours: String(payrollSettings?.standardDailyHours ?? 8),
    pfEmployeeContributionPercent: String(
      payrollSettings?.pfEmployeeContributionPercent ??
        payrollSettings?.deductionRules?.pfEmployeeContributionPercent ??
        10
    ),
    shiftStartTime: payrollSettings?.shiftStartTime || DEFAULT_SHIFT_START_TIME,
    shiftEndTime: payrollSettings?.shiftEndTime || DEFAULT_SHIFT_END_TIME,
    lateGracePeriodMinutes: String(
      payrollSettings?.lateGracePeriodMinutes ?? DEFAULT_GRACE_PERIOD_MINUTES
    ),
    maxGpsAccuracyMeters: String(
      payrollSettings?.maxGpsAccuracyMeters ?? DEFAULT_MAX_GPS_ACCURACY_METERS
    ),
  });

  useEffect(() => {
    if (hasUnsavedSettingsChanges) return;
    setSettingsForm({
      standardWorkingDaysPerMonth: String(payrollSettings?.standardWorkingDaysPerMonth ?? 26),
      standardDailyHours: String(payrollSettings?.standardDailyHours ?? 8),
      pfEmployeeContributionPercent: String(
        payrollSettings?.pfEmployeeContributionPercent ??
          payrollSettings?.deductionRules?.pfEmployeeContributionPercent ??
          10
      ),
      shiftStartTime: payrollSettings?.shiftStartTime || DEFAULT_SHIFT_START_TIME,
      shiftEndTime: payrollSettings?.shiftEndTime || DEFAULT_SHIFT_END_TIME,
      lateGracePeriodMinutes: String(
        payrollSettings?.lateGracePeriodMinutes ?? DEFAULT_GRACE_PERIOD_MINUTES
      ),
      maxGpsAccuracyMeters: String(
        payrollSettings?.maxGpsAccuracyMeters ?? DEFAULT_MAX_GPS_ACCURACY_METERS
      ),
    });
  }, [payrollSettings, hasUnsavedSettingsChanges]);

  // Modals state
  const [showStructureModal, setShowStructureModal] = useState<boolean>(false);
  const [editingStructure, setEditingStructure] = useState<EmployeeSalaryStructure | null>(null);
  const [selectedEmployeeForStructure, setSelectedEmployeeForStructure] = useState<FieldForceRep | null>(null);
  const [isSavingStructure, setIsSavingStructure] = useState<boolean>(false);
  const [isSyncingStructures, setIsSyncingStructures] = useState<boolean>(false);
  const [isRefreshingStructures, setIsRefreshingStructures] = useState<boolean>(false);
  const [copiedStructureSql, setCopiedStructureSql] = useState<boolean>(false);
  const [structureFeedback, setStructureFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    sqlFix?: string;
  } | null>(null);
  const [salaryStructurePage, setSalaryStructurePage] = useState<number>(1);
  const [salaryStructureSearchQuery, setSalaryStructureSearchQuery] = useState<string>('');
  const SALARY_STRUCTURE_PAGE_SIZE = 10;

  const findSalaryStructureForEmployee = (emp: FieldForceRep): EmployeeSalaryStructure | undefined => {
    return salaryStructures.find(
      (s) =>
        s.employeeId === emp.id ||
        s.fieldForceId === emp.id ||
        (emp.code && s.employeeCode && s.employeeCode === emp.code)
    );
  };

  const supabaseProjMatch = getSupabaseUrl().match(/https:\/\/([^.]+)\.supabase\.co/i);
  const supabaseSqlEditorUrl = supabaseProjMatch
    ? `https://supabase.com/dashboard/project/${supabaseProjMatch[1]}/sql/new`
    : 'https://supabase.com/dashboard';

  const [showAttendanceModal, setShowAttendanceModal] = useState<boolean>(false);
  const [showBulkAttendanceModal, setShowBulkAttendanceModal] = useState<boolean>(false);
  const [showQrScannerModal, setShowQrScannerModal] = useState<boolean>(false);
  const [selectedDateForAtt, setSelectedDateForAtt] = useState<string>(todayIso);

  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [showLoanModal, setShowLoanModal] = useState<boolean>(false);
  const [viewingLoanSchedule, setViewingLoanSchedule] = useState<AdvanceLoanRecord | null>(null);
  const [settlingLoan, setSettlingLoan] = useState<AdvanceLoanRecord | null>(null);

  const [showBonusModal, setShowBonusModal] = useState<boolean>(false);

  const [showDisburseModal, setShowDisburseModal] = useState<boolean>(false);
  const [selectedRunItemForPayment, setSelectedRunItemForPayment] = useState<{ runId: string; item: MonthlySalarySheetItem } | null>(null);

  const [viewingPayslip, setViewingPayslip] = useState<{ run: MonthlyPayrollRun; item: MonthlySalarySheetItem } | null>(null);

  // Selected Report in Reports Tab
  const [selectedReportId, setSelectedReportId] = useState<string>('rep-register');

  // Form states for adding Salary Structure
  const [strBasic, setStrBasic] = useState<number>(0);
  const [strHouseRent, setStrHouseRent] = useState<number>(0);
  const [strMedical, setStrMedical] = useState<number>(0);
  const [strConveyance, setStrConveyance] = useState<number>(0);
  const [strMobile, setStrMobile] = useState<number>(0);
  const [strSpecial, setStrSpecial] = useState<number>(0);
  const [strOther, setStrOther] = useState<number>(0);
  const [strEffectiveFrom, setStrEffectiveFrom] = useState<string>(todayIso);
  const [strRevisionReason, setStrRevisionReason] = useState<string>('');

  // Form state for Leave Application
  const [leaveEmployeeId, setLeaveEmployeeId] = useState<string>('');
  const [leaveEmployeeDropdownOpen, setLeaveEmployeeDropdownOpen] = useState<boolean>(false);
  const [leaveEmployeeSearch, setLeaveEmployeeSearch] = useState<string>('');
  const leaveEmployeeDropdownRef = useRef<HTMLDivElement | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveType>('Casual Leave');
  const [leaveStartDate, setLeaveStartDate] = useState<string>(todayIso);
  const [leaveEndDate, setLeaveEndDate] = useState<string>(todayIso);
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveFormError, setLeaveFormError] = useState<string>('');
  const [leaveFeedback, setLeaveFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const ownLeaveEmployee = useMemo(() => {
    if (!currentUser) return undefined;
    if (currentEmployeeProfile?.employeeId) {
      const byProfile = fieldForceReps.find(
        (r) =>
          r.id === currentEmployeeProfile.employeeId ||
          (currentEmployeeProfile.employeeCode &&
            r.code &&
            r.code.trim().toLowerCase() === currentEmployeeProfile.employeeCode.trim().toLowerCase())
      );
      if (byProfile) return byProfile;
    }
    const uid = (currentUser.id || '').trim().toLowerCase();
    const uLogin = (currentUser.userId || '').trim().toLowerCase();
    const uEmail = (currentUser.email || '').trim().toLowerCase();
    const uName = (currentUser.name || '').trim().toLowerCase();
    return (
      fieldForceReps.find(
        (r) =>
          (r.userId && (r.userId.trim().toLowerCase() === uid || (uLogin && r.userId.trim().toLowerCase() === uLogin))) ||
          r.id.trim().toLowerCase() === uid
      ) ||
      (uEmail
        ? fieldForceReps.find((r) => r.email && r.email.trim().toLowerCase() === uEmail)
        : undefined) ||
      (uName
        ? fieldForceReps.find((r) => r.name && r.name.trim().toLowerCase() === uName)
        : undefined)
    );
  }, [currentUser, currentEmployeeProfile, fieldForceReps]);

  const selfLeaveProfile = useMemo(() => {
    if (ownLeaveEmployee) {
      return {
        id: ownLeaveEmployee.id,
        code: ownLeaveEmployee.code || ownLeaveEmployee.id,
        name: ownLeaveEmployee.name,
        designation: ownLeaveEmployee.designation || currentUser?.role || 'Employee',
        department: ownLeaveEmployee.department || currentUser?.department || 'Operations',
      };
    }
    if (!currentUser) return null;
    return {
      id: currentEmployeeProfile?.employeeId || currentUser.id,
      code:
        currentEmployeeProfile?.employeeCode ||
        currentUser.salesmanCode ||
        currentUser.userId ||
        currentUser.id,
      name: currentEmployeeProfile?.name || currentUser.name,
      designation: currentEmployeeProfile?.designation || currentUser.role || 'Employee',
      department: currentEmployeeProfile?.department || currentUser.department || 'Operations',
    };
  }, [ownLeaveEmployee, currentEmployeeProfile, currentUser]);

  const ownLeaveRecords = useMemo(() => {
    if (!currentUser) return [];
    const uid = (currentUser.id || '').trim().toLowerCase();
    const selfId = (selfLeaveProfile?.id || '').trim().toLowerCase();
    const selfCode = (selfLeaveProfile?.code || '').trim().toLowerCase();
    const selfName = (selfLeaveProfile?.name || currentUser.name || '').trim().toLowerCase();

    return leaveRecords.filter((l) => {
      if (l.userId && uid && l.userId.trim().toLowerCase() === uid) return true;
      const recEmpId = (l.employeeId || '').trim().toLowerCase();
      const recFfId = (l.fieldForceId || '').trim().toLowerCase();
      const recCode = (l.employeeCode || '').trim().toLowerCase();
      const recName = (l.employeeName || '').trim().toLowerCase();

      if (selfId && (recEmpId === selfId || recFfId === selfId)) return true;
      if (uid && (recEmpId === uid || recFfId === uid)) return true;
      if (selfCode && selfCode !== uid && recCode && recCode === selfCode) return true;
      if (!ownLeaveEmployee && (!recEmpId || recEmpId === uid) && selfName && recName === selfName) {
        return true;
      }
      return false;
    });
  }, [leaveRecords, currentUser, selfLeaveProfile, ownLeaveEmployee]);

  const currentLeaveYear = useMemo(
    () => Number((todayIso || '').slice(0, 4)) || new Date().getFullYear(),
    [todayIso]
  );

  const ownLeaveSummary = useMemo(() => {
    const yearStr = String(currentLeaveYear);
    const yearRecords = ownLeaveRecords.filter((l) => {
      const dateStr = (l.startDate || l.appliedAt || '').trim();
      return !dateStr || dateStr.startsWith(yearStr);
    });

    const q = payrollSettings?.leaveQuotas || {
      annualLeave: 14,
      casualLeave: 10,
      sickLeave: 14,
      maternityLeave: 112,
    };

    const getDays = (l: (typeof yearRecords)[number]) =>
      Number(l.daysCount ?? l.totalDays ?? 0) || 0;

    const calcType = (leaveTypeName: LeaveType, entitled: number) => {
      const matching = yearRecords.filter((l) => l.leaveType === leaveTypeName);
      const availed = matching
        .filter((l) => l.status === 'Approved')
        .reduce((sum, l) => sum + getDays(l), 0);
      const pending = matching
        .filter((l) => l.status === 'Pending')
        .reduce((sum, l) => sum + getDays(l), 0);
      const balance = entitled > 0 ? Math.max(0, entitled - availed) : 0;
      return {
        leaveType: leaveTypeName,
        entitled,
        availed,
        pending,
        balance,
      };
    };

    const annual = calcType('Annual Leave', Number(q.annualLeave ?? 14));
    const casual = calcType('Casual Leave', Number(q.casualLeave ?? 10));
    const sick = calcType('Sick Leave', Number(q.sickLeave ?? 14));
    const maternity = calcType('Maternity Leave', Number(q.maternityLeave ?? 112));
    const unpaid = calcType('Unpaid Leave', 0);

    const regularEntitled = annual.entitled + casual.entitled + sick.entitled;
    const regularAvailed = annual.availed + casual.availed + sick.availed;
    const regularPending = annual.pending + casual.pending + sick.pending;
    const regularBalance = annual.balance + casual.balance + sick.balance;

    const totalPending =
      regularPending + maternity.pending + unpaid.pending;
    const pendingCount = yearRecords.filter((l) => l.status === 'Pending').length;
    const approvedCount = yearRecords.filter((l) => l.status === 'Approved').length;

    const rows = [
      annual,
      casual,
      sick,
      maternity,
      ...(unpaid.availed > 0 || unpaid.pending > 0 ? [unpaid] : []),
    ];

    return {
      rows,
      annual,
      casual,
      sick,
      maternity,
      unpaid,
      regularEntitled,
      regularAvailed,
      regularPending,
      regularBalance,
      totalPending,
      pendingCount,
      approvedCount,
    };
  }, [ownLeaveRecords, currentLeaveYear, payrollSettings]);

  const visibleLeaveRecords = useMemo(() => {
    if (canManageAllLeaves) return leaveRecords;
    return ownLeaveRecords;
  }, [canManageAllLeaves, leaveRecords, ownLeaveRecords]);

  useEffect(() => {
    if (!leaveEmployeeDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        leaveEmployeeDropdownRef.current &&
        !leaveEmployeeDropdownRef.current.contains(event.target as Node)
      ) {
        setLeaveEmployeeDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLeaveEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [leaveEmployeeDropdownOpen]);

  // Form state for Advance / Loan
  const [loanEmployeeId, setLoanEmployeeId] = useState<string>('');
  const [loanType, setLoanType] = useState<'Salary Advance' | 'Employee Loan'>('Employee Loan');
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [loanTenure, setLoanTenure] = useState<number>(1);
  const [loanStartMonth, setLoanStartMonth] = useState<string>(currentMonthIso);
  const [loanReason, setLoanReason] = useState<string>('');
  const [loanFormError, setLoanFormError] = useState<string>('');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState<boolean>(false);
  const [isSyncingLoans, setIsSyncingLoans] = useState<boolean>(false);
  const [copiedLoansSql, setCopiedLoansSql] = useState<boolean>(false);
  const [loanFeedback, setLoanFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    sqlFix?: string;
  } | null>(null);

  // Form state for Bonus
  const [bnsEmployeeId, setBnsEmployeeId] = useState<string>('');
  const [bnsType, setBnsType] = useState<'Festival Bonus' | 'Performance Bonus' | 'Sales Incentive'>('Festival Bonus');
  const [bnsAmount, setBnsAmount] = useState<number>(0);
  const [bnsMonthYear, setBnsMonthYear] = useState<string>(currentMonthIso);
  const [bnsRemarks, setBnsRemarks] = useState<string>('');

  // Form state for Disburse Payment
  const [payMethod, setPayMethod] = useState<'Bank Transfer' | 'Cash' | 'bKash' | 'Nagad'>('Bank Transfer');
  const [payBankName, setPayBankName] = useState<string>('');
  const [payRef, setPayRef] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(todayIso);

  const monthSelectorOptions = useMemo(() => {
    const monthsMap = new Map<string, string>();
    const now = new Date();
    for (let offset = 1; offset >= -5; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      monthsMap.set(val, label);
    }
    monthlyPayrollRuns.forEach((r) => {
      const m = r.monthYear || r.payrollMonth;
      if (m) {
        const [yr, mo] = m.split('-').map(Number);
        const d = yr && mo ? new Date(yr, mo - 1, 1) : new Date();
        const baseLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthsMap.set(m, `${baseLabel} (${r.status})`);
      }
    });
    return Array.from(monthsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, label]) => ({ value, label }));
  }, [monthlyPayrollRuns]);

  // Current Active Run for selectedMonthYear
  const currentMonthRun = useMemo(() => {
    return monthlyPayrollRuns.find((r) => (r.monthYear || r.payrollMonth) === selectedMonthYear);
  }, [monthlyPayrollRuns, selectedMonthYear]);

  // Unique departments (master Departments + employee assignments)
  const departmentOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const stripCode = (raw: string) => {
      const s = String(raw || '').trim();
      if (!s) return '';
      const matched = (departments || []).find((d) => {
        const c = String(d.code || '').trim();
        return (
          (d.name && d.name.toLowerCase() === s.toLowerCase()) ||
          (d.fullName && d.fullName.toLowerCase() === s.toLowerCase()) ||
          (c && d.name && `${c} - ${d.name}`.toLowerCase() === s.toLowerCase())
        );
      });
      if (matched?.name) return matched.name.trim();
      return s.replace(/^[A-Z]{1,6}-\d+\s*[-–—:]\s*/i, '').trim() || s;
    };
    const addDept = (raw?: string) => {
      const clean = stripCode(String(raw || ''));
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(clean);
      }
    };
    (departments || [])
      .filter((d) => !d.status || d.status.toLowerCase() === 'active')
      .forEach((d) => addDept(d.name || d.fullName));
    fieldForceReps.forEach((r) => {
      addDept(r.department);
      (r.departments || []).forEach(addDept);
    });
    return ['All', ...list];
  }, [departments, fieldForceReps]);

  const matchesAttDept = (
    deptVal?: string,
    deptList?: string[]
  ): boolean => {
    if (!attDeptFilter || attDeptFilter === 'All') return true;
    const target = attDeptFilter.trim().toLowerCase();
    const candidates = [deptVal, ...(deptList || [])].filter(Boolean) as string[];
    return candidates.some((c) => {
      const raw = c.trim().toLowerCase();
      const stripped = c.replace(/^[A-Z]{1,6}-\d+\s*[-–—:]\s*/i, '').trim().toLowerCase();
      return raw === target || stripped === target;
    });
  };

  // Unique employee categories
  const categoryOptions: string[] = [
    'All',
    'Office Employee',
    'Field Employee',
    'Factory Employee',
    'Production',
    'Warehouse Employee',
    'Management Employee',
  ];

  // Employee Action Types & offices for Attendance Report filters
  const actionTypeOptions = useMemo(() => {
    const set = new Set<string>([
      'Primary Order Booking',
      'Secondary Sales & Delivery',
      'Corporate Key Accounts',
      'Market Survey & Field Audit',
      'Supervisory Inspection',
      'Staff',
      'Worker',
    ]);
    fieldForceReps.forEach((r) => {
      if (r.actionType) set.add(r.actionType);
    });
    return ['All', ...Array.from(set)];
  }, [fieldForceReps]);

  const getEmployeeGeoConfig = (emp: FieldForceRep) =>
    resolveGeofenceConfigFromUser(
      findLinkedUserForEmployee(emp, users),
      officeLocations,
      payrollSettings,
      emp.branchWorkplace
    );

  const officeFilterOptions = useMemo(() => {
    const set = new Set<string>();
    officeLocations.forEach((o) => {
      if (o.name) set.add(o.name);
    });
    users.forEach((u) => {
      if (u.assignedOfficeName) set.add(u.assignedOfficeName);
    });
    fieldForceReps.forEach((r) => {
      const officeName = getEmployeeGeoConfig(r).assignedOfficeName;
      if (officeName) set.add(officeName);
    });
    return ['All', ...Array.from(set)];
  }, [officeLocations, users, fieldForceReps, payrollSettings]);

  const employeeLookupById = useMemo(() => {
    const map = new Map<string, FieldForceRep>();
    fieldForceReps.forEach((emp) => {
      map.set(emp.id, emp);
      if (emp.code) map.set(emp.code, emp);
    });
    return map;
  }, [fieldForceReps]);

  const applyAttendancePeriodPreset = (preset: 'daily' | 'weekly' | 'monthly') => {
    setAttPeriodMode(preset);
    if (preset === 'daily') {
      setAttDateFrom(selectedDateForAtt);
      setAttDateTo(selectedDateForAtt);
    } else if (preset === 'weekly') {
      const end = new Date(`${selectedDateForAtt}T00:00:00`);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      setAttDateFrom(start.toISOString().slice(0, 10));
      setAttDateTo(selectedDateForAtt);
    } else {
      const baseMonth = selectedDateForAtt.slice(0, 7);
      const [yr, mo] = baseMonth.split('-').map(Number);
      const lastDay = new Date(yr, mo, 0).getDate();
      setAttDateFrom(`${baseMonth}-01`);
      setAttDateTo(`${baseMonth}-${String(lastDay).padStart(2, '0')}`);
    }
  };

  const resolveRecordMeta = (rec: AttendanceRecord) => {
    const emp =
      employeeLookupById.get(rec.employeeId || rec.fieldForceId || '') ||
      employeeLookupById.get(rec.employeeCode || '');
    const officeName =
      rec.assignedOfficeName ||
      (emp ? getEmployeeGeoConfig(emp).assignedOfficeName : 'Head Office');
    const checkIn = rec.checkInTime || rec.inTime || '';
    const checkOut = rec.checkOutTime || rec.outTime || '';
    const workHrs =
      checkIn && checkOut
        ? calculateNetWorkingHours(checkIn, checkOut)
        : typeof rec.workHours === 'number'
        ? rec.workHours
        : 0;
    const lateMins = rec.lateDurationMinutes ?? rec.lateMinutes ?? 0;
    const checkInLoc =
      typeof rec.checkInLatitude === 'number' && typeof rec.checkInLongitude === 'number'
        ? `${rec.checkInLatitude.toFixed(5)}, ${rec.checkInLongitude.toFixed(5)}`
        : rec.checkInLocationText || '—';
    const checkOutLoc =
      typeof rec.checkOutLatitude === 'number' && typeof rec.checkOutLongitude === 'number'
        ? `${rec.checkOutLatitude.toFixed(5)}, ${rec.checkOutLongitude.toFixed(5)}`
        : rec.checkOutLocationText || '—';
    return {
      emp,
      employeeCode: rec.employeeCode || emp?.code || rec.employeeId || '—',
      employeeName: rec.employeeName || emp?.name || 'Unknown Employee',
      department: rec.department || emp?.department || 'Operations',
      designation: rec.designation || emp?.designation || 'Executive',
      actionType: emp?.actionType || '',
      assignedOffice: officeName,
      checkIn,
      checkOut,
      checkInLoc,
      checkOutLoc,
      workHours: workHrs,
      lateMinutes: lateMins,
      gpsStatus: rec.gpsValidationStatus || (typeof rec.checkInLatitude === 'number' ? 'Accepted' : 'Manual'),
    };
  };

  const filteredReportRecords = useMemo(() => {
    const q = attSearchQuery.trim().toLowerCase();
    return attendanceRecords
      .filter((rec) => {
        if (attDateFrom && rec.date < attDateFrom) return false;
        if (attDateTo && rec.date > attDateTo) return false;
        const meta = resolveRecordMeta(rec);
        if (q) {
          const hay = `${meta.employeeCode} ${meta.employeeName} ${meta.department} ${meta.assignedOffice}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (!matchesAttDept(meta.department, meta.emp?.departments)) return false;
        if (attActionTypeFilter !== 'All' && meta.actionType !== attActionTypeFilter) return false;
        if (attOfficeFilter !== 'All' && meta.assignedOffice !== attOfficeFilter) return false;
        if (attStatusFilter !== 'All') {
          if (attStatusFilter === 'Half Day') {
            if (rec.status !== 'Half Day' && rec.status !== 'Half-Day') return false;
          } else if (attStatusFilter === 'Leave') {
            if (rec.status !== 'Leave' && rec.status !== 'Paid Leave' && rec.status !== 'Unpaid Leave') return false;
          } else if (rec.status !== attStatusFilter) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        const ta = a.checkInTime || a.inTime || '';
        const tb = b.checkInTime || b.inTime || '';
        return tb.localeCompare(ta);
      });
  }, [
    attendanceRecords,
    attDateFrom,
    attDateTo,
    attSearchQuery,
    attDeptFilter,
    attActionTypeFilter,
    attOfficeFilter,
    attStatusFilter,
    employeeLookupById,
  ]);

  const filteredRejectedAttempts = useMemo(() => {
    const q = attSearchQuery.trim().toLowerCase();
    return rejectedAttendanceAttempts
      .filter((att) => {
        if (attDateFrom && att.attendanceDate < attDateFrom) return false;
        if (attDateTo && att.attendanceDate > attDateTo) return false;
        const emp =
          employeeLookupById.get(att.employeeId) ||
          employeeLookupById.get(att.employeeCode || '');
        const dept = att.department || emp?.department || 'Operations';
        const actionType = emp?.actionType || '';
        const office =
          att.assignedOfficeName ||
          (emp ? getEmployeeGeoConfig(emp).assignedOfficeName : 'Head Office');
        if (q) {
          const hay = `${att.employeeCode || ''} ${att.employeeName} ${dept} ${office} ${att.rejectionReason}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (attDeptFilter !== 'All' && dept !== attDeptFilter) return false;
        if (attActionTypeFilter !== 'All' && actionType !== attActionTypeFilter) return false;
        if (attOfficeFilter !== 'All' && office !== attOfficeFilter) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [
    rejectedAttendanceAttempts,
    attDateFrom,
    attDateTo,
    attSearchQuery,
    attDeptFilter,
    attActionTypeFilter,
    attOfficeFilter,
    employeeLookupById,
    users,
    officeLocations,
    payrollSettings,
  ]);

  const employeePeriodSummaries = useMemo(() => {
    const q = attSearchQuery.trim().toLowerCase();
    return fieldForceReps
      .filter((emp) => {
        const office = getEmployeeGeoConfig(emp).assignedOfficeName;
        if (q) {
          const hay = `${emp.code} ${emp.name} ${emp.department || ''} ${emp.employeeCategory || ''} ${emp.actionType || ''} ${office}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (!matchesAttDept(emp.department || 'Operations', emp.departments)) return false;
        if (attActionTypeFilter !== 'All' && (emp.actionType || '') !== attActionTypeFilter) return false;
        if (attOfficeFilter !== 'All' && office !== attOfficeFilter) return false;
        return true;
      })
      .map((emp) => {
        const empRecs = attendanceRecords.filter(
          (r) =>
            (r.employeeId === emp.id || r.fieldForceId === emp.id || (emp.code && r.employeeCode === emp.code)) &&
            (!attDateFrom || r.date >= attDateFrom) &&
            (!attDateTo || r.date <= attDateTo)
        );
        const empRejected = rejectedAttendanceAttempts.filter(
          (att) =>
            (att.employeeId === emp.id || (emp.code && att.employeeCode === emp.code)) &&
            (!attDateFrom || att.attendanceDate >= attDateFrom) &&
            (!attDateTo || att.attendanceDate <= attDateTo)
        );
        const presentDays = empRecs.filter((r) => r.status === 'Present').length;
        const lateDays = empRecs.filter((r) => r.status === 'Late').length;
        const halfDays = empRecs.filter((r) => r.status === 'Half Day' || r.status === 'Half-Day').length;
        const absentDays = empRecs.filter((r) => r.status === 'Absent').length;
        const leaveDays = empRecs.filter(
          (r) => r.status === 'Leave' || r.status === 'Paid Leave' || r.status === 'Unpaid Leave'
        ).length;
        const totalWorkHours = empRecs.reduce((sum, r) => sum + resolveRecordMeta(r).workHours, 0);
        const totalLateMinutes = empRecs.reduce((sum, r) => sum + (r.lateDurationMinutes ?? r.lateMinutes ?? 0), 0);
        return {
          emp,
          assignedOffice: getEmployeeGeoConfig(emp).assignedOfficeName,
          totalDays: empRecs.length,
          presentDays,
          lateDays,
          halfDays,
          absentDays,
          leaveDays,
          totalWorkHours: Math.round(totalWorkHours * 100) / 100,
          totalLateMinutes,
          rejectedCount: empRejected.length,
        };
      });
  }, [
    fieldForceReps,
    users,
    officeLocations,
    payrollSettings,
    attendanceRecords,
    rejectedAttendanceAttempts,
    attDateFrom,
    attDateTo,
    attSearchQuery,
    attDeptFilter,
    attActionTypeFilter,
    attOfficeFilter,
  ]);

  const attReportStats = useMemo(() => {
    const present = filteredReportRecords.filter((r) => r.status === 'Present').length;
    const late = filteredReportRecords.filter((r) => r.status === 'Late').length;
    const halfDay = filteredReportRecords.filter((r) => r.status === 'Half Day' || r.status === 'Half-Day').length;
    const absent = filteredReportRecords.filter((r) => r.status === 'Absent').length;
    const gpsVerified = filteredReportRecords.filter((r) => resolveRecordMeta(r).gpsStatus === 'Accepted').length;
    return {
      present,
      late,
      halfDay,
      absent,
      rejected: filteredRejectedAttempts.length,
      gpsVerified,
    };
  }, [filteredReportRecords, filteredRejectedAttempts]);

  const handleExportAttendanceExcel = () => {
    const detailRows = filteredReportRecords.map((rec) => {
      const meta = resolveRecordMeta(rec);
      return {
        'Employee ID': meta.employeeCode,
        'Employee Name': meta.employeeName,
        Department: meta.department,
        'Assigned Office': meta.assignedOffice,
        'Attendance Date': rec.date,
        'Check-In Time': formatTime12Hour(meta.checkIn) || '—',
        'Check-In Location': meta.checkInLoc,
        'Check-In Distance (Meters)':
          typeof rec.checkInDistanceMeters === 'number' ? Math.round(rec.checkInDistanceMeters * 10) / 10 : '—',
        'Check-Out Time': formatTime12Hour(meta.checkOut) || '—',
        'Check-Out Location': meta.checkOutLoc,
        'Check-Out Distance (Meters)':
          typeof rec.checkOutDistanceMeters === 'number' ? Math.round(rec.checkOutDistanceMeters * 10) / 10 : '—',
        'Total Working Hours': meta.workHours > 0 ? meta.workHours : 0,
        'Attendance Status': rec.status,
        'Late Duration': formatLateDuration(meta.lateMinutes),
        'GPS Validation Status': meta.gpsStatus,
      };
    });

    const summaryRows = employeePeriodSummaries.map((s) => ({
      'Employee ID': s.emp.code,
      'Employee Name': s.emp.name,
      Department: s.emp.department || 'Operations',
      Designation: s.emp.designation || 'Executive',
      'Assigned Office': s.assignedOffice,
      'Date Range': `${attDateFrom} to ${attDateTo}`,
      Present: s.presentDays,
      Late: s.lateDays,
      'Half Day': s.halfDays,
      Absent: s.absentDays,
      Leave: s.leaveDays,
      'Total Hours': s.totalWorkHours,
      'Total Late Duration': formatLateDuration(s.totalLateMinutes),
      'Rejected GPS Attempts': s.rejectedCount,
    }));

    const rejectedRows = filteredRejectedAttempts.map((att) => ({
      Date: att.attendanceDate,
      Time: formatTime12Hour(att.attemptTime) || att.attemptTime,
      'Employee ID': att.employeeCode || att.employeeId,
      'Employee Name': att.employeeName,
      Department: att.department || '—',
      'Assigned Office': att.assignedOfficeName || '—',
      'Attempt Type': att.attemptType,
      'Captured Location':
        typeof att.latitude === 'number' && typeof att.longitude === 'number'
          ? `${att.latitude.toFixed(5)}, ${att.longitude.toFixed(5)}`
          : 'Unavailable',
      'Distance (Meters)':
        typeof att.distanceMeters === 'number' ? Math.round(att.distanceMeters * 10) / 10 : '—',
      'Allowed Radius (Meters)': att.allowedRadiusMeters,
      'GPS Accuracy (Meters)':
        typeof att.gpsAccuracyMeters === 'number' ? Math.round(att.gpsAccuracyMeters) : '—',
      'GPS Validation Status': att.gpsValidationStatus,
      'Rejection Reason': att.rejectionReason,
    }));

    const wb = XLSX.utils.book_new();
    const wsDetail = XLSX.utils.json_to_sheet(
      detailRows.length > 0
        ? detailRows
        : [{ Notice: `No attendance records found for ${attDateFrom} to ${attDateTo}` }]
    );
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsRejected = XLSX.utils.json_to_sheet(
      rejectedRows.length > 0
        ? rejectedRows
        : [{ Notice: `No rejected GPS attempts recorded for ${attDateFrom} to ${attDateTo}` }]
    );
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Attendance Report');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Employee Summary');
    XLSX.utils.book_append_sheet(wb, wsRejected, 'Rejected GPS Attempts');
    XLSX.writeFile(wb, `Ensec_Attendance_Report_${attDateFrom}_to_${attDateTo}.xlsx`);
  };

  const salaryStructurePagination = useMemo(() => {
    const q = salaryStructureSearchQuery.trim().toLowerCase();
    const filteredEmployees = !q
      ? fieldForceReps
      : fieldForceReps.filter((emp) => {
          const name = (emp.name || '').toLowerCase();
          const code = (emp.code || '').toLowerCase();
          const dept = (emp.department || '').toLowerCase();
          const desig = (emp.designation || '').toLowerCase();
          const cat = (emp.employeeCategory || '').toLowerCase();
          const phone = (emp.mobileNumber || '').toLowerCase();
          return (
            name.includes(q) ||
            code.includes(q) ||
            dept.includes(q) ||
            desig.includes(q) ||
            cat.includes(q) ||
            phone.includes(q)
          );
        });

    const totalEmployees = filteredEmployees.length;
    const totalPages = Math.max(1, Math.ceil(totalEmployees / SALARY_STRUCTURE_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, salaryStructurePage), totalPages);
    const startIndex = (safePage - 1) * SALARY_STRUCTURE_PAGE_SIZE;
    const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + SALARY_STRUCTURE_PAGE_SIZE);
    const startRecord = totalEmployees === 0 ? 0 : startIndex + 1;
    const endRecord = Math.min(safePage * SALARY_STRUCTURE_PAGE_SIZE, totalEmployees);

    const pageNumbers: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else if (safePage <= 4) {
      for (let i = 1; i <= 5; i++) pageNumbers.push(i);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    } else if (safePage >= totalPages - 3) {
      pageNumbers.push(1);
      pageNumbers.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(1);
      pageNumbers.push('...');
      pageNumbers.push(safePage - 1);
      pageNumbers.push(safePage);
      pageNumbers.push(safePage + 1);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    }

    return {
      totalEmployees,
      totalPages,
      safePage,
      paginatedEmployees,
      startRecord,
      endRecord,
      pageNumbers,
    };
  }, [fieldForceReps, salaryStructurePage, salaryStructureSearchQuery]);

  useEffect(() => {
    if (salaryStructurePage > salaryStructurePagination.totalPages) {
      setSalaryStructurePage(salaryStructurePagination.totalPages);
    }
  }, [salaryStructurePage, salaryStructurePagination.totalPages]);

  // ==========================================
  // SECTION 1: DASHBOARD METRICS & CALCULATIONS
  // ==========================================
  const dashboardMetrics = useMemo(() => {
    const totalStaff = fieldForceReps.filter((r) => r.isActive !== false).length;
    const run = currentMonthRun;

    const totalCost = Number(run?.totalGrossBDT ?? run?.totalGrossSalaryBDT ?? 0);
    const totalNetPayable = Number(run?.totalNetBDT ?? run?.totalNetPayableBDT ?? 0);
    const totalDeductions = Number(run?.totalDeductionsBDT ?? 0);
    const totalOvertime = Number(run?.totalOvertimeBDT ?? 0);
    const totalBonuses = Number(run?.totalBonusBDT ?? run?.totalBonusesBDT ?? 0);
    const totalLoanDeductions = Number(run?.totalLoanDeductionsBDT ?? 0);
    const totalPF = Number(run?.totalPFDeductionsBDT ?? 0);
    const totalTax = Number(run?.totalTaxDeductionsBDT ?? 0);

    let totalBasic = 0;
    let totalAllowances = 0;
    let paidAmount = 0;
    let unpaidAmount = 0;

    if (run && run.items) {
      run.items.forEach((it) => {
        totalBasic += Number(it.basicSalaryBDT || 0);
        totalAllowances +=
          Number(it.houseRentBDT || 0) +
          Number(it.medicalAllowanceBDT || 0) +
          Number(it.conveyanceAllowanceBDT || 0) +
          Number(it.mobileAllowanceBDT || 0) +
          Number(it.specialAllowanceBDT || 0) +
          Number(it.foodAllowanceBDT || 0) +
          Number(it.otherAllowancesBDT || 0);

        const net = Number(it.netSalaryBDT ?? it.netPayableBDT ?? 0);
        if (it.paymentStatus === 'Paid') {
          paidAmount += net;
        } else {
          unpaidAmount += net;
        }
      });
    }

    const activeLoansTotal = advanceLoans
      .filter((l) => l.status === 'Approved' || l.status === 'Active')
      .reduce((s, l) => s + Number(l.remainingAmountBDT ?? l.remainingBalanceBDT ?? 0), 0);

    return {
      totalStaff,
      totalCost,
      totalNetPayable,
      totalDeductions,
      totalBasic,
      totalAllowances,
      totalOvertime,
      totalBonuses,
      totalLoanDeductions,
      totalPF,
      totalTax,
      paidAmount,
      unpaidAmount,
      activeLoansTotal,
      isFinalized: run?.status === 'Finalized' || run?.status === 'Paid',
    };
  }, [fieldForceReps, currentMonthRun, advanceLoans]);

  // Visual Breakdown: Department-wise Payroll Cost
  const deptCostBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    if (currentMonthRun && currentMonthRun.items) {
      currentMonthRun.items.forEach((it) => {
        const d = it.department || 'Operations';
        const cost = Number(it.totalGrossEarningsBDT ?? it.grossSalaryBDT ?? 0);
        map.set(d, (map.get(d) || 0) + cost);
      });
    }
    return Array.from(map.entries()).map(([dept, cost]) => ({ dept, cost }));
  }, [currentMonthRun]);

  // Visual Breakdown: Employee Category Breakdown
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; cost: number }>();
    if (currentMonthRun && currentMonthRun.items) {
      currentMonthRun.items.forEach((it) => {
        const cat = it.employeeCategory || 'Office Employee';
        const cur = map.get(cat) || { count: 0, cost: 0 };
        const cost = Number(it.totalGrossEarningsBDT ?? it.grossSalaryBDT ?? 0);
        map.set(cat, { count: cur.count + 1, cost: cur.cost + cost });
      });
    }
    return Array.from(map.entries()).map(([category, val]) => ({ category, ...val }));
  }, [currentMonthRun]);

  // Convert Number to BDT in Words for Payslip
  const numberToWordsBDT = (amount: number): string => {
    if (amount <= 0) return 'Zero Taka Only';
    const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teen = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const formatHundreds = (n: number): string => {
      let str = '';
      if (n > 99) {
        str += single[Math.floor(n / 100)] + ' Hundred ';
        n %= 100;
      }
      if (n > 19) {
        str += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
      }
      if (n > 9) {
        str += teen[n - 10] + ' ';
        n = 0;
      }
      if (n > 0) {
        str += single[n] + ' ';
      }
      return str.trim();
    };

    let words = '';
    const crore = Math.floor(amount / 10000000);
    amount %= 10000000;
    const lakh = Math.floor(amount / 100000);
    amount %= 100000;
    const thousand = Math.floor(amount / 1000);
    amount %= 1000;
    const rem = amount;

    if (crore > 0) words += `${formatHundreds(crore)} Crore `;
    if (lakh > 0) words += `${formatHundreds(lakh)} Lakh `;
    if (thousand > 0) words += `${formatHundreds(thousand)} Thousand `;
    if (rem > 0) words += `${formatHundreds(rem)} `;

    return `Taka ${words.trim()} Only`;
  };

  if (!canViewPayroll) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 max-w-xl mx-auto mt-10">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Access Restricted — Payroll & Human Resources
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Your account does not currently have the <b>View Payroll & Staff</b> permission. Contact your Super Admin to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-16">
      {/* ========================================== */}
      {/* HEADER & MODULE NAVIGATION BAR */}
      {/* ========================================== */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Corporate Payroll & Compensation Engine
                </h1>
                {isReadOnlyPayrollUser && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    <Lock className="w-3 h-3" />
                    Read-Only Access
                  </span>
                )}
              </div>
            
            </div>
          </div>

          {/* Month-Year Selector & Quick Action */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <select
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
                className="bg-transparent border-none text-slate-800 dark:text-slate-200 font-bold focus:outline-none cursor-pointer"
              >
                {monthSelectorOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {canCreatePayroll && (
              <button
                onClick={() => {
                  const runId = generateMonthlySalaryRun(selectedMonthYear);
                  if (runId && payrollPagePerms.processing) {
                    handleSelectTab('processing');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Process {selectedMonthYear} Payroll</span>
              </button>
            )}
          </div>
        </div>

        {/* 12 Section Tabs Navigation (Filtered by Page-Wise Permissions) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-slate-100 dark:border-slate-800 pt-3 scrollbar-none">
          {[
            { id: 'dashboard' as PayrollTab, label: '1. Dashboard', icon: BarChart3 },
            { id: 'salary_structure' as PayrollTab, label: '2. Salary Structure', icon: Layers },
            { id: 'attendance' as PayrollTab, label: '3. Attendance', icon: Clock },
            { id: 'leaves' as PayrollTab, label: '4. Leaves', icon: Calendar },
            { id: 'loans' as PayrollTab, label: '5. Advances & Loans', icon: Receipt },
            { id: 'bonuses' as PayrollTab, label: '6. Bonuses & Incentives', icon: Gift },
            { id: 'processing' as PayrollTab, label: '7. Monthly Run', icon: RotateCcw },
            { id: 'salary_sheets' as PayrollTab, label: '8. Salary Sheets', icon: FileText },
            { id: 'payments' as PayrollTab, label: '9. Disbursements', icon: CreditCard },
            { id: 'payslips' as PayrollTab, label: '10. Payslips', icon: Printer },
            { id: 'reports' as PayrollTab, label: '11. Reports (13)', icon: PieChart },
            { id: 'settings' as PayrollTab, label: '12. Settings', icon: Settings },
          ]
            .filter((tab) => payrollPagePerms[tab.id])
            .map((tab) => {
              const Icon = tab.icon;
              const isCurrent = !isUnknownExplicitTab && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
        </div>
      </div>

      {(isUnknownExplicitTab || !payrollPagePerms[activeTab]) && (
        <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 text-center space-y-3 max-w-xl mx-auto mt-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Payroll &amp; HR Page Access Restricted
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Your account does not have permission to access{' '}
            <b>
              {isUnknownExplicitTab
                ? 'the requested Payroll & HR page'
                : PAYROLL_SUBPAGE_DEFS.find((d) => d.tab === activeTab)?.label || activeTab}
            </b>
            . Contact your Super Admin to enable this page permission under User &amp; Permission.
          </p>
          {firstPermittedTab && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleSelectTab(firstPermittedTab)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Go to{' '}
                {PAYROLL_SUBPAGE_DEFS.find((d) => d.tab === firstPermittedTab)?.label ||
                  'Permitted Page'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: PAYROLL DASHBOARD                                              */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'dashboard' && payrollPagePerms.dashboard && (
        <div className="space-y-6">
          {/* 12 Key Performance Indicator Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {/* 1. Total Cost */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Gross Payroll Cost
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                ৳ {(dashboardMetrics.totalCost || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-blue-600 font-semibold block mt-1">
                Month: {selectedMonthYear}
              </span>
            </div>

            {/* 2. Basic Salary */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Basic Salaries
              </span>
              <div className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">
                ৳ {(dashboardMetrics.totalBasic || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Core Base Pay</span>
            </div>

            {/* 3. Allowances */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Allowances Total
              </span>
              <div className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">
                ৳ {(dashboardMetrics.totalAllowances || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">House, Medical, Conveyance</span>
            </div>

            {/* 4. Overtime Cost */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Overtime Cost
              </span>
              <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                ৳ {(dashboardMetrics.totalOvertime || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Factory & Plant Extended</span>
            </div>

            {/* 5. Bonuses & Incentives */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Bonuses & Incentives
              </span>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                ৳ {(dashboardMetrics.totalBonuses || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-emerald-600 block mt-1">Festival + Sales Commission</span>
            </div>

            {/* 6. Total Deductions */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Deductions
              </span>
              <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                ৳ {(dashboardMetrics.totalDeductions || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Attendance, Loans, PF, Tax</span>
            </div>

            {/* 7. Net Salary Payable */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Net Salary Payable
              </span>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                ৳ {(dashboardMetrics.totalNetPayable || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-emerald-600 font-semibold block mt-1">
                After All Deductions
              </span>
            </div>

            {/* 8. Disbursed / Paid */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Paid Salaries
              </span>
              <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
                ৳ {(dashboardMetrics.paidAmount || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Bank Transfer & Cash</span>
            </div>

            {/* 9. Unpaid / Pending */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Pending Disbursement
              </span>
              <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
                ৳ {(dashboardMetrics.unpaidAmount || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-amber-600 block mt-1">Ready for Bank EFT</span>
            </div>

            {/* 10. Processed Staff */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Active Employees
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {dashboardMetrics.totalStaff || 0}{' '}
                <span className="text-xs font-normal text-slate-500">Personnel</span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">100% on Active Payroll</span>
            </div>

            {/* 11. Active Loans Outstanding */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Active Staff Loans
              </span>
              <div className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">
                ৳ {(dashboardMetrics.activeLoansTotal || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                Deducted in Month: ৳{(dashboardMetrics.totalLoanDeductions || 0).toLocaleString()}
              </span>
            </div>

            {/* 12. PF Accrued */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Provident Fund & Tax
              </span>
              <div className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">
                ৳ {((dashboardMetrics.totalPF || 0) + (dashboardMetrics.totalTax || 0)).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                PF: ৳{(dashboardMetrics.totalPF || 0).toLocaleString()} | Tax: ৳{(dashboardMetrics.totalTax || 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* 5 Meaningful Visual Breakdown Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Visual 1: Department-wise Payroll Cost */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Department-wise Payroll Cost
                </h3>
                <Building className="w-4 h-4 text-blue-600" />
              </div>
              <div className="space-y-2.5 pt-1">
                {deptCostBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No payroll cost recorded for {selectedMonthYear}.</p>
                ) : (
                  deptCostBreakdown.map((item) => {
                    const pct = Math.round((item.cost / (dashboardMetrics.totalCost || 1)) * 100);
                    return (
                      <div key={item.dept} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {item.dept}
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            ৳ {(item.cost || 0).toLocaleString()}{' '}
                            <span className="text-[10px] text-slate-400">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Visual 2: Category Breakdown */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Employee Category Distribution
                </h3>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="space-y-2.5 pt-1">
                {categoryBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No payroll distribution data for {selectedMonthYear}.</p>
                ) : (
                  categoryBreakdown.map((cat) => {
                    const pct = Math.round((cat.cost / (dashboardMetrics.totalCost || 1)) * 100);
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {cat.category}{' '}
                            <span className="text-[10px] text-slate-400">({cat.count} staff)</span>
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            ৳ {(cat.cost || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Visual 3: Earnings vs Deductions Breakdown */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Earnings vs Deductions Breakdown
                </h3>
                <Percent className="w-4 h-4 text-rose-600" />
              </div>
              <div className="space-y-2 pt-1 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Basic Pay</span>
                  <span className="font-bold">৳ {(dashboardMetrics.totalBasic || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Total Allowances</span>
                  <span className="font-bold">৳ {(dashboardMetrics.totalAllowances || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Overtime & Bonuses</span>
                  <span className="font-bold text-emerald-600">
                    ৳ {((dashboardMetrics.totalOvertime || 0) + (dashboardMetrics.totalBonuses || 0)).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 font-semibold border border-rose-100 dark:border-rose-900/40">
                  <span>Withholding Deductions</span>
                  <span>- ৳ {(dashboardMetrics.totalDeductions || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-black border border-emerald-200 dark:border-emerald-800">
                  <span>Net Disbursable</span>
                  <span>৳ {(dashboardMetrics.totalNetPayable || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Payroll & Loan Activities */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Recent Payroll & Double-Entry Accounting Events</span>
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {salaryPaymentRecords.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No salary disbursement events recorded yet.</p>
              ) : (
                salaryPaymentRecords.slice(0, 5).map((pay) => (
                  <div key={pay.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                        PAID
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {pay.employeeName} ({pay.employeeCode})
                        </span>
                        <span className="text-slate-400 text-[11px] block">
                          Method: {pay.paymentMethod} • Ref: {pay.transactionReference} • {pay.paymentDate}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        ৳ {(pay.amountBDT || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-emerald-600 block font-semibold">Disbursed</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: SALARY STRUCTURE MANAGEMENT                                    */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'salary_structure' && payrollPagePerms.salary_structure && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Employee Salary Structure Master
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {salaryStructuresDbStatus.synced ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-bold">
                    <Database className="w-3 h-3" />
                    Supabase Synced
                  </span>
                ) : salaryStructuresDbStatus.status !== 'unknown' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 text-[10px] font-bold">
                    <Database className="w-3 h-3" />
                    {salaryStructuresDbStatus.status === 'rls_blocked'
                      ? 'Supabase RLS Blocked'
                      : salaryStructuresDbStatus.status === 'table_missing'
                      ? 'Supabase Table Missing'
                      : 'Supabase Sync Needed'}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={isRefreshingStructures}
                  onClick={async () => {
                    setIsRefreshingStructures(true);
                    setStructureFeedback(null);
                    try {
                      await Promise.all([
                        refreshFieldForce?.(),
                        refreshSalaryStructures(),
                      ]);
                      setStructureFeedback({
                        type: 'success',
                        message: 'Salary structures refreshed from Supabase.',
                      });
                    } catch (err: any) {
                      setStructureFeedback({
                        type: 'error',
                        message: err?.message || 'Failed to refresh salary structures from Supabase.',
                      });
                    } finally {
                      setIsRefreshingStructures(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors disabled:opacity-50"
                >
                  <RotateCcw className={`w-3 h-3 ${isRefreshingStructures ? 'animate-spin' : ''}`} />
                  <span>{isRefreshingStructures ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                {canEditSalaryStructure && (
                  <button
                    type="button"
                    disabled={isSyncingStructures}
                    onClick={async () => {
                      setIsSyncingStructures(true);
                      setStructureFeedback(null);
                      const res = await syncSalaryStructuresToSupabase();
                      setIsSyncingStructures(false);
                      if (res.success) {
                        setStructureFeedback({
                          type: 'success',
                          message:
                            res.syncedCount > 0
                              ? `Successfully synced ${res.syncedCount} salary structure(s) to Supabase.`
                              : 'Supabase employee_salary_structures connection verified and ready.',
                        });
                      } else {
                        setStructureFeedback({
                          type: 'warning',
                          message:
                            res.error ||
                            'Could not save salary structures to Supabase. Run the SQL policy below in Supabase SQL Editor.',
                          sqlFix: res.sqlFix || SALARY_STRUCTURES_TABLE_SQL,
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingStructures ? 'animate-spin' : ''}`} />
                    <span>{isSyncingStructures ? 'Syncing...' : 'Sync to Supabase'}</span>
                  </button>
                )}
                <span className="text-xs text-slate-500">
                  Configured: <b>{salaryStructures.length}</b> of {fieldForceReps.length}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search employee salary structure"
                  value={salaryStructureSearchQuery}
                  onChange={(e) => {
                    setSalaryStructureSearchQuery(e.target.value);
                    setSalaryStructurePage(1);
                  }}
                  placeholder="Search Employee Name, ID, Dept, or Designation..."
                  className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                {salaryStructureSearchQuery && (
                  <button
                    type="button"
                    aria-label="Clear employee search"
                    onClick={() => {
                      setSalaryStructureSearchQuery('');
                      setSalaryStructurePage(1);
                    }}
                    className="absolute right-2.5 top-2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {salaryStructureSearchQuery.trim() && (
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Found <b>{salaryStructurePagination.totalEmployees}</b> matching employee
                  {salaryStructurePagination.totalEmployees === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          {structureFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                structureFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : structureFeedback.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {structureFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                )}
                <span className="font-medium leading-relaxed">{structureFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setStructureFeedback(null)}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {canEditSalaryStructure &&
            !salaryStructuresDbStatus.synced &&
            (salaryStructuresDbStatus.status === 'rls_blocked' ||
              salaryStructuresDbStatus.status === 'table_missing' ||
              salaryStructuresDbStatus.status === 'error' ||
              Boolean(structureFeedback?.sqlFix)) && (
              <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Supabase Permission / Table Setup Needed for Salary Structures
                      </div>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                        {salaryStructuresDbStatus.error ||
                          structureFeedback?.message ||
                          'Supabase blocked writing to public.employee_salary_structures.'}{' '}
                        Run the SQL script below once in Supabase SQL Editor, then click{' '}
                        <b>Sync to Supabase</b>.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      One-Time Supabase SQL Fix (RLS Policy + Table)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              salaryStructuresDbStatus.sqlFix ||
                                structureFeedback?.sqlFix ||
                                SALARY_STRUCTURES_TABLE_SQL
                            );
                            setCopiedStructureSql(true);
                            setTimeout(() => setCopiedStructureSql(false), 2500);
                          } catch {}
                        }}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        {copiedStructureSql ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy SQL</span>
                          </>
                        )}
                      </button>
                      <a
                        href={supabaseSqlEditorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        <span>Open SQL Editor</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-40 leading-relaxed border border-slate-800">
                    {salaryStructuresDbStatus.sqlFix ||
                      structureFeedback?.sqlFix ||
                      SALARY_STRUCTURES_TABLE_SQL}
                  </pre>
                </div>
              </div>
            )}

          {/* Salary Structure Table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Category / Dept</th>
                    <th className="py-3 px-4 text-right">Basic Pay</th>
                    <th className="py-3 px-4 text-right">House Rent (50%)</th>
                    <th className="py-3 px-4 text-right">Medical (10%)</th>
                    <th className="py-3 px-4 text-right">Conveyance</th>
                    <th className="py-3 px-4 text-right">Mobile</th>
                    <th className="py-3 px-4 text-right font-black">Gross Base</th>
                    <th className="py-3 px-4 text-center">Revisions</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salaryStructurePagination.paginatedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-500 dark:text-slate-400">
                        {salaryStructureSearchQuery.trim() ? (
                          <div className="flex flex-col items-center gap-2">
                            <span>
                              No employees found matching &ldquo;{salaryStructureSearchQuery.trim()}&rdquo;.
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSalaryStructureSearchQuery('');
                                setSalaryStructurePage(1);
                              }}
                              className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 text-[11px] font-semibold"
                            >
                              Clear Search
                            </button>
                          </div>
                        ) : (
                          'No employees found.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    salaryStructurePagination.paginatedEmployees.map((emp) => {
                      const str = findSalaryStructureForEmployee(emp);
                      const basic = str?.basicSalaryBDT ?? emp.basicSalaryBDT ?? 0;
                      const house = str?.houseRentBDT ?? Math.round(basic * 0.5);
                      const med = str?.medicalAllowanceBDT ?? Math.round(basic * 0.1);
                      const conv = str?.conveyanceAllowanceBDT ?? emp.conveyanceBDT ?? 0;
                      const mob = str?.mobileAllowanceBDT ?? emp.mobileAllowanceBDT ?? 0;
                      const spec = str?.specialAllowanceBDT ?? 0;
                      const other = str?.otherAllowancesBDT ?? 0;
                      const gross = basic + house + med + conv + mob + spec + other;

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{emp.name}</div>
                            <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                              {emp.code}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-700 dark:text-slate-300 block">
                              {emp.designation}
                            </span>
                            <span className="text-[10px] text-slate-400">{emp.department || 'Operations'}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold">
                            ৳ {basic.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                            ৳ {house.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                            ৳ {med.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                            ৳ {conv.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                            ৳ {mob.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-white">
                            ৳ {gross.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {str ? str.history?.length || 1 : 0} records
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {canEditSalaryStructure ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEmployeeForStructure(emp);
                                  if (str) {
                                    setEditingStructure(str);
                                    setStrBasic(str.basicSalaryBDT ?? 0);
                                    setStrHouseRent(str.houseRentBDT ?? 0);
                                    setStrMedical(str.medicalAllowanceBDT ?? 0);
                                    setStrConveyance(str.conveyanceAllowanceBDT ?? 0);
                                    setStrMobile(str.mobileAllowanceBDT ?? 0);
                                    setStrSpecial(str.specialAllowanceBDT ?? 0);
                                    setStrOther(str.otherAllowancesBDT ?? 0);
                                    setStrEffectiveFrom(str.effectiveFrom || new Date().toISOString().slice(0, 10));
                                  } else {
                                    const defaultBasic = emp.basicSalaryBDT ?? 0;
                                    setEditingStructure(null);
                                    setStrBasic(defaultBasic);
                                    setStrHouseRent(Math.round(defaultBasic * 0.5));
                                    setStrMedical(Math.round(defaultBasic * 0.1));
                                    setStrConveyance(emp.conveyanceBDT ?? 0);
                                    setStrMobile(emp.mobileAllowanceBDT ?? 0);
                                    setStrSpecial(0);
                                    setStrOther(0);
                                    setStrEffectiveFrom(new Date().toISOString().slice(0, 10));
                                  }
                                  setStrRevisionReason('');
                                  setShowStructureModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 text-[11px] font-bold"
                              >
                                Edit Structure
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                                <Lock className="w-3 h-3" />
                                View Only
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 text-xs">
              <div className="text-slate-600 dark:text-slate-400">
                {salaryStructurePagination.totalEmployees === 0 ? (
                  <span>Showing <b>0</b> of <b>0</b> employees</span>
                ) : (
                  <span>
                    Showing <b>{salaryStructurePagination.startRecord}–{salaryStructurePagination.endRecord}</b> of{' '}
                    <b>{salaryStructurePagination.totalEmployees}</b> employees
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={salaryStructurePagination.safePage <= 1}
                  onClick={() => setSalaryStructurePage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                {salaryStructurePagination.pageNumbers.map((pageItem, idx) =>
                  pageItem === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400 select-none">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${pageItem}`}
                      type="button"
                      onClick={() => setSalaryStructurePage(Number(pageItem))}
                      className={`min-w-[30px] px-2.5 py-1.5 rounded-lg border font-bold transition-colors ${
                        salaryStructurePagination.safePage === pageItem
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pageItem}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={salaryStructurePagination.safePage >= salaryStructurePagination.totalPages}
                  onClick={() =>
                    setSalaryStructurePage((p) => Math.min(salaryStructurePagination.totalPages, p + 1))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: ATTENDANCE MANAGEMENT & GPS GEOFENCE REPORT                    */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'attendance' && payrollPagePerms.attendance && (
        <div className="space-y-4">
          {/* Header Bar & View Switcher */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Attendance Report</span>
              </h2>
              
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setAttSubView('report')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    attSubView === 'report'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Attendance Report
                </button>
                <button
                  onClick={() => setAttSubView('daily_grid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    attSubView === 'daily_grid'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Daily Grid ({selectedDateForAtt})
                </button>
                <button
                  onClick={() => setAttSubView('daily_wages_bill')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    attSubView === 'daily_wages_bill'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Daily Wages Bill of Factory</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowQrScannerModal(true)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <QrCode className="w-4 h-4" />
                <span>QR Code Scanner</span>
              </button>

              {canExportPayroll && attSubView !== 'daily_wages_bill' && (
                <button
                  onClick={handleExportAttendanceExcel}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
              )}
            </div>
          </div>

          {/* Search & Multi-Facet Filter Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">Period View:</span>
                {(['daily', 'weekly', 'monthly'] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyAttendancePeriodPreset(preset)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                      attPeriodMode === preset
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="text-slate-500 font-semibold">From</label>
                <input
                  type="date"
                  value={attDateFrom}
                  onChange={(e) => {
                    setAttPeriodMode('custom');
                    setAttDateFrom(e.target.value);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
                <label className="text-slate-500 font-semibold">To</label>
                <input
                  type="date"
                  value={attDateTo}
                  onChange={(e) => {
                    setAttPeriodMode('custom');
                    setAttDateTo(e.target.value);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={attSearchQuery}
                  onChange={(e) => setAttSearchQuery(e.target.value)}
                  placeholder="Search Employee Name or ID..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <select
                value={attDeptFilter}
                onChange={(e) => setAttDeptFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    Dept: {dept}
                  </option>
                ))}
              </select>

              <select
                value={attActionTypeFilter}
                onChange={(e) => setAttActionTypeFilter(e.target.value)}
                aria-label="Filter by Employee Action Type"
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                {actionTypeOptions.map((actionType) => (
                  <option key={actionType} value={actionType}>
                    Employee Action Type: {actionType}
                  </option>
                ))}
              </select>

              <select
                value={attOfficeFilter}
                onChange={(e) => setAttOfficeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                {officeFilterOptions.map((office) => (
                  <option key={office} value={office}>
                    Office: {office}
                  </option>
                ))}
              </select>

              <select
                value={attStatusFilter}
                onChange={(e) => setAttStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="All">Status: All</option>
                <option value="Present">Status: Present</option>
                <option value="Late">Status: Late</option>
                <option value="Half Day">Status: Half Day</option>
                <option value="Absent">Status: Absent</option>
                <option value="Leave">Status: Leave</option>
              </select>
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500">Present</div>
              <div className="text-xl font-black tabular-nums text-emerald-600 mt-0.5">{attReportStats.present}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500">Late Arrivals</div>
              <div className="text-xl font-black tabular-nums text-amber-600 mt-0.5">{attReportStats.late}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500">Half Day</div>
              <div className="text-xl font-black tabular-nums text-indigo-600 mt-0.5">{attReportStats.halfDay}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500">Absent</div>
              <div className="text-xl font-black tabular-nums text-rose-600 mt-0.5">{attReportStats.absent}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-500">GPS Verified</div>
              <div className="text-xl font-black tabular-nums text-blue-600 mt-0.5">{attReportStats.gpsVerified}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50">
              <div className="text-[11px] font-semibold text-rose-600">Rejected GPS</div>
              <div className="text-xl font-black tabular-nums text-rose-600 mt-0.5">{attReportStats.rejected}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                setAttendanceCardModal({
                  isOpen: true,
                  employeeId: employeePeriodSummaries[0]?.emp.id || fieldForceReps[0]?.id,
                  monthYear: (attDateFrom || selectedMonthYear).slice(0, 7),
                  autoDownloadPdf: false,
                })
              }
              className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100/80 dark:hover:bg-blue-950/60 border border-blue-200 dark:border-blue-800/70 text-left transition-colors group"
            >
              <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center justify-between gap-1">
                <span>Attendance Card</span>
                <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1.5">
                Open, Print &amp; PDF →
              </div>
            </button>
          </div>

          {/* SUB-VIEW 1: EMPLOYEE-WISE ATTENDANCE REPORT (15 COLUMNS + SUMMARY) */}
          {attSubView === 'report' && (
            <div className="space-y-4">
              {/* Employee Summary Table (Daily / Weekly / Monthly Aggregation) */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                      Employee Attendance Summary ({attDateFrom} to {attDateTo})
                    </h3>
                    
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {employeePeriodSummaries.length} Employees
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                        <th className="py-2.5 px-3">Employee ID</th>
                        <th className="py-2.5 px-3">Employee Name</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Employee Type</th>
                        <th className="py-2.5 px-3 text-center">Present</th>
                        <th className="py-2.5 px-3 text-center">Late</th>
                        <th className="py-2.5 px-3 text-center">Half Day</th>
                        <th className="py-2.5 px-3 text-center">Absent</th>
                        <th className="py-2.5 px-3 text-right">Work Hours</th>
                        <th className="py-2.5 px-3 text-center">Rejected GPS</th>
                        <th className="py-2.5 px-3 text-center">Attendance Card</th>
                        <th className="py-2.5 px-3 text-right">History</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {employeePeriodSummaries.map((row) => (
                        <tr key={row.emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{row.emp.code}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{row.emp.name}</div>
                            <div className="text-[10px] text-slate-400">{row.emp.designation || 'Executive'}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                            {row.emp.employeeCategory || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.emp.actionType || '—'}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600 tabular-nums">
                            {row.presentDays}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-600 tabular-nums">
                            {row.lateDays}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-600 tabular-nums">
                            {row.halfDays}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 tabular-nums">
                            {row.absentDays}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                            {row.totalWorkHours} hrs
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 tabular-nums">
                            {row.rejectedCount > 0 ? row.rejectedCount : '0'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setAttendanceCardModal({
                                    isOpen: true,
                                    employeeId: row.emp.id,
                                    monthYear: (attDateFrom || selectedMonthYear).slice(0, 7),
                                    autoDownloadPdf: false,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold text-[11px] whitespace-nowrap"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Attendance Card</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAttendanceCardModal({
                                    isOpen: true,
                                    employeeId: row.emp.id,
                                    monthYear: (attDateFrom || selectedMonthYear).slice(0, 7),
                                    autoDownloadPdf: true,
                                  })
                                }
                                title={`Download ${row.emp.name} Attendance Card PDF`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] whitespace-nowrap"
                              >
                                <Download className="w-3 h-3" />
                                <span>PDF</span>
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => setHistoryEmployee(row.emp)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-600 font-bold text-[11px]"
                            >
                              <History className="w-3 h-3" />
                              <span>History</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: DAILY ATTENDANCE & BIOMETRIC/ADMIN OVERRIDE GRID */}
          {attSubView === 'daily_grid' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Daily Attendance & Biometric / Admin Override Grid
                  </h3>
                  
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  
                  <button
                    type="button"
                    onClick={() =>
                      setAttendanceCardModal({
                        isOpen: true,
                        employeeId: fieldForceReps[0]?.id,
                        monthYear: (selectedDateForAtt || selectedMonthYear).slice(0, 7),
                        autoDownloadPdf: false,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Attendance Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAttendanceCardModal({
                        isOpen: true,
                        employeeId: fieldForceReps[0]?.id,
                        monthYear: (selectedDateForAtt || selectedMonthYear).slice(0, 7),
                        autoDownloadPdf: true,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Card PDF</span>
                  </button>

                  <input
                    type="date"
                    value={selectedDateForAtt}
                    onChange={(e) => {
                      setSelectedDateForAtt(e.target.value);
                      setDailyGridDrafts({});
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                  />
                  {canCreatePayroll && (
                    <button
                      type="button"
                      disabled={isBulkSavingAttendance}
                      onClick={async () => {
                        setIsBulkSavingAttendance(true);
                        setAttendanceFeedback(null);
                        const bulk = fieldForceReps.map((emp) => {
                          const empGeo = getEmployeeGeoConfig(emp);
                          const defaultIn = empGeo.shiftStartTime || DEFAULT_SHIFT_START_TIME;
                          const defaultOut = empGeo.shiftEndTime || DEFAULT_SHIFT_END_TIME;
                          const shiftCalc = calculateShiftAttendanceStatus({
                            checkInTime: defaultIn,
                            checkOutTime: defaultOut,
                            shiftStartTime: defaultIn,
                            gracePeriodMinutes: empGeo.gracePeriodMinutes,
                            standardDailyHours:
                              payrollSettings?.standardDailyHours ||
                              payrollSettings?.standardWorkHoursPerDay ||
                              8,
                          });
                          return {
                            employeeId: emp.id,
                            employeeCode: emp.code,
                            employeeName: emp.name,
                            department: emp.department,
                            designation: emp.designation,
                            assignedOfficeId: empGeo.assignedOfficeId,
                            assignedOfficeName: empGeo.assignedOfficeName,
                            date: selectedDateForAtt,
                            status: 'Present' as AttendanceStatus,
                            inTime: defaultIn,
                            checkInTime: defaultIn,
                            outTime: defaultOut,
                            checkOutTime: defaultOut,
                            workHours: shiftCalc.totalWorkingHours,
                            overtimeHours: shiftCalc.overtimeHours,
                            lateDurationMinutes: 0,
                            gpsValidationStatus: 'Manual' as const,
                          };
                        });
                        const res = await bulkMarkAttendance(bulk);
                        setIsBulkSavingAttendance(false);
                        setDailyGridDrafts({});
                        const otCounts = (res.overtimeSyncResults || []).reduce(
                          (acc, item) => {
                            if (item.action === 'CREATED') acc.created += 1;
                            else if (item.action === 'UPDATED') acc.updated += 1;
                            else if (item.action === 'CANCELLED') acc.cancelled += 1;
                            else if (
                              item.action === 'LOCKED_APPROVED' ||
                              item.action === 'LOCKED_REJECTED' ||
                              item.action === 'LOCKED_CANCELLED'
                            ) {
                              acc.locked += 1;
                            }
                            return acc;
                          },
                          { created: 0, updated: 0, cancelled: 0, locked: 0 }
                        );
                        const otParts: string[] = [];
                        if (otCounts.created > 0) otParts.push(`${otCounts.created} created`);
                        if (otCounts.updated > 0) otParts.push(`${otCounts.updated} updated`);
                        if (otCounts.cancelled > 0) otParts.push(`${otCounts.cancelled} cancelled`);
                        if (otCounts.locked > 0) otParts.push(`${otCounts.locked} locked unchanged`);
                        const otNote =
                          otParts.length > 0 ? ` Overtime Sync: ${otParts.join(', ')}.` : '';
                        if (res.dbSynced) {
                          setAttendanceFeedback({
                            type: 'success',
                            message: `Marked ${bulk.length} employee(s) Present for ${selectedDateForAtt} and saved to Supabase.${otNote}`,
                          });
                        } else {
                          setAttendanceFeedback({
                            type: 'warning',
                            message:
                              (res.error ||
                                `Updated locally for ${selectedDateForAtt}, but Supabase did not persist to employee_attendances.`) +
                              otNote,
                            sqlFix: res.sqlFix || EMPLOYEE_ATTENDANCES_TABLE_SQL,
                          });
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {isBulkSavingAttendance
                          ? 'Saving...'
                          : `Mark All Present (${selectedDateForAtt})`}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {attendanceFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                    attendanceFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : attendanceFeedback.type === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                      : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {attendanceFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="font-medium leading-relaxed">{attendanceFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttendanceFeedback(null)}
                    className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {canCreatePayroll &&
                !attendanceDbStatus.synced &&
                (attendanceDbStatus.status === 'rls_blocked' ||
                  attendanceDbStatus.status === 'table_missing' ||
                  attendanceDbStatus.status === 'error' ||
                  Boolean(attendanceFeedback?.sqlFix)) && (
                  <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/80 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Supabase Permission / Table Setup Needed for Attendance Check In & Check Out
                        </div>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                          {attendanceDbStatus.error ||
                            attendanceFeedback?.message ||
                            'Supabase blocked writing to public.employee_attendances.'}{' '}
                          Run the SQL script below once in Supabase SQL Editor, then click{' '}
                          <b>Sync to Supabase</b>.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          One-Time Supabase SQL Fix (RLS Policy + Columns)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  attendanceDbStatus.sqlFix ||
                                    attendanceFeedback?.sqlFix ||
                                    EMPLOYEE_ATTENDANCES_TABLE_SQL
                                );
                                setCopiedAttendanceSql(true);
                                setTimeout(() => setCopiedAttendanceSql(false), 2500);
                              } catch {}
                            }}
                            className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                          >
                            {copiedAttendanceSql ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy SQL</span>
                              </>
                            )}
                          </button>
                          <a
                            href={supabaseSqlEditorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                          >
                            <span>Open SQL Editor</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-40 leading-relaxed border border-slate-800">
                        {attendanceDbStatus.sqlFix ||
                          attendanceFeedback?.sqlFix ||
                          EMPLOYEE_ATTENDANCES_TABLE_SQL}
                      </pre>
                    </div>
                  </div>
                )}

              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Employee Category</th>
                        <th className="py-3 px-4">Status ({selectedDateForAtt})</th>
                        <th className="py-3 px-4">Check In</th>
                        <th className="py-3 px-4">Check Out</th>
                        <th className="py-3 px-4">GPS Validation</th>
                        <th className="py-3 px-4 text-center">Monthly Summary ({selectedMonthYear})</th>
                        <th className="py-3 px-4 text-right">Quick Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {fieldForceReps
                        .filter((emp) => {
                          const office = getEmployeeGeoConfig(emp).assignedOfficeName;
                          if (attSearchQuery.trim()) {
                            const q = attSearchQuery.trim().toLowerCase();
                            const hay = `${emp.code} ${emp.name} ${emp.department || ''} ${emp.employeeCategory || ''} ${emp.actionType || ''} ${office}`.toLowerCase();
                            if (!hay.includes(q)) return false;
                          }
                          if (attDeptFilter !== 'All' && (emp.department || 'Operations') !== attDeptFilter) return false;
                          if (attActionTypeFilter !== 'All' && (emp.actionType || '') !== attActionTypeFilter) return false;
                          if (attOfficeFilter !== 'All' && office !== attOfficeFilter) return false;
                          if (attStatusFilter !== 'All') {
                            const rec = attendanceRecords.find(
                              (a) =>
                                (a.employeeId === emp.id || a.fieldForceId === emp.id || a.employeeCode === emp.code) &&
                                a.date === selectedDateForAtt
                            );
                            const st = rec ? rec.status : 'Absent';
                            if (attStatusFilter === 'Half Day') {
                              if (st !== 'Half Day' && st !== 'Half-Day') return false;
                            } else if (attStatusFilter === 'Leave') {
                              if (st !== 'Leave' && st !== 'Paid Leave' && st !== 'Unpaid Leave') return false;
                            } else if (st !== attStatusFilter) {
                              return false;
                            }
                          }
                          return true;
                        })
                        .map((emp) => {
                        const todayRec = attendanceRecords.find(
                          (a) =>
                            (a.employeeId === emp.id || a.fieldForceId === emp.id || a.employeeCode === emp.code) &&
                            a.date === selectedDateForAtt
                        );
                        const summary = getEmployeeAttendanceSummary(emp.id, selectedMonthYear);
                        const status = todayRec ? todayRec.status : 'Absent';
                        const gpsStatus = todayRec?.gpsValidationStatus || (todayRec ? 'Manual' : '—');
                        const rowKey = `${emp.id}_${selectedDateForAtt}`;
                        const savedIn = todayRec?.checkInTime || todayRec?.inTime || '';
                        const savedOut = todayRec?.checkOutTime || todayRec?.outTime || '';
                        const draft = dailyGridDrafts[rowKey];
                        const inValue = draft ? draft.inTime : savedIn;
                        const outValue = draft ? draft.outTime : savedOut;
                        const hasDraftChange =
                          Boolean(draft) && (draft.inTime !== savedIn || draft.outTime !== savedOut);
                        const isSavingRow = savingAttendanceRowId === emp.id;

                        const empGeo = getEmployeeGeoConfig(emp);
                        const saveRowAttendance = async (
                          targetStatus?: AttendanceStatus,
                          overrideTimes?: { inTime?: string; outTime?: string }
                        ) => {
                          if (!canCreatePayroll || isSavingRow) return;
                          const shiftStart = empGeo.shiftStartTime || DEFAULT_SHIFT_START_TIME;
                          const shiftEnd = empGeo.shiftEndTime || DEFAULT_SHIFT_END_TIME;
                          const graceMins = empGeo.gracePeriodMinutes;
                          const stdHours =
                            payrollSettings?.standardDailyHours ||
                            payrollSettings?.standardWorkHoursPerDay ||
                            8;

                          let finalIn = (overrideTimes?.inTime ?? inValue).trim();
                          let finalOut = (overrideTimes?.outTime ?? outValue).trim();
                          const nextStatus: AttendanceStatus = targetStatus || todayRec?.status || 'Present';

                          if (nextStatus === 'Absent') {
                            finalIn = '';
                            finalOut = '';
                          } else {
                            if (!finalIn) {
                              finalIn = nextStatus === 'Late' ? '10:15' : shiftStart;
                            }
                            if (!finalOut && targetStatus) {
                              finalOut = nextStatus === 'Half Day' ? '13:00' : shiftEnd;
                            }
                          }

                          let workHours = 0;
                          let overtimeHours = 0;
                          let lateDurationMinutes = 0;
                          let isLate = nextStatus === 'Late';

                          if (nextStatus !== 'Absent' && finalIn) {
                            const calc = calculateShiftAttendanceStatus({
                              checkInTime: finalIn,
                              checkOutTime: finalOut || undefined,
                              shiftStartTime: shiftStart,
                              gracePeriodMinutes: graceMins,
                              standardDailyHours: stdHours,
                            });
                            workHours = calc.totalWorkingHours;
                            overtimeHours = calc.overtimeHours;
                            lateDurationMinutes = calc.lateDurationMinutes;
                            isLate = nextStatus === 'Late' ? true : calc.isLate;
                          }

                          setSavingAttendanceRowId(emp.id);
                          setAttendanceFeedback(null);
                          const res = await markAttendance({
                            employeeId: emp.id,
                            employeeCode: emp.code,
                            employeeName: emp.name,
                            department: emp.department,
                            designation: emp.designation,
                            assignedOfficeId: empGeo.assignedOfficeId,
                            assignedOfficeName: empGeo.assignedOfficeName,
                            date: selectedDateForAtt,
                            status: nextStatus,
                            inTime: finalIn || undefined,
                            checkInTime: finalIn || undefined,
                            outTime: finalOut || undefined,
                            checkOutTime: finalOut || undefined,
                            workHours,
                            overtimeHours,
                            isLate,
                            lateDurationMinutes,
                            lateMinutes: lateDurationMinutes,
                            gpsValidationStatus: todayRec?.gpsValidationStatus || 'Manual',
                          });
                          setSavingAttendanceRowId(null);

                          if (!res.success) {
                            setAttendanceFeedback({
                              type: 'error',
                              message: res.error || `Failed to save attendance for ${emp.name}.`,
                            });
                            return;
                          }

                          setDailyGridDrafts((prev) => {
                            const next = { ...prev };
                            delete next[rowKey];
                            return next;
                          });

                          const otSync = res.overtimeSync;
                          const otNote =
                            otSync?.message &&
                            [
                              'CREATED',
                              'UPDATED',
                              'CANCELLED',
                              'LOCKED_APPROVED',
                              'LOCKED_REJECTED',
                              'LOCKED_CANCELLED',
                            ].includes(otSync.action)
                              ? ` ${otSync.message}`
                              : '';

                          if (res.dbSynced) {
                            setAttendanceFeedback({
                              type: 'success',
                              message: `Saved ${emp.name} (${selectedDateForAtt}) Check In/Out to Supabase.${otNote}`,
                            });
                          } else {
                            setAttendanceFeedback({
                              type: 'warning',
                              message:
                                (res.error ||
                                  `Saved locally for ${emp.name}, but Supabase did not persist to employee_attendances.`) +
                                otNote,
                              sqlFix: res.sqlFix || EMPLOYEE_ATTENDANCES_TABLE_SQL,
                            });
                          }
                        };

                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">{emp.name}</div>
                              <span className="font-mono text-[10px] text-blue-600">{emp.code}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                              {emp.employeeCategory || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  status === 'Present'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : status === 'Absent'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : status === 'Late'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                }`}
                              >
                                {todayRec ? status : 'Unmarked'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                              {canCreatePayroll ? (
                                <Time12HourInput
                                  compact
                                  allowClear
                                  ariaLabel={`Check In time for ${emp.name}`}
                                  value={inValue}
                                  disabled={isSavingRow}
                                  onChange={(nextIn) => {
                                    setDailyGridDrafts((prev) => ({
                                      ...prev,
                                      [rowKey]: {
                                        inTime: nextIn,
                                        outTime: prev[rowKey]?.outTime ?? savedOut,
                                      },
                                    }));
                                  }}
                                />
                              ) : (
                                <div>{formatTime12Hour(savedIn) || '—'}</div>
                              )}
                              {typeof todayRec?.checkInDistanceMeters === 'number' && (
                                <span className="block text-[10px] text-emerald-600 mt-0.5">
                                  {Math.round(todayRec.checkInDistanceMeters)}m from office
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                              {canCreatePayroll ? (
                                <Time12HourInput
                                  compact
                                  allowClear
                                  ariaLabel={`Check Out time for ${emp.name}`}
                                  value={outValue}
                                  disabled={isSavingRow}
                                  onChange={(nextOut) => {
                                    setDailyGridDrafts((prev) => ({
                                      ...prev,
                                      [rowKey]: {
                                        inTime: prev[rowKey]?.inTime ?? savedIn,
                                        outTime: nextOut,
                                      },
                                    }));
                                  }}
                                />
                              ) : (
                                <div>{formatTime12Hour(savedOut) || '—'}</div>
                              )}
                              {typeof todayRec?.checkOutDistanceMeters === 'number' && (
                                <span className="block text-[10px] text-emerald-600 mt-0.5">
                                  {Math.round(todayRec.checkOutDistanceMeters)}m from office
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  gpsStatus === 'Accepted'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : gpsStatus === 'QR Scan'
                                    ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                                    : gpsStatus === 'Rejected'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {gpsStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="text-[11px] font-semibold tabular-nums">
                                <span className="text-emerald-600 font-bold">{summary.presentDays}P</span> /{' '}
                                <span className="text-rose-600 font-bold">{summary.absentDays}A</span> /{' '}
                                <span className="text-amber-600">{summary.lateDays}L</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {canCreatePayroll ? (
                                <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                  {(hasDraftChange || inValue || outValue) && (
                                    <button
                                      type="button"
                                      disabled={isSavingRow}
                                      onClick={() => saveRowAttendance()}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                        hasDraftChange
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                      }`}
                                    >
                                      {isSavingRow ? 'Saving...' : 'Save'}
                                    </button>
                                  )}
                                  {(['Present', 'Late', 'Half Day', 'Absent'] as AttendanceStatus[]).map((st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      disabled={isSavingRow}
                                      onClick={() => {
                                        const shiftStart = empGeo.shiftStartTime || DEFAULT_SHIFT_START_TIME;
                                        const shiftEnd = empGeo.shiftEndTime || DEFAULT_SHIFT_END_TIME;
                                        const targetIn =
                                          st === 'Absent'
                                            ? ''
                                            : hasDraftChange
                                            ? inValue
                                            : st === 'Late'
                                            ? '10:15'
                                            : inValue || shiftStart;
                                        const targetOut =
                                          st === 'Absent'
                                            ? ''
                                            : hasDraftChange
                                            ? outValue
                                            : st === 'Half Day'
                                            ? '13:00'
                                            : outValue || shiftEnd;
                                        saveRowAttendance(st, { inTime: targetIn, outTime: targetOut });
                                      }}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                                        todayRec && status === st
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                      }`}
                                    >
                                      {st}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                                  <Lock className="w-3 h-3" />
                                  View Only
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW 3: DAILY WAGES BILL OF FACTORY REPORT */}
          {attSubView === 'daily_wages_bill' && (
            <DailyWagesBillFactory
              searchQuery={attSearchQuery}
              departmentFilter={attDeptFilter}
              onDepartmentFilterChange={setAttDeptFilter}
              actionTypeFilter={attActionTypeFilter}
              officeFilter={attOfficeFilter}
              activeMonthHint={(attDateFrom || selectedMonthYear).slice(0, 7)}
              canExport={canExportPayroll}
            />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: LEAVE MANAGEMENT                                               */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'leaves' && payrollPagePerms.leaves && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Employee Leave Applications &amp; Balances
                </h2>
                {!canManageAllLeaves && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    My Leave Applications Only
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {canManageAllLeaves
                  ? 'Annual, Casual, Sick, Maternity, and Unpaid Leave with approval authority.'
                  : 'Submit your own leave applications and track their approval status.'}
              </p>
            </div>
            {canApplyLeave && (
              <button
                type="button"
                onClick={() => {
                  setLeaveEmployeeId(
                    canSelectAnyLeaveEmployee
                      ? fieldForceReps[0]?.id || ''
                      : selfLeaveProfile?.id || ''
                  );
                  setLeaveEmployeeSearch('');
                  setLeaveEmployeeDropdownOpen(false);
                  setLeaveType('Casual Leave');
                  setLeaveStartDate(todayIso);
                  setLeaveEndDate(todayIso);
                  setLeaveReason('');
                  setLeaveFormError('');
                  setLeaveFeedback(null);
                  setShowLeaveModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Apply Leave</span>
              </button>
            )}
          </div>

          {leaveFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                leaveFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : leaveFeedback.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {leaveFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                )}
                <span className="font-medium leading-relaxed">{leaveFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setLeaveFeedback(null)}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* User Own Leave Profile & Balance Info (Current User Only) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center font-black text-sm shrink-0">
                  {(selfLeaveProfile?.name || currentUser?.name || 'U')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() || '')
                    .join('') || 'U'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selfLeaveProfile?.name || currentUser?.name || 'Employee'}
                    </span>
                    {selfLeaveProfile?.code && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold">
                        {selfLeaveProfile.code}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {selfLeaveProfile?.designation || currentUser?.role || 'Employee'}
                    {selfLeaveProfile?.department ? ` • ${selfLeaveProfile.department}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                  Year {currentLeaveYear}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[10px] font-bold inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>My Own Leave Info</span>
                </span>
              </div>
            </div>

            {/* 4 Key Summary Numbers: Entitled, Availed, Approval Pending, Balance */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300 block">
                  Entitled
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                    {ownLeaveSummary.regularEntitled}
                  </span>
                  <span className="text-xs font-bold text-blue-700/80 dark:text-blue-300/80">
                    Days
                  </span>
                </div>
                <span className="text-[10px] text-blue-700/75 dark:text-blue-300/75 block mt-0.5">
                  Annual {ownLeaveSummary.annual.entitled} + Casual {ownLeaveSummary.casual.entitled} + Sick {ownLeaveSummary.sick.entitled}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
                <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300 block">
                  Availed
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {ownLeaveSummary.regularAvailed}
                  </span>
                  <span className="text-xs font-bold text-purple-700/80 dark:text-purple-300/80">
                    Days
                  </span>
                </div>
                <span className="text-[10px] text-purple-700/75 dark:text-purple-300/75 block mt-0.5">
                  {ownLeaveSummary.approvedCount} approved in {currentLeaveYear}
                  {ownLeaveSummary.maternity.availed > 0 ? ` (+${ownLeaveSummary.maternity.availed}d Maternity)` : ''}
                  {ownLeaveSummary.unpaid.availed > 0 ? ` (+${ownLeaveSummary.unpaid.availed}d Unpaid)` : ''}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300 block">
                  Approval Pending
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {ownLeaveSummary.totalPending}
                  </span>
                  <span className="text-xs font-bold text-amber-700/80 dark:text-amber-300/80">
                    Days
                  </span>
                </div>
                <span className="text-[10px] text-amber-700/75 dark:text-amber-300/75 block mt-0.5">
                  {ownLeaveSummary.pendingCount} pending request{ownLeaveSummary.pendingCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 block">
                  Balance
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {ownLeaveSummary.regularBalance}
                  </span>
                  <span className="text-xs font-bold text-emerald-700/80 dark:text-emerald-300/80">
                    Days
                  </span>
                </div>
                <span className="text-[10px] text-emerald-700/75 dark:text-emerald-300/75 block mt-0.5">
                  {ownLeaveSummary.regularPending > 0
                    ? `${Math.max(0, ownLeaveSummary.regularBalance - ownLeaveSummary.regularPending)}d after pending`
                    : 'Available regular leave balance'}
                </span>
              </div>
            </div>

            {/* Per-Category Breakdown for Current User */}
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-2 px-3">Leave Type</th>
                    <th className="py-2 px-3 text-right">Entitled</th>
                    <th className="py-2 px-3 text-right">Availed</th>
                    <th className="py-2 px-3 text-right">Approval Pending</th>
                    <th className="py-2 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {ownLeaveSummary.rows.map((row) => (
                    <tr key={row.leaveType} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {row.leaveType}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {row.entitled}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                        {row.availed}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {row.pending}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                        {row.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leaves Table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Days</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Approved By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleLeaveRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500 dark:text-slate-400">
                        {canManageAllLeaves
                          ? 'No leave records found.'
                          : 'No leave applications found for your account.'}
                      </td>
                    </tr>
                  ) : (
                    visibleLeaveRecords.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{l.employeeName}</div>
                          <span className="font-mono text-[10px] text-blue-600">{l.employeeCode}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {l.leaveType}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {l.startDate} to {l.endDate}
                        </td>
                        <td className="py-3 px-4 font-bold">{l.daysCount} Days</td>
                        <td className="py-3 px-4 text-slate-500 italic max-w-xs truncate">{l.reason}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              l.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : l.status === 'Rejected'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {l.approvedBy || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {l.status === 'Pending' &&
                            (canApproveLeave ? (
                              <div className="inline-flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    approveLeave(l.id, currentUser?.name || 'Managing Director');
                                    setLeaveFeedback({
                                      type: 'success',
                                      message: `Approved ${l.leaveType} for ${l.employeeName} (${l.daysCount} day${l.daysCount === 1 ? '' : 's'}).`,
                                    });
                                  }}
                                  className="px-2 py-1 rounded bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    rejectLeave(l.id, 'Management operational constraint');
                                    setLeaveFeedback({
                                      type: 'warning',
                                      message: `Rejected ${l.leaveType} application for ${l.employeeName}.`,
                                    });
                                  }}
                                  className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10px] hover:bg-rose-700"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-semibold">Pending Approval</span>
                            ))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: EMPLOYEE ADVANCE & LOAN MANAGEMENT                             */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'loans' && payrollPagePerms.loans && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Employee Advance & Loan Management
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated monthly salary deduction, installment schedules, early settlement, and ledger tracking.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {advanceLoansDbStatus.synced ? (
                <span className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>Supabase Synced</span>
                </span>
              ) : advanceLoansDbStatus.status !== 'unknown' ? (
                <span className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[11px] font-bold inline-flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>
                    {advanceLoansDbStatus.status === 'rls_blocked'
                      ? 'Backup Mode (RLS Fix Needed)'
                      : 'Database Setup Needed'}
                  </span>
                </span>
              ) : null}

              {canCreatePayroll && syncAdvanceLoansToSupabase && (
                <button
                  type="button"
                  disabled={isSyncingLoans}
                  onClick={async () => {
                    setIsSyncingLoans(true);
                    const res = await syncAdvanceLoansToSupabase();
                    setIsSyncingLoans(false);
                    if (res.dbSynced) {
                      setLoanFeedback({
                        type: 'success',
                        message:
                          res.syncedCount > 0
                            ? `Synced ${res.syncedCount} advance/loan record(s) directly to Supabase.`
                            : 'Supabase table "public.employee_advances_loans" is ready and writable.',
                      });
                    } else {
                      setLoanFeedback({
                        type: res.backedUp ? 'warning' : 'error',
                        message: res.error || 'Could not write directly to public.employee_advances_loans.',
                        sqlFix: res.sqlFix,
                      });
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLoans ? 'animate-spin' : ''}`} />
                  <span>{isSyncingLoans ? 'Syncing...' : 'Sync to Supabase'}</span>
                </button>
              )}

              {canCreatePayroll && (
                <button
                  type="button"
                  onClick={() => {
                    setLoanEmployeeId(fieldForceReps[0]?.id || '');
                    setLoanType('Employee Loan');
                    setLoanAmount(0);
                    setLoanTenure(1);
                    setLoanStartMonth(currentMonthIso);
                    setLoanReason('');
                    setLoanFormError('');
                    setShowLoanModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Apply Loan / Advance</span>
                </button>
              )}
            </div>
          </div>

          {loanFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                loanFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : loanFeedback.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {loanFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                )}
                <span className="font-medium leading-relaxed">{loanFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setLoanFeedback(null)}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {canCreatePayroll &&
            !advanceLoansDbStatus.synced &&
            (advanceLoansDbStatus.status === 'rls_blocked' ||
              advanceLoansDbStatus.status === 'table_missing' ||
              advanceLoansDbStatus.status === 'error' ||
              Boolean(loanFeedback?.sqlFix)) && (
              <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/80 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Supabase Permission / Table Setup Needed for Advances &amp; Loans
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                      {advanceLoansDbStatus.error ||
                        loanFeedback?.message ||
                        'Supabase Row-Level Security blocked direct writes to public.employee_advances_loans.'}{' '}
                      Run the SQL script below once in Supabase SQL Editor, then click <b>Sync to Supabase</b>.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      One-Time Supabase SQL Fix (RLS Policy + Table)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              advanceLoansDbStatus.sqlFix ||
                                loanFeedback?.sqlFix ||
                                EMPLOYEE_ADVANCES_LOANS_TABLE_SQL
                            );
                            setCopiedLoansSql(true);
                            setTimeout(() => setCopiedLoansSql(false), 2500);
                          } catch {}
                        }}
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        {copiedLoansSql ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy SQL</span>
                          </>
                        )}
                      </button>
                      <a
                        href={supabaseSqlEditorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        <span>Open SQL Editor</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-40 leading-relaxed border border-slate-800">
                    {advanceLoansDbStatus.sqlFix ||
                      loanFeedback?.sqlFix ||
                      EMPLOYEE_ADVANCES_LOANS_TABLE_SQL}
                  </pre>
                </div>
              </div>
            )}

          {/* Loans Table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Principal</th>
                    <th className="py-3 px-4 text-right">Monthly Installment</th>
                    <th className="py-3 px-4 text-right">Repaid</th>
                    <th className="py-3 px-4 text-right">Remaining Balance</th>
                    <th className="py-3 px-4 text-center">Tenure Progress</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {advanceLoans.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500 dark:text-slate-400">
                        No advance or loan records found.
                      </td>
                    </tr>
                  ) : (
                    advanceLoans.map((loan) => {
                      const principal = loan.principalAmountBDT ?? loan.approvedAmountBDT ?? loan.requestedAmountBDT ?? 0;
                      const monthly = loan.monthlyDeductionBDT ?? loan.monthlyInstallmentBDT ?? 0;
                      const repaid = loan.repaidAmountBDT ?? loan.totalPaidBDT ?? 0;
                      const remaining = loan.remainingAmountBDT ?? loan.remainingBalanceBDT ?? Math.max(0, principal - repaid);
                      const tenure = loan.repaymentTenureMonths ?? loan.installmentDurationMonths ?? (loan.schedule?.length || 1);
                      const paidCount = (loan.schedule || []).filter((s) => s.status === 'Deducted').length;
                      const pct = Math.round((repaid / (principal || 1)) * 100);
                      const currentLoanType = loan.loanType || loan.type || 'Salary Advance';

                      return (
                        <tr key={loan.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{loan.employeeName}</div>
                            <span className="font-mono text-[10px] text-blue-600">{loan.employeeCode || loan.referenceNo}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                currentLoanType === 'Salary Advance'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              }`}
                            >
                              {currentLoanType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            ৳ {principal.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-blue-600">
                            ৳ {monthly.toLocaleString()}/mo
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-600 font-semibold">
                            ৳ {repaid.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-rose-600">
                            ৳ {remaining.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="text-[11px] font-bold">
                              {paidCount} of {tenure} months ({pct}%)
                            </div>
                            <div className="w-20 mx-auto bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                loan.status === 'Closed' || loan.status === 'Settled'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : loan.status === 'Approved' || loan.status === 'Active'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {loan.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex gap-1.5 items-center">
                              <button
                                onClick={() => setViewingLoanSchedule(loan)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-[11px] font-bold"
                              >
                                Schedule
                              </button>
                              {loan.status === 'Pending' && canApproveAdvanceLoan && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await approveAdvanceLoan(
                                      loan.id,
                                      currentUser?.name || 'Managing Director'
                                    );
                                    if (!res?.success) {
                                      setLoanFeedback({
                                        type: 'error',
                                        message: res?.error || 'Failed to approve loan.',
                                      });
                                    } else if (res.dbSynced) {
                                      setLoanFeedback({
                                        type: 'success',
                                        message: `Approved ${loan.loanType || 'Loan'} for ${loan.employeeName} and synced to Supabase.`,
                                      });
                                    } else if (res.backedUp) {
                                      setLoanFeedback({
                                        type: 'warning',
                                        message:
                                          res.error ||
                                          `Approved ${loan.loanType || 'Loan'} for ${loan.employeeName} via Supabase backup.`,
                                        sqlFix: res.sqlFix,
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-2xs"
                                >
                                  Approve
                                </button>
                              )}
                              {loan.remainingAmountBDT > 0 && canDisbursePayroll && (
                                <button
                                  onClick={() => setSettlingLoan(loan)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-2xs"
                                >
                                  Settle Now
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 6: BONUSES & INCENTIVES                                           */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'bonuses' && payrollPagePerms.bonuses && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Bonuses & Sales Commission Incentives
              </h2>
              <p className="text-xs text-slate-500">
                Festival Bonus, Performance Bonus, and Field Force target achievement bonuses.
              </p>
            </div>
            {canCreatePayroll && (
              <button
                onClick={() => {
                  setBnsEmployeeId(fieldForceReps[0]?.id || '');
                  setShowBonusModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Bonus / Incentive</span>
              </button>
            )}
          </div>

          {/* Bonuses Table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Bonus Type</th>
                    <th className="py-3 px-4">Payroll Month</th>
                    <th className="py-3 px-4 text-right font-black">Bonus Amount</th>
                    <th className="py-3 px-4">Remarks</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Approved By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bonusRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500 dark:text-slate-400">
                        No bonus or incentive records found.
                      </td>
                    </tr>
                  ) : (
                    bonusRecords.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{b.employeeName}</div>
                          <span className="font-mono text-[10px] text-blue-600">{b.employeeCode}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {b.bonusType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">{b.monthYear}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                          ৳ {(b.amountBDT || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-500 italic max-w-xs truncate">{b.remarks}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              b.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {b.approvedBy || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {b.status === 'Pending' &&
                            (canApprovePayroll ? (
                              <button
                                onClick={() => approveBonusRecord(b.id, currentUser?.name || 'Managing Director')}
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[10px]"
                              >
                                Approve
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-semibold">Pending Approval</span>
                            ))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 8: MONTHLY PAYROLL PROCESSING                                     */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'processing' && payrollPagePerms.processing && (
        <div className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Monthly Payroll Processing Wizard
                </h2>
                {currentMonthRun && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      currentMonthRun.status === 'Finalized' || currentMonthRun.status === 'Paid'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    Status: {currentMonthRun.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Aggregates: Salary Structure + Attendance Deductions + Approved Overtime + Active Loan Schedules + Tax & PF.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {canCreatePayroll && (
                <button
                  onClick={() => generateMonthlySalaryRun(selectedMonthYear)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-Calculate Run</span>
                </button>
              )}

              {currentMonthRun && currentMonthRun.status === 'Draft' && canApprovePayroll && (
                <button
                  onClick={() =>
                    finalizeMonthlyPayrollRun(
                      currentMonthRun.id,
                      currentUser?.name || 'Finance Director'
                    )
                  }
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Finalize & Lock Payroll</span>
                </button>
              )}
            </div>
          </div>

          {/* Processing Summary Cards */}
          {currentMonthRun && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Eligible Staff</span>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                  {currentMonthRun.totalEmployees}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Gross Outlay</span>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                  ৳ {(currentMonthRun.totalGrossBDT || 0).toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-rose-500">Total Deductions</span>
                <div className="text-2xl font-black text-rose-600 mt-0.5">
                  - ৳ {(currentMonthRun.totalDeductionsBDT || 0).toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">
                  Net Disbursable
                </span>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ৳ {(currentMonthRun.totalNetBDT || 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Empty Run Notice */}
          {!currentMonthRun && (
            <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                No payroll run generated for {selectedMonthYear}
              </p>
              <p className="text-xs text-slate-500">
                Click Process {selectedMonthYear} Payroll above to calculate salaries from active employee salary structures.
              </p>
            </div>
          )}

          {/* Detailed Calculation Items Preview Table */}
          {currentMonthRun && currentMonthRun.items && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Calculation Sheet Preview ({currentMonthRun.items.length} Employees)
                </h3>
                <span className="text-xs text-slate-500">
                  Processed on {new Date(currentMonthRun.processedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                      <th className="py-3 px-3">Employee</th>
                      <th className="py-3 px-3">Designation / Cat</th>
                      <th className="py-3 px-3 text-right">Basic Pay</th>
                      <th className="py-3 px-3 text-right">Allowances</th>
                      <th className="py-3 px-3 text-right">Overtime</th>
                      <th className="py-3 px-3 text-right">Bonus / Inc</th>
                      <th className="py-3 px-3 text-right font-black">Gross Pay</th>
                      <th className="py-3 px-3 text-right text-rose-500">Loan Ded</th>
                      <th className="py-3 px-3 text-right text-rose-500">Tax & PF</th>
                      <th className="py-3 px-3 text-right font-black text-emerald-600">Net Salary</th>
                      <th className="py-3 px-3 text-center">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentMonthRun.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{it.employeeName}</div>
                          <span className="font-mono text-[10px] text-blue-600">{it.employeeCode}</span>
                        </td>
                        <td className="py-3 px-3">
                          <div>{it.designation}</div>
                          <span className="text-[10px] text-slate-400">{it.employeeCategory}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          ৳ {(it.basicSalaryBDT || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          ৳{' '}
                          {(
                            (it.houseRentBDT || 0) +
                            (it.medicalAllowanceBDT || 0) +
                            (it.conveyanceAllowanceBDT || 0) +
                            (it.mobileAllowanceBDT || 0) +
                            (it.specialAllowanceBDT || 0) +
                            (it.foodAllowanceBDT || 0) +
                            (it.otherAllowancesBDT || 0)
                          ).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-blue-600">
                          {it.overtimeAmountBDT ? `৳${it.overtimeAmountBDT.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-600">
                          {(it.festivalBonusBDT || 0) + (it.performanceBonusBDT || 0) + (it.salesIncentiveBDT || 0) + (it.bonusAmountBDT || 0) > 0
                            ? `৳${(
                                (it.festivalBonusBDT || 0) +
                                (it.performanceBonusBDT || 0) +
                                (it.salesIncentiveBDT || 0) +
                                (it.bonusAmountBDT || 0)
                              ).toLocaleString()}`
                            : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          ৳ {(it.totalGrossEarningsBDT ?? it.grossSalaryBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-rose-600">
                          {(it.advanceLoanDeductionBDT ?? ((it.advanceDeductionBDT || 0) + (it.loanInstallmentBDT || 0))) ? `- ৳${(it.advanceLoanDeductionBDT ?? ((it.advanceDeductionBDT || 0) + (it.loanInstallmentBDT || 0))).toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          ৳ {((it.taxDeductionBDT || 0) + (it.providentFundDeductionBDT ?? it.providentFundBDT ?? 0)).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-600">
                          ৳ {(it.netSalaryBDT ?? it.netPayableBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              it.paymentStatus === 'Paid'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {it.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 9: MONTHLY SALARY SHEETS                                          */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'salary_sheets' && payrollPagePerms.salary_sheets && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Monthly Salary Sheets & Corporate Advice
              </h2>
              <p className="text-xs text-slate-500">
                Full itemized sheet ready for bank transfers, audit records, and Excel export.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canExportPayroll && (
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Salary Sheet</span>
                </button>
              )}
            </div>
          </div>

          {/* Salary Sheet View */}
          {!currentMonthRun ? (
            <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No salary sheet generated for {selectedMonthYear}.
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase">
                      <th className="py-2.5 px-3">SL</th>
                      <th className="py-2.5 px-3">Employee Info</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-right">Basic Pay</th>
                      <th className="py-2.5 px-3 text-right">House Rent</th>
                      <th className="py-2.5 px-3 text-right">Medical</th>
                      <th className="py-2.5 px-3 text-right">Conveyance</th>
                      <th className="py-2.5 px-3 text-right">Mobile</th>
                      <th className="py-2.5 px-3 text-right">Overtime</th>
                      <th className="py-2.5 px-3 text-right">Bonus</th>
                      <th className="py-2.5 px-3 text-right font-black">Gross</th>
                      <th className="py-2.5 px-3 text-right text-rose-500">Loan Ded</th>
                      <th className="py-2.5 px-3 text-right text-rose-500">PF Ded</th>
                      <th className="py-2.5 px-3 text-right text-rose-500">Tax</th>
                      <th className="py-2.5 px-3 text-right font-black text-emerald-600">Net Pay</th>
                      <th className="py-2.5 px-3">Bank Details</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentMonthRun.items.map((it, idx) => (
                      <tr key={it.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{it.employeeName}</div>
                          <span className="font-mono text-[10px] text-blue-600">{it.employeeCode}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {it.department}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.basicSalaryBDT || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.houseRentBDT || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.medicalAllowanceBDT || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.conveyanceAllowanceBDT || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.mobileAllowanceBDT || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.overtimeAmountBDT || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600">
                          ৳{((it.festivalBonusBDT || 0) + (it.performanceBonusBDT || 0) + (it.salesIncentiveBDT || 0) + (it.bonusAmountBDT || 0)).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          ৳{(it.totalGrossEarningsBDT ?? it.grossSalaryBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                          {(it.advanceLoanDeductionBDT ?? ((it.advanceDeductionBDT || 0) + (it.loanInstallmentBDT || 0))) ? `৳${(it.advanceLoanDeductionBDT ?? ((it.advanceDeductionBDT || 0) + (it.loanInstallmentBDT || 0))).toLocaleString()}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          ৳{(it.providentFundDeductionBDT ?? it.providentFundBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          ৳{(it.taxDeductionBDT || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600">
                          ৳{(it.netSalaryBDT ?? it.netPayableBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px]">
                          <div>{it.bankName || '—'}</div>
                          <span className="text-slate-400">{it.bankAccountNo || '—'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              it.paymentStatus === 'Paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {it.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 10: SALARY PAYMENT DISBURSEMENT                                   */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'payments' && payrollPagePerms.payments && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Salary Payment & Disbursement Processing
              </h2>
              <p className="text-xs text-slate-500">
                Disburse salaries via Bank EFT (City Bank, Eastern Bank), Cash in Hand, or MFS (bKash/Nagad).
              </p>
            </div>
            {canDisbursePayroll &&
              currentMonthRun &&
              currentMonthRun.items.some((i) => i.paymentStatus !== 'Paid') && (
                <button
                  onClick={() => {
                    currentMonthRun.items
                      .filter((i) => i.paymentStatus !== 'Paid')
                      .forEach((item) => {
                        recordSalaryPayment(currentMonthRun.id, item.employeeId, {
                          paymentDate: new Date().toISOString().slice(0, 10),
                          paymentMethod: 'Bank Transfer',
                          bankAccountName: item.bankName || 'Bank Transfer',
                          transactionReference: `EFT-${currentMonthRun.monthYear || currentMonthRun.payrollMonth}-${item.employeeCode || item.employeeId}`,
                          amountBDT: item.netSalaryBDT ?? item.netPayableBDT ?? 0,
                          disbursedBy: currentUser?.name || 'Accounts Head',
                        });
                      });
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Disburse All Unpaid via Bank EFT</span>
                </button>
              )}
          </div>

          {/* Payments Pending & Paid Table */}
          {!currentMonthRun ? (
            <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No payroll run available for {selectedMonthYear}.
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Designation</th>
                      <th className="py-3 px-4">Bank / Account</th>
                      <th className="py-3 px-4 text-right font-black">Net Salary</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Disbursement Method</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentMonthRun.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{it.employeeName}</div>
                          <span className="font-mono text-[10px] text-blue-600">{it.employeeCode}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{it.designation}</td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div>{it.bankName || '—'}</div>
                          <span className="text-slate-400">{it.bankAccountNo || '—'}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 text-sm">
                          ৳ {(it.netSalaryBDT ?? it.netPayableBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              it.paymentStatus === 'Paid'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {it.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {it.paymentMethod || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {it.paymentStatus !== 'Paid' ? (
                            canDisbursePayroll ? (
                              <button
                                onClick={() => {
                                  setSelectedRunItemForPayment({ runId: currentMonthRun.id, item: it });
                                  setPayBankName(it.bankName || '');
                                  setPayRef(`EFT-${currentMonthRun.monthYear || currentMonthRun.payrollMonth}-${it.employeeCode || it.employeeId}`);
                                  setShowDisburseModal(true);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs"
                              >
                                Disburse
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                                <Lock className="w-3 h-3" />
                                Disbursement Restricted
                              </span>
                            )
                          ) : (
                            <button
                              onClick={() => setViewingPayslip({ run: currentMonthRun, item: it })}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-600 font-bold text-[11px]"
                            >
                              Payslip
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 11: PAYSLIP GENERATION & PRINT                                    */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'payslips' && payrollPagePerms.payslips && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Individual Payslip Generation & Printing
              </h2>
              <p className="text-xs text-slate-500">
                Official corporate pay vouchers with detailed salary component breakdowns and signature seals.
              </p>
            </div>
          </div>

          {/* Payslip employee cards */}
          {!currentMonthRun ? (
            <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No payroll payslips generated for {selectedMonthYear}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentMonthRun.items.map((it) => (
                <div
                  key={it.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3 hover:border-blue-400 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                        {it.employeeName}
                      </h4>
                      <span className="font-mono text-xs text-blue-600 font-semibold">{it.employeeCode}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        it.paymentStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {it.paymentStatus}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Designation</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{it.designation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross Earnings</span>
                      <span className="font-mono font-bold">৳ {(it.totalGrossEarningsBDT ?? it.grossSalaryBDT ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Deductions</span>
                      <span className="font-mono text-rose-500">- ৳ {(it.totalDeductionsBDT || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Net Take Home</span>
                      <span className="font-mono font-black text-emerald-600">
                        ৳ {(it.netSalaryBDT ?? it.netPayableBDT ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setViewingPayslip({ run: currentMonthRun, item: it })}
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition"
                  >
                    {canExportPayroll ? (
                      <>
                        <Printer className="w-3.5 h-3.5" />
                        <span>View & Print Payslip</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Payslip</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 12: PAYROLL REPORTS (13 REPORTS)                                  */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'reports' && payrollPagePerms.reports && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Comprehensive Payroll Reports (13 Standard Formats)
              </h2>
              
            </div>
            {canExportPayroll && (
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report</span>
              </button>
            )}
          </div>

          {/* Report Selector Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {[
              { id: 'rep-register', title: '1. Monthly Salary Register', desc: 'Itemized register for all employees' },
              { id: 'rep-dept', title: '2. Department Cost Summary', desc: 'Departmental salary breakdown' },
              { id: 'rep-bank', title: '3. Bank Transfer Advice', desc: 'Advice list for City & Eastern Bank' },
              { id: 'rep-loan', title: '4. Staff Loan Statement', desc: 'Outstanding balances & deductions' },
              { id: 'rep-ot', title: '5. Overtime Register', desc: 'Hours & amounts by plant department' },
              { id: 'rep-tax', title: '6. Tax Withholding Register', desc: 'Govt NBR tax deduction sheet' },
              { id: 'rep-pf', title: '7. Provident Fund Statement', desc: 'Employer & Employee contributions' },
              { id: 'rep-cash', title: '8. Cash Disbursement Sheet', desc: 'Physical cash voucher list' },
              { id: 'rep-mfs', title: '9. MFS (bKash/Nagad) List', desc: 'Mobile wallet salary transfers' },
              { id: 'rep-att', title: '10. Attendance & Leaves', desc: 'Working days, leaves, and absences' },
              { id: 'rep-bonus', title: '11. Festival & Bonus Sheet', desc: 'Festival and incentive list' },
              { id: 'rep-ytd', title: '12. Year-to-Date Cost', desc: 'Cumulative YTD payroll expenses' },
              { id: 'rep-comp', title: '13. Component Analysis', desc: 'Basic vs Allowance proportion' },
            ].map((rep) => (
              <button
                key={rep.id}
                onClick={() => setSelectedReportId(rep.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedReportId === rep.id
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="font-bold text-xs text-slate-900 dark:text-white">{rep.title}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{rep.desc}</div>
              </button>
            ))}
          </div>

          {/* Selected Report Output View */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                  OFFICIAL AUDIT REPORT
                </span>
                <h3 className="font-black text-slate-900 dark:text-white text-sm">
                  {selectedReportId === 'rep-bank'
                    ? 'Bank Transfer Advice Statement — City Bank PLC'
                    : selectedReportId === 'rep-loan'
                    ? 'Employee Advance & Loan Outstanding Ledger'
                    : selectedReportId === 'rep-tax'
                    ? 'Income Tax & PF Withholding Deduction Schedule'
                    : 'Monthly Corporate Salary & Compensation Register'}
                </h3>
                <span className="text-xs text-slate-500">
                  Period: {selectedMonthYear} • {payrollSettings?.companyName || systemSettings?.branding?.softwareName || 'Ensec ERP'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Report Generated:</span>
                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                  {new Date().toLocaleDateString('en-GB')}
                </span>
              </div>
            </div>

            {/* Render table based on report */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-semibold uppercase">
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Employee Name</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-right">Gross Pay</th>
                    <th className="py-2.5 px-3 text-right">Total Deductions</th>
                    <th className="py-2.5 px-3 text-right font-black text-emerald-600">Net Payable</th>
                    <th className="py-2.5 px-3">Bank Account</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {!currentMonthRun || currentMonthRun.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        No payroll report entries found for {selectedMonthYear}.
                      </td>
                    </tr>
                  ) : (
                    currentMonthRun.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{it.employeeCode}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{it.employeeName}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{it.department}</td>
                        <td className="py-2.5 px-3 text-right font-mono">৳{(it.totalGrossEarningsBDT ?? it.grossSalaryBDT ?? 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                          ৳{(it.totalDeductionsBDT || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600">
                          ৳{(it.netSalaryBDT ?? it.netPayableBDT ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {it.bankName || '—'}{it.bankAccountNo ? ` - ${it.bankAccountNo}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {it.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 13: PAYROLL SETTINGS                                              */}
      {/* ========================================================================= */}
      {!isUnknownExplicitTab && activeTab === 'settings' && payrollPagePerms.settings && (
        <div className="space-y-5 max-w-4xl">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-blue-600" />
                  <span>Corporate Payroll Configuration & Statutory Rules</span>
                </h2>
                {payrollSettings?.updatedAt && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Last updated {new Date(payrollSettings.updatedAt).toLocaleString()}
                    {payrollSettings.updatedBy ? ` by ${payrollSettings.updatedBy}` : ''}
                  </p>
                )}
              </div>
            </div>

            {settingsFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-2.5 ${
                  settingsFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : settingsFeedback.type === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {settingsFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="font-medium leading-relaxed">{settingsFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsFeedback(null)}
                    className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {settingsFeedback.sqlFix && (
                  <div className="space-y-2 pt-1 border-t border-amber-200/70 dark:border-amber-800/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        Supabase SQL Fix (Run Once in SQL Editor)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(settingsFeedback.sqlFix || PAYROLL_SETTINGS_TABLE_SQL);
                              setCopiedSettingsSql(true);
                              setTimeout(() => setCopiedSettingsSql(false), 2500);
                            } catch {}
                          }}
                          className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                        >
                          {copiedSettingsSql ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy SQL</span>
                            </>
                          )}
                        </button>
                        <a
                          href={supabaseSqlEditorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                        >
                          <span>Open SQL Editor</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-40 leading-relaxed border border-slate-800">
                      {settingsFeedback.sqlFix}
                    </pre>
                  </div>
                )}
              </div>
            )}

            

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Standard Working Days Per Month
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.standardWorkingDaysPerMonth}
                  onChange={(e) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      standardWorkingDaysPerMonth: e.target.value,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Standard Daily Working Hours
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.standardDailyHours}
                  onChange={(e) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      standardDailyHours: e.target.value,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* Overtime Hub Deep Link */}
              <div className="sm:col-span-2 p-4 bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl text-white flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    Dedicated Overtime Management & Batch Allocation Hub
                  </h4>
                  <p className="text-xs text-blue-200 mt-0.5">
                    For multi-batch work splits, overnight punches, supervisor approvals, and production costing absorption, use the full Overtime module.
                  </p>
                </div>
                {canAccessOvertimeHub && (
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('ensec-navigate', { detail: 'overtime-management' }));
                    }}
                    className="px-3.5 py-1.5 bg-white text-blue-900 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors"
                  >
                    Open Overtime Hub →
                  </button>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Provident Fund Employee Contribution (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.pfEmployeeContributionPercent}
                  onChange={(e) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      pfEmployeeContributionPercent: e.target.value,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* Shift & GPS Geofence Rules */}
              <div className="sm:col-span-2 pt-3 mt-1 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-blue-600" />
                  <span>Shift Timing & GPS Geofence Validation Thresholds</span>
                </h3>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Default Shift Start Time (12-Hr AM/PM)
                </label>
                <Time12HourInput
                  ariaLabel="Default Shift Start Time"
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.shiftStartTime}
                  onChange={(nextVal) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      shiftStartTime: nextVal || DEFAULT_SHIFT_START_TIME,
                    }));
                  }}
                  className="bg-slate-50 dark:bg-slate-800 py-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Default Shift End Time (12-Hr AM/PM)
                </label>
                <Time12HourInput
                  ariaLabel="Default Shift End Time"
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.shiftEndTime}
                  onChange={(nextVal) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      shiftEndTime: nextVal || DEFAULT_SHIFT_END_TIME,
                    }));
                  }}
                  className="bg-slate-50 dark:bg-slate-800 py-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Late Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.lateGracePeriodMinutes}
                  onChange={(e) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      lateGracePeriodMinutes: e.target.value,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Max Allowed GPS Accuracy (Meters)
                </label>
                <input
                  type="number"
                  min={15}
                  max={500}
                  disabled={!canConfigurePayrollRules || isSavingPayrollSettings}
                  value={settingsForm.maxGpsAccuracyMeters}
                  onChange={(e) => {
                    setHasUnsavedSettingsChanges(true);
                    setSettingsFeedback(null);
                    setSettingsForm((prev) => ({
                      ...prev,
                      maxGpsAccuracyMeters: e.target.value,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                {hasUnsavedSettingsChanges && canConfigurePayrollRules ? (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Unsaved changes pending — click Save Payroll Rules to persist to Supabase.
                  </span>
                ) : !canConfigurePayrollRules ? (
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Read-only: Process Monthly Payroll or Approve Salary Sheet permission required to modify rules.
                  </span>
                ) : null}
              </div>
              {canConfigurePayrollRules && (
                <button
                  type="button"
                  disabled={isSavingPayrollSettings}
                  onClick={async () => {
                    const workingDays = Math.min(
                      31,
                      Math.max(1, Math.round(Number(settingsForm.standardWorkingDaysPerMonth) || 26))
                    );
                    const dailyHours = Math.min(
                      24,
                      Math.max(1, Math.round(Number(settingsForm.standardDailyHours) || 8))
                    );
                    const pfRaw = settingsForm.pfEmployeeContributionPercent.trim();
                    const parsedPf = pfRaw === '' ? 10 : Number(pfRaw);
                    const pfPercent = Number.isFinite(parsedPf)
                      ? Math.min(100, Math.max(0, parsedPf))
                      : 10;
                    const graceRaw = settingsForm.lateGracePeriodMinutes.trim();
                    const parsedGrace = graceRaw === '' ? DEFAULT_GRACE_PERIOD_MINUTES : Number(graceRaw);
                    const graceMinutes = Number.isFinite(parsedGrace)
                      ? Math.min(120, Math.max(0, Math.round(parsedGrace)))
                      : DEFAULT_GRACE_PERIOD_MINUTES;
                    const gpsRaw = settingsForm.maxGpsAccuracyMeters.trim();
                    const parsedGps = gpsRaw === '' ? DEFAULT_MAX_GPS_ACCURACY_METERS : Number(gpsRaw);
                    const maxGpsMeters = Number.isFinite(parsedGps)
                      ? Math.min(500, Math.max(15, Math.round(parsedGps)))
                      : DEFAULT_MAX_GPS_ACCURACY_METERS;
                    const shiftStartTime = settingsForm.shiftStartTime || DEFAULT_SHIFT_START_TIME;
                    const shiftEndTime = settingsForm.shiftEndTime || DEFAULT_SHIFT_END_TIME;

                    setIsSavingPayrollSettings(true);
                    setSettingsFeedback(null);
                    const result = await updatePayrollSettings({
                      standardWorkingDaysPerMonth: workingDays,
                      standardDailyHours: dailyHours,
                      pfEmployeeContributionPercent: pfPercent,
                      deductionRules: {
                        ...(payrollSettings?.deductionRules || {}),
                        pfEmployeeContributionPercent: pfPercent,
                      },
                      shiftStartTime,
                      shiftEndTime,
                      lateGracePeriodMinutes: graceMinutes,
                      maxGpsAccuracyMeters: maxGpsMeters,
                    });
                    setIsSavingPayrollSettings(false);

                    if (!result.success) {
                      setSettingsFeedback({
                        type: 'error',
                        message: result.error || 'Failed to update payroll rules.',
                      });
                      return;
                    }

                    setSettingsForm({
                      standardWorkingDaysPerMonth: String(workingDays),
                      standardDailyHours: String(dailyHours),
                      pfEmployeeContributionPercent: String(pfPercent),
                      shiftStartTime,
                      shiftEndTime,
                      lateGracePeriodMinutes: String(graceMinutes),
                      maxGpsAccuracyMeters: String(maxGpsMeters),
                    });
                    setHasUnsavedSettingsChanges(false);

                    if (result.dbSynced) {
                      setSettingsFeedback({
                        type: 'success',
                        message: 'Corporate Payroll Configuration & Statutory Rules saved to Supabase.',
                      });
                    } else {
                      setSettingsFeedback({
                        type: 'warning',
                        message:
                          result.error ||
                          'Updated locally, but Supabase did not persist to public.payroll_settings.',
                        sqlFix: result.sqlFix || PAYROLL_SETTINGS_TABLE_SQL,
                      });
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
                >
                  {isSavingPayrollSettings ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <span>Save Payroll Rules</span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Overtime Purpose Settings */}
          {(() => {
            const configuredPurposes: OvertimePurposeOption[] =
              Array.isArray(payrollSettings?.overtimePurposes) &&
              payrollSettings.overtimePurposes.length > 0
                ? payrollSettings.overtimePurposes
                : DEFAULT_OVERTIME_PURPOSES;

            const persistPurposeList = async (
              nextPurposes: OvertimePurposeOption[],
              successMessage: string
            ) => {
              setIsSavingPurposes(true);
              setPurposeFeedback(null);
              const result = await updatePayrollSettings({
                overtimePurposes: nextPurposes,
              });
              setIsSavingPurposes(false);

              if (!result.success) {
                setPurposeFeedback({
                  type: 'error',
                  message: result.error || 'Failed to update overtime purposes.',
                });
                return false;
              }

              setPurposeFeedback({
                type: result.dbSynced ? 'success' : 'warning',
                message: result.dbSynced
                  ? successMessage
                  : `${successMessage} (Saved locally; run Supabase SQL migration to persist directly in payroll_settings.overtime_purposes.)`,
              });
              return true;
            };

            const handleAddOvertimePurpose = async (e: React.FormEvent) => {
              e.preventDefault();
              if (!canManageOvertimePurposes || isSavingPurposes) return;
              const trimmed = newPurposeName.trim();
              if (!trimmed) {
                setPurposeFeedback({
                  type: 'error',
                  message: 'Please enter an overtime purpose name.',
                });
                return;
              }
              const duplicate = configuredPurposes.some(
                (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()
              );
              if (duplicate) {
                setPurposeFeedback({
                  type: 'error',
                  message: `"${trimmed}" already exists in Overtime Purpose Settings.`,
                });
                return;
              }
              const nowIso = new Date().toISOString();
              const slug = trimmed
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '')
                .slice(0, 32);
              const nextPurposes: OvertimePurposeOption[] = [
                ...configuredPurposes,
                {
                  id: `otp-${slug || 'custom'}-${Date.now()}`,
                  name: trimmed,
                  isActive: true,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                },
              ];
              const ok = await persistPurposeList(
                nextPurposes,
                `Added overtime purpose "${trimmed}" to Settings.`
              );
              if (ok) {
                setNewPurposeName('');
              }
            };

            const handleSaveEditedPurpose = async (purposeId: string) => {
              if (!canManageOvertimePurposes || isSavingPurposes) return;
              const trimmed = editingPurposeName.trim();
              if (!trimmed) {
                setPurposeFeedback({
                  type: 'error',
                  message: 'Overtime purpose name cannot be empty.',
                });
                return;
              }
              const duplicate = configuredPurposes.some(
                (p) =>
                  p.id !== purposeId &&
                  p.name.trim().toLowerCase() === trimmed.toLowerCase()
              );
              if (duplicate) {
                setPurposeFeedback({
                  type: 'error',
                  message: `Another purpose named "${trimmed}" already exists.`,
                });
                return;
              }
              const nowIso = new Date().toISOString();
              const nextPurposes = configuredPurposes.map((p) =>
                p.id === purposeId ? { ...p, name: trimmed, updatedAt: nowIso } : p
              );
              const ok = await persistPurposeList(
                nextPurposes,
                `Updated overtime purpose to "${trimmed}".`
              );
              if (ok) {
                setEditingPurposeId(null);
                setEditingPurposeName('');
              }
            };

            const handleTogglePurposeActive = async (purpose: OvertimePurposeOption) => {
              if (!canManageOvertimePurposes || isSavingPurposes) return;
              const nextActive = purpose.isActive === false;
              const nowIso = new Date().toISOString();
              const nextPurposes = configuredPurposes.map((p) =>
                p.id === purpose.id ? { ...p, isActive: nextActive, updatedAt: nowIso } : p
              );
              await persistPurposeList(
                nextPurposes,
                `${nextActive ? 'Activated' : 'Deactivated'} overtime purpose "${purpose.name}".`
              );
            };

            return (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-indigo-600" />
                      <span>Overtime Purpose Settings</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Manage active Overtime Purposes loaded dynamically into the Overtime Approval dropdown for QR-automated overtime requests.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 w-fit">
                    {configuredPurposes.filter((p) => p.isActive !== false).length} Active / {configuredPurposes.length} Total
                  </span>
                </div>

                {purposeFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      purposeFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : purposeFeedback.type === 'warning'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <span className="font-medium">{purposeFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setPurposeFeedback(null)}
                      className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {canManageOvertimePurposes ? (
                  <form onSubmit={handleAddOvertimePurpose} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newPurposeName}
                      onChange={(e) => setNewPurposeName(e.target.value)}
                      placeholder="Add new overtime purpose (e.g., Super Vasmol Kesh Kala, Urgent Dispatch)..."
                      disabled={isSavingPurposes}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={isSavingPurposes || !newPurposeName.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isSavingPurposes ? 'Saving...' : 'Add Purpose'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Read-only: Payroll rule or Overtime policy permission is required to add or edit overtime purposes.</span>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {configuredPurposes.map((purpose, idx) => {
                    const isEditing = editingPurposeId === purpose.id;
                    const isActive = purpose.isActive !== false;
                    return (
                      <div
                        key={purpose.id}
                        className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 text-xs"
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                          <span className="font-mono text-[10px] text-slate-400 w-5">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingPurposeName}
                              onChange={(e) => setEditingPurposeName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveEditedPurpose(purpose.id);
                                } else if (e.key === 'Escape') {
                                  setEditingPurposeId(null);
                                  setEditingPurposeName('');
                                }
                              }}
                              autoFocus
                              className="flex-1 px-2.5 py-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
                            />
                          ) : (
                            <span
                              className={`font-semibold ${
                                isActive
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-400 line-through'
                              }`}
                            >
                              {purpose.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                            }`}
                          >
                            {isActive ? 'Active' : 'Inactive'}
                          </span>

                          {canManageOvertimePurposes && (
                            <>
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isSavingPurposes}
                                    onClick={() => void handleSaveEditedPurpose(purpose.id)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Save</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingPurposes}
                                    onClick={() => {
                                      setEditingPurposeId(null);
                                      setEditingPurposeName('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={isSavingPurposes}
                                    onClick={() => {
                                      setEditingPurposeId(purpose.id);
                                      setEditingPurposeName(purpose.name);
                                      setPurposeFeedback(null);
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingPurposes}
                                    onClick={() => void handleTogglePurposeActive(purpose)}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold"
                                  >
                                    {isActive ? 'Disable' : 'Activate'}
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PAYSLIP PREVIEW & OFFICIAL PRINT                                   */}
      {/* ========================================================================= */}
      {viewingPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 text-slate-900 print:m-0 print:p-0 print:border-none print:shadow-none">
            {/* Payslip Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                  ES
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight text-slate-900">
                    {payrollSettings?.companyName || systemSettings?.branding?.softwareName || 'Ensec ERP'}
                  </h3>
                  {payrollSettings?.companyAddress && (
                    <p className="text-[11px] text-slate-500">
                      {payrollSettings.companyAddress}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  PAY VOUCHER / SLIP
                </span>
                <span className="font-mono font-bold text-sm text-blue-600">
                  {viewingPayslip.run.monthYear}
                </span>
              </div>
            </div>

            {/* Employee Information Strip */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl text-xs border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">EMPLOYEE</span>
                <span className="font-bold text-slate-900">{viewingPayslip.item.employeeName}</span>
                <span className="font-mono text-slate-500 block">ID: {viewingPayslip.item.employeeCode}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">DESIGNATION / DEPT</span>
                <span className="font-bold text-slate-900">{viewingPayslip.item.designation}</span>
                <span className="text-slate-500 block">{viewingPayslip.item.department}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">BANK / ACCOUNT</span>
                <span className="font-mono text-slate-800">
                  {viewingPayslip.item.bankName || '—'}{viewingPayslip.item.bankAccountNo ? ` (${viewingPayslip.item.bankAccountNo})` : ''}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">DAYS WORKED</span>
                <span className="font-bold text-slate-800">
                  {viewingPayslip.item.presentDays} of {viewingPayslip.item.totalWorkingDays} Days
                </span>
              </div>
            </div>

            {/* Earnings & Deductions Breakdown Columns */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Earnings */}
              <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block pb-1 border-b">
                  EARNINGS (BDT)
                </span>
                <div className="flex justify-between">
                  <span>Basic Pay</span>
                  <span className="font-mono font-bold">৳ {(viewingPayslip.item.basicSalaryBDT || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>House Rent (50%)</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.houseRentBDT || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Medical Allowance</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.medicalAllowanceBDT || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Conveyance</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.conveyanceAllowanceBDT || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mobile Allowance</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.mobileAllowanceBDT || 0).toLocaleString()}</span>
                </div>
                {(viewingPayslip.item.overtimeAmountBDT || 0) > 0 && (
                  <div className="flex justify-between text-blue-600 font-semibold">
                    <span>Overtime Pay ({viewingPayslip.item.overtimeHours || 0} hrs)</span>
                    <span className="font-mono">৳ {(viewingPayslip.item.overtimeAmountBDT || 0).toLocaleString()}</span>
                  </div>
                )}
                {((viewingPayslip.item.festivalBonusBDT || 0) + (viewingPayslip.item.performanceBonusBDT || 0)) > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Bonuses & Incentives</span>
                    <span className="font-mono">
                      ৳{' '}
                      {(
                        (viewingPayslip.item.festivalBonusBDT || 0) + (viewingPayslip.item.performanceBonusBDT || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t font-black">
                  <span>Gross Earnings</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.totalGrossEarningsBDT ?? viewingPayslip.item.grossSalaryBDT ?? 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-rose-700 block pb-1 border-b">
                  DEDUCTIONS (BDT)
                </span>
                <div className="flex justify-between">
                  <span>Attendance / Absence</span>
                  <span className="font-mono">
                    {viewingPayslip.item.attendanceDeductionBDT
                      ? `৳ ${(viewingPayslip.item.attendanceDeductionBDT || 0).toLocaleString()}`
                      : '৳ 0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Staff Loan Recovery</span>
                  <span className="font-mono text-rose-600 font-semibold">
                    {viewingPayslip.item.advanceLoanDeductionBDT
                      ? `৳ ${(viewingPayslip.item.advanceLoanDeductionBDT || 0).toLocaleString()}`
                      : '৳ 0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Provident Fund (10%)</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.providentFundDeductionBDT ?? viewingPayslip.item.providentFundBDT ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Income Tax Withholding</span>
                  <span className="font-mono">৳ {(viewingPayslip.item.taxDeductionBDT || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t font-black text-rose-600">
                  <span>Total Deductions</span>
                  <span className="font-mono">- ৳ {(viewingPayslip.item.totalDeductionsBDT || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Net Salary Payable */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                  NET TAKE-HOME SALARY
                </span>
                <span className="text-xs text-slate-600 italic">
                  {numberToWordsBDT(viewingPayslip.item.netSalaryBDT ?? viewingPayslip.item.netPayableBDT ?? 0)}
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-700 font-mono">
                ৳ {(viewingPayslip.item.netSalaryBDT ?? viewingPayslip.item.netPayableBDT ?? 0).toLocaleString()}
              </div>
            </div>

            {/* Signature Seals */}
            <div className="grid grid-cols-4 gap-4 pt-8 text-[11px] text-center text-slate-500">
              <div className="border-t border-slate-300 pt-1">Prepared By</div>
              <div className="border-t border-slate-300 pt-1">Checked By (HR)</div>
              <div className="border-t border-slate-300 pt-1">Approved By (Director)</div>
              <div className="border-t border-slate-300 pt-1">Employee Signature</div>
            </div>

            {/* Modal Controls */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t print:hidden">
              {!canExportPayroll && (
                <span className="text-[11px] font-semibold text-slate-500 mr-auto flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Export Pay Slips permission required to print.
                </span>
              )}
              <button
                onClick={() => setViewingPayslip(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-xs"
              >
                Close
              </button>
              {canExportPayroll && (
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Official Payslip</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LOAN REPAYMENT SCHEDULE                                            */}
      {/* ========================================================================= */}
      {viewingLoanSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Loan Repayment Schedule: {viewingLoanSchedule.employeeName}
                </h3>
                <span className="text-xs text-slate-500">
                  Principal: ৳{(viewingLoanSchedule.principalAmountBDT ?? viewingLoanSchedule.approvedAmountBDT ?? viewingLoanSchedule.requestedAmountBDT ?? 0).toLocaleString()} • Tenure: {viewingLoanSchedule.repaymentTenureMonths ?? viewingLoanSchedule.installmentDurationMonths ?? (viewingLoanSchedule.schedule?.length || 0)} Months
                </span>
              </div>
              <button onClick={() => setViewingLoanSchedule(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(viewingLoanSchedule.schedule || []).map((item) => (
                <div
                  key={item.installmentNumber}
                  className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px]">
                      {item.installmentNumber}
                    </span>
                    <div>
                      <span className="font-bold">{item.monthYear}</span>
                      <span className="text-[10px] text-slate-400 block">
                        {item.status === 'Deducted' ? `Paid on ${item.paidDate || item.deductionDate || 'Schedule'}` : 'Scheduled'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold block">৳ {(item.amountBDT ?? item.installmentAmountBDT ?? item.paidAmountBDT ?? 0).toLocaleString()}</span>
                    <span
                      className={`px-2 py-0.2 rounded-full text-[9px] font-bold ${
                        item.status === 'Deducted'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingLoanSchedule(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs"
              >
                Close Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APPLY EMPLOYEE LEAVE                                               */}
      {/* ========================================================================= */}
      {canApplyLeave && showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {canSelectAnyLeaveEmployee
                  ? 'New Employee Leave Application'
                  : 'Apply for Leave'}
              </h3>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canSelectAnyLeaveEmployee && fieldForceReps.length === 0 ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                  No employees found in the Employee Master. Please add at least one employee before applying for leave.
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : !canSelectAnyLeaveEmployee && !selfLeaveProfile ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                  Unable to resolve your user profile for leave submission. Please sign in again.
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setLeaveFormError('');
                  const emp = canSelectAnyLeaveEmployee
                    ? fieldForceReps.find((r) => r.id === leaveEmployeeId) || fieldForceReps[0]
                    : selfLeaveProfile;
                  if (!emp) {
                    setLeaveFormError('Please select an employee.');
                    return;
                  }
                  if (!leaveStartDate || !leaveEndDate) {
                    setLeaveFormError('Please select both Start Date and End Date.');
                    return;
                  }
                  const startMs = Date.parse(`${leaveStartDate}T00:00:00`);
                  const endMs = Date.parse(`${leaveEndDate}T00:00:00`);
                  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
                    setLeaveFormError('End Date cannot be earlier than Start Date.');
                    return;
                  }
                  const daysCount = Math.floor((endMs - startMs) / 86400000) + 1;
                  const trimmedReason = leaveReason.trim();
                  if (!trimmedReason) {
                    setLeaveFormError('Please enter a reason for the leave application.');
                    return;
                  }

                  const createdId = applyLeave({
                    userId: canSelectAnyLeaveEmployee ? undefined : currentUser?.id,
                    employeeId: emp.id,
                    fieldForceId: emp.id,
                    employeeCode: emp.code || emp.id,
                    employeeName: emp.name,
                    department: emp.department || 'Operations',
                    leaveType,
                    startDate: leaveStartDate,
                    endDate: leaveEndDate,
                    daysCount,
                    totalDays: daysCount,
                    reason: trimmedReason,
                  });

                  if (!createdId) {
                    setLeaveFormError('Permission denied or unable to submit leave application.');
                    return;
                  }

                  setShowLeaveModal(false);
                  setLeaveFeedback({
                    type: 'success',
                    message: `Leave application submitted for ${emp.name} (${leaveType}, ${daysCount} day${daysCount === 1 ? '' : 's'}).`,
                  });
                }}
                className="space-y-3 text-xs"
              >
                {leaveFormError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-medium">
                    {leaveFormError}
                  </div>
                )}

                {canSelectAnyLeaveEmployee ? (
                  <div ref={leaveEmployeeDropdownRef} className="relative">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Select Employee*
                    </label>
                    {(() => {
                      const selectedEmp =
                        fieldForceReps.find((r) => r.id === leaveEmployeeId) || fieldForceReps[0];
                      const q = leaveEmployeeSearch.trim().toLowerCase();
                      const filteredEmployees = !q
                        ? fieldForceReps
                        : fieldForceReps.filter((emp) => {
                            const name = (emp.name || '').toLowerCase();
                            const code = (emp.code || '').toLowerCase();
                            const desig = (emp.designation || '').toLowerCase();
                            const dept = (emp.department || '').toLowerCase();
                            const phone = (emp.mobileNumber || '').toLowerCase();
                            return (
                              name.includes(q) ||
                              code.includes(q) ||
                              desig.includes(q) ||
                              dept.includes(q) ||
                              phone.includes(q)
                            );
                          });

                      return (
                        <>
                          <button
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={leaveEmployeeDropdownOpen}
                            onClick={() => {
                              setLeaveEmployeeDropdownOpen((open) => !open);
                              if (!leaveEmployeeDropdownOpen) {
                                setLeaveEmployeeSearch('');
                              }
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                          >
                            <div className="min-w-0 truncate">
                              {selectedEmp ? (
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {selectedEmp.name}{' '}
                                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                                    ({selectedEmp.code} • {selectedEmp.designation})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-400">Select an employee...</span>
                              )}
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                                leaveEmployeeDropdownOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {leaveEmployeeDropdownOpen && (
                            <div className="absolute left-0 right-0 mt-1.5 z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60">
                                <div className="relative">
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                                  <input
                                    type="text"
                                    autoFocus
                                    aria-label="Search employee"
                                    value={leaveEmployeeSearch}
                                    onChange={(e) => setLeaveEmployeeSearch(e.target.value)}
                                    placeholder="Search name, ID, dept, or designation..."
                                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                  />
                                  {leaveEmployeeSearch && (
                                    <button
                                      type="button"
                                      aria-label="Clear search"
                                      onClick={() => setLeaveEmployeeSearch('')}
                                      className="absolute right-2 top-1.5 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div
                                role="listbox"
                                className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70"
                              >
                                {filteredEmployees.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">
                                    No employees matching &ldquo;{leaveEmployeeSearch.trim()}&rdquo;.
                                  </div>
                                ) : (
                                  filteredEmployees.map((emp) => {
                                    const isSelected = emp.id === selectedEmp?.id;
                                    return (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => {
                                          setLeaveEmployeeId(emp.id);
                                          setLeaveEmployeeDropdownOpen(false);
                                          setLeaveEmployeeSearch('');
                                          setLeaveFormError('');
                                        }}
                                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                                          isSelected
                                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                                        }`}
                                      >
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-bold truncate">{emp.name}</span>
                                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                                              {emp.code}
                                            </span>
                                          </div>
                                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                            {emp.designation}
                                            {emp.department ? ` • ${emp.department}` : ''}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Applicant (Your Profile)
                    </label>
                    <div className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {selfLeaveProfile?.name}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {selfLeaveProfile?.code} • {selfLeaveProfile?.designation}
                          {selfLeaveProfile?.department ? ` • ${selfLeaveProfile.department}` : ''}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                        Self Application
                      </span>
                    </div>
                  </div>
                )}

                {(() => {
                  const targetEmpId = canSelectAnyLeaveEmployee
                    ? leaveEmployeeId || fieldForceReps[0]?.id
                    : selfLeaveProfile?.id;
                  const yr = Number((leaveStartDate || todayIso).slice(0, 4)) || new Date().getFullYear();
                  const bal = targetEmpId ? getEmployeeLeaveBalance(targetEmpId, yr) : null;
                  if (!bal) return null;
                  return (
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[10px]">
                      <div>
                        <span className="text-slate-400 block uppercase font-bold">Annual Bal</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {bal.annual.remaining} / {bal.annual.quota}d
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-bold">Casual Bal</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {bal.casual.remaining} / {bal.casual.quota}d
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-bold">Sick Bal</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {bal.sick.remaining} / {bal.sick.quota}d
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Leave Type*
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Casual Leave">Casual Leave</option>
                    <option value="Annual Leave">Annual Leave</option>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Maternity Leave">Maternity Leave</option>
                    <option value="Unpaid Leave">Unpaid Leave</option>
                    <option value="Other Leave">Other Leave</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Start Date*
                    </label>
                    <input
                      type="date"
                      required
                      value={leaveStartDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLeaveStartDate(val);
                        if (val && leaveEndDate && leaveEndDate < val) {
                          setLeaveEndDate(val);
                        }
                        setLeaveFormError('');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      End Date*
                    </label>
                    <input
                      type="date"
                      required
                      min={leaveStartDate || undefined}
                      value={leaveEndDate}
                      onChange={(e) => {
                        setLeaveEndDate(e.target.value);
                        setLeaveFormError('');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>

                {(() => {
                  const sMs = leaveStartDate ? Date.parse(`${leaveStartDate}T00:00:00`) : NaN;
                  const eMs = leaveEndDate ? Date.parse(`${leaveEndDate}T00:00:00`) : NaN;
                  const days =
                    Number.isFinite(sMs) && Number.isFinite(eMs) && eMs >= sMs
                      ? Math.floor((eMs - sMs) / 86400000) + 1
                      : 0;
                  return (
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-800 dark:text-blue-200 flex items-center justify-between">
                      <span className="font-bold">Calculated Duration:</span>
                      <span className="font-mono text-sm font-black">
                        {days} {days === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>
                  );
                })()}

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Reason / Remarks*
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Enter reason for leave..."
                    value={leaveReason}
                    onChange={(e) => {
                      setLeaveReason(e.target.value);
                      setLeaveFormError('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                  >
                    Submit Leave Application
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APPLY LOAN / ADVANCE                                               */}
      {/* ========================================================================= */}
      {canCreatePayroll && showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                New Employee Advance & Loan Application
              </h3>
              <button onClick={() => setShowLoanModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Select Employee*</label>
                <select
                  value={loanEmployeeId}
                  onChange={(e) => setLoanEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {fieldForceReps.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.code} • {emp.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Loan Type*</label>
                <select
                  value={loanType}
                  onChange={(e) => setLoanType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="Employee Loan">Employee Loan (Multi-month tenure)</option>
                  <option value="Salary Advance">Salary Advance (Short term deduction)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Principal Amount (BDT)*</label>
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tenure (Months)*</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={loanTenure}
                    onChange={(e) => setLoanTenure(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-800 dark:text-blue-200">
                <span className="font-bold">Calculated Monthly Installment:</span>
                <span className="font-mono text-sm font-black block">
                  ৳ {loanTenure > 0 ? Math.round(loanAmount / loanTenure).toLocaleString() : 0} / month
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Start Month*</label>
                <input
                  type="text"
                  placeholder="2026-11"
                  value={loanStartMonth}
                  onChange={(e) => setLoanStartMonth(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Purpose / Reason</label>
                <textarea
                  rows={2}
                  value={loanReason}
                  onChange={(e) => setLoanReason(e.target.value)}
                  placeholder="Enter purpose or justification for the advance/loan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              {loanFormError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold">
                  {loanFormError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isSubmittingLoan}
                onClick={() => setShowLoanModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingLoan}
                onClick={async () => {
                  const emp = fieldForceReps.find((r) => r.id === loanEmployeeId) || fieldForceReps[0];
                  if (!emp) {
                    setLoanFormError('No employee selected. Please add an employee first.');
                    return;
                  }
                  const amount = Number(loanAmount) || 0;
                  const tenure = Math.floor(Number(loanTenure) || 0);
                  if (amount <= 0) {
                    setLoanFormError('Principal Amount must be greater than 0 BDT.');
                    return;
                  }
                  if (tenure < 1 || tenure > 60) {
                    setLoanFormError('Repayment Tenure must be between 1 and 60 months.');
                    return;
                  }
                  if (!/^\d{4}-\d{2}$/.test(loanStartMonth.trim())) {
                    setLoanFormError('Start Month must be in YYYY-MM format (e.g. 2026-11).');
                    return;
                  }
                  setLoanFormError('');
                  setIsSubmittingLoan(true);
                  const res = await applyAdvanceLoan({
                    employeeId: emp.id,
                    employeeCode: emp.code,
                    employeeName: emp.name,
                    loanType,
                    principalAmountBDT: amount,
                    repaymentTenureMonths: tenure,
                    monthlyDeductionBDT: Math.round(amount / tenure),
                    deductionStartMonthYear: loanStartMonth.trim(),
                    purpose: loanReason.trim(),
                  });
                  setIsSubmittingLoan(false);
                  if (!res.success) {
                    setLoanFormError(res.error || 'Failed to submit loan application.');
                    return;
                  }
                  setShowLoanModal(false);
                  if (res.dbSynced) {
                    setLoanFeedback({
                      type: 'success',
                      message: `${loanType} of ৳${amount.toLocaleString()} for ${emp.name} saved to Supabase.`,
                    });
                  } else if (res.backedUp) {
                    setLoanFeedback({
                      type: 'warning',
                      message:
                        res.error ||
                        `${loanType} saved to Supabase backup (system_settings), pending RLS policy fix on public.employee_advances_loans.`,
                      sqlFix: res.sqlFix,
                    });
                  } else {
                    setLoanFeedback({
                      type: 'error',
                      message:
                        res.error ||
                        `${loanType} added locally, but could not save to Supabase.`,
                      sqlFix: res.sqlFix,
                    });
                  }
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-50"
              >
                {isSubmittingLoan ? 'Saving...' : 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EARLY LOAN SETTLEMENT                                              */}
      {/* ========================================================================= */}
      {canDisbursePayroll && settlingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Early Loan Settlement: {settlingLoan.employeeName}
              </h3>
              <button onClick={() => setSettlingLoan(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 text-xs">
              <span className="font-bold block text-amber-800 dark:text-amber-200">Remaining Balance to Clear:</span>
              <span className="text-xl font-black font-mono text-amber-700 dark:text-amber-300">
                ৳ {(settlingLoan.remainingAmountBDT ?? settlingLoan.remainingBalanceBDT ?? 0).toLocaleString()}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Receipt Account / Method</label>
                <select
                  value={payBankName}
                  onChange={(e) => setPayBankName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  <option value="City Bank PLC">City Bank PLC</option>
                  <option value="Eastern Bank PLC">Eastern Bank PLC</option>
                  <option value="Cash in Hand">Cash in Hand</option>
                  <option value="bKash Merchant">bKash Merchant</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setSettlingLoan(null)}
                className="px-4 py-2 rounded-xl border text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = settlingLoan;
                  const res = await earlySettleAdvanceLoan(
                    target.id,
                    payBankName || 'City Bank PLC',
                    'Direct Employee Clearance'
                  );
                  setSettlingLoan(null);
                  if (res?.dbSynced) {
                    setLoanFeedback({
                      type: 'success',
                      message: `Early settlement recorded for ${target.employeeName} and synced to Supabase.`,
                    });
                  } else if (res?.backedUp) {
                    setLoanFeedback({
                      type: 'warning',
                      message:
                        res.error ||
                        `Early settlement saved via Supabase backup for ${target.employeeName}.`,
                      sqlFix: res.sqlFix,
                    });
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                Confirm Full Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DISBURSE SALARY                                                    */}
      {/* ========================================================================= */}
      {canDisbursePayroll && showDisburseModal && selectedRunItemForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Disburse Salary: {selectedRunItemForPayment.item.employeeName}
              </h3>
              <button onClick={() => setShowDisburseModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
              <span className="font-bold text-emerald-800">Net Payable:</span>
              <span className="font-mono text-lg font-black text-emerald-700">
                ৳ {(selectedRunItemForPayment.item.netSalaryBDT ?? selectedRunItemForPayment.item.netPayableBDT ?? 0).toLocaleString()}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Disbursement Method*</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  <option value="Bank Transfer">Bank Transfer (EFT / BEFTN)</option>
                  <option value="Cash">Cash in Hand</option>
                  <option value="bKash">bKash MFS</option>
                  <option value="Nagad">Nagad MFS</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bank / Account</label>
                <input
                  type="text"
                  value={payBankName}
                  onChange={(e) => setPayBankName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Transaction Ref No</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowDisburseModal(false)}
                className="px-4 py-2 rounded-xl border text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  recordSalaryPayment(
                    selectedRunItemForPayment.runId,
                    selectedRunItemForPayment.item.employeeId,
                    {
                      paymentDate: payDate,
                      paymentMethod: payMethod,
                      bankAccountName: payBankName,
                      transactionReference: payRef,
                      amountBDT: selectedRunItemForPayment.item.netSalaryBDT ?? selectedRunItemForPayment.item.netPayableBDT ?? 0,
                      disbursedBy: currentUser?.name || 'Accounts Officer',
                    }
                  );
                  setShowDisburseModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                Post Disbursement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EMPLOYEE COMPLETE ATTENDANCE HISTORY & GPS LOG                     */}
      {/* ========================================================================= */}
      {historyEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600" />
                  <span>
                    Attendance History: {historyEmployee.name} ({historyEmployee.code})
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {historyEmployee.department || 'Operations'} • {historyEmployee.designation || 'Executive'} • Office:{' '}
                  {getEmployeeGeoConfig(historyEmployee).assignedOfficeName} (
                  {getEmployeeGeoConfig(historyEmployee).allowedRadiusMeters}m radius)
                </p>
              </div>
              <button
                onClick={() => setHistoryEmployee(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {(() => {
                const empAllLogs = attendanceRecords
                  .filter(
                    (r) =>
                      r.employeeId === historyEmployee.id ||
                      r.fieldForceId === historyEmployee.id ||
                      r.employeeCode === historyEmployee.code
                  )
                  .sort((a, b) => b.date.localeCompare(a.date));
                const empAllRejected = rejectedAttendanceAttempts
                  .filter((a) => a.employeeId === historyEmployee.id || a.employeeCode === historyEmployee.code)
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                        <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Present</div>
                        <div className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-300">
                          {empAllLogs.filter((r) => r.status === 'Present').length}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                        <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Late</div>
                        <div className="text-lg font-black font-mono text-amber-700 dark:text-amber-300">
                          {empAllLogs.filter((r) => r.status === 'Late').length}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50">
                        <div className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">Half Day</div>
                        <div className="text-lg font-black font-mono text-indigo-700 dark:text-indigo-300">
                          {empAllLogs.filter((r) => r.status === 'Half Day' || r.status === 'Half-Day').length}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                        <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">Absent</div>
                        <div className="text-lg font-black font-mono text-rose-700 dark:text-rose-300">
                          {empAllLogs.filter((r) => r.status === 'Absent').length}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">Rejected GPS</div>
                        <div className="text-lg font-black font-mono text-rose-600">{empAllRejected.length}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Check-In</th>
                            <th className="py-2 px-3">In Dist</th>
                            <th className="py-2 px-3">Check-Out</th>
                            <th className="py-2 px-3">Out Dist</th>
                            <th className="py-2 px-3 text-right">Hours</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Late</th>
                            <th className="py-2 px-3">GPS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {empAllLogs.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-6 text-center text-slate-500">
                                No attendance logs found for this employee yet.
                              </td>
                            </tr>
                          ) : (
                            empAllLogs.map((rec) => {
                              const meta = resolveRecordMeta(rec);
                              return (
                                <tr key={rec.id}>
                                  <td className="py-2 px-3 font-mono tabular-nums">{rec.date}</td>
                                  <td className="py-2 px-3 font-mono tabular-nums">{formatTime12Hour(meta.checkIn) || '—'}</td>
                                  <td className="py-2 px-3 font-mono tabular-nums">
                                    {typeof rec.checkInDistanceMeters === 'number'
                                      ? `${Math.round(rec.checkInDistanceMeters)}m`
                                      : '—'}
                                  </td>
                                  <td className="py-2 px-3 font-mono tabular-nums">{formatTime12Hour(meta.checkOut) || '—'}</td>
                                  <td className="py-2 px-3 font-mono tabular-nums">
                                    {typeof rec.checkOutDistanceMeters === 'number'
                                      ? `${Math.round(rec.checkOutDistanceMeters)}m`
                                      : '—'}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-right tabular-nums">
                                    {meta.workHours > 0 ? `${meta.workHours.toFixed(2)}h` : '—'}
                                  </td>
                                  <td className="py-2 px-3 font-bold">{rec.status}</td>
                                  <td className="py-2 px-3 font-mono text-amber-600">
                                    {formatLateDuration(meta.lateMinutes)}
                                  </td>
                                  <td className="py-2 px-3 font-bold">{meta.gpsStatus}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {empAllRejected.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase">
                          Rejected GPS Attempts ({empAllRejected.length})
                        </h4>
                        <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 overflow-x-auto">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead>
                              <tr className="bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900/50 text-[10px] font-bold uppercase text-rose-700">
                                <th className="py-2 px-3">Date & Time</th>
                                <th className="py-2 px-3">Action</th>
                                <th className="py-2 px-3">Distance</th>
                                <th className="py-2 px-3">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-100 dark:divide-rose-900/30">
                              {empAllRejected.map((att) => (
                                <tr key={att.id}>
                                  <td className="py-2 px-3 font-mono">
                                    {att.attendanceDate} {formatTime12Hour(att.attemptTime) || att.attemptTime}
                                  </td>
                                  <td className="py-2 px-3 font-bold">{att.attemptType}</td>
                                  <td className="py-2 px-3 font-mono text-rose-600">
                                    {typeof att.distanceMeters === 'number' ? `${Math.round(att.distanceMeters)}m` : '—'} /{' '}
                                    {att.allowedRadiusMeters}m
                                  </td>
                                  <td className="py-2 px-3 text-rose-700 dark:text-rose-300">{att.rejectionReason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL: EDIT / CONFIGURE EMPLOYEE SALARY STRUCTURE                         */}
      {/* ========================================================================= */}
      {canEditSalaryStructure && showStructureModal && selectedEmployeeForStructure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {editingStructure ? 'Edit Salary Structure' : 'Configure Salary Structure'}: {selectedEmployeeForStructure.name}{' '}
                  ({selectedEmployeeForStructure.code || selectedEmployeeForStructure.id})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selectedEmployeeForStructure.designation || 'Staff'} • {selectedEmployeeForStructure.department || 'Operations'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStructureModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSavingStructure || !canEditSalaryStructure) return;
                const basic = Math.max(0, Number(strBasic) || 0);
                const house = Math.max(0, Number(strHouseRent) || 0);
                const med = Math.max(0, Number(strMedical) || 0);
                const conv = Math.max(0, Number(strConveyance) || 0);
                const mob = Math.max(0, Number(strMobile) || 0);
                const spec = Math.max(0, Number(strSpecial) || 0);
                const other = Math.max(0, Number(strOther) || 0);
                const gross = basic + house + med + conv + mob + spec + other;
                const reason =
                  strRevisionReason.trim() ||
                  (editingStructure ? 'Salary Structure Revision' : 'Initial Structure Creation');

                setIsSavingStructure(true);
                setStructureFeedback(null);

                const res = editingStructure
                  ? await updateSalaryStructure(
                      editingStructure.id,
                      {
                        employeeId: selectedEmployeeForStructure.id,
                        fieldForceId: selectedEmployeeForStructure.id,
                        employeeCode: selectedEmployeeForStructure.code || selectedEmployeeForStructure.id,
                        employeeName: selectedEmployeeForStructure.name || 'Employee',
                        designation: selectedEmployeeForStructure.designation || 'Staff',
                        department: selectedEmployeeForStructure.department || 'Operations',
                        basicSalaryBDT: basic,
                        houseRentBDT: house,
                        medicalAllowanceBDT: med,
                        conveyanceAllowanceBDT: conv,
                        mobileAllowanceBDT: mob,
                        specialAllowanceBDT: spec,
                        otherAllowancesBDT: other,
                        grossSalaryBDT: gross,
                        effectiveFrom: strEffectiveFrom,
                        revisionReason: reason,
                        revisedBy: currentUser?.name || 'HR Admin',
                      },
                      reason
                    )
                  : await addSalaryStructure({
                      employeeId: selectedEmployeeForStructure.id,
                      fieldForceId: selectedEmployeeForStructure.id,
                      employeeCode: selectedEmployeeForStructure.code || selectedEmployeeForStructure.id,
                      employeeName: selectedEmployeeForStructure.name || 'Employee',
                      designation: selectedEmployeeForStructure.designation || 'Staff',
                      department: selectedEmployeeForStructure.department || 'Operations',
                      employeeCategory: selectedEmployeeForStructure.employeeCategory as any,
                      effectiveFrom: strEffectiveFrom,
                      basicSalaryBDT: basic,
                      houseRentBDT: house,
                      medicalAllowanceBDT: med,
                      conveyanceAllowanceBDT: conv,
                      mobileAllowanceBDT: mob,
                      specialAllowanceBDT: spec,
                      otherAllowancesBDT: other,
                      grossSalaryBDT: gross,
                      revisionReason: reason,
                      revisedBy: currentUser?.name || 'HR Admin',
                    });

                setIsSavingStructure(false);
                setShowStructureModal(false);

                if (res.dbSynced) {
                  setStructureFeedback({
                    type: 'success',
                    message: `Salary structure for ${selectedEmployeeForStructure.name} (Gross: ৳${gross.toLocaleString()}) saved to Supabase.`,
                  });
                } else {
                  setStructureFeedback({
                    type: 'warning',
                    message: `Updated locally for ${selectedEmployeeForStructure.name}, but Supabase did NOT save to employee_salary_structures (${
                      res.error || 'database sync failed'
                    }). Run the SQL fix below in Supabase SQL Editor and click "Sync to Supabase".`,
                    sqlFix: res.sqlFix || SALARY_STRUCTURES_TABLE_SQL,
                  });
                }
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="p-5 overflow-y-auto space-y-4">
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-blue-900 dark:text-blue-200 block">Calculated Gross Base Salary</span>
                    <span className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                      Sum of Basic Pay and all configured allowances
                    </span>
                  </div>
                  <span className="text-xl font-black font-mono text-blue-700 dark:text-blue-300">
                    ৳ {(
                      (Number(strBasic) || 0) +
                      (Number(strHouseRent) || 0) +
                      (Number(strMedical) || 0) +
                      (Number(strConveyance) || 0) +
                      (Number(strMobile) || 0) +
                      (Number(strSpecial) || 0) +
                      (Number(strOther) || 0)
                    ).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300">Basic Pay (BDT)*</label>
                      <button
                        type="button"
                        onClick={() => {
                          const base = Math.max(0, Number(strBasic) || 0);
                          setStrHouseRent(Math.round(base * 0.5));
                          setStrMedical(Math.round(base * 0.1));
                        }}
                        className="text-[10px] font-semibold text-blue-600 hover:underline"
                      >
                        Auto-calc 50% House / 10% Med
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      required
                      value={strBasic}
                      onChange={(e) => setStrBasic(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Effective From*</label>
                    <input
                      type="date"
                      required
                      value={strEffectiveFrom}
                      onChange={(e) => setStrEffectiveFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">House Rent Allowance (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={strHouseRent}
                      onChange={(e) => setStrHouseRent(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Medical Allowance (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={strMedical}
                      onChange={(e) => setStrMedical(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Conveyance Allowance (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={strConveyance}
                      onChange={(e) => setStrConveyance(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mobile Allowance (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={strMobile}
                      onChange={(e) => setStrMobile(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Special Allowance (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={strSpecial}
                      onChange={(e) => setStrSpecial(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Other Allowances (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={strOther}
                      onChange={(e) => setStrOther(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Revision Reason / Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Annual Increment / Grade Adjustment"
                    value={strRevisionReason}
                    onChange={(e) => setStrRevisionReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                {editingStructure?.history && editingStructure.history.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Revision History ({editingStructure.history.length})
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <th className="py-1.5 px-3">Effective</th>
                            <th className="py-1.5 px-3 text-right">Basic</th>
                            <th className="py-1.5 px-3 text-right">Gross</th>
                            <th className="py-1.5 px-3">Reason</th>
                            <th className="py-1.5 px-3">Updated By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {editingStructure.history.map((h, i) => (
                            <tr key={i}>
                              <td className="py-1.5 px-3 font-mono">{h.effectiveDate}</td>
                              <td className="py-1.5 px-3 text-right font-mono">৳ {h.basicSalaryBDT.toLocaleString()}</td>
                              <td className="py-1.5 px-3 text-right font-mono font-bold">৳ {h.grossSalaryBDT.toLocaleString()}</td>
                              <td className="py-1.5 px-3">{h.reason}</td>
                              <td className="py-1.5 px-3 text-slate-500">{h.changedBy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
                <button
                  type="button"
                  disabled={isSavingStructure}
                  onClick={() => setShowStructureModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStructure}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm disabled:opacity-60"
                >
                  {isSavingStructure ? 'Saving to Supabase...' : 'Save Salary Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <EmployeeAttendanceCardModal
        isOpen={attendanceCardModal.isOpen}
        initialEmployeeId={attendanceCardModal.employeeId}
        initialMonthYear={attendanceCardModal.monthYear}
        autoDownloadPdf={attendanceCardModal.autoDownloadPdf}
        onClose={() => setAttendanceCardModal({ isOpen: false })}
      />

      <QrAttendanceScannerModal
        isOpen={showQrScannerModal}
        onClose={() => setShowQrScannerModal(false)}
        onScanRecorded={(result) => {
          if (result.date) {
            setSelectedDateForAtt(result.date);
            if (result.date > attDateTo) {
              setAttDateTo(result.date);
            }
            if (result.date < attDateFrom) {
              setAttDateFrom(result.date);
            }
          }
          if (result.employeeName) {
            const otNote = result.overtimeSync?.message ? ` • ${result.overtimeSync.message}` : '';
            setAttendanceFeedback({
              type: 'success',
              message: `QR Attendance: ${result.employeeName} (${result.employeeCode}) — ${
                result.action === 'IN' ? 'IN' : 'OUT'
              } recorded at ${result.time12}.${otNote}`,
            });
          }
        }}
      />
    </div>
  );
};
