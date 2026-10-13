import { LocalData } from "./local-data";
export interface BackupContent { data: LocalData; avatar: string; }
export interface RestoreToken { ownerId: string; previous: LocalData | null; restored: string; }
export function create(ownerId: string, password: string): Promise<string>;
export function open(content: string, password: string, ownerId: string): BackupContent;
export function openAsync(content: string, password: string, ownerId: string): Promise<BackupContent>;
export function preview(current: LocalData, incoming: BackupContent): { currentContacts: number; currentRelationships: number; backupContacts: number; backupRelationships: number };
export function restore(ownerId: string, incoming: BackupContent): Promise<RestoreToken>;
export function rollbackRestore(ownerId: string, token: RestoreToken): boolean;
