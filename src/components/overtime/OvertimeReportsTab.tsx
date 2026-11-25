import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { calculateEmployeeIndividualOvertime } from '../../types/overtime';
import { OVERTIME_REPORT_ACTION_MAP } from '../../types/pagePermissions';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Filter, 
  FileText, 
  TrendingUp, 
  Users, 
  Building2, 
  Layers, 
  Coins, 
  Clock,
  Printer,
  ChevronDown,
  Loader2,
  ShieldAlert
} from 'lucide-react';

interface DeptBillRow {
  sn: number;
  empId: string;
  name: string;
  employmentType: string;
  gender: string;
  monthlySalary: number;
  workDay: number;
  ratePerDay: number;
  ratePerHour: number;
  dailyHours: number[]; // length 31 (index 0 = day 1 ... index 30 = day 31)
  totalHours: number;
  totalAmount: number;
  mobileNo: string;
}

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

const formatHoursValue = (val: number): string => {
  if (!val) return '0';
  return Number.isInteger(val) ? String(val) : String(Number(val.toFixed(2)));
};

const extractYMD = (raw?: string): { ym: string; day: number; ymd: string } | null => {
  const s = String(raw || '').trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY-M-D or YYYY/MM/DD or ISO string starting with YYYY-MM-DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    const d = Number(m[3]);
    if (d >= 1 && d <= 31) {
      return { ym: `${y}-${mo}`, day: d, ymd: `${y}-${mo}-${String(d).padStart(2, '0')}` };
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
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

const normStr = (v?: string) => String(v || '').trim().toLowerCase();

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

export const OvertimeReportsTab: React.FC = () => {
  const {
    overtimeRequests,
    overtimeAttendances,
    overtimeRecords,
    attendanceRecords,
    fieldForceReps,
    departments,
    salaryStructures,
    productionOrders,
    overtimePolicies,
    payrollSettings,
    getEmployeeEffectiveOvertimePolicy,
    orgHierarchy,
    hasPageAction,
    currentUser,
  } = useERP();

  const canViewPage = hasPageAction
    ? hasPageAction('overtime-management', 'view_reports')
    : currentUser.role === 'Super Admin';
  const canExport = (hasPageAction
    ? hasPageAction('overtime-management', 'export')
    : currentUser.role === 'Super Admin') && canViewPage;
  const canViewCost = hasPageAction
    ? hasPageAction('overtime-management', 'view_cost')
    : currentUser.role === 'Super Admin';

  const [activeReport, setActiveReport] = useState<number>(1);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employmentTypeFilters, setEmploymentTypeFilters] = useState<string[]>([]);
  const [isEmpTypeDropdownOpen, setIsEmpTypeDropdownOpen] = useState(false);
  const empTypeDropdownRef = useRef<HTMLDivElement>(null);
  const [genderFilter, setGenderFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(() => new Date().toISOString().slice(0, 7));
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const deptBillRef = useRef<HTMLDivElement>(null);
  const genericReportRef = useRef<HTMLDivElement>(null);
  const hasUserChangedMonthRef = useRef(false);
  const hasAutoDefaultedDeptRef = useRef(false);

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

  // If the default current month has no overtime data yet while another month does, auto-select the latest month with OT data
  useEffect(() => {
    if (hasUserChangedMonthRef.current || !monthFilter) return;
    const allDates: string[] = [];
    overtimeRequests.forEach((r) => {
      if (r.status === 'Final Approved' && r.overtimeDate) {
        allDates.push(r.overtimeDate);
      }
    });
    overtimeAttendances.forEach((a) => {
      if (!a.requestId && a.date) allDates.push(a.date);
    });
    (overtimeRecords || []).forEach((o) => {
      if (o.status === 'Approved' && o.date) allDates.push(o.date);
    });
    (attendanceRecords || []).forEach((a) => {
      if (Number(a.overtimeHours) > 0 && a.date) allDates.push(a.date);
    });

    const parsedYms = allDates
      .map((d) => extractYMD(d)?.ym)
      .filter((ym): ym is string => Boolean(ym));

    if (parsedYms.length > 0 && !parsedYms.includes(monthFilter)) {
      const latestYm = Array.from(new Set(parsedYms)).sort().pop();
      if (latestYm) {
        setMonthFilter(latestYm);
      }
    }
  }, [overtimeRequests, overtimeAttendances, overtimeRecords, attendanceRecords, monthFilter]);

  // List of 7 reports requested
  const reportsList = useMemo(
    () => [
      { id: 1, permissionKey: OVERTIME_REPORT_ACTION_MAP[1].key, name: 'Employee-wise Monthly Overtime Report', icon: Users, desc: 'Aggregated monthly overtime hours, wage rates, and earnings per worker' },
      { id: 2, permissionKey: OVERTIME_REPORT_ACTION_MAP[2].key, name: 'Daily Factory Overtime Bill Report', icon: Building2, desc: 'Daily Overtime Bill Factory sheet with 31-day breakdown, rates & signatures' },
      { id: 3, permissionKey: OVERTIME_REPORT_ACTION_MAP[3].key, name: 'Production Batch-wise Overtime Cost Report', icon: Layers, desc: 'Direct OT cost absorbed per manufactured battery batch' },
      { id: 4, permissionKey: OVERTIME_REPORT_ACTION_MAP[4].key, name: 'Production Order-wise Overtime Cost Report', icon: FileText, desc: 'Overtime expense absorbed per Production Work Order' },
      { id: 5, permissionKey: OVERTIME_REPORT_ACTION_MAP[5].key, name: 'Monthly Overtime Payroll Reconciliation Report', icon: Coins, desc: 'Payable overtime amounts audited against salary sheets' },
      { id: 6, permissionKey: OVERTIME_REPORT_ACTION_MAP[6].key, name: 'Pending Overtime Approval Workflow Report', icon: Clock, desc: 'Bottlenecks and requests awaiting Supervisor, Production Mgr, or HR sign-off' },
      { id: 7, permissionKey: OVERTIME_REPORT_ACTION_MAP[7].key, name: 'Overtime Hours vs Production Output Report', icon: TrendingUp, desc: 'Efficiency ratio of overtime input hours to finished goods units produced' },
    ],
    []
  );

  const visibleReports = useMemo(
    () =>
      reportsList.filter((rep) =>
        canViewPage &&
        (hasPageAction
          ? hasPageAction('overtime-management', rep.permissionKey)
          : currentUser.role === 'Super Admin')
      ),
    [reportsList, canViewPage, hasPageAction, currentUser.role]
  );

  const activeReportDef = useMemo(
    () => visibleReports.find((r) => r.id === activeReport) || visibleReports[0] || null,
    [visibleReports, activeReport]
  );

  const effectiveActiveReport = activeReportDef ? activeReportDef.id : 0;

  useEffect(() => {
    if (visibleReports.length > 0 && !visibleReports.some((r) => r.id === activeReport)) {
      setActiveReport(visibleReports[0].id);
    }
  }, [visibleReports, activeReport]);

  const stripDepartmentCode = (raw: string): string => {
    let result = String(raw || '').trim();
    if (!result) return '';
    const matchedDept = (departments || []).find((d) => {
      const code = String(d.code || '').trim();
      return Boolean(code) && result.toUpperCase().startsWith(code.toUpperCase());
    });
    if (matchedDept?.code) {
      const escapedCode = matchedDept.code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const withoutCode = result
        .replace(new RegExp(`^${escapedCode}\\s*[-–—:]?\\s*`, 'i'), '')
        .trim();
      if (withoutCode) {
        result = withoutCode;
      }
    }
    const stripped = result.replace(/^[A-Z]{1,6}-\d+\s*[-–—:]\s*/i, '').trim();
    return stripped || result;
  };

  const activeMasterDepartments = useMemo(
    () => (departments || []).filter((d) => !d.status || normStr(d.status) === 'active'),
    [departments]
  );

  const availableDepartments = useMemo(() => {
    if ((departments || []).length > 0) {
      return Array.from(
        new Set(
          activeMasterDepartments
            .map((d) => String(d.name || stripDepartmentCode(d.fullName || '')).trim())
            .filter(Boolean)
        )
      );
    }
    return Array.from(
      new Set(
        fieldForceReps
          .filter(isEmployeeActive)
          .flatMap((r) => [r.department, ...(r.departments || [])])
          .map((d) => stripDepartmentCode(String(d || '')))
          .filter(Boolean)
      )
    );
  }, [departments, activeMasterDepartments, fieldForceReps]);

  // Select the first available department by default when opening Reports & Export
  useEffect(() => {
    if (hasAutoDefaultedDeptRef.current) return;
    if (availableDepartments.length === 0) return;
    hasAutoDefaultedDeptRef.current = true;
    if (!departmentFilter || departmentFilter === 'all') {
      setDepartmentFilter(availableDepartments[0]);
    }
  }, [availableDepartments, departmentFilter]);

  useEffect(() => {
    if (
      departmentFilter !== 'all' &&
      !availableDepartments.some((d) => normStr(d) === normStr(departmentFilter))
    ) {
      setDepartmentFilter('all');
    }
  }, [departmentFilter, availableDepartments]);

  const matchesDepartmentFilter = (candidateDept?: string, selectedDept?: string): boolean => {
    const selected = String(selectedDept || '').trim();
    if (!selected || normStr(selected) === 'all') return true;
    const candidate = String(candidateDept || '').trim();
    if (!candidate) return false;
    if (normStr(candidate) === normStr(selected)) return true;

    const candidateStripped = normStr(stripDepartmentCode(candidate));
    const selectedStripped = normStr(stripDepartmentCode(selected));
    if (candidateStripped && selectedStripped && candidateStripped === selectedStripped) {
      return true;
    }

    const matchedActiveDept = activeMasterDepartments.find((d) => {
      const aliases = [
        d.name,
        d.fullName,
        d.code && d.name ? `${d.code} - ${d.name}` : '',
      ]
        .map((v) => normStr(v))
        .filter(Boolean);
      return aliases.includes(normStr(selected));
    });
    if (matchedActiveDept) {
      const aliases = [
        matchedActiveDept.name,
        matchedActiveDept.fullName,
        matchedActiveDept.code && matchedActiveDept.name
          ? `${matchedActiveDept.code} - ${matchedActiveDept.name}`
          : '',
      ]
        .map((v) => normStr(v))
        .filter(Boolean);
      if (aliases.includes(normStr(candidate))) return true;
    }

    return false;
  };

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

  const selectedEmployeeFilterObj = useMemo(
    () => (employeeFilter === 'all' ? null : fieldForceReps.find((r) => r.id === employeeFilter) || null),
    [employeeFilter, fieldForceReps]
  );

  useEffect(() => {
    if (effectiveActiveReport === 2 && employeeFilter !== 'all') {
      if (!isEmployeeActive(selectedEmployeeFilterObj)) {
        setEmployeeFilter('all');
      }
    }
  }, [effectiveActiveReport, employeeFilter, selectedEmployeeFilterObj]);

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

  const matchesEmpTypeAndGender = (empType?: string, empGender?: string) => {
    if (
      normalizedSelectedEmpTypes.length > 0 &&
      !normalizedSelectedEmpTypes.includes(normStr(empType))
    ) {
      return false;
    }
    if (
      genderFilter !== 'all' &&
      normStr(empGender) !== normStr(genderFilter)
    ) {
      return false;
    }
    return true;
  };

  const filteredRequests = overtimeRequests.filter((r) => {
    const parsed = extractYMD(r.overtimeDate);
    if (monthFilter && (parsed ? parsed.ym !== monthFilter : !String(r.overtimeDate || '').startsWith(monthFilter))) {
      return false;
    }
    if (departmentFilter !== 'all' && !matchesDepartmentFilter(r.department, departmentFilter)) return false;
    if (employeeFilter !== 'all') {
      if (selectedEmployeeFilterObj) {
        if (!matchesEmpIdentity(selectedEmployeeFilterObj, r)) return false;
      } else if (r.employeeId !== employeeFilter) {
        return false;
      }
    }
    if (employmentTypeFilters.length > 0 || genderFilter !== 'all') {
      const matchedRep = fieldForceReps.find((e) => matchesEmpIdentity(e, r));
      if (
        !matchesEmpTypeAndGender(
          matchedRep?.employmentType || (matchedRep as any)?.employment_type,
          matchedRep?.gender
        )
      ) {
        return false;
      }
    }
    return true;
  });

  // Active month metadata for the 31-day Daily Overtime Bill Factory sheet
  const activeYearMonth = monthFilter || new Date().toISOString().slice(0, 7);
  const [activeYearNum, activeMonthNum] = useMemo(() => {
    const parts = activeYearMonth.split('-');
    const y = Number(parts[0]) || new Date().getFullYear();
    const m = Number(parts[1]) || new Date().getMonth() + 1;
    return [y, m];
  }, [activeYearMonth]);

  const monthHeadingLabel = useMemo(() => {
    if (!monthFilter) return 'All Months';
    const dt = new Date(activeYearNum, activeMonthNum - 1, 1);
    const monthName = dt.toLocaleString('en-US', { month: 'long' });
    return `${monthName}-${activeYearNum}`;
  }, [monthFilter, activeYearNum, activeMonthNum]);

  const daysInActiveMonth = useMemo(
    () => new Date(activeYearNum, activeMonthNum, 0).getDate(),
    [activeYearNum, activeMonthNum]
  );

  const totalTableCols = 9 + daysInActiveMonth + 4;

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
    departmentFilter !== 'all'
      ? stripDepartmentCode(departmentFilter)
      : orgHierarchy?.name?.trim() || 'Stern Industrise LTD';

  // Generate Report 2: Daily Overtime Bill Factory sheet (Department-wise Overtime Report)
  const deptOvertimeSheet = useMemo(() => {
    const matchesPeriod = (rawDate?: string) => {
      if (!monthFilter) return true;
      const parsed = extractYMD(rawDate);
      return parsed ? parsed.ym === monthFilter : String(rawDate || '').startsWith(monthFilter);
    };

    const activeReqs = overtimeRequests.filter((r) => {
      if (r.status !== 'Final Approved') return false;
      if (!matchesPeriod(r.overtimeDate)) return false;
      if (employeeFilter !== 'all') {
        if (selectedEmployeeFilterObj) {
          if (!matchesEmpIdentity(selectedEmployeeFilterObj, r)) return false;
        } else if (r.employeeId !== employeeFilter) {
          return false;
        }
      }
      return true;
    });

    const activeAtts = overtimeAttendances.filter((a) => {
      if (a.requestId) return false; // Linked OT request attendances are only included when the request itself is Final Approved
      if (!matchesPeriod(a.date)) return false;
      if (employeeFilter !== 'all') {
        if (selectedEmployeeFilterObj) {
          if (!matchesEmpIdentity(selectedEmployeeFilterObj, a)) return false;
        } else if (a.employeeId !== employeeFilter) {
          return false;
        }
      }
      return true;
    });

    const activeLegacyRecs = (overtimeRecords || []).filter((o) => {
      if (o.status !== 'Approved') return false;
      if (!matchesPeriod(o.date || o.monthYear)) return false;
      if (employeeFilter !== 'all') {
        if (selectedEmployeeFilterObj) {
          if (!matchesEmpIdentity(selectedEmployeeFilterObj, o)) return false;
        } else if (o.employeeId !== employeeFilter) {
          return false;
        }
      }
      return true;
    });

    const activeDailyAttOT = (attendanceRecords || []).filter((a) => {
      if (!(Number(a.overtimeHours) > 0)) return false;
      if (!matchesPeriod(a.date)) return false;
      if (employeeFilter !== 'all') {
        if (selectedEmployeeFilterObj) {
          if (!matchesEmpIdentity(selectedEmployeeFilterObj, a)) return false;
        } else if (a.employeeId !== employeeFilter && a.fieldForceId !== employeeFilter) {
          return false;
        }
      }
      return true;
    });

    type EmpSeed = {
      id: string;
      code: string;
      name: string;
      department?: string;
      employmentType: string;
      gender: string;
      basicSalaryBDT: number;
      phone: string;
    };

    const empMap = new Map<string, EmpSeed>();

    fieldForceReps.forEach((rep) => {
      if (!isEmployeeActive(rep)) return;
      const deptMatch =
        departmentFilter === 'all' ||
        matchesDepartmentFilter(rep.department, departmentFilter) ||
        (Array.isArray(rep.departments) &&
          rep.departments.some((d) => matchesDepartmentFilter(d, departmentFilter)));
      const empMatch = employeeFilter === 'all' || rep.id === employeeFilter;
      const repEmpType = rep.employmentType || (rep as any).employment_type || '-';
      const repGender = rep.gender || '-';
      if (!deptMatch || !empMatch || !matchesEmpTypeAndGender(repEmpType, repGender)) return;

      const str = salaryStructures.find(
        (s) => s.employeeId === rep.id || (rep.code && s.employeeId === rep.code)
      );
      empMap.set(rep.id, {
        id: rep.id,
        code: rep.code || rep.id,
        name: rep.name || 'Worker',
        department: rep.department || rep.departments?.[0],
        employmentType: repEmpType,
        gender: repGender,
        basicSalaryBDT: Number(str?.basicSalaryBDT ?? rep.basicSalaryBDT ?? 0),
        phone: rep.phone || '',
      });
    });

    const findMatchingSeed = (rec: {
      employeeId?: string;
      fieldForceId?: string;
      employeeCode?: string;
      employeeName?: string;
    }) => {
      for (const seed of empMap.values()) {
        if (matchesEmpIdentity(seed, rec)) return seed;
      }
      return undefined;
    };

    const ensureEmployeeSeed = (rec: {
      employeeId?: string;
      fieldForceId?: string;
      employeeCode?: string;
      employeeName?: string;
      department?: string;
      basicSalaryBDT?: number;
    }) => {
      if (findMatchingSeed(rec)) return;
      const matchedRep = fieldForceReps.find((r) => matchesEmpIdentity(r, rec));
      if (!matchedRep || !isEmployeeActive(matchedRep)) {
        return;
      }
      const repDept = matchedRep?.department || matchedRep?.departments?.[0] || rec.department || '-';
      if (
        departmentFilter !== 'all' &&
        !matchesDepartmentFilter(repDept, departmentFilter) &&
        !matchesDepartmentFilter(rec.department, departmentFilter) &&
        !(matchedRep?.departments || []).some((d) => matchesDepartmentFilter(d, departmentFilter))
      ) {
        return;
      }
      const repEmpType = matchedRep?.employmentType || (matchedRep as any)?.employment_type || '-';
      const repGender = matchedRep?.gender || '-';
      if (!matchesEmpTypeAndGender(repEmpType, repGender)) {
        return;
      }
      const key = matchedRep?.id || rec.employeeId || rec.employeeCode || rec.employeeName || '';
      if (!key || empMap.has(key)) return;
      const str = salaryStructures.find(
        (s) => s.employeeId === key || (matchedRep?.code && s.employeeId === matchedRep.code)
      );
      empMap.set(key, {
        id: key,
        code: matchedRep?.code || rec.employeeCode || key,
        name: matchedRep?.name || rec.employeeName || 'Worker',
        department: repDept !== '-' ? repDept : undefined,
        employmentType: repEmpType,
        gender: repGender,
        basicSalaryBDT: Number(str?.basicSalaryBDT ?? rec.basicSalaryBDT ?? matchedRep?.basicSalaryBDT ?? 0),
        phone: matchedRep?.phone || '',
      });
    };

    activeReqs.forEach(ensureEmployeeSeed);
    activeAtts.forEach(ensureEmployeeSeed);
    activeLegacyRecs.forEach(ensureEmployeeSeed);
    activeDailyAttOT.forEach(ensureEmployeeSeed);

    const sortedEmployees = Array.from(empMap.values()).sort((a, b) =>
      String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
    );

    const getMonthlyWorkingDays = (year: number, month1Based: number): number => {
      const daysInMonth = new Date(year, month1Based, 0).getDate();
      let workingDays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const weekday = new Date(year, month1Based - 1, d).getDay();
        if (weekday !== 5) { // Exclude Fridays (weekly off)
          workingDays++;
        }
      }
      return Math.max(1, workingDays);
    };

    const monthWorkDays = getMonthlyWorkingDays(activeYearNum, activeMonthNum);
    const defaultOtPolicy =
      (overtimePolicies || []).find((p) => p.isDefault) || (overtimePolicies || [])[0];

    const rows: DeptBillRow[] = sortedEmployees.map((emp, index) => {
      const policy = getEmployeeEffectiveOvertimePolicy(emp.id, `${activeYearMonth}-01`);
      const matchedDeptPolicy =
        (overtimePolicies || []).find(
          (p) =>
            p.department &&
            emp.department &&
            normStr(p.department) === normStr(emp.department)
        ) || defaultOtPolicy;
      const dailyWorkingHours =
        Number(
          matchedDeptPolicy?.standardDailyWorkingHours ||
            payrollSettings?.standardDailyHours ||
            payrollSettings?.standardWorkHoursPerDay
        ) || 8;
      const workDay = monthWorkDays;
      const monthlySalary = Math.round(emp.basicSalaryBDT || 0);
      const ratePerDay = workDay > 0 ? Math.round(monthlySalary / workDay) : 0;
      const ratePerHour =
        policy?.calculationBasis === 'Fixed Hourly Rate'
          ? Math.round(Number(policy?.fixedHourlyRateBDT) || 0)
          : dailyWorkingHours > 0
            ? Math.round(ratePerDay / dailyWorkingHours)
            : 0;
      const monthEffectivePolicy = {
        ...policy,
        standardMonthlyWorkingHours: workDay * dailyWorkingHours,
      };

      const dailyHours = new Array(daysInActiveMonth).fill(0);
      let totalHours = 0;
      let totalAmount = 0;
      const coveredDates = new Set<string>();

      const empReqs = activeReqs.filter((r) => matchesEmpIdentity(emp, r));
      empReqs.forEach((req) => {
        const parsed = extractYMD(req.overtimeDate);
        const linkedAtt = overtimeAttendances.find((a) => a.requestId && a.requestId === req.id);
        const attHrs = linkedAtt
          ? Number(linkedAtt.actualOvertimeHours) > 0
            ? Number(linkedAtt.actualOvertimeHours)
            : Number(linkedAtt.rawCalculatedHours || 0)
          : 0;
        const hrs =
          Number(req.actualOvertimeHours) > 0
            ? Number(req.actualOvertimeHours)
            : attHrs > 0
              ? attHrs
              : Number(req.expectedHours || 0);

        if (parsed) {
          coveredDates.add(parsed.ymd);
          if (parsed.day >= 1 && parsed.day <= daysInActiveMonth && hrs > 0) {
            dailyHours[parsed.day - 1] += hrs;
          }
        }
        totalHours += hrs;
        if (
          req.calculatedOvertimeAmountBDT !== undefined &&
          req.calculatedOvertimeAmountBDT !== null
        ) {
          totalAmount += Number(req.calculatedOvertimeAmountBDT) || 0;
        } else {
          const calc = calculateEmployeeIndividualOvertime(monthlySalary, monthEffectivePolicy, hrs);
          totalAmount += calc.totalAmountBDT;
        }
      });

      const empAtts = activeAtts.filter((a) => matchesEmpIdentity(emp, a));
      empAtts.forEach((att) => {
        const parsed = extractYMD(att.date);
        const hrs =
          Number(att.actualOvertimeHours) > 0
            ? Number(att.actualOvertimeHours)
            : Number(att.rawCalculatedHours || 0);
        if (parsed) {
          coveredDates.add(parsed.ymd);
          if (parsed.day >= 1 && parsed.day <= daysInActiveMonth && hrs > 0) {
            dailyHours[parsed.day - 1] += hrs;
          }
        }
        totalHours += hrs;
        const calc = calculateEmployeeIndividualOvertime(monthlySalary, monthEffectivePolicy, hrs);
        totalAmount += calc.totalAmountBDT;
      });

      const empLegacy = activeLegacyRecs.filter((o) => matchesEmpIdentity(emp, o));
      empLegacy.forEach((ot) => {
        const parsed = extractYMD(ot.date);
        if (parsed && coveredDates.has(parsed.ymd)) return;
        const hrs = Number(ot.hours || 0);
        if (parsed) {
          coveredDates.add(parsed.ymd);
          if (parsed.day >= 1 && parsed.day <= daysInActiveMonth && hrs > 0) {
            dailyHours[parsed.day - 1] += hrs;
          }
        }
        totalHours += hrs;
        if (ot.totalAmountBDT !== undefined && ot.totalAmountBDT !== null) {
          totalAmount += Number(ot.totalAmountBDT) || 0;
        } else {
          const calc = calculateEmployeeIndividualOvertime(monthlySalary, monthEffectivePolicy, hrs);
          totalAmount += calc.totalAmountBDT;
        }
      });

      const empDailyAtt = activeDailyAttOT.filter((a) => matchesEmpIdentity(emp, a));
      empDailyAtt.forEach((att) => {
        const parsed = extractYMD(att.date);
        if (parsed && coveredDates.has(parsed.ymd)) return;
        const hrs = Number(att.overtimeHours || 0);
        if (parsed) {
          coveredDates.add(parsed.ymd);
          if (parsed.day >= 1 && parsed.day <= daysInActiveMonth && hrs > 0) {
            dailyHours[parsed.day - 1] += hrs;
          }
        }
        totalHours += hrs;
        const calc = calculateEmployeeIndividualOvertime(monthlySalary, monthEffectivePolicy, hrs);
        totalAmount += calc.totalAmountBDT;
      });

      return {
        sn: index + 1,
        empId: emp.code,
        name: emp.name,
        employmentType: emp.employmentType,
        gender: emp.gender,
        monthlySalary,
        workDay,
        ratePerDay,
        ratePerHour,
        dailyHours,
        totalHours,
        totalAmount: Math.round(totalAmount),
        mobileNo: emp.phone,
      };
    });

    const dailyTotals = new Array(daysInActiveMonth).fill(0);
    let grandTotalHours = 0;
    let grandTotalAmount = 0;

    rows.forEach((row) => {
      row.dailyHours.forEach((h, i) => {
        dailyTotals[i] += h;
      });
      grandTotalHours += row.totalHours;
      grandTotalAmount += row.totalAmount;
    });

    return {
      rows,
      dailyTotals,
      grandTotalHours,
      grandTotalAmount: Math.round(grandTotalAmount),
      amountInWords: numberToWordsSimple(grandTotalAmount),
    };
  }, [
    overtimeRequests,
    overtimeAttendances,
    overtimeRecords,
    attendanceRecords,
    fieldForceReps,
    departments,
    salaryStructures,
    departmentFilter,
    employmentTypeFilters,
    genderFilter,
    employeeFilter,
    selectedEmployeeFilterObj,
    monthFilter,
    activeYearMonth,
    activeYearNum,
    activeMonthNum,
    daysInActiveMonth,
    overtimePolicies,
    payrollSettings,
    getEmployeeEffectiveOvertimePolicy,
  ]);

  // Helper to export any dataset to Excel
  const exportToExcel = (data: any[], fileName: string) => {
    if (!canExport || !activeReportDef) return;
    if (effectiveActiveReport === 2) {
      const sheetRows: any[][] = [];
      sheetRows.push([companyDisplayName]);
      sheetRows.push(['Daily Overtime Bill of Factory']);
      sheetRows.push([`For the month of ${monthHeadingLabel}`]);
      sheetRows.push([
        '', '', '', '', '', '', '', '', '',
        ...dayHeaders.map((d) => d.weekday),
        '', '', '', '',
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
        'Total HR',
        'Amount',
        'Signature',
        'Mobil NO',
      ]);

      deptOvertimeSheet.rows.forEach((row) => {
        sheetRows.push([
          row.sn,
          row.empId,
          row.name,
          row.employmentType,
          row.gender,
          canViewCost ? row.monthlySalary : 'Restricted',
          row.workDay,
          canViewCost ? row.ratePerDay : 'Restricted',
          canViewCost ? row.ratePerHour : 'Restricted',
          ...row.dailyHours.map((h) => (h > 0 ? Number(h.toFixed(2)) : '')),
          Number(row.totalHours.toFixed(2)),
          canViewCost ? row.totalAmount : 'Restricted',
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
        ...deptOvertimeSheet.dailyTotals.map((t) => Number(t.toFixed(2))),
        Number(deptOvertimeSheet.grandTotalHours.toFixed(2)),
        canViewCost ? deptOvertimeSheet.grandTotalAmount : 'Restricted',
        '',
        '',
      ]);
      sheetRows.push([]);
      sheetRows.push([
        '',
        canViewCost
          ? `TK. ${deptOvertimeSheet.amountInWords} Only .`
          : 'Financial totals restricted (View Overtime Financials permission required)',
      ]);
      sheetRows.push([]);
      sheetRows.push([]);
      sheetRows.push(['', 'Prepared By', '', '', 'Checked By', ...Array(Math.max(1, totalTableCols - 8)).fill(''), 'Approved BY']);

      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalTableCols - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalTableCols - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: totalTableCols - 1 } },
        { s: { r: 5 + deptOvertimeSheet.rows.length, c: 0 }, e: { r: 5 + deptOvertimeSheet.rows.length, c: 2 } },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Overtime Bill');
      XLSX.writeFile(wb, `Daily_Overtime_Bill_Factory_${monthFilter || 'all'}.xlsx`);
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${fileName}_${monthFilter || 'all'}.xlsx`);
  };

  const handlePrintDeptBill = () => {
    if (!canExport || effectiveActiveReport !== 2) return;
    document.body.classList.add('printing-ot-bill');
    const cleanup = () => {
      document.body.classList.remove('printing-ot-bill');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  };

  const handleDownloadPdf = async () => {
    if (!canExport || !activeReportDef || isExportingPdf) return;
    const isDeptBill = effectiveActiveReport === 2;
    const targetEl = isDeptBill ? deptBillRef.current : genericReportRef.current;
    if (!targetEl) return;

    setIsExportingPdf(true);
    setPdfError(null);

    const applyCompactPdfStyles = (rootEl: HTMLElement) => {
      rootEl.style.border = 'none';
      rootEl.style.borderRadius = '0';
      rootEl.style.boxShadow = 'none';
      rootEl.style.margin = '0';
      rootEl.style.backgroundColor = '#ffffff';
      rootEl.style.maxWidth = 'none';

      const styleTag = rootEl.ownerDocument.createElement('style');
      if (isDeptBill) {
        rootEl.style.padding = '8px 10px';
        rootEl.style.width = 'max-content';
        styleTag.textContent = `
          [data-ot-pdf-root="true"] table {
            width: auto !important;
            border-collapse: collapse !important;
            font-size: 9.5px !important;
          }
          [data-ot-pdf-root="true"] th,
          [data-ot-pdf-root="true"] td {
            padding: 2.5px 3px !important;
            line-height: 1.15 !important;
          }
          [data-ot-pdf-root="true"] [data-ot-day-col="true"] {
            min-width: 17px !important;
            padding-left: 1.5px !important;
            padding-right: 1.5px !important;
          }
          [data-ot-pdf-root="true"] [data-ot-sig-col="true"] {
            min-width: 54px !important;
          }
          [data-ot-pdf-root="true"] [data-ot-mob-col="true"] {
            min-width: 66px !important;
          }
          [data-ot-pdf-root="true"] [data-ot-footer="true"] > div:last-child {
            margin-top: 28px !important;
            margin-bottom: 4px !important;
          }
        `;
      } else {
        rootEl.style.padding = '12px 14px';
        rootEl.style.width = 'max-content';
        styleTag.textContent = `
          [data-ot-pdf-root="true"] table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 11px !important;
          }
          [data-ot-pdf-root="true"] th,
          [data-ot-pdf-root="true"] td {
            padding: 6px 10px !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
        `;
      }
      rootEl.setAttribute('data-ot-pdf-root', 'true');
      rootEl.prepend(styleTag);

      const wrapEl = rootEl.querySelector('[data-ot-table-wrap="true"]') as HTMLElement | null;
      if (wrapEl) {
        wrapEl.style.overflow = 'visible';
        wrapEl.style.width = 'max-content';
      }

      if (isDeptBill) {
        const allCells = rootEl.querySelectorAll('th, td');
        allCells.forEach((cell) => {
          const el = cell as HTMLElement;
          if (el.className.includes('min-w-[20px]')) {
            el.setAttribute('data-ot-day-col', 'true');
          } else if (el.className.includes('min-w-[68px]')) {
            el.setAttribute('data-ot-sig-col', 'true');
          } else if (el.className.includes('min-w-[82px]')) {
            el.setAttribute('data-ot-mob-col', 'true');
          }
        });
      }

      const tableEl = rootEl.querySelector('table') as HTMLElement | null;
      const minW = isDeptBill ? 1200 : 1080;
      const fullWidth = tableEl ? Math.max(minW, Math.ceil(tableEl.scrollWidth + 28)) : 1320;
      rootEl.style.width = `${fullWidth}px`;
      return fullWidth;
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

      measureHost = document.createElement('div');
      measureHost.style.position = 'fixed';
      measureHost.style.left = '-100000px';
      measureHost.style.top = '0';
      measureHost.style.width = '2400px';
      measureHost.style.visibility = 'hidden';
      measureHost.style.pointerEvents = 'none';
      measureHost.style.zIndex = '-1';

      const measureEl = targetEl.cloneNode(true) as HTMLElement;
      measureHost.appendChild(measureEl);
      document.body.appendChild(measureHost);

      const fullTableWidth = applyCompactPdfStyles(measureEl);
      const maxPageHeightPx = Math.max(400, Math.floor(fullTableWidth * (maxH / maxW)) - 14);

      const totalSheetHeight = measureEl.getBoundingClientRect().height;
      const theadEl = measureEl.querySelector('thead') as HTMLElement | null;
      const totalRowEl = measureEl.querySelector('[data-ot-row="total"]') as HTMLElement | null;
      const footerEl = measureEl.querySelector('[data-ot-footer="true"]') as HTMLElement | null;
      const workerRowEls = Array.from(measureEl.querySelectorAll('[data-ot-row="data"]')) as HTMLElement[];

      const theadHeight = theadEl ? theadEl.getBoundingClientRect().height : 44;
      const totalRowHeight = totalRowEl ? totalRowEl.getBoundingClientRect().height : 0;
      const footerHeight = footerEl ? footerEl.getBoundingClientRect().height + 10 : 0;
      const rowHeights = workerRowEls.map((tr) => tr.getBoundingClientRect().height);
      const allRowsHeight = rowHeights.reduce((sum, h) => sum + h, 0);
      const titleAndPaddingHeight = Math.max(
        44,
        totalSheetHeight - theadHeight - allRowsHeight - totalRowHeight - footerHeight
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
      if (rowHeights.length === 0) {
        pages.push({ start: 0, end: 0, includeFooter: true });
      } else {
        let startIdx = 0;
        while (startIdx < rowHeights.length) {
          let usedHeight = baseChromeHeight;
          let endIdx = startIdx;
          while (endIdx < rowHeights.length) {
            const nextH = rowHeights[endIdx];
            if (endIdx > startIdx && usedHeight + nextH > maxPageHeightPx) {
              break;
            }
            usedHeight += nextH;
            endIdx++;
          }

          const isFinalBatch = endIdx === rowHeights.length;
          if (!isFinalBatch) {
            pages.push({ start: startIdx, end: endIdx, includeFooter: false });
            startIdx = endIdx;
          } else {
            if (usedHeight + footerChromeHeight <= maxPageHeightPx || endIdx - startIdx <= 1) {
              pages.push({ start: startIdx, end: endIdx, includeFooter: true });
            } else {
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

        const canvas = await html2canvas(targetEl, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 2400,
          windowHeight: 1600,
          onclone: (_clonedDoc, clonedEl) => {
            const dataRows = Array.from(clonedEl.querySelectorAll('[data-ot-row="data"]')) as HTMLElement[];
            dataRows.forEach((tr, idx) => {
              if (idx < slice.start || idx >= slice.end) {
                tr.style.display = 'none';
              }
            });

            const totalRow = clonedEl.querySelector('[data-ot-row="total"]') as HTMLElement | null;
            if (totalRow && !slice.includeFooter) {
              totalRow.style.display = 'none';
            }

            const clonedFooterEl = clonedEl.querySelector('[data-ot-footer="true"]') as HTMLElement | null;
            if (clonedFooterEl && !slice.includeFooter) {
              clonedFooterEl.style.display = 'none';
            }

            const pageLabelEl = clonedEl.querySelector('[data-ot-page-label="true"]') as HTMLElement | null;
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

      const baseFileName = isDeptBill
        ? 'Daily_Overtime_Bill_Factory'
        : activeReportDef.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      pdf.save(`${baseFileName}_${monthFilter || 'all'}_Landscape.pdf`);
    } catch (err: any) {
      setPdfError(err?.message || 'Failed to generate Landscape PDF. Please try again.');
    } finally {
      if (measureHost && measureHost.parentNode) {
        measureHost.parentNode.removeChild(measureHost);
      }
      setIsExportingPdf(false);
    }
  };

  // Generate Report 1: Employee-wise (Final Approved OT requests only)
  const generateEmployeeReport = () => {
    const grouped: { [empId: string]: { code: string; name: string; dept: string; hours: number; amount: number; count: number } } = {};
    filteredRequests
      .filter((r) => r.status === 'Final Approved')
      .forEach((r) => {
        if (!grouped[r.employeeId]) {
          grouped[r.employeeId] = {
            code: r.employeeCode || r.employeeId,
            name: r.employeeName,
            dept: r.department,
            hours: 0,
            amount: 0,
            count: 0
          };
        }
        grouped[r.employeeId].hours += r.actualOvertimeHours || r.expectedHours || 0;
        grouped[r.employeeId].amount += r.calculatedOvertimeAmountBDT || 0;
        grouped[r.employeeId].count += 1;
      });

    return Object.entries(grouped).map(([, val]) => {
      const baseRow: Record<string, any> = {
        'Employee ID': val.code,
        'Employee Name': val.name,
        'Department': val.dept,
        'OT Duty Days': val.count,
        'Total OT Hours': Number(val.hours.toFixed(2)),
      };
      if (canViewCost) {
        baseRow['Average Rate (BDT)'] = Math.round(val.amount / (val.hours || 1));
        baseRow['Total Overtime Amount (BDT)'] = Math.round(val.amount);
      }
      return baseRow;
    });
  };

  // Generate Report 3: Batch-wise
  const generateBatchReport = () => {
    const batchMap: { [batch: string]: { orderNo: string; hours: number; cost: number; process: string } } = {};
    filteredRequests.forEach(r => {
      r.batchAllocations?.forEach(b => {
        const key = b.isOverhead ? 'FACTORY_OVERHEAD' : b.productionBatchNumber;
        if (!batchMap[key]) {
          batchMap[key] = {
            orderNo: b.isOverhead ? 'N/A (Overhead)' : b.productionOrderNumber,
            hours: 0,
            cost: 0,
            process: b.processType
          };
        }
        batchMap[key].hours += b.allocatedHours;
        batchMap[key].cost += b.allocatedCostBDT;
      });
    });

    return Object.entries(batchMap).map(([batch, val]) => {
      const baseRow: Record<string, any> = {
        'Batch Number': batch,
        'Production Order': val.orderNo,
        'Allocated OT Hours': Number(val.hours.toFixed(2)),
      };
      if (canViewCost) {
        baseRow['Direct Overtime Cost (BDT)'] = Math.round(val.cost);
      }
      baseRow['Allocation Type'] = batch === 'FACTORY_OVERHEAD' ? 'Factory Indirect Overhead' : 'Direct WIP Labor';
      return baseRow;
    });
  };

  // Generate Report 4: Order-wise
  const generateOrderReport = () => {
    return productionOrders.map(order => {
      const orderOvertimeReqs = filteredRequests.filter(r =>
        r.batchAllocations?.some(b => b.productionOrderNumber === order.orderNumber)
      );
      const totalCost = orderOvertimeReqs.reduce((sum, r) => {
        const alloc = r.batchAllocations?.find(b => b.productionOrderNumber === order.orderNumber);
        return sum + (alloc?.allocatedCostBDT || 0);
      }, 0);
      const totalHours = orderOvertimeReqs.reduce((sum, r) => {
        const alloc = r.batchAllocations?.find(b => b.productionOrderNumber === order.orderNumber);
        return sum + (alloc?.allocatedHours || 0);
      }, 0);

      const baseRow: Record<string, any> = {
        'Order Number': order.orderNumber,
        'Batch Number': order.batchNumber || 'N/A',
        'Product Name': order.productName || 'Battery Unit',
        'Batch Quantity': order.quantity,
        'Overtime Hours Absorbed': Number(totalHours.toFixed(2)),
      };
      if (canViewCost) {
        baseRow['Overtime Cost Absorbed (BDT)'] = Math.round(totalCost);
        baseRow['Per Unit OT Cost (BDT)'] = Number((totalCost / (order.quantity || 1)).toFixed(2));
      }
      return baseRow;
    });
  };

  // Generate Report 5: Payroll Sync
  const generatePayrollReport = () => {
    const purposeOptions = payrollSettings?.overtimePurposes || [];
    const resolvePostedOvertimePurpose = (r: (typeof filteredRequests)[number]): string => {
      const directPurpose = String(r.projectPurpose || '').trim();
      const matchedById = r.purposeId
        ? purposeOptions.find((p) => p.id === r.purposeId)?.name?.trim() || ''
        : '';
      const isPostedByApproval =
        r.status === 'Final Approved' ||
        Boolean(r.finalApprovedAt) ||
        Boolean(r.purposeSelectedBy) ||
        Boolean(r.purposeId);

      if (isPostedByApproval) {
        return directPurpose || matchedById || '-';
      }
      if (
        directPurpose &&
        purposeOptions.some((p) => p.name.trim().toLowerCase() === directPurpose.toLowerCase())
      ) {
        return directPurpose;
      }
      return '-';
    };

    return filteredRequests.map(r => {
      const baseRow: Record<string, any> = {
        'Request #': r.requestNumber,
        'Date': r.overtimeDate,
        'Employee ID': r.employeeCode || r.employeeId,
        'Employee Name': r.employeeName,
        'Department': r.department,
        'Hours': r.actualOvertimeHours || r.expectedHours,
        'Overtime Purpose': resolvePostedOvertimePurpose(r),
      };
      if (canViewCost) {
        baseRow['Rate (BDT)'] = r.hourlyRateBDT || 0;
        baseRow['Total OT (BDT)'] = r.calculatedOvertimeAmountBDT || 0;
      }
      baseRow['Payroll Processed'] = r.isPayrollProcessed ? 'YES' : 'PENDING';
      baseRow['Payroll Run ID'] = r.payrollRunId || 'Unposted';
      baseRow['Approval Status'] = r.status.toUpperCase();
      return baseRow;
    });
  };

  // Generate Report 6: Pending Approvals
  const generatePendingReport = () => {
    return filteredRequests.filter(r => r.status !== 'Final Approved' && r.status !== 'Rejected' && r.status !== 'Cancelled').map(r => {
      const baseRow: Record<string, any> = {
        'Request #': r.requestNumber,
        'Date': r.overtimeDate,
        'Employee Name': r.employeeName,
        'Department': r.department,
        'Current Workflow Step': r.status,
        'Expected Hours': r.expectedHours,
        'Actual Hours': r.actualOvertimeHours || r.expectedHours,
      };
      if (canViewCost) {
        baseRow['Estimated Cost (BDT)'] = r.calculatedOvertimeAmountBDT || 0;
      }
      baseRow['Requested By'] = r.requestedBy;
      return baseRow;
    });
  };

  // Generate Report 7: Hours vs Output
  const generateEfficiencyReport = () => {
    return productionOrders.map(order => {
      const orderOvertimeReqs = filteredRequests.filter(r =>
        r.batchAllocations?.some(b => b.productionOrderNumber === order.orderNumber)
      );
      const totalHours = orderOvertimeReqs.reduce((sum, r) => {
        const alloc = r.batchAllocations?.find(b => b.productionOrderNumber === order.orderNumber);
        return sum + (alloc?.allocatedHours || 0);
      }, 0);

      return {
        'Production Order': order.orderNumber,
        'Batch': order.batchNumber,
        'Finished Units Produced': order.quantity,
        'Total OT Hours Expended': Number(totalHours.toFixed(2)),
        'Overtime Hours Per Unit': Number((totalHours / (order.quantity || 1)).toFixed(3)),
        'Production Status': order.status,
      };
    });
  };

  // Current active report data (for reports 1, 3-7)
  const currentData = 
    effectiveActiveReport === 1 ? generateEmployeeReport() :
    effectiveActiveReport === 3 ? generateBatchReport() :
    effectiveActiveReport === 4 ? generateOrderReport() :
    effectiveActiveReport === 5 ? generatePayrollReport() :
    effectiveActiveReport === 6 ? generatePendingReport() :
    effectiveActiveReport === 7 ? generateEfficiencyReport() :
    [];

  if (!canViewPage || !activeReportDef) {
    return (
      <div className="p-8 max-w-md mx-auto mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Reports &amp; Export Access Restricted
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          {!canViewPage ? (
            <>
              Your account lacks <strong>Reports &amp; Export</strong> page permission under Overtime Management Hub. Contact your administrator to grant access.
            </>
          ) : (
            <>
              No individual Overtime Reports are currently enabled for your account. Contact your administrator under <strong>Users &amp; Permissions</strong> to grant report access.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Statutory & Operational Overtime Reporting Engine</h3>
          </div>
          
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-2">
            {effectiveActiveReport === 2 && (
              <button
                type="button"
                onClick={handlePrintDeptBill}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Report
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              title="Download A4 Landscape PDF"
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>{isExportingPdf ? 'Generating PDF...' : 'Download PDF (Landscape)'}</span>
            </button>
            <button
              onClick={() => exportToExcel(currentData, activeReportDef.name.replace(/\s+/g, '_'))}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Export to Excel (.xlsx)
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

      {/* Reports Grid Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        {visibleReports.map((rep) => {
          const Icon = rep.icon;
          const isActive = effectiveActiveReport === rep.id;
          return (
            <button
              key={rep.id}
              onClick={() => setActiveReport(rep.id)}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-blue-50/80 border-blue-400 shadow-sm ring-1 ring-blue-500'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-lg ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className={`text-xs font-bold line-clamp-1 ${isActive ? 'text-blue-900' : 'text-slate-800'}`}>
                  {rep.name}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-700">Filters:</span>

          <select
            aria-label="Department"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 bg-white"
          >
            <option value="all">All Departments</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

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
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 bg-white flex items-center justify-between gap-2 min-w-[175px] hover:border-slate-300"
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
              <div className="absolute left-0 top-full mt-1 z-30 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5">
                <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 text-[11px]">
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
                    className="text-slate-600 hover:underline font-medium"
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
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-slate-700 select-none"
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

          <select
            aria-label="Gender"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 bg-white"
          >
            <option value="all">All Genders</option>
            {availableGenders.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select
            aria-label="Employee"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 bg-white max-w-[200px]"
          >
            <option value="all">All Employees</option>
            {fieldForceReps
              .filter((r) => effectiveActiveReport !== 2 || isEmployeeActive(r))
              .map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.code || r.id})</option>
              ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          <span>Active Period:</span>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => {
              hasUserChangedMonthRef.current = true;
              setMonthFilter(e.target.value);
            }}
            className="px-2 py-1 border border-slate-200 rounded text-slate-700 bg-white"
          />
          {monthFilter && (
            <button
              type="button"
              onClick={() => {
                hasUserChangedMonthRef.current = true;
                setMonthFilter('');
              }}
              className="px-2 py-1 text-[11px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              All Months
            </button>
          )}
        </div>
      </div>

      {/* Report 2: Exact Screenshot-Style Daily Overtime Bill Factory Sheet */}
      {effectiveActiveReport === 2 ? (
        <div
          ref={deptBillRef}
          id="dept-ot-bill-sheet"
          className="relative bg-white text-black rounded-xl border border-slate-300 shadow-sm p-4 font-serif print:border-none print:shadow-none print:p-0"
        >
          <div
            data-ot-page-label="true"
            className="hidden absolute top-2 right-3 text-[10px] font-sans font-semibold text-slate-600"
          />

          {/* Centered Company & Bill Titles */}
          <div className="text-center leading-snug mb-1 text-black">
            <div className="text-[14px] font-bold tracking-tight">
              {companyDisplayName}
            </div>
            <div className="text-[12px] font-bold">
              Daily Overtime Bill of Factory
            </div>
          </div>

          <div data-ot-table-wrap="true" className="overflow-x-auto">
            <table className="w-full border-collapse text-[10px] text-black">
              <thead>
                {/* Month Banner Row spanning full table width */}
                <tr>
                  <th
                    colSpan={totalTableCols}
                    className="border border-black py-0.5 px-2 text-center font-bold text-[11px] bg-white"
                  >
                    For the month of &nbsp;{monthHeadingLabel}
                  </th>
                </tr>

                {/* Sub-header Row: blank cells on left/right, Weekday labels above 1..31 */}
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
                </tr>

                {/* Main Header Row */}
                <tr className="font-bold text-center bg-white">
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap">S/N</th>
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap">EMP ID</th>
                  <th className="border border-black px-2 py-1 whitespace-nowrap">Name Of Worker</th>
                  <th className="border border-black px-2 py-1 whitespace-nowrap">Employment Type</th>
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap">Gender</th>
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap">Monthly Salary</th>
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap">Work Day</th>
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap">Rate/ Day</th>
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap leading-tight">
                    Rate/
                    <br />
                    Hrs
                  </th>
                  {dayHeaders.map((d) => (
                    <th
                      key={`day-${d.day}`}
                      className="border border-black px-0.5 py-1 text-center font-bold min-w-[20px]"
                    >
                      {d.day}
                    </th>
                  ))}
                  <th className="border border-black px-1.5 py-1 whitespace-nowrap leading-tight">
                    Total
                    <br />
                    HR
                  </th>
                  <th className="border border-black px-2 py-1 whitespace-nowrap">Amount</th>
                  <th className="border border-black px-3 py-1 whitespace-nowrap min-w-[68px]">Signature</th>
                  <th className="border border-black px-2 py-1 whitespace-nowrap min-w-[82px]">Mobil NO</th>
                </tr>
              </thead>

              <tbody>
                {deptOvertimeSheet.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={totalTableCols}
                      className="border border-black py-6 text-center text-[11px] font-sans text-slate-500"
                    >
                      No employees or overtime records found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  deptOvertimeSheet.rows.map((row) => (
                    <tr key={`${row.empId}-${row.sn}`} data-ot-row="data">
                      <td className="border border-black px-1 py-0.5 text-center">{row.sn}</td>
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
                        {canViewCost ? row.monthlySalary : 'Restricted'}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center font-sans">
                        {row.workDay}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                        {canViewCost ? row.ratePerDay : 'Restricted'}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-center font-sans">
                        {canViewCost ? row.ratePerHour : 'Restricted'}
                      </td>
                      {row.dailyHours.map((hrs, idx) => (
                        <td
                          key={`cell-${row.sn}-${idx}`}
                          className="border border-black px-0.5 py-0.5 text-center font-sans"
                        >
                          {hrs > 0 ? formatHoursValue(hrs) : ''}
                        </td>
                      ))}
                      <td className="border border-black px-1.5 py-0.5 text-center font-bold font-sans">
                        {formatHoursValue(row.totalHours)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-center font-bold font-sans">
                        {canViewCost ? row.totalAmount : 'Restricted'}
                      </td>
                      <td className="border border-black px-2 py-0.5"></td>
                      <td className="border border-black px-1.5 py-0.5 text-center whitespace-nowrap font-sans">
                        {row.mobileNo}
                      </td>
                    </tr>
                  ))
                )}

                {/* Total Row */}
                <tr data-ot-row="total" className="font-bold bg-white">
                  <td colSpan={3} className="border border-black px-2 py-1 text-center text-[11px]">
                    Total
                  </td>
                  <td className="border border-black px-1 py-1"></td>
                  <td className="border border-black px-1 py-1"></td>
                  <td className="border border-black px-1 py-1"></td>
                  <td className="border border-black px-1 py-1"></td>
                  <td className="border border-black px-1 py-1"></td>
                  <td className="border border-black px-1 py-1"></td>
                  {deptOvertimeSheet.dailyTotals.map((daySum, idx) => (
                    <td
                      key={`tot-day-${idx}`}
                      className="border border-black px-0.5 py-1 text-center font-sans"
                    >
                      {formatHoursValue(daySum)}
                    </td>
                  ))}
                  <td className="border border-black px-1.5 py-1 text-center font-sans">
                    {formatHoursValue(deptOvertimeSheet.grandTotalHours)}
                  </td>
                  <td className="border border-black px-1.5 py-1 text-center font-sans">
                    {canViewCost ? deptOvertimeSheet.grandTotalAmount : 'Restricted'}
                  </td>
                  <td className="border border-black px-2 py-1"></td>
                  <td className="border border-black px-1.5 py-1"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div data-ot-footer="true">
            {/* Amount in Words */}
            <div className="mt-1.5 pl-16 text-[11px] font-bold text-black">
              {canViewCost
                ? <>TK. &nbsp;{deptOvertimeSheet.amountInWords} &nbsp;Only .</>
                : 'Financial totals restricted (View Overtime Financials permission required)'}
            </div>

            {/* Signatory Footer */}
            <div className="mt-10 mb-2 px-16 flex items-center justify-between text-[11px] font-bold text-black">
              <div className="flex items-center gap-36">
                <span>Prepared By</span>
                <span>Checked By</span>
              </div>
              <span>Approved BY</span>
            </div>
          </div>
        </div>
      ) : (
        /* Report Data Table for Reports 1, 3-7 */
        <div
          ref={genericReportRef}
          className="relative bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">{activeReportDef.name}</span>
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono">
                {currentData.length} Records
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Bangladesh Labor Standards Audit Compliant</span>
              <span
                data-ot-page-label="true"
                className="hidden text-[11px] font-semibold text-slate-500"
              />
            </div>
          </div>

          <div data-ot-table-wrap="true" className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  {currentData.length > 0 && Object.keys(currentData[0]).map((col) => (
                    <th key={col} className="py-3 px-4 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentData.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-slate-400">
                      No data found for the selected filter combination.
                    </td>
                  </tr>
                ) : (
                  currentData.map((row, idx) => (
                    <tr key={idx} data-ot-row="data" className="hover:bg-slate-50/80 transition-colors">
                      {Object.entries(row).map(([key, val], cellIdx) => (
                        <td key={cellIdx} className="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                          {typeof val === 'number' && key.includes('BDT') ? (
                            <span className="font-mono font-bold text-slate-900">৳{val.toLocaleString()}</span>
                          ) : typeof val === 'number' && key.includes('Hours') ? (
                            <span className="font-mono text-blue-700 font-semibold">{val} hrs</span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

