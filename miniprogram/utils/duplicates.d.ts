import { LocalContact } from "./local-data";
export function findPotentialDuplicates(contacts: LocalContact[], candidate: Partial<LocalContact>, excludeId?: string | number): LocalContact[];
