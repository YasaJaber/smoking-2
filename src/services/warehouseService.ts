// ============================================================
// Warehouse Service - Standalone stock with weighted average cost
// ============================================================

import { generateId, getDatabase, runSerialized } from '../db/client';
import type { WarehouseItem, WarehouseMovement, WarehouseSummary } from '../types';

type WarehouseItemInput = {
  name: string;
  sku?: string | null;
  quantity: number;
  unit_cost: number;
  note?: string | null;
};

function cleanQuantity(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function cleanMoney(value: number): number {
  return Math.max(0, Number(value) || 0);
}

function calculateWeightedAverage(
  currentQuantity: number,
  currentAverageCost: number,
  addedQuantity: number,
  addedUnitCost: number
): number {
  const nextQuantity = currentQuantity + addedQuantity;
  if (nextQuantity <= 0) return 0;

  const currentValue = currentQuantity * currentAverageCost;
  const addedValue = addedQuantity * addedUnitCost;
  return (currentValue + addedValue) / nextQuantity;
}

export async function getWarehouseItems(search?: string): Promise<WarehouseItem[]> {
  const db = await getDatabase();
  const query = search?.trim();

  if (query) {
    return db.getAllAsync<WarehouseItem>(
      `SELECT *
       FROM warehouse_items
       WHERE is_active = 1 AND (name LIKE ? OR sku LIKE ?)
       ORDER BY updated_at DESC, name ASC`,
      [`%${query}%`, `%${query}%`]
    );
  }

  return db.getAllAsync<WarehouseItem>(
    `SELECT *
     FROM warehouse_items
     WHERE is_active = 1
     ORDER BY updated_at DESC, name ASC`
  );
}

export async function getWarehouseSummary(): Promise<WarehouseSummary> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WarehouseSummary>(
    `SELECT
       COUNT(*) AS item_count,
       COALESCE(SUM(quantity), 0) AS total_quantity,
       COALESCE(SUM(total_cost), 0) AS total_value,
       CASE
         WHEN COALESCE(SUM(quantity), 0) > 0
         THEN COALESCE(SUM(total_cost), 0) / COALESCE(SUM(quantity), 0)
         ELSE 0
       END AS average_price
     FROM warehouse_items
     WHERE is_active = 1`
  );

  return row ?? {
    item_count: 0,
    total_quantity: 0,
    total_value: 0,
    average_price: 0,
  };
}

export async function getWarehouseMovements(limit = 25): Promise<WarehouseMovement[]> {
  const db = await getDatabase();
  return db.getAllAsync<WarehouseMovement>(
    `SELECT wm.*, wi.name AS item_name
     FROM warehouse_movements wm
     JOIN warehouse_items wi ON wi.id = wm.warehouse_item_id
     ORDER BY wm.created_at DESC
     LIMIT ?`,
    [limit]
  );
}

export async function getWarehouseItemMovements(
  itemId: string,
  limit = 30
): Promise<WarehouseMovement[]> {
  const db = await getDatabase();
  return db.getAllAsync<WarehouseMovement>(
    `SELECT wm.*, wi.name AS item_name
     FROM warehouse_movements wm
     JOIN warehouse_items wi ON wi.id = wm.warehouse_item_id
     WHERE wm.warehouse_item_id = ?
     ORDER BY wm.created_at DESC
     LIMIT ?`,
    [itemId, limit]
  );
}

export async function createWarehouseItem(data: WarehouseItemInput): Promise<WarehouseItem> {
  return runSerialized(async () => {
    const db = await getDatabase();
    const id = generateId();
    const now = new Date().toISOString();
    const quantity = cleanQuantity(data.quantity);
    const unitCost = cleanMoney(data.unit_cost);
    const totalCost = quantity * unitCost;
    const name = data.name.trim();
    const sku = data.sku?.trim() || null;
    const note = data.note?.trim() || null;

    if (!name) throw new Error('NAME_REQUIRED');

    await db.execAsync('BEGIN TRANSACTION');
    try {
      await db.runAsync(
        `INSERT INTO warehouse_items
          (id, name, sku, quantity, average_cost, total_cost, note, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, name, sku, quantity, unitCost, totalCost, note, now, now]
      );

      if (quantity > 0) {
        await db.runAsync(
          `INSERT INTO warehouse_movements
            (id, warehouse_item_id, delta, movement_type, unit_cost, total_cost, note, created_at)
           VALUES (?, ?, ?, 'in', ?, ?, ?, ?)`,
          [generateId(), id, quantity, unitCost, totalCost, note || 'initial_stock', now]
        );
      }

      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }

    return {
      id,
      name,
      sku,
      quantity,
      average_cost: unitCost,
      total_cost: totalCost,
      note,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
  });
}

export async function updateWarehouseItem(
  itemId: string,
  updates: Partial<Pick<WarehouseItem, 'name' | 'sku' | 'note'>>
): Promise<void> {
  return runSerialized(async () => {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (!name) throw new Error('NAME_REQUIRED');
      setClauses.push('name = ?');
      values.push(name);
    }

    if (updates.sku !== undefined) {
      setClauses.push('sku = ?');
      values.push(updates.sku?.trim() || null);
    }

    if (updates.note !== undefined) {
      setClauses.push('note = ?');
      values.push(updates.note?.trim() || null);
    }

    if (setClauses.length === 0) return;

    setClauses.push('updated_at = ?');
    values.push(now, itemId);

    await db.runAsync(
      `UPDATE warehouse_items SET ${setClauses.join(', ')} WHERE id = ? AND is_active = 1`,
      values
    );
  });
}

export async function addWarehouseStock(
  itemId: string,
  quantityInput: number,
  unitCostInput: number,
  note?: string
): Promise<WarehouseItem> {
  return runSerialized(async () => {
    const db = await getDatabase();
    const quantity = cleanQuantity(quantityInput);
    const unitCost = cleanMoney(unitCostInput);
    const cleanNote = note?.trim() || null;
    const now = new Date().toISOString();

    if (quantity <= 0) throw new Error('QUANTITY_REQUIRED');
    if (unitCost <= 0) throw new Error('COST_REQUIRED');

    const item = await db.getFirstAsync<WarehouseItem>(
      'SELECT * FROM warehouse_items WHERE id = ? AND is_active = 1',
      [itemId]
    );
    if (!item) throw new Error('ITEM_NOT_FOUND');

    const nextQuantity = item.quantity + quantity;
    const nextAverage = calculateWeightedAverage(
      item.quantity,
      item.average_cost,
      quantity,
      unitCost
    );
    const nextTotal = nextQuantity * nextAverage;

    await db.execAsync('BEGIN TRANSACTION');
    try {
      await db.runAsync(
        `UPDATE warehouse_items
         SET quantity = ?, average_cost = ?, total_cost = ?, updated_at = ?
         WHERE id = ?`,
        [nextQuantity, nextAverage, nextTotal, now, itemId]
      );

      await db.runAsync(
        `INSERT INTO warehouse_movements
          (id, warehouse_item_id, delta, movement_type, unit_cost, total_cost, note, created_at)
         VALUES (?, ?, ?, 'in', ?, ?, ?, ?)`,
        [generateId(), itemId, quantity, unitCost, quantity * unitCost, cleanNote, now]
      );

      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }

    return {
      ...item,
      quantity: nextQuantity,
      average_cost: nextAverage,
      total_cost: nextTotal,
      updated_at: now,
    };
  });
}

export async function removeWarehouseStock(
  itemId: string,
  quantityInput: number,
  note?: string
): Promise<WarehouseItem> {
  return runSerialized(async () => {
    const db = await getDatabase();
    const quantity = cleanQuantity(quantityInput);
    const cleanNote = note?.trim() || null;
    const now = new Date().toISOString();

    if (quantity <= 0) throw new Error('QUANTITY_REQUIRED');

    const item = await db.getFirstAsync<WarehouseItem>(
      'SELECT * FROM warehouse_items WHERE id = ? AND is_active = 1',
      [itemId]
    );
    if (!item) throw new Error('ITEM_NOT_FOUND');
    if (item.quantity < quantity) throw new Error('INSUFFICIENT_STOCK');

    const nextQuantity = item.quantity - quantity;
    const nextTotal = nextQuantity * item.average_cost;

    await db.execAsync('BEGIN TRANSACTION');
    try {
      await db.runAsync(
        `UPDATE warehouse_items
         SET quantity = ?, total_cost = ?, updated_at = ?
         WHERE id = ?`,
        [nextQuantity, nextTotal, now, itemId]
      );

      await db.runAsync(
        `INSERT INTO warehouse_movements
          (id, warehouse_item_id, delta, movement_type, unit_cost, total_cost, note, created_at)
         VALUES (?, ?, ?, 'out', ?, ?, ?, ?)`,
        [generateId(), itemId, -quantity, item.average_cost, quantity * item.average_cost, cleanNote, now]
      );

      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }

    return {
      ...item,
      quantity: nextQuantity,
      total_cost: nextTotal,
      updated_at: now,
    };
  });
}

export async function deleteWarehouseItem(itemId: string): Promise<void> {
  return runSerialized(async () => {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE warehouse_items SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
      [itemId]
    );
  });
}
