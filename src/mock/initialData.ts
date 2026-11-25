import {
  User,
  OrgNode,
  Supplier,
  RawMaterial,
  RawMaterialCategory,
  RawMaterialClassification,
  Product,
  ProductCategory,
  ProductBrand,
  CustomerCategory,
  Department,
  Bank,
  UnitOfMeasurement,
  ProductionOrder,
  ImportPurchaseOrder,
  OptimumStatementEntry,
  Warehouse,
  StockTransfer,
  StockLedgerEntry,
  CIDStockReceipt,
  CIDStockReceiptItem,
  OpeningStockRecord,
  StockIssueRecord,
  PrimaryReturnRecord,
  StockAdjustmentRecord,
  Distributor,
  Customer,
  CRMLeadAgreement,
  FieldForceRep,
  VisitLog,
  OfferPromotion,
  SalesOrder,
  Requisition,
  Payment,
  CashBookEntry,
  PayrollRecord,
  AuditLog,
  TADAEntry,
  getDefaultPermissionsForRole,
  InventoryBatch,
  RawMaterialReceipt,
  InventoryMovement,
  ProductionCostRecord,
  ProductionConsumption,
  BOMDefinition,
} from '../types/erp.ts';

export const INITIAL_USERS: User[] = [];

export const INITIAL_ORG_HIERARCHY: OrgNode = {
  id: '',
  name: '',
  type: 'Company',
  code: '',
  children: [],
  taggedDistributorIds: [],
  taggedCustomerIds: [],
  taggedFieldForceIds: [],
};

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    code: 'SUP-CATL',
    name: 'Contemporary Amperex Tech (CATL) Co. Ltd.',
    country: 'China (Ningde, Fujian)',
    contactPerson: 'Mr. David Zhang',
    phone: '+86 593 890 1234',
    email: 'export.cells@catl.com',
    materialsSupplied: ['LiFePO4 3.2V 105Ah Prismatic Cell', 'LiFePO4 3.2V 280Ah Cell'],
    rating: 4.9,
    balanceBDT: 3450000,
  },
  {
    id: 'sup-2',
    code: 'SUP-EVE',
    name: 'EVE Energy Power Co. Ltd.',
    country: 'China (Huizhou, Guangdong)',
    contactPerson: 'Ms. Lin Wei',
    phone: '+86 752 260 5678',
    email: 'global@evebattery.com',
    materialsSupplied: ['LiFePO4 3.2V 100Ah Cylindrical/Prismatic', '3.2V 50Ah EV Cell'],
    rating: 4.8,
    balanceBDT: 1820000,
  },
  {
    id: 'sup-3',
    code: 'SUP-DALY',
    name: 'Shenzhen Daly Electronics Co. Ltd.',
    country: 'China (Shenzhen, Guangdong)',
    contactPerson: 'Mr. Kevin Liu',
    phone: '+86 755 282 3456',
    email: 'sales@dalybms.com',
    materialsSupplied: ['Smart 16S 100A CAN/RS485 BMS', '4S 12V 150A Bluetooth BMS', '20S 60V EV BMS'],
    rating: 4.7,
    balanceBDT: 850000,
  },
  {
    id: 'sup-4',
    code: 'SUP-CASE',
    name: 'Dongguan Jintao Enclosure & Metal Stampings',
    country: 'China (Dongguan)',
    contactPerson: 'Mr. Zhao Peng',
    phone: '+86 769 822 7788',
    email: 'sales@jintaocase.com',
    materialsSupplied: ['19-inch 3U Telecom Server Rack Case', 'ABS Waterproof Solar Battery Casing', 'EV Metal Casing with Handle'],
    rating: 4.6,
    balanceBDT: 420000,
  },
];

export const INITIAL_RAW_MATERIAL_CATEGORIES: RawMaterialCategory[] = [
  { id: 'rmc-1', code: 'RMC-CELL', name: 'Lithium Battery Cell', description: 'LiFePO4 & NMC High Capacity Cells', status: 'Active', itemCount: 3, parentClassification: 'Active Components' },
  { id: 'rmc-2', code: 'RMC-BMS', name: 'Battery Management System (BMS)', description: 'Smart BMS with CAN, RS485 & Bluetooth', status: 'Active', itemCount: 2, parentClassification: 'Active Components' },
  { id: 'rmc-3', code: 'RMC-CASE', name: 'Enclosure & Casing', description: 'Telecom, Solar, and EV Metal Enclosures', status: 'Active', itemCount: 2, parentClassification: 'Mechanical Hardware' },
  { id: 'rmc-4', code: 'RMC-BUSBAR', name: 'Wire, Cable & Busbar', description: 'Pure Tinned Copper & Silicone Insulated Cables', status: 'Active', itemCount: 2, parentClassification: 'Electrical & Wiring' },
  { id: 'rmc-5', code: 'RMC-CONN', name: 'Connectors & Terminals', description: 'Anderson Powerpole, M8 Studs, Multi-pin Sockets', status: 'Active', itemCount: 1, parentClassification: 'Electrical & Wiring' },
];

export const INITIAL_RAW_MATERIAL_CLASSIFICATIONS: RawMaterialClassification[] = [
  { id: 'cls-1', code: 'CLS-ACT', name: 'Active Components', description: 'Core functional electrochemical & electronic modules', status: 'Active', colorTag: 'blue', categoryCount: 2 },
  { id: 'cls-2', code: 'CLS-MECH', name: 'Mechanical Hardware', description: 'Frames, casings, insulators, and structural stampings', status: 'Active', colorTag: 'emerald', categoryCount: 1 },
  { id: 'cls-3', code: 'CLS-ELEC', name: 'Electrical & Wiring', description: 'High current conduits, busbars, and terminals', status: 'Active', colorTag: 'amber', categoryCount: 2 },
];

export const INITIAL_RAW_MATERIALS: RawMaterial[] = [];

// Initial Purchase Batches with immutable purchase rates and unique barcodes
export const INITIAL_INVENTORY_BATCHES: InventoryBatch[] = [];

// Initial Goods Received Notes (GRN)
export const INITIAL_RAW_MATERIAL_RECEIPTS: RawMaterialReceipt[] = [];

// Initial Complete Inventory Movement History
export const INITIAL_INVENTORY_MOVEMENTS: InventoryMovement[] = [];

// Initial Production Orders with actual costing
export const INITIAL_PRODUCTION_COSTS: ProductionCostRecord[] = [];


// Initial Bill of Materials Definitions with Revision History
export const INITIAL_BOMS: BOMDefinition[] = [];

export const INITIAL_CATEGORIES: ProductCategory[] = [
  {
    id: '6',
    code: 'CAT-01',
    name: 'ENMAX',
    description: '60V & 72V traction battery packs for Bangladeshi electric three-wheelers and commercial light EVs.',
    status: 'Active',
    productCount: 1,
  },
  {
    id: '7',
    code: 'CAT-02',
    name: 'ENFLEX',
    description: 'ENFLEX',
    status: 'Active',
    productCount: 0,
  },
  {
    id: '8',
    code: 'CAT-03',
    name: 'ENPOWER',
    description: 'ENPOWER',
    status: 'Active',
    productCount: 1,
  },
  {
    id: '9',
    code: 'CAT-04',
    name: 'ENGRID',
    description: 'ENGRID',
    status: 'Active',
    productCount: 0,
  },
];

export const INITIAL_CUSTOMER_CATEGORIES: CustomerCategory[] = [];

export const INITIAL_BRANDS: ProductBrand[] = [];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_IMPORT_ORDERS: ImportPurchaseOrder[] = [];

export const INITIAL_PRODUCTION_ORDERS: ProductionOrder[] = [];

export const INITIAL_PRODUCTION_CONSUMPTIONS: ProductionConsumption[] = [];

export const INITIAL_OPTIMUM_STATEMENT: OptimumStatementEntry[] = [];

export const INITIAL_WAREHOUSES: Warehouse[] = [];

export const INITIAL_STOCK_TRANSFERS: StockTransfer[] = [];

// Clean baseline: no test or sample CID received records
export const INITIAL_CID_STOCK_RECEIPTS: CIDStockReceipt[] = [];

// Clean baseline: no test or sample opening stock records
export const INITIAL_OPENING_STOCK: OpeningStockRecord[] = [];

export const INITIAL_STOCK_ISSUES: StockIssueRecord[] = [];

export const INITIAL_PRIMARY_RETURNS: PrimaryReturnRecord[] = [];

export const INITIAL_STOCK_ADJUSTMENTS: StockAdjustmentRecord[] = [];

export const INITIAL_STOCK_LEDGER: StockLedgerEntry[] = [];

export const INITIAL_DEPARTMENTS: Department[] = [];

export const INITIAL_BANKS: Bank[] = [];

export const INITIAL_UOMS: UnitOfMeasurement[] = [];

export const INITIAL_DISTRIBUTORS: Distributor[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_CRM_AGREEMENTS: CRMLeadAgreement[] = [];

export const INITIAL_FIELD_FORCE: FieldForceRep[] = [];

export const INITIAL_VISIT_LOGS: VisitLog[] = [];

export const INITIAL_OFFERS: OfferPromotion[] = [];

export const INITIAL_SALES_ORDERS: SalesOrder[] = [];

export const INITIAL_CASH_BOOK: CashBookEntry[] = [];

export const INITIAL_PAYROLL: PayrollRecord[] = [];

export const INITIAL_REQUISITIONS: Requisition[] = [];

export const INITIAL_PAYMENTS: Payment[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-01',
    timestamp: '2026-10-07 09:15:22',
    userId: 'u-1',
    userName: 'Engr. Sohidul Islam',
    action: 'SYSTEM_BOOT',
    module: 'Core System',
    details: 'Ensec ERP & Distribution Engine initialized with 50:50 Optimum JV parameters.',
    ipAddress: '103.145.112.5',
  },
  {
    id: 'aud-02',
    timestamp: '2026-10-07 10:48:10',
    userId: 'u-6',
    userName: 'Zubair Ahmed',
    action: 'ORDER_SUBMITTED',
    module: 'Mobile Field Force',
    details: 'Sales Order SO-DHK-2026-061 submitted for Dhaka Green Auto Workshop (BDT 621,600).',
    ipAddress: '103.119.20.44 (Mobile 4G)',
  },
  {
    id: 'aud-03',
    timestamp: '2026-10-07 11:05:30',
    userId: 'u-2',
    userName: 'Tanvir Hossain',
    action: 'CREDIT_LIMIT_UPDATED',
    module: 'Distributor Management',
    details: 'Updated credit limit for Meghna Solar & Power from BDT 4,500,000 to BDT 5,000,000.',
    ipAddress: '103.145.112.18',
  },
];

export const INITIAL_TADA_LIST: TADAEntry[] = [];

