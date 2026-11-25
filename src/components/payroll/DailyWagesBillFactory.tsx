import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { Calendar, ChevronDown, Clock, Download, FileText, Filter, Loader2, Printer } from 'lucide-react';
import { useERP } from '../../context/ERPContext.tsx';
import { formatTime12Hour } from '../../lib/geofence.ts';
import { calculateDailyWagesShiftBreakdown } from '../../lib/dailyWagesCalculation.ts';
import { findLinkedUserForEmployee } from '../../lib/fieldForceAuth.ts';

interface DailyWagesBillFactoryProps {
  searchQuery: string;
  departmentFilter: string;
  onDepartmentFilterChange?: (dept: string) => void;
  actionTypeFilter: string;
  officeFilter: string;
  activeMonthHint: string;
  canExport: boolean;
}

interface DailyWagesRow {
  sn: number;
  empId: string;
  name: string;
  employmentType: string;
  gender: string;
  monthlySalary: number;
  workDay: number;
  ratePerDay: number;
  ratePerHour: number;
  dailyRegularHours: number[];
  dailyOvertimeHours: number[];
  dailyHours: number[];
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  presentDays: number;
  totalAmount: number;
  mobileNo: string;
}

const STANDARD_EMPLOYMENT_TYPES = [
  'Supervisor',
  'Operator',
  'Maintenance',
  'Assist. M/O',
  'Machine.Operator',
  'Mfg & Pack',
  'Office peone',
  'Asst. Store Keeper',
  'Lab Assisten',
  'Cleaner',
  'Packing',
  'Security Guard',
];

const normStr = (v?: string) => String(v || '').trim().toLowerCase();

const isEmployeeActive = (rep?: {
  isActive?: boolean;
  status?: string;
  employmentStatus?: string;
} | null): boolean => {
  if (!rep) return false;
  if (rep.isActive === false) return false;
  if (rep.status && normStr(rep.status) !== 'active') return false;
  if (rep.employmentStatus && normStr(rep.employmentStatus) !== 'active') return false;
  return true;
};

const matchesEmpIdentity = (
  emp: { id?: string; code?: string; name?: string },
  rec: { employeeId?: string; fieldForceId?: string; employeeCode?: string; employeeName?: string }
): boolean => {
  const eId = normStr(emp.id);
  const eCode = normStr(emp.code);
  const eName = normStr(emp.name);
  const rId = normStr(rec.employeeId);
  const rFfId = normStr(rec.fieldForceId);
  const rCode = normStr(rec.employeeCode);
  const rName = normStr(rec.employeeName);

  if (eId && (rId === eId || rFfId === eId || rCode === eId)) return true;
  if (eCode && (rCode === eCode || rId === eCode || rFfId === eCode)) return true;
  if (eName && rName && rName === eName) return true;
  return false;
};

const extractYMD = (raw?: string): { ym: string; day: number; ymd: string } | null => {
  const s = String(raw || '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    const d = Number(m[3]);
    if (d >= 1 && d <= 31) {
      return { ym: `${y}-${mo}`, day: d, ymd: `${y}-${mo}-${String(d).padStart(2, '0')}` };
    }
  }

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const d = Number(m[1]);
    const mo = m[2].padStart(2, '0');
    const y = m[3];
    if (d >= 1 && d <= 31) {
      return { ym: `${y}-${mo}`, day: d, ymd: `${y}-${mo}-${String(d).padStart(2, '0')}` };
    }
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = String(dt.getFullYear());
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const d = dt.getDate();
    return { ym: `${y}-${mo}`, day: d, ymd: `${y}-${mo}-${String(d).padStart(2, '0')}` };
  }
  return null;
};

const formatHoursValue = (val: number): string => {
  if (!val) return '0';
  return Number.isInteger(val) ? String(val) : String(Number(val.toFixed(2)));
};

const formatPresentDayValue = (val: number): string => {
  if (!val || val <= 0) return '0';
  return val.toFixed(2);
};

const numberToWordsSimple = (rawAmount: number): string => {
  const amount = Math.max(0, Math.round(rawAmount));
  if (amount === 0) return 'Zero';

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
      str += `${single[Math.floor(n / 100)]} Hundred `;
      n %= 100;
    }
    if (n > 19) {
      str += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    }
    if (n > 9) {
      str += `${teen[n - 10]} `;
      n = 0;
    }
    if (n > 0) {
      str += `${single[n]} `;
    }
    return str.trim();
  };

  let remAmt = amount;
  let words = '';
  const crore = Math.floor(remAmt / 10000000);
  remAmt %= 10000000;
  const lakh = Math.floor(remAmt / 100000);
  remAmt %= 100000;
  const thousand = Math.floor(remAmt / 1000);
  remAmt %= 1000;

  if (crore > 0) words += `${formatHundreds(crore)} Crore `;
  if (lakh > 0) words += `${formatHundreds(lakh)} Lakh `;
  if (thousand > 0) words += `${formatHundreds(thousand)} Thousand `;
  if (remAmt > 0) words += `${formatHundreds(remAmt)} `;

  return words.trim();
};

export const DailyWagesBillFactory: React.FC<DailyWagesBillFactoryProps> = ({
  searchQuery,
  departmentFilter,
  onDepartmentFilterChange,
  actionTypeFilter,
  officeFilter,
  activeMonthHint,
  canExport,
}) => {
  const {
    users,
    fieldForceReps,
    attendanceRecords,
    salaryStructures,
    payrollSettings,
    departments,
    orgHierarchy,
  } = useERP();

  const [monthFilter, setMonthFilter] = useState<string>(
    () => activeMonthHint || new Date().toISOString().slice(0, 7)
  );
  const [employmentTypeFilters, setEmploymentTypeFilters] = useState<string[]>([]);
  const [isEmpTypeDropdownOpen, setIsEmpTypeDropdownOpen] = useState(false);
  const empTypeDropdownRef = useRef<HTMLDivElement>(null);
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const hasUserChangedMonthRef = useRef(false);
  const hasAutoDefaultedDeptRef = useRef(false);

  // Keep month synced with the Attendance Date range if user hasn't manually changed the bill month
  useEffect(() => {
    if (!hasUserChangedMonthRef.current && activeMonthHint && /^\d{4}-\d{2}$/.test(activeMonthHint)) {
      setMonthFilter(activeMonthHint);
    }
  }, [activeMonthHint]);

  useEffect(() => {
    if (!isEmpTypeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        empTypeDropdownRef.current &&
        !empTypeDropdownRef.current.contains(e.target as Node)
      ) {
        setIsEmpTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEmpTypeDropdownOpen]);

  const stripDepartmentCode = (raw: string): string => {
    let result = String(raw || '').trim();
    if (!result) return '';
    const matchedDept = (departments || []).find((d) => {
      const code = String(d.code || '').trim();
      const aliases = [
        d.name,
        d.fullName,
        code && d.name ? `${code} - ${d.name}` : '',
        code && d.name ? `${code}-${d.name}` : '',
      ]
        .map((v) => normStr(v))
        .filter(Boolean);
      if (aliases.includes(normStr(result))) return true;
      return Boolean(code) && result.toUpperCase().startsWith(code.toUpperCase());
    });
    if (matchedDept?.name) {
      return String(matchedDept.name).trim();
    }
    const stripped = result.replace(/^[A-Z]{1,6}-\d+\s*[-–—:]\s*/i, '').trim();
    return stripped || result;
  };

  const availableDepartments = useMemo(() => {
    const activeDepts = (departments || []).filter(
      (d) => !d.status || normStr(d.status) === 'active'
    );
    const seen = new Set<string>();
    const list: string[] = [];
    const addDept = (raw?: string) => {
      const clean = stripDepartmentCode(String(raw || ''));
      if (!clean) return;
      const key = normStr(clean);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(clean);
      }
    };
    activeDepts.forEach((d) => addDept(d.name || d.fullName));
    fieldForceReps.forEach((r) => {
      addDept(r.department);
      (r.departments || []).forEach(addDept);
    });
    return list;
  }, [departments, fieldForceReps]);

  // Select the first department by default when opening Daily Wages Bill of Factory
  useEffect(() => {
    if (hasAutoDefaultedDeptRef.current) return;
    if (availableDepartments.length === 0 || !onDepartmentFilterChange) return;
    hasAutoDefaultedDeptRef.current = true;
    if (!departmentFilter || normStr(departmentFilter) === 'all') {
      onDepartmentFilterChange(availableDepartments[0]);
    }
  }, [availableDepartments, departmentFilter, onDepartmentFilterChange]);

  const availableEmploymentTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...STANDARD_EMPLOYMENT_TYPES,
          ...fieldForceReps
            .map((r) => String(r.employmentType || (r as any).employment_type || '').trim())
            .filter(Boolean),
        ])
      ),
    [fieldForceReps]
  );

  const availableGenders = useMemo(
    () =>
      Array.from(
        new Set([
          'Male',
          'Female',
          ...fieldForceReps
            .map((r) => String(r.gender || '').trim())
            .filter(Boolean),
        ])
      ),
    [fieldForceReps]
  );

  const normalizedSelectedEmpTypes = useMemo(
    () => employmentTypeFilters.map((t) => normStr(t)),
    [employmentTypeFilters]
  );

  const toggleEmploymentTypeFilter = (empType: string) => {
    setEmploymentTypeFilters((prev) => {
      const target = normStr(empType);
      const exists = prev.some((item) => normStr(item) === target);
      if (exists) {
        return prev.filter((item) => normStr(item) !== target);
      }
      return [...prev, empType];
    });
  };

  const activeYearMonth = monthFilter || new Date().toISOString().slice(0, 7);
  const [activeYearNum, activeMonthNum] = useMemo(() => {
    const parts = activeYearMonth.split('-');
    const y = Number(parts[0]) || new Date().getFullYear();
    const m = Number(parts[1]) || new Date().getMonth() + 1;
    return [y, m];
  }, [activeYearMonth]);

  const monthHeadingLabel = useMemo(() => {
    const dt = new Date(activeYearNum, activeMonthNum - 1, 1);
    const monthName = dt.toLocaleString('en-US', { month: 'long' });
    return `${monthName} -${activeYearNum}`;
  }, [activeYearNum, activeMonthNum]);

  const daysInActiveMonth = useMemo(
    () => new Date(activeYearNum, activeMonthNum, 0).getDate(),
    [activeYearNum, activeMonthNum]
  );

  // 9 left metadata cols + daysInActiveMonth + 7 right summary/signature cols (Reg. HR, OT HR, Total HR, Present Day, Amount, Signature, Mobil NO)
  const totalTableCols = 9 + daysInActiveMonth + 7;

  const dayHeaders = useMemo(() => {
    const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return Array.from({ length: daysInActiveMonth }, (_, i) => {
      const dayNum = i + 1;
      const dt = new Date(activeYearNum, activeMonthNum - 1, dayNum);
      return {
        day: dayNum,
        weekday: shortWeekdays[dt.getDay()],
      };
    });
  }, [activeYearNum, activeMonthNum, daysInActiveMonth]);

  const companyDisplayName =
    departmentFilter && normStr(departmentFilter) !== 'all'
      ? stripDepartmentCode(departmentFilter)
      : orgHierarchy?.name?.trim() || 'Stern Industrise LTD';

  const billTitleSuffix = useMemo(() => {
    if (genderFilter === 'all') return '';
    if (normStr(genderFilter) === 'female') return ' (Female)';
    if (normStr(genderFilter) === 'male') return ' (Male)';
    return ` (${genderFilter})`;
  }, [genderFilter]);

  const wagesBillSheet = useMemo(() => {
    const getMonthlyWorkingDays = (year: number, month1Based: number): number => {
      const daysInMonth = new Date(year, month1Based, 0).getDate();
      let workingDays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const weekday = new Date(year, month1Based - 1, d).getDay();
        if (weekday !== 5) {
          workingDays++;
        }
      }
      return Math.max(1, workingDays);
    };

    const monthWorkDays = getMonthlyWorkingDays(activeYearNum, activeMonthNum);
    const dailyWorkingHours =
      Number(payrollSettings?.standardDailyHours || payrollSettings?.standardWorkHoursPerDay) || 8;
    const configuredShiftEndTime = payrollSettings?.shiftEndTime || '';
    const configuredShiftStartTime = payrollSettings?.shiftStartTime || '';

    const q = searchQuery.trim().toLowerCase();

    const matchedEmployees = fieldForceReps
      .filter((rep) => {
        if (!isEmployeeActive(rep)) return false;

        const linkedUser = findLinkedUserForEmployee(rep, users);
        const office = linkedUser?.assignedOfficeName || rep.branchWorkplace || 'Head Office';
        const empDept = rep.department || rep.departments?.[0] || 'Operations';
        const empType = rep.employmentType || (rep as any).employment_type || '-';
        const empGender = rep.gender || '-';

        if (q) {
          const hay = `${rep.code || ''} ${rep.name || ''} ${empDept} ${empType} ${rep.employeeCategory || ''} ${rep.actionType || ''} ${office}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }

        if (departmentFilter && departmentFilter !== 'All') {
          const deptList = [empDept, ...(rep.departments || [])];
          const matchesDept = deptList.some(
            (d) =>
              normStr(d) === normStr(departmentFilter) ||
              normStr(stripDepartmentCode(d)) === normStr(stripDepartmentCode(departmentFilter))
          );
          if (!matchesDept) return false;
        }

        if (actionTypeFilter && actionTypeFilter !== 'All') {
          if ((rep.actionType || '') !== actionTypeFilter) return false;
        }

        if (officeFilter && officeFilter !== 'All') {
          if (office !== officeFilter) return false;
        }

        if (
          normalizedSelectedEmpTypes.length > 0 &&
          !normalizedSelectedEmpTypes.includes(normStr(empType))
        ) {
          return false;
        }

        if (genderFilter !== 'all' && normStr(empGender) !== normStr(genderFilter)) {
          return false;
        }

        return true;
      })
      .sort((a, b) =>
        String(a.code || a.id).localeCompare(String(b.code || b.id), undefined, { numeric: true })
      );

    const monthAttendanceRecords = (attendanceRecords || []).filter((rec) => {
      const parsed = extractYMD(rec.date);
      if (parsed) return parsed.ym === activeYearMonth;
      return String(rec.date || '').startsWith(activeYearMonth);
    });

    const rows: DailyWagesRow[] = matchedEmployees.map((rep, index) => {
      const str = salaryStructures.find(
        (s) =>
          s.employeeId === rep.id ||
          s.fieldForceId === rep.id ||
          (rep.code && (s.employeeId === rep.code || s.employeeCode === rep.code))
      );

      const monthlySalary = Math.round(
        Number(str?.basicSalaryBDT || rep.basicSalaryBDT || str?.grossSalaryBDT || 0)
      );
      const workDay = monthWorkDays;
      const ratePerDay = workDay > 0 ? Math.round(monthlySalary / workDay) : 0;
      const ratePerHour = dailyWorkingHours > 0 ? Math.round(ratePerDay / dailyWorkingHours) : 0;

      const dailyRegularHours = new Array(daysInActiveMonth).fill(0);
      const dailyOvertimeHours = new Array(daysInActiveMonth).fill(0);
      const dailyHours = new Array(daysInActiveMonth).fill(0);
      const seenDayRecordKeys = new Set<string>();

      monthAttendanceRecords.forEach((rec) => {
        if (!matchesEmpIdentity(rep, rec)) return;
        const parsed = extractYMD(rec.date);
        if (!parsed || parsed.day < 1 || parsed.day > daysInActiveMonth) return;

        const dedupKey = `${parsed.ymd}::${rec.id || ''}`;
        if (seenDayRecordKeys.has(dedupKey)) return;
        seenDayRecordKeys.add(dedupKey);

        const checkIn = rec.checkInTime || rec.inTime || '';
        const checkOut = rec.checkOutTime || rec.outTime || '';
        let regHrs = 0;
        let otHrs = 0;
        let totHrs = 0;

        if (checkIn && checkOut) {
          const breakdown = calculateDailyWagesShiftBreakdown({
            checkInTime: checkIn,
            checkOutTime: checkOut,
            defaultShiftEndTime: configuredShiftEndTime,
            defaultShiftStartTime: configuredShiftStartTime,
          });
          regHrs = breakdown.regularHours;
          otHrs = breakdown.overtimeHours;
          totHrs = breakdown.totalHours;
        } else if (
          rec.status !== 'Absent' &&
          rec.status !== 'Leave' &&
          rec.status !== 'Paid Leave' &&
          rec.status !== 'Unpaid Leave' &&
          typeof rec.workHours === 'number' &&
          rec.workHours > 0
        ) {
          const manualTotal = Math.round(rec.workHours * 100) / 100;
          const manualOt =
            typeof rec.overtimeHours === 'number' && rec.overtimeHours > 0
              ? Math.min(Math.round(rec.overtimeHours * 100) / 100, manualTotal)
              : 0;
          otHrs = manualOt;
          regHrs = Math.max(0, Math.round((manualTotal - otHrs) * 100) / 100);
          totHrs = Math.round((regHrs + otHrs) * 100) / 100;
        }

        if (totHrs > 0 || regHrs > 0 || otHrs > 0) {
          const idx = parsed.day - 1;
          dailyRegularHours[idx] = Math.round((dailyRegularHours[idx] + regHrs) * 100) / 100;
          dailyOvertimeHours[idx] = Math.round((dailyOvertimeHours[idx] + otHrs) * 100) / 100;
          dailyHours[idx] = Math.round((dailyHours[idx] + totHrs) * 100) / 100;
        }
      });

      const regularHours = Math.round(dailyRegularHours.reduce((sum, h) => sum + h, 0) * 100) / 100;
      const overtimeHours = Math.round(dailyOvertimeHours.reduce((sum, h) => sum + h, 0) * 100) / 100;
      const totalHours = Math.round((regularHours + overtimeHours) * 100) / 100;
      const presentDays = dailyWorkingHours > 0 ? totalHours / dailyWorkingHours : 0;
      const totalAmount =
        workDay > 0 && dailyWorkingHours > 0
          ? Math.round((monthlySalary / workDay) * presentDays)
          : 0;

      return {
        sn: index + 1,
        empId: rep.code || rep.id,
        name: rep.name || 'Worker',
        employmentType: rep.employmentType || (rep as any).employment_type || '-',
        gender: rep.gender || '-',
        monthlySalary,
        workDay,
        ratePerDay,
        ratePerHour,
        dailyRegularHours,
        dailyOvertimeHours,
        dailyHours,
        regularHours,
        overtimeHours,
        totalHours,
        presentDays,
        totalAmount,
        mobileNo: rep.phone || '',
      };
    });

    const dailyTotals = new Array(daysInActiveMonth).fill(0);
    let grandRegularHours = 0;
    let grandOvertimeHours = 0;
    let grandTotalHours = 0;
    let grandTotalAmount = 0;

    rows.forEach((row) => {
      row.dailyHours.forEach((h, i) => {
        dailyTotals[i] = Math.round((dailyTotals[i] + h) * 100) / 100;
      });
      grandRegularHours += row.regularHours;
      grandOvertimeHours += row.overtimeHours;
      grandTotalHours += row.totalHours;
      grandTotalAmount += row.totalAmount;
    });

    grandRegularHours = Math.round(grandRegularHours * 100) / 100;
    grandOvertimeHours = Math.round(grandOvertimeHours * 100) / 100;
    grandTotalHours = Math.round(grandTotalHours * 100) / 100;
    const grandPresentDays = dailyWorkingHours > 0 ? grandTotalHours / dailyWorkingHours : 0;

    return {
      rows,
      dailyTotals,
      grandRegularHours,
      grandOvertimeHours,
      grandTotalHours,
      grandPresentDays,
      grandTotalAmount: Math.round(grandTotalAmount),
      amountInWords: numberToWordsSimple(grandTotalAmount),
    };
  }, [
    users,
    fieldForceReps,
    attendanceRecords,
    salaryStructures,
    payrollSettings,
    departments,
    searchQuery,
    departmentFilter,
    actionTypeFilter,
    officeFilter,
    normalizedSelectedEmpTypes,
    genderFilter,
    activeYearMonth,
    activeYearNum,
    activeMonthNum,
    daysInActiveMonth,
  ]);

  const handlePrint = () => {
    if (!canExport) return;
    document.body.classList.add('printing-wages-bill');
    const cleanup = () => {
      document.body.classList.remove('printing-wages-bill');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  };

  const handleDownloadPdf = async () => {
    if (!canExport || isExportingPdf) return;
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;

    setIsExportingPdf(true);
    setPdfError(null);

    const applyCompactPdfStyles = (rootEl: HTMLElement) => {
      rootEl.style.border = 'none';
      rootEl.style.borderRadius = '0';
      rootEl.style.boxShadow = 'none';
      rootEl.style.padding = '8px 10px';
      rootEl.style.margin = '0';
      rootEl.style.backgroundColor = '#ffffff';
      rootEl.style.width = 'max-content';
      rootEl.style.maxWidth = 'none';

      const styleTag = rootEl.ownerDocument.createElement('style');
      styleTag.textContent = `
        [data-wages-pdf-root="true"] table {
          width: auto !important;
          border-collapse: collapse !important;
          font-size: 9.5px !important;
        }
        [data-wages-pdf-root="true"] th,
        [data-wages-pdf-root="true"] td {
          padding: 2.5px 3px !important;
          line-height: 1.15 !important;
        }
        [data-wages-pdf-root="true"] [data-wages-day-col="true"] {
          min-width: 17px !important;
          padding-left: 1.5px !important;
          padding-right: 1.5px !important;
        }
        [data-wages-pdf-root="true"] [data-wages-sig-col="true"] {
          min-width: 54px !important;
        }
        [data-wages-pdf-root="true"] [data-wages-mob-col="true"] {
          min-width: 66px !important;
        }
        [data-wages-pdf-root="true"] [data-wages-footer="true"] > div:last-child {
          margin-top: 28px !important;
          margin-bottom: 4px !important;
        }
      `;
      rootEl.setAttribute('data-wages-pdf-root', 'true');
      rootEl.prepend(styleTag);

      const wrapEl = rootEl.querySelector('[data-wages-table-wrap="true"]') as HTMLElement | null;
      if (wrapEl) {
        wrapEl.style.overflow = 'visible';
        wrapEl.style.width = 'max-content';
      }

      const dayHeadersAndCells = rootEl.querySelectorAll('th, td');
      dayHeadersAndCells.forEach((cell) => {
        const el = cell as HTMLElement;
        if (el.className.includes('min-w-[20px]')) {
          el.setAttribute('data-wages-day-col', 'true');
        } else if (el.className.includes('min-w-[72px]')) {
          el.setAttribute('data-wages-sig-col', 'true');
        } else if (el.className.includes('min-w-[84px]')) {
          el.setAttribute('data-wages-mob-col', 'true');
        }
      });

      const tableEl = rootEl.querySelector('table') as HTMLElement | null;
      const fullTableWidth = tableEl ? Math.max(1200, Math.ceil(tableEl.scrollWidth + 24)) : 1320;
      rootEl.style.width = `${fullTableWidth}px`;
      return fullTableWidth;
    };

    let measureHost: HTMLDivElement | null = null;

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 5;
      const marginY = 5;
      const maxW = pageWidth - marginX * 2;
      const maxH = pageHeight - marginY * 2;

      // Measure exact rendered heights offscreen using the same compact PDF styles
      measureHost = document.createElement('div');
      measureHost.style.position = 'fixed';
      measureHost.style.left = '-100000px';
      measureHost.style.top = '0';
      measureHost.style.width = '2400px';
      measureHost.style.visibility = 'hidden';
      measureHost.style.pointerEvents = 'none';
      measureHost.style.zIndex = '-1';

      const measureEl = sheetEl.cloneNode(true) as HTMLElement;
      measureHost.appendChild(measureEl);
      document.body.appendChild(measureHost);

      const fullTableWidth = applyCompactPdfStyles(measureEl);
      const maxPageHeightPx = Math.max(400, Math.floor(fullTableWidth * (maxH / maxW)) - 14);

      const totalSheetHeight = measureEl.getBoundingClientRect().height;
      const theadEl = measureEl.querySelector('thead') as HTMLElement | null;
      const totalRowEl = measureEl.querySelector('[data-wages-row="total"]') as HTMLElement | null;
      const footerEl = measureEl.querySelector('[data-wages-footer="true"]') as HTMLElement | null;
      const workerRowEls = Array.from(measureEl.querySelectorAll('[data-wages-row="worker"]')) as HTMLElement[];

      const theadHeight = theadEl ? theadEl.getBoundingClientRect().height : 44;
      const totalRowHeight = totalRowEl ? totalRowEl.getBoundingClientRect().height : 26;
      const footerHeight = footerEl ? footerEl.getBoundingClientRect().height + 10 : 75;
      const workerHeights = workerRowEls.map((tr) => tr.getBoundingClientRect().height);
      const allWorkersHeight = workerHeights.reduce((sum, h) => sum + h, 0);
      const titleAndPaddingHeight = Math.max(
        48,
        totalSheetHeight - theadHeight - allWorkersHeight - totalRowHeight - footerHeight
      );

      document.body.removeChild(measureHost);
      measureHost = null;

      const baseChromeHeight = titleAndPaddingHeight + theadHeight + 8;
      const footerChromeHeight = totalRowHeight + footerHeight;

      interface PdfPageSlice {
        start: number;
        end: number;
        includeFooter: boolean;
      }

      const pages: PdfPageSlice[] = [];
      if (workerHeights.length === 0) {
        pages.push({ start: 0, end: 0, includeFooter: true });
      } else {
        let startIdx = 0;
        while (startIdx < workerHeights.length) {
          let usedHeight = baseChromeHeight;
          let endIdx = startIdx;
          while (endIdx < workerHeights.length) {
            const nextH = workerHeights[endIdx];
            if (endIdx > startIdx && usedHeight + nextH > maxPageHeightPx) {
              break;
            }
            usedHeight += nextH;
            endIdx++;
          }

          const isFinalBatch = endIdx === workerHeights.length;
          if (!isFinalBatch) {
            pages.push({ start: startIdx, end: endIdx, includeFooter: false });
            startIdx = endIdx;
          } else {
            if (usedHeight + footerChromeHeight <= maxPageHeightPx || endIdx - startIdx <= 1) {
              pages.push({ start: startIdx, end: endIdx, includeFooter: true });
            } else {
              // Move the last few rows to the final page so Total + Signatory Footer stay paired with workers
              const moveRows = Math.min(4, Math.max(1, endIdx - startIdx - 1));
              const splitIdx = endIdx - moveRows;
              pages.push({ start: startIdx, end: splitIdx, includeFooter: false });
              pages.push({ start: splitIdx, end: endIdx, includeFooter: true });
            }
            break;
          }
        }
      }

      const totalPages = pages.length;

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const slice = pages[pageIdx];

        const canvas = await html2canvas(sheetEl, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 2400,
          windowHeight: 1600,
          onclone: (_clonedDoc, clonedEl) => {
            const workerRows = Array.from(clonedEl.querySelectorAll('[data-wages-row="worker"]')) as HTMLElement[];
            workerRows.forEach((tr, idx) => {
              if (idx < slice.start || idx >= slice.end) {
                tr.style.display = 'none';
              }
            });

            const totalRow = clonedEl.querySelector('[data-wages-row="total"]') as HTMLElement | null;
            if (totalRow && !slice.includeFooter) {
              totalRow.style.display = 'none';
            }

            const clonedFooterEl = clonedEl.querySelector('[data-wages-footer="true"]') as HTMLElement | null;
            if (clonedFooterEl && !slice.includeFooter) {
              clonedFooterEl.style.display = 'none';
            }

            const pageLabelEl = clonedEl.querySelector('[data-wages-page-label="true"]') as HTMLElement | null;
            if (pageLabelEl) {
              if (totalPages > 1) {
                pageLabelEl.textContent = `Page ${pageIdx + 1} of ${totalPages}`;
                pageLabelEl.classList.remove('hidden');
                pageLabelEl.style.display = 'block';
              } else {
                pageLabelEl.style.display = 'none';
              }
            }

            applyCompactPdfStyles(clonedEl);
            clonedEl.style.width = `${fullTableWidth}px`;
          },
        });

        if (pageIdx > 0) {
          pdf.addPage('a4', 'landscape');
        }

        const aspect = canvas.width / canvas.height;
        let renderW = maxW;
        let renderH = renderW / aspect;
        if (renderH > maxH) {
          renderH = maxH;
          renderW = renderH * aspect;
        }
        const offsetX = (pageWidth - renderW) / 2;
        const offsetY = marginY;
        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
      }

      const safeSuffix = billTitleSuffix
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const fileName = `Daily_Wages_Bill_Factory_${activeYearMonth}${safeSuffix ? `_${safeSuffix}` : ''}_Landscape.pdf`;
      pdf.save(fileName);
    } catch (err: any) {
      setPdfError(err?.message || 'Failed to generate Landscape PDF. Please try again.');
    } finally {
      if (measureHost && measureHost.parentNode) {
        measureHost.parentNode.removeChild(measureHost);
      }
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    if (!canExport) return;
    const sheetRows: any[][] = [];
    sheetRows.push([companyDisplayName]);
    sheetRows.push([`Daily Wages Bill of Factory${billTitleSuffix}`]);
    sheetRows.push([`For the month of ${monthHeadingLabel}`]);
    sheetRows.push([
      '', '', '', '', '', '', '', '', '',
      ...dayHeaders.map((d) => d.weekday),
      '', '', '', '', '', '', '',
    ]);
    sheetRows.push([
      'S/N',
      'EMP ID',
      'Name Of Worker',
      'Employment Type',
      'Gender',
      'Monthly Salary',
      'Work Day',
      'Rate/ Day',
      'Rate/ Hrs',
      ...dayHeaders.map((d) => d.day),
      'Reg. HR',
      'OT HR',
      'Total HR',
      'Present Day',
      'Amount',
      'Signature',
      'Mobil NO',
    ]);

    wagesBillSheet.rows.forEach((row) => {
      sheetRows.push([
        row.sn,
        row.empId,
        row.name,
        row.employmentType,
        row.gender,
        row.monthlySalary,
        row.workDay,
        row.ratePerDay,
        row.ratePerHour,
        ...row.dailyHours.map((h) => (h > 0 ? Number(h.toFixed(2)) : '')),
        row.regularHours > 0 ? Number(row.regularHours.toFixed(2)) : 0,
        row.overtimeHours > 0 ? Number(row.overtimeHours.toFixed(2)) : 0,
        row.totalHours > 0 ? Number(row.totalHours.toFixed(2)) : 0,
        row.presentDays > 0 ? Number(row.presentDays.toFixed(2)) : 0,
        row.totalAmount,
        '',
        row.mobileNo,
      ]);
    });

    sheetRows.push([
      'Total',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ...wagesBillSheet.dailyTotals.map((t) => (t > 0 ? Number(t.toFixed(2)) : '')),
      wagesBillSheet.grandRegularHours > 0 ? Number(wagesBillSheet.grandRegularHours.toFixed(2)) : 0,
      wagesBillSheet.grandOvertimeHours > 0 ? Number(wagesBillSheet.grandOvertimeHours.toFixed(2)) : 0,
      wagesBillSheet.grandTotalHours > 0 ? Number(wagesBillSheet.grandTotalHours.toFixed(2)) : 0,
      wagesBillSheet.grandPresentDays > 0 ? Number(wagesBillSheet.grandPresentDays.toFixed(2)) : 0,
      wagesBillSheet.grandTotalAmount,
      '',
      '',
    ]);
    sheetRows.push([]);
    sheetRows.push(['', `TK. ${wagesBillSheet.amountInWords} Only .`]);
    sheetRows.push([]);
    sheetRows.push([]);
    sheetRows.push([
      '',
      'Prepared By',
      '',
      '',
      'Checked By',
      ...Array(Math.max(1, totalTableCols - 8)).fill(''),
      'Approved BY',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalTableCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalTableCols - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: totalTableCols - 1 } },
      {
        s: { r: 5 + wagesBillSheet.rows.length, c: 0 },
        e: { r: 5 + wagesBillSheet.rows.length, c: 2 },
      },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Wages Bill');
    XLSX.writeFile(wb, `Daily_Wages_Bill_Factory_${activeYearMonth}.xlsx`);
  };

  return (
    <div className="space-y-3">
      {/* Report Filter & Action Bar */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-bold text-slate-700 dark:text-slate-300">Report Filters:</span>

          {/* Department Selector (updates report title name) */}
          {onDepartmentFilterChange && (
            <select
              aria-label="Department"
              value={departmentFilter || 'All'}
              onChange={(e) => onDepartmentFilterChange(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 font-semibold"
            >
              <option value="All">All Departments</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}

          {/* Employment Type Multi-select */}
          <div className="relative" ref={empTypeDropdownRef}>
            <button
              type="button"
              aria-label="Employment Type"
              aria-expanded={isEmpTypeDropdownOpen}
              onClick={() => setIsEmpTypeDropdownOpen((prev) => !prev)}
              title={
                employmentTypeFilters.length > 0
                  ? employmentTypeFilters.join(', ')
                  : 'All Employment Types'
              }
              className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-2 min-w-[175px] hover:border-slate-300 font-semibold"
            >
              <span className="truncate max-w-[160px]">
                {employmentTypeFilters.length === 0
                  ? 'All Employment Types'
                  : employmentTypeFilters.length === 1
                  ? employmentTypeFilters[0]
                  : `${employmentTypeFilters.length} Employment Types`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {isEmpTypeDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-30 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1.5">
                <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 dark:border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setEmploymentTypeFilters([])}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    All (Clear)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmploymentTypeFilters([...availableEmploymentTypes])}
                    className="text-slate-600 dark:text-slate-400 hover:underline font-medium"
                  >
                    Select All
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {availableEmploymentTypes.map((empType) => {
                    const checked = normalizedSelectedEmpTypes.includes(normStr(empType));
                    return (
                      <label
                        key={empType}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-slate-200 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmploymentTypeFilter(empType)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{empType}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Gender Filter */}
          <select
            aria-label="Gender"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 font-semibold"
          >
            <option value="all">All Genders</option>
            {availableGenders.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          {/* Month Filter */}
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 ml-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="font-semibold">Month:</span>
            <input
              type="month"
              value={activeYearMonth}
              onChange={(e) => {
                hasUserChangedMonthRef.current = true;
                if (e.target.value) setMonthFilter(e.target.value);
              }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            title="Configured in Payroll & HR → Settings → Default Shift End Time (12-Hr AM/PM)"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">Shift End (Settings):</span>
            <span className="font-mono font-bold">
              {formatTime12Hour(payrollSettings?.shiftEndTime) || 'Not Set'}
            </span>
          </div>
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              title="Download A4 Landscape PDF"
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-colors"
            >
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>{isExportingPdf ? 'Generating PDF...' : 'Download PDF (Landscape)'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
          </div>
        )}
      </div>

      {pdfError && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 px-3.5 py-2 rounded-xl text-xs font-medium flex items-center justify-between print:hidden">
          <span>{pdfError}</span>
          <button
            type="button"
            onClick={() => setPdfError(null)}
            className="text-[11px] font-bold underline ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Exact Screenshot-Style Daily Wages Bill of Factory Sheet */}
      <div
        ref={sheetRef}
        id="daily-wages-bill-sheet"
        className="relative bg-white text-black rounded-2xl border border-slate-300 shadow-2xs p-4 font-serif print:border-none print:shadow-none print:p-0"
      >
        <div
          data-wages-page-label="true"
          className="hidden absolute top-2 right-3 text-[10px] font-sans font-semibold text-slate-600"
        />

        {/* Centered Company & Bill Titles */}
        <div className="text-center leading-snug mb-1.5 text-black">
          <div className="text-[14px] font-bold tracking-tight">{companyDisplayName}</div>
          <div className="text-[12px] font-bold">
            Daily Wages Bill of Factory{billTitleSuffix}
          </div>
          <div className="text-[11px] font-bold">
            For the month of {monthHeadingLabel}
          </div>
        </div>

        <div data-wages-table-wrap="true" className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px] text-black">
            <thead>
              {/* Sub-header Row: blank cells on left/right, Weekday labels above 1..daysInMonth */}
              <tr>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                {dayHeaders.map((d) => (
                  <th
                    key={`wk-${d.day}`}
                    className="border border-black px-0.5 py-0.5 text-center font-normal text-[9px] bg-white min-w-[20px]"
                  >
                    {d.weekday}
                  </th>
                ))}
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
                <th className="border border-black px-1 py-0.5 bg-white"></th>
              </tr>

              {/* Main Header Row */}
              <tr className="font-bold text-center bg-white">
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">S/N</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">EMP ID</th>
                <th className="border border-black px-2 py-1 whitespace-nowrap">Name Of Worker</th>
                <th className="border border-black px-2 py-1 whitespace-nowrap">Employment Type</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Gender</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Monthly Salary</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap leading-tight">
                  Work
                  <br />
                  Day
                </th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Rate/ Day</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Rate/ Hrs</th>
                {dayHeaders.map((d) => (
                  <th
                    key={`day-${d.day}`}
                    className="border border-black px-0.5 py-1 text-center font-bold min-w-[20px]"
                  >
                    {d.day}
                  </th>
                ))}
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Reg. HR</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">OT HR</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Total HR</th>
                <th className="border border-black px-1.5 py-1 whitespace-nowrap">Present Day</th>
                <th className="border border-black px-2 py-1 whitespace-nowrap">Amount</th>
                <th className="border border-black px-3 py-1 whitespace-nowrap min-w-[72px]">
                  Signature
                </th>
                <th className="border border-black px-2 py-1 whitespace-nowrap min-w-[84px]">
                  Mobil NO
                </th>
              </tr>
            </thead>

            <tbody>
              {wagesBillSheet.rows.length === 0 ? (
                <tr data-wages-row="empty">
                  <td
                    colSpan={totalTableCols}
                    className="border border-black py-6 text-center text-[11px] font-sans text-slate-500"
                  >
                    No employees or attendance records found for the selected filters.
                  </td>
                </tr>
              ) : (
                wagesBillSheet.rows.map((row) => (
                  <tr key={`${row.empId}-${row.sn}`} data-wages-row="worker">
                    <td className="border border-black px-1 py-0.5 text-center font-sans">
                      {row.sn}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-bold whitespace-nowrap">
                      {row.empId}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-left font-bold whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center whitespace-nowrap font-sans">
                      {row.employmentType}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center whitespace-nowrap font-sans">
                      {row.gender}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {row.monthlySalary}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center font-sans">
                      {row.workDay}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {row.ratePerDay}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {row.ratePerHour}
                    </td>
                    {row.dailyHours.map((hrs, idx) => {
                      const reg = row.dailyRegularHours[idx] || 0;
                      const ot = row.dailyOvertimeHours[idx] || 0;
                      return (
                        <td
                          key={`cell-${row.sn}-${idx}`}
                          title={
                            hrs > 0
                              ? `Regular: ${formatHoursValue(reg)}h | OT: ${formatHoursValue(ot)}h | Total: ${formatHoursValue(hrs)}h`
                              : undefined
                          }
                          className="border border-black px-0.5 py-0.5 text-center font-sans leading-tight"
                        >
                          {hrs > 0 ? (
                            ot > 0 ? (
                              <div className="flex flex-col items-center">
                                <span>{formatHoursValue(reg)}</span>
                                <span className="text-[8px] font-semibold">
                                  +{formatHoursValue(ot)}
                                </span>
                              </div>
                            ) : (
                              formatHoursValue(reg)
                            )
                          ) : (
                            ''
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {formatHoursValue(row.regularHours)}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {formatHoursValue(row.overtimeHours)}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans font-semibold">
                      {formatHoursValue(row.totalHours)}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {formatPresentDayValue(row.presentDays)}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                      {row.totalAmount}
                    </td>
                    <td className="border border-black px-2 py-0.5"></td>
                    <td className="border border-black px-1.5 py-0.5 text-center whitespace-nowrap font-sans">
                      {row.mobileNo}
                    </td>
                  </tr>
                ))
              )}

              {/* Total Row */}
              <tr data-wages-row="total" className="font-bold bg-white">
                <td colSpan={3} className="border border-black px-2 py-1 text-center text-[11px]">
                  Total
                </td>
                <td className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1"></td>
                <td className="border border-black px-1 py-1"></td>
                {wagesBillSheet.dailyTotals.map((daySum, idx) => (
                  <td
                    key={`tot-day-${idx}`}
                    className="border border-black px-0.5 py-1 text-center font-sans"
                  >
                    {daySum > 0 ? formatHoursValue(daySum) : ''}
                  </td>
                ))}
                <td className="border border-black px-1.5 py-1 text-center font-sans">
                  {formatHoursValue(wagesBillSheet.grandRegularHours)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center font-sans">
                  {formatHoursValue(wagesBillSheet.grandOvertimeHours)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center font-sans">
                  {formatHoursValue(wagesBillSheet.grandTotalHours)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center font-sans">
                  {formatPresentDayValue(wagesBillSheet.grandPresentDays)}
                </td>
                <td className="border border-black px-1.5 py-1 text-center font-sans">
                  {wagesBillSheet.grandTotalAmount}
                </td>
                <td className="border border-black px-2 py-1"></td>
                <td className="border border-black px-1.5 py-1"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div data-wages-footer="true">
          {/* Amount in Words */}
          <div className="mt-1.5 pl-16 text-[11px] font-bold text-black">
            TK. &nbsp;{wagesBillSheet.amountInWords} &nbsp;Only .
          </div>

          {/* Signatory Footer */}
          <div className="mt-12 mb-2 px-12 flex items-center justify-between text-[11px] font-bold text-black">
            <div className="flex items-center gap-36">
              <span className="border-t border-black/80 pt-0.5">Prepared By</span>
              <span className="border-t border-black/80 pt-0.5">Checked By</span>
            </div>
            <span className="border-t border-black/80 pt-0.5">Approved BY</span>
          </div>
        </div>
      </div>
    </div>
  );
};
