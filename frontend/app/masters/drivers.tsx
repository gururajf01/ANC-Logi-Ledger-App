import { MasterListScreen } from '@/src/components/MasterListScreen';
export default function DriversScreen() {
  return (
    <MasterListScreen
      title="Drivers"
      endpoint="/drivers"
      itemLabel={(d) => d.name}
      itemSubtitle={(d) => `Bhatta ₹${d.default_bhatta_rate || 0} · ${d.phone || 'no phone'}`}
      fields={[
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'default_bhatta_rate', label: 'Default Bhatta (₹)', type: 'number' },
        { key: 'salary_monthly', label: 'Monthly Salary (₹)', type: 'number' },
        { key: 'active', label: 'Active', type: 'bool' },
      ]}
      defaultItem={{ name: '', default_bhatta_rate: 600, active: true }}
    />
  );
}
