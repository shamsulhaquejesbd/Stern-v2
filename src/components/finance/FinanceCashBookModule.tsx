/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Accounts & Finance Module
 * Centralized Cash & Bank Management.
 */

import React from 'react';
import { CashBankModule, CashBankModuleTab } from './CashBankModule.tsx';

interface FinanceCashBookModuleProps {
  initialSubTab?: string;
  onNavigate?: (module: string) => void;
}

const SUBTAB_MAP: Record<string, CashBankModuleTab> = {
  'finance-cashbook': 'accounting-dashboard',
  'finance-accounting-dashboard': 'accounting-dashboard',
  'finance-coa': 'coa',
  'finance-opening-balances': 'opening-balance',
  'finance-journal-vouchers': 'journal-vouchers',
  'finance-general-ledger': 'general-ledger',
  'finance-cash-book': 'cash-book',
  'finance-bank-book': 'bank-book',
  'finance-receivables': 'receivables',
  'finance-payables': 'payables',
  'finance-trial-balance': 'trial-balance',
  'finance-balance-sheet': 'balance-sheet',
  'finance-profit-loss': 'profit-loss',
  'finance-cash-flow': 'cash-flow',
  'finance-fiscal-years': 'financial-years',
  'finance-financial-statements': 'balance-sheet',
  'cash-bank': 'dashboard',
  'cash-bank-ledger': 'unified-ledger',
  'cash-bank-cash-book': 'cash-book',
  'cash-bank-bank-book': 'bank-book',
  'cash-bank-opening': 'opening-balance',
  'cash-bank-invoices': 'sales-invoices',
  'cash-bank-categories': 'categories',
};

export const FinanceCashBookModule: React.FC<FinanceCashBookModuleProps> = ({
  initialSubTab = 'finance-accounting-dashboard',
  onNavigate,
}) => {
  const mappedTab: CashBankModuleTab = SUBTAB_MAP[initialSubTab] || 'accounting-dashboard';
  return <CashBankModule initialTab={mappedTab} onNavigate={onNavigate} />;
};

