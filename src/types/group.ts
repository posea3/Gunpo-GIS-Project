export interface LocationGroup {
  id: string;
  key: string;
  label: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationGroupDbRow {
  id: string;
  key: string;
  label: string;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
