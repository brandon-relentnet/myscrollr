//! Assert that every migration version in this service's `migrations/`
//! directory uses the rss-reserved version range.
//!
//! RSS keeps the legacy `20250601*` prefix because its existing rows in
//! the shared `_sqlx_migrations` table already match — renaming would
//! force a re-migration that is pointless at best and dangerous at worst.
//! Any *new* rss migration should use the `13*` prefix (the designated
//! rss prefix going forward) to avoid colliding with new migrations that
//! might someday be added to finance (11*) or sports (12*).

/// Legacy range: the two initial migrations that were already applied
/// against the live DB on 2026-04-17 before this convention existed.
const LEGACY_LO: i64 = 20_250_601_000_000;
const LEGACY_HI: i64 = 20_250_601_999_999;

/// New range for any rss migration added after the version-prefix cleanup.
const PREFIX_LO: i64 = 130_000_000_000;
const PREFIX_HI: i64 = 139_999_999_999;

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
