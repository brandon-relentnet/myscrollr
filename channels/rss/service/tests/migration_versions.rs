//! Assert that every migration version in this service's `migrations/`
//! directory uses the rss-reserved version range AND that the runtime
//! invariant-check constants in `database.rs` agree with the test ranges.
//!
//! RSS keeps the legacy `20250601*` prefix because its existing rows in
//! the shared `_sqlx_migrations` table already match — renaming would
//! force a re-migration that is pointless at best and dangerous at worst.
//! Any *new* rss migration should use the `13*` prefix (the designated
//! rss prefix going forward) to avoid colliding with new migrations that
//! might someday be added to finance (11*) or sports (12*).
//!
//! See the sibling `migration_versions.rs` files in finance/sports for
//! the underlying reason we assert the production constants here: a
//! drift between the two caused a CrashLoopBackOff on 2026-04-24 when
//! the invariant check's range constants were off from the filename
//! prefix by exactly 10×.

use rss_service::database::{
    RSS_MIGRATION_LEGACY_MAX, RSS_MIGRATION_LEGACY_MIN, RSS_MIGRATION_NEW_MAX,
    RSS_MIGRATION_NEW_MIN,
};

/// Legacy range: the two initial migrations that were already applied
/// against the live DB on 2026-04-17 before this convention existed.
const LEGACY_LO: i64 = 20_250_601_000_000;
const LEGACY_HI: i64 = 20_250_601_999_999;

/// New range for any rss migration added after the version-prefix cleanup.
const PREFIX_LO: i64 = 130_000_000_000;
const PREFIX_HI: i64 = 139_999_999_999;

#[test]
fn production_constants_match_test_ranges() {
    assert_eq!(
        RSS_MIGRATION_LEGACY_MIN, LEGACY_LO,
        "database.rs RSS_MIGRATION_LEGACY_MIN ({}) must equal LEGACY_LO ({})",
        RSS_MIGRATION_LEGACY_MIN, LEGACY_LO
    );
    assert_eq!(
        RSS_MIGRATION_LEGACY_MAX, LEGACY_HI,
        "database.rs RSS_MIGRATION_LEGACY_MAX ({}) must equal LEGACY_HI ({})",
        RSS_MIGRATION_LEGACY_MAX, LEGACY_HI
    );
    assert_eq!(
        RSS_MIGRATION_NEW_MIN, PREFIX_LO,
        "database.rs RSS_MIGRATION_NEW_MIN ({}) must equal PREFIX_LO ({})",
        RSS_MIGRATION_NEW_MIN, PREFIX_LO
    );
    assert_eq!(
        RSS_MIGRATION_NEW_MAX, PREFIX_HI,
        "database.rs RSS_MIGRATION_NEW_MAX ({}) must equal PREFIX_HI ({})",
        RSS_MIGRATION_NEW_MAX, PREFIX_HI
    );
}

#[tokio::test]
async fn every_migration_version_has_a_valid_rss_prefix() {
    let migrator =
        sqlx::migrate::Migrator::new(std::path::Path::new("./migrations"))
            .await
            .expect("Failed to read migrations directory");

    assert!(
        migrator.iter().count() > 0,
        "Expected at least one migration in ./migrations"
    );

    for m in migrator.iter() {
        let in_legacy = (LEGACY_LO..=LEGACY_HI).contains(&m.version);
        let in_prefix = (PREFIX_LO..=PREFIX_HI).contains(&m.version);
        assert!(
            in_legacy || in_prefix,
            "Migration version {} ({}) is outside both the legacy rss range \
             ({}..={}) and the current rss prefix range ({}..={}). New rss \
             migrations must use 13* to avoid colliding with finance (11*) or \
             sports (12*).",
            m.version,
            m.description,
            LEGACY_LO,
            LEGACY_HI,
            PREFIX_LO,
            PREFIX_HI,
        );
    }
}
