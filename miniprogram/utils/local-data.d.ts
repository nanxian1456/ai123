export interface LocalCategory {
  id: string;
  name: string;
  children: LocalCategory[];
}
export interface LocalContact {
  id: number;
  ownerId: string;
  name: string;
  organization?: string;
  position?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  note?: string;
  tags?: string[];
  categoryIds?: string[];
}
export interface LocalData {
  version: number;
  profile: any;
  contacts: LocalContact[];
  relationships: any[];
  nextContactId: number;
  nextRelationshipId: number;
  tagCatalog?: string[];
  categoryTree?: LocalCategory[];
  nextCategoryId?: number;
  dismissedCategories?: string[];
}
export function read(ownerId: string): LocalData | null;
export function write(ownerId: string, value: LocalData): LocalData;
export function handle(ownerId: string, path: string, method?: string, payload?: any): any;
export function migrate(ownerId: string, data: any): LocalData;
export function key(ownerId: string): string;
export function initial(name: string): string;
export function storageUsage(): { usedKB: number; limitKB: number } | null;
