import { OrgNode } from '../types/erp.ts';

export interface MarketHierarchyItem {
  code: string;
  name: string;
  fullName: string;
  region: string;
  area: string;
}

export const STANDARD_DEPARTMENTS: string[] = [
  'Sales & Distribution',
  'Marketing & Promotions',
  'Manufacturing & Production',
  'Supply Chain & Procurement',
  'Finance & Accounts',
  'Human Resources & Admin',
  'Quality Assurance',
  'IT & Systems',
];

export const INITIAL_MARKET_HIERARCHIES: MarketHierarchyItem[] = [];

const STORAGE_KEY = 'ensec_market_hierarchies';

export function getStoredMarketHierarchies(): MarketHierarchyItem[] {
  if (typeof window === 'undefined') {
    return INITIAL_MARKET_HIERARCHIES;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_MARKET_HIERARCHIES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_MARKET_HIERARCHIES;
  } catch {
    return INITIAL_MARKET_HIERARCHIES;
  }
}

export function addStoredMarketHierarchy(item: MarketHierarchyItem): MarketHierarchyItem[] {
  const current = getStoredMarketHierarchies();
  const exists = current.some(
    (h) =>
      h.fullName.toLowerCase().trim() === item.fullName.toLowerCase().trim() ||
      h.code.toLowerCase().trim() === item.code.toLowerCase().trim()
  );
  const updated = exists ? current : [...current, item];
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('ensec-market-hierarchy-updated', { detail: updated }));
    } catch {
      // Ignore storage errors
    }
  }
  return updated;
}

export function extractHierarchiesFromOrgNode(
  node: OrgNode | null | undefined,
  parentRegion = ''
): MarketHierarchyItem[] {
  if (!node) return [];
  const results: MarketHierarchyItem[] = [];
  const nextRegion =
    node.type === 'Division' || node.type === 'Region' || node.type === 'Zone'
      ? node.name
      : parentRegion;

  if (['Territory', 'DB Point', 'Market Hierarchy', 'Area', 'Beat'].includes(node.type)) {
    results.push({
      code: node.code,
      name: node.name,
      fullName: `${node.code} - ${node.name}`,
      region: parentRegion || 'Dhaka Division',
      area: node.name,
    });
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      results.push(...extractHierarchiesFromOrgNode(child, nextRegion));
    }
  }

  return results;
}
