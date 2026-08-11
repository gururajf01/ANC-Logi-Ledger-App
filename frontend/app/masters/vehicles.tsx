import { MasterListScreen } from '@/src/components/MasterListScreen';
export default function VehiclesScreen() {
  return (
    <MasterListScreen
      title="Vehicles"
      endpoint="/vehicles"
      itemLabel={(v) => `${v.vehicle_no} · ${v.type}`}
      itemSubtitle={(v) => `Driver: ${v.default_driver_name || '-'} · EMI ₹${v.emi_amount_monthly || 0}`}
      fields={[
        { key: 'vehicle_no', label: 'Vehicle No.' },
        { key: 'type', label: 'Type (Own / Rented)' },
        { key: 'model', label: 'Model' },
        { key: 'default_driver_name', label: 'Default Driver Name' },
        { key: 'emi_amount_monthly', label: 'EMI Monthly (₹)', type: 'number' },
        { key: 'owner_name', label: 'Owner (for Rented)' },
        { key: 'active', label: 'Active', type: 'bool' },
      ]}
      defaultItem={{ vehicle_no: '', type: 'Own', active: true, emi_amount_monthly: 0 }}
    />
  );
}
