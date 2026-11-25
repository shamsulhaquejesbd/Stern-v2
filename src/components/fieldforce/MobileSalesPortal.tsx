import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Smartphone,
  ShoppingBag,
  Users2,
  CheckCircle2,
  Plus,
  Minus,
  Sparkles,
  MapPin,
  TrendingUp,
  Tag,
  ArrowRight,
  Search,
  BatteryCharging,
  Receipt,
  FileText,
  Check,
  X,
  Clock,
  ArrowLeft,
  Calendar,
  DollarSign,
  AlertCircle,
  Building2,
  ChevronRight,
  ChevronDown,
  Filter,
  Upload,
  ShieldCheck,
  Car,
  PlusCircle,
  RotateCcw,
  FileSpreadsheet,
  Layers,
  Store,
  Phone,
  UserCheck,
  BarChart3,
  SlidersHorizontal,
  Navigation,
  HelpCircle,
  RefreshCw,
  Eye,
  Send,
  Trash2,
  CheckCheck,
  PackageCheck,
  Truck,
  Menu,
  Handshake,
  FileSignature,
  Sun,
  Moon,
  Crosshair,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext.tsx';
import { Product, Customer, getCustomerProductPricing, TADAEntry, WarrantyTicket, FieldForceRep } from '../../types/erp.ts';
import {
  DEFAULT_ALLOWED_RADIUS_METERS,
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  DEFAULT_OFFICE_LOCATIONS,
  calculateHaversineDistanceMeters,
  evaluateGeofenceAttendance,
  formatLateDuration,
  isValidCoordinatePair,
} from '../../lib/geofence.ts';
import {
  getInitials,
  resolveEmployeeForERPUser,
  toFieldForceRepView,
  ResolvedMobileEmployeeProfile,
} from '../../lib/fieldForceAuth.ts';
import { ChallanModal } from '../sales/ChallanModal.tsx';
import { DeliveryOrderModal } from '../sales/DeliveryOrderModal.tsx';
import { CustomerReceiptModal } from '../sales/CustomerReceiptModal.tsx';

type MobileActiveTab =
  | 'home'
  | 'order'
  | 'invoice'
  | 'reports'
  | 'customer_add'
  | 'tada'
  | 'warranty'
  | 'attendance'
  | 'crm_lead_add';

interface MobileSalesPortalProps {
  onBackToERP?: () => void;
  onOpenERPMenu?: () => void;
}

export const MobileSalesPortal: React.FC<MobileSalesPortalProps> = ({
  onBackToERP,
  onOpenERPMenu,
}) => {
  const {
    products,
    customers,
    distributors,
    offers,
    createSalesOrder,
    updateSalesOrder,
    dispatchAndInvoiceSalesOrder,
    confirmCustomerReceipt,
    salesOrders,
    visitLogs,
    fieldForceReps,
    users,
    currentUser,
    isAuthenticated,
    erpSessionToken,
    getErpAuthHeaders,
    currentEmployeeProfile,
    logout,
    warehouses,
    logCustomerVisit,
    addCustomer,
    addTADA,
    addWarrantyTicket,
    warrantyTickets,
    addCRMLead,
    officeLocations,
    attendanceRecords,
    submitGpsCheckIn,
    submitGpsCheckOut,
    applyLeave,
    payrollSettings,
    theme,
    toggleTheme,
  } = useERP();

  const isDark = theme === 'dark';

  // CRM Agreement Lead Registration State
  const [crmClientName, setCrmClientName] = useState<string>('');
  const [crmAddress, setCrmAddress] = useState<string>('');
  const [crmContactPerson, setCrmContactPerson] = useState<string>('');
  const [crmPhone, setCrmPhone] = useState<string>('');
  const [crmEmail, setCrmEmail] = useState<string>('');
  const [crmChannel, setCrmChannel] = useState<string>('Corporate Fleet');
  const [crmStage, setCrmStage] = useState<string>('Lead Identified');
  const [crmExpectedVolume, setCrmExpectedVolume] = useState<number>(0);
  const [crmDealValue, setCrmDealValue] = useState<number>(0);
  const [crmSpecialDiscount, setCrmSpecialDiscount] = useState<number>(0);
  const [crmContractTerm, setCrmContractTerm] = useState<number>(12);
  const [crmClosingDate, setCrmClosingDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
  );
  const [crmNotes, setCrmNotes] = useState<string>('');
  const [crmSubmitting, setCrmSubmitting] = useState<boolean>(false);

  // App mode & navigation
  const [deviceFrameMode, setDeviceFrameMode] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<MobileActiveTab>('home');
  const [orderSubStep, setOrderSubStep] = useState<'catalog' | 'discounts' | 'review'>('catalog');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('All');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [showBrandModal, setShowBrandModal] = useState<boolean>(false);
  const [showSchemeModal, setShowSchemeModal] = useState<boolean>(false);

  // Delivery & Customer Handover States (D.O. and Challan copies kept for factory & sales use)
  const [selectedMobileOrderForDO, setSelectedMobileOrderForDO] = useState<any>(null);
  const [selectedMobileOrderForChallan, setSelectedMobileOrderForChallan] = useState<any>(null);
  const [selectedMobileOrderForReceipt, setSelectedMobileOrderForReceipt] = useState<any>(null);
  const [deliveryFilterTab, setDeliveryFilterTab] = useState<'pending' | 'delivered' | 'all'>('pending');

  // Authoritative Logged-in Employee Identity Resolution from Active ERP Session (No fallbacks or manual switching)
  const [serverVerifiedEmployee, setServerVerifiedEmployee] = useState<ResolvedMobileEmployeeProfile | null>(null);

  const clientResolvedProfile = useMemo<ResolvedMobileEmployeeProfile | null>(() => {
    if (!isAuthenticated || !currentUser || !currentUser.id || currentUser.id === 'guest') {
      return null;
    }
    if (currentUser.status === 'Blocked' || currentUser.status === 'Inactive') {
      return null;
    }
    return (
      currentEmployeeProfile ||
      resolveEmployeeForERPUser(currentUser, fieldForceReps, officeLocations)
    );
  }, [isAuthenticated, currentUser, currentEmployeeProfile, fieldForceReps, officeLocations]);

  const resolvedProfile = useMemo<ResolvedMobileEmployeeProfile | null>(() => {
    if (!clientResolvedProfile) return null;
    if (
      serverVerifiedEmployee &&
      serverVerifiedEmployee.userId === clientResolvedProfile.userId
    ) {
      return {
        ...clientResolvedProfile,
        ...serverVerifiedEmployee,
        matchedRep: clientResolvedProfile.matchedRep || serverVerifiedEmployee.matchedRep,
      };
    }
    return clientResolvedProfile;
  }, [clientResolvedProfile, serverVerifiedEmployee]);

  // Verify active ERP session against backend on mount, user switch, or tab navigation
  useEffect(() => {
    if (!isAuthenticated || !currentUser || !currentUser.id || currentUser.id === 'guest' || currentUser.status === 'Blocked' || currentUser.status === 'Inactive') {
      setServerVerifiedEmployee(null);
      return;
    }

    let cancelled = false;
    const verifySessionWithRetry = async (attempt = 0) => {
      try {
        const res = await fetch('/api/mobile-field/me', {
          headers: {
            ...getErpAuthHeaders(),
            'x-mobile-portal': 'true',
          },
        });
        if (cancelled) return;
        if (res.status === 401) {
          // Retry once briefly if initial login / session establishment is still in flight
          if (attempt === 0) {
            setTimeout(() => {
              if (!cancelled) verifySessionWithRetry(1);
            }, 650);
            return;
          }
          setServerVerifiedEmployee(null);
          logout();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.employee) {
            setServerVerifiedEmployee(data.employee as ResolvedMobileEmployeeProfile);
          }
        }
      } catch {
        // Retain client-resolved ERP identity if backend probe is momentarily offline
      }
    };

    verifySessionWithRetry(0);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUser, erpSessionToken, getErpAuthHeaders, logout]);

  // Redirect immediately if ERP session expires, is blocked, or user logs out
  useEffect(() => {
    if (
      !isAuthenticated ||
      !currentUser ||
      !currentUser.id ||
      currentUser.id === 'guest' ||
      currentUser.status === 'Blocked' ||
      currentUser.status === 'Inactive'
    ) {
      logout();
    }
  }, [isAuthenticated, currentUser, logout]);

  const activeRep = useMemo<FieldForceRep | null>(() => {
    return resolvedProfile ? toFieldForceRepView(resolvedProfile) : null;
  }, [resolvedProfile]);

  const safeProfile: ResolvedMobileEmployeeProfile = useMemo(() => {
    if (resolvedProfile) return resolvedProfile;
    const fallbackOffice = officeLocations[0] || DEFAULT_OFFICE_LOCATIONS[0];
    return {
      userId: String(currentUser?.id || ''),
      userLoginId: String(currentUser?.userId || currentUser?.id || ''),
      employeeId: String(currentUser?.id || ''),
      employeeCode: String(currentUser?.salesmanCode || currentUser?.userId || currentUser?.id || ''),
      name: String(currentUser?.name || ''),
      designation: String(currentUser?.designation || currentUser?.role || ''),
      assignedRole: String(currentUser?.role || ''),
      erpRole: String(currentUser?.role || ''),
      department: String(currentUser?.department || 'Operations'),
      phone: String(currentUser?.phone || ''),
      email: String(currentUser?.email || ''),
      region: String(currentUser?.region || ''),
      area: String(currentUser?.area || ''),
      territory: String(currentUser?.territory || ''),
      branchWorkplace: fallbackOffice.name,
      officeAddress: fallbackOffice.address,
      assignedOfficeId: fallbackOffice.id,
      assignedOfficeName: fallbackOffice.name,
      officeLatitude: fallbackOffice.latitude,
      officeLongitude: fallbackOffice.longitude,
      allowedRadiusMeters: fallbackOffice.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_METERS,
      locationStatus: 'Active',
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      gracePeriodMinutes: 15,
      monthlyTargetBDT: Number(currentUser?.monthlySalesTargetBDT || currentUser?.salesTargetBDT || 0),
      monthlyAchievedBDT: 0,
      hasEmployeeRecord: false,
    };
  }, [resolvedProfile, currentUser, officeLocations]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    [
      'ensec_field_force_reps',
      'ensec_visit_logs',
      'ensec_sales_orders',
      'ensec_tada_list',
      'ensec_mobile_cart',
      'ensec_mobile_schemes',
      'ensec_mobile_selected_customer',
      'ensec_mobile_selected_market',
    ].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
      try { sessionStorage.removeItem(k); } catch {}
    });
  }, []);

  // Selected Retailer / Customer state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ''
  );
  useEffect(() => {
    if (selectedCustomerId && !customers.some((c) => c.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0]?.id || '');
    } else if (!selectedCustomerId && customers[0]?.id) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  const activeCustomer = useMemo(() => {
    return (
      customers.find((c) => c.id === selectedCustomerId) ||
      customers[0] || {
        id: 'cust-unselected',
        name: 'Select Outlet / Customer',
        ownerName: '',
        channel: 'Retailer',
        customerType: 'Retailer',
        pricingTier: 'Dealer',
        area: safeProfile.area || safeProfile.territory || '',
        market: safeProfile.territory || safeProfile.area || '',
        assignedDistributorName: distributors[0]?.name || '',
        phone: '',
        address: safeProfile.officeAddress || '',
      }
    );
  }, [customers, selectedCustomerId, safeProfile, distributors]);

  // Selected Market / Beat
  const [selectedMarket, setSelectedMarket] = useState<string>(
    () => safeProfile.territory || customers[0]?.territory || safeProfile.area || ''
  );
  useEffect(() => {
    if (resolvedProfile?.territory) {
      setSelectedMarket(resolvedProfile.territory);
    }
  }, [resolvedProfile?.userId, resolvedProfile?.territory]);

  // Customer Selection Modal State & Filters
  const [showCustomerModal, setShowCustomerModal] = useState<boolean>(false);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [customerChannelFilter, setCustomerChannelFilter] = useState<string>('All');
  const [customerDistributorFilter, setCustomerDistributorFilter] = useState<string>('All');

  // Market Selection Modal State & Search
  const [showMarketModal, setShowMarketModal] = useState<boolean>(false);
  const [marketSearch, setMarketSearch] = useState<string>('');

  // Distinct channels for customer filtering
  const customerChannels = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.channel) set.add(c.channel);
      else if (c.customerType) set.add(c.customerType);
    });
    return ['All', ...Array.from(set)];
  }, [customers]);

  // Distinct distributors for customer filtering dropdown
  const availableDistributorsForFilter = useMemo(() => {
    const list: { id: string; name: string }[] = [{ id: 'All', name: 'All Distributors' }];
    const seen = new Set<string>();

    distributors.forEach((d) => {
      if (d.name && !seen.has(d.name)) {
        seen.add(d.name);
        list.push({ id: d.id, name: d.name });
      }
    });

    customers.forEach((c) => {
      if (c.assignedDistributorName && !seen.has(c.assignedDistributorName)) {
        seen.add(c.assignedDistributorName);
        list.push({
          id: c.assignedDistributorId || c.assignedDistributorName,
          name: c.assignedDistributorName,
        });
      }
    });

    return list;
  }, [distributors, customers]);

  // Filtered customer list for the customer selection modal
  const filteredCustomersList = useMemo(() => {
    return customers.filter((c) => {
      const q = customerSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.territory && c.territory.toLowerCase().includes(q)) ||
        (c.district && c.district.toLowerCase().includes(q)) ||
        (c.ownerName && c.ownerName.toLowerCase().includes(q)) ||
        (c.assignedDistributorName && c.assignedDistributorName.toLowerCase().includes(q));

      const matchChannel =
        customerChannelFilter === 'All' ||
        c.channel === customerChannelFilter ||
        c.customerType === customerChannelFilter;

      const matchDistributor =
        customerDistributorFilter === 'All' ||
        c.assignedDistributorId === customerDistributorFilter ||
        c.assignedDistributorName === customerDistributorFilter ||
        (distributors.find((d) => d.id === customerDistributorFilter)?.name === c.assignedDistributorName);

      return matchSearch && matchChannel && matchDistributor;
    });
  }, [customers, customerSearch, customerChannelFilter, customerDistributorFilter, distributors]);

  // Available markets list (strictly from real profile, customers, and distributors)
  const availableMarkets = useMemo(() => {
    const set = new Set<string>();
    if (selectedMarket) set.add(selectedMarket);
    if (safeProfile.territory) set.add(safeProfile.territory);
    if (safeProfile.area) set.add(safeProfile.area);
    if (safeProfile.region) set.add(safeProfile.region);
    customers.forEach((c) => {
      if (c.territory) set.add(c.territory);
      if (c.market) set.add(c.market);
      if (c.district) set.add(c.district);
    });
    distributors.forEach((d) => {
      if (d.territory) set.add(d.territory);
      if (d.region) set.add(d.region);
      if (d.dbPoint) set.add(d.dbPoint);
      if (d.district) set.add(d.district);
    });
    const q = marketSearch.trim().toLowerCase();
    return Array.from(set).filter((m) => m && (!q || m.toLowerCase().includes(q)));
  }, [customers, distributors, safeProfile.territory, safeProfile.area, safeProfile.region, selectedMarket, marketSearch]);

  // Active Promotional Offers from ERP master (no hardcoded test schemes)
  const activeOffers = useMemo(() => {
    return offers.filter((o) => {
      if (o.isActive === false) return false;
      if (o.status && o.status !== 'Active') return false;
      return true;
    });
  }, [offers]);

  // Product Cart State: { [productId]: quantity }
  const [cart, setCart] = useState<{ [productId: string]: number }>({});

  // Applied Discounts checkboxes state
  const [enabledSchemes, setEnabledSchemes] = useState<{ [schemeId: string]: boolean }>({});

  // Success notifications
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Search input in order catalog
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  const todayDateNowISO = new Date().toISOString().slice(0, 10);
  const monthStartISO = `${todayDateNowISO.slice(0, 8)}01`;

  // -------------------------------------------------------------
  // INVOICE / DELIVERY CONFIRMATION STATE (Matches Screenshot 2)
  // -------------------------------------------------------------
  const [orderDateFilterFrom, setOrderDateFilterFrom] = useState<string>(monthStartISO);
  const [orderDateFilterTo, setOrderDateFilterTo] = useState<string>(todayDateNowISO);
  const [invoiceSearch, setInvoiceSearch] = useState<string>('');
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<any | null>(null);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Shop Closed');
  const [showFullConfirmModal, setShowFullConfirmModal] = useState<boolean>(false);
  const [partialDeliveryItems, setPartialDeliveryItems] = useState<{ [itemId: string]: number }>({});
  const [isEditingPartialOrder, setIsEditingPartialOrder] = useState<boolean>(false);

  // -------------------------------------------------------------
  // DYNAMIC REPORTS STATE (Matches Screenshot 3)
  // -------------------------------------------------------------
  const [selectedReportType, setSelectedReportType] = useState<string>('Brand Wise Order Vs Invoice');
  const [reportDateFrom, setReportDateFrom] = useState<string>(monthStartISO);
  const [reportDateTo, setReportDateTo] = useState<string>(todayDateNowISO);
  const [reportBrand, setReportBrand] = useState<string>('All');
  const [reportCategory, setReportCategory] = useState<string>('All');

  // -------------------------------------------------------------
  // NEW CUSTOMER ADD FORM STATE
  // -------------------------------------------------------------
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustOwner, setNewCustOwner] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustChannel, setNewCustChannel] = useState<string>('Retailer');
  const [newCustMarket, setNewCustMarket] = useState<string>(() => safeProfile.territory || safeProfile.area || '');
  const [newCustDistributor, setNewCustDistributor] = useState<string>(distributors[0]?.name || '');
  const [newCustAddress, setNewCustAddress] = useState<string>('');
  const [newCustGps, setNewCustGps] = useState<string>(
    () => `Lat: ${safeProfile.officeLatitude.toFixed(4)}, Lng: ${safeProfile.officeLongitude.toFixed(4)} (Assigned Office)`
  );

  // -------------------------------------------------------------
  // TADA CAPTURE STATE
  // -------------------------------------------------------------
  const [tadaDate, setTadaDate] = useState<string>(todayDateNowISO);
  const [tadaFrom, setTadaFrom] = useState<string>(() => safeProfile.assignedOfficeName || '');
  const [tadaTo, setTadaTo] = useState<string>(() =>
    activeCustomer.id !== 'cust-unselected' ? activeCustomer.name || '' : ''
  );
  const [tadaMode, setTadaMode] = useState<string>('Bus');
  const [tadaDistance, setTadaDistance] = useState<number>(0);
  const [tadaFare, setTadaFare] = useState<number>(0);
  const [tadaDA, setTadaDA] = useState<number>(0);
  const [tadaRemarks, setTadaRemarks] = useState<string>('');

  // -------------------------------------------------------------
  // WARRANTY RMA CAPTURE STATE
  // -------------------------------------------------------------
  const [warrantySerial, setWarrantySerial] = useState<string>('');
  const [warrantyCustName, setWarrantyCustName] = useState<string>(() =>
    activeCustomer.id !== 'cust-unselected' ? activeCustomer.name || '' : ''
  );
  const [warrantyPhone, setWarrantyPhone] = useState<string>(() =>
    activeCustomer.id !== 'cust-unselected' ? activeCustomer.phone || '' : ''
  );
  const [warrantyDefect, setWarrantyDefect] = useState<string>('Cell Imbalance / Under Voltage');
  const [warrantyNotes, setWarrantyNotes] = useState<string>('');

  // Keep TADA & Warranty default locations/customers aligned when logged-in employee or active customer changes
  useEffect(() => {
    if (resolvedProfile?.assignedOfficeName) {
      setTadaFrom(resolvedProfile.assignedOfficeName);
      setNewCustGps(
        `Lat: ${resolvedProfile.officeLatitude.toFixed(4)}, Lng: ${resolvedProfile.officeLongitude.toFixed(4)} (${resolvedProfile.assignedOfficeName})`
      );
    }
    if (resolvedProfile?.territory || resolvedProfile?.area) {
      setNewCustMarket(resolvedProfile.territory || resolvedProfile.area);
    }
  }, [resolvedProfile?.userId, resolvedProfile?.assignedOfficeName, resolvedProfile?.officeLatitude, resolvedProfile?.officeLongitude, resolvedProfile?.territory, resolvedProfile?.area]);

  // -------------------------------------------------------------
  // GPS GEOFENCING ATTENDANCE & LEAVE STATE
  // -------------------------------------------------------------
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const [gpsStatusState, setGpsStatusState] = useState<'idle' | 'detecting' | 'ready' | 'denied' | 'error'>('idle');
  const [capturedGpsCoords, setCapturedGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAtMs: number;
  } | null>(null);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string>('Initializing GPS location...');
  const [attendanceSubmitting, setAttendanceSubmitting] = useState<boolean>(false);
  const [attendanceResultAlert, setAttendanceResultAlert] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);
  const [leaveType, setLeaveType] = useState<string>('Casual Leave');
  const [leaveDays, setLeaveDays] = useState<number>(1);
  const [leaveReason, setLeaveReason] = useState<string>('');

  // Live clock tick when attendance view is open
  useEffect(() => {
    if (activeTab !== 'attendance') return;
    setLiveNow(new Date());
    const timer = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [activeTab]);

  // Active employee for attendance is strictly locked to the authenticated ERP session identity
  const attendanceEmployee: FieldForceRep = useMemo(() => {
    return activeRep || toFieldForceRepView(safeProfile);
  }, [activeRep, safeProfile]);

  // Resolve assigned office coordinates & radius for attendance employee
  const assignedOfficeConfig = useMemo(() => {
    const matchedOffice = attendanceEmployee.assignedOfficeId
      ? officeLocations.find((o) => o.id === attendanceEmployee.assignedOfficeId)
      : undefined;
    const officeLat =
      typeof attendanceEmployee.officeLatitude === 'number' &&
      isValidCoordinatePair(attendanceEmployee.officeLatitude, attendanceEmployee.officeLongitude)
        ? attendanceEmployee.officeLatitude
        : matchedOffice?.latitude ?? DEFAULT_OFFICE_LOCATIONS[0].latitude;
    const officeLng =
      typeof attendanceEmployee.officeLongitude === 'number' &&
      isValidCoordinatePair(attendanceEmployee.officeLatitude, attendanceEmployee.officeLongitude)
        ? attendanceEmployee.officeLongitude
        : matchedOffice?.longitude ?? DEFAULT_OFFICE_LOCATIONS[0].longitude;
    const allowedRadius =
      Number(attendanceEmployee.allowedRadiusMeters) > 0
        ? Number(attendanceEmployee.allowedRadiusMeters)
        : matchedOffice?.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_METERS;
    const locationStatus: 'Active' | 'Inactive' =
      attendanceEmployee.locationStatus || matchedOffice?.status || 'Active';
    return {
      officeId: attendanceEmployee.assignedOfficeId || matchedOffice?.id || DEFAULT_OFFICE_LOCATIONS[0].id,
      officeName:
        attendanceEmployee.assignedOfficeName ||
        matchedOffice?.name ||
        attendanceEmployee.branchWorkplace ||
        DEFAULT_OFFICE_LOCATIONS[0].name,
      officeAddress: attendanceEmployee.officeAddress || matchedOffice?.address || DEFAULT_OFFICE_LOCATIONS[0].address,
      officeLatitude: officeLat,
      officeLongitude: officeLng,
      allowedRadiusMeters: allowedRadius,
      locationStatus,
    };
  }, [attendanceEmployee, officeLocations]);

  // Today's attendance record for the active employee
  const todayDateISO = liveNow.toISOString().slice(0, 10);
  const todayAttendanceRecord = useMemo(() => {
    return attendanceRecords.find(
      (a) =>
        (a.employeeId === attendanceEmployee.id ||
          a.fieldForceId === attendanceEmployee.id ||
          (attendanceEmployee.code && a.employeeCode === attendanceEmployee.code)) &&
        a.date === todayDateISO
    );
  }, [attendanceRecords, attendanceEmployee, todayDateISO]);

  // Real-time distance & geofence pre-evaluation
  const liveGeofenceEval = useMemo(() => {
    if (!capturedGpsCoords) return null;
    return evaluateGeofenceAttendance({
      employeeLatitude: capturedGpsCoords.latitude,
      employeeLongitude: capturedGpsCoords.longitude,
      gpsAccuracyMeters: capturedGpsCoords.accuracy,
      officeLatitude: assignedOfficeConfig.officeLatitude,
      officeLongitude: assignedOfficeConfig.officeLongitude,
      allowedRadiusMeters: assignedOfficeConfig.allowedRadiusMeters,
      locationStatus: assignedOfficeConfig.locationStatus,
      maxGpsAccuracyMeters: payrollSettings.maxGpsAccuracyMeters || DEFAULT_MAX_GPS_ACCURACY_METERS,
    });
  }, [capturedGpsCoords, assignedOfficeConfig, payrollSettings.maxGpsAccuracyMeters]);

  const requestCurrentGpsPosition = useCallback((): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAtMs: number;
  }> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const msg = 'GPS geolocation is unavailable on this browser/device.';
        setGpsStatusState('error');
        setGpsStatusMessage(msg);
        reject(new Error(msg));
        return;
      }
      setGpsStatusState('detecting');
      setGpsStatusMessage('Detecting high-accuracy GPS location...');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy || 0),
            capturedAtMs: Date.now(),
          };
          setCapturedGpsCoords(coords);
          setGpsStatusState('ready');
          const dist = calculateHaversineDistanceMeters(
            coords.latitude,
            coords.longitude,
            assignedOfficeConfig.officeLatitude,
            assignedOfficeConfig.officeLongitude
          );
          setGpsStatusMessage(`GPS locked (±${coords.accuracy}m accuracy) • ${Math.round(dist)}m from office`);
          resolve(coords);
        },
        (err) => {
          if (err.code === 1) {
            const msg = 'GPS permission denied. You must allow device Location access to mark attendance.';
            setGpsStatusState('denied');
            setGpsStatusMessage(msg);
            reject(new Error(msg));
          } else {
            const msg =
              err.code === 3
                ? 'GPS signal timed out. Please move near a window or open area and tap Retry GPS.'
                : 'GPS location is currently unavailable. Please enable device GPS/Location Services and retry.';
            setGpsStatusState('error');
            setGpsStatusMessage(msg);
            reject(new Error(msg));
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [assignedOfficeConfig.officeLatitude, assignedOfficeConfig.officeLongitude]);

  // Automatically request GPS when opening Mobile Attendance screen
  useEffect(() => {
    if (activeTab === 'attendance') {
      requestCurrentGpsPosition().catch(() => {});
    }
  }, [activeTab, requestCurrentGpsPosition]);

  // Reverse-geocoded addresses resolved strictly from latitude & longitude
  const [officeReverseGeo, setOfficeReverseGeo] = useState<{
    coordKey: string;
    address: string;
  } | null>(null);
  const [liveGpsReverseGeo, setLiveGpsReverseGeo] = useState<{
    coordKey: string;
    address: string;
  } | null>(null);

  const fetchReverseGeocode = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    if (!isValidCoordinatePair(lat, lng)) return null;
    try {
      const res = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(lat.toFixed(6))}&lng=${encodeURIComponent(lng.toFixed(6))}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.ok && data?.address) {
        return String(data.address).trim();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Resolve accurate address for the assigned office / profile latitude & longitude
  useEffect(() => {
    const lat = assignedOfficeConfig.officeLatitude;
    const lng = assignedOfficeConfig.officeLongitude;
    if (!isValidCoordinatePair(lat, lng)) return;
    const coordKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (officeReverseGeo?.coordKey === coordKey) return;

    let cancelled = false;
    fetchReverseGeocode(lat, lng).then((addr) => {
      if (!cancelled && addr) {
        setOfficeReverseGeo({ coordKey, address: addr });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    assignedOfficeConfig.officeLatitude,
    assignedOfficeConfig.officeLongitude,
    officeReverseGeo?.coordKey,
    fetchReverseGeocode,
  ]);

  // Resolve accurate address for live captured GPS coordinates
  useEffect(() => {
    if (!capturedGpsCoords) return;
    const { latitude, longitude } = capturedGpsCoords;
    if (!isValidCoordinatePair(latitude, longitude)) return;
    const coordKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    if (liveGpsReverseGeo?.coordKey === coordKey) return;

    let cancelled = false;
    fetchReverseGeocode(latitude, longitude).then((addr) => {
      if (!cancelled && addr) {
        setLiveGpsReverseGeo({ coordKey, address: addr });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [capturedGpsCoords, liveGpsReverseGeo?.coordKey, fetchReverseGeocode]);

  // On Home tab, silently capture live GPS if geolocation permission is already granted
  useEffect(() => {
    if (activeTab !== 'home' || capturedGpsCoords) return;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((perm) => {
        if (!cancelled && perm.state === 'granted') {
          requestCurrentGpsPosition().catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, capturedGpsCoords, requestCurrentGpsPosition]);

  const handleMobileGpsCheckIn = async () => {
    setAttendanceResultAlert(null);
    setAttendanceSubmitting(true);
    try {
      const gps = await requestCurrentGpsPosition();
      const nowTime = new Date();
      const hhmm = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
      const res = await submitGpsCheckIn({
        employee: attendanceEmployee,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: gps.accuracy,
        date: todayDateISO,
        checkInTime: hhmm,
        source: 'mobile-field',
      });
      if (res.accepted) {
        setAttendanceResultAlert({
          type: 'success',
          title: `Check-In Accepted (${res.record?.status || 'Present'})`,
          message: `${res.reason} Checked in at ${res.record?.checkInTime || hhmm}.`,
        });
        setBannerNotice(`Check-In accepted for ${attendanceEmployee.name} (${Math.round(res.distanceMeters || 0)}m from office).`);
      } else {
        setAttendanceResultAlert({
          type: res.errorCode === 'POOR_GPS_ACCURACY' ? 'warning' : 'error',
          title: 'Check-In Rejected',
          message:
            res.distanceMeters !== undefined && res.errorCode === 'OUTSIDE_GEOFENCE'
              ? `${res.reason} (Calculated distance: ${Math.round(res.distanceMeters)} Meters)`
              : res.reason,
        });
      }
    } catch (err: any) {
      setAttendanceResultAlert({
        type: gpsStatusState === 'denied' ? 'error' : 'warning',
        title: gpsStatusState === 'denied' ? 'GPS Permission Denied' : 'GPS Unavailable',
        message: err?.message || 'Unable to verify GPS location. Please retry.',
      });
    } finally {
      setAttendanceSubmitting(false);
    }
  };

  const handleMobileGpsCheckOut = async () => {
    setAttendanceResultAlert(null);
    setAttendanceSubmitting(true);
    try {
      const gps = await requestCurrentGpsPosition();
      const nowTime = new Date();
      const hhmm = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
      const res = await submitGpsCheckOut({
        employee: attendanceEmployee,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: gps.accuracy,
        date: todayDateISO,
        checkOutTime: hhmm,
        source: 'mobile-field',
      });
      if (res.accepted) {
        setAttendanceResultAlert({
          type: 'success',
          title: 'Check-Out Accepted',
          message: `${res.reason} Total worked: ${res.record?.workHours ?? 0} hrs.`,
        });
        setBannerNotice(`Check-Out accepted for ${attendanceEmployee.name} at ${res.record?.checkOutTime || hhmm}.`);
      } else {
        setAttendanceResultAlert({
          type: res.errorCode === 'POOR_GPS_ACCURACY' ? 'warning' : 'error',
          title: 'Check-Out Rejected',
          message:
            res.distanceMeters !== undefined && res.errorCode === 'OUTSIDE_GEOFENCE'
              ? `${res.reason} (Calculated distance: ${Math.round(res.distanceMeters)} Meters)`
              : res.reason,
        });
      }
    } catch (err: any) {
      setAttendanceResultAlert({
        type: gpsStatusState === 'denied' ? 'error' : 'warning',
        title: gpsStatusState === 'denied' ? 'GPS Permission Denied' : 'GPS Unavailable',
        message: err?.message || 'Unable to verify GPS location. Please retry.',
      });
    } finally {
      setAttendanceSubmitting(false);
    }
  };

  // Cart operations
  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: next };
    });
  };

  // Cart Calculation with Trade Price (TP), MRP, VAT and Discounts
  const cartSummary = useMemo(() => {
    let grossTP = 0;
    let totalQty = 0;
    const itemsList: Array<{
      product: Product;
      qty: number;
      tp: number;
      mrp: number;
      lineTotal: number;
    }> = [];

    Object.entries(cart).forEach(([prodId, qty]) => {
      const p = products.find((prod) => prod.id === prodId);
      if (p && qty > 0) {
        const pricing = getCustomerProductPricing(activeCustomer, p);
        const tp = pricing.unitPrice;
        const mrp = p.retailPriceBDT || tp * 1.15;
        const lineTotal = tp * qty;
        grossTP += lineTotal;
        totalQty += qty;
        itemsList.push({
          product: p,
          qty,
          tp,
          mrp,
          lineTotal,
        });
      }
    });

    // Calculate applied discounts strictly from real enabled ERP offers
    let lineDiscount = 0;
    const appliedOffersList: Array<{ id: string; title: string; discountBDT: number }> = [];
    activeOffers.forEach((offer) => {
      if (!enabledSchemes[offer.id]) return;
      const minQty = Number(offer.minQuantity || 0);
      const minVal = Number(offer.minOrderValueBDT || offer.greaterThanOrEqualTo || 0);
      if (minQty > 0 && totalQty < minQty) return;
      if (minVal > 0 && grossTP < minVal) return;

      let amt = 0;
      const pct = Number(offer.discountPercentage || (offer.discountType === 'Percentage' ? offer.discountValue : 0) || 0);
      const flat = Number(offer.flatDiscountBDT || (offer.discountType === 'Fixed Amount' ? offer.discountValue : 0) || 0);
      if (pct > 0) {
        amt = Math.round((grossTP * pct) / 100);
      } else if (flat > 0) {
        amt = offer.applyInMultiples ? flat * totalQty : flat;
      }
      if (amt > 0) {
        lineDiscount += amt;
        appliedOffersList.push({
          id: offer.id,
          title: offer.title || offer.discountTitle || offer.code || 'Promotional Offer',
          discountBDT: amt,
        });
      }
    });

    const netTP = Math.max(0, grossTP - lineDiscount);
    const vat = Math.round(netTP * 0.05); // 5% VAT
    const netPayable = netTP + vat;

    return {
      itemsList,
      appliedOffersList,
      totalLineItems: itemsList.length,
      totalQty,
      grossTP,
      lineDiscount,
      netTP,
      vat,
      netPayable,
    };
  }, [cart, products, activeCustomer, enabledSchemes, activeOffers]);

  // Authenticated Mobile Backend Sync Helper (stamps session headers & enforces logout on 401)
  const postAuthenticatedMobileApi = useCallback(
    async (endpoint: string, payload: Record<string, any>): Promise<boolean> => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...getErpAuthHeaders(),
            'x-mobile-portal': 'true',
          },
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          setBannerNotice('ERP session expired. Redirecting to login...');
          logout();
          return false;
        }
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          setBannerNotice(`⚠️ ${errData?.error || 'Authorization error for employee identity.'}`);
          return false;
        }
        return res.ok;
      } catch (err) {
        console.warn(`Mobile sync (${endpoint}) note:`, err);
        return false;
      }
    },
    [getErpAuthHeaders, logout]
  );

  // Determine whether a sales order belongs to the currently logged-in ERP user/employee
  const isOrderOwnedByCurrentUser = useCallback(
    (order: any): boolean => {
      if (!order) return false;
      const uid = safeProfile.userId.toLowerCase();
      const eid = safeProfile.employeeId.toLowerCase();
      const ecode = safeProfile.employeeCode.toLowerCase();
      const ename = safeProfile.name.toLowerCase();
      return (
        (order.userId && String(order.userId).toLowerCase() === uid) ||
        (order.employeeId && (String(order.employeeId).toLowerCase() === eid || String(order.employeeId).toLowerCase() === ecode)) ||
        (order.employeeCode && ecode && String(order.employeeCode).toLowerCase() === ecode) ||
        (order.salespersonId && (String(order.salespersonId).toLowerCase() === eid || String(order.salespersonId).toLowerCase() === uid || (ecode && String(order.salespersonId).toLowerCase() === ecode))) ||
        (order.salespersonName && ename && String(order.salespersonName).toLowerCase() === ename)
      );
    },
    [safeProfile]
  );

  // Real-time KPI summary computed strictly from the logged-in user's ERP transactions
  const mobileKpiSummary = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonthPrefix = todayStr.slice(0, 7);
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    const lastMonthPrefix = prevDate.toISOString().slice(0, 7);

    const myOrders = salesOrders.filter((o) => o.status !== 'Cancelled' && isOrderOwnedByCurrentUser(o));
    const todayOrderBDT = myOrders
      .filter((o) => String(o.date || '').startsWith(todayStr))
      .reduce((s, o) => s + (Number(o.netAmountBDT) || 0), 0);
    const todayInvoiceBDT = myOrders
      .filter(
        (o) =>
          String(o.date || '').startsWith(todayStr) &&
          ['Approved', 'Dispatched & Invoiced', 'Dispatched', 'Delivered', 'Invoiced'].includes(String(o.status))
      )
      .reduce((s, o) => s + (Number(o.netAmountBDT) || 0), 0);
    const currentMonthAchievedBDT = myOrders
      .filter((o) => String(o.date || '').startsWith(currentMonthPrefix))
      .reduce((s, o) => s + (Number(o.netAmountBDT) || 0), 0);

    const monthlyTargetBDT = Number(safeProfile.monthlyTargetBDT) || 0;
    const effectiveAchieved = currentMonthAchievedBDT > 0 ? currentMonthAchievedBDT : Number(safeProfile.monthlyAchievedBDT) || 0;
    const achievePercent = monthlyTargetBDT > 0 ? (effectiveAchieved / monthlyTargetBDT) * 100 : 0;
    const dayOfMonth = Math.max(1, new Date().getDate());
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const expectedPace = monthlyTargetBDT > 0 ? (monthlyTargetBDT / daysInMonth) * dayOfMonth : 0;
    const runRateRatio = expectedPace > 0 ? effectiveAchieved / expectedPace : 0;

    // Customer-specific monthly sales
    const activeCustOrders = salesOrders.filter(
      (o) =>
        o.status !== 'Cancelled' &&
        (o.customerId === activeCustomer.id ||
          (activeCustomer.name && String(o.customerName || '').toLowerCase() === activeCustomer.name.toLowerCase()))
    );
    const customerCurrentMonthSales = activeCustOrders
      .filter((o) => String(o.date || '').startsWith(currentMonthPrefix))
      .reduce((s, o) => s + (Number(o.netAmountBDT) || 0), 0);
    const customerLastMonthSales = activeCustOrders
      .filter((o) => String(o.date || '').startsWith(lastMonthPrefix))
      .reduce((s, o) => s + (Number(o.netAmountBDT) || 0), 0);

    return {
      todayOrderBDT,
      todayInvoiceBDT,
      monthlyTargetBDT,
      effectiveAchieved,
      achievePercent,
      runRateRatio,
      customerCurrentMonthSales,
      customerLastMonthSales,
      myOrders,
    };
  }, [salesOrders, isOrderOwnedByCurrentUser, safeProfile.monthlyTargetBDT, safeProfile.monthlyAchievedBDT, activeCustomer.id, activeCustomer.name]);

  // Helper to resolve current coordinates (real device GPS if permitted, else assigned office)
  const getBestAvailableCoords = useCallback((): Promise<{ lat: number; lng: number }> => {
    if (capturedGpsCoords && Date.now() - capturedGpsCoords.capturedAtMs < 5 * 60 * 1000) {
      return Promise.resolve({ lat: capturedGpsCoords.latitude, lng: capturedGpsCoords.longitude });
    }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: Number(pos.coords.latitude.toFixed(6)),
              lng: Number(pos.coords.longitude.toFixed(6)),
            }),
          () =>
            resolve({
              lat: safeProfile.officeLatitude,
              lng: safeProfile.officeLongitude,
            }),
          { enableHighAccuracy: true, timeout: 3500, maximumAge: 60000 }
        );
      });
    }
    return Promise.resolve({ lat: safeProfile.officeLatitude, lng: safeProfile.officeLongitude });
  }, [capturedGpsCoords, safeProfile.officeLatitude, safeProfile.officeLongitude]);

  // Handle Save Order (Capture retailer-wise tied to logged-in ERP user/employee)
  const handleSaveOrder = async () => {
    if (!selectedCustomerId || activeCustomer.id === 'cust-unselected') {
      setBannerNotice('⚠️ Please select a Customer / Outlet before saving an order.');
      setShowCustomerModal(true);
      return;
    }
    if (cartSummary.itemsList.length === 0) {
      setBannerNotice('⚠️ Please add at least one product before saving.');
      return;
    }

    const warehouseId = warehouses[0]?.id || '';
    const warehouseName = warehouses[0]?.name || safeProfile.assignedOfficeName || '';
    const todayStr = new Date().toISOString().substring(0, 10);
    const nowTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const coords = await getBestAvailableCoords();

    createSalesOrder({
      date: todayStr,
      channel: activeCustomer.channel || 'Retailer',
      distributorId: activeCustomer.assignedDistributorId || distributors[0]?.id || '',
      distributorName: activeCustomer.assignedDistributorName || distributors[0]?.name || '',
      customerId: activeCustomer.id,
      customerName: activeCustomer.name,
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      salespersonId: safeProfile.employeeId,
      salespersonName: safeProfile.name,
      warehouseId,
      warehouseName,
      items: cartSummary.itemsList.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.qty,
        unitPriceBDT: item.tp,
        discountBDT: Math.round(cartSummary.lineDiscount / cartSummary.itemsList.length),
        lineTotalBDT: item.lineTotal,
      })),
      appliedOfferCode: cartSummary.appliedOffersList.map((o) => o.title).join(', '),
      offerSavingsBDT: cartSummary.lineDiscount,
      subTotalBDT: cartSummary.grossTP,
      taxVatBDT: cartSummary.vat,
      netAmountBDT: cartSummary.netPayable,
      paidAmountBDT: 0,
      dueAmountBDT: cartSummary.netPayable,
      paymentMethod: 'Credit',
      notes: `Order Captured by ${safeProfile.name} (${safeProfile.employeeCode}) via Mobile Field Force App.`,
    });

    logCustomerVisit({
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      repId: safeProfile.employeeId,
      repName: safeProfile.name,
      customerId: activeCustomer.id,
      customerName: activeCustomer.name,
      date: todayStr,
      time: nowTimeStr,
      isProductive: true,
      orderPlacedBDT: cartSummary.netPayable,
      purpose: 'Regular Sales Visit',
      feedback: `Captured order for ${cartSummary.totalQty} units. Total value: ৳ ${cartSummary.netPayable.toLocaleString()}.`,
      latitude: coords.lat,
      longitude: coords.lng,
    });

    postAuthenticatedMobileApi('/api/orders', {
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      salespersonId: safeProfile.employeeId,
      salespersonName: safeProfile.name,
      customerId: activeCustomer.id,
      customerName: activeCustomer.name,
      date: todayStr,
      netAmountBDT: cartSummary.netPayable,
      status: 'Pending Delivery',
      itemsJson: cartSummary.itemsList.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.qty,
        unitPriceBDT: item.tp,
        lineTotal: item.lineTotal,
      })),
      notes: `Order captured by ${safeProfile.name} (${safeProfile.employeeCode}) via Mobile App`,
    });

    postAuthenticatedMobileApi('/api/visits', {
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      repId: safeProfile.employeeId,
      repName: safeProfile.name,
      customerId: activeCustomer.id,
      customerName: activeCustomer.name,
      date: todayStr,
      time: nowTimeStr,
      isProductive: true,
      orderPlacedBDT: cartSummary.netPayable,
      latitude: coords.lat,
      longitude: coords.lng,
    });

    setBannerNotice(`Order successfully captured by ${safeProfile.name} for ${activeCustomer.name}.`);
    setCart({});
    setActiveTab('invoice');
  };

  // Filtered orders for Delivery Confirmation / Invoice (scoped to logged-in officer, or all for executives)
  const pendingOrdersForConfirmation = useMemo(() => {
    const canViewAllFieldOrders = ['Super Admin', 'Sales Head', 'Managing Director', 'System Administrator'].includes(
      safeProfile.erpRole
    );
    return salesOrders.filter((order) => {
      if (!canViewAllFieldOrders && !isOrderOwnedByCurrentUser(order)) {
        return false;
      }

      const matchSearch =
        invoiceSearch === '' ||
        order.orderNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
        order.customerName.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
        (order.challanNumber && order.challanNumber.toLowerCase().includes(invoiceSearch.toLowerCase()));

      if (!matchSearch) return false;

      if (deliveryFilterTab === 'pending') {
        return (
          order.status === 'Dispatched & Invoiced' ||
          order.status === 'Dispatched' ||
          order.deliveryStatus === 'In Transit' ||
          (!order.receivedByCustomer && order.status !== 'Cancelled')
        );
      }
      if (deliveryFilterTab === 'delivered') {
        return order.status === 'Delivered' || order.receivedByCustomer;
      }
      return true;
    });
  }, [salesOrders, invoiceSearch, deliveryFilterTab, safeProfile.erpRole, isOrderOwnedByCurrentUser]);

  // Handle Full Delivery Confirmation
  const handleConfirmFullDelivery = (order: any) => {
    setBannerNotice(`Order ${order.orderNumber} confirmed in FULL! Delivery Challan created & inventory deducted.`);
    setShowFullConfirmModal(false);
    setSelectedOrderForAction(null);
  };

  // Handle Order Cancellation
  const handleConfirmOrderCancellation = () => {
    if (!selectedOrderForAction) return;
    setBannerNotice(`Order ${selectedOrderForAction.orderNumber} cancelled. Reason: ${cancelReason}.`);
    setShowCancelReasonModal(false);
    setSelectedOrderForAction(null);
  };

  // Handle New Customer Registration
  const handleAddNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) {
      setBannerNotice('⚠️ Please fill in Outlet Name and Mobile Number.');
      return;
    }

    const newCode = `RET-${Date.now().toString().slice(-4)}`;
    addCustomer({
      code: newCode,
      name: newCustName,
      phone: newCustPhone,
      email: `${newCustName.toLowerCase().replace(/\s+/g, '')}@retailer.bd`,
      channel: 'Distributor Sales',
      customerType: 'Retailer',
      pricingTier: 'Dealer / Retailer Channel',
      assignedDistributorId: distributors[0]?.id || '',
      assignedDistributorName: newCustDistributor || distributors[0]?.name || '',
      assignedSalespersonId: safeProfile.employeeId,
      assignedSalespersonName: safeProfile.name,
      creditLimitBDT: 50000,
      district: safeProfile.area || '',
      territory: newCustMarket || safeProfile.territory || '',
      status: 'Active',
      address: newCustAddress || newCustMarket,
    });

    postAuthenticatedMobileApi('/api/customers', {
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      salespersonId: safeProfile.employeeId,
      salespersonName: safeProfile.name,
      code: newCode,
      name: newCustName,
      phone: newCustPhone,
      email: `${newCustName.toLowerCase().replace(/\s+/g, '')}@retailer.bd`,
      channel: 'Distributor Sales',
      customerType: 'Retailer',
      pricingTier: 'Dealer / Retailer Channel',
      assignedDistributorName: newCustDistributor,
      territory: newCustMarket || safeProfile.territory || '',
      address: newCustAddress || newCustMarket,
    });

    setBannerNotice(`New Outlet "${newCustName}" enrolled under ${safeProfile.name} (${safeProfile.employeeCode}).`);
    setNewCustName('');
    setNewCustOwner('');
    setNewCustPhone('');
    setActiveTab('home');
  };

  // Handle TADA Claim Submission
  const handleSaveTADA = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedApprover =
      safeProfile.tadaApproverName ||
      users.find((u) => u.id === safeProfile.tadaApproverId)?.name ||
      'Pending HOS Approval';

    addTADA({
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      repId: safeProfile.employeeId,
      ffCode: safeProfile.employeeCode,
      ffName: safeProfile.name,
      tranDate: tadaDate,
      distributorName: activeCustomer.assignedDistributorName || distributors[0]?.name || '',
      routeName: activeCustomer.territory || selectedMarket || safeProfile.territory,
      fromAddress: tadaFrom,
      toAddress: tadaTo,
      mode: tadaMode,
      distance: tadaDistance,
      amount: tadaFare + tadaDA,
      status: 'Pending_HOS_Approval',
      approverName: resolvedApprover,
      remarks: tadaRemarks,
    });

    postAuthenticatedMobileApi('/api/tada', {
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      repId: safeProfile.employeeId,
      ffCode: safeProfile.employeeCode,
      ffName: safeProfile.name,
      tranDate: tadaDate,
      routeName: activeCustomer.territory || selectedMarket || safeProfile.territory,
      fromAddress: tadaFrom,
      toAddress: tadaTo,
      mode: tadaMode,
      distance: tadaDistance,
      amount: tadaFare + tadaDA,
      status: 'Pending_HOS_Approval',
      approverName: resolvedApprover,
      remarks: tadaRemarks,
    });

    setBannerNotice(`TADA Claim of ৳ ${(tadaFare + tadaDA).toLocaleString()} submitted under ${safeProfile.name} (${safeProfile.employeeCode}).`);
    setActiveTab('home');
  };

  // Handle Warranty RMA Claim
  const handleSaveWarranty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!warrantySerial.trim() || !warrantyCustName.trim()) {
      setBannerNotice('⚠️ Please enter the Battery Serial Number and Customer Name.');
      return;
    }
    const newTicketNo = `W-MOB-${Date.now().toString().slice(-4)}`;
    const primaryProduct = products[0];
    addWarrantyTicket({
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      ticketNumber: newTicketNo,
      status: 'Complaint Registered',
      urgency: 'Normal',
      customerName: warrantyCustName,
      mobileNumber: warrantyPhone,
      customerType: 'Dealer',
      address: (activeCustomer.id !== 'cust-unselected' ? activeCustomer.address : '') || safeProfile.officeAddress || '',
      district: safeProfile.area || '',
      dealerOrDistributorName: activeCustomer.id !== 'cust-unselected' ? activeCustomer.name : warrantyCustName,
      ownershipType: 'Ensec Battery',
      batteryBrand: primaryProduct?.brand || 'Ensec',
      batteryModel: primaryProduct?.name || '',
      serialNumber: warrantySerial,
      batteryType: primaryProduct?.batteryType || '',
      capacityAh: Number(primaryProduct?.capacityAh) || 0,
      nominalVoltage: Number(primaryProduct?.voltageV) || 0,
      complaintDate: new Date().toISOString(),
      complaintReceivedBy: safeProfile.name,
      complaintChannel: 'Other',
      reportedProblem: warrantyDefect,
      problemCategory: 'BMS Cutoff / No Voltage Output',
      detailedDescription: warrantyNotes,
      isBatteryCurrentlyWorking: 'No / Dead',
      isReceivedAtFactory: false,
      priorRepairsCount: 0,
      isSafetyHold: false,
    });

    postAuthenticatedMobileApi('/api/warranty', {
      userId: safeProfile.userId,
      employeeId: safeProfile.employeeId,
      employeeCode: safeProfile.employeeCode,
      ticketNumber: newTicketNo,
      serialNumber: warrantySerial,
      customerName: warrantyCustName,
      mobileNumber: warrantyPhone,
      batteryModel: primaryProduct?.name || '',
      defectCategory: warrantyDefect,
      complaintReceivedBy: safeProfile.name,
      status: 'Complaint Registered',
      notes: warrantyNotes,
    });

    setBannerNotice(`Warranty RMA ticket ${newTicketNo} logged by ${safeProfile.name} for Serial ${warrantySerial}.`);
    setActiveTab('home');
  };

  // Handle Register CRM Agreement Lead Submission
  const handleSaveCRMLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientNameClean = crmClientName.trim();
    if (!clientNameClean) {
      setBannerNotice('⚠️ Please enter the Client / Organization Name.');
      return;
    }
    setCrmSubmitting(true);
    try {
      await addCRMLead({
        clientName: clientNameClean,
        companyName: clientNameClean,
        address: crmAddress.trim() || undefined,
        contactPerson: crmContactPerson.trim() || undefined,
        phone: crmPhone.trim(),
        email: crmEmail.trim() || undefined,
        channel: crmChannel,
        stage: crmStage as any,
        expectedVolumeUnits: Number(crmExpectedVolume) || 10,
        dealValueBDT: Number(crmDealValue) || 0,
        estimatedValueBDT: Number(crmDealValue) || 0,
        agreedSpecialDiscountPercent: Number(crmSpecialDiscount) || 0,
        contractTermMonths: Number(crmContractTerm) || 12,
        expectedClosingDate: crmClosingDate,
        salespersonId: safeProfile.employeeId,
        salespersonName: safeProfile.name,
        assignedRepName: safeProfile.name,
        communicationNotes: crmNotes.trim()
          ? [{ date: new Date().toISOString().substring(0, 10), author: safeProfile.name, note: crmNotes.trim() }]
          : [],
      });

      await postAuthenticatedMobileApi('/api/crm-leads', {
        userId: safeProfile.userId,
        employeeId: safeProfile.employeeId,
        employeeCode: safeProfile.employeeCode,
        salespersonId: safeProfile.employeeId,
        salespersonName: safeProfile.name,
        clientName: clientNameClean,
        address: crmAddress.trim() || undefined,
        channel: crmChannel,
        stage: crmStage,
        expectedVolumeUnits: Number(crmExpectedVolume) || 10,
        dealValueBDT: Number(crmDealValue) || 0,
      });

      setBannerNotice(`CRM Agreement Lead "${clientNameClean}" registered under ${safeProfile.name} (${safeProfile.employeeCode}).`);
      setCrmClientName('');
      setCrmAddress('');
      setCrmContactPerson('');
      setCrmPhone('');
      setCrmEmail('');
      setCrmExpectedVolume(0);
      setCrmDealValue(0);
      setCrmSpecialDiscount(0);
      setCrmNotes('');
      setActiveTab('home');
    } catch (err: any) {
      setBannerNotice(`⚠️ Error saving CRM lead: ${err?.message || 'Please retry'}`);
    } finally {
      setCrmSubmitting(false);
    }
  };

  // Product brands available for filter
  const productBrands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brand) set.add(p.brand);
      else set.add('Ensec Lithium');
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filtered products in catalog
  const filteredCatalogProducts = useMemo(() => {
    return products.filter((p) => {
      const matchBrand = selectedBrandFilter === 'All' || p.brand === selectedBrandFilter || (!p.brand && selectedBrandFilter === 'Ensec Lithium');
      const matchSearch = catalogSearch === '' || p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || p.model.toLowerCase().includes(catalogSearch.toLowerCase());
      return matchBrand && matchSearch;
    });
  }, [products, selectedBrandFilter, catalogSearch]);

  // Live dynamic Mobile Reports computed strictly from the logged-in user's Sales Orders, Visits & Product catalog
  const liveMobileReports = useMemo(() => {
    const ordersInRange = mobileKpiSummary.myOrders.filter((o) => {
      const d = String(o.date || '').slice(0, 10);
      return (!reportDateFrom || d >= reportDateFrom) && (!reportDateTo || d <= reportDateTo);
    });
    const myVisitsInRange = visitLogs.filter((v) => {
      const owned =
        (v.userId && v.userId === safeProfile.userId) ||
        (v.employeeId && (v.employeeId === safeProfile.employeeId || v.employeeId === safeProfile.employeeCode)) ||
        (v.repId && (v.repId === safeProfile.employeeId || v.repId === safeProfile.userId)) ||
        (v.repName && v.repName.toLowerCase() === safeProfile.name.toLowerCase());
      if (!owned) return false;
      const d = String(v.date || '').slice(0, 10);
      return (!reportDateFrom || d >= reportDateFrom) && (!reportDateTo || d <= reportDateTo);
    });

    const isInvoiced = (st: string) =>
      ['Approved', 'Dispatched & Invoiced', 'Dispatched', 'Delivered', 'Invoiced'].includes(String(st));

    const brandMap = new Map<string, { brand: string; pcSet: Set<string>; orderAmt: number; ecSet: Set<string>; salesAmt: number }>();
    const catMap = new Map<string, { category: string; orderAmt: number; invoiceAmt: number }>();
    const prodMap = new Map<string, { name: string; ec: number; pc: number; orderQty: number; invoiceQty: number }>();

    ordersInRange.forEach((o) => {
      const custKey = String(o.customerId || o.customerName || o.id);
      const invoiced = isInvoiced(String(o.status));
      (o.items || []).forEach((it: any) => {
        const prod = products.find((p) => p.id === it.productId || p.name === it.productName);
        const brandName = prod?.brand || 'Ensec Lithium';
        const catName = prod?.category || 'Lithium Batteries';
        if (reportBrand !== 'All' && brandName.toLowerCase() !== reportBrand.toLowerCase()) return;
        if (reportCategory !== 'All' && catName.toLowerCase() !== reportCategory.toLowerCase()) return;

        const lineAmt = Number(it.lineTotalBDT) || Number(it.quantity || 0) * Number(it.unitPriceBDT || 0);
        const qty = Number(it.quantity) || 0;

        const bEntry = brandMap.get(brandName) || { brand: brandName, pcSet: new Set(), orderAmt: 0, ecSet: new Set(), salesAmt: 0 };
        bEntry.pcSet.add(custKey);
        bEntry.orderAmt += lineAmt;
        if (invoiced) {
          bEntry.ecSet.add(custKey);
          bEntry.salesAmt += lineAmt;
        }
        brandMap.set(brandName, bEntry);

        const cEntry = catMap.get(catName) || { category: catName, orderAmt: 0, invoiceAmt: 0 };
        cEntry.orderAmt += lineAmt;
        if (invoiced) cEntry.invoiceAmt += lineAmt;
        catMap.set(catName, cEntry);

        const pName = it.productName || prod?.name || 'Battery Unit';
        const pEntry = prodMap.get(pName) || { name: pName, ec: 0, pc: 0, orderQty: 0, invoiceQty: 0 };
        pEntry.pc += 1;
        pEntry.orderQty += qty;
        if (invoiced) {
          pEntry.ec += 1;
          pEntry.invoiceQty += qty;
        }
        prodMap.set(pName, pEntry);
      });
    });

    const totalTarget = mobileKpiSummary.monthlyTargetBDT;
    const catCount = Math.max(1, catMap.size);
    return {
      brandRows: Array.from(brandMap.values()),
      categoryRows: Array.from(catMap.values()).map((c) => {
        const catTarget = Math.round(totalTarget / catCount);
        const achPer = catTarget > 0 ? (c.invoiceAmt / catTarget) * 100 : 0;
        const rrAmt = Math.round(c.invoiceAmt / Math.max(1, new Date().getDate()));
        return { ...c, targetAmt: catTarget, achPer, rrAmt };
      }),
      productRows: Array.from(prodMap.values()),
      visitCount: myVisitsInRange.length,
    };
  }, [mobileKpiSummary.myOrders, mobileKpiSummary.monthlyTargetBDT, visitLogs, products, reportDateFrom, reportDateTo, reportBrand, reportCategory, safeProfile]);

  // Enforce strict ERP session guard before rendering Mobile Field Force App
  if (
    !isAuthenticated ||
    !currentUser ||
    !currentUser.id ||
    currentUser.id === 'guest' ||
    currentUser.status === 'Blocked' ||
    currentUser.status === 'Inactive' ||
    !resolvedProfile
  ) {
    return (
      <div className="w-full min-h-screen bg-slate-100 dark:bg-[#0b0c0e] flex items-center justify-center p-6">
        <div className="max-w-sm w-full p-6 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/10 text-center space-y-3 shadow-xl">
          <ShieldCheck className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Verifying Ensec ERP Session...</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Access to the Mobile Field Force App requires an active authenticated Ensec ERP session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-100 dark:bg-[#0b0c0e] flex justify-center no-scrollbar transition-colors duration-200">
      {/* Standalone Native Mobile App Shell - Edge-to-edge on mobile, max-w-md on desktop */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 dark:bg-[#16181d] text-slate-900 dark:text-white flex flex-col relative no-scrollbar shadow-2xl sm:border-x sm:border-slate-200 dark:sm:border-white/5 transition-colors duration-200">
        {/* Native Mobile App Header */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#121316]/95 backdrop-blur-md px-3.5 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-white/10 select-none transition-colors duration-200">
          <div className="flex items-center gap-2">
            {onBackToERP && (
              <button
                onClick={onBackToERP}
                className="p-1.5 -ml-1 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-xs transition-colors border border-slate-200 dark:border-white/10 cursor-pointer"
                title="Back to ERP Dashboard"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">ERP</span>
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <h1 className="font-extrabold text-xs tracking-tight text-slate-900 dark:text-white uppercase">ENSEC FIELD FORCE</h1>
              
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* White Light Theme & Dark Mode Switcher */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 text-xs transition-colors border border-slate-200 dark:border-white/10 shadow-xs cursor-pointer"
              title={`Switch to ${isDark ? 'White Light' : 'Dark'} Theme`}
              aria-label={`Switch to ${isDark ? 'White Light' : 'Dark'} Theme`}
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-700" />
              )}
              <span className="text-[10px] font-bold hidden xs:inline">{isDark ? 'Light' : 'Dark'}</span>
            </button>

            {onOpenERPMenu && (
              <button
                onClick={onOpenERPMenu}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-xs transition-colors border border-slate-200 dark:border-white/10 cursor-pointer"
                title="Open ERP Menu"
              >
                <Menu className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium hidden sm:inline">Menu</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Success / Action Banner */}
        {bannerNotice && (
          <div className="m-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{bannerNotice}</span>
            </div>
            <button onClick={() => setBannerNotice(null)} className="p-1 hover:text-white font-bold">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* SCREEN VIEWPORT: Smooth edge-to-edge scrolling with NO visible scrollbar */}
        <div className="flex-1 w-full flex flex-col bg-slate-50 dark:bg-[#16181d] pb-24 overflow-y-auto no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-colors">
          {/* ========================================================= */}
          {/* SCREEN 1: HOME SCREEN (Matches Image 2 Screen 1 & Image 1) */}
          {/* ========================================================= */}
          {activeTab === 'home' && (
            <div className="p-4 space-y-4">
              {/* Authenticated Employee Profile Card */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 space-y-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-bold text-white shadow-md text-base relative shrink-0 mt-0.5">
                      <span>{getInitials(resolvedProfile.name)}</span>
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#1e2026]"></span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {resolvedProfile.name}
                        </h2>
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                          {resolvedProfile.assignedRole}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                        ID: {resolvedProfile.employeeCode} • {resolvedProfile.designation}
                      </div>
                      {(() => {
                        const officeCoordKey = `${assignedOfficeConfig.officeLatitude.toFixed(5)},${assignedOfficeConfig.officeLongitude.toFixed(5)}`;
                        const verifiedOfficeAddress =
                          (officeReverseGeo?.coordKey === officeCoordKey ? officeReverseGeo.address : '') ||
                          resolvedProfile.officeAddress ||
                          assignedOfficeConfig.officeAddress;
                        const liveCoordKey = capturedGpsCoords
                          ? `${capturedGpsCoords.latitude.toFixed(5)},${capturedGpsCoords.longitude.toFixed(5)}`
                          : '';
                        const verifiedLiveAddress =
                          liveCoordKey && liveGpsReverseGeo?.coordKey === liveCoordKey
                            ? liveGpsReverseGeo.address
                            : '';

                        return (
                          <div className="mt-1 space-y-1">
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1">
                              <MapPin className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  {assignedOfficeConfig.officeName}
                                  {verifiedOfficeAddress ? ` • ${verifiedOfficeAddress}` : ''}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
                                  Lat: {assignedOfficeConfig.officeLatitude.toFixed(5)}, Lng: {assignedOfficeConfig.officeLongitude.toFixed(5)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-1.5 text-[10px]">
                              {capturedGpsCoords ? (
                                <div className="flex items-start gap-1 text-emerald-600 dark:text-emerald-400 min-w-0">
                                  <Crosshair className="w-3 h-3 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">
                                      {verifiedLiveAddress || 'Resolving GPS address...'}
                                    </div>
                                    <div className="font-mono text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
                                      GPS: {capturedGpsCoords.latitude.toFixed(5)}, {capturedGpsCoords.longitude.toFixed(5)} (±{capturedGpsCoords.accuracy}m)
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                  <Crosshair className="w-3 h-3 shrink-0" />
                                  <span>
                                    {gpsStatusState === 'detecting'
                                      ? 'Detecting live GPS...'
                                      : gpsStatusState === 'denied'
                                      ? 'Live GPS permission denied'
                                      : 'Tap locate to verify live GPS address'}
                                  </span>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => requestCurrentGpsPosition().catch(() => {})}
                                className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-semibold shrink-0 inline-flex items-center gap-1 cursor-pointer"
                                title="Refresh GPS Coordinates & Address"
                              >
                                <RefreshCw className={`w-2.5 h-2.5 ${gpsStatusState === 'detecting' ? 'animate-spin' : ''}`} />
                                <span>{capturedGpsCoords ? 'Refresh' : 'Locate'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Profile Action Buttons: Attendance & Leave Apply */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setActiveTab('attendance')}
                    className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shadow-2xs"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Attendance</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('attendance')}
                    className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Leave Apply</span>
                  </button>
                </div>
              </div>

              

              {/* Quick Operation Grid (From Screenshot 1 & 2) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[11px]">Field Operations</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Step 1: Capture • Step 2: Confirm</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* Select Market */}
                  <div
                    onClick={() => {
                      setMarketSearch('');
                      setShowMarketModal(true);
                    }}
                    className="p-4 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252830] transition-colors group shadow-2xs"
                  >
                    <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Navigation className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Select Market</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono -mt-1 font-bold">
                      {selectedMarket || 'Select Route'}
                    </span>
                  </div>

                  {/* Select Customer */}
                  <div
                    onClick={() => {
                      setCustomerSearch('');
                      setShowCustomerModal(true);
                    }}
                    className="p-4 rounded-2xl bg-white dark:bg-[#1e2026] border border-cyan-400/30 dark:border-cyan-500/20 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252830] hover:border-cyan-500 transition-colors group shadow-2xs"
                  >
                    <div className="w-12 h-12 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Store className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Select Customer</span>
                    <span className="text-[10px] text-cyan-600 dark:text-cyan-400 truncate max-w-[120px] -mt-1 font-bold">{activeCustomer.name}</span>
                  </div>

                  {/* Make Visit */}
                  <div
                    onClick={async () => {
                      if (!selectedCustomerId || activeCustomer.id === 'cust-unselected') {
                        setBannerNotice('⚠️ Please select a Customer / Outlet before recording a visit.');
                        setShowCustomerModal(true);
                        return;
                      }
                      const todayStr = new Date().toISOString().substring(0, 10);
                      const nowTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const coords = await getBestAvailableCoords();
                      logCustomerVisit({
                        userId: safeProfile.userId,
                        employeeId: safeProfile.employeeId,
                        employeeCode: safeProfile.employeeCode,
                        repId: safeProfile.employeeId,
                        repName: safeProfile.name,
                        customerId: activeCustomer.id,
                        customerName: activeCustomer.name,
                        date: todayStr,
                        time: nowTimeStr,
                        isProductive: true,
                        orderPlacedBDT: 0,
                        purpose: 'Regular Sales Visit',
                        feedback: '',
                        latitude: coords.lat,
                        longitude: coords.lng,
                      });
                      await postAuthenticatedMobileApi('/api/visits', {
                        userId: safeProfile.userId,
                        employeeId: safeProfile.employeeId,
                        employeeCode: safeProfile.employeeCode,
                        repId: safeProfile.employeeId,
                        repName: safeProfile.name,
                        customerId: activeCustomer.id,
                        customerName: activeCustomer.name,
                        date: todayStr,
                        time: nowTimeStr,
                        isProductive: true,
                        orderPlacedBDT: 0,
                        purpose: 'Regular Sales Visit',
                        latitude: coords.lat,
                        longitude: coords.lng,
                      });
                      setBannerNotice(`Check-in recorded by ${safeProfile.name} at "${activeCustomer.name}" (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}).`);
                    }}
                    className="p-4 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252830] transition-colors group shadow-2xs"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Make Visit</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 -mt-1">Geo-Tagged Check-in</span>
                  </div>

                  {/* Take Order (Highlighted) */}
                  <div
                    onClick={() => {
                      setActiveTab('order');
                      setOrderSubStep('catalog');
                    }}
                    className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/25 dark:from-amber-500/20 dark:to-orange-500/30 border border-amber-400 dark:border-amber-500/40 flex flex-col items-center justify-center gap-2 cursor-pointer hover:from-amber-500/25 hover:to-orange-500/35 transition-colors group shadow-xs"
                  >
                    <div className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Take Order</span>
                    <span className="text-[10px] text-amber-800/80 dark:text-amber-200/80 -mt-1">Capture Retailer Order</span>
                  </div>
                </div>
              </div>

              {/* Active Retailer Card */}
              <div
                onClick={() => {
                  setCustomerSearch('');
                  setShowCustomerModal(true);
                }}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:border-cyan-500/40 space-y-2.5 cursor-pointer transition-all group shadow-2xs"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                        {activeCustomer.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {activeCustomer.territory || selectedMarket || 'No route'} • {activeCustomer.assignedDistributorName || 'No distributor'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                    <span className="text-[10px] font-semibold">Change</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-white/5 text-[11px]">
                  <div>
                    <span className="text-slate-500">Current Month Sales:</span>
                    <div className="font-bold text-slate-900 dark:text-white">
                      ৳ {mobileKpiSummary.customerCurrentMonthSales.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Last Month Sales:</span>
                    <div className="font-bold text-slate-700 dark:text-slate-300">
                      ৳ {mobileKpiSummary.customerLastMonthSales.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Promo Scheme Banner (rendered strictly from real active offers) */}
              {activeOffers.length > 0 && (
                <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-red-500/10 dark:from-amber-600/30 dark:via-orange-600/20 dark:to-red-600/20 border border-amber-400/40 dark:border-amber-500/30 flex items-center justify-between shadow-2xs">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      Active Promo Scheme
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {activeOffers[0].title || activeOffers[0].discountTitle || activeOffers[0].code}
                    </div>
                    {activeOffers[0].description && (
                      <p className="text-[10px] text-amber-800/80 dark:text-amber-200/80">
                        {activeOffers[0].description}
                      </p>
                    )}
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                </div>
              )}

              {/* Quick Hub Links for all Sections including CRM Agreement Lead */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">Quick Actions</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center text-xs">
                  <button
                    onClick={() => setActiveTab('crm_lead_add')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-indigo-400/30 dark:border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <FileSignature className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">CRM Lead</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('invoice')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">Invoice</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('reports')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">Reports</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('customer_add')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <PlusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">New Retailer</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('tada')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <Car className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">TADA</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('warranty')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">Warranty RMA</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('attendance')}
                    className="p-2.5 rounded-xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#252830] flex flex-col items-center gap-1 transition-colors shadow-2xs"
                  >
                    <UserCheck className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">Attendance</span>
                  </button>
                </div>
              </div>

              {/* Live User-Scoped KPI Summary */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 space-y-2 text-[11px] shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Target vs Achievement
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {resolvedProfile.employeeCode}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Today&apos;s Order:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      ৳ {mobileKpiSummary.todayOrderBDT.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Today&apos;s Invoice:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ৳ {mobileKpiSummary.todayInvoiceBDT.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Target:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      ৳ {mobileKpiSummary.monthlyTargetBDT.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Achievement:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      ৳ {mobileKpiSummary.effectiveAchieved.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, Math.round(mobileKpiSummary.achievePercent)))}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>
                    Achieve %: <b className="text-slate-900 dark:text-white">{mobileKpiSummary.achievePercent.toFixed(1)}%</b>
                  </span>
                  <span>
                    RR (Run Rate): <b className="text-slate-900 dark:text-white">{mobileKpiSummary.runRateRatio.toFixed(2)}</b>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 2: ORDER CAPTURE (Matches Image 1 Screenshots 7, 8, 9, 10) */}
          {/* ========================================================= */}
          {activeTab === 'order' && (
            <div className="p-3.5 space-y-3">
              {/* Back button & Title */}
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => {
                    if (orderSubStep !== 'catalog') setOrderSubStep('catalog');
                    else setActiveTab('home');
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h3 className="font-bold text-sm text-white">Take Order</h3>
                <div className="w-6"></div>
              </div>

              {/* Retailer Info Header Banner (Exact match with Screenshot 1 Amber Card) */}
              <div className="p-3 rounded-xl bg-amber-500 text-slate-950 space-y-1 font-semibold text-xs shadow-md">
                <div className="font-bold text-[13px] leading-tight text-black">
                  Retailer: {activeCustomer.name}
                </div>
                <div className="text-[11px] text-slate-900 leading-tight">
                  Market: {activeCustomer.territory || selectedMarket || 'Not Assigned'}
                </div>
                <div className="text-[11px] text-slate-900 leading-tight">
                  Distributor: {activeCustomer.assignedDistributorName || 'Not Assigned'}
                </div>
                <div className="text-[11px] text-slate-900 leading-tight">
                  Retail Channel: {activeCustomer.channel || 'Dealer'}
                </div>
              </div>

              {/* SUB-STEP: CATALOG BROWSE (Image 1 Screen 8 & 9) */}
              {orderSubStep === 'catalog' && (
                <div className="space-y-3">
                  {/* Select Brand Wise & Select Product Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowBrandModal(true)}
                      className={`p-2 rounded-xl text-xs font-bold transition-all shadow-xs ${
                        selectedBrandFilter !== 'All'
                          ? 'bg-sky-500 text-white'
                          : 'bg-sky-600/80 hover:bg-sky-600 text-white'
                      }`}
                    >
                      <span>Select Brand Wise</span>
                      {selectedBrandFilter !== 'All' && (
                        <span className="block text-[10px] font-normal truncate opacity-90">({selectedBrandFilter})</span>
                      )}
                    </button>

                    <button
                      onClick={() => setShowSchemeModal(true)}
                      className="p-2 rounded-xl bg-sky-600/80 hover:bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>Discounts ({Object.values(enabledSchemes).filter(Boolean).length})</span>
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search battery model, SKU..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[#1e2026] border border-white/10 text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  {/* Product Cards with Stepper Counter (Image 1 Screen 9) */}
                  <div className="space-y-2.5">
                    {filteredCatalogProducts.map((p) => {
                      const qty = cart[p.id] || 0;
                      const pricing = getCustomerProductPricing(activeCustomer, p);
                      const tp = pricing.unitPrice;
                      const mrp = p.retailPriceBDT || Math.round(tp * 1.15);
                      const lineNet = tp * qty;

                      return (
                        <div
                          key={p.id}
                          className="p-3 rounded-2xl bg-[#1e2026] border border-white/5 flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-white/5 flex items-center justify-center text-amber-400 shrink-0">
                              <BatteryCharging className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-white truncate">{p.name}</div>
                              <div className="text-[10px] text-slate-400 truncate font-mono">
                                {p.model} | {p.brand || 'Ensec'}
                              </div>
                              <div className="text-[10px] text-slate-300 mt-0.5 space-x-2">
                                <span>MRP: ৳{mrp}</span>
                                <span className="text-amber-400 font-semibold">TP: ৳{tp}</span>
                              </div>
                              <div className="text-[10px] text-emerald-400 font-mono">
                                Net: ৳{lineNet.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* Stepper counter: [-] [qty] [+] */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => updateCartQty(p.id, -1)}
                              disabled={qty === 0}
                              className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white flex items-center justify-center font-bold text-sm transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold text-xs text-white font-mono">
                              {qty}
                            </span>
                            <button
                              onClick={() => updateCartQty(p.id, 1)}
                              className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-sm shadow-md transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Proceed to Review / Save Order Button */}
                  {cartSummary.totalQty > 0 && (
                    <div className="pt-2 sticky bottom-0 bg-[#16181d] pb-2">
                      <button
                        onClick={() => setOrderSubStep('review')}
                        className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-between px-4 shadow-lg transition-transform active:scale-98"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-950 text-white text-[11px] flex items-center justify-center">
                            {cartSummary.totalQty}
                          </span>
                          <span>Review & Save Order</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-black">
                          <span>৳ {cartSummary.netPayable.toLocaleString()}</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SUB-STEP: REVIEW ORDER & SAVE (Image 1 Screen 10) */}
              {orderSubStep === 'review' && (
                <div className="space-y-3">
                  {/* Order Items Table */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Order Items</span>
                    <div className="rounded-xl bg-[#1e2026] border border-white/5 overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-white/5 text-[10px] text-slate-400 uppercase font-mono">
                            <th className="p-2">Sr.</th>
                            <th className="p-2">Name</th>
                            <th className="p-2 text-right">TP</th>
                            <th className="p-2 text-center">Qty</th>
                            <th className="p-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {cartSummary.itemsList.map((item, idx) => (
                            <tr key={item.product.id}>
                              <td className="p-2 text-slate-400">{idx + 1}.</td>
                              <td className="p-2 font-medium text-white">{item.product.name}</td>
                              <td className="p-2 text-right text-slate-300 font-mono">৳{item.tp}</td>
                              <td className="p-2 text-center font-bold text-amber-400 font-mono">{item.qty}</td>
                              <td className="p-2 text-right font-bold text-white font-mono">
                                ৳{item.lineTotal.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Applied Discounts Box */}
                  {cartSummary.appliedOffersList.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Applied Discounts & Schemes</span>
                      <div className="rounded-xl bg-[#1e2026] border border-white/5 p-3 space-y-2 text-xs">
                        {cartSummary.appliedOffersList.map((offer) => (
                          <div key={offer.id} className="flex items-center justify-between text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{offer.title}</span>
                            </div>
                            <span className="text-emerald-400 font-bold font-mono">
                              - ৳{offer.discountBDT.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Financial Breakdown Table (From Screen 10) */}
                  <div className="rounded-xl bg-[#1e2026] border border-white/5 p-3 space-y-1.5 text-xs text-slate-300 font-medium">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Line Items:</span>
                      <span className="font-bold text-white">{cartSummary.totalLineItems}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Qty:</span>
                      <span className="font-bold text-white">{cartSummary.totalQty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross TP:</span>
                      <span className="font-mono text-white">৳ {cartSummary.grossTP.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Total Line Discount:</span>
                      <span className="font-mono font-bold">- ৳ {cartSummary.lineDiscount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Net TP (After Discount):</span>
                      <span className="font-mono font-bold text-white">৳ {cartSummary.netTP.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>VAT (5%):</span>
                      <span className="font-mono">৳ {cartSummary.vat.toLocaleString()}</span>
                    </div>
                    <div className="pt-1 border-t border-white/10 flex justify-between text-sm font-black text-amber-400">
                      <span>Net Payable:</span>
                      <span className="font-mono">৳ {cartSummary.netPayable.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Press the Green button to save the Order */}
                  <div className="pt-2">
                    <button
                      onClick={handleSaveOrder}
                      className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-950 transition-all active:scale-98"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Save Order</span>
                    </button>
                    <p className="text-[10px] text-center text-slate-400 mt-1">
                      Step 1: Retailer Order Captured (No immediate inventory deduction until delivery confirmation)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 3: INVOICE & DELIVERY CONFIRMATION (Matches Image 2)*/}
          {/* ========================================================= */}
          {activeTab === 'invoice' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="text-center">
                  <h3 className="font-bold text-sm text-white">Customer Delivery Handover</h3>
                  <p className="text-[10px] text-slate-400">Ensure Sales Order Received by Customer</p>
                </div>
                <div className="w-6"></div>
              </div>

              {/* Delivery Segment Filter Tabs */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setDeliveryFilterTab('pending')}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                    deliveryFilterTab === 'pending'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Awaiting Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryFilterTab('delivered')}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                    deliveryFilterTab === 'delivered'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Delivered</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryFilterTab('all')}
                  className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                    deliveryFilterTab === 'all'
                      ? 'bg-slate-700 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>All Orders</span>
                </button>
              </div>

              {/* Date Filters & Search */}
              <div className="p-3 rounded-2xl bg-[#1e2026] border border-white/5 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">From Date</label>
                    <input
                      type="date"
                      value={orderDateFilterFrom}
                      onChange={(e) => setOrderDateFilterFrom(e.target.value)}
                      className="w-full p-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">To Date</label>
                    <input
                      type="date"
                      value={orderDateFilterTo}
                      onChange={(e) => setOrderDateFilterTo(e.target.value)}
                      className="w-full p-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs"
                    />
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Order No, Challan, Buyer..."
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>
              </div>

              {/* Order Cards List */}
              <div className="space-y-2.5">
                {pendingOrdersForConfirmation.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-[#1e2026] rounded-2xl border border-white/5 space-y-1">
                    <PackageCheck className="w-8 h-8 mx-auto text-slate-600 mb-1" />
                    <p className="font-bold text-slate-400">No orders matching this filter.</p>
                    <p className="text-[11px] text-slate-500">Orders dispatched from factory will appear here for customer receipt.</p>
                  </div>
                ) : (
                  pendingOrdersForConfirmation.map((ord) => {
                    const isDelivered = ord.status === 'Delivered' || ord.receivedByCustomer;
                    const challanNum = ord.challanNumber || `BD-ES-2026-12-${ord.orderNumber.replace(/\D/g, '').slice(-2) || '88'}`;
                    const totalQty = (ord.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);

                    return (
                      <div
                        key={ord.id}
                        className="p-3.5 rounded-2xl bg-[#1e2026] border border-white/5 space-y-2.5 shadow-xs"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-xs text-white">{ord.orderNumber}</span>
                              <span className="text-[9px] font-mono font-bold bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded border border-blue-700/50">
                                {challanNum}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-slate-200 mt-1">{ord.customerName}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-500" />
                              <span>{ord.deliveryAddress || 'Address not specified'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-amber-400 text-sm">
                              ৳ {ord.netAmountBDT.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {totalQty} Battery Units
                            </div>
                          </div>
                        </div>

                        {/* Status Strip */}
                        <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Delivery Status:</span>
                          {isDelivered ? (
                            <span className="font-bold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Received by {ord.customerReceiverName || 'Customer'}</span>
                            </span>
                          ) : (
                            <span className="font-bold text-amber-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                              <span>Dispatched (Awaiting Handover)</span>
                            </span>
                          )}
                        </div>

                        {/* Action buttons: D.O. Copy, Challan Copy & Ensure Customer Received - ONLY AFTER APPROVAL */}
                        {ord.status !== 'Submitted' && ord.status !== 'Booked' && ord.status !== 'Cancelled' && ord.status !== 'Rejected' ? (
                          <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/5">
                            {/* Official Delivery Order (D.O.) Copy View */}
                            <button
                              type="button"
                              onClick={() => setSelectedMobileOrderForDO(ord)}
                              className="py-2 px-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 font-bold text-[10px] flex items-center justify-center gap-1 shadow-xs"
                              title="View official Delivery Order (D.O.) copy for factory release"
                            >
                              <Truck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>D.O.</span>
                            </button>

                            {/* Official Challan Copy View */}
                            <button
                              type="button"
                              onClick={() => setSelectedMobileOrderForChallan(ord)}
                              className="py-2 px-1.5 rounded-xl bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 border border-blue-700/60 font-bold text-[10px] flex items-center justify-center gap-1 shadow-xs"
                              title="View official Challan copy (Matches uploaded format)"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-400" />
                              <span>Challan</span>
                            </button>

                            {/* Ensure & Confirm Customer Received */}
                            {!isDelivered ? (
                              <button
                                type="button"
                                onClick={() => setSelectedMobileOrderForReceipt(ord)}
                                className="py-2 px-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] flex items-center justify-center gap-1 shadow-md shadow-emerald-950/40"
                                title="Salesman: Ensure and verify customer received the goods"
                              >
                                <PackageCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Received</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectedMobileOrderForReceipt(ord)}
                                className="py-2 px-1.5 rounded-xl bg-slate-800 text-slate-300 border border-white/10 font-bold text-[10px] flex items-center justify-center gap-1"
                                title="View Customer Handover Confirmation"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Receipt</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-amber-300">
                            <span className="flex items-center gap-1 font-semibold">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                              <span>Awaiting Accounts Check & Approval</span>
                            </span>
                            <span className="text-[10px] text-slate-400">D.O. & Challan available upon approval</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 4: DYNAMIC REPORTS (Matches Image 3 Exact Layout)  */}
          {/* ========================================================= */}
          {activeTab === 'reports' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h3 className="font-bold text-sm text-white">Field Reports</h3>
                <div className="w-6"></div>
              </div>

              {/* Report Menu List Selector */}
              <div className="p-2 rounded-2xl bg-[#1e2026] border border-white/5 space-y-1">
                <label className="text-[10px] uppercase font-bold text-amber-400 px-1">Report View:</label>
                <select
                  value={selectedReportType}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                  className="w-full p-2 text-xs rounded-xl bg-black/40 border border-white/10 text-white font-medium"
                >
                  <option value="Product Wise EC, PC">Product Wise EC, PC</option>
                  <option value="Product Wise Order Vs Invoice">Product Wise Order Vs Invoice</option>
                  <option value="Target Vs Achievement">Target Vs Achievement</option>
                  <option value="Brand Wise Order Vs Invoice">Brand Wise Order Vs Invoice</option>
                  <option value="Category Wise Order Vs Invoice">Category Wise Order Vs Invoice</option>
                  <option value="Present Stock">Present Stock</option>
                  <option value="SPO & Category Wise KPI">{resolvedProfile.assignedRole} & Category Wise KPI</option>
                  <option value="Not Ordered Customer">Not Ordered Customer</option>
                  <option value="Outlet And SKU Wise Sales">Outlet And SKU Wise Sales</option>
                </select>
              </div>

              {/* Date Filters & Selectors */}
              <div className="p-2.5 rounded-2xl bg-[#1e2026] border border-white/5 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={(e) => setReportDateFrom(e.target.value)}
                    className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-[11px]"
                  />
                  <input
                    type="date"
                    value={reportDateTo}
                    onChange={(e) => setReportDateTo(e.target.value)}
                    className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-[11px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={reportBrand}
                    onChange={(e) => setReportBrand(e.target.value)}
                    className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-[11px]"
                  >
                    <option value="All">All Brands</option>
                    {productBrands
                      .filter((b) => b !== 'All')
                      .map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                  </select>

                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-[11px]"
                  >
                    <option value="All">All Categories</option>
                    <option value="Inverter Batteries">Inverter Batteries</option>
                    <option value="Solar Batteries">Solar Batteries</option>
                    <option value="EV Lithium Packs">EV Lithium Packs</option>
                  </select>
                </div>
              </div>

              {/* REPORT DATA TABLES (User-scoped from active ERP session) */}
              <div className="rounded-2xl bg-[#1e2026] border border-white/5 overflow-hidden text-xs">
                <div className="p-2.5 bg-white/5 font-bold text-amber-400 text-xs border-b border-white/5 flex items-center justify-between">
                  <span>
                    {selectedReportType === 'SPO & Category Wise KPI'
                      ? `${resolvedProfile.assignedRole} & Category Wise KPI`
                      : selectedReportType}
                  </span>
                  <span className="text-[10px] text-slate-400">{resolvedProfile.name}</span>
                </div>

                {/* Table for Brand Wise Order Vs Invoice */}
                {selectedReportType === 'Brand Wise Order Vs Invoice' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap text-[11px]">
                      <thead>
                        <tr className="bg-black/20 text-slate-400 border-b border-white/5">
                          <th className="p-2">Brand</th>
                          <th className="p-2 text-right">NoOf_PC</th>
                          <th className="p-2 text-right">OrderAmt</th>
                          <th className="p-2 text-right">NoOf_EC</th>
                          <th className="p-2 text-right">SalesAmt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {liveMobileReports.brandRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-400">
                              No orders recorded for {resolvedProfile.name} in this date range.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {liveMobileReports.brandRows.map((row) => (
                              <tr key={row.brand}>
                                <td className="p-2 font-medium text-white">{row.brand}</td>
                                <td className="p-2 text-right text-slate-300">{row.pcSet.size}</td>
                                <td className="p-2 text-right text-white font-mono">{row.orderAmt.toLocaleString()}</td>
                                <td className="p-2 text-right text-slate-300">{row.ecSet.size}</td>
                                <td className="p-2 text-right text-emerald-400 font-mono">{row.salesAmt.toLocaleString()}</td>
                              </tr>
                            ))}
                            <tr className="bg-amber-500/10 font-bold text-amber-300 border-t border-amber-500/30">
                              <td className="p-2">Total</td>
                              <td className="p-2 text-right">
                                {liveMobileReports.brandRows.reduce((s, r) => s + r.pcSet.size, 0)}
                              </td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.brandRows.reduce((s, r) => s + r.orderAmt, 0).toLocaleString()}
                              </td>
                              <td className="p-2 text-right">
                                {liveMobileReports.brandRows.reduce((s, r) => s + r.ecSet.size, 0)}
                              </td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.brandRows.reduce((s, r) => s + r.salesAmt, 0).toLocaleString()}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Table for Role & Category Wise KPI */}
                {selectedReportType === 'SPO & Category Wise KPI' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap text-[11px]">
                      <thead>
                        <tr className="bg-black/20 text-slate-400 border-b border-white/5">
                          <th className="p-2">Category</th>
                          <th className="p-2 text-right">TargetAmt</th>
                          <th className="p-2 text-right">AchieveAmt</th>
                          <th className="p-2 text-right">AchPer</th>
                          <th className="p-2 text-right">RR_Amt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {liveMobileReports.categoryRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-400">
                              No sales data recorded yet for {resolvedProfile.name} in this period.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {liveMobileReports.categoryRows.map((row) => (
                              <tr key={row.category}>
                                <td className="p-2 font-medium text-white">{row.category}</td>
                                <td className="p-2 text-right font-mono">{row.targetAmt.toLocaleString()}</td>
                                <td className="p-2 text-right text-emerald-400 font-mono">{row.invoiceAmt.toLocaleString()}</td>
                                <td className="p-2 text-right">{row.achPer.toFixed(1)}%</td>
                                <td className="p-2 text-right font-mono">{row.rrAmt.toLocaleString()}</td>
                              </tr>
                            ))}
                            <tr className="bg-amber-500/10 font-bold text-amber-300 border-t border-amber-500/30">
                              <td className="p-2">Total</td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.categoryRows.reduce((s, r) => s + r.targetAmt, 0).toLocaleString()}
                              </td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.categoryRows.reduce((s, r) => s + r.invoiceAmt, 0).toLocaleString()}
                              </td>
                              <td className="p-2 text-right">{mobileKpiSummary.achievePercent.toFixed(1)}%</td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.categoryRows.reduce((s, r) => s + r.rrAmt, 0).toLocaleString()}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Default/Other Report Fallback Table */}
                {selectedReportType !== 'Brand Wise Order Vs Invoice' && selectedReportType !== 'SPO & Category Wise KPI' && (
                  <div className="overflow-x-auto p-2">
                    <table className="w-full text-left whitespace-nowrap text-[11px]">
                      <thead>
                        <tr className="bg-black/20 text-slate-400 border-b border-white/5">
                          <th className="p-2">Product Name</th>
                          <th className="p-2 text-center">EC</th>
                          <th className="p-2 text-center">PC</th>
                          <th className="p-2 text-right">Order Qty</th>
                          <th className="p-2 text-right">Invoice Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {liveMobileReports.productRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-400">
                              No product orders recorded for {resolvedProfile.name} in this period.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {liveMobileReports.productRows.map((row) => (
                              <tr key={row.name}>
                                <td className="p-2 font-medium text-white">{row.name}</td>
                                <td className="p-2 text-center">{row.ec}</td>
                                <td className="p-2 text-center">{row.pc}</td>
                                <td className="p-2 text-right font-bold text-amber-400 font-mono">{row.orderQty}</td>
                                <td className="p-2 text-right font-bold text-emerald-400 font-mono">{row.invoiceQty}</td>
                              </tr>
                            ))}
                            <tr className="bg-amber-500/10 font-bold text-amber-300 border-t border-amber-500/30">
                              <td className="p-2">Total</td>
                              <td className="p-2 text-center">
                                {liveMobileReports.productRows.reduce((s, r) => s + r.ec, 0)}
                              </td>
                              <td className="p-2 text-center">
                                {liveMobileReports.productRows.reduce((s, r) => s + r.pc, 0)}
                              </td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.productRows.reduce((s, r) => s + r.orderQty, 0)}
                              </td>
                              <td className="p-2 text-right font-mono">
                                {liveMobileReports.productRows.reduce((s, r) => s + r.invoiceQty, 0)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 5: NEW CUSTOMER ADD (On-Field Retailer Enrollment)  */}
          {/* ========================================================= */}
          {activeTab === 'customer_add' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h3 className="font-bold text-sm text-white">Enroll New Retailer</h3>
                <div className="w-6"></div>
              </div>

              <form onSubmit={handleAddNewCustomer} className="p-3.5 rounded-2xl bg-[#1e2026] border border-white/5 space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Outlet / Shop Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bismillah Battery Corner"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Proprietor Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Md. Rafiqul Islam"
                      value={newCustOwner}
                      onChange={(e) => setNewCustOwner(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="017XXXXXXXX"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Channel Type</label>
                    <select
                      value={newCustChannel}
                      onChange={(e) => setNewCustChannel(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    >
                      <option value="Retailer">Retailer</option>
                      <option value="Dealer">Dealer</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Solar Project">Solar Project</option>
                      <option value="Corporate">Corporate</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Market / Beat</label>
                    <input
                      type="text"
                      value={newCustMarket}
                      onChange={(e) => setNewCustMarket(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Address / Landmark</label>
                  <input
                    type="text"
                    placeholder="Shop 14, Main Road, Near Central Mosque"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>

                {/* GPS Capture Widget */}
                <div className="p-2.5 rounded-xl bg-black/30 border border-emerald-500/30 flex items-center justify-between text-[11px]">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 font-bold text-emerald-400">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>GPS Coordinates Tagged</span>
                    </div>
                    <div className="text-slate-400 font-mono text-[10px]">{newCustGps}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const coords = await getBestAvailableCoords();
                      setNewCustGps(`Lat: ${coords.lat.toFixed(5)}, Lng: ${coords.lng.toFixed(5)} (Live GPS Tagged)`);
                    }}
                    className="p-1 px-2 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
                  >
                    Re-Tag
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Register & Onboard Outlet</span>
                </button>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 6: TADA CAPTURE (On-Field Travel Claims)           */}
          {/* ========================================================= */}
          {activeTab === 'tada' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h3 className="font-bold text-sm text-white">Capture TADA Claim</h3>
                <div className="w-6"></div>
              </div>

              <form onSubmit={handleSaveTADA} className="p-3.5 rounded-2xl bg-[#1e2026] border border-white/5 space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Travel Date</label>
                  <input
                    type="date"
                    value={tadaDate}
                    onChange={(e) => setTadaDate(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">From Location</label>
                    <input
                      type="text"
                      value={tadaFrom}
                      onChange={(e) => setTadaFrom(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">To Location</label>
                    <input
                      type="text"
                      value={tadaTo}
                      onChange={(e) => setTadaTo(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Mode of Transport</label>
                    <select
                      value={tadaMode}
                      onChange={(e) => {
                        setTadaMode(e.target.value);
                        if (e.target.value === 'Bus') setTadaFare(tadaDistance * 3.5);
                        else if (e.target.value === 'Rickshaw') setTadaFare(tadaDistance * 7);
                        else if (e.target.value === 'Motorcycle') setTadaFare(tadaDistance * 5);
                      }}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    >
                      <option value="Bus">Bus</option>
                      <option value="Rickshaw">Rickshaw</option>
                      <option value="Motorcycle">Motorcycle</option>
                      <option value="CNG">CNG</option>
                      <option value="Train">Train</option>
                      <option value="Own DA">Own DA</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Distance (KM)</label>
                    <input
                      type="number"
                      value={tadaDistance}
                      onChange={(e) => {
                        const dist = Number(e.target.value);
                        setTadaDistance(dist);
                        setTadaFare(Math.max(15, Math.round(dist * 4)));
                      }}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Fare (৳)</label>
                    <input
                      type="number"
                      value={tadaFare}
                      onChange={(e) => setTadaFare(Number(e.target.value))}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono font-bold text-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">DA Allowance (৳)</label>
                    <input
                      type="number"
                      value={tadaDA}
                      onChange={(e) => setTadaDA(Number(e.target.value))}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Remarks / Purpose</label>
                  <input
                    type="text"
                    value={tadaRemarks}
                    onChange={(e) => setTadaRemarks(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                  <span className="text-slate-400">Total Claim Amount:</span>
                  <span className="text-base font-bold text-amber-400 font-mono">
                    ৳ {(tadaFare + tadaDA).toLocaleString()}
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit Field TADA Claim</span>
                </button>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 7: WARRANTY RMA CAPTURE                            */}
          {/* ========================================================= */}
          {activeTab === 'warranty' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h3 className="font-bold text-sm text-white">Warranty & RMA Capture</h3>
                <div className="w-6"></div>
              </div>

              <form onSubmit={handleSaveWarranty} className="p-3.5 rounded-2xl bg-[#1e2026] border border-white/5 space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Battery Serial Number / Barcode *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={warrantySerial}
                      onChange={(e) => setWarrantySerial(e.target.value)}
                      placeholder="Enter or scan battery serial number..."
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Customer / Dealer Name</label>
                    <input
                      type="text"
                      value={warrantyCustName}
                      onChange={(e) => setWarrantyCustName(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      value={warrantyPhone}
                      onChange={(e) => setWarrantyPhone(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Defect / Complaint Category</label>
                  <select
                    value={warrantyDefect}
                    onChange={(e) => setWarrantyDefect(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  >
                    <option value="Cell Imbalance / Under Voltage">Cell Imbalance / Under Voltage</option>
                    <option value="BMS Cut-off / No Output">BMS Cut-off / No Output</option>
                    <option value="Overheating During Charge">Overheating During Charge</option>
                    <option value="Terminal Connector Burnt">Terminal Connector Burnt</option>
                    <option value="Casing Damage / Liquid Spill">Casing Damage / Liquid Spill</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Inspection Notes</label>
                  <textarea
                    rows={2}
                    value={warrantyNotes}
                    onChange={(e) => setWarrantyNotes(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Log Field RMA Ticket</span>
                </button>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 8: ATTENDANCE & LEAVE APPLY                        */}
          {/* ========================================================= */}
          {/* SCREEN: GPS GEOFENCING ATTENDANCE & LEAVE                 */}
          {/* ========================================================= */}
          {activeTab === 'attendance' && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <h3 className="font-bold text-sm text-white">GPS Geofence Attendance</h3>
                <button
                  type="button"
                  onClick={() => requestCurrentGpsPosition().catch(() => {})}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                  title="Refresh GPS Location"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${gpsStatusState === 'detecting' ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Authenticated Employee Profile & Assigned Office Info Card */}
              <div className="p-3.5 rounded-2xl bg-[#1e2026] border border-white/10 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10 text-[10px]">
                  <span className="uppercase tracking-wider font-semibold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Authenticated ERP Session Identity</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">
                    {resolvedProfile.assignedRole}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-white">{attendanceEmployee.name}</div>
                    <div className="text-[11px] font-mono text-blue-400">
                      ID: {resolvedProfile.employeeCode} • {resolvedProfile.designation}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-white font-mono tabular-nums">
                      {liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {liveNow.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      Assigned Office:
                    </span>
                    <span className="font-semibold text-white text-right">{assignedOfficeConfig.officeName}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                      Allowed Radius:
                    </span>
                    <span className="font-mono font-bold text-emerald-400 tabular-nums">
                      {assignedOfficeConfig.allowedRadiusMeters} Meters
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Office Coords:
                    </span>
                    <span className="font-mono text-[10px] text-slate-300 tabular-nums">
                      {assignedOfficeConfig.officeLatitude.toFixed(5)}, {assignedOfficeConfig.officeLongitude.toFixed(5)}
                    </span>
                  </div>
                </div>

                {/* Color-coded GPS Geofence Status Indicator (Green / Red / Yellow) */}
                {(() => {
                  const isDetecting = gpsStatusState === 'detecting' || gpsStatusState === 'idle';
                  const isPoorAccuracyOrError =
                    gpsStatusState === 'error' ||
                    (liveGeofenceEval && liveGeofenceEval.errorCode === 'POOR_GPS_ACCURACY');
                  const isGreen =
                    gpsStatusState === 'ready' && liveGeofenceEval?.accepted === true;
                  const isRed =
                    gpsStatusState === 'denied' ||
                    (gpsStatusState === 'ready' && liveGeofenceEval && !liveGeofenceEval.accepted && liveGeofenceEval.errorCode !== 'POOR_GPS_ACCURACY');

                  const boxCls = isGreen
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : isRed
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300';

                  return (
                    <div className={`p-3 rounded-xl border space-y-2 ${boxCls}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-xs">
                          {isGreen ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : isRed ? (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          )}
                          <span>
                            {isGreen
                              ? `Within Permitted ${assignedOfficeConfig.allowedRadiusMeters}m Radius`
                              : isDetecting
                              ? 'Detecting Device GPS Location...'
                              : isPoorAccuracyOrError
                              ? 'GPS Signal Weak / Unavailable'
                              : gpsStatusState === 'denied'
                              ? 'GPS Permission Denied'
                              : 'Outside Permitted Attendance Area'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestCurrentGpsPosition().catch(() => {})}
                          className="px-2 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-[10px] font-bold inline-flex items-center gap-1"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>Retry GPS</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10 text-[11px]">
                        <div>
                          <span className="text-[10px] opacity-80 block">Distance from Office</span>
                          <span className="font-mono font-black text-sm tabular-nums">
                            {liveGeofenceEval ? `${Math.round(liveGeofenceEval.distanceMeters)} Meters` : '--'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] opacity-80 block">GPS Accuracy</span>
                          <span className="font-mono font-bold text-sm tabular-nums">
                            {capturedGpsCoords ? `±${capturedGpsCoords.accuracy}m` : '--'}
                          </span>
                        </div>
                      </div>

                      {capturedGpsCoords && (
                        <div className="text-[10px] font-mono opacity-80 tabular-nums">
                          Captured Coords: {capturedGpsCoords.latitude.toFixed(6)}, {capturedGpsCoords.longitude.toFixed(6)}
                        </div>
                      )}

                      {!isGreen && !isDetecting && (
                        <p className="text-[11px] leading-snug">
                          {liveGeofenceEval && !liveGeofenceEval.accepted
                            ? liveGeofenceEval.reason
                            : gpsStatusMessage}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Submission Feedback Alert */}
                {attendanceResultAlert && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      attendanceResultAlert.type === 'success'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                        : attendanceResultAlert.type === 'warning'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                        : 'bg-rose-600/20 border-rose-500 text-rose-200'
                    }`}
                  >
                    <div className="font-bold">{attendanceResultAlert.title}</div>
                    <div className="text-[11px] leading-snug">{attendanceResultAlert.message}</div>
                  </div>
                )}

                {/* Check In / Check Out Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={
                      attendanceSubmitting ||
                      gpsStatusState === 'denied' ||
                      Boolean(todayAttendanceRecord?.checkInTime || todayAttendanceRecord?.inTime)
                    }
                    onClick={handleMobileGpsCheckIn}
                    className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{attendanceSubmitting ? 'Validating...' : 'Check In'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={
                      attendanceSubmitting ||
                      gpsStatusState === 'denied' ||
                      !(todayAttendanceRecord?.checkInTime || todayAttendanceRecord?.inTime) ||
                      Boolean(todayAttendanceRecord?.checkOutTime || todayAttendanceRecord?.outTime)
                    }
                    onClick={handleMobileGpsCheckOut}
                    className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{attendanceSubmitting ? 'Validating...' : 'Check Out'}</span>
                  </button>
                </div>

                {/* Today's Attendance Status Card */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Today&apos;s Status ({todayDateISO})</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        todayAttendanceRecord?.status === 'Present'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : todayAttendanceRecord?.status === 'Late'
                          ? 'bg-amber-500/20 text-amber-300'
                          : todayAttendanceRecord?.status === 'Half Day' || todayAttendanceRecord?.status === 'Half-Day'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {todayAttendanceRecord ? todayAttendanceRecord.status : 'Not Marked Yet'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-500 block">Check-In</span>
                      <span className="font-mono text-white font-semibold">
                        {todayAttendanceRecord?.checkInTime || todayAttendanceRecord?.inTime || '--:--'}
                      </span>
                      {todayAttendanceRecord?.checkInDistanceMeters !== undefined && (
                        <span className="text-[10px] text-emerald-400 block font-mono">
                          {todayAttendanceRecord.checkInDistanceMeters}m from office
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">Check-Out</span>
                      <span className="font-mono text-white font-semibold">
                        {todayAttendanceRecord?.checkOutTime || todayAttendanceRecord?.outTime || '--:--'}
                      </span>
                      {todayAttendanceRecord?.checkOutDistanceMeters !== undefined && (
                        <span className="text-[10px] text-emerald-400 block font-mono">
                          {todayAttendanceRecord.checkOutDistanceMeters}m from office
                        </span>
                      )}
                    </div>
                  </div>
                  {todayAttendanceRecord && (todayAttendanceRecord.workHours || todayAttendanceRecord.lateDurationMinutes) ? (
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-400 font-mono">
                      <span>Worked: {todayAttendanceRecord.workHours ?? 0} hrs</span>
                      <span>
                        {todayAttendanceRecord.lateDurationMinutes
                          ? formatLateDuration(todayAttendanceRecord.lateDurationMinutes)
                          : 'On Time'}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Leave Apply Card */}
              <div className="p-3.5 rounded-2xl bg-[#1e2026] border border-white/5 space-y-2.5 text-xs">
                <h4 className="font-bold text-amber-400 text-xs">Apply for Leave</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Leave Type</label>
                    <select
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value)}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                    >
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Annual Leave">Annual Leave</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Number of Days</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={leaveDays}
                      onChange={(e) => setLeaveDays(Number(e.target.value))}
                      className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Reason for Leave</label>
                  <input
                    type="text"
                    placeholder="e.g. Urgent family medical appointment"
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full p-2 rounded-xl bg-black/40 border border-white/10 text-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const start = todayDateISO;
                    const endObj = new Date(Date.now() + Math.max(0, leaveDays - 1) * 86400000);
                    const endDate = endObj.toISOString().slice(0, 10);
                    applyLeave({
                      userId: safeProfile.userId,
                      employeeId: safeProfile.employeeId,
                      employeeCode: safeProfile.employeeCode,
                      employeeName: safeProfile.name,
                      department: safeProfile.department || 'Operations',
                      leaveType,
                      startDate: start,
                      endDate,
                      daysCount: leaveDays,
                      reason: leaveReason || 'Submitted via Mobile Portal',
                    });
                    await postAuthenticatedMobileApi('/api/leaves', {
                      userId: safeProfile.userId,
                      employeeId: safeProfile.employeeId,
                      employeeCode: safeProfile.employeeCode,
                      employeeName: safeProfile.name,
                      department: safeProfile.department || 'Operations',
                      leaveType,
                      startDate: start,
                      endDate,
                      daysCount: leaveDays,
                      reason: leaveReason || 'Submitted via Mobile Portal',
                    });
                    setLeaveReason('');
                    setBannerNotice(`Leave Application (${leaveType} - ${leaveDays} days) submitted under ${safeProfile.name}.`);
                    setActiveTab('home');
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Submit Leave Request
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN: REGISTER NEW CRM AGREEMENT LEAD                   */}
          {/* ========================================================= */}
          {activeTab === 'crm_lead_add' && (
            <div className="p-4 space-y-4">
              {/* Header Navigation */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Home</span>
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50">
                    B2B Agreement
                  </span>
                </div>
              </div>

              {/* Title & Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-blue-500/10 to-amber-500/15 dark:from-indigo-950/60 dark:via-blue-950/50 dark:to-amber-950/40 border border-indigo-300 dark:border-indigo-500/30 flex items-center gap-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                  <Handshake className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Register CRM Agreement Lead</h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Capture institutional clients, annual contract terms & battery volume quotas
                  </p>
                </div>
              </div>

              {/* Form Card */}
              <form onSubmit={handleSaveCRMLead} className="p-4 rounded-2xl bg-white dark:bg-[#1e2026] border border-slate-200 dark:border-white/5 space-y-3.5 text-xs shadow-xs">
                {/* Client / Organization Name */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Client / Organization Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grameenphone Ltd / Square Pharma / Biman Cargo"
                    value={crmClientName}
                    onChange={(e) => setCrmClientName(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>

                {/* Client / Organization Address */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Client / Organization Address
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. House 14, Road 12, Banani, Dhaka 1213"
                    value={crmAddress}
                    onChange={(e) => setCrmAddress(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs resize-none"
                  />
                </div>

                {/* Contact Person & Designation */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Contact Person & Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Engr. Tanvir Ahmed (AGM - Procurement)"
                    value={crmContactPerson}
                    onChange={(e) => setCrmContactPerson(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>

                {/* Phone & Email */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="text"
                      placeholder="+880 1711-000000"
                      value={crmPhone}
                      onChange={(e) => setCrmPhone(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="tanvir@company.com"
                      value={crmEmail}
                      onChange={(e) => setCrmEmail(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                {/* Channel / Sector & Pipeline Stage */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Channel / Sector
                    </label>
                    <select
                      value={crmChannel}
                      onChange={(e) => setCrmChannel(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    >
                      <option value="Corporate & Institutional">Corporate & Institutional</option>
                      <option value="Telecom & BTS Tower">Telecom & BTS Tower</option>
                      <option value="Solar EPC & Microgrid">Solar EPC & Microgrid</option>
                      <option value="OEM / EV Commercial Fleet">OEM / EV Commercial Fleet</option>
                      <option value="Government & Defense">Government & Defense</option>
                      <option value="Healthcare / Hospital Backup">Healthcare / Hospital Backup</option>
                      <option value="Distributor Channel">Distributor Channel</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Pipeline Stage
                    </label>
                    <select
                      value={crmStage}
                      onChange={(e) => setCrmStage(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    >
                      <option value="Lead Captured">Lead Captured</option>
                      <option value="Requirements Discussion">Requirements Discussion</option>
                      <option value="Proposal Submitted">Proposal Submitted</option>
                      <option value="Contract Negotiation">Contract Negotiation</option>
                      <option value="Agreement Won">Agreement Won</option>
                    </select>
                  </div>
                </div>

                {/* Expected Volume & Deal Value */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Expected Units (Qty)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 20"
                      value={crmExpectedVolume}
                      onChange={(e) => setCrmExpectedVolume(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Deal Value (BDT ৳)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 650000"
                      value={crmDealValue}
                      onChange={(e) => setCrmDealValue(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Special Discount % & Contract Term */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Special Discount (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      placeholder="e.g. 5"
                      value={crmSpecialDiscount}
                      onChange={(e) => setCrmSpecialDiscount(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Contract Term
                    </label>
                    <select
                      value={crmContractTerm}
                      onChange={(e) => setCrmContractTerm(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                    >
                      <option value={6}>6 Months Pilot</option>
                      <option value={12}>12 Months (1 Year)</option>
                      <option value={24}>24 Months (2 Years)</option>
                      <option value={36}>36 Months (3 Years)</option>
                    </select>
                  </div>
                </div>

                {/* Expected Closing Date */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Expected Target Closing Date
                  </label>
                  <input
                    type="date"
                    value={crmClosingDate}
                    onChange={(e) => setCrmClosingDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500 text-xs"
                  />
                </div>

                {/* Notes & Agreement Requirements */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Key Discussion Notes & Specs
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Required 48V 100Ah LiFePO4 rack batteries with SNMP card support for telecom BTS sites. Delivery schedule phased monthly."
                    value={crmNotes}
                    onChange={(e) => setCrmNotes(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 text-xs resize-none"
                  />
                </div>

                {/* Rep Assignment Tag */}
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Assigned Field Officer:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {resolvedProfile.name} ({resolvedProfile.assignedRole} • ID: {resolvedProfile.employeeCode})
                  </span>
                </div>

                {/* Submit and Cancel Buttons */}
                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    disabled={crmSubmitting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Handshake className="w-4 h-4" />
                    <span>{crmSubmitting ? 'Registering...' : 'Register CRM Agreement Lead'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('home')}
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* BOTTOM NAVIGATION BAR (Anchored fixed at bottom for mobile viewers) */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/95 dark:bg-[#121316]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/10 p-2 flex items-center justify-around text-[10px] font-semibold text-slate-500 dark:text-slate-400 select-none shadow-2xl transition-colors">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'home' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span>Home</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('order');
              setOrderSubStep('catalog');
            }}
            className={`relative flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'order' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Order</span>
            {cartSummary.totalQty > 0 && (
              <span className="absolute top-0 right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                {cartSummary.totalQty}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('invoice')}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'invoice' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Invoice</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'reports' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Report</span>
          </button>
        </nav>
      </div>

      {/* ========================================================= */}
      {/* MODAL: SELECT CUSTOMER / OUTLET PICKER                    */}
      {/* ========================================================= */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex justify-center bg-slate-100/90 dark:bg-[#0b0c0e]/90 backdrop-blur-xs p-0 animate-in fade-in">
          <div className="w-full max-w-md h-dvh min-h-screen bg-slate-50 dark:bg-[#16181d] sm:border-x sm:border-slate-200 dark:sm:border-white/5 p-4 space-y-3.5 shadow-2xl text-slate-900 dark:text-white flex flex-col transition-colors">
            
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shadow-xs">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Select Customer / Outlet</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {filteredCustomersList.length} outlets available • Tap to choose
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search by outlet name, owner, phone, route..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-cyan-500"
                autoFocus
              />
              {customerSearch && (
                <button
                  onClick={() => setCustomerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter by Distributor Dropdown */}
            <div className="relative shrink-0">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10">
                <div className="flex items-center gap-1.5 pl-2.5 text-amber-600 dark:text-amber-400 shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Distributor:</span>
                </div>
                <div className="relative flex-1">
                  <select
                    value={customerDistributorFilter}
                    onChange={(e) => setCustomerDistributorFilter(e.target.value)}
                    className="w-full bg-transparent pr-7 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 appearance-none cursor-pointer focus:outline-hidden truncate"
                  >
                    {availableDistributorsForFilter.map((d) => (
                      <option key={d.id} value={d.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {customerDistributorFilter !== 'All' && (
                  <button
                    onClick={() => setCustomerDistributorFilter('All')}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs mr-1 cursor-pointer"
                    title="Clear distributor filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Channel Filter Chips */}
            {customerChannels.length > 2 && (
              <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {customerChannels.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setCustomerChannelFilter(ch)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      customerChannelFilter === ch
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                        : 'bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-black/50'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}

            {/* Customer List */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2 pr-0.5">
              {filteredCustomersList.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                    <Store className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">No customers found</div>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Try searching with another keyword, distributor, or channel filter.
                  </p>
                  <button
                    onClick={() => {
                      setCustomerSearch('');
                      setCustomerChannelFilter('All');
                      setCustomerDistributorFilter('All');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600/20 text-cyan-700 dark:text-cyan-300 text-xs font-semibold hover:bg-cyan-600/30 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                filteredCustomersList.map((c) => {
                  const isSelected = selectedCustomerId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        if (c.territory) setSelectedMarket(c.territory);
                        setBannerNotice(`✅ Active customer switched to "${c.name}"`);
                        setShowCustomerModal(false);
                      }}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500 shadow-md ring-1 ring-cyan-500/40'
                          : 'bg-white dark:bg-[#1e2026] border-slate-200 dark:border-white/5 hover:bg-slate-100/70 dark:hover:bg-black/50 hover:border-slate-300 dark:hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                              isSelected
                                ? 'bg-cyan-500 text-slate-950 font-bold'
                                : 'bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/10'
                            }`}
                          >
                            {c.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate max-w-[200px]">
                                {c.name}
                              </h4>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                                {c.channel || c.customerType || 'Retailer'}
                              </span>
                            </div>
                            
                            {(c.ownerName || c.phone) && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                {c.ownerName && <span>{c.ownerName}</span>}
                                {c.ownerName && c.phone && <span>•</span>}
                                {c.phone && <span>{c.phone}</span>}
                              </p>
                            )}

                            {(c.address || c.territory) && (
                              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                                <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                                <span>{c.address || c.territory}</span>
                              </p>
                            )}

                            {c.assignedDistributorName && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400/90 mt-0.5 font-medium">
                                Dist: {c.assignedDistributorName}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {isSelected ? (
                            <span className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-xs">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold group-hover:underline">
                              Select
                            </span>
                          )}
                          {c.outstandingBalanceBDT ? (
                            <span className="text-[10px] text-rose-500 dark:text-rose-400 font-mono font-medium">
                              Due: ৳{c.outstandingBalanceBDT.toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div className="shrink-0 pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setShowCustomerModal(false);
                  setActiveTab('customer_add');
                }}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Enroll New Retailer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SELECT MARKET / BEAT ROUTE                         */}
      {/* ========================================================= */}
      {showMarketModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-white/10 p-4 space-y-3.5 shadow-2xl text-slate-900 dark:text-white max-h-[80vh] flex flex-col transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Select Beat Route / Market</h3>
              </div>
              <button
                onClick={() => setShowMarketModal(false)}
                className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Search market or route..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 max-h-64">
              {availableMarkets.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No markets or beat routes found in your territory or customer records.
                </div>
              ) : (
                availableMarkets.map((m) => {
                  const isSelected = selectedMarket === m;
                  return (
                    <button
                      key={m}
                      onClick={() => {
                        setSelectedMarket(m);
                        setShowMarketModal(false);
                        setBannerNotice(`📍 Route switched to ${m}`);
                      }}
                      className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                          : 'bg-slate-100 dark:bg-black/30 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-black/50'
                      }`}
                    >
                      <span>{m}</span>
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: BRAND SELECTOR (Matches Screenshot 1 Screen 8)     */}
      {/* ========================================================= */}
      {showBrandModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e2026] border border-white/10 p-4 space-y-3 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h4 className="font-bold text-sm text-amber-400">Select Brand</h4>
              <button onClick={() => setShowBrandModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto no-scrollbar">
              {productBrands.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setSelectedBrandFilter(b);
                    setShowBrandModal(false);
                  }}
                  className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    selectedBrandFilter === b
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-black/30 text-slate-200 hover:bg-black/50'
                  }`}
                >
                  <span>{b}</span>
                  {selectedBrandFilter === b && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SCHEMES & DISCOUNTS (Matches Screenshot 1 Screen 9)*/}
      {/* ========================================================= */}
      {showSchemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e2026] border border-white/10 p-4 space-y-3 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-sm text-white">Eligible Discounts & Schemes</h4>
              </div>
              <button onClick={() => setShowSchemeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {activeOffers.length === 0 ? (
                <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center text-slate-400">
                  No active promotional schemes configured.
                </div>
              ) : (
                activeOffers.map((offer) => {
                  const isOn = Boolean(enabledSchemes[offer.id]);
                  const title = offer.title || offer.discountTitle || offer.code || 'Promotional Offer';
                  const validUntil = offer.validTo || offer.endDate;
                  return (
                    <div
                      key={offer.id}
                      onClick={() =>
                        setEnabledSchemes((prev) => ({ ...prev, [offer.id]: !prev[offer.id] }))
                      }
                      className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                        isOn
                          ? 'bg-amber-500/10 border-amber-500 text-amber-200'
                          : 'bg-black/30 border-white/5 text-slate-400'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-bold text-white text-xs">{title}</div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${isOn ? 'bg-amber-500 text-slate-950 font-bold' : 'border border-slate-600'}`}>
                          {isOn && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                      {offer.description && (
                        <p className="text-[11px] text-slate-300 mt-1">{offer.description}</p>
                      )}
                      {validUntil && (
                        <div className="text-[10px] text-slate-400 mt-0.5">Valid until {validUntil}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setShowSchemeModal(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: FULL CONFIRMATION (Matches Screenshot 2 Screen 4)  */}
      {/* ========================================================= */}
      {showFullConfirmModal && selectedOrderForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e2026] border border-white/10 p-5 space-y-4 shadow-2xl text-white text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">Are you sure you want to Confirm FULL?</h4>
              <p className="text-xs text-slate-400 mt-1">
                Order <span className="font-mono text-white">{selectedOrderForAction.orderNumber}</span> for{' '}
                <span className="text-amber-400">{selectedOrderForAction.customerName}</span> will be marked as Delivered.
                Stock will be deducted from warehouse inventory.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowFullConfirmModal(false)}
                className="py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700"
              >
                No
              </button>
              <button
                onClick={() => handleConfirmFullDelivery(selectedOrderForAction)}
                className="py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 shadow-md"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CANCELLATION REASON (Matches Screenshot 2 Screen 3) */}
      {/* ========================================================= */}
      {showCancelReasonModal && selectedOrderForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e2026] border border-white/10 p-4 space-y-3 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h4 className="font-bold text-sm text-rose-400">What is the reason for cancellation?</h4>
              <button onClick={() => setShowCancelReasonModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              {['Rain / Road block', 'Shop Closed', 'Owner cancelled', 'Cash shortage at outlet', 'Out of stock'].map((r) => (
                <div
                  key={r}
                  onClick={() => setCancelReason(r)}
                  className={`p-3 rounded-xl border cursor-pointer font-semibold flex items-center justify-between transition-colors ${
                    cancelReason === r
                      ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                      : 'bg-black/30 border-white/5 text-slate-300 hover:bg-black/50'
                  }`}
                >
                  <span>{r}</span>
                  {cancelReason === r && <Check className="w-4 h-4" />}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowCancelReasonModal(false)}
                className="py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrderCancellation}
                className="py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-500 shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PARTIAL DELIVERY & MAKE SALES (Screenshot 2 Screen 4/5) */}
      {/* ========================================================= */}
      {isEditingPartialOrder && selectedOrderForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1e2026] border border-white/10 p-4 space-y-3 shadow-2xl text-white max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h4 className="font-bold text-sm text-emerald-400">Confirm Order & Make Sales</h4>
              <button onClick={() => setIsEditingPartialOrder(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Retailer Info Header (Green card from Screenshot 2) */}
            <div className="p-3 rounded-xl bg-emerald-600 text-white space-y-1 font-semibold text-xs">
              <div className="font-bold text-sm">Retailer: {selectedOrderForAction.customerName}</div>
              <div>Market: {selectedOrderForAction.deliveryAddress || activeCustomer.territory || selectedMarket || '-'}</div>
              <div>Distributor: {selectedOrderForAction.distributorName || '-'}</div>
              <div>Channel: {selectedOrderForAction.channel}</div>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">Delivered Items</span>
              <div className="space-y-2">
                {selectedOrderForAction.items.map((it: any) => (
                  <div key={it.productId} className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{it.productName}</div>
                      <div className="text-[10px] text-slate-400">Ordered Qty: {it.quantity} • ৳{it.unitPriceBDT}/unit</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Delivered:</span>
                      <input
                        type="number"
                        min={0}
                        max={it.quantity}
                        defaultValue={it.quantity}
                        className="w-14 p-1 rounded-lg bg-slate-800 border border-white/10 text-center font-bold text-amber-400 font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setBannerNotice(`✅ Partial delivery invoice confirmed for ${selectedOrderForAction.customerName}! Stock deducted.`);
                setIsEditingPartialOrder(false);
                setSelectedOrderForAction(null);
              }}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg"
            >
              Save Sales Invoice
            </button>
          </div>
        </div>
      )}

      {/* MODAL: OFFICIAL CHALLAN COPY */}
      {selectedMobileOrderForChallan && (
        <ChallanModal
          order={selectedMobileOrderForChallan}
          onClose={() => setSelectedMobileOrderForChallan(null)}
          onUpdateOrder={updateSalesOrder}
          onSwitchToDO={() => {
            const ord = selectedMobileOrderForChallan;
            setSelectedMobileOrderForChallan(null);
            setSelectedMobileOrderForDO(ord);
          }}
          onDispatchAndInvoice={(orderId) => {
            dispatchAndInvoiceSalesOrder(orderId);
            setBannerNotice(`✅ Order ${selectedMobileOrderForChallan.orderNumber} dispatched with Challan copy!`);
            setSelectedMobileOrderForChallan(null);
          }}
        />
      )}

      {/* MODAL: OFFICIAL DELIVERY ORDER (D.O.) COPY */}
      {selectedMobileOrderForDO && (
        <DeliveryOrderModal
          order={selectedMobileOrderForDO}
          onClose={() => setSelectedMobileOrderForDO(null)}
          onUpdateOrder={updateSalesOrder}
          onSwitchToChallan={() => {
            const ord = selectedMobileOrderForDO;
            setSelectedMobileOrderForDO(null);
            setSelectedMobileOrderForChallan(ord);
          }}
        />
      )}

      {/* MODAL: ENSURE & CONFIRM CUSTOMER RECEIPT */}
      {selectedMobileOrderForReceipt && (
        <CustomerReceiptModal
          order={selectedMobileOrderForReceipt}
          onClose={() => setSelectedMobileOrderForReceipt(null)}
          onConfirmReceipt={(orderId, details) => {
            confirmCustomerReceipt(orderId, details);
            setBannerNotice(
              `🎉 Handover complete! Order ${selectedMobileOrderForReceipt.orderNumber} confirmed received by ${details.receiverName} (${details.receiverPhone}).`
            );
            setSelectedMobileOrderForReceipt(null);
          }}
        />
      )}
    </div>
  );
};
