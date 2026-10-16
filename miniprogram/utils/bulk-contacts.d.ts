import { LocalContact } from "./local-data";
export interface BulkContact extends Partial<LocalContact> {
  row: number;
  name: string;
  selected: boolean;
  errors: string[];
}
export function parse(source: string, existing?: LocalContact[]): BulkContact[];
