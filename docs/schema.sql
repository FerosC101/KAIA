BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE TABLE model_versions (
    name VARCHAR(80) NOT NULL, 
    model_type VARCHAR(20) NOT NULL, 
    version VARCHAR(32) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    description TEXT NOT NULL, 
    metrics JSON NOT NULL, 
    released_at DATE NOT NULL, 
    activated_at TIMESTAMP WITH TIME ZONE, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_model_versions PRIMARY KEY (id)
);

CREATE INDEX ix_model_versions_model_type ON model_versions (model_type);

CREATE TABLE organizations (
    name VARCHAR(200) NOT NULL, 
    code VARCHAR(40) NOT NULL, 
    org_type VARCHAR(40) NOT NULL, 
    city VARCHAR(100) NOT NULL, 
    province VARCHAR(100) NOT NULL, 
    address VARCHAR(300) NOT NULL, 
    phone VARCHAR(40), 
    operating_hours VARCHAR(120), 
    services JSON NOT NULL, 
    is_referral_partner BOOLEAN NOT NULL, 
    active BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_organizations PRIMARY KEY (id), 
    CONSTRAINT uq_organizations_code UNIQUE (code), 
    CONSTRAINT uq_organizations_name UNIQUE (name)
);

CREATE TABLE pathway_configs (
    pathway_key VARCHAR(64) NOT NULL, 
    outcome VARCHAR(32) NOT NULL, 
    recommended_action VARCHAR(200) NOT NULL, 
    referral_type VARCHAR(40), 
    timeframe_days INTEGER NOT NULL, 
    patient_message TEXT NOT NULL, 
    next_step_message TEXT NOT NULL, 
    required_service VARCHAR(64), 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_pathway_configs PRIMARY KEY (id)
);

CREATE INDEX ix_pathway_configs_pathway_key ON pathway_configs (pathway_key);

CREATE TABLE barangays (
    name VARCHAR(120) NOT NULL, 
    city VARCHAR(100) NOT NULL, 
    organization_id UUID NOT NULL, 
    eligible_population INTEGER NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_barangays PRIMARY KEY (id), 
    CONSTRAINT fk_barangays_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id)
);

CREATE INDEX ix_barangays_organization_id ON barangays (organization_id);

CREATE TABLE inventory_batches (
    organization_id UUID NOT NULL, 
    item_type VARCHAR(20) NOT NULL, 
    batch_number VARCHAR(40) NOT NULL, 
    manufacture_date DATE NOT NULL, 
    expiry_date DATE NOT NULL, 
    initial_quantity INTEGER NOT NULL, 
    quantity INTEGER NOT NULL, 
    reorder_threshold INTEGER NOT NULL, 
    location VARCHAR(200) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    notes TEXT, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_inventory_batches PRIMARY KEY (id), 
    CONSTRAINT fk_inventory_batches_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT uq_inventory_batches_batch_number UNIQUE (batch_number)
);

CREATE INDEX ix_inventory_batches_item_type ON inventory_batches (item_type);

CREATE INDEX ix_inventory_batches_organization_id ON inventory_batches (organization_id);

CREATE TABLE users (
    email VARCHAR(254) NOT NULL, 
    password_hash VARCHAR(128) NOT NULL, 
    role VARCHAR(40) NOT NULL, 
    full_name TEXT NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    organization_id UUID, 
    token_version INTEGER NOT NULL, 
    last_login_at TIMESTAMP WITH TIME ZONE, 
    is_demo BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_users PRIMARY KEY (id), 
    CONSTRAINT fk_users_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id)
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE INDEX ix_users_organization_id ON users (organization_id);

CREATE INDEX ix_users_role ON users (role);

CREATE TABLE cartridges (
    cartridge_code VARCHAR(32) NOT NULL, 
    batch_id UUID, 
    organization_id UUID NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    lot_expiry DATE NOT NULL, 
    sim_profile VARCHAR(32) NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_cartridges PRIMARY KEY (id), 
    CONSTRAINT fk_cartridges_batch_id_inventory_batches FOREIGN KEY(batch_id) REFERENCES inventory_batches (id), 
    CONSTRAINT fk_cartridges_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id)
);

CREATE UNIQUE INDEX ix_cartridges_cartridge_code ON cartridges (cartridge_code);

CREATE INDEX ix_cartridges_organization_id ON cartridges (organization_id);

CREATE TABLE health_workers (
    user_id UUID NOT NULL, 
    organization_id UUID NOT NULL, 
    position VARCHAR(80) NOT NULL, 
    employee_code VARCHAR(40) NOT NULL, 
    active BOOLEAN NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_health_workers PRIMARY KEY (id), 
    CONSTRAINT fk_health_workers_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT fk_health_workers_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_health_workers_employee_code UNIQUE (employee_code), 
    CONSTRAINT uq_health_workers_user_id UNIQUE (user_id)
);

CREATE INDEX ix_health_workers_organization_id ON health_workers (organization_id);

CREATE TABLE notifications (
    user_id UUID NOT NULL, 
    title VARCHAR(160) NOT NULL, 
    body TEXT NOT NULL, 
    category VARCHAR(40) NOT NULL, 
    link VARCHAR(200), 
    read_at TIMESTAMP WITH TIME ZONE, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_notifications PRIMARY KEY (id), 
    CONSTRAINT fk_notifications_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_notifications_user_id ON notifications (user_id);

CREATE TABLE patient_profiles (
    user_id UUID NOT NULL, 
    patient_code VARCHAR(32) NOT NULL, 
    birth_date TEXT, 
    age_bracket VARCHAR(16) NOT NULL, 
    phone TEXT, 
    address TEXT, 
    barangay_id UUID, 
    city VARCHAR(100) NOT NULL, 
    preferred_language VARCHAR(20) NOT NULL, 
    distance_category VARCHAR(20) NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_patient_profiles PRIMARY KEY (id), 
    CONSTRAINT fk_patient_profiles_barangay_id_barangays FOREIGN KEY(barangay_id) REFERENCES barangays (id), 
    CONSTRAINT fk_patient_profiles_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_patient_profiles_user_id UNIQUE (user_id)
);

CREATE INDEX ix_patient_profiles_barangay_id ON patient_profiles (barangay_id);

CREATE UNIQUE INDEX ix_patient_profiles_patient_code ON patient_profiles (patient_code);

CREATE TABLE program_aggregates (
    organization_id UUID NOT NULL, 
    barangay_id UUID NOT NULL, 
    month DATE NOT NULL, 
    kits_distributed INTEGER NOT NULL, 
    samples_returned INTEGER NOT NULL, 
    valid_screenings INTEGER NOT NULL, 
    follow_up_required INTEGER NOT NULL, 
    follow_up_completed INTEGER NOT NULL, 
    total_days_to_follow_up INTEGER NOT NULL, 
    source VARCHAR(40) NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_program_aggregates PRIMARY KEY (id), 
    CONSTRAINT fk_program_aggregates_barangay_id_barangays FOREIGN KEY(barangay_id) REFERENCES barangays (id), 
    CONSTRAINT fk_program_aggregates_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id)
);

CREATE INDEX ix_program_aggregates_barangay_id ON program_aggregates (barangay_id);

CREATE INDEX ix_program_aggregates_month ON program_aggregates (month);

CREATE INDEX ix_program_aggregates_organization_id ON program_aggregates (organization_id);

CREATE TABLE risk_rules (
    pathway_key VARCHAR(64) NOT NULL, 
    name VARCHAR(120) NOT NULL, 
    description TEXT NOT NULL, 
    priority INTEGER NOT NULL, 
    conditions JSON NOT NULL, 
    outcome VARCHAR(32) NOT NULL, 
    active BOOLEAN NOT NULL, 
    updated_by_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_risk_rules PRIMARY KEY (id), 
    CONSTRAINT fk_risk_rules_updated_by_id_users FOREIGN KEY(updated_by_id) REFERENCES users (id)
);

CREATE INDEX ix_risk_rules_pathway_key ON risk_rules (pathway_key);

CREATE TABLE audit_logs (
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL, 
    user_id UUID, 
    user_label VARCHAR(254) NOT NULL, 
    role VARCHAR(40), 
    organization_id UUID, 
    institution_name VARCHAR(200), 
    action VARCHAR(60) NOT NULL, 
    resource_type VARCHAR(60) NOT NULL, 
    resource_id VARCHAR(64), 
    subject_patient_id UUID, 
    ip_address VARCHAR(64), 
    detail JSON NOT NULL, 
    id UUID NOT NULL, 
    CONSTRAINT pk_audit_logs PRIMARY KEY (id), 
    CONSTRAINT fk_audit_logs_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT fk_audit_logs_subject_patient_id_patient_profiles FOREIGN KEY(subject_patient_id) REFERENCES patient_profiles (id), 
    CONSTRAINT fk_audit_logs_user_id_users FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_audit_logs_action ON audit_logs (action);

CREATE INDEX ix_audit_logs_organization_id ON audit_logs (organization_id);

CREATE INDEX ix_audit_logs_subject_patient_id ON audit_logs (subject_patient_id);

CREATE INDEX ix_audit_logs_timestamp ON audit_logs (timestamp);

CREATE INDEX ix_audit_logs_user_id ON audit_logs (user_id);

CREATE TABLE consents (
    patient_id UUID NOT NULL, 
    organization_id UUID, 
    grantee_name VARCHAR(200) NOT NULL, 
    scope VARCHAR(40) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    revoked_at TIMESTAMP WITH TIME ZONE, 
    granted_via VARCHAR(40) NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_consents PRIMARY KEY (id), 
    CONSTRAINT fk_consents_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT fk_consents_patient_id_patient_profiles FOREIGN KEY(patient_id) REFERENCES patient_profiles (id) ON DELETE CASCADE
);

CREATE INDEX ix_consents_organization_id ON consents (organization_id);

CREATE INDEX ix_consents_patient_id ON consents (patient_id);

CREATE TABLE kits (
    kit_code VARCHAR(32) NOT NULL, 
    batch_id UUID, 
    organization_id UUID NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    barangay_id UUID, 
    distributed_at TIMESTAMP WITH TIME ZONE, 
    registered_at TIMESTAMP WITH TIME ZONE, 
    patient_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_kits PRIMARY KEY (id), 
    CONSTRAINT fk_kits_barangay_id_barangays FOREIGN KEY(barangay_id) REFERENCES barangays (id), 
    CONSTRAINT fk_kits_batch_id_inventory_batches FOREIGN KEY(batch_id) REFERENCES inventory_batches (id), 
    CONSTRAINT fk_kits_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT fk_kits_patient_id_patient_profiles FOREIGN KEY(patient_id) REFERENCES patient_profiles (id)
);

CREATE UNIQUE INDEX ix_kits_kit_code ON kits (kit_code);

CREATE INDEX ix_kits_organization_id ON kits (organization_id);

CREATE INDEX ix_kits_patient_id ON kits (patient_id);

CREATE TABLE readers (
    reader_code VARCHAR(32) NOT NULL, 
    serial_number VARCHAR(64) NOT NULL, 
    organization_id UUID NOT NULL, 
    location_name VARCHAR(200) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    firmware_version VARCHAR(20) NOT NULL, 
    temperature_c FLOAT NOT NULL, 
    last_calibration DATE NOT NULL, 
    last_heartbeat_at TIMESTAMP WITH TIME ZONE, 
    current_cartridge_id UUID, 
    total_analyses INTEGER NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_readers PRIMARY KEY (id), 
    CONSTRAINT fk_readers_current_cartridge_id_cartridges FOREIGN KEY(current_cartridge_id) REFERENCES cartridges (id), 
    CONSTRAINT fk_readers_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT uq_readers_serial_number UNIQUE (serial_number)
);

CREATE INDEX ix_readers_organization_id ON readers (organization_id);

CREATE UNIQUE INDEX ix_readers_reader_code ON readers (reader_code);

CREATE TABLE screenings (
    screening_code VARCHAR(32) NOT NULL, 
    patient_id UUID NOT NULL, 
    kit_id UUID NOT NULL, 
    cartridge_id UUID, 
    organization_id UUID NOT NULL, 
    reader_id UUID, 
    barangay_id UUID, 
    status VARCHAR(32) NOT NULL, 
    analysis_stage INTEGER NOT NULL, 
    outcome VARCHAR(32), 
    decision_trace JSON, 
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    sample_collected_at TIMESTAMP WITH TIME ZONE, 
    analysis_started_at TIMESTAMP WITH TIME ZONE, 
    analysis_completed_at TIMESTAMP WITH TIME ZONE, 
    reviewed_by_id UUID, 
    reviewed_at TIMESTAMP WITH TIME ZONE, 
    released_at TIMESTAMP WITH TIME ZONE, 
    review_notes TEXT, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_screenings PRIMARY KEY (id), 
    CONSTRAINT fk_screenings_barangay_id_barangays FOREIGN KEY(barangay_id) REFERENCES barangays (id), 
    CONSTRAINT fk_screenings_cartridge_id_cartridges FOREIGN KEY(cartridge_id) REFERENCES cartridges (id), 
    CONSTRAINT fk_screenings_kit_id_kits FOREIGN KEY(kit_id) REFERENCES kits (id), 
    CONSTRAINT fk_screenings_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT fk_screenings_patient_id_patient_profiles FOREIGN KEY(patient_id) REFERENCES patient_profiles (id), 
    CONSTRAINT fk_screenings_reader_id_readers FOREIGN KEY(reader_id) REFERENCES readers (id), 
    CONSTRAINT fk_screenings_reviewed_by_id_users FOREIGN KEY(reviewed_by_id) REFERENCES users (id), 
    CONSTRAINT uq_screenings_cartridge_id UNIQUE (cartridge_id), 
    CONSTRAINT uq_screenings_kit_id UNIQUE (kit_id)
);

CREATE INDEX ix_screenings_barangay_id ON screenings (barangay_id);

CREATE INDEX ix_screenings_organization_id ON screenings (organization_id);

CREATE INDEX ix_screenings_outcome ON screenings (outcome);

CREATE INDEX ix_screenings_patient_id ON screenings (patient_id);

CREATE INDEX ix_screenings_reader_id ON screenings (reader_id);

CREATE INDEX ix_screenings_released_at ON screenings (released_at);

CREATE UNIQUE INDEX ix_screenings_screening_code ON screenings (screening_code);

CREATE INDEX ix_screenings_status ON screenings (status);

CREATE TABLE assay_results (
    screening_id UUID NOT NULL, 
    reader_id UUID, 
    control_valid BOOLEAN NOT NULL, 
    hpv_signal VARCHAR(20) NOT NULL, 
    hpv_genotype VARCHAR(32), 
    secondary_marker VARCHAR(20) NOT NULL, 
    sample_quality VARCHAR(20) NOT NULL, 
    assay_confidence VARCHAR(20) NOT NULL, 
    image_path VARCHAR(300) NOT NULL, 
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_assay_results PRIMARY KEY (id), 
    CONSTRAINT fk_assay_results_reader_id_readers FOREIGN KEY(reader_id) REFERENCES readers (id), 
    CONSTRAINT fk_assay_results_screening_id_screenings FOREIGN KEY(screening_id) REFERENCES screenings (id) ON DELETE CASCADE, 
    CONSTRAINT uq_assay_results_screening_id UNIQUE (screening_id)
);

CREATE TABLE care_pathways (
    screening_id UUID NOT NULL, 
    patient_id UUID NOT NULL, 
    pathway_type VARCHAR(32) NOT NULL, 
    current_stage VARCHAR(40) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    recommended_action VARCHAR(200) NOT NULL, 
    referral_type VARCHAR(40), 
    timeframe_days INTEGER NOT NULL, 
    due_date DATE NOT NULL, 
    recommended_facility_id UUID, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_care_pathways PRIMARY KEY (id), 
    CONSTRAINT fk_care_pathways_patient_id_patient_profiles FOREIGN KEY(patient_id) REFERENCES patient_profiles (id), 
    CONSTRAINT fk_care_pathways_recommended_facility_id_organizations FOREIGN KEY(recommended_facility_id) REFERENCES organizations (id), 
    CONSTRAINT fk_care_pathways_screening_id_screenings FOREIGN KEY(screening_id) REFERENCES screenings (id) ON DELETE CASCADE, 
    CONSTRAINT uq_care_pathways_screening_id UNIQUE (screening_id)
);

CREATE INDEX ix_care_pathways_patient_id ON care_pathways (patient_id);

CREATE INDEX ix_care_pathways_status ON care_pathways (status);

CREATE TABLE ai_analyses (
    assay_result_id UUID NOT NULL, 
    model_version_id UUID, 
    model_version VARCHAR(64) NOT NULL, 
    analysis_type VARCHAR(20) NOT NULL, 
    image_url VARCHAR(300) NOT NULL, 
    regions JSON NOT NULL, 
    signal_intensity JSON NOT NULL, 
    control_validity BOOLEAN NOT NULL, 
    prediction VARCHAR(64) NOT NULL, 
    confidence VARCHAR(20) NOT NULL, 
    confidence_score FLOAT NOT NULL, 
    pipeline JSON NOT NULL, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_ai_analyses PRIMARY KEY (id), 
    CONSTRAINT fk_ai_analyses_assay_result_id_assay_results FOREIGN KEY(assay_result_id) REFERENCES assay_results (id) ON DELETE CASCADE, 
    CONSTRAINT fk_ai_analyses_model_version_id_model_versions FOREIGN KEY(model_version_id) REFERENCES model_versions (id)
);

CREATE INDEX ix_ai_analyses_assay_result_id ON ai_analyses (assay_result_id);

CREATE TABLE referrals (
    referral_code VARCHAR(32) NOT NULL, 
    patient_id UUID NOT NULL, 
    screening_id UUID NOT NULL, 
    care_pathway_id UUID NOT NULL, 
    source_org_id UUID NOT NULL, 
    destination_org_id UUID NOT NULL, 
    referral_type VARCHAR(40) NOT NULL, 
    priority VARCHAR(20) NOT NULL, 
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    preferred_schedule DATE, 
    status VARCHAR(20) NOT NULL, 
    status_changed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    clinical_notes TEXT, 
    created_by_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_referrals PRIMARY KEY (id), 
    CONSTRAINT fk_referrals_care_pathway_id_care_pathways FOREIGN KEY(care_pathway_id) REFERENCES care_pathways (id), 
    CONSTRAINT fk_referrals_created_by_id_users FOREIGN KEY(created_by_id) REFERENCES users (id), 
    CONSTRAINT fk_referrals_destination_org_id_organizations FOREIGN KEY(destination_org_id) REFERENCES organizations (id), 
    CONSTRAINT fk_referrals_patient_id_patient_profiles FOREIGN KEY(patient_id) REFERENCES patient_profiles (id), 
    CONSTRAINT fk_referrals_screening_id_screenings FOREIGN KEY(screening_id) REFERENCES screenings (id), 
    CONSTRAINT fk_referrals_source_org_id_organizations FOREIGN KEY(source_org_id) REFERENCES organizations (id)
);

CREATE INDEX ix_referrals_care_pathway_id ON referrals (care_pathway_id);

CREATE INDEX ix_referrals_destination_org_id ON referrals (destination_org_id);

CREATE INDEX ix_referrals_patient_id ON referrals (patient_id);

CREATE UNIQUE INDEX ix_referrals_referral_code ON referrals (referral_code);

CREATE INDEX ix_referrals_screening_id ON referrals (screening_id);

CREATE INDEX ix_referrals_source_org_id ON referrals (source_org_id);

CREATE INDEX ix_referrals_status ON referrals (status);

CREATE TABLE appointments (
    referral_id UUID NOT NULL, 
    organization_id UUID NOT NULL, 
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    recorded_by_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_appointments PRIMARY KEY (id), 
    CONSTRAINT fk_appointments_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), 
    CONSTRAINT fk_appointments_recorded_by_id_users FOREIGN KEY(recorded_by_id) REFERENCES users (id), 
    CONSTRAINT fk_appointments_referral_id_referrals FOREIGN KEY(referral_id) REFERENCES referrals (id) ON DELETE CASCADE
);

CREATE INDEX ix_appointments_referral_id ON appointments (referral_id);

CREATE TABLE follow_ups (
    referral_id UUID NOT NULL, 
    event_type VARCHAR(40) NOT NULL, 
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    notes TEXT, 
    source VARCHAR(20) NOT NULL, 
    verified BOOLEAN NOT NULL, 
    recorded_by_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_follow_ups PRIMARY KEY (id), 
    CONSTRAINT fk_follow_ups_recorded_by_id_users FOREIGN KEY(recorded_by_id) REFERENCES users (id), 
    CONSTRAINT fk_follow_ups_referral_id_referrals FOREIGN KEY(referral_id) REFERENCES referrals (id) ON DELETE CASCADE
);

CREATE INDEX ix_follow_ups_referral_id ON follow_ups (referral_id);

CREATE TABLE passport_events (
    patient_id UUID NOT NULL, 
    event_date DATE NOT NULL, 
    event_type VARCHAR(40) NOT NULL, 
    title VARCHAR(160) NOT NULL, 
    detail VARCHAR(300), 
    institution_name VARCHAR(200) NOT NULL, 
    status VARCHAR(80) NOT NULL, 
    source VARCHAR(40) NOT NULL, 
    verified BOOLEAN NOT NULL, 
    screening_id UUID, 
    referral_id UUID, 
    id UUID NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_passport_events PRIMARY KEY (id), 
    CONSTRAINT fk_passport_events_patient_id_patient_profiles FOREIGN KEY(patient_id) REFERENCES patient_profiles (id) ON DELETE CASCADE, 
    CONSTRAINT fk_passport_events_referral_id_referrals FOREIGN KEY(referral_id) REFERENCES referrals (id) ON DELETE SET NULL, 
    CONSTRAINT fk_passport_events_screening_id_screenings FOREIGN KEY(screening_id) REFERENCES screenings (id) ON DELETE SET NULL
);

CREATE INDEX ix_passport_events_patient_id ON passport_events (patient_id);

INSERT INTO alembic_version (version_num) VALUES ('0001') RETURNING alembic_version.version_num;

COMMIT;

