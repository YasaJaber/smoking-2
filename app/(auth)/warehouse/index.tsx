// ============================================================
// Standalone Warehouse Screen - Independent from POS inventory
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurrentDateBadge } from '../../../src/components/common/CurrentDateBadge';
import { Colors, Gradients, Typography, Spacing, BorderRadius } from '../../../src/constants/theme';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { formatCurrency, getRelativeTime } from '../../../src/utils/formatters';
import {
  addWarehouseStock,
  createWarehouseItem,
  deleteWarehouseItem,
  getWarehouseItemMovements,
  getWarehouseItems,
  getWarehouseMovements,
  getWarehouseSummary,
  removeWarehouseStock,
  updateWarehouseItem,
} from '../../../src/services/warehouseService';
import type { WarehouseItem, WarehouseMovement, WarehouseSummary } from '../../../src/types';

type MovementMode = 'in' | 'out';

const EMPTY_SUMMARY: WarehouseSummary = {
  item_count: 0,
  total_quantity: 0,
  total_value: 0,
  average_price: 0,
};

function parseQuantity(value: string): number {
  return Math.max(0, Math.floor(Number.parseInt(value, 10) || 0));
}

function parseMoney(value: string): number {
  return Math.max(0, Number.parseFloat(value) || 0);
}

export default function WarehouseScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 768;
  const modalWidth = Math.min(width - Spacing.base * 2, isCompact ? 390 : 520);
  const modalMaxHeight = height * 0.86;
  const darkMode = useSettingsStore((s) => s.settings.dark_mode);
  const currency = useSettingsStore((s) => s.settings.currency);
  const colors = darkMode ? Colors.dark : Colors.light;

  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [summary, setSummary] = useState<WarehouseSummary>(EMPTY_SUMMARY);
  const [recentMovements, setRecentMovements] = useState<WarehouseMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);
  const [itemMovements, setItemMovements] = useState<WarehouseMovement[]>([]);

  const [showItemModal, setShowItemModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  const [movementMode, setMovementMode] = useState<MovementMode>('in');

  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemCost, setItemCost] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [movementQuantity, setMovementQuantity] = useState('1');
  const [movementCost, setMovementCost] = useState('');
  const [movementNote, setMovementNote] = useState('');

  const loadData = useCallback(async () => {
    const [nextItems, nextSummary, nextMovements] = await Promise.all([
      getWarehouseItems(searchQuery),
      getWarehouseSummary(),
      getWarehouseMovements(8),
    ]);

    setItems(nextItems);
    setSummary(nextSummary);
    setRecentMovements(nextMovements);
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filteredItems = useMemo(() => items, [items]);

  const openCreateItem = () => {
    setEditingItem(null);
    setItemName('');
    setItemSku('');
    setItemQuantity('');
    setItemCost('');
    setItemNote('');
    setShowItemModal(true);
  };

  const openEditItem = (item: WarehouseItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemSku(item.sku || '');
    setItemQuantity('');
    setItemCost('');
    setItemNote(item.note || '');
    setShowItemModal(true);
  };

  const openMovement = (item: WarehouseItem, mode: MovementMode) => {
    setSelectedItem(item);
    setMovementMode(mode);
    setMovementQuantity('1');
    setMovementCost(mode === 'in' ? item.average_cost.toString() : '');
    setMovementNote('');
    setShowMovementModal(true);
  };

  const openDetails = async (item: WarehouseItem) => {
    setSelectedItem(item);
    setItemMovements(await getWarehouseItemMovements(item.id));
    setShowDetailsModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemName.trim()) {
      Alert.alert('تنبيه', 'اكتب اسم الصنف');
      return;
    }

    try {
      if (editingItem) {
        await updateWarehouseItem(editingItem.id, {
          name: itemName,
          sku: itemSku,
          note: itemNote,
        });
      } else {
        await createWarehouseItem({
          name: itemName,
          sku: itemSku,
          quantity: parseQuantity(itemQuantity),
          unit_cost: parseMoney(itemCost),
          note: itemNote,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowItemModal(false);
      await loadData();
    } catch (error) {
      console.error('Error saving warehouse item:', error);
      Alert.alert('خطأ', 'تعذر حفظ الصنف');
    }
  };

  const handleSaveMovement = async () => {
    if (!selectedItem) return;

    const quantity = parseQuantity(movementQuantity);
    const unitCost = parseMoney(movementCost);

    if (quantity <= 0) {
      Alert.alert('تنبيه', 'اكتب كمية صحيحة');
      return;
    }

    if (movementMode === 'in' && unitCost <= 0) {
      Alert.alert('تنبيه', 'اكتب سعر شراء صحيح');
      return;
    }

    try {
      if (movementMode === 'in') {
        await addWarehouseStock(selectedItem.id, quantity, unitCost, movementNote);
      } else {
        await removeWarehouseStock(selectedItem.id, quantity, movementNote);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowMovementModal(false);
      await loadData();
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_STOCK') {
        Alert.alert('الكمية غير كافية', 'لا يمكن صرف كمية أكبر من الموجودة في المخزن');
        return;
      }
      console.error('Error saving warehouse movement:', error);
      Alert.alert('خطأ', 'تعذر تنفيذ الحركة');
    }
  };

  const handleDeleteItem = (item: WarehouseItem) => {
    Alert.alert('حذف الصنف', `هل تريد حذف "${item.name}" من المخزن المستقل؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deleteWarehouseItem(item.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await loadData();
        },
      },
    ]);
  };

  const movementPreview = useMemo(() => {
    if (!selectedItem || movementMode !== 'in') return null;

    const quantity = parseQuantity(movementQuantity);
    const cost = parseMoney(movementCost);
    const nextQuantity = selectedItem.quantity + quantity;
    if (quantity <= 0 || cost <= 0 || nextQuantity <= 0) return null;

    const nextAverage =
      (selectedItem.quantity * selectedItem.average_cost + quantity * cost) / nextQuantity;

    return {
      nextQuantity,
      nextAverage,
      addedValue: quantity * cost,
    };
  }, [movementCost, movementMode, movementQuantity, selectedItem]);

  const renderSummaryCard = (
    label: string,
    value: string,
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'],
    tint: string
  ) => (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: `${tint}22` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: WarehouseItem }) => (
    <Animated.View entering={FadeInDown.duration(220)}>
      <Pressable
        onPress={() => openDetails(item)}
        onLongPress={() => handleDeleteItem(item)}
        style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.itemTopRow}>
          <View style={[styles.itemMark, { backgroundColor: colors.primaryGlow }]}>
            <MaterialCommunityIcons name="cube-outline" size={24} color={colors.primary} />
          </View>

          <View style={styles.itemInfo}>
            <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {item.sku ? `كود: ${item.sku}` : item.note || 'مخزن مستقل عن البيع'}
            </Text>
          </View>

          <View style={[styles.qtyBadge, { backgroundColor: colors.accentGlow }]}>
            <Text style={[styles.qtyBadgeText, { color: colors.accent }]}>{item.quantity}</Text>
          </View>
        </View>

        <View style={styles.itemStats}>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>متوسط السعر</Text>
            <Text style={[styles.statValue, { color: colors.warning }]}>
              {formatCurrency(item.average_cost, currency)}
            </Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>قيمة الرصيد</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatCurrency(item.total_cost, currency)}
            </Text>
          </View>
        </View>

        <View style={styles.itemActions}>
          <Pressable
            onPress={() => openMovement(item, 'in')}
            style={[styles.actionBtn, { backgroundColor: colors.accentGlow }]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.accent }]}>إضافة</Text>
          </Pressable>
          <Pressable
            onPress={() => openMovement(item, 'out')}
            style={[styles.actionBtn, { backgroundColor: colors.dangerGlow }]}
          >
            <MaterialCommunityIcons name="minus" size={18} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>صرف</Text>
          </Pressable>
          <Pressable
            onPress={() => openEditItem(item)}
            style={[styles.iconActionBtn, { backgroundColor: colors.surfaceLight }]}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>مخزن مستقل</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            منفصل عن مخزون البيع
          </Text>
        </View>
        <CurrentDateBadge />
        <Pressable onPress={openCreateItem}>
          <LinearGradient
            colors={Gradients.emeraldTeal as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addButton}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.addButtonText}>صنف جديد</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={
                darkMode
                  ? (['#10201c', '#12332c', '#134e4a'] as unknown as readonly [string, string, ...string[]])
                  : (['#ecfdf5', '#d1fae5', '#ccfbf1'] as unknown as readonly [string, string, ...string[]])
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroPanel}
            >
              <View>
                <Text style={[styles.heroLabel, { color: darkMode ? '#99f6e4' : '#047857' }]}>
                  القيمة الحالية
                </Text>
                <Text style={[styles.heroValue, { color: darkMode ? '#f8fafc' : '#064e3b' }]}>
                  {formatCurrency(summary.total_value, currency)}
                </Text>
              </View>
              <View style={styles.heroSide}>
                <MaterialCommunityIcons
                  name="warehouse"
                  size={34}
                  color={darkMode ? 'rgba(153,246,228,0.85)' : '#0f766e'}
                />
                <Text style={[styles.heroSideText, { color: darkMode ? '#ccfbf1' : '#0f766e' }]}>
                  متوسط عام {formatCurrency(summary.average_price, currency)}
                </Text>
              </View>
            </LinearGradient>

            <View style={styles.summaryGrid}>
              {renderSummaryCard('الأصناف', String(summary.item_count), 'shape-outline', colors.primary)}
              {renderSummaryCard('إجمالي القطع', String(summary.total_quantity), 'counter', colors.accent)}
              {renderSummaryCard('متوسط السعر', formatCurrency(summary.average_price, currency), 'chart-bell-curve', colors.warning)}
            </View>

            <View style={[styles.searchBox, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="بحث باسم الصنف أو الكود..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {recentMovements.length > 0 && (
              <View style={styles.recentStrip}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>آخر حركات المخزن</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentList}>
                  {recentMovements.map((move) => {
                    const isIn = move.movement_type === 'in';
                    return (
                      <View
                        key={move.id}
                        style={[styles.movementPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <MaterialCommunityIcons
                          name={isIn ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
                          size={18}
                          color={isIn ? colors.accent : colors.danger}
                        />
                        <View>
                          <Text style={[styles.movementPillName, { color: colors.text }]} numberOfLines={1}>
                            {move.item_name}
                          </Text>
                          <Text style={[styles.movementPillMeta, { color: colors.textMuted }]}>
                            {isIn ? '+' : ''}
                            {move.delta} قطعة
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>الأصناف</Text>
          </View>
        }
        ListEmptyComponent={
          <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
            <MaterialCommunityIcons name="warehouse" size={54} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.text }]}>المخزن لسه فاضي</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              أضف أول صنف وحدد الكمية وسعر الشراء
            </Text>
          </Animated.View>
        }
      />

      <Modal visible={showItemModal} transparent animationType="fade" onRequestClose={() => setShowItemModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View
              entering={SlideInDown.duration(260)}
              style={[styles.modal, { width: modalWidth, maxHeight: modalMaxHeight, backgroundColor: colors.surface }]}
            >
              <ModalHeader
                title={editingItem ? 'تعديل الصنف' : 'صنف جديد في المخزن'}
                colors={colors}
                onClose={() => setShowItemModal(false)}
              />

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <FieldLabel label="اسم الصنف" color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text }]}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="مثال: كرتونة صنف معين"
                  placeholderTextColor={colors.textMuted}
                />

                <FieldLabel label="كود اختياري" color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text }]}
                  value={itemSku}
                  onChangeText={setItemSku}
                  placeholder="SKU / باركود / ملاحظة مختصرة"
                  placeholderTextColor={colors.textMuted}
                />

                {!editingItem && (
                  <View style={styles.row}>
                    <View style={styles.halfField}>
                      <FieldLabel label="الكمية الافتتاحية" color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text }]}
                        value={itemQuantity}
                        onChangeText={setItemQuantity}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    <View style={styles.halfField}>
                      <FieldLabel label="سعر الشراء" color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text }]}
                        value={itemCost}
                        onChangeText={setItemCost}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  </View>
                )}

                <FieldLabel label="ملاحظة" color={colors.textSecondary} />
                <TextInput
                  style={[
                    styles.input,
                    styles.noteInput,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={itemNote}
                  onChangeText={setItemNote}
                  multiline
                  placeholder="مكان التخزين أو أي تفاصيل"
                  placeholderTextColor={colors.textMuted}
                />

                {!editingItem && itemQuantity && itemCost && (
                  <View style={[styles.previewBox, { backgroundColor: colors.primaryGlow }]}>
                    <MaterialCommunityIcons name="calculator-variant-outline" size={18} color={colors.primary} />
                    <Text style={[styles.previewText, { color: colors.primary }]}>
                      القيمة: {formatCurrency(parseQuantity(itemQuantity) * parseMoney(itemCost), currency)}
                    </Text>
                  </View>
                )}
              </ScrollView>

              <Pressable onPress={handleSaveItem} style={{ marginTop: Spacing.base }}>
                <LinearGradient
                  colors={Gradients.emeraldTeal as unknown as readonly [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveButton}
                >
                  <MaterialCommunityIcons name="check" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>حفظ</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showMovementModal} transparent animationType="fade" onRequestClose={() => setShowMovementModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View
              entering={SlideInDown.duration(260)}
              style={[styles.modal, { width: modalWidth, maxHeight: modalMaxHeight, backgroundColor: colors.surface }]}
            >
              <ModalHeader
                title={movementMode === 'in' ? 'إضافة كمية' : 'صرف كمية'}
                colors={colors}
                onClose={() => setShowMovementModal(false)}
              />

              {selectedItem && (
                <View style={[styles.selectedItemBox, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                  <Text style={[styles.selectedItemName, { color: colors.text }]}>{selectedItem.name}</Text>
                  <Text style={[styles.selectedItemMeta, { color: colors.textMuted }]}>
                    الموجود: {selectedItem.quantity} | المتوسط الحالي: {formatCurrency(selectedItem.average_cost, currency)}
                  </Text>
                </View>
              )}

              <View style={styles.modeSwitch}>
                <ModeButton
                  active={movementMode === 'in'}
                  label="وارد"
                  icon="arrow-down-bold"
                  color={colors.accent}
                  colors={colors}
                  onPress={() => setMovementMode('in')}
                />
                <ModeButton
                  active={movementMode === 'out'}
                  label="صرف"
                  icon="arrow-up-bold"
                  color={colors.danger}
                  colors={colors}
                  onPress={() => setMovementMode('out')}
                />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <FieldLabel label="الكمية" color={colors.textSecondary} />
                <View style={styles.quantityRow}>
                  <Pressable
                    onPress={() => setMovementQuantity(String(Math.max(1, parseQuantity(movementQuantity) - 1)))}
                    style={[styles.qtyButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="minus" size={20} color={colors.text} />
                  </Pressable>
                  <TextInput
                    style={[styles.qtyInput, { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text }]}
                    value={movementQuantity}
                    onChangeText={setMovementQuantity}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                  <Pressable
                    onPress={() => setMovementQuantity(String(parseQuantity(movementQuantity) + 1))}
                    style={[styles.qtyButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
                  </Pressable>
                </View>

                {movementMode === 'in' && (
                  <>
                    <FieldLabel label="سعر شراء الكمية الجديدة" color={colors.textSecondary} />
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text }]}
                      value={movementCost}
                      onChangeText={setMovementCost}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                    />
                  </>
                )}

                <FieldLabel label="ملاحظة اختيارية" color={colors.textSecondary} />
                <TextInput
                  style={[
                    styles.input,
                    styles.noteInput,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.border, color: colors.text },
                  ]}
                  value={movementNote}
                  onChangeText={setMovementNote}
                  multiline
                  placeholder={movementMode === 'in' ? 'مثال: توريد اليوم' : 'مثال: تحويل / تلف / استخدام داخلي'}
                  placeholderTextColor={colors.textMuted}
                />

                {movementMode === 'in' && movementPreview && (
                  <View style={[styles.previewBox, { backgroundColor: colors.accentGlow }]}>
                    <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={colors.accent} />
                    <Text style={[styles.previewText, { color: colors.accent }]}>
                      المتوسط الجديد: {formatCurrency(movementPreview.nextAverage, currency)}
                    </Text>
                  </View>
                )}
              </ScrollView>

              <Pressable onPress={handleSaveMovement} style={{ marginTop: Spacing.base }}>
                <LinearGradient
                  colors={
                    movementMode === 'in'
                      ? (Gradients.emeraldTeal as unknown as readonly [string, string, ...string[]])
                      : (Gradients.danger as unknown as readonly [string, string, ...string[]])
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveButton}
                >
                  <MaterialCommunityIcons name={movementMode === 'in' ? 'plus' : 'minus'} size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>{movementMode === 'in' ? 'إضافة للمخزن' : 'صرف من المخزن'}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showDetailsModal} transparent animationType="fade" onRequestClose={() => setShowDetailsModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Animated.View
            entering={SlideInDown.duration(260)}
            style={[styles.modal, { width: modalWidth, maxHeight: modalMaxHeight, backgroundColor: colors.surface }]}
          >
            <ModalHeader title="سجل الصنف" colors={colors} onClose={() => setShowDetailsModal(false)} />
            {selectedItem && (
              <View style={[styles.detailHeader, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedItem.name}</Text>
                <Text style={[styles.detailMeta, { color: colors.textMuted }]}>
                  الرصيد {selectedItem.quantity} | القيمة {formatCurrency(selectedItem.total_cost, currency)}
                </Text>
              </View>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              {itemMovements.length === 0 ? (
                <View style={styles.emptyMovements}>
                  <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>لا توجد حركات مسجلة</Text>
                </View>
              ) : (
                itemMovements.map((move) => {
                  const isIn = move.movement_type === 'in';
                  return (
                    <View
                      key={move.id}
                      style={[styles.detailMovementRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={[styles.detailMovementIcon, { backgroundColor: isIn ? colors.accentGlow : colors.dangerGlow }]}>
                        <MaterialCommunityIcons
                          name={isIn ? 'arrow-down-bold' : 'arrow-up-bold'}
                          size={18}
                          color={isIn ? colors.accent : colors.danger}
                        />
                      </View>
                      <View style={styles.detailMovementInfo}>
                        <Text style={[styles.detailMovementTitle, { color: colors.text }]}>
                          {isIn ? 'وارد' : 'صرف'} {Math.abs(move.delta)} قطعة
                        </Text>
                        <Text style={[styles.detailMovementMeta, { color: colors.textMuted }]}>
                          {formatCurrency(move.unit_cost, currency)} | {getRelativeTime(move.created_at)}
                        </Text>
                      </View>
                      <Text style={[styles.detailMovementValue, { color: isIn ? colors.accent : colors.danger }]}>
                        {isIn ? '+' : '-'}
                        {formatCurrency(move.total_cost, currency)}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function FieldLabel({ label, color }: { label: string; color: string }) {
  return <Text style={[styles.label, { color }]}>{label}</Text>;
}

function ModalHeader({
  title,
  colors,
  onClose,
}: {
  title: string;
  colors: typeof Colors.dark | typeof Colors.light;
  onClose: () => void;
}) {
  return (
    <View style={styles.modalHeader}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
      <Pressable onPress={onClose} style={styles.closeButton}>
        <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function ModeButton({
  active,
  label,
  icon,
  color,
  colors,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  colors: typeof Colors.dark | typeof Colors.light;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeButton,
        {
          backgroundColor: active ? `${color}22` : colors.surfaceLight,
          borderColor: active ? color : colors.border,
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={active ? color : colors.textSecondary} />
      <Text style={[styles.modeButtonText, { color: active ? color : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  headerTitleWrap: { flexShrink: 1 },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: '800' },
  headerSubtitle: { fontSize: Typography.fontSize.xs, marginTop: 2 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  addButtonText: { color: '#fff', fontSize: Typography.fontSize.sm, fontWeight: '700' },
  listContent: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  heroPanel: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    overflow: 'hidden',
  },
  heroLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', marginBottom: Spacing.xs },
  heroValue: { fontSize: Typography.fontSize['2xl'], fontWeight: '800' },
  heroSide: { alignItems: 'flex-end', justifyContent: 'space-between', maxWidth: 145 },
  heroSideText: { fontSize: Typography.fontSize.xs, fontWeight: '700', textAlign: 'right' },
  summaryGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1,
    minWidth: 118,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  summaryLabel: { fontSize: Typography.fontSize.xs, fontWeight: '600' },
  summaryValue: { fontSize: Typography.fontSize.md, fontWeight: '800', marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    marginLeft: Spacing.sm,
  },
  recentStrip: { marginBottom: Spacing.md },
  recentList: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  movementPill: {
    width: 165,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  movementPillName: { fontSize: Typography.fontSize.xs, fontWeight: '700', maxWidth: 112 },
  movementPillMeta: { fontSize: Typography.fontSize.xs, marginTop: 1 },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: '800',
    marginBottom: Spacing.sm,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  itemMark: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: Typography.fontSize.base, fontWeight: '800' },
  itemMeta: { fontSize: Typography.fontSize.xs, marginTop: 2 },
  qtyBadge: {
    minWidth: 46,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  qtyBadgeText: { fontSize: Typography.fontSize.sm, fontWeight: '800' },
  itemStats: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  statBlock: {
    flex: 1,
    minWidth: 120,
  },
  statLabel: { fontSize: Typography.fontSize.xs, fontWeight: '600' },
  statValue: { fontSize: Typography.fontSize.base, fontWeight: '800', marginTop: 2 },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    minWidth: 92,
    minHeight: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionText: { fontSize: Typography.fontSize.sm, fontWeight: '800' },
  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
    gap: Spacing.sm,
  },
  emptyText: { fontSize: Typography.fontSize.base, fontWeight: '800' },
  emptySubtext: { fontSize: Typography.fontSize.sm, textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modal: {
    maxWidth: '100%',
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  modalTitle: { fontSize: Typography.fontSize.lg, fontWeight: '800' },
  closeButton: { padding: Spacing.xs },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
  },
  noteInput: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  halfField: { flex: 1, minWidth: 130 },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  previewText: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '800' },
  saveButton: {
    minHeight: 48,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  saveButtonText: { color: '#fff', fontSize: Typography.fontSize.base, fontWeight: '800' },
  selectedItemBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  selectedItemName: { fontSize: Typography.fontSize.base, fontWeight: '800' },
  selectedItemMeta: { fontSize: Typography.fontSize.xs, marginTop: 3 },
  modeSwitch: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  modeButtonText: { fontSize: Typography.fontSize.sm, fontWeight: '800' },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.lg,
    fontWeight: '800',
  },
  detailHeader: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  detailTitle: { fontSize: Typography.fontSize.base, fontWeight: '800' },
  detailMeta: { fontSize: Typography.fontSize.xs, marginTop: 3 },
  emptyMovements: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  detailMovementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  detailMovementIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailMovementInfo: { flex: 1 },
  detailMovementTitle: { fontSize: Typography.fontSize.sm, fontWeight: '800' },
  detailMovementMeta: { fontSize: Typography.fontSize.xs, marginTop: 2 },
  detailMovementValue: { fontSize: Typography.fontSize.sm, fontWeight: '800' },
});
