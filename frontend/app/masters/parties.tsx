import { MasterListScreen } from '@/src/components/MasterListScreen';
export default function PartiesScreen() {
  return (
    <MasterListScreen
      title="Parties"
      endpoint="/parties"
      itemLabel={(p) => p.party_name}
      itemSubtitle={(p) => `${p.contact_person || '-'} · ${p.phone || ''}`}
      fields={[
        { key: 'party_name', label: 'Party / Customer Name' },
        { key: 'contact_person', label: 'Contact Person' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'credit_terms_days', label: 'Credit Terms (days)', type: 'number' },
        { key: 'opening_balance', label: 'Opening Balance (₹)', type: 'number' },
      ]}
      defaultItem={{ party_name: '', credit_terms_days: 30, active: true }}
    />
  );
}
