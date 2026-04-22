//! Assert that every migration version in this service's `migrations/`
//! directory uses the service-specific 11* prefix.
//!
//! This prevents two classes of regression:
//!
//! 1. Someone adds a new migration with the old `20250601*` or a copy-pasted
//!    version from a different service — which would reintroduce the same
//!    shared-table collision that caused sports-service to be dead for three
//!    days on 2026-04-19.
//! 2. Someone renames a migration file on disk without updating
//!    `scripts/migrations/seed-service-migrations.sql` — the seed script's
//!    hash would no longer match the on-disk file, and the next deploy
//!    would fail with `VersionMismatch`.

/// Every finance migration must live in the `11_000_000_000` .. `11_999_999_999`
/// range. Adjust this test (and `seed-service-migrations.sql`) if the
/// numbering scheme ever needs to change.
const PREFIX_LO: i64 = 110_000_000_000;
const PREFIX_HI: i64 = 119_999_999_999;

#[tokio::test]
async fn every_migration_version_has_the_service_prefix() {
    let migrator =
        sqlx::migrate::Migrator::new(std::path::Path::new("./migrations"))
            .await
            .expect("Failed to read migrations directory");

    assert!(
        migrator.iter().count() > 0,
        "Expected at least one migration in ./migrations"
    );

    for m in migrator.iter() {
        assert!(
            (PREFIX_LO..=PREFIX_HI).contains(&m.version),
            "Migration version {} ({}) is outside the finance-service prefix range \
             {}..={}. Every finance migration must start with `11` to avoid colliding \
             with sports (12*), rss (20250601*), or any future service.",
            m.version,
            m.description,
            PREFIX_LO,
            PREFIX_HI,
        );
    }
}
