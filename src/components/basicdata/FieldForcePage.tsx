import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  UserCheck,
  PlusCircle,
  Search,
  Phone,
  Mail,
  Building2,
  Building,
  Tag,
  Key,
  TrendingUp,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  X,
  Download,
  LayoutGrid,
  List,
  Briefcase,
  Smartphone,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Upload,
  Calendar,
  Layers,
  MapPin,
  Save,
  DollarSign,
  CreditCard,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Clock,
  Calculator,
  History,
  Navigation,
  Crosshair,
  QrCode,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext.tsx';
import { FieldForceRep, Distributor, OrgNode } from '../../types/erp.ts';
import { getStoredMarketHierarchies, STANDARD_DEPARTMENTS } from '../../data/marketHierarchy.ts';
import { EmployeeProfileModal } from './EmployeeProfileModal.tsx';
import { EmployeeQrBulkModal, EmployeeQrSingleModal } from './EmployeeQrModal.tsx';
import { EmployeeCategory, EmploymentType, EmploymentStatus, OfficeLocation } from '../../types/payroll.ts';
import {
  DEFAULT_ALLOWED_RADIUS_METERS,
  isValidCoordinatePair,
} from '../../lib/geofence.ts';
import {
  findLinkedUserForEmployee,
  resolveGeofenceConfigFromUser,
} from '../../lib/fieldForceAuth.ts';

// Helper to filter out test/mock legacy employee records (e.g., ff-1 to ff-9 or dummy test data)
const isTestOrMockRep = (rep: any): boolean => {
  if (!rep) return true;
  const id = String(rep.id || '');
  const code = String(rep.code || '').toUpperCase().trim();
  const name = String(rep.name || '').toLowerCase().trim();
  if (
    id === 'ff-1' || id === 'ff-2' || id === 'ff-3' ||
    id === 'ff-4' || id === 'ff-5' || id === 'ff-6' ||
    id === 'ff-7' || id === 'ff-8' || id === 'ff-9' ||
    id.startsWith('mock-') || id.startsWith('test-')
  ) {
    return true;
  }
  if (
    code === 'EMP-MGT-001' || code === 'EMP-HR-002' || code === 'EMP-FIN-003' ||
    code === 'EMP-FAC-004' || code === 'EMP-FAC-005' || code === 'EMP-WH-006' ||
    code === 'EMP-FLD-007' || code === 'EMP-FLD-008' || code === 'EMP-IT-009'
  ) {
    return true;
  }
  if (name.includes('test rep') || name.includes('dummy officer') || name.includes('sample employee')) {
    return true;
  }
  return false;
};

const ACTION_TYPES = [
  'Primary Order Booking',
  'Secondary Sales & Delivery',
  'Corporate Key Accounts',
  'Market Survey & Field Audit',
  'Supervisory Inspection',
  'Staff',
  'Worker',
];

const FIELD_FORCE_TYPES = [
  { value: 'Order Booker', label: 'Order Booker' },
  { value: 'CaptureAndApprove', label: 'Capture & Approve' },
  { value: 'Supervisor', label: 'Supervisor' },
  { value: 'Delivery Man', label: 'Delivery Man' },
  { value: 'Capture', label: 'Field Scout / Capture' },
  { value: 'Permanent', label: 'Permanent' },
  { value: 'Temporary', label: 'Temporary' },
];

const APP_PERMISSIONS_LIST = [
  'Full Mobile Order & GPS Telemetry',
  'Order Booker Only',
  'Delivery & Cash Collection',
  'Supervisor & Approver Access',
];

const FIELD_FORCE_TAGS_LIST = [
  'Core Field Force',
  'Senior Executive SR',
  'Contractual Officer',
  'Probationary Team',
];

const CUSTOMER_TAGS_LIST = [
  'All Customer Channels',
  'Dealers & Retailers Only',
  'Direct Corporate Accounts Only',
  'Workshops & Mechanics',
];

const EMPLOYMENT_TYPE_OPTIONS = [
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

export const FieldForcePage: React.FC = () => {
  const {
    fieldForceReps,
    addFieldForceRep,
    updateFieldForceRep,
    deleteFieldForceRep,
    refreshFieldForce,
    clearFieldForceLocalData,
    distributors,
    departments,
    orgHierarchy,
    addAuditLog,
    users,
    currentUser,
    officeLocations,
    addOfficeLocation,
    updateOfficeLocation,
    deleteOfficeLocation,
    refreshOfficeLocations,
    hasPageAction,
  } = useERP();

  // Granular User-Level Employee Permissions (basic-data-field-force)
  const canCreateEmployee = hasPageAction ? hasPageAction('basic-data-field-force', 'create') : false;
  const canEditEmployee = hasPageAction ? hasPageAction('basic-data-field-force', 'edit') : false;
  const canAssignTarget = hasPageAction ? hasPageAction('basic-data-field-force', 'assign_target') : false;
  const canDeleteEmployee = hasPageAction ? hasPageAction('basic-data-field-force', 'delete') : false;

  // Search and Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedMarketFilter, setSelectedMarketFilter] = useState<string>('ALL');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'Active' | 'Inactive'>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 10;
  const [clearStorageNotice, setClearStorageNotice] = useState<string>('');

  // Auto purge test/local session memory on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('ensec_field_force_reps') || sessionStorage.getItem('ensec_field_force_reps');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((r: FieldForceRep) => !isTestOrMockRep(r));
            if (cleaned.length === 0) {
              localStorage.removeItem('ensec_field_force_reps');
              sessionStorage.removeItem('ensec_field_force_reps');
            } else if (cleaned.length !== parsed.length) {
              localStorage.setItem('ensec_field_force_reps', JSON.stringify(cleaned));
            }
          }
        }
      } catch {}
    }
  }, []);

  // Filter out any mock/test entries from the list
  const cleanFieldForceReps = useMemo(() => {
    return fieldForceReps.filter((r) => !isTestOrMockRep(r));
  }, [fieldForceReps]);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRep, setEditingRep] = useState<FieldForceRep | null>(null);
  const [viewingRep, setViewingRep] = useState<FieldForceRep | null>(null);
  const [repToDelete, setRepToDelete] = useState<FieldForceRep | null>(null);
  const [repToAssignTarget, setRepToAssignTarget] = useState<FieldForceRep | null>(null);
  const [quickTargetInputBDT, setQuickTargetInputBDT] = useState<number | ''>('');
  const [quickTargetSuccessMsg, setQuickTargetSuccessMsg] = useState<string>('');
  const [addModalTab, setAddModalTab] = useState<'all' | 'basic' | 'target' | 'overtime' | 'permissions' | 'approver'>('all');
  const [editModalTab, setEditModalTab] = useState<'all' | 'basic' | 'target' | 'overtime' | 'permissions' | 'approver'>('all');

  // Office GPS Locations Setup Modal State
  const [showOfficeSetupModal, setShowOfficeSetupModal] = useState(false);
  const [editingOfficeId, setEditingOfficeId] = useState<string | null>(null);
  const [officeFormCode, setOfficeFormCode] = useState('');
  const [officeFormName, setOfficeFormName] = useState('');
  const [officeFormAddress, setOfficeFormAddress] = useState('');
  const [officeFormLat, setOfficeFormLat] = useState<string>('23.8103');
  const [officeFormLng, setOfficeFormLng] = useState<string>('90.4125');
  const [officeFormRadius, setOfficeFormRadius] = useState<number>(DEFAULT_ALLOWED_RADIUS_METERS);
  const [officeFormStatus, setOfficeFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [officeFormNotice, setOfficeFormNotice] = useState<string>('');
  const [officeNoticeType, setOfficeNoticeType] = useState<'success' | 'error'>('success');
  const [isSavingOffice, setIsSavingOffice] = useState<boolean>(false);

  const getNextOfficeCode = (locs: OfficeLocation[]): string => {
    const existingCodes = new Set(locs.map((l) => (l.code || '').trim().toUpperCase()).filter(Boolean));
    let idx = locs.length + 1;
    while (existingCodes.has(`OFF-${String(idx).padStart(2, '0')}`)) {
      idx += 1;
    }
    return `OFF-${String(idx).padStart(2, '0')}`;
  };

  // Quick Tag TADA Approver Modal State (Super Admin Action)
  const [repToTagTadaApprover, setRepToTagTadaApprover] = useState<FieldForceRep | null>(null);
  const [quickSelectedApproverId, setQuickSelectedApproverId] = useState<string>('');
  const [quickTagSuccessMsg, setQuickTagSuccessMsg] = useState<string>('');

  // Form State for Add / Edit
  const [formCode, setFormCode] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formName, setFormName] = useState('');
  const [formNativeName, setFormNativeName] = useState('');
  const [formMobile, setFormMobile] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formJoiningDate, setFormJoiningDate] = useState(new Date().toISOString().substring(0, 10));
  const [formDiscontinueDate, setFormDiscontinueDate] = useState('');
  const [formFieldType, setFormFieldType] = useState('');
  const [formActionType, setFormActionType] = useState('');
  const [formGender, setFormGender] = useState('');
  const [formTadaApproverId, setFormTadaApproverId] = useState<string>('');
  const [formLinkedUserId, setFormLinkedUserId] = useState<string>('');
  const [qrModalRep, setQrModalRep] = useState<FieldForceRep | null>(null);
  const [showBulkQrModal, setShowBulkQrModal] = useState(false);

  // Overtime Policy & Configuration Form State
  const [formIsOvertimeEligible, setFormIsOvertimeEligible] = useState<boolean>(true);
  const [formOvertimeCalculationBasis, setFormOvertimeCalculationBasis] = useState<'Basic Salary' | 'Fixed Hourly Rate'>('Basic Salary');
  const [formOvertimeStandardHours, setFormOvertimeStandardHours] = useState<number>(208);
  const [formOvertimeMultiplier, setFormOvertimeMultiplier] = useState<number | ''>(2.0);
  const [formOvertimeFixedRate, setFormOvertimeFixedRate] = useState<number>(0);
  const [formOvertimeEffectiveFrom, setFormOvertimeEffectiveFrom] = useState<string>(new Date().toISOString().substring(0, 10));
  const [formOvertimePolicyStatus, setFormOvertimePolicyStatus] = useState<'Active' | 'Inactive'>('Active');
  const [formOvertimePolicyNotes, setFormOvertimePolicyNotes] = useState<string>('');
  
  // Market Hierarchy (Search & Tag)
  const [formMarketHierarchy, setFormMarketHierarchy] = useState('');
  const [marketHierarchySearch, setMarketHierarchySearch] = useState('');
  const [showMarketDropdown, setShowMarketDropdown] = useState(false);
  const [formRegion, setFormRegion] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formTerritory, setFormTerritory] = useState('');

  // Departments (Checklist with "All")
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [allDepartmentsChecked, setAllDepartmentsChecked] = useState(false);
  const [departmentError, setDepartmentError] = useState<string>('');
  const [formValidationError, setFormValidationError] = useState<string>('');

  // Markets & Distributors
  const [allMarketsChecked, setAllMarketsChecked] = useState(false);
  const [selectedDistributorId, setSelectedDistributorId] = useState('');
  const [selectedDistributorName, setSelectedDistributorName] = useState('');

  // Subordinate & Hierarchy
  const [parentCode, setParentCode] = useState('');
  const [invoiceWithinDays, setInvoiceWithinDays] = useState<number | ''>('');
  const [appPermissions, setAppPermissions] = useState('');
  const [fieldForceTags, setFieldForceTags] = useState('');
  const [customerTags, setCustomerTags] = useState('');

  // Compensation & Target
  const [monthlyTargetBDT, setMonthlyTargetBDT] = useState<number | ''>('');
  const [basicSalaryBDT, setBasicSalaryBDT] = useState<number | ''>('');
  const [formConveyanceBDT, setFormConveyanceBDT] = useState<number | ''>('');
  const [formTaDaBDT, setFormTaDaBDT] = useState<number | ''>('');
  const [formMobileAllowanceBDT, setFormMobileAllowanceBDT] = useState<number | ''>('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');

  // Comprehensive HR & Banking Details
  const [formEmployeeCategory, setFormEmployeeCategory] = useState('');
  const [formEmploymentType, setFormEmploymentType] = useState('');
  const [formNationalId, setFormNationalId] = useState('');
  const [formPresentAddress, setFormPresentAddress] = useState('');
  const [formPermanentAddress, setFormPermanentAddress] = useState('');
  const [formEmergencyContactName, setFormEmergencyContactName] = useState('');
  const [formEmergencyContactPhone, setFormEmergencyContactPhone] = useState('');
  const [formEmergencyContactRelation, setFormEmergencyContactRelation] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccountNumber, setFormBankAccountNumber] = useState('');
  const [formBankBranch, setFormBankBranch] = useState('');
  const [formRoutingNumber, setFormRoutingNumber] = useState('');
  const [formMobileBankingProvider, setFormMobileBankingProvider] = useState('bKash');
  const [formMobileBankingNumber, setFormMobileBankingNumber] = useState('');

  // Dynamic merged market hierarchy options (from stored list + orgHierarchy tree)
  const allMarketHierarchyOptions = useMemo(() => {
    const list = [...getStoredMarketHierarchies()];
    // Gather from orgHierarchy tree
    const gatherNodes = (node: OrgNode) => {
      if (node.type === 'Territory' || node.type === 'Area') {
        const full = `${node.code} - ${node.name}`;
        if (!list.some((item) => item.fullName.toLowerCase() === full.toLowerCase())) {
          list.push({
            code: node.code,
            name: node.name,
            fullName: full,
            region: 'Dhaka',
            area: node.name,
          });
        }
      }
      if (node.children) {
        node.children.forEach(gatherNodes);
      }
    };
    if (orgHierarchy) gatherNodes(orgHierarchy);
    return list;
  }, [orgHierarchy]);

  // Filtered market hierarchy list based on search term in modal
  const filteredMarketHierarchyOptions = useMemo(() => {
    if (!marketHierarchySearch.trim()) return allMarketHierarchyOptions;
    const query = marketHierarchySearch.toLowerCase();
    return allMarketHierarchyOptions.filter(
      (m) =>
        m.fullName.toLowerCase().includes(query) ||
        m.code.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query)
    );
  }, [allMarketHierarchyOptions, marketHierarchySearch]);

  const LEGACY_DUMMY_DEPARTMENTS = ['Primary Battery Sales', 'DEP-1 - MOUSUMI NETWORK LTD'];

  // Dynamic department options from ERPContext or fallback
  const availableDepartmentOptions = useMemo(() => {
    if (departments && departments.length > 0) {
      return departments.map((d) => d.fullName || `${d.code} - ${d.name}`);
    }
    return STANDARD_DEPARTMENTS;
  }, [departments]);

  const renderedDepartmentOptions = useMemo(() => {
    const extras = selectedDepartments.filter((d) => !availableDepartmentOptions.includes(d));
    return [...availableDepartmentOptions, ...extras];
  }, [availableDepartmentOptions, selectedDepartments]);

  // Handle department checkbox toggle
  const toggleDepartment = (dept: string) => {
    setDepartmentError('');
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter((d) => d !== dept));
      setAllDepartmentsChecked(false);
    } else {
      const next = [...selectedDepartments, dept];
      setSelectedDepartments(next);
      if (availableDepartmentOptions.length > 0 && availableDepartmentOptions.every((opt) => next.includes(opt))) {
        setAllDepartmentsChecked(true);
      }
    }
  };

  const toggleAllDepartments = () => {
    setDepartmentError('');
    if (allDepartmentsChecked) {
      setSelectedDepartments([]);
      setAllDepartmentsChecked(false);
    } else {
      setSelectedDepartments([...availableDepartmentOptions]);
      setAllDepartmentsChecked(true);
    }
  };

  const generateNextEmployeeCode = (): string => {
    const existingCodes = new Set(
      fieldForceReps
        .map((r) => String(r.code || '').trim().toUpperCase())
        .filter(Boolean)
    );
    let maxNum = 0;
    existingCodes.forEach((code) => {
      const match = code.match(/^EMP[-_]?(\d+)$/i);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    });
    let nextNum = maxNum + 1;
    let candidate = `EMP${String(nextNum).padStart(6, '0')}`;
    while (existingCodes.has(candidate)) {
      nextNum += 1;
      candidate = `EMP${String(nextNum).padStart(6, '0')}`;
    }
    return candidate;
  };

  // Reset Add Form
  const resetForm = () => {
    setFormCode(generateNextEmployeeCode());
    setFormPin('');
    setFormName('');
    setFormNativeName('');
    setFormMobile('');
    setFormEmail('');
    setFormDesignation('');
    setFormJoiningDate(new Date().toISOString().substring(0, 10));
    setFormDiscontinueDate('');
    setFormFieldType('');
    setFormActionType('');
    setFormGender('');
    setFormMarketHierarchy('');
    setMarketHierarchySearch('');
    setShowMarketDropdown(false);
    setFormRegion('');
    setFormArea('');
    setFormTerritory('');
    setSelectedDepartments([]);
    setAllDepartmentsChecked(false);
    setAllMarketsChecked(false);
    setSelectedDistributorId('');
    setSelectedDistributorName('');
    setParentCode('');
    setInvoiceWithinDays('');
    setAppPermissions('');
    setFieldForceTags('');
    setCustomerTags('');
    setMonthlyTargetBDT('');
    setBasicSalaryBDT('');
    setFormConveyanceBDT('');
    setFormTaDaBDT('');
    setFormMobileAllowanceBDT('');
    setFormStatus('Active');
    setFormEmployeeCategory('');
    setFormEmploymentType('');
    setFormNationalId('');
    setFormPresentAddress('');
    setFormPermanentAddress('');
    setFormEmergencyContactName('');
    setFormEmergencyContactPhone('');
    setFormEmergencyContactRelation('');
    setFormBankName('');
    setFormBankAccountNumber('');
    setFormBankBranch('');
    setFormRoutingNumber('');
    setFormMobileBankingProvider('bKash');
    setFormMobileBankingNumber('');
    // Overtime Policy Defaults
    setFormIsOvertimeEligible(true);
    setFormOvertimeCalculationBasis('Basic Salary');
    setFormOvertimeStandardHours(208);
    setFormOvertimeMultiplier(2.0);
    setFormOvertimeFixedRate(0);
    setFormOvertimeEffectiveFrom(new Date().toISOString().substring(0, 10));
    setFormOvertimePolicyStatus('Active');
    setFormOvertimePolicyNotes('');
    setFormTadaApproverId('');
    setFormLinkedUserId('');
    setDepartmentError('');
    setFormValidationError('');
  };

  const handleOpenAdd = () => {
    if (!canCreateEmployee) return;
    resetForm();
    setAddModalTab('all');
    setShowAddModal(true);
  };

  const handleOpenEdit = (rep: FieldForceRep) => {
    if (!canEditEmployee) return;
    setEditingRep(rep);
    setEditModalTab('all');
    setDepartmentError('');
    setFormValidationError('');
    setFormCode(rep.code || '');
    setFormPin(rep.pin || '1234');
    setFormName(rep.name || '');
    setFormNativeName(rep.nativeName || '');
    setFormMobile(rep.phone || '');
    setFormEmail(rep.email || '');
    setFormDesignation(rep.designation || '');
    setFormJoiningDate(rep.joiningDate || new Date().toISOString().substring(0, 10));
    setFormDiscontinueDate(rep.discontinueDate || '');
    setFormFieldType(rep.fieldForceType || '');
    setFormActionType(rep.actionType || '');
    setFormGender(rep.gender || '');
    setFormTadaApproverId(rep.tadaApproverId || '');
    
    // Overtime Policy fields from rep
    setFormIsOvertimeEligible(rep.isOvertimeEligible !== undefined ? Boolean(rep.isOvertimeEligible) : true);
    setFormOvertimeCalculationBasis(rep.overtimeCalculationBasis || 'Basic Salary');
    setFormOvertimeStandardHours(Number(rep.overtimeStandardMonthlyHours) || 208);
    setFormOvertimeMultiplier(
      rep.overtimeMultiplier !== undefined && rep.overtimeMultiplier !== null && !Number.isNaN(Number(rep.overtimeMultiplier))
        ? Number(rep.overtimeMultiplier)
        : 2.0
    );
    setFormOvertimeFixedRate(Number(rep.overtimeFixedHourlyRateBDT) || 0);
    setFormOvertimeEffectiveFrom(rep.overtimePolicyEffectiveFrom || rep.joiningDate || new Date().toISOString().substring(0, 10));
    setFormOvertimePolicyStatus(rep.overtimePolicyStatus || (rep.isActive === false ? 'Inactive' : 'Active'));
    setFormOvertimePolicyNotes(rep.overtimePolicyNotes || '');
    
    const hierarchyVal = rep.marketHierarchy || rep.territory || '';
    setFormMarketHierarchy(hierarchyVal);
    setFormRegion(rep.region || '');
    setFormArea(rep.area || '');
    setFormTerritory(rep.territory || hierarchyVal);
    setMarketHierarchySearch('');
    setShowMarketDropdown(false);

    const rawDepts =
      rep.departments && rep.departments.length > 0
        ? rep.departments
        : rep.department
          ? [rep.department]
          : [];
    const cleanedDepts = Array.from(
      new Set(
        rawDepts.filter(
          (d) =>
            Boolean(d) &&
            (!LEGACY_DUMMY_DEPARTMENTS.includes(d) || availableDepartmentOptions.includes(d))
        )
      )
    );
    setSelectedDepartments(cleanedDepts);
    setAllDepartmentsChecked(
      availableDepartmentOptions.length > 0 &&
        availableDepartmentOptions.every((opt) => cleanedDepts.includes(opt))
    );
    setAllMarketsChecked(true);
    setSelectedDistributorId(rep.distributorId || '');
    setSelectedDistributorName(rep.distributorName || '');
    setParentCode(rep.parentCode || '');
    setInvoiceWithinDays(rep.invoiceWithinDays !== undefined && rep.invoiceWithinDays !== null ? rep.invoiceWithinDays : '');
    setAppPermissions(rep.appPermissions?.[0] || '');
    setFieldForceTags(rep.fieldForceTags?.[0] || '');
    setCustomerTags(rep.customerTags?.[0] || '');
    setMonthlyTargetBDT(rep.monthlyTargetBDT !== undefined && rep.monthlyTargetBDT !== null ? rep.monthlyTargetBDT : '');
    setBasicSalaryBDT(rep.basicSalaryBDT !== undefined && rep.basicSalaryBDT !== null ? rep.basicSalaryBDT : '');
    setFormConveyanceBDT(rep.conveyanceBDT !== undefined && rep.conveyanceBDT !== null ? rep.conveyanceBDT : '');
    setFormTaDaBDT(rep.taDaBDT !== undefined && rep.taDaBDT !== null ? rep.taDaBDT : '');
    setFormMobileAllowanceBDT(rep.mobileAllowanceBDT !== undefined && rep.mobileAllowanceBDT !== null ? rep.mobileAllowanceBDT : '');
    setFormStatus((rep.status as any) || (rep.isActive === false ? 'Inactive' : 'Active'));

    // Extended HR & Banking details
    setFormEmployeeCategory(rep.employeeCategory || '');
    setFormEmploymentType(rep.employmentType || '');
    setFormNationalId(rep.nationalId || '');
    setFormPresentAddress(rep.presentAddress || '');
    setFormPermanentAddress(rep.permanentAddress || '');
    setFormEmergencyContactName(rep.emergencyContactName || '');
    setFormEmergencyContactPhone(rep.emergencyContactPhone || '');
    setFormEmergencyContactRelation(rep.emergencyContactRelation || '');
    setFormBankName(rep.bankName || '');
    setFormBankAccountNumber(rep.bankAccountNumber || '');
    setFormBankBranch(rep.bankBranch || '');
    setFormRoutingNumber(rep.routingNumber || '');
    setFormMobileBankingProvider(rep.mobileBankingProvider || 'bKash');
    setFormMobileBankingNumber(rep.mobileBankingNumber || '');
    setFormLinkedUserId(rep.userId || '');
  };

  const handleClearLocalStorage = () => {
    if (window.confirm('Are you sure you want to remove all local session and test storage data for Field Force? All test data will be wiped and real database records will be synced.')) {
      if (clearFieldForceLocalData) {
        clearFieldForceLocalData();
      } else {
        localStorage.removeItem('ensec_field_force_reps');
        sessionStorage.removeItem('ensec_field_force_reps');
        if (refreshFieldForce) refreshFieldForce();
      }
      setClearStorageNotice('Local test/session storage cleared successfully! Filtered clean baseline active.');
      setTimeout(() => setClearStorageNotice(''), 4500);
    }
  };

  const handleOpenQuickTagTadaApprover = (rep: FieldForceRep) => {
    if (!canEditEmployee) return;
    setRepToTagTadaApprover(rep);
    setQuickSelectedApproverId(rep.tadaApproverId || users[0]?.id || '');
    setQuickTagSuccessMsg('');
  };

  const handleSaveQuickTagTadaApprover = () => {
    if (!canEditEmployee || !repToTagTadaApprover) return;
    const selectedUser = users.find((u) => u.id === quickSelectedApproverId);
    if (!selectedUser) return;

    updateFieldForceRep(repToTagTadaApprover.id, {
      tadaApproverId: selectedUser.id,
      tadaApproverName: `${selectedUser.name} (${selectedUser.role})`,
    });

    addAuditLog(
      'FIELD_FORCE_TADA_APPROVER_TAGGED',
      'Field Force Directory',
      `${currentUser.name} tagged ${selectedUser.name} (${selectedUser.role}) as TADA Approver for ${repToTagTadaApprover.name} (${repToTagTadaApprover.code})`
    );

    setQuickTagSuccessMsg(`Tagged ${selectedUser.name} as TADA Approver successfully!`);
    setTimeout(() => {
      setRepToTagTadaApprover(null);
      setQuickTagSuccessMsg('');
    }, 900);
  };

  const handleOpenAssignTarget = (rep: FieldForceRep) => {
    if (!canAssignTarget) return;
    setRepToAssignTarget(rep);
    setQuickTargetInputBDT(rep.monthlyTargetBDT ?? 0);
    setQuickTargetSuccessMsg('');
  };

  const handleSaveAssignTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAssignTarget || !repToAssignTarget) return;
    const nextTarget =
      quickTargetInputBDT === '' || Number.isNaN(Number(quickTargetInputBDT))
        ? 0
        : Math.max(0, Number(quickTargetInputBDT));
    updateFieldForceRep(repToAssignTarget.id, {
      monthlyTargetBDT: nextTarget,
    });
    setQuickTargetSuccessMsg(
      `Assigned monthly target of ৳ ${nextTarget.toLocaleString()} to ${repToAssignTarget.name}!`
    );
    setTimeout(() => {
      setRepToAssignTarget(null);
      setQuickTargetSuccessMsg('');
    }, 850);
  };

  const getMissingRequiredProfileFields = (): string[] => {
    const missing: string[] = [];
    if (!formActionType.trim()) missing.push('Action Type');
    if (!formJoiningDate.trim()) missing.push('Joining Date');
    if (!formGender.trim()) missing.push('Gender');
    if (!formEmployeeCategory.trim()) missing.push('Employee Category');
    if (!formEmploymentType.trim()) missing.push('Employment Type');
    if (!formPresentAddress.trim()) missing.push('Present Address');
    return missing;
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateEmployee) return;
    if (!formName.trim() || !formCode.trim()) return;
    const missingProfileFields = getMissingRequiredProfileFields();
    if (missingProfileFields.length > 0) {
      setFormValidationError(`Please fill in required fields: ${missingProfileFields.join(', ')}.`);
      if (addModalTab !== 'all' && addModalTab !== 'basic') {
        setAddModalTab('basic');
      }
      return;
    }
    setFormValidationError('');
    if (selectedDepartments.length === 0) {
      setDepartmentError('Please select at least one Assigned Business Department.');
      if (addModalTab !== 'all' && addModalTab !== 'basic') {
        setAddModalTab('basic');
      }
      return;
    }
    setDepartmentError('');

    const assignedDist = distributors.find((d) => d.id === selectedDistributorId);
    const matchedHierarchy = allMarketHierarchyOptions.find(
      (m) => m.fullName.toLowerCase() === formMarketHierarchy.toLowerCase()
    );

    // Derive region and territory safely from the market hierarchy tag
    const resolvedRegion = matchedHierarchy?.region || formRegion.trim() || '';
    const resolvedArea = matchedHierarchy?.area || formArea.trim() || '';
    const resolvedTerritory = matchedHierarchy?.name || formTerritory.trim() || formMarketHierarchy.trim() || '';
    const selectedTadaApprover = users.find((u) => u.id === formTadaApproverId);
    const reportingMgr = parentCode ? cleanFieldForceReps.find((r) => r.code === parentCode) : undefined;

    const createdId = addFieldForceRep({
      userId: formLinkedUserId.trim() || undefined,
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      nativeName: formNativeName.trim() || undefined,
      pin: formPin.trim(),
      phone: formMobile.trim(),
      email: formEmail.trim() || undefined,
      designation: formDesignation.trim(),
      department: selectedDepartments[0] || '',
      departments: [...selectedDepartments],
      fieldForceType: formFieldType,
      actionType: formActionType || undefined,
      gender: formGender || undefined,
      marketHierarchy: formMarketHierarchy,
      region: resolvedRegion,
      area: resolvedArea,
      territory: resolvedTerritory,
      distributorId: assignedDist?.id || selectedDistributorId,
      distributorName: assignedDist?.name || selectedDistributorName,
      distributors: assignedDist ? [assignedDist.name] : [],
      parentCode: parentCode.trim() || undefined,
      reportingManagerId: reportingMgr?.id,
      reportingManagerName: reportingMgr ? `${reportingMgr.name} (${reportingMgr.code})` : undefined,
      joiningDate: formJoiningDate,
      discontinueDate: formDiscontinueDate || undefined,
      invoiceWithinDays: invoiceWithinDays === '' ? undefined : Number(invoiceWithinDays),
      appPermissions: appPermissions ? [appPermissions] : [],
      fieldForceTags: fieldForceTags ? [fieldForceTags] : [],
      customerTags: customerTags ? [customerTags] : [],
      monthlyTargetBDT: canAssignTarget ? (monthlyTargetBDT === '' ? 0 : Number(monthlyTargetBDT)) : 0,
      monthlyAchievedBDT: 0,
      basicSalaryBDT: basicSalaryBDT === '' ? 0 : Number(basicSalaryBDT),
      conveyanceBDT: formConveyanceBDT === '' ? 0 : Number(formConveyanceBDT),
      taDaBDT: formTaDaBDT === '' ? 0 : Number(formTaDaBDT),
      mobileAllowanceBDT: formMobileAllowanceBDT === '' ? 0 : Number(formMobileAllowanceBDT),
      tadaApproverId: selectedTadaApprover?.id || undefined,
      tadaApproverName: selectedTadaApprover ? `${selectedTadaApprover.name} (${selectedTadaApprover.role})` : undefined,
      nationalId: formNationalId.trim() || undefined,
      employeeCategory: formEmployeeCategory || undefined,
      employmentType: formEmploymentType,
      employmentStatus: formStatus,
      presentAddress: formPresentAddress.trim() || undefined,
      permanentAddress: formPermanentAddress.trim() || undefined,
      emergencyContactName: formEmergencyContactName.trim() || undefined,
      emergencyContactPhone: formEmergencyContactPhone.trim() || undefined,
      emergencyContactRelation: formEmergencyContactRelation.trim() || undefined,
      bankName: formBankName.trim() || undefined,
      bankAccountNumber: formBankAccountNumber.trim() || undefined,
      bankBranch: formBankBranch.trim() || undefined,
      routingNumber: formRoutingNumber.trim() || undefined,
      mobileBankingProvider: formMobileBankingProvider || undefined,
      mobileBankingNumber: formMobileBankingNumber.trim() || undefined,
      status: formStatus,
      isActive: formStatus === 'Active',
      // Individual Overtime Policy Configuration
      isOvertimeEligible: formIsOvertimeEligible,
      overtimeCalculationBasis: formOvertimeCalculationBasis,
      overtimeStandardMonthlyHours: Number(formOvertimeStandardHours) || 208,
      overtimeMultiplier:
        formOvertimeMultiplier === '' || Number.isNaN(Number(formOvertimeMultiplier))
          ? 0
          : Math.max(0, Number(formOvertimeMultiplier)),
      overtimeFixedHourlyRateBDT: Number(formOvertimeFixedRate) || 0,
      overtimePolicyEffectiveFrom: formOvertimeEffectiveFrom,
      overtimePolicyStatus: formOvertimePolicyStatus,
      overtimePolicyNotes: formOvertimePolicyNotes.trim() || undefined,
      overtimePolicyHistory: [],
      todayVisitsCount: 0,
      productiveVisitsCount: 0,
      currentLocation: {
        latitude: officeLocations[0]?.latitude || 23.8103,
        longitude: officeLocations[0]?.longitude || 90.4125,
        address: formMarketHierarchy || resolvedTerritory ? `${formMarketHierarchy || resolvedTerritory}, Bangladesh` : 'Bangladesh',
        lastUpdated: 'New Registration',
        speedKmH: 0,
        batteryLevel: 100,
        isOnline: true,
      },
    });

    if (!createdId) return;

    addAuditLog(
      'FIELD_FORCE_CREATED',
      'Field Force Directory',
      `Registered field force officer ${formName} (${formCode}) with Overtime Policy: ${formIsOvertimeEligible ? `Eligible (${formOvertimeMultiplier}x, Basis: ${formOvertimeCalculationBasis})` : 'Ineligible'}`
    );

    setShowAddModal(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditEmployee || !editingRep) return;
    const missingProfileFields = getMissingRequiredProfileFields();
    if (missingProfileFields.length > 0) {
      setFormValidationError(`Please fill in required fields: ${missingProfileFields.join(', ')}.`);
      if (editModalTab !== 'all' && editModalTab !== 'basic') {
        setEditModalTab('basic');
      }
      return;
    }
    setFormValidationError('');
    if (selectedDepartments.length === 0) {
      setDepartmentError('Please select at least one Assigned Business Department.');
      if (editModalTab !== 'all' && editModalTab !== 'basic') {
        setEditModalTab('basic');
      }
      return;
    }
    setDepartmentError('');

    const assignedDist = distributors.find((d) => d.id === selectedDistributorId);
    const matchedHierarchy = allMarketHierarchyOptions.find(
      (m) => m.fullName.toLowerCase() === formMarketHierarchy.toLowerCase()
    );

    const resolvedRegion = matchedHierarchy?.region || formRegion.trim() || '';
    const resolvedArea = matchedHierarchy?.area || formArea.trim() || '';
    const resolvedTerritory = matchedHierarchy?.name || formTerritory.trim() || formMarketHierarchy.trim() || '';
    const selectedTadaApprover = users.find((u) => u.id === formTadaApproverId);

    // Check if Overtime Policy was amended, and archive old version to policy history if changed
    const isPolicyAmended =
      editingRep.isOvertimeEligible !== formIsOvertimeEligible ||
      (editingRep.overtimeCalculationBasis || 'Basic Salary') !== formOvertimeCalculationBasis ||
      Number(editingRep.overtimeStandardMonthlyHours || 208) !== Number(formOvertimeStandardHours) ||
      Number(editingRep.overtimeMultiplier ?? 2.0) !== (formOvertimeMultiplier === '' ? 0 : Number(formOvertimeMultiplier)) ||
      Number(editingRep.overtimeFixedHourlyRateBDT || 0) !== Number(formOvertimeFixedRate) ||
      (editingRep.overtimePolicyStatus || 'Active') !== formOvertimePolicyStatus;

    let updatedHistory = Array.isArray(editingRep.overtimePolicyHistory) ? [...editingRep.overtimePolicyHistory] : [];
    if (isPolicyAmended) {
      const oldSnapshot = {
        id: `pol-hist-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        employeeId: editingRep.id,
        isEligible: editingRep.isOvertimeEligible !== false,
        calculationBasis: (editingRep.overtimeCalculationBasis as any) || 'Basic Salary',
        standardMonthlyWorkingHours: Number(editingRep.overtimeStandardMonthlyHours) || 208,
        overtimeMultiplier: editingRep.overtimeMultiplier ?? 2.0,
        fixedHourlyRateBDT: Number(editingRep.overtimeFixedHourlyRateBDT) || 0,
        effectiveFrom: editingRep.overtimePolicyEffectiveFrom || editingRep.joiningDate || '2026-01-01',
        effectiveTo: formOvertimeEffectiveFrom || new Date().toISOString().substring(0, 10),
        status: (editingRep.overtimePolicyStatus as any) || 'Active',
        notes: formOvertimePolicyNotes || 'Amended via Field Force Employee Master',
        createdAt: new Date().toISOString(),
        updatedBy: currentUser.name,
      };
      updatedHistory = [oldSnapshot, ...updatedHistory];
    }

    updateFieldForceRep(editingRep.id, {
      userId: formLinkedUserId.trim() || undefined,
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      nativeName: formNativeName.trim() || undefined,
      pin: formPin.trim(),
      phone: formMobile.trim(),
      email: formEmail.trim() || undefined,
      designation: formDesignation.trim(),
      department: selectedDepartments[0] || '',
      departments: [...selectedDepartments],
      fieldForceType: formFieldType,
      actionType: formActionType || '',
      gender: formGender || undefined,
      marketHierarchy: formMarketHierarchy,
      region: resolvedRegion,
      area: resolvedArea,
      territory: resolvedTerritory,
      distributorId: assignedDist?.id || selectedDistributorId,
      distributorName: assignedDist?.name || selectedDistributorName,
      distributors: assignedDist ? [assignedDist.name] : editingRep.distributors,
      parentCode: parentCode.trim() || undefined,
      joiningDate: formJoiningDate,
      discontinueDate: formDiscontinueDate || undefined,
      invoiceWithinDays: invoiceWithinDays === '' ? undefined : Number(invoiceWithinDays),
      appPermissions: appPermissions ? [appPermissions] : [],
      fieldForceTags: fieldForceTags ? [fieldForceTags] : [],
      customerTags: customerTags ? [customerTags] : [],
      ...(canAssignTarget
        ? { monthlyTargetBDT: monthlyTargetBDT === '' ? 0 : Number(monthlyTargetBDT) }
        : {}),
      basicSalaryBDT: basicSalaryBDT === '' ? 0 : Number(basicSalaryBDT),
      conveyanceBDT: formConveyanceBDT === '' ? 0 : Number(formConveyanceBDT),
      taDaBDT: formTaDaBDT === '' ? 0 : Number(formTaDaBDT),
      mobileAllowanceBDT: formMobileAllowanceBDT === '' ? 0 : Number(formMobileAllowanceBDT),
      tadaApproverId: selectedTadaApprover?.id || '',
      tadaApproverName: selectedTadaApprover ? `${selectedTadaApprover.name} (${selectedTadaApprover.role})` : '',
      status: formStatus,
      isActive: formStatus === 'Active',

      // Individual Overtime Policy Configuration
      isOvertimeEligible: formIsOvertimeEligible,
      overtimeCalculationBasis: formOvertimeCalculationBasis,
      overtimeStandardMonthlyHours: Number(formOvertimeStandardHours) || 208,
      overtimeMultiplier:
        formOvertimeMultiplier === '' || Number.isNaN(Number(formOvertimeMultiplier))
          ? 0
          : Math.max(0, Number(formOvertimeMultiplier)),
      overtimeFixedHourlyRateBDT: Number(formOvertimeFixedRate) || 0,
      overtimePolicyEffectiveFrom: formOvertimeEffectiveFrom,
      overtimePolicyStatus: formOvertimePolicyStatus,
      overtimePolicyNotes: formOvertimePolicyNotes.trim() || undefined,
      overtimePolicyHistory: updatedHistory,

      employeeCategory: formEmployeeCategory || '',
      employmentType: formEmploymentType,
      employmentStatus: formStatus === 'Active' ? 'Active' : 'Inactive',
      nationalId: formNationalId.trim() || undefined,
      presentAddress: formPresentAddress.trim() || undefined,
      permanentAddress: formPermanentAddress.trim() || undefined,
      emergencyContactName: formEmergencyContactName.trim() || undefined,
      emergencyContactPhone: formEmergencyContactPhone.trim() || undefined,
      emergencyContactRelation: formEmergencyContactRelation.trim() || undefined,
      bankName: formBankName.trim() || undefined,
      bankAccountNumber: formBankAccountNumber.trim() || undefined,
      bankBranch: formBankBranch.trim() || undefined,
      routingNumber: formRoutingNumber.trim() || undefined,
      mobileBankingProvider: formMobileBankingProvider || undefined,
      mobileBankingNumber: formMobileBankingNumber.trim() || undefined,
    });

    addAuditLog(
      'FIELD_FORCE_UPDATED',
      'Field Force Directory',
      `Updated profile for ${editingRep.name} (${formCode}) -> Overtime Policy: ${formIsOvertimeEligible ? `Eligible (${formOvertimeMultiplier}x, ${formOvertimeCalculationBasis})` : 'Ineligible'}${isPolicyAmended ? ' [Policy Amended & Version Archived]' : ''}`
    );

    setEditingRep(null);
  };

  const handleToggleStatus = (rep: FieldForceRep) => {
    if (!canEditEmployee) return;
    const nextStatus = rep.status === 'Active' ? 'Inactive' : 'Active';
    updateFieldForceRep(rep.id, {
      status: nextStatus,
      isActive: nextStatus === 'Active',
    });
    addAuditLog(
      'FIELD_FORCE_STATUS_TOGGLED',
      'Field Force Master',
      `Changed status of ${rep.name} (${rep.code}) to ${nextStatus}`
    );
  };

  const handleDeleteConfirm = () => {
    if (!canDeleteEmployee || !repToDelete) return;
    deleteFieldForceRep(repToDelete.id);
    setRepToDelete(null);
  };

  // Filtered List based on clean field force data (excluding mock/test items)
  const filteredReps = useMemo(() => {
    return cleanFieldForceReps.filter((rep) => {
      // Query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          rep.name.toLowerCase().includes(query) ||
          rep.code.toLowerCase().includes(query) ||
          rep.phone.toLowerCase().includes(query) ||
          (rep.nativeName && rep.nativeName.toLowerCase().includes(query)) ||
          (rep.marketHierarchy && rep.marketHierarchy.toLowerCase().includes(query)) ||
          rep.territory.toLowerCase().includes(query) ||
          (rep.distributorName && rep.distributorName.toLowerCase().includes(query));
        if (!matchesQuery) return false;
      }

      // Category filter
      if (selectedCategoryFilter !== 'ALL') {
        const cat = rep.employeeCategory || 'Field Employee';
        if (cat !== selectedCategoryFilter) return false;
      }

      // Market Hierarchy filter
      if (selectedMarketFilter !== 'ALL') {
        const repHier = rep.marketHierarchy || rep.territory;
        if (!repHier || !repHier.toLowerCase().includes(selectedMarketFilter.toLowerCase())) {
          return false;
        }
      }

      // Designation filter
      if (selectedDesignation !== 'ALL' && rep.designation !== selectedDesignation) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        const isRepActive = rep.status === 'Active' || rep.isActive !== false;
        if (selectedStatus === 'Active' && !isRepActive) return false;
        if (selectedStatus === 'Inactive' && isRepActive) return false;
      }

      return true;
    });
  }, [cleanFieldForceReps, searchQuery, selectedCategoryFilter, selectedMarketFilter, selectedDesignation, selectedStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategoryFilter, selectedMarketFilter, selectedDesignation, selectedStatus]);

  const pagination = useMemo(() => {
    const totalEmployees = filteredReps.length;
    const totalPages = Math.max(1, Math.ceil(totalEmployees / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;
    const paginatedReps = filteredReps.slice(startIndex, startIndex + PAGE_SIZE);
    const startRecord = totalEmployees === 0 ? 0 : startIndex + 1;
    const endRecord = Math.min(safePage * PAGE_SIZE, totalEmployees);

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
      paginatedReps,
      startRecord,
      endRecord,
      pageNumbers,
    };
  }, [filteredReps, currentPage]);

  useEffect(() => {
    if (currentPage > pagination.totalPages) {
      setCurrentPage(pagination.totalPages);
    }
  }, [currentPage, pagination.totalPages]);

  // High-Level KPIs
  const totalReps = cleanFieldForceReps.length;
  const activeRepsCount = cleanFieldForceReps.filter(
    (r) => r.status === 'Active' || r.isActive !== false
  ).length;
  const totalTargetBDT = cleanFieldForceReps.reduce((acc, r) => acc + (r.monthlyTargetBDT || 0), 0);
  const totalAchievedBDT = cleanFieldForceReps.reduce((acc, r) => acc + (r.monthlyAchievedBDT || 0), 0);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Code',
      'Name',
      'Native Name',
      'Designation',
      'Market Hierarchy Tag',
      'Action Type',
      'Phone',
      'Distributor',
      'Monthly Target (BDT)',
      'Status',
    ];
    const rows = filteredReps.map((r) => [
      r.code,
      `"${r.name}"`,
      `"${r.nativeName || ''}"`,
      `"${r.designation}"`,
      `"${r.marketHierarchy || r.territory}"`,
      `"${r.actionType || 'Primary Booking'}"`,
      `"${r.phone}"`,
      `"${r.distributorName || ''}"`,
      r.monthlyTargetBDT || 0,
      r.status || 'Active',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `field_force_directory_${new Date().toISOString().substring(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
            <span>Basic Data Master</span>
            <span>/</span>
            <span className="text-slate-900 dark:text-white">Employee</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Employee Master Directory
            </h1>
          </div>
          
        </div>

        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setEditingOfficeId(null);
              setOfficeFormCode(getNextOfficeCode(officeLocations));
              setOfficeFormName('');
              setOfficeFormAddress('');
              setOfficeFormLat('23.8103');
              setOfficeFormLng('90.4125');
              setOfficeFormRadius(DEFAULT_ALLOWED_RADIUS_METERS);
              setOfficeFormStatus('Active');
              setOfficeFormNotice('');
              setOfficeNoticeType('success');
              setShowOfficeSetupModal(true);
              refreshOfficeLocations?.();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-2xs"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Office GPS Setup ({officeLocations.filter((o) => o.status === 'Active').length})</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowBulkQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shadow-2xs"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Bulk QR Codes (A4)</span>
          </button>
          {canCreateEmployee && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register Employee</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {clearStorageNotice && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{clearStorageNotice}</span>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Corporate Personnel */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Enterprise Staff</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalReps} <span className="text-xs font-normal text-slate-500">Personnel</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{activeRepsCount} Active in Payroll</span>
          </div>
        </div>

        {/* Card 2: Office & Management */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Office & Management</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {cleanFieldForceReps.filter((r) => r.employeeCategory === 'Office Employee' || r.employeeCategory === 'Management Employee').length} <span className="text-xs font-normal text-slate-500">Head Office</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Accounts, HR & Operations
          </div>
        </div>

        {/* Card 3: Field Force & Sales */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Field Force & Sales</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {cleanFieldForceReps.filter((r) => r.employeeCategory === 'Field Employee' || !r.employeeCategory).length} <span className="text-xs font-normal text-slate-500">Officers</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Monthly Target: ৳{(totalTargetBDT / 100000).toFixed(1)}L
          </div>
        </div>

        {/* Card 4: Factory & Production */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Factory & Logistics</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {cleanFieldForceReps.filter((r) => r.employeeCategory === 'Factory Employee' || r.employeeCategory === 'Warehouse Employee').length} <span className="text-xs font-normal text-slate-500">Staff</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Kushtia Plant & Central Hubs
          </div>
        </div>
      </div>

      {/* Employee Category Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'ALL', label: 'All Employees', count: fieldForceReps.length },
          { id: 'Office Employee', label: 'Office Staff', count: fieldForceReps.filter((r) => r.employeeCategory === 'Office Employee').length },
          { id: 'Field Employee', label: 'Field Force & Sales', count: fieldForceReps.filter((r) => r.employeeCategory === 'Field Employee' || !r.employeeCategory).length },
          { id: 'Factory Employee', label: 'Factory & Production', count: fieldForceReps.filter((r) => r.employeeCategory === 'Factory Employee').length },
          { id: 'Production', label: 'Production', count: fieldForceReps.filter((r) => r.employeeCategory === 'Production').length },
          { id: 'Warehouse Employee', label: 'Warehouse & Logistics', count: fieldForceReps.filter((r) => r.employeeCategory === 'Warehouse Employee').length },
          { id: 'Management Employee', label: 'Management & C-Suite', count: fieldForceReps.filter((r) => r.employeeCategory === 'Management Employee').length },
        ].map((tab) => {
          const isSelected = selectedCategoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedCategoryFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 border ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Control Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code (e.g. SPO10589, FF-101), name, mobile, Market Hierarchy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <span className="text-xs text-slate-500 mr-1">
              Showing <b>{filteredReps.length}</b> of {fieldForceReps.length}
            </span>
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Grid Cards"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Market Hierarchy Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Market Hierarchy Filter
            </label>
            <select
              value={selectedMarketFilter}
              onChange={(e) => setSelectedMarketFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Market Hierarchy Nodes</option>
              {allMarketHierarchyOptions.map((opt) => (
                <option key={opt.code} value={opt.name}>
                  {opt.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Designation */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Field Force Type / Role
            </label>
            <select
              value={selectedDesignation}
              onChange={(e) => setSelectedDesignation(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Roles</option>
              {FIELD_FORCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Status</option>
              <option value="Active">Active Officers Only</option>
              <option value="Inactive">Inactive / Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {/* Directory Content */}
      {filteredReps.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            No Employees Found
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search criteria or register a new employee.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedMarketFilter('ALL');
              setSelectedDesignation('ALL');
              setSelectedStatus('ALL');
            }}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Officer / Employee</th>
                  <th className="py-3 px-4">Role & Action Type</th>
                  <th className="py-3 px-4">Market Hierarchy Tag</th>
                  <th className="py-3 px-4">Distributor Mapped</th>
                  <th className="py-3 px-4">TADA Approve Person</th>
                  <th className="py-3 px-4">Monthly Target</th>
                  <th className="py-3 px-4">Mobile PIN</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {pagination.paginatedReps.map((rep) => {
                  const isActive = rep.status === 'Active' || rep.isActive !== false;
                  const targetBDT = rep.monthlyTargetBDT || 2500000;
                  const achievedBDT = rep.monthlyAchievedBDT || 0;
                  const progressPct = Math.min(100, Math.round((achievedBDT / (targetBDT || 1)) * 100));
                  const hierarchyDisplay = rep.marketHierarchy || rep.territory || 'Not Assigned';

                  return (
                    <tr
                      key={rep.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Officer Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                            {rep.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{rep.name}</span>
                              {rep.nativeName && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                   ({rep.nativeName})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                                {rep.code}
                              </span>
                              <span>•</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                rep.employeeCategory === 'Office Employee' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800' :
                                rep.employeeCategory === 'Factory Employee' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800' :
                                rep.employeeCategory === 'Production' ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border border-teal-200 dark:border-teal-800' :
                                rep.employeeCategory === 'Warehouse Employee' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800' :
                                rep.employeeCategory === 'Management Employee' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800' :
                                'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              }`}>
                                {rep.employeeCategory || 'Field Force'}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {rep.phone}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Action Type */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {rep.fieldForceType || rep.designation}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-medium border border-blue-200 dark:border-blue-800">
                            {rep.actionType || 'Primary Order Booking'}
                          </span>
                        </div>
                      </td>

                      {/* Market Hierarchy Tag & Assigned GPS Office */}
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-semibold border border-slate-200 dark:border-slate-700">
                          <Tag className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          <span>{hierarchyDisplay}</span>
                        </div>
                        {(() => {
                          const linkedUser = findLinkedUserForEmployee(rep, users);
                          const geoCfg = resolveGeofenceConfigFromUser(
                            linkedUser,
                            officeLocations,
                            undefined,
                            rep.branchWorkplace
                          );
                          return (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                              <Navigation className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[170px] font-medium">
                                {geoCfg.assignedOfficeName}
                              </span>
                              <span className="font-mono text-emerald-700 dark:text-emerald-300 font-bold">
                                • {geoCfg.allowedRadiusMeters}m
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Mapped Distributor */}
                      <td className="py-3 px-4">
                        {rep.distributorName ? (
                          <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate max-w-[160px] font-medium">
                              {rep.distributorName}
                            </span>
                          </div>
                        ) : rep.distributors && rep.distributors.length > 0 ? (
                          <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate max-w-[160px] font-medium">
                              {rep.distributors[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Direct / Unassigned</span>
                        )}
                      </td>

                      {/* TADA Approve Person */}
                      <td className="py-3 px-4">
                        {rep.tadaApproverName ? (
                          <div className="flex items-center gap-1.5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-slate-800 dark:text-slate-200 text-[11px] font-medium max-w-[170px]">
                              <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="truncate font-semibold" title={rep.tadaApproverName}>
                                {rep.tadaApproverName}
                              </span>
                            </div>
                            {canEditEmployee && (
                              <button
                                type="button"
                                onClick={() => handleOpenQuickTagTadaApprover(rep)}
                                title="Reassign / Tag TADA Approver"
                                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : canEditEmployee ? (
                          <button
                            type="button"
                            onClick={() => handleOpenQuickTagTadaApprover(rep)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
                            title="Tag TADA Approver for this officer"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>+ Tag Approver</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Not Tagged</span>
                        )}
                      </td>

                      {/* Monthly Target */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white">
                            ৳ {(targetBDT / 1000).toLocaleString()}k
                          </span>
                          {canAssignTarget && (
                            <button
                              type="button"
                              onClick={() => handleOpenAssignTarget(rep)}
                              title="Assign Monthly Sales Target"
                              className="p-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                            >
                              <TrendingUp className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="w-24 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {progressPct}% target met
                        </div>
                      </td>

                      {/* PIN & Login */}
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          PIN: {rep.pin || '1234'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {canEditEmployee ? (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(rep)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                            title="Click to toggle Active/Inactive"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span>{isActive ? 'Active' : 'Inactive'}</span>
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span>{isActive ? 'Active' : 'Inactive'}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setQrModalRep(rep)}
                            title="Employee QR Code (View / Download / Print)"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setViewingRep(rep)}
                            title="View Full Profile"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canAssignTarget && (
                            <button
                              type="button"
                              onClick={() => handleOpenAssignTarget(rep)}
                              title="Assign Sales Target"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEditEmployee && (
                            <button
                              onClick={() => handleOpenEdit(rep)}
                              title="Edit Officer Profile"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDeleteEmployee && (
                            <button
                              onClick={() => setRepToDelete(rep)}
                              title="Delete Officer"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 text-xs">
            <div className="text-slate-600 dark:text-slate-400">
              <span>
                Showing <b>{pagination.startRecord}–{pagination.endRecord}</b> of{' '}
                <b>{pagination.totalEmployees}</b> employees
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={pagination.safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              {pagination.pageNumbers.map((pageItem, idx) =>
                pageItem === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400 select-none">
                    ...
                  </span>
                ) : (
                  <button
                    key={`page-${pageItem}`}
                    type="button"
                    onClick={() => setCurrentPage(Number(pageItem))}
                    className={`min-w-[30px] px-2.5 py-1.5 rounded-lg border font-bold transition-colors ${
                      pagination.safePage === pageItem
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
                disabled={pagination.safePage >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pagination.paginatedReps.map((rep) => {
            const isActive = rep.status === 'Active' || rep.isActive !== false;
            const targetBDT = rep.monthlyTargetBDT || 2500000;
            const achievedBDT = rep.monthlyAchievedBDT || 0;
            const progressPct = Math.min(100, Math.round((achievedBDT / (targetBDT || 1)) * 100));
            const hierarchyDisplay = rep.marketHierarchy || rep.territory || 'Not Assigned';

            return (
              <div
                key={rep.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-blue-400 transition-all space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs shrink-0">
                        {rep.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-xs">
                          {rep.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                            {rep.code}
                          </span>
                          {rep.nativeName && <span>• {rep.nativeName}</span>}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleStatus(rep)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  {/* Market Hierarchy & Role */}
                  <div className="mt-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <Tag className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Market Hierarchy</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-xs truncate block">
                          {hierarchyDisplay}
                        </span>
                      </div>
                    </div>

                    <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rep.fieldForceType || rep.designation}</span>
                      <span className="text-[10px] text-slate-400">({rep.actionType || 'Primary Booking'})</span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rep.phone}</span>
                    </div>

                    {rep.distributorName && (
                      <div className="text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span className="truncate">{rep.distributorName}</span>
                      </div>
                    )}

                    {/* TADA Approver Badge */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-slate-500 shrink-0">TADA Approver:</span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {rep.tadaApproverName || 'Not Tagged'}
                        </span>
                      </div>
                      {canEditEmployee && (
                        <button
                          type="button"
                          onClick={() => handleOpenQuickTagTadaApprover(rep)}
                          className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 ml-1 cursor-pointer"
                        >
                          {rep.tadaApproverName ? 'Change' : 'Tag'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Target Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-500">Target Progress</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                        ৳ {(achievedBDT / 1000).toLocaleString()}k / ৳ {(targetBDT / 1000).toLocaleString()}k
                      </span>
                      {canAssignTarget && (
                        <button
                          type="button"
                          onClick={() => handleOpenAssignTarget(rep)}
                          className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Set
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2">
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      PIN: {rep.pin || '1234'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQrModalRep(rep)}
                        title="Employee QR Code"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setViewingRep(rep)}
                        className="px-2.5 py-1 text-xs rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 font-semibold"
                      >
                        Profile
                      </button>
                      {canEditEmployee && (
                        <button
                          onClick={() => handleOpenEdit(rep)}
                          title="Edit Officer Profile"
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDeleteEmployee && (
                        <button
                          onClick={() => setRepToDelete(rep)}
                          title="Delete Officer"
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

          {/* Grid Pagination Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs text-xs">
            <div className="text-slate-600 dark:text-slate-400">
              <span>
                Showing <b>{pagination.startRecord}–{pagination.endRecord}</b> of{' '}
                <b>{pagination.totalEmployees}</b> employees
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={pagination.safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              {pagination.pageNumbers.map((pageItem, idx) =>
                pageItem === '...' ? (
                  <span key={`grid-ellipsis-${idx}`} className="px-1.5 text-slate-400 select-none">
                    ...
                  </span>
                ) : (
                  <button
                    key={`grid-page-${pageItem}`}
                    type="button"
                    onClick={() => setCurrentPage(Number(pageItem))}
                    className={`min-w-[30px] px-2.5 py-1.5 rounded-lg border font-bold transition-colors ${
                      pagination.safePage === pageItem
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
                disabled={pagination.safePage >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NEW FIELDFORCE REGISTRATION (ALL SECTIONS) */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-4 max-h-[94vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>New FieldForce Registration</span>
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Section Tab Switcher */}
            <div className="flex items-center gap-1 px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto text-xs">
              {[
                { id: 'all', label: 'All Sections', icon: Sliders },
                { id: 'basic', label: '1. Core, HR & Hierarchy', icon: MapPin },
                { id: 'target', label: '2. Remuneration & Targets', icon: DollarSign },
                { id: 'overtime', label: '3. Overtime Policy & Configuration', icon: Clock },
                { id: 'permissions', label: '4. Permissions & Tags', icon: ShieldCheck },
                { id: 'approver', label: '5. TADA Approver', icon: UserCheck },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = addModalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAddModalTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSaveAdd} className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {formValidationError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{formValidationError}</span>
                </div>
              )}
              {/* SECTION 1: CORE OFFICER IDENTIFICATION, HR, PERSONAL & BANKING INFORMATION */}
              {(addModalTab === 'all' || addModalTab === 'basic') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span>1. Core Officer Profile, Identification, HR &amp; Banking Information</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Code */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Officer Code<span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setFormCode(generateNextEmployeeCode())}
                          title="Auto-generate next EMP code"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Auto</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value)}
                        placeholder="e.g. EMP000001"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* PIN */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        PIN (Mobile Login)<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formPin}
                        onChange={(e) => setFormPin(e.target.value)}
                        placeholder="4-digit PIN"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Full Name (English)<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Enter full name"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                    </div>

                    {/* Native Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Native Name (বাংলা)<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formNativeName}
                        onChange={(e) => setFormNativeName(e.target.value)}
                        placeholder="বাংলায় নাম লিখুন"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Mobile */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mobile Phone Number
                      </label>
                      <input
                        type="text"
                        value={formMobile}
                        onChange={(e) => setFormMobile(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="officer@ensec.com.bd"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* FieldForce Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        FieldForce Type<span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formFieldType}
                        onChange={(e) => setFormFieldType(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">-- Select FieldForce Type --</option>
                        {FIELD_FORCE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Designation */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Official Designation
                      </label>
                      <input
                        type="text"
                        value={formDesignation}
                        onChange={(e) => setFormDesignation(e.target.value)}
                        placeholder="e.g. Senior Territory Sales Officer"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                    </div>

                    {/* Linked ERP User Account */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Linked ERP User Account (Auto-Login Identity)
                      </label>
                      <select
                        value={formLinkedUserId}
                        onChange={(e) => setFormLinkedUserId(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">Auto-Match by Code / Email / Phone</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.userId || u.email}) — {u.role}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Action Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Action Type<span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formActionType}
                        onChange={(e) => {
                          setFormActionType(e.target.value);
                          if (formValidationError) setFormValidationError('');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Action Type --</option>
                        {ACTION_TYPES.map((act) => (
                          <option key={act} value={act}>
                            {act}
                          </option>
                        ))}
                        {formActionType && !ACTION_TYPES.includes(formActionType) && (
                          <option value={formActionType}>{formActionType}</option>
                        )}
                      </select>
                    </div>

                    {/* Joining Date */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Joining Date<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formJoiningDate}
                        onChange={(e) => {
                          setFormJoiningDate(e.target.value);
                          if (formValidationError) setFormValidationError('');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Discontinue Date */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Discontinue / Exit Date
                      </label>
                      <input
                        type="date"
                        value={formDiscontinueDate}
                        onChange={(e) => setFormDiscontinueDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Invoice Within Days */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Invoice Within (Days)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={invoiceWithinDays}
                        onChange={(e) => setInvoiceWithinDays(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 3"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      />
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Gender<span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formGender}
                        onChange={(e) => {
                          setFormGender(e.target.value);
                          if (formValidationError) setFormValidationError('');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>

                  {/* Merged HR, Personal & Banking Information */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Building className="w-4 h-4" />
                      <span>HR, Personal &amp; Banking Information</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Employee Category */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Employee Category<span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formEmployeeCategory}
                          onChange={(e) => {
                            setFormEmployeeCategory(e.target.value);
                            if (formValidationError) setFormValidationError('');
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Select Employee Category --</option>
                          <option value="Field Employee">Field Employee</option>
                          <option value="Office Employee">Office Employee</option>
                          <option value="Factory Employee">Factory Employee</option>
                          <option value="Production">Production</option>
                          <option value="Warehouse Employee">Warehouse Employee</option>
                          <option value="Management Employee">Management Employee</option>
                          <option value="Other Employee">Other Employee</option>
                        </select>
                      </div>

                      {/* Employment Type */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Employment Type<span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formEmploymentType}
                          onChange={(e) => {
                            setFormEmploymentType(e.target.value);
                            if (formValidationError) setFormValidationError('');
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Select Employment Type --</option>
                          {EMPLOYMENT_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                          {formEmploymentType && !EMPLOYMENT_TYPE_OPTIONS.includes(formEmploymentType) && (
                            <option value={formEmploymentType}>{formEmploymentType}</option>
                          )}
                        </select>
                      </div>

                      {/* National ID */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          National ID / NID Number
                        </label>
                        <input
                          type="text"
                          value={formNationalId}
                          onChange={(e) => setFormNationalId(e.target.value)}
                          placeholder="NID 10/17 digits"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      {/* Present Address */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Present Address<span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formPresentAddress}
                          onChange={(e) => {
                            setFormPresentAddress(e.target.value);
                            if (formValidationError) setFormValidationError('');
                          }}
                          placeholder="House, Road, Area, City"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Permanent Address */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Permanent Address
                        </label>
                        <input
                          type="text"
                          value={formPermanentAddress}
                          onChange={(e) => setFormPermanentAddress(e.target.value)}
                          placeholder="Village, Post, Thana, District"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Emergency Contact Name */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Emergency Contact Name
                        </label>
                        <input
                          type="text"
                          value={formEmergencyContactName}
                          onChange={(e) => setFormEmergencyContactName(e.target.value)}
                          placeholder="Contact person name"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Emergency Contact Phone */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Emergency Contact Phone
                        </label>
                        <input
                          type="text"
                          value={formEmergencyContactPhone}
                          onChange={(e) => setFormEmergencyContactPhone(e.target.value)}
                          placeholder="+880 1700-000000"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Emergency Contact Relation */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Relationship
                        </label>
                        <input
                          type="text"
                          value={formEmergencyContactRelation}
                          onChange={(e) => setFormEmergencyContactRelation(e.target.value)}
                          placeholder="Spouse / Parent / Sibling"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Bank Name */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={formBankName}
                          onChange={(e) => setFormBankName(e.target.value)}
                          placeholder="e.g. Eastern Bank PLC"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        />
                      </div>

                      {/* Bank Account Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Account Number
                        </label>
                        <input
                          type="text"
                          value={formBankAccountNumber}
                          onChange={(e) => setFormBankAccountNumber(e.target.value)}
                          placeholder="Account digits"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      {/* Bank Branch */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Branch
                        </label>
                        <input
                          type="text"
                          value={formBankBranch}
                          onChange={(e) => setFormBankBranch(e.target.value)}
                          placeholder="Branch location"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Routing Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Routing Number
                        </label>
                        <input
                          type="text"
                          value={formRoutingNumber}
                          onChange={(e) => setFormRoutingNumber(e.target.value)}
                          placeholder="9-digit routing number"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      {/* Mobile Banking Provider */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Mobile Financial Service (MFS)
                        </label>
                        <select
                          value={formMobileBankingProvider}
                          onChange={(e) => setFormMobileBankingProvider(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        >
                          <option value="bKash">bKash</option>
                          <option value="Nagad">Nagad</option>
                          <option value="Rocket">Rocket</option>
                          <option value="Upay">Upay</option>
                        </select>
                      </div>

                      {/* Mobile Banking Wallet Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          MFS Wallet Number
                        </label>
                        <input
                          type="text"
                          value={formMobileBankingNumber}
                          onChange={(e) => setFormMobileBankingNumber(e.target.value)}
                          placeholder="017XXXXXXXX"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: MARKET HIERARCHY, BEAT & TERRITORY TAGGING */}
              {(addModalTab === 'all' || addModalTab === 'basic') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>2. Market Beat, Territory & Hierarchy Tagging</span>
                  </h3>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Market Hierarchy Selector */}
                    <div className="p-3.5 rounded-xl border-2 border-red-500 bg-red-50/20 dark:bg-red-950/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-blue-600 dark:text-blue-400">
                          Market Hierarchy
                        </label>
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">
                          Tagged Market Beat
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search market hierarchy..."
                          value={marketHierarchySearch}
                          onChange={(e) => {
                            setMarketHierarchySearch(e.target.value);
                            setShowMarketDropdown(true);
                          }}
                          onFocus={() => setShowMarketDropdown(true)}
                          className="w-full pl-3 pr-14 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="absolute right-2 top-2 flex items-center gap-1 text-slate-400">
                          {marketHierarchySearch && (
                            <button
                              type="button"
                              onClick={() => setMarketHierarchySearch('')}
                              className="p-0.5 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowMarketDropdown(!showMarketDropdown)}
                            className="p-0.5 hover:text-slate-600"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {formMarketHierarchy && (
                        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-mono text-xs">
                          <Tag className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                          <span className="font-semibold">{formMarketHierarchy}</span>
                        </div>
                      )}

                      {showMarketDropdown && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-md max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                          {filteredMarketHierarchyOptions.map((opt) => {
                            const isSelected = formMarketHierarchy === opt.fullName;
                            return (
                              <div
                                key={opt.code + opt.fullName}
                                onClick={() => {
                                  setFormMarketHierarchy(opt.fullName);
                                  setFormRegion(opt.region || formRegion);
                                  setFormArea(opt.area || formArea);
                                  setFormTerritory(opt.name || formTerritory);
                                  setShowMarketDropdown(false);
                                }}
                                className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                  isSelected
                                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <span className="font-mono">{opt.fullName}</span>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Territory & Assigned Hierarchy breakdown */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Region
                          </label>
                          <input
                            type="text"
                            value={formRegion}
                            onChange={(e) => setFormRegion(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Area
                          </label>
                          <input
                            type="text"
                            value={formArea}
                            onChange={(e) => setFormArea(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Territory
                          </label>
                          <input
                            type="text"
                            value={formTerritory}
                            onChange={(e) => setFormTerritory(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Distributor */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Assigned Distributor
                        </label>
                        <select
                          value={selectedDistributorId}
                          onChange={(e) => {
                            setSelectedDistributorId(e.target.value);
                            const dist = distributors.find((d) => d.id === e.target.value);
                            if (dist) setSelectedDistributorName(dist.name);
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        >
                          <option value="">-- Select Distributor --</option>
                          {distributors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.dbPoint || d.district || 'Hub'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Parent Code */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Parent Supervisor / Line Manager Code
                        </label>
                        <select
                          value={parentCode}
                          onChange={(e) => setParentCode(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        >
                          <option value="">-- Select Parent / Supervisor --</option>
                          <option value="MGT-01">MGT-01 - National Sales Director</option>
                          {cleanFieldForceReps.map((r) => (
                            <option key={r.id} value={r.code}>
                              {r.code} - {r.name} ({r.designation || r.fieldForceType})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Departments checklist */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Assigned Business Departments<span className="text-red-500">*</span>
                    </label>
                    <div
                      className={`border rounded-lg p-2.5 bg-slate-50/60 dark:bg-slate-800/40 max-h-36 overflow-y-auto space-y-2 ${
                        departmentError
                          ? 'border-red-500 ring-1 ring-red-500'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <label className="flex items-center gap-2 text-xs cursor-pointer font-semibold border-b pb-1 text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={allDepartmentsChecked}
                          onChange={toggleAllDepartments}
                          className="rounded text-blue-600 w-3.5 h-3.5"
                        />
                        <span>All Standard Departments</span>
                      </label>
                      {renderedDepartmentOptions.map((dept) => (
                        <label key={dept} className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={selectedDepartments.includes(dept)}
                            onChange={() => toggleDepartment(dept)}
                            className="rounded text-blue-600 w-3.5 h-3.5"
                          />
                          <span>{dept}</span>
                        </label>
                      ))}
                    </div>
                    {departmentError && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{departmentError}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 3: TARGET, REMUNERATION & COMPENSATION (BDT) */}
              {(addModalTab === 'all' || addModalTab === 'target') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    <span>3. Sales Targets & Monthly Remuneration (BDT)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Monthly Target */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Monthly Sales Target (BDT)
                      </label>
                      <input
                        type="number"
                        value={canAssignTarget ? monthlyTargetBDT : 0}
                        disabled={!canAssignTarget}
                        onChange={(e) => setMonthlyTargetBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {!canAssignTarget && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                          Locked: requires &quot;Assign Sales Target&quot; permission.
                        </p>
                      )}
                    </div>

                    {/* Basic Salary */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Basic Salary (BDT)
                      </label>
                      <input
                        type="number"
                        value={basicSalaryBDT}
                        onChange={(e) => setBasicSalaryBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      />
                    </div>

                    {/* Conveyance Allowance */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Conveyance Allowance (BDT)
                      </label>
                      <input
                        type="number"
                        value={formConveyanceBDT}
                        onChange={(e) => setFormConveyanceBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Daily TA/DA Allowance */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Daily TA/DA Allowance (BDT)
                      </label>
                      <input
                        type="number"
                        value={formTaDaBDT}
                        onChange={(e) => setFormTaDaBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Mobile Allowance */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mobile Phone Allowance (BDT)
                      </label>
                      <input
                        type="number"
                        value={formMobileAllowanceBDT}
                        onChange={(e) => setFormMobileAllowanceBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Account Status */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Account Active Status
                      </label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                      >
                        <option value="Active">Active Duty</option>
                        <option value="Inactive">Inactive / Suspended</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: OVERTIME POLICY & CONFIGURATION */}
              {(addModalTab === 'all' || addModalTab === 'overtime') && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 dark:border-blue-900/40 pb-3">
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>3. Overtime Policy &amp; Configuration</span>
                      </h3>
                      
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                      formIsOvertimeEligible
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300'
                    }`}>
                      {formIsOvertimeEligible ? 'Eligible for Overtime' : 'Overtime Ineligible'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 1. Overtime Eligibility (Yes/No) */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        1. Overtime Eligibility *
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormIsOvertimeEligible(true)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                            formIsOvertimeEligible
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Yes (Eligible)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormIsOvertimeEligible(false)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                            !formIsOvertimeEligible
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          No (Ineligible)
                        </button>
                      </div>
                    </div>

                    {/* 2. Overtime Calculation Basis */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        2. Calculation Basis *
                      </label>
                      <select
                        value={formOvertimeCalculationBasis}
                        onChange={(e) => setFormOvertimeCalculationBasis(e.target.value as any)}
                        disabled={!formIsOvertimeEligible}
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium disabled:opacity-50"
                      >
                        <option value="Basic Salary">Basic Salary (Basic ÷ Working Hours)</option>
                        <option value="Fixed Hourly Rate">Fixed Hourly Rate (Flat BDT per hour)</option>
                      </select>
                    </div>

                    {/* 3. Monthly Standard Working Hours / Divisor */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        3. Monthly Standard Hours / Divisor *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="400"
                          value={formOvertimeStandardHours}
                          onChange={(e) => setFormOvertimeStandardHours(Math.max(1, Number(e.target.value) || 208))}
                          disabled={!formIsOvertimeEligible || formOvertimeCalculationBasis === 'Fixed Hourly Rate'}
                          className="w-full p-2 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-medium disabled:opacity-50"
                          placeholder="208"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-medium">Hours</span>
                      </div>
                      <span className="text-[10px] text-slate-400">e.g. 208 hrs (26 days × 8h)</span>
                    </div>

                    {/* 4. Overtime Multiplier */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        4. Overtime Multiplier *
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="5.0"
                          value={formOvertimeMultiplier}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setFormOvertimeMultiplier(raw === '' ? '' : Math.max(0, Number(raw)));
                          }}
                          disabled={!formIsOvertimeEligible}
                          className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold disabled:opacity-50"
                          placeholder="0"
                        />
                        <div className="flex gap-1">
                          {[1.5, 2.0].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setFormOvertimeMultiplier(m)}
                              disabled={!formIsOvertimeEligible}
                              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                                formOvertimeMultiplier === m
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {m}x
                            </button>
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400">Standard factory: 2.0x (BLA 2006) or 1.5x</span>
                    </div>

                    {/* 5. Fixed Overtime Hourly Rate (when applicable) */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        5. Fixed Hourly Rate (BDT) {formOvertimeCalculationBasis === 'Fixed Hourly Rate' ? '*' : '(Optional)'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={formOvertimeFixedRate}
                          onChange={(e) => setFormOvertimeFixedRate(Math.max(0, Number(e.target.value) || 0))}
                          disabled={!formIsOvertimeEligible || formOvertimeCalculationBasis !== 'Fixed Hourly Rate'}
                          className={`w-full p-2 pr-12 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold ${
                            formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                              ? 'border-indigo-400 ring-2 ring-indigo-400/20'
                              : 'border-slate-200 dark:border-slate-700 opacity-50'
                          }`}
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-medium">BDT/hr</span>
                      </div>
                      <span className="text-[10px] text-slate-400">Used when Calculation Basis is set to Fixed Hourly Rate</span>
                    </div>

                    {/* 6. Effective From Date */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        6. Policy Effective From Date *
                      </label>
                      <input
                        type="date"
                        value={formOvertimeEffectiveFrom}
                        onChange={(e) => setFormOvertimeEffectiveFrom(e.target.value)}
                        required
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                      <span className="text-[10px] text-slate-400">Overtime requisitions from this date use this policy</span>
                    </div>

                    {/* 7. Policy Status (Active/Inactive) */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        7. Policy Status *
                      </label>
                      <select
                        value={formOvertimePolicyStatus}
                        onChange={(e) => setFormOvertimePolicyStatus(e.target.value as any)}
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      >
                        <option value="Active">Active (Policy in effect)</option>
                        <option value="Inactive">Inactive (Overtime temporarily suspended)</option>
                      </select>
                      <span className="text-[10px] text-slate-400">Inactive policies block new overtime booking</span>
                    </div>

                    {/* Policy Notes / Agreement Terms */}
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Policy Remarks / Terms Reference
                      </label>
                      <input
                        type="text"
                        value={formOvertimePolicyNotes}
                        onChange={(e) => setFormOvertimePolicyNotes(e.target.value)}
                        placeholder="e.g. As per appointment letter annexure (Overtime rate multiplier)"
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                    </div>
                  </div>

                  {/* Live Calculation Preview Box */}
                  {formIsOvertimeEligible && (
                    <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-1.5 text-blue-300">
                          <Calculator className="w-3.5 h-3.5 text-blue-400" />
                          <span>Live Policy Rate Preview for {formName || 'this employee'}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                            ? `Fixed Rate: ৳${formOvertimeFixedRate}/hr × ${formOvertimeMultiplier === '' ? 0 : formOvertimeMultiplier}x`
                            : `Basic ৳${(Number(basicSalaryBDT) || 0).toLocaleString()} ÷ ${formOvertimeStandardHours}h × ${formOvertimeMultiplier === '' ? 0 : formOvertimeMultiplier}x`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-slate-800">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Base Hourly Rate:</span>
                          <span className="font-mono font-bold text-white text-xs">
                            ৳{formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                              ? Number(formOvertimeFixedRate || 0).toFixed(2)
                              : ((Number(basicSalaryBDT) || 0) / (Number(formOvertimeStandardHours) || 208)).toFixed(2)} / hr
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Multiplier:</span>
                          <span className="font-mono font-bold text-amber-400 text-xs">
                            {formOvertimeMultiplier === '' ? 0 : formOvertimeMultiplier}x
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Net OT Rate:</span>
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            ৳{(
                              (formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                                ? Number(formOvertimeFixedRate || 0)
                                : ((Number(basicSalaryBDT) || 0) / (Number(formOvertimeStandardHours) || 208))) *
                              (formOvertimeMultiplier === '' ? 0 : Number(formOvertimeMultiplier) || 0)
                            ).toFixed(2)} / hr
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Sample 2-Hour OT:</span>
                          <span className="font-mono font-black text-cyan-400 text-xs">
                            ৳{Math.round(
                              (formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                                ? Number(formOvertimeFixedRate || 0)
                                : ((Number(basicSalaryBDT) || 0) / (Number(formOvertimeStandardHours) || 208))) *
                              (formOvertimeMultiplier === '' ? 0 : Number(formOvertimeMultiplier) || 0) * 2
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 4: APP PERMISSIONS & CHANNEL TAGS */}
              {(addModalTab === 'all' || addModalTab === 'permissions') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>4. App Permissions & Channel Tags</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* App Permissions */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        App Permissions Profile
                      </label>
                      <select
                        value={appPermissions}
                        onChange={(e) => setAppPermissions(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">-- Select App Permissions --</option>
                        {APP_PERMISSIONS_LIST.map((perm) => (
                          <option key={perm} value={perm}>
                            {perm}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Field Force Tags */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Field Force Tags
                      </label>
                      <select
                        value={fieldForceTags}
                        onChange={(e) => setFieldForceTags(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Field Force Tag --</option>
                        {FIELD_FORCE_TAGS_LIST.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Customer Tags */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Customer Channels Tag
                      </label>
                      <select
                        value={customerTags}
                        onChange={(e) => setCustomerTags(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Customer Channel Tag --</option>
                        {CUSTOMER_TAGS_LIST.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: TADA APPROVE PERSON (SUPER ADMIN WORKFLOW) */}
              {(addModalTab === 'all' || addModalTab === 'approver') && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>5. TADA Approve Person (Super Admin Tagging)</span>
                    </h4>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      Approval Authority
                    </span>
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Select Designated TADA Approver<span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formTadaApproverId}
                      onChange={(e) => setFormTadaApproverId(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- No Approver Tagged (Unassigned) --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.role} ({u.designation || u.department || 'User'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">
                  New Record: <strong className="font-mono text-slate-700 dark:text-slate-300">{formCode || 'Auto Code'}</strong>
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Save &amp; Register FieldForce</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT FIELDFORCE PROFILE */}
      {/* ======================================================== */}
      {editingRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-4 max-h-[94vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Edit FieldForce Officer:</span>
                    <span className="text-blue-600 dark:text-blue-400">{editingRep.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-slate-600 dark:text-slate-300">
                      {editingRep.code}
                    </span>
                  </h2>
                  
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRep(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Section Tab Switcher */}
            <div className="flex items-center gap-1 px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto text-xs">
              {[
                { id: 'all', label: 'All Sections', icon: Sliders },
                { id: 'basic', label: '1. Core, HR & Hierarchy', icon: MapPin },
                { id: 'target', label: '2. Remuneration & Targets', icon: DollarSign },
                { id: 'overtime', label: '3. Overtime Policy & Configuration', icon: Clock },
                { id: 'permissions', label: '4. Permissions & Tags', icon: ShieldCheck },
                { id: 'approver', label: '5. TADA Approver', icon: UserCheck },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = editModalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditModalTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {formValidationError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{formValidationError}</span>
                </div>
              )}
              {/* SECTION 1: CORE OFFICER IDENTIFICATION, HR, PERSONAL & BANKING INFORMATION */}
              {(editModalTab === 'all' || editModalTab === 'basic') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span>1. Core Officer Profile, Identification, HR &amp; Banking Information</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Code */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Officer Code<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formCode}
                        onChange={(e) => setFormCode(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* PIN */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        PIN (Mobile Login)<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formPin}
                        onChange={(e) => setFormPin(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Full Name (English)<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                    </div>

                    {/* Native Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Native Name (বাংলা)<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formNativeName}
                        onChange={(e) => setFormNativeName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Mobile */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mobile Phone Number
                      </label>
                      <input
                        type="text"
                        value={formMobile}
                        onChange={(e) => setFormMobile(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="officer@ensec.com.bd"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* FieldForce Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        FieldForce Type<span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formFieldType}
                        onChange={(e) => setFormFieldType(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">-- Select FieldForce Type --</option>
                        {FIELD_FORCE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Designation */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Official Designation
                      </label>
                      <input
                        type="text"
                        value={formDesignation}
                        onChange={(e) => setFormDesignation(e.target.value)}
                        placeholder="e.g. Senior Territory Sales Officer"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                    </div>

                    {/* Linked ERP User Account */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Linked ERP User Account (Auto-Login Identity)
                      </label>
                      <select
                        value={formLinkedUserId}
                        onChange={(e) => setFormLinkedUserId(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">Auto-Match by Code / Email / Phone</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.userId || u.email}) — {u.role}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Action Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Action Type<span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formActionType}
                        onChange={(e) => {
                          setFormActionType(e.target.value);
                          if (formValidationError) setFormValidationError('');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Action Type --</option>
                        {ACTION_TYPES.map((act) => (
                          <option key={act} value={act}>
                            {act}
                          </option>
                        ))}
                        {formActionType && !ACTION_TYPES.includes(formActionType) && (
                          <option value={formActionType}>{formActionType}</option>
                        )}
                      </select>
                    </div>

                    {/* Joining Date */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Joining Date<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formJoiningDate}
                        onChange={(e) => {
                          setFormJoiningDate(e.target.value);
                          if (formValidationError) setFormValidationError('');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Discontinue Date */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Discontinue / Exit Date
                      </label>
                      <input
                        type="date"
                        value={formDiscontinueDate}
                        onChange={(e) => setFormDiscontinueDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Invoice Within Days */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Invoice Within (Days)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={invoiceWithinDays}
                        onChange={(e) => setInvoiceWithinDays(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 3"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      />
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Gender<span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formGender}
                        onChange={(e) => {
                          setFormGender(e.target.value);
                          if (formValidationError) setFormValidationError('');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>

                  {/* Merged HR, Personal & Banking Information */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Building className="w-4 h-4" />
                      <span>HR, Personal &amp; Banking Information</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Employee Category */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Employee Category<span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formEmployeeCategory}
                          onChange={(e) => {
                            setFormEmployeeCategory(e.target.value);
                            if (formValidationError) setFormValidationError('');
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Select Employee Category --</option>
                          <option value="Field Employee">Field Employee</option>
                          <option value="Office Employee">Office Employee</option>
                          <option value="Factory Employee">Factory Employee</option>
                          <option value="Production">Production</option>
                          <option value="Warehouse Employee">Warehouse Employee</option>
                          <option value="Management Employee">Management Employee</option>
                          <option value="Other Employee">Other Employee</option>
                        </select>
                      </div>

                      {/* Employment Type */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Employment Type<span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={formEmploymentType}
                          onChange={(e) => {
                            setFormEmploymentType(e.target.value);
                            if (formValidationError) setFormValidationError('');
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        >
                          <option value="">-- Select Employment Type --</option>
                          {EMPLOYMENT_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                          {formEmploymentType && !EMPLOYMENT_TYPE_OPTIONS.includes(formEmploymentType) && (
                            <option value={formEmploymentType}>{formEmploymentType}</option>
                          )}
                        </select>
                      </div>

                      {/* National ID */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          National ID / NID Number
                        </label>
                        <input
                          type="text"
                          value={formNationalId}
                          onChange={(e) => setFormNationalId(e.target.value)}
                          placeholder="NID 10/17 digits"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      {/* Present Address */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Present Address<span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formPresentAddress}
                          onChange={(e) => {
                            setFormPresentAddress(e.target.value);
                            if (formValidationError) setFormValidationError('');
                          }}
                          placeholder="House, Road, Area, City"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Permanent Address */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Permanent Address
                        </label>
                        <input
                          type="text"
                          value={formPermanentAddress}
                          onChange={(e) => setFormPermanentAddress(e.target.value)}
                          placeholder="Village, Post, Thana, District"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Emergency Contact Name */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Emergency Contact Name
                        </label>
                        <input
                          type="text"
                          value={formEmergencyContactName}
                          onChange={(e) => setFormEmergencyContactName(e.target.value)}
                          placeholder="Contact person name"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Emergency Contact Phone */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Emergency Contact Phone
                        </label>
                        <input
                          type="text"
                          value={formEmergencyContactPhone}
                          onChange={(e) => setFormEmergencyContactPhone(e.target.value)}
                          placeholder="+880 1700-000000"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Emergency Contact Relation */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Relationship
                        </label>
                        <input
                          type="text"
                          value={formEmergencyContactRelation}
                          onChange={(e) => setFormEmergencyContactRelation(e.target.value)}
                          placeholder="Spouse / Parent / Sibling"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Bank Name */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={formBankName}
                          onChange={(e) => setFormBankName(e.target.value)}
                          placeholder="e.g. Eastern Bank PLC"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        />
                      </div>

                      {/* Bank Account Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Account Number
                        </label>
                        <input
                          type="text"
                          value={formBankAccountNumber}
                          onChange={(e) => setFormBankAccountNumber(e.target.value)}
                          placeholder="Account digits"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      {/* Bank Branch */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Branch
                        </label>
                        <input
                          type="text"
                          value={formBankBranch}
                          onChange={(e) => setFormBankBranch(e.target.value)}
                          placeholder="Branch location"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Routing Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Bank Routing Number
                        </label>
                        <input
                          type="text"
                          value={formRoutingNumber}
                          onChange={(e) => setFormRoutingNumber(e.target.value)}
                          placeholder="9-digit routing number"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>

                      {/* Mobile Banking Provider */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Mobile Financial Service (MFS)
                        </label>
                        <select
                          value={formMobileBankingProvider}
                          onChange={(e) => setFormMobileBankingProvider(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        >
                          <option value="bKash">bKash</option>
                          <option value="Nagad">Nagad</option>
                          <option value="Rocket">Rocket</option>
                          <option value="Upay">Upay</option>
                        </select>
                      </div>

                      {/* Mobile Banking Wallet Number */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          MFS Wallet Number
                        </label>
                        <input
                          type="text"
                          value={formMobileBankingNumber}
                          onChange={(e) => setFormMobileBankingNumber(e.target.value)}
                          placeholder="017XXXXXXXX"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: MARKET HIERARCHY, BEAT & TERRITORY TAGGING */}
              {(editModalTab === 'all' || editModalTab === 'basic') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>2. Market Beat, Territory & Hierarchy Tagging</span>
                  </h3>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Market Hierarchy Selector */}
                    <div className="p-3.5 rounded-xl border-2 border-red-500 bg-red-50/20 dark:bg-red-950/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-blue-600 dark:text-blue-400">
                          Market Hierarchy
                        </label>
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">
                          Tagged Market Beat
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search market hierarchy..."
                          value={marketHierarchySearch}
                          onChange={(e) => {
                            setMarketHierarchySearch(e.target.value);
                            setShowMarketDropdown(true);
                          }}
                          onFocus={() => setShowMarketDropdown(true)}
                          className="w-full pl-3 pr-14 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="absolute right-2 top-2 flex items-center gap-1 text-slate-400">
                          {marketHierarchySearch && (
                            <button
                              type="button"
                              onClick={() => setMarketHierarchySearch('')}
                              className="p-0.5 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowMarketDropdown(!showMarketDropdown)}
                            className="p-0.5 hover:text-slate-600"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {formMarketHierarchy && (
                        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-mono text-xs">
                          <Tag className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                          <span className="font-semibold">{formMarketHierarchy}</span>
                        </div>
                      )}

                      {showMarketDropdown && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-md max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                          {filteredMarketHierarchyOptions.map((opt) => {
                            const isSelected = formMarketHierarchy === opt.fullName;
                            return (
                              <div
                                key={opt.code + opt.fullName}
                                onClick={() => {
                                  setFormMarketHierarchy(opt.fullName);
                                  setFormRegion(opt.region || formRegion);
                                  setFormArea(opt.area || formArea);
                                  setFormTerritory(opt.name || formTerritory);
                                  setShowMarketDropdown(false);
                                }}
                                className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                  isSelected
                                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <span className="font-mono">{opt.fullName}</span>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Territory & Assigned Hierarchy breakdown */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Region
                          </label>
                          <input
                            type="text"
                            value={formRegion}
                            onChange={(e) => setFormRegion(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Area
                          </label>
                          <input
                            type="text"
                            value={formArea}
                            onChange={(e) => setFormArea(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Territory
                          </label>
                          <input
                            type="text"
                            value={formTerritory}
                            onChange={(e) => setFormTerritory(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Distributor */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Assigned Distributor
                        </label>
                        <select
                          value={selectedDistributorId}
                          onChange={(e) => {
                            setSelectedDistributorId(e.target.value);
                            const dist = distributors.find((d) => d.id === e.target.value);
                            if (dist) setSelectedDistributorName(dist.name);
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        >
                          <option value="">-- Select Distributor --</option>
                          {distributors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.dbPoint || d.district || 'Hub'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Parent Code */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Parent Supervisor / Line Manager Code
                        </label>
                        <select
                          value={parentCode}
                          onChange={(e) => setParentCode(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        >
                          <option value="">-- Select Parent / Supervisor --</option>
                          <option value="MGT-01">MGT-01 - National Sales Director</option>
                          {cleanFieldForceReps
                            .filter((r) => r.id !== editingRep.id)
                            .map((r) => (
                              <option key={r.id} value={r.code}>
                                {r.code} - {r.name} ({r.designation || r.fieldForceType})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Departments checklist */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Assigned Business Departments<span className="text-red-500">*</span>
                    </label>
                    <div
                      className={`border rounded-lg p-2.5 bg-slate-50/60 dark:bg-slate-800/40 max-h-36 overflow-y-auto space-y-2 ${
                        departmentError
                          ? 'border-red-500 ring-1 ring-red-500'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <label className="flex items-center gap-2 text-xs cursor-pointer font-semibold border-b pb-1 text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={allDepartmentsChecked}
                          onChange={toggleAllDepartments}
                          className="rounded text-blue-600 w-3.5 h-3.5"
                        />
                        <span>All Standard Departments</span>
                      </label>
                      {renderedDepartmentOptions.map((dept) => (
                        <label key={dept} className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={selectedDepartments.includes(dept)}
                            onChange={() => toggleDepartment(dept)}
                            className="rounded text-blue-600 w-3.5 h-3.5"
                          />
                          <span>{dept}</span>
                        </label>
                      ))}
                    </div>
                    {departmentError && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{departmentError}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 3: TARGET, REMUNERATION & COMPENSATION (BDT) */}
              {(editModalTab === 'all' || editModalTab === 'target') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    <span>3. Sales Targets & Monthly Remuneration (BDT)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Monthly Target */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Monthly Sales Target (BDT)
                      </label>
                      <input
                        type="number"
                        value={monthlyTargetBDT}
                        disabled={!canAssignTarget}
                        onChange={(e) => setMonthlyTargetBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {!canAssignTarget && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                          Locked: requires &quot;Assign Sales Target&quot; permission.
                        </p>
                      )}
                    </div>

                    {/* Basic Salary */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Basic Salary (BDT)
                      </label>
                      <input
                        type="number"
                        value={basicSalaryBDT}
                        onChange={(e) => setBasicSalaryBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      />
                    </div>

                    {/* Conveyance Allowance */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Conveyance Allowance (BDT)
                      </label>
                      <input
                        type="number"
                        value={formConveyanceBDT}
                        onChange={(e) => setFormConveyanceBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Daily TA/DA Allowance */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Daily TA/DA Allowance (BDT)
                      </label>
                      <input
                        type="number"
                        value={formTaDaBDT}
                        onChange={(e) => setFormTaDaBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Mobile Allowance */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mobile Phone Allowance (BDT)
                      </label>
                      <input
                        type="number"
                        value={formMobileAllowanceBDT}
                        onChange={(e) => setFormMobileAllowanceBDT(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Account Status */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Account Active Status
                      </label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                      >
                        <option value="Active">Active Duty</option>
                        <option value="Inactive">Inactive / Suspended</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: OVERTIME POLICY & CONFIGURATION */}
              {(editModalTab === 'all' || editModalTab === 'overtime') && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 dark:border-blue-900/40 pb-3">
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>3. Overtime Policy &amp; Configuration</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Individual overtime parameters for {editingRep.name} ({editingRep.code}). If modified, previous terms are archived into version history.
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                      formIsOvertimeEligible
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300'
                    }`}>
                      {formIsOvertimeEligible ? 'Eligible for Overtime' : 'Overtime Ineligible'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 1. Overtime Eligibility (Yes/No) */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        1. Overtime Eligibility *
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormIsOvertimeEligible(true)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                            formIsOvertimeEligible
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Yes (Eligible)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormIsOvertimeEligible(false)}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                            !formIsOvertimeEligible
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          No (Ineligible)
                        </button>
                      </div>
                    </div>

                    {/* 2. Overtime Calculation Basis */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        2. Calculation Basis *
                      </label>
                      <select
                        value={formOvertimeCalculationBasis}
                        onChange={(e) => setFormOvertimeCalculationBasis(e.target.value as any)}
                        disabled={!formIsOvertimeEligible}
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium disabled:opacity-50"
                      >
                        <option value="Basic Salary">Basic Salary (Basic ÷ Working Hours)</option>
                        <option value="Fixed Hourly Rate">Fixed Hourly Rate (Flat BDT per hour)</option>
                      </select>
                    </div>

                    {/* 3. Monthly Standard Working Hours / Divisor */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        3. Monthly Standard Hours / Divisor *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="400"
                          value={formOvertimeStandardHours}
                          onChange={(e) => setFormOvertimeStandardHours(Math.max(1, Number(e.target.value) || 208))}
                          disabled={!formIsOvertimeEligible || formOvertimeCalculationBasis === 'Fixed Hourly Rate'}
                          className="w-full p-2 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-medium disabled:opacity-50"
                          placeholder="208"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-medium">Hours</span>
                      </div>
                      <span className="text-[10px] text-slate-400">e.g. 208 hrs (26 days × 8h)</span>
                    </div>

                    {/* 4. Overtime Multiplier */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        4. Overtime Multiplier *
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="5.0"
                          value={formOvertimeMultiplier}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setFormOvertimeMultiplier(raw === '' ? '' : Math.max(0, Number(raw)));
                          }}
                          disabled={!formIsOvertimeEligible}
                          className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold disabled:opacity-50"
                          placeholder="0"
                        />
                        <div className="flex gap-1">
                          {[1.5, 2.0].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setFormOvertimeMultiplier(m)}
                              disabled={!formIsOvertimeEligible}
                              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                                formOvertimeMultiplier === m
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {m}x
                            </button>
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400">Standard factory: 2.0x (BLA 2006) or 1.5x</span>
                    </div>

                    {/* 5. Fixed Overtime Hourly Rate (when applicable) */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        5. Fixed Hourly Rate (BDT) {formOvertimeCalculationBasis === 'Fixed Hourly Rate' ? '*' : '(Optional)'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={formOvertimeFixedRate}
                          onChange={(e) => setFormOvertimeFixedRate(Math.max(0, Number(e.target.value) || 0))}
                          disabled={!formIsOvertimeEligible || formOvertimeCalculationBasis !== 'Fixed Hourly Rate'}
                          className={`w-full p-2 pr-12 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold ${
                            formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                              ? 'border-indigo-400 ring-2 ring-indigo-400/20'
                              : 'border-slate-200 dark:border-slate-700 opacity-50'
                          }`}
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-medium">BDT/hr</span>
                      </div>
                      <span className="text-[10px] text-slate-400">Used when Calculation Basis is set to Fixed Hourly Rate</span>
                    </div>

                    {/* 6. Effective From Date */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        6. Policy Effective From Date *
                      </label>
                      <input
                        type="date"
                        value={formOvertimeEffectiveFrom}
                        onChange={(e) => setFormOvertimeEffectiveFrom(e.target.value)}
                        required
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                      <span className="text-[10px] text-slate-400">Overtime requisitions from this date use this policy</span>
                    </div>

                    {/* 7. Policy Status (Active/Inactive) */}
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        7. Policy Status *
                      </label>
                      <select
                        value={formOvertimePolicyStatus}
                        onChange={(e) => setFormOvertimePolicyStatus(e.target.value as any)}
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                      >
                        <option value="Active">Active (Policy in effect)</option>
                        <option value="Inactive">Inactive (Overtime temporarily suspended)</option>
                      </select>
                      <span className="text-[10px] text-slate-400">Inactive policies block new overtime booking</span>
                    </div>

                    {/* Policy Notes / Amendment Reasons */}
                    <div className="sm:col-span-2">
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                        Policy Remarks / Amendment Reference
                      </label>
                      <input
                        type="text"
                        value={formOvertimePolicyNotes}
                        onChange={(e) => setFormOvertimePolicyNotes(e.target.value)}
                        placeholder="e.g. Rate updated per annual review agreement or promotion"
                        className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      />
                    </div>
                  </div>

                  {/* Live Calculation Preview Box */}
                  {formIsOvertimeEligible && (
                    <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-1.5 text-blue-300">
                          <Calculator className="w-3.5 h-3.5 text-blue-400" />
                          <span>Live Policy Rate Preview for {formName || editingRep.name}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                            ? `Fixed Rate: ৳${formOvertimeFixedRate}/hr × ${formOvertimeMultiplier === '' ? 0 : formOvertimeMultiplier}x`
                            : `Basic ৳${(Number(basicSalaryBDT) || 0).toLocaleString()} ÷ ${formOvertimeStandardHours}h × ${formOvertimeMultiplier === '' ? 0 : formOvertimeMultiplier}x`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-slate-800">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Base Hourly Rate:</span>
                          <span className="font-mono font-bold text-white text-xs">
                            ৳{formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                              ? Number(formOvertimeFixedRate || 0).toFixed(2)
                              : ((Number(basicSalaryBDT) || 0) / (Number(formOvertimeStandardHours) || 208)).toFixed(2)} / hr
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Multiplier:</span>
                          <span className="font-mono font-bold text-amber-400 text-xs">
                            {formOvertimeMultiplier === '' ? 0 : formOvertimeMultiplier}x
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Net OT Rate:</span>
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            ৳{(
                              (formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                                ? Number(formOvertimeFixedRate || 0)
                                : ((Number(basicSalaryBDT) || 0) / (Number(formOvertimeStandardHours) || 208))) *
                              (formOvertimeMultiplier === '' ? 0 : Number(formOvertimeMultiplier) || 0)
                            ).toFixed(2)} / hr
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Sample 2-Hour OT:</span>
                          <span className="font-mono font-black text-cyan-400 text-xs">
                            ৳{Math.round(
                              (formOvertimeCalculationBasis === 'Fixed Hourly Rate'
                                ? Number(formOvertimeFixedRate || 0)
                                : ((Number(basicSalaryBDT) || 0) / (Number(formOvertimeStandardHours) || 208))) *
                              (formOvertimeMultiplier === '' ? 0 : Number(formOvertimeMultiplier) || 0) * 2
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Historical Policy Versions Changelog */}
                  {editingRep.overtimePolicyHistory && editingRep.overtimePolicyHistory.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-blue-600" />
                          <span>Policy Version &amp; Amendment History ({editingRep.overtimePolicyHistory.length} previous terms archived)</span>
                        </span>
                        <span className="text-[10px] text-slate-400">Historical OT records retain their original rate calculations</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] text-left">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-medium">
                              <th className="py-1.5 px-2">Effective Period</th>
                              <th className="py-1.5 px-2">Eligibility</th>
                              <th className="py-1.5 px-2">Calculation Basis</th>
                              <th className="py-1.5 px-2 text-right">Divisor</th>
                              <th className="py-1.5 px-2 text-right">Multiplier</th>
                              <th className="py-1.5 px-2 text-right">Fixed Rate</th>
                              <th className="py-1.5 px-2">Notes &amp; Archived By</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {editingRep.overtimePolicyHistory.map((hist, idx) => (
                              <tr key={hist.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="py-1.5 px-2 font-mono font-medium text-slate-700 dark:text-slate-300">
                                  {hist.effectiveFrom} → {hist.effectiveTo || 'Superseded'}
                                </td>
                                <td className="py-1.5 px-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    hist.isEligible ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {hist.isEligible ? 'Eligible' : 'Ineligible'}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 font-medium">{hist.calculationBasis}</td>
                                <td className="py-1.5 px-2 text-right font-mono">{hist.standardMonthlyWorkingHours}h</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-amber-600">{hist.overtimeMultiplier}x</td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {hist.fixedHourlyRateBDT ? `৳${hist.fixedHourlyRateBDT}` : 'N/A'}
                                </td>
                                <td className="py-1.5 px-2 text-slate-500">
                                  {hist.notes || 'Routine revision'} {hist.updatedBy ? `(${hist.updatedBy})` : ''}
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

              {/* SECTION 4: APP PERMISSIONS & CHANNEL TAGS */}
              {(editModalTab === 'all' || editModalTab === 'permissions') && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 space-y-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>4. App Permissions & Channel Tags</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* App Permissions */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        App Permissions Profile
                      </label>
                      <select
                        value={appPermissions}
                        onChange={(e) => setAppPermissions(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                      >
                        <option value="">-- Select App Permissions --</option>
                        {APP_PERMISSIONS_LIST.map((perm) => (
                          <option key={perm} value={perm}>
                            {perm}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Field Force Tags */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Field Force Tags
                      </label>
                      <select
                        value={fieldForceTags}
                        onChange={(e) => setFieldForceTags(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Field Force Tag --</option>
                        {FIELD_FORCE_TAGS_LIST.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Customer Tags */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Customer Channels Tag
                      </label>
                      <select
                        value={customerTags}
                        onChange={(e) => setCustomerTags(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Select Customer Channel Tag --</option>
                        {CUSTOMER_TAGS_LIST.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: TADA APPROVE PERSON (SUPER ADMIN WORKFLOW) */}
              {(editModalTab === 'all' || editModalTab === 'approver') && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>5. TADA Approve Person (Super Admin Tagging)</span>
                    </h4>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      Approval Authority
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Assign which manager or executive has authority to review and approve Travel Allowance & Daily Allowance (TADA) claims generated by this officer.
                  </p>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Select Designated TADA Approver<span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formTadaApproverId}
                      onChange={(e) => setFormTadaApproverId(e.target.value)}
                      className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- No Approver Tagged (Unassigned) --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.role} ({u.designation || u.department || 'User'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">
                  Editing Record: <strong className="font-mono text-slate-700 dark:text-slate-300">{editingRep.code}</strong> • ID: {editingRep.id}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingRep(null)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save All Changes</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: 9-TAB COMPREHENSIVE EMPLOYEE & FIELD FORCE PROFILE */}
      {/* ======================================================== */}
      {viewingRep && (
        <EmployeeProfileModal
          employee={viewingRep}
          canEdit={canEditEmployee}
          onClose={() => setViewingRep(null)}
          onEdit={(emp) => {
            if (!canEditEmployee) return;
            setViewingRep(null);
            handleOpenEdit(emp);
          }}
        />
      )}

      {/* QUICK TAG TADA APPROVER MODAL (SUPER ADMIN DIRECT ACTION) */}
      {repToTagTadaApprover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-blue-50/70 dark:bg-blue-950/50">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Tag TADA Approve Person
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Assign approval authority for {repToTagTadaApprover.name} ({repToTagTadaApprover.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRepToTagTadaApprover(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              {quickTagSuccessMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{quickTagSuccessMsg}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">FIELD OFFICER</span>
                  <span className="font-bold text-slate-900 dark:text-white">{repToTagTadaApprover.name}</span>
                  <span className="text-[11px] text-slate-500 block">Code: {repToTagTadaApprover.code} • {repToTagTadaApprover.fieldForceType || 'Officer'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">CURRENT APPROVER</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {repToTagTadaApprover.tadaApproverName || 'Not Tagged'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select User to Tag as TADA Approver*
                </label>
                <select
                  value={quickSelectedApproverId}
                  onChange={(e) => setQuickSelectedApproverId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select Approver User --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role} ({u.designation || u.department || 'User'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Super Admin Setting: TADA claims created by this officer will be automatically tagged to this user for approval.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-800/30">
              <button
                type="button"
                onClick={() => setRepToTagTadaApprover(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuickTagTadaApprover}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Approver Tag</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN MONTHLY SALES TARGET */}
      {repToAssignTarget && canAssignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Assign Monthly Sales Target
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {repToAssignTarget.name} ({repToAssignTarget.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRepToAssignTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAssignTarget} className="p-4 space-y-4 text-xs">
              {quickTargetSuccessMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{quickTargetSuccessMsg}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Monthly Sales Target (BDT)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={quickTargetInputBDT}
                  onChange={(e) =>
                    setQuickTargetInputBDT(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Current target: ৳ {Number(repToAssignTarget.monthlyTargetBDT || 0).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRepToAssignTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Target</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {repToDelete && canDeleteEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Delete Employee?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove <b>{repToDelete.name}</b> ({repToDelete.code}) from the Employee Directory?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRepToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: MULTI-OFFICE GPS LOCATION & GEOFENCE SETUP        */}
      {/* ======================================================== */}
      {showOfficeSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Navigation className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Office GPS Geofence Locations Master
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure multiple office coordinates &amp; allowed attendance radius (Default: 200 Meters).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOfficeSetupModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {officeFormNotice && (
                <div
                  className={`p-3 rounded-xl border font-semibold flex items-center gap-2 ${
                    officeNoticeType === 'error'
                      ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                      : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  {officeNoticeType === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{officeFormNotice}</span>
                </div>
              )}

              {/* Add / Edit Office Form */}
              {(canCreateEmployee || canEditEmployee) && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (editingOfficeId ? !canEditEmployee : !(canCreateEmployee || canEditEmployee)) {
                    return;
                  }
                  const lat = Number(officeFormLat);
                  const lng = Number(officeFormLng);
                  if (!officeFormName.trim() || !isValidCoordinatePair(lat, lng)) {
                    setOfficeNoticeType('error');
                    setOfficeFormNotice('Please enter a valid office name, latitude (-90..90), and longitude (-180..180).');
                    return;
                  }
                  setIsSavingOffice(true);
                  setOfficeFormNotice('');
                  try {
                    const radius =
                      Number(officeFormRadius) > 0
                        ? Number(officeFormRadius)
                        : DEFAULT_ALLOWED_RADIUS_METERS;
                    const trimmedName = officeFormName.trim();
                    const trimmedCode = officeFormCode.trim() || undefined;
                    const trimmedAddress = officeFormAddress.trim();

                    if (editingOfficeId) {
                      const res = await updateOfficeLocation(editingOfficeId, {
                        code: trimmedCode,
                        name: trimmedName,
                        address: trimmedAddress,
                        latitude: lat,
                        longitude: lng,
                        allowedRadiusMeters: radius,
                        status: officeFormStatus,
                      });
                      if (!res.success) {
                        setOfficeNoticeType('error');
                        setOfficeFormNotice(res.error || 'Failed to update office location in Supabase.');
                        return;
                      }
                      setOfficeNoticeType('success');
                      setOfficeFormNotice(`Updated office "${trimmedName}" in Supabase and synced assigned employees.`);
                      setEditingOfficeId(null);
                      setOfficeFormCode(getNextOfficeCode(officeLocations));
                    } else {
                      const res = await addOfficeLocation({
                        code: trimmedCode,
                        name: trimmedName,
                        address: trimmedAddress,
                        latitude: lat,
                        longitude: lng,
                        allowedRadiusMeters: radius,
                        status: officeFormStatus,
                      });
                      if (!res.success) {
                        setOfficeNoticeType('error');
                        setOfficeFormNotice(res.error || 'Failed to save office location to Supabase.');
                        return;
                      }
                      setOfficeNoticeType('success');
                      setOfficeFormNotice(`Saved new office geofence "${trimmedName}" to Supabase.`);
                      setOfficeFormCode(
                        getNextOfficeCode([
                          ...officeLocations,
                          {
                            id: res.id,
                            code: trimmedCode,
                            name: trimmedName,
                            address: trimmedAddress,
                            latitude: lat,
                            longitude: lng,
                            allowedRadiusMeters: radius,
                            status: officeFormStatus,
                          },
                        ])
                      );
                    }
                    setOfficeFormName('');
                    setOfficeFormAddress('');
                    setOfficeFormRadius(DEFAULT_ALLOWED_RADIUS_METERS);
                    setOfficeFormStatus('Active');
                  } finally {
                    setIsSavingOffice(false);
                  }
                }}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                    {editingOfficeId ? 'Edit Office Location Coordinates' : 'Add New Office Location'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setOfficeFormLat(pos.coords.latitude.toFixed(6));
                          setOfficeFormLng(pos.coords.longitude.toFixed(6));
                          setOfficeFormNotice(`Captured device GPS (±${Math.round(pos.coords.accuracy)}m accuracy).`);
                        },
                        (err) => setOfficeFormNotice(`GPS error: ${err.message}`),
                        { enableHighAccuracy: true, timeout: 10000 }
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Capture Current GPS</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Office Code
                    </label>
                    <input
                      type="text"
                      value={officeFormCode}
                      onChange={(e) => setOfficeFormCode(e.target.value)}
                      placeholder="OFF-HQ-01"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Office / Headquarters Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={officeFormName}
                      onChange={(e) => setOfficeFormName(e.target.value)}
                      placeholder="e.g. Dhaka Corporate Headquarters"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Location Status
                    </label>
                    <select
                      value={officeFormStatus}
                      onChange={(e) => setOfficeFormStatus(e.target.value as 'Active' | 'Inactive')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Office Latitude *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={officeFormLat}
                      onChange={(e) => setOfficeFormLat(e.target.value)}
                      placeholder="23.8103"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Office Longitude *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={officeFormLng}
                      onChange={(e) => setOfficeFormLng(e.target.value)}
                      placeholder="90.4125"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Allowed Radius (Meters) *
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      required
                      value={officeFormRadius}
                      onChange={(e) => setOfficeFormRadius(Math.max(10, Number(e.target.value) || DEFAULT_ALLOWED_RADIUS_METERS))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Office Address *
                    </label>
                    <input
                      type="text"
                      value={officeFormAddress}
                      onChange={(e) => setOfficeFormAddress(e.target.value)}
                      placeholder="Street, Area, City"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {editingOfficeId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOfficeId(null);
                        setOfficeFormName('');
                        setOfficeFormAddress('');
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingOffice}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {isSavingOffice
                        ? 'Saving to Supabase...'
                        : editingOfficeId
                          ? 'Update Office Coordinates'
                          : 'Add Office Location'}
                    </span>
                  </button>
                </div>
              </form>
              )}

              {/* Configured Office Locations Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-3 px-4">Office Name</th>
                      <th className="py-3 px-4">Address</th>
                      <th className="py-3 px-4">Latitude</th>
                      <th className="py-3 px-4">Longitude</th>
                      <th className="py-3 px-4">Allowed Radius</th>
                      <th className="py-3 px-4">Assigned Staff</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {officeLocations.map((loc: OfficeLocation) => {
                      const assignedCount = cleanFieldForceReps.filter((r) => r.assignedOfficeId === loc.id).length;
                      return (
                        <tr key={loc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{loc.name}</div>
                            {loc.code && <div className="font-mono text-[10px] text-blue-600">{loc.code}</div>}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-[220px] truncate" title={loc.address}>
                            {loc.address || '-'}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums">{Number(loc.latitude).toFixed(6)}</td>
                          <td className="py-3 px-4 font-mono tabular-nums">{Number(loc.longitude).toFixed(6)}</td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {loc.allowedRadiusMeters} Meters
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                            {assignedCount}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                loc.status === 'Active'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {loc.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              {canEditEmployee && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingOfficeId(loc.id);
                                    setOfficeFormCode(loc.code || '');
                                    setOfficeFormName(loc.name);
                                    setOfficeFormAddress(loc.address || '');
                                    setOfficeFormLat(String(loc.latitude));
                                    setOfficeFormLng(String(loc.longitude));
                                    setOfficeFormRadius(loc.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_METERS);
                                    setOfficeFormStatus(loc.status);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Edit Office Coordinates"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDeleteEmployee && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!canDeleteEmployee) return;
                                    const res = await deleteOfficeLocation(loc.id);
                                    if (res && !res.success) {
                                      setOfficeNoticeType('error');
                                      setOfficeFormNotice(res.error || 'Failed to delete office location from Supabase.');
                                      return;
                                    }
                                    if (editingOfficeId === loc.id) {
                                      setEditingOfficeId(null);
                                      setOfficeFormName('');
                                      setOfficeFormAddress('');
                                    }
                                    setOfficeNoticeType('success');
                                    setOfficeFormNotice(`Removed office location "${loc.name}" from Supabase.`);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  title="Delete Office Location"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      <EmployeeQrSingleModal
        isOpen={Boolean(qrModalRep)}
        employee={qrModalRep}
        onClose={() => setQrModalRep(null)}
      />

      <EmployeeQrBulkModal
        isOpen={showBulkQrModal}
        onClose={() => setShowBulkQrModal(false)}
      />
    </div>
  );
};
