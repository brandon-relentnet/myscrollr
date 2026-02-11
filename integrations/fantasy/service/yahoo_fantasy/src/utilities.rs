use log::info;

use crate::xml_settings::Stat;
use crate::stats::invalidate_stat_cache;

pub fn write_stat_pairs_to_file(stats: &[Stat], game_code: &str) -> anyhow::Result<()>{
    let filename = format!("./configs/stat_pairs_{}.json", game_code);
    let json = serde_json::to_string_pretty(stats)?;

    std::fs::write(&filename, json)?;

    info!("Wrote stat pairs to {}", filename);

    // Invalidate the cache so it reloads on next access
    invalidate_stat_cache(game_code);

    Ok(())
}