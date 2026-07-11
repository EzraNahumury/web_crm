// Predefined lines for the "Form Permintaan Gudang". Rendered as a table
// in the produksi Reject modal and re-rendered read-only in the Approval
// Gudang detail view. `isSize` rows are visually indented + subtly tinted
// so they read as sub-items of DTF SIZE.

export interface GudangFormItem {
  item: string;
  isSize?: boolean;
  color?: 'gray' | 'peach' | 'blue' | 'green' | 'yellow' | 'red';
}

export const GUDANG_FORM_ITEMS: GudangFormItem[] = [
  { item: 'FULL BODY' },
  { item: 'FRONT BODY' },
  { item: 'BACK BODY' },
  { item: 'SLEEVE' },
  { item: 'COMBINATION' },
  { item: 'COLLAR' },
  { item: 'SLEEVE ENDS' },
  { item: 'SIDE PANTS STRIPE' },
  { item: 'PANTS' },
  { item: 'AUTENTIC' },
  { item: 'WEBBING' },
  { item: 'WASHTAG' },
  { item: 'ELASTIC PANTS' },
  { item: 'DTF SPONSOR' },
  { item: 'POLIFLEX' },
  { item: 'DTF SIZE' },
  { item: 'XS', isSize: true, color: 'gray' },
  { item: 'S', isSize: true, color: 'peach' },
  { item: 'M', isSize: true, color: 'blue' },
  { item: 'L', isSize: true, color: 'green' },
  { item: 'XL', isSize: true, color: 'yellow' },
  { item: '2XL', isSize: true, color: 'red' },
  { item: 'NO CELANA' },
  { item: 'LOGO CELANA' },
  { item: 'LOGO CELANA' },
  { item: 'LOGO TEAM' },
  { item: 'LOGO AYRES' },
  { item: 'TAFETA SLIP PRO' },
];
