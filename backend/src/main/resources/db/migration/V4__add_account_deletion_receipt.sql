-- One-way receipt digests preserve recovery across repeated account deletions.
CREATE TABLE account_deletion_receipts (
    receipt_hash VARCHAR(64) PRIMARY KEY
);
