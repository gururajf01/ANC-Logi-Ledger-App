import { MasterListScreen } from '@/src/components/MasterListScreen';
export default function CategoriesScreen() {
  return (
    <MasterListScreen
      title="Expense Categories"
      endpoint="/categories"
      itemLabel={(c) => c.name}
      itemSubtitle={(c) => `${c.kind} · Alloc: ${c.allocation_method} · ₹${c.default_monthly_amount || 0}/mo`}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'kind', label: 'Kind (PerTrip / Overhead)' },
        { key: 'allocation_method', label: 'Allocation (daily_prorata / per_trip / actual_date)' },
        { key: 'default_monthly_amount', label: 'Default Monthly Amount (₹)', type: 'number' },
        { key: 'is_fixed_recurring', label: 'Fixed Recurring', type: 'bool' },
        { key: 'sort_order', label: 'Sort Order', type: 'number' },
      ]}
      defaultItem={{ name: '', kind: 'Overhead', allocation_method: 'actual_date', default_monthly_amount: 0, sort_order: 0 }}
    />
  );
}
