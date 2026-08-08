-- Seed Data for CivicLens Pilot Ward (Shivpur Gram Panchayat, Ward 3)

INSERT INTO villages (id, name, panchayat_code, lbd_code) 
VALUES (1, 'Shivpur Gram Panchayat', 'GP-248192', 'LBD-VIL-94182')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wards (id, village_id, name, lbd_code)
VALUES (1, 1, 'Ward 3 (Kalyanpur)', 'LBD-WRD-003')
ON CONFLICT (id) DO NOTHING;

-- Admin user (password: admin123)
INSERT INTO users (id, name, phone, password_hash, role, ward_id)
VALUES (1, 'Rajesh Kumar (Secretary)', '9876543210', '$2a$10$vN91xYk3u0a8C7J7d9B2u.Y8Kk7G.dF6M2T3V4W5X6Y7Z8A9B0C1D', 'admin', 1)
ON CONFLICT (id) DO NOTHING;

-- Seed Assets
INSERT INTO assets (id, ward_id, asset_type, name, lbd_asset_id, status, location, attributes) VALUES
('a1000000-0000-0000-0000-000000000001', 1, 'handpump', 'Main Chowk Handpump', 'HP-001', 'active', ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326), '{"handpump_type": "India Mark II", "depth_ft": 180}'),
('a1000000-0000-0000-0000-000000000002', 1, 'handpump', 'School Badi Handpump', 'HP-002', 'non_functional', ST_SetSRID(ST_MakePoint(77.2115, 28.6152), 4326), '{"handpump_type": "India Mark III", "depth_ft": 150}'),
('a1000000-0000-0000-0000-000000000003', 1, 'school', 'Government Primary School Ward 3', 'SCH-108', 'active', ST_SetSRID(ST_MakePoint(77.2120, 28.6155), 4326), '{"grades": "1-5", "students": 140}'),
('a1000000-0000-0000-0000-000000000004', 1, 'anganwadi', 'Anganwadi Center Kalyanpur', 'ANG-04', 'active', ST_SetSRID(ST_MakePoint(77.2085, 28.6128), 4326), '{"worker": "Sunita Devi"}'),
('a1000000-0000-0000-0000-000000000005', 1, 'streetlight', 'Temple Junction Streetlight', 'SL-401', 'non_functional', ST_SetSRID(ST_MakePoint(77.2102, 28.6145), 4326), '{"type": "Solar LED"}'),
('a1000000-0000-0000-0000-000000000006', 1, 'drainage', 'East Hamlet Main Drain', 'DRN-12', 'active', ST_SetSRID(ST_MakePoint(77.2095, 28.6132), 4326), '{"type": "Open Concrete"}')
ON CONFLICT (id) DO NOTHING;

-- Seed Issues
INSERT INTO issues (id, asset_id, ward_id, category, severity, description, location, status, reported_by, client_seq_num) VALUES
('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 1, 'Water Supply', 'high', 'Handpump handle broken and water smells foul', ST_SetSRID(ST_MakePoint(77.2115, 28.6152), 4326), 'open', 1, 1),
('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 1, 'Street Lighting', 'medium', 'Solar battery dead, street completely dark at night', ST_SetSRID(ST_MakePoint(77.2102, 28.6145), 4326), 'in_progress', 1, 2),
('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000006', 1, 'Drainage', 'critical', 'Drain blocked by plastic waste causing overflow near school', ST_SetSRID(ST_MakePoint(77.2095, 28.6132), 4326), 'open', 1, 3)
ON CONFLICT (id) DO NOTHING;
