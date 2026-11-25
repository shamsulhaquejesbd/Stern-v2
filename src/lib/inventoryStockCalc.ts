import type {
  CIDStockReceipt,
  OpeningStockRecord,
  PrimaryReturnRecord,
  Product,
  SalesOrder,
  StockAdjustmentRecord,
  StockIssueRecord,
  StockTransfer,
  Warehouse,
} from '../types/erp.ts';

export interface InventoryStockLedgerSources {
  products: Product[];
  warehouses: Warehouse[];
  openingStockRecords: OpeningStockRecord[];
  cidStockReceipts: CIDStockReceipt[];
  stockTransfers: StockTransfer[];
  stockIssueRecords: StockIssueRecord[];
  salesOrders: SalesOrder[];
  primaryReturnRecords: PrimaryReturnRecord[];
  stockAdjustmentRecords: StockAdjustmentRecord[];
}

export function calculateInvoicedSalesDeduction(
  warehouseId: string,
  productId: string,
  sources: Pick<InventoryStockLedgerSources, 'products' | 'warehouses' | 'salesOrders'>
): number {
  const prod = (sources.products || []).find((p) => String(p.id) === String(productId));
  const wh = (sources.warehouses || []).find((w) => String(w.id) === String(warehouseId));
  if (!prod || !wh) return 0;

  return (sources.salesOrders || [])
    .filter((so) => {
      if (so.status === 'Cancelled' || so.status === 'Rejected') return false;

      const s = (so.status || '').toLowerCase().trim();
      const isInvoiced =
        s.includes('invoice') ||
        s.includes('dispatch') ||
        s === 'delivered' ||
        Boolean((so.invoiceNumber && so.invoiceNumber.trim()) || ((so as any).invoiceNo && String((so as any).invoiceNo).trim()));

      if (!isInvoiced) return false;

      const orderWhId = String(so.warehouseId || '').toLowerCase().trim();
      const curWhId = String(warehouseId || '').toLowerCase().trim();
      const orderWhName = (so.warehouseName || '').toLowerCase().trim();
      const curWhName = (wh.name || '').toLowerCase().trim();

      return (
        orderWhId === curWhId ||
        (Boolean(orderWhId) && Boolean(curWhId) && orderWhId.replace('wh-', '') === curWhId.replace('wh-', '')) ||
        (Boolean(orderWhName) && Boolean(curWhName) && (orderWhName === curWhName || curWhName.includes(orderWhName) || orderWhName.includes(curWhName))) ||
        (!orderWhId && String(warehouseId) === String(sources.warehouses[0]?.id))
      );
    })
    .reduce((sum, so) => {
      const matchingItems = (so.items || []).filter((item) => {
        const itemProdId = String(item.productId || '').toLowerCase().trim();
        const targetProdId = String(prod.id || '').toLowerCase().trim();
        const targetProdCode = String(prod.code || '').toLowerCase().trim();
        const itemProdName = (item.productName || '').toLowerCase().trim();
        const targetProdName = (prod.name || '').toLowerCase().trim();

        return (
          itemProdId === targetProdId ||
          (Boolean(targetProdCode) && (itemProdId === targetProdCode || ((item as any).sku && String((item as any).sku).toLowerCase().trim() === targetProdCode))) ||
          (Boolean(itemProdId) && Boolean(targetProdId) && itemProdId.replace(/^(fp-|prod-|p-)/, '') === targetProdId.replace(/^(fp-|prod-|p-)/, '')) ||
          (Boolean(itemProdName) && Boolean(targetProdName) && (itemProdName === targetProdName || targetProdName.includes(itemProdName) || itemProdName.includes(targetProdName)))
        );
      });
      return sum + matchingItems.reduce((iSum, item) => iSum + (Number(item.quantity) || 0), 0);
    }, 0);
}

/**
 * Computes current live finished goods stock (in units/pcs) for a specific product in a specific warehouse,
 * matching InventoryStockPage ledger rules (Opening + CID Receipts + Transfers In - Transfers Out - Issues - Invoiced Sales + Primary Returns + Adjustments).
 */
export function calculateProductWarehouseStock(
  warehouseId: string,
  productId: string,
  sources: InventoryStockLedgerSources
): number {
  const prod = (sources.products || []).find((p) => String(p.id) === String(productId));
  const wh = (sources.warehouses || []).find((w) => String(w.id) === String(warehouseId));
  if (!prod || !wh) return 0;

  const whNameLower = (wh.name || '').trim().toLowerCase();
  const prodCodeLower = (prod.code || '').trim().toLowerCase();
  const prodNameLower = (prod.name || '').trim().toLowerCase();

  // 1. Opening stock
  const openingStock = (sources.openingStockRecords || [])
    .filter((rec: any) => {
      const matchWh =
        String(rec.warehouseId) === String(warehouseId) ||
        (rec.warehouseName && rec.warehouseName.trim().toLowerCase() === whNameLower);
      const matchProd =
        String(rec.productId) === String(productId) ||
        (rec.sku && rec.sku.trim().toLowerCase() === prodCodeLower) ||
        (rec.productName && rec.productName.trim().toLowerCase() === prodNameLower);
      return matchWh && matchProd;
    })
    .reduce((sum: number, rec: any) => sum + (Number(rec.quantity) || 0), 0);

  // 2. CID stock receipts
  const cidStock = (sources.cidStockReceipts || [])
    .filter((receipt: any) => {
      const matchWh =
        String(receipt.warehouseId) === String(warehouseId) ||
        (receipt.warehouseName && receipt.warehouseName.trim().toLowerCase() === whNameLower);
      return matchWh && receipt.status !== 'Rejected';
    })
    .reduce((sum: number, receipt: any) => {
      const matchingItems = (receipt.items || []).filter((item: any) => {
        const itemProdId = String(item.productId || '');
        const itemSku = (item.sku || item.productCode || '').trim().toLowerCase();
        const itemName = (item.productName || '').trim().toLowerCase();
        return (
          itemProdId === String(productId) ||
          (Boolean(prodCodeLower) && itemSku === prodCodeLower) ||
          (Boolean(prodNameLower) && itemName === prodNameLower)
        );
      });
      return sum + matchingItems.reduce((iSum: number, item: any) => iSum + (Number(item.receivedQty || item.quantity) || 0), 0);
    }, 0);

  // 3. Stock Transfers IN (received at destination)
  const transfersIn = (sources.stockTransfers || [])
    .filter((t: any) => {
      const matchDest =
        String(t.destWarehouseId || '') === String(warehouseId) ||
        String(t.toWarehouseId || '') === String(warehouseId) ||
        String(t.destinationWarehouseId || '') === String(warehouseId) ||
        String(t.destination_warehouse_id || '') === String(warehouseId) ||
        (t.destWarehouseName && t.destWarehouseName.trim().toLowerCase() === whNameLower) ||
        (t.toWarehouseName && t.toWarehouseName.trim().toLowerCase() === whNameLower) ||
        (t.destinationWarehouseName && t.destinationWarehouseName.trim().toLowerCase() === whNameLower);

      const isReceived =
        t.status === 'Received' ||
        t.status === 'Received at Destination' ||
        t.status === 'Received & Verified' ||
        t.status === 'Completed';

      return Boolean(matchDest && isReceived);
    })
    .reduce((sum: number, t: any) => {
      if (t.items && t.items.length > 0) {
        const matchingItems = t.items.filter((item: any) => {
          const itemProdId = String(item.productId || '');
          const itemSku = (item.sku || item.productCode || '').trim().toLowerCase();
          const itemName = (item.productName || '').trim().toLowerCase();
          return (
            itemProdId === String(productId) ||
            (Boolean(prodCodeLower) && itemSku === prodCodeLower) ||
            (Boolean(prodNameLower) && Boolean(itemName) && (itemName === prodNameLower || prodNameLower.includes(itemName) || itemName.includes(prodNameLower)))
          );
        });
        if (matchingItems.length > 0) {
          return sum + matchingItems.reduce((iSum: number, it: any) => iSum + (Number(it.quantity) || 0), 0);
        }
      }

      const tProdId = String(t.productId || '');
      const tSku = (t.productCode || t.sku || '').trim().toLowerCase();
      const tName = (t.productName || '').trim().toLowerCase();
      const matchProd =
        tProdId === String(productId) ||
        (Boolean(prodCodeLower) && tSku === prodCodeLower) ||
        (Boolean(prodNameLower) && Boolean(tName) && (tName === prodNameLower || prodNameLower.includes(tName) || tName.includes(prodNameLower)));

      if (matchProd) {
        return sum + (Number(t.quantity || t.totalQuantity) || 0);
      }
      return sum;
    }, 0);

  // 4. Stock Transfers OUT
  const transfersOut = (sources.stockTransfers || [])
    .filter((t: any) => {
      const matchSrc =
        String(t.sourceWarehouseId || '') === String(warehouseId) ||
        String(t.fromWarehouseId || '') === String(warehouseId) ||
        String(t.source_warehouse_id || '') === String(warehouseId) ||
        (t.sourceWarehouseName && t.sourceWarehouseName.trim().toLowerCase() === whNameLower) ||
        (t.fromWarehouseName && t.fromWarehouseName.trim().toLowerCase() === whNameLower);

      const isDeductible =
        t.status === 'Received' ||
        t.status === 'Received at Destination' ||
        t.status === 'Received & Verified' ||
        t.status === 'Completed' ||
        t.status === 'In Transit' ||
        t.status === 'Dispatched';

      return Boolean(matchSrc && isDeductible);
    })
    .reduce((sum: number, t: any) => {
      if (t.items && t.items.length > 0) {
        const matchingItems = t.items.filter((item: any) => {
          const itemProdId = String(item.productId || '');
          const itemSku = (item.sku || item.productCode || '').trim().toLowerCase();
          const itemName = (item.productName || '').trim().toLowerCase();
          return (
            itemProdId === String(productId) ||
            (Boolean(prodCodeLower) && itemSku === prodCodeLower) ||
            (Boolean(prodNameLower) && Boolean(itemName) && (itemName === prodNameLower || prodNameLower.includes(itemName) || itemName.includes(prodNameLower)))
          );
        });
        if (matchingItems.length > 0) {
          return sum + matchingItems.reduce((iSum: number, it: any) => iSum + (Number(it.quantity) || 0), 0);
        }
      }

      const tProdId = String(t.productId || '');
      const tSku = (t.productCode || t.sku || '').trim().toLowerCase();
      const tName = (t.productName || '').trim().toLowerCase();
      const matchProd =
        tProdId === String(productId) ||
        (Boolean(prodCodeLower) && tSku === prodCodeLower) ||
        (Boolean(prodNameLower) && Boolean(tName) && (tName === prodNameLower || prodNameLower.includes(tName) || tName.includes(prodNameLower)));

      if (matchProd) {
        return sum + (Number(t.quantity || t.totalQuantity) || 0);
      }
      return sum;
    }, 0);

  // 5. Stock Issues OUT
  const issuesOut = (sources.stockIssueRecords || [])
    .filter((rec: any) => {
      const matchWh =
        String(rec.warehouseId) === String(warehouseId) ||
        String(rec.sourceWarehouseId) === String(warehouseId) ||
        (rec.warehouseName && rec.warehouseName.trim().toLowerCase() === whNameLower);
      return matchWh;
    })
    .reduce((sum: number, rec: any) => {
      const matchingItems = (rec.items || []).filter((item: any) => {
        const itemProdId = String(item.productId || '');
        const itemSku = (item.sku || item.productCode || '').trim().toLowerCase();
        const itemName = (item.productName || '').trim().toLowerCase();
        return (
          itemProdId === String(productId) ||
          (Boolean(prodCodeLower) && itemSku === prodCodeLower) ||
          (Boolean(prodNameLower) && itemName === prodNameLower)
        );
      });
      return sum + matchingItems.reduce((iSum: number, item: any) => iSum + (Number(item.quantity) || 0), 0);
    }, 0);

  // 6. Invoiced Sales Orders OUT
  const invoicedSalesOut = calculateInvoicedSalesDeduction(warehouseId, productId, sources);

  // 7. Primary Returns IN
  const returnsIn = (sources.primaryReturnRecords || [])
    .filter((rec: any) => {
      const matchWh = String(rec.warehouseId) === String(warehouseId);
      const matchProd =
        String(rec.productId) === String(productId) ||
        (rec.sku && rec.sku.trim().toLowerCase() === prodCodeLower);
      return matchWh && matchProd;
    })
    .reduce((sum: number, rec: any) => sum + (Number(rec.quantity) || 0), 0);

  // 8. Stock Adjustments
  const adjustments = (sources.stockAdjustmentRecords || [])
    .filter((rec: any) => {
      const matchWh = String(rec.warehouseId) === String(warehouseId);
      const matchProd =
        String(rec.productId) === String(productId) ||
        (rec.sku && rec.sku.trim().toLowerCase() === prodCodeLower);
      return matchWh && matchProd;
    })
    .reduce((sum: number, rec: any) => sum + (Number(rec.qtyDelta ?? (rec.newQty - rec.previousQty)) || 0), 0);

  const netCalculated =
    openingStock +
    cidStock +
    transfersIn -
    transfersOut -
    issuesOut -
    invoicedSalesOut +
    returnsIn +
    adjustments;

  return Math.max(0, netCalculated);
}

/**
 * Computes total live finished goods stock across all warehouses for a given product.
 */
export function calculateTotalProductStock(
  productId: string,
  sources: InventoryStockLedgerSources
): number {
  return (sources.warehouses || []).reduce(
    (sum, wh) => sum + calculateProductWarehouseStock(wh.id, productId, sources),
    0
  );
}
