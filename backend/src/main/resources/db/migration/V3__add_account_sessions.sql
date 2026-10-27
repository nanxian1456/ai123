-- Keep only a one-way account digest and session version so deletion also revokes old tokens.
CREATE TABLE account_sessions (
    owner_hash VARCHAR(64) PRIMARY KEY,
    generation VARCHAR(36) NOT NULL
);
