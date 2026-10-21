-- Contacts gained country, detailed address and optional coordinates for map drilldown.
ALTER TABLE contacts ADD COLUMN country VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN address VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE contacts ADD COLUMN longitude DOUBLE PRECISION;

CREATE INDEX idx_contacts_owner_country ON contacts(owner_id, country);
CREATE INDEX idx_contacts_owner_country_province ON contacts(owner_id, country, province);
